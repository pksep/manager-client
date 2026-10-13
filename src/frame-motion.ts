import type { PanelMotionPhase } from './protocol'

export const PANEL_OPEN_MS = 340

export const PANEL_CLOSE_MS = 220

/** Animate the already-sized iframe, including its shadow, as one card. */
export class FrameMotion {
  private animation?: Animation

  private preparationFrame?: number

  private pending?: { id: number; finish: (completed: boolean) => void }

  constructor(private readonly frame: HTMLIFrameElement) {}

  private cancelPending(): void {
    if (this.preparationFrame !== undefined)
      cancelAnimationFrame(this.preparationFrame)

    this.preparationFrame = undefined
    this.pending?.finish(false)
    this.pending = undefined
  }

  reset(): void {
    this.cancelPending()
    this.animation?.cancel()
    this.animation = undefined
    this.frame.style.setProperty('opacity', '1', 'important')
    this.frame.style.setProperty('transform', 'none', 'important')
    this.frame.style.removeProperty('will-change')
  }

  run(
    id: number,
    phase: PanelMotionPhase,
    finish: (completed: boolean) => void,
  ): void {
    const current = getComputedStyle(this.frame)
    const opacity = current.opacity
    const transform = current.transform

    this.cancelPending()
    this.animation?.cancel()
    this.animation = undefined
    this.pending = { id, finish }

    if (phase === 'prepare') {
      this.frame.style.setProperty('opacity', '0', 'important')
      this.frame.style.setProperty('transform', 'none', 'important')
      this.preparationFrame = requestAnimationFrame(() => {
        this.preparationFrame = requestAnimationFrame(() => {
          this.preparationFrame = undefined
          this.complete(id)
        })
      })

      return
    }

    const opening = phase === 'open'
    const resting = 'translateY(0) scale(1)'
    const tucked = 'translateY(18px) scale(0.96)'
    const targetOpacity = opening ? '1' : '0'
    const targetTransform = opening ? resting : tucked
    // Styles are the settled state; the animation temporarily overrides them.
    this.frame.style.setProperty('opacity', targetOpacity)
    this.frame.style.setProperty('transform', targetTransform)
    this.frame.style.setProperty(
      'transform-origin',
      'right bottom',
      'important',
    )

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.complete(id)

      return
    }

    this.frame.style.setProperty('will-change', 'opacity, transform')
    this.animation = this.frame.animate(
      [
        {
          opacity,
          transform: opening && opacity === '0' ? tucked : transform,
        },
        { opacity: targetOpacity, transform: targetTransform },
      ],
      {
        duration: opening ? PANEL_OPEN_MS : PANEL_CLOSE_MS,
        easing: opening
          ? 'cubic-bezier(0.16, 1, 0.3, 1)'
          : 'cubic-bezier(0.4, 0, 1, 1)',
      },
    )
    this.animation.onfinish = (): void => this.complete(id)
  }

  private complete(id: number): void {
    if (this.pending?.id !== id) return

    const { finish } = this.pending
    this.pending = undefined
    if (this.animation) this.animation.onfinish = null
    this.animation = undefined
    this.frame.style.removeProperty('will-change')
    finish(true)
  }
}
