use std::collections::BTreeMap;
use std::time::Instant;

use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use md5::{Digest as _, Md5};
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, ETAG};
use reqwest::{Method, StatusCode};
use serde_json::{json, Map, Value};
use sha1::Sha1;
use url::Url;

use crate::auth::api_error;
use crate::error::{AppError, AppResult};
use crate::models::{
    ApiRequest, ApiResponse, BotInfo, Credentials, MediaAsset, MediaUploadInput, QueryParam,
};
use crate::Core;

pub const TOKEN_PATH: &str = "/app/getAppAccessToken";

/// `POST /v2/media-images/prepare` rejects anything above 10 MiB.
const MEDIA_IMAGE_MAX_BYTES: usize = 10 * 1024 * 1024;

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

struct MediaBytes {
    file_name: String,
    content_type: &'static str,
    bytes: Vec<u8>,
    md5: String,
    sha1: String,
}

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn media_content_type(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "image/png" => Some("image/png"),
        "image/jpeg" | "image/jpg" => Some("image/jpeg"),
        "image/gif" => Some("image/gif"),
        "image/webp" => Some("image/webp"),
        _ => None,
    }
}

fn media_content_type_for_name(name: &str) -> Option<&'static str> {
    let extension = name.rsplit('.').next()?.to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn decode_media_upload(input: &MediaUploadInput) -> AppResult<MediaBytes> {
    let bytes = STANDARD
        .decode(input.data_base64.as_bytes())
        .map_err(|_| AppError::Config("图片数据不是合法的 base64".into()))?;
    if bytes.is_empty() {
        return Err(AppError::Config("图片内容为空".into()));
    }
    if bytes.len() > MEDIA_IMAGE_MAX_BYTES {
        return Err(AppError::Config("单张图片不能超过 10 MB".into()));
    }
    let content_type = media_content_type(&input.content_type)
        .ok_or_else(|| AppError::Config("图片类型只支持 png / jpeg / gif / webp".into()))?;
    let file_name = input
        .file_name
        .trim()
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();
    if file_name.is_empty() {
        return Err(AppError::Config("图片文件名不能为空".into()));
    }
    if media_content_type_for_name(&file_name) != Some(content_type) {
        return Err(AppError::Config(
            "文件名扩展名需要与图片类型一致（png / jpeg / gif / webp）".into(),
        ));
    }
    let md5 = hex_digest(Md5::digest(&bytes));
    let sha1 = hex_digest(Sha1::digest(&bytes));
    Ok(MediaBytes {
        file_name,
        content_type,
        bytes,
        md5,
        sha1,
    })
}

fn required_string(value: &Value, key: &str) -> AppResult<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| AppError::Api(format!("素材接口响应里缺少 {key}")))
}

fn response_json(status: StatusCode, value: &Value, raw: &str) -> AppResult<Value> {
    if status.is_success() {
        Ok(value.clone())
    } else {
        Err(api_error(status.as_u16(), value, raw))
    }
}

fn raw_snippet(raw: &str) -> String {
    raw.trim().chars().take(200).collect()
}

/// Full material image upload: `prepare` → binary PUT to the presigned URL →
/// `complete`. The returned asset is *not* cached here; the UI stores it with
/// its locally generated thumbnail.
pub async fn upload_media_image(core: &Core, input: MediaUploadInput) -> AppResult<MediaAsset> {
    let media = decode_media_upload(&input)?;
    let credentials = core
        .store
        .credentials()
        .ok_or_else(|| AppError::Config("还没有配置 Bot 凭据，请先在设置里填写".into()))?;
    let token = core
        .auth
        .access_token(&core.http, &credentials, false)
        .await?;
    upload_media_with_base(
        &core.http,
        &credentials.base_url(),
        &token,
        &credentials.app_id,
        media,
    )
    .await
}

/// Network half of the upload, split out so it can be exercised against a local
/// fake endpoint without a Tauri runtime.
async fn upload_media_with_base(
    http: &reqwest::Client,
    base: &str,
    token: &str,
    app_id: &str,
    media: MediaBytes,
) -> AppResult<MediaAsset> {
    let base = base.trim_end_matches('/');
    let size = media.bytes.len() as u64;
    let response = http
        .post(format!("{base}/v2/media-images/prepare"))
        .header(AUTHORIZATION, format!("QQBot {token}"))
        .header(ACCEPT, "application/json")
        .json(&json!({
            "file_name": &media.file_name,
            "file_size": size,
            "content_type": media.content_type,
            "md5": &media.md5,
            "sha1": &media.sha1,
        }))
        .send()
        .await?;
    let status = response.status();
    let raw = response.text().await?;
    let value: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let prepared = response_json(status, &value, &raw)?;
    let upload_id = required_string(&prepared, "upload_id")?;
    let presigned_url = required_string(&prepared, "presigned_url")?;

    let response = http
        .put(&presigned_url)
        .header(CONTENT_TYPE, media.content_type)
        .body(media.bytes)
        .send()
        .await?;
    let status = response.status();
    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim_matches('"').to_ascii_lowercase());
    let raw = response.text().await?;
    if !status.is_success() {
        return Err(AppError::Api(format!(
            "上传图片二进制失败：HTTP {} · {}",
            status.as_u16(),
            raw_snippet(&raw)
        )));
    }
    if let Some(etag) = etag.filter(|value| !value.is_empty()) {
        if etag != media.md5 {
            return Err(AppError::Api(format!(
                "上传后的 ETag（{etag}）与本地 MD5（{}）不一致",
                media.md5
            )));
        }
    }

    let response = http
        .post(format!("{base}/v2/media-images/complete"))
        .header(AUTHORIZATION, format!("QQBot {token}"))
        .header(ACCEPT, "application/json")
        .json(&json!({ "upload_id": upload_id, "md5": media.md5 }))
        .send()
        .await?;
    let status = response.status();
    let raw = response.text().await?;
    let value: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
    let completed = response_json(status, &value, &raw)?;
    let image_id = required_string(&completed, "image_id")?;
    let url = required_string(&completed, "url")?;
    let ttl = completed.get("ttl").and_then(Value::as_i64).unwrap_or(0);
    let created_at = chrono::Utc::now().timestamp();
    Ok(MediaAsset {
        image_id,
        url,
        file_name: media.file_name,
        content_type: media.content_type.to_string(),
        size,
        width: None,
        height: None,
        thumbnail: None,
        app_id: Some(app_id.to_string()),
        created_at,
        expires_at: created_at.saturating_add(ttl.max(0)),
        source: "upload".to_string(),
    })
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
    /// Cross-app group OpenID added by the 2026-11-16 API change.
    pub union_group_openid: Option<String>,
}

pub async fn fetch_group_info(
    core: &Core,
    credentials: &Credentials,
    token: &str,
    group_openid: &str,
) -> AppResult<GroupInfo> {
    let url = format!("{}/v2/groups/{}/info", credentials.base_url(), group_openid);
    let value = get_json(core, &url, token).await?;
    Ok(parse_group_info(&value))
}

fn parse_group_info(value: &Value) -> GroupInfo {
    GroupInfo {
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
        union_group_openid: non_empty_string(value, "union_group_openid"),
    }
}

/// Profile returned by `GET /v2/users/{openid}/info` (2026-11-16 API change).
#[derive(Debug, Clone, Default)]
pub struct UserInfo {
    pub name: Option<String>,
    pub avatar: Option<String>,
    pub union_openid: Option<String>,
    pub allow_proactive_msg: Option<bool>,
}

pub async fn fetch_user_info(
    core: &Core,
    credentials: &Credentials,
    token: &str,
    user_openid: &str,
) -> AppResult<UserInfo> {
    let url = format!("{}/v2/users/{}/info", credentials.base_url(), user_openid);
    let value = get_json(core, &url, token).await?;
    Ok(parse_user_info(&value))
}

fn parse_user_info(value: &Value) -> UserInfo {
    UserInfo {
        name: non_empty_string(value, "username"),
        avatar: non_empty_string(value, "avatar"),
        union_openid: non_empty_string(value, "union_openid"),
        allow_proactive_msg: value.get("allow_proactive_msg").and_then(Value::as_bool),
    }
}

fn non_empty_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
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
    fn decodes_and_hashes_media_uploads() {
        let input = MediaUploadInput {
            file_name: "/tmp/chart.png".into(),
            content_type: "image/png".into(),
            data_base64: STANDARD.encode(b"abc"),
        };
        let media = decode_media_upload(&input).unwrap();
        assert_eq!(media.file_name, "chart.png");
        assert_eq!(media.content_type, "image/png");
        assert_eq!(media.bytes, b"abc".to_vec());
        assert_eq!(media.md5, "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(media.sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[test]
    fn rejects_invalid_media_uploads() {
        let base = MediaUploadInput {
            file_name: "chart.png".into(),
            content_type: "image/png".into(),
            data_base64: STANDARD.encode(b"abc"),
        };
        assert!(decode_media_upload(&MediaUploadInput {
            data_base64: String::new(),
            ..base.clone()
        })
        .is_err());
        assert!(decode_media_upload(&MediaUploadInput {
            content_type: "image/bmp".into(),
            ..base.clone()
        })
        .is_err());
        assert!(decode_media_upload(&MediaUploadInput {
            content_type: "image/jpeg".into(),
            ..base.clone()
        })
        .is_err());
        assert!(decode_media_upload(&MediaUploadInput {
            data_base64: "not base64!!".into(),
            ..base
        })
        .is_err());
    }

    #[test]
    fn parses_group_info_with_the_union_group_openid() {
        let info = parse_group_info(&serde_json::json!({
            "group_openid": "g-1",
            "group_name": "读书分享会",
            "group_member_num": 256,
            "union_group_openid": "union-g-1"
        }));
        assert_eq!(info.name.as_deref(), Some("读书分享会"));
        assert_eq!(info.member_count, Some(256));
        assert_eq!(info.union_group_openid.as_deref(), Some("union-g-1"));
        assert!(parse_group_info(&serde_json::json!({}))
            .union_group_openid
            .is_none());
    }

    #[test]
    fn parses_user_info_from_the_2026_11_16_api() {
        let info = parse_user_info(&serde_json::json!({
            "username": "笑😊心❤️",
            "avatar": "https://thirdqq.qlogo.cn/x",
            "allow_proactive_msg": false,
            "union_openid": ""
        }));
        assert_eq!(info.name.as_deref(), Some("笑😊心❤️"));
        assert_eq!(info.avatar.as_deref(), Some("https://thirdqq.qlogo.cn/x"));
        assert_eq!(info.allow_proactive_msg, Some(false));
        assert_eq!(info.union_openid, None);
        assert_eq!(parse_user_info(&serde_json::json!({})).name, None);
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

    use std::io::{Read as _, Write as _};
    use std::net::{TcpListener, TcpStream};

    struct RecordedRequest {
        method: String,
        path: String,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    impl RecordedRequest {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.as_str())
        }
    }

    fn read_http_request(stream: &mut TcpStream) -> RecordedRequest {
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut data = Vec::new();
        let mut buffer = [0u8; 4096];
        let header_end = loop {
            if let Some(position) = data.windows(4).position(|window| window == b"\r\n\r\n") {
                break position;
            }
            let read = stream.read(&mut buffer).unwrap();
            assert!(read > 0, "connection closed before the headers");
            data.extend_from_slice(&buffer[..read]);
        };
        let head = String::from_utf8_lossy(&data[..header_end]).to_string();
        let mut lines = head.split("\r\n");
        let mut parts = lines.next().unwrap_or_default().split_whitespace();
        let method = parts.next().unwrap_or_default().to_string();
        let path = parts.next().unwrap_or_default().to_string();
        let mut headers = Vec::new();
        for line in lines {
            if let Some((name, value)) = line.split_once(':') {
                headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
            }
        }
        let content_length = headers
            .iter()
            .find(|(name, _)| name == "content-length")
            .and_then(|(_, value)| value.parse::<usize>().ok())
            .unwrap_or(0);
        let mut body = data[(header_end + 4).min(data.len())..].to_vec();
        while body.len() < content_length {
            let read = stream.read(&mut buffer).unwrap();
            assert!(read > 0, "connection closed before the body");
            body.extend_from_slice(&buffer[..read]);
        }
        body.truncate(content_length);
        RecordedRequest {
            method,
            path,
            headers,
            body,
        }
    }

    fn write_http_response(
        stream: &mut TcpStream,
        status: &str,
        extra: &[(&str, String)],
        body: &str,
    ) {
        let mut response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n",
            body.len()
        );
        for (name, value) in extra {
            response.push_str(&format!("{name}: {value}\r\n"));
        }
        response.push_str("\r\n");
        response.push_str(body);
        stream.write_all(response.as_bytes()).unwrap();
        stream.flush().unwrap();
    }

    fn start_fake_media_server(
        md5: &str,
    ) -> (
        String,
        std::sync::mpsc::Receiver<RecordedRequest>,
        std::thread::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let (sender, receiver) = std::sync::mpsc::channel();
        let md5 = md5.to_string();
        let server_base = base.clone();
        let handle = std::thread::spawn(move || {
            for index in 0..3 {
                let (mut stream, _) = listener.accept().unwrap();
                let request = read_http_request(&mut stream);
                match index {
                    0 => write_http_response(
                        &mut stream,
                        "200 OK",
                        &[],
                        &format!(
                            "{{\"upload_id\":\"upload-1\",\"presigned_url\":\"{server_base}/upload\",\"expires_in\":3600}}"
                        ),
                    ),
                    1 => write_http_response(
                        &mut stream,
                        "200 OK",
                        &[("ETag", format!("\"{md5}\""))],
                        "",
                    ),
                    _ => write_http_response(
                        &mut stream,
                        "200 OK",
                        &[],
                        "{\"image_id\":\"img-1\",\"url\":\"qqbot-media://image/v1/token-1\",\"ttl\":7776000,\"preview_url\":\"https://example.com/preview\"}",
                    ),
                }
                sender.send(request).unwrap();
            }
        });
        (base, receiver, handle)
    }

    #[tokio::test]
    async fn runs_the_material_upload_flow() {
        let bytes = b"abc".to_vec();
        let media = MediaBytes {
            file_name: "chart.png".into(),
            content_type: "image/png",
            md5: hex_digest(Md5::digest(&bytes)),
            sha1: hex_digest(Sha1::digest(&bytes)),
            bytes,
        };
        let (base, requests, server) = start_fake_media_server(&media.md5);
        let client = reqwest::Client::new();
        let asset = upload_media_with_base(&client, &base, "token-1", "102030405", media)
            .await
            .unwrap();
        server.join().unwrap();
        let seen: Vec<RecordedRequest> = requests.into_iter().collect();

        assert_eq!(asset.image_id, "img-1");
        assert_eq!(asset.url, "qqbot-media://image/v1/token-1");
        assert_eq!(asset.content_type, "image/png");
        assert_eq!(asset.size, 3);
        assert_eq!(asset.app_id.as_deref(), Some("102030405"));
        assert_eq!(asset.expires_at - asset.created_at, 7_776_000);
        assert_eq!(asset.source, "upload");

        assert_eq!(seen[0].method, "POST");
        assert_eq!(seen[0].path, "/v2/media-images/prepare");
        assert_eq!(seen[0].header("authorization"), Some("QQBot token-1"));
        let prepare: Value = serde_json::from_slice(&seen[0].body).unwrap();
        assert_eq!(prepare["file_name"], "chart.png");
        assert_eq!(prepare["file_size"], 3);
        assert_eq!(prepare["content_type"], "image/png");
        assert_eq!(prepare["md5"], hex_digest(Md5::digest(b"abc")));
        assert_eq!(prepare["sha1"], hex_digest(Sha1::digest(b"abc")));

        assert_eq!(seen[1].method, "PUT");
        assert_eq!(seen[1].path, "/upload");
        assert_eq!(seen[1].header("content-type"), Some("image/png"));
        assert_eq!(seen[1].body, b"abc");

        assert_eq!(seen[2].method, "POST");
        assert_eq!(seen[2].path, "/v2/media-images/complete");
        assert_eq!(seen[2].header("authorization"), Some("QQBot token-1"));
        let complete: Value = serde_json::from_slice(&seen[2].body).unwrap();
        assert_eq!(complete["upload_id"], "upload-1");
        assert_eq!(complete["md5"], hex_digest(Md5::digest(b"abc")));
    }
}
