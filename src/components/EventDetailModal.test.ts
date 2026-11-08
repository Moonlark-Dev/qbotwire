import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EventDetailModal from './EventDetailModal.vue'
import { app } from '@/stores/app'
import type { Credentials, GatewayEvent, GroupEntry, UserEntry } from '@/types'

const credentials: Credentials = {
  appId: '102030405',
  clientSecret: 'secret-123',
  environment: 'production',
  intents: 1 << 25,
}

const now = '2026-11-08T01:00:00.000Z'

const users: UserEntry[] = [
  {
    openid: 'member-1',
    name: '小灯',
    avatar: 'https://example.com/u1.png',
    unionOpenid: 'union-1',
    firstSeen: now,
    lastSeen: now,
    messageCount: 2,
  },
  {
    openid: 'member-2',
    name: '旅人',
    avatar: null,
    firstSeen: now,
    lastSeen: now,
    messageCount: 1,
  },
]

const groups: GroupEntry[] = [
  {
    openid: 'group-1',
    name: 'Moonlark 开发者群',
    avatar: 'https://example.com/g.png',
    memberCount: 128,
    firstSeen: now,
    lastSeen: now,
    messageCount: 3,
  },
]

const event: GatewayEvent = {
  id: 'evt-1',
  seq: 3,
  type: 'GROUP_AT_MESSAGE_CREATE',
  receivedAt: now,
  data: {
    id: 'msg-1',
    content: '<@!member-1> 你好',
    group_openid: 'group-1',
    author: { id: 'member-1', member_openid: 'member-1' },
    timestamp: now,
    mentions: [{ id: 'member-2', member_openid: 'member-2' }],
  },
}

function mountModal() {
  return mount(EventDetailModal, {
    props: { event },
    global: { stubs: { teleport: true } },
  })
}

describe('EventDetailModal formatted view', () => {
  beforeEach(() => {
    app.credentials = credentials
    app.cache.users = users.map((user) => ({ ...user }))
    app.cache.groups = groups.map((group) => ({ ...group }))
  })

  afterEach(() => {
    app.credentials = null
    app.cache.users = []
    app.cache.groups = []
  })

  it('renders cached names as badges next to their OpenID rows', () => {
    const wrapper = mountModal()
    const labels = wrapper.findAll('.fields dt').map((row) => row.text())
    const values = wrapper.findAll('.fields dd')
    const chips = wrapper.findAll('.chip')

    expect(chips).toHaveLength(3)
    expect(chips.map((chip) => chip.text())).toEqual([
      'Moonlark 开发者群',
      '小灯',
      '旅人',
    ])

    const groupRow = values[labels.indexOf('群 OpenID')]
    expect(groupRow.find('.chip').text()).toBe('Moonlark 开发者群')
    const authorRow = values[labels.indexOf('成员 OpenID')]
    expect(authorRow.find('.chip').text()).toBe('小灯')
    const mentionRow = values[labels.indexOf('提及')]
    expect(mentionRow.findAll('.chip').map((chip) => chip.text())).toEqual(['旅人'])

    expect(groupRow.find('img').attributes('src')).toBe('https://example.com/g.png')
    expect(authorRow.find('img').attributes('src')).toBe('https://example.com/u1.png')
    expect(mentionRow.find('img').attributes('src')).toBe(
      'https://q.qlogo.cn/qqapp/102030405/member-2/100',
    )
    expect(authorRow.find('.chip').attributes('title')).toBe(
      'member-1 · Union union-1 · 本地缓存',
    )
  })

  it('keeps the raw OpenID fields in the details table', () => {
    const wrapper = mountModal()
    const labels = wrapper.findAll('.fields dt').map((row) => row.text())

    expect(labels).toContain('消息 ID')
    expect(labels).toContain('群 OpenID')
    expect(labels).toContain('成员 OpenID')
    expect(labels).toContain('提及')
    expect(wrapper.text()).toContain('group-1')
    expect(wrapper.text()).toContain('member-1')
  })

  it('keeps raw OpenID fields for events without cached entities', () => {
    const wrapper = mount(EventDetailModal, {
      props: {
        event: {
          id: 'evt-2',
          seq: 4,
          type: 'GROUP_ADD_ROBOT',
          receivedAt: now,
          data: { group_openid: 'group-404', op_member_openid: 'member-404', timestamp: now },
        },
      },
      global: { stubs: { teleport: true } },
    })

    expect(wrapper.findAll('.chip')).toHaveLength(0)
    const labels = wrapper.findAll('.fields dt').map((row) => row.text())
    expect(labels).toContain('群 OpenID')
    expect(labels).toContain('操作者')
  })
})
