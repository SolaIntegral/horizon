import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { processProgressNote } from './ai'

export type NoteTrigger = 'done' | 'break_start' | 'exit' | 'manual'
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

export interface ProgressNote {
  id: string
  userId: string
  taskId: string
  actionId?: string
  sessionId: string
  rawNote: string
  trigger: NoteTrigger
  aiStatus: AiStatus
  structured?: {
    doneSummary?: string
    nextSummary?: string
    blockerSummary?: string
    ideaSummary?: string
  }
  suggestedActions?: SuggestedAction[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
  aiProcessedAt?: Timestamp
}

export async function createProgressNote(
  userId: string,
  taskId: string,
  actionId: string,
  sessionId: string,
  rawNote: string,
  trigger: NoteTrigger,
): Promise<string> {
  const docRef = await addDoc(collection(db, 'progressNotes'), {
    userId,
    taskId,
    actionId,
    sessionId,
    rawNote,
    trigger,
    aiStatus: 'pending' satisfies AiStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function processNoteWithAI(noteId: string, rawNote: string, currentActionTitle: string, targetActionId: string) {
  try {
    const result = await processProgressNote(rawNote, currentActionTitle)
    const suggestedActions: SuggestedAction[] = result.suggestedActions.map((s) => {
      const withTarget: SuggestedAction = { ...s }
      if (s.recommendationType === 'overwrite_current') {
        withTarget.targetActionId = targetActionId
      }
      return withTarget
    })
    await updateDoc(doc(db, 'progressNotes', noteId), {
      structured: result.structured,
      suggestedActions,
      aiStatus: 'processed' satisfies AiStatus,
      aiProcessedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[processNoteWithAI]', err)
    try {
      await updateDoc(doc(db, 'progressNotes', noteId), {
        aiStatus: 'failed' satisfies AiStatus,
        updatedAt: serverTimestamp(),
      })
    } catch (err2) {
      console.error('[processNoteWithAI] failed to mark note as failed', err2)
    }
  }
}

export async function getLatestBreakStartNote(userId: string, actionId: string): Promise<ProgressNote | null> {
  const q = query(
    collection(db, 'progressNotes'),
    where('userId', '==', userId),
    where('actionId', '==', actionId),
    where('trigger', '==', 'break_start'),
    orderBy('createdAt', 'desc'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as ProgressNote
}
