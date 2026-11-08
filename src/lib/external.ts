/**
 * External links inside the Tauri WebView.
 *
 * The desktop WebView ignores `target="_blank"`: a click on a plain anchor is
 * swallowed and no browser window ever opens. Ask the opener plugin to hand
 * the URL to the OS default browser instead. The browser preview has no Tauri
 * IPC, so there we fall back to a regular new tab.
 */
import { openUrl } from '@tauri-apps/plugin-opener'
import { isTauri } from '@/lib/backend'

export function openExternal(url: string): void {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  void openUrl(url).catch((error: unknown) => {
    console.error('无法打开外部链接', error)
  })
}
