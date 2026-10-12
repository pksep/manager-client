import { expect, test, type Page } from '@playwright/test'

function frame(page: Page): ReturnType<Page['frameLocator']> {
  return page.frameLocator('iframe[data-sep-manager]')
}

async function open(page: Page): Promise<void> {
  await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
}

async function sendFirst(page: Page): Promise<void> {
  await open(page)
  await frame(page)
    .locator('.composer .tiptap')
    .fill('История после перезагрузки')
  await frame(page).locator('.composer .tiptap').press('Enter')
  await frame(page)
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Тестовый посетитель')
  await frame(page)
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 1234567')
  await frame(page)
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('restore@example.test')
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Спасибо за обращение!', { exact: false }),
  ).toBeVisible()
}

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

test('перезагрузка и другая страница возвращают текущую переписку без повторных контактов и дублей', async ({
  page,
  request,
}): Promise<void> => {
  await page.goto('/')
  await sendFirst(page)
  const before = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()

  await page.reload()
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(1)
  await expect(
    frame(page).getByText('Спасибо за обращение!', { exact: false }),
  ).toHaveCount(1)
  await frame(page)
    .locator('.composer .tiptap')
    .fill('Продолжение той же переписки')
  await frame(page).locator('.composer .tiptap').press('Enter')
  await expect(
    frame(page).getByText('Продолжение той же переписки', { exact: true }),
  ).toBeVisible()
  await expect(frame(page).getByText('Как с вами связаться?')).toHaveCount(0)

  await page.goto('/?other-page=1')
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(1)
  await expect(
    frame(page).getByText('Продолжение той же переписки', { exact: true }),
  ).toHaveCount(1)
  const after = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(after.sessions).toBe(before.sessions)
})

test('отвергнутая сессия заменяется новой без зацикливания и чужой истории', async ({
  page,
  request,
}): Promise<void> => {
  await page.goto('/')
  await sendFirst(page)
  // Только демостенд: моделируем истёкшую сессию, не трогая реальные обращения.
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })

  await page.reload()
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(0)
  await expect(frame(page).locator('.welcome-message')).toHaveCount(3)
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.sessions).toBe(1)
  expect(state.sessionRequests).toBe(2)
})

test('временная недоступность сервиса не стирает доступ после перезагрузки', async ({
  page,
  request,
}): Promise<void> => {
  await page.goto('/')
  await sendFirst(page)
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { available: false },
  })
  await page.reload()
  await expect(page.locator('iframe[data-sep-manager]')).not.toBeVisible()
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { available: true },
  })

  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(1)
  await expect(
    frame(page).getByText('Спасибо за обращение!', { exact: false }),
  ).toHaveCount(1)
})
