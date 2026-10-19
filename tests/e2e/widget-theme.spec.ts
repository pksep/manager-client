import { expect, test, type Page } from '@playwright/test'

async function mount(page: Page, options: object): Promise<void> {
  await page.route('**/demo/host.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `import { mount } from '/src/embed.ts';
      mount({ siteId: 'amotiv-demo', serviceUrl: 'http://127.0.0.1:4311',
      widgetUrl: new URL('/widget.html', location.href).href, ...${JSON.stringify(options)} });`,
    }),
  )
  await page.goto('/')
}

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

for (const width of [1440, 390]) {
  test(`оранжевый цвет кнопок и сообщений, сайт не перекрашивается: ${width}px`, async ({
    page,
  }): Promise<void> => {
    await page.setViewportSize({ width, height: 900 })
    await mount(page, { accentColor: '#c2410c' })
    const widget = page.frameLocator('iframe[data-sep-manager]')
    const launcher = widget.getByRole('button', { name: 'Открыть чат' })

    await expect(launcher).toHaveCSS('background-color', 'rgb(194, 65, 12)')
    await expect(launcher).toHaveCSS('color', 'rgb(255, 255, 255)')
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--action-primary-bg'),
      ),
    ).toBe('')
    await page
      .locator('iframe[data-sep-manager]')
      .screenshot({ path: `test-results/widget-orange-launcher-${width}.png` })
    await launcher.click()
    await expect(widget.getByRole('dialog')).toBeVisible()
    await widget.locator('.composer .tiptap').fill('Хочу узнать подробнее')
    await widget.locator('.composer .tiptap').press('Enter')
    const send = widget.getByRole('button', {
      name: 'Отправить сообщение',
      exact: true,
    })

    await expect(send).toBeDisabled()
    await expect(send).not.toHaveCSS('background-color', 'rgb(194, 65, 12)')
    await widget.getByRole('textbox', { name: 'Имя', exact: true }).fill('Тест')
    await widget
      .getByRole('textbox', { name: 'Телефон', exact: true })
      .fill('+7 999 123-45-67')
    await widget
      .getByRole('textbox', { name: 'E-mail', exact: true })
      .fill('test@example.com')
    await expect(send).toBeEnabled()
    await expect(send).toHaveCSS('background-color', 'rgb(194, 65, 12)')
    await expect(send).toHaveCSS('color', 'rgb(255, 255, 255)')
    await send.click()
    await expect(
      widget.getByText('Хочу узнать подробнее', { exact: true }),
    ).toBeVisible()
    await expect(
      widget.locator('.outgoing .chat-message-surface').first(),
    ).toHaveCSS('background-color', 'rgb(246, 228, 221)')
    await page
      .locator('iframe[data-sep-manager]')
      .screenshot({ path: `test-results/widget-orange-chat-${width}.png` })
  })
}

test('белый акцент не делает иконку запуска невидимой', async ({
  page,
}): Promise<void> => {
  await mount(page, { accentColor: '#ffffff' })
  const launcher = page
    .frameLocator('iframe[data-sep-manager]')
    .getByRole('button', { name: 'Открыть чат' })

  await expect(launcher).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(launcher).toHaveCSS('color', 'rgb(0, 0, 0)')
})

test('редактор применяет цвет и возвращает исходное оформление', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  const widget = page.frameLocator('iframe[data-sep-manager]')
  const launcher = widget.getByRole('button', { name: 'Открыть чат' })
  await expect(launcher).toBeVisible()
  const original = await launcher.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  const editor = page.getByRole('textbox', { name: 'Редактируемый конфиг' })
  const options = JSON.parse(await editor.inputValue())

  options.accentColor = '#c2410c'
  await editor.fill(JSON.stringify(options))
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  await expect(launcher).toHaveCSS('background-color', 'rgb(194, 65, 12)')
  await expect(page.locator('#integration-code')).toContainText(
    '"accentColor": "#c2410c"',
  )
  await page.getByRole('button', { name: 'Вернуть исходный' }).click()
  await expect(launcher).toHaveCSS('background-color', original)
})

test('CSS вместо цвета отклоняется до создания iframe и сеанса', async ({
  page,
  request,
}): Promise<void> => {
  const errors: string[] = []
  page.on('pageerror', (error): void => {
    errors.push(error.message)
  })
  await mount(page, { accentColor: '#c2410c;display:none' })
  await expect.poll(() => errors.join()).toContain('accentColor')
  await expect(page.locator('iframe[data-sep-manager]')).toHaveCount(0)
  expect(
    (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
      .sessionRequests,
  ).toBe(0)
})
