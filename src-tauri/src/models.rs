use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};

pub const DEFAULT_INTENTS: i64 = 1 << 25;
pub const DEFAULT_EVENT_LIMIT: usize = 500;

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    pub app_id: String,
    pub client_secret: String,
    #[serde(default = "default_environment")]
    pub environment: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub token_url: Option<String>,
    #[serde(default = "default_intents")]
    pub intents: i64,
}

fn default_environment() -> String {
    "production".to_string()
}

fn default_intents() -> i64 {
    DEFAULT_INTENTS
}

impl Credentials {
    pub fn validate(&self) -> AppResult<()> {
        let app_id = self.app_id.trim();
        if !(5..=20).contains(&app_id.len()) || !app_id.chars().all(|ch| ch.is_ascii_digit()) {
            return Err(AppError::Config("AppID 必须是 5-20 位数字".into()));
        }
        if self.client_secret.trim().len() < 6 {
            return Err(AppError::Config("AppSecret 至少需要 6 个字符".into()));
        }
        if !matches!(
            self.environment.as_str(),
            "production" | "sandbox" | "custom"
        ) {
            return Err(AppError::Config(
                "environment 必须是 production / sandbox / custom".into(),
            ));
        }
        if self.environment == "custom" {
            let base = self
                .base_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| AppError::Config("自定义环境需要填写 Base URL".into()))?;
            validate_http_url(base)?;
        }
        if let Some(token_url) = self
            .token_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            validate_http_url(token_url)?;
        }
        if self.intents == 0 {
            return Err(AppError::Config("至少需要订阅一项 Intents".into()));
        }
        Ok(())
    }

    pub fn base_url(&self) -> String {
        match self.environment.as_str() {
            "sandbox" => "https://sandbox.api.sgroup.qq.com".to_string(),
            "custom" => self
                .base_url
                .as_deref()
                .unwrap_or_default()
                .trim()
                .trim_end_matches('/')
                .to_string(),
            _ => "https://api.sgroup.qq.com".to_string(),
        }
    }

    pub fn token_url(&self) -> String {
        if let Some(url) = self
            .token_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return url.trim_end_matches('/').to_string();
        }
        if self.environment == "custom" {
            return format!("{}/app/getAppAccessToken", self.base_url());
        }
        "https://bots.qq.com/app/getAppAccessToken".to_string()
    }
}

fn validate_http_url(value: &str) -> AppResult<()> {
    let url =
        url::Url::parse(value).map_err(|error| AppError::Config(format!("URL 不合法：{error}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::Config(
            "URL 必须以 http:// 或 https:// 开头".into(),
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotInfo {
    pub id: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryParam {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedEndpoint {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_get")]
    pub method: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub query: Vec<QueryParam>,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub last_used_at: Option<String>,
    #[serde(default)]
    pub use_count: u64,
}

fn default_get() -> String {
    "GET".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub auto_save_on_success: bool,
    #[serde(default = "default_event_limit")]
    pub event_limit: usize,
}

fn default_event_limit() -> usize {
    DEFAULT_EVENT_LIMIT
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_save_on_success: false,
            event_limit: DEFAULT_EVENT_LIMIT,
        }
    }
}

impl Settings {
    pub fn normalized(mut self) -> Self {
        self.event_limit = self.event_limit.clamp(50, 5_000);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StoredConfig {
    #[serde(default)]
    pub credentials: Option<Credentials>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub saved_endpoints: Vec<SavedEndpoint>,
}

impl StoredConfig {
    pub fn normalized(mut self) -> Self {
        self.settings = self.settings.normalized();
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayEvent {
    pub id: String,
    #[serde(default)]
    pub seq: Option<i64>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub received_at: String,
    pub data: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub state: String,
    #[serde(default)]
    pub bot: Option<BotInfo>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub last_seq: Option<i64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub gateway_url: Option<String>,
    #[serde(default)]
    pub intents: Option<i64>,
    #[serde(default)]
    pub heartbeat_interval_ms: Option<u64>,
    #[serde(default)]
    pub latency_ms: Option<u64>,
    #[serde(default)]
    pub connected_at: Option<String>,
}

impl Default for ConnectionStatus {
    fn default() -> Self {
        Self {
            state: "disconnected".to_string(),
            bot: None,
            session_id: None,
            last_seq: None,
            error: None,
            gateway_url: None,
            intents: None,
            heartbeat_interval_ms: None,
            latency_ms: None,
            connected_at: None,
        }
    }
}

impl ConnectionStatus {
    pub fn disconnected() -> Self {
        Self::default()
    }

    pub fn connecting() -> Self {
        Self {
            state: "connecting".to_string(),
            ..Self::default()
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            state: "error".to_string(),
            error: Some(message.into()),
            ..Self::default()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupEntry {
    pub openid: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub member_count: Option<i64>,
    #[serde(default)]
    pub source: Option<String>,
    pub first_seen: String,
    pub last_seen: String,
    #[serde(default)]
    pub message_count: u64,
    #[serde(default)]
    pub info_fetched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserEntry {
    pub openid: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub avatar: Option<String>,
    #[serde(default)]
    pub union_openid: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    pub first_seen: String,
    pub last_seen: String,
    #[serde(default)]
    pub message_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CacheSnapshot {
    #[serde(default)]
    pub groups: Vec<GroupEntry>,
    #[serde(default)]
    pub users: Vec<UserEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CacheData {
    #[serde(default)]
    pub groups: BTreeMap<String, GroupEntry>,
    #[serde(default)]
    pub users: BTreeMap<String, UserEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    #[serde(default = "default_get")]
    pub method: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub query: Vec<QueryParam>,
    #[serde(default)]
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub ok: bool,
    pub status: u16,
    #[serde(default)]
    pub status_text: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Value,
    pub raw: String,
    pub elapsed_ms: u128,
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub request_body: Option<String>,
    pub auth_applied: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogoutOptions {
    #[serde(default)]
    pub clear_credentials: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub config: StoredConfig,
    pub status: ConnectionStatus,
    pub events: Vec<GatewayEvent>,
    pub cache: CacheSnapshot,
    pub version: String,
}

/// Minimal parsed gateway frame.
#[derive(Debug, Clone, Default)]
pub struct WsPayload {
    pub op: i64,
    pub d: Value,
    pub s: Option<i64>,
    pub t: Option<String>,
    pub id: Option<String>,
}

impl WsPayload {
    pub fn parse(value: &Value) -> Self {
        Self {
            op: value.get("op").and_then(Value::as_i64).unwrap_or(-1),
            d: value.get("d").cloned().unwrap_or(Value::Null),
            s: value.get("s").and_then(Value::as_i64),
            t: value
                .get("t")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            id: value
                .get("id")
                .and_then(Value::as_str)
                .map(ToString::to_string),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn custom() -> Credentials {
        Credentials {
            app_id: "123456789".into(),
            client_secret: "secret-123".into(),
            environment: "custom".into(),
            base_url: Some("http://127.0.0.1:5700/".into()),
            token_url: None,
            intents: 1 << 25,
        }
    }

    #[test]
    fn resolves_official_urls() {
        let mut credentials = custom();
        credentials.environment = "production".into();
        assert_eq!(credentials.base_url(), "https://api.sgroup.qq.com");
        assert_eq!(
            credentials.token_url(),
            "https://bots.qq.com/app/getAppAccessToken"
        );

        credentials.environment = "sandbox".into();
        assert_eq!(credentials.base_url(), "https://sandbox.api.sgroup.qq.com");
        assert_eq!(
            credentials.token_url(),
            "https://bots.qq.com/app/getAppAccessToken"
        );
    }

    #[test]
    fn custom_base_url_derives_token_endpoint() {
        let credentials = custom();
        assert_eq!(credentials.base_url(), "http://127.0.0.1:5700");
        assert_eq!(
            credentials.token_url(),
            "http://127.0.0.1:5700/app/getAppAccessToken"
        );
    }

    #[test]
    fn token_url_override_wins() {
        let mut credentials = custom();
        credentials.token_url = Some("https://example.com/token/".into());
        assert_eq!(credentials.token_url(), "https://example.com/token");
    }

    #[test]
    fn validates_credentials() {
        assert!(custom().validate().is_ok());
        let mut bad = custom();
        bad.app_id = "12ab".into();
        assert!(bad.validate().is_err());
        let mut bad = custom();
        bad.environment = "staging".into();
        assert!(bad.validate().is_err());
        let mut bad = custom();
        bad.base_url = Some("ftp://example.com".into());
        assert!(bad.validate().is_err());
        let mut bad = custom();
        bad.intents = 0;
        assert!(bad.validate().is_err());
    }

    #[test]
    fn parses_gateway_frames() {
        let payload = WsPayload::parse(&serde_json::json!({
            "op": 0,
            "s": 12,
            "t": "GROUP_AT_MESSAGE_CREATE",
            "id": "evt-1",
            "d": { "content": "hi" }
        }));
        assert_eq!(payload.op, 0);
        assert_eq!(payload.s, Some(12));
        assert_eq!(payload.t.as_deref(), Some("GROUP_AT_MESSAGE_CREATE"));
        assert_eq!(payload.id.as_deref(), Some("evt-1"));
        assert_eq!(payload.d["content"], "hi");
    }
}
