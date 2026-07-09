import {
  addDoc,
  arrayUnion,
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

export type IdeaCategory = 'app_idea' | 'research' | 'design' | 'learning' | 'life_workflow' | 'writing' | 'other'
export type IdeaStatus = 'raw' | 'growing' | 'maybe_task' | 'converted' | 'archived'

export interface IdeaNote {
  text: string
  createdAt: Timestamp
}

export interface Idea {
  id: string
  userId: string
  title: string
  memo: string
  category: IdeaCategory
  status: IdeaStatus
  tags: string[]
  pinned: boolean
  notes: IdeaNote[]
  linkedFeatureId?: string
  aiSuggestion?: string
  aiOptions?: string[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const ideasCollection = collection(db, 'ideas')

export async function createIdea(
  userId: string,
  title: string,
  memo: string,
  category: IdeaCategory = 'other',
): Promise<string> {
  const docRef = await addDoc(ideasCollection, {
    userId,
    title,
    memo,
    category,
    status: 'raw' satisfies IdeaStatus,
    tags: [],
    pinned: false,
    notes: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export function subscribeIdeas(userId: string, callback: (ideas: Idea[]) => void): Unsubscribe {
  const q = query(ideasCollection, where('userId', '==', userId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Idea)),
    (err) => console.error('[subscribeIdeas]', err.code, err.message),
  )
}

export async function updateIdea(ideaId: string, updates: Partial<Omit<Idea, 'id' | 'userId' | 'notes'>>) {
  await updateDoc(doc(db, 'ideas', ideaId), { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteIdea(ideaId: string) {
  await deleteDoc(doc(db, 'ideas', ideaId))
}

export async function addIdeaNote(ideaId: string, text: string) {
  await updateDoc(doc(db, 'ideas', ideaId), {
    notes: arrayUnion({ text, createdAt: Timestamp.now() }),
    updatedAt: serverTimestamp(),
  })
}

export async function togglePin(ideaId: string, pinned: boolean) {
  await updateDoc(doc(db, 'ideas', ideaId), { pinned, updatedAt: serverTimestamp() })
}
