import { publicUrl, type EmbedOptions } from './protocol'

const guestToken = /^[a-f0-9]{64}$/

/** Ключ доступа изолирован по сервису, сайту и origin родительской страницы. */
export function guestSessionKey(
  base: string,
  options: EmbedOptions,
): string | undefined {
  if (options.supportSessionToken) return

  try {
    const origin = new URL(publicUrl(options.source?.pageUrl)).origin

    return `manager-session:${JSON.stringify([base, options.siteId, origin])}`
  } catch {
    return
  }
}

export function readGuestSession(key: string | undefined): string {
  if (!key) return ''

  try {
    const token = localStorage.getItem(key) || ''

    if (guestToken.test(token)) return token

    if (token) localStorage.removeItem(key)
  } catch {
    /* Запрет хранилища не должен мешать начать новый диалог. */
  }

  return ''
}

export function saveGuestSession(key: string | undefined, token: string): void {
  if (!key) return

  try {
    if (guestToken.test(token)) localStorage.setItem(key, token)
    else localStorage.removeItem(key)
  } catch {
    /* Переписка остаётся на сервере; без хранилища доступ живёт в памяти. */
  }
}
