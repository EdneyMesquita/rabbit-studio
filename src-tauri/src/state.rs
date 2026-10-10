use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::{Notify, RwLock};

use crate::connection::ConnectionStore;
use crate::models::{SecretBackendKind, SessionId};
use crate::rmq::RabbitSession;
use crate::secrets::{EncryptedFileStore, KeyringStore, SecretStore};
use crate::ssh_tunnel::KnownHosts;

/// A running task's cancel switch: a flag a loop can poll, and a wait an
/// `await` can race against, so cancelling also stops a task that is
/// waiting on the server.
#[derive(Clone, Default)]
pub struct CancelToken {
    flag: Arc<AtomicBool>,
    notify: Arc<Notify>,
}

impl CancelToken {
    pub fn cancel(&self) {
        self.flag.store(true, Ordering::Relaxed);
        self.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }

    /// Resolves once `cancel` is called (at once if it already was).
    pub async fn cancelled(&self) {
        loop {
            // registered before the check, so a cancel in between still wakes it
            let notified = self.notify.notified();
            if self.is_cancelled() {
                return;
            }
            notified.await;
        }
    }
}

pub struct AppState {
    pub connection_store: ConnectionStore,
    pub secret_store: Box<dyn SecretStore>,
    pub secret_backend: SecretBackendKind,
    pub known_hosts: Arc<KnownHosts>,
    pub sessions: RwLock<HashMap<SessionId, Arc<RabbitSession>>>,
    /// Long operations in flight (moving messages, reading a stream), keyed
    /// by the frontend-generated execution id, so `cancel_task` reaches them.
    pub running_tasks: Mutex<HashMap<String, CancelToken>>,
}

impl AppState {
    pub fn init(config_dir: &std::path::Path) -> Result<Self, String> {
        let connection_store = ConnectionStore::load(config_dir).map_err(|e| e.to_string())?;
        log::info!(
            "{} saved connections in {}",
            connection_store.list().len(),
            config_dir.display()
        );
        let known_hosts = Arc::new(KnownHosts::load(config_dir).map_err(|e| e.to_string())?);

        let (secret_store, secret_backend): (Box<dyn SecretStore>, SecretBackendKind) =
            match KeyringStore::probe() {
                Ok(store) => {
                    log::info!("secrets are kept in the OS keychain");
                    (Box::new(store), SecretBackendKind::Keyring)
                }
                Err(e) => {
                    log::warn!(
                        "no usable OS keychain ({e}); secrets are kept in an encrypted file instead"
                    );
                    let store = EncryptedFileStore::new(config_dir).inspect_err(|e| {
                        log::error!("can't open the encrypted secret file: {e}")
                    })?;
                    (Box::new(store), SecretBackendKind::EncryptedFile)
                }
            };

        Ok(Self {
            connection_store,
            secret_store,
            secret_backend,
            known_hosts,
            sessions: RwLock::new(HashMap::new()),
            running_tasks: Mutex::new(HashMap::new()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn cancelling_wakes_a_waiting_task() {
        let token = CancelToken::default();
        let canceller = token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            canceller.cancel();
        });
        let woke = tokio::time::timeout(Duration::from_secs(2), token.cancelled()).await;
        assert!(woke.is_ok());
        assert!(token.is_cancelled());
    }
}
