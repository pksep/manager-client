/** Короткий сигнал без загрузки аудиофайлов и без запроса разрешений. */
export class NotificationSound {
  private context?: AudioContext
  private disposed = false
  private readonly seen = new Set<string>()

  unlock(): void {
    if (this.disposed) return

    try {
      this.context ||= new AudioContext()

      if (this.context.state === 'suspended')
        void this.context.resume().catch(() => {})
    } catch {
      // Отсутствие звука не должно влиять на доставку сообщений.
    }
  }

  notify(messageId: string): void {
    if (this.disposed || this.seen.has(messageId)) return

    this.seen.add(messageId)
    const context = this.context

    // Не копим заблокированные сигналы: первый клик не озвучивает старую историю.
    if (!context || context.state !== 'running') return

    try {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(660, start)
      oscillator.frequency.setValueAtTime(880, start + 0.12)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.06, start + 0.02)
      gain.gain.linearRampToValueAtTime(0, start + 0.32)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = (): void => {
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + 0.34)
    } catch {
      // В том числе при приостановке аудио браузером или системой.
    }
  }

  destroy(): void {
    this.disposed = true
    this.seen.clear()

    if (this.context && this.context.state !== 'closed')
      void this.context.close().catch(() => {})
  }
}
