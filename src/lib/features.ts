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

export type FeatureColumn = 'mvp' | 'next' | 'later' | 'ideas'
export type FeatureStatus = 'idea' | 'selected' | 'designing' | 'ready' | 'building' | 'testing' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface FeatureNote {
  text: string
  createdAt: Timestamp
}

export interface Feature {
  id: string
  userId: string
  name: string
  description: string
  column: FeatureColumn
  status: FeatureStatus
  priority: Priority
  difficulty: Difficulty
  tags: string[]
  purpose?: string
  whyNeeded?: string
  mvpScope?: string
  laterScope?: string
  requiredScreens?: string
  requiredData?: string
  claudeCodeNotes?: string
  compareNotes?: string
  notes: FeatureNote[]
  isCurrentFocus: boolean
  focusReason?: string
  focusExpectedEffect?: string
  focusNextAction?: string
  readyForClaudeCode: boolean
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

const featuresCollection = collection(db, 'features')

export interface NewFeatureInput {
  name: string
  description: string
  column: FeatureColumn
  priority: Priority
  difficulty: Difficulty
  tags: string[]
}

export async function createFeature(userId: string, input: NewFeatureInput): Promise<string> {
  const docRef = await addDoc(featuresCollection, {
    userId,
    ...input,
    status: 'idea' satisfies FeatureStatus,
    notes: [],
    isCurrentFocus: false,
    readyForClaudeCode: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export function subscribeFeatures(userId: string, callback: (features: Feature[]) => void): Unsubscribe {
  const q = query(featuresCollection, where('userId', '==', userId), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Feature)),
    (err) => console.error('[subscribeFeatures]', err.code, err.message),
  )
}

export async function updateFeature(featureId: string, updates: Partial<Omit<Feature, 'id' | 'userId' | 'notes'>>) {
  await updateDoc(doc(db, 'features', featureId), { ...updates, updatedAt: serverTimestamp() })
}

export async function deleteFeature(featureId: string) {
  await deleteDoc(doc(db, 'features', featureId))
}

export async function addFeatureNote(featureId: string, text: string) {
  await updateDoc(doc(db, 'features', featureId), {
    notes: arrayUnion({ text, createdAt: Timestamp.now() }),
    updatedAt: serverTimestamp(),
  })
}

export async function setCurrentFocus(
  featureId: string,
  previousFocusId: string | null,
  focus: { reason: string; expectedEffect: string; nextAction: string },
) {
  if (previousFocusId && previousFocusId !== featureId) {
    await updateDoc(doc(db, 'features', previousFocusId), { isCurrentFocus: false, updatedAt: serverTimestamp() })
  }
  await updateDoc(doc(db, 'features', featureId), {
    isCurrentFocus: true,
    focusReason: focus.reason,
    focusExpectedEffect: focus.expectedEffect,
    focusNextAction: focus.nextAction,
    updatedAt: serverTimestamp(),
  })
}

// Seeds the Roadmap Board with this app's real, already-shipped feature history so
// the tool feels immediately useful instead of starting empty. Only ever called
// once, when a user has zero features.
export async function seedInitialFeatures(userId: string) {
  const shipped: NewFeatureInput[] = [
    { name: 'Dump Inbox', description: '思いついたことをそのまま書き込み、複数行なら複数タスクとして取り込む。', column: 'mvp', priority: 'high', difficulty: 'easy', tags: ['#Next15'] },
    { name: 'Task Diagnose', description: 'AIがタスクのリスク・見積時間・最初の一歩を判定する。', column: 'mvp', priority: 'high', difficulty: 'medium', tags: ['#TaskDiagnose', '#AI'] },
    { name: 'Today Dashboard', description: '今日のNext 15 ActionとAIステータスメッセージを表示する。', column: 'mvp', priority: 'high', difficulty: 'medium', tags: ['#Next15'] },
    { name: 'Work / Rest Overlay', description: '作業・休憩の状態遷移と、休憩後の復帰導線をAIが提案する。', column: 'mvp', priority: 'high', difficulty: 'hard', tags: ['#Overlay', '#Recovery', '#AI'] },
    { name: 'Weekly Capacity', description: '曜日別の稼働可能時間と締切に基づく週間の負荷グラフ。', column: 'next', priority: 'medium', difficulty: 'medium', tags: ['#Capacity'] },
    { name: 'Growth Log', description: '振り返りをAIが整理し、クイズと明日のチャレンジを生成する。', column: 'next', priority: 'medium', difficulty: 'medium', tags: ['#Growth', '#AI'] },
  ]

  const buildRoadmapItself: NewFeatureInput = {
    name: 'Build Roadmap / Idea Parking',
    description: 'このツール自体の実装候補を整理し、広い思いつきを一時的に貯めておく開発管理画面。',
    column: 'mvp',
    priority: 'medium',
    difficulty: 'hard',
    tags: ['#DevTool'],
  }

  for (const input of shipped) {
    const id = await createFeature(userId, input)
    await updateFeature(id, { status: 'done' })
  }
  const buildRoadmapId = await createFeature(userId, buildRoadmapItself)
  await updateFeature(buildRoadmapId, { status: 'building' })
  await setCurrentFocus(buildRoadmapId, null, {
    reason: '自分専用の開発管理画面がないと、次に何を作るか毎回考え直すことになるため。',
    expectedEffect: 'MVP/Next/Later/Ideasを見える化し、機能追加が膨らみすぎるのを防ぐ。',
    nextAction: 'Roadmap BoardとIdea Parkingの基本操作を一通り試す。',
  })
}
