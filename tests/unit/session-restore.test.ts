import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { WidgetApi, ServiceError } from '../../src/api'
import {
  guestSessionKey,
  readGuestSession,
  saveGuestSession,
  readGuestSessionState,
  GUEST_SESSION_TTL_MS,
} from '../../src/session-storage'
import type { EmbedOptions, Session } from '../../src/protocol'

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const options: EmbedOptions = {
  siteId: 'test-site',
  serviceUrl: 'https://manager.example.test',
  widgetUrl: 'https://manager.example.test/widget.html',
  source: {
    pageUrl: 'https://site.example.test/catalog',
    title: '',
    referrerOrigin: '',
  },
}
const savedToken = 'a'.repeat(64)
const newToken = 'b'.repeat(64)
const storageKey = guestSessionKey(options.serviceUrl, options)!
const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
)
let storage: MemoryStorage
let restoreFetch: (() => void) | undefined
let restoreClock: (() => void) | undefined

function session(token = newToken): Session {
  return {
    token,
    serverTime: new Date().toISOString(),
    inquiryId: null,
    messages: [],
    config: {
      company: { name: 'Тест' },
      welcomeMessages: [],
      socialLinks: [],
      schedule: {
        timezone: 'Europe/Moscow',
        start: '08:00',
        end: '18:00',
        days: [1],
      },
      contactPolicy: 'all',
      limits: { fileBytes: 10000, fileCount: 5, messageChars: 1000 },
    },
  }
}

beforeEach((): void => {
  storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  })
})

afterEach((): void => {
  restoreFetch?.()
  restoreFetch = undefined
  restoreClock?.()
  restoreClock = undefined

  if (originalStorage)
    Object.defineProperty(globalThis, 'localStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('сохраняется только ключ сессии, не переписка и не контакты', async (): Promise<void> => {
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(session()),
  )
  restoreFetch = (): void => fetchMock.mockRestore()

  await new WidgetApi(options).session()

  expect([...storage.values.keys()]).toEqual([storageKey])
  expect(JSON.parse(storage.getItem(storageKey)!)).toEqual({
    token: newToken,
    expiresAt: expect.any(Number),
  })
  expect(
    new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization'),
  ).toBe(false)
})

test('новый экземпляр отправляет сохранённый ключ и восстанавливает snapshot сервера', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const snapshot = {
    ...session(savedToken),
    inquiryId: 'inquiry-1',
    messages: [
      {
        id: 'message-1',
        inquiryId: 'inquiry-1',
        direction: 'incoming' as const,
        author: 'Оператор',
        html: '<p>Ответ</p>',
        attachments: [],
        createdAt: new Date().toISOString(),
      },
    ],
  }
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(snapshot),
  )
  restoreFetch = (): void => fetchMock.mockRestore()

  expect(await new WidgetApi(options).session()).toEqual(snapshot)
  expect(
    new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization'),
  ).toBe(`Bearer ${savedToken}`)
})

test('переход на другую страницу того же сайта не меняет ключ', (): void => {
  const other = {
    ...options,
    source: {
      ...options.source!,
      pageUrl: 'https://site.example.test/about?x=1',
    },
  }

  expect(guestSessionKey(options.serviceUrl, other)).toBe(storageKey)
})

for (const change of [
  { siteId: 'another-site' },
  { serviceUrl: 'https://other-manager.example.test' },
  {
    source: { ...options.source!, pageUrl: 'https://other-site.example.test' },
  },
]) {
  test(`другое окружение не читает чужую сессию: ${Object.keys(change)[0]}`, (): void => {
    saveGuestSession(storageKey, savedToken)

    expect(new WidgetApi({ ...options, ...change }).token).toBe('')
    expect(readGuestSession(storageKey)).toBe(savedToken)
  })
}

test('401 удаляет отвергнутый ключ и ровно один раз открывает новую сессию', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const fetchMock = spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json(session()))
  restoreFetch = (): void => fetchMock.mockRestore()

  expect((await new WidgetApi(options).session()).token).toBe(newToken)
  expect(fetchMock.mock.calls).toHaveLength(2)
  expect(
    new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization'),
  ).toBe(`Bearer ${savedToken}`)
  expect(
    new Headers(fetchMock.mock.calls[1][1]?.headers).has('Authorization'),
  ).toBe(false)
  expect(readGuestSession(storageKey)).toBe(newToken)
})

test('повторный 401 не создаёт бесконечный цикл открытия сессии', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const fetchMock = spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
  restoreFetch = (): void => fetchMock.mockRestore()

  await expect(new WidgetApi(options).session()).rejects.toMatchObject({
    status: 401,
  })
  expect(fetchMock.mock.calls).toHaveLength(2)
  expect(readGuestSession(storageKey)).toBe('')
})

for (const status of [403, 429, 503]) {
  test(`HTTP ${status} не сбрасывает действующий ключ и не открывает новый диалог`, async (): Promise<void> => {
    saveGuestSession(storageKey, savedToken)
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({}, { status }),
    )
    restoreFetch = (): void => fetchMock.mockRestore()

    await expect(new WidgetApi(options).session()).rejects.toMatchObject({
      status,
    })
    expect(fetchMock.mock.calls).toHaveLength(1)
    expect(readGuestSession(storageKey)).toBe(savedToken)
  })
}

test('потеря сети сохраняет ключ для следующего подключения', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('offline'),
  )
  restoreFetch = (): void => fetchMock.mockRestore()

  await expect(new WidgetApi(options).session()).rejects.toBeInstanceOf(
    ServiceError,
  )
  expect(readGuestSession(storageKey)).toBe(savedToken)
})

test('битый ключ не передаётся серверу и удаляется только из своего раздела', (): void => {
  storage.setItem(storageKey, 'invalid-token')
  storage.setItem('other-storage', 'untouched')

  expect(new WidgetApi(options).token).toBe('')
  expect(storage.getItem(storageKey)).toBeNull()
  expect(storage.getItem('other-storage')).toBe('untouched')
})

test('отказ хранилища не блокирует новую переписку', async (): Promise<void> => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: (): Storage => {
      throw new Error('Storage denied')
    },
  })
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(session()),
  )
  restoreFetch = (): void => fetchMock.mockRestore()

  expect((await new WidgetApi(options).session()).token).toBe(newToken)
})

test('поддержка не читает публичный ключ, не сохраняет свой и не заменяет отказ новой сессией', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const previousValue = storage.getItem(storageKey)!
  const supportOptions = { ...options, supportSessionToken: 'c'.repeat(64) }
  const api = new WidgetApi(supportOptions)
  const fetchMock = spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      Response.json(session(supportOptions.supportSessionToken)),
    )
    .mockResolvedValueOnce(Response.json({}, { status: 401 }))
  restoreFetch = (): void => fetchMock.mockRestore()

  expect(api.token).toBe(supportOptions.supportSessionToken)
  await api.session()
  await expect(api.session()).rejects.toMatchObject({ status: 401 })
  expect(fetchMock.mock.calls).toHaveLength(2)
  expect([...storage.values]).toEqual([[storageKey, previousValue]])
})

test('повторное восстановление не продлевает браузерный срок 24 часа', async (): Promise<void> => {
  const start = Date.now()
  const clock = spyOn(Date, 'now').mockReturnValue(start)
  restoreClock = (): void => clock.mockRestore()
  saveGuestSession(storageKey, savedToken)
  const fetchMock = spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(session(savedToken)))
    .mockResolvedValueOnce(Response.json(session(savedToken)))
  restoreFetch = (): void => fetchMock.mockRestore()
  const api = new WidgetApi(options)
  expect(api.guestExpiresAt).toBe(start + GUEST_SESSION_TTL_MS)

  clock.mockReturnValue(start + GUEST_SESSION_TTL_MS - 1000)
  await api.session()
  await new WidgetApi(options).session()
  expect(readGuestSessionState(storageKey)?.expiresAt).toBe(
    start + GUEST_SESSION_TTL_MS,
  )
  expect(api.guestExpired()).toBe(false)

  clock.mockReturnValue(start + GUEST_SESSION_TTL_MS)
  expect(api.guestExpired()).toBe(true)
  expect(readGuestSession(storageKey)).toBe('')
  expect(storage.getItem(storageKey)).toBeNull()
})

test('через сутки ключ не передаётся при перезагрузке, а чужое хранилище не очищается', async (): Promise<void> => {
  const start = Date.now()
  const clock = spyOn(Date, 'now').mockReturnValue(start)
  restoreClock = (): void => clock.mockRestore()
  saveGuestSession(storageKey, savedToken)
  storage.setItem('other-storage', 'untouched')
  clock.mockReturnValue(start + GUEST_SESSION_TTL_MS)
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(session()),
  )
  restoreFetch = (): void => fetchMock.mockRestore()

  await new WidgetApi(options).session()
  expect(
    new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization'),
  ).toBe(false)
  expect(readGuestSession(storageKey)).toBe(newToken)
  expect(storage.getItem('other-storage')).toBe('untouched')
})

test('старый формат получает срок один раз, повторное чтение не обновляет дату', (): void => {
  const start = Date.now()
  const clock = spyOn(Date, 'now').mockReturnValue(start)
  restoreClock = (): void => clock.mockRestore()
  storage.setItem(storageKey, savedToken)
  expect(readGuestSession(storageKey)).toBe(savedToken)

  clock.mockReturnValue(start + 1000)
  expect(readGuestSessionState(storageKey)).toEqual({
    token: savedToken,
    expiresAt: start + GUEST_SESSION_TTL_MS,
  })
})

test('некорректная и чрезмерно длинная дата не разрешает вечное восстановление', (): void => {
  const now = Date.now()
  for (const expiresAt of [
    undefined,
    'tomorrow',
    null,
    -1,
    now - 1,
    now + GUEST_SESSION_TTL_MS * 2,
    1.5,
  ]) {
    storage.setItem(
      storageKey,
      JSON.stringify({ token: savedToken, expiresAt }),
    )
    expect(readGuestSession(storageKey)).toBe('')
    expect(storage.getItem(storageKey)).toBeNull()
  }
})

test('отказ хранилища не отменяет 24-часовой срок в памяти', async (): Promise<void> => {
  const start = Date.now()
  const clock = spyOn(Date, 'now').mockReturnValue(start)
  restoreClock = (): void => clock.mockRestore()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: (): Storage => {
      throw new Error('Storage denied')
    },
  })
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(session()),
  )
  restoreFetch = (): void => fetchMock.mockRestore()
  const api = new WidgetApi(options)
  await api.session()

  clock.mockReturnValue(start + GUEST_SESSION_TTL_MS)
  expect(api.guestExpired()).toBe(true)
})

test('публичный срок не распространяется на авторизованную поддержку', async (): Promise<void> => {
  const start = Date.now()
  const clock = spyOn(Date, 'now').mockReturnValue(start)
  restoreClock = (): void => clock.mockRestore()
  const supportOptions = { ...options, supportSessionToken: 'c'.repeat(64) }
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(session(supportOptions.supportSessionToken)),
  )
  restoreFetch = (): void => fetchMock.mockRestore()
  const api = new WidgetApi(supportOptions)
  await api.session()

  clock.mockReturnValue(start + GUEST_SESSION_TTL_MS * 2)
  expect(api.guestExpired()).toBe(false)
  expect(api.guestExpiresAt).toBeUndefined()
  api.expireGuestSession()
  expect(api.token).toBe(supportOptions.supportSessionToken)
  expect(storage.length).toBe(0)
})

test('сброс истёкшей вкладки не удаляет новый ключ другой вкладки', (): void => {
  saveGuestSession(storageKey, savedToken)
  const api = new WidgetApi(options)
  saveGuestSession(storageKey, newToken)

  api.expireGuestSession()
  expect(api.token).toBe('')
  expect(readGuestSession(storageKey)).toBe(newToken)
})

test('истёкшая сессия не отправляет сообщения и не скачивает старые файлы', async (): Promise<void> => {
  const start = Date.now()
  const clock = spyOn(Date, 'now').mockReturnValue(start)
  restoreClock = (): void => clock.mockRestore()
  saveGuestSession(storageKey, savedToken)
  const api = new WidgetApi(options)
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({}),
  )
  restoreFetch = (): void => fetchMock.mockRestore()
  clock.mockReturnValue(start + GUEST_SESSION_TTL_MS)

  await expect(
    api.send('old-inquiry', {
      operationId: 'operation',
      html: 'draft',
      attachmentIds: [],
    }),
  ).rejects.toBeInstanceOf(ServiceError)
  await expect(api.download('old-file')).rejects.toBeInstanceOf(ServiceError)
  expect(fetchMock.mock.calls).toHaveLength(0)
})

test('ответ старого подключения после очистки не возвращает старый ключ в хранилище', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  let finishRequest: (response: Response) => void = (): void => {
    throw new Error('Request not started')
  }
  const response = new Promise<Response>((resolve) => {
    finishRequest = resolve
  })
  const fetchMock = spyOn(globalThis, 'fetch').mockReturnValue(response)
  restoreFetch = (): void => fetchMock.mockRestore()
  const api = new WidgetApi(options)
  const pending = api.session()
  api.expireGuestSession()
  finishRequest(Response.json(session(savedToken)))

  await expect(pending).rejects.toBeInstanceOf(ServiceError)
  expect(api.token).toBe('')
  expect(readGuestSession(storageKey)).toBe('')
})

test('очистка отменяет скачивание, а поздний файл не возвращается в новую сессию', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  let finishRequest: (response: Response) => void = (): void => {
    throw new Error('Request not started')
  }
  const response = new Promise<Response>((resolve) => {
    finishRequest = resolve
  })
  const fetchMock = spyOn(globalThis, 'fetch').mockReturnValue(response)
  restoreFetch = (): void => fetchMock.mockRestore()
  const api = new WidgetApi(options)
  const pending = api.download('file')
  expect(fetchMock.mock.calls[0][1]?.cache).toBe('no-store')
  api.expireGuestSession()
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
  finishRequest(new Response('private file'))

  await expect(pending).rejects.toBeInstanceOf(ServiceError)
})

test('настоящая отмена скачивания возвращает ServiceError, а не AbortError', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const cancelledFetch = Object.assign(
    (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          (): void => reject(new DOMException('Request aborted', 'AbortError')),
          { once: true },
        )
      }),
    { preconnect: globalThis.fetch.preconnect },
  )
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
    cancelledFetch,
  )
  restoreFetch = (): void => fetchMock.mockRestore()
  const api = new WidgetApi(options)
  const pending = api.download('file')
  const result = pending.catch((error: unknown): unknown => error)

  api.expireGuestSession()

  const failure = await result

  expect(failure).toBeInstanceOf(ServiceError)
  expect(failure).toMatchObject({
    message: 'Нет связи с сервисом',
    unavailable: true,
  })
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
})

test('сетевая ошибка скачивания преобразуется в ServiceError', async (): Promise<void> => {
  const fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(
    new TypeError('Network disconnected'),
  )
  restoreFetch = (): void => fetchMock.mockRestore()
  const pending = new WidgetApi(options).download('file')

  await expect(pending).rejects.toBeInstanceOf(ServiceError)
  await expect(pending).rejects.toMatchObject({
    message: 'Нет связи с сервисом',
    unavailable: true,
  })
})

test('скачивание сохраняет уже сформированную ServiceError без замены', async (): Promise<void> => {
  const failure = new ServiceError('Не удалось скачать файл', false, 403)
  const fetchMock = spyOn(globalThis, 'fetch').mockRejectedValue(failure)
  restoreFetch = (): void => fetchMock.mockRestore()

  await expect(new WidgetApi(options).download('file')).rejects.toBe(failure)
})

test('ошибка чтения содержимого скачивания тоже преобразуется в ServiceError', async (): Promise<void> => {
  const response = new Response('file')
  const blob = spyOn(response, 'blob').mockRejectedValue(
    new DOMException('Body aborted', 'AbortError'),
  )
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(response)
  restoreFetch = (): void => {
    fetchMock.mockRestore()
    blob.mockRestore()
  }
  const pending = new WidgetApi(options).download('file')

  await expect(pending).rejects.toBeInstanceOf(ServiceError)
  await expect(pending).rejects.toMatchObject({
    message: 'Нет связи с сервисом',
    unavailable: true,
  })
})

test('без допустимого родительского источника сохранение доступа отключено', (): void => {
  expect(
    guestSessionKey(options.serviceUrl, { ...options, source: undefined }),
  ).toBeUndefined()
  expect(
    guestSessionKey(options.serviceUrl, {
      ...options,
      source: { ...options.source!, pageUrl: 'javascript:alert(1)' },
    }),
  ).toBeUndefined()
})

test('повреждённый snapshot не заменяет сохранённый ключ', async (): Promise<void> => {
  saveGuestSession(storageKey, savedToken)
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ ...session(), token: 'invalid-token' }),
  )
  restoreFetch = (): void => fetchMock.mockRestore()

  await expect(new WidgetApi(options).session()).rejects.toBeInstanceOf(
    ServiceError,
  )
  expect(readGuestSession(storageKey)).toBe(savedToken)
})
