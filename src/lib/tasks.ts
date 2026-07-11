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
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'

export type TaskStatus = 'inbox' | 'planned' | 'in_progress' | 'interrupted' | 'done'

// Lightweight end-of-day inbox triage tag. Only meaningful while status === 'inbox';
// cleared once the task leaves inbox (moves to 'planned').
export type InboxTriage = 'unsorted' | 'today' | 'later'

export interface Task {
  id: string
  userId: string
  title: string
  originalInput: string
  status: TaskStatus
  inboxTriage?: InboxTriage
  outputGoal?: string // 完成イメージ・アウトプット
  currentState?: string // 現在地（どこまで出来ているか）
  deadline?: Timestamp | null
  estimatedTotalMinutes?: number // 全Actionの見積り合計（非正規化キャッシュ）
  actualTotalMinutes?: number // 全WorkSessionの実績合計（非正規化キャッシュ）
  isMain?: boolean
  skipCount?: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
  completedAt?: Timestamp | null
}

const tasksCollection = collection(db, 'tasks')

export async function createInboxTask(userId: string, originalInput: string): Promise<string> {
  const docRef = await addDoc(tasksCollection, {
    userId,
    title: '',
    originalInput,
    status: 'inbox' satisfies TaskStatus,
    inboxTriage: 'unsorted' satisfies InboxTriage,
    skipCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export function subscribeInboxTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe {
  const q = query(tasksCollection, where('userId', '==', userId), where('status', '==', 'inbox'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Task))
    },
    (err) => console.error('[subscribeInboxTasks]', err.code, err.message),
  )
}

// Tasks that have left the inbox but aren't finished yet (planned / in progress / interrupted).
export function subscribeScheduledTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe {
  const q = query(tasksCollection, where('userId', '==', userId), where('status', 'in', ['planned', 'in_progress', 'interrupted']))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Task))
    },
    (err) => console.error('[subscribeScheduledTasks]', err.code, err.message),
  )
}

export async function updateTaskText(taskId: string, originalInput: string) {
  await updateDoc(doc(db, 'tasks', taskId), { originalInput, updatedAt: serverTimestamp() })
}

export async function deleteTask(taskId: string) {
  await deleteDoc(doc(db, 'tasks', taskId))
}

export async function getTask(taskId: string): Promise<Task | null> {
  const snap = await getDoc(doc(db, 'tasks', taskId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Task
}

export interface TaskPlan {
  title: string
  outputGoal: string
  currentState: string
  deadline?: Timestamp | null
}

// Saves the 完成イメージ・現在地・締切 captured during the planning step and
// moves the task from 'inbox' to 'planned'. Action breakdown happens separately.
export async function savePlan(taskId: string, plan: TaskPlan) {
  const updates: Record<string, unknown> = {
    title: plan.title,
    outputGoal: plan.outputGoal,
    currentState: plan.currentState,
    status: 'planned' satisfies TaskStatus,
    inboxTriage: null,
    updatedAt: serverTimestamp(),
  }
  if (plan.deadline !== undefined) updates.deadline = plan.deadline
  await updateDoc(doc(db, 'tasks', taskId), updates)
}

export async function createPlannedTask(userId: string, originalInput: string, plan: TaskPlan): Promise<string> {
  const docRef = await addDoc(tasksCollection, {
    userId,
    originalInput,
    title: plan.title,
    outputGoal: plan.outputGoal,
    currentState: plan.currentState,
    deadline: plan.deadline ?? null,
    status: 'planned' satisfies TaskStatus,
    skipCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function setInboxTriage(taskId: string, triage: InboxTriage) {
  await updateDoc(doc(db, 'tasks', taskId), { inboxTriage: triage, updatedAt: serverTimestamp() })
}

export async function markTaskInProgress(taskId: string) {
  await updateDoc(doc(db, 'tasks', taskId), { status: 'in_progress' satisfies TaskStatus, updatedAt: serverTimestamp() })
}

export async function markTaskInterrupted(taskId: string) {
  await updateDoc(doc(db, 'tasks', taskId), { status: 'interrupted' satisfies TaskStatus, updatedAt: serverTimestamp() })
}

export async function markTaskDone(taskId: string) {
  await updateDoc(doc(db, 'tasks', taskId), {
    status: 'done' satisfies TaskStatus,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function incrementSkipCount(taskId: string, currentCount: number) {
  await updateDoc(doc(db, 'tasks', taskId), { skipCount: currentCount + 1, updatedAt: serverTimestamp() })
}

export async function addEstimatedMinutes(taskId: string, minutes: number) {
  await updateDoc(doc(db, 'tasks', taskId), { estimatedTotalMinutes: increment(minutes), updatedAt: serverTimestamp() })
}

export async function addActualMinutes(taskId: string, minutes: number) {
  await updateDoc(doc(db, 'tasks', taskId), { actualTotalMinutes: increment(minutes), updatedAt: serverTimestamp() })
}
