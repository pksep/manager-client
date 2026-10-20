import { expect, test } from '@playwright/test'

test('готовая сборка передаёт CSS и ВК из сайта в iframe другого origin', async ({
  page,
  request,
}): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
  const options = {
    siteId: 'amotiv-demo',
    serviceUrl: 'http://127.0.0.1:4311',
    widgetUrl: 'http://127.0.0.1:4312/widget.html',
    autoOpenDelayMs: 0,
    showVk: true,
    vkUrl: 'https://vk.ru/im/convo/-203143723?entrypoint=list_all',
    customCss: '.chat-header { background: #e8f4ef; }',
  }
  await page.route('**/demo/host.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `const script = document.createElement('script'); script.src='http://127.0.0.1:4312/manager.js'; script.onload=()=>window.SepManager.mount(${JSON.stringify(options)}); document.head.append(script);`,
    }),
  )
  await page.goto('/')
  const frame = page.frameLocator('iframe[data-sep-manager]')
  await expect(frame.getByRole('dialog')).toBeVisible()
  await expect(frame.locator('.chat-header')).toHaveCSS(
    'background-color',
    'rgb(232, 244, 239)',
  )
  await frame.getByRole('button', { name: 'Закрыть чат' }).click()
  await frame.getByRole('button', { name: 'Открыть чат' }).hover()
  await expect(frame.getByRole('link', { name: 'ВКонтакте' })).toHaveAttribute(
    'href',
    options.vkUrl,
  )
  await expect(page.locator('style[data-sep-manager-custom-css]')).toHaveCount(
    0,
  )
})
