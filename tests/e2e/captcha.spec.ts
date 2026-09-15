import { test, expect, type Page } from '@playwright/test'

const frame = (page: Page) => page.frameLocator('iframe[data-sep-manager]')

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

for (const outcome of ['success', 'cancel', 'unavailable'] as const) {
  test(`SmartCaptcha ${outcome}: сохраняет первую отправку и контакты`, async ({
    page,
    request,
  }) => {
    const bodies: string[] = []
    await page.route('**/v1/widget/inquiries', async (route) => {
      const current = route.request()
      if (current.method() !== 'POST') return route.continue()
      bodies.push(current.postData() || '')
      if (current.headers()['x-captcha-token'] === 'fixture-captcha-token')
        return route.continue()
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'captcha_required',
          siteKey: 'fixture-client-key',
          challenge: 'fixture-challenge',
        }),
      })
    })
    await page.route(
      'https://smartcaptcha.cloud.yandex.ru/captcha.js*',
      async (route) => {
        if (outcome === 'unavailable') return route.abort()
        await route.fulfill({
          contentType: 'application/javascript',
          body: `
        (() => {
          let callback; const handlers = {};
          window.smartCaptcha = {
            render: (container, options) => { callback = options.callback; return 1; },
            execute: () => setTimeout(() => ${outcome === 'success' ? "callback('fixture-captcha-token')" : "handlers['challenge-hidden']()"}, 10),
            subscribe: (id, event, handler) => { handlers[event] = handler; return () => delete handlers[event]; },
            getResponse: () => '', destroy: () => {}
          };
          window.sepManagerCaptchaReady();
        })();
      `,
        })
      },
    )
    await page.goto('/')
    await frame(page).getByRole('button', { name: 'Открыть чат' }).click()
    await frame(page).locator('.composer .tiptap').fill('Заявка с проверкой')
    await frame(page).locator('.composer .tiptap').press('Enter')
    await frame(page)
      .getByRole('textbox', { name: 'Имя', exact: true })
      .fill('Иван Тестов')
    await frame(page)
      .getByRole('textbox', { name: 'Телефон', exact: true })
      .fill('+79991234567')
    await frame(page)
      .getByRole('textbox', { name: 'E-mail', exact: true })
      .fill('ivan@example.test')
    await frame(page)
      .getByRole('button', { name: 'Отправить сообщение', exact: true })
      .click()
    if (outcome === 'success') {
      await expect(
        frame(page).getByText('Заявка с проверкой', { exact: true }),
      ).toBeVisible()
      expect(bodies).toHaveLength(2)
      expect(bodies[1]).toBe(bodies[0])
    } else {
      await expect(
        frame(page).getByText(
          outcome === 'cancel'
            ? 'Проверка не завершена. Повторите отправку.'
            : 'Проверка временно недоступна. Повторите отправку.',
          { exact: true },
        ),
      ).toBeVisible()
      await expect(
        frame(page).getByRole('textbox', { name: 'Имя', exact: true }),
      ).toHaveValue('Иван Тестов')
      await expect(
        frame(page).getByRole('button', {
          name: 'Отправить сообщение',
          exact: true,
        }),
      ).toBeEnabled()
      expect(bodies).toHaveLength(1)
      expect(
        (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
          .messages,
      ).toBe(0)
    }
    await expect(frame(page).locator('.manager-captcha')).toHaveCount(0)
  })
}
