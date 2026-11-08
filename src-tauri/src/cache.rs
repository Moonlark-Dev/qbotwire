use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde_json::Value;

use crate::error::AppResult;
use crate::models::{now_iso, CacheData, CacheSnapshot, GroupEntry, UserEntry};
use crate::store::write_json;

pub struct CacheStore {
    path: PathBuf,
    data: Mutex<CacheData>,
}

impl CacheStore {
    pub fn open(dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join("cache.json");
        let data = match fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<CacheData>(&text) {
                Ok(value) => value,
                Err(error) => {
                    eprintln!("[qbotwire] cache.json 解析失败，已备份并重置：{error}");
                    let _ = fs::rename(&path, path.with_extension("json.corrupt"));
                    CacheData::default()
                }
            },
            Err(_) => CacheData::default(),
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    fn lock(&self) -> MutexGuard<'_, CacheData> {
        self.data
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn snapshot(&self) -> CacheSnapshot {
        let data = self.lock();
        snapshot_of(&data)
    }

    pub fn group(&self, openid: &str) -> Option<GroupEntry> {
        self.lock().groups.get(openid).cloned()
    }

    pub fn needs_group_info(&self, openid: &str) -> bool {
        self.lock()
            .groups
            .get(openid)
            .map(|group| group.info_fetched_at.is_none())
            .unwrap_or(false)
    }

    /// Ingest one gateway dispatch event. Returns true when a cache entry changed.
    pub fn ingest_event(&self, event_type: &str, data: &Value) -> AppResult<bool> {
        let now = now_iso();
        let mut store = self.lock();
        let mut changed = false;

        let message_event = matches!(
            event_type,
            "GROUP_AT_MESSAGE_CREATE"
                | "GROUP_MESSAGE_CREATE"
                | "C2C_MESSAGE_CREATE"
                | "C2C_MSG_RECEIVE"
                | "MESSAGE_CREATE"
                | "AT_MESSAGE_CREATE"
                | "DIRECT_MESSAGE_CREATE"
        );

        match event_type {
            "GROUP_AT_MESSAGE_CREATE" | "GROUP_MESSAGE_CREATE" => {
                if let Some(group_openid) = get_str(data, "group_openid") {
                    let name = get_str(data, "group_name");
                    let avatar = get_str(data, "group_avatar").or_else(|| get_str(data, "avatar"));
                    changed |= upsert_group(
                        &mut store,
                        &group_openid,
                        name,
                        avatar,
                        None,
                        event_type,
                        &now,
                        message_event,
                    );
                }
                let author = data.get("author");
                let openid = author
                    .and_then(|value| get_str(value, "member_openid"))
                    .or_else(|| author.and_then(|value| get_str(value, "id")));
                if let Some(openid) = openid {
                    changed |= upsert_user(
                        &mut store,
                        &openid,
                        author.and_then(|value| get_str(value, "username")),
                        author.and_then(|value| get_str(value, "avatar")),
                        author.and_then(|value| get_str(value, "union_openid")),
                        event_type,
                        &now,
                        message_event,
                    );
                }
            }
            "C2C_MESSAGE_CREATE" | "C2C_MSG_RECEIVE" => {
                let author = data.get("author");
                let openid = author
                    .and_then(|value| get_str(value, "user_openid"))
                    .or_else(|| author.and_then(|value| get_str(value, "id")));
                if let Some(openid) = openid {
                    changed |= upsert_user(
                        &mut store,
                        &openid,
                        author.and_then(|value| get_str(value, "username")),
                        author.and_then(|value| get_str(value, "avatar")),
                        author.and_then(|value| get_str(value, "union_openid")),
                        event_type,
                        &now,
                        message_event,
                    );
                }
            }
            "MESSAGE_CREATE" | "AT_MESSAGE_CREATE" | "DIRECT_MESSAGE_CREATE" => {
                let author = data.get("author");
                let openid = author.and_then(|value| get_str(value, "id"));
                if let Some(openid) = openid {
                    changed |= upsert_user(
                        &mut store,
                        &openid,
                        author.and_then(|value| get_str(value, "username")),
                        author.and_then(|value| get_str(value, "avatar")),
                        author.and_then(|value| get_str(value, "union_openid")),
                        event_type,
                        &now,
                        message_event,
                    );
                }
            }
            "FRIEND_ADD" | "FRIEND_DEL" => {
                if let Some(openid) = get_str(data, "openid") {
                    changed |= upsert_user(
                        &mut store,
                        &openid,
                        get_str(data, "nickname"),
                        get_str(data, "avatar"),
                        get_str(data, "union_openid"),
                        event_type,
                        &now,
                        false,
                    );
                }
            }
            "GROUP_ADD_ROBOT" | "GROUP_DEL_ROBOT" => {
                if let Some(group_openid) = get_str(data, "group_openid") {
                    changed |= upsert_group(
                        &mut store,
                        &group_openid,
                        get_str(data, "group_name"),
                        get_str(data, "group_avatar"),
                        None,
                        event_type,
                        &now,
                        false,
                    );
                }
            }
            _ => {}
        }

        if changed {
            write_json(&self.path, &*store)?;
        }
        Ok(changed)
    }

    pub fn update_group_info(
        &self,
        openid: &str,
        name: Option<String>,
        member_count: Option<i64>,
    ) -> AppResult<Option<GroupEntry>> {
        let mut store = self.lock();
        let Some(group) = store.groups.get_mut(openid) else {
            return Ok(None);
        };
        if let Some(name) = name.filter(|value| !value.trim().is_empty()) {
            group.name = Some(name);
        }
        if let Some(count) = member_count {
            group.member_count = Some(count);
        }
        group.info_fetched_at = Some(now_iso());
        let updated = group.clone();
        write_json(&self.path, &*store)?;
        Ok(Some(updated))
    }

    pub fn rename(&self, kind: &str, openid: &str, name: &str) -> AppResult<CacheSnapshot> {
        let mut store = self.lock();
        let value = name.trim();
        if kind == "group" {
            if let Some(group) = store.groups.get_mut(openid) {
                group.name = if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                };
            }
        } else if let Some(user) = store.users.get_mut(openid) {
            user.name = if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            };
        }
        let snapshot = snapshot_of(&store);
        write_json(&self.path, &*store)?;
        Ok(snapshot)
    }

    pub fn clear(&self, kind: Option<&str>) -> AppResult<CacheSnapshot> {
        let mut store = self.lock();
        match kind {
            Some("groups") => store.groups.clear(),
            Some("users") => store.users.clear(),
            Some("group") => store.groups.clear(),
            Some("user") => store.users.clear(),
            _ => {
                store.groups.clear();
                store.users.clear();
            }
        }
        let snapshot = snapshot_of(&store);
        write_json(&self.path, &*store)?;
        Ok(snapshot)
    }
}

fn snapshot_of(data: &CacheData) -> CacheSnapshot {
    let mut groups: Vec<GroupEntry> = data.groups.values().cloned().collect();
    groups.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    let mut users: Vec<UserEntry> = data.users.values().cloned().collect();
    users.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    CacheSnapshot { groups, users }
}

fn get_str(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

#[allow(clippy::too_many_arguments)]
fn upsert_group(
    data: &mut CacheData,
    openid: &str,
    name: Option<String>,
    avatar: Option<String>,
    member_count: Option<i64>,
    source: &str,
    now: &str,
    increment_message: bool,
) -> bool {
    let entry = data
        .groups
        .entry(openid.to_string())
        .or_insert_with(|| GroupEntry {
            openid: openid.to_string(),
            name: None,
            avatar: None,
            member_count: None,
            source: Some(source.to_string()),
            first_seen: now.to_string(),
            last_seen: now.to_string(),
            message_count: 0,
            info_fetched_at: None,
        });
    let mut changed = true;
    if let Some(name) = name.filter(|value| !value.trim().is_empty()) {
        if entry.name.as_deref() != Some(name.as_str()) {
            entry.name = Some(name);
        }
    }
    if let Some(avatar) = avatar.filter(|value| !value.trim().is_empty()) {
        if entry.avatar.as_deref() != Some(avatar.as_str()) {
            entry.avatar = Some(avatar);
        }
    }
    if let Some(count) = member_count {
        entry.member_count = Some(count);
    }
    if entry.source.as_deref() != Some(source) {
        entry.source = Some(source.to_string());
    }
    entry.last_seen = now.to_string();
    if increment_message {
        entry.message_count = entry.message_count.saturating_add(1);
    }
    if entry.first_seen.is_empty() {
        entry.first_seen = now.to_string();
    }
    // The caller only persists when something might have changed; avoiding a
    // deep comparison here keeps ingestion cheap.
    changed |= true;
    changed
}

#[allow(clippy::too_many_arguments)]
fn upsert_user(
    data: &mut CacheData,
    openid: &str,
    name: Option<String>,
    avatar: Option<String>,
    union_openid: Option<String>,
    source: &str,
    now: &str,
    increment_message: bool,
) -> bool {
    let entry = data
        .users
        .entry(openid.to_string())
        .or_insert_with(|| UserEntry {
            openid: openid.to_string(),
            name: None,
            avatar: None,
            union_openid: None,
            source: Some(source.to_string()),
            first_seen: now.to_string(),
            last_seen: now.to_string(),
            message_count: 0,
        });
    if let Some(name) = name.filter(|value| !value.trim().is_empty()) {
        if entry.name.as_deref() != Some(name.as_str()) {
            entry.name = Some(name);
        }
    }
    if let Some(avatar) = avatar.filter(|value| !value.trim().is_empty()) {
        if entry.avatar.as_deref() != Some(avatar.as_str()) {
            entry.avatar = Some(avatar);
        }
    }
    if let Some(union_openid) = union_openid.filter(|value| !value.trim().is_empty()) {
        entry.union_openid = Some(union_openid);
    }
    if entry.source.as_deref() != Some(source) {
        entry.source = Some(source.to_string());
    }
    entry.last_seen = now.to_string();
    if increment_message {
        entry.message_count = entry.message_count.saturating_add(1);
    }
    if entry.first_seen.is_empty() {
        entry.first_seen = now.to_string();
    }
    true
}

/// Public helper used by the gateway to find the group of an event.
pub fn group_openid_of(data: &Value) -> Option<String> {
    get_str(data, "group_openid")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "qbotwire-cache-{label}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn ingests_group_messages_into_groups_and_users() {
        let dir = temp_dir("group");
        let cache = CacheStore::open(&dir).unwrap();
        let changed = cache
            .ingest_event(
                "GROUP_AT_MESSAGE_CREATE",
                &json!({
                    "id": "m1",
                    "group_openid": "g-1",
                    "group_name": "测试群",
                    "author": {
                        "member_openid": "u-1",
                        "union_openid": "union-1"
                    }
                }),
            )
            .unwrap();
        assert!(changed);
        let snapshot = cache.snapshot();
        assert_eq!(snapshot.groups.len(), 1);
        assert_eq!(snapshot.groups[0].openid, "g-1");
        assert_eq!(snapshot.groups[0].name.as_deref(), Some("测试群"));
        assert_eq!(snapshot.groups[0].message_count, 1);
        assert!(cache.needs_group_info("g-1"));
        assert_eq!(snapshot.users.len(), 1);
        assert_eq!(snapshot.users[0].openid, "u-1");
        assert_eq!(snapshot.users[0].union_openid.as_deref(), Some("union-1"));
        assert_eq!(snapshot.users[0].message_count, 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ingests_plain_group_messages_into_groups_and_users() {
        let dir = temp_dir("group-plain");
        let cache = CacheStore::open(&dir).unwrap();
        let changed = cache
            .ingest_event(
                "GROUP_MESSAGE_CREATE",
                &json!({
                    "author": {
                        "bot": false,
                        "id": "u-10",
                        "member_openid": "u-10",
                        "member_role": "admin",
                        "union_openid": "union-10",
                        "username": "SunaōkamiNya"
                    },
                    "content": "test",
                    "group_id": "g-10",
                    "group_openid": "g-10",
                    "id": "ROBOT1.0_msg",
                    "message_scene": {
                        "ext": ["msg_idx=REFIDX_x", "auth_token=y"],
                        "source": "default"
                    },
                    "message_type": 0,
                    "timestamp": "2026-11-08T08:20:43+08:00"
                }),
            )
            .unwrap();
        assert!(changed);
        let snapshot = cache.snapshot();
        assert_eq!(snapshot.groups.len(), 1);
        assert_eq!(snapshot.groups[0].openid, "g-10");
        assert_eq!(snapshot.groups[0].message_count, 1);
        assert_eq!(
            snapshot.groups[0].source.as_deref(),
            Some("GROUP_MESSAGE_CREATE")
        );
        assert!(cache.needs_group_info("g-10"));
        assert_eq!(snapshot.users.len(), 1);
        assert_eq!(snapshot.users[0].openid, "u-10");
        assert_eq!(snapshot.users[0].name.as_deref(), Some("SunaōkamiNya"));
        assert_eq!(snapshot.users[0].union_openid.as_deref(), Some("union-10"));
        assert_eq!(snapshot.users[0].message_count, 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ingests_c2c_messages() {
        let dir = temp_dir("c2c");
        let cache = CacheStore::open(&dir).unwrap();
        cache
            .ingest_event(
                "C2C_MESSAGE_CREATE",
                &json!({
                    "author": { "user_openid": "u-2", "union_openid": "union-2" }
                }),
            )
            .unwrap();
        let snapshot = cache.snapshot();
        assert!(snapshot.groups.is_empty());
        assert_eq!(snapshot.users.len(), 1);
        assert_eq!(snapshot.users[0].message_count, 1);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn updates_group_info_and_rename() {
        let dir = temp_dir("info");
        let cache = CacheStore::open(&dir).unwrap();
        cache
            .ingest_event("GROUP_ADD_ROBOT", &json!({ "group_openid": "g-2" }))
            .unwrap();
        let updated = cache
            .update_group_info("g-2", Some("新名字".into()), Some(42))
            .unwrap()
            .unwrap();
        assert_eq!(updated.name.as_deref(), Some("新名字"));
        assert_eq!(updated.member_count, Some(42));
        assert!(!cache.needs_group_info("g-2"));
        let snapshot = cache.rename("group", "g-2", "手工名称").unwrap();
        assert_eq!(snapshot.groups[0].name.as_deref(), Some("手工名称"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clears_selected_cache_scopes() {
        let dir = temp_dir("clear");
        let cache = CacheStore::open(&dir).unwrap();
        cache
            .ingest_event(
                "GROUP_AT_MESSAGE_CREATE",
                &json!({
                    "group_openid": "g-3",
                    "author": { "member_openid": "u-3" }
                }),
            )
            .unwrap();
        let cleared = cache.clear(Some("users")).unwrap();
        assert_eq!(cleared.groups.len(), 1);
        assert!(cleared.users.is_empty());
        let cleared = cache.clear(None).unwrap();
        assert!(cleared.groups.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn persists_cache_across_reopen() {
        let dir = temp_dir("persist");
        {
            let cache = CacheStore::open(&dir).unwrap();
            cache
                .ingest_event(
                    "FRIEND_ADD",
                    &json!({ "openid": "u-9", "nickname": "好友" }),
                )
                .unwrap();
        }
        let cache = CacheStore::open(&dir).unwrap();
        let snapshot = cache.snapshot();
        assert_eq!(snapshot.users[0].openid, "u-9");
        assert_eq!(snapshot.users[0].name.as_deref(), Some("好友"));
        let _ = fs::remove_dir_all(&dir);
    }
}
