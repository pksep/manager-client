import { expect, test, type Page } from '@playwright/test'

const frame = (page: Page): ReturnType<Page['frameLocator']> =>
  page.frameLocator('iframe[data-sep-manager]')

const vkUrl = 'https://vk.ru/im/convo/-203143723?entrypoint=list_all'

async function apply(page: Page, options: object): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Редактируемый конфиг' })
  const current = JSON.parse(await editor.inputValue())
  await editor.fill(JSON.stringify({ ...current, ...options }))
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  await expect(
    frame(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
}

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true, vkBusinessUrl: 'https://vk.ru/npoamotiv' },
  })
})

test('CSS меняет виджет, а пункт ВК открывает заданный чат без дублирования', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  const hostColor = await page
    .locator('body')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.getByRole('button', { name: 'Пример CSS и ВК' }).click()
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  const launcher = frame(page).getByRole('button', { name: 'Открыть чат' })
  await expect(launcher).toHaveCSS('background-color', 'rgb(22, 79, 67)')
  await launcher.hover()
  const link = frame(page).getByRole('link', { name: 'ВКонтакте' })
  await expect(link).toHaveCount(1)
  await expect(link).toHaveAttribute('href', vkUrl)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await page
    .context()
    .route('https://vk.ru/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: 'Тестовый переход ВК' }),
    )
  const popupPromise = page.waitForEvent('popup')
  await link.click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(vkUrl)
  await popup.close()
  await launcher.click()
  await expect(frame(page).locator('.chat-header')).toHaveCSS(
    'background-color',
    'rgb(232, 244, 239)',
  )
  await expect(frame(page).locator('.chat-window')).toHaveCSS(
    'border-top-left-radius',
    '16px',
  )
  await expect(page.locator('body')).toHaveCSS('background-color', hostColor)
  await page.screenshot({
    path: 'test-results/widget-custom-css-vk.png',
    fullPage: true,
  })
})

test('настройки сохраняются после перезагрузки iframe и заменяются без остаточных стилей', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  await apply(page, {
    showVk: false,
    vkUrl,
    customCss: '.launcher { background: #123456; }',
  })
  const launcher = frame(page).getByRole('button', { name: 'Открыть чат' })
  await launcher.hover()
  await expect(
    frame(page).getByRole('link', { name: 'ВКонтакте' }),
  ).toHaveCount(0)
  const child = page
    .frames()
    .find((child) => child.url().includes('widget.html'))!
  await page.mouse.move(0, 0)
  await child.goto(child.url())
  await expect(launcher).toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await apply(page, { showVk: true, vkUrl, customCss: '' })
  await expect(launcher).not.toHaveCSS('background-color', 'rgb(18, 52, 86)')
  await expect(
    frame(page).locator('style[data-sep-manager-custom-css]'),
  ).toHaveCount(0)
  await launcher.hover()
  await expect(
    frame(page).getByRole('link', { name: 'ВКонтакте' }),
  ).toHaveAttribute('href', vkUrl)
  await expect(page.locator('iframe[data-sep-manager]')).toHaveCount(1)
})

test('CSS не интерпретируется как HTML, а неверная ссылка не уничтожает виджет', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  await apply(page, {
    customCss:
      '</style><img id="css-injection" src=x><script>window.cssExecuted=true</script>',
  })
  await expect(frame(page).locator('#css-injection')).toHaveCount(0)
  const editor = page.getByRole('textbox', { name: 'Редактируемый конфиг' })
  const identity = await page
    .locator('iframe[data-sep-manager]')
    .getAttribute('data-sep-manager')
  await editor.fill(
    JSON.stringify({
      ...JSON.parse(await editor.inputValue()),
      vkUrl: 'https://vk.ru.attacker.test',
    }),
  )
  await page
    .getByRole('button', { name: 'Применить конфиг', exact: true })
    .click()
  await expect(page.locator('#config-status')).toContainText('vkUrl')
  await expect(page.locator('iframe[data-sep-manager]')).toHaveAttribute(
    'data-sep-manager',
    identity!,
  )
})
