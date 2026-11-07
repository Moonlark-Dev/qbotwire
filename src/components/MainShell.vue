<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { app, botLabel, setPage } from '@/stores/app'
import type { PageKey } from '@/types'
import BrandMark from './BrandMark.vue'
import Avatar from './Avatar.vue'
import StatusPill from './StatusPill.vue'
import SendPage from './SendPage.vue'
import ReceivePage from './ReceivePage.vue'
import CachePage from './CachePage.vue'
import SettingsModal from './SettingsModal.vue'
import { Activity, Database, Inbox, Send, Settings } from 'lucide-vue-next'

const pages: Array<{
  key: PageKey
  label: string
  title: string
  subtitle: string
  icon: typeof Send
}> = [
  {
    key: 'send',
    label: '发送',
    title: '发送',
    subtitle: '从接口目录选择 API，或自己构造一个请求',
    icon: Send,
  },
  {
    key: 'receive',
    label: '接收',
    title: '接收',
    subtitle: '实时事件流 · 单击预览，双击查看格式化报文',
    icon: Inbox,
  },
  {
    key: 'cache',
    label: '缓存',
    title: '缓存',
    subtitle: '从事件中沉淀的群聊与用户资料',
    icon: Database,
  },
]

const current = computed(() => pages.find((page) => page.key === app.page) ?? pages[0])

const cacheCount = computed(() => app.cache.groups.length + app.cache.users.length)

function badgeFor(key: PageKey): number {
  if (key === 'receive') return app.events.length
  if (key === 'cache') return cacheCount.value
  return app.savedEndpoints.length
}

const latency = computed(() => {
  if (app.status.state !== 'connected') return null
  if (app.status.latencyMs === null || app.status.latencyMs === undefined) return null
  return app.status.latencyMs
})

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.key === ',') {
    event.preventDefault()
    app.settingsOpen = true
    return
  }
  const index = Number(event.key)
  if (index >= 1 && index <= pages.length) {
    event.preventDefault()
    setPage(pages[index - 1].key)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <BrandMark :size="30" />
        <div class="brand-text">
          <strong>QBotWire</strong>
          <span>QQ Bot workbench</span>
        </div>
      </div>

      <nav class="nav">
        <span class="nav-label">工作台</span>
        <button
          v-for="page in pages"
          :key="page.key"
          type="button"
          class="nav-item"
          :class="{ active: app.page === page.key }"
          @click="setPage(page.key)"
        >
          <component :is="page.icon" :size="17" class="nav-icon" />
          <span class="nav-text">{{ page.label }}</span>
          <span v-if="badgeFor(page.key)" class="nav-badge">{{ badgeFor(page.key) }}</span>
          <span v-if="app.page === page.key" class="nav-indicator" />
        </button>
      </nav>

      <div class="sidebar-spacer" />

      <div class="bot-card" :class="app.status.state">
        <div class="bot-top">
          <Avatar
            :name="app.status.bot?.username || botLabel"
            :src="app.status.bot?.avatar"
            kind="bot"
            :size="34"
          />
          <div class="bot-meta">
            <span class="bot-name">{{ app.status.bot?.username || botLabel }}</span>
            <span class="bot-id mono">{{ app.credentials?.appId || '未登录' }}</span>
          </div>
          <button class="gear" type="button" title="设置" @click="app.settingsOpen = true">
            <Settings :size="15" />
          </button>
        </div>
        <div class="bot-bottom">
          <StatusPill :status="app.status" />
          <span v-if="latency !== null" class="latency mono">
            <Activity :size="10" />
            {{ latency }} ms
          </span>
          <span v-else-if="app.mode === 'mock'" class="mock-tag">预览</span>
        </div>
      </div>

      <div class="sidebar-foot">
        <span>AGPL-3.0</span>
        <span class="mono">Ctrl+1 / 2 / 3</span>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="title-block">
          <h1>{{ current.title }}</h1>
          <p>{{ current.subtitle }}</p>
        </div>
        <div class="top-actions">
          <span v-if="app.mode === 'mock'" class="preview-badge">浏览器预览 · 模拟数据</span>
          <span
            v-if="app.status.state === 'connected' && app.status.heartbeatIntervalMs"
            class="heartbeat mono"
            title="网关心跳间隔"
          >
            ♥ {{ Math.round((app.status.heartbeatIntervalMs ?? 0) / 1000) }}s
          </span>
          <StatusPill :status="app.status" />
          <button class="top-icon" type="button" title="设置（Ctrl+,）" @click="app.settingsOpen = true">
            <Settings :size="17" />
          </button>
        </div>
      </header>

      <main class="content">
        <div v-show="app.page === 'send'" class="page">
          <SendPage />
        </div>
        <div v-show="app.page === 'receive'" class="page">
          <ReceivePage />
        </div>
        <div v-show="app.page === 'cache'" class="page">
          <CachePage />
        </div>
      </main>
    </div>

    <SettingsModal v-if="app.settingsOpen" />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: 230px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 14px 12px 12px;
  background: linear-gradient(180deg, #fbfcff 0%, #f7f9fd 100%);
  border-right: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 6px 16px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
}

.brand-text strong {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.brand-text span {
  font-size: 9px;
  color: var(--ink-3);
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-label {
  padding: 0 9px 7px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #a6b0c0;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--ink-2);
  font-size: 12.5px;
  transition: background 0.12s ease, color 0.12s ease;
}

.nav-item:hover {
  background: #eef2f9;
  color: var(--ink);
}

.nav-item.active {
  background: #fff;
  color: var(--accent-2);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.nav-icon {
  color: var(--ink-3);
  flex: none;
}

.nav-item.active .nav-icon {
  color: var(--accent);
}

.nav-text {
  flex: 1;
  text-align: left;
}

.nav-badge {
  min-width: 18px;
  height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  background: #eef2f8;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.nav-item.active .nav-badge {
  background: var(--accent-soft);
  color: var(--accent);
}

.nav-indicator {
  position: absolute;
  left: -12px;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}

.sidebar-spacer {
  flex: 1;
}

.bot-card {
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--shadow-sm);
}

.bot-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bot-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.bot-name {
  font-size: 11.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-id {
  font-size: 9px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gear {
  margin-left: auto;
  flex: none;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  border-radius: 6px;
}

.gear:hover {
  background: var(--panel-3);
  color: var(--ink);
}

.bot-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.latency {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  color: var(--green);
}

.mock-tag {
  font-size: 8.5px;
  color: var(--violet);
  background: var(--violet-soft);
  padding: 1px 5px;
  border-radius: 999px;
}

.sidebar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 7px 0;
  font-size: 8.5px;
  color: #b3bccb;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 64px;
  padding: 0 22px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(8px);
  flex: none;
}

.title-block {
  min-width: 0;
}

.title-block h1 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.title-block p {
  margin: 1px 0 0;
  font-size: 10.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.preview-badge {
  font-size: 9.5px;
  color: var(--violet);
  background: var(--violet-soft);
  border: 1px solid #e3d5ff;
  padding: 3px 8px;
  border-radius: 999px;
}

.heartbeat {
  font-size: 9.5px;
  color: var(--ink-3);
}

.top-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
}

.top-icon:hover {
  color: var(--ink);
  border-color: var(--line-strong);
  background: var(--panel-2);
}

.content {
  flex: 1;
  min-height: 0;
  position: relative;
}

.page {
  position: absolute;
  inset: 0;
  min-height: 0;
}
</style>
