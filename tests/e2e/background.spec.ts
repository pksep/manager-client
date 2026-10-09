import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type FrameLocator,
} from '@playwright/test'

const widget = (page: Page): FrameLocator =>
  page.frameLocator('iframe[data-sep-manager]')

async function control(
  request: APIRequestContext,
  data: object,
): Promise<void> {
  const response = await request.post('http://127.0.0.1:4311/__demo/state', {
    data,
  })
  expect(response.ok()).toBe(true)
}

async function conversation(
  page: Page,
  request: APIRequestContext,
): Promise<void> {
  await control(request, { reset: true, autoReply: false })
  // Проверяем настоящую генерацию звука, не заменяя разрешения браузера.
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext

    window.AudioContext = class extends NativeAudioContext {
      createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator()
        const start = oscillator.start.bind(oscillator)

        oscillator.start = (when?: number): void => {
          const root = document.documentElement
          root.dataset.testChimes = String(
            Number(root.dataset.testChimes || 0) + 1,
          )
          start(when)
        }

        return oscillator
      }
    }
  })
  await page.goto('/')
  const frame = widget(page)
  await frame.getByRole('button', { name: 'Открыть чат' }).click()
  await frame.locator('.composer .tiptap').fill('Проверка фона')
  await frame.locator('.composer .tiptap').press('Enter')
  await frame
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Тест фона')
  await frame
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 123-45-67')
  await frame
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('background@example.test')
  await frame
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(frame.getByText('Проверка фона', { exact: true })).toBeVisible()
}

async function chimes(page: Page): Promise<number> {
  return Number(
    (await page.locator('html').getAttribute('data-test-chimes')) || 0,
  )
}

async function setVisibility(
  page: Page,
  state: DocumentVisibilityState,
): Promise<void> {
  const frame = page
    .frames()
    .find((frame) => frame.url().includes('widget.html'))
  if (!frame) throw new Error('Виджет не подключён')

  // Headless-браузер не гарантирует скрытие вкладки при bringToFront.
  // Проверяем обработчик visibilitychange без заморозки всего браузерного процесса.
  await frame.evaluate((visibility) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: visibility,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

test('смена вкладки не переподключает исправную связь и сохраняет окно с черновиком', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await widget(page).locator('.composer .tiptap').fill('Не потерять черновик')
  await setVisibility(page, 'hidden')
  await control(request, { reply: 'Ответ в фоне' })
  await expect(
    widget(page).getByText('Ответ в фоне', { exact: true }),
  ).toBeVisible()
  await expect.poll(() => chimes(page)).toBe(1)
  await setVisibility(page, 'visible')
  await expect(widget(page).getByRole('dialog')).toBeVisible()
  await expect(widget(page).locator('.composer .tiptap')).toHaveText(
    'Не потерять черновик',
  )
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.sessionRequests).toBe(1)
  expect(state.eventConnections).toBe(1)
})

test('набор, прочтение и повторная доставка не подают звук', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await control(request, { typing: true })
  await control(request, { readMessages: true })
  expect(await chimes(page)).toBe(0)
  await control(request, { reply: 'Один новый ответ' })
  await expect.poll(() => chimes(page)).toBe(1)
  await control(request, { repeatReply: true })
  await page.waitForTimeout(350)
  expect(await chimes(page)).toBe(1)
})

test('ответ во время обрыва восстанавливается со звуком один раз, история молчит', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await control(request, { reply: 'Уже прочитанная история' })
  await expect.poll(() => chimes(page)).toBe(1)
  await widget(page).locator('.composer .tiptap').fill('Черновик при обрыве')
  await setVisibility(page, 'hidden')
  await control(request, { available: false })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await control(request, { reply: 'Пропущенный новый ответ' })
  await control(request, { available: true })
  await expect(
    widget(page).getByText('Пропущенный новый ответ', { exact: true }),
  ).toBeVisible()
  await expect.poll(() => chimes(page)).toBe(2)
  await setVisibility(page, 'visible')
  await expect(widget(page).locator('.composer .tiptap')).toHaveText(
    'Черновик при обрыве',
  )
  await control(request, { available: false })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await control(request, { available: true })
  await expect(widget(page).getByRole('dialog')).toBeVisible()
  expect(await chimes(page)).toBe(2)
})

test('чужой отправитель не может включить звуковое уведомление', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await page.evaluate(() => {
    const instance = document.querySelector<HTMLIFrameElement>(
      'iframe[data-sep-manager]',
    )!.dataset.sepManager
    window.postMessage(
      {
        type: 'sep-manager:notification',
        instance,
        messageId: crypto.randomUUID(),
      },
      location.origin,
    )
  })
  await page.waitForTimeout(150)
  expect(await chimes(page)).toBe(0)
})

test('недоступное аудио не мешает принимать и показывать ответы', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await page.addInitScript(() => {
    // Новый экземпляр страницы без поддержки Web Audio.
    Reflect.deleteProperty(window, 'AudioContext')
  })
  await page.reload()
  expect(await page.evaluate(() => typeof window.AudioContext)).toBe(
    'undefined',
  )
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  // После полной перезагрузки демо создаёт новую сессию, поэтому нужен новый запрос.
  await widget(page).locator('.composer .tiptap').fill('Новое обращение')
  await widget(page).locator('.composer .tiptap').press('Enter')
  await widget(page)
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Тест')
  await widget(page)
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 123-45-67')
  await widget(page)
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('noaudio@example.test')
  await widget(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    widget(page).getByText('Новое обращение', { exact: true }),
  ).toBeVisible()
  await control(request, { reply: 'Работает без звука' })
  await expect(
    widget(page).getByText('Работает без звука', { exact: true }),
  ).toBeVisible()
  expect(await chimes(page)).toBe(0)
})
