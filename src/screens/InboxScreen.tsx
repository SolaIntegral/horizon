import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { createInboxTask, deleteTask, subscribeInboxTasks, updateTaskText, type Task } from '../lib/tasks'
import { formatRelativeTime } from '../lib/dateUtils'
import HelpButton from '../components/HelpButton'

type CaptureTab = 'text' | 'voice' | 'quickadd'

const captureTabs: { id: CaptureTab; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'voice', label: 'Voice' },
  { id: 'quickadd', label: 'Quick Add' },
]

function CapturedItem({ task }: { task: Task }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(task.originalInput)

  const createdAt = task.createdAt?.toDate?.() ?? new Date()

  const handleSaveEdit = async () => {
    if (editText.trim()) {
      await updateTaskText(task.id, editText.trim())
    }
    setEditing(false)
  }

  const handleDelete = async () => {
    setMenuOpen(false)
    await deleteTask(task.id)
  }

  if (editing) {
    return (
      <div className="neumorphic-raised bg-surface rounded-lg p-5 space-y-3">
        <textarea
          className="w-full p-3 text-sm neumorphic-sunken border-none rounded-lg focus:ring-2 focus:ring-primary/20 bg-surface resize-none"
          rows={3}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => {
              setEditText(task.originalInput)
              setEditing(false)
            }}
            className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button onClick={handleSaveEdit} className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-white">
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="neumorphic-raised bg-surface rounded-lg p-5 flex items-center gap-4 border-l-4 border-secondary">
      <div className="w-12 h-12 bg-surface-container-highest rounded-full flex items-center justify-center neumorphic-sunken">
        <span className="material-symbols-outlined text-secondary animate-pulse">hourglass_top</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-lg font-semibold text-on-surface truncate">{task.originalInput}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-on-surface-variant">{formatRelativeTime(createdAt)}</span>
          <span className="px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded-full text-[10px] font-bold">
            Waiting for AI Diagnosis
          </span>
        </div>
      </div>
      <Link
        to={`/diagnose/${task.id}`}
        className="neumorphic-raised bg-primary-container text-on-primary px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-lg">psychology</span>
        <span>Diagnose</span>
      </Link>
      <div className="relative">
        {menuOpen && <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />}
        <button onClick={() => setMenuOpen((v) => !v)} className="relative z-20 neumorphic-raised p-2 rounded-full">
          <span className="material-symbols-outlined">more_vert</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 w-32 neumorphic-raised bg-surface rounded-xl p-2 z-20">
            <button
              onClick={() => {
                setMenuOpen(false)
                setEditing(true)
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold hover:bg-surface-container-high"
            >
              編集
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-secondary hover:bg-surface-container-high"
            >
              削除
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function InboxScreen() {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [activeTab, setActiveTab] = useState<CaptureTab>('text')
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<any>(null)
  const [inboxTasks, setInboxTasks] = useState<Task[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeInboxTasks(user.uid, setInboxTasks)
    return unsubscribe
  }, [user])

  const handleMicClick = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      return
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      alert('音声入力はこのブラウザでは利用できません')
      return
    }
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'ja-JP'
    recognition.interimResults = false
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string
      setText((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setIsRecording(false)
    recognition.onerror = () => setIsRecording(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsRecording(true)
  }

  const handlePasteClick = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText) {
        setText((prev) => (prev ? `${prev}\n${clipboardText}` : clipboardText))
      }
    } catch {
      alert('クリップボードの読み取りに失敗しました。ブラウザの権限設定を確認してください。')
    }
  }

  const handleAddToInbox = async () => {
    if (!user || !text.trim()) return
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length === 0) return
    setSubmitting(true)
    try {
      await Promise.all(lines.map((line) => createInboxTask(user.uid, line)))
      setText('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-3xl font-bold text-primary">Inbox</h2>
            <HelpButton title="Inboxの使い方">
              <p>思いついたことをそのまま書いて「Add to Inbox」で記録する画面です。判断は後回しにして、まず書き出すことに集中してください。</p>
              <p>複数行入力すると、1行が1タスクとして登録されます（例のとおり「1行につき1タスク」）。</p>
              <p>記録したタスクは「Captured Today」に並びます。「Diagnose」を押すと、そのタスクをActionへ分割する計画作成画面に進みます。「⋮」から編集・削除もできます。</p>
            </HelpButton>
          </div>
        </header>

        <section className="flex flex-col items-center space-y-6">
          <div className="w-full relative">
            <textarea
              className="w-full h-40 p-6 font-medium text-lg bg-background neumorphic-sunken border-none rounded-xl focus:ring-2 focus:ring-primary/20 placeholder-outline/50 resize-none"
              placeholder="どんなことでもそのまま書く。1行につき1タスクになります (例：研究の背景スライド直し)"
              value={text}
              onChange={(e) => setText(e.target.value)}
            ></textarea>
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                onClick={handleMicClick}
                className={`p-2 rounded-full transition-all ${
                  isRecording
                    ? 'neumorphic-sunken bg-secondary text-white animate-pulse'
                    : 'neumorphic-raised bg-surface-container text-primary hover:scale-110 active:scale-95'
                }`}
              >
                <span className="material-symbols-outlined">mic</span>
              </button>
              <button
                onClick={handlePasteClick}
                className="neumorphic-raised bg-surface-container p-2 rounded-full text-primary hover:scale-110 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined">content_paste</span>
              </button>
            </div>
          </div>

          <div className="flex gap-4 px-2 overflow-x-auto w-full justify-center scrollbar-hide">
            {captureTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`neumorphic-raised px-6 py-2 rounded-full text-sm font-bold transition-all ${
                  activeTab === tab.id ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            className="w-full max-w-sm neumorphic-raised bg-primary text-on-primary rounded-full py-4 px-8 text-xl font-bold flex items-center justify-center gap-3 hover:bg-primary-container transition-colors disabled:opacity-50"
            onClick={handleAddToInbox}
            disabled={submitting || !text.trim()}
          >
            <span className="material-symbols-outlined">add_circle</span>
            <span>Add to Inbox</span>
          </button>
        </section>

        <section className="space-y-6">
          <h3 className="text-2xl font-bold text-primary border-b border-outline-variant/30 pb-2">Captured Today</h3>
          <div className="space-y-4">
            {inboxTasks.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-8">まだ何も入っていません。</p>
            )}
            {inboxTasks.map((task) => (
              <CapturedItem key={task.id} task={task} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
