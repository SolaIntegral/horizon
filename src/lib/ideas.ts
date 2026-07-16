import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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

export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple'
export type IdeaKind = 'sticky' | 'text'

export const STICKY_COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green', 'purple']

export interface Idea {
  id: string
  userId: string
  memo: string
  kind: IdeaKind
  color: StickyColor
  rotation: number
  x: number
  y: number
  linkedFeatureId?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const ideasCollection = collection(db, 'ideas')

export async function createIdea(userId: string, memo: string, x: number, y: number, kind: IdeaKind = 'sticky'): Promise<string> {
  const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
  const rotation = kind === 'sticky' ? Math.round(Math.random() * 6 - 3) : 0
  const docRef = await addDoc(ideasCollection, {
    userId,
    memo,
    kind,
    color,
    rotation,
    x,
    y,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export function subscribeIdeas(userId: string, callback: (ideas: Idea[]) => void): Unsubscribe {
  // Direction must match the deployed composite index (userId asc, createdAt desc) —
  // Firestore rejects queries whose orderBy direction doesn't match, and the failure
  // only surfaces as a silent onSnapshot error, so new ideas never showed up.
  const q = query(ideasCollection, where('userId', '==', userId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Idea)),
    (err) => console.error('[subscribeIdeas]', err.code, err.message),
  )
}

export async function updateIdea(ideaId: string, updates: Partial<Omit<Idea, 'id' | 'userId'>>) {
  await updateDoc(doc(db, 'ideas', ideaId), { ...updates, updatedAt: serverTimestamp() })
}

export async function moveIdea(ideaId: string, x: number, y: number) {
  await updateDoc(doc(db, 'ideas', ideaId), { x, y, updatedAt: serverTimestamp() })
}

export async function deleteIdea(ideaId: string) {
  await deleteDoc(doc(db, 'ideas', ideaId))
}
