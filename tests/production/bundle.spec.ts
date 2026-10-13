import { expect, test } from '@playwright/test'

test('production loader and iframe complete an inquiry across two origins', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext

    window.AudioContext = class extends NativeAudioContext {
      createOscillator(): OscillatorNode {
        const oscillator = super.createOscillator()
        const start = oscillator.start.bind(oscillator)

        oscillator.start = (when?: number): void => {
          const root = document.documentElement
          root.dataset.testChimes = String(
            Number(root.dataset.testChimes || 0) + 1,
          )
          start(when)
        }

        return oscillator
      }
    }
  })
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
  await expect
    .poll(() =>
      iframe.evaluate(
        (element) =>
          element
            .getAnimations()
            .filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0)
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
  await expect(page.locator('html')).toHaveAttribute('data-test-chimes', '1')
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

test('classic production loader animates a whole mobile card across two origins', async ({
  page,
  request,
}): Promise<void> => {
  await page.setViewportSize({ width: 390, height: 844 })
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
  await page.route('**/demo/host.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      const loader = document.createElement('script');
      loader.src = 'http://127.0.0.1:4312/manager.js';
      loader.onload = () => window.SepManager.mount({ siteId: 'amotiv-demo', serviceUrl: 'http://127.0.0.1:4311', widgetUrl: 'http://127.0.0.1:4312/widget.html' });
      document.head.append(loader);
    `,
    }),
  )
  await page.goto('/')
  const frame = page.frameLocator('iframe[data-sep-manager]')
  const iframe = page.locator('iframe[data-sep-manager]')

  for (let attempt = 0; attempt < 3; attempt++) {
    await frame.getByRole('button', { name: 'Открыть чат' }).click()
    await expect(frame.getByRole('dialog')).toBeVisible()
    await expect
      .poll(() =>
        iframe.evaluate((element) => ({
          opacity: getComputedStyle(element).opacity,
          width: element.clientWidth,
          height: element.clientHeight,
          moving: element
            .getAnimations()
            .some((animation) => animation.playState === 'running'),
        })),
      )
      .toEqual({ opacity: '1', width: 342, height: 640, moving: false })
    await expect(frame.locator('.chat-window')).toHaveClass(
      /chat-window--host-motion/,
    )
    await frame.getByRole('button', { name: 'Закрыть чат' }).click()
    await expect(
      frame.getByRole('button', { name: 'Открыть чат' }),
    ).toBeVisible()
    await expect
      .poll(() => iframe.evaluate((element) => element.clientWidth))
      .toBe(60)
    await expect(iframe).toHaveCSS('opacity', '1')
  }
})
