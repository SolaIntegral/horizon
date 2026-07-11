// Pure scheduling logic for the daily plan screen — kept free of Firestore/React
// so the allocation rule (space actions into free time, leave a fixed share as
// blank buffer) is easy to reason about and adjust independently of the UI.

export interface FixedEvent {
  start: Date
  end: Date
  title?: string
}

export interface CandidateAction {
  actionId: string
  estimatedMinutes: number
}

export interface PlannedBlock {
  actionId: string
  start: Date
  end: Date
}

export interface BufferBlock {
  start: Date
  end: Date
}

export interface BuildScheduleInput {
  dayStart: Date
  dayEnd: Date
  fixedEvents: FixedEvent[]
  // Share (0-1) of each free interval to actually fill with actions; the rest
  // becomes blank buffer. Lower this on low-capacity (tired/短時間睡眠) days.
  fillRatio: number
  requiredActions: CandidateAction[] // placed first, into the earliest (morning) intervals
  otherActions: CandidateAction[] // placed after, in priority order
  gapMinutes?: number
}

export interface BuildScheduleResult {
  plannedSlots: PlannedBlock[]
  bufferSlots: BufferBlock[]
  unscheduledActionIds: string[]
}

const MORNING_CUTOFF_HOUR = 12
const DEFAULT_GAP_MINUTES = 5

function mergeFreeIntervals(dayStart: Date, dayEnd: Date, fixedEvents: FixedEvent[]): { start: Date; end: Date }[] {
  const sorted = [...fixedEvents].sort((a, b) => a.start.getTime() - b.start.getTime())
  const intervals: { start: Date; end: Date }[] = []
  let cursor = dayStart

  for (const ev of sorted) {
    if (ev.end <= dayStart || ev.start >= dayEnd) continue
    const evStart = ev.start < dayStart ? dayStart : ev.start
    const evEnd = ev.end > dayEnd ? dayEnd : ev.end
    if (evStart > cursor) intervals.push({ start: cursor, end: evStart })
    if (evEnd > cursor) cursor = evEnd
  }
  if (cursor < dayEnd) intervals.push({ start: cursor, end: dayEnd })

  return intervals.filter((i) => i.end > i.start)
}

export function buildDailySchedule(input: BuildScheduleInput): BuildScheduleResult {
  const gap = input.gapMinutes ?? DEFAULT_GAP_MINUTES
  const freeIntervals = mergeFreeIntervals(input.dayStart, input.dayEnd, input.fixedEvents)

  // Morning-first ordering so required actions land before noon when possible.
  const morning = freeIntervals.filter((i) => i.start.getHours() < MORNING_CUTOFF_HOUR)
  const rest = freeIntervals.filter((i) => i.start.getHours() >= MORNING_CUTOFF_HOUR)
  const orderedIntervals = [...morning, ...rest]

  const queue = [...input.requiredActions, ...input.otherActions]
  const plannedSlots: PlannedBlock[] = []
  const bufferSlots: BufferBlock[] = []

  for (const interval of orderedIntervals) {
    const intervalMinutes = (interval.end.getTime() - interval.start.getTime()) / 60000
    const plannableMinutes = intervalMinutes * input.fillRatio
    let cursor = new Date(interval.start)
    let usedMinutes = 0

    while (queue.length > 0) {
      const next = queue[0]
      const neededMinutes = next.estimatedMinutes + (usedMinutes > 0 ? gap : 0)
      if (usedMinutes + neededMinutes > plannableMinutes) break

      if (usedMinutes > 0) cursor = new Date(cursor.getTime() + gap * 60000)
      const start = new Date(cursor)
      const end = new Date(cursor.getTime() + next.estimatedMinutes * 60000)
      plannedSlots.push({ actionId: next.actionId, start, end })
      cursor = end
      usedMinutes += neededMinutes
      queue.shift()
    }

    if (cursor < interval.end) {
      bufferSlots.push({ start: cursor, end: interval.end })
    }
  }

  return { plannedSlots, bufferSlots, unscheduledActionIds: queue.map((a) => a.actionId) }
}
