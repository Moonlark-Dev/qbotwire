import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RequestEditor from './RequestEditor.vue'
import { app } from '@/stores/app'
import { blankTab, tabFromEndpoint, type RequestTab } from '@/lib/request'
import { getEndpoint } from '@/lib/apiCatalog'
import type { Credentials, GroupEntry, UserEntry } from '@/types'

const credentials: Credentials = {
  appId: '102030405',
  clientSecret: 'secret-123',
  environment: 'production',
  intents: 1 << 25,
}

const now = '2026-11-08T01:00:00.000Z'

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

const groups: GroupEntry[] = [
  {
    openid: 'GROUP_OPENID_BBBB',
    name: 'Moonlark 开发者群',
    avatar: null,
    memberCount: 128,
    firstSeen: now,
    lastSeen: now,
    messageCount: 3,
  },
]

function makeTab(body = ''): RequestTab {
  return {
    ...blankTab(),
    method: 'POST',
    path: '/v2/groups/{group_openid}/messages',
    pathParams: { group_openid: '' },
    body,
  }
}

const wrappers: ReturnType<typeof mount>[] = []

function mountEditor(tab: RequestTab) {
  // 挂到真实 document 上，textarea 才能 focus，光标位置也才可读。
  const wrapper = mount(RequestEditor, {
    props: { tab, sending: false },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}

function textareaOf(wrapper: ReturnType<typeof mountEditor>): HTMLTextAreaElement {
  return wrapper.find('textarea.body-input').element as HTMLTextAreaElement
}

describe('RequestEditor quick OpenID insert', () => {
  beforeEach(() => {
    app.credentials = credentials
    app.cache.users = users.map((user) => ({ ...user }))
    app.cache.groups = groups.map((group) => ({ ...group }))
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    app.credentials = null
    app.cache.users = []
    app.cache.groups = []
  })

  it('shows the insert action in the request body section', () => {
    const wrapper = mountEditor(makeTab())
    const button = wrapper.findAll('button').find((item) => item.text().includes('插入 OpenID'))
    expect(button).toBeTruthy()
  })

  it('opens a picker listing cached users and groups', async () => {
    const wrapper = mountEditor(makeTab())
    await wrapper.find('button[title^="从缓存中选择"]').trigger('click')

    expect(wrapper.find('.picker').exists()).toBe(true)
    expect(wrapper.findAll('.option')).toHaveLength(1)
    expect(wrapper.find('.option').text()).toContain('小灯')
    expect(wrapper.find('.option').text()).toContain('USER_OPENID_AAAA')

    const groupTab = wrapper.findAll('button.tab').find((tab) => tab.text().includes('群聊'))
    await groupTab!.trigger('click')
    expect(wrapper.find('.option').text()).toContain('Moonlark 开发者群')
    expect(wrapper.find('.option').text()).toContain('GROUP_OPENID_BBBB')
  })

  it('inserts the picked OpenID at the caret position', async () => {
    const tab = makeTab('{"openid": "", "content": "hi"}')
    const wrapper = mountEditor(tab)
    const textarea = textareaOf(wrapper)
    textarea.focus()
    textarea.setSelectionRange(12, 12)
    await wrapper.find('textarea.body-input').trigger('click')

    await wrapper.find('button[title^="从缓存中选择"]').trigger('click')
    await wrapper.find('.option').trigger('click')
    await nextTick()

    expect(tab.body).toBe('{"openid": "USER_OPENID_AAAA", "content": "hi"}')
    expect(textarea.selectionStart).toBe(12 + 'USER_OPENID_AAAA'.length)
    expect(textarea.selectionEnd).toBe(textarea.selectionStart)
    expect(wrapper.find('.picker').exists()).toBe(false)
  })

  it('inserts a group OpenID chosen from the group tab', async () => {
    const tab = makeTab('{"group_openid":"","content":"hi"}')
    const wrapper = mountEditor(tab)
    const textarea = textareaOf(wrapper)
    textarea.focus()
    textarea.setSelectionRange(17, 17)
    await wrapper.find('textarea.body-input').trigger('click')

    await wrapper.find('button[title^="从缓存中选择"]').trigger('click')
    const groupTab = wrapper.findAll('button.tab').find((item) => item.text().includes('群聊'))
    await groupTab!.trigger('click')
    await wrapper.find('.option').trigger('click')
    await nextTick()

    expect(tab.body).toBe('{"group_openid":"GROUP_OPENID_BBBB","content":"hi"}')
  })

  it('appends at the end when the body was never focused', async () => {
    const tab = makeTab('{"content":"hi"}')
    const wrapper = mountEditor(tab)

    await wrapper.find('button[title^="从缓存中选择"]').trigger('click')
    await wrapper.find('.option').trigger('click')

    expect(tab.body).toBe('{"content":"hi"}USER_OPENID_AAAA')
  })

  it('filters cached entries by name and OpenID', async () => {
    const wrapper = mountEditor(makeTab())
    await wrapper.find('button[title^="从缓存中选择"]').trigger('click')

    const search = wrapper.find('input.search')
    await search.setValue('小灯')
    expect(wrapper.findAll('.option')).toHaveLength(1)

    await search.setValue('nomatch')
    expect(wrapper.findAll('.option')).toHaveLength(0)
    expect(wrapper.find('.empty').text()).toContain('没有匹配的缓存记录')
  })

  it('explains how to fill the cache when it is empty', async () => {
    app.cache.users = []
    app.cache.groups = []
    const wrapper = mountEditor(makeTab())

    await wrapper.find('button[title^="从缓存中选择"]').trigger('click')
    expect(wrapper.find('.empty').text()).toContain('还没有用户缓存')
  })
})

describe('RequestEditor path parameter OpenID picker', () => {
  beforeEach(() => {
    app.credentials = credentials
    app.cache.users = users.map((user) => ({ ...user }))
    app.cache.groups = groups.map((group) => ({ ...group }))
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    app.credentials = null
    app.cache.users = []
    app.cache.groups = []
  })

  it('offers cached groups for a group placeholder in a custom request', async () => {
    const tab = {
      ...blankTab(),
      path: '/v2/groups/{group_openid}/messages',
      pathParams: { group_openid: '' },
    }
    const wrapper = mountEditor(tab)
    const picker = wrapper.find('.param .id-picker')

    expect(wrapper.find('.param-label').text()).toContain('群 OpenID')
    expect(picker.find('.picker-toggle').exists()).toBe(true)
    await picker.find('input.input').trigger('focus')

    const options = picker.findAll('.option')
    expect(options).toHaveLength(1)
    expect(options[0].text()).toContain('Moonlark 开发者群')
    expect(options[0].text()).toContain('GROUP_OPENID_BBBB')

    await options[0].trigger('click')
    expect(tab.pathParams.group_openid).toBe('GROUP_OPENID_BBBB')
  })

  it('offers cached users for a user placeholder in a custom request', async () => {
    const tab = {
      ...blankTab(),
      path: '/v2/users/{user_openid}/info',
      pathParams: { user_openid: '' },
    }
    const wrapper = mountEditor(tab)
    const picker = wrapper.find('.param .id-picker')

    expect(wrapper.find('.param-label').text()).toContain('用户 OpenID')
    await picker.find('input.input').trigger('focus')
    const options = picker.findAll('.option')
    expect(options).toHaveLength(1)
    expect(options[0].text()).toContain('小灯')

    await options[0].trigger('click')
    expect(tab.pathParams.user_openid).toBe('USER_OPENID_AAAA')
  })

  it('does not attach the picker to placeholders without an OpenID hint', () => {
    const tab = { ...blankTab(), path: '/v2/things/{id}', pathParams: { id: '' } }
    const wrapper = mountEditor(tab)

    expect(wrapper.find('.param .picker-toggle').exists()).toBe(false)
  })

  it('keeps built-in generic path params plain', () => {
    const tab = {
      ...tabFromEndpoint(getEndpoint('group.delete_message')!),
      pathParams: { group_openid: '', message_id: '' },
    }
    const wrapper = mountEditor(tab)

    expect(wrapper.findAll('.param')[0].find('.picker-toggle').exists()).toBe(true)
    expect(wrapper.findAll('.param')[1].find('.picker-toggle').exists()).toBe(false)
  })
})

describe('RequestEditor message builder', () => {
  beforeEach(() => {
    app.credentials = credentials
  })

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    app.credentials = null
  })

  it('opens the builder for send-message paths and fills the request body', async () => {
    const tab = makeTab('')
    const wrapper = mountEditor(tab)

    const trigger = wrapper.findAll('button').find((item) => item.text().includes('构造消息'))
    expect(trigger).toBeTruthy()
    await trigger!.trigger('click')

    expect(wrapper.find('.builder').exists()).toBe(true)

    const apply = wrapper
      .findAll('button')
      .find((item) => item.text().includes('填入请求体'))
    await apply!.trigger('click')

    expect(JSON.parse(tab.body)).toEqual({ content: '你好，QBotWire', msg_type: 0 })
    expect(wrapper.find('.builder').exists()).toBe(false)
  })

  it('hides the builder for non-message requests', () => {
    const tab = { ...makeTab(), path: '/v2/groups/{group_openid}/batch_remove_members' }
    const wrapper = mountEditor(tab)

    expect(wrapper.findAll('button').some((item) => item.text().includes('构造消息'))).toBe(false)
  })
})
