import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { WidgetApi, ServiceError } from './api'
import {
  contactErrors,
  operatorOnline,
  parseMessage,
  type EmbedOptions,
  type WidgetConfig,
  type Message,
  type Contacts,
  type Attachment,
} from './protocol'

export function useWidget(options: EmbedOptions) {
  const api = new WidgetApi(options)
  const available = ref(false),
    open = ref(false),
    menu = ref(false)
  const config = ref<WidgetConfig>(),
    inquiryId = ref<string | null>(null)
  const messages = ref<Message[]>([]),
    step = ref<'conversation' | 'contacts'>('conversation')
  const contacts = reactive<Contacts>({ name: '', phone: '', email: '' })
  const draft = ref(''),
    files = ref<File[]>([]),
    error = ref(''),
    sending = ref(false),
    uploadedCount = ref(0)
  const serverNow = ref(new Date())
  let operationId = '',
    operationHtml = '',
    uploaded: Attachment[] = []
  let pendingAcknowledgement: Message | undefined
  let socket: WebSocket | undefined,
    retry: ReturnType<typeof setTimeout> | undefined
  let handshake: ReturnType<typeof setTimeout> | undefined,
    heartbeat: ReturnType<typeof setTimeout> | undefined
  let disposed = false,
    connecting = false,
    attempts = 0,
    generation = 0,
    serverOffset = 0
  const online = computed(() =>
    config.value
      ? operatorOnline(config.value.schedule, serverNow.value)
      : false,
  )
  const submitDisabledReason = computed(() =>
    sending.value
      ? 'Дождитесь завершения отправки.'
      : !config.value
        ? 'Дождитесь подключения сервиса.'
        : contactErrors(contacts, config.value.contactPolicy).join('\n'),
  )
  const canSubmit = computed(() => !submitDisabledReason.value)
  const clock = setInterval(() => {
    serverNow.value = new Date(Date.now() + serverOffset)
  }, 15000)

  function add(message: Message) {
    if (message.inquiryId !== inquiryId.value) {
      // A read update can arrive before the first HTTP acknowledgement.
      if (
        !inquiryId.value &&
        operationId &&
        message.operationId === operationId
      )
        pendingAcknowledgement = {
          ...message,
          readAt: pendingAcknowledgement?.readAt || message.readAt,
        }
      return
    }
    const previousIndex = messages.value.findIndex((m) => m.id === message.id)
    const received = {
      ...message,
      readAt:
        messages.value[previousIndex]?.readAt ||
        (pendingAcknowledgement?.id === message.id
          ? pendingAcknowledgement.readAt
          : undefined) ||
        message.readAt,
    }
    if (previousIndex < 0) messages.value.push(received)
    else messages.value[previousIndex] = received
    messages.value.sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    )
  }

  function disconnect() {
    available.value = false
    open.value = false
    menu.value = false
    generation++
    connecting = false
    clearTimeout(handshake)
    clearTimeout(heartbeat)
    if (socket) {
      socket.onclose = null
      socket.onerror = null
      socket.onmessage = null
      socket.close()
      socket = undefined
    }
    if (!disposed && !retry)
      retry = setTimeout(
        () => {
          retry = undefined
          void connect()
        },
        Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)),
      )
  }

  async function connect() {
    if (disposed || connecting || available.value) return
    connecting = true
    const current = ++generation
    try {
      const session = await api.session()
      if (disposed || generation !== current) return
      config.value = session.config
      serverOffset = Date.parse(session.serverTime) - Date.now()
      serverNow.value = new Date(Date.now() + serverOffset)
      inquiryId.value = session.inquiryId
      messages.value = session.messages
      // A lost HTTP acknowledgement can be recovered from the current session snapshot.
      if (
        operationId &&
        messages.value.some((m) => m.operationId === operationId)
      )
        clearSentDraft()
      socket = api.events()
      const activeSocket = socket
      handshake = setTimeout(disconnect, 5000)
      socket.onopen = () =>
        activeSocket.send(
          JSON.stringify({ type: 'authenticate', token: api.token }),
        )
      socket.onerror = disconnect
      socket.onclose = disconnect
      socket.onmessage = (event) => {
        if (generation !== current || disposed) return
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'ready') {
            if (
              !Array.isArray(data.messages) ||
              !(data.inquiryId === null || typeof data.inquiryId === 'string')
            )
              throw new Error('Некорректная готовность сервиса')
            inquiryId.value = data.inquiryId
            messages.value = data.messages
              .map(parseMessage)
              .filter(
                (message: Message) => message.inquiryId === inquiryId.value,
              )
            if (
              operationId &&
              messages.value.some(
                (message) => message.operationId === operationId,
              )
            )
              clearSentDraft()
            clearTimeout(handshake)
            clearTimeout(retry)
            retry = undefined
            available.value = true
            connecting = false
            attempts = 0
            schedulePing()
          } else if (data.type === 'pong' && available.value) {
            clearTimeout(handshake)
            if (
              typeof data.serverTime === 'string' &&
              Number.isFinite(Date.parse(data.serverTime))
            ) {
              serverOffset = Date.parse(data.serverTime) - Date.now()
              serverNow.value = new Date(Date.now() + serverOffset)
            }
            schedulePing()
          } else if (data.type === 'message' && available.value)
            add(parseMessage(data.message))
        } catch {
          disconnect()
        }
      }
    } catch {
      if (generation === current) disconnect()
    }
  }

  function schedulePing() {
    clearTimeout(heartbeat)
    heartbeat = setTimeout(() => {
      if (socket?.readyState !== WebSocket.OPEN) return disconnect()
      socket.send(JSON.stringify({ type: 'ping' }))
      handshake = setTimeout(disconnect, 5000)
    }, 10000)
  }

  function clearSentDraft() {
    pendingAcknowledgement = undefined
    draft.value = ''
    files.value = []
    uploaded = []
    operationId = ''
    operationHtml = ''
    error.value = ''
    uploadedCount.value = 0
    step.value = 'conversation'
  }

  function prepare(payload: {
    content?: string
    files?: FileList
    mediaFiles?: FileList
  }) {
    if (sending.value || !config.value || !available.value) return
    const selected = [
      ...Array.from(payload.files || []),
      ...Array.from(payload.mediaFiles || []),
    ]
    if (
      selected.length > config.value.limits.fileCount ||
      selected.some((f) => f.size > config.value!.limits.fileBytes)
    ) {
      error.value = `Допустимо до ${config.value.limits.fileCount} файлов, каждый до ${Math.round(config.value.limits.fileBytes / 1024 / 1024)} МБ.`
      return
    }
    const html = payload.content || ''
    const text =
      new DOMParser()
        .parseFromString(html, 'text/html')
        .body.textContent?.trim() || ''
    if (!text && !selected.length) return
    if (text.length > config.value.limits.messageChars) {
      error.value = `Сообщение — до ${config.value.limits.messageChars} символов.`
      return
    }
    // Preserve an unresolved operation until retry succeeds. Editing explicitly abandons it.
    if (html !== operationHtml || selected.length) {
      operationId = ''
      uploaded = []
    }
    draft.value = html
    if (selected.length) files.value = selected
    error.value = ''
    if (!inquiryId.value) step.value = 'contacts'
    else void send()
  }

  async function send() {
    if (
      sending.value ||
      !available.value ||
      (!inquiryId.value && !canSubmit.value)
    )
      return
    if (!operationId) operationId = crypto.randomUUID()
    operationHtml = draft.value
    sending.value = true
    error.value = ''
    const currentOperation = operationId
    try {
      for (let i = uploaded.length; i < files.value.length; i++) {
        uploaded.push(
          await api.upload(files.value[i], `${currentOperation}:${i}`),
        )
        uploadedCount.value = uploaded.length
      }
      const result = await api.send(inquiryId.value, {
        operationId: currentOperation,
        html: draft.value,
        attachmentIds: uploaded.map((a) => a.id),
        ...(!inquiryId.value
          ? {
              contacts: {
                name: contacts.name.trim(),
                phone: contacts.phone.trim(),
                email: contacts.email.trim(),
              },
            }
          : {}),
      })
      if (disposed) return
      inquiryId.value = result.inquiryId
      add(result.message)
      clearSentDraft()
    } catch (cause) {
      error.value =
        cause instanceof Error
          ? cause.message
          : 'Не удалось отправить сообщение'
      if (cause instanceof ServiceError && cause.unavailable) disconnect()
    } finally {
      sending.value = false
    }
  }

  async function download(file: Attachment) {
    try {
      const blob = await api.download(file.id)
      if (disposed) return
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      error.value = 'Не удалось скачать файл. Попробуйте ещё раз.'
    }
  }

  function wake() {
    if (document.visibilityState === 'visible') {
      disconnect()
      clearTimeout(retry)
      retry = undefined
      void connect()
    }
  }
  onMounted(() => {
    void connect()
    window.addEventListener('offline', disconnect)
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(clock)
    clearTimeout(retry)
    disconnect()
    api.dispose()
    window.removeEventListener('offline', disconnect)
    window.removeEventListener('online', wake)
    document.removeEventListener('visibilitychange', wake)
  })
  return {
    available,
    open,
    menu,
    config,
    inquiryId,
    messages,
    step,
    contacts,
    draft,
    files,
    error,
    sending,
    uploadedCount,
    online,
    canSubmit,
    submitDisabledReason,
    prepare,
    send,
    download,
  }
}
