import { mount } from '../src/embed'
import './host.css'

document.querySelector('#demo')!.innerHTML = `
  <main class="demo-panel">
    <details>
      <summary>Тестирование виджета</summary>
      <div class="demo-controls">
        <p>Кнопка чата — справа внизу. Сообщения остаются в локальном демо.</p>
        <label><input id="available" type="checkbox" checked> Сервис доступен</label>
        <label><input id="online" type="checkbox" checked> Рабочее время</label>
        <label><input id="social" type="checkbox" checked> Ссылка ВКонтакте</label>
        <button id="send-file" type="button">Ответить файлом</button>
        <button id="read-messages" type="button">Отметить сообщения прочитанными</button>
        <button id="fail-next" type="button">Ошибка следующей отправки</button>
        <span id="control-status" role="status"></span>
      </div>
    </details>
  </main>`

async function control(body: object) {
  const status = document.querySelector('#control-status')!
  try {
    const response = await fetch('http://127.0.0.1:4311/__demo/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error()
    status.textContent = 'Настройки применены'
  } catch {
    status.textContent = 'Запустите bun run demo:server'
  }
}
for (const key of ['available', 'online', 'social'])
  document.querySelector(`#${key}`)!.addEventListener('change', (e) => {
    void control({ [key]: (e.target as HTMLInputElement).checked })
  })
document.querySelector('#send-file')!.addEventListener('click', () => {
  void control({ sendFile: true })
})
document.querySelector('#fail-next')!.addEventListener('click', () => {
  void control({ failNext: true })
})
document.querySelector('#read-messages')!.addEventListener('click', () => {
  void control({ readMessages: true })
})
const widget = mount({
  siteId: 'amotiv-demo',
  serviceUrl: 'http://127.0.0.1:4311',
  widgetUrl: new URL('/widget.html', location.href).href,
})
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) widget.destroy()
})
