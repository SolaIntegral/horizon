import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
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
  // orderBy(createdAt) preserves the order Actions were broken down/added in
  // within a Task — without it, Firestore falls back to document-id order,
  // which scrambles the intended step sequence in the Today/edit UIs.
  const q = query(
    collection(db, 'actions'),
    where('userId', '==', userId),
    where('status', 'in', ['todo', 'doing']),
    orderBy('createdAt', 'asc'),
  )
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

export async function overwriteAction(actionId: string, title: string, estimatedMinutes: number, completionCriteria?: string) {
  const updates: Record<string, unknown> = { title, estimatedMinutes, updatedAt: serverTimestamp() }
  if (completionCriteria !== undefined) updates.completionCriteria = completionCriteria
  await updateDoc(doc(db, 'actions', actionId), updates)
}

export async function setActionDeferredTo(actionId: string, deferredTo: Timestamp | null) {
  await updateDoc(doc(db, 'actions', actionId), { deferredTo, updatedAt: serverTimestamp() })
}

// Permanent removal (e.g. the AI got it wrong) — distinct from skipAction
// (deprioritize, keep in history) and setActionDeferredTo (push to another
// day). Callers are also responsible for pulling actionId out of the current
// DailyPlan's plannedSlots/selectedActionIds/requiredActionIds if present.
export async function deleteAction(actionId: string, taskId: string, estimatedMinutes: number) {
  await deleteDoc(doc(db, 'actions', actionId))
  await addEstimatedMinutes(taskId, -estimatedMinutes)
}
