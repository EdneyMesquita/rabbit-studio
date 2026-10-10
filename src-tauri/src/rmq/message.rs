//! Messages as the frontend sees them, whichever way they were read: the
//! management API's `get` shape, plus a fingerprint that names a message
//! across a peek (HTTP) and a later move or replay (AMQP).

use base64::Engine;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

use lapin::types::{AMQPValue, FieldTable};
use lapin::BasicProperties;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
/// How much of the payload the fingerprint covers: enough to tell messages
/// apart, small enough that a truncated peek still sees all of it.
const PREFIX: usize = 64;

/// Names a message by what doesn't change while it waits in a queue.
pub fn fingerprint(
    exchange: &str,
    routing_key: &str,
    size: u64,
    message_id: Option<&str>,
    timestamp: Option<u64>,
    payload_prefix: &[u8],
) -> String {
    let mut h = Sha256::new();
    h.update(exchange.as_bytes());
    h.update([0]);
    h.update(routing_key.as_bytes());
    h.update([0]);
    h.update(size.to_le_bytes());
    h.update(message_id.unwrap_or_default().as_bytes());
    h.update([0]);
    h.update(timestamp.unwrap_or_default().to_le_bytes());
    h.update(&payload_prefix[..payload_prefix.len().min(PREFIX)]);
    let digest = h.finalize();
    digest[..10].iter().map(|b| format!("{b:02x}")).collect()
}

/// Adds the fingerprint to each message of a management API `get` answer.
pub fn fingerprint_http(messages: &mut Value) {
    let Some(list) = messages.as_array_mut() else {
        return;
    };
    for m in list {
        let text = |k: &str| {
            m.get(k)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let props = m.get("properties").cloned().unwrap_or(Value::Null);
        let payload = text("payload");
        let bytes = if text("payload_encoding") == "base64" {
            B64.decode(payload.as_bytes()).unwrap_or_default()
        } else {
            payload.into_bytes()
        };
        let fp = fingerprint(
            &text("exchange"),
            &text("routing_key"),
            m.get("payload_bytes")
                .and_then(Value::as_u64)
                .unwrap_or(bytes.len() as u64),
            props.get("message_id").and_then(Value::as_str),
            props.get("timestamp").and_then(Value::as_u64),
            &bytes,
        );
        if let Some(obj) = m.as_object_mut() {
            obj.insert("fingerprint".into(), Value::String(fp));
        }
    }
}

pub fn fingerprint_delivery(d: &lapin::message::Delivery) -> String {
    fingerprint(
        d.exchange.as_str(),
        d.routing_key.as_str(),
        d.data.len() as u64,
        d.properties.message_id().as_ref().map(|s| s.as_str()),
        *d.properties.timestamp(),
        &d.data,
    )
}

/// An AMQP delivery in the management API's `get` shape.
pub fn delivery_json(d: &lapin::message::Delivery, truncate: usize) -> Value {
    let (payload, encoding) = match std::str::from_utf8(&d.data) {
        Ok(s) => (truncate_str(s, truncate).to_string(), "string"),
        Err(_) => (B64.encode(&d.data[..d.data.len().min(truncate)]), "base64"),
    };
    let props = properties_json(&d.properties);
    let offset = d
        .properties
        .headers()
        .as_ref()
        .and_then(|h| h.inner().get("x-stream-offset"))
        .and_then(|v| value_json(v).as_i64());
    json!({
        "payload_bytes": d.data.len(),
        "redelivered": d.redelivered,
        "exchange": d.exchange.as_str(),
        "routing_key": d.routing_key.as_str(),
        "properties": props,
        "payload": payload,
        "payload_encoding": encoding,
        "fingerprint": fingerprint_delivery(d),
        "offset": offset,
    })
}

fn truncate_str(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

pub fn properties_json(p: &BasicProperties) -> Value {
    let mut m = Map::new();
    let mut put = |k: &str, v: Option<Value>| {
        if let Some(v) = v {
            m.insert(k.to_string(), v);
        }
    };
    let s = |v: &Option<lapin::types::ShortString>| v.as_ref().map(|s| Value::from(s.as_str()));
    put("content_type", s(p.content_type()));
    put("content_encoding", s(p.content_encoding()));
    put("headers", p.headers().as_ref().map(table_json));
    put("delivery_mode", p.delivery_mode().map(Value::from));
    put("priority", p.priority().map(Value::from));
    put("correlation_id", s(p.correlation_id()));
    put("reply_to", s(p.reply_to()));
    put("expiration", s(p.expiration()));
    put("message_id", s(p.message_id()));
    put("timestamp", p.timestamp().map(Value::from));
    put("type", s(p.kind()));
    put("user_id", s(p.user_id()));
    put("app_id", s(p.app_id()));
    Value::Object(m)
}

pub fn table_json(t: &FieldTable) -> Value {
    Value::Object(
        t.inner()
            .iter()
            .map(|(k, v)| (k.as_str().to_string(), value_json(v)))
            .collect(),
    )
}

pub fn value_json(v: &AMQPValue) -> Value {
    match v {
        AMQPValue::Boolean(b) => Value::from(*b),
        AMQPValue::ShortShortInt(n) => Value::from(*n),
        AMQPValue::ShortShortUInt(n) => Value::from(*n),
        AMQPValue::ShortInt(n) => Value::from(*n),
        AMQPValue::ShortUInt(n) => Value::from(*n),
        AMQPValue::LongInt(n) => Value::from(*n),
        AMQPValue::LongUInt(n) => Value::from(*n),
        AMQPValue::LongLongInt(n) => Value::from(*n),
        AMQPValue::Float(n) => Value::from(*n),
        AMQPValue::Double(n) => Value::from(*n),
        AMQPValue::DecimalValue(d) => Value::from(d.value as f64 / 10f64.powi(i32::from(d.scale))),
        AMQPValue::ShortString(s) => Value::from(s.as_str()),
        AMQPValue::LongString(s) => Value::from(String::from_utf8_lossy(s.as_bytes()).into_owned()),
        AMQPValue::FieldArray(a) => Value::Array(a.as_slice().iter().map(value_json).collect()),
        AMQPValue::Timestamp(t) => Value::from(*t),
        AMQPValue::FieldTable(t) => table_json(t),
        AMQPValue::ByteArray(b) => Value::from(B64.encode(b.as_slice())),
        AMQPValue::Void => Value::Null,
    }
}

/// Where a dead-lettered message was first published: the exchange and
/// routing key of its oldest `x-death` entry.
pub fn origin(p: &BasicProperties) -> Option<(String, String)> {
    let headers = p.headers().as_ref()?;
    let deaths = match headers.inner().get("x-death")? {
        AMQPValue::FieldArray(a) => a.as_slice().to_vec(),
        _ => return None,
    };
    // The most recent death comes first; the original publish is the last.
    let first = deaths.iter().rev().find_map(|d| match d {
        AMQPValue::FieldTable(t) => Some(table_json(t)),
        _ => None,
    })?;
    let exchange = first.get("exchange")?.as_str()?.to_string();
    let rk = first
        .get("routing-keys")
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            first
                .get("queue")
                .and_then(Value::as_str)
                .map(str::to_string)
        })?;
    Some((exchange, rk))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_and_amqp_fingerprints_agree() {
        let payload = br#"{"order":42,"total":"19.90"}"#;
        let mut http = json!([{
            "exchange": "orders.events", "routing_key": "order.created",
            "payload_bytes": payload.len(), "payload_encoding": "string",
            "payload": std::str::from_utf8(payload).unwrap(),
            "properties": {"message_id": "m-1", "timestamp": 1700000000}
        }]);
        fingerprint_http(&mut http);
        let expected = fingerprint(
            "orders.events",
            "order.created",
            payload.len() as u64,
            Some("m-1"),
            Some(1700000000),
            payload,
        );
        assert_eq!(http[0]["fingerprint"], expected);
    }

    #[test]
    fn a_truncated_peek_keeps_the_fingerprint() {
        let long = "x".repeat(500);
        let full = fingerprint("", "q", 500, None, None, long.as_bytes());
        let cut = fingerprint("", "q", 500, None, None, &long.as_bytes()[..100]);
        assert_eq!(full, cut);
    }
}
