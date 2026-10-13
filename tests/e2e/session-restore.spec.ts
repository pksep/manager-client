import { expect, test, type Page } from '@playwright/test'
import { GUEST_SESSION_TTL_MS } from '../../src/session-storage'

function frame(page: Page): ReturnType<Page['frameLocator']> {
  return page.frameLocator('iframe[data-sep-manager]')
}

async function open(page: Page): Promise<void> {
  await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
  await expect(frame(page).locator('.chat-window')).toHaveCSS('opacity', '1')
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

test('24 часа очищают открытый виджет при возврате во вкладку, но не сообщения сервера', async ({
  page,
  request,
}): Promise<void> => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  const deletes: string[] = []
  page.on('request', (request): void => {
    if (request.method() === 'DELETE') deletes.push(request.url())
  })
  await page.goto('/')
  await sendFirst(page)
  await frame(page).locator('.composer .tiptap').fill('Личный черновик')
  const before = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()

  await page.clock.setFixedTime(now + GUEST_SESSION_TTL_MS + 1)
  await frame(page)
    .locator('html')
    .evaluate((): void => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(0)
  await expect(frame(page).locator('.composer .tiptap')).toHaveText('')
  await frame(page).locator('.composer .tiptap').fill('Новый диалог')
  await frame(page).locator('.composer .tiptap').press('Enter')
  for (const name of ['Имя', 'Телефон', 'E-mail']) {
    await expect(
      frame(page).getByRole('textbox', { name, exact: true }),
    ).toHaveValue('')
  }
  const after = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(after.messages).toBe(before.messages)
  expect(after.sessions).toBe(before.sessions + 1)
  expect(deletes).toEqual([])
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reply: 'Ответ в старый диалог' },
  })
  await expect(
    frame(page).getByText('Ответ в старый диалог', { exact: true }),
  ).toHaveCount(0)
})

test('после суток и перезагрузки старый ключ не отправляется и история не подгружается', async ({
  page,
  request,
}): Promise<void> => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await page.goto('/')
  await sendFirst(page)
  await page.clock.setFixedTime(now + GUEST_SESSION_TTL_MS + 1)
  const started = page.waitForRequest((request) =>
    request.url().endsWith('/v1/widget/session'),
  )
  await page.reload()
  expect((await started).headers().authorization).toBeUndefined()
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(0)
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.messages).toBe(1)
  expect(state.sessions).toBe(2)
})

test('обновление страницы на 23-м часу не продлевает срок ещё на сутки', async ({
  page,
}): Promise<void> => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await page.goto('/')
  await sendFirst(page)
  await page.clock.setFixedTime(now + GUEST_SESSION_TTL_MS - 3600000)
  await page.reload()
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(1)
  const expiresAt = await frame(page)
    .locator('html')
    .evaluate((): number => {
      const key = Object.keys(localStorage).find((key) =>
        key.startsWith('manager-session:'),
      )!

      return JSON.parse(localStorage.getItem(key)!).expiresAt
    })
  expect(expiresAt).toBe(now + GUEST_SESSION_TTL_MS)
})

test('таймер очищает загруженную историю без перезагрузки и действия посетителя', async ({
  page,
  request,
}): Promise<void> => {
  await page.goto('/')
  await sendFirst(page)
  await frame(page)
    .locator('html')
    .evaluate((): void => {
      const key = Object.keys(localStorage).find((key) =>
        key.startsWith('manager-session:'),
      )!
      const stored = JSON.parse(localStorage.getItem(key)!)
      localStorage.setItem(
        key,
        JSON.stringify({ ...stored, expiresAt: Date.now() + 8000 }),
      )
    })
  await page.reload()
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(1)
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible({ timeout: 15000 })
  await open(page)
  await expect(
    frame(page).getByText('История после перезагрузки', { exact: true }),
  ).toHaveCount(0)
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.messages).toBe(1)
})

test('при очистке забываются незавершённая форма, контакты и выбранные файлы', async ({
  page,
  request,
}): Promise<void> => {
  const now = Date.now()
  const uploads: string[] = []
  page.on('request', (request): void => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/v1/widget/attachments')
    )
      uploads.push(request.url())
  })
  await page.clock.setFixedTime(now)
  await page.goto('/')
  await open(page)
  await frame(page)
    .locator('.composer .tiptap')
    .fill('Неотправленная заявка с файлом')
  await frame(page)
    .locator('input.attach-hidden-input:not([accept])')
    .setInputFiles({
      name: 'Личный файл.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Личные данные'),
    })
  await frame(page)
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Личный контакт')
  await page.clock.setFixedTime(now + GUEST_SESSION_TTL_MS + 1)
  await frame(page)
    .locator('html')
    .evaluate((): void => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
  await expect(
    frame(page).getByText('Личный файл.txt', { exact: true }),
  ).toHaveCount(0)
  await expect(frame(page).locator('.composer .tiptap')).toHaveText('')
  await frame(page).locator('.composer .tiptap').fill('Новая первая отправка')
  await frame(page).locator('.composer .tiptap').press('Enter')
  await expect(
    frame(page).getByRole('textbox', { name: 'Имя', exact: true }),
  ).toHaveValue('')
  await frame(page)
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Новая заявка')
  await frame(page)
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 1234567')
  await frame(page)
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('fresh@example.test')
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Новая первая отправка', { exact: true }),
  ).toBeVisible()
  await expect(
    frame(page).getByRole('button', { name: 'Скачать Личный файл.txt' }),
  ).toHaveCount(0)
  expect(uploads).toEqual([])
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.messages).toBe(1)
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
