import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { getEndOfWeek } from './dateUtils'
import type { TaskDiagnosis } from './ai'

export type TaskStatus = 'inbox' | 'diagnosed' | 'this_week' | 'later' | 'done'

export interface Task {
  id: string
  userId: string
  title: string
  originalInput: string
  status: TaskStatus
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW'
  riskLabel?: string
  riskReason?: string
  suggestedAction?: string
  estimatedMinutes?: number
  dueDate?: Timestamp | null
  isMain?: boolean
  skipCount?: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const tasksCollection = collection(db, 'tasks')

export async function createInboxTask(userId: string, originalInput: string): Promise<string> {
  const docRef = await addDoc(tasksCollection, {
    userId,
    title: '',
    originalInput,
    status: 'inbox' satisfies TaskStatus,
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

export function subscribeThisWeekTasks(userId: string, callback: (tasks: Task[]) => void): Unsubscribe {
  const q = query(tasksCollection, where('userId', '==', userId), where('status', '==', 'this_week'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Task))
    },
    (err) => console.error('[subscribeThisWeekTasks]', err.code, err.message),
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

export async function saveDiagnosis(taskId: string, diagnosis: TaskDiagnosis) {
  await updateDoc(doc(db, 'tasks', taskId), {
    title: diagnosis.title,
    status: 'diagnosed' satisfies TaskStatus,
    riskLevel: diagnosis.riskLevel,
    riskLabel: diagnosis.riskLabel,
    riskReason: diagnosis.riskReason,
    suggestedAction: diagnosis.suggestedAction,
    estimatedMinutes: diagnosis.estimatedMinutes,
    updatedAt: serverTimestamp(),
  })
}

export async function createDiagnosedTask(userId: string, originalInput: string, diagnosis: TaskDiagnosis): Promise<string> {
  const docRef = await addDoc(tasksCollection, {
    userId,
    originalInput,
    title: diagnosis.title,
    status: 'diagnosed' satisfies TaskStatus,
    riskLevel: diagnosis.riskLevel,
    riskLabel: diagnosis.riskLabel,
    riskReason: diagnosis.riskReason,
    suggestedAction: diagnosis.suggestedAction,
    estimatedMinutes: diagnosis.estimatedMinutes,
    skipCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function scheduleTaskThisWeek(taskId: string, currentDueDate?: Timestamp | null) {
  const updates: Record<string, unknown> = { status: 'this_week' satisfies TaskStatus, updatedAt: serverTimestamp() }
  if (!currentDueDate) {
    updates.dueDate = Timestamp.fromDate(getEndOfWeek())
  }
  await updateDoc(doc(db, 'tasks', taskId), updates)
}

export async function scheduleTaskLater(taskId: string) {
  await updateDoc(doc(db, 'tasks', taskId), { status: 'later' satisfies TaskStatus, updatedAt: serverTimestamp() })
}

export async function incrementSkipCount(taskId: string, currentCount: number) {
  await updateDoc(doc(db, 'tasks', taskId), { skipCount: currentCount + 1, updatedAt: serverTimestamp() })
}
