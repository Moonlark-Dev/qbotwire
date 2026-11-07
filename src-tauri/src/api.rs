use std::collections::BTreeMap;
use std::time::Instant;

use reqwest::header::{ACCEPT, AUTHORIZATION};
use reqwest::{Method, StatusCode};
use serde_json::{Map, Value};
use url::Url;

use crate::auth::api_error;
use crate::error::{AppError, AppResult};
use crate::models::{ApiRequest, ApiResponse, BotInfo, Credentials, QueryParam};
use crate::Core;

pub const TOKEN_PATH: &str = "/app/getAppAccessToken";

pub fn is_token_path(path: &str) -> bool {
    path.trim().trim_end_matches('/').ends_with(TOKEN_PATH)
}

fn parse_method(method: &str) -> AppResult<Method> {
    let upper = method.trim().to_uppercase();
    Method::from_bytes(upper.as_bytes())
        .map_err(|_| AppError::Config(format!("不支持的 HTTP 方法：{method}")))
}

fn method_allows_body(method: &Method) -> bool {
    !matches!(*method, Method::GET | Method::HEAD)
}

fn build_url(base: &str, path: &str, query: &[QueryParam]) -> AppResult<Url> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Config("接口路径不能为空".into()));
    }
    if trimmed.contains('{') || trimmed.contains('}') {
        return Err(AppError::Config(
            "路径里还有未填写的参数（{...}），请先补全".into(),
        ));
    }
    let mut url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        Url::parse(trimmed)?
    } else {
        if base.trim().is_empty() {
            return Err(AppError::Config("当前环境没有可用的 Base URL".into()));
        }
        let base = Url::parse(&format!("{}/", base.trim_end_matches('/')))?;
        base.join(trimmed.trim_start_matches('/'))?
    };
    if query
        .iter()
        .any(|param| param.enabled && !param.key.trim().is_empty())
    {
        let mut pairs = url.query_pairs_mut();
        for param in query {
            if param.enabled && !param.key.trim().is_empty() {
                pairs.append_pair(param.key.trim(), &param.value);
            }
        }
    }
    Ok(url)
}

fn parse_body(text: &str) -> AppResult<Option<Value>> {
    if text.trim().is_empty() {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(text)
        .map_err(|error| AppError::Config(format!("请求体不是合法 JSON：{error}")))?;
    Ok(Some(value))
}

fn token_payload(credentials: &Credentials, body: Option<Value>) -> AppResult<Value> {
    let mut map = match body {
        None => Map::new(),
        Some(Value::Object(map)) => map,
        Some(_) => {
            return Err(AppError::Config(
                "Token 请求体必须是 JSON 对象（appId / clientSecret）".into(),
            ))
        }
    };
    map.insert(
        "appId".to_string(),
        Value::String(credentials.app_id.clone()),
    );
    map.insert(
        "clientSecret".to_string(),
        Value::String(credentials.client_secret.clone()),
    );
    Ok(Value::Object(map))
}

pub async fn send_request(core: &Core, request: ApiRequest) -> AppResult<ApiResponse> {
    let credentials = core
        .store
        .credentials()
        .ok_or_else(|| AppError::Config("还没有配置 Bot 凭据，请先在设置里填写".into()))?;
    let method = parse_method(&request.method)?;
    let url = build_url(&credentials.base_url(), &request.path, &request.query)?;
    let token_call = is_token_path(&request.path);
    let body = parse_body(&request.body)?;
    let mut token = if token_call {
        None
    } else {
        Some(
            core.auth
                .access_token(&core.http, &credentials, false)
                .await?,
        )
    };

    let started = Instant::now();
    let mut result = execute_once(
        core,
        &credentials,
        &method,
        &url,
        &body,
        token.as_deref(),
        token_call,
    )
    .await?;

    // A cached token can expire between refreshes; retry exactly once.
    if result.0 == StatusCode::UNAUTHORIZED && !token_call {
        token = Some(
            core.auth
                .access_token(&core.http, &credentials, true)
                .await?,
        );
        result = execute_once(
            core,
            &credentials,
            &method,
            &url,
            &body,
            token.as_deref(),
            token_call,
        )
        .await?;
    }
    let elapsed_ms = started.elapsed().as_millis();

    let (status, headers, raw) = result;
    let body_value: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    Ok(ApiResponse {
        ok: status.is_success(),
        status: status.as_u16(),
        status_text: status.canonical_reason().map(ToString::to_string),
        headers,
        body: body_value,
        raw,
        elapsed_ms,
        url: url.to_string(),
        method: method.as_str().to_string(),
        request_body: if token_call {
            None
        } else {
            Some(request.body.clone()).filter(|text| !text.trim().is_empty())
        },
        auth_applied: !token_call,
    })
}

#[allow(clippy::too_many_arguments)]
async fn execute_once(
    core: &Core,
    credentials: &Credentials,
    method: &Method,
    url: &Url,
    body: &Option<Value>,
    token: Option<&str>,
    token_call: bool,
) -> AppResult<(StatusCode, BTreeMap<String, String>, String)> {
    let mut builder = core
        .http
        .request(method.clone(), url.clone())
        .header(ACCEPT, "application/json");
    if let Some(token) = token {
        builder = builder.header(AUTHORIZATION, format!("QQBot {token}"));
    }
    let payload = if token_call {
        Some(token_payload(credentials, body.clone())?)
    } else if method_allows_body(method) {
        body.clone()
    } else {
        None
    };
    if let Some(payload) = payload {
        builder = builder.json(&payload);
    }

    let response = builder.send().await?;
    let status = response.status();
    let mut headers = BTreeMap::new();
    for (name, value) in response.headers() {
        if let Ok(text) = value.to_str() {
            headers.insert(name.as_str().to_string(), text.to_string());
        }
    }
    let raw = response.text().await?;
    Ok((status, headers, raw))
}

async fn get_json(core: &Core, url: &str, token: &str) -> AppResult<Value> {
    let response = core
        .http
        .get(url)
        .header(AUTHORIZATION, format!("QQBot {token}"))
        .header(ACCEPT, "application/json")
        .send()
        .await?;
    let status = response.status();
    let raw = response.text().await?;
    let value: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(api_error(status.as_u16(), &value, &raw));
    }
    Ok(value)
}

pub async fn fetch_gateway_url(
    core: &Core,
    credentials: &Credentials,
    token: &str,
) -> AppResult<String> {
    let url = format!("{}/gateway", credentials.base_url());
    let value = get_json(core, &url, token).await?;
    value
        .get("url")
        .and_then(Value::as_str)
        .filter(|url| !url.trim().is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| AppError::Api("网关地址响应里没有 url".into()))
}

pub async fn fetch_bot_info(
    core: &Core,
    credentials: &Credentials,
    token: &str,
) -> AppResult<BotInfo> {
    let url = format!("{}/users/@me", credentials.base_url());
    let value = get_json(core, &url, token).await?;
    let id = value
        .get("id")
        .and_then(|value| {
            value
                .as_str()
                .map(ToString::to_string)
                .or_else(|| value.as_i64().map(|number| number.to_string()))
        })
        .unwrap_or_default();
    let username = value
        .get("username")
        .and_then(Value::as_str)
        .unwrap_or("QQ Bot")
        .to_string();
    let avatar = value
        .get("avatar")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string);
    Ok(BotInfo {
        id,
        username,
        avatar,
    })
}

#[derive(Debug, Clone, Default)]
pub struct GroupInfo {
    pub name: Option<String>,
    pub member_count: Option<i64>,
}

pub async fn fetch_group_info(
    core: &Core,
    credentials: &Credentials,
    token: &str,
    group_openid: &str,
) -> AppResult<GroupInfo> {
    let url = format!("{}/v2/groups/{}/info", credentials.base_url(), group_openid);
    let value = get_json(core, &url, token).await?;
    Ok(GroupInfo {
        name: value
            .get("group_name")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(ToString::to_string),
        member_count: value.get("group_member_num").and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok()))
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(key: &str, value: &str, enabled: bool) -> QueryParam {
        QueryParam {
            key: key.into(),
            value: value.into(),
            enabled,
        }
    }

    #[test]
    fn recognises_token_endpoint() {
        assert!(is_token_path("/app/getAppAccessToken"));
        assert!(is_token_path("/app/getAppAccessToken/"));
        assert!(!is_token_path("/v2/groups/g/messages"));
    }

    #[test]
    fn builds_url_with_query_and_base() {
        let url = build_url(
            "https://api.sgroup.qq.com",
            "/v2/groups/g-1/messages",
            &[query("limit", "10", true), query("skip", "1", false)],
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "https://api.sgroup.qq.com/v2/groups/g-1/messages?limit=10"
        );
    }

    #[test]
    fn accepts_absolute_urls() {
        let url = build_url(
            "https://api.sgroup.qq.com",
            "http://127.0.0.1:5700/users/@me",
            &[],
        )
        .unwrap();
        assert_eq!(url.as_str(), "http://127.0.0.1:5700/users/@me");
    }

    #[test]
    fn rejects_unfilled_path_params() {
        let error = build_url(
            "https://api.sgroup.qq.com",
            "/v2/groups/{group_openid}/messages",
            &[],
        )
        .unwrap_err();
        assert!(error.to_string().contains("未填写"));
    }

    #[test]
    fn parses_json_bodies() {
        assert!(parse_body("").unwrap().is_none());
        assert_eq!(
            parse_body("{\"content\":\"hi\"}").unwrap().unwrap()["content"],
            "hi"
        );
        assert!(parse_body("{oops").is_err());
    }

    #[test]
    fn token_payload_always_uses_saved_credentials() {
        let credentials = Credentials {
            app_id: "123456789".into(),
            client_secret: "secret-123".into(),
            environment: "production".into(),
            base_url: None,
            token_url: None,
            intents: 1 << 25,
        };
        let payload = token_payload(
            &credentials,
            Some(serde_json::json!({ "appId": "wrong", "extra": 1 })),
        )
        .unwrap();
        assert_eq!(payload["appId"], "123456789");
        assert_eq!(payload["clientSecret"], "secret-123");
        assert_eq!(payload["extra"], 1);
        assert!(token_payload(&credentials, Some(serde_json::json!("nope"))).is_err());
    }
}
