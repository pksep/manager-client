import { publicUrl, type EmbedOptions, type FrameMode } from './protocol'

/** One isolated instance per call. Destroy removes the frame and all listeners. */
export function mount(options: EmbedOptions) {
  options = {
    ...options,
    source: {
      pageUrl: location.origin + location.pathname,
      title: document.title.slice(0, 200),
      referrerOrigin: document.referrer
        ? new URL(document.referrer).origin
        : '',
    },
  }
  const widgetUrl = new URL(publicUrl(options.widgetUrl))
  publicUrl(options.serviceUrl)
  if (!/^[\w-]{1,100}$/.test(options.siteId))
    throw new Error('Некорректный siteId')
  const instance = crypto.randomUUID()
  widgetUrl.hash = new URLSearchParams({
    instance,
    parentOrigin: location.origin,
  }).toString()
  const frame = document.createElement('iframe')
  frame.title = 'Связаться с компанией'
  frame.dataset.sepManager = instance
  frame.referrerPolicy = 'no-referrer'
  frame.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads',
  )
  frame.setAttribute('allow', 'clipboard-write')
  frame.style.cssText =
    'position:fixed!important;display:none!important;border:0!important;margin:0!important;padding:0!important;background:transparent!important;z-index:2147483000!important;color-scheme:light!important;'
  let mode: FrameMode = 'hidden'
  let menuHeight = 160
  let alive = true
  let panelPosition: { left: number; top: number } | undefined
  let dragOrigin:
    | { x: number; y: number; left: number; top: number }
    | undefined
  const offset = Math.max(8, Math.min(80, options.offset ?? 24))
  function layout() {
    const availableWidth = Math.max(1, window.innerWidth - offset * 2)
    const availableHeight = Math.max(1, window.innerHeight - offset * 2)
    const width = Math.min(
      mode === 'panel' ? 418 : mode === 'menu' ? 280 : 60,
      availableWidth,
    )
    const height = Math.min(
      mode === 'panel' ? 640 : mode === 'menu' ? menuHeight : 60,
      availableHeight,
    )
    let left = window.innerWidth - width - offset
    let top = window.innerHeight - height - offset
    if (mode === 'panel' && panelPosition) {
      left = Math.min(
        Math.max(8, panelPosition.left),
        Math.max(8, window.innerWidth - width - 8),
      )
      top = Math.min(
        Math.max(8, panelPosition.top),
        Math.max(8, window.innerHeight - height - 8),
      )
      panelPosition = { left, top }
    }
    for (const [key, value] of Object.entries({
      display: mode === 'hidden' ? 'none' : 'block',
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`,
      right: 'auto',
      bottom: 'auto',
      'border-radius':
        mode === 'launcher' ? '50%' : mode === 'panel' ? '20px' : '0',
      'box-shadow': mode === 'panel' ? '0 0 22px rgba(0,0,0,0.07)' : 'none',
      'clip-path':
        mode === 'menu'
          ? `polygon(0 0,100% 0,100% 100%,calc(100% - 60px) 100%,calc(100% - 60px) calc(100% - 72px),0 calc(100% - 72px))`
          : 'none',
    }))
      frame.style.setProperty(key, value, 'important')
  }
  function receive(event: MessageEvent) {
    if (
      !alive ||
      event.source !== frame.contentWindow ||
      event.origin !== widgetUrl.origin ||
      event.data?.instance !== instance
    )
      return
    if (event.data.type === 'sep-manager:ready') {
      frame.contentWindow?.postMessage(
        { type: 'sep-manager:init', instance, options },
        widgetUrl.origin,
      )
    }
    if (
      event.data.type === 'sep-manager:state' &&
      ['hidden', 'launcher', 'menu', 'panel'].includes(event.data.mode)
    ) {
      mode = event.data.mode
      if (mode !== 'panel') dragOrigin = undefined
      menuHeight = Math.min(
        420,
        Math.max(132, Number(event.data.menuHeight) || 160),
      )
      layout()
    }
    if (event.data.type === 'sep-manager:move' && mode === 'panel') {
      const { phase, x, y } = event.data
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      if (phase === 'start') {
        const { left, top } = frame.getBoundingClientRect()
        dragOrigin = { x, y, left, top }
      } else if (phase === 'move' && dragOrigin) {
        panelPosition = {
          left: dragOrigin.left + x - dragOrigin.x,
          top: dragOrigin.top + y - dragOrigin.y,
        }
        layout()
      } else if (phase === 'end') dragOrigin = undefined
      else if (phase === 'nudge' && Math.abs(x) <= 40 && Math.abs(y) <= 40) {
        const { left, top } = frame.getBoundingClientRect()
        panelPosition = { left: left + x, top: top + y }
        layout()
      }
    }
  }
  window.addEventListener('message', receive)
  window.addEventListener('resize', layout)
  let loaded = false
  frame.addEventListener('load', () => {
    if (loaded) {
      mode = 'hidden'
      layout()
    }
    loaded = true
  })
  frame.src = widgetUrl.href
  document.body.append(frame)
  return {
    destroy() {
      alive = false
      window.removeEventListener('message', receive)
      window.removeEventListener('resize', layout)
      frame.remove()
    },
  }
}
