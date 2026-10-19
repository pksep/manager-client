import { expect, test } from 'bun:test'
import {
  applySiteSocialLinks,
  parseConfig,
  parseWidgetSiteOptions,
  type WidgetConfig,
} from '../../src/protocol'
import {
  integrationJson,
  parseIntegrationConfig,
} from '../../demo/integration-config'

function config(): WidgetConfig {
  return {
    company: { name: 'Компания' },
    welcomeMessages: [],
    socialLinks: [
      { icon: 'vk', label: 'Серверный ВК', url: 'https://vk.ru/old' },
      {
        icon: 'telegram',
        label: 'Серверный Telegram',
        url: 'https://t.me/old',
      },
      { icon: 'chat', label: 'Другой канал', url: 'https://example.test/' },
    ],
    schedule: {
      timezone: 'Europe/Moscow',
      start: '08:00',
      end: '18:00',
      days: [1],
    },
    contactPolicy: 'all',
    limits: { fileBytes: 100, fileCount: 1, messageChars: 100 },
  }
}

test('без настроек сохраняет серверные пункты и их подписи', (): void => {
  const source = config()

  expect(applySiteSocialLinks(source, parseWidgetSiteOptions({}))).toBe(source)
})

test('три ссылки сайта заменяют свой канал без дублей и без изменения серверного объекта', (): void => {
  const source = config()
  const original = structuredClone(source)
  const options = parseWidgetSiteOptions({
    maxUrl: 'https://max.ru/company_bot',
    telegramUrl: 'https://t.me/company_bot?start=site',
    vkUrl: 'https://vk.ru/im/convo/-203143723?entrypoint=list_all',
  })
  const result = applySiteSocialLinks(source, options)

  expect(result.socialLinks).toHaveLength(4)
  expect(result.socialLinks.map((link) => link.icon)).toEqual([
    'chat',
    'max',
    'telegram',
    'vk',
  ])
  expect(result.socialLinks[1]?.url).toBe('https://max.ru/company_bot')
  expect(result.socialLinks[2]?.url).toBe('https://t.me/company_bot?start=site')
  expect(result.socialLinks[3]?.url).toBe(
    'https://vk.ru/im/convo/-203143723?entrypoint=list_all',
  )
  expect(source).toEqual(original)
  expect(applySiteSocialLinks(result, options)).toEqual(result)
  expect(parseConfig(result)).toEqual(result)
})

test('явное скрытие приоритетнее ссылки, остальные каналы сохраняются', (): void => {
  const result = applySiteSocialLinks(
    config(),
    parseWidgetSiteOptions({
      maxUrl: 'https://max.ru/company_bot',
      showMax: false,
      telegramUrl: 'https://t.me/company_bot',
      showTelegram: false,
      showVk: false,
    }),
  )

  expect(result.socialLinks.map((link) => link.icon)).toEqual(['chat'])
})

test('флаг без адреса не создаёт пустую ссылку, существующая ссылка сохраняется', (): void => {
  const result = applySiteSocialLinks(
    config(),
    parseWidgetSiteOptions({ showMax: true, showVk: true }),
  )

  expect(result.socialLinks.some((link) => link.icon === 'max')).toBe(false)
  expect(result.socialLinks.find((link) => link.icon === 'vk')?.url).toBe(
    'https://vk.ru/old',
  )
})

test('старый пункт MAX с общей иконкой chat заменяется или скрывается без дубля', (): void => {
  const source = config()
  source.socialLinks.push({
    icon: 'chat',
    label: 'Старый MAX',
    url: 'https://max.ru/old_bot',
  })
  const replaced = applySiteSocialLinks(source, {
    maxUrl: 'https://max.ru/new_bot',
  })

  expect(
    replaced.socialLinks.filter((link) =>
      link.url.startsWith('https://max.ru/'),
    ),
  ).toEqual([{ icon: 'max', label: 'MAX', url: 'https://max.ru/new_bot' }])
  expect(
    replaced.socialLinks.some((link) => link.url === 'https://example.test/'),
  ).toBe(true)
  expect(
    applySiteSocialLinks(source, { showMax: false }).socialLinks.some((link) =>
      link.url.startsWith('https://max.ru/'),
    ),
  ).toBe(false)
})

test.each([
  ['maxUrl', 'https://max.ru/company_bot'],
  ['telegramUrl', 'https://t.me/company_bot?start=site'],
  ['telegramUrl', 'https://telegram.me/company_bot'],
  ['vkUrl', 'https://vk.ru/im/convo/-203143723?entrypoint=list_all'],
  ['vkUrl', 'https://vk.com/company'],
  ['vkUrl', 'https://vk.me/company'],
] as const)('разрешена публичная ссылка %s: %s', (key, url): void => {
  expect(parseWidgetSiteOptions({ [key]: url })[key]).toBe(url)
})

test.each(['maxUrl', 'telegramUrl', 'vkUrl'] as const)(
  '%s отклоняет подмену, исполняемые и служебные адреса',
  (key): void => {
    for (const value of [
      '',
      ' ',
      null,
      false,
      1,
      {},
      [],
      'javascript:alert(1)',
      'data:text/html,test',
      'http://max.ru/company',
      'https://user:secret@max.ru/company',
      'https://max.ru.attacker.test/bot',
      'https://t.me.attacker.test/bot',
      'https://vk.ru.attacker.test/group',
      'https://example.test/bot',
      'https://api.telegram.org/botTOKEN/sendMessage',
      'https://max.ru:8443/bot',
      'https://t.me:8443/bot',
      'https://vk.ru:8443/group',
      `https://max.ru/${'a'.repeat(2048)}`,
      `https://t.me/${'a'.repeat(2048)}`,
      `https://vk.ru/${'a'.repeat(2048)}`,
    ])
      expect(() => parseWidgetSiteOptions({ [key]: value })).toThrow()
  },
)

test('нельзя выдать другой мессенджер за выбранный', (): void => {
  expect(() => parseWidgetSiteOptions({ maxUrl: 'https://t.me/bot' })).toThrow()
  expect(() =>
    parseWidgetSiteOptions({ telegramUrl: 'https://max.ru/bot' }),
  ).toThrow()
  expect(() => parseWidgetSiteOptions({ vkUrl: 'https://t.me/bot' })).toThrow()
})

test('переключатели принимают только логические значения', (): void => {
  for (const key of ['showMax', 'showTelegram', 'showVk'])
    for (const value of ['false', 0, null, {}, []])
      expect(() => parseWidgetSiteOptions({ [key]: value })).toThrow()
})

test('редактор и экспорт конфига сохраняют ссылки и флаги', (): void => {
  const options = parseIntegrationConfig(
    JSON.stringify({
      siteId: 'test-site',
      serviceUrl: 'https://manager.example.test',
      widgetUrl: 'https://manager.example.test/widget.html',
      maxUrl: 'https://max.ru/company_bot',
      telegramUrl: 'https://t.me/company_bot',
      vkUrl: 'https://vk.ru/company',
      showVk: false,
    }),
  )

  expect(options.showVk).toBe(false)
  expect(options.maxUrl).toBe('https://max.ru/company_bot')
  expect(parseIntegrationConfig(integrationJson(options))).toEqual(options)
})
