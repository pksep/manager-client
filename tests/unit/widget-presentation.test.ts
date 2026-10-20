import { expect, test } from 'bun:test'
import {
  applySiteSocialLinks,
  MAX_CUSTOM_CSS_LENGTH,
  parseWidgetSiteOptions,
  type WidgetConfig,
} from '../../src/protocol'
import { parseIntegrationConfig } from '../../demo/integration-config'

const vkUrl = 'https://vk.ru/im/convo/-203143723?entrypoint=list_all'
const config: WidgetConfig = {
  company: { name: 'Компания' },
  welcomeMessages: ['Здравствуйте!'],
  socialLinks: [
    { label: 'Telegram', icon: 'telegram', url: 'https://t.me/company' },
    { label: 'ВКонтакте', icon: 'vk', url: 'https://vk.ru/npoamotiv' },
  ],
  schedule: {
    timezone: 'Europe/Moscow',
    start: '09:00',
    end: '18:00',
    days: [1],
  },
  contactPolicy: 'all',
  limits: { fileBytes: 1000, fileCount: 1, messageChars: 1000 },
}

test('CSS передаётся как ограниченный текст без разбора в HTML', (): void => {
  const customCss = '.launcher { background: #164f43; }'

  expect(parseWidgetSiteOptions({ customCss }).customCss).toBe(customCss)
  expect(parseWidgetSiteOptions({ customCss: '' }).customCss).toBe('')
  expect(
    parseWidgetSiteOptions({ customCss: 'a'.repeat(MAX_CUSTOM_CSS_LENGTH) })
      .customCss,
  ).toHaveLength(MAX_CUSTOM_CSS_LENGTH)

  for (const value of [null, 12, {}, [], 'a'.repeat(MAX_CUSTOM_CSS_LENGTH + 1)])
    expect(() => parseWidgetSiteOptions({ customCss: value })).toThrow()
})

test('ВК принимает ссылку на чат или сообщество, но не подмену домена и протокола', (): void => {
  for (const url of [
    vkUrl,
    'https://vk.ru/npoamotiv',
    'https://vk.me/npoamotiv',
  ])
    expect(parseWidgetSiteOptions({ showVk: true, vkUrl: url }).vkUrl).toBe(url)

  for (const url of [
    null,
    '',
    'javascript:alert(1)',
    'http://vk.ru/npoamotiv',
    'https://vk.ru.attacker.test/path',
    'https://vk.ru@attacker.test/path',
    'https://attacker.test/vk.ru',
    'https://vk.ru:8443/path',
    'https://vk.ru/' + 'a'.repeat(2048),
  ])
    expect(() => parseWidgetSiteOptions({ vkUrl: url })).toThrow()

  for (const value of [null, 1, 'true', {}])
    expect(() => parseWidgetSiteOptions({ showVk: value })).toThrow()
})

test('без параметров меню сервера сохраняется, новый ВК не дублирует старый', (): void => {
  expect(applySiteSocialLinks(config, {})).toBe(config)
  const overridden = applySiteSocialLinks(config, { showVk: true, vkUrl })

  expect(overridden.socialLinks).toEqual([
    config.socialLinks[0],
    { label: 'ВКонтакте', icon: 'vk', url: vkUrl },
  ])
  expect(config.socialLinks[1].url).toBe('https://vk.ru/npoamotiv')
  expect(overridden.schedule).toBe(config.schedule)
  expect(overridden.limits).toBe(config.limits)
  expect(overridden.contactPolicy).toBe(config.contactPolicy)
  expect(
    applySiteSocialLinks(config, { showVk: false, vkUrl }).socialLinks,
  ).toEqual([config.socialLinks[0]])
  expect(
    applySiteSocialLinks({ ...config, socialLinks: [] }, { showVk: true })
      .socialLinks,
  ).toEqual([])
  expect(
    applySiteSocialLinks({ ...config, socialLinks: [] }, { vkUrl }).socialLinks,
  ).toHaveLength(1)
})

test('редактор JSON сохраняет CSS и ВК вместе с настройками интеграции', (): void => {
  const value = parseIntegrationConfig(
    JSON.stringify({
      siteId: 'amotiv-demo',
      serviceUrl: 'https://manager.pksep.ru',
      widgetUrl: 'https://manager.pksep.ru/widget.html',
      customCss: '.launcher { background: green; }',
      showVk: true,
      vkUrl,
    }),
  )

  expect(value.showVk).toBe(true)
  expect(value.vkUrl).toBe(vkUrl)
  expect(value.customCss).toContain('background: green')
})
