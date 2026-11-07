<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ApiResponse } from '@/types'
import JsonView from './JsonView.vue'
import { formatBytes, formatDuration } from '@/lib/format'
import { Check, Copy, Inbox, SquareArrowOutUpRight } from 'lucide-vue-next'

const props = defineProps<{
  response: ApiResponse | null
  error: string | null
  sending: boolean
}>()

const tab = ref<'body' | 'headers'>('body')
const copied = ref<'body' | 'url' | null>(null)

const statusTone = computed(() => {
  if (!props.response) return 'idle'
  const code = props.response.status
  if (code >= 200 && code < 300) return 'ok'
  if (code >= 300 && code < 400) return 'warn'
  return 'bad'
})

const headers = computed(() => {
  if (!props.response) return []
  return Object.entries(props.response.headers).sort(([a], [b]) => a.localeCompare(b))
})

const rawSize = computed(() => new TextEncoder().encode(props.response?.raw ?? '').length)

const isJson = computed(() => {
  if (!props.response) return false
  const type = props.response.headers['content-type'] ?? ''
  if (type.includes('json')) return true
  try {
    JSON.parse(props.response.raw)
    return true
  } catch {
    return false
  }
})

const jsonValue = computed(() => {
  if (!props.response) return null
  if (props.response.body !== null && props.response.body !== undefined) return props.response.body
  try {
    return JSON.parse(props.response.raw)
  } catch {
    return null
  }
})

async function copy(kind: 'body' | 'url') {
  if (!props.response) return
  const text = kind === 'body' ? props.response.raw : props.response.url
  try {
    await navigator.clipboard.writeText(text)
    copied.value = kind
    window.setTimeout(() => {
      if (copied.value === kind) copied.value = null
    }, 1400)
  } catch {
    /* clipboard can be unavailable in the webview */
  }
}
</script>

<template>
  <section class="response-panel" :class="{ error: error }">
    <header class="resp-head">
      <div class="resp-title">
        <span class="label">响应</span>
        <span v-if="response" class="status" :class="statusTone">
          {{ response.status }}
          <span class="status-text">{{ response.statusText }}</span>
        </span>
        <span v-if="sending" class="sending">发送中…</span>
        <span v-if="response" class="metric mono">
          {{ formatDuration(response.elapsedMs) }} · {{ formatBytes(rawSize) }}
        </span>
      </div>
      <div v-if="response" class="resp-actions">
        <div class="switch">
          <button
            type="button"
            class="switch-btn"
            :class="{ active: tab === 'body' }"
            @click="tab = 'body'"
          >
            响应体
          </button>
          <button
            type="button"
            class="switch-btn"
            :class="{ active: tab === 'headers' }"
            @click="tab = 'headers'"
          >
            响应头 {{ headers.length }}
          </button>
        </div>
        <button class="icon-btn" type="button" title="复制响应体" @click="copy('body')">
          <Check v-if="copied === 'body'" :size="13" class="ok" />
          <Copy v-else :size="13" />
        </button>
        <button class="icon-btn" type="button" title="复制请求 URL" @click="copy('url')">
          <Check v-if="copied === 'url'" :size="13" class="ok" />
          <SquareArrowOutUpRight v-else :size="13" />
        </button>
      </div>
    </header>

    <div class="resp-url mono truncate" v-if="response">{{ response.url }}</div>

    <div class="resp-body">
      <div v-if="sending && !response" class="state">
        <span class="spinner" />
        <p>正在请求 QQ Bot API…</p>
      </div>

      <div v-else-if="error" class="state error-state">
        <p class="state-title">请求未完成</p>
        <p class="state-message">{{ error }}</p>
      </div>

      <div v-else-if="!response" class="state">
        <Inbox :size="22" class="state-icon" />
        <p class="state-title">等待请求</p>
        <p class="state-message">选择左侧接口或自己构造请求，点击发送后在这里查看响应。</p>
      </div>

      <template v-else>
        <div v-if="tab === 'body'" class="code-scroll">
          <JsonView v-if="isJson" :value="jsonValue ?? response.raw" />
          <pre v-else class="raw">{{ response.raw }}</pre>
        </div>
        <div v-else class="headers-scroll">
          <div class="header-row head">
            <span>Header</span>
            <span>Value</span>
          </div>
          <div v-for="[key, value] in headers" :key="key" class="header-row">
            <span class="header-key mono">{{ key }}</span>
            <span class="header-value mono">{{ value }}</span>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.response-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 280px;
  margin: 0 18px 16px;
  border-radius: 12px;
  border: 1px solid #1e293b;
  background: #0f172a;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.resp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: #131d33;
  border-bottom: 1px solid #1e2b45;
  flex: none;
}

.resp-title {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.label {
  font-size: 11px;
  font-weight: 650;
  color: #c6d2e8;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 5px;
}

.status.ok {
  color: #86efac;
  background: rgba(34, 197, 94, 0.12);
}

.status.warn {
  color: #fcd34d;
  background: rgba(245, 158, 11, 0.12);
}

.status.bad {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.14);
}

.status-text {
  font-family: var(--font-sans);
  font-weight: 500;
  opacity: 0.75;
}

.sending {
  font-size: 10.5px;
  color: #93c5fd;
}

.metric {
  font-size: 10px;
  color: #7d8ba3;
}

.resp-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: #0d1629;
  border: 1px solid #1e2b45;
}

.switch-btn {
  height: 21px;
  padding: 0 7px;
  border-radius: 4px;
  font-size: 10px;
  color: #8b9bb4;
}

.switch-btn:hover {
  color: #d4deee;
}

.switch-btn.active {
  background: #233350;
  color: #e2e8f0;
}

.icon-btn {
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #8b9bb4;
  border-radius: 5px;
}

.icon-btn:hover {
  background: #1b2740;
  color: #d4deee;
}

.ok {
  color: #4ade80;
}

.resp-url {
  padding: 5px 12px;
  font-size: 9.5px;
  color: #64748b;
  background: #0b1324;
  border-bottom: 1px solid #172238;
  flex: none;
}

.resp-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 24px;
  text-align: center;
  color: #7d8ba3;
}

.state-icon {
  color: #43526b;
  margin-bottom: 4px;
}

.state-title {
  margin: 0;
  font-size: 12px;
  color: #a9b7cc;
}

.state-message {
  margin: 0;
  max-width: 420px;
  font-size: 10.5px;
  line-height: 1.7;
  color: #66748c;
}

.error-state {
  align-items: flex-start;
  text-align: left;
  padding: 16px 18px;
}

.error-state .state-title {
  color: #fca5a5;
  font-weight: 600;
}

.error-state .state-message {
  color: #f3b4b4;
  white-space: pre-wrap;
}

.code-scroll {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
  min-height: 0;
}

.raw {
  margin: 0;
  color: #d8e0ef;
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.headers-scroll {
  flex: 1;
  overflow: auto;
  min-height: 0;
  padding: 6px 0;
}

.header-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  padding: 5px 14px;
  font-size: 10.5px;
  color: #b8c5da;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.header-row.head {
  color: #6f7f99;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 9px;
  position: sticky;
  top: 0;
  background: #0f172a;
}

.header-key {
  color: #8cc8ff;
  word-break: break-all;
}

.header-value {
  color: #a5e8b8;
  word-break: break-all;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #263450;
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 6px;
}
</style>
