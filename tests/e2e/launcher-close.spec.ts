import { expect, test, type Page } from '@playwright/test'

const widget = (page: Page): ReturnType<Page['frameLocator']> =>
  page.frameLocator('iframe[data-sep-manager]')

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

for (const scenario of [
  { name: 'мышь', touch: false, reducedMotion: 'no-preference' as const },
  { name: 'касание', touch: true, reducedMotion: 'no-preference' as const },
  { name: 'без анимации', touch: false, reducedMotion: 'reduce' as const },
]) {
  test.describe(scenario.name, (): void => {
    test.use({
      viewport: { width: scenario.touch ? 390 : 1440, height: 900 },
      hasTouch: scenario.touch,
      isMobile: scenario.touch,
    })

    test('после закрытия нет аватара и обводки, черновик сохраняется', async ({
      page,
    }): Promise<void> => {
      await page.emulateMedia({ reducedMotion: scenario.reducedMotion })
      await page.goto('/')
      expect(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
      ).toBe(scenario.reducedMotion === 'reduce')
      const editor = page.getByRole('textbox', { name: 'Редактируемый конфиг' })

      await editor.fill(
        JSON.stringify({
          ...JSON.parse(await editor.inputValue()),
          accentColor: '#c2410c',
          showMax: false,
          showTelegram: false,
          showVk: false,
          // Дочерний стиль не должен возвращать части закрытой панели.
          customCss:
            '.avatar-yui-kit__fallback, .avatar-yui-kit::after { visibility: visible; }',
        }),
      )
      await page
        .getByRole('button', { name: 'Применить конфиг', exact: true })
        .click()
      const launcher = widget(page).getByRole('button', { name: 'Открыть чат' })
      const close = widget(page).getByRole('button', { name: 'Закрыть чат' })
      const input = widget(page).locator('.composer .tiptap')

      for (let cycle = 0; cycle < 2; cycle++) {
        if (scenario.touch) await launcher.tap()
        else await launcher.click()

        await expect(widget(page).getByRole('dialog')).toBeVisible()
        await expect(widget(page).locator('.company-avatar')).toBeVisible()
        if (cycle === 0) await input.fill('Черновик не теряется при закрытии')
        else await expect(input).toHaveText('Черновик не теряется при закрытии')

        if (scenario.touch) await close.tap()
        else await close.click()

        await expect(launcher).toBeVisible()
        await expect(launcher).not.toBeFocused()
        await expect(launcher).toHaveCSS('outline-style', 'none')
        await expect(launcher).toHaveAttribute('aria-expanded', 'false')
        await expect(widget(page).locator('.chat-window')).toHaveCSS(
          'display',
          'none',
        )
        await expect
          .poll(() =>
            widget(page)
              .locator('.company-avatar')
              .evaluate((element) => element.getBoundingClientRect().width),
          )
          .toBe(0)
        await expect(page.locator('iframe[data-sep-manager]')).toHaveCSS(
          'width',
          '60px',
        )
        await expect(page.locator('iframe[data-sep-manager]')).toHaveCSS(
          'height',
          '60px',
        )
      }

      await page.locator('iframe[data-sep-manager]').screenshot({
        path: `test-results/launcher-closed-${scenario.touch ? 'touch' : scenario.reducedMotion}.png`,
      })
    })
  })
}

for (const key of ['Escape', 'Enter']) {
  test(`закрытие клавишей ${key} возвращает видимый фокус без открытия меню`, async ({
    page,
  }): Promise<void> => {
    await page.goto('/')
    const launcher = widget(page).getByRole('button', { name: 'Открыть чат' })

    await launcher.press('Enter')
    const close = widget(page).getByRole('button', { name: 'Закрыть чат' })

    await expect(close).toBeFocused()
    await close.press(key)
    await expect(launcher).toBeFocused()
    await expect(launcher).toHaveCSS('outline-style', 'solid')
    await expect(launcher).toHaveAttribute('aria-expanded', 'false')
    await expect(widget(page).locator('.chat-window')).toHaveCSS(
      'display',
      'none',
    )
    await launcher.press('Enter')
    await expect(widget(page).getByRole('dialog')).toBeVisible()
  })
}
