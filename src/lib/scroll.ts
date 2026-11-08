/**
 * Horizontal scrolling helpers for single-line tag/tab strips.
 */

/**
 * Turn a plain vertical wheel over an overflowing strip into a horizontal
 * scroll. Trackpads and Shift+wheel already deliver `deltaX`, so those events
 * are left to the browser.
 */
export function scrollFromWheel(event: WheelEvent, element: HTMLElement | null): void {
  if (!element) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  if (element.scrollWidth <= element.clientWidth) return
  event.preventDefault()
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
  element.scrollBy({ left: delta })
}
