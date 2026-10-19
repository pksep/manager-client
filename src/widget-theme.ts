export function parseAccentColor(value: unknown): string | undefined {
  if (value === undefined) return undefined

  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(
      'accentColor: укажите цвет в формате #RRGGBB, например #c2410c',
    )

  return value.toLowerCase()
}

type Rgb = readonly [number, number, number]

function mix(color: Rgb, target: number, amount: number): Rgb {
  const channel = (value: number): number =>
    Math.round(value + (target - value) * amount)

  return [channel(color[0]), channel(color[1]), channel(color[2])]
}

function hex(color: Rgb): string {
  return `#${color.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function luminance(color: Rgb): number {
  const linear = (value: number): number => {
    const normalized = value / 255

    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }

  return (
    linear(color[0]) * 0.2126 +
    linear(color[1]) * 0.7152 +
    linear(color[2]) * 0.0722
  )
}

/** Только цветовые переменные внутри iframe, без CSS-кода и изменений сайта. */
export function widgetAccentVariables(value?: string): Record<string, string> {
  const color = parseAccentColor(value)

  if (!color) return {}

  const rgb: Rgb = [
    parseInt(color.slice(1, 3), 16),
    parseInt(color.slice(3, 5), 16),
    parseInt(color.slice(5, 7), 16),
  ]
  const lightness = luminance(rgb)
  const whiteContrast = 1.05 / (lightness + 0.05)
  const blackContrast = (lightness + 0.05) / 0.05
  const whiteText = whiteContrast >= blackContrast
  const foreground = whiteText ? '#ffffff' : '#000000'
  let readable = rgb

  // Текст на светлой поверхности остаётся читаемым даже для жёлтого/белого.
  while (1.05 / (luminance(readable) + 0.05) < 4.5)
    readable = mix(readable, 0, 0.1)

  return {
    '--action-primary-bg': color,
    '--action-primary-active-bg': hex(mix(rgb, whiteText ? 0 : 255, 0.12)),
    '--text-on-brand': foreground,
    '--widget-on-accent': foreground,
    '--widget-accent-text': hex(readable),
    '--text-brand': hex(readable),
    '--text-link': hex(readable),
    '--surface-brand': hex(mix(rgb, 255, 0.86)),
    '--table-surface-card-blue': hex(mix(rgb, 255, 0.94)),
    '--action-secondary-hover-bg': hex(mix(rgb, 255, 0.94)),
    '--action-secondary-pressed-bg': hex(mix(rgb, 255, 0.86)),
    '--border': color,
    '--border-hover': color,
    '--border-primary-color': color,
  }
}
