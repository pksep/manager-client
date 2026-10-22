import { expect, test, type Page } from '@playwright/test'

const widget = (page: Page): ReturnType<Page['frameLocator']> =>
  page.frameLocator('iframe[data-sep-manager]')

async function settled(page: Page): Promise<void> {
  await expect(widget(page).getByRole('dialog')).toBeVisible()
  await expect
    .poll(() =>
      page.locator('iframe[data-sep-manager]').evaluate((frame) => ({
        opacity: getComputedStyle(frame).opacity,
        playing: frame
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
        width: frame.clientWidth,
      })),
    )
    .toEqual({
      opacity: '1',
      playing: 0,
      width: Math.min(418, (page.viewportSize()?.width || 1440) - 48),
    })
}

async function open(page: Page): Promise<void> {
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  await settled(page)
}

async function auditFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.parent !== window) return

    let samples = 0
    let partialFrames = 0
    let animatedFrames = 0

    const sample = (): void => {
      const frame = document.querySelector<HTMLIFrameElement>(
        'iframe[data-sep-manager]',
      )
      const panel =
        frame?.contentDocument?.querySelector<HTMLElement>('.chat-window')

      if (
        frame &&
        panel &&
        Number(getComputedStyle(frame).opacity) > 0.001 &&
        Number(frame.contentWindow?.getComputedStyle(panel).opacity) > 0.001 &&
        !panel.classList.contains('chat-window--collapsed')
      ) {
        samples++
        if (
          frame
            .getAnimations()
            .some((animation) => animation.playState === 'running')
        )
          animatedFrames++
        const header = panel.querySelector<HTMLElement>('.chat-header')
        const composer = panel.querySelector<HTMLElement>('.composer')

        if (
          panel.offsetWidth !== frame.clientWidth ||
          panel.offsetHeight !== frame.clientHeight ||
          header?.offsetHeight !== 76 ||
          composer?.offsetHeight !== 120 ||
          frame.clientHeight <= 60
        )
          partialFrames++
      }

      document.documentElement.dataset.motionSamples = String(samples)
      document.documentElement.dataset.motionPartial = String(partialFrames)
      document.documentElement.dataset.motionAnimated = String(animatedFrames)
      requestAnimationFrame(sample)
    }

    requestAnimationFrame(sample)
  })
}

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`единая карточка без частичных кадров: ${viewport.width}px`, async ({
    page,
  }): Promise<void> => {
    await page.setViewportSize(viewport)
    await auditFrames(page)
    await page.goto('/')
    await open(page)
    await widget(page).locator('.composer .tiptap').fill('Черновик остаётся')
    await page.screenshot({
      path: `test-results/widget-motion-${viewport.width}.png`,
    })
    await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
    await expect(
      widget(page).getByRole('button', { name: 'Открыть чат' }),
    ).toBeVisible()
    await expect
      .poll(() =>
        page
          .locator('iframe[data-sep-manager]')
          .evaluate((frame) => frame.clientWidth),
      )
      .toBe(60)
    await open(page)
    await expect(widget(page).locator('.composer .tiptap')).toHaveText(
      'Черновик остаётся',
    )
    await expect(page.locator('html')).toHaveAttribute(
      'data-motion-partial',
      '0',
    )
    expect(
      Number(await page.locator('html').getAttribute('data-motion-samples')),
    ).toBeGreaterThan(5)
    expect(
      Number(await page.locator('html').getAttribute('data-motion-animated')),
    ).toBeGreaterThan(3)
  })
}

test('задержка рамки и поддельное подтверждение не показывают куски окна', async ({
  page,
}): Promise<void> => {
  await page.addInitScript(() => {
    if (window.parent !== window) return

    window.addEventListener(
      'message',
      (event): void => {
        if (
          event.data?.type !== 'sep-manager:motion' ||
          event.data.phase !== 'prepare' ||
          event.data.delayed
        )
          return

        event.stopImmediatePropagation()
        // A same-parent acknowledgement for another instance must not reveal content.
        const frame = document.querySelector<HTMLIFrameElement>(
          'iframe[data-sep-manager]',
        )
        const root = document.documentElement
        let preparing = true
        let sampledFrames = 0
        let visibleFrames = 0
        const samplePreparation = (): void => {
          if (!preparing) return

          const panel = frame?.contentDocument?.querySelector('.chat-window')

          if (panel) {
            sampledFrames++
            if (frame?.contentWindow?.getComputedStyle(panel).opacity !== '0')
              visibleFrames++
          }

          root.dataset.prepareSamples = String(sampledFrames)
          root.dataset.prepareVisible = String(visibleFrames)
          requestAnimationFrame(samplePreparation)
        }

        requestAnimationFrame(samplePreparation)
        frame?.contentWindow?.postMessage(
          {
            type: 'sep-manager:motion-complete',
            instance: 'wrong-instance',
            id: event.data.id,
            completed: true,
            width: 60,
            height: 60,
          },
          location.origin,
        )
        setTimeout(() => {
          preparing = false
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { ...event.data, delayed: true },
              origin: event.origin,
              source: event.source,
            }),
          )
        }, 600)
      },
      true,
    )
  })
  await auditFrames(page)
  await page.goto('/')
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  await settled(page)
  expect(
    Number(await page.locator('html').getAttribute('data-prepare-samples')),
  ).toBeGreaterThan(3)
  await expect(page.locator('html')).toHaveAttribute(
    'data-prepare-visible',
    '0',
  )
  await expect(page.locator('html')).toHaveAttribute('data-motion-partial', '0')
})

test('уменьшение движения: без анимации и без зависания прозрачного окна', async ({
  page,
}): Promise<void> => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await open(page)
  expect(
    await page
      .locator('iframe[data-sep-manager]')
      .evaluate((frame) => frame.getAnimations().length),
  ).toBe(0)
  await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
})

test('быстрое закрытие во время подготовки не исполняет устаревшее раскрытие', async ({
  page,
}): Promise<void> => {
  await page.addInitScript(() => {
    if (window.parent !== window) return

    window.addEventListener(
      'message',
      (event): void => {
        if (
          event.data?.type !== 'sep-manager:motion' ||
          event.data.phase !== 'prepare' ||
          event.data.delayed
        )
          return

        event.stopImmediatePropagation()
        setTimeout(
          () =>
            window.dispatchEvent(
              new MessageEvent('message', {
                data: { ...event.data, delayed: true },
                origin: event.origin,
                source: event.source,
              }),
            ),
          600,
        )
      },
      true,
    )
  })
  await page.goto('/')
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  await widget(page).locator('.close-chat').press('Escape')
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await page.waitForTimeout(800)
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await expect(page.locator('iframe[data-sep-manager]')).toHaveCSS(
    'opacity',
    '1',
  )
  await open(page)
})

test('проверка середины движения: одна анимация рамки, без анимаций частей', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  await widget(page).getByRole('button', { name: 'Открыть чат' }).click()
  const iframe = page.locator('iframe[data-sep-manager]')
  await expect
    .poll(() => iframe.evaluate((frame) => frame.getAnimations().length))
    .toBe(1)
  await iframe.evaluate((frame): void => {
    const animation = frame.getAnimations()[0]!
    animation.pause()
    animation.currentTime = 90
  })
  await expect(widget(page).locator('.chat-window')).toHaveCSS(
    'transform',
    'none',
  )
  await expect(widget(page).locator('.chat-window')).toHaveCSS('opacity', '1')
  expect(
    await widget(page)
      .locator('.chat-header')
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0)
  expect(
    await widget(page)
      .locator('.composer')
      .evaluate((element) => element.getAnimations().length),
  ).toBe(0)
  await page.screenshot({ path: 'test-results/widget-motion-opening.png' })
  await iframe.evaluate((frame): void => frame.getAnimations()[0]?.play())
  await settled(page)
})

test('старый загрузчик: открытие и закрытие работают без нового протокола', async ({
  page,
}): Promise<void> => {
  await page.addInitScript(() => {
    if (window.parent === window) return

    window.addEventListener(
      'message',
      (event): void => {
        if (event.data?.type !== 'sep-manager:init' || !event.data.capabilities)
          return

        event.stopImmediatePropagation()
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { ...event.data, capabilities: undefined },
            origin: event.origin,
            source: event.source,
          }),
        )
      },
      true,
    )
  })
  await page.goto('/')
  await open(page)
  await expect(widget(page).locator('.chat-window')).not.toHaveClass(
    /chat-window--host-motion/,
  )
  await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
  await open(page)
})

for (const failure of ['rejected', 'timeout'] as const) {
  test(`ошибка закрытия отключает анимацию хоста для следующего открытия: ${failure}`, async ({
    page,
  }): Promise<void> => {
    await page.addInitScript((failureMode: 'rejected' | 'timeout'): void => {
      if (window.parent !== window) return

      window.addEventListener(
        'message',
        (event: MessageEvent): void => {
          if (event.data?.type !== 'sep-manager:motion') return

          const root = document.documentElement
          root.dataset.motionRequests = String(
            Number(root.dataset.motionRequests || 0) + 1,
          )
          if (event.data.phase !== 'close') return

          event.stopImmediatePropagation()
          if (failureMode === 'timeout') return

          const frame = document.querySelector<HTMLIFrameElement>(
            'iframe[data-sep-manager]',
          )
          frame?.contentWindow?.postMessage(
            {
              type: 'sep-manager:motion-complete',
              instance: event.data.instance,
              id: event.data.id,
              completed: false,
            },
            location.origin,
          )
        },
        true,
      )
    }, failure)
    await page.goto('/')
    await open(page)
    await expect(widget(page).locator('.chat-window')).toHaveClass(
      /chat-window--host-motion/,
    )
    await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
    await expect(
      widget(page).getByRole('button', { name: 'Открыть чат' }),
    ).toBeVisible()
    const requestsAfterFailure = await page
      .locator('html')
      .getAttribute('data-motion-requests')

    await open(page)

    await expect(widget(page).locator('.chat-window')).not.toHaveClass(
      /chat-window--host-motion/,
    )
    await expect(page.locator('html')).toHaveAttribute(
      'data-motion-requests',
      requestsAfterFailure!,
    )
  })
}

test('потерянное подтверждение имеет защитный выход, а не вечное прозрачное окно', async ({
  page,
}): Promise<void> => {
  await page.addInitScript(() => {
    if (window.parent !== window) return

    window.addEventListener(
      'message',
      (event): void => {
        if (event.data?.type === 'sep-manager:motion')
          event.stopImmediatePropagation()
      },
      true,
    )
  })
  await page.goto('/')
  await open(page)
  await expect(widget(page).locator('.chat-window')).not.toHaveClass(
    /chat-window--host-motion/,
  )
  await widget(page).getByRole('button', { name: 'Закрыть чат' }).click()
  await expect(
    widget(page).getByRole('button', { name: 'Открыть чат' }),
  ).toBeVisible()
})
