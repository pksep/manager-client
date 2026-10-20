import { expect, test, type Page } from '@playwright/test'

const widget = (page: Page): ReturnType<Page['frameLocator']> =>
  page.frameLocator('iframe[data-sep-manager]')

async function mount(
  page: Page,
  options: object,
  production = false,
): Promise<void> {
  await page.route('**/demo/host.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
      import { mount } from '${production ? 'http://127.0.0.1:4312/manager.mjs' : '/src/embed.ts'}';
      const field = document.createElement('input');
      field.id = 'site-field'; field.setAttribute('aria-label', 'Поле сайта'); document.body.append(field); field.focus();
      const handle = mount({siteId:'amotiv-demo', serviceUrl:'http://127.0.0.1:4311', widgetUrl:${production ? "'http://127.0.0.1:4312/widget.html'" : "new URL('/widget.html', location.href).href"}, ...${JSON.stringify(options)}});
      window.addEventListener('pagehide', () => handle.destroy());
    `,
    }),
  )
  await page.goto('/')
}

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

test('настройки сайта показывают первое сообщение, а ответ запускает существующую форму', async ({
  page,
  request,
}): Promise<void> => {
  await mount(page, {
    initialMessage: 'Здравствуйте! Чем можем помочь?',
    autoOpenDelayMs: 0,
  })
  await expect(widget(page).locator('.initial-message-text')).toHaveText(
    'Здравствуйте! Чем можем помочь?',
  )
  await expect(widget(page).locator('.welcome-message')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Поле сайта' })).toBeFocused()
  await page.screenshot({ path: 'test-results/widget-site-greeting.png' })
  await widget(page)
    .locator('.composer .tiptap')
    .fill('Хочу подобрать оборудование')
  await widget(page).locator('.composer .tiptap').press('Enter')
  await expect(widget(page).getByText('Как с вами связаться?')).toBeVisible()
  expect(
    (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
      .messages,
  ).toBe(0)
  await widget(page)
    .getByRole('textbox', { name: 'Как к вам обращаться', exact: true })
    .fill('Посетитель сайта')
  await widget(page)
    .getByRole('textbox', { name: 'Телефон или email', exact: true })
    .fill('+7 999 1234567')
  await widget(page)
    .getByRole('textbox', { name: 'Телефон или email', exact: true })
    .fill('site@example.test')
  await widget(page)
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click()
  await expect(
    widget(page).getByText('Хочу подобрать оборудование', { exact: true }),
  ).toBeVisible()
  await expect(widget(page).locator('.site-greeting')).toHaveCount(0)
  expect(
    (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
      .messages,
  ).toBe(1)
})

test('неверная настройка задержки не создаёт iframe и гостевую сессию', async ({
  page,
  request,
}): Promise<void> => {
  const errors: string[] = []
  page.on('pageerror', (error): void => {
    errors.push(error.message)
  })
  await mount(page, { autoOpenDelayMs: '3000' })
  await expect.poll(() => errors.join(' ')).toContain('Задержка открытия')
  await expect(page.locator('iframe[data-sep-manager]')).toHaveCount(0)
  expect(
    (await (await request.get('http://127.0.0.1:4311/__demo/state')).json())
      .sessionRequests,
  ).toBe(0)
})

test('после ручного открытия и закрытия таймер не раскрывает окно снова', async ({
  page,
}): Promise<void> => {
  await mount(page, { initialMessage: 'Начнём?', autoOpenDelayMs: 7000 })
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await page.waitForTimeout(7500)
  await expect(widget(page).getByRole('dialog')).toBeHidden()
})

test('приветствие безопасно показывает текст и не включает таймер без задержки', async ({
  page,
}): Promise<void> => {
  await mount(page, {
    initialMessage: '<img src=x onerror=alert(1)>\nВторая строка',
  })
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await expect(widget(page).getByRole('dialog')).toBeHidden()
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  await expect(widget(page).locator('.initial-message-text')).toHaveText(
    '<img src=x onerror=alert(1)>\nВторая строка',
  )
  await expect(widget(page).locator('.initial-message-text img')).toHaveCount(0)
})

test('перезагрузка самого iframe не повторяет уже показанное автоматическое открытие', async ({
  page,
}): Promise<void> => {
  await mount(page, {
    initialMessage: 'Один раз за страницу',
    autoOpenDelayMs: 0,
  })
  await expect(widget(page).getByRole('dialog')).toBeVisible()
  await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  const frame = page
    .frames()
    .find((frame) => frame.url().includes('widget.html'))!
  await frame.goto(frame.url())
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await page.waitForTimeout(350)
  await expect(widget(page).getByRole('dialog')).toBeHidden()
})

test('по истечении задержки ждёт сервис и не начинает отсчёт повторно', async ({
  page,
  request,
}): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { available: false },
  })
  await mount(page, { initialMessage: 'Сервис готов', autoOpenDelayMs: 100 })
  await expect(page.locator('iframe[data-sep-manager]')).toBeHidden()
  await page.waitForTimeout(300)
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { available: true },
  })
  await expect(widget(page).getByRole('dialog')).toBeVisible()
  await expect(widget(page).locator('.initial-message-text')).toHaveText(
    'Сервис готов',
  )
})

test('при скрытой вкладке ждёт возвращения и не забирает фокус', async ({
  page,
}): Promise<void> => {
  await page.addInitScript((): void => {
    if (window.parent !== window)
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      })
  })
  await mount(page, {
    initialMessage: 'Приветствие без звука',
    autoOpenDelayMs: 0,
  })
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await expect(widget(page).getByRole('dialog')).toBeHidden()
  await widget(page)
    .locator('html')
    .evaluate((): void => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
  await expect(widget(page).getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Поле сайта' })).toBeFocused()
})
