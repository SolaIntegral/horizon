import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
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
import { addActualMinutes } from './tasks'
import { processSessionNote } from './ai'

export type SessionType = 'focus' | 'break'
export type SessionStatus = 'active' | 'completed' | 'interrupted' | 'cancelled'

// 中断理由。「返信待ち」「情報待ち」も専用ステータスではなく、この理由で区別する。
export type InterruptionReason = 'tired' | 'stuck' | 'unmotivated' | 'waiting_reply' | 'waiting_info' | 'other_priority' | 'other'

// どの操作で残したメモか（AI要約の対象を絞るための識別子）
export type NoteTrigger = 'done' | 'break_start' | 'exit'
export type AiStatus = 'pending' | 'processed' | 'failed' | 'skipped'

export interface SuggestedAction {
  title: string
  estimatedMinutes: number
  reason?: string
  recommendationType: 'overwrite_current' | 'add_new'
  targetActionId?: string
  userDecision?: 'accepted_overwrite' | 'rejected_added' | 'added' | 'dismissed'
  appliedActionId?: string
}

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
  interruptionReason?: InterruptionReason
  noteTrigger?: NoteTrigger
  note?: string
  estimatedProgress?: number // 0-100の自己申告の進捗感
  estimatedRemainingMinutes?: number
  nextStartAction?: string // 次回再開時の最初の行動
  aiStatus?: AiStatus
  structured?: {
    doneSummary?: string
    nextSummary?: string
    blockerSummary?: string
    ideaSummary?: string
  }
  suggestedActions?: SuggestedAction[]
  aiProcessedAt?: Timestamp
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface SessionNoteInput {
  trigger: NoteTrigger
  note?: string
  interruptionReason?: InterruptionReason
  estimatedProgress?: number
  estimatedRemainingMinutes?: number
  nextStartAction?: string
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

function noteFields(noteInput?: SessionNoteInput): Record<string, unknown> {
  if (!noteInput) return {}
  const fields: Record<string, unknown> = { noteTrigger: noteInput.trigger }
  if (noteInput.note) fields.note = noteInput.note
  if (noteInput.interruptionReason) fields.interruptionReason = noteInput.interruptionReason
  if (noteInput.estimatedProgress !== undefined) fields.estimatedProgress = noteInput.estimatedProgress
  if (noteInput.estimatedRemainingMinutes !== undefined) fields.estimatedRemainingMinutes = noteInput.estimatedRemainingMinutes
  if (noteInput.nextStartAction) fields.nextStartAction = noteInput.nextStartAction
  if (noteInput.note) fields.aiStatus = 'pending' satisfies AiStatus
  return fields
}

export async function completeWorkSession(
  sessionId: string,
  taskId: string,
  actualMinutes: number,
  noteInput?: SessionNoteInput,
) {
  await updateDoc(doc(db, 'workSessions', sessionId), {
    status: 'completed' satisfies SessionStatus,
    endedAt: serverTimestamp(),
    actualMinutes,
    ...noteFields(noteInput),
    updatedAt: serverTimestamp(),
  })
  await addActualMinutes(taskId, actualMinutes)
}

export async function endWorkSession(
  sessionId: string,
  taskId: string,
  actualMinutes: number,
  noteInput?: SessionNoteInput,
) {
  const status: SessionStatus = actualMinutes < 1 ? 'cancelled' : 'interrupted'
  await updateDoc(doc(db, 'workSessions', sessionId), {
    status,
    endedAt: serverTimestamp(),
    actualMinutes,
    ...noteFields(noteInput),
    updatedAt: serverTimestamp(),
  })
  await addActualMinutes(taskId, actualMinutes)
}

// Fire-and-forget AI summarization of a session's free-text note. Never re-processes
// (aiStatus gates this) and never called for empty notes (noteFields() only sets
// aiStatus: 'pending' when a note string is present).
export async function processSessionNoteWithAI(sessionId: string, note: string, currentActionTitle: string, actionId?: string) {
  try {
    const result = await processSessionNote(note, currentActionTitle)
    const suggestedActions: SuggestedAction[] = result.suggestedActions.map((s) => {
      const withTarget: SuggestedAction = { ...s }
      if (s.recommendationType === 'overwrite_current' && actionId) {
        withTarget.targetActionId = actionId
      }
      return withTarget
    })
    await updateDoc(doc(db, 'workSessions', sessionId), {
      structured: result.structured,
      suggestedActions,
      aiStatus: 'processed' satisfies AiStatus,
      aiProcessedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[processSessionNoteWithAI]', err)
    try {
      await updateDoc(doc(db, 'workSessions', sessionId), {
        aiStatus: 'failed' satisfies AiStatus,
        updatedAt: serverTimestamp(),
      })
    } catch (err2) {
      console.error('[processSessionNoteWithAI] failed to mark session note as failed', err2)
    }
  }
}

// Used by Overlay to resume into an already-active session for this action
// (e.g. reached via Today's "戻る" CTA) instead of creating a duplicate one.
export async function getActiveSessionForAction(userId: string, actionId: string): Promise<WorkSession | null> {
  const q = query(
    collection(db, 'workSessions'),
    where('userId', '==', userId),
    where('actionId', '==', actionId),
    where('status', '==', 'active'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as WorkSession
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

// Extends the active session's planned length in place (Mission overtime's
// "もう少しで終わる"/"時間を追加" choices, or break's "休憩を延長する").
export async function extendWorkSession(sessionId: string, additionalMinutes: number) {
  await updateDoc(doc(db, 'workSessions', sessionId), {
    plannedMinutes: increment(additionalMinutes),
    updatedAt: serverTimestamp(),
  })
}

// How many times this action's sessions have ended as interrupted/cancelled
// (any time, not just today) — used to gently flag "this Mission keeps
// getting avoided" rather than a strict daily count.
export async function countInterruptions(userId: string, actionId: string): Promise<number> {
  const q = query(
    collection(db, 'workSessions'),
    where('userId', '==', userId),
    where('actionId', '==', actionId),
    where('status', 'in', ['interrupted', 'cancelled']),
  )
  const snap = await getDocs(q)
  return snap.size
}

export async function getLatestBreakStartSession(userId: string, actionId: string): Promise<WorkSession | null> {
  const q = query(
    collection(db, 'workSessions'),
    where('userId', '==', userId),
    where('actionId', '==', actionId),
    where('noteTrigger', '==', 'break_start'),
    orderBy('startedAt', 'desc'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as WorkSession
}
