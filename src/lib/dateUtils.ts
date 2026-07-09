export function getEndOfWeek(from: Date = new Date()): Date {
  const date = new Date(from)
  const day = date.getDay() // 0 = Sunday
  const diff = day === 0 ? 0 : 7 - day
  date.setDate(date.getDate() + diff)
  date.setHours(23, 59, 59, 999)
  return date
}

export function getStartOfWeek(from: Date = new Date()): Date {
  const date = new Date(from)
  const day = date.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function getWeekDays(from: Date = new Date()): Date[] {
  const start = getStartOfWeek(from)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
