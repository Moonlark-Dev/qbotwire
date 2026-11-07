<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Credentials, Environment } from '@/types'
import { Eye, EyeOff, KeyRound, Link2, ShieldCheck, Sparkles } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    initial?: Credentials | null
    submitLabel?: string
    busy?: boolean
    error?: string | null
    mode?: 'tauri' | 'mock'
  }>(),
  { initial: null, submitLabel: '连接并保存', busy: false, error: null, mode: 'tauri' },
)

const emit = defineEmits<{ submit: [credentials: Credentials] }>()

const INTENT_OPTIONS = [
  { bit: 1 << 25, name: '群与单聊消息', desc: '群 @ 消息、单聊消息、入群/好友事件' },
  { bit: 1 << 9, name: '频道消息', desc: '频道公开消息' },
  { bit: 1 << 30, name: '频道 @ 消息', desc: '公域频道 @ 消息' },
  { bit: 1 << 0, name: '频道事件', desc: '频道、子频道创建与更新' },
  { bit: 1 << 1, name: '频道成员', desc: '成员加入、更新、离开' },
  { bit: 1 << 12, name: '频道私信', desc: '频道私信消息' },
  { bit: 1 << 10, name: '表情表态', desc: '频道消息表情回应' },
  { bit: 1 << 26, name: '互动按钮', desc: '按钮点击 INTERACTION_CREATE' },
]

const ENVIRONMENTS: Array<{ value: Environment; label: string; hint: string }> = [
  { value: 'production', label: '正式环境', hint: 'api.sgroup.qq.com' },
  { value: 'sandbox', label: '沙箱环境', hint: 'sandbox.api.sgroup.qq.com' },
  { value: 'custom', label: '自定义', hint: '本地沙箱 / 代理' },
]

const form = reactive({
  appId: props.initial?.appId ?? '',
  clientSecret: props.initial?.clientSecret ?? '',
  environment: (props.initial?.environment ?? 'production') as Environment,
  baseUrl: props.initial?.baseUrl ?? '',
  tokenUrl: props.initial?.tokenUrl ?? '',
  intents: props.initial?.intents ?? 1 << 25,
})

const showSecret = ref(false)
const advanced = ref(Boolean(props.initial?.tokenUrl))
const localError = ref<string | null>(null)

watch(
  () => props.initial,
  (value) => {
    if (!value) return
    form.appId = value.appId
    form.clientSecret = value.clientSecret
    form.environment = value.environment
    form.baseUrl = value.baseUrl ?? ''
    form.tokenUrl = value.tokenUrl ?? ''
    form.intents = value.intents
  },
)

const recommended = 1 << 25
const allIntents = INTENT_OPTIONS.reduce((acc, item) => acc | item.bit, 0)

function toggleIntent(bit: number) {
  form.intents = form.intents & bit ? form.intents & ~bit : form.intents | bit
}

function useRecommended() {
  form.intents = recommended
}

function useAll() {
  form.intents = allIntents
}

const custom = computed(() => form.environment === 'custom')

const baseUrlPreview = computed(() => {
  if (form.environment === 'production') return 'https://api.sgroup.qq.com'
  if (form.environment === 'sandbox') return 'https://sandbox.api.sgroup.qq.com'
  return form.baseUrl || 'https://your-sandbox.example.com'
})

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function validate(): string | null {
  if (!/^\d{5,20}$/.test(form.appId.trim())) return 'AppID 应为 5-20 位数字'
  if (form.clientSecret.trim().length < 6) return 'AppSecret 至少 6 个字符'
  if (custom.value) {
    const base = normalizeBaseUrl(form.baseUrl)
    if (!/^https?:\/\/[^\s]+$/i.test(base)) return '自定义 Base URL 需要以 http:// 或 https:// 开头'
    if (form.tokenUrl.trim() && !/^https?:\/\/[^\s]+$/i.test(form.tokenUrl.trim())) {
      return '自定义 Token URL 需要以 http:// 或 https:// 开头'
    }
  }
  if (!form.intents) return '至少选择一项事件订阅（Intents）'
  return null
}

function submit() {
  const error = validate()
  localError.value = error
  if (error) return
  emit('submit', {
    appId: form.appId.trim(),
    clientSecret: form.clientSecret.trim(),
    environment: form.environment,
    baseUrl: custom.value ? normalizeBaseUrl(form.baseUrl) : null,
    tokenUrl: form.tokenUrl.trim() || null,
    intents: form.intents,
  })
}

function fillDemo() {
  form.appId = '102030405'
  form.clientSecret = 'qbotwire-demo-secret'
  form.environment = 'sandbox'
  form.intents = recommended
}
</script>

<template>
  <form class="credential-form" @submit.prevent="submit">
    <div v-if="mode === 'mock'" class="preview-note">
      <Sparkles :size="15" />
      <div>
        <strong>浏览器预览模式</strong>
        <span>当前界面使用模拟数据，不会连接腾讯服务器。填写任意凭据即可体验。</span>
      </div>
      <button type="button" class="demo-link" @click="fillDemo">填入演示凭据</button>
    </div>

    <div class="field-grid">
      <label class="field">
        <span class="label">AppID</span>
        <div class="control">
          <KeyRound :size="14" class="leading" />
          <input
            v-model="form.appId"
            class="input mono"
            inputmode="numeric"
            placeholder="例如 102030405"
            autocomplete="off"
            spellcheck="false"
            autofocus
          />
        </div>
        <span class="hint">QQ 开放平台机器人资料页的 AppID</span>
      </label>

      <label class="field">
        <span class="label">AppSecret</span>
        <div class="control">
          <ShieldCheck :size="14" class="leading" />
          <input
            v-model="form.clientSecret"
            class="input mono"
            :type="showSecret ? 'text' : 'password'"
            placeholder="机器人密钥"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="trailing"
            :aria-label="showSecret ? '隐藏密钥' : '显示密钥'"
            @click="showSecret = !showSecret"
          >
            <component :is="showSecret ? EyeOff : Eye" :size="14" />
          </button>
        </div>
        <span class="hint">用于换取 AccessToken，仅保存在本机</span>
      </label>
    </div>

    <div class="field">
      <span class="label">运行环境</span>
      <div class="segment">
        <button
          v-for="env in ENVIRONMENTS"
          :key="env.value"
          type="button"
          class="segment-item"
          :class="{ active: form.environment === env.value }"
          @click="form.environment = env.value"
        >
          <span>{{ env.label }}</span>
          <small>{{ env.hint }}</small>
        </button>
      </div>
      <div class="endpoint">
        <Link2 :size="12" />
        <span class="mono">{{ baseUrlPreview }}</span>
      </div>
    </div>

    <div v-if="custom" class="field-grid">
      <label class="field">
        <span class="label">自定义 Base URL</span>
        <input
          v-model="form.baseUrl"
          class="input mono"
          placeholder="http://127.0.0.1:5700"
          spellcheck="false"
        />
        <span class="hint">所有 REST 请求都会拼接到这个地址</span>
      </label>
      <label class="field">
        <span class="label">Token URL（可选）</span>
        <input
          v-model="form.tokenUrl"
          class="input mono"
          placeholder="默认：{Base URL}/app/getAppAccessToken"
          spellcheck="false"
        />
      </label>
    </div>

    <div class="field">
      <div class="label-row">
        <span class="label">事件订阅 Intents</span>
        <div class="preset-links">
          <button type="button" @click="useRecommended">推荐</button>
          <span>·</span>
          <button type="button" @click="useAll">全选</button>
        </div>
      </div>
      <div class="intents">
        <label
          v-for="option in INTENT_OPTIONS"
          :key="option.bit"
          class="intent"
          :class="{ checked: (form.intents & option.bit) !== 0 }"
        >
          <input
            type="checkbox"
            :checked="(form.intents & option.bit) !== 0"
            @change="toggleIntent(option.bit)"
          />
          <span class="intent-box" />
          <span class="intent-text">
            <span class="intent-name">{{ option.name }}</span>
            <span class="intent-desc">{{ option.desc }}</span>
          </span>
        </label>
      </div>
      <span class="hint mono">intents = {{ form.intents }}</span>
    </div>

    <button type="button" class="advanced" @click="advanced = !advanced">
      {{ advanced ? '收起高级选项' : '高级选项' }}
    </button>

    <label v-if="advanced" class="field">
      <span class="label">Token 地址覆盖</span>
      <input
        v-model="form.tokenUrl"
        class="input mono"
        placeholder="留空则使用默认地址"
        spellcheck="false"
      />
      <span class="hint">正式环境默认 https://bots.qq.com/app/getAppAccessToken</span>
    </label>

    <div v-if="localError || error" class="error-box">
      {{ localError || error }}
    </div>

    <button class="btn primary submit" type="submit" :disabled="busy">
      <span v-if="busy" class="spinner" />
      <span>{{ busy ? '正在连接…' : submitLabel }}</span>
    </button>

    <p class="privacy">
      凭据仅写入本机应用数据目录（0600 权限），除换取 AccessToken 外不会发送到任何第三方。
    </p>
  </form>
</template>

<style scoped>
.credential-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.preview-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--violet-soft);
  border: 1px solid #e3d5ff;
  color: #5b21b6;
  font-size: 12px;
}

.preview-note strong {
  display: block;
  font-size: 12px;
}

.preview-note span {
  color: #6d5a91;
}

.preview-note .demo-link {
  margin-left: auto;
  flex: none;
  color: var(--violet);
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preset-links {
  display: inline-flex;
  gap: 6px;
  color: var(--ink-3);
  font-size: 11px;
}

.preset-links button {
  color: var(--accent);
  font-size: 11px;
}

.preset-links button:hover {
  text-decoration: underline;
}

.control {
  position: relative;
  display: flex;
  align-items: center;
}

.control .input {
  padding-left: 31px;
  padding-right: 32px;
  height: 38px;
}

.leading {
  position: absolute;
  left: 10px;
  color: var(--ink-3);
  pointer-events: none;
}

.trailing {
  position: absolute;
  right: 6px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  border-radius: 6px;
}

.trailing:hover {
  background: var(--panel-3);
  color: var(--ink);
}

.hint {
  font-size: 10.5px;
  color: var(--ink-3);
}

.segment {
  display: flex;
  gap: 6px;
  padding: 3px;
  background: var(--panel-3);
  border-radius: 9px;
}

.segment-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 6px 10px;
  border-radius: 7px;
  color: var(--ink-2);
  transition: background 0.12s ease, box-shadow 0.12s ease;
}

.segment-item span {
  font-size: 12px;
  font-weight: 600;
}

.segment-item small {
  font-size: 10px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.segment-item.active {
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  color: var(--accent);
}

.segment-item.active small {
  color: var(--ink-3);
}

.endpoint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--ink-3);
  padding-left: 2px;
}

.intents {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.intent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}

.intent:hover {
  border-color: var(--line-strong);
  background: var(--panel-2);
}

.intent.checked {
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.intent input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.intent-box {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 1px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: #fff;
  position: relative;
}

.intent.checked .intent-box {
  background: var(--accent);
  border-color: var(--accent);
}

.intent.checked .intent-box::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(42deg);
}

.intent-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.intent-name {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-2);
}

.intent-desc {
  font-size: 10px;
  color: var(--ink-3);
  line-height: 1.35;
}

.advanced {
  align-self: flex-start;
  font-size: 11px;
  color: var(--ink-3);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.advanced:hover {
  color: var(--ink-2);
}

.error-box {
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid #f1c6c6;
  background: var(--red-soft);
  color: #b42318;
  font-size: 12px;
}

.submit {
  height: 40px;
  margin-top: 2px;
  font-size: 13px;
}

.spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.privacy {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-3);
}

@media (max-width: 720px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
  .intents {
    grid-template-columns: 1fr;
  }
}
</style>
