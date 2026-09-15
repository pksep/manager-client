import type { Directive } from 'vue'

// fit-content caps a wrapped bubble at the available width, even when its
// actual lines are much shorter. Measure text runs, not full-width <p> boxes.
const states = new WeakMap<
  HTMLElement,
  { observer: ResizeObserver; frame: number; active: boolean }
>()

function fit(element: HTMLElement) {
  element.style.width = ''
  if (
    !element.classList.contains('chat-message-surface--outgoing') ||
    element.querySelector('.message-file')
  )
    return
  const content = element.querySelector<HTMLElement>('.message-content')
  const text = content?.querySelector('.message-html, .contact-summary-text')
  const meta = content?.querySelector<HTMLElement>('.chat-message-meta')
  if (!content || !text || !meta || !element.getClientRects().length) return
  const naturalWidth = element.getBoundingClientRect().width
  const origin = content.getBoundingClientRect()
  const lines = new Map<number, number>()
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent?.trimEnd() || ''
    if (!value) continue
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, value.length)
    for (const rect of range.getClientRects()) {
      const line = Math.round(rect.bottom / 2) * 2
      lines.set(line, Math.max(lines.get(line) || 0, rect.right - origin.left))
    }
  }
  if (lines.size < 2 || text.querySelector('ul, ol, blockquote')) return
  const longest = Math.max(...lines.values())
  const last = lines.get(Math.max(...lines.keys()))!
  const withTime = last + 8 + meta.getBoundingClientRect().width
  const contentWidth = Math.max(
    longest,
    withTime <= origin.width ? withTime : meta.getBoundingClientRect().width,
  )
  const style = getComputedStyle(element)
  const width = Math.ceil(
    contentWidth +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight) +
      1,
  )
  if (width < naturalWidth - 1) element.style.width = `${width}px`
}

function schedule(element: HTMLElement) {
  const state = states.get(element)
  if (!state?.active) return
  cancelAnimationFrame(state.frame)
  state.frame = requestAnimationFrame(() => {
    if (state.active) fit(element)
  })
}

export const vCompactMessage: Directive<HTMLElement> = {
  mounted(element) {
    let previousWidth = -1
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === previousWidth) return
      previousWidth = entry.contentRect.width
      schedule(element)
    })
    states.set(element, { observer, frame: 0, active: true })
    if (element.parentElement) observer.observe(element.parentElement)
    void document.fonts.ready.then(() => schedule(element))
    schedule(element)
  },
  updated: schedule,
  unmounted(element) {
    const state = states.get(element)
    if (!state) return
    state.active = false
    cancelAnimationFrame(state.frame)
    state.observer.disconnect()
    states.delete(element)
  },
}
