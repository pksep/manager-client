import {
  parseConfig,
  parseMessage,
  publicUrl,
  type EmbedOptions,
  type Session,
  type SendRequest,
  type SendResult,
  type Attachment,
} from './protocol'

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly unavailable = false,
  ) {
    super(message)
  }
}

export class WidgetApi {
  token = ''
  readonly base: string
  private requests = new Set<AbortController>()
  constructor(readonly options: EmbedOptions) {
    this.base = publicUrl(options.serviceUrl).replace(/\/$/, '')
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    timeout = 8000,
  ): Promise<T> {
    const controller = new AbortController()
    this.requests.add(controller)
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const headers = new Headers(init.headers)
      if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
      const response = await fetch(`${this.base}/v1/widget${path}`, {
        ...init,
        headers,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new ServiceError(
          response.status >= 500
            ? 'Сервис временно недоступен'
            : response.status === 413
              ? 'Файл превышает допустимый размер'
              : response.status === 429
                ? 'Слишком много запросов. Попробуйте чуть позже.'
                : 'Не удалось выполнить запрос. Проверьте данные и повторите.',
          response.status >= 500 || response.status === 401,
        )
      }
      return (await response.json()) as T
    } catch (error) {
      if (error instanceof ServiceError) throw error
      throw new ServiceError('Нет связи с сервисом', true)
    } finally {
      clearTimeout(timer)
      this.requests.delete(controller)
    }
  }

  async session(): Promise<Session> {
    const session = await this.request<Session>(
      '/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: this.options.siteId,
          source: this.options.source,
        }),
      },
      5000,
    )
    if (
      !session.token ||
      typeof session.token !== 'string' ||
      !Number.isFinite(Date.parse(session.serverTime)) ||
      !(session.inquiryId === null || typeof session.inquiryId === 'string') ||
      !Array.isArray(session.messages)
    )
      throw new ServiceError('Некорректная сессия', true)
    session.config = parseConfig(session.config)
    session.messages = session.messages
      .map(parseMessage)
      .filter((m) => m.inquiryId === session.inquiryId)
    this.token = session.token
    return session
  }

  events() {
    return new WebSocket(`${this.base.replace(/^http/, 'ws')}/v1/widget/events`)
  }

  async send(inquiryId: string | null, data: SendRequest): Promise<SendResult> {
    const result = await this.request<SendResult>(
      inquiryId
        ? `/inquiries/${encodeURIComponent(inquiryId)}/messages`
        : '/inquiries',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    )
    if (typeof result.inquiryId !== 'string')
      throw new ServiceError('Некорректный ответ', true)
    result.message = parseMessage(result.message)
    if (result.message.inquiryId !== result.inquiryId)
      throw new ServiceError('Некорректный ответ', true)
    return result
  }

  async upload(file: File, operationId: string): Promise<Attachment> {
    const body = new FormData()
    body.set('file', file)
    body.set('operationId', operationId)
    const result = await this.request<Attachment>(
      '/attachments',
      { method: 'POST', body },
      60000,
    )
    if (typeof result.id !== 'string')
      throw new ServiceError('Некорректный ответ', true)
    return result
  }

  async download(id: string): Promise<Blob> {
    const response = await fetch(
      `${this.base}/v1/widget/attachments/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
        credentials: 'omit',
        signal: AbortSignal.timeout(30000),
      },
    )
    if (!response.ok)
      throw new ServiceError('Не удалось скачать файл', response.status >= 500)
    return response.blob()
  }

  dispose() {
    this.requests.forEach((c) => c.abort())
    this.requests.clear()
  }
}
