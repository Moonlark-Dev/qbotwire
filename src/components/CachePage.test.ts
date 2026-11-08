import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CachePage from './CachePage.vue'
import { app } from '@/stores/app'
import type { Credentials, UserEntry } from '@/types'

const credentials: Credentials = {
  appId: '102030405',
  clientSecret: 'secret-123',
  environment: 'production',
  intents: 1 << 25,
}

const user: UserEntry = {
  openid: 'F4A3B2C1D5E6F708091A2B3C4D5E6F70',
  name: '旅人',
  avatar: null,
  firstSeen: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  messageCount: 1,
}

describe('CachePage avatars', () => {
  beforeEach(() => {
    app.credentials = credentials
    app.cache.users = [{ ...user }]
    app.cache.groups = []
  })

  afterEach(() => {
    app.credentials = null
    app.cache.users = []
    app.cache.groups = []
  })

  it('renders the real QQ avatar for a cached user without one', async () => {
    const wrapper = mount(CachePage)
    const userTab = wrapper.findAll('button.tab').find((tab) => tab.text().includes('用户'))
    expect(userTab).toBeTruthy()
    await userTab!.trigger('click')
    const img = wrapper.find('.card .avatar img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(
      `https://q.qlogo.cn/qqapp/${credentials.appId}/${user.openid}/100`,
    )
  })
})
