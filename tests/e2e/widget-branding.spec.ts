import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

for (const width of [1440, 320]) {
  test(`подпись SEP:Chat под шапкой и правильное имя приветствия: ${width}px`, async ({
    page,
    context,
  }): Promise<void> => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Пример с приветствием' }).click()
    const widget = page.frameLocator('iframe[data-sep-manager]')
    const branding = widget.locator('.widget-branding')
    const link = widget.getByRole('link', { name: 'SEP:Chat', exact: true })

    await expect(widget.getByRole('dialog')).toBeVisible()
    await expect(branding).toContainText('Messenger для бизнеса')
    await expect(link).toHaveAttribute('href', 'https://pksep.ru/chat/')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(widget.locator('.site-greeting .message-author')).toHaveText(
      'НПО Автомотив',
    )
    await expect
      .poll(() =>
        link
          .locator('img')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(151)
    expect(
      await branding.evaluate((element) => {
        const header = element.previousElementSibling!
        const panel = element.parentElement!
        const bounds = element.getBoundingClientRect()
        const linkBounds = element.querySelector('a')!.getBoundingClientRect()

        return {
          belowHeader: bounds.top >= header.getBoundingClientRect().bottom,
          rightInset: Math.round(
            panel.getBoundingClientRect().right - linkBounds.right,
          ),
          overflow: element.scrollWidth > element.clientWidth,
        }
      }),
    ).toEqual({ belowHeader: true, rightInset: 16, overflow: false })

    await page.locator('iframe[data-sep-manager]').screenshot({
      path: `test-results/widget-branding-${width}.png`,
    })
    await context.route('https://pksep.ru/chat/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<title>SEP:Chat</title>',
      }),
    )
    const popupReady = page.waitForEvent('popup')

    await link.click()
    const popup = await popupReady

    await expect(popup).toHaveURL('https://pksep.ru/chat/')
    await popup.close()
    await expect(widget.getByRole('dialog')).toBeVisible()
  })
}
