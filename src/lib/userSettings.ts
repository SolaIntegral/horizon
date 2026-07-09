import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

export interface MainGoal {
  name: string
  weeklyTargetMinutes: number
}

export interface UserSettings {
  mainGoal?: MainGoal
  weekdayCapacityMinutes?: number
  weekendCapacityMinutes?: number
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
