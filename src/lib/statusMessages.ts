// Rule-based status message engine (no AI call — fixed message pools chosen by
// computed state signals). Tone: "整える" (help re-adjust), never "詰める" (scold).
//
// Conditions ①⑤⑨ from the original 10-condition spec need data/UI not yet
// built (scheduled start time, an "important task" flag, and a completion
// event trigger respectively) and are not wired in. ②③⑩ use the live
// workSession from Phase 4.

export interface ActiveSessionContext {
  type: 'focus' | 'break'
  elapsedMinutes: number
  plannedMinutes: number
}

export interface StatusContext {
  completedActionsToday: number
  tasksNearDeadlineUndecomposed: number
  totalActiveMinutes: number
  maxSkipCount: number
  activeSession?: ActiveSessionContext | null
  now?: Date
}

const messagePools = {
  breakOverrunLight: [
    'そろそろ次のミッションに戻る時間です。',
    '休憩、いい感じですね。戻る準備を始めましょうか。',
  ],
  breakOverrun: [
    '休憩は十分取れています。そろそろ軽めのActionから戻りましょう。',
    'いきなり全力でなくて大丈夫です。まずは5分だけ再開しましょう。',
    '戻るタイミングです。次のActionは小さめにして始めましょう。',
  ],
  continuousWork: [
    'そろそろ一度リセットしてもよさそうです。5分だけ休憩しませんか？',
    'いいペースです。ここで少し休むと、次の作業も崩れにくくなります。',
    '集中が続いています。疲れ切る前に、軽く立ち上がっておきましょう。',
  ],
  breakAllowed: [
    'かなり進んでいます。次に入る前に、少し休んでも大丈夫です。',
    'ここまでで十分前進しています。一度休憩して、次のActionに備えましょう。',
    '連続で進められています。今休むのはサボりではなく、次のための準備です。',
  ],
  deadlineSoon: [
    '締切が近づいています。今のうちにActionへ分解しておきましょう。',
    'まだ間に合いますが、ここで分けておかないと直前に重くなりそうです。',
    'まずは提出までの道筋を15分単位で見える化しましょう。',
  ],
  overloaded: [
    '今日の予定は少し詰まりすぎています。残すものと明日に回すものを分けましょう。',
    '全部やろうとすると崩れそうです。最低限やるActionだけに絞りませんか？',
    '今は頑張るより、計画を現実的に直すタイミングです。',
  ],
  repeatedSkip: [
    'このタスクは何度か後ろに回っています。大きすぎる可能性があります。',
    '進めにくさがありそうです。まずは15分でできる形に分解しましょう。',
    '先送りが続いています。今やるべきなのは作業ではなく、タスクを小さくすることかもしれません。',
  ],
  lateNight: [
    '夜は集中しやすいですが、明日の負担も考えて区切りを作りましょう。',
    'ここから先は伸ばしすぎ注意です。次の15分で一度区切るのがおすすめです。',
    'まだ進められそうでも、今日はここで止める選択肢もあります。',
  ],
  onTrack: [
    '順調に進んでいます。この調子で次の15分に集中しましょう。',
    '今のところ良いペースです。次のActionも無理なく進められそうです。',
    '落ち着いて進められています。このリズムを大事にしましょう。',
  ],
}

function pickRandom(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]
}

const OVERLOAD_THRESHOLD_MINUTES = 180
const BREAK_OVERRUN_LIGHT_THRESHOLD_MINUTES = 10
const BREAK_OVERRUN_HEAVY_THRESHOLD_MINUTES = 20
const CONTINUOUS_WORK_THRESHOLD_MINUTES = 60
const LATE_NIGHT_START_HOUR = 23
const LATE_NIGHT_END_HOUR = 5

function isLateNight(now: Date): boolean {
  const hour = now.getHours()
  return hour >= LATE_NIGHT_START_HOUR || hour < LATE_NIGHT_END_HOUR
}

export function getStatusMessage(ctx: StatusContext): string {
  const now = ctx.now ?? new Date()

  if (ctx.activeSession?.type === 'break') {
    const overrun = ctx.activeSession.elapsedMinutes - ctx.activeSession.plannedMinutes
    if (overrun >= BREAK_OVERRUN_HEAVY_THRESHOLD_MINUTES) return pickRandom(messagePools.breakOverrun)
    if (overrun >= BREAK_OVERRUN_LIGHT_THRESHOLD_MINUTES) return pickRandom(messagePools.breakOverrunLight)
  }

  if (ctx.activeSession?.type === 'focus') {
    if (ctx.activeSession.elapsedMinutes >= CONTINUOUS_WORK_THRESHOLD_MINUTES) return pickRandom(messagePools.continuousWork)
  }

  if (ctx.completedActionsToday >= 3) return pickRandom(messagePools.breakAllowed)
  if (ctx.tasksNearDeadlineUndecomposed > 0) return pickRandom(messagePools.deadlineSoon)
  if (ctx.totalActiveMinutes > OVERLOAD_THRESHOLD_MINUTES) return pickRandom(messagePools.overloaded)
  if (ctx.maxSkipCount >= 2) return pickRandom(messagePools.repeatedSkip)

  if (ctx.activeSession?.type === 'focus' && isLateNight(now)) return pickRandom(messagePools.lateNight)

  return pickRandom(messagePools.onTrack)
}
