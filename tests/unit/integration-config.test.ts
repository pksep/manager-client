import { expect, test } from 'bun:test'
import {
  integrationJson,
  parseIntegrationConfig,
} from '../../demo/integration-config'

const defaults = {
  siteId: 'amotiv-demo',
  serviceUrl: 'http://127.0.0.1:4311',
  widgetUrl: 'http://127.0.0.1:4310/widget.html',
}

test('конфиг публичного подключения сохраняет приветствие и задержку', (): void => {
  const value = parseIntegrationConfig(
    JSON.stringify({
      ...defaults,
      initialMessage: ' Привет! ',
      autoOpenDelayMs: 3000,
      offset: 24,
    }),
  )

  expect(value.initialMessage).toBe('Привет!')
  expect(value.autoOpenDelayMs).toBe(3000)
  expect(parseIntegrationConfig(integrationJson(value))).toEqual(value)
})

test('некорректный JSON и обязательные параметры не проходят проверку', (): void => {
  for (const value of [
    '{',
    'null',
    '[]',
    '{}',
    JSON.stringify({ ...defaults, siteId: 'bad id' }),
  ])
    expect(() => parseIntegrationConfig(value)).toThrow()

  expect(() => parseIntegrationConfig(' '.repeat(20001))).toThrow()
})

test('редактор не принимает секреты, служебные параметры и небезопасные адреса', (): void => {
  for (const value of [
    { ...defaults, supportSessionToken: 'not-a-real-token' },
    { ...defaults, source: {} },
    { ...defaults, widgetUrl: 'javascript:alert(1)' },
    { ...defaults, serviceUrl: 'https://user:password@example.test' },
    { ...defaults, offset: 7 },
    { ...defaults, offset: 81 },
    { ...defaults, autoOpenDelayMs: '3000' },
  ])
    expect(() => parseIntegrationConfig(JSON.stringify(value))).toThrow()
})
