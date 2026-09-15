import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { PanelMove } from './protocol'

export function usePanelDrag(
  enabled: Ref<boolean>,
  move: (event: PanelMove) => void,
) {
  const dragging = ref(false)
  let captured:
    | { element: HTMLElement; pointerId: number; x: number; y: number }
    | undefined

  function stop() {
    if (!captured) return
    const { element, pointerId, x, y } = captured
    captured = undefined
    dragging.value = false
    if (element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId)
    move({ phase: 'end', x, y })
  }
  function start(event: PointerEvent) {
    if (
      !enabled.value ||
      event.button !== 0 ||
      !event.isPrimary ||
      (event.target as Element).closest('button, a, input')
    )
      return
    const element = event.currentTarget as HTMLElement
    event.preventDefault()
    element.setPointerCapture(event.pointerId)
    captured = {
      element,
      pointerId: event.pointerId,
      x: event.screenX,
      y: event.screenY,
    }
    dragging.value = true
    move({ phase: 'start', x: event.screenX, y: event.screenY })
  }
  function update(event: PointerEvent) {
    if (!captured || captured.pointerId !== event.pointerId) return
    captured.x = event.screenX
    captured.y = event.screenY
    move({ phase: 'move', x: event.screenX, y: event.screenY })
  }
  function keydown(event: KeyboardEvent) {
    if (!enabled.value || event.target !== event.currentTarget) return
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    const distance = event.shiftKey ? 40 : 10
    move({
      phase: 'nudge',
      x: direction[0] * distance,
      y: direction[1] * distance,
    })
  }
  watch(enabled, (value) => {
    if (!value) stop()
  })
  onBeforeUnmount(stop)
  return { dragging, start, update, stop, keydown }
}
