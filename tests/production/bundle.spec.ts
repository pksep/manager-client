import { expect, test } from '@playwright/test'

test('production loader and iframe complete an inquiry across two origins', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
  await page.route('**/demo/host.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    import { mount } from 'http://127.0.0.1:4312/manager.mjs';
    mount({ siteId: 'amotiv-demo', serviceUrl: 'http://127.0.0.1:4311', widgetUrl: 'http://127.0.0.1:4312/widget.html' });
  `,
    }),
  )
  await page.goto('/')
  const frame = page.frameLocator('iframe[data-sep-manager]')
  await frame.getByRole('button', { name: 'Открыть чат' }).click()
  const iframe = page.locator('iframe[data-sep-manager]')
  const initial = (await iframe.boundingBox())!
  await frame.locator('.chat-header').focus()
  await frame.locator('.chat-header').press('Shift+ArrowLeft')
  await expect
    .poll(async () => (await iframe.boundingBox())!.x)
    .toBe(initial.x - 40)
  await frame.locator('.composer .tiptap').fill('Проверка сборки')
  await frame.locator('.composer .toolbar .right').click()
  await frame.getByRole('textbox', { name: 'Имя', exact: true }).fill('Иван')
  await frame
    .getByRole('textbox', { name: 'Телефон', exact: true })
    .fill('+7 999 1234567')
  await frame
    .getByRole('textbox', { name: 'E-mail', exact: true })
    .fill('ivan@example.com')
  await frame
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    frame.getByText('Проверка сборки', { exact: true }),
  ).toBeVisible()
  await expect(
    frame.getByText('Спасибо за обращение!', { exact: false }),
  ).toBeVisible()
  await frame.locator('.toolbar .attach-file-button').click()
  const choosing = page.waitForEvent('filechooser')
  await frame.getByText('Файл', { exact: true }).last().click()
  await (
    await choosing
  ).setFiles({
    name: 'Сборка.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Прямая отправка в сборке'),
  })
  await expect(frame.locator('.attach-modal-container')).toHaveCount(0)
  await expect(
    frame.getByRole('button', { name: 'Скачать Сборка.txt' }),
  ).toBeVisible()
})
