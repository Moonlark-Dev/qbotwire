use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::models::{now_iso, Credentials, SavedEndpoint, Settings, StoredConfig};

pub struct Store {
    path: PathBuf,
    data: Mutex<StoredConfig>,
}

impl Store {
    pub fn open(dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(dir)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o700));
        }
        let path = dir.join("config.json");
        let data = match fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<StoredConfig>(&text) {
                Ok(config) => config.normalized(),
                Err(error) => {
                    eprintln!("[qbotwire] config.json 解析失败，已备份并重置：{error}");
                    let _ = fs::rename(&path, path.with_extension("json.corrupt"));
                    StoredConfig::default()
                }
            },
            Err(_) => StoredConfig::default(),
        };
        let store = Self {
            path,
            data: Mutex::new(data),
        };
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn lock(&self) -> MutexGuard<'_, StoredConfig> {
        self.data
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn config(&self) -> StoredConfig {
        self.lock().clone()
    }

    pub fn credentials(&self) -> Option<Credentials> {
        self.lock().credentials.clone()
    }

    pub fn settings(&self) -> Settings {
        self.lock().settings.clone()
    }

    pub fn saved_endpoints(&self) -> Vec<SavedEndpoint> {
        self.lock().saved_endpoints.clone()
    }

    pub fn set_credentials(&self, credentials: Credentials) -> AppResult<StoredConfig> {
        credentials.validate()?;
        let mut data = self.lock();
        data.credentials = Some(credentials);
        write_json(&self.path, &*data)?;
        Ok(data.clone())
    }

    pub fn clear_credentials(&self) -> AppResult<StoredConfig> {
        let mut data = self.lock();
        data.credentials = None;
        write_json(&self.path, &*data)?;
        Ok(data.clone())
    }

    pub fn update_settings(&self, settings: Settings) -> AppResult<StoredConfig> {
        let mut data = self.lock();
        data.settings = settings.normalized();
        write_json(&self.path, &*data)?;
        Ok(data.clone())
    }

    pub fn upsert_endpoint(&self, endpoint: SavedEndpoint) -> AppResult<Vec<SavedEndpoint>> {
        if endpoint.path.trim().is_empty() {
            return Err(AppError::Config("保存的接口路径不能为空".into()));
        }
        let mut data = self.lock();
        let mut endpoint = endpoint;
        if endpoint.id.trim().is_empty() {
            endpoint.id = new_id("saved");
        }
        if endpoint.name.trim().is_empty() {
            endpoint.name = format!("{} {}", endpoint.method.to_uppercase(), endpoint.path);
        }
        let now = now_iso();
        if let Some(existing) = data
            .saved_endpoints
            .iter_mut()
            .find(|item| item.id == endpoint.id)
        {
            endpoint.created_at = existing.created_at.clone();
            endpoint.use_count = existing.use_count.saturating_add(1);
            endpoint.last_used_at = Some(now);
            *existing = endpoint;
        } else {
            endpoint.created_at = now.clone();
            endpoint.last_used_at = Some(now);
            endpoint.use_count = endpoint.use_count.max(1);
            data.saved_endpoints.insert(0, endpoint);
        }
        let output = data.saved_endpoints.clone();
        write_json(&self.path, &*data)?;
        Ok(output)
    }

    pub fn delete_endpoint(&self, id: &str) -> AppResult<Vec<SavedEndpoint>> {
        let mut data = self.lock();
        data.saved_endpoints.retain(|item| item.id != id);
        let output = data.saved_endpoints.clone();
        write_json(&self.path, &*data)?;
        Ok(output)
    }
}

pub fn new_id(prefix: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos:x}")
}

pub(crate) fn write_json<T: Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)?;
    fs::write(&tmp, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::QueryParam;

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "qbotwire-test-{label}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn credentials() -> Credentials {
        Credentials {
            app_id: "123456789".into(),
            client_secret: "secret-123".into(),
            environment: "production".into(),
            base_url: None,
            token_url: None,
            intents: 1 << 25,
        }
    }

    #[test]
    fn persists_credentials_across_reopen() {
        let dir = temp_dir("store-credentials");
        {
            let store = Store::open(&dir).unwrap();
            assert!(store.credentials().is_none());
            store.set_credentials(credentials()).unwrap();
        }
        let store = Store::open(&dir).unwrap();
        let loaded = store.credentials().unwrap();
        assert_eq!(loaded.app_id, "123456789");
        assert_eq!(loaded.client_secret, "secret-123");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalizes_settings_bounds() {
        let dir = temp_dir("store-settings");
        let store = Store::open(&dir).unwrap();
        let config = store
            .update_settings(Settings {
                auto_save_on_success: true,
                event_limit: 1,
            })
            .unwrap();
        assert_eq!(config.settings.event_limit, 50);
        let config = store
            .update_settings(Settings {
                auto_save_on_success: false,
                event_limit: 99_999,
            })
            .unwrap();
        assert_eq!(config.settings.event_limit, 5_000);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn upsert_keeps_created_at_and_increments_use_count() {
        let dir = temp_dir("store-endpoints");
        let store = Store::open(&dir).unwrap();
        let endpoint = SavedEndpoint {
            id: "saved-1".into(),
            name: "发送群消息".into(),
            method: "POST".into(),
            path: "/v2/groups/{group_openid}/messages".into(),
            query: vec![QueryParam {
                key: "limit".into(),
                value: "1".into(),
                enabled: true,
            }],
            body: "{}".into(),
            created_at: String::new(),
            last_used_at: None,
            use_count: 0,
        };
        let saved = store.upsert_endpoint(endpoint).unwrap();
        assert_eq!(saved.len(), 1);
        let created_at = saved[0].created_at.clone();
        assert_eq!(saved[0].use_count, 1);
        assert!(!created_at.is_empty());

        let updated = store
            .upsert_endpoint(SavedEndpoint {
                id: "saved-1".into(),
                name: "改名后的接口".into(),
                ..saved[0].clone()
            })
            .unwrap();
        assert_eq!(updated.len(), 1);
        assert_eq!(updated[0].name, "改名后的接口");
        assert_eq!(updated[0].created_at, created_at);
        assert_eq!(updated[0].use_count, 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_invalid_credentials() {
        let dir = temp_dir("store-invalid");
        let store = Store::open(&dir).unwrap();
        let mut bad = credentials();
        bad.app_id = "abc".into();
        assert!(store.set_credentials(bad).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
