import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

export interface MainGoal {
  name: string
  weeklyTargetMinutes: number
}

export interface ScopeGuard {
  doNow: string[]
  notNow: string[]
}

// HH:mm形式。週次プランニングで「今からnew Date()」の代わりに使う、
// 曜日ごとの1日の開始/終了デフォルト時刻。
export interface WeekdaySchedule {
  start: string
  end: string
}

// キーは Date.getDay() (0=日曜〜6=土曜) の文字列。
export type WeekdayScheduleMap = Record<string, WeekdaySchedule>

export const DEFAULT_WEEKDAY_SCHEDULE: WeekdayScheduleMap = {
  '0': { start: '09:00', end: '22:00' },
  '1': { start: '08:00', end: '22:00' },
  '2': { start: '08:00', end: '22:00' },
  '3': { start: '08:00', end: '22:00' },
  '4': { start: '08:00', end: '22:00' },
  '5': { start: '08:00', end: '22:00' },
  '6': { start: '09:00', end: '22:00' },
}

export interface UserSettings {
  mainGoal?: MainGoal
  weekdayCapacityMinutes?: number
  weekendCapacityMinutes?: number
  scopeGuard?: ScopeGuard
  weekdaySchedule?: WeekdayScheduleMap
}

export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  const snap = await getDoc(doc(db, 'userSettings', userId))
  return snap.exists() ? (snap.data() as UserSettings) : null
}

export function subscribeUserSettings(userId: string, callback: (settings: UserSettings | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'userSettings', userId),
    (snap) => {
      callback(snap.exists() ? (snap.data() as UserSettings) : null)
    },
    (err) => console.error('[subscribeUserSettings]', err.code, err.message),
  )
}

export async function setMainGoal(userId: string, goal: MainGoal) {
  await setDoc(doc(db, 'userSettings', userId), { mainGoal: goal, updatedAt: serverTimestamp() }, { merge: true })
}

export async function setCapacitySettings(userId: string, weekdayCapacityMinutes: number, weekendCapacityMinutes: number) {
  await setDoc(
    doc(db, 'userSettings', userId),
    { weekdayCapacityMinutes, weekendCapacityMinutes, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export async function setScopeGuard(userId: string, scopeGuard: ScopeGuard) {
  await setDoc(doc(db, 'userSettings', userId), { scopeGuard, updatedAt: serverTimestamp() }, { merge: true })
}

export async function setWeekdaySchedule(userId: string, weekdaySchedule: WeekdayScheduleMap) {
  await setDoc(doc(db, 'userSettings', userId), { weekdaySchedule, updatedAt: serverTimestamp() }, { merge: true })
}
