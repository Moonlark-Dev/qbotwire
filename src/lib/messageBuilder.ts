/**
 * QQ Bot v2 message body builder.
 *
 * The send-message endpoints all take a JSON body whose shape depends on
 * `msg_type`. Keeping the draft flat makes the modal simple while still
 * producing exactly the JSON that gets sent.
 *
 * Reference: https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/send.html
 */

export type MessageScope = 'group' | 'c2c' | 'channel' | 'dm'

export type MessageKind = 'text' | 'markdown' | 'ark' | 'embed' | 'media'

export interface MarkdownParamRow {
  key: string
  /** Raw input; values are separated by `,` / `，`. */
  values: string
}

export interface ArkKvRow {
  key: string
  value: string
}

export interface EmbedFieldRow {
  name: string
  value: string
}

export interface MessageDraft {
  kind: MessageKind
  content: string
  markdownTemplateId: string
  markdownParams: MarkdownParamRow[]
  arkTemplateId: string
  arkKv: ArkKvRow[]
  embedTitle: string
  embedPrompt: string
  embedThumbnail: string
  embedFields: EmbedFieldRow[]
  mediaFileInfo: string
  /** Passive reply: both fields come from the inbound event. */
  msgId: string
  msgSeq: string
  /** Quote an earlier message via `message_reference`. */
  referenceId: string
  ignoreReferenceError: boolean
  /** `keyboard` is passed through as JSON; rich button rows are hard to model. */
  keyboardJson: string
}

export interface MessageKindMeta {
  kind: MessageKind
  label: string
  /** QQ Bot `msg_type` value. */
  msgType: number
  hint: string
}

export const MESSAGE_KINDS: MessageKindMeta[] = [
  {
    kind: 'text',
    label: '文本',
    msgType: 0,
    hint: '纯文本消息，最通用；被动回复时在下方填写 msg_id。',
  },
  {
    kind: 'markdown',
    label: 'Markdown',
    msgType: 2,
    hint: 'Markdown 模板消息，custom_template_id 需要先在 QQ 开放平台申请。',
  },
  {
    kind: 'ark',
    label: 'Ark',
    msgType: 3,
    hint: 'Ark 模板消息，template_id 是开放平台下发的数字模板编号（如 23）。',
  },
  {
    kind: 'embed',
    label: 'Embed',
    msgType: 4,
    hint: 'Embed 卡片消息，适合标题 + 描述 + 缩略图 + 字段列表。',
  },
  {
    kind: 'media',
    label: '富媒体',
    msgType: 7,
    hint: '图片 / 视频 / 语音消息，需要先调用上传接口拿到 file_info。',
  },
]

export const MESSAGE_SCOPE_LABELS: Record<MessageScope, string> = {
  group: '群聊',
  c2c: '单聊',
  channel: '频道',
  dm: '频道私信',
}

/** Rich media upload only exists for group / C2C messages. */
export function scopeSupportsMedia(scope: MessageScope): boolean {
  return scope === 'group' || scope === 'c2c'
}

export function emptyDraft(): MessageDraft {
  return {
    kind: 'text',
    content: '你好，QBotWire',
    markdownTemplateId: '',
    markdownParams: [],
    arkTemplateId: '',
    arkKv: [],
    embedTitle: '',
    embedPrompt: '',
    embedThumbnail: '',
    embedFields: [],
    mediaFileInfo: '',
    msgId: '',
    msgSeq: '1',
    referenceId: '',
    ignoreReferenceError: false,
    keyboardJson: '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function splitValues(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function templateId(value: string): number | string {
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed
}

/** `keyboard` accepts arbitrary JSON, so parsing is shared by preview and validation. */
export function parseKeyboardJson(text: string): {
  value?: Record<string, unknown>
  error?: string
} {
  const trimmed = text.trim()
  if (!trimmed) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return { error: `按钮 JSON 解析失败：${(error as Error).message}` }
  }
  if (!isRecord(parsed)) return { error: '按钮 JSON 需要是一个对象' }
  return { value: parsed }
}

export function buildMessageBody(
  draft: MessageDraft,
  scope: MessageScope,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const content = draft.content.trim()
  if (content) body.content = content

  switch (draft.kind) {
    case 'text':
      body.msg_type = 0
      break
    case 'markdown': {
      body.msg_type = 2
      const markdown: Record<string, unknown> = {
        custom_template_id: draft.markdownTemplateId.trim(),
      }
      const params = draft.markdownParams
        .map((row) => ({ key: row.key.trim(), values: splitValues(row.values) }))
        .filter((row) => row.key)
      if (params.length) markdown.params = params
      body.markdown = markdown
      break
    }
    case 'ark': {
      body.msg_type = 3
      const kv = draft.arkKv
        .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
        .filter((row) => row.key)
      body.ark = {
        template_id: templateId(draft.arkTemplateId),
        ...(kv.length ? { kv } : {}),
      }
      break
    }
    case 'embed': {
      body.msg_type = 4
      const embed: Record<string, unknown> = { title: draft.embedTitle.trim() }
      if (draft.embedPrompt.trim()) embed.prompt = draft.embedPrompt.trim()
      if (draft.embedThumbnail.trim()) {
        embed.thumbnail = { url: draft.embedThumbnail.trim() }
      }
      const fields = draft.embedFields
        .map((row) => ({ name: row.name.trim(), value: row.value.trim() }))
        .filter((row) => row.name)
      if (fields.length) embed.fields = fields
      body.embed = embed
      break
    }
    case 'media':
      body.msg_type = 7
      body.media = { file_info: draft.mediaFileInfo.trim() }
      break
  }

  const msgId = draft.msgId.trim()
  if (msgId) {
    body.msg_id = msgId
    // Channel / DM replies only take msg_id; msg_seq belongs to group & C2C.
    if (scope === 'group' || scope === 'c2c') {
      const seq = draft.msgSeq.trim()
      if (seq) body.msg_seq = Number(seq)
    }
  }

  const referenceId = draft.referenceId.trim()
  if (referenceId) {
    body.message_reference = {
      message_id: referenceId,
      ignore_get_message_error: draft.ignoreReferenceError,
    }
  }

  const keyboard = parseKeyboardJson(draft.keyboardJson)
  if (keyboard.value !== undefined) body.keyboard = keyboard.value

  return body
}

/**
 * Best-effort reverse of {@link buildMessageBody}: rebuilt from an existing
 * request body so the modal opens on whatever is already in the editor.
 */
export function parseMessageBody(text: string): MessageDraft {
  const draft = emptyDraft()
  if (!text.trim()) return draft

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return draft
  }
  if (!isRecord(data)) return draft

  const markdown = isRecord(data.markdown) ? data.markdown : null
  const ark = isRecord(data.ark) ? data.ark : null
  const embed = isRecord(data.embed) ? data.embed : null
  const media = isRecord(data.media) ? data.media : null

  switch (Number(data.msg_type)) {
    case 2:
      draft.kind = 'markdown'
      break
    case 3:
      draft.kind = 'ark'
      break
    case 4:
      draft.kind = 'embed'
      break
    case 7:
      draft.kind = 'media'
      break
    default:
      if (markdown) draft.kind = 'markdown'
      else if (ark) draft.kind = 'ark'
      else if (embed) draft.kind = 'embed'
      else if (media) draft.kind = 'media'
      else draft.kind = 'text'
  }

  draft.content = asString(data.content)

  if (markdown) {
    draft.markdownTemplateId = asString(markdown.custom_template_id)
    if (Array.isArray(markdown.params)) {
      draft.markdownParams = markdown.params.filter(isRecord).map((row) => ({
        key: asString(row.key),
        values: Array.isArray(row.values)
          ? row.values.map((value) => asString(value)).join('，')
          : asString(row.values),
      }))
    }
  }

  if (ark) {
    draft.arkTemplateId = asString(ark.template_id)
    if (Array.isArray(ark.kv)) {
      draft.arkKv = ark.kv.filter(isRecord).map((row) => ({
        key: asString(row.key),
        value: asString(row.value),
      }))
    }
  }

  if (embed) {
    draft.embedTitle = asString(embed.title)
    draft.embedPrompt = asString(embed.prompt)
    draft.embedThumbnail = isRecord(embed.thumbnail) ? asString(embed.thumbnail.url) : ''
    if (Array.isArray(embed.fields)) {
      draft.embedFields = embed.fields.filter(isRecord).map((row) => ({
        name: asString(row.name),
        value: asString(row.value),
      }))
    }
  }

  if (media) draft.mediaFileInfo = asString(media.file_info)

  draft.msgId = asString(data.msg_id)
  if (data.msg_seq !== undefined && data.msg_seq !== null) {
    draft.msgSeq = String(data.msg_seq)
  }

  if (isRecord(data.message_reference)) {
    draft.referenceId = asString(data.message_reference.message_id)
    draft.ignoreReferenceError = data.message_reference.ignore_get_message_error === true
  }

  if (isRecord(data.keyboard)) {
    draft.keyboardJson = JSON.stringify(data.keyboard, null, 2)
  }

  return draft
}

export function validateMessageDraft(
  draft: MessageDraft,
  scope: MessageScope,
): string | null {
  if (draft.kind === 'text' && !draft.content.trim()) {
    return '文本消息需要填写 content'
  }
  if (draft.kind === 'markdown' && !draft.markdownTemplateId.trim()) {
    return 'Markdown 消息需要填写 custom_template_id'
  }
  if (draft.kind === 'ark') {
    const id = draft.arkTemplateId.trim()
    if (!id) return 'Ark 消息需要填写 template_id'
    if (!/^\d+$/.test(id)) return 'Ark template_id 需要是整数'
  }
  if (draft.kind === 'embed' && !draft.embedTitle.trim()) {
    return 'Embed 消息需要填写标题'
  }
  if (draft.kind === 'media') {
    if (!scopeSupportsMedia(scope)) return '富媒体消息只支持群聊与单聊'
    if (!draft.mediaFileInfo.trim()) return '富媒体消息需要填写 file_info（先上传文件拿到 file_info）'
  }

  const keyboard = parseKeyboardJson(draft.keyboardJson)
  if (keyboard.error) return keyboard.error

  const msgId = draft.msgId.trim()
  const seq = draft.msgSeq.trim()
  if (msgId && seq && (!/^\d+$/.test(seq) || Number(seq) < 1)) {
    return 'msg_seq 需要是正整数'
  }

  return null
}

/**
 * Recognise a send-message request from its method + path, so custom tabs get
 * the builder too. Path placeholders (`{group_openid}`) match the `[^/]+` part.
 */
export function messageScopeForPath(method: string, path: string): MessageScope | null {
  if (method.toUpperCase() !== 'POST') return null

  let pathname = path.trim()
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname
    } catch {
      return null
    }
  }
  pathname = pathname.split('?')[0].replace(/\/+$/, '')

  if (/^\/v2\/groups\/[^/]+\/messages$/.test(pathname)) return 'group'
  if (/^\/v2\/users\/[^/]+\/messages$/.test(pathname)) return 'c2c'
  if (/^\/channels\/[^/]+\/messages$/.test(pathname)) return 'channel'
  if (/^\/dms\/[^/]+\/messages$/.test(pathname)) return 'dm'
  return null
}
