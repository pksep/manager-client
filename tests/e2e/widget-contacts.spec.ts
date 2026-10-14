import { expect, test } from '@playwright/test'

test.beforeEach(async ({ request }): Promise<void> => {
  await request.post('http://127.0.0.1:4311/__demo/state', {
    data: { reset: true },
  })
})

for (const contact of ['+7 (999) 123-45-67', 'visitor@example.test']) {
  test(`отправка без имени с одним контактом: ${contact}`, async ({
    page,
  }): Promise<void> => {
    await page.goto('/')
    const frame = page.frameLocator('iframe[data-sep-manager]')
    await frame.getByRole('button', { name: 'Открыть чат' }).click()
    await frame.locator('.composer .tiptap').fill('Подскажите по оборудованию')
    await frame.locator('.composer .tiptap').press('Enter')
    await expect(frame.locator('.contact-field')).toHaveCount(2)
    await expect(
      frame.getByRole('textbox', { name: 'Как к вам обращаться', exact: true }),
    ).toHaveValue('')
    await expect(
      frame.getByRole('textbox', { name: 'E-mail', exact: true }),
    ).toHaveCount(0)
    const submit = frame.getByRole('button', {
      name: 'Отправить сообщение',
      exact: true,
    })
    await expect(submit).toBeDisabled()
    await frame
      .getByRole('textbox', { name: 'Телефон или email', exact: true })
      .fill(contact)
    await expect(submit).toBeEnabled()
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().endsWith('/v1/widget/inquiries'),
    )
    await submit.click()
    const body = (await requestPromise).postDataJSON()
    expect(body.contacts).toEqual({
      name: '',
      phone: contact.includes('@') ? '' : contact,
      email: contact.includes('@') ? contact : '',
    })
    await expect(
      frame.getByText('Подскажите по оборудованию', { exact: true }),
    ).toBeVisible()
    await expect(frame.locator('.contact-summary-text')).toHaveText(contact)
  })
}

test('смена телефона на почту не оставляет прежний контакт, пустое и неверное значение запрещены', async ({
  page,
}): Promise<void> => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const frame = page.frameLocator('iframe[data-sep-manager]')
  await frame.getByRole('button', { name: 'Открыть чат' }).click()
  await frame.locator('.composer .tiptap').fill('Нужна консультация')
  await frame.locator('.composer .tiptap').press('Enter')
  const contact = frame.getByRole('textbox', {
    name: 'Телефон или email',
    exact: true,
  })
  const submit = frame.getByRole('button', {
    name: 'Отправить сообщение',
    exact: true,
  })
  for (const value of ['', '   ', '123', 'wrong@']) {
    await contact.fill(value)
    await expect(submit).toBeDisabled()
  }
  await contact.fill('+79991234567')
  await expect(submit).toBeEnabled()
  await contact.fill('visitor@example.test')
  await frame
    .getByRole('textbox', { name: 'Как к вам обращаться', exact: true })
    .fill('Ю')
  await page.screenshot({
    path: 'test-results/widget-contact-form-mobile.png',
    fullPage: true,
  })
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().endsWith('/v1/widget/inquiries'),
  )
  await submit.click()
  expect((await requestPromise).postDataJSON().contacts).toEqual({
    name: 'Ю',
    phone: '',
    email: 'visitor@example.test',
  })
})
