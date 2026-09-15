<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import {
  Avatar,
  Button,
  ButtonTypeEnum,
  ChatFileDetails,
  ChatFileIcon,
  ChatMessageSurface,
  ChatMessageMeta,
  ContentEditor,
  Icon,
  IconNameEnum,
  Input,
  Popover,
  SizesEnum,
  TextFieldEnum,
  Tooltip,
  ScrollWrapper,
} from '@pksep/yui'
import companyMark from './assets/company-mark.svg'
import { type EmbedOptions, type FrameMode, type PanelMove } from './protocol'
import { useWidget } from './useWidget'
import { usePanelDrag } from './usePanelDrag'
import { vCompactMessage } from './compactMessage'

const props = defineProps<{ options: EmbedOptions }>()
const emit = defineEmits<{
  frameState: [state: { mode: FrameMode; menuHeight: number }]
  panelMove: [event: PanelMove]
}>()
const {
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
} = useWidget(props.options)
const editor = ref<InstanceType<typeof ContentEditor> | null>(null)
const submitHintFocused = ref(false)
const transcript = ref<InstanceType<typeof ScrollWrapper>>(),
  closeButton = ref<HTMLButtonElement>(),
  launcher = ref<HTMLButtonElement>()
const mode = computed<FrameMode>(() =>
  !available.value
    ? 'hidden'
    : open.value
      ? 'panel'
      : menu.value
        ? 'menu'
        : 'launcher',
)
const panelDrag = usePanelDrag(
  computed(() => open.value && available.value),
  (event) => emit('panelMove', event),
)
const emojiPreloaded = ref(false)
let warmup: number | undefined
let warmupUsesIdle = false
function cancelWarmup() {
  if (warmup === undefined) return
  if (warmupUsesIdle) window.cancelIdleCallback(warmup)
  else window.clearTimeout(warmup)
  warmup = undefined
}
watch([available, editor], async () => {
  cancelWarmup()
  if (!available.value || !editor.value || emojiPreloaded.value) return
  await nextTick()
  const preload = () => {
    warmup = undefined
    if (available.value)
      emojiPreloaded.value = editor.value?.preloadEmojiPicker() || false
  }
  warmupUsesIdle = typeof window.requestIdleCallback === 'function'
  warmup = warmupUsesIdle
    ? window.requestIdleCallback(preload, { timeout: 1000 })
    : window.setTimeout(preload, 100)
})
onBeforeUnmount(() => {
  cancelWarmup()
  clearTimeout(leaveTimer)
})
const menuHeight = computed(
  () => 96 + (1 + (config.value?.socialLinks.length || 0)) * 44,
)
const icon = {
  vk: IconNameEnum.socialVk,
  telegram: IconNameEnum.socialTelegram,
  chat: IconNameEnum.chat,
}
const safeHtml = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
    ],
    ALLOWED_ATTR: [],
  })
const time = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: config.value?.schedule.timezone,
  }).format(new Date(value))
const firstOutgoingId = computed(
  () => messages.value.find((message) => message.direction === 'outgoing')?.id,
)
const contactSummary = computed(() =>
  [contacts.name, contacts.phone, contacts.email]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', '),
)
async function useWelcome(message: string) {
  // Configuration is plain text, even though the shared editor accepts HTML.
  const paragraph = document.createElement('p')
  paragraph.textContent = message
  draft.value = paragraph.outerHTML
  await nextTick()
  editor.value?.focus()
}
function sendSelectedFiles(selected: FileList, onlyMedia: boolean) {
  prepare({
    content: draft.value,
    ...(onlyMedia ? { mediaFiles: selected } : { files: selected }),
  })
}
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} Б`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} КБ`
      : `${(bytes / 1024 / 1024).toFixed(1)} МБ`
let leaveTimer: ReturnType<typeof setTimeout> | undefined
function showMenu() {
  clearTimeout(leaveTimer)
  menu.value = true
}
function leaveMenu() {
  leaveTimer = setTimeout(() => {
    menu.value = false
  }, 180)
}
function showChat() {
  clearTimeout(leaveTimer)
  menu.value = false
  open.value = true
}
async function closeChat() {
  open.value = false
  menu.value = false
  await nextTick()
  launcher.value?.focus({ preventScroll: true })
}
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void closeChat()
  }
}
watch(
  [mode, menuHeight],
  () => emit('frameState', { mode: mode.value, menuHeight: menuHeight.value }),
  { immediate: true },
)
watch(open, async (value) => {
  if (value) {
    await nextTick()
    closeButton.value?.focus({ preventScroll: true })
  }
})
watch([() => messages.value.length, step, open], async () => {
  await nextTick()
  const scroll = transcript.value?.slotRef
  scroll?.scrollTo({
    top: scroll.scrollHeight,
    behavior: 'smooth',
  })
})
</script>

<template>
  <div
    v-if="config"
    v-show="available"
    class="manager-widget"
    :class="`mode-${mode}`"
    @keydown="keyboard"
  >
    <section
      class="chat-window"
      :class="{ 'chat-window--collapsed': !open }"
      :inert="!open || undefined"
      :aria-hidden="!open"
      role="dialog"
      aria-label="Чат с компанией"
    >
      <header
        class="chat-header"
        :class="{ dragging: panelDrag.dragging.value }"
        tabindex="0"
        aria-label="Перемещение окна: перетащите шапку или используйте стрелки"
        @pointerdown="panelDrag.start"
        @pointermove="panelDrag.update"
        @pointerup="panelDrag.stop"
        @pointercancel="panelDrag.stop"
        @lostpointercapture="panelDrag.stop"
        @keydown="panelDrag.keydown"
        @dragstart.prevent
      >
        <div class="company-avatar">
          <Avatar
            :initials="config.company.name"
            :url="config.company.avatarUrl"
            :default-image="companyMark"
            :is-online="online"
            :alt="config.company.name"
          />
        </div>
        <div class="company-info">
          <h1>Напишите нам</h1>
          <p class="operator-status" :class="{ offline: !online }">
            {{
              online
                ? 'Оператор онлайн'
                : `Оператор не в сети. Ответим с ${config.schedule.start.replace(/^0/, '')} до ${config.schedule.end}`
            }}
          </p>
        </div>
        <button
          ref="closeButton"
          class="close-chat"
          type="button"
          aria-label="Закрыть чат"
          @click="closeChat"
        >
          <Icon :name="IconNameEnum.crossSmall" :width="16" :height="16" />
        </button>
      </header>

      <ScrollWrapper
        v-if="step === 'contacts'"
        class="widget-scroll contact-scroll"
        style="height: 100%"
      >
        <div class="contact-step">
          <h2>Как с вами связаться?</h2>
          <p class="contact-description">
            Оставьте контакты, чтобы мы могли ответить, даже если вы закроете
            сайт
          </p>
          <div
            class="contact-fields"
            :inert="sending || undefined"
            @keydown.enter.prevent="send"
          >
            <div class="contact-field">
              <label for="contact-name">Имя</label>
              <Input
                v-model="contacts.name"
                input-id="contact-name"
                aria-label="Имя"
                placeholder="Введите имя"
                autocomplete="name"
                hide-clear-button
              />
            </div>
            <div class="contact-field">
              <label for="contact-phone">Телефон</label>
              <Input
                v-model="contacts.phone"
                input-id="contact-phone"
                aria-label="Телефон"
                placeholder="Введите номер"
                :type="TextFieldEnum.tel"
                autocomplete="tel"
                hide-clear-button
              />
            </div>
            <div class="contact-field">
              <label for="contact-email">Email</label>
              <Input
                v-model="contacts.email"
                input-id="contact-email"
                aria-label="E-mail"
                placeholder="Введите email"
                :type="TextFieldEnum.email"
                autocomplete="email"
                hide-clear-button
              />
            </div>
          </div>
          <p v-if="error" class="error-message" role="alert">{{ error }}</p>
          <Tooltip
            class="contact-submit-hint"
            :hint="submitDisabledReason"
            :is-can-show="available && open && !canSubmit"
            :is-show="submitHintFocused"
            position="top-center"
            :tabindex="!canSubmit ? 0 : undefined"
            @focus="submitHintFocused = true"
            @blur="submitHintFocused = false"
            @click="submitHintFocused = !canSubmit"
          >
            <Button
              :type="ButtonTypeEnum.primary"
              class="contact-submit"
              :disabled="!canSubmit"
              :aria-describedby="
                !canSubmit ? 'submit-disabled-reason' : undefined
              "
              @click="send"
              >{{
                sending
                  ? files.length
                    ? `Отправка файлов ${uploadedCount}/${files.length}…`
                    : 'Отправка…'
                  : 'Отправить сообщение'
              }}</Button
            >
          </Tooltip>
          <span id="submit-disabled-reason" class="visually-hidden">{{
            submitDisabledReason
          }}</span>
        </div>
      </ScrollWrapper>

      <template v-else>
        <ScrollWrapper
          ref="transcript"
          class="widget-scroll transcript"
          style="height: 100%"
        >
          <div
            class="transcript-content"
            role="log"
            aria-label="Сообщения"
            aria-live="polite"
            aria-relevant="additions"
          >
            <div v-if="!inquiryId" class="welcome-messages">
              <Button
                v-for="(message, index) in config.welcomeMessages"
                :key="index"
                class="welcome-message"
                :type="ButtonTypeEnum.outline"
                :size="SizesEnum.small"
                pill
                @click="useWelcome(message)"
              >
                {{ message }}
              </Button>
            </div>
            <template v-for="message in messages" :key="message.id">
              <div
                class="message-row"
                :class="{ outgoing: message.direction === 'outgoing' }"
                :data-message-id="message.id"
              >
                <Avatar
                  v-if="message.direction === 'incoming'"
                  :initials="message.author"
                  :url="message.avatarUrl"
                  :alt="message.author"
                  class="message-avatar"
                />
                <ChatMessageSurface
                  v-compact-message
                  :outgoing="message.direction === 'outgoing'"
                >
                  <div
                    v-if="message.direction === 'incoming'"
                    class="message-heading"
                  >
                    <span class="message-author">{{ message.author }}</span>
                    <span class="operator-badge">Оператор</span>
                  </div>
                  <div class="message-content">
                    <div
                      v-if="message.html"
                      class="message-html"
                      v-html="safeHtml(message.html)"
                    />
                    <ChatMessageMeta
                      v-if="!message.attachments.length"
                      class="message-time"
                      :time="time(message.createdAt)"
                      :datetime="message.createdAt"
                      :outgoing="message.direction === 'outgoing'"
                      :is-read="!!message.readAt"
                    />
                  </div>
                  <button
                    v-for="file in message.attachments"
                    :key="file.id"
                    class="message-file"
                    type="button"
                    :aria-label="`Скачать ${file.name}`"
                    @click="download(file)"
                  >
                    <ChatFileIcon
                      :is-me-sender="message.direction === 'outgoing'"
                      is-loaded
                      icon="download"
                    />
                    <ChatFileDetails
                      :name="file.name"
                      :size="size(file.size)"
                    />
                  </button>
                  <ChatMessageMeta
                    v-if="message.attachments.length"
                    class="message-time message-time--bottom"
                    :time="time(message.createdAt)"
                    :datetime="message.createdAt"
                    :outgoing="message.direction === 'outgoing'"
                    :is-read="!!message.readAt"
                  />
                </ChatMessageSurface>
              </div>
              <template v-if="message.id === firstOutgoingId && contactSummary">
                <div
                  class="message-row outgoing contact-summary"
                  aria-label="Отправленные контакты"
                >
                  <ChatMessageSurface v-compact-message outgoing>
                    <div class="message-content">
                      <span class="contact-summary-text">{{
                        contactSummary
                      }}</span>
                      <ChatMessageMeta
                        class="message-time"
                        :time="time(message.createdAt)"
                        :datetime="message.createdAt"
                        outgoing
                        :is-read="!!message.readAt"
                      />
                    </div>
                  </ChatMessageSurface>
                </div>
                <p class="contact-notice">
                  Контакты переданы оператору вместе с сообщением
                </p>
              </template>
            </template>
          </div>
        </ScrollWrapper>
        <div v-if="error" class="error-message composer-error" role="alert">
          {{ error }}
          <button v-if="inquiryId" type="button" @click="send">
            Повторить
          </button>
        </div>
      </template>
      <div
        v-show="step === 'conversation'"
        class="composer"
        :class="{ busy: sending }"
        :aria-busy="sending"
        :inert="sending || undefined"
        :data-emoji-preloaded="emojiPreloaded"
      >
        <ContentEditor
          v-model="draft"
          ref="editor"
          layout="desktop"
          attachment-mode="direct"
          :suspended="!open || !available || step === 'contacts'"
          active-attach-file
          :active-select-user="false"
          @unmount-send="prepare"
          @unmount-attach-file="sendSelectedFiles"
        />
      </div>
    </section>

    <div
      v-if="!open"
      class="launcher-area"
      @mouseenter="showMenu"
      @mouseleave="leaveMenu"
    >
      <Popover
        :is-show="menu"
        is-w-c-use
        class="launcher-popover"
        @close="menu = false"
      >
        <template #trigger>
          <button
            ref="launcher"
            type="button"
            class="launcher"
            aria-label="Открыть чат"
            :aria-expanded="menu"
            @click.stop="showChat"
            @focus="showMenu"
          >
            <Icon :name="IconNameEnum.chat" :width="24" :height="24" />
          </button>
        </template>
        <nav
          v-if="menu"
          class="contact-menu"
          aria-label="Способы связи"
          @mouseenter="showMenu"
        >
          <button type="button" @click="showChat">
            <Icon :name="IconNameEnum.chat" :width="24" :height="24" /><span
              >Отправить сообщение</span
            >
          </button>
          <a
            v-for="link in config.socialLinks"
            :key="link.url"
            :href="link.url"
            target="_blank"
            rel="noopener noreferrer"
            ><Icon :name="icon[link.icon]" :width="24" :height="24" /><span>{{
              link.label
            }}</span></a
          >
        </nav>
      </Popover>
    </div>
  </div>
</template>
