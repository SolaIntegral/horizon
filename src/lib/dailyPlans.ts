import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, writeBatch, Timestamp, type Unsubscribe } from 'firebase/firestore'
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
  // 23時以降の終了確認（§3のDayPhase計算で使用）。dayCompletedAtは実際に
  // 振り返りを終えて1日を締めたことを示す。eveningPromptAnswerは
  // 「まだ作業を続ける」を選んでその晩は再度催促しない、という軽い記録。
  eveningPromptAnswer?: 'reviewed' | 'confirmed_tomorrow' | 'continue_working'
  dayCompletedAt?: Timestamp
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

// 週次プランニングで7日分をまとめて確定するための一括書き込み。1つの
// writeBatchで送るため、途中で失敗しても中途半端な週が残らない（all-or-nothing）。
export async function upsertDailyPlansBatch(
  userId: string,
  entries: { date: string; updates: Partial<Omit<DailyPlan, 'id' | 'userId' | 'date' | 'createdAt'>> }[],
) {
  const batch = writeBatch(db)
  for (const { date, updates } of entries) {
    batch.set(
      doc(db, 'dailyPlans', planDocId(userId, date)),
      { userId, date, ...updates, updatedAt: serverTimestamp() },
      { merge: true },
    )
  }
  await batch.commit()
}

// 既存のsubscribeDailyPlan（1doc用onSnapshot）を複数日分束ねたもの。dateKeys
// ごとに個別リスナーを張り、最新のスナップショットをMapにまとめてcallbackへ渡す。
export function subscribeDailyPlansForWeek(
  userId: string,
  dateKeys: string[],
  callback: (plans: Map<string, DailyPlan | null>) => void,
): Unsubscribe {
  const plans = new Map<string, DailyPlan | null>()
  const unsubs = dateKeys.map((date) =>
    subscribeDailyPlan(userId, date, (plan) => {
      plans.set(date, plan)
      callback(new Map(plans))
    }),
  )
  return () => unsubs.forEach((u) => u())
}

// あるActionを別の日のplannedSlots/selectedActionIdsへ移動する。移動元が
// 指定されていればそちらのplannedSlots/selectedActionIds/requiredActionIdsから
// も取り除く（TodayFixPanelの削除ロジックと同じ考え方）。2doc間の書き込みは
// atomicになるようwriteBatchでまとめる。
export async function moveActionToDay(
  userId: string,
  actionId: string,
  fromPlan: { date: string; plan: DailyPlan } | null,
  toPlan: { date: string; plan: DailyPlan | null },
  slot: { start: Timestamp; end: Timestamp },
) {
  const batch = writeBatch(db)

  if (fromPlan) {
    batch.set(
      doc(db, 'dailyPlans', planDocId(userId, fromPlan.date)),
      {
        userId,
        date: fromPlan.date,
        selectedActionIds: fromPlan.plan.selectedActionIds.filter((id) => id !== actionId),
        requiredActionIds: (fromPlan.plan.requiredActionIds ?? []).filter((id) => id !== actionId),
        plannedSlots: fromPlan.plan.plannedSlots.filter((s) => s.actionId !== actionId),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  const existingSelected = toPlan.plan?.selectedActionIds ?? []
  const existingSlots = toPlan.plan?.plannedSlots ?? []
  batch.set(
    doc(db, 'dailyPlans', planDocId(userId, toPlan.date)),
    {
      userId,
      date: toPlan.date,
      selectedActionIds: existingSelected.includes(actionId) ? existingSelected : [...existingSelected, actionId],
      plannedSlots: [...existingSlots.filter((s) => s.actionId !== actionId), { actionId, start: slot.start, end: slot.end }],
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  await batch.commit()
}
