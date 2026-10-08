import { createApp } from 'vue'
import '@pksep/yui/styles'
import './style.css'
import Widget from './Widget.vue'
import SupportWidget from './SupportWidget.vue'
import {
  publicUrl,
  type EmbedOptions,
  type PanelMove,
  type SupportDraft,
} from './protocol'

const hash = new URLSearchParams(location.hash.slice(1))
const instance = hash.get('instance')
const parentOrigin = hash.get('parentOrigin')
const supportMode = hash.get('mode') === 'support'
let initialized = false
if (
  instance &&
  parentOrigin &&
  window.parent !== window &&
  new URL(publicUrl(parentOrigin)).origin === parentOrigin
) {
  const receive = (event: MessageEvent): void => {
    if (
      initialized ||
      event.source !== parent ||
      event.origin !== parentOrigin ||
      event.data?.type !== 'sep-manager:init' ||
      event.data.instance !== instance
    )
      return
    const options = event.data.options as EmbedOptions
    publicUrl(options.serviceUrl)
    if (!/^[\w-]{1,100}$/.test(options.siteId)) return
    if (
      supportMode &&
      !/^[a-f0-9]{64}$/.test(options.supportSessionToken || '')
    )
      return
    if (!supportMode && options.supportSessionToken) return
    initialized = true
    window.removeEventListener('message', receive)
    createApp(supportMode ? SupportWidget : Widget, {
      options,
      onFrameState: (state: object): void => {
        parent.postMessage(
          { type: 'sep-manager:state', instance, ...state },
          parentOrigin,
        )
      },
      onPanelMove: (movement: PanelMove): void => {
        parent.postMessage(
          { type: 'sep-manager:move', instance, ...movement },
          parentOrigin,
        )
      },
      onInteraction: (): void => {
        if (!supportMode)
          parent.postMessage(
            { type: 'sep-manager:interaction', instance },
            parentOrigin,
          )
      },
      onNotification: (messageId: string): void => {
        if (!supportMode)
          parent.postMessage(
            { type: 'sep-manager:notification', instance, messageId },
            parentOrigin,
          )
      },
      onClose: (): void => {
        parent.postMessage(
          { type: 'sep-manager:close', instance },
          parentOrigin,
        )
      },
      onDraftChange: (draft: SupportDraft): void => {
        if (supportMode)
          parent.postMessage(
            { type: 'sep-manager:draft', instance, draft },
            parentOrigin,
          )
      },
    }).mount('#app')
  }
  window.addEventListener('message', receive)
  parent.postMessage({ type: 'sep-manager:ready', instance }, parentOrigin)
}
