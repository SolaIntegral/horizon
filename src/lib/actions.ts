import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
  where,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import { addEstimatedMinutes } from './tasks'

export type ActionStatus = 'todo' | 'doing' | 'done' | 'skipped'

export interface Action {
  id: string
  taskId: string
  taskTitle: string
  userId: string
  title: string
  output?: string // このActionで生まれる具体的な成果物
  completionCriteria?: string // 完了とみなす条件
  estimatedMinutes: number
  status: ActionStatus
  deferredTo?: Timestamp | null // 中断時に仮置きされた再開予定日
  startedAt?: Timestamp | null
  completedAt?: Timestamp | null
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const DEFAULT_ACTION_MINUTES = 15

export async function createAction(
  userId: string,
  taskId: string,
  taskTitle: string,
  title: string,
  estimatedMinutes: number = DEFAULT_ACTION_MINUTES,
  extra?: { output?: string; completionCriteria?: string },
): Promise<string> {
  const docRef = await addDoc(collection(db, 'actions'), {
    userId,
    taskId,
    taskTitle,
    title,
    ...(extra?.output ? { output: extra.output } : {}),
    ...(extra?.completionCriteria ? { completionCriteria: extra.completionCriteria } : {}),
    estimatedMinutes,
    status: 'todo' satisfies ActionStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await addEstimatedMinutes(taskId, estimatedMinutes)
  return docRef.id
}

export function subscribeActiveActions(userId: string, callback: (actions: Action[]) => void): Unsubscribe {
  const q = query(collection(db, 'actions'), where('userId', '==', userId), where('status', 'in', ['todo', 'doing']))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Action))
    },
    (err) => console.error('[subscribeActiveActions]', err.code, err.message),
  )
}

export function subscribeDoneActions(userId: string, callback: (actions: Action[]) => void): Unsubscribe {
  const q = query(collection(db, 'actions'), where('userId', '==', userId), where('status', '==', 'done'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Action))
    },
    (err) => console.error('[subscribeDoneActions]', err.code, err.message),
  )
}

export async function skipAction(actionId: string, taskId: string) {
  await updateDoc(doc(db, 'actions', actionId), { status: 'skipped' satisfies ActionStatus, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, 'tasks', taskId), { skipCount: increment(1), updatedAt: serverTimestamp() })
}

export async function getAction(actionId: string): Promise<Action | null> {
  const snap = await getDoc(doc(db, 'actions', actionId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Action
}

export async function startAction(actionId: string) {
  await updateDoc(doc(db, 'actions', actionId), {
    status: 'doing' satisfies ActionStatus,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function completeAction(actionId: string) {
  await updateDoc(doc(db, 'actions', actionId), {
    status: 'done' satisfies ActionStatus,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function overwriteAction(actionId: string, title: string, estimatedMinutes: number) {
  await updateDoc(doc(db, 'actions', actionId), { title, estimatedMinutes, updatedAt: serverTimestamp() })
}

export async function setActionDeferredTo(actionId: string, deferredTo: Timestamp | null) {
  await updateDoc(doc(db, 'actions', actionId), { deferredTo, updatedAt: serverTimestamp() })
}
