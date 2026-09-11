export interface EmbedOptions {
  siteId: string
  serviceUrl: string
  widgetUrl: string
  offset?: number
  source?: { pageUrl: string; title: string; referrerOrigin: string }
}

export type FrameMode = 'hidden' | 'launcher' | 'menu' | 'panel'
export interface PanelMove {
  phase: 'start' | 'move' | 'end' | 'nudge'
  x: number
  y: number
}
export interface Contacts {
  name: string
  phone: string
  email: string
}
export interface WidgetConfig {
  company: { name: string; avatarUrl?: string }
  welcomeMessages: string[]
  socialLinks: {
    label: string
    url: string
    icon: 'vk' | 'telegram' | 'chat'
  }[]
  schedule: { timezone: string; start: string; end: string; days: number[] }
  contactPolicy: 'all' | 'name-and-one'
  limits: { fileBytes: number; fileCount: number; messageChars: number }
}
export interface Attachment {
  id: string
  name: string
  size: number
  mime: string
}
export interface Message {
  id: string
  inquiryId: string
  direction: 'incoming' | 'outgoing'
  author: string
  avatarUrl?: string
  html: string
  attachments: Attachment[]
  createdAt: string
  readAt?: string
  operationId?: string
}
export interface Session {
  token: string
  config: WidgetConfig
  serverTime: string
  inquiryId: string | null
  messages: Message[]
}
export interface SendResult {
  inquiryId: string
  message: Message
}
export interface SendRequest {
  operationId: string
  html: string
  attachmentIds: string[]
  contacts?: Contacts
}

export function publicUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Некорректный адрес')
  const url = new URL(value)
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  ) {
    throw new Error('Ожидается HTTPS-адрес')
  }
  return url.href
}

export function parseConfig(value: unknown): WidgetConfig {
  const c = value as WidgetConfig
  if (
    !c ||
    typeof c.company?.name !== 'string' ||
    !c.company.name.trim() ||
    c.company.name.length > 100 ||
    !Array.isArray(c.welcomeMessages) ||
    c.welcomeMessages.length > 10 ||
    !c.welcomeMessages.every(
      (v) => typeof v === 'string' && v.length <= 2000,
    ) ||
    !Array.isArray(c.socialLinks) ||
    c.socialLinks.length > 6 ||
    !c.socialLinks.every(
      (v) =>
        typeof v.label === 'string' &&
        v.label.length <= 80 &&
        ['vk', 'telegram', 'chat'].includes(v.icon),
    ) ||
    !['all', 'name-and-one'].includes(c.contactPolicy) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.schedule?.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(c.schedule?.end) ||
    !Array.isArray(c.schedule.days) ||
    !c.schedule.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    ![c.limits?.fileBytes, c.limits?.fileCount, c.limits?.messageChars].every(
      (v) => Number.isSafeInteger(v) && v > 0,
    ) ||
    c.limits.fileCount > 20 ||
    c.limits.fileBytes > 100 * 1024 * 1024 ||
    c.limits.messageChars > 100000
  ) {
    throw new Error('Некорректная конфигурация виджета')
  }
  new Intl.DateTimeFormat('ru', { timeZone: c.schedule.timezone }).format()
  if (c.company.avatarUrl) publicUrl(c.company.avatarUrl)
  c.socialLinks.forEach((v) => publicUrl(v.url))
  return c
}

export function contactErrors(
  c: Contacts,
  policy: WidgetConfig['contactPolicy'],
) {
  const errors: string[] = []
  const phone = c.phone.replace(/\D/g, '')
  const validPhone =
    /^[+\d\s().-]+$/.test(c.phone) && phone.length >= 10 && phone.length <= 15
  const validEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) && c.email.length <= 254
  if (!c.name.trim()) errors.push('Введите имя.')
  else if (c.name.trim().length < 2 || c.name.trim().length > 100)
    errors.push('Имя должно содержать от 2 до 100 символов.')
  if (policy === 'all' || c.phone) {
    if (!c.phone) errors.push('Введите номер телефона.')
    else if (!validPhone)
      errors.push('Проверьте номер телефона: нужно от 10 до 15 цифр.')
  }
  if (policy === 'all' || c.email) {
    if (!c.email) errors.push('Введите email.')
    else if (!validEmail)
      errors.push('Проверьте email, например name@example.com.')
  }
  if (policy === 'name-and-one' && !c.phone && !c.email)
    errors.push('Укажите телефон или email для ответа.')
  return errors
}

export function contactsValid(
  c: Contacts,
  policy: WidgetConfig['contactPolicy'],
) {
  return contactErrors(c, policy).length === 0
}

export function operatorOnline(schedule: WidgetConfig['schedule'], date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) => parts.find((p) => p.type === type)?.value || ''
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    part('weekday'),
  )
  const minutes = Number(part('hour')) * 60 + Number(part('minute'))
  const toMinutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const start = toMinutes(schedule.start),
    end = toMinutes(schedule.end)
  if (end <= start)
    return (
      (minutes >= start && schedule.days.includes(day)) ||
      (minutes < end && schedule.days.includes((day + 6) % 7))
    )
  return schedule.days.includes(day) && minutes >= start && minutes < end
}

export function parseMessage(value: unknown): Message {
  const m = value as Message
  if (
    !m ||
    typeof m.id !== 'string' ||
    typeof m.inquiryId !== 'string' ||
    !['incoming', 'outgoing'].includes(m.direction) ||
    typeof m.author !== 'string' ||
    typeof m.html !== 'string' ||
    m.html.length > 200000 ||
    !Number.isFinite(Date.parse(m.createdAt)) ||
    (m.readAt !== undefined &&
      (typeof m.readAt !== 'string' ||
        !Number.isFinite(Date.parse(m.readAt)))) ||
    !Array.isArray(m.attachments) ||
    m.attachments.length > 20 ||
    !m.attachments.every(
      (a) =>
        typeof a.id === 'string' &&
        typeof a.name === 'string' &&
        Number.isSafeInteger(a.size) &&
        a.size >= 0 &&
        typeof a.mime === 'string',
    )
  ) {
    throw new Error('Некорректное сообщение сервиса')
  }
  if (m.avatarUrl !== undefined) publicUrl(m.avatarUrl)
  return m
}
