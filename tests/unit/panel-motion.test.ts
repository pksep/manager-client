import { describe, expect, test } from 'bun:test'
import { parsePanelMotionRequest } from '../../src/protocol'

describe('Протокол движения окна', (): void => {
  test('принимает только известные этапы с номером запроса', (): void => {
    for (const phase of ['prepare', 'open', 'close'] as const) {
      expect(parsePanelMotionRequest({ id: 1, phase })).toEqual({
        id: 1,
        phase,
      })
    }
  })

  test('не принимает повреждённые, отрицательные и неизвестные запросы', (): void => {
    for (const value of [
      null,
      'open',
      {},
      { id: '1', phase: 'open' },
      { id: 0, phase: 'open' },
      { id: -1, phase: 'close' },
      { id: 1.5, phase: 'prepare' },
      { id: Infinity, phase: 'open' },
      { id: Number.MAX_SAFE_INTEGER + 1, phase: 'open' },
      { id: 1, phase: 'resize' },
      { id: 1 },
    ]) {
      expect(parsePanelMotionRequest(value)).toBeUndefined()
    }
  })
})
