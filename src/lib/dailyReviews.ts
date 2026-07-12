import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

// 1日の終わりに作る、最小限の振り返り。完了・未完了のActionと、任意の
// 振り返りコメント／翌日メモだけを持つ（Hori_UX改善_設計確定事項.md §5）。
export interface DailyReview {
  id: string
  userId: string
  date: string // 'YYYY-MM-DD'
  completedActionIds: string[]
  incompleteActionIds: string[]
  estimateDiffSummary?: string
  interruptionSummary?: string
  reflection?: string
  tomorrowNotes?: string
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

// Saves the (optional, minimal) evening review — used by Today's evening_prompt flow.
export async function completeDailyReview(
  userId: string,
  date: string,
  input: { completedActionIds: string[]; incompleteActionIds: string[]; reflection?: string; tomorrowNotes?: string },
) {
  const updates: Partial<Omit<DailyReview, 'id' | 'userId' | 'date' | 'createdAt'>> = {
    completedActionIds: input.completedActionIds,
    incompleteActionIds: input.incompleteActionIds,
  }
  if (input.reflection?.trim()) updates.reflection = input.reflection.trim()
  if (input.tomorrowNotes?.trim()) updates.tomorrowNotes = input.tomorrowNotes.trim()
  await upsertDailyReview(userId, date, updates)
}
