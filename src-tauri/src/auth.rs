use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::models::Credentials;

#[derive(Debug, Clone)]
struct CachedToken {
    access_token: String,
    expires_at: i64,
    app_id: String,
    token_url: String,
}

#[derive(Default)]
pub struct AuthManager {
    token: Mutex<Option<CachedToken>>,
}

impl AuthManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock(&self) -> MutexGuard<'_, Option<CachedToken>> {
        self.token
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn clear(&self) {
        *self.lock() = None;
    }

    pub async fn access_token(
        &self,
        http: &reqwest::Client,
        credentials: &Credentials,
        force: bool,
    ) -> AppResult<String> {
        let token_url = credentials.token_url();
        if !force {
            if let Some(cached) = self.lock().as_ref() {
                let now = unix_now();
                if cached.app_id == credentials.app_id
                    && cached.token_url == token_url
                    && cached.expires_at > now + 30
                {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        let body = json!({
            "appId": credentials.app_id,
            "clientSecret": credentials.client_secret,
        });
        let response = http.post(&token_url).json(&body).send().await?;
        let status = response.status();
        let text = response.text().await?;
        let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);

        if !status.is_success() {
            return Err(api_error(status.as_u16(), &value, &text));
        }

        let access_token = value
            .get("access_token")
            .and_then(Value::as_str)
            .or_else(|| {
                value
                    .get("data")
                    .and_then(|data| data.get("access_token"))
                    .and_then(Value::as_str)
            })
            .filter(|token| !token.trim().is_empty())
            .map(ToString::to_string)
            .ok_or_else(|| {
                let message = value
                    .get("message")
                    .and_then(Value::as_str)
                    .or_else(|| value.get("msg").and_then(Value::as_str))
                    .unwrap_or("响应里没有 access_token");
                AppError::Api(format!("换取 AccessToken 失败：{message}"))
            })?;

        let expires_in = value
            .get("expires_in")
            .and_then(|value| {
                value
                    .as_i64()
                    .or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok()))
            })
            .unwrap_or(7200);
        let expires_at = unix_now() + (expires_in - 60).max(60);

        *self.lock() = Some(CachedToken {
            access_token: access_token.clone(),
            expires_at,
            app_id: credentials.app_id.clone(),
            token_url,
        });
        Ok(access_token)
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

pub fn api_error(status: u16, value: &Value, raw: &str) -> AppError {
    let code = value.get("code").and_then(Value::as_i64);
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| value.get("msg").and_then(Value::as_str));
    let detail = match (code, message) {
        (Some(code), Some(message)) => format!("HTTP {status} · code {code} · {message}"),
        (Some(code), None) => format!("HTTP {status} · code {code}"),
        (None, Some(message)) => format!("HTTP {status} · {message}"),
        (None, None) => {
            let snippet: String = raw.trim().chars().take(300).collect();
            format!("HTTP {status} · {snippet}")
        }
    };
    AppError::Api(detail)
}
