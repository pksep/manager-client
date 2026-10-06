<script setup lang="ts">
import { ref } from 'vue'
import Widget from './Widget.vue'
import type { EmbedOptions, FrameMode, SupportDraft } from './protocol'

defineProps<{ options: EmbedOptions }>()

const emit = defineEmits<{
  frameState: [state: { mode: FrameMode; menuHeight: number }]
  close: []
  draftChange: [draft: SupportDraft]
}>()

const connected = ref(false)

/** Встроенная переписка занимает всё окно поддержки, без кнопки запуска сайта. */
const updateState = (state: { mode: FrameMode; menuHeight: number }): void => {
  connected.value = state.mode === 'panel'
  emit('frameState', state)
}
</script>

<template>
  <main class="support-widget" aria-label="Переписка с поддержкой">
    <p v-if="!connected" class="support-widget__connection" role="status">
      Подключаем поддержку…
    </p>
    <Widget
      :options="options"
      embedded
      @frame-state="updateState"
      @close="emit('close')"
      @draft-change="emit('draftChange', $event)"
    />
  </main>
</template>

<style scoped>
.support-widget {
  height: 100%;
  background: var(--surface-main);
}

.support-widget__connection {
  padding: 24px;
  color: var(--text-secondary);
  text-align: center;
}

.support-widget :deep(.chat-window) {
  border-radius: 0;
}
</style>
