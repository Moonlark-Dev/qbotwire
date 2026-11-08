import { describe, expect, it } from 'vitest'
import type { GatewayEvent } from '@/types'
import { eventSummary, formatEvent, stripMentions, type EventLookup } from './events'

function event(type: string, data: unknown): GatewayEvent {
  return {
    id: 'evt-1',
    seq: 7,
    type,
    receivedAt: '2026-11-07T12:00:00.000Z',
    data,
  }
}

const lookup: EventLookup = {
  appId: '102030405',
  user: (openid) => {
    if (openid === 'member-1') {
      return { name: '小灯', avatar: null, unionOpenid: 'union-cache' }
    }
    if (openid === 'u-9') {
      return { name: '缓存用户', avatar: 'https://example.com/u9.png' }
    }
    return undefined
  },
  group: (openid) =>
    openid === 'group-1'
      ? { name: 'Moonlark 开发者群', avatar: 'https://example.com/g.png' }
      : undefined,
}

describe('stripMentions', () => {
  it('removes qq mention markers and trims', () => {
    expect(stripMentions('<@!openid1> 你好 <@openid2>')).toBe('你好')
  })
})

describe('formatEvent', () => {
  it('formats a group message with author and group fields', () => {
    const view = formatEvent(
      event('GROUP_AT_MESSAGE_CREATE', {
        id: 'msg-1',
        content: '<@!bot> 在吗',
        group_openid: 'group-1',
        author: {
          id: 'member-1',
          member_openid: 'member-1',
          union_openid: 'union-1',
        },
        timestamp: '2026-11-07T12:00:00Z',
        attachments: [{ url: 'https://example.com/a.png' }],
      }),
    )
    expect(view.title).toBe('群聊 @ 消息')
    expect(view.subtitle).toBe('在吗')
    expect(view.category).toBe('message')
    expect(view.fields.map((field) => field.label)).toContain('群 OpenID')
    expect(view.fields.find((field) => field.label === '成员 OpenID')?.value).toBe(
      'member-1',
    )
    expect(view.fields.find((field) => field.label === '附件')?.value).toBe('1 个')
  })

  it('formats a plain group message as a group message', () => {
    const view = formatEvent(
      event('GROUP_MESSAGE_CREATE', {
        id: 'msg-10',
        content: 'test',
        group_id: 'group-10',
        group_openid: 'group-10',
        author: {
          id: 'member-10',
          member_openid: 'member-10',
          union_openid: 'union-10',
          username: 'SunaōkamiNya',
        },
        timestamp: '2026-11-08T08:20:43+08:00',
      }),
    )
    expect(view.title).toBe('群聊消息')
    expect(view.category).toBe('message')
    expect(view.subtitle).toBe('test')
    expect(view.fields.find((field) => field.label === '群 OpenID')?.value).toBe(
      'group-10',
    )
    expect(view.fields.find((field) => field.label === '成员 OpenID')?.value).toBe(
      'member-10',
    )
  })

  it('formats a c2c message', () => {
    const view = formatEvent(
      event('C2C_MESSAGE_CREATE', {
        id: 'msg-2',
        content: '你好',
        author: { id: 'u-1', user_openid: 'u-1' },
      }),
    )
    expect(view.title).toBe('单聊消息')
    expect(view.fields.find((field) => field.label === '用户 OpenID')?.value).toBe('u-1')
  })

  it('formats guild messages with channel information', () => {
    const view = formatEvent(
      event('AT_MESSAGE_CREATE', {
        id: 'msg-3',
        content: '频道消息',
        guild_id: 'guild-1',
        channel_id: 'channel-1',
        author: { id: 'user-1', username: '旅人', avatar: 'https://example.com/avatar.png' },
      }),
    )
    expect(view.title).toBe('频道 @ 消息')
    expect(view.fields.find((field) => field.label === '发送者')?.value).toBe('旅人')
    expect(view.fields.find((field) => field.label === '频道 ID')?.value).toBe('guild-1')
  })

  it('falls back to a generic view for unknown dispatch types', () => {
    const view = formatEvent(
      event('SOMETHING_NEW', { id: 'abc', guild_id: 'g1', nested: { a: 1 } }),
    )
    expect(view.title).toBe('SOMETHING_NEW')
    expect(view.category).toBe('unknown')
    expect(view.subtitle).toBe('abc')
  })

  it('summarizes content for the event list', () => {
    const summary = eventSummary(
      event('GROUP_AT_MESSAGE_CREATE', {
        content: '<@!bot> 一条消息',
        author: { member_openid: 'u' },
        group_openid: 'g',
      }),
    )
    expect(summary).toBe('一条消息')
  })

  it('resolves the group, author and mentions from the local cache', () => {
    const view = formatEvent(
      event('GROUP_AT_MESSAGE_CREATE', {
        id: 'msg-20',
        content: '<@!member-1> 你好',
        group_openid: 'group-1',
        author: {
          id: 'member-1',
          member_openid: 'member-1',
          union_openid: 'union-api',
        },
        mentions: [
          { id: 'member-1', member_openid: 'member-1' },
          { id: 'member-2', member_openid: 'member-2', username: '路人', bot: true },
        ],
      }),
      lookup,
    )

    expect(view.group).toMatchObject({
      kind: 'group',
      openid: 'group-1',
      name: 'Moonlark 开发者群',
      avatar: 'https://example.com/g.png',
      fromCache: true,
    })
    expect(view.author).toMatchObject({
      kind: 'user',
      openid: 'member-1',
      name: '小灯',
      avatar: 'https://q.qlogo.cn/qqapp/102030405/member-1/100',
      unionOpenid: 'union-api',
      fromCache: true,
    })
    expect(view.mentions?.map((mention) => mention.name)).toEqual(['小灯', '路人'])
    expect(view.mentions?.[1].bot).toBe(true)

    const groupField = view.fields.find((item) => item.label === '群 OpenID')
    expect(groupField?.entity?.name).toBe('Moonlark 开发者群')
    const authorField = view.fields.find((item) => item.label === '成员 OpenID')
    expect(authorField?.entity?.name).toBe('小灯')
    const mentionField = view.fields.find((item) => item.label === '提及')
    expect(mentionField?.entities?.map((entity) => entity.name)).toEqual(['小灯', '路人'])
  })

  it('prefers names and avatars carried by the payload', () => {
    const view = formatEvent(
      event('AT_MESSAGE_CREATE', {
        id: 'msg-21',
        content: 'hi',
        guild_id: 'guild-1',
        channel_id: 'channel-1',
        author: {
          id: 'member-1',
          username: '频道里的旅人',
          avatar: 'https://example.com/avatar.png',
        },
      }),
      lookup,
    )

    expect(view.author).toMatchObject({
      name: '频道里的旅人',
      avatar: 'https://example.com/avatar.png',
      fromCache: false,
    })
  })

  it('uses the cached name for a c2c author', () => {
    const view = formatEvent(
      event('C2C_MESSAGE_CREATE', {
        id: 'msg-22',
        content: '你好',
        author: { id: 'u-9', user_openid: 'u-9' },
      }),
      lookup,
    )

    expect(view.author).toMatchObject({
      openid: 'u-9',
      name: '缓存用户',
      avatar: 'https://example.com/u9.png',
    })
    expect(view.group).toBeNull()
  })
})
