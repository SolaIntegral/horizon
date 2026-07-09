import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'

export type SessionType = 'focus' | 'break'
export type SessionStatus = 'active' | 'completed' | 'interrupted' | 'cancelled'

export interface WorkSession {
  id: string
  userId: string
  type: SessionType
  status: SessionStatus
  taskId: string
  actionId?: string
  plannedMinutes: number
  actualMinutes?: number
  startedAt: Timestamp
  endedAt?: Timestamp
  source: 'overlay' | 'manual'
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export async function createWorkSession(
  userId: string,
  type: SessionType,
  taskId: string,
  actionId: string,
  plannedMinutes: number,
): Promise<string> {
  const docRef = await addDoc(collection(db, 'workSessions'), {
    userId,
    type,
    status: 'active' satisfies SessionStatus,
    taskId,
    actionId,
    plannedMinutes,
    startedAt: serverTimestamp(),
    source: 'overlay',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function completeWorkSession(sessionId: string, actualMinutes: number) {
  await updateDoc(doc(db, 'workSessions', sessionId), {
    status: 'completed' satisfies SessionStatus,
    endedAt: serverTimestamp(),
    actualMinutes,
    updatedAt: serverTimestamp(),
  })
}

export async function endWorkSession(sessionId: string, actualMinutes: number) {
  const status: SessionStatus = actualMinutes < 1 ? 'cancelled' : 'interrupted'
  await updateDoc(doc(db, 'workSessions', sessionId), {
    status,
    endedAt: serverTimestamp(),
    actualMinutes,
    updatedAt: serverTimestamp(),
  })
}

export function subscribeActiveWorkSession(userId: string, callback: (session: WorkSession | null) => void): Unsubscribe {
  const q = query(collection(db, 'workSessions'), where('userId', '==', userId), where('status', '==', 'active'), limit(1))
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as WorkSession))
    },
    (err) => console.error('[subscribeActiveWorkSession]', err.code, err.message),
  )
}
