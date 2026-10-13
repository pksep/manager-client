import { expect, test, type Page } from '@playwright/test'

const frame = (page: Page): ReturnType<Page['frameLocator']> =>
  page.frameLocator('iframe[data-sep-manager]')

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

test('редактор применяет приветствие, перезапускает единственный виджет и сбрасывает конфиг', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  await expect(page.locator('#control-status')).toHaveText('Демо подключено')
  await page.getByRole('button', { name: 'Пример с приветствием' }).click()
  const editor = page.getByRole('textbox', { name: 'Редактируемый конфиг' })
  const options = JSON.parse(await editor.inputValue())
  options.autoOpenDelayMs = 0
  options.initialMessage = 'Приветствие со стенда'
  await editor.fill(JSON.stringify(options, null, 2))
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  await expect(page.locator('iframe[data-sep-manager]')).toHaveCount(1)
  await expect(frame(page).getByRole('dialog')).toBeVisible()
  await expect(frame(page).locator('.initial-message-text')).toHaveText(
    'Приветствие со стенда',
  )
  await expect(page.locator('#integration-code')).toContainText(
    'Приветствие со стенда',
  )
  await page.screenshot({
    path: 'test-results/widget-playground.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Вернуть исходный' }).click()
  await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
  await expect(frame(page).locator('.welcome-message')).toHaveCount(3)
  await expect(frame(page).locator('.site-greeting')).toHaveCount(0)
})

test('неверный конфиг не уничтожает текущий виджет и не вызывает новую сессию', async ({
  page,
  request,
}): Promise<void> => {
  await page.goto('/')
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  const identity = await page
    .locator('iframe[data-sep-manager]')
    .getAttribute('data-sep-manager')
  const before = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  await page
    .getByRole('textbox', { name: 'Редактируемый конфиг' })
    .fill('{broken')
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  await expect(page.locator('#config-status')).toContainText('Проверьте JSON')
  await expect(page.locator('iframe[data-sep-manager]')).toHaveAttribute(
    'data-sep-manager',
    identity!,
  )
  expect(
    (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
      .sessionRequests,
  ).toBe(before.sessionRequests)
})

test('готовые сценарии переключают онлайн, нерабочее время и полное скрытие', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  await page.locator('[data-scenario="offline"]').click()
  await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
  await expect(frame(page).locator('.operator-status')).toContainText(
    'Оператор не в сети',
  )
  await page.locator('[data-scenario="online"]').click()
  await expect(frame(page).locator('.operator-status')).toHaveText(
    'Оператор онлайн',
  )
  await page.locator('[data-scenario="unavailable"]').click()
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await page.locator('[data-scenario="online"]').click()
  await expect(page.locator('iframe[data-sep-manager]')).toBeVisible()
})

test('скачивание экспортирует конфиг редактора без изменения подключения', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  const identity = await page
    .locator('iframe[data-sep-manager]')
    .getAttribute('data-sep-manager')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать JSON' }).click()
  expect((await pending).suggestedFilename()).toBe('widget-integration.json')
  await expect(page.locator('iframe[data-sep-manager]')).toHaveAttribute(
    'data-sep-manager',
    identity!,
  )
})

test('имитация не посылает служебные запросы настоящему manager-server', async ({
  page,
}): Promise<void> => {
  const calls: string[] = []
  page.on('request', (request): void => {
    if (request.url().includes('/__demo/state')) calls.push(request.url())
  })
  await page.route('http://127.0.0.1:4314/**', (route) => route.abort())
  await page.goto('/?service=manager')
  await expect(page.locator('[data-scenario="online"]')).toBeDisabled()
  await expect(page.locator('#service-note')).toContainText(
    'Имитация состояний отключена',
  )
  await page.waitForTimeout(300)
  expect(calls).toEqual([])
})

test('узкий экран не создаёт горизонтальную прокрутку редактора и сценариев', async ({
  page,
}): Promise<void> => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(
    page.getByRole('textbox', { name: 'Редактируемый конфиг' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      (): boolean => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'test-results/widget-playground-mobile.png',
    fullPage: true,
  })
})
