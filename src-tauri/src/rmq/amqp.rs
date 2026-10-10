//! What needs AMQP 0-9-1: moving, replaying or deleting chosen messages
//! (the management API can only take messages from the head of a queue),
//! and reading streams (which the management API can't read at all).

use std::collections::HashSet;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use lapin::options::{
    BasicAckOptions, BasicCancelOptions, BasicConsumeOptions, BasicNackOptions,
    BasicPublishOptions, BasicQosOptions, ConfirmSelectOptions, QueueDeclareOptions,
};
use lapin::{Confirmation, PublisherConfirm};
use lapin::types::{AMQPValue, FieldTable, LongString};
use lapin::{Channel, Connection, ConnectionProperties};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::message::{delivery_json, fingerprint_delivery, origin};
use super::AmqpTarget;
use crate::error::{AppError, AppResult};
use crate::state::CancelToken;

/// A queue that stays quiet this long is taken as drained.
const IDLE: Duration = Duration::from_secs(3);
/// Selected messages are looked for among this many at most: the rest are
/// held unacknowledged until the end, so it bounds what the app holds.
const MAX_SCAN: u32 = 5000;
const BATCH: usize = 200;

fn amqp_err(e: lapin::Error) -> AppError {
    AppError::Amqp(e.to_string())
}

pub async fn open(target: &AmqpTarget, vhost: &str) -> AppResult<Connection> {
    let props = ConnectionProperties::default().with_connection_name("Rabbit Studio".into());
    tokio::time::timeout(
        Duration::from_secs(10),
        Connection::connect(&target.uri(vhost), props),
    )
    .await
    .map_err(|_| AppError::Amqp(format!("{}:{} didn't answer in time", target.host, target.port)))?
    .map_err(|e| AppError::Amqp(format!("can't open {}:{} ({e})", target.host, target.port)))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum TransferTarget {
    /// Another queue of the same vhost, through the default exchange.
    Queue { queue: String },
    Exchange {
        exchange: String,
        routing_key: String,
    },
    /// Back where a dead-lettered message was first published (`x-death`).
    Origin,
    /// Nowhere: the messages are deleted.
    Discard,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInput {
    pub vhost: String,
    pub queue: String,
    pub target: TransferTarget,
    /// Only these messages (fingerprints from a peek); all when absent.
    pub select: Option<Vec<String>>,
    /// At most this many; the whole queue when absent.
    pub limit: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferSummary {
    /// Delivered to the target (or deleted, for Discard).
    pub done: u64,
    /// Looked at and left in place.
    pub skipped: u64,
    /// Couldn't be delivered (unroutable, no x-death); left in place.
    pub failed: u64,
    /// Selected messages that weren't found (consumed meanwhile).
    pub missing: u64,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub execution_id: String,
    pub done: u64,
    pub total: u64,
}

/// Moves (or deletes) messages from a queue: each one is published to the
/// target with a publisher confirm, and only acknowledged - removed from
/// the source - once the broker has it. Whatever isn't moved goes back.
pub async fn transfer(
    target: &AmqpTarget,
    input: TransferInput,
    cancel: CancelToken,
    progress: impl Fn(u64, u64),
) -> AppResult<TransferSummary> {
    let conn = open(target, &input.vhost).await?;
    let result = run_transfer(&conn, &input, &cancel, &progress).await;
    let _ = conn.close(200, "done".into()).await;
    result
}

async fn run_transfer(
    conn: &Connection,
    input: &TransferInput,
    cancel: &CancelToken,
    progress: &impl Fn(u64, u64),
) -> AppResult<TransferSummary> {
    let src = conn.create_channel().await.map_err(amqp_err)?;
    let out = conn.create_channel().await.map_err(amqp_err)?;
    out.confirm_select(ConfirmSelectOptions::default())
        .await
        .map_err(amqp_err)?;
    let depth = src
        .queue_declare(
            input.queue.as_str().into(),
            QueueDeclareOptions {
                passive: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await
        .map_err(amqp_err)?
        .message_count() as u64;
    let mut wanted: Option<HashSet<String>> =
        input.select.as_ref().map(|s| s.iter().cloned().collect());
    // How many messages to look at: those there now, never more than asked.
    let scan = match (&wanted, input.limit) {
        (Some(_), _) => depth.min(u64::from(MAX_SCAN)),
        (None, Some(limit)) => depth.min(limit),
        (None, None) => depth,
    };
    let goal = wanted.as_ref().map_or(scan, |w| w.len() as u64);
    let mut summary = TransferSummary::default();
    if scan == 0 {
        summary.missing = wanted.map_or(0, |w| w.len() as u64);
        return Ok(summary);
    }
    // Choosing holds every message looked at until the end, so the broker
    // must be allowed to send them all.
    let prefetch = if wanted.is_some() { scan.min(u64::from(u16::MAX)) as u16 } else { 500 };
    src.basic_qos(prefetch, BasicQosOptions::default())
        .await
        .map_err(amqp_err)?;
    let mut consumer = src
        .basic_consume(
            input.queue.as_str().into(),
            "rabbit-studio-transfer".into(),
            BasicConsumeOptions::default(),
            FieldTable::default(),
        )
        .await
        .map_err(amqp_err)?;

    let mut seen = 0u64;
    let mut batch: Vec<(u64, PublisherConfirm)> = Vec::new();
    let mut put_back: Vec<u64> = Vec::new();
    let mut last_report = Instant::now();
    progress(0, goal);
    while seen < scan {
        if cancel.is_cancelled() {
            summary.cancelled = true;
            break;
        }
        if wanted.as_ref().is_some_and(HashSet::is_empty) {
            break;
        }
        let next = tokio::select! {
            d = tokio::time::timeout(IDLE, consumer.next()) => d,
            () = cancel.cancelled() => { summary.cancelled = true; break; }
        };
        let delivery = match next {
            Ok(Some(Ok(d))) => d,
            Ok(Some(Err(e))) => return Err(amqp_err(e)),
            Ok(None) | Err(_) => break, // closed, or drained by others
        };
        seen += 1;
        let tag = delivery.delivery_tag;
        if let Some(w) = wanted.as_mut() {
            if !w.remove(&fingerprint_delivery(&delivery)) {
                put_back.push(tag);
                summary.skipped += 1;
                continue;
            }
        }
        let route = match &input.target {
            TransferTarget::Queue { queue } => Some((String::new(), queue.clone())),
            TransferTarget::Exchange {
                exchange,
                routing_key,
            } => Some((exchange.clone(), routing_key.clone())),
            TransferTarget::Origin => origin(&delivery.properties),
            TransferTarget::Discard => {
                src.basic_ack(tag, BasicAckOptions::default())
                    .await
                    .map_err(amqp_err)?;
                summary.done += 1;
                continue;
            }
        };
        let Some((exchange, routing_key)) = route else {
            put_back.push(tag);
            summary.failed += 1;
            continue;
        };
        let confirm = out
            .basic_publish(
                exchange.as_str().into(),
                routing_key.as_str().into(),
                BasicPublishOptions {
                    mandatory: true,
                    ..Default::default()
                },
                &delivery.data,
                delivery.properties.clone(),
            )
            .await
            .map_err(amqp_err)?;
        batch.push((tag, confirm));
        if batch.len() >= BATCH {
            settle(&src, &mut batch, &mut summary, &mut put_back).await?;
        }
        if last_report.elapsed() >= Duration::from_millis(200) {
            progress(summary.done + batch.len() as u64, goal);
            last_report = Instant::now();
        }
    }
    settle(&src, &mut batch, &mut summary, &mut put_back).await?;
    let _ = src
        .basic_cancel("rabbit-studio-transfer".into(), BasicCancelOptions::default())
        .await;
    for tag in put_back {
        src.basic_nack(
            tag,
            BasicNackOptions {
                multiple: false,
                requeue: true,
            },
        )
        .await
        .map_err(amqp_err)?;
    }
    summary.missing = wanted.map_or(0, |w| w.len() as u64);
    progress(summary.done, goal);
    let _ = src.close(200, "done".into()).await;
    let _ = out.close(200, "done".into()).await;
    Ok(summary)
}

/// Waits for the batch's confirms; acknowledges what the broker took and
/// keeps the rest to put back.
async fn settle(
    src: &Channel,
    batch: &mut Vec<(u64, PublisherConfirm)>,
    summary: &mut TransferSummary,
    put_back: &mut Vec<u64>,
) -> AppResult<()> {
    for (tag, confirm) in batch.drain(..) {
        match confirm.await.map_err(amqp_err)? {
            Confirmation::Ack(None) | Confirmation::NotRequested => {
                src.basic_ack(tag, BasicAckOptions::default())
                    .await
                    .map_err(amqp_err)?;
                summary.done += 1;
            }
            // returned (unroutable) or refused: it stays where it was
            Confirmation::Ack(Some(_)) | Confirmation::Nack(_) => {
                put_back.push(tag);
                summary.failed += 1;
            }
        }
    }
    Ok(())
}

/// Where in a stream to start reading.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamOffset {
    First,
    Last,
    Next,
    Offset { value: i64 },
    /// Seconds since the epoch.
    Timestamp { value: u64 },
}

/// Reads up to `count` messages of a stream from `offset`, without moving
/// any consumer's position (streams keep their messages anyway).
pub async fn read_stream(
    target: &AmqpTarget,
    vhost: &str,
    queue: &str,
    offset: StreamOffset,
    count: u16,
    truncate: usize,
    cancel: CancelToken,
) -> AppResult<Vec<Value>> {
    let conn = open(target, vhost).await?;
    let result = async {
        let ch = conn.create_channel().await.map_err(amqp_err)?;
        ch.basic_qos(count.max(1), BasicQosOptions::default())
            .await
            .map_err(amqp_err)?;
        let mut args = FieldTable::default();
        let value = match offset {
            StreamOffset::First => AMQPValue::LongString(LongString::from("first")),
            StreamOffset::Last => AMQPValue::LongString(LongString::from("last")),
            StreamOffset::Next => AMQPValue::LongString(LongString::from("next")),
            StreamOffset::Offset { value } => AMQPValue::LongLongInt(value),
            StreamOffset::Timestamp { value } => AMQPValue::Timestamp(value),
        };
        args.insert("x-stream-offset".into(), value);
        let mut consumer = ch
            .basic_consume(
                queue.into(),
                "rabbit-studio-stream".into(),
                BasicConsumeOptions::default(),
                args,
            )
            .await
            .map_err(amqp_err)?;
        let mut out = Vec::new();
        // The first message can take a moment (the stream's reader starts);
        // after that, a short silence means the end.
        let mut wait = Duration::from_secs(4);
        while out.len() < usize::from(count) {
            let next = tokio::select! {
                d = tokio::time::timeout(wait, consumer.next()) => d,
                () = cancel.cancelled() => break,
            };
            match next {
                Ok(Some(Ok(d))) => out.push(delivery_json(&d, truncate)),
                Ok(Some(Err(e))) => return Err(amqp_err(e)),
                Ok(None) | Err(_) => break,
            }
            wait = Duration::from_millis(700);
        }
        let _ = ch.close(200, "done".into()).await;
        Ok(out)
    }
    .await;
    let _ = conn.close(200, "done".into()).await;
    result
}

/// Whether the AMQP port answers at all (for the connection test).
pub async fn reachable(host: &str, port: u16) -> bool {
    tokio::time::timeout(
        Duration::from_secs(4),
        tokio::net::TcpStream::connect((host, port)),
    )
    .await
    .is_ok_and(|r| r.is_ok())
}
