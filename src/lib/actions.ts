import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import { addEstimatedMinutes, markTaskDone } from './tasks'

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

// If a Task has no todo/doing Actions left (all done or skipped), it's
// finished — auto-complete it so it doesn't linger forever with nothing
// left to do. Firestore's list-query rule validation only trusts the
// query's own equality filters (not real-world data guarantees), so a
// taskId-only query is rejected as "insufficient permissions" even though
// every action for a given taskId always belongs to one user — userId must
// be filtered explicitly too, same as every other query in this codebase.
async function maybeAutoCompleteTask(userId: string, taskId: string) {
  const snap = await getDocs(query(collection(db, 'actions'), where('userId', '==', userId), where('taskId', '==', taskId)))
  const stillActive = snap.docs.some((d) => {
    const status = d.data().status as ActionStatus
    return status === 'todo' || status === 'doing'
  })
  if (!stillActive) await markTaskDone(taskId)
}

export async function skipAction(actionId: string, taskId: string, userId: string) {
  await updateDoc(doc(db, 'actions', actionId), { status: 'skipped' satisfies ActionStatus, updatedAt: serverTimestamp() })
  await updateDoc(doc(db, 'tasks', taskId), { skipCount: increment(1), updatedAt: serverTimestamp() })
  await maybeAutoCompleteTask(userId, taskId)
}

// Manually closes out a Task in one step, for when the user doesn't want to
// tick off each remaining Action individually. Any Actions still todo/doing
// are marked skipped rather than done — they weren't actually worked, and
// marking them done would misrepresent real completion for future
// estimate-vs-actual analysis (same reasoning as the existing skipAction).
export async function completeTaskManually(userId: string, taskId: string) {
  const snap = await getDocs(query(collection(db, 'actions'), where('userId', '==', userId), where('taskId', '==', taskId)))
  const batch = writeBatch(db)
  snap.docs.forEach((d) => {
    const status = d.data().status as ActionStatus
    if (status === 'todo' || status === 'doing') {
      batch.update(d.ref, { status: 'skipped' satisfies ActionStatus, updatedAt: serverTimestamp() })
    }
  })
  await batch.commit()
  await markTaskDone(taskId)
}

// All Actions for a single Task, any status — for the Task list screen's
// expanded view. userId is included (redundant with taskId ownership) to
// match this codebase's convention of always scoping queries by userId.
export function subscribeActionsForTask(userId: string, taskId: string, callback: (actions: Action[]) => void): Unsubscribe {
  const q = query(collection(db, 'actions'), where('userId', '==', userId), where('taskId', '==', taskId))
  return onSnapshot(
    q,
    (snapshot) => {
      const actions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Action)
      actions.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
      callback(actions)
    },
    (err) => console.error('[subscribeActionsForTask]', err.code, err.message),
  )
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

export async function completeAction(actionId: string, taskId: string, userId: string) {
  await updateDoc(doc(db, 'actions', actionId), {
    status: 'done' satisfies ActionStatus,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await maybeAutoCompleteTask(userId, taskId)
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
