use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::watch;
use tokio::time::interval_at;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::cache;
use crate::error::{AppError, AppResult};
use crate::models::{now_iso, BotInfo, ConnectionStatus, GatewayEvent, WsPayload};
use crate::store::new_id;
use crate::{api, Core};

enum Flow {
    Cancelled,
    Closed(Option<String>),
}

#[derive(Debug, Clone, Default)]
struct Session {
    id: String,
    seq: i64,
}

pub async fn run(core: Core, mut cancel: watch::Receiver<bool>, generation: u64) {
    let mut session: Option<Session> = None;
    let mut backoff = 1u64;

    loop {
        if *cancel.borrow() {
            break;
        }
        let Some(credentials) = core.store.credentials() else {
            break;
        };

        let token = match core
            .auth
            .access_token(&core.http, &credentials, false)
            .await
        {
            Ok(token) => token,
            Err(error) => {
                let message = error.to_string();
                core.patch_status_guarded(generation, true, |status| {
                    status.state = "error".to_string();
                    status.error = Some(message.clone());
                });
                if !wait(&mut cancel, backoff).await {
                    break;
                }
                backoff = (backoff * 2).min(30);
                continue;
            }
        };

        let gateway_url = match api::fetch_gateway_url(&core, &credentials, &token).await {
            Ok(url) => url,
            Err(error) => {
                let message = error.to_string();
                core.patch_status_guarded(generation, true, |status| {
                    status.state = "error".to_string();
                    status.error = Some(message.clone());
                });
                if !wait(&mut cancel, backoff).await {
                    break;
                }
                backoff = (backoff * 2).min(30);
                continue;
            }
        };

        core.patch_status_guarded(generation, true, |status| {
            status.state = "connecting".to_string();
            status.gateway_url = Some(gateway_url.clone());
            status.error = None;
        });

        match connect_once(
            &core,
            &credentials,
            &token,
            &gateway_url,
            &mut session,
            &mut cancel,
            generation,
            &mut backoff,
        )
        .await
        {
            Ok(Flow::Cancelled) => break,
            Ok(Flow::Closed(reason)) => {
                backoff = 1;
                let message = reason.unwrap_or_else(|| "网关连接已断开".to_string());
                core.patch_status_guarded(generation, true, |status| {
                    status.state = "reconnecting".to_string();
                    status.error = Some(message.clone());
                    status.connected_at = None;
                });
                if !wait(&mut cancel, 1).await {
                    break;
                }
            }
            Err(error) => {
                let message = error.to_string();
                eprintln!("[qbotwire] gateway error: {message}");
                core.auth.clear();
                core.patch_status_guarded(generation, true, |status| {
                    status.state = "error".to_string();
                    status.error = Some(message.clone());
                    status.connected_at = None;
                });
                if !wait(&mut cancel, backoff).await {
                    break;
                }
                backoff = (backoff * 2).min(30);
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn connect_once(
    core: &Core,
    credentials: &crate::models::Credentials,
    token: &str,
    gateway_url: &str,
    session: &mut Option<Session>,
    cancel: &mut watch::Receiver<bool>,
    generation: u64,
    backoff: &mut u64,
) -> AppResult<Flow> {
    let connector = connect_async(gateway_url);
    let (mut socket, _response) = tokio::time::timeout(Duration::from_secs(20), connector)
        .await
        .map_err(|_| AppError::Ws("连接网关超时".into()))??;

    let hello_text =
        match tokio::time::timeout(Duration::from_secs(20), next_json(&mut socket)).await {
            Ok(Ok(Some(text))) => text,
            Ok(Ok(None)) => return Ok(Flow::Closed(Some("网关在 Hello 前关闭".into()))),
            Ok(Err(error)) => return Err(error),
            Err(_) => return Err(AppError::Ws("等待网关 Hello 超时".into())),
        };
    let hello = WsPayload::parse(&hello_text);
    if hello.op != 10 {
        return Err(AppError::Ws(format!(
            "网关握手失败：期望 op 10，收到 op {}",
            hello.op
        )));
    }
    let interval_ms = hello
        .d
        .get("heartbeat_interval")
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_i64().map(|number| number.max(0) as u64))
        })
        .unwrap_or(41_250)
        .clamp(1_000, 300_000);
    core.patch_status_guarded(generation, true, |status| {
        status.heartbeat_interval_ms = Some(interval_ms);
    });

    let resume = session
        .as_ref()
        .filter(|value| !value.id.is_empty())
        .map(|value| (value.id.clone(), value.seq));
    let identify = if let Some((session_id, seq)) = resume {
        json!({
            "op": 6,
            "d": {
                "token": format!("QQBot {token}"),
                "session_id": session_id,
                "seq": seq,
            }
        })
    } else {
        json!({
            "op": 2,
            "d": {
                "token": format!("QQBot {token}"),
                "intents": credentials.intents,
                "shard": [0, 1],
                "properties": {},
            }
        })
    };
    socket
        .send(Message::Text(identify.to_string().into()))
        .await?;

    let mut last_seq = session.as_ref().map(|value| value.seq);
    let mut heartbeat_sent_at: Option<Instant> = None;
    let mut ready = false;
    let ready_deadline = tokio::time::sleep(Duration::from_secs(35));
    tokio::pin!(ready_deadline);
    let mut heartbeat = interval_at(
        tokio::time::Instant::now() + Duration::from_millis(interval_ms),
        Duration::from_millis(interval_ms),
    );

    loop {
        tokio::select! {
            changed = cancel.changed() => {
                let stop = changed.is_err() || *cancel.borrow();
                if stop {
                    let _ = socket.send(Message::Close(None)).await;
                    return Ok(Flow::Cancelled);
                }
            }
            _ = heartbeat.tick() => {
                let payload = json!({ "op": 1, "d": last_seq });
                socket.send(Message::Text(payload.to_string().into())).await?;
                heartbeat_sent_at = Some(Instant::now());
            }
            _ = &mut ready_deadline, if !ready => {
                return Err(AppError::Ws("网关未在 35 秒内就绪（没有收到 READY）".into()));
            }
            incoming = socket.next() => {
                let Some(message) = incoming else {
                    return Ok(Flow::Closed(Some("网关连接已关闭".into())));
                };
                let message = message?;
                let text = match message {
                    Message::Text(text) => text.as_str().to_string(),
                    Message::Binary(bytes) => match decode_zlib(&bytes) {
                        Some(text) => text,
                        None => continue,
                    },
                    Message::Ping(payload) => {
                        let _ = socket.send(Message::Pong(payload)).await;
                        continue;
                    }
                    Message::Close(frame) => {
                        let mut detail = format!("网关关闭：{frame:?}");
                        if let Some(frame) = &frame {
                            let code = u16::from(frame.code);
                            if code == 4004 {
                                core.auth.clear();
                                detail = "网关认证失败（4004），将重新获取 AccessToken".to_string();
                            }
                            if matches!(code, 4006 | 4009) {
                                *session = None;
                            }
                        }
                        return Ok(Flow::Closed(Some(detail)));
                    }
                    _ => continue,
                };
                let value: Value = match serde_json::from_str(&text) {
                    Ok(value) => value,
                    Err(error) => {
                        eprintln!("[qbotwire] invalid gateway JSON: {error}");
                        continue;
                    }
                };
                let payload = WsPayload::parse(&value);
                if let Some(seq) = payload.s {
                    last_seq = Some(seq);
                    if let Some(session) = session.as_mut() {
                        session.seq = seq;
                    }
                }
                match payload.op {
                    1 => {
                        let heartbeat_payload = json!({ "op": 1, "d": last_seq });
                        socket.send(Message::Text(heartbeat_payload.to_string().into())).await?;
                        heartbeat_sent_at = Some(Instant::now());
                    }
                    7 => {
                        return Ok(Flow::Closed(Some("服务端要求重连".into())));
                    }
                    9 => {
                        *session = None;
                        return Ok(Flow::Closed(Some("网关会话失效".into())));
                    }
                    11 => {
                        if let Some(sent_at) = heartbeat_sent_at.take() {
                            let latency = sent_at.elapsed().as_millis() as u64;
                            core.patch_status_guarded(generation, true, |status| {
                                status.latency_ms = Some(latency);
                            });
                        }
                    }
                    0 => {
                        let Some(event_type) = payload.t.clone() else {
                            continue;
                        };
                        match event_type.as_str() {
                            "READY" => {
                                ready = true;
                                *backoff = 1;
                                let session_id = payload
                                    .d
                                    .get("session_id")
                                    .and_then(Value::as_str)
                                    .unwrap_or_default()
                                    .to_string();
                                if session_id.is_empty() {
                                    return Err(AppError::Ws("READY 中没有 session_id".into()));
                                }
                                *session = Some(Session {
                                    id: session_id,
                                    seq: last_seq.unwrap_or(0),
                                });
                                let bot = payload
                                    .d
                                    .get("user")
                                    .and_then(parse_bot)
                                    .or_else(|| core.gateway_status().bot);
                                let status = ConnectionStatus {
                                    state: "connected".to_string(),
                                    bot,
                                    session_id: Some(
                                        session.as_ref().map(|value| value.id.clone()).unwrap_or_default(),
                                    ),
                                    last_seq,
                                    error: None,
                                    gateway_url: core.gateway_status().gateway_url,
                                    intents: Some(credentials.intents),
                                    heartbeat_interval_ms: Some(interval_ms),
                                    latency_ms: core.gateway_status().latency_ms,
                                    connected_at: Some(now_iso()),
                                };
                                core.set_status_guarded(generation, status);
                            }
                            "RESUMED" => {
                                ready = true;
                                *backoff = 1;
                                core.patch_status_guarded(generation, true, |status| {
                                    status.state = "connected".to_string();
                                    status.error = None;
                                    status.connected_at = Some(now_iso());
                                    status.last_seq = last_seq;
                                });
                            }
                            _ => {
                                let event = GatewayEvent {
                                    id: payload.id.unwrap_or_else(|| new_id("evt")),
                                    seq: payload.s,
                                    event_type: event_type.clone(),
                                    received_at: now_iso(),
                                    data: payload.d.clone(),
                                };
                                if let Err(error) = core.cache.ingest_event(&event_type, &event.data) {
                                    eprintln!("[qbotwire] cache ingest failed: {error}");
                                } else {
                                    core.emit_cache(core.cache.snapshot());
                                }
                                core.push_event(event);
                                if let Some(openid) = cache::group_openid_of(&payload.d) {
                                    core.maybe_enrich_group(openid);
                                }
                                core.patch_status_guarded(generation, false, |status| {
                                    status.last_seq = last_seq;
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

fn parse_bot(value: &Value) -> Option<BotInfo> {
    let id = value.get("id").and_then(|value| {
        value
            .as_str()
            .map(ToString::to_string)
            .or_else(|| value.as_i64().map(|number| number.to_string()))
    })?;
    Some(BotInfo {
        id,
        username: value
            .get("username")
            .and_then(Value::as_str)
            .unwrap_or("QQ Bot")
            .to_string(),
        avatar: value
            .get("avatar")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .map(ToString::to_string),
    })
}

async fn next_json(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> AppResult<Option<Value>> {
    loop {
        match socket.next().await {
            Some(Ok(Message::Text(text))) => {
                let value = serde_json::from_str(text.as_str())
                    .map_err(|error| AppError::Ws(format!("网关 JSON 解析失败：{error}")))?;
                return Ok(Some(value));
            }
            Some(Ok(Message::Binary(bytes))) => {
                if let Some(text) = decode_zlib(&bytes) {
                    let value = serde_json::from_str(&text)
                        .map_err(|error| AppError::Ws(format!("网关 JSON 解析失败：{error}")))?;
                    return Ok(Some(value));
                }
            }
            Some(Ok(Message::Ping(payload))) => {
                socket.send(Message::Pong(payload)).await?;
            }
            Some(Ok(Message::Close(_))) | None => return Ok(None),
            Some(Ok(_)) => {}
            Some(Err(error)) => return Err(AppError::Ws(error.to_string())),
        }
    }
}

fn decode_zlib(bytes: &[u8]) -> Option<String> {
    use std::io::Read;
    let mut decoder = flate2::read::ZlibDecoder::new(bytes);
    let mut output = String::new();
    decoder.read_to_string(&mut output).ok()?;
    Some(output)
}

async fn wait(cancel: &mut watch::Receiver<bool>, seconds: u64) -> bool {
    tokio::select! {
        _ = tokio::time::sleep(Duration::from_secs(seconds)) => true,
        changed = cancel.changed() => {
            changed.is_err() || !*cancel.borrow()
        }
    }
}

// ---------------------------------------------------------------------------
// Connection controller (status, event buffer, cancellation)
// ---------------------------------------------------------------------------

pub struct GatewayController {
    status: std::sync::Mutex<ConnectionStatus>,
    events: std::sync::Mutex<std::collections::VecDeque<GatewayEvent>>,
    cancel: std::sync::Mutex<Option<watch::Sender<bool>>>,
    generation: std::sync::atomic::AtomicU64,
}

impl Default for GatewayController {
    fn default() -> Self {
        Self {
            status: std::sync::Mutex::new(ConnectionStatus::disconnected()),
            events: std::sync::Mutex::new(std::collections::VecDeque::new()),
            cancel: std::sync::Mutex::new(None),
            generation: std::sync::atomic::AtomicU64::new(0),
        }
    }
}

impl GatewayController {
    pub fn status(&self) -> ConnectionStatus {
        self.status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn set_status(&self, next: ConnectionStatus) {
        *self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = next;
    }

    pub fn set_status_guarded(
        &self,
        generation: u64,
        next: ConnectionStatus,
    ) -> Option<ConnectionStatus> {
        if self.generation.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return None;
        }
        self.set_status(next.clone());
        Some(next)
    }

    pub fn patch_status_guarded<F: FnOnce(&mut ConnectionStatus)>(
        &self,
        generation: u64,
        patch: F,
    ) -> Option<ConnectionStatus> {
        if self.generation.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return None;
        }
        let mut guard = self
            .status
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        patch(&mut guard);
        Some(guard.clone())
    }

    pub fn begin(&self) -> (u64, watch::Receiver<bool>) {
        let generation = self
            .generation
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            + 1;
        let (sender, receiver) = watch::channel(false);
        let mut guard = self
            .cancel
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(previous) = guard.take() {
            let _ = previous.send(true);
        }
        *guard = Some(sender);
        (generation, receiver)
    }

    pub fn cancel(&self) {
        self.generation
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let mut guard = self
            .cancel
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(sender) = guard.take() {
            let _ = sender.send(true);
        }
    }

    pub fn events(&self) -> Vec<GatewayEvent> {
        self.events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .cloned()
            .collect()
    }

    pub fn push_event(&self, event: GatewayEvent, limit: usize) {
        let mut guard = self
            .events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        guard.push_front(event);
        guard.truncate(limit.max(50));
    }

    pub fn clear_events(&self) {
        self.events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn decodes_zlib_gateway_frames() {
        let mut encoder =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        encoder
            .write_all(br#"{"op":10,"d":{"heartbeat_interval":41250}}"#)
            .unwrap();
        let compressed = encoder.finish().unwrap();
        assert_eq!(
            decode_zlib(&compressed).as_deref(),
            Some(r#"{"op":10,"d":{"heartbeat_interval":41250}}"#)
        );
    }

    #[test]
    fn returns_none_for_garbage_binary() {
        assert!(decode_zlib(b"\x01\x02not-zlib").is_none());
    }
}
