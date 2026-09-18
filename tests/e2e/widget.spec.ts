import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test'

const frame = (page: Page) => page.frameLocator('iframe[data-sep-manager]')
const control = (request: APIRequestContext, data: object) =>
  request.post('http://127.0.0.1:4311/__demo/state', { data })
async function open(page: Page) {
  await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
  await expect(
    frame(page).getByRole('dialog', { name: 'Чат с компанией' }),
  ).toBeVisible()
}
async function firstMessage(page: Page, text = 'Подберите оборудование') {
  await frame(page).locator('.composer .tiptap').fill(text)
  await frame(page).locator('.composer .tiptap').press('Enter')
  await expect(frame(page).getByText('Как с вами связаться?')).toBeVisible()
}
async function contacts(page: Page) {
  await frame(page)
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill('Иван Иванов')
  await frame(page)
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 123-45-67')
  await frame(page)
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('ivan@example.com')
}
test.beforeEach(async ({ request }) => {
  await control(request, {
    reset: true,
    vkBusinessUrl: 'https://vk.com/test-company',
  })
})

test('геометрия, приветствия и контакты до первой доставки', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.locator('iframe[data-sep-manager]')).toBeVisible()
  const launcherBox = await frame(page)
    .getByRole('button', { name: 'Открыть чат' })
    .boundingBox()
  expect(launcherBox?.width).toBe(60)
  expect(launcherBox?.height).toBe(60)
  await open(page)
  const box = await page.locator('iframe[data-sep-manager]').boundingBox()
  expect(box?.width).toBe(418)
  expect(box?.height).toBe(640)
  await expect(frame(page).locator('.welcome-message')).toHaveCount(3)
  await expect(frame(page).locator('.composer .toolbar .right')).toBeDisabled()
  expect(
    await frame(page)
      .locator('.chat-header')
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(76)
  expect(
    await frame(page)
      .locator('.composer')
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBe(120)
  await page.screenshot({ path: 'test-results/widget-welcome.png' })
  await frame(page)
    .getByRole('button', { name: 'Мне нужна помощь', exact: true })
    .click()
  await expect(frame(page).locator('.composer .tiptap')).toHaveText(
    'Мне нужна помощь',
  )
  await expect(frame(page).locator('.composer .tiptap')).toBeFocused()
  await expect(frame(page).locator('.composer .toolbar .right')).toBeEnabled()
  await firstMessage(page)
  await expect(
    frame(page).getByRole('button', { name: 'Отправить сообщение' }),
  ).toBeDisabled()
  const before = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(before.messages).toBe(0)
  await contacts(page)
  await expect(frame(page).getByText('Имя', { exact: true })).toBeVisible()
  await expect(frame(page).getByText('Телефон', { exact: true })).toBeVisible()
  await expect(
    frame(page).getByRole('button', {
      name: 'Отправить сообщение',
      exact: true,
    }),
  ).toBeEnabled()
  await page.screenshot({ path: 'test-results/widget-contacts.png' })
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toBeVisible()
  await expect(
    frame(page).getByText('Спасибо за обращение!', { exact: false }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/widget-conversation.png' })
  expect(errors).toEqual([])
})

test('причина disabled видна при наведении и фокусе, скругления совпадают', async ({
  page,
}) => {
  await page.goto('/')
  await open(page)
  const f = frame(page)
  const editorRadii = await f
    .locator('.composer')
    .evaluate((el) => [
      getComputedStyle(el).borderRadius,
      getComputedStyle(el.querySelector('.editor-component')!).borderRadius,
    ])
  expect(editorRadii).toEqual(['20px', '20px'])
  await firstMessage(page)
  const hint = f.locator('.tooltip-yui-kit__hint')
  await f.locator('.contact-submit-hint').hover()
  await expect(hint).toContainText('Введите имя.')
  await expect(hint).toContainText('Введите номер телефона.')
  await expect(hint).toContainText('Введите email.')
  await page.screenshot({ path: 'test-results/widget-disabled-reason.png' })
  await contacts(page)
  await expect(hint).toHaveCount(0)
  await f.getByRole('textbox', { name: 'E-mail', exact: true }).fill('wrong')
  await f.locator('.contact-submit-hint').focus()
  await expect(hint).toHaveText('Проверьте email, например name@example.com.')
  await expect(
    f.getByRole('button', { name: 'Отправить сообщение', exact: true }),
  ).toBeDisabled()
  const fieldRadii = await f
    .locator('.contact-field .input-yui-kit')
    .evaluateAll((els) =>
      els.map((el) => [
        getComputedStyle(el).borderRadius,
        getComputedStyle(el, '::before').borderRadius,
        getComputedStyle(el.querySelector('input')!).borderRadius,
      ]),
    )
  for (const [parent, border, input] of fieldRadii) {
    expect(border).toBe(parent)
    expect(input).toBe(parent)
  }
})

test('текст и контакты компактны, имеют время и переход отправлено → прочитано', async ({
  page,
  request,
}) => {
  await control(request, { autoReply: false })
  await page.goto('/')
  await open(page)
  await firstMessage(page, 'Да')
  await contacts(page)
  const f = frame(page)
  await f.getByRole('textbox', { name: 'Имя', exact: true }).fill('Alex Sample')
  await f
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+10000000000')
  await f
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('alex.sample60@example.org')
  await f
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  const rows = f.locator('.message-row.outgoing')
  await expect(rows).toHaveCount(2)
  await expect(rows.locator('.chat-message-meta')).toHaveCount(2)
  await expect(
    rows.getByRole('img', { name: 'Отправлено', exact: true }),
  ).toHaveCount(2)
  const firstBubble = rows.first().locator('.chat-message-surface')
  const width = await firstBubble.evaluate(
    (el) => el.getBoundingClientRect().width,
  )
  expect(width).toBeLessThan(140)
  const contactBubble = rows.last().locator('.chat-message-surface')
  await expect
    .poll(() =>
      contactBubble.evaluate((el) => el.getBoundingClientRect().width),
    )
    .toBeLessThan(330)
  const contactGeometry = await contactBubble.evaluate((el) => {
    const content = el.querySelector('.contact-summary-text')!
    const range = document.createRange()
    range.selectNodeContents(content)
    const lines = [...range.getClientRects()]
    const last = lines.at(-1)!
    const meta = el.querySelector('time')!.getBoundingClientRect()
    return {
      lines: lines.length,
      lastRight: last.right,
      metaLeft: meta.left,
      bottom: meta.bottom,
      bubbleBottom: el.getBoundingClientRect().bottom,
    }
  })
  expect(contactGeometry.lines).toBe(2)
  expect(
    contactGeometry.metaLeft - contactGeometry.lastRight,
  ).toBeGreaterThanOrEqual(7)
  expect(contactGeometry.bottom).toBeLessThan(contactGeometry.bubbleBottom)
  expect(await rows.last().locator('time').getAttribute('datetime')).toBe(
    await rows.first().locator('time').getAttribute('datetime'),
  )
  await page.screenshot({ path: 'test-results/widget-message-sent.png' })
  await control(request, { readMessages: true })
  await expect(
    rows.getByRole('img', { name: 'Прочитано', exact: true }),
  ).toHaveCount(2)
  await expect(
    rows.getByRole('img', { name: 'Отправлено', exact: true }),
  ).toHaveCount(0)
  await expect(rows).toHaveCount(2)
  await page.screenshot({ path: 'test-results/widget-message-read.png' })
  await control(request, { available: false })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await control(request, { available: true })
  await open(page)
  await expect(
    rows.getByRole('img', { name: 'Прочитано', exact: true }),
  ).toHaveCount(2)
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.messages).toBe(1)
})

test('прочтение до HTTP-подтверждения первой отправки не теряется', async ({
  page,
  request,
}) => {
  await control(request, { autoReply: false })
  await page.route('**/v1/widget/inquiries', async (route) => {
    const response = await route.fetch()
    await control(request, { readMessages: true })
    // Allow the read update to arrive while the form still awaits its HTTP response.
    await page.waitForTimeout(300)
    await route.fulfill({ response })
  })
  await page.goto('/')
  await open(page)
  await firstMessage(page, 'Проверка прочтения')
  await contacts(page)
  const f = frame(page)
  await f
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    f
      .locator('.message-row.outgoing')
      .getByRole('img', { name: 'Прочитано', exact: true }),
  ).toHaveCount(2)
})

test('при недоступности нет даже кнопки; восстановление сохраняет черновик', async ({
  page,
  request,
}) => {
  await control(request, { available: false })
  await page.goto('/')
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await control(request, { available: true })
  await open(page)
  await frame(page).locator('.composer .tiptap').fill('Сохранённый черновик')
  await control(request, { available: false })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await control(request, { available: true })
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
  await expect(frame(page).locator('.composer .tiptap')).toHaveText(
    'Сохранённый черновик',
  )
})

test('меню использует заданные социальные ссылки', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await frame(page).getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(
    frame(page).getByRole('link', { name: 'Написать ВКонтакте' }),
  ).toHaveAttribute('href', 'https://vk.com/test-company')
  await expect(
    frame(page).getByRole('button', { name: 'Отправить сообщение' }),
  ).toBeVisible()
  const f = frame(page)
  expect(
    await f
      .locator('.launcher-popover .popover-yui-kit__content')
      .evaluate((el) => getComputedStyle(el).boxShadow),
  ).toBe('none')
  const launcher = (await f
    .getByRole('button', { name: 'Открыть чат' })
    .boundingBox())!
  await page.mouse.move(launcher.x + launcher.width / 2, launcher.y - 6)
  // The cursor may pause in the transparent gap longer than the close delay.
  await page.waitForTimeout(400)
  await expect(
    f.getByRole('link', { name: 'Написать ВКонтакте' }),
  ).toBeVisible()
  await f.getByRole('link', { name: 'Написать ВКонтакте' }).hover()
  await page.screenshot({ path: 'test-results/widget-menu.png' })
  await control(request, { social: false })
  await frame(page).getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(
    frame(page).getByRole('link', { name: 'Написать ВКонтакте' }),
  ).toHaveCount(0)
})

test('вне рабочего времени обращение доступно', async ({ page, request }) => {
  await control(request, { online: false })
  await page.goto('/')
  await open(page)
  await expect(
    frame(page).getByText('Оператор не в сети. Ответим с 8:00 до 18:00'),
  ).toBeVisible()
  await firstMessage(page)
})

test('потерянное подтверждение не создаёт дубль', async ({ page, request }) => {
  await page.goto('/')
  await open(page)
  await firstMessage(page)
  await contacts(page)
  await control(request, { loseAck: true })
  // Demo controls reconnect the socket, so wait for readiness and reopen.
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toBeVisible()
  const state = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(state.messages).toBe(1)
})

test('ошибка данных оставляет форму и позволяет повторить', async ({
  page,
  request,
}) => {
  await control(request, { failNext: true })
  await page.goto('/')
  await open(page)
  await firstMessage(page)
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(frame(page).getByRole('alert')).toBeVisible()
  await expect(
    frame(page).getByRole('textbox', { name: 'Имя', exact: true }),
  ).toHaveValue('Иван Иванов')
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toBeVisible()
})

test('ответ менеджера с файлом скачивается в своей сессии', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await open(page)
  await firstMessage(page)
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toBeVisible()
  await control(request, { sendFile: true })
  const downloading = page.waitForEvent('download')
  await frame(page)
    .getByRole('button', { name: 'Скачать Ответ менеджера.txt' })
    .click()
  expect((await downloading).suggestedFilename()).toBe('Ответ менеджера.txt')
})

test('мобильная ширина и стили сайта не ломают окно', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.addStyleTag({
    content:
      'button{background:red!important;padding:80px!important} h1{font-size:90px!important}',
  })
  await open(page)
  const box = await page.locator('iframe[data-sep-manager]').boundingBox()
  expect(box?.width).toBe(327)
  expect(box?.x).toBe(24)
  await firstMessage(page)
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/widget-mobile.png' })
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toBeVisible()
})

test('файл без предпросмотра сохраняется до контактов и доходит после восстановления', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await open(page)
  await frame(page).locator('.composer .tiptap').fill('Прикладываю требования')
  await frame(page).locator('.toolbar .attach-file-button').click()
  const choosing = page.waitForEvent('filechooser')
  await frame(page).getByText('Файл', { exact: true }).last().click()
  await (
    await choosing
  ).setFiles({
    name: 'Требования.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Требования к оборудованию'),
  })
  await expect(frame(page).getByText('Как с вами связаться?')).toBeVisible()
  await expect(frame(page).locator('.attach-modal-container')).toHaveCount(0)
  const before = await (
    await request.get('http://127.0.0.1:4311/__demo/state')
  ).json()
  expect(before.messages).toBe(0)
  await control(request, { available: false })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await control(request, { available: true })
  await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
  await expect(frame(page).locator('.attach-modal-container')).toHaveCount(0)
  await expect(frame(page).getByText('Как с вами связаться?')).toBeVisible()
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Прикладываю требования', { exact: true }),
  ).toBeVisible()
  const downloading = page.waitForEvent('download')
  await frame(page)
    .getByRole('button', { name: 'Скачать Требования.txt' })
    .click()
  expect((await downloading).suggestedFilename()).toBe('Требования.txt')
  await page.screenshot({ path: 'test-results/widget-file.png' })
})

test('после контактов выбранные файлы отправляются сразу; отмена и лимиты не отправляют сообщение', async ({
  page,
  request,
}) => {
  await control(request, { autoReply: false })
  await page.goto('/')
  await open(page)
  await firstMessage(page)
  await contacts(page)
  const f = frame(page)
  await f
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(f.locator('.message-row[data-message-id]')).toHaveCount(1)
  async function chooseFiles(
    files: { name: string; mimeType: string; buffer: Buffer }[],
  ) {
    await f.locator('.toolbar .attach-file-button').click()
    const choosing = page.waitForEvent('filechooser')
    await f.getByText('Файл', { exact: true }).last().click()
    await (await choosing).setFiles(files)
    await expect(f.locator('.attach-modal-container')).toHaveCount(0)
  }
  await chooseFiles([])
  await expect(f.locator('.message-row[data-message-id]')).toHaveCount(1)
  await chooseFiles(
    Array.from({ length: 6 }, (_, index) => ({
      name: `Limit-${index}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('limit'),
    })),
  )
  await expect(f.getByRole('alert')).toContainText('Допустимо до 5 файлов')
  await expect(f.locator('.message-row[data-message-id]')).toHaveCount(1)
  await chooseFiles([
    {
      name: 'Без предпросмотра.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Файл сразу после выбора'),
    },
    {
      name: 'Второй.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Второй файл в том же сообщении'),
    },
  ])
  await expect(
    f.getByRole('button', { name: 'Скачать Без предпросмотра.txt' }),
  ).toBeVisible()
  await expect(f.locator('.message-row[data-message-id]')).toHaveCount(2)
  await expect(
    f.locator('.message-row[data-message-id]').last().locator('.message-file'),
  ).toHaveCount(2)
  await expect(f.locator('.composer .tiptap')).toHaveText('')
  await expect(f.getByText('Как с вами связаться?')).toHaveCount(0)
  // A rejected upload must remain retryable without selecting the file again.
  await page.route('**/v1/widget/attachments', async (route) => {
    await route.fulfill({ status: 422, json: {} })
    await page.unroute('**/v1/widget/attachments')
  })
  await chooseFiles([
    {
      name: 'Повтор.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Повторная отправка'),
    },
  ])
  await expect(f.getByRole('alert')).toBeVisible()
  await f.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(
    f.getByRole('button', { name: 'Скачать Повтор.txt' }),
  ).toBeVisible()
  await expect(f.locator('.message-row[data-message-id]')).toHaveCount(3)
})

test('эмодзи выбирается стандартным редактором и отправляется', async ({
  page,
}) => {
  await page.goto('/')
  const f = frame(page)
  await expect(f.locator('.composer')).toHaveAttribute(
    'data-emoji-preloaded',
    'true',
  )
  await expect(f.locator('.chat-window')).toBeHidden()
  await f
    .locator('.composer .v3-emoji-picker')
    .evaluate((el) => el.setAttribute('data-original-picker', 'true'))
  await open(page)
  await frame(page).locator('.toolbar .smile-button').click()
  await frame(page)
    .locator('.toolbar .emoji-picker button')
    .filter({ hasText: '😀' })
    .first()
    .click()
  await expect(frame(page).locator('.composer .tiptap')).toContainText('😀')
  await frame(page).locator('.composer .tiptap').press('Escape')
  // Escape collapses the panel after the editor closes its popup.
  if (
    await frame(page).getByRole('button', { name: 'Открыть чат' }).isVisible()
  )
    await open(page)
  await frame(page).locator('.composer .toolbar .right').click()
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(frame(page).locator('.message-html')).toContainText(['😀'])
  await expect(f.locator('.composer .tiptap')).toHaveText('')
  await expect(f.locator('.composer .v3-emoji-picker')).toHaveAttribute(
    'data-original-picker',
    'true',
  )
  await f.locator('.toolbar .smile-button').click()
  await f.locator('.v3-groups .v3-group').nth(3).click()
  await f.locator('.toolbar .smile-button').click()
  await f.locator('.toolbar .smile-button').click()
  await expect(f.locator('.v3-body-inner')).toHaveJSProperty('scrollTop', 0)
  await expect(
    f
      .locator('.toolbar .emoji-picker button')
      .filter({ hasText: '😀' })
      .first(),
  ).toBeInViewport()
  await f
    .locator('.toolbar .emoji-picker button')
    .filter({ hasText: '😀' })
    .first()
    .click()
  await f.locator('.composer .toolbar .right').click()
  await expect(f.locator('.message-row.outgoing[data-message-id]')).toHaveCount(
    2,
  )
  await expect(f.locator('.composer .v3-emoji-picker')).toHaveAttribute(
    'data-original-picker',
    'true',
  )
})

test('окно перемещается за шапку, сохраняет позицию и остаётся в границах экрана', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
  await open(page)
  const iframe = page.locator('iframe[data-sep-manager]')
  const header = frame(page).locator('.chat-header')
  const initial = (await iframe.boundingBox())!
  const handle = (await header.boundingBox())!
  await page.mouse.move(handle.x + 120, handle.y + 30)
  await page.mouse.down()
  await page.mouse.move(handle.x - 180, handle.y - 70, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => Math.round((await iframe.boundingBox())!.x))
    .toBe(Math.round(initial.x - 300))
  await expect
    .poll(async () => Math.round((await iframe.boundingBox())!.y))
    .toBe(Math.round(initial.y - 100))
  await expect(header).not.toHaveClass(/dragging/)
  const moved = (await iframe.boundingBox())!
  await frame(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await open(page)
  expect(await iframe.boundingBox()).toEqual(moved)
  await header.focus()
  await header.press('Shift+ArrowLeft')
  await expect
    .poll(async () => Math.round((await iframe.boundingBox())!.x))
    .toBe(Math.round(moved.x - 40))
  const current = (await header.boundingBox())!
  await page.mouse.move(current.x + 100, current.y + 30)
  await page.mouse.down()
  await page.mouse.move(0, 0, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await iframe.boundingBox())!.x).toBe(8)
  await expect.poll(async () => (await iframe.boundingBox())!.y).toBe(8)
  await page.setViewportSize({ width: 320, height: 520 })
  const small = (await iframe.boundingBox())!
  expect(small.x + small.width).toBeLessThanOrEqual(312)
  expect(small.y + small.height).toBeLessThanOrEqual(512)
  await frame(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
})

test('история использует скролл sep-yui, длинный черновик не растягивает редактор', async ({
  page,
  request,
}) => {
  await control(request, { autoReply: false })
  await page.goto('/')
  await open(page)
  await firstMessage(page)
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).locator('.message-row[data-message-id]'),
  ).toHaveCount(1)
  for (let index = 0; index < 15; index++) {
    await control(request, {
      reply: `<p>Ответ ${index}: консультация по оборудованию и условиям поставки.</p>`,
    })
  }
  const f = frame(page)
  const slot = f.locator('.transcript.scroll-wrapper .scroll-wrapper__slot')
  await expect(f.locator('.message-row[data-message-id]')).toHaveCount(16)
  await expect
    .poll(() =>
      slot.evaluate((el) =>
        Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop),
      ),
    )
    .toBeLessThan(3)
  await slot.hover()
  const track = f.locator('.transcript .scroll-wrapper__track_vertical')
  await expect(track).toBeVisible()
  expect(await slot.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe(
    'none',
  )
  const before = await slot.evaluate((el) => el.scrollTop)
  await page.mouse.wheel(0, -320)
  await expect
    .poll(() => slot.evaluate((el) => el.scrollTop))
    .toBeLessThan(before - 100)
  const bar = (await track.locator('.scroll-wrapper__bar').boundingBox())!
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width / 2, bar.y - 180, { steps: 10 })
  await page.mouse.up()
  await expect
    .poll(() => slot.evaluate((el) => el.scrollTop))
    .toBeLessThan(before - 320)
  await f
    .locator('.composer .tiptap')
    .fill(
      Array.from({ length: 25 }, (_, index) => `Строка ${index}`).join('\n'),
    )
  const composer = await f.locator('.composer').evaluate((el) => {
    const editable = el.querySelector('.editor-content')!
    return {
      height: el.getBoundingClientRect().height,
      bottom: getComputedStyle(el.querySelector('.toolbar')!).marginBottom,
      scrollbar: getComputedStyle(editable).scrollbarWidth,
      scrollHeight: editable.scrollHeight,
      clientHeight: editable.clientHeight,
    }
  })
  expect(composer.height).toBe(120)
  expect(composer.bottom).toBe('15px')
  expect(composer.scrollbar).toBe('none')
  expect(composer.scrollHeight).toBeGreaterThan(composer.clientHeight)
  await page.screenshot({ path: 'test-results/widget-scroll.png' })
})

test('новая загрузка не раскрывает историю, HTML ответа очищается', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await open(page)
  await firstMessage(page)
  await contacts(page)
  await frame(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toBeVisible()
  await control(request, {
    reply:
      '<img src=x onerror="window.__unsafe=1"><strong>Безопасный ответ</strong> <a href="https://example.com/help">Инструкция</a> <a href="javascript:window.__unsafe=3">Опасная ссылка</a><script>window.__unsafe=2</script>',
  })
  await expect(
    frame(page).getByText('Безопасный ответ', { exact: true }),
  ).toBeVisible()
  await expect(
    frame(page).locator('.message-html img, .message-html script'),
  ).toHaveCount(0)
  const safeLink = frame(page).getByRole('link', { name: 'Инструкция' })
  await expect(safeLink).toHaveAttribute('href', 'https://example.com/help')
  await expect(safeLink).toHaveAttribute('target', '_blank')
  await expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(safeLink).toHaveCSS('color', 'rgb(64, 123, 255)')
  await expect(safeLink).toHaveCSS('text-decoration-line', 'underline')
  await expect(
    frame(page).locator('.message-html').filter({ hasText: 'Безопасный ответ' }),
  ).toContainText('Опасная ссылка')
  await expect(frame(page).locator('.message-html a')).toHaveCount(1)
  await page.reload()
  await open(page)
  await expect(frame(page).locator('.welcome-message')).toHaveCount(3)
  await expect(
    frame(page).getByText('Подберите оборудование', { exact: true }),
  ).toHaveCount(0)
})

test('посторонний postMessage не может показать скрытый виджет', async ({
  page,
  request,
}) => {
  await control(request, { available: false })
  await page.goto('/')
  await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>(
      'iframe[data-sep-manager]',
    )!
    window.postMessage(
      {
        type: 'sep-manager:state',
        instance: iframe.dataset.sepManager,
        mode: 'panel',
      },
      location.origin,
    )
  })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
})

test('сенсорный экран 320 px: открытие и отправка доступны касанием', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 740 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4310')
  await frame(page).getByRole('button', { name: 'Открыть чат' }).tap()
  await frame(page).locator('.composer .tiptap').fill('Нужна консультация')
  await frame(page).locator('.composer .toolbar .right').tap()
  await contacts(page)
  const submit = frame(page).getByRole('button', {
    name: 'Отправить сообщение',
    exact: true,
  })
  await submit.scrollIntoViewIfNeeded()
  await submit.tap()
  await expect(
    frame(page).getByText('Нужна консультация', { exact: true }),
  ).toBeVisible()
  const box = await page.locator('iframe[data-sep-manager]').boundingBox()
  expect(box?.width).toBe(272)
  await page.screenshot({ path: 'test-results/widget-touch.png' })
  await context.close()
})

test('успешного HTTP без готового канала ответов недостаточно для показа', async ({
  page,
}) => {
  await page.routeWebSocket('**/v1/widget/events', () => {
    /* No readiness acknowledgement. */
  })
  await page.goto('/')
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await page.waitForTimeout(5500)
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
})
