use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use crate::error::AppResult;
use crate::models::{MediaAsset, MediaStoreData};
use crate::store::write_json;

/// Keep the on-disk library bounded. The platform only allows 100 live images
/// per bot, but links from several bots may share this local cache.
const MAX_CACHED_ASSETS: usize = 500;

/// Local cache of `qqbot-media://` links.
///
/// The platform list endpoint only returns *currently valid* images, but links
/// are useful after they expire too (to see what was used and clean up), so
/// this cache is never pruned on sync: it is an append/upsert store.
pub struct MediaStore {
    path: PathBuf,
    data: Mutex<MediaStoreData>,
}

impl MediaStore {
    pub fn open(dir: &Path) -> AppResult<Self> {
        fs::create_dir_all(dir)?;
        let path = dir.join("media.json");
        let data = match fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<MediaStoreData>(&text) {
                Ok(value) => value,
                Err(error) => {
                    eprintln!("[qbotwire] media.json 解析失败，已备份并重置：{error}");
                    let _ = fs::rename(&path, path.with_extension("json.corrupt"));
                    MediaStoreData::default()
                }
            },
            Err(_) => MediaStoreData::default(),
        };
        Ok(Self {
            path,
            data: Mutex::new(data),
        })
    }

    fn lock(&self) -> MutexGuard<'_, MediaStoreData> {
        self.data
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn list(&self) -> Vec<MediaAsset> {
        snapshot_of(&self.lock())
    }

    /// Insert or replace assets by `image_id` and persist the result.
    pub fn upsert_many(&self, assets: Vec<MediaAsset>) -> AppResult<Vec<MediaAsset>> {
        let mut store = self.lock();
        for asset in assets {
            if asset.image_id.trim().is_empty() {
                continue;
            }
            match store
                .assets
                .iter_mut()
                .find(|existing| existing.image_id == asset.image_id)
            {
                Some(existing) => *existing = asset,
                None => store.assets.push(asset),
            }
        }
        let mut snapshot = snapshot_of(&store);
        snapshot.truncate(MAX_CACHED_ASSETS);
        store.assets = snapshot;
        write_json(&self.path, &*store)?;
        Ok(snapshot_of(&store))
    }

    pub fn remove(&self, image_id: &str) -> AppResult<Vec<MediaAsset>> {
        let mut store = self.lock();
        store.assets.retain(|asset| asset.image_id != image_id);
        let snapshot = snapshot_of(&store);
        write_json(&self.path, &*store)?;
        Ok(snapshot)
    }

    pub fn clear(&self) -> AppResult<Vec<MediaAsset>> {
        let mut store = self.lock();
        store.assets.clear();
        write_json(&self.path, &*store)?;
        Ok(Vec::new())
    }
}

fn snapshot_of(data: &MediaStoreData) -> Vec<MediaAsset> {
    let mut assets = data.assets.clone();
    // Newest first; newest uploads are the ones people insert most often.
    assets.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| a.image_id.cmp(&b.image_id))
    });
    assets
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "qbotwire-media-{label}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn asset(id: &str, created_at: i64) -> MediaAsset {
        MediaAsset {
            image_id: id.into(),
            url: format!("qqbot-media://image/v1/{id}"),
            file_name: format!("{id}.png"),
            content_type: "image/png".into(),
            size: 1024,
            width: Some(640),
            height: Some(480),
            thumbnail: None,
            app_id: Some("102030405".into()),
            created_at,
            expires_at: created_at + 7_776_000,
            source: "upload".into(),
        }
    }

    #[test]
    fn upserts_sorts_and_persists_assets() {
        let dir = temp_dir("persist");
        {
            let store = MediaStore::open(&dir).unwrap();
            store
                .upsert_many(vec![asset("old", 100), asset("new", 200)])
                .unwrap();
            let listed = store.upsert_many(vec![asset("new", 300)]).unwrap();
            assert_eq!(listed.len(), 2);
            assert_eq!(listed[0].image_id, "new");
            assert_eq!(listed[0].created_at, 300);
        }
        let reopened = MediaStore::open(&dir).unwrap();
        let assets = reopened.list();
        assert_eq!(assets.len(), 2);
        assert_eq!(assets[0].image_id, "new");
        assert_eq!(assets[0].url, "qqbot-media://image/v1/new");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn removes_one_and_clears_all() {
        let dir = temp_dir("remove");
        let store = MediaStore::open(&dir).unwrap();
        store
            .upsert_many(vec![asset("a", 1), asset("b", 2), asset("c", 3)])
            .unwrap();
        let left = store.remove("b").unwrap();
        assert_eq!(
            left.iter()
                .map(|item| item.image_id.as_str())
                .collect::<Vec<_>>(),
            vec!["c", "a"]
        );
        assert!(store.clear().unwrap().is_empty());
        assert!(MediaStore::open(&dir).unwrap().list().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ignores_empty_image_ids() {
        let dir = temp_dir("empty");
        let store = MediaStore::open(&dir).unwrap();
        let mut blank = asset("", 1);
        blank.image_id.clear();
        assert!(store.upsert_many(vec![blank]).unwrap().is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
