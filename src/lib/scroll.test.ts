import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrollFromWheel } from './scroll'

const scrollBy = vi.fn()

function makeStrip(size: { clientWidth: number; scrollWidth: number }) {
  const element = document.createElement('div')
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: size.clientWidth })
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: size.scrollWidth })
  element.scrollBy = scrollBy as unknown as HTMLElement['scrollBy']
  return element
}

function wheel(init: WheelEventInit) {
  return new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
}

beforeEach(() => {
  scrollBy.mockReset()
})

describe('scrollFromWheel', () => {
  it('scrolls an overflowing strip sideways with a vertical wheel', () => {
    const element = makeStrip({ clientWidth: 300, scrollWidth: 900 })
    const event = wheel({ deltaY: 120 })

    scrollFromWheel(event, element)

    expect(scrollBy).toHaveBeenCalledWith({ left: 120 })
    expect(event.defaultPrevented).toBe(true)
  })

  it('scales line-based wheel deltas', () => {
    const element = makeStrip({ clientWidth: 300, scrollWidth: 900 })
    scrollFromWheel(wheel({ deltaY: 3, deltaMode: 1 }), element)
    expect(scrollBy).toHaveBeenCalledWith({ left: 48 })
  })

  it('does nothing when the strip does not overflow', () => {
    const element = makeStrip({ clientWidth: 300, scrollWidth: 300 })
    const event = wheel({ deltaY: 120 })

    scrollFromWheel(event, element)

    expect(scrollBy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('leaves horizontal wheel input to the browser', () => {
    const element = makeStrip({ clientWidth: 300, scrollWidth: 900 })
    const event = wheel({ deltaX: 120, deltaY: 0 })

    scrollFromWheel(event, element)

    expect(scrollBy).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores a missing element', () => {
    expect(() => scrollFromWheel(wheel({ deltaY: 120 }), null)).not.toThrow()
  })
})
