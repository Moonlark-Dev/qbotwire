<script setup lang="ts">
import { ref } from 'vue'
import { app, clearCache, clearEvents, login, logout, refreshCache, toast, updateSettings } from '@/stores/app'
import type { Credentials, Settings } from '@/types'
import CredentialForm from './CredentialForm.vue'
import Modal from './Modal.vue'
import BrandMark from './BrandMark.vue'
import {
  BellOff,
  Database,
  ExternalLink,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Unplug,
} from 'lucide-vue-next'

const busy = ref(false)
const error = ref<string | null>(null)
const pendingCacheClear = ref(false)
const editingCredentials = ref(!app.credentials)
const clearing = ref(false)
const refreshing = ref(false)

async function onLogin(credentials: Credentials) {
  busy.value = true
  error.value = null
  try {
    await login(credentials)
    toast('success', '凭据已更新，连接已重建')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function onDisconnect() {
  await logout(false)
  app.settingsOpen = false
  toast('info', '已断开网关连接')
}

async function onForget() {
  await logout(true)
  app.settingsOpen = false
  toast('info', '已清除本机凭据')
}

async function toggleAutoSave() {
  await updateSettings({ ...app.settings, autoSaveOnSuccess: !app.settings.autoSaveOnSuccess })
}

async function setEventLimit(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  const settings: Settings = { ...app.settings, eventLimit: value }
  await updateSettings(settings)
  toast('success', `事件保留上限已设为 ${value}`)
}

async function onRefreshCache() {
  refreshing.value = true
  try {
    await refreshCache()
    toast('info', '缓存已刷新')
  } finally {
    refreshing.value = false
  }
}

async function onClearCache() {
  if (!pendingCacheClear.value) {
    pendingCacheClear.value = true
    window.setTimeout(() => (pendingCacheClear.value = false), 3000)
    return
  }
  clearing.value = true
  try {
    await clearCache()
    pendingCacheClear.value = false
  } finally {
    clearing.value = false
  }
}

async function onClearEvents() {
  await clearEvents()
  toast('info', '已清空事件列表')
}
</script>

<template>
  <Modal width="760px" @close="app.settingsOpen = false">
    <template #header>
      <div class="settings-head">
        <BrandMark :size="24" />
        <span>设置</span>
        <span class="head-sub">连接、缓存与偏好</span>
      </div>
    </template>

    <div class="settings">
      <section class="section">
        <div class="section-head-row">
          <div>
            <h3 class="section-title">连接</h3>
            <p class="section-desc">
              当前 AppID <span class="mono">{{ app.credentials?.appId || '—' }}</span>
              · {{ app.credentials?.environment === 'sandbox' ? '沙箱环境' : app.credentials?.environment === 'custom' ? '自定义环境' : '正式环境' }}
            </p>
          </div>
          <button class="btn small" type="button" @click="editingCredentials = !editingCredentials">
            {{ editingCredentials ? '收起凭据' : '修改凭据' }}
          </button>
        </div>
        <template v-if="editingCredentials">
          <p class="section-desc">
            修改凭据后会重新换取 AccessToken 并重建网关连接；当前设置会保存到本机。
          </p>
          <CredentialForm
            :initial="app.credentials"
            :busy="busy"
            :error="error"
            :mode="app.mode"
            submit-label="保存并重新连接"
            @submit="onLogin"
          />
        </template>
      </section>

      <section class="section">
        <h3 class="section-title">偏好</h3>
        <label class="switch-row">
          <div class="switch-text">
            <strong>请求成功时自动保存接口</strong>
            <span>自定义请求成功后，自动出现在「已保存接口」中。</span>
          </div>
          <button
            type="button"
            class="switch"
            role="switch"
            :aria-checked="app.settings.autoSaveOnSuccess"
            :class="{ on: app.settings.autoSaveOnSuccess }"
            @click="toggleAutoSave"
          >
            <span class="knob" />
          </button>
        </label>
        <label class="select-row">
          <div class="switch-text">
            <strong>事件保留上限</strong>
            <span>仅影响内存中的事件列表，超出的旧事件会被丢弃。</span>
          </div>
          <select class="select limit-select" :value="app.settings.eventLimit" @change="setEventLimit">
            <option :value="200">200 条</option>
            <option :value="500">500 条</option>
            <option :value="1000">1000 条</option>
            <option :value="2000">2000 条</option>
          </select>
        </label>
      </section>

      <section class="section">
        <h3 class="section-title">数据</h3>
        <div class="action-grid">
          <button class="action" type="button" :disabled="refreshing" @click="onRefreshCache">
            <RefreshCw :size="15" :class="{ spin: refreshing }" />
            <span>
              <strong>刷新缓存</strong>
              <small>从后端重新读取群聊与用户缓存</small>
            </span>
          </button>
          <button class="action danger" type="button" :disabled="clearing" @click="onClearCache">
            <Database :size="15" />
            <span>
              <strong>{{ pendingCacheClear ? '再点一次确认清空' : '清空全部缓存' }}</strong>
              <small>{{ pendingCacheClear ? '本机缓存记录将被删除' : '群聊与用户资料都会移除' }}</small>
            </span>
          </button>
          <button class="action" type="button" @click="onClearEvents">
            <BellOff :size="15" />
            <span>
              <strong>清空事件列表</strong>
              <small>只清空当前会话的内存事件</small>
            </span>
          </button>
          <button class="action" type="button" @click="onDisconnect">
            <Unplug :size="15" />
            <span>
              <strong>断开连接</strong>
              <small>保留凭据，下次启动自动重连</small>
            </span>
          </button>
        </div>
      </section>

      <section class="section danger-zone">
        <h3 class="section-title">
          <ShieldAlert :size="13" />
          危险操作
        </h3>
        <div class="danger-row">
          <div class="switch-text">
            <strong>清除本机凭据并退出</strong>
            <span>会删除 AppID / AppSecret 与缓存，无法撤销。</span>
          </div>
          <button class="btn danger" type="button" @click="onForget">
            <Trash2 :size="13" />
            清除凭据
          </button>
        </div>
      </section>

      <section class="about">
        <div class="about-brand">
          <BrandMark :size="18" />
          <span>QBotWire v{{ app.version }}</span>
          <span class="dot">·</span>
          <span>AGPL-3.0</span>
          <span v-if="app.mode === 'mock'" class="preview-tag">浏览器预览模式</span>
        </div>
        <div class="about-links">
          <a href="https://github.com/Moonlark-Dev/qbotwire" target="_blank" rel="noreferrer">
            GitHub <ExternalLink :size="10" />
          </a>
          <a href="https://bot.q.qq.com/wiki/develop/api-v2/" target="_blank" rel="noreferrer">
            API 文档 <ExternalLink :size="10" />
          </a>
        </div>
      </section>
    </div>

    <template #footer>
      <button class="btn" type="button" @click="app.settingsOpen = false">
        <LogOut :size="13" />
        关闭
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.settings-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-head > span:first-of-type {
  font-size: 15px;
  font-weight: 650;
}

.head-sub {
  font-size: 10.5px;
  color: var(--ink-3);
  font-weight: 400;
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: 0.02em;
}

.section-head-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-desc {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-3);
}

.switch-row,
.select-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
}

.switch-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.switch-text strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.switch-text span {
  font-size: 10.5px;
  color: var(--ink-3);
}

.switch {
  flex: none;
  width: 36px;
  height: 21px;
  border-radius: 999px;
  background: #d5dce8;
  position: relative;
  transition: background 0.18s ease;
}

.switch.on {
  background: var(--accent);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.22);
  transition: transform 0.18s ease;
}

.switch.on .knob {
  transform: translateX(15px);
}

.limit-select {
  width: 120px;
  flex: none;
  height: 32px;
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.action {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 12px;
  text-align: left;
  border-radius: 9px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink-2);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.action:hover {
  border-color: var(--line-strong);
  background: var(--panel-2);
}

.action.danger {
  color: var(--red);
}

.action.danger:hover {
  border-color: #f0c7c7;
  background: var(--red-soft);
}

.action span {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.action strong {
  font-size: 11.5px;
  font-weight: 600;
}

.action small {
  font-size: 10px;
  color: var(--ink-3);
}

.danger-zone {
  padding: 13px 14px;
  border: 1px solid #f1c6c6;
  border-radius: 10px;
  background: #fffafa;
}

.danger-zone .section-title {
  color: #b42318;
}

.danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.about {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
}

.about-brand,
.about-links {
  display: flex;
  align-items: center;
  gap: 7px;
}

.about-links a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--ink-3);
}

.about-links a:hover {
  color: var(--accent);
}

.dot {
  color: #c3cbd8;
}

.preview-tag {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--violet-soft);
  color: var(--violet);
  font-size: 9px;
}
</style>
