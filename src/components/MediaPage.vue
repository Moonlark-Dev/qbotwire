<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  app,
  clearMediaAssets,
  deleteMediaAsset,
  dropMediaAsset,
  saveMediaAssets,
  syncMediaAssets,
  toast,
  uploadMediaImage,
} from '@/stores/app'
import {
  MEDIA_IMAGE_MAX_BYTES,
  assetsForApp,
  expiresInLabel,
  fileToBase64,
  imageTypeForFile,
  isAssetExpired,
  markdownImageSnippet,
  mediaTimeIso,
  readImageMeta,
  runWithConcurrency,
} from '@/lib/media'
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format'
import type { MediaAsset } from '@/types'
import Modal from './Modal.vue'
import {
  AlertTriangle,
  Check,
  Copy,
  ImageOff,
  Images,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-vue-next'

interface UploadQueueItem {
  id: number
  file: File
  name: string
  status: 'waiting' | 'uploading' | 'done' | 'error'
  error?: string
}

const CONCURRENCY = 3

const search = ref('')
const syncing = ref(false)
const uploading = ref(false)
const queue = ref<UploadQueueItem[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const detail = ref<MediaAsset | null>(null)
const confirmTarget = ref<MediaAsset | null>(null)
const confirmMode = ref<'platform' | 'local'>('platform')
const confirmClear = ref(false)
const copiedId = ref<string | null>(null)

let queueSeq = 0

const botId = computed(() => app.credentials?.appId ?? null)
const assets = computed(() => assetsForApp(app.mediaAssets, botId.value))
const expiredCount = computed(() => assets.value.filter((item) => isAssetExpired(item)).length)

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

const queueBusy = computed(() => queue.value.some((item) => item.status === 'waiting' || item.status === 'uploading'))
const queueDone = computed(() => queue.value.filter((item) => item.status === 'done').length)

function pickFiles() {
  if (!app.credentials) {
    toast('error', '先配置 Bot 凭据再上传素材')
    return
  }
  fileInput.value?.click()
}

function pushQueue(files: File[]) {
  const accepted: UploadQueueItem[] = []
  for (const file of files) {
    if (!imageTypeForFile(file)) {
      toast('error', `${file.name}：只支持 png / jpeg / gif / webp`)
      continue
    }
    if (file.size > MEDIA_IMAGE_MAX_BYTES) {
      toast('error', `${file.name} 超过 10 MB，平台不允许上传`)
      continue
    }
    queueSeq += 1
    accepted.push({ id: queueSeq, file, name: file.name, status: 'waiting' })
  }
  if (accepted.length) queue.value.push(...accepted)
  return accepted
}

async function uploadOne(item: UploadQueueItem) {
  item.status = 'uploading'
  item.error = undefined
  try {
    const contentType = imageTypeForFile(item.file)
    if (!contentType) throw new Error('不支持的图片格式')
    // Read the bytes and render the local thumbnail before the network round
    // trip; both are independent of the upload itself.
    const [dataBase64, meta] = await Promise.all([
      fileToBase64(item.file),
      readImageMeta(item.file),
    ])
    const asset = await uploadMediaImage({
      fileName: item.file.name,
      contentType,
      dataBase64,
    })
    try {
      await saveMediaAssets([
        {
          ...asset,
          size: item.file.size,
          width: meta?.width ?? asset.width ?? null,
          height: meta?.height ?? asset.height ?? null,
          thumbnail: meta?.thumbnail ?? null,
        },
      ])
    } catch {
      // The link itself is already cached; a missing thumbnail is cosmetic.
      toast('error', `${item.file.name} 已上传，但本地缩略图写入失败`)
    }
    item.status = 'done'
  } catch (reason) {
    item.status = 'error'
    item.error = reason instanceof Error ? reason.message : String(reason)
  }
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || uploading.value) return
  const accepted = pushQueue(files)
  if (!accepted.length) return
  // Read the reactive proxies back out of the queue: mutating the raw objects
  // returned by `pushQueue` would not update the rendered status.
  const jobs = accepted
    .map((item) => queue.value.find((queued) => queued.id === item.id))
    .filter((item): item is UploadQueueItem => Boolean(item))
  uploading.value = true
  try {
    // Multi-select uploads run concurrently (3 at a time) so several images
    // finish in roughly one round trip each.
    await runWithConcurrency(jobs, CONCURRENCY, uploadOne)
    const done = jobs.filter((item) => item.status === 'done').length
    const failed = jobs.filter((item) => item.status === 'error').length
    if (done) toast('success', `已上传 ${done} 张素材`)
    if (failed) toast('error', `${failed} 张素材上传失败`)
  } finally {
    uploading.value = false
  }
}

function clearQueue() {
  if (queueBusy.value) return
  queue.value = []
}

async function onSync() {
  syncing.value = true
  try {
    const count = await syncMediaAssets()
    toast('success', count ? `已同步 ${count} 张平台图片` : '平台当前没有有效图片')
  } catch (reason) {
    toast('error', reason instanceof Error ? reason.message : String(reason))
  } finally {
    syncing.value = false
  }
}

async function copyText(text: string, message: string, id?: string) {
  if (!navigator.clipboard) {
    toast('error', '当前环境不支持剪贴板')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    if (id) {
      copiedId.value = id
      window.setTimeout(() => {
        if (copiedId.value === id) copiedId.value = null
      }, 1600)
    }
    toast('success', message)
  } catch {
    toast('error', '复制失败')
  }
}

function copyLink(asset: MediaAsset) {
  void copyText(asset.url, '素材链接已复制', asset.imageId)
}

function copyMarkdown(asset: MediaAsset) {
  void copyText(markdownImageSnippet(asset), 'Markdown 图片已复制', asset.imageId)
}

function askDelete(asset: MediaAsset, mode: 'platform' | 'local') {
  confirmTarget.value = asset
  confirmMode.value = mode
}

async function confirmDelete() {
  const asset = confirmTarget.value
  if (!asset) return
  const mode = confirmMode.value
  confirmTarget.value = null
  try {
    if (mode === 'platform') {
      await deleteMediaAsset(asset.imageId)
      toast('success', '已从平台删除，并移出本机缓存')
    } else {
      await dropMediaAsset(asset.imageId)
      toast('success', '已移出本机缓存，平台图片未受影响')
    }
    if (detail.value?.imageId === asset.imageId) detail.value = null
  } catch (reason) {
    toast('error', reason instanceof Error ? reason.message : String(reason))
  }
}

async function confirmClearLocal() {
  await clearMediaAssets()
  confirmClear.value = false
  detail.value = null
  toast('success', '本机素材链接已清空')
}

function openDetail(asset: MediaAsset) {
  detail.value = asset
}

function expiresText(asset: MediaAsset): string {
  return expiresInLabel(asset.expiresAt)
}

function createdAtText(asset: MediaAsset): string {
  return formatDateTime(mediaTimeIso(asset.createdAt))
}

function fileLabel(asset: MediaAsset): string {
  return asset.fileName || asset.imageId
}

function sourceLabel(asset: MediaAsset): string {
  return asset.source === 'upload' ? '本机上传' : '平台同步'
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    detail.value = null
    confirmTarget.value = null
    confirmClear.value = false
  }
}
</script>

<template>
  <div class="media-page" @keydown="onKeydown">
    <header class="media-toolbar">
      <div class="summary">
        <span class="summary-icon"><Images :size="15" /></span>
        <div class="summary-text">
          <strong>本机素材库</strong>
          <span>
            {{ assets.length }} 张缓存
            <template v-if="expiredCount">· {{ expiredCount }} 张已过期</template>
            <template v-if="botId">· Bot {{ botId }}</template>
          </span>
        </div>
      </div>

      <div class="toolbar-right">
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
        <button class="btn small" type="button" :disabled="syncing" @click="onSync">
          <RefreshCw :size="12" :class="{ spin: syncing }" />
          {{ syncing ? '同步中' : '从平台刷新' }}
        </button>
        <button class="btn small" type="button" :disabled="uploading" @click="pickFiles">
          <Upload :size="12" />
          上传图片
        </button>
        <button
          class="btn small"
          type="button"
          :disabled="!assets.length"
          title="只清空本机缓存，不会删除平台上的图片"
          @click="confirmClear = true"
        >
          清空本机
        </button>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          @change="onFiles"
        />
      </div>
    </header>

    <section v-if="queue.length" class="queue">
      <div class="queue-head">
        <span class="queue-title">
          <Upload :size="12" />
          上传队列
          <span class="queue-count">{{ queueDone }}/{{ queue.length }}</span>
        </span>
        <button class="link-btn" type="button" :disabled="queueBusy" @click="clearQueue">
          <X :size="11" /> 清空记录
        </button>
      </div>
      <div class="queue-list">
        <div v-for="item in queue" :key="item.id" class="queue-item" :class="item.status">
          <span class="queue-name">{{ item.name }}</span>
          <span class="queue-status">
            <template v-if="item.status === 'waiting'">等待中</template>
            <template v-else-if="item.status === 'uploading'">
              <span class="spinner" /> 上传中
            </template>
            <template v-else-if="item.status === 'done'">
              <Check :size="11" /> 已写入缓存
            </template>
            <template v-else>
              <AlertTriangle :size="11" /> {{ item.error }}
            </template>
          </span>
        </div>
      </div>
    </section>

    <div class="media-body">
      <div v-if="!filtered.length" class="empty">
        <Images :size="28" class="empty-icon" />
        <p class="empty-title">
          {{ search ? '没有匹配的素材' : '还没有缓存素材' }}
        </p>
        <p class="empty-desc">
          {{
            search
              ? '换个关键词试试。'
              : '上传图片后，平台会返回稳定的 qqbot-media:// 链接；qbotwire 把它缓存在本机，构造 Markdown 消息时可以一键插入。平台单 Bot 上限 100 张、单张不超过 10 MB、90 天未引用会过期。'
          }}
        </p>
        <button v-if="!search" class="btn small" type="button" :disabled="uploading" @click="pickFiles">
          <Upload :size="12" /> 选择图片上传
        </button>
      </div>

      <div v-else class="grid">
        <button
          v-for="asset in filtered"
          :key="asset.imageId"
          type="button"
          class="card"
          :class="{ expired: isAssetExpired(asset) }"
          @click="openDetail(asset)"
        >
          <div class="thumb">
            <img v-if="asset.thumbnail" :src="asset.thumbnail" :alt="asset.fileName" loading="lazy" />
            <ImageOff v-else :size="22" />
            <span v-if="isAssetExpired(asset)" class="expired-badge">已过期</span>
          </div>
          <div class="card-main">
            <span class="card-name">{{ fileLabel(asset) }}</span>
            <span class="card-id mono">{{ asset.url }}</span>
            <div class="card-meta">
              <span>{{ formatBytes(asset.size) }}</span>
              <span>{{ formatRelative(mediaTimeIso(asset.createdAt)) }}</span>
              <span :class="{ danger: isAssetExpired(asset) }">{{ expiresText(asset) }}</span>
              <span class="source">{{ sourceLabel(asset) }}</span>
            </div>
          </div>
        </button>
      </div>
    </div>

    <footer class="media-foot">
      <span>
        <Images :size="11" />
        链接引用与 Bot 绑定；这里只缓存链接和本地缩略图，不上传原图到第三方。
      </span>
      <span class="mono">media {{ assets.length }} · expired {{ expiredCount }}</span>
    </footer>

    <Modal v-if="detail" width="680px" @close="detail = null">
      <template #header>
        <span class="detail-title">
          {{ fileLabel(detail) }}
          <span v-if="isAssetExpired(detail)" class="expired-pill">已过期</span>
        </span>
      </template>
      <div class="detail">
        <div class="detail-preview">
          <img v-if="detail.thumbnail" :src="detail.thumbnail" :alt="detail.fileName" />
          <ImageOff v-else :size="30" />
        </div>
        <dl class="detail-fields">
          <dt>Markdown 引用</dt>
          <dd>
            <span class="mono break">{{ detail.url }}</span>
            <button class="copy" type="button" title="复制链接" @click="copyLink(detail)">
              <Check v-if="copiedId === detail.imageId" :size="11" />
              <Copy v-else :size="11" />
            </button>
          </dd>
          <dt>Markdown 图片</dt>
          <dd>
            <span class="mono break">{{ markdownImageSnippet(detail) }}</span>
            <button class="copy" type="button" title="复制 Markdown" @click="copyMarkdown(detail)">
              <Copy :size="11" />
            </button>
          </dd>
          <dt>image_id</dt>
          <dd class="mono break">{{ detail.imageId }}</dd>
          <dt>文件</dt>
          <dd>{{ detail.fileName || '—' }} · {{ detail.contentType || '未知类型' }}</dd>
          <dt>尺寸 / 大小</dt>
          <dd>
            <template v-if="detail.width && detail.height">{{ detail.width }} × {{ detail.height }}</template>
            <template v-else>尺寸未知</template>
            · {{ formatBytes(detail.size) }}
          </dd>
          <dt>上传时间</dt>
          <dd>{{ createdAtText(detail) }} · {{ formatRelative(mediaTimeIso(detail.createdAt)) }}</dd>
          <dt>过期时间</dt>
          <dd>{{ formatDateTime(mediaTimeIso(detail.expiresAt)) }} · {{ expiresText(detail) }}</dd>
          <dt>来源</dt>
          <dd>{{ sourceLabel(detail) }}<template v-if="detail.appId"> · AppID {{ detail.appId }}</template></dd>
        </dl>
        <p class="detail-hint">
          在「发送 → 构造消息 → Markdown」里点「插入素材」即可把这张图填进正文；Markdown 里也可以自己调整
          <code>#宽px #高px</code>。
        </p>
      </div>
      <template #footer>
        <button class="btn small" type="button" @click="copyMarkdown(detail)">
          <Copy :size="12" /> 复制 Markdown
        </button>
        <button class="btn small" type="button" @click="askDelete(detail, 'local')">
          <X :size="12" /> 仅移出本机
        </button>
        <button class="btn small danger" type="button" @click="askDelete(detail, 'platform')">
          <Trash2 :size="12" /> 从平台删除
        </button>
        <button class="btn primary" type="button" @click="detail = null">完成</button>
      </template>
    </Modal>

    <Modal v-if="confirmTarget" width="460px" @close="confirmTarget = null">
      <template #header>{{ confirmMode === 'platform' ? '从平台删除素材' : '移出本机缓存' }}</template>
      <p class="confirm-text">
        <template v-if="confirmMode === 'platform'">
          确定要从 QQ 平台删除「{{ fileLabel(confirmTarget) }}」吗？删除后链接会立即失效（已发送的消息不受影响），并释放一张数量配额；本机缓存也会一并移除。
        </template>
        <template v-else>
          只把「{{ fileLabel(confirmTarget) }}」的链接从本机缓存里移除，平台上的图片仍然有效、仍可被其他消息引用。
        </template>
      </p>
      <template #footer>
        <button class="btn" type="button" @click="confirmTarget = null">取消</button>
        <button
          class="btn"
          :class="confirmMode === 'platform' ? 'danger' : 'primary'"
          type="button"
          @click="confirmDelete"
        >
          {{ confirmMode === 'platform' ? '删除' : '移出本机' }}
        </button>
      </template>
    </Modal>

    <Modal v-if="confirmClear" width="440px" @close="confirmClear = false">
      <template #header>清空本机素材缓存</template>
      <p class="confirm-text">
        确定要清空本机缓存的 {{ assets.length }} 条素材链接吗？该操作不会删除平台上的图片，重新「从平台刷新」可以恢复仍有效的链接。
      </p>
      <template #footer>
        <button class="btn" type="button" @click="confirmClear = false">取消</button>
        <button class="btn danger" type="button" @click="confirmClearLocal">清空</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.media-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.media-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  flex: none;
}

.summary {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.summary-icon {
  width: 30px;
  height: 30px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--violet-soft);
  color: var(--violet);
}

.summary-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.summary-text strong {
  font-size: 12px;
  font-weight: 650;
}

.summary-text span {
  font-size: 10px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 220px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
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

.file-input {
  display: none;
}

.queue {
  flex: none;
  padding: 9px 16px 10px;
  border-bottom: 1px solid var(--line);
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.queue-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
}

.queue-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 1px 5px;
  border-radius: 999px;
}

.queue-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.queue-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font-size: 10.5px;
}

.queue-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-2);
}

.queue-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  color: var(--ink-3);
  font-size: 10px;
}

.queue-item.done .queue-status {
  color: var(--green);
}

.queue-item.error .queue-status {
  color: var(--red);
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px 24px;
  background: #f7f9fc;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  flex-direction: column;
  text-align: left;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: #fff;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}

.card:hover {
  border-color: var(--accent-line);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
  transform: translateY(-1px);
}

.card.expired {
  opacity: 0.72;
}

.thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 116px;
  background: var(--panel-3);
  color: #b7c0ce;
  overflow: hidden;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.expired-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.9);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px 11px;
  min-width: 0;
}

.card-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-id {
  font-size: 9.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 4px;
  font-size: 9.5px;
  color: var(--ink-3);
}

.card-meta .danger {
  color: var(--red);
}

.source {
  font-size: 9px;
  color: #8a94a6;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 4px;
}

.empty {
  height: 100%;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--ink-3);
}

.empty-icon {
  color: #c4cddb;
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}

.empty-desc {
  margin: 0;
  max-width: 470px;
  text-align: center;
  font-size: 11px;
  line-height: 1.75;
}

.media-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
  font-size: 10px;
  color: var(--ink-3);
  flex: none;
}

.media-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.detail-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.expired-pill {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 10px;
  font-weight: 600;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 170px;
  max-height: 300px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--panel-3);
  color: #b7c0ce;
  overflow: hidden;
}

.detail-preview img {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}

.detail-fields {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 11.5px;
}

.detail-fields dt {
  color: var(--ink-3);
}

.detail-fields dd {
  margin: 0;
  color: var(--ink-2);
  word-break: break-all;
}

.break {
  word-break: break-all;
}

.copy {
  display: inline-flex;
  margin-left: 6px;
  color: var(--ink-3);
  vertical-align: middle;
}

.copy:hover {
  color: var(--accent);
}

.detail-hint {
  margin: 0;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-3);
}

.detail-hint code {
  font-family: var(--font-mono);
  background: var(--panel-3);
  padding: 0 4px;
  border-radius: 4px;
}

.confirm-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-2);
}

@media (max-width: 1100px) {
  .search-box {
    width: 160px;
  }
}
</style>
