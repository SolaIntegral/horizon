import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { InterruptionReason } from './workSessions'
import type { InboxTriage } from './tasks'

// 1日の終わりに作る振り返り。見積り精度・中断理由・未完了Actionの仮置き先を
// 次の計画・週次振り返りで使うために保存する。
export interface EstimateDifference {
  actionId: string
  title: string
  estimatedMinutes: number
  actualMinutes: number
}

export interface InterruptionSummary {
  reason: InterruptionReason
  count: number
}

export type UnfinishedPlacement = 'tomorrow' | 'within_3_days' | 'unscheduled'

export interface UnfinishedActionPlacement {
  actionId: string
  placement: UnfinishedPlacement
}

export interface InboxTriageSummary {
  taskId: string
  triage: InboxTriage | 'deleted'
}

export interface DailyReview {
  id: string
  userId: string
  date: string // 'YYYY-MM-DD'
  plannedMinutes: number
  actualMinutes: number
  majorEstimateDifferences: EstimateDifference[]
  interruptions: InterruptionSummary[]
  unfinishedActionPlacements: UnfinishedActionPlacement[]
  inboxTriage: InboxTriageSummary[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

function reviewDocId(userId: string, date: string): string {
  return `${userId}_${date}`
}

export async function getDailyReview(userId: string, date: string): Promise<DailyReview | null> {
  const snap = await getDoc(doc(db, 'dailyReviews', reviewDocId(userId, date)))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as DailyReview
}

export function subscribeDailyReview(userId: string, date: string, callback: (review: DailyReview | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'dailyReviews', reviewDocId(userId, date)),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as DailyReview) : null),
    (err) => console.error('[subscribeDailyReview]', err.code, err.message),
  )
}

export async function upsertDailyReview(
  userId: string,
  date: string,
  updates: Partial<Omit<DailyReview, 'id' | 'userId' | 'date' | 'createdAt'>>,
) {
  await setDoc(
    doc(db, 'dailyReviews', reviewDocId(userId, date)),
    { userId, date, ...updates, updatedAt: serverTimestamp() },
    { merge: true },
  )
}
