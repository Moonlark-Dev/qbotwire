import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MainShell from './MainShell.vue'
import { app } from '@/stores/app'

const SIDEBAR_KEY = 'qbotwire.sidebar.collapsed'

function mountShell() {
  return mount(MainShell, {
    global: {
      stubs: {
        SendPage: true,
        ReceivePage: true,
        CachePage: true,
        SettingsModal: true,
      },
    },
  })
}

describe('MainShell sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    app.page = 'send'
    app.settingsOpen = false
  })

  it('starts expanded and remembers the collapsed state', async () => {
    const wrapper = mountShell()
    const sidebar = wrapper.find('#sidebar')
    const toggle = wrapper.find('button[aria-controls="sidebar"]')

    expect(sidebar.exists()).toBe(true)
    expect(sidebar.classes()).not.toContain('collapsed')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('title')).toBe('收起侧边栏')

    await toggle.trigger('click')

    expect(sidebar.classes()).toContain('collapsed')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('title')).toBe('展开侧边栏')
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1')

    await toggle.trigger('click')

    expect(sidebar.classes()).not.toContain('collapsed')
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0')
  })

  it('restores a previously collapsed sidebar', () => {
    localStorage.setItem(SIDEBAR_KEY, '1')
    const wrapper = mountShell()

    expect(wrapper.find('#sidebar').classes()).toContain('collapsed')
    expect(wrapper.find('button[aria-controls="sidebar"]').attributes('aria-expanded')).toBe('false')
  })

  it('keeps every page reachable while collapsed', async () => {
    const wrapper = mountShell()
    const navItems = wrapper.findAll('.nav-item')
    const collapse = wrapper.find('button[aria-controls="sidebar"]')

    await collapse.trigger('click')
    await navItems[2].trigger('click')

    expect(app.page).toBe('cache')
    expect(navItems.map((item) => item.attributes('title'))).toEqual(['发送', '接收', '缓存'])
  })
})
