import { mount } from '../src/embed'
import type { EmbedOptions } from '../src/protocol'
import { integrationJson, parseIntegrationConfig } from './integration-config'
import './host.css'

const demoServiceUrl = 'http://127.0.0.1:4311'
const useManagerService =
  new URLSearchParams(location.search).get('service') === 'manager'

const defaults: EmbedOptions = {
  siteId: 'amotiv-demo',
  serviceUrl: useManagerService ? 'http://127.0.0.1:4314' : demoServiceUrl,
  widgetUrl: new URL('/widget.html', location.href).href,
  offset: 24,
  initialMessage: '',
  customCss: '',
}

document.querySelector('#demo')!.innerHTML = `
  <main class="demo-panel">
    <header class="demo-heading">
      <span class="demo-eyebrow">Локальный стенд</span>
      <h1>Проверка виджета</h1>
      <p>Настройте подключение и посмотрите результат справа внизу.</p>
    </header>
    <section class="demo-card" aria-labelledby="config-title">
      <div class="demo-card-heading">
        <h2 id="config-title">Конфиг подключения</h2>
        <span class="demo-tag">JSON</span>
      </div>
      <p>Это публичные параметры из <code>SepManager.mount</code>. Ключи и токены сюда не вставляйте.</p>
      <label class="demo-label" for="integration-config">Редактируемый конфиг</label>
      <textarea id="integration-config" spellcheck="false" autocomplete="off" autocapitalize="off" maxlength="20000"></textarea>
      <div class="demo-actions">
        <button id="apply-config" class="demo-primary" type="button">Применить конфиг</button>
        <button id="greeting-example" type="button">Пример с приветствием</button>
        <button id="style-example" type="button">Пример CSS и ВК</button>
        <button id="reset-config" type="button">Вернуть исходный</button>
        <button id="download-config" type="button">Скачать JSON</button>
      </div>
      <p class="demo-hint"><code>initialMessage: ""</code>: стандартные приветствия. <code>autoOpenDelayMs: 3000</code>: открытие через 3 секунды. <code>customCss</code>: CSS внутри виджета. <code>showVk</code> и <code>vkUrl</code>: пункт ВК и ссылка на чат. Отсчёт начинается заново при применении конфига.</p>
      <p class="demo-hint">Ссылки на мессенджеры задаются здесь: <code>maxUrl</code>, <code>telegramUrl</code>, <code>vkUrl</code>. Укажите публичный HTTPS-адрес своего бота или сообщества. Чтобы скрыть пункт, добавьте <code>showMax: false</code>, <code>showTelegram: false</code> или <code>showVk: false</code>.</p>
      <p class="demo-hint"><code>accentColor: "#c2410c"</code> задаёт оранжевый цвет кнопок и акцентов виджета. Без параметра сохраняется стандартное оформление.</p>
      <p id="config-status" role="status" aria-live="polite"></p>
      <div class="demo-code-details">
        <button id="toggle-code" type="button" aria-expanded="false" aria-controls="integration-code">Код применённого подключения</button>
        <pre id="integration-code" hidden></pre>
      </div>
    </section>
    <section class="demo-card" aria-labelledby="scenario-title">
      <h2 id="scenario-title">Состояние сервиса</h2>
      <p id="service-note"></p>
      <fieldset class="demo-scenarios" data-demo-controls>
        <legend class="demo-sr-only">Готовые сценарии</legend>
        <button data-scenario="online" type="button" aria-pressed="false"><strong>Рабочее время</strong><span>Оператор онлайн, сообщения принимаются</span></button>
        <button data-scenario="offline" type="button" aria-pressed="false"><strong>Вне рабочего времени</strong><span>Оператор не в сети, можно оставить обращение</span></button>
        <button data-scenario="unavailable" type="button" aria-pressed="false"><strong>Сервис недоступен</strong><span>Кнопка и окно виджета полностью скрыты</span></button>
      </fieldset>
      <p id="control-status" role="status" aria-live="polite"></p>
      <details id="advanced-controls">
        <summary>Тестирование виджета: дополнительные действия</summary>
        <fieldset class="demo-controls" data-demo-controls>
          <legend class="demo-sr-only">Дополнительные действия демо</legend>
          <label><input id="available" type="checkbox" checked> Сервис доступен</label>
          <label><input id="online" type="checkbox" checked> Рабочее время</label>
          <label><input id="social" type="checkbox" checked> Ссылка ВКонтакте</label>
          <label><input id="auto-reply" type="checkbox" checked> Автоматический ответ демо-оператора</label>
          <label class="demo-label" for="operator-reply">Ответ оператора</label>
          <input id="operator-reply" type="text" maxlength="2000" value="Здравствуйте! Чем могу помочь?">
          <div class="demo-actions">
            <button id="send-reply" type="button">Отправить ответ</button>
            <button id="operator-typing" type="button">Оператор печатает</button>
            <button id="send-file" type="button">Ответить файлом</button>
            <button id="read-messages" type="button">Отметить прочитанными</button>
            <button id="fail-next" type="button">Ошибка следующей отправки</button>
          </div>
          <p class="demo-hint">Ответы отправляются только в существующие диалоги локального демо. Состояния меняются без удаления переписки.</p>
        </fieldset>
      </details>
    </section>
  </main>`

const editor = document.querySelector<HTMLTextAreaElement>(
  '#integration-config',
)!
const configStatus = document.querySelector<HTMLElement>('#config-status')!
const controlStatus = document.querySelector<HTMLElement>('#control-status')!
const serviceNote = document.querySelector<HTMLElement>('#service-note')!
const code = document.querySelector<HTMLElement>('#integration-code')!

let applied: EmbedOptions = defaults
let widget: ReturnType<typeof mount> | undefined
let controlBusy = false
let generation = 0

function usesDemo(): boolean {
  return (
    applied.siteId === 'amotiv-demo' &&
    new URL(applied.serviceUrl).href === `${demoServiceUrl}/`
  )
}

function status(element: HTMLElement, text: string, error = false): void {
  element.textContent = text
  element.dataset.error = String(error)
}

function syncControls(): void {
  const local = usesDemo()

  for (const fieldset of document.querySelectorAll<HTMLFieldSetElement>(
    '[data-demo-controls]',
  ))
    fieldset.disabled = !local || controlBusy

  serviceNote.textContent = local
    ? 'Имитация локального демо. Настройки компании и рабочие сообщения не меняются.'
    : 'Подключён внешний или настоящий локальный сервис. Имитация состояний отключена: его настройки здесь не меняем.'

  if (!local) {
    controlStatus.textContent = ''

    for (const button of document.querySelectorAll('[data-scenario]'))
      button.setAttribute('aria-pressed', 'false')
  }
}

function renderState(input: unknown): void {
  if (!input || typeof input !== 'object')
    throw new Error('Неверный ответ демо')

  const value = input as Record<string, unknown>

  if (
    typeof value.available !== 'boolean' ||
    typeof value.online !== 'boolean' ||
    typeof value.social !== 'boolean'
  )
    throw new Error('Неверный ответ демо')

  const flags = {
    available: value.available,
    online: value.online,
    social: value.social,
  }

  for (const key of ['available', 'online', 'social'] as const)
    document.querySelector<HTMLInputElement>(`#${key}`)!.checked = flags[key]

  if (typeof value.autoReply === 'boolean')
    document.querySelector<HTMLInputElement>('#auto-reply')!.checked =
      value.autoReply

  const scenario = !value.available
    ? 'unavailable'
    : value.online
      ? 'online'
      : 'offline'

  for (const button of document.querySelectorAll<HTMLElement>(
    '[data-scenario]',
  ))
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.scenario === scenario),
    )
}

async function control(body?: object): Promise<void> {
  if (!usesDemo() || controlBusy) return

  const currentGeneration = generation
  controlBusy = true
  syncControls()

  try {
    const response = await fetch(`${demoServiceUrl}/__demo/state`, {
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) throw new Error('Демо недоступно')

    const state: unknown = await response.json()

    if (generation !== currentGeneration || !usesDemo()) return

    renderState(state)
    status(controlStatus, body ? 'Сценарий применён' : 'Демо подключено')
  } catch {
    if (generation === currentGeneration && usesDemo())
      status(
        controlStatus,
        'Демо недоступно. Запустите локальный демосервис.',
        true,
      )
  } finally {
    controlBusy = false
    syncControls()

    if (generation !== currentGeneration && usesDemo()) void control()
  }
}

function applyConfig(): void {
  try {
    // Сначала проверяем весь конфиг: ошибка не уничтожает текущий виджет.
    const options = parseIntegrationConfig(editor.value)

    widget?.destroy()
    widget = mount(options)
    applied = options
    generation++
    editor.removeAttribute('aria-invalid')
    code.textContent = `SepManager.mount(${integrationJson(options)});`
    status(configStatus, 'Конфиг применён. Виджет перезапущен.')
    syncControls()
    void control()
  } catch (error) {
    editor.setAttribute('aria-invalid', 'true')
    status(
      configStatus,
      error instanceof Error ? error.message : 'Не удалось применить конфиг',
      true,
    )
  }
}

document.querySelector('#apply-config')!.addEventListener('click', applyConfig)

document
  .querySelector('#toggle-code')!
  .addEventListener('click', (event): void => {
    const button = event.currentTarget as HTMLButtonElement

    code.hidden = !code.hidden
    button.setAttribute('aria-expanded', String(!code.hidden))
  })

document
  .querySelector('#greeting-example')!
  .addEventListener('click', (): void => {
    try {
      editor.value = integrationJson({
        ...parseIntegrationConfig(editor.value),
        initialMessage: 'Здравствуйте! Подскажите, чем мы можем помочь?',
        autoOpenDelayMs: 3000,
      })
      status(configStatus, 'Пример вставлен. Нажмите «Применить конфиг».')
    } catch (error) {
      status(
        configStatus,
        error instanceof Error ? error.message : 'Ошибка JSON',
        true,
      )
    }
  })

document.querySelector('#reset-config')!.addEventListener('click', (): void => {
  editor.value = integrationJson(defaults)
  applyConfig()
})

document
  .querySelector('#style-example')!
  .addEventListener('click', (): void => {
    try {
      editor.value = integrationJson({
        ...parseIntegrationConfig(editor.value),
        showVk: true,
        vkUrl: 'https://vk.ru/im/convo/-203143723?entrypoint=list_all',
        customCss:
          '.manager-widget { --chat-window-radius: 16px; }\n.launcher { background: #164f43; }\n.chat-header { background: #e8f4ef; }',
      })
      status(configStatus, 'Пример вставлен. Нажмите «Применить конфиг».')
    } catch (error) {
      status(
        configStatus,
        error instanceof Error ? error.message : 'Ошибка JSON',
        true,
      )
    }
  })

document
  .querySelector('#download-config')!
  .addEventListener('click', (): void => {
    try {
      const options = parseIntegrationConfig(editor.value)
      const url = URL.createObjectURL(
        new Blob([`${integrationJson(options)}\n`], {
          type: 'application/json',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = 'widget-integration.json'
      link.click()
      setTimeout((): void => URL.revokeObjectURL(url), 0)
      status(
        configStatus,
        'Скачан конфиг из редактора. Подключение не изменено.',
      )
    } catch (error) {
      status(
        configStatus,
        error instanceof Error ? error.message : 'Ошибка JSON',
        true,
      )
    }
  })

for (const key of ['available', 'online', 'social'])
  document
    .querySelector(`#${key}`)!
    .addEventListener('change', (event): void => {
      void control({ [key]: (event.target as HTMLInputElement).checked })
    })

document
  .querySelector('#auto-reply')!
  .addEventListener('change', (event): void => {
    void control({ autoReply: (event.target as HTMLInputElement).checked })
  })

for (const button of document.querySelectorAll<HTMLElement>('[data-scenario]'))
  button.addEventListener('click', (): void => {
    const scenario = button.dataset.scenario
    void control({
      available: scenario !== 'unavailable',
      ...(scenario === 'unavailable' ? {} : { online: scenario === 'online' }),
    })
  })

const actions: Record<string, () => object> = {
  'send-reply': (): object => ({
    reply: document.querySelector<HTMLInputElement>('#operator-reply')!.value,
  }),
  'operator-typing': (): object => ({ typing: true }),
  'send-file': (): object => ({ sendFile: true }),
  'read-messages': (): object => ({ readMessages: true }),
  'fail-next': (): object => ({ failNext: true }),
}

for (const [id, body] of Object.entries(actions))
  document.querySelector(`#${id}`)!.addEventListener('click', (): void => {
    void control(body())
  })

window.addEventListener('pagehide', (event): void => {
  if (!event.persisted) widget?.destroy()
})

editor.value = integrationJson(defaults)
applyConfig()
