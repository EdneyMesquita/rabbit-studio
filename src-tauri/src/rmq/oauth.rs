//! OAuth 2 client credentials: the token the app logs in with, fetched from
//! the issuer and fetched again shortly before it expires.

use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};

/// A token is renewed this long before it expires, so no request carries
/// one that dies in flight.
const EARLY: Duration = Duration::from_secs(60);

pub struct OAuthClient {
    http: reqwest::Client,
    issuer: String,
    client_id: String,
    secret: String,
    scope: Option<String>,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    endpoint: Option<String>,
    token: Option<(String, Instant)>,
}

impl OAuthClient {
    pub fn new(issuer: &str, client_id: &str, secret: String, scope: Option<String>) -> AppResult<Self> {
        if issuer.trim().is_empty() || client_id.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "OAuth 2 needs an issuer and a client ID".to_string(),
            ));
        }
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(6))
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| AppError::Http(format!("can't set up the OAuth 2 client: {e}")))?;
        Ok(Self {
            http,
            issuer: issuer.trim().trim_end_matches('/').to_string(),
            client_id: client_id.trim().to_string(),
            secret,
            scope: scope.filter(|s| !s.trim().is_empty()),
            state: Mutex::new(State::default()),
        })
    }

    /// A valid access token, from the cache or the issuer.
    pub async fn token(&self) -> AppResult<String> {
        let mut state = self.state.lock().await;
        if let Some((token, until)) = &state.token {
            if Instant::now() + EARLY < *until {
                return Ok(token.clone());
            }
        }
        if state.endpoint.is_none() {
            state.endpoint = Some(self.discover().await);
        }
        let endpoint = state.endpoint.clone().unwrap_or_default();
        let (token, lifetime) = self.fetch(&endpoint).await?;
        state.token = Some((token.clone(), Instant::now() + lifetime));
        Ok(token)
    }

    /// The token endpoint the issuer's discovery document names; the issuer
    /// itself when it has none (it may be the token endpoint already).
    async fn discover(&self) -> String {
        let url = format!("{}/.well-known/openid-configuration", self.issuer);
        let found = async {
            let doc: Value = self.http.get(&url).send().await.ok()?.error_for_status().ok()?.json().await.ok()?;
            doc.get("token_endpoint")?.as_str().map(str::to_string)
        }
        .await;
        found.unwrap_or_else(|| self.issuer.clone())
    }

    async fn fetch(&self, endpoint: &str) -> AppResult<(String, Duration)> {
        let enc = |s: &str| urlencoding::encode(s).into_owned();
        let mut body = format!(
            "grant_type=client_credentials&client_id={}&client_secret={}",
            enc(&self.client_id),
            enc(&self.secret)
        );
        if let Some(scope) = &self.scope {
            body.push_str(&format!("&scope={}", enc(scope)));
        }
        let response = self
            .http
            .post(endpoint)
            .header("content-type", "application/x-www-form-urlencoded")
            .header("accept", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|e| AppError::Http(format!("can't reach the OAuth 2 issuer: {e}")))?;
        let status = response.status();
        let answer: Value = response.json().await.unwrap_or(Value::Null);
        if !status.is_success() {
            let why = answer
                .get("error_description")
                .or_else(|| answer.get("error"))
                .and_then(Value::as_str)
                .unwrap_or("no reason given");
            return Err(AppError::Server {
                status: status.as_u16(),
                message: format!("The OAuth 2 issuer refused the client: {why}"),
            });
        }
        let token = answer
            .get("access_token")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Http("the OAuth 2 issuer sent no access token".to_string()))?
            .to_string();
        let lifetime = answer.get("expires_in").and_then(Value::as_u64).unwrap_or(300);
        Ok((token, Duration::from_secs(lifetime)))
    }
}
