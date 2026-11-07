function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const TOKEN =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

/**
 * Syntax-highlight a JSON value into safe HTML.
 *
 * The input is escaped segment by segment, so payloads containing markup
 * (e.g. `<img onerror=...>` inside a QQ message) can never become markup.
 */
export function highlightJson(value: unknown): string {
  let pretty: string
  try {
    pretty = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  } catch {
    pretty = String(value)
  }
  if (pretty === undefined) return ''

  let output = ''
  let cursor = 0
  for (const match of pretty.matchAll(TOKEN)) {
    const index = match.index ?? 0
    output += escapeHtml(pretty.slice(cursor, index))
    const [token, stringToken, colon, literal, numberToken] = match
    if (stringToken) {
      output += colon
        ? `<span class="tok-key">${escapeHtml(stringToken)}</span><span class="tok-punct">${escapeHtml(colon)}</span>`
        : `<span class="tok-string">${escapeHtml(stringToken)}</span>`
    } else if (literal) {
      output += `<span class="tok-${literal === 'null' ? 'null' : 'bool'}">${escapeHtml(literal)}</span>`
    } else if (numberToken) {
      output += `<span class="tok-number">${escapeHtml(numberToken)}</span>`
    } else {
      output += escapeHtml(token)
    }
    cursor = index + token.length
  }
  output += escapeHtml(pretty.slice(cursor))
  return output
}

export { escapeHtml }
