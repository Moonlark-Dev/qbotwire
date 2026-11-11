<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { app, findUser } from '@/stores/app'
import { formatClock, truncate } from '@/lib/format'
import {
  applyArkPreset,
  buildMessagePayload,
  createDefaultButton,
  createDefaultDraft,
  detectMessageScene,
  extractReplyCandidates,
  MAX_BUTTONS_PER_ROW,
  MAX_KEYBOARD_ROWS,
  parseMessageDraft,
  stringifyMessagePayload,
  validateMessageDraft,
  type ArkKvDraft,
  type ButtonActionType,
  type ButtonPermissionType,
  type ButtonStyle,
  type KeyboardMode,
  type MarkdownMode,
  type MessageDraft,
  type MessageKind,
  type MessageScene,
  type ReplyCandidate,
} from '@/lib/messageBuilder'
import Modal from './Modal.vue'
import JsonView from './JsonView.vue'
import OpenIdInsertModal from './OpenIdInsertModal.vue'
import {
  AlertTriangle,
  AtSign,
  Check,
  Copy,
  Info,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-vue-next'

const props = defineProps<{
  path: string
  body: string
}>()

const emit = defineEmits<{
  apply: [body: string]
  close: []
}>()

type PickerTarget = 'mention-text' | 'raw-text' | 'mention-md' | 'raw-md' | 'button-user'

const initial = parseMessageDraft(props.body, props.path)
const draft = reactive<MessageDraft>(initial.draft)
const notice = ref<string | null>(initial.notice)

const selectedRow = ref(0)
const selectedCol = ref(0)
const pickerTarget = ref<PickerTarget | null>(null)
const eventPickerOpen = ref(false)
const copied = ref(false)

const newUserId = ref('')
const newRoleId = ref('')

const textInput = ref<HTMLTextAreaElement | null>(null)
const mdInput = ref<HTMLTextAreaElement | null>(null)
const textCaret = ref<{ start: number; end: number } | null>(null)
const mdCaret = ref<{ start: number; end: number } | null>(null)

const KIND_TABS: Array<{ key: MessageKind; label: string; v2Tag: string; guildTag: string }> = [
  { key: 'text', label: '文本', v2Tag: '0', guildTag: 'content' },
  { key: 'markdown', label: 'Markdown', v2Tag: '2', guildTag: 'md' },
  { key: 'media', label: '富媒体', v2Tag: '7', guildTag: 'image' },
  { key: 'ark', label: 'Ark 卡片', v2Tag: '3', guildTag: 'ark' },
  { key: 'embed', label: 'Embed', v2Tag: '4', guildTag: 'embed' },
]

const KEYBOARD_MODES: Array<{ key: KeyboardMode; label: string }> = [
  { key: 'none', label: '不附带' },
  { key: 'template', label: '按钮模板 ID' },
  { key: 'custom', label: '自定义面板' },
]

const payload = computed(() => buildMessagePayload(draft))
const payloadJson = computed(() => stringifyMessagePayload(draft))
const diagnostics = computed(() => validateMessageDraft(draft))
const replyCandidates = computed(() => extractReplyCandidates(app.events, 8))
const extraCount = computed(() => Object.keys(draft.extra).length)
const isPassiveReply = computed(() => Boolean(draft.msgId.trim() || draft.eventId.trim()))

const activeButton = computed(
  () => draft.keyboardRows[selectedRow.value]?.buttons[selectedCol.value] ?? null,
)

function clampSelection() {
  if (!draft.keyboardRows.length) {
    selectedRow.value = 0
    selectedCol.value = 0
    return
  }
  if (selectedRow.value >= draft.keyboardRows.length) {
    selectedRow.value = draft.keyboardRows.length - 1
  }
  const row = draft.keyboardRows[selectedRow.value]
  if (!row.buttons.length) {
    selectedCol.value = 0
  } else if (selectedCol.value >= row.buttons.length) {
    selectedCol.value = row.buttons.length - 1
  }
}

function setScene(scene: MessageScene) {
  draft.scene = scene
}

function setKind(kind: MessageKind) {
  draft.kind = kind
}

function setMarkdownMode(mode: MarkdownMode) {
  draft.markdownMode = mode
}

function setKeyboardMode(mode: KeyboardMode) {
  draft.keyboardMode = mode
  if (mode === 'custom' && !draft.keyboardRows.length) {
    draft.keyboardRows = [{ buttons: [createDefaultButton(1)] }]
  }
  clampSelection()
}

function rememberTextCaret() {
  const el = textInput.value
  if (!el) return
  if (document.activeElement !== el) {
    textCaret.value = { start: el.value.length, end: el.value.length }
    return
  }
  textCaret.value = {
    start: el.selectionStart ?? el.value.length,
    end: el.selectionEnd ?? el.value.length,
  }
}

function rememberMdCaret() {
  const el = mdInput.value
  if (!el) return
  if (document.activeElement !== el) {
    mdCaret.value = { start: el.value.length, end: el.value.length }
    return
  }
  mdCaret.value = {
    start: el.selectionStart ?? el.value.length,
    end: el.selectionEnd ?? el.value.length,
  }
}

function insertIntoField(
  field: 'text' | 'md',
  snippet: string,
) {
  const current = field === 'text' ? draft.content : draft.markdownContent
  const saved = field === 'text' ? textCaret.value : mdCaret.value
  const range = saved ?? { start: current.length, end: current.length }
  const start = Math.max(0, Math.min(range.start, current.length))
  const end = Math.max(start, Math.min(range.end, current.length))
  const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`
  const cursor = start + snippet.length
  if (field === 'text') {
    draft.content = next
    textCaret.value = { start: cursor, end: cursor }
    void nextTick(() => {
      const el = textInput.value
      if (!el) return
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  } else {
    draft.markdownContent = next
    mdCaret.value = { start: cursor, end: cursor }
    void nextTick(() => {
      const el = mdInput.value
      if (!el) return
      el.focus()
      el.setSelectionRange(cursor, cursor)
    })
  }
}

function openPicker(target: PickerTarget) {
  if (target === 'mention-text' || target === 'raw-text') rememberTextCaret()
  if (target === 'mention-md' || target === 'raw-md') rememberMdCaret()
  pickerTarget.value = target
}

function onPickOpenId(openid: string) {
  const target = pickerTarget.value
  pickerTarget.value = null
  if (!target) return
  if (target === 'mention-text') {
    insertIntoField('text', `<@!${openid}> `)
  } else if (target === 'raw-text') {
    insertIntoField('text', openid)
  } else if (target === 'mention-md') {
    insertIntoField('md', `<@!${openid}> `)
  } else if (target === 'raw-md') {
    insertIntoField('md', openid)
  } else if (target === 'button-user' && activeButton.value) {
    if (!activeButton.value.specifyUserIds.includes(openid)) {
      activeButton.value.specifyUserIds.push(openid)
    }
  }
}

function insertMdSnippet(snippet: string) {
  rememberMdCaret()
  insertIntoField('md', snippet)
}

function insertEveryone() {
  rememberTextCaret()
  insertIntoField('text', '@everyone ')
}

// Markdown template params --------------------------------------------------
function addMdParam() {
  draft.markdownParams.push({ key: '', values: [''] })
}

function removeMdParam(index: number) {
  draft.markdownParams.splice(index, 1)
  if (!draft.markdownParams.length) {
    draft.markdownParams.push({ key: '', values: [''] })
  }
}

function updateMdParamValue(index: number, valueIndex: number, value: string) {
  const row = draft.markdownParams[index]
  if (!row) return
  row.values[valueIndex] = value
}

function addMdParamValue(index: number) {
  draft.markdownParams[index]?.values.push('')
}

function removeMdParamValue(index: number, valueIndex: number) {
  const row = draft.markdownParams[index]
  if (!row || row.values.length <= 1) return
  row.values.splice(valueIndex, 1)
}

// Ark kv helpers ------------------------------------------------------------
function selectArkPreset(templateId: 23 | 24 | 37) {
  applyArkPreset(draft, templateId)
}

function addArkValueRow() {
  draft.arkKv.push({ key: '', kind: 'value', value: '', items: [] })
}

function addArkListRow() {
  draft.arkKv.push({
    key: '#LIST#',
    kind: 'list',
    value: '',
    items: [
      [
        { key: 'desc', value: '' },
        { key: 'link', value: '' },
      ],
    ],
  })
}

function removeArkRow(index: number) {
  draft.arkKv.splice(index, 1)
}

function addArkListItem(row: ArkKvDraft) {
  row.items.push([
    { key: 'desc', value: '' },
    { key: 'link', value: '' },
  ])
}

function removeArkListItem(row: ArkKvDraft, itemIndex: number) {
  row.items.splice(itemIndex, 1)
  if (!row.items.length) addArkListItem(row)
}

// Embed fields --------------------------------------------------------------
function addEmbedField() {
  draft.embedFields.push('')
}

function updateEmbedField(index: number, value: string) {
  draft.embedFields[index] = value
}

function removeEmbedField(index: number) {
  draft.embedFields.splice(index, 1)
}

// Custom keyboard helpers ---------------------------------------------------
function totalButtons(): number {
  return draft.keyboardRows.reduce((acc, row) => acc + row.buttons.length, 0)
}

function addKeyboardRow() {
  if (draft.keyboardRows.length >= MAX_KEYBOARD_ROWS) return
  const nextIndex = totalButtons() + 1
  draft.keyboardRows.push({ buttons: [createDefaultButton(nextIndex)] })
  selectedRow.value = draft.keyboardRows.length - 1
  selectedCol.value = 0
}

function removeKeyboardRow(rowIndex: number) {
  if (draft.keyboardRows.length <= 1) return
  draft.keyboardRows.splice(rowIndex, 1)
  clampSelection()
}

function addKeyboardButton(rowIndex: number) {
  const row = draft.keyboardRows[rowIndex]
  if (!row || row.buttons.length >= MAX_BUTTONS_PER_ROW) return
  const nextIndex = totalButtons() + 1
  row.buttons.push(createDefaultButton(nextIndex))
  selectedRow.value = rowIndex
  selectedCol.value = row.buttons.length - 1
}

function removeSelectedButton() {
  const row = draft.keyboardRows[selectedRow.value]
  if (!row) return
  if (row.buttons.length <= 1) {
    if (draft.keyboardRows.length > 1) {
      draft.keyboardRows.splice(selectedRow.value, 1)
    } else {
      row.buttons[0] = createDefaultButton(1)
    }
  } else {
    row.buttons.splice(selectedCol.value, 1)
  }
  clampSelection()
}

function selectButton(rowIndex: number, colIndex: number) {
  selectedRow.value = rowIndex
  selectedCol.value = colIndex
}

function onButtonStyleChange(value: string) {
  if (!activeButton.value) return
  activeButton.value.style = Number(value) === 1 ? (1 as ButtonStyle) : (0 as ButtonStyle)
}

function onButtonActionTypeChange(value: string) {
  if (!activeButton.value) return
  const num = Number(value)
  activeButton.value.actionType = (num === 0 || num === 1 || num === 2 ? num : 2) as ButtonActionType
}

function onButtonPermissionChange(value: string) {
  if (!activeButton.value) return
  const num = Number(value)
  activeButton.value.permissionType = (
    num === 0 || num === 1 || num === 2 || num === 3 ? num : 2
  ) as ButtonPermissionType
}

function addSpecifyUser() {
  const id = newUserId.value.trim()
  if (!id || !activeButton.value) return
  if (!activeButton.value.specifyUserIds.includes(id)) {
    activeButton.value.specifyUserIds.push(id)
  }
  newUserId.value = ''
}

function removeSpecifyUser(openid: string) {
  if (!activeButton.value) return
  activeButton.value.specifyUserIds = activeButton.value.specifyUserIds.filter(
    (item) => item !== openid,
  )
}

function addSpecifyRole() {
  const id = newRoleId.value.trim()
  if (!id || !activeButton.value) return
  if (!activeButton.value.specifyRoleIds.includes(id)) {
    activeButton.value.specifyRoleIds.push(id)
  }
  newRoleId.value = ''
}

function removeSpecifyRole(roleId: string) {
  if (!activeButton.value) return
  activeButton.value.specifyRoleIds = activeButton.value.specifyRoleIds.filter(
    (item) => item !== roleId,
  )
}

function userBadgeLabel(openid: string): string {
  const user = findUser(openid)
  return user?.name ? `${user.name} (${truncate(openid, 14)})` : openid
}

// Context & event reply picker ----------------------------------------------
function applyCandidate(candidate: ReplyCandidate) {
  if (candidate.targetKind === 'msg_id') {
    draft.msgId = candidate.targetId
  } else {
    draft.eventId = candidate.targetId
  }
  eventPickerOpen.value = false
}

function copyMsgIdToRef() {
  if (draft.msgId.trim()) {
    draft.refMessageId = draft.msgId.trim()
  }
}

function clearExtra() {
  draft.extra = {}
}

function resetDraft() {
  const fresh = createDefaultDraft(detectMessageScene(props.path))
  Object.assign(draft, fresh)
  notice.value = null
  selectedRow.value = 0
  selectedCol.value = 0
}

async function copyPreview() {
  try {
    await navigator.clipboard.writeText(payloadJson.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1400)
  } catch {
    /* clipboard may be unavailable */
  }
}

function confirmApply() {
  emit('apply', payloadJson.value)
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    if (pickerTarget.value !== null) return
    event.preventDefault()
    event.stopImmediatePropagation()
    confirmApply()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Modal width="940px" @close="emit('close')">
    <template #header>
      <div class="builder-head">
        <span class="head-title">
          <Sparkles :size="15" class="head-icon" />
          消息构造器
        </span>
        <div class="scene-switch" role="tablist" aria-label="接口协议场景">
          <button
            type="button"
            class="scene-pill"
            :class="{ active: draft.scene === 'v2' }"
            @click="setScene('v2')"
          >
            群聊 / 单聊 <span class="mono">v2</span>
          </button>
          <button
            type="button"
            class="scene-pill"
            :class="{ active: draft.scene === 'guild' }"
            @click="setScene('guild')"
          >
            频道 / 私信
          </button>
        </div>
      </div>
    </template>

    <div class="builder-grid">
      <!-- Left: interactive form -->
      <div class="builder-form">
        <div v-if="notice" class="notice-banner">
          <Info :size="13" class="flex-none" />
          <span>{{ notice }}</span>
        </div>

        <div v-if="extraCount" class="extra-banner">
          <span>已保留原请求体中的 {{ extraCount }} 个自定义顶层字段</span>
          <button type="button" class="inline-link" @click="clearExtra">清除自定义字段</button>
        </div>

        <!-- 1. Message Kind Tabs -->
        <section class="card">
          <div class="card-head">
            <span class="card-title">消息类型</span>
            <span class="card-hint">
              {{
                draft.scene === 'v2'
                  ? '自动切换 msg_type 并清理互斥字段'
                  : '频道与频道私信无需 msg_type，按结构体字段生效'
              }}
            </span>
          </div>

          <div class="kind-tabs">
            <button
              v-for="item in KIND_TABS"
              :key="item.key"
              type="button"
              class="kind-tab"
              :class="{ active: draft.kind === item.key }"
              @click="setKind(item.key)"
            >
              <span>{{ item.label }}</span>
              <code class="kind-code">
                {{ draft.scene === 'v2' ? item.v2Tag : item.guildTag }}
              </code>
            </button>
          </div>

          <!-- Kind: Text -->
          <div v-if="draft.kind === 'text'" class="kind-body">
            <div class="field-head">
              <span class="field-label">文本内容 <code>content</code></span>
              <div class="mini-actions">
                <button
                  type="button"
                  class="mini-link"
                  @mousedown.prevent
                  @click="openPicker('mention-text')"
                >
                  <AtSign :size="11" /> @提及用户
                </button>
                <button
                  type="button"
                  class="mini-link"
                  @mousedown.prevent
                  @click="openPicker('raw-text')"
                >
                  <UserRoundPlus :size="11" /> 插入 OpenID
                </button>
                <button
                  v-if="draft.scene === 'guild'"
                  type="button"
                  class="mini-link"
                  @mousedown.prevent
                  @click="insertEveryone"
                >
                  @everyone
                </button>
              </div>
            </div>
            <textarea
              ref="textInput"
              v-model="draft.content"
              class="textarea content-textarea"
              rows="4"
              placeholder="输入要发送的文本消息内容…"
              @input="rememberTextCaret"
              @click="rememberTextCaret"
              @keyup="rememberTextCaret"
              @select="rememberTextCaret"
            />

            <label v-if="draft.scene === 'guild'" class="field">
              <span class="field-label">附带图片直链 <code>image</code>（可选）</span>
              <input
                v-model="draft.imageUrl"
                class="input mono"
                type="text"
                placeholder="https://example.com/image.png"
                spellcheck="false"
              />
            </label>
          </div>

          <!-- Kind: Markdown -->
          <div v-else-if="draft.kind === 'markdown'" class="kind-body">
            <div class="sub-tabs">
              <button
                type="button"
                class="sub-tab"
                :class="{ active: draft.markdownMode === 'content' }"
                @click="setMarkdownMode('content')"
              >
                原生内容 <code class="mono">content</code>
              </button>
              <button
                type="button"
                class="sub-tab"
                :class="{ active: draft.markdownMode === 'template' }"
                @click="setMarkdownMode('template')"
              >
                模板消息 <code class="mono">custom_template_id</code>
              </button>
            </div>

            <template v-if="draft.markdownMode === 'content'">
              <div class="field-head">
                <span class="field-label">Markdown 文本 <code>markdown.content</code></span>
                <div class="mini-actions">
                  <button type="button" class="mini-link" @mousedown.prevent @click="insertMdSnippet('# 标题\n')">
                    # 标题
                  </button>
                  <button type="button" class="mini-link" @mousedown.prevent @click="insertMdSnippet('**加粗**')">
                    **加粗**
                  </button>
                  <button
                    type="button"
                    class="mini-link"
                    @mousedown.prevent
                    @click="insertMdSnippet('[链接文字](https://bot.q.qq.com)')"
                  >
                    [链接]
                  </button>
                  <button
                    type="button"
                    class="mini-link"
                    @mousedown.prevent
                    @click="openPicker('mention-md')"
                  >
                    <AtSign :size="11" /> @提及
                  </button>
                </div>
              </div>
              <textarea
                ref="mdInput"
                v-model="draft.markdownContent"
                class="textarea content-textarea"
                rows="5"
                placeholder="# 标题&#10;支持平台开通的 Markdown 语法…"
                spellcheck="false"
                @input="rememberMdCaret"
                @click="rememberMdCaret"
                @keyup="rememberMdCaret"
                @select="rememberMdCaret"
              />
            </template>

            <template v-else>
              <label class="field">
                <span class="field-label">模板 ID <code>markdown.custom_template_id</code></span>
                <input
                  v-model="draft.markdownTemplateId"
                  class="input mono"
                  type="text"
                  placeholder="例如：102030405_1700000000"
                  spellcheck="false"
                />
              </label>

              <div class="field">
                <div class="field-head">
                  <span class="field-label">模板参数 <code>markdown.params</code></span>
                  <button type="button" class="mini-link" @click="addMdParam">
                    <Plus :size="11" /> 添加参数
                  </button>
                </div>
                <div class="stack-list">
                  <div
                    v-for="(param, pIndex) in draft.markdownParams"
                    :key="pIndex"
                    class="md-param-row"
                  >
                    <input
                      v-model="param.key"
                      class="input mono param-key"
                      type="text"
                      placeholder="key（如 title）"
                      spellcheck="false"
                    />
                    <div class="param-values">
                      <div
                        v-for="(val, vIndex) in param.values"
                        :key="vIndex"
                        class="param-val-line"
                      >
                        <input
                          :value="val"
                          class="input param-val"
                          type="text"
                          placeholder="参数值"
                          @input="
                            updateMdParamValue(
                              pIndex,
                              vIndex,
                              ($event.target as HTMLInputElement).value,
                            )
                          "
                        />
                        <button
                          v-if="param.values.length > 1"
                          type="button"
                          class="icon-del"
                          title="移除该值"
                          @click="removeMdParamValue(pIndex, vIndex)"
                        >
                          <X :size="12" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="mini-btn"
                      title="追加多值（values 数组）"
                      @click="addMdParamValue(pIndex)"
                    >
                      +值
                    </button>
                    <button
                      type="button"
                      class="icon-del"
                      title="删除参数"
                      @click="removeMdParam(pIndex)"
                    >
                      <Trash2 :size="12" />
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Kind: Rich Media / Image -->
          <div v-else-if="draft.kind === 'media'" class="kind-body">
            <template v-if="draft.scene === 'v2'">
              <label class="field">
                <span class="field-label">富媒体凭证 <code>media.file_info</code></span>
                <textarea
                  v-model="draft.fileInfo"
                  class="textarea mono"
                  rows="3"
                  placeholder="粘贴上传群聊 / 单聊富媒体文件接口返回的 file_info 字符串…"
                  spellcheck="false"
                />
              </label>
              <p class="helper-note">
                需先调用「富媒体 → 上传群聊 / 单聊富媒体文件」（<code>srv_send_msg: false</code>）换取
                <code>file_info</code>，群聊与单聊凭证不互通。
              </p>
            </template>

            <template v-else>
              <label class="field">
                <span class="field-label">图片地址 <code>image</code></span>
                <input
                  v-model="draft.imageUrl"
                  class="input mono"
                  type="text"
                  placeholder="https://example.com/banner.png"
                  spellcheck="false"
                />
              </label>
            </template>

            <label class="field">
              <span class="field-label">附带说明文本 <code>content</code>（可选）</span>
              <input
                v-model="draft.mediaContent"
                class="input"
                type="text"
                placeholder="留空则仅发送图片 / 富媒体"
              />
            </label>
          </div>

          <!-- Kind: Ark -->
          <div v-else-if="draft.kind === 'ark'" class="kind-body">
            <div class="ark-top">
              <label class="field ark-id-field">
                <span class="field-label">模板 ID <code>ark.template_id</code></span>
                <input
                  v-model.number="draft.arkTemplateId"
                  class="input mono"
                  type="number"
                  min="1"
                />
              </label>
              <div class="field ark-presets">
                <span class="field-label">官方常用模板预设</span>
                <div class="preset-pills">
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: draft.arkTemplateId === 23 }"
                    @click="selectArkPreset(23)"
                  >
                    23 链接列表
                  </button>
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: draft.arkTemplateId === 24 }"
                    @click="selectArkPreset(24)"
                  >
                    24 文本缩略图
                  </button>
                  <button
                    type="button"
                    class="preset-pill"
                    :class="{ active: draft.arkTemplateId === 37 }"
                    @click="selectArkPreset(37)"
                  >
                    37 大图卡片
                  </button>
                </div>
              </div>
            </div>

            <div class="field">
              <div class="field-head">
                <span class="field-label">键值对 <code>ark.kv</code></span>
                <div class="mini-actions">
                  <button type="button" class="mini-link" @click="addArkValueRow">
                    <Plus :size="11" /> 文本项
                  </button>
                  <button type="button" class="mini-link" @click="addArkListRow">
                    <Plus :size="11" /> 列表项 (obj)
                  </button>
                </div>
              </div>

              <div class="stack-list">
                <div v-for="(row, rIndex) in draft.arkKv" :key="rIndex" class="ark-row">
                  <template v-if="row.kind === 'value'">
                    <div class="ark-simple">
                      <input
                        v-model="row.key"
                        class="input mono ark-key"
                        type="text"
                        placeholder="#KEY#"
                        spellcheck="false"
                      />
                      <input
                        v-model="row.value"
                        class="input ark-val"
                        type="text"
                        placeholder="内容值"
                      />
                      <button
                        type="button"
                        class="icon-del"
                        title="删除该项"
                        @click="removeArkRow(rIndex)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </template>

                  <template v-else>
                    <div class="ark-list-box">
                      <div class="ark-list-head">
                        <input
                          v-model="row.key"
                          class="input mono ark-key"
                          type="text"
                          placeholder="#LIST#"
                          spellcheck="false"
                        />
                        <span class="ark-badge">obj_kv 列表</span>
                        <button
                          type="button"
                          class="mini-link"
                          @click="addArkListItem(row)"
                        >
                          <Plus :size="11" /> 添加子项
                        </button>
                        <button
                          type="button"
                          class="icon-del"
                          title="删除整个列表项"
                          @click="removeArkRow(rIndex)"
                        >
                          <Trash2 :size="12" />
                        </button>
                      </div>
                      <div
                        v-for="(pairs, itemIndex) in row.items"
                        :key="itemIndex"
                        class="ark-obj-item"
                      >
                        <div class="ark-obj-pairs">
                          <div
                            v-for="(pair, pairIndex) in pairs"
                            :key="pairIndex"
                            class="ark-pair"
                          >
                            <input
                              v-model="pair.key"
                              class="input mono ark-sub-key"
                              type="text"
                              placeholder="desc / link"
                              spellcheck="false"
                            />
                            <input
                              v-model="pair.value"
                              class="input ark-val"
                              type="text"
                              placeholder="子项值"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          class="icon-del"
                          title="删除该子项"
                          @click="removeArkListItem(row, itemIndex)"
                        >
                          <X :size="12" />
                        </button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- Kind: Embed -->
          <div v-else-if="draft.kind === 'embed'" class="kind-body">
            <div class="two-col">
              <label class="field">
                <span class="field-label">卡片标题 <code>embed.title</code></span>
                <input
                  v-model="draft.embedTitle"
                  class="input"
                  type="text"
                  placeholder="卡片主标题"
                />
              </label>
              <label class="field">
                <span class="field-label">通知摘要 <code>embed.prompt</code></span>
                <input
                  v-model="draft.embedPrompt"
                  class="input"
                  type="text"
                  placeholder="推送通知栏预览文案（可选）"
                />
              </label>
            </div>

            <label class="field">
              <span class="field-label">缩略图地址 <code>embed.thumbnail.url</code>（可选）</span>
              <input
                v-model="draft.embedThumbnail"
                class="input mono"
                type="text"
                placeholder="https://example.com/thumb.png"
                spellcheck="false"
              />
            </label>

            <div class="field">
              <div class="field-head">
                <span class="field-label">字段行 <code>embed.fields[].name</code></span>
                <button type="button" class="mini-link" @click="addEmbedField">
                  <Plus :size="11" /> 添加一行
                </button>
              </div>
              <div class="stack-list">
                <div
                  v-for="(fieldText, fIndex) in draft.embedFields"
                  :key="fIndex"
                  class="ark-simple"
                >
                  <input
                    :value="fieldText"
                    class="input"
                    type="text"
                    placeholder="字段展示文本"
                    @input="updateEmbedField(fIndex, ($event.target as HTMLInputElement).value)"
                  />
                  <button
                    type="button"
                    class="icon-del"
                    title="删除该行"
                    @click="removeEmbedField(fIndex)"
                  >
                    <Trash2 :size="12" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. Inline Keyboard -->
        <section class="card">
          <div class="card-head">
            <span class="card-title">内嵌按钮 <code>keyboard</code></span>
            <div class="sub-tabs compact">
              <button
                v-for="mode in KEYBOARD_MODES"
                :key="mode.key"
                type="button"
                class="sub-tab"
                :class="{ active: draft.keyboardMode === mode.key }"
                @click="setKeyboardMode(mode.key)"
              >
                {{ mode.label }}
              </button>
            </div>
          </div>

          <div v-if="draft.keyboardMode === 'template'" class="kind-body">
            <label class="field">
              <span class="field-label">按钮模板 ID <code>keyboard.id</code></span>
              <input
                v-model="draft.keyboardId"
                class="input mono"
                type="text"
                placeholder="填写开放平台审核通过的按钮模板 ID"
                spellcheck="false"
              />
            </label>
          </div>

          <div v-else-if="draft.keyboardMode === 'custom'" class="kind-body">
            <!-- Visual button rows -->
            <div class="kb-matrix">
              <div
                v-for="(row, rIndex) in draft.keyboardRows"
                :key="rIndex"
                class="kb-row"
              >
                <span class="kb-row-index mono">R{{ rIndex + 1 }}</span>
                <div class="kb-row-buttons">
                  <button
                    v-for="(btn, cIndex) in row.buttons"
                    :key="cIndex"
                    type="button"
                    class="kb-pill"
                    :class="[
                      btn.style === 1 ? 'style-blue' : 'style-gray',
                      { selected: selectedRow === rIndex && selectedCol === cIndex },
                    ]"
                    @click="selectButton(rIndex, cIndex)"
                  >
                    {{ btn.label || '未命名' }}
                  </button>
                  <button
                    v-if="row.buttons.length < MAX_BUTTONS_PER_ROW"
                    type="button"
                    class="kb-add-btn"
                    title="在本行添加按钮（最多 5 个）"
                    @click="addKeyboardButton(rIndex)"
                  >
                    <Plus :size="12" />
                  </button>
                </div>
                <button
                  v-if="draft.keyboardRows.length > 1"
                  type="button"
                  class="icon-del"
                  title="删除整行"
                  @click="removeKeyboardRow(rIndex)"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
              <button
                v-if="draft.keyboardRows.length < MAX_KEYBOARD_ROWS"
                type="button"
                class="mini-link self-start"
                @click="addKeyboardRow"
              >
                <Plus :size="11" /> 新增一行（{{ draft.keyboardRows.length }}/{{ MAX_KEYBOARD_ROWS }}）
              </button>
            </div>

            <!-- Selected button inspector -->
            <div v-if="activeButton" class="kb-inspector">
              <div class="inspector-head">
                <span>
                  正在编辑：第 {{ selectedRow + 1 }} 行 · 第 {{ selectedCol + 1 }} 个按钮
                </span>
                <button
                  type="button"
                  class="mini-link danger-link"
                  @click="removeSelectedButton"
                >
                  <Trash2 :size="11" /> 删除此按钮
                </button>
              </div>

              <div class="three-col">
                <label class="field">
                  <span class="field-label">按钮文案 <code>label</code></span>
                  <input
                    v-model="activeButton.label"
                    class="input"
                    type="text"
                    placeholder="立即确认"
                  />
                </label>
                <label class="field">
                  <span class="field-label">点击后文案 <code>visited_label</code></span>
                  <input
                    v-model="activeButton.visitedLabel"
                    class="input"
                    type="text"
                    :placeholder="activeButton.label || '已确认'"
                  />
                </label>
                <label class="field">
                  <span class="field-label">外观样式 <code>style</code></span>
                  <select
                    class="select"
                    :value="activeButton.style"
                    @change="onButtonStyleChange(($event.target as HTMLSelectElement).value)"
                  >
                    <option :value="0">0 · 灰色线框</option>
                    <option :value="1">1 · 蓝色高亮</option>
                  </select>
                </label>
              </div>

              <div class="three-col">
                <label class="field">
                  <span class="field-label">动作类型 <code>action.type</code></span>
                  <select
                    class="select"
                    :value="activeButton.actionType"
                    @change="onButtonActionTypeChange(($event.target as HTMLSelectElement).value)"
                  >
                    <option :value="0">0 · 跳转链接</option>
                    <option :value="1">1 · 回调后台 (INTERACTION)</option>
                    <option :value="2">2 · 指令按钮 (@机器人)</option>
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">操作权限 <code>permission.type</code></span>
                  <select
                    class="select"
                    :value="activeButton.permissionType"
                    @change="onButtonPermissionChange(($event.target as HTMLSelectElement).value)"
                  >
                    <option :value="2">2 · 所有人可点击</option>
                    <option :value="1">1 · 仅管理员可点击</option>
                    <option :value="0">0 · 指定用户可点击</option>
                    <option :value="3">3 · 指定身份组（仅频道）</option>
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">按钮 ID <code>id</code>（可选）</span>
                  <input
                    v-model="activeButton.id"
                    class="input mono"
                    type="text"
                    placeholder="btn_1"
                    spellcheck="false"
                  />
                </label>
              </div>

              <label class="field">
                <span class="field-label">
                  {{
                    activeButton.actionType === 0
                      ? '跳转 URL'
                      : activeButton.actionType === 1
                        ? '回调透传数据'
                        : '指令文本'
                  }}
                  <code>action.data</code>
                </span>
                <input
                  v-model="activeButton.data"
                  class="input mono"
                  type="text"
                  :placeholder="
                    activeButton.actionType === 0
                      ? 'https://bot.q.qq.com'
                      : activeButton.actionType === 1
                        ? 'confirm_order_01'
                        : '/help'
                  "
                  spellcheck="false"
                />
              </label>

              <div v-if="activeButton.actionType === 2" class="check-group">
                <label class="check-item">
                  <input v-model="activeButton.enter" type="checkbox" />
                  <span class="check-box" />
                  点击后直接发送指令 <code>enter</code>
                </label>
                <label class="check-item">
                  <input v-model="activeButton.reply" type="checkbox" />
                  <span class="check-box" />
                  指令带引用回复 <code>reply</code>
                </label>
              </div>

              <div v-if="activeButton.permissionType === 0" class="field">
                <div class="field-head">
                  <span class="field-label">允许点击的用户 <code>specify_user_ids</code></span>
                  <button
                    type="button"
                    class="mini-link"
                    @click="openPicker('button-user')"
                  >
                    <UserRoundPlus :size="11" /> 从缓存选用户
                  </button>
                </div>
                <div v-if="activeButton.specifyUserIds.length" class="tag-list">
                  <span
                    v-for="uid in activeButton.specifyUserIds"
                    :key="uid"
                    class="tag-chip mono"
                    :title="uid"
                  >
                    {{ userBadgeLabel(uid) }}
                    <button type="button" aria-label="移除用户" @click="removeSpecifyUser(uid)">
                      <X :size="11" />
                    </button>
                  </span>
                </div>
                <div class="inline-add">
                  <input
                    v-model="newUserId"
                    class="input mono"
                    type="text"
                    placeholder="手动输入用户 OpenID 后按 Enter"
                    spellcheck="false"
                    @keydown.enter.prevent="addSpecifyUser"
                  />
                  <button type="button" class="btn small" @click="addSpecifyUser">添加</button>
                </div>
              </div>

              <div v-if="activeButton.permissionType === 3" class="field">
                <span class="field-label">允许点击的身份组 <code>specify_role_ids</code></span>
                <div v-if="activeButton.specifyRoleIds.length" class="tag-list">
                  <span
                    v-for="rid in activeButton.specifyRoleIds"
                    :key="rid"
                    class="tag-chip mono"
                  >
                    {{ rid }}
                    <button type="button" aria-label="移除身份组" @click="removeSpecifyRole(rid)">
                      <X :size="11" />
                    </button>
                  </span>
                </div>
                <div class="inline-add">
                  <input
                    v-model="newRoleId"
                    class="input mono"
                    type="text"
                    placeholder="输入频道身份组 role_id 后按 Enter"
                    spellcheck="false"
                    @keydown.enter.prevent="addSpecifyRole"
                  />
                  <button type="button" class="btn small" @click="addSpecifyRole">添加</button>
                </div>
              </div>

              <label class="field">
                <span class="field-label">低版本客户端提示 <code>unsupport_tips</code></span>
                <input
                  v-model="activeButton.unsupportTips"
                  class="input"
                  type="text"
                  placeholder="当前客户端版本暂不支持该操作"
                />
              </label>
            </div>
          </div>
        </section>

        <!-- 3. Reply & Context -->
        <section class="card">
          <div class="card-head">
            <span class="card-title">
              回复与引用上下文
              <span class="reply-badge" :class="{ passive: isPassiveReply }">
                {{ isPassiveReply ? '被动回复' : '主动消息' }}
              </span>
            </span>
            <button
              v-if="replyCandidates.length"
              type="button"
              class="mini-link"
              @click="eventPickerOpen = !eventPickerOpen"
            >
              {{ eventPickerOpen ? '收起最近事件' : `从最近事件填入 (${replyCandidates.length})` }}
            </button>
          </div>

          <div v-if="eventPickerOpen && replyCandidates.length" class="candidate-list">
            <button
              v-for="item in replyCandidates"
              :key="`${item.eventId}-${item.targetId}`"
              type="button"
              class="candidate-row"
              @click="applyCandidate(item)"
            >
              <span class="cand-time mono">{{ formatClock(item.receivedAt) }}</span>
              <span class="cand-type mono">{{ item.eventType }}</span>
              <span class="cand-summary">{{ truncate(item.summary, 36) }}</span>
              <span class="cand-target mono">{{ item.targetKind }}: {{ truncate(item.targetId, 18) }}</span>
            </button>
          </div>

          <div class="kind-body">
            <div :class="draft.scene === 'v2' ? 'three-col-msg' : 'two-col'">
              <label class="field">
                <span class="field-label">被动回复消息 ID <code>msg_id</code></span>
                <input
                  v-model="draft.msgId"
                  class="input mono"
                  type="text"
                  placeholder="留空则发送主动消息"
                  spellcheck="false"
                />
              </label>

              <label class="field">
                <span class="field-label">事件回复 ID <code>event_id</code>（可选）</span>
                <input
                  v-model="draft.eventId"
                  class="input mono"
                  type="text"
                  placeholder="入群 / 好友等事件 ID"
                  spellcheck="false"
                />
              </label>

              <label v-if="draft.scene === 'v2'" class="field">
                <span class="field-label">回复序号 <code>msg_seq</code></span>
                <input
                  v-model.number="draft.msgSeq"
                  class="input mono"
                  type="number"
                  min="1"
                  :disabled="!isPassiveReply"
                  :title="isPassiveReply ? '同一 msg_id 多条回复需递增 msg_seq' : '主动消息无需填写 msg_seq'"
                />
              </label>
            </div>

            <div class="ref-row">
              <label class="field flex-1">
                <div class="field-head">
                  <span class="field-label">引用原消息 <code>message_reference.message_id</code>（可选）</span>
                  <button
                    v-if="draft.msgId.trim() && draft.refMessageId !== draft.msgId.trim()"
                    type="button"
                    class="mini-link"
                    @click="copyMsgIdToRef"
                  >
                    填入当前 msg_id
                  </button>
                </div>
                <input
                  v-model="draft.refMessageId"
                  class="input mono"
                  type="text"
                  placeholder="填写目标消息 ID 以带气泡引用回复"
                  spellcheck="false"
                />
              </label>

              <label v-if="draft.refMessageId.trim()" class="check-item ref-ignore">
                <input v-model="draft.refIgnoreError" type="checkbox" />
                <span class="check-box" />
                忽略原消息获取失败 <code>ignore_get_message_error</code>
              </label>
            </div>
          </div>
        </section>
      </div>

      <!-- Right: sticky live JSON preview & diagnostics -->
      <aside class="builder-preview">
        <div class="preview-card">
          <header class="preview-head">
            <span class="preview-title">JSON 请求体预览</span>
            <button type="button" class="copy-btn" @click="copyPreview">
              <Check v-if="copied" :size="12" class="ok" />
              <Copy v-else :size="12" />
              {{ copied ? '已复制' : '复制' }}
            </button>
          </header>
          <div class="preview-code">
            <JsonView :value="payload" />
          </div>
        </div>

        <div v-if="diagnostics.length" class="diag-list">
          <div
            v-for="(item, index) in diagnostics"
            :key="index"
            class="diag-item"
            :class="item.level"
          >
            <AlertTriangle v-if="item.level === 'warning'" :size="13" class="diag-icon" />
            <Info v-else :size="13" class="diag-icon" />
            <span>{{ item.message }}</span>
          </div>
        </div>
      </aside>
    </div>

    <OpenIdInsertModal
      v-if="pickerTarget !== null"
      @pick="onPickOpenId"
      @close="pickerTarget = null"
    />

    <template #footer>
      <div class="foot-bar">
        <div class="foot-left">
          <button type="button" class="btn small ghost" @click="resetDraft">
            <RotateCcw :size="12" /> 重置默认
          </button>
          <span class="shortcut-hint mono">Ctrl+Enter 写入</span>
        </div>
        <div class="foot-right">
          <button type="button" class="btn" @click="emit('close')">取消</button>
          <button type="button" class="btn primary" @click="confirmApply">
            <Check :size="14" /> 写入请求体
          </button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.builder-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.head-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.head-icon {
  color: var(--accent);
}

.scene-switch {
  display: inline-flex;
  gap: 3px;
  padding: 2px;
  border-radius: 8px;
  background: var(--panel-3);
}

.scene-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-3);
}

.scene-pill:hover {
  color: var(--ink-2);
}

.scene-pill.active {
  background: var(--panel);
  color: var(--accent-2);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.builder-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.builder-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.notice-banner,
.extra-banner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
}

.notice-banner {
  background: var(--amber-soft);
  border: 1px solid #f3dec0;
  color: #9a5b00;
}

.extra-banner {
  justify-content: space-between;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent-2);
}

.flex-none {
  flex: none;
}

.flex-1 {
  flex: 1;
  min-width: 0;
}

.inline-link {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--panel-2);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-2);
}

.card-title code,
.field-label code,
.helper-note code,
.check-item code {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 500;
  color: #7c899e;
  background: #eaeff7;
  padding: 0 4px;
  border-radius: 3px;
}

.card-hint {
  font-size: 10.5px;
  color: var(--ink-3);
}

.kind-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
}

.kind-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 6px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: #fff;
  font-size: 11.5px;
  color: var(--ink-2);
  transition: border-color 0.12s ease, background 0.12s ease, color 0.12s ease;
}

.kind-tab:hover {
  border-color: #bdcade;
  color: var(--ink);
}

.kind-tab.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-2);
  font-weight: 600;
}

.kind-code {
  font-family: var(--font-mono);
  font-size: 9px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--panel-3);
  color: var(--ink-3);
}

.kind-tab.active .kind-code {
  background: #dbe8ff;
  color: var(--accent-2);
}

.kind-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-tabs {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: #e9eef6;
  align-self: flex-start;
}

.sub-tabs.compact {
  padding: 2px;
}

.sub-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 11px;
  color: var(--ink-3);
}

.sub-tab code {
  font-size: 9.5px;
  color: inherit;
  opacity: 0.8;
}

.sub-tab.active {
  background: #fff;
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.field-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 550;
  color: var(--ink-2);
}

.mini-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mini-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: var(--accent);
}

.mini-link:hover {
  color: var(--accent-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.danger-link {
  color: var(--red);
}

.danger-link:hover {
  color: #b42318;
}

.self-start {
  align-self: flex-start;
}

.content-textarea {
  background: #fff;
  min-height: 92px;
  resize: vertical;
}

.helper-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-3);
}

.stack-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.md-param-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.param-key {
  width: 140px;
  flex: none;
  height: 32px;
}

.param-values {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-val-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.param-val {
  height: 32px;
}

.mini-btn {
  height: 32px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid var(--line-strong);
  background: #fff;
  font-size: 10.5px;
  color: var(--ink-3);
  flex: none;
}

.mini-btn:hover {
  color: var(--ink);
  border-color: #c2ccdc;
}

.icon-del {
  width: 28px;
  height: 30px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--ink-3);
}

.icon-del:hover {
  background: var(--red-soft);
  color: var(--red);
}

/* Ark --------------------------------------------------------------------- */
.ark-top {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.ark-id-field {
  width: 136px;
  flex: none;
}

.ark-id-field .input {
  height: 32px;
}

.ark-presets {
  flex: 1;
  min-width: 200px;
}

.preset-pills {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.preset-pill {
  height: 30px;
  padding: 0 9px;
  border-radius: 7px;
  border: 1px solid var(--line-strong);
  background: #fff;
  font-size: 11px;
  color: var(--ink-2);
}

.preset-pill:hover {
  border-color: var(--accent-line);
  color: var(--accent-2);
}

.preset-pill.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent-2);
  font-weight: 600;
}

.ark-simple {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ark-simple .input {
  height: 32px;
}

.ark-key {
  width: 126px;
  flex: none;
}

.ark-val {
  flex: 1;
  min-width: 0;
}

.ark-list-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  background: #fff;
}

.ark-list-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ark-list-head .ark-key {
  height: 28px;
}

.ark-badge {
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--ink-3);
  background: var(--panel-3);
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: auto;
}

.ark-obj-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 7px;
  background: var(--panel-2);
  border: 1px solid var(--line);
}

.ark-obj-pairs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ark-pair {
  display: flex;
  align-items: center;
  gap: 5px;
}

.ark-pair .input {
  height: 28px;
  font-size: 12px;
}

.ark-sub-key {
  width: 84px;
  flex: none;
}

/* Keyboard ---------------------------------------------------------------- */
.kb-matrix {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border-radius: 9px;
  background: #fff;
  border: 1px solid var(--line);
}

.kb-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.kb-row-index {
  font-size: 9.5px;
  color: var(--ink-3);
  width: 20px;
  flex: none;
}

.kb-row-buttons {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.kb-pill {
  height: 29px;
  padding: 0 11px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 550;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: box-shadow 0.12s ease, border-color 0.12s ease;
}

.kb-pill.style-gray {
  background: var(--panel-2);
  border: 1px solid var(--line-strong);
  color: var(--ink-2);
}

.kb-pill.style-blue {
  background: #eef4ff;
  border: 1px solid #93b8ff;
  color: var(--accent-2);
}

.kb-pill.selected {
  box-shadow: 0 0 0 2px var(--accent);
  border-color: var(--accent);
}

.kb-add-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px dashed var(--line-strong);
  color: var(--ink-3);
}

.kb-add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.kb-inspector {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 11px;
  border-radius: 9px;
  background: #fff;
  border: 1px solid var(--line);
}

.kb-inspector .input,
.kb-inspector .select {
  height: 32px;
  font-size: 12px;
  padding-top: 4px;
  padding-bottom: 4px;
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--line);
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
}

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.three-col {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.three-col-msg {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 92px;
  gap: 8px;
}

.check-group {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.check-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ink-2);
  cursor: pointer;
  user-select: none;
}

.check-item input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.check-box {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  background: #fff;
  position: relative;
  flex: none;
}

.check-item input:checked + .check-box {
  background: var(--accent);
  border-color: var(--accent);
}

.check-item input:checked + .check-box::after {
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

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 23px;
  padding: 0 6px 0 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  color: var(--accent-2);
  font-size: 10.5px;
}

.tag-chip button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  opacity: 0.7;
}

.tag-chip button:hover {
  opacity: 1;
}

.inline-add {
  display: flex;
  align-items: center;
  gap: 6px;
}

.inline-add .input {
  flex: 1;
}

/* Context & candidates ---------------------------------------------------- */
.reply-badge {
  font-size: 9.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--panel-3);
  color: var(--ink-3);
}

.reply-badge.passive {
  background: var(--green-soft);
  color: #157347;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 156px;
  overflow: auto;
  padding: 4px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line-strong);
}

.candidate-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  border-radius: 6px;
  text-align: left;
  font-size: 11px;
}

.candidate-row:hover {
  background: var(--accent-soft);
}

.cand-time {
  font-size: 10px;
  color: var(--ink-3);
  flex: none;
}

.cand-type {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: #eaf1ff;
  color: #1d4ed8;
  flex: none;
}

.cand-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-2);
}

.cand-target {
  font-size: 9.5px;
  color: var(--ink-3);
  flex: none;
}

.ref-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ref-ignore {
  padding-left: 1px;
}

/* Right preview pane ------------------------------------------------------ */
.builder-preview {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.preview-card {
  border-radius: 11px;
  border: 1px solid #1e293b;
  background: #0f172a;
  overflow: hidden;
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: #131d33;
  border-bottom: 1px solid #1e2b45;
}

.preview-title {
  font-size: 11px;
  font-weight: 650;
  color: #c6d2e8;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 7px;
  border-radius: 5px;
  font-size: 10.5px;
  color: #9fb0ca;
  background: #1a2742;
}

.copy-btn:hover {
  background: #243558;
  color: #e2e8f0;
}

.ok {
  color: #4ade80;
}

.preview-code {
  padding: 11px 13px;
  max-height: 380px;
  overflow: auto;
}

.diag-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diag-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 1.55;
}

.diag-item.warning {
  background: var(--amber-soft);
  border: 1px solid #f2ddb8;
  color: #9a5b00;
}

.diag-item.info {
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--ink-3);
}

.diag-icon {
  flex: none;
  margin-top: 2px;
}

/* Footer ------------------------------------------------------------------ */
.foot-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.foot-left,
.foot-right {
  display: flex;
  align-items: center;
  gap: 9px;
}

.shortcut-hint {
  font-size: 10px;
  color: var(--ink-3);
}

@media (max-width: 860px) {
  .builder-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .builder-preview {
    position: static;
  }

  .three-col,
  .three-col-msg {
    grid-template-columns: 1fr;
  }

  .kind-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
