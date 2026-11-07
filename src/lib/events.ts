import type { GatewayEvent } from '@/types'

export type EventCategory =
  | 'message'
  | 'guild'
  | 'member'
  | 'lifecycle'
  | 'interaction'
  | 'unknown'

export interface FormattedEventView {
  title: string
  subtitle: string
  category: EventCategory
  fields: FormattedField[]
  content?: string | null
  raw: unknown
}

export interface FormattedField {
  label: string
  value: string
  mono?: boolean
}

type Data = Record<string, unknown>

function isRecord(value: unknown): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): Data {
  return isRecord(value) ? value : {}
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function field(label: string, value: unknown, mono = true): FormattedField | null {
  const rendered = text(value)
  if (!rendered) return null
  return { label, value: rendered, mono }
}

function fields(...items: Array<FormattedField | null>): FormattedField[] {
  return items.filter((item): item is FormattedField => item !== null)
}

const EVENT_TITLES: Record<string, { title: string; category: EventCategory }> = {
  GROUP_AT_MESSAGE_CREATE: { title: '群聊 @ 消息', category: 'message' },
  C2C_MESSAGE_CREATE: { title: '单聊消息', category: 'message' },
  C2C_MSG_RECEIVE: { title: '单聊消息接收', category: 'message' },
  MESSAGE_CREATE: { title: '频道消息', category: 'message' },
  AT_MESSAGE_CREATE: { title: '频道 @ 消息', category: 'message' },
  MESSAGE_DELETE: { title: '频道消息删除', category: 'message' },
  PUBLIC_MESSAGE_DELETE: { title: '频道 @ 消息删除', category: 'message' },
  DIRECT_MESSAGE_CREATE: { title: '频道私信', category: 'message' },
  DIRECT_MESSAGE_DELETE: { title: '频道私信删除', category: 'message' },
  GUILD_CREATE: { title: '频道创建', category: 'guild' },
  GUILD_UPDATE: { title: '频道更新', category: 'guild' },
  GUILD_DELETE: { title: '频道删除', category: 'guild' },
  CHANNEL_CREATE: { title: '子频道创建', category: 'guild' },
  CHANNEL_UPDATE: { title: '子频道更新', category: 'guild' },
  CHANNEL_DELETE: { title: '子频道删除', category: 'guild' },
  GUILD_MEMBER_ADD: { title: '成员加入频道', category: 'member' },
  GUILD_MEMBER_UPDATE: { title: '成员信息更新', category: 'member' },
  GUILD_MEMBER_REMOVE: { title: '成员离开频道', category: 'member' },
  FRIEND_ADD: { title: '好友添加', category: 'member' },
  FRIEND_DEL: { title: '好友删除', category: 'member' },
  GROUP_ADD_ROBOT: { title: '机器人入群', category: 'lifecycle' },
  GROUP_DEL_ROBOT: { title: '机器人离群', category: 'lifecycle' },
  GROUP_MSG_REJECT: { title: '群消息被拒收', category: 'lifecycle' },
  GROUP_MSG_RECEIVE: { title: '重新接收群消息', category: 'lifecycle' },
  READY: { title: '网关就绪', category: 'lifecycle' },
  RESUMED: { title: '会话恢复', category: 'lifecycle' },
  INTERACTION_CREATE: { title: '按钮交互', category: 'interaction' },
}

export function stripMentions(content: string): string {
  return content.replace(/<@!?[^>]+>/g, '').trim()
}

function messageView(type: string, data: Data, title: string): FormattedEventView {
  const author = record(data.author)
  const content = text(data.content)
  const attachments = Array.isArray(data.attachments) ? data.attachments : []
  const mentions = Array.isArray(data.mentions) ? data.mentions : []
  const isGuild = type.includes('GUILD') || type === 'MESSAGE_CREATE' || type === 'AT_MESSAGE_CREATE' || type === 'DIRECT_MESSAGE_CREATE'
  const isC2c = type === 'C2C_MESSAGE_CREATE' || type === 'C2C_MSG_RECEIVE'

  const fieldsList = fields(
    field('消息 ID', data.id),
    !isGuild && !isC2c ? field('群 OpenID', data.group_openid) : null,
    isC2c ? field('用户 OpenID', author.user_openid ?? author.id) : null,
    !isGuild && !isC2c ? field('成员 OpenID', author.member_openid ?? author.id) : null,
    field('Union OpenID', author.union_openid),
    isGuild ? field('频道 ID', data.guild_id) : null,
    isGuild ? field('子频道 ID', data.channel_id) : null,
    isGuild ? field('发送者', author.username) : null,
    isGuild ? field('发送者 ID', author.id) : null,
    field('时间', data.timestamp),
    field('msg_seq', data.msg_seq),
    attachments.length ? field('附件', `${attachments.length} 个`) : null,
    mentions.length ? field('提及', `${mentions.length} 个`) : null,
  )

  const displayed = stripMentions(content)
  return {
    title,
    subtitle: displayed || '(空消息)',
    category: 'message',
    fields: fieldsList,
    content: displayed,
    raw: data,
  }
}

function genericView(data: Data, title: string, category: EventCategory): FormattedEventView {
  const entries = Object.entries(data)
  const simple = entries
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 8)
    .map(([key, value]) => field(key, value))
  const nested = entries
    .filter(([, value]) => typeof value === 'object' && value !== null)
    .slice(0, 4)
    .map(([key, value]) => field(key, Array.isArray(value) ? `[${value.length} 项]` : '{…}'))

  return {
    title,
    subtitle: text(data.id) || text(data.name) || text(data.guild_id) || '',
    category,
    fields: fields(...simple, ...nested),
    raw: data,
  }
}

export function formatEvent(event: GatewayEvent): FormattedEventView {
  const type = event.type || 'UNKNOWN'
  const data = record(event.data)
  const meta = EVENT_TITLES[type]
  const title = meta?.title ?? type
  const category = meta?.category ?? 'unknown'

  switch (type) {
    case 'GROUP_AT_MESSAGE_CREATE':
    case 'C2C_MESSAGE_CREATE':
    case 'C2C_MSG_RECEIVE':
    case 'MESSAGE_CREATE':
    case 'AT_MESSAGE_CREATE':
    case 'DIRECT_MESSAGE_CREATE':
      return messageView(type, data, title)
    case 'GROUP_ADD_ROBOT':
    case 'GROUP_DEL_ROBOT':
      return {
        title,
        subtitle: text(data.group_openid),
        category,
        fields: fields(
          field('群 OpenID', data.group_openid),
          field('操作者', data.op_member_openid),
          field('时间', data.timestamp),
        ),
        raw: data,
      }
    case 'FRIEND_ADD':
    case 'FRIEND_DEL':
      return {
        title,
        subtitle: text(data.openid),
        category,
        fields: fields(field('用户 OpenID', data.openid), field('时间', data.timestamp)),
        raw: data,
      }
    case 'INTERACTION_CREATE':
      return {
        title,
        subtitle: text(data.id),
        category,
        fields: fields(
          field('互动 ID', data.id),
          field('场景', data.chat_type ?? data.type),
          field('按钮 ID', record(data.data).button_id),
          field('用户 OpenID', record(data.user).id),
          field('群 OpenID', data.group_openid),
          field('频道 ID', data.guild_id),
          field('时间', data.timestamp),
        ),
        raw: data,
      }
    case 'READY':
    case 'RESUMED':
      return genericView(data, title, category)
    default:
      return genericView(data, title, category)
  }
}

export function eventSummary(event: GatewayEvent): string {
  const view = formatEvent(event)
  if (view.content) return stripMentions(view.content)
  if (view.subtitle) return view.subtitle
  const data = record(event.data)
  return text(data.id) || text(data.name) || '—'
}

export function eventCategory(type: string): EventCategory {
  return EVENT_TITLES[type]?.category ?? 'unknown'
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
