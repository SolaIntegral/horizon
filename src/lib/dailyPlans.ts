import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

// 固定予定・空き時間・作業割当を含む「1日の予定表」。
// Googleカレンダー連携が入るまでは calendarBusySlots はユーザーの手入力（モック）。
export interface TimeSlot {
  start: Timestamp
  end: Timestamp
  title?: string
}

export interface PlannedSlot {
  actionId: string
  start: Timestamp
  end: Timestamp
}

export type RequiredGoalCondition = 'task_done' | 'action_done' | 'time_worked'

export interface DailyPlan {
  id: string
  userId: string
  date: string // 'YYYY-MM-DD'
  requiredGoal?: string // 今日中に終わらせたいこと（自由記述の要約）
  requiredActionIds: string[] // 上記に紐づく、最優先で午前に配置するAction（最大2件）
  requiredGoalCondition?: RequiredGoalCondition
  requiredGoalTimeMinutes?: number // requiredGoalCondition === 'time_worked' の場合の目標時間
  selectedActionIds: string[]
  calendarBusySlots: TimeSlot[]
  plannedSlots: PlannedSlot[]
  freeTimeSlots: TimeSlot[]
  bufferSlots: TimeSlot[]
  dayEndTime?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

function planDocId(userId: string, date: string): string {
  return `${userId}_${date}`
}

export async function getDailyPlan(userId: string, date: string): Promise<DailyPlan | null> {
  const snap = await getDoc(doc(db, 'dailyPlans', planDocId(userId, date)))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as DailyPlan
}

export function subscribeDailyPlan(userId: string, date: string, callback: (plan: DailyPlan | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'dailyPlans', planDocId(userId, date)),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as DailyPlan) : null),
    (err) => console.error('[subscribeDailyPlan]', err.code, err.message),
  )
}

export async function upsertDailyPlan(
  userId: string,
  date: string,
  updates: Partial<Omit<DailyPlan, 'id' | 'userId' | 'date' | 'createdAt'>>,
) {
  await setDoc(
    doc(db, 'dailyPlans', planDocId(userId, date)),
    { userId, date, ...updates, updatedAt: serverTimestamp() },
    { merge: true },
  )
}
