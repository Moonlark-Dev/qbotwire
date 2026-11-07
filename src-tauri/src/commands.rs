use tauri::State;

use crate::models::{
    ApiRequest, ApiResponse, Bootstrap, CacheSnapshot, ConnectionStatus, Credentials, GroupEntry,
    LogoutOptions, SavedEndpoint, Settings, StoredConfig,
};
use crate::Core;

#[tauri::command]
pub fn bootstrap(core: State<'_, Core>) -> Bootstrap {
    core.bootstrap()
}

#[tauri::command]
pub async fn login(
    core: State<'_, Core>,
    credentials: Credentials,
) -> Result<ConnectionStatus, String> {
    let core = core.inner().clone();
    core.login(credentials)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn logout(core: State<'_, Core>, options: Option<LogoutOptions>) -> Result<(), String> {
    let clear = options
        .map(|options| options.clear_credentials)
        .unwrap_or(false);
    core.logout(clear).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_credentials(
    core: State<'_, Core>,
    credentials: Credentials,
) -> Result<StoredConfig, String> {
    core.save_credentials(credentials)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_settings(core: State<'_, Core>, settings: Settings) -> Result<StoredConfig, String> {
    core.update_settings(settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_status(core: State<'_, Core>) -> ConnectionStatus {
    core.gateway_status()
}

#[tauri::command]
pub async fn send_request(
    core: State<'_, Core>,
    request: ApiRequest,
) -> Result<ApiResponse, String> {
    let core = core.inner().clone();
    crate::api::send_request(&core, request)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_endpoint(
    core: State<'_, Core>,
    endpoint: SavedEndpoint,
) -> Result<Vec<SavedEndpoint>, String> {
    core.store
        .upsert_endpoint(endpoint)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_endpoint(core: State<'_, Core>, id: String) -> Result<Vec<SavedEndpoint>, String> {
    core.store
        .delete_endpoint(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_cache(core: State<'_, Core>) -> CacheSnapshot {
    core.cache.snapshot()
}

#[tauri::command]
pub fn clear_cache(core: State<'_, Core>, kind: Option<String>) -> Result<CacheSnapshot, String> {
    let snapshot = core
        .cache
        .clear(kind.as_deref())
        .map_err(|error| error.to_string())?;
    core.emit_cache(snapshot.clone());
    Ok(snapshot)
}

#[tauri::command]
pub fn rename_cache_entry(
    core: State<'_, Core>,
    kind: String,
    openid: String,
    name: String,
) -> Result<CacheSnapshot, String> {
    let snapshot = core
        .cache
        .rename(&kind, &openid, &name)
        .map_err(|error| error.to_string())?;
    core.emit_cache(snapshot.clone());
    Ok(snapshot)
}

#[tauri::command]
pub fn clear_events(core: State<'_, Core>) {
    core.clear_events();
}

#[tauri::command]
pub async fn refresh_group(
    core: State<'_, Core>,
    group_openid: String,
) -> Result<Option<GroupEntry>, String> {
    let core = core.inner().clone();
    core.refresh_group(&group_openid)
        .await
        .map_err(|error| error.to_string())
}
