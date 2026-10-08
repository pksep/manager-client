import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type FrameLocator,
} from '@playwright/test'

const frame = (page: Page): FrameLocator =>
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
  await page.goto('/')
  const widget = frame(page)
  await widget.getByRole('button', { name: 'Открыть чат' }).click()
  await widget
    .locator('.composer .tiptap')
    .fill('Проверка автоматического открытия')
  await widget.locator('.composer .tiptap').press('Enter')
  await widget
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Тестовый посетитель')
  await widget
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 123-45-67')
  await widget
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('widget@example.test')
  await widget
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    widget.getByText('Проверка автоматического открытия', { exact: true }),
  ).toBeVisible()
}

async function close(page: Page): Promise<void> {
  await frame(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(frame(page).getByRole('dialog')).toBeHidden()
}

test('ответ раскрывает виджет, сохраняет черновик и не забирает фокус сайта', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await frame(page).locator('.composer .tiptap').fill('Мой черновик')
  await close(page)
  await page.locator('summary').click()
  const hostInput = page.locator('#available')
  await hostInput.focus()
  await control(request, { reply: 'Новый ответ оператора' })

  await expect(frame(page).getByRole('dialog')).toBeVisible()
  await expect(
    frame(page).getByText('Новый ответ оператора', { exact: true }),
  ).toBeVisible()
  await expect(frame(page).locator('.composer .tiptap')).toHaveText(
    'Мой черновик',
  )
  await expect(hostInput).toBeFocused()
  await page.screenshot({ path: 'test-results/widget-auto-open-message.png' })

  await close(page)
  await page.reload()
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await expect(frame(page).getByRole('dialog')).toBeHidden()
})

test('начало набора открывает один раз за непрерывный набор, следующий набор открывает снова', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await close(page)
  await control(request, { typing: true })
  await expect(frame(page).getByRole('dialog')).toBeVisible()
  await close(page)
  await control(request, { typing: true })
  await page.waitForTimeout(350)
  await expect(frame(page).getByRole('dialog')).toBeHidden()
  await control(request, { typing: false })
  await control(request, { typing: true })
  await expect(frame(page).getByRole('dialog')).toBeVisible()
})

test('подтверждение прочтения своего сообщения не раскрывает виджет', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await close(page)
  await control(request, { readMessages: true })
  await page.waitForTimeout(350)

  await expect(frame(page).getByRole('dialog')).toBeHidden()
})

test('повторная доставка ответа не раскрывает виджет', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await control(request, { reply: 'Ответ уже получен' })
  await expect(
    frame(page).getByText('Ответ уже получен', { exact: true }),
  ).toBeVisible()
  await close(page)
  await control(request, { repeatReply: true })
  await page.waitForTimeout(350)

  await expect(frame(page).getByRole('dialog')).toBeHidden()
})

test('чужой, истёкший и повреждённый набор не раскрывает и не отключает виджет', async ({
  page,
  request,
}): Promise<void> => {
  await conversation(page, request)
  await close(page)
  for (const typingOverride of [
    { inquiryId: '160f378c-2608-4141-95a4-37872f8f0051' },
    { expiresAt: '1970-01-01T00:00:00.000Z' },
    { id: 'invalid' },
  ]) {
    await control(request, { typing: true, typingOverride })
    await page.waitForTimeout(350)
    await expect(frame(page).getByRole('dialog')).toBeHidden()
    await expect(
      frame(page).getByRole('button', { name: 'Открыть чат' }),
    ).toBeVisible()
  }
  await control(request, { typing: true })
  await expect(frame(page).getByRole('dialog')).toBeVisible()
})

test('ответ во время закрытия отменяет сворачивание, включая мобильный экран', async ({
  page,
  request,
}): Promise<void> => {
  await page.setViewportSize({ width: 390, height: 844 })
  await conversation(page, request)
  await frame(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await control(request, { reply: 'Ответ во время закрытия' })

  await expect(
    frame(page).getByText('Ответ во время закрытия', { exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(250)
  await expect(frame(page).getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: 'test-results/widget-auto-open-mobile.png' })
})
