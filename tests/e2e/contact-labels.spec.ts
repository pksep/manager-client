import { expect, test } from '@playwright/test'

test('имя без пометки, обязательный контакт отмечен чёрной звёздочкой', async ({
  page,
}): Promise<void> => {
  await page.goto('/')
  const frame = page.frameLocator('iframe[data-sep-manager]')
  await frame.getByRole('button', { name: 'Открыть чат' }).click()
  await frame.locator('.composer .tiptap').fill('Проверка подписей формы')
  await frame.locator('.composer .tiptap').press('Enter')
  await expect(frame.locator('label[for="contact-name"]')).toHaveText(
    'Как к вам обращаться',
  )
  await expect(frame.getByText('(необязательно)', { exact: true })).toHaveCount(
    0,
  )
  const mark = frame.locator(
    'label[for="contact-value"] .contact-field-required',
  )
  await expect(mark).toHaveText('*')
  await expect(mark).toHaveCSS('color', 'rgb(0, 0, 0)')
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  await frame
    .getByRole('textbox', { name: 'Телефон или email', exact: true })
    .fill('visitor@example.test')
  await expect(
    frame.getByRole('textbox', { name: 'Как к вам обращаться', exact: true }),
  ).toHaveValue('')
  await expect(
    frame.getByRole('button', { name: 'Отправить сообщение', exact: true }),
  ).toBeEnabled()
  await page.screenshot({ path: 'test-results/widget-contact-labels.png' })
})
