<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RequestTab } from '@/lib/request'
import { methodAllowsBody, pathParamNames } from '@/lib/request'
import { getEndpoint, type IdKind } from '@/lib/apiCatalog'
import { app, updateSettings } from '@/stores/app'
import IdPicker from './IdPicker.vue'
import KeyValueEditor from './KeyValueEditor.vue'
import { Bookmark, Braces, ExternalLink, Play, RotateCcw, Save, Trash2 } from 'lucide-vue-next'

const props = defineProps<{ tab: RequestTab; sending: boolean }>()

const emit = defineEmits<{
  send: []
  save: []
  deleteSaved: []
}>()

const bodyError = ref<string | null>(null)

const endpoint = computed(() =>
  props.tab.endpointId ? getEndpoint(props.tab.endpointId) : undefined,
)

const params = computed(() =>
  pathParamNames(props.tab.path).map((name) => {
    const meta = endpoint.value?.pathParams.find((item) => item.name === name)
    return { name, label: meta?.label ?? name, kind: (meta?.kind ?? 'generic') as IdKind }
  }),
)

const baseUrl = computed(() => {
  const creds = app.credentials
  if (!creds) return ''
  if (creds.environment === 'sandbox') return 'https://sandbox.api.sgroup.qq.com'
  if (creds.environment === 'custom') return creds.baseUrl ?? ''
  return 'https://api.sgroup.qq.com'
})

const urlPreview = computed(() => {
  let path = props.tab.path.trim()
  for (const param of params.value) {
    const value = props.tab.pathParams[param.name]
    if (value) path = path.replace(`{${param.name}}`, value)
  }
  if (/^https?:\/\//i.test(path)) return path
  const base = baseUrl.value.replace(/\/+$/, '')
  const query = props.tab.query
    .filter((row) => row.enabled && row.key.trim())
    .map((row) => `${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`)
    .join('&')
  return `${base}${path}${query ? `?${query}` : ''}`
})

const canSave = computed(() => props.tab.custom || props.tab.endpointId === null)
const bodyValid = computed(() => {
  if (!props.tab.body.trim()) return true
  try {
    JSON.parse(props.tab.body)
    return true
  } catch {
    return false
  }
})

function formatParamName(name: string): string {
  return `{${name}}`
}

function onPathInput(value: string) {
  props.tab.path = value
  const names = pathParamNames(value)
  const next: Record<string, string> = {}
  for (const name of names) next[name] = props.tab.pathParams[name] ?? ''
  props.tab.pathParams = next
  if (props.tab.endpointId) {
    const current = getEndpoint(props.tab.endpointId)
    if (current && (current.path !== value || current.method !== props.tab.method)) {
      props.tab.endpointId = null
      props.tab.custom = true
      props.tab.title = '自定义请求'
    }
  }
}

function onMethodChange(value: string) {
  props.tab.method = value as RequestTab['method']
  if (props.tab.endpointId) {
    const current = getEndpoint(props.tab.endpointId)
    if (current && current.method !== value) {
      props.tab.endpointId = null
      props.tab.custom = true
      props.tab.title = '自定义请求'
    }
  }
}

function formatBody() {
  const text = props.tab.body.trim()
  if (!text) return
  try {
    props.tab.body = JSON.stringify(JSON.parse(text), null, 2)
    bodyError.value = null
  } catch (error) {
    bodyError.value = (error as Error).message
  }
}

function clearBody() {
  props.tab.body = ''
  bodyError.value = null
}

function resetTemplate() {
  const source = getEndpoint(props.tab.endpointId ?? '')
  if (!source) return
  props.tab.path = source.path
  props.tab.pathParams = {}
  props.tab.query = source.query.map((row) => ({
    key: row.name,
    value: row.placeholder,
    enabled: row.placeholder !== '',
  }))
  props.tab.body = source.body
  bodyError.value = null
}

async function toggleAutoSave(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  await updateSettings({ ...app.settings, autoSaveOnSuccess: checked })
}
</script>

<template>
  <div class="request-editor">
    <div class="url-row">
      <div class="method-wrap">
        <select
          class="method-select"
          :class="tab.method.toLowerCase()"
          :value="tab.method"
          @change="onMethodChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>
      <input
        class="input mono path-input"
        :value="tab.path"
        placeholder="/v2/groups/{group_openid}/messages"
        spellcheck="false"
        @input="onPathInput(($event.target as HTMLInputElement).value)"
      />
      <button class="btn primary send-btn" type="button" :disabled="sending" @click="emit('send')">
        <Play v-if="!sending" :size="14" fill="currentColor" />
        <span v-else class="spinner" />
        {{ sending ? '发送中' : '发送' }}
      </button>
    </div>

    <div class="url-preview">
      <span class="preview-label">真实请求</span>
      <span class="mono preview-url truncate">{{ urlPreview || '—' }}</span>
    </div>

    <div v-if="endpoint" class="endpoint-banner">
      <span class="category-pill">{{ endpoint.category }}</span>
      <span class="endpoint-name">{{ endpoint.name }}</span>
      <span class="endpoint-desc">{{ endpoint.description }}</span>
      <div class="banner-actions">
        <button class="link-btn" type="button" @click="resetTemplate">
          <RotateCcw :size="11" /> 重置模板
        </button>
        <a
          class="link-btn"
          :href="`https://bot.q.qq.com/wiki/develop/api-v2/`"
          target="_blank"
          rel="noreferrer"
        >
          文档 <ExternalLink :size="10" />
        </a>
      </div>
    </div>

    <div v-if="params.length" class="section">
      <div class="section-head">
        <span class="section-title">路径参数</span>
        <span class="section-hint">可从缓存里搜索群 / 用户，也可以直接输入</span>
      </div>
      <div class="param-grid">
        <label v-for="param in params" :key="param.name" class="param">
          <span class="param-label">
            {{ param.label }}
            <code>{{ formatParamName(param.name) }}</code>
          </span>
          <IdPicker v-model="tab.pathParams[param.name]" :kind="param.kind" />
        </label>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <span class="section-title">查询参数</span>
        <span class="section-hint">按需启用，停用的参数不会发送</span>
      </div>
      <KeyValueEditor
        v-model="tab.query"
        key-placeholder="cursor"
        value-placeholder="值"
        add-label="添加查询参数"
      />
    </div>

    <div v-if="methodAllowsBody(tab.method)" class="section">
      <div class="section-head">
        <span class="section-title">
          请求体
          <span class="badge" :class="bodyValid ? 'ok' : 'bad'">
            {{ !tab.body.trim() ? '空' : bodyValid ? 'JSON 有效' : 'JSON 无效' }}
          </span>
        </span>
        <div class="section-actions">
          <button class="link-btn" type="button" @click="formatBody">
            <Braces :size="11" /> 格式化
          </button>
          <button class="link-btn" type="button" @click="clearBody">清空</button>
        </div>
      </div>
      <div class="body-wrap">
        <textarea
          v-model="tab.body"
          class="textarea body-input"
          spellcheck="false"
          placeholder="{&#10;  &quot;content&quot;: &quot;你好&quot;&#10;}"
          @input="bodyError = null"
        />
        <span class="body-count mono">{{ tab.body.length }} chars</span>
      </div>
      <p v-if="bodyError" class="body-error">JSON 解析失败：{{ bodyError }}</p>
    </div>

    <div class="save-row">
      <div v-if="canSave" class="save-left">
        <button class="btn small" type="button" @click="emit('save')">
          <Save :size="12" />
          {{ tab.savedId ? '更新已保存接口' : '保存接口' }}
        </button>
        <button
          v-if="tab.savedId"
          class="btn small danger"
          type="button"
          @click="emit('deleteSaved')"
        >
          <Trash2 :size="12" /> 删除
        </button>
        <label class="auto-save">
          <input
            type="checkbox"
            :checked="app.settings.autoSaveOnSuccess"
            @change="toggleAutoSave"
          />
          <span class="checkbox" />
          请求成功时保存接口
        </label>
      </div>
      <div v-else class="builtin-note">
        <Bookmark :size="12" />
        内置接口无需保存；修改路径或方法后会转为自定义请求。
      </div>
      <span v-if="tab.savedHint" class="saved-hint">{{ tab.savedHint }}</span>
    </div>
  </div>
</template>

<style scoped>
.request-editor {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 16px 18px 14px;
  flex: none;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-wrap {
  position: relative;
  flex: none;
}

.method-select {
  height: 36px;
  width: 92px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--panel-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 0 8px;
  outline: none;
  cursor: pointer;
}

.method-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.method-select.get {
  color: #157347;
}
.method-select.post {
  color: #1d4ed8;
}
.method-select.put,
.method-select.patch {
  color: #9a5b00;
}
.method-select.delete {
  color: #b42318;
}

.path-input {
  flex: 1;
  height: 36px;
  font-size: 12.5px;
}

.send-btn {
  flex: none;
  height: 36px;
  min-width: 92px;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.url-preview {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: -3px;
  padding-left: 2px;
  font-size: 10.5px;
  color: var(--ink-3);
  min-width: 0;
}

.preview-label {
  flex: none;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--panel-3);
  font-size: 9.5px;
  color: var(--ink-3);
}

.preview-url {
  min-width: 0;
}

.endpoint-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 9px;
  background: linear-gradient(90deg, #f7faff, #fbfcfe);
  border: 1px solid var(--line);
  font-size: 11.5px;
}

.category-pill {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent-2);
  font-size: 9.5px;
  font-weight: 600;
}

.endpoint-name {
  font-weight: 600;
  color: var(--ink-2);
}

.endpoint-desc {
  color: var(--ink-3);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 52%;
}

.banner-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.link-btn:hover {
  color: var(--accent);
  text-decoration: none;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  min-height: 20px;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.section-hint {
  font-size: 10px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-actions {
  display: inline-flex;
  gap: 9px;
}

.badge {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
}

.badge.ok {
  color: #157347;
  background: var(--green-soft);
}

.badge.bad {
  color: #b42318;
  background: var(--red-soft);
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 9px;
}

.param {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.param-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.param-label code {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: #9aa5b8;
  background: var(--panel-3);
  padding: 0 4px;
  border-radius: 3px;
}

.body-wrap {
  position: relative;
}

.body-input {
  min-height: 128px;
  max-height: 260px;
  padding-bottom: 24px;
  background: #fbfcfe;
}

.body-input:focus {
  background: #fff;
}

.body-count {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 9px;
  color: #aab3c2;
  background: #fbfcfe;
  padding: 0 3px;
  border-radius: 3px;
}

.body-error {
  margin: 0;
  font-size: 10.5px;
  color: var(--red);
}

.save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px dashed var(--line);
}

.save-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ink-3);
  cursor: pointer;
  user-select: none;
}

.auto-save input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: #fff;
  position: relative;
  flex: none;
}

.auto-save input:checked + .checkbox {
  background: var(--accent);
  border-color: var(--accent);
}

.auto-save input:checked + .checkbox::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 7px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(42deg);
}

.builtin-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.saved-hint {
  font-size: 10.5px;
  color: var(--green);
}

@media (max-width: 1180px) {
  .endpoint-desc {
    display: none;
  }
}
</style>
