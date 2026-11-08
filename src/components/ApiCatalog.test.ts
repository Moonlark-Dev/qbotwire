import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ApiCatalog from './ApiCatalog.vue'

const scrollBy = vi.fn()
const originalScrollBy = HTMLElement.prototype.scrollBy

beforeEach(() => {
  scrollBy.mockReset()
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
})
