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
    await expect(branding).toContainText('Мессенджер для бизнеса')
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
      .toBe(162)
    expect(
      await branding.evaluate((element) => {
        const header = element.previousElementSibling!
        const panel = element.parentElement!
        const bounds = element.getBoundingClientRect()
        const linkBounds = element.querySelector('a')!.getBoundingClientRect()
        const logoBounds = element.querySelector('img')!.getBoundingClientRect()
        const labelBounds = element
          .querySelector('a span')!
          .getBoundingClientRect()
        const descriptionBounds = element
          .querySelector(':scope > span')!
          .getBoundingClientRect()

        return {
          belowHeader: bounds.top >= header.getBoundingClientRect().bottom,
          rightInset: Math.round(
            panel.getBoundingClientRect().right - linkBounds.right,
          ),
          overflow: element.scrollWidth > element.clientWidth,
          logoWidth: logoBounds.width,
          logoHeight: logoBounds.height,
          centered:
            Math.abs(
              logoBounds.top +
                logoBounds.height / 2 -
                (labelBounds.top + labelBounds.height / 2),
            ) < 0.1 &&
            Math.abs(
              logoBounds.top +
                logoBounds.height / 2 -
                (descriptionBounds.top + descriptionBounds.height / 2),
            ) < 0.1,
          betweenTexts:
            descriptionBounds.right <= logoBounds.left &&
            logoBounds.right <= labelBounds.left,
          insideLink:
            logoBounds.left >= linkBounds.left &&
            logoBounds.right <= linkBounds.right,
        }
      }),
    ).toEqual({
      belowHeader: true,
      rightInset: 16,
      overflow: false,
      logoWidth: 20,
      logoHeight: 16,
      centered: true,
      betweenTexts: true,
      insideLink: true,
    })

    const logoUrl = await link
      .locator('img')
      .evaluate((image: HTMLImageElement) => image.currentSrc)
    const logoResponse = await page.request.get(logoUrl)

    expect(logoResponse.ok()).toBe(true)
    expect(
      await page.evaluate(
        (source) => {
          const svg = new DOMParser().parseFromString(
            source,
            'image/svg+xml',
          ).documentElement

          if (!(svg instanceof SVGSVGElement)) return false

          const bounds = svg.viewBox.baseVal
          const filters = [...svg.querySelectorAll('filter')]

          return (
            svg.querySelectorAll('clipPath, [clip-path]').length === 0 &&
            filters.length === 2 &&
            filters.every((filter) => {
              const x = Number(filter.getAttribute('x'))
              const y = Number(filter.getAttribute('y'))
              const width = Number(filter.getAttribute('width'))
              const height = Number(filter.getAttribute('height'))

              return (
                x - bounds.x >= 4 &&
                y - bounds.y >= 4 &&
                bounds.x + bounds.width - (x + width) >= 4 &&
                bounds.y + bounds.height - (y + height) >= 4
              )
            })
          )
        },
        await logoResponse.text(),
      ),
    ).toBe(true)

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
