interface SmartCaptcha {
  render(
    container: HTMLElement,
    options: {
      sitekey: string
      invisible: boolean
      hl: 'ru'
      callback(token: string): void
    },
  ): number
  execute(id: number): void
  destroy(id: number): void
  getResponse(id: number): string
  subscribe(
    id: number,
    event: 'network-error' | 'javascript-error' | 'challenge-hidden',
    callback: () => void,
  ): () => void
}

declare global {
  interface Window {
    smartCaptcha?: SmartCaptcha
    sepManagerCaptchaReady?: () => void
  }
}

let loading: Promise<SmartCaptcha> | undefined

/** Скрипт провайдера загружается только когда сервер запросил проверку. */
function loadCaptcha(): Promise<SmartCaptcha> {
  if (window.smartCaptcha) return Promise.resolve(window.smartCaptcha)
  if (loading) return loading
  loading = new Promise<SmartCaptcha>((resolve, reject) => {
    const script = document.createElement('script')
    const fail = (): void => {
      clearTimeout(timer)
      script.remove()
      delete window.sepManagerCaptchaReady
      loading = undefined
      reject(new Error('Проверка временно недоступна. Повторите отправку.'))
    }
    const timer = setTimeout(fail, 15000)
    window.sepManagerCaptchaReady = (): void => {
      if (!window.smartCaptcha) return fail()
      clearTimeout(timer)
      delete window.sepManagerCaptchaReady
      resolve(window.smartCaptcha)
    }
    script.src =
      'https://smartcaptcha.cloud.yandex.ru/captcha.js?render=onload&onload=sepManagerCaptchaReady'
    script.async = true
    script.onerror = fail
    document.head.append(script)
  })
  return loading
}

/** Одноразовый токен используется только для повторения запросившей его операции. */
export async function solveCaptcha(
  siteKey: string,
  signal: AbortSignal,
): Promise<string> {
  const captcha = await loadCaptcha()
  if (signal.aborted) throw new Error('Отправка отменена')
  return new Promise<string>((resolve, reject) => {
    const container = document.createElement('div')
    container.className = 'manager-captcha'
    document.body.append(container)
    let finished = false
    let widget: number | undefined
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe: Array<() => void> = []
    const cleanup = (): void => {
      clearTimeout(timer)
      clearTimeout(hiddenTimer)
      signal.removeEventListener('abort', cancel)
      unsubscribe.forEach((dispose) => dispose())
      if (widget !== undefined) captcha.destroy(widget)
      container.remove()
    }
    const fail = (): void => {
      if (finished) return
      finished = true
      cleanup()
      reject(new Error('Проверка не завершена. Повторите отправку.'))
    }
    const cancel = (): void => fail()
    const timer = setTimeout(fail, 120000)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      widget = captcha.render(container, {
        sitekey: siteKey,
        invisible: true,
        hl: 'ru',
        callback: (token): void => {
          if (finished || !token) return
          finished = true
          cleanup()
          resolve(token)
        },
      })
      unsubscribe.push(
        captcha.subscribe(widget, 'network-error', fail),
        captcha.subscribe(widget, 'javascript-error', fail),
      )
      unsubscribe.push(
        captcha.subscribe(widget, 'challenge-hidden', () => {
          hiddenTimer = setTimeout(() => {
            if (
              !finished &&
              widget !== undefined &&
              !captcha.getResponse(widget)
            )
              fail()
          }, 250)
        }),
      )
      captcha.execute(widget)
    } catch {
      fail()
    }
  })
}
