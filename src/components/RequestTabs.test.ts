import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import RequestTabs from './RequestTabs.vue'
import { blankTab, type RequestTab } from '@/lib/request'

function makeTabs(count: number): RequestTab[] {
  return Array.from({ length: count }, (_, index) => ({
    ...blankTab(),
    id: `tab-${index}`,
    title: `请求 ${index}`,
  }))
}

function rect(left: number, right: number): DOMRect {
  return {
    left,
    right,
    top: 0,
    bottom: 30,
    width: right - left,
    height: 30,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function setSize(element: HTMLElement, size: { clientWidth: number; scrollWidth: number }) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: size.clientWidth })
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: size.scrollWidth })
}

const scrollBy = vi.fn()
const originalScrollBy = HTMLElement.prototype.scrollBy

beforeEach(() => {
  scrollBy.mockReset()
  HTMLElement.prototype.scrollBy = scrollBy as unknown as typeof HTMLElement.prototype.scrollBy
})

afterEach(() => {
  HTMLElement.prototype.scrollBy = originalScrollBy
})

describe('RequestTabs', () => {
  it('scrolls horizontally when the tab strip overflows', () => {
    const wrapper = mount(RequestTabs, { props: { tabs: makeTabs(3), activeId: 'tab-0' } })
    const strip = wrapper.find('.tabs-scroll').element as HTMLElement
    setSize(strip, { clientWidth: 300, scrollWidth: 900 })

    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    strip.dispatchEvent(event)

    expect(scrollBy).toHaveBeenCalledWith({ left: 120 })
    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores the wheel when every tab fits', () => {
    const wrapper = mount(RequestTabs, { props: { tabs: makeTabs(1), activeId: 'tab-0' } })
    const strip = wrapper.find('.tabs-scroll').element as HTMLElement
    setSize(strip, { clientWidth: 300, scrollWidth: 300 })

    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
    strip.dispatchEvent(event)

    expect(scrollBy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves horizontal wheel input to the browser', () => {
    const wrapper = mount(RequestTabs, { props: { tabs: makeTabs(3), activeId: 'tab-0' } })
    const strip = wrapper.find('.tabs-scroll').element as HTMLElement
    setSize(strip, { clientWidth: 300, scrollWidth: 900 })

    const event = new WheelEvent('wheel', { deltaX: 120, bubbles: true, cancelable: true })
    strip.dispatchEvent(event)

    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('brings the newly selected tab into view', async () => {
    const wrapper = mount(RequestTabs, { props: { tabs: makeTabs(3), activeId: 'tab-0' } })
    const strip = wrapper.find('.tabs-scroll').element as HTMLElement
    ;(strip as HTMLElement).getBoundingClientRect = () => rect(0, 100)
    const [, secondTab] = wrapper.findAll('.tab')
    ;(secondTab.element as HTMLElement).getBoundingClientRect = () => rect(150, 250)
    scrollBy.mockReset()

    await wrapper.setProps({ activeId: 'tab-1' })
    await nextTick()
    await nextTick()

    expect(scrollBy).toHaveBeenCalledWith({ left: 150, behavior: 'smooth' })
  })
})
