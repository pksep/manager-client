/** CSS владельца сайта остаётся в iframe и не разбирается как HTML. */
export function applyCustomCss(doc: Document, css?: string): void {
  const previous = doc.querySelector<HTMLStyleElement>(
    'style[data-sep-manager-custom-css]',
  )

  if (!css?.trim()) {
    previous?.remove()

    return
  }

  const style = previous || doc.createElement('style')
  style.dataset.sepManagerCustomCss = ''
  style.textContent = css

  if (!previous) doc.head.append(style)
}
