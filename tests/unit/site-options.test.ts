import { afterEach, expect, spyOn, test } from 'bun:test'
import {
  initialOpenDeadline,
  MAX_AUTO_OPEN_DELAY_MS,
  parseWidgetSiteOptions,
} from '../../src/protocol'

let restoreClock: (() => void) | undefined

afterEach((): void => {
  restoreClock?.()
  restoreClock = undefined
})

test('без параметров сохраняет прежний режим; 0 означает немедленное открытие', (): void => {
  expect(parseWidgetSiteOptions({})).toEqual({
    initialMessage: undefined,
    autoOpenDelayMs: undefined,
  })
  expect(
    parseWidgetSiteOptions({
      initialMessage: '  Здравствуйте!  ',
      autoOpenDelayMs: 0,
    }),
  ).toEqual({ initialMessage: 'Здравствуйте!', autoOpenDelayMs: 0 })
  expect(
    parseWidgetSiteOptions({ initialMessage: '   ' }).initialMessage,
  ).toBeUndefined()
})

test('задержка задаётся числом миллисекунд, не строкой, дробью или бесконечностью', (): void => {
  for (const value of [
    -1,
    0.5,
    '3000',
    null,
    true,
    Infinity,
    NaN,
    MAX_AUTO_OPEN_DELAY_MS + 1,
  ]) {
    expect(() => parseWidgetSiteOptions({ autoOpenDelayMs: value })).toThrow()
  }
  expect(
    parseWidgetSiteOptions({ autoOpenDelayMs: MAX_AUTO_OPEN_DELAY_MS })
      .autoOpenDelayMs,
  ).toBe(MAX_AUTO_OPEN_DELAY_MS)
})

test('первое сообщение является ограниченным текстом, а не объектом', (): void => {
  for (const value of [null, 12, {}, [], 'a'.repeat(2001)]) {
    expect(() => parseWidgetSiteOptions({ initialMessage: value })).toThrow()
  }
  expect(
    parseWidgetSiteOptions({ initialMessage: '<img src=x onerror=alert(1)>' })
      .initialMessage,
  ).toBe('<img src=x onerror=alert(1)>')
})

test('отсчёт от mount не начинается заново из-за загрузки iframe', (): void => {
  const clock = spyOn(Date, 'now').mockReturnValue(10000)
  restoreClock = (): void => clock.mockRestore()
  expect(initialOpenDeadline(3000, 11000)).toBe(11000)
  expect(initialOpenDeadline(3000, 9000)).toBe(9000)
  expect(initialOpenDeadline(3000, undefined)).toBe(13000)
  expect(initialOpenDeadline(3000, Infinity)).toBe(13000)
  expect(initialOpenDeadline(3000, 999999)).toBe(13000)
})
