mod api;
mod auth;
mod cache;
mod commands;
mod error;
mod gateway;
mod models;
mod store;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::auth::AuthManager;
use crate::cache::CacheStore;
use crate::error::{AppError, AppResult};
use crate::gateway::GatewayController;
use crate::models::{
    Bootstrap, CacheSnapshot, ConnectionStatus, Credentials, GatewayEvent, GroupEntry, Settings,
    StoredConfig,
};
use crate::store::Store;

#[derive(Clone)]
pub struct Core {
    pub app: AppHandle,
    pub http: reqwest::Client,
    pub store: Arc<Store>,
    pub cache: Arc<CacheStore>,
    pub auth: Arc<AuthManager>,
    pub gateway: Arc<GatewayController>,
    enrich_attempted: Arc<Mutex<HashSet<String>>>,
}

impl Core {
    pub fn new(app: AppHandle, data_dir: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&data_dir)?;
        let store = Arc::new(Store::open(&data_dir)?);
        let cache = Arc::new(CacheStore::open(&data_dir)?);
        let http = reqwest::Client::builder()
            .user_agent(concat!("QBotWire/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self {
            app,
            http,
            store,
            cache,
            auth: Arc::new(AuthManager::new()),
            gateway: Arc::new(GatewayController::default()),
            enrich_attempted: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    pub fn bootstrap(&self) -> Bootstrap {
        Bootstrap {
            config: self.store.config(),
            status: self.gateway.status(),
            events: self.gateway.events(),
            cache: self.cache.snapshot(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    pub fn gateway_status(&self) -> ConnectionStatus {
        self.gateway.status()
    }

    pub fn set_status(&self, status: ConnectionStatus) {
        self.gateway.set_status(status.clone());
        let _ = self.app.emit("qbotwire:status", &status);
    }

    pub fn set_status_guarded(&self, generation: u64, status: ConnectionStatus) {
        if let Some(status) = self.gateway.set_status_guarded(generation, status) {
            let _ = self.app.emit("qbotwire:status", &status);
        }
    }

    pub fn patch_status_guarded<F: FnOnce(&mut ConnectionStatus)>(
        &self,
        generation: u64,
        emit: bool,
        patch: F,
    ) {
        if let Some(status) = self.gateway.patch_status_guarded(generation, patch) {
            if emit {
                let _ = self.app.emit("qbotwire:status", &status);
            }
        }
    }

    pub fn push_event(&self, event: GatewayEvent) {
        let limit = self.store.settings().event_limit;
        self.gateway.push_event(event.clone(), limit);
        let _ = self.app.emit("qbotwire:event", &event);
    }

    pub fn emit_cache(&self, snapshot: CacheSnapshot) {
        let _ = self.app.emit("qbotwire:cache", &snapshot);
    }

    pub async fn login(&self, credentials: Credentials) -> AppResult<ConnectionStatus> {
        credentials.validate()?;
        self.store.set_credentials(credentials.clone())?;
        self.auth.clear();
        self.enrich_attempted
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
        self.connect(credentials).await
    }

    pub async fn auto_connect(&self) {
        let Some(credentials) = self.store.credentials() else {
            return;
        };
        if let Err(error) = self.connect(credentials).await {
            eprintln!("[qbotwire] auto connect failed: {error}");
        }
    }

    async fn connect(&self, credentials: Credentials) -> AppResult<ConnectionStatus> {
        self.stop_gateway();
        self.set_status(ConnectionStatus::connecting());

        let token = match self
            .auth
            .access_token(&self.http, &credentials, false)
            .await
        {
            Ok(token) => token,
            Err(error) => {
                self.set_status(ConnectionStatus::error(error.to_string()));
                return Err(error);
            }
        };
        let bot = api::fetch_bot_info(self, &credentials, &token).await.ok();
        let status = ConnectionStatus {
            state: "connecting".to_string(),
            bot,
            intents: Some(credentials.intents),
            ..ConnectionStatus::default()
        };
        self.set_status(status.clone());
        self.start_gateway();
        Ok(status)
    }

    pub fn start_gateway(&self) {
        let (generation, receiver) = self.gateway.begin();
        let core = self.clone();
        tauri::async_runtime::spawn(async move {
            gateway::run(core, receiver, generation).await;
        });
    }

    pub fn stop_gateway(&self) {
        self.gateway.cancel();
        self.set_status(ConnectionStatus::disconnected());
    }

    pub fn logout(&self, clear_credentials: bool) -> AppResult<()> {
        self.stop_gateway();
        self.auth.clear();
        if clear_credentials {
            self.store.clear_credentials()?;
            let snapshot = self.cache.clear(None)?;
            self.gateway.clear_events();
            self.emit_cache(snapshot);
        }
        Ok(())
    }

    pub fn save_credentials(&self, credentials: Credentials) -> AppResult<StoredConfig> {
        credentials.validate()?;
        self.auth.clear();
        self.store.set_credentials(credentials)
    }

    pub fn update_settings(&self, settings: Settings) -> AppResult<StoredConfig> {
        self.store.update_settings(settings)
    }

    pub fn clear_events(&self) {
        self.gateway.clear_events();
    }

    pub fn maybe_enrich_group(&self, openid: String) {
        if !self.cache.needs_group_info(&openid) {
            return;
        }
        {
            let mut attempted = self
                .enrich_attempted
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if !attempted.insert(openid.clone()) {
                return;
            }
        }
        let core = self.clone();
        tauri::async_runtime::spawn(async move {
            let result: AppResult<crate::api::GroupInfo> = async {
                let credentials = core
                    .store
                    .credentials()
                    .ok_or_else(|| AppError::Config("还没有配置 Bot 凭据".into()))?;
                let token = core
                    .auth
                    .access_token(&core.http, &credentials, false)
                    .await?;
                api::fetch_group_info(&core, &credentials, &token, &openid).await
            }
            .await;
            match result {
                Ok(info) => {
                    match core
                        .cache
                        .update_group_info(&openid, info.name, info.member_count)
                    {
                        Ok(Some(_)) => core.emit_cache(core.cache.snapshot()),
                        Ok(None) => {}
                        Err(error) => eprintln!("[qbotwire] group info cache failed: {error}"),
                    }
                }
                Err(error) => {
                    eprintln!("[qbotwire] group info fetch failed: {error}");
                }
            }
        });
    }

    pub async fn refresh_group(&self, openid: &str) -> AppResult<Option<GroupEntry>> {
        let credentials = self
            .store
            .credentials()
            .ok_or_else(|| AppError::Config("还没有配置 Bot 凭据，请先在设置里填写".into()))?;
        let token = self
            .auth
            .access_token(&self.http, &credentials, false)
            .await?;
        let info = api::fetch_group_info(self, &credentials, &token, openid).await?;
        let updated = self
            .cache
            .update_group_info(openid, info.name, info.member_count)?;
        self.emit_cache(self.cache.snapshot());
        Ok(updated)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| AppError::Other(error.to_string()))?;
            let core = Core::new(app.handle().clone(), data_dir)?;
            let should_auto_connect = core.store.credentials().is_some();
            app.manage(core.clone());
            if should_auto_connect {
                let core = core.clone();
                tauri::async_runtime::spawn(async move {
                    core.auto_connect().await;
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::login,
            commands::logout,
            commands::save_credentials,
            commands::update_settings,
            commands::get_status,
            commands::send_request,
            commands::save_endpoint,
            commands::delete_endpoint,
            commands::get_cache,
            commands::clear_events,
            commands::clear_cache,
            commands::rename_cache_entry,
            commands::refresh_group,
        ])
        .run(tauri::generate_context!())
        .expect("error while running qbotwire");
}
