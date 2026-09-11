// Local UI fixture only. Never deploy this server or use it as manager-server.
import type { ServerWebSocket } from 'bun'
import {
  contactsValid,
  type WidgetConfig,
  type Message,
  type Attachment,
  type SendRequest,
} from '../src/protocol'

const config: WidgetConfig = {
  company: { name: 'НПО Амотив' },
  welcomeMessages: [
    'Здравствуйте!',
    'Мне нужна помощь',
    'Вы можете мне помочь?',
  ],
  socialLinks: [
    { label: 'Написать ВКонтакте', url: 'https://vk.com/', icon: 'vk' },
  ],
  schedule: {
    timezone: 'Europe/Moscow',
    start: '08:00',
    end: '18:00',
    days: [1, 2, 3, 4, 5],
  },
  contactPolicy: 'all',
  limits: { fileBytes: 10 * 1024 * 1024, fileCount: 5, messageChars: 10000 },
}
type Guest = {
  token: string
  inquiryId: string | null
  messages: Message[]
  files: Map<string, { file: File; attachment: Attachment }>
  uploads: Map<string, Attachment>
  operations: Map<string, Message>
}
type SocketData = { token?: string }
let available = true,
  online = true,
  social = true,
  autoReply = true,
  failNext = false,
  loseAck = false
const sessions = new Map<string, Guest>(),
  sockets = new Set<ServerWebSocket<SocketData>>()
const now = () =>
  online ? '2026-09-10T07:00:00.000Z' : '2026-09-10T18:00:00.000Z'
function broadcast(guest: Guest, message: Message) {
  for (const ws of sockets)
    if (ws.data.token === guest.token)
      ws.send(JSON.stringify({ type: 'message', message }))
}
function markRead(guest: Guest) {
  for (const message of guest.messages) {
    if (message.direction !== 'outgoing' || message.readAt) continue
    message.readAt = now()
    broadcast(guest, message)
  }
}
function managerReply(
  guest: Guest,
  text = 'Спасибо за обращение! Помогу с вашим вопросом.',
  attachments: Attachment[] = [],
) {
  if (!guest.inquiryId) return
  markRead(guest)
  const message: Message = {
    id: crypto.randomUUID(),
    inquiryId: guest.inquiryId,
    direction: 'incoming',
    author: 'Петрова И.И.',
    avatarUrl: 'http://127.0.0.1:4311/__demo/operator-avatar.png',
    html: `<p>${text}</p>`,
    attachments,
    createdAt: now(),
  }
  guest.messages.push(message)
  broadcast(guest, message)
}
const server = Bun.serve<SocketData>({
  hostname: '127.0.0.1',
  port: 4311,
  maxRequestBodySize: 11 * 1024 * 1024,
  async fetch(req, server) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin')
    const allowed = ['http://127.0.0.1:4310', 'http://127.0.0.1:4312']
    if (origin && !allowed.includes(origin))
      return new Response('Forbidden', { status: 403 })
    const headers = {
      'Access-Control-Allow-Origin': origin || allowed[0],
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Content-Type',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    }
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers })
    if (req.method === 'OPTIONS')
      return new Response(null, { status: 204, headers })
    if (url.pathname === '/__demo/operator-avatar.png' && req.method === 'GET')
      return new Response(
        Bun.file(new URL('./assets/operator-avatar.png', import.meta.url)),
        {
          headers: { ...headers, 'Content-Type': 'image/png' },
        },
      )
    if (url.pathname === '/__demo/state') {
      if (req.method === 'POST') {
        const body = (await req.json()) as Record<string, unknown>
        if (body.reset) {
          sessions.clear()
          available = true
          online = true
          social = true
          autoReply = true
          failNext = false
          loseAck = false
        }
        if (typeof body.available === 'boolean') available = body.available
        if (typeof body.online === 'boolean') online = body.online
        if (typeof body.social === 'boolean') social = body.social
        if (typeof body.autoReply === 'boolean') autoReply = body.autoReply
        if (typeof body.failNext === 'boolean') failNext = body.failNext
        if (typeof body.loseAck === 'boolean') loseAck = body.loseAck
        if (typeof body.reply === 'string')
          for (const guest of sessions.values()) managerReply(guest, body.reply)
        if (body.readMessages)
          for (const guest of sessions.values()) markRead(guest)
        if (body.sendFile)
          for (const guest of sessions.values()) {
            const file = new File(
              ['Демонстрационный ответ менеджера.'],
              'Ответ менеджера.txt',
              { type: 'text/plain' },
            )
            const attachment = {
              id: crypto.randomUUID(),
              name: file.name,
              mime: file.type,
              size: file.size,
            }
            guest.files.set(attachment.id, { file, attachment })
            managerReply(guest, 'Прикрепляю файл к ответу.', [attachment])
          }
        if (!body.reply && !body.sendFile && !body.readMessages)
          for (const ws of sockets) ws.close()
      }
      return json({
        available,
        online,
        social,
        sessions: sessions.size,
        messages: [...sessions.values()].reduce(
          (n, s) =>
            n + s.messages.filter((m) => m.direction === 'outgoing').length,
          0,
        ),
      })
    }
    if (!available) return json({ error: 'unavailable' }, 503)
    if (url.pathname === '/v1/widget/events') {
      if (server.upgrade(req, { data: {} })) return undefined
      return json({}, 400)
    }
    let guest = sessions.get(
      (req.headers.get('authorization') || '').replace(/^Bearer /, ''),
    )
    if (url.pathname === '/v1/widget/session' && req.method === 'POST') {
      const body = (await req.json()) as { siteId: string }
      if (body.siteId !== 'amotiv-demo') return json({}, 404)
      if (!guest) {
        guest = {
          token: crypto.randomUUID(),
          inquiryId: null,
          messages: [],
          files: new Map(),
          uploads: new Map(),
          operations: new Map(),
        }
        sessions.set(guest.token, guest)
      }
      return json({
        token: guest.token,
        config: { ...config, socialLinks: social ? config.socialLinks : [] },
        inquiryId: guest.inquiryId,
        messages: guest.messages,
        serverTime: now(),
      })
    }
    if (!guest) return json({}, 401)
    if (url.pathname === '/v1/widget/attachments' && req.method === 'POST') {
      const form = await req.formData(),
        file = form.get('file'),
        operationId = String(form.get('operationId'))
      if (!(file instanceof File)) return json({}, 400)
      if (file.size > config.limits.fileBytes) return json({}, 413)
      const prior = guest.uploads.get(operationId)
      if (prior) return json(prior)
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mime: file.type,
      }
      guest.files.set(attachment.id, { file, attachment })
      guest.uploads.set(operationId, attachment)
      return json(attachment)
    }
    if (
      url.pathname.startsWith('/v1/widget/attachments/') &&
      req.method === 'GET'
    ) {
      const stored = guest.files.get(
        decodeURIComponent(url.pathname.split('/').at(-1)!),
      )
      return stored
        ? new Response(stored.file, {
            headers: {
              ...headers,
              'Content-Type': 'application/octet-stream',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        : json({}, 404)
    }
    const isFirst = url.pathname === '/v1/widget/inquiries'
    const isNext =
      url.pathname === `/v1/widget/inquiries/${guest.inquiryId}/messages`
    if (req.method === 'POST' && (isFirst || isNext)) {
      const body = (await req.json()) as SendRequest
      if (
        !body.operationId ||
        !Array.isArray(body.attachmentIds) ||
        body.attachmentIds.some((id) => !guest!.files.has(id))
      )
        return json({}, 400)
      const prior = guest.operations.get(body.operationId)
      if (prior) return json({ inquiryId: guest.inquiryId, message: prior })
      if (
        isFirst &&
        (!body.contacts || !contactsValid(body.contacts, config.contactPolicy))
      )
        return json({}, 422)
      if (failNext) {
        failNext = false
        return json({}, 422)
      }
      if (!guest.inquiryId) guest.inquiryId = crypto.randomUUID()
      const message: Message = {
        id: crypto.randomUUID(),
        inquiryId: guest.inquiryId,
        author: body.contacts?.name || 'Вы',
        direction: 'outgoing',
        html: body.html,
        attachments: body.attachmentIds.map(
          (id) => guest!.files.get(id)!.attachment,
        ),
        createdAt: now(),
        operationId: body.operationId,
      }
      guest.messages.push(message)
      guest.operations.set(body.operationId, message)
      broadcast(guest, message)
      const current = guest
      if (autoReply) setTimeout(() => managerReply(current), 700)
      if (loseAck) {
        loseAck = false
        return json({}, 503)
      }
      return json({ inquiryId: guest.inquiryId, message })
    }
    return json({}, 404)
  },
  websocket: {
    open(ws) {
      sockets.add(ws)
      setTimeout(() => {
        if (!ws.data.token) ws.close()
      }, 5000)
    },
    message(ws, raw) {
      try {
        const data = JSON.parse(String(raw))
        if (data.type === 'authenticate' && sessions.has(data.token)) {
          ws.data.token = data.token
          const guest = sessions.get(data.token)!
          ws.send(
            JSON.stringify({
              type: 'ready',
              inquiryId: guest.inquiryId,
              messages: guest.messages,
            }),
          )
        } else if (data.type === 'ping' && ws.data.token)
          ws.send(JSON.stringify({ type: 'pong', serverTime: now() }))
        else ws.close()
      } catch {
        ws.close()
      }
    },
    close(ws) {
      sockets.delete(ws)
    },
  },
})
console.info(
  `Демонстрационный сервис: http://${server.hostname}:${server.port}`,
)
