import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ApiCatalog from './ApiCatalog.vue'

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn(() => Promise.resolve()) }))

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))
vi.mock('@/lib/backend', () => ({ isTauri: true }))

const scrollBy = vi.fn()
const originalScrollBy = HTMLElement.prototype.scrollBy

beforeEach(() => {
  scrollBy.mockReset()
  openUrl.mockReset()
  HTMLElement.prototype.scrollBy = scrollBy as unknown as typeof HTMLElement.prototype.scrollBy
})

afterEach(() => {
  HTMLElement.prototype.scrollBy = originalScrollBy
})

describe('ApiCatalog', () => {
  it('scrolls the category chips horizontally with a vertical wheel', () => {
    const wrapper = mount(ApiCatalog, { props: { saved: [], activeId: null } })
    const chips = wrapper.find('.chips').element as HTMLElement
    Object.defineProperty(chips, 'clientWidth', { configurable: true, value: 263 })
    Object.defineProperty(chips, 'scrollWidth', { configurable: true, value: 574 })

    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    chips.dispatchEvent(event)

    expect(scrollBy).toHaveBeenCalledWith({ left: 120 })
    expect(event.defaultPrevented).toBe(true)
  })

  it('opens the API documentation through the opener plugin in Tauri', () => {
    const wrapper = mount(ApiCatalog, { props: { saved: [], activeId: null } })
    const link = wrapper.find('.catalog-foot a')

    expect(link.attributes('href')).toBe('https://bot.q.qq.com/wiki/develop/api-v2/')

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(event)

    // The WebView cannot open target="_blank" anchors by itself.
    expect(event.defaultPrevented).toBe(true)
    expect(openUrl).toHaveBeenCalledWith('https://bot.q.qq.com/wiki/develop/api-v2/')
  })
})
