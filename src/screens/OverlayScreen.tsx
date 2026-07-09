import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { completeAction, createAction, getAction, overwriteAction, startAction, type Action } from '../lib/actions'
import { completeWorkSession, createWorkSession, endWorkSession } from '../lib/workSessions'
import { createProgressNote, getLatestBreakStartNote, processNoteWithAI, type SuggestedAction } from '../lib/progressNotes'

type Phase = 'loading' | 'focus' | 'break' | 'suggestions' | 'error'
type NotePromptType = 'done' | 'break_start' | 'exit' | null

const BREAK_PLANNED_MINUTES = 5

function formatClock(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : ''
  const abs = Math.abs(totalSeconds)
  const m = Math.floor(abs / 60)
    .toString()
    .padStart(2, '0')
  const s = Math.floor(abs % 60)
    .toString()
    .padStart(2, '0')
  return `${sign}${m}:${s}`
}

export default function OverlayScreen() {
  const { user } = useAuth()
  const { taskId, actionId } = useParams<{ taskId: string; actionId: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('loading')
  const [action, setAction] = useState<Action | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [notePrompt, setNotePrompt] = useState<NotePromptType>(null)
  const [noteText, setNoteText] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestedAction[] | null>(null)
  const [editingAction, setEditingAction] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const initRef = useRef(false)

  useEffect(() => {
    if (!user || !taskId || !actionId || initRef.current) return
    initRef.current = true
    ;(async () => {
      const a = await getAction(actionId)
      if (!a) {
        setPhase('error')
        return
      }
      setAction(a)
      await startAction(actionId)
      const sid = await createWorkSession(user.uid, 'focus', taskId, actionId, a.estimatedMinutes)
      setSessionId(sid)
      setSessionStartedAt(new Date())
      setPhase('focus')
    })()
  }, [user, taskId, actionId])

  useEffect(() => {
    if (phase !== 'focus' && phase !== 'break') return
    setElapsedSeconds(0)
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  if (phase === 'loading') {
    return (
      <div className="flex-grow flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
      </div>
    )
  }

  if (phase === 'error' || !action || !user || !taskId || !actionId) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center gap-4">
        <p className="text-on-surface-variant">対象のActionが見つかりませんでした。</p>
        <Link to="/" className="text-primary font-bold">
          Todayに戻る
        </Link>
      </div>
    )
  }

  const currentElapsedMinutes = () => (sessionStartedAt ? (Date.now() - sessionStartedAt.getTime()) / 60000 : 0)

  const startEditAction = () => {
    setEditTitle(action.title)
    setEditMinutes(String(action.estimatedMinutes))
    setEditingAction(true)
  }

  const saveEditAction = async () => {
    const minutes = parseInt(editMinutes, 10)
    if (!editTitle.trim() || !minutes || minutes <= 0) return
    await overwriteAction(actionId, editTitle.trim(), minutes)
    setAction({ ...action, title: editTitle.trim(), estimatedMinutes: minutes })
    setEditingAction(false)
  }

  const performTakeBreak = async () => {
    if (sessionId) await completeWorkSession(sessionId, currentElapsedMinutes())
    const sid = await createWorkSession(user.uid, 'break', taskId, actionId, BREAK_PLANNED_MINUTES)
    setSessionId(sid)
    setSessionStartedAt(new Date())
    setPhase('break')
  }

  const startNewFocusSession = async () => {
    const sid = await createWorkSession(user.uid, 'focus', taskId, actionId, action.estimatedMinutes)
    setSessionId(sid)
    setSessionStartedAt(new Date())
    setPhase('focus')
  }

  const handleBackToWork = async () => {
    if (sessionId) await completeWorkSession(sessionId, currentElapsedMinutes())
    try {
      const note = await getLatestBreakStartNote(user.uid, actionId)
      if (note && note.aiStatus === 'processed' && note.suggestedActions && note.suggestedActions.length > 0) {
        setSuggestions(note.suggestedActions)
        setPhase('suggestions')
        return
      }
    } catch (err) {
      console.error('[handleBackToWork] failed to load suggestions, continuing without them', err)
    }
    await startNewFocusSession()
  }

  const handleChooseSuggestion = async (s: SuggestedAction) => {
    if (s.recommendationType === 'overwrite_current') {
      await overwriteAction(actionId, s.title, s.estimatedMinutes)
      setAction({ ...action, title: s.title, estimatedMinutes: s.estimatedMinutes })
    } else {
      await createAction(user.uid, taskId, action.taskTitle, s.title, s.estimatedMinutes)
    }
    setSuggestions(null)
    await startNewFocusSession()
  }

  const handleSkipSuggestions = async () => {
    setSuggestions(null)
    await startNewFocusSession()
  }

  const performDone = async () => {
    if (sessionId) await completeWorkSession(sessionId, currentElapsedMinutes())
    await completeAction(actionId)
    navigate('/')
  }

  const performExit = async () => {
    if (sessionId) await endWorkSession(sessionId, currentElapsedMinutes())
    navigate('/')
  }

  const handleNoteSkip = () => {
    const type = notePrompt
    setNotePrompt(null)
    setNoteText('')
    if (type === 'done') performDone()
    else if (type === 'break_start') performTakeBreak()
    else if (type === 'exit') performExit()
  }

  const handleNoteSave = async () => {
    const type = notePrompt
    const text = noteText.trim()
    setNotePrompt(null)
    setNoteText('')
    if (text && sessionId && type) {
      const noteId = await createProgressNote(user.uid, taskId, actionId, sessionId, text, type)
      processNoteWithAI(noteId, text, action.title, actionId)
    }
    if (type === 'done') await performDone()
    else if (type === 'break_start') await performTakeBreak()
    else if (type === 'exit') await performExit()
  }

  const plannedSeconds = (phase === 'focus' ? action.estimatedMinutes : BREAK_PLANNED_MINUTES) * 60
  const remainingSeconds = plannedSeconds - elapsedSeconds
  const isBreakOverrun = phase === 'break' && elapsedSeconds > plannedSeconds

  return (
    <div className="flex-grow flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[360px] neumorphic-raised rounded-xl overflow-hidden bg-surface transition-all duration-300">
        {phase === 'focus' && (
          <div className="p-10 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Working</span>
              </div>
              <button onClick={() => setNotePrompt('exit')} className="text-outline-variant hover:text-secondary transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="text-center py-2">
              <h2 className="text-7xl font-bold tracking-tight text-primary">{formatClock(remainingSeconds)}</h2>
              <p className="font-bold text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
                {remainingSeconds >= 0 ? 'left' : 'over'}
              </p>
            </div>
            <div className="neumorphic-sunken rounded-lg p-5 bg-surface">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-primary">bolt</span>
                  <span className="text-[10px] font-bold uppercase text-outline">Next 15 min</span>
                </div>
                {!editingAction && (
                  <button onClick={startEditAction} className="text-outline hover:text-primary transition-colors" title="編集">
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                )}
              </div>
              {editingAction ? (
                <div className="space-y-2">
                  <input
                    className="w-full p-2 text-sm font-bold neumorphic-raised border-none rounded-lg bg-surface"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                      value={editMinutes}
                      onChange={(e) => setEditMinutes(e.target.value)}
                    />
                    <span className="text-xs text-on-surface-variant">分</span>
                    <div className="flex-1"></div>
                    <button onClick={() => setEditingAction(false)} className="px-3 py-1.5 rounded-full text-xs font-bold text-on-surface-variant">
                      Cancel
                    </button>
                    <button onClick={saveEditAction} className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-bold leading-relaxed text-on-surface">{action.title}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setNotePrompt('break_start')}
                className="flex-1 btn-squish neumorphic-raised text-on-surface-variant font-bold py-4 rounded-full"
              >
                Take Break
              </button>
              <button
                onClick={() => setNotePrompt('done')}
                className="flex-1 btn-squish bg-primary text-on-primary font-bold py-4 rounded-full shadow-lg shadow-primary/20"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {phase === 'break' && (
          <div className="p-10 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-secondary rounded-full"></div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Break</span>
              </div>
              <button onClick={() => setNotePrompt('exit')} className="text-outline-variant hover:text-secondary transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="text-center py-2">
              <h2 className="text-7xl font-bold tracking-tight text-secondary">{formatClock(elapsedSeconds)}</h2>
              <p className="font-bold text-xs text-on-surface-variant mt-2 uppercase tracking-widest">
                {isBreakOverrun ? `${Math.floor((elapsedSeconds - plannedSeconds) / 60)}m over` : 'elapsed'}
              </p>
            </div>
            <div className="neumorphic-sunken rounded-lg p-5 border-l-4 border-secondary/30 bg-surface">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-secondary">Returning Step</p>
                {!editingAction && (
                  <button onClick={startEditAction} className="text-outline hover:text-secondary transition-colors" title="編集">
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>
                )}
              </div>
              {editingAction ? (
                <div className="space-y-2">
                  <input
                    className="w-full p-2 text-sm font-bold neumorphic-raised border-none rounded-lg bg-surface"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-20 p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
                      value={editMinutes}
                      onChange={(e) => setEditMinutes(e.target.value)}
                    />
                    <span className="text-xs text-on-surface-variant">分</span>
                    <div className="flex-1"></div>
                    <button onClick={() => setEditingAction(false)} className="px-3 py-1.5 rounded-full text-xs font-bold text-on-surface-variant">
                      Cancel
                    </button>
                    <button onClick={saveEditAction} className="px-3 py-1.5 rounded-full text-xs font-bold bg-secondary text-white">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-bold leading-relaxed text-on-surface">{action.title}</p>
              )}
            </div>
            <button
              onClick={handleBackToWork}
              className="btn-squish w-full bg-secondary text-on-secondary font-bold py-4 rounded-full shadow-lg shadow-secondary/20"
            >
              Back to Work
            </button>
          </div>
        )}

        {phase === 'suggestions' && suggestions && (
          <div className="p-10 flex flex-col gap-6">
            <p className="text-sm font-bold text-on-surface">休憩前のメモから、次の15分Actionを提案します。</p>
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleChooseSuggestion(s)}
                  className="w-full text-left p-4 neumorphic-raised rounded-xl hover:scale-[1.01] transition-transform"
                >
                  <p className="text-sm font-bold text-primary">{s.title}</p>
                  {s.reason && <p className="text-xs text-on-surface-variant mt-1">{s.reason}</p>}
                  <p className="text-[10px] text-outline mt-1 uppercase font-bold">
                    {s.recommendationType === 'overwrite_current' ? '現在のActionを上書き' : '新しいActionとして追加'} ・{' '}
                    {s.estimatedMinutes}m
                  </p>
                </button>
              ))}
            </div>
            <button onClick={handleSkipSuggestions} className="text-sm font-bold text-on-surface-variant hover:text-primary">
              自分で決める
            </button>
          </div>
        )}
      </div>

      {notePrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6">
          <div className="w-full max-w-sm neumorphic-raised bg-surface rounded-xl p-8 space-y-4">
            <p className="text-sm font-bold text-on-surface">
              {notePrompt === 'done' && '今回の進捗を1行だけ残しますか？'}
              {notePrompt === 'break_start' && '休憩後に戻りやすくするために、今の状況をメモしますか？'}
              {notePrompt === 'exit' && '再開しやすくするために、今どこまで進んだかを1行だけ残しますか？'}
            </p>
            <textarea
              className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
              rows={3}
              placeholder="例：背景の導入は書けた。次は先行研究を1つ追加する。"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleNoteSkip}
                className="flex-1 py-3 rounded-full text-sm font-bold text-on-surface-variant hover:bg-surface-container"
              >
                Skip
              </button>
              <button onClick={handleNoteSave} className="flex-1 py-3 rounded-full text-sm font-bold bg-primary text-white">
                {notePrompt === 'exit' ? 'Save and Exit' : notePrompt === 'break_start' ? 'Save and Break' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
