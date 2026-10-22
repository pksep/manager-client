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
    const link = widget.getByRole('link', {
      name: /^Мессенджер для бизнеса\s+SEP:Chat$/,
    })

    await expect(widget.getByRole('dialog')).toBeVisible()
    await expect(branding).toContainText('Мессенджер для бизнеса')
    await expect(link).toHaveAttribute('href', 'https://pksep.ru/chat/')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(link).toHaveCSS('font-size', '12px')
    await expect(link.locator('.widget-branding-product span')).toHaveCSS(
      'font-size',
      '12px',
    )
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
        const linkBounds = bounds
        const panelBounds = panel.getBoundingClientRect()
        const logoBounds = element.querySelector('img')!.getBoundingClientRect()
        const labelBounds = element
          .querySelector('.widget-branding-product span')!
          .getBoundingClientRect()
        const descriptionBounds = element
          .querySelector(':scope > span')!
          .getBoundingClientRect()

        return {
          belowHeader: bounds.top >= header.getBoundingClientRect().bottom,
          rightInset: Math.round(panelBounds.right - labelBounds.right),
          fullWidth:
            Math.abs(linkBounds.left - panelBounds.left) < 0.1 &&
            Math.abs(linkBounds.right - panelBounds.right) < 0.1,
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
      fullWidth: true,
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
    const activateLink = async (
      activate: () => Promise<void>,
    ): Promise<void> => {
      const popupReady = page.waitForEvent('popup')

      await activate()
      const popup = await popupReady

      await expect(popup).toHaveURL('https://pksep.ru/chat/')
      await popup.close()
      await expect(widget.getByRole('dialog')).toBeVisible()
    }

    for (const target of [
      link.getByText('Мессенджер для бизнеса', { exact: true }),
      link.locator('img'),
      link.getByText('SEP:Chat', { exact: true }),
    ]) {
      await activateLink(() => target.click())
    }

    // Свободная область слева тоже входит в ссылку, не только её текст и знак.
    await activateLink(() => link.click({ position: { x: 4, y: 16 } }))
    await activateLink(() => link.press('Enter'))
  })
}
