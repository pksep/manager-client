import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { WidgetApi, ServiceError } from '../../src/api'
import {
  guestSessionKey,
  readGuestSession,
  saveGuestSession,
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

  expect([...storage.values]).toEqual([[storageKey, newToken]])
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
  expect([...storage.values]).toEqual([[storageKey, savedToken]])
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
