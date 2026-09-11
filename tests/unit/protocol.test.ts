import { describe, expect, test } from 'bun:test'
import {
  contactsValid,
  contactErrors,
  operatorOnline,
  parseMessage,
  publicUrl,
} from '../../src/protocol'

describe('Правила контактов', () => {
  const valid = {
    name: 'Иван',
    phone: '+7 (999) 123-45-67',
    email: 'ivan@example.com',
  }
  test('первоначально все три поля обязательны', () => {
    expect(contactsValid(valid, 'all')).toBe(true)
    expect(contactsValid({ ...valid, email: '' }, 'all')).toBe(false)
    expect(contactsValid({ ...valid, phone: '123' }, 'all')).toBe(false)
    expect(contactsValid({ ...valid, name: ' ' }, 'all')).toBe(false)
  })
  test('настраиваемый один канал не допускает заполненное неверное поле', () => {
    expect(contactsValid({ ...valid, phone: '' }, 'name-and-one')).toBe(true)
    expect(contactsValid({ ...valid, phone: 'abc' }, 'name-and-one')).toBe(
      false,
    )
  })
  test('причины блокировки совпадают с правилами отправки', () => {
    expect(contactErrors({ name: '', phone: '', email: '' }, 'all')).toEqual([
      'Введите имя.',
      'Введите номер телефона.',
      'Введите email.',
    ])
    expect(contactErrors({ ...valid, email: 'wrong' }, 'all')).toEqual([
      'Проверьте email, например name@example.com.',
    ])
    expect(
      contactErrors({ ...valid, phone: '', email: '' }, 'name-and-one'),
    ).toEqual(['Укажите телефон или email для ответа.'])
    expect(contactErrors({ ...valid, phone: '' }, 'name-and-one')).toEqual([])
  })
})
describe('Расписание в часовом поясе компании', () => {
  const schedule = {
    timezone: 'Europe/Moscow',
    start: '08:00',
    end: '18:00',
    days: [1, 2, 3, 4, 5],
  }
  test('точные границы и выходные', () => {
    expect(operatorOnline(schedule, new Date('2026-09-10T04:59:00Z'))).toBe(
      false,
    )
    expect(operatorOnline(schedule, new Date('2026-09-10T05:00:00Z'))).toBe(
      true,
    )
    expect(operatorOnline(schedule, new Date('2026-09-10T15:00:00Z'))).toBe(
      false,
    )
    expect(operatorOnline(schedule, new Date('2026-09-12T07:00:00Z'))).toBe(
      false,
    )
  })
  test('смена через полночь относится к дню начала', () => {
    const night = { ...schedule, start: '22:00', end: '06:00', days: [5] }
    expect(operatorOnline(night, new Date('2026-09-11T23:00:00Z'))).toBe(true)
    expect(operatorOnline(night, new Date('2026-09-12T03:00:00Z'))).toBe(false)
  })
})
test('внешние адреса не разрешают выполнение кода и учётные данные', () => {
  expect(() => publicUrl('javascript:alert(1)')).toThrow()
  expect(() => publicUrl('https://user:password@example.com')).toThrow()
  expect(() => publicUrl('http://example.com')).toThrow()
  expect(publicUrl('http://127.0.0.1:4311')).toBe('http://127.0.0.1:4311/')
})
test('ответы сервиса должны содержать текущий диалог и корректные файлы', () => {
  expect(() => parseMessage({ id: '1', html: '<p>test</p>' })).toThrow()
})
test('прочтение задаётся только корректной датой сервиса', () => {
  const message = {
    id: '1',
    inquiryId: 'current',
    direction: 'outgoing',
    author: 'Вы',
    html: '<p>Здравствуйте!</p>',
    attachments: [],
    createdAt: '2026-09-11T09:00:00Z',
  }
  expect(parseMessage(message).readAt).toBeUndefined()
  expect(
    parseMessage({ ...message, readAt: '2026-09-11T09:01:00Z' }).readAt,
  ).toBe('2026-09-11T09:01:00Z')
  expect(() => parseMessage({ ...message, readAt: true })).toThrow()
  expect(() => parseMessage({ ...message, readAt: 'invalid' })).toThrow()
})
test('аватар автора необязателен и принимает только безопасный публичный адрес', () => {
  const message = {
    id: '1',
    inquiryId: 'current',
    direction: 'incoming',
    author: 'Оператор',
    html: '<p>Здравствуйте!</p>',
    attachments: [],
    createdAt: '2026-09-11T09:00:00Z',
  }
  expect(parseMessage(message).avatarUrl).toBeUndefined()
  expect(
    parseMessage({ ...message, avatarUrl: 'https://example.com/avatar.png' })
      .avatarUrl,
  ).toBe('https://example.com/avatar.png')
  expect(() =>
    parseMessage({ ...message, avatarUrl: 'javascript:alert(1)' }),
  ).toThrow()
  expect(() =>
    parseMessage({
      ...message,
      avatarUrl: 'https://user:password@example.com/avatar.png',
    }),
  ).toThrow()
})
