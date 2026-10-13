import type { PanelMotion, PanelMotionPhase } from './protocol'

/** Only the authenticated host can confirm sizing and animation completion. */
export function createPanelMotion(
  instance: string,
  parentOrigin: string,
): PanelMotion {
  let sequence = 0

  return (phase: PanelMotionPhase): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const id = ++sequence
      let viewportFrame: number | undefined

      const finish = (completed: boolean): void => {
        window.clearTimeout(timeout)
        window.removeEventListener('message', receive)
        if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame)
        resolve(completed)
      }

      const receive = (event: MessageEvent): void => {
        const data = event.data

        if (
          event.source !== window.parent ||
          event.origin !== parentOrigin ||
          data?.type !== 'sep-manager:motion-complete' ||
          data.instance !== instance ||
          data.id !== id
        )
          return

        if (data.completed !== true) {
          finish(false)

          return
        }

        if (phase !== 'prepare') {
          finish(true)

          return
        }

        if (
          !Number.isFinite(data.width) ||
          !Number.isFinite(data.height) ||
          data.width <= 0 ||
          data.height <= 0
        )
          return

        // The host's style update and the iframe's viewport update are separate.
        const checkViewport = (): void => {
          if (
            Math.abs(window.innerWidth - data.width) <= 1 &&
            Math.abs(window.innerHeight - data.height) <= 1
          ) {
            finish(true)
          } else {
            viewportFrame = requestAnimationFrame(checkViewport)
          }
        }

        if (viewportFrame !== undefined) cancelAnimationFrame(viewportFrame)
        viewportFrame = requestAnimationFrame(checkViewport)
      }

      const timeout = window.setTimeout(() => {
        // A stale/cached host must not leave the widget invisible indefinitely.
        parent.postMessage(
          { type: 'sep-manager:motion-reset', instance, id },
          parentOrigin,
        )
        finish(false)
      }, 2500)

      window.addEventListener('message', receive)
      parent.postMessage(
        { type: 'sep-manager:motion', instance, id, phase },
        parentOrigin,
      )
    })
}
