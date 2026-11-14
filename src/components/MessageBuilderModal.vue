<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  MESSAGE_KINDS,
  MESSAGE_SCOPE_LABELS,
  buildMessageBody,
  parseKeyboardJson,
  parseMessageBody,
  scopeSupportsMedia,
  validateMessageDraft,
  type MessageDraft,
  type MessageKind,
  type MessageScope,
} from '@/lib/messageBuilder'
import {
  Boxes,
  Check,
  Copy,
  FileText,
  Image,
  LayoutTemplate,
  Plus,
  Type,
  Wand2,
  X,
} from 'lucide-vue-next'
import JsonView from './JsonView.vue'
import Modal from './Modal.vue'

const props = defineProps<{ scope: MessageScope; body: string }>()

const emit = defineEmits<{
  apply: [body: Record<string, unknown>]
  close: []
}>()

const KIND_ICONS = {
  text: Type,
  markdown: FileText,
  ark: Boxes,
  embed: LayoutTemplate,
  media: Image,
}

const KEYBOARD_EXAMPLE = {
  content: {
    rows: [
      {
        buttons: [
          {
            id: '1',
            render_data: { label: '打开文档', visited_label: '打开文档', style: 0 },
            action: {
              type: 0,
              permission: { type: 2 },
              data: 'https://bot.q.qq.com/wiki/',
              enter: false,
            },
          },
        ],
      },
    ],
  },
}

const draft = reactive<MessageDraft>(parseMessageBody(props.body))
if (draft.kind === 'media' && !scopeSupportsMedia(props.scope)) {
  draft.kind = 'text'
}

const kinds = computed(() =>
  MESSAGE_KINDS.filter((meta) => meta.kind !== 'media' || scopeSupportsMedia(props.scope)),
)
const activeMeta = computed(
  () => MESSAGE_KINDS.find((meta) => meta.kind === draft.kind) ?? MESSAGE_KINDS[0],
)

const preview = computed(() => buildMessageBody(draft, props.scope))
const previewText = computed(() => JSON.stringify(preview.value, null, 2))
const validationError = computed(() => validateMessageDraft(draft, props.scope))
const keyboardError = computed(() => parseKeyboardJson(draft.keyboardJson).error)
const copied = ref(false)

function setKind(kind: MessageKind) {
  draft.kind = kind
}

function addMarkdownParam() {
  draft.markdownParams.push({ key: '', values: '' })
}

function removeMarkdownParam(index: number) {
  draft.markdownParams.splice(index, 1)
}

function addArkKv() {
  draft.arkKv.push({ key: '', value: '' })
}

function removeArkKv(index: number) {
  draft.arkKv.splice(index, 1)
}

function addEmbedField() {
  draft.embedFields.push({ name: '', value: '' })
}

function removeEmbedField(index: number) {
  draft.embedFields.splice(index, 1)
}

function insertKeyboardExample() {
  draft.keyboardJson = JSON.stringify(KEYBOARD_EXAMPLE, null, 2)
}

function clearKeyboard() {
  draft.keyboardJson = ''
}

async function copyPreview() {
  if (!navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(previewText.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    copied.value = false
  }
}

function apply() {
  if (validationError.value) return
  emit('apply', preview.value)
}
</script>

<template>
  <Modal width="860px" @close="emit('close')">
    <template #header>
      <span class="head-title">
        <Wand2 :size="15" />
        构造消息
        <span class="scope-pill">{{ MESSAGE_SCOPE_LABELS[scope] }}</span>
      </span>
    </template>

    <div class="builder">
      <div class="builder-form">
        <div class="kind-tabs">
          <button
            v-for="meta in kinds"
            :key="meta.kind"
            type="button"
            class="kind-tab"
            :class="{ active: draft.kind === meta.kind }"
            @click="setKind(meta.kind)"
          >
            <component :is="KIND_ICONS[meta.kind]" :size="13" />
            {{ meta.label }}
            <span class="kind-type">{{ meta.msgType }}</span>
          </button>
        </div>
        <p class="kind-hint">{{ activeMeta.hint }}</p>

        <label class="field">
          <span class="field-label">
            {{ draft.kind === 'text' ? '消息内容' : 'content（可选回退文本）' }}
            <span class="counter">{{ draft.content.length }} 字</span>
          </span>
          <textarea
            v-model="draft.content"
            class="textarea content-input"
            rows="3"
            placeholder="想对用户说的话…"
          />
        </label>

        <template v-if="draft.kind === 'markdown'">
          <label class="field">
            <span class="field-label">custom_template_id</span>
            <input
              v-model="draft.markdownTemplateId"
              class="input mono"
              type="text"
              placeholder="开放平台申请的 Markdown 模板 ID"
              spellcheck="false"
            />
          </label>
          <div class="field">
            <div class="field-head">
              <span class="field-label">模板参数</span>
              <button class="add-btn" type="button" @click="addMarkdownParam">
                <Plus :size="11" /> 添加参数
              </button>
            </div>
            <div
              v-for="(row, index) in draft.markdownParams"
              :key="index"
              class="row-inputs"
            >
              <input
                v-model="row.key"
                class="input mono row-key"
                type="text"
                placeholder="key"
                spellcheck="false"
              />
              <input
                v-model="row.values"
                class="input"
                type="text"
                placeholder="values，多个值用逗号分隔"
                spellcheck="false"
              />
              <button
                class="remove-btn"
                type="button"
                title="删除该参数"
                @click="removeMarkdownParam(index)"
              >
                <X :size="13" />
              </button>
            </div>
            <p class="field-hint">params 与模板里的占位符一一对应；values 用中文或英文逗号分隔。</p>
          </div>
        </template>

        <template v-if="draft.kind === 'ark'">
          <label class="field">
            <span class="field-label">template_id</span>
            <input
              v-model="draft.arkTemplateId"
              class="input mono"
              type="text"
              placeholder="例如 23"
              spellcheck="false"
            />
          </label>
          <div class="field">
            <div class="field-head">
              <span class="field-label">模板数据 kv</span>
              <button class="add-btn" type="button" @click="addArkKv">
                <Plus :size="11" /> 添加字段
              </button>
            </div>
            <div v-for="(row, index) in draft.arkKv" :key="index" class="row-inputs">
              <input
                v-model="row.key"
                class="input mono row-key"
                type="text"
                placeholder="key"
                spellcheck="false"
              />
              <input
                v-model="row.value"
                class="input"
                type="text"
                placeholder="value"
                spellcheck="false"
              />
              <button
                class="remove-btn"
                type="button"
                title="删除该字段"
                @click="removeArkKv(index)"
              >
                <X :size="13" />
              </button>
            </div>
            <p class="field-hint">kv 的 key 需与 Ark 模板中的占位符一致。</p>
          </div>
        </template>

        <template v-if="draft.kind === 'embed'">
          <label class="field">
            <span class="field-label">标题</span>
            <input
              v-model="draft.embedTitle"
              class="input"
              type="text"
              placeholder="卡片标题"
              spellcheck="false"
            />
          </label>
          <label class="field">
            <span class="field-label">描述</span>
            <textarea
              v-model="draft.embedPrompt"
              class="textarea"
              rows="2"
              placeholder="卡片描述（可留空）"
            />
          </label>
          <label class="field">
            <span class="field-label">缩略图 URL</span>
            <input
              v-model="draft.embedThumbnail"
              class="input mono"
              type="text"
              placeholder="https://example.com/image.png"
              spellcheck="false"
            />
          </label>
          <div class="field">
            <div class="field-head">
              <span class="field-label">字段列表</span>
              <button class="add-btn" type="button" @click="addEmbedField">
                <Plus :size="11" /> 添加字段
              </button>
            </div>
            <div v-for="(row, index) in draft.embedFields" :key="index" class="row-inputs">
              <input
                v-model="row.name"
                class="input mono row-key"
                type="text"
                placeholder="字段名"
                spellcheck="false"
              />
              <input
                v-model="row.value"
                class="input"
                type="text"
                placeholder="字段值"
                spellcheck="false"
              />
              <button
                class="remove-btn"
                type="button"
                title="删除该字段"
                @click="removeEmbedField(index)"
              >
                <X :size="13" />
              </button>
            </div>
          </div>
        </template>

        <template v-if="draft.kind === 'media'">
          <label class="field">
            <span class="field-label">file_info</span>
            <input
              v-model="draft.mediaFileInfo"
              class="input mono"
              type="text"
              placeholder="上传接口返回的 file_info"
              spellcheck="false"
            />
          </label>
          <p class="field-hint">
            先调用「上传群聊 / 单聊富媒体文件」接口（srv_send_msg 设为 false），把返回的 file_info 填在这里。
          </p>
        </template>

        <section class="section">
          <h3 class="section-title">被动回复</h3>
          <div class="field-row" :class="{ single: scope === 'channel' || scope === 'dm' }">
            <label class="field">
              <span class="field-label">msg_id</span>
              <input
                v-model="draft.msgId"
                class="input mono"
                type="text"
                placeholder="事件里的消息 ID，主动消息留空"
                spellcheck="false"
              />
            </label>
            <label v-if="scope === 'group' || scope === 'c2c'" class="field">
              <span class="field-label">msg_seq</span>
              <input
                v-model="draft.msgSeq"
                class="input mono"
                type="number"
                min="1"
                step="1"
                placeholder="1"
              />
            </label>
          </div>
          <p class="field-hint">
            被动回复需在收到消息后 5 分钟内发出并填写 msg_id；同一 msg_id 的多条回复用 msg_seq 区分，主动消息留空即可。
          </p>
        </section>

        <section class="section">
          <h3 class="section-title">消息引用</h3>
          <label class="field">
            <span class="field-label">message_id</span>
            <input
              v-model="draft.referenceId"
              class="input mono"
              type="text"
              placeholder="要引用的历史消息 ID（可留空）"
              spellcheck="false"
            />
          </label>
          <label class="check">
            <input v-model="draft.ignoreReferenceError" type="checkbox" />
            <span class="check-box" />
            引用消息不存在时不报错（ignore_get_message_error）
          </label>
        </section>

        <section class="section">
          <div class="section-head">
            <h3 class="section-title">按钮 keyboard</h3>
            <div class="section-actions">
              <button class="link-btn" type="button" @click="insertKeyboardExample">
                插入示例
              </button>
              <button class="link-btn" type="button" @click="clearKeyboard">清空</button>
            </div>
          </div>
          <textarea
            v-model="draft.keyboardJson"
            class="textarea keyboard-input"
            rows="4"
            spellcheck="false"
            placeholder="可选：直接粘贴 keyboard JSON"
          />
          <p v-if="keyboardError" class="field-error">{{ keyboardError }}</p>
          <p v-else class="field-hint">
            填写后请求体会带上 keyboard；不确定结构时可先插入示例再改。
          </p>
        </section>
      </div>

      <aside class="builder-preview">
        <div class="preview-head">
          <span class="preview-title">请求体预览</span>
          <button
            class="copy-btn"
            type="button"
            :title="copied ? '已复制' : '复制 JSON'"
            @click="copyPreview"
          >
            <Check v-if="copied" :size="12" />
            <Copy v-else :size="12" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <div class="preview-body"><JsonView :value="preview" /></div>
        <p class="preview-hint">点击「填入请求体」会用这份 JSON 覆盖当前请求体。</p>
      </aside>
    </div>

    <template #footer>
      <span v-if="validationError" class="foot-error">{{ validationError }}</span>
      <button class="btn" type="button" @click="emit('close')">取消</button>
      <button class="btn primary" type="button" :disabled="!!validationError" @click="apply">
        <Wand2 :size="13" /> 填入请求体
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.head-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.scope-pill {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--accent-line);
  background: var(--accent-soft);
  color: var(--accent-2);
  font-size: 10px;
  font-weight: 600;
}

.builder {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}

.builder-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.kind-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  background: var(--panel-3);
  border-radius: 9px;
  align-self: flex-start;
}

.kind-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 7px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.kind-tab:hover {
  color: var(--ink-2);
}

.kind-tab.active {
  background: var(--panel);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}

.kind-type {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-3);
  background: var(--panel);
  padding: 0 4px;
  border-radius: 999px;
}

.kind-tab.active .kind-type {
  background: var(--accent-soft);
  color: var(--accent);
}

.kind-hint {
  margin: -6px 0 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--ink-3);
}

.counter {
  font-family: var(--font-sans);
  font-size: 10px;
  color: #aab3c2;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.content-input {
  min-height: 92px;
}

.keyboard-input {
  min-height: 82px;
}

.row-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-key {
  flex: 0 0 32%;
}

.add-btn,
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: var(--accent);
}

.add-btn:hover,
.link-btn:hover {
  color: var(--accent-2);
  text-decoration: none;
}

.remove-btn {
  flex: none;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--ink-3);
}

.remove-btn:hover {
  background: var(--red-soft);
  color: var(--red);
}

.field-hint {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-3);
}

.field-error {
  margin: 0;
  font-size: 10.5px;
  color: var(--red);
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.section-title {
  margin: 0;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-actions {
  display: inline-flex;
  gap: 10px;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}

.field-row.single {
  grid-template-columns: minmax(0, 1fr);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: var(--ink-3);
  cursor: pointer;
  user-select: none;
}

.check input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.check-box {
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: #fff;
  position: relative;
}

.check input:checked + .check-box {
  background: var(--accent);
  border-color: var(--accent);
}

.check input:checked + .check-box::after {
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

.builder-preview {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preview-title {
  font-size: 11.5px;
  font-weight: 650;
  color: var(--ink-2);
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--ink-3);
}

.copy-btn:hover {
  color: var(--accent);
}

.preview-body {
  max-height: 460px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #1e293b;
  background: #0f172a;
}

.preview-hint {
  margin: 0;
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-3);
}

.foot-error {
  margin-right: auto;
  font-size: 10.5px;
  color: var(--red);
  line-height: 1.4;
}

@media (max-width: 820px) {
  .builder {
    grid-template-columns: minmax(0, 1fr);
  }

  .builder-preview {
    position: static;
  }
}
</style>
