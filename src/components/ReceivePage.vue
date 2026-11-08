<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { app, clearEvents, findGroup, findUser, toast } from '@/stores/app'
import { formatEvent, eventCategory, prettyJson } from '@/lib/events'
import { formatClock, truncate } from '@/lib/format'
import { resolveUserAvatar } from '@/lib/avatar'
import { backend } from '@/lib/backend'
import type { GatewayEvent } from '@/types'
import EventDetailModal from './EventDetailModal.vue'
import Avatar from './Avatar.vue'
import {
  Inbox,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-vue-next'

const paused = ref(false)
const frozen = ref<GatewayEvent[]>([])
const newWhilePaused = ref(0)
const category = ref('全部')
const search = ref('')
const selectedId = ref<string | null>(null)
const detail = ref<GatewayEvent | null>(null)

const CATEGORIES = ['全部', '消息', '频道', '成员', '生命周期', '交互', '其他']
const categoryMap: Record<string, string> = {
  message: '消息',
  guild: '频道',
  member: '成员',
  lifecycle: '生命周期',
  interaction: '交互',
  unknown: '其他',
}

const source = computed(() => (paused.value ? frozen.value : app.events))

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return source.value.filter((event) => {
    if (category.value !== '全部') {
      const cat = categoryMap[eventCategory(event.type)] ?? '其他'
      if (cat !== category.value) return false
    }
    if (!needle) return true
    const view = formatEvent(event)
    const haystack = `${event.type} ${view.title} ${view.subtitle} ${prettyJson(event.data)}`.toLowerCase()
    return haystack.includes(needle)
  })
})

const selected = computed(() => filtered.value.find((event) => event.id === selectedId.value))

const counts = computed(() => {
  const map: Record<string, number> = { 全部: source.value.length }
  for (const event of source.value) {
    const cat = categoryMap[eventCategory(event.type)] ?? '其他'
    map[cat] = (map[cat] ?? 0) + 1
  }
  return map
})

watch(
  () => app.events.length,
  (next, prev) => {
    if (paused.value && next > prev) newWhilePaused.value += next - prev
    if (!paused.value && !selectedId.value && app.events.length) {
      selectedId.value = app.events[0].id
    }
  },
)

watch(
  filtered,
  (list) => {
    if (!list.length) {
      selectedId.value = null
    } else if (!list.some((item) => item.id === selectedId.value)) {
      selectedId.value = list[0].id
    }
  },
  { immediate: true },
)

function togglePause() {
  paused.value = !paused.value
  if (paused.value) {
    frozen.value = [...app.events]
    newWhilePaused.value = 0
  } else {
    newWhilePaused.value = 0
  }
}

async function onClear() {
  await clearEvents()
  selectedId.value = null
  frozen.value = []
  newWhilePaused.value = 0
  toast('info', '已清空当前会话的事件')
}

function inject() {
  backend.injectDemoEvent?.()
}

function eventMeta(event: GatewayEvent): string {
  const view = formatEvent(event)
  const data = (event.data ?? {}) as Record<string, unknown>
  if (data.group_openid) {
    const group = findGroup(String(data.group_openid))
    return group?.name || String(data.group_openid)
  }
  if (data.group_id) {
    return String(data.group_id)
  }
  if (data.guild_id) {
    return `${String(data.guild_id)} · ${String(data.channel_id ?? '')}`.replace(/ · $/, '')
  }
  if (data.author) {
    const author = data.author as Record<string, unknown>
    const openid = String(author.member_openid ?? author.user_openid ?? author.id ?? '')
    const user = findUser(openid)
    return user?.name || openid
  }
  return view.title
}

function authorOf(event: GatewayEvent) {
  const data = (event.data ?? {}) as { author?: Record<string, unknown> }
  const author = data.author ?? {}
  const openid = String(author.member_openid ?? author.user_openid ?? author.id ?? '')
  const cached = findUser(openid)
  return {
    name: String(author.username ?? cached?.name ?? '') || openid,
    openid,
    avatar: resolveUserAvatar(app.credentials?.appId, {
      openid,
      avatar: (author.avatar as string | undefined) ?? cached?.avatar ?? null,
    }),
  }
}

function openDetail(event: GatewayEvent) {
  detail.value = event
}

function onRowKey(event: KeyboardEvent, item: GatewayEvent) {
  if (event.key === 'Enter') {
    selectedId.value = item.id
    openDetail(item)
  }
}

function formatRelativeEvent(receivedAt: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(receivedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h`
}

// Keep relative timestamps lively without re-rendering on every frame.
const nowTick = ref(Date.now())
let ticker: number | undefined
onMounted(() => {
  ticker = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 15000)
})
onBeforeUnmount(() => {
  if (ticker) window.clearInterval(ticker)
})
const relativeOf = (iso: string) => {
  void nowTick.value
  return formatRelativeEvent(iso)
}
</script>

<template>
  <div class="receive-page">
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="category-tabs">
          <button
            v-for="item in CATEGORIES"
            :key="item"
            type="button"
            class="cat"
            :class="{ active: category === item }"
            @click="category = item"
          >
            {{ item }}
            <span class="cat-count">{{ counts[item] ?? 0 }}</span>
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <div class="search-box">
          <Search :size="13" />
          <input
            v-model="search"
            class="search"
            type="text"
            placeholder="搜索事件类型、内容或 OpenID"
            spellcheck="false"
          />
        </div>
        <button
          class="btn small"
          type="button"
          :title="paused ? '继续接收显示' : '暂停列表刷新'"
          @click="togglePause"
        >
          <component :is="paused ? Play : Pause" :size="12" />
          {{ paused ? '继续' : '暂停' }}
        </button>
        <button
          v-if="app.mode === 'mock'"
          class="btn small"
          type="button"
          title="立即模拟一条群消息事件"
          @click="inject"
        >
          <Sparkles :size="12" /> 演示事件
        </button>
        <button class="btn small danger" type="button" :disabled="!app.events.length" @click="onClear">
          <Trash2 :size="12" /> 清空
        </button>
      </div>
    </header>

    <div v-if="paused" class="paused-banner">
      <Pause :size="12" />
      列表已暂停<template v-if="newWhilePaused">，期间收到 {{ newWhilePaused }} 条新事件</template>
      <button class="resume" type="button" @click="togglePause">立即恢复</button>
    </div>

    <div class="receive-body">
      <div class="event-list">
        <div v-if="!filtered.length" class="empty">
          <Inbox :size="26" class="empty-icon" />
          <p class="empty-title">{{ app.events.length ? '没有匹配的事件' : '还没有事件' }}</p>
          <p class="empty-desc">
            {{
              app.events.length
                ? '换个分类或关键词试试。'
                : 'Bot 连接网关后收到的 DISPATCH 事件会实时出现在这里。'
            }}
          </p>
          <span v-if="!app.events.length" class="empty-state">
            <RefreshCw :size="11" />
            当前状态：{{ app.status.state }}
          </span>
        </div>

        <div
          v-for="event in filtered"
          :key="event.id"
          class="event-row"
          :class="{ selected: event.id === selectedId }"
          role="button"
          tabindex="0"
          @click="selectedId = event.id"
          @dblclick="openDetail(event)"
          @keydown="onRowKey($event, event)"
        >
          <span class="time mono">{{ formatClock(event.receivedAt) }}</span>
          <span class="seq mono">#{{ event.seq ?? '—' }}</span>
          <div class="event-main">
            <div class="event-line">
              <span class="event-type" :class="eventCategory(event.type)">{{ event.type }}</span>
              <span class="event-summary">{{ truncate(formatEvent(event).subtitle || '—', 90) }}</span>
            </div>
            <div class="event-sub">
              <Avatar
                v-if="event.data && (event.data as { author?: unknown }).author"
                :name="authorOf(event).name"
                :src="authorOf(event).avatar"
                :size="14"
              />
              <span class="meta">{{ eventMeta(event) }}</span>
              <span class="dot">·</span>
              <span class="age">{{ relativeOf(event.receivedAt) }}前</span>
            </div>
          </div>
          <span class="open-hint">双击查看</span>
        </div>
      </div>

      <aside class="preview">
        <template v-if="selected">
          <div class="preview-head">
            <span class="event-type" :class="eventCategory(selected.type)">{{ selected.type }}</span>
            <span class="preview-age">{{ relativeOf(selected.receivedAt) }}前</span>
          </div>
          <h3 class="preview-title">{{ formatEvent(selected).title }}</h3>
          <p v-if="formatEvent(selected).content" class="preview-content">
            {{ formatEvent(selected).content }}
          </p>
          <dl class="preview-fields">
            <template v-for="field in formatEvent(selected).fields" :key="field.label">
              <dt>{{ field.label }}</dt>
              <dd :class="{ mono: field.mono }">{{ field.value }}</dd>
            </template>
          </dl>
          <div class="preview-foot">
            <span class="mono">seq #{{ selected.seq ?? '—' }}</span>
            <button class="btn small" type="button" @click="openDetail(selected)">
              查看完整报文
            </button>
          </div>
        </template>
        <div v-else class="preview-empty">
          <Inbox :size="20" />
          <p>选择一条事件查看摘要，双击打开格式化报文。</p>
        </div>
      </aside>
    </div>

    <EventDetailModal v-if="detail" :event="detail" @close="detail = null" />
  </div>
</template>

<style scoped>
.receive-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  flex: none;
}

.toolbar-left {
  min-width: 0;
  overflow: hidden;
}

.category-tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.category-tabs::-webkit-scrollbar {
  display: none;
}

.cat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
}

.cat:hover {
  background: var(--panel-3);
  color: var(--ink-2);
}

.cat.active {
  background: var(--accent-soft);
  color: var(--accent-2);
  font-weight: 600;
}

.cat-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: #a9b2c2;
}

.cat.active .cat-count {
  color: var(--accent);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 230px;
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

.paused-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: var(--amber-soft);
  border-bottom: 1px solid #f1dfb9;
  font-size: 11px;
  color: #8a5a00;
  flex: none;
}

.resume {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  color: #9a5b00;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.receive-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  flex: 1;
  min-height: 0;
  background: #f7f9fc;
}

.event-list {
  overflow: auto;
  min-height: 0;
  padding: 6px 8px 16px;
}

.event-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  animation: fade-up 0.18s ease;
}

.event-row:hover {
  background: rgba(255, 255, 255, 0.8);
}

.event-row.selected {
  background: #fff;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-sm);
}

.event-row:focus-visible {
  outline: 2px solid var(--accent);
}

.time {
  flex: none;
  width: 52px;
  font-size: 10px;
  color: var(--ink-3);
  margin-top: 2px;
}

.seq {
  flex: none;
  width: 36px;
  font-size: 9px;
  color: #b7c0cf;
  margin-top: 2px;
  text-align: right;
}

.event-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.event-type {
  flex: none;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--ink-2);
  background: var(--panel-3);
}

.event-type.message {
  color: #1d4ed8;
  background: #eaf1ff;
}

.event-type.guild {
  color: #6d28d9;
  background: #f2ecff;
}

.event-type.member {
  color: #157347;
  background: #e9f9ef;
}

.event-type.lifecycle {
  color: #9a5b00;
  background: #fff4e0;
}

.event-type.interaction {
  color: #be185d;
  background: #fdeef5;
}

.event-summary {
  font-size: 12px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-sub {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: var(--ink-3);
  font-size: 10px;
}

.meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 46%;
}

.dot {
  color: #c3cbd8;
}

.age {
  flex: none;
}

.open-hint {
  flex: none;
  font-size: 9.5px;
  color: #b9c2d0;
  opacity: 0;
  align-self: center;
}

.event-row:hover .open-hint {
  opacity: 1;
}

.empty {
  height: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--ink-3);
}

.empty-icon {
  color: #c4cddb;
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
  font-weight: 600;
}

.empty-desc {
  margin: 0;
  max-width: 380px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
}

.empty-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 10px;
  font-family: var(--font-mono);
}

.preview {
  border-left: 1px solid var(--line);
  background: #fff;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preview-age {
  font-size: 10px;
  color: var(--ink-3);
}

.preview-title {
  margin: 0;
  font-size: 15px;
  letter-spacing: -0.01em;
}

.preview-content {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-2);
  word-break: break-word;
}

.preview-fields {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 6px 10px;
  margin: 4px 0 0;
  font-size: 11px;
}

.preview-fields dt {
  color: var(--ink-3);
}

.preview-fields dd {
  margin: 0;
  color: var(--ink-2);
  word-break: break-all;
}

.preview-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-3);
}

.preview-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.7;
  padding: 30px;
}

@media (max-width: 1100px) {
  .receive-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .preview {
    display: none;
  }
  .search-box {
    width: 170px;
  }
}
</style>
