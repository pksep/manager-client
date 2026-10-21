import { expect, test, type Page } from '@playwright/test'

const links = {
  maxUrl: 'https://max.ru/company_bot',
  telegramUrl: 'https://t.me/company_bot?start=site',
  vkUrl: 'https://vk.ru/im/convo/-203143723?entrypoint=list_all',
}

async function mount(page: Page, options: object): Promise<void> {
  await page.route(/\/demo\/host\.ts(?:\?.*)?$/, (route) =>
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
    data: { reset: true, vkBusinessUrl: 'https://vk.ru/server-company' },
  })
})

test('ссылки из подключения заменяют ВК и открывают все три мессенджера с иконкой MAX', async ({
  page,
  context,
}): Promise<void> => {
  const errors: string[] = []
  page.on('pageerror', (error): void => {
    errors.push(error.message)
  })
  await context.route(/^https:\/\/(max\.ru|t\.me|vk\.ru)\//, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<p>Тестовый адрес мессенджера</p>',
    }),
  )
  await mount(page, links)
  const widget = page.frameLocator('iframe[data-sep-manager]')

  await widget.getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(widget.locator('.contact-menu a')).toHaveCount(3)
  const icon = widget.locator('.messenger-max-icon')
  await expect(icon).toBeVisible()
  expect(
    await icon.evaluate(
      (element) =>
        element instanceof HTMLImageElement &&
        element.complete &&
        element.naturalWidth > 0,
    ),
  ).toBe(true)
  await page.screenshot({ path: 'test-results/widget-messenger-links.png' })

  for (const [name, url] of [
    ['MAX', links.maxUrl],
    ['Telegram', links.telegramUrl],
    ['ВКонтакте', links.vkUrl],
  ]) {
    await widget.getByRole('button', { name: 'Открыть чат' }).hover()
    const link = widget.getByRole('link', { name, exact: true })

    await expect(link).toHaveAttribute('href', url)
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const opened = context.waitForEvent('page')
    await link.click()
    const popup = await opened
    await popup.waitForURL(url)
    expect(await popup.evaluate(() => window.opener === null)).toBe(true)
    await popup.close()
  }

  await page.reload()
  await widget.getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(
    widget.getByRole('link', { name: 'MAX', exact: true }),
  ).toHaveAttribute('href', links.maxUrl)
  await expect(widget.locator('.contact-menu a')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('флаги скрывают пункты даже при серверной ссылке, чат остаётся доступен', async ({
  page,
}): Promise<void> => {
  await mount(page, {
    ...links,
    showVk: false,
    showMax: false,
    showTelegram: false,
  })
  const widget = page.frameLocator('iframe[data-sep-manager]')

  await widget.getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(widget.locator('.contact-menu a')).toHaveCount(0)
  await widget
    .getByRole('button', { name: 'Написать сообщение', exact: true })
    .click()
  await expect(widget.getByRole('dialog')).toBeVisible()
})

test('опасный адрес отклоняется до создания iframe и гостевой сессии', async ({
  page,
  request,
}): Promise<void> => {
  const errors: string[] = []
  page.on('pageerror', (error): void => {
    errors.push(error.message)
  })
  await mount(page, { telegramUrl: 'https://t.me.attacker.test/bot' })

  await expect.poll(() => errors.join(' ')).toContain('telegramUrl')
  await expect(page.locator('iframe[data-sep-manager]')).toHaveCount(0)
  expect(
    (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
      .sessionRequests,
  ).toBe(0)
})

test('ссылки редактируются на демостранице и помещаются на мобильном экране', async ({
  page,
}): Promise<void> => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const editor = page.getByRole('textbox', { name: 'Редактируемый конфиг' })
  const options = JSON.parse(await editor.inputValue())
  await editor.fill(JSON.stringify({ ...options, ...links }))
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  const widget = page.frameLocator('iframe[data-sep-manager]')
  await widget.getByRole('button', { name: 'Открыть чат' }).focus()

  for (const name of ['MAX', 'Telegram', 'ВКонтакте'])
    await expect(
      widget.getByRole('link', { name, exact: true }),
    ).toBeInViewport()

  await page
    .getByRole('button', { name: 'Код применённого подключения' })
    .click()
  await expect(page.locator('#integration-code')).toContainText(links.maxUrl)
  await widget.getByRole('button', { name: 'Открыть чат' }).focus()
  await page.screenshot({
    path: 'test-results/widget-messenger-links-mobile.png',
  })
})

test.describe('сенсорный экран', (): void => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('касание открывает выбор канала, MAX доступен без наведения', async ({
    page,
    context,
  }): Promise<void> => {
    await context.route('https://max.ru/company_bot', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<p>Тест MAX</p>' }),
    )
    await mount(page, links)
    const widget = page.frameLocator('iframe[data-sep-manager]')
    await widget.getByRole('button', { name: 'Открыть чат' }).tap()
    await expect(widget.getByRole('dialog')).toBeHidden()
    await expect(
      widget.getByRole('navigation', { name: 'Способы связи' }),
    ).toBeVisible()
    const opened = context.waitForEvent('page')
    await widget.getByRole('link', { name: 'MAX', exact: true }).tap()
    const popup = await opened
    await popup.waitForURL(links.maxUrl)
    await popup.close()
    await widget.getByRole('button', { name: 'Открыть чат' }).tap()
    await widget
      .getByRole('button', { name: 'Написать сообщение', exact: true })
      .tap()
    await expect(widget.getByRole('dialog')).toBeVisible()
  })

  test('без мессенджеров касание сразу открывает чат', async ({
    page,
  }): Promise<void> => {
    await mount(page, { showVk: false })
    const widget = page.frameLocator('iframe[data-sep-manager]')
    await widget.getByRole('button', { name: 'Открыть чат' }).tap()
    await expect(widget.getByRole('dialog')).toBeVisible()
  })
})
