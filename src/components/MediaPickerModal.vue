<script setup lang="ts">
import { computed, ref } from 'vue'
import { app } from '@/stores/app'
import { assetsForApp, expiresInLabel, isAssetExpired } from '@/lib/media'
import { formatBytes } from '@/lib/format'
import type { MediaAsset } from '@/types'
import Modal from './Modal.vue'
import { ImageOff, Images, Search } from 'lucide-vue-next'

const emit = defineEmits<{
  pick: [asset: MediaAsset, options: { width: number | null; height: number | null }]
  close: []
}>()

const search = ref('')
const width = ref('')
const height = ref('')

const assets = computed(() => assetsForApp(app.mediaAssets, app.credentials?.appId))
const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return assets.value
  return assets.value.filter(
    (asset) =>
      asset.fileName.toLowerCase().includes(needle) ||
      asset.imageId.toLowerCase().includes(needle) ||
      asset.url.toLowerCase().includes(needle),
  )
})

function numeric(value: string | number): number | null {
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null
}

function pick(asset: MediaAsset) {
  emit('pick', asset, { width: numeric(width.value), height: numeric(height.value) })
}
</script>

<template>
  <Modal width="760px" @close="emit('close')">
    <template #header>
      <span class="head-title">
        <Images :size="15" />
        插入素材图片
        <span class="count-pill">{{ assets.length }} 张缓存</span>
      </span>
    </template>

    <div class="picker">
      <div class="picker-toolbar">
        <div class="search-box">
          <Search :size="13" />
          <input
            v-model="search"
            class="search"
            type="text"
            placeholder="搜索文件名、image_id 或链接"
            spellcheck="false"
          />
        </div>
        <label class="size-field">
          <span>宽</span>
          <input v-model="width" class="input mono" type="number" min="1" placeholder="可选" />
        </label>
        <label class="size-field">
          <span>高</span>
          <input v-model="height" class="input mono" type="number" min="1" placeholder="可选" />
        </label>
      </div>

      <p class="picker-hint">
        点击一张图，把 <code>![文件名 #宽px #高px](qqbot-media://…)</code> 插入到 Markdown 光标处；宽高留空则不限制。
      </p>

      <div v-if="!filtered.length" class="picker-empty">
        <Images :size="26" />
        <p>{{ assets.length ? '没有匹配的素材' : '本机还没有缓存素材' }}</p>
        <span>先到侧边栏的「素材」页上传图片，链接会缓存在这里。</span>
      </div>

      <div v-else class="picker-grid">
        <button
          v-for="asset in filtered"
          :key="asset.imageId"
          type="button"
          class="picker-card"
          :class="{ expired: isAssetExpired(asset) }"
          :title="asset.url"
          @click="pick(asset)"
        >
          <div class="picker-thumb">
            <img v-if="asset.thumbnail" :src="asset.thumbnail" :alt="asset.fileName" loading="lazy" />
            <ImageOff v-else :size="18" />
          </div>
          <div class="picker-meta">
            <span class="picker-name">{{ asset.fileName || asset.imageId }}</span>
            <span class="picker-sub">
              {{ formatBytes(asset.size) }} · {{ expiresInLabel(asset.expiresAt) }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <template #footer>
      <span class="snippet">点击图片即插入到 Markdown 光标处</span>
      <button class="btn" type="button" @click="emit('close')">取消</button>
    </template>
  </Modal>
</template>

<style scoped>
.head-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.count-pill {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent-2);
  font-size: 10px;
  font-weight: 600;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--ink-3);
}

.search-box:focus-within {
  background: #fff;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.search {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 11.5px;
}

.size-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  font-size: 10.5px;
  color: var(--ink-3);
}

.size-field .input {
  width: 64px;
  height: 32px;
}

.picker-hint {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--ink-3);
}

.picker-hint code {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--panel-3);
  padding: 0 4px;
  border-radius: 4px;
}

.picker-empty {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: var(--ink-3);
}

.picker-empty p {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.picker-empty span {
  font-size: 10.5px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  max-height: 420px;
  overflow: auto;
  padding: 2px;
}

.picker-card {
  display: flex;
  flex-direction: column;
  text-align: left;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.picker-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.1);
}

.picker-card.expired {
  opacity: 0.66;
}

.picker-thumb {
  height: 94px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-3);
  color: #b7c0ce;
  overflow: hidden;
}

.picker-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picker-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 9px 8px;
  min-width: 0;
}

.picker-name {
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-sub {
  font-size: 9.5px;
  color: var(--ink-3);
}

.snippet {
  margin-right: auto;
  max-width: 56%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  color: var(--ink-3);
}
</style>
