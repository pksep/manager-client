import { createApp } from 'vue'
import '@pksep/yui/styles'
import './style.css'
import Widget from './Widget.vue'
import { publicUrl, type EmbedOptions, type PanelMove } from './protocol'

const hash = new URLSearchParams(location.hash.slice(1))
const instance = hash.get('instance')
const parentOrigin = hash.get('parentOrigin')
let initialized = false
if (
  instance &&
  parentOrigin &&
  window.parent !== window &&
  new URL(publicUrl(parentOrigin)).origin === parentOrigin
) {
  const receive = (event: MessageEvent) => {
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
    initialized = true
    window.removeEventListener('message', receive)
    createApp(Widget, {
      options,
      onFrameState: (state: object) => {
        parent.postMessage(
          { type: 'sep-manager:state', instance, ...state },
          parentOrigin,
        )
      },
      onPanelMove: (movement: PanelMove) => {
        parent.postMessage(
          { type: 'sep-manager:move', instance, ...movement },
          parentOrigin,
        )
      },
    }).mount('#app')
  }
  window.addEventListener('message', receive)
  parent.postMessage({ type: 'sep-manager:ready', instance }, parentOrigin)
}
