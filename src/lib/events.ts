import type { GatewayEvent } from '@/types'
import { resolveUserAvatar } from './avatar'

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
  /** Group chat behind `group_openid`, enriched with the local cache. */
  group?: EventEntity | null
  /** Author of a message event, enriched with the local cache. */
  author?: EventEntity | null
  /** Users mentioned by a message event, enriched with the local cache. */
  mentions?: EventEntity[]
  raw: unknown
}

export interface FormattedField {
  label: string
  value: string
  mono?: boolean
  /** Cached profile shown as a badge next to the OpenID. */
  entity?: EventEntity
  /** Multiple profiles (e.g. every mentioned user) for one field. */
  entities?: EventEntity[]
}

/** A user / group referenced by an event, resolved against the local cache. */
export interface EventEntity {
  kind: 'user' | 'group'
  openid: string
  /** Display name: the payload value first, then the cached name. */
  name: string | null
  avatar: string | null
  unionOpenid?: string | null
  /** Mention entry flagged as a Bot by QQ. */
  bot?: boolean
  /** True when the name or avatar was filled in from the local cache. */
  fromCache?: boolean
}

interface CacheUser {
  name?: string | null
  avatar?: string | null
  unionOpenid?: string | null
}

interface CacheGroup {
  name?: string | null
  avatar?: string | null
}

/**
 * Optional local-cache resolver. Without it the view still carries the raw
 * OpenIDs; with it the UI can also show names and avatars.
 */
export interface EventLookup {
  appId?: string | null
  user?: (openid: string) => CacheUser | undefined
  group?: (openid: string) => CacheGroup | undefined
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

function entityField(
  label: string,
  value: unknown,
  entity: EventEntity | null | undefined,
  mono = true,
): FormattedField | null {
  const rendered = text(value)
  if (!rendered) return null
  return entity ? { label, value: rendered, mono, entity } : { label, value: rendered, mono }
}

function userEntity(
  openidValue: unknown,
  supplied: { name?: unknown; avatar?: unknown; unionOpenid?: unknown; bot?: unknown },
  lookup?: EventLookup,
): EventEntity | null {
  const openid = text(openidValue).trim()
  if (!openid) return null
  const cached = lookup?.user?.(openid)
  const suppliedName = text(supplied.name).trim()
  const cachedName = text(cached?.name).trim()
  const suppliedAvatar = text(supplied.avatar).trim()
  const cachedAvatar = text(cached?.avatar).trim()
  const unionOpenid = text(supplied.unionOpenid).trim() || text(cached?.unionOpenid).trim()
  return {
    kind: 'user',
    openid,
    name: suppliedName || cachedName || null,
    avatar: resolveUserAvatar(lookup?.appId, {
      openid,
      avatar: suppliedAvatar || cachedAvatar || null,
    }),
    unionOpenid: unionOpenid || null,
    bot: supplied.bot === true,
    fromCache: Boolean((!suppliedName && cachedName) || (!suppliedAvatar && cachedAvatar)),
  }
}

function groupEntity(openidValue: unknown, lookup?: EventLookup): EventEntity | null {
  const openid = text(openidValue).trim()
  if (!openid) return null
  const cached = lookup?.group?.(openid)
  const name = text(cached?.name).trim()
  const avatar = text(cached?.avatar).trim()
  return {
    kind: 'group',
    openid,
    name: name || null,
    avatar: avatar || null,
    fromCache: Boolean(name || avatar),
  }
}

const EVENT_TITLES: Record<string, { title: string; category: EventCategory }> = {
  GROUP_AT_MESSAGE_CREATE: { title: '群聊 @ 消息', category: 'message' },
  GROUP_MESSAGE_CREATE: { title: '群聊消息', category: 'message' },
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

function messageView(
  type: string,
  data: Data,
  title: string,
  lookup?: EventLookup,
): FormattedEventView {
  const author = record(data.author)
  const content = text(data.content)
  const attachments = Array.isArray(data.attachments) ? data.attachments : []
  const rawMentions = Array.isArray(data.mentions) ? data.mentions : []
  const isGuild = type.includes('GUILD') || type === 'MESSAGE_CREATE' || type === 'AT_MESSAGE_CREATE' || type === 'DIRECT_MESSAGE_CREATE'
  const isC2c = type === 'C2C_MESSAGE_CREATE' || type === 'C2C_MSG_RECEIVE'

  const authorOpenid = isGuild
    ? author.id ?? author.user_openid
    : isC2c
      ? author.user_openid ?? author.id
      : author.member_openid ?? author.id
  const authorEntity = userEntity(
    authorOpenid,
    {
      name: author.username,
      avatar: author.avatar,
      unionOpenid: author.union_openid,
    },
    lookup,
  )
  const group = !isGuild && !isC2c ? groupEntity(data.group_openid, lookup) : null
  const mentionEntities = rawMentions
    .map((item) => {
      const mention = record(item)
      return userEntity(
        mention.member_openid ?? mention.user_openid ?? mention.id,
        {
          name: mention.username,
          avatar: mention.avatar,
          unionOpenid: mention.union_openid,
          bot: mention.bot,
        },
        lookup,
      )
    })
    .filter((entity): entity is EventEntity => entity !== null)

  const fieldsList = fields(
    field('消息 ID', data.id),
    !isGuild && !isC2c ? entityField('群 OpenID', data.group_openid, group) : null,
    isC2c ? entityField('用户 OpenID', author.user_openid ?? author.id, authorEntity) : null,
    !isGuild && !isC2c
      ? entityField('成员 OpenID', author.member_openid ?? author.id, authorEntity)
      : null,
    field('Union OpenID', author.union_openid),
    isGuild ? field('频道 ID', data.guild_id) : null,
    isGuild ? field('子频道 ID', data.channel_id) : null,
    isGuild ? field('发送者', author.username, false) : null,
    isGuild ? entityField('发送者 ID', author.id, authorEntity) : null,
    field('时间', data.timestamp),
    field('msg_seq', data.msg_seq),
    attachments.length ? field('附件', `${attachments.length} 个`) : null,
    rawMentions.length
      ? {
          label: '提及',
          value: `${rawMentions.length} 个`,
          mono: true,
          entities: mentionEntities.filter((entity) => entity.name),
        }
      : null,
  )

  const displayed = stripMentions(content)
  return {
    title,
    subtitle: displayed || '(空消息)',
    category: 'message',
    fields: fieldsList,
    content: displayed,
    group,
    author: authorEntity,
    mentions: mentionEntities,
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

export function formatEvent(event: GatewayEvent, lookup?: EventLookup): FormattedEventView {
  const type = event.type || 'UNKNOWN'
  const data = record(event.data)
  const meta = EVENT_TITLES[type]
  const title = meta?.title ?? type
  const category = meta?.category ?? 'unknown'

  switch (type) {
    case 'GROUP_AT_MESSAGE_CREATE':
    case 'GROUP_MESSAGE_CREATE':
    case 'C2C_MESSAGE_CREATE':
    case 'C2C_MSG_RECEIVE':
    case 'MESSAGE_CREATE':
    case 'AT_MESSAGE_CREATE':
    case 'DIRECT_MESSAGE_CREATE':
      return messageView(type, data, title, lookup)
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
