import { eventCategory, eventSummary } from './events'
import type { GatewayEvent } from '@/types'

/**
 * Pure state and serializer for the QQ Bot API message builder modal.
 *
 * Supports both API families present in QBotWire's catalogue:
 * - `v2`: `/v2/groups/{group_openid}/messages` & `/v2/users/{openid}/messages`
 * - `guild`: `/channels/{channel_id}/messages` & `/dms/{guild_id}/messages`
 */

export type MessageScene = 'v2' | 'guild'
export type MessageKind = 'text' | 'markdown' | 'media' | 'ark' | 'embed'
export type MarkdownMode = 'content' | 'template'
export type KeyboardMode = 'none' | 'template' | 'custom'
export type ButtonStyle = 0 | 1
export type ButtonActionType = 0 | 1 | 2
export type ButtonPermissionType = 0 | 1 | 2 | 3

export interface MarkdownParamDraft {
  key: string
  values: string[]
}

export interface KeyboardButtonDraft {
  id: string
  label: string
  visitedLabel: string
  style: ButtonStyle
  actionType: ButtonActionType
  data: string
  reply: boolean
  enter: boolean
  unsupportTips: string
  permissionType: ButtonPermissionType
  specifyUserIds: string[]
  specifyRoleIds: string[]
}

export interface KeyboardRowDraft {
  buttons: KeyboardButtonDraft[]
}

export interface ArkObjPair {
  key: string
  value: string
}

export interface ArkKvDraft {
  key: string
  kind: 'value' | 'list'
  value: string
  /** Used when `kind === 'list'` (`obj` -> `obj_kv`). */
  items: ArkObjPair[][]
}

export interface MessageDraft {
  scene: MessageScene
  kind: MessageKind
  // Text (`msg_type: 0` or `content`)
  content: string
  // Markdown (`msg_type: 2`)
  markdownMode: MarkdownMode
  markdownContent: string
  markdownTemplateId: string
  markdownParams: MarkdownParamDraft[]
  // Rich media / guild image (`msg_type: 7` or `image`)
  fileInfo: string
  imageUrl: string
  mediaContent: string
  // Ark (`msg_type: 3`)
  arkTemplateId: number
  arkKv: ArkKvDraft[]
  // Embed (`msg_type: 4`)
  embedTitle: string
  embedPrompt: string
  embedThumbnail: string
  embedFields: string[]
  // Inline keyboard (`keyboard`)
  keyboardMode: KeyboardMode
  keyboardId: string
  keyboardRows: KeyboardRowDraft[]
  // Context & reply
  msgId: string
  eventId: string
  msgSeq: number
  refMessageId: string
  refIgnoreError: boolean
  // Unrecognised top-level keys preserved on round-trip
  extra: Record<string, unknown>
}

export interface ParsedMessageResult {
  draft: MessageDraft
  notice: string | null
}

export interface MessageDiagnostic {
  level: 'warning' | 'info'
  message: string
}

export interface ReplyCandidate {
  eventId: string
  eventType: string
  targetKind: 'msg_id' | 'event_id'
  targetId: string
  summary: string
  receivedAt: string
}

export const MAX_KEYBOARD_ROWS = 5
export const MAX_BUTTONS_PER_ROW = 5
export const DEFAULT_UNSUPPORT_TIPS = '当前客户端版本暂不支持该操作'

const KNOWN_MESSAGE_KEYS = new Set([
  'msg_type',
  'content',
  'markdown',
  'media',
  'ark',
  'embed',
  'image',
  'keyboard',
  'message_reference',
  'msg_id',
  'event_id',
  'msg_seq',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function normalizePathname(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).pathname
    }
  } catch {
    /* keep raw string */
  }
  return trimmed.split('?')[0]
}

export function detectMessageScene(path: string): MessageScene {
  const pathname = normalizePathname(path)
  if (/^\/(channels|dms)(\/|$)/i.test(pathname)) return 'guild'
  return 'v2'
}

export function createDefaultButton(index = 1): KeyboardButtonDraft {
  return {
    id: String(index),
    label: `按钮 ${index}`,
    visitedLabel: `已点击`,
    style: index === 1 ? 1 : 0,
    actionType: 2,
    data: '/ping',
    reply: false,
    enter: true,
    unsupportTips: DEFAULT_UNSUPPORT_TIPS,
    permissionType: 2,
    specifyUserIds: [],
    specifyRoleIds: [],
  }
}

export function createArkPresetKv(templateId: 23 | 24 | 37): ArkKvDraft[] {
  if (templateId === 24) {
    return [
      { key: '#DESC#', kind: 'value', value: '卡片描述', items: [] },
      { key: '#PROMPT#', kind: 'value', value: '收到一条新卡片消息', items: [] },
      { key: '#TITLE#', kind: 'value', value: 'QBotWire 调试卡片', items: [] },
      { key: '#METADESC#', kind: 'value', value: '由消息构造器生成的模板 24 示例', items: [] },
      { key: '#IMG#', kind: 'value', value: 'https://bot.q.qq.com/wiki/favicon.ico', items: [] },
      { key: '#LINK#', kind: 'value', value: 'https://bot.q.qq.com/wiki/', items: [] },
      { key: '#SUBTITLE#', kind: 'value', value: 'QBotWire', items: [] },
    ]
  }
  if (templateId === 37) {
    return [
      { key: '#PROMPT#', kind: 'value', value: '收到一条大图卡片', items: [] },
      { key: '#METATITLE#', kind: 'value', value: 'QBotWire 大图标题', items: [] },
      { key: '#METASUBTITLE#', kind: 'value', value: '副标题说明', items: [] },
      { key: '#METACOVER#', kind: 'value', value: 'https://bot.q.qq.com/wiki/favicon.ico', items: [] },
      { key: '#METAURL#', kind: 'value', value: 'https://bot.q.qq.com/wiki/', items: [] },
    ]
  }
  return [
    { key: '#DESC#', kind: 'value', value: '列表卡片描述', items: [] },
    { key: '#PROMPT#', kind: 'value', value: '收到一条列表消息', items: [] },
    {
      key: '#LIST#',
      kind: 'list',
      value: '',
      items: [
        [
          { key: 'desc', value: '查看 QQ 机器人文档' },
          { key: 'link', value: 'https://bot.q.qq.com/wiki/develop/api-v2/' },
        ],
      ],
    },
  ]
}

export function applyArkPreset(draft: MessageDraft, templateId: 23 | 24 | 37): void {
  draft.arkTemplateId = templateId
  draft.arkKv = createArkPresetKv(templateId)
}

export function createDefaultDraft(scene: MessageScene = 'v2'): MessageDraft {
  return {
    scene,
    kind: 'text',
    content: '你好，QBotWire',
    markdownMode: 'content',
    markdownContent: '# 你好，QBotWire\n这是一条 **Markdown** 测试消息。',
    markdownTemplateId: '',
    markdownParams: [{ key: 'title', values: ['你好，QBotWire'] }],
    fileInfo: '',
    imageUrl: '',
    mediaContent: '',
    arkTemplateId: 23,
    arkKv: createArkPresetKv(23),
    embedTitle: 'QBotWire 通知卡片',
    embedPrompt: '收到一条 Embed 消息',
    embedThumbnail: '',
    embedFields: ['状态：在线', '环境：调试工作台'],
    keyboardMode: 'none',
    keyboardId: '',
    keyboardRows: [{ buttons: [createDefaultButton(1)] }],
    msgId: '',
    eventId: '',
    msgSeq: 1,
    refMessageId: '',
    refIgnoreError: false,
    extra: {},
  }
}

function parseButton(raw: unknown, fallbackIndex: number): KeyboardButtonDraft {
  const obj = record(raw)
  const render = record(obj.render_data)
  const action = record(obj.action)
  const perm = record(action.permission)

  const style: ButtonStyle = render.style === 1 ? 1 : 0
  const actionType: ButtonActionType =
    action.type === 0 || action.type === 1 || action.type === 2 ? action.type : 2
  const permissionType: ButtonPermissionType =
    perm.type === 0 || perm.type === 1 || perm.type === 2 || perm.type === 3 ? perm.type : 2

  return {
    id: typeof obj.id === 'string' ? obj.id : typeof obj.id === 'number' ? String(obj.id) : '',
    label: typeof render.label === 'string' ? render.label : `按钮 ${fallbackIndex}`,
    visitedLabel: typeof render.visited_label === 'string' ? render.visited_label : '',
    style,
    actionType,
    data: typeof action.data === 'string' ? action.data : '',
    reply: action.reply === true,
    enter: action.enter === true,
    unsupportTips:
      typeof action.unsupport_tips === 'string' ? action.unsupport_tips : DEFAULT_UNSUPPORT_TIPS,
    permissionType,
    specifyUserIds: Array.isArray(perm.specify_user_ids)
      ? perm.specify_user_ids.map((item) => String(item).trim()).filter(Boolean)
      : [],
    specifyRoleIds: Array.isArray(perm.specify_role_ids)
      ? perm.specify_role_ids.map((item) => String(item).trim()).filter(Boolean)
      : [],
  }
}

function parseArkKv(rawList: unknown[]): ArkKvDraft[] {
  const parsed: ArkKvDraft[] = []
  for (const entry of rawList) {
    if (!isRecord(entry)) continue
    const key = typeof entry.key === 'string' ? entry.key : ''
    if (Array.isArray(entry.obj)) {
      const items: ArkObjPair[][] = entry.obj.map((objItem) => {
        const kvArr = Array.isArray(record(objItem).obj_kv)
          ? (record(objItem).obj_kv as unknown[])
          : []
        const pairs = kvArr
          .filter(isRecord)
          .map((pair) => ({
            key: typeof pair.key === 'string' ? pair.key : '',
            value: typeof pair.value === 'string' ? pair.value : String(pair.value ?? ''),
          }))
        return pairs.length ? pairs : [{ key: 'desc', value: '' }]
      })
      parsed.push({
        key: key || '#LIST#',
        kind: 'list',
        value: '',
        items: items.length ? items : [[{ key: 'desc', value: '' }]],
      })
    } else {
      parsed.push({
        key,
        kind: 'value',
        value: typeof entry.value === 'string' ? entry.value : String(entry.value ?? ''),
        items: [],
      })
    }
  }
  return parsed
}

export function parseMessageDraft(rawBody: string, path = ''): ParsedMessageResult {
  const pathname = normalizePathname(path)
  const explicitGuild = /^\/(channels|dms)(\/|$)/i.test(pathname)
  const explicitV2 = /^\/v2(\/|$)/i.test(pathname)
  const defaultScene: MessageScene = explicitGuild ? 'guild' : 'v2'

  const trimmed = rawBody.trim()
  if (!trimmed) {
    return { draft: createDefaultDraft(defaultScene), notice: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      draft: createDefaultDraft(defaultScene),
      notice: '当前请求体不是合法 JSON，点击「写入请求体」后将覆盖原内容。',
    }
  }

  if (!isRecord(parsed)) {
    return {
      draft: createDefaultDraft(defaultScene),
      notice: '当前请求体不是 JSON 对象，点击「写入请求体」后将覆盖原内容。',
    }
  }

  const keys = Object.keys(parsed)
  if (keys.length === 0) {
    return { draft: createDefaultDraft(defaultScene), notice: null }
  }

  const hasKnownKey = keys.some((key) => KNOWN_MESSAGE_KEYS.has(key))
  if (!hasKnownKey) {
    return {
      draft: createDefaultDraft(defaultScene),
      notice: '当前请求体不包含消息字段，点击「写入请求体」后将替换为新构造的消息 JSON。',
    }
  }

  const inferredScene: MessageScene = explicitGuild
    ? 'guild'
    : explicitV2
      ? 'v2'
      : 'msg_type' in parsed || 'media' in parsed || 'msg_seq' in parsed
        ? 'v2'
        : 'image' in parsed
          ? 'guild'
          : defaultScene

  const draft = createDefaultDraft(inferredScene)

  // Determine message kind
  if (parsed.msg_type === 2) draft.kind = 'markdown'
  else if (parsed.msg_type === 7) draft.kind = 'media'
  else if (parsed.msg_type === 3) draft.kind = 'ark'
  else if (parsed.msg_type === 4) draft.kind = 'embed'
  else if (parsed.msg_type === 0) draft.kind = 'text'
  else if (isRecord(parsed.markdown)) draft.kind = 'markdown'
  else if (isRecord(parsed.media)) draft.kind = 'media'
  else if (isRecord(parsed.ark)) draft.kind = 'ark'
  else if (isRecord(parsed.embed)) draft.kind = 'embed'
  else if (typeof parsed.image === 'string' && parsed.image.trim() && !parsed.content) {
    draft.kind = 'media'
  } else {
    draft.kind = 'text'
  }

  // Content & media
  if (typeof parsed.content === 'string') {
    if (draft.kind === 'media') {
      draft.mediaContent = parsed.content
    } else {
      draft.content = parsed.content
    }
  }
  if (typeof parsed.image === 'string') {
    draft.imageUrl = parsed.image
  }
  if (isRecord(parsed.media) && typeof parsed.media.file_info === 'string') {
    draft.fileInfo = parsed.media.file_info
  }

  // Markdown
  if (isRecord(parsed.markdown)) {
    const md = parsed.markdown
    const hasTemplate =
      (typeof md.custom_template_id === 'string' && md.custom_template_id.trim() !== '') ||
      Array.isArray(md.params)
    if (hasTemplate && typeof md.content !== 'string') {
      draft.markdownMode = 'template'
      draft.markdownTemplateId =
        typeof md.custom_template_id === 'string' ? md.custom_template_id : ''
      if (Array.isArray(md.params)) {
        const params = md.params.filter(isRecord).map((row) => ({
          key: typeof row.key === 'string' ? row.key : '',
          values: Array.isArray(row.values)
            ? row.values.map((val) => String(val ?? ''))
            : [''],
        }))
        draft.markdownParams = params.length ? params : [{ key: '', values: [''] }]
      }
    } else {
      draft.markdownMode = 'content'
      if (typeof md.content === 'string') draft.markdownContent = md.content
      if (typeof md.custom_template_id === 'string') {
        draft.markdownTemplateId = md.custom_template_id
      }
    }
  }

  // Keyboard
  if (isRecord(parsed.keyboard)) {
    const kb = parsed.keyboard
    const kbContent = record(kb.content)
    if (Array.isArray(kbContent.rows)) {
      draft.keyboardMode = 'custom'
      let buttonCounter = 0
      const rows: KeyboardRowDraft[] = kbContent.rows
        .slice(0, MAX_KEYBOARD_ROWS)
        .filter(isRecord)
        .map((row) => {
          const rawButtons = Array.isArray(row.buttons) ? row.buttons : []
          const buttons = rawButtons.slice(0, MAX_BUTTONS_PER_ROW).map((btn) => {
            buttonCounter += 1
            return parseButton(btn, buttonCounter)
          })
          return { buttons: buttons.length ? buttons : [createDefaultButton(++buttonCounter)] }
        })
      draft.keyboardRows = rows.length ? rows : [{ buttons: [createDefaultButton(1)] }]
    } else if (typeof kb.id === 'string') {
      draft.keyboardMode = 'template'
      draft.keyboardId = kb.id
    }
  }

  // Ark
  if (isRecord(parsed.ark)) {
    const ark = parsed.ark
    if (typeof ark.template_id === 'number' || typeof ark.template_id === 'string') {
      const id = Number(ark.template_id)
      if (Number.isFinite(id) && id > 0) draft.arkTemplateId = Math.floor(id)
    }
    if (Array.isArray(ark.kv)) {
      const kv = parseArkKv(ark.kv)
      if (kv.length) draft.arkKv = kv
    }
  }

  // Embed
  if (isRecord(parsed.embed)) {
    const embed = parsed.embed
    draft.embedTitle = typeof embed.title === 'string' ? embed.title : ''
    draft.embedPrompt = typeof embed.prompt === 'string' ? embed.prompt : ''
    const thumb = record(embed.thumbnail)
    draft.embedThumbnail = typeof thumb.url === 'string' ? thumb.url : ''
    if (Array.isArray(embed.fields)) {
      const fields = embed.fields
        .filter(isRecord)
        .map((item) => (typeof item.name === 'string' ? item.name : ''))
      draft.embedFields = fields.length ? fields : ['']
    }
  }

  // Reply & reference context
  if (isRecord(parsed.message_reference)) {
    const ref = parsed.message_reference
    draft.refMessageId = typeof ref.message_id === 'string' ? ref.message_id : ''
    draft.refIgnoreError = ref.ignore_get_message_error === true
  }
  if (typeof parsed.msg_id === 'string') draft.msgId = parsed.msg_id
  if (typeof parsed.event_id === 'string') draft.eventId = parsed.event_id
  if (typeof parsed.msg_seq === 'number' && Number.isFinite(parsed.msg_seq)) {
    draft.msgSeq = Math.max(1, Math.floor(parsed.msg_seq))
  }

  // Preserve unrecognised top-level keys
  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!KNOWN_MESSAGE_KEYS.has(key)) extra[key] = value
  }
  draft.extra = extra

  return { draft, notice: null }
}

function buildMarkdownObject(draft: MessageDraft): Record<string, unknown> {
  if (draft.markdownMode === 'template') {
    const params = draft.markdownParams
      .filter((row) => row.key.trim() !== '')
      .map((row) => ({
        key: row.key.trim(),
        values: row.values.length ? row.values : [''],
      }))
    const result: Record<string, unknown> = {
      custom_template_id: draft.markdownTemplateId.trim(),
    }
    if (params.length) result.params = params
    return result
  }
  return { content: draft.markdownContent }
}

function buildKeyboardObject(draft: MessageDraft): Record<string, unknown> | null {
  if (draft.keyboardMode === 'none') return null
  if (draft.keyboardMode === 'template') {
    return { id: draft.keyboardId.trim() }
  }
  const rows = draft.keyboardRows
    .slice(0, MAX_KEYBOARD_ROWS)
    .filter((row) => row.buttons.length > 0)
    .map((row) => ({
      buttons: row.buttons.slice(0, MAX_BUTTONS_PER_ROW).map((btn) => {
        const permission: Record<string, unknown> = { type: btn.permissionType }
        if (btn.permissionType === 0) {
          permission.specify_user_ids = btn.specifyUserIds.map((id) => id.trim()).filter(Boolean)
        } else if (btn.permissionType === 3) {
          permission.specify_role_ids = btn.specifyRoleIds.map((id) => id.trim()).filter(Boolean)
        }

        const action: Record<string, unknown> = {
          type: btn.actionType,
          permission,
          data: btn.data,
          unsupport_tips: btn.unsupportTips.trim() || DEFAULT_UNSUPPORT_TIPS,
        }
        if (btn.actionType === 2) {
          if (btn.reply) action.reply = true
          if (btn.enter) action.enter = true
        }

        const label = btn.label
        const visitedLabel = btn.visitedLabel.trim() || label
        const buttonPayload: Record<string, unknown> = {
          render_data: {
            label,
            visited_label: visitedLabel,
            style: btn.style,
          },
          action,
        }
        if (btn.id.trim()) {
          return { id: btn.id.trim(), ...buttonPayload }
        }
        return buttonPayload
      }),
    }))
  return { content: { rows } }
}

function buildArkObject(draft: MessageDraft): Record<string, unknown> {
  const kv = draft.arkKv
    .filter((item) => item.key.trim() !== '')
    .map((item) => {
      if (item.kind === 'list') {
        const obj = item.items
          .map((pairs) => ({
            obj_kv: pairs
              .filter((pair) => pair.key.trim() !== '')
              .map((pair) => ({ key: pair.key.trim(), value: pair.value })),
          }))
          .filter((entry) => entry.obj_kv.length > 0)
        return { key: item.key.trim(), obj }
      }
      return { key: item.key.trim(), value: item.value }
    })
  return {
    template_id: Math.max(1, Math.floor(Number(draft.arkTemplateId) || 23)),
    kv,
  }
}

function buildEmbedObject(draft: MessageDraft): Record<string, unknown> {
  const embed: Record<string, unknown> = {
    title: draft.embedTitle,
  }
  if (draft.embedPrompt.trim()) {
    embed.prompt = draft.embedPrompt.trim()
  }
  if (draft.embedThumbnail.trim()) {
    embed.thumbnail = { url: draft.embedThumbnail.trim() }
  }
  const fields = draft.embedFields
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }))
  if (fields.length) {
    embed.fields = fields
  }
  return embed
}

export function buildMessagePayload(draft: MessageDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  if (draft.scene === 'v2') {
    switch (draft.kind) {
      case 'text':
        payload.content = draft.content
        payload.msg_type = 0
        break
      case 'markdown':
        payload.msg_type = 2
        payload.markdown = buildMarkdownObject(draft)
        break
      case 'media':
        payload.msg_type = 7
        payload.media = { file_info: draft.fileInfo.trim() }
        if (draft.mediaContent.trim()) {
          payload.content = draft.mediaContent
        }
        break
      case 'ark':
        payload.msg_type = 3
        payload.ark = buildArkObject(draft)
        break
      case 'embed':
        payload.msg_type = 4
        payload.embed = buildEmbedObject(draft)
        break
    }
  } else {
    switch (draft.kind) {
      case 'text':
        payload.content = draft.content
        if (draft.imageUrl.trim()) {
          payload.image = draft.imageUrl.trim()
        }
        break
      case 'markdown':
        payload.markdown = buildMarkdownObject(draft)
        break
      case 'media':
        payload.image = draft.imageUrl.trim()
        if (draft.mediaContent.trim()) {
          payload.content = draft.mediaContent
        }
        break
      case 'ark':
        payload.ark = buildArkObject(draft)
        break
      case 'embed':
        payload.embed = buildEmbedObject(draft)
        break
    }
  }

  const keyboard = buildKeyboardObject(draft)
  if (keyboard) {
    payload.keyboard = keyboard
  }

  if (draft.refMessageId.trim()) {
    const ref: Record<string, unknown> = { message_id: draft.refMessageId.trim() }
    if (draft.refIgnoreError) {
      ref.ignore_get_message_error = true
    }
    payload.message_reference = ref
  }

  const msgId = draft.msgId.trim()
  const eventId = draft.eventId.trim()
  if (msgId) payload.msg_id = msgId
  if (eventId) payload.event_id = eventId
  if (draft.scene === 'v2' && (msgId || eventId)) {
    payload.msg_seq = Math.max(1, Math.floor(Number(draft.msgSeq) || 1))
  }

  for (const [key, value] of Object.entries(draft.extra)) {
    if (!(key in payload) && !KNOWN_MESSAGE_KEYS.has(key)) {
      payload[key] = value
    }
  }

  return payload
}

export function stringifyMessagePayload(draft: MessageDraft): string {
  return JSON.stringify(buildMessagePayload(draft), null, 2)
}

export function validateMessageDraft(draft: MessageDraft): MessageDiagnostic[] {
  const list: MessageDiagnostic[] = []

  if (draft.kind === 'text') {
    if (!draft.content.trim() && !(draft.scene === 'guild' && draft.imageUrl.trim())) {
      list.push({ level: 'warning', message: '文本内容为空，发送时可能被平台拒绝。' })
    }
  } else if (draft.kind === 'markdown') {
    if (draft.markdownMode === 'content' && !draft.markdownContent.trim()) {
      list.push({ level: 'warning', message: 'Markdown 正文内容为空。' })
    }
    if (draft.markdownMode === 'template' && !draft.markdownTemplateId.trim()) {
      list.push({
        level: 'warning',
        message: '使用 Markdown 模板时需填写 custom_template_id。',
      })
    }
  } else if (draft.kind === 'media') {
    if (draft.scene === 'v2' && !draft.fileInfo.trim()) {
      list.push({
        level: 'warning',
        message: '富媒体消息需填写上传接口返回的 file_info 凭证。',
      })
    }
    if (draft.scene === 'guild' && !draft.imageUrl.trim()) {
      list.push({
        level: 'warning',
        message: '频道图片消息需填写可访问的图片 URL（image）。',
      })
    }
  } else if (draft.kind === 'ark') {
    if (!draft.arkKv.some((item) => item.key.trim() !== '')) {
      list.push({ level: 'warning', message: 'Ark 卡片尚未配置任何 kv 参数。' })
    }
  } else if (draft.kind === 'embed') {
    if (!draft.embedTitle.trim()) {
      list.push({ level: 'warning', message: 'Embed 卡片通常需要填写标题（title）。' })
    }
  }

  if (draft.keyboardMode === 'template' && !draft.keyboardId.trim()) {
    list.push({ level: 'warning', message: '已选择按钮模板，请填写按钮模板 ID。' })
  }

  if (draft.keyboardMode !== 'none' && draft.scene === 'v2' && draft.kind !== 'markdown') {
    list.push({
      level: 'info',
      message: '提示：群聊 / 单聊场景下，内嵌按钮（keyboard）通常需配合 Markdown（msg_type = 2）使用。',
    })
  }

  if (draft.keyboardMode === 'custom') {
    const buttons = draft.keyboardRows.flatMap((row) => row.buttons)
    if (!buttons.length) {
      list.push({ level: 'warning', message: '自定义按钮面板至少需要包含一个按钮。' })
    }
    if (buttons.some((btn) => !btn.label.trim())) {
      list.push({ level: 'warning', message: '存在未填写按钮文案（label）的按钮。' })
    }
    if (buttons.some((btn) => btn.permissionType === 0 && btn.specifyUserIds.length === 0)) {
      list.push({
        level: 'warning',
        message: '存在「指定用户可点击」的按钮尚未添加用户 OpenID。',
      })
    }
    if (buttons.some((btn) => btn.permissionType === 3 && btn.specifyRoleIds.length === 0)) {
      list.push({
        level: 'warning',
        message: '存在「指定身份组可点击」的按钮尚未添加身份组 ID。',
      })
    }
  }

  if (!draft.msgId.trim() && !draft.eventId.trim() && draft.scene === 'v2') {
    list.push({
      level: 'info',
      message: '当前未填 msg_id / event_id，将作为主动消息发送（自动省略 msg_id 与 msg_seq）。',
    })
  }

  return list
}

const REPLYABLE_EVENT_TYPES = new Set([
  'GROUP_ADD_ROBOT',
  'FRIEND_ADD',
  'INTERACTION_CREATE',
  'GUILD_MEMBER_ADD',
])

export function extractReplyCandidates(events: GatewayEvent[], limit = 8): ReplyCandidate[] {
  const candidates: ReplyCandidate[] = []
  for (const event of events) {
    if (candidates.length >= limit) break
    const category = eventCategory(event.type)
    const data = record(event.data)
    if (category === 'message' && typeof data.id === 'string' && data.id.trim()) {
      candidates.push({
        eventId: event.id,
        eventType: event.type,
        targetKind: 'msg_id',
        targetId: data.id.trim(),
        summary: eventSummary(event),
        receivedAt: event.receivedAt,
      })
    } else if (REPLYABLE_EVENT_TYPES.has(event.type) && event.id.trim()) {
      const eventTargetId =
        typeof data.id === 'string' && data.id.trim() && event.type === 'INTERACTION_CREATE'
          ? data.id.trim()
          : event.id.trim()
      candidates.push({
        eventId: event.id,
        eventType: event.type,
        targetKind: 'event_id',
        targetId: eventTargetId,
        summary: eventSummary(event),
        receivedAt: event.receivedAt,
      })
    }
  }
  return candidates
}
