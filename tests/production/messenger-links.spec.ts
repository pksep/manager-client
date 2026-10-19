import { expect, test } from '@playwright/test'

test('собранный manager.js передаёт ссылки в iframe другого origin и загружает локальный MAX', async ({
  page,
  request,
}): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true, vkBusinessUrl: 'https://vk.ru/server-company' },
  })
  await page.route('**/demo/host.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      const script = document.createElement('script');
      script.src = 'http://127.0.0.1:4312/manager.js';
      script.onload = () => SepManager.mount({
        siteId: 'amotiv-demo', serviceUrl: 'http://127.0.0.1:4311',
        widgetUrl: 'http://127.0.0.1:4312/widget.html',
        maxUrl: 'https://max.ru/company_bot', telegramUrl: 'https://t.me/company_bot',
        vkUrl: 'https://vk.ru/npoamotiv', accentColor: '#c2410c'
      });
      document.body.append(script);`,
    }),
  )
  await page.goto('/')
  const widget = page.frameLocator('iframe[data-sep-manager]')
  await expect(widget.getByRole('button', { name: 'Открыть чат' })).toHaveCSS(
    'background-color',
    'rgb(194, 65, 12)',
  )
  expect(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--action-primary-bg'),
    ),
  ).toBe('')
  await widget.getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(widget.locator('.contact-menu a')).toHaveCount(3)
  await expect(
    widget.getByRole('link', { name: 'ВКонтакте', exact: true }),
  ).toHaveAttribute('href', 'https://vk.ru/npoamotiv')
  await expect(
    widget.getByRole('link', { name: 'Telegram', exact: true }),
  ).toHaveAttribute('href', 'https://t.me/company_bot')
  await expect(
    widget.getByRole('link', { name: 'MAX', exact: true }),
  ).toHaveAttribute('href', 'https://max.ru/company_bot')
  const image = widget.locator('.messenger-max-icon')
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement &&
          element.complete &&
          element.naturalWidth > 0,
      ),
    )
    .toBe(true)
  const source = await image.getAttribute('src')

  if (!source) throw new Error('Иконка MAX не получила адрес ресурса')

  const asset = new URL(source, 'http://127.0.0.1:4312/widget.html')
  expect(asset.origin).toBe('http://127.0.0.1:4312')
  expect(asset.pathname).toMatch(/^\/assets\/max-icon-.*\.svg$/)
  await page.screenshot({
    path: 'test-results/widget-messenger-links-production.png',
  })
})
