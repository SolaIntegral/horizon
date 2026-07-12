// Pure, computed-on-read day-phase logic for the single-Mission Today screen.
// Never persisted to Firestore (see Hori_UX改善_設計確定事項.md §3): there's no
// server-side cron in this project yet, so a stored `phase` field would have no
// reliable updater for purely time-based transitions (e.g. the 23:00 cutoff).
//
// Phase1 scope note: this computes the full DayPhase union, but 'mission_result'
// and 'support' (Phase2/3 intervention flows) are not produced here yet — Today
// only distinguishes morning_setup / working / break / mission_ready / the
// "day's plan finished" states (evening_prompt/daily_review/tomorrow_plan/day_complete,
// which Today renders as one generic "finished" card for now).

import type { Action } from './actions'
import type { DailyPlan } from './dailyPlans'
import type { WorkSession } from './workSessions'

export type DayPhase =
  | 'morning_setup'
  | 'mission_ready'
  | 'working'
  | 'break'
  | 'mission_result'
  | 'support'
  | 'evening_prompt'
  | 'daily_review'
  | 'tomorrow_plan'
  | 'day_complete'

export interface CurrentMission {
  actionId: string
  slotStart: Date
  slotEnd: Date
}

const EVENING_HOUR = 23
export const BREAK_LIGHT_THRESHOLD_MINUTES = 10
export const BREAK_HEAVY_THRESHOLD_MINUTES = 20

export function selectCurrentMission(
  dailyPlan: DailyPlan | null,
  actionsById: Map<string, Action>,
): CurrentMission | null {
  if (!dailyPlan) return null
  const sorted = [...dailyPlan.plannedSlots].sort((a, b) => a.start.toMillis() - b.start.toMillis())
  for (const slot of sorted) {
    const action = actionsById.get(slot.actionId)
    if (!action) continue
    if (action.status === 'done' || action.status === 'skipped') continue
    return { actionId: slot.actionId, slotStart: slot.start.toDate(), slotEnd: slot.end.toDate() }
  }
  return null
}

export function computeDayPhase(input: {
  now: Date
  dailyPlan: DailyPlan | null
  activeSession: WorkSession | null
  actionsById: Map<string, Action>
}): DayPhase {
  const { now, dailyPlan, activeSession, actionsById } = input

  if (!dailyPlan || dailyPlan.plannedSlots.length === 0) return 'morning_setup'
  if (activeSession?.type === 'focus') return 'working'
  if (activeSession?.type === 'break') return 'break'

  const current = selectCurrentMission(dailyPlan, actionsById)
  if (current) return 'mission_ready'

  return now.getHours() >= EVENING_HOUR ? 'evening_prompt' : 'day_complete'
}

export type BreakOverrunLevel = 'none' | 'light' | 'heavy'

export function getBreakOverrunLevel(activeSession: WorkSession | null, now: Date): BreakOverrunLevel {
  if (!activeSession || activeSession.type !== 'break') return 'none'
  const elapsedMinutes = (now.getTime() - activeSession.startedAt.toDate().getTime()) / 60000
  const overrun = elapsedMinutes - activeSession.plannedMinutes
  if (overrun >= BREAK_HEAVY_THRESHOLD_MINUTES) return 'heavy'
  if (overrun >= BREAK_LIGHT_THRESHOLD_MINUTES) return 'light'
  return 'none'
}
