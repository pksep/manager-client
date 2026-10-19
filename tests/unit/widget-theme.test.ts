import { expect, test } from 'bun:test'
import { parseWidgetSiteOptions } from '../../src/protocol'
import { parseAccentColor, widgetAccentVariables } from '../../src/widget-theme'
import {
  integrationJson,
  parseIntegrationConfig,
} from '../../demo/integration-config'

test('цвет необязателен, без него стандартная тема не переопределяется', (): void => {
  expect(parseAccentColor(undefined)).toBeUndefined()
  expect(widgetAccentVariables()).toEqual({})
  expect(parseWidgetSiteOptions({})).not.toHaveProperty('accentColor')
})

test('принимает только шестизначный HEX и нормализует регистр', (): void => {
  expect(parseWidgetSiteOptions({ accentColor: '#C2410C' }).accentColor).toBe(
    '#c2410c',
  )

  for (const accentColor of [
    null,
    0,
    {},
    [],
    '',
    'orange',
    '#fff',
    '#ffffffff',
    '#gg0000',
    ' #c2410c',
    '#c2410c;',
    'url(https://example.test)',
    'var(--color)',
    '#c2410c;display:none',
  ])
    expect(() => parseWidgetSiteOptions({ accentColor })).toThrow('accentColor')
})

test('оранжевый акцент сохраняет светлый фон и цвета ошибок', (): void => {
  const theme = widgetAccentVariables('#c2410c')

  expect(theme['--action-primary-bg']).toBe('#c2410c')
  expect(theme['--action-primary-active-bg']).toBe('#ab390b')
  expect(theme['--widget-on-accent']).toBe('#ffffff')
  expect(theme['--surface-brand']).toBe('#f6e4dd')
  expect(theme).not.toHaveProperty('--surface-main')
  expect(theme).not.toHaveProperty('--status-error')
  expect(theme).not.toHaveProperty('--text-white')
  expect(theme).not.toHaveProperty('--action-disabled-bg')
})

test('светлый акцент получает тёмный текст, тёмный получает белый', (): void => {
  for (const color of ['#ffffff', '#ffff00', '#f97316']) {
    const theme = widgetAccentVariables(color)

    expect(theme['--widget-on-accent']).toBe('#000000')
    expect(theme['--text-on-brand']).toBe('#000000')
    expect(theme['--text-link']).not.toBe(color)
  }

  expect(widgetAccentVariables('#000000')['--widget-on-accent']).toBe('#ffffff')
  expect(widgetAccentVariables('#000000')['--action-primary-active-bg']).toBe(
    '#000000',
  )
})

test('редактор и экспорт сохраняют цвет вместе со ссылками', (): void => {
  const input = {
    siteId: 'amotiv-demo',
    serviceUrl: 'https://manager.pksep.ru',
    widgetUrl: 'https://manager.pksep.ru/widget.html',
    accentColor: '#C2410C',
    maxUrl: 'https://max.ru/company_bot',
  }
  const result = parseIntegrationConfig(JSON.stringify(input))

  expect(result.accentColor).toBe('#c2410c')
  expect(parseIntegrationConfig(integrationJson(result))).toEqual(result)
})
