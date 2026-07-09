import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where, Timestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import type { GrowthMemo } from './ai'

export interface GrowthLog {
  id: string
  userId: string
  reflectionText: string
  aiMemo: GrowthMemo
  quizAnswer?: string
  quizCorrect?: boolean
  createdAt?: Timestamp
}

export async function saveGrowthLog(
  userId: string,
  reflectionText: string,
  aiMemo: GrowthMemo,
  quizAnswer?: string,
  quizCorrect?: boolean,
): Promise<string> {
  const data: Record<string, unknown> = {
    userId,
    reflectionText,
    aiMemo,
    createdAt: serverTimestamp(),
  }
  if (quizAnswer !== undefined) data.quizAnswer = quizAnswer
  if (quizCorrect !== undefined) data.quizCorrect = quizCorrect
  const docRef = await addDoc(collection(db, 'growthLogs'), data)
  return docRef.id
}

export function subscribeGrowthLogs(userId: string, callback: (logs: GrowthLog[]) => void): Unsubscribe {
  const q = query(collection(db, 'growthLogs'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GrowthLog)),
    (err) => console.error('[subscribeGrowthLogs]', err.code, err.message),
  )
}
