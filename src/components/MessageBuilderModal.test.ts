import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RequestEditor from './RequestEditor.vue'
import { app } from '@/stores/app'
import { blankTab, type RequestTab } from '@/lib/request'
import type { Credentials, GatewayEvent, UserEntry } from '@/types'

const credentials: Credentials = {
  appId: '102030405',
  clientSecret: 'secret-123',
  environment: 'production',
  intents: 1 << 25,
}

const now = '2026-11-11T12:00:00.000Z'

const users: UserEntry[] = [
  {
    openid: 'USER_OPENID_AAAA',
    name: '小灯',
    avatar: null,
    firstSeen: now,
    lastSeen: now,
    messageCount: 2,
  },
]

const events: GatewayEvent[] = [
  {
    id: 'evt-100',
    seq: 1,
    type: 'GROUP_AT_MESSAGE_CREATE',
    receivedAt: now,
    data: {
      id: 'MSG_FROM_EVENT_01',
      content: '测试被动回复',
      group_openid: 'GROUP_OPENID_BBBB',
    },
  },
]

function makeTab(
  body = '{"content": "初始问候", "msg_type": 0, "msg_id": "", "msg_seq": 1}',
  path = '/v2/groups/{group_openid}/messages',
): RequestTab {
  return {
    ...blankTab(),
    method: 'POST',
    path,
    pathParams: { group_openid: '' },
    body,
  }
}

const wrappers: ReturnType<typeof mount>[] = []

function mountEditor(tab: RequestTab) {
  const wrapper = mount(RequestEditor, {
    props: { tab, sending: false },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('MessageBuilderModal integration with RequestEditor', () => {
  beforeEach(() => {
    app.credentials = credentials
    app.cache.users = users.map((user) => ({ ...user }))
    app.cache.groups = []
    app.events = events.map((event) => ({ ...event }))
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    app.credentials = null
    app.cache.users = []
    app.cache.groups = []
    app.events = []
  })

  it('opens from RequestEditor, hydrates existing body, and writes formatted JSON back', async () => {
    const tab = makeTab()
    const wrapper = mountEditor(tab)

    const openBtn = wrapper.find('button[title="可视化构造 QQ Bot 消息请求体"]')
    expect(openBtn.exists()).toBe(true)
    await openBtn.trigger('click')

    expect(wrapper.find('.builder-grid').exists()).toBe(true)
    const contentBox = wrapper.find('textarea.content-textarea')
    expect((contentBox.element as HTMLTextAreaElement).value).toBe('初始问候')

    await contentBox.setValue('通过构造器修改后的文本')

    // Fill msg_id from recent gateway event
    const eventToggle = wrapper
      .findAll('button.mini-link')
      .find((btn) => btn.text().includes('从最近事件填入'))
    expect(eventToggle).toBeTruthy()
    await eventToggle!.trigger('click')
    await wrapper.find('button.candidate-row').trigger('click')

    const applyBtn = wrapper
      .findAll('button.btn.primary')
      .find((btn) => btn.text().includes('写入请求体'))
    await applyBtn!.trigger('click')
    await nextTick()

    expect(wrapper.find('.builder-grid').exists()).toBe(false)
    expect(JSON.parse(tab.body)).toEqual({
      content: '通过构造器修改后的文本',
      msg_type: 0,
      msg_id: 'MSG_FROM_EVENT_01',
      msg_seq: 1,
    })
  })

  it('builds Markdown with custom inline keyboard and only closes the inner picker on Escape', async () => {
    const tab = makeTab('')
    const wrapper = mountEditor(tab)
    await wrapper.find('button[title="可视化构造 QQ Bot 消息请求体"]').trigger('click')

    const mdTab = wrapper.findAll('button.kind-tab').find((btn) => btn.text().includes('Markdown'))
    await mdTab!.trigger('click')

    const customKbBtn = wrapper
      .findAll('button.sub-tab')
      .find((btn) => btn.text().includes('自定义面板'))
    await customKbBtn!.trigger('click')

    // Open nested OpenIdInsertModal for @mention and press Escape
    const mentionBtn = wrapper
      .findAll('button.mini-link')
      .find((btn) => btn.text().includes('@提及'))
    await mentionBtn!.trigger('click')
    expect(wrapper.find('.picker').exists()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    // Inner picker closes while MessageBuilderModal remains open
    expect(wrapper.find('.picker').exists()).toBe(false)
    expect(wrapper.find('.builder-grid').exists()).toBe(true)

    const applyBtn = wrapper
      .findAll('button.btn.primary')
      .find((btn) => btn.text().includes('写入请求体'))
    await applyBtn!.trigger('click')

    const built = JSON.parse(tab.body)
    expect(built.msg_type).toBe(2)
    expect(built.markdown).toEqual({
      content: '# 你好，QBotWire\n这是一条 **Markdown** 测试消息。',
    })
    expect(built.keyboard.content.rows).toHaveLength(1)
    expect(built.keyboard.content.rows[0].buttons).toHaveLength(1)
  })

  it('auto-selects guild scene for channel message endpoints', async () => {
    const tab = makeTab('{"content": "频道好"}', '/channels/{channel_id}/messages')
    const wrapper = mountEditor(tab)
    await wrapper.find('button[title="可视化构造 QQ Bot 消息请求体"]').trigger('click')

    const applyBtn = wrapper
      .findAll('button.btn.primary')
      .find((btn) => btn.text().includes('写入请求体'))
    await applyBtn!.trigger('click')

    expect(JSON.parse(tab.body)).toEqual({ content: '频道好' })
  })
})
