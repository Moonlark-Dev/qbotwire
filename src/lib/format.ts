/** Small formatting helpers shared by the UI and the tests. */

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 5) return '刚刚'
  if (seconds < 60) return `${seconds} 秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) return value
  return `${value.slice(0, length - 1)}…`
}

export function intentsLabel(intents: number): string {
  const names: Array<[number, string]> = [
    [1 << 0, '频道'],
    [1 << 1, '频道成员'],
    [1 << 9, '频道消息'],
    [1 << 10, '频道表情'],
    [1 << 12, '频道私信'],
    [1 << 25, '群与单聊'],
    [1 << 26, '互动'],
    [1 << 27, '消息审核'],
    [1 << 28, '论坛'],
    [1 << 30, '公域消息'],
  ]
  const selected = names.filter(([bit]) => (intents & bit) !== 0).map(([, name]) => name)
  return selected.length ? selected.join(' · ') : '无'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
