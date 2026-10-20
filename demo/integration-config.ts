import {
  parseWidgetSiteOptions,
  publicUrl,
  type EmbedOptions,
} from '../src/protocol'

const publicKeys = new Set([
  'siteId',
  'serviceUrl',
  'widgetUrl',
  'offset',
  'initialMessage',
  'autoOpenDelayMs',
  'customCss',
  'accentColor',
  'maxUrl',
  'telegramUrl',
  'vkUrl',
  'showMax',
  'showTelegram',
  'showVk',
])

/** Редактор принимает только публичный конфиг подключения, без токенов и ключей. */
export function parseIntegrationConfig(text: string): EmbedOptions {
  if (text.length > 20000) throw new Error('Конфиг слишком большой')

  let input: unknown

  try {
    input = JSON.parse(text)
  } catch {
    throw new Error(
      'Проверьте JSON: двойные кавычки и отсутствие лишних запятых',
    )
  }

  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Конфиг должен быть JSON-объектом')

  const value = input as Record<string, unknown>

  if (Object.keys(value).some((key) => !publicKeys.has(key)))
    throw new Error('Допустимы только публичные параметры подключения виджета')

  if (typeof value.siteId !== 'string' || !/^[\w-]{1,100}$/.test(value.siteId))
    throw new Error('siteId: от 1 до 100 букв, цифр, дефисов или подчёркиваний')

  if (
    value.offset !== undefined &&
    (typeof value.offset !== 'number' ||
      !Number.isInteger(value.offset) ||
      value.offset < 8 ||
      value.offset > 80)
  )
    throw new Error('offset: целое число от 8 до 80 пикселей')

  const serviceUrl = publicUrl(value.serviceUrl)
  const widgetUrl = publicUrl(value.widgetUrl)
  const siteOptions = parseWidgetSiteOptions(value)

  return {
    siteId: value.siteId,
    serviceUrl,
    widgetUrl,
    ...(value.offset === undefined ? {} : { offset: value.offset }),
    ...siteOptions,
  }
}

export function integrationJson(options: EmbedOptions): string {
  return JSON.stringify(options, null, 2)
}
