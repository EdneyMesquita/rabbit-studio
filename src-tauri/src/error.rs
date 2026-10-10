use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// The management API answered with an error; its reason as it gave it.
    #[error("{message}")]
    Server { status: u16, message: String },
    /// The management API couldn't be reached or didn't answer.
    #[error("{0}")]
    Http(String),
    /// An AMQP connection or operation failed.
    #[error("AMQP: {0}")]
    Amqp(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("secret store error: {0}")]
    Secret(String),
    #[error("ssh tunnel error: {0}")]
    Ssh(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("session {0} is not connected")]
    SessionNotFound(String),
    /// The connection is read-only and the request would change the broker.
    #[error("{0}")]
    ReadOnly(String),
    /// A connection that logs in with a password has none to send. Shown
    /// as it is, so the message carries no prefix.
    #[error("{0}")]
    PasswordMissing(String),
}

// Tauri serializes command errors as JSON for the frontend; a plain string
// keeps the invoke() reject reason simple to consume there.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
