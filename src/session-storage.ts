import { publicUrl, type EmbedOptions } from './protocol'

const guestToken = /^[a-f0-9]{64}$/

export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000

export interface GuestSessionState {
  token: string
  expiresAt: number
}

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

export function readGuestSessionState(
  key: string | undefined,
): GuestSessionState | undefined {
  if (!key) return

  try {
    const value = localStorage.getItem(key)
    if (!value) return

    // Старый ключ получает срок один раз при переходе на новый формат.
    if (guestToken.test(value)) {
      const state = {
        token: value,
        expiresAt: Date.now() + GUEST_SESSION_TTL_MS,
      }
      localStorage.setItem(key, JSON.stringify(state))

      return state
    }

    const state: unknown = JSON.parse(value)
    if (
      state &&
      typeof state === 'object' &&
      'token' in state &&
      typeof state.token === 'string' &&
      guestToken.test(state.token) &&
      'expiresAt' in state &&
      typeof state.expiresAt === 'number' &&
      Number.isSafeInteger(state.expiresAt) &&
      state.expiresAt > Date.now() &&
      state.expiresAt <= Date.now() + GUEST_SESSION_TTL_MS
    ) {
      return { token: state.token, expiresAt: state.expiresAt }
    }

    localStorage.removeItem(key)
  } catch {
    try {
      localStorage.removeItem(key)
    } catch {
      /* Ограничение хранилища. */
    }
  }
}

export function readGuestSession(key: string | undefined): string {
  return readGuestSessionState(key)?.token || ''
}

export function saveGuestSession(
  key: string | undefined,
  token: string,
  expiresAt?: number,
): void {
  if (!key) return

  try {
    if (!guestToken.test(token)) {
      localStorage.removeItem(key)

      return
    }

    const previous = readGuestSessionState(key)
    const deadline = Math.min(
      expiresAt ?? Date.now() + GUEST_SESSION_TTL_MS,
      previous?.token === token ? previous.expiresAt : Infinity,
      Date.now() + GUEST_SESSION_TTL_MS,
    )
    if (!Number.isSafeInteger(deadline) || deadline <= Date.now()) {
      if (!previous || previous.token === token) localStorage.removeItem(key)

      return
    }

    localStorage.setItem(key, JSON.stringify({ token, expiresAt: deadline }))
  } catch {
    /* Переписка остаётся на сервере; без хранилища доступ живёт в памяти. */
  }
}
