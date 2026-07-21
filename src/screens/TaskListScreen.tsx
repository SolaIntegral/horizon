import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { useAuth } from '../lib/AuthContext'
import { subscribeScheduledTasks, updateTaskDetails, type Task, type TaskStatus } from '../lib/tasks'
import { subscribeActionsForTask, completeAction, completeTaskManually, overwriteAction, type Action } from '../lib/actions'
import { formatDateKey } from '../lib/dateUtils'

const statusLabel: Record<TaskStatus, string> = {
  inbox: '未整理',
  planned: '計画済み',
  in_progress: '進行中',
  interrupted: '中断中',
  done: '完了',
}

const actionStatusLabel: Record<Action['status'], string> = {
  todo: '未着手',
  doing: '作業中',
  done: '完了',
  skipped: 'スキップ',
}

// 展開したときだけそのTaskのActionを購読する — 常時全Task×全Actionを
// 購読すると、doneが溜まるにつれて重くなるため(「軽い一覧」の方針)。
function ActionRow({ action, userId }: { action: Action; userId: string }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [minutes, setMinutes] = useState('')
  const [criteria, setCriteria] = useState('')

  const startEdit = () => {
    setTitle(action.title)
    setMinutes(String(action.estimatedMinutes))
    setCriteria(action.completionCriteria ?? '')
    setEditing(true)
  }

  const save = async () => {
    const mins = parseInt(minutes, 10)
    if (!title.trim() || !mins || mins <= 0) return
    await overwriteAction(action.id, title.trim(), mins, criteria.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="neumorphic-sunken rounded-lg p-2.5 space-y-2">
        <input
          className="w-full p-2 text-sm font-bold neumorphic-raised border-none rounded-lg bg-surface"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <input
          className="w-full p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface"
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="完了条件"
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            className="w-20 p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <span className="text-xs text-on-surface-variant">分</span>
          <div className="flex-1"></div>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-full text-xs font-bold text-on-surface-variant">
            Cancel
          </button>
          <button onClick={save} className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-white">
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 neumorphic-sunken rounded-lg p-2.5">
      <div className="min-w-0">
        <p
          className={`text-sm truncate ${
            action.status === 'done' || action.status === 'skipped' ? 'text-on-surface-variant line-through' : 'text-on-surface font-bold'
          }`}
        >
          {action.title}
        </p>
        <p className="text-[10px] text-outline">
          {action.estimatedMinutes}分 ・ {actionStatusLabel[action.status]}
        </p>
      </div>
      {(action.status === 'todo' || action.status === 'doing') && (
        <div className="flex gap-3 flex-shrink-0">
          <button onClick={startEdit} className="text-xs font-bold text-primary hover:underline">
            編集
          </button>
          <button onClick={() => completeAction(action.id, action.taskId, userId)} className="text-xs font-bold text-primary hover:underline">
            完了にする
          </button>
        </div>
      )}
    </div>
  )
}

// 展開したときだけそのTaskのActionを購読する — 常時全Task×全Actionを
// 購読すると、doneが溜まるにつれて重くなるため(「軽い一覧」の方針)。
function TaskRow({ task, userId }: { task: Task; userId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [actions, setActions] = useState<Action[]>([])

  const [editingTask, setEditingTask] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editOutputGoal, setEditOutputGoal] = useState('')
  const [editCurrentState, setEditCurrentState] = useState('')
  const [editDeadline, setEditDeadline] = useState('')

  useEffect(() => {
    if (!expanded) return
    return subscribeActionsForTask(userId, task.id, setActions)
  }, [expanded, userId, task.id])

  const finishedCount = actions.filter((a) => a.status === 'done' || a.status === 'skipped').length

  const handleCompleteTask = () => {
    if (!confirm(`「${task.title}」を完了にしますか？まだ終わっていないActionはスキップ扱いになります。`)) return
    completeTaskManually(userId, task.id)
  }

  const startEditTask = () => {
    setEditTitle(task.title)
    setEditOutputGoal(task.outputGoal ?? '')
    setEditCurrentState(task.currentState ?? '')
    setEditDeadline(task.deadline ? formatDateKey(task.deadline.toDate()) : '')
    setEditingTask(true)
  }

  const saveEditTask = async () => {
    if (!editTitle.trim()) return
    await updateTaskDetails(task.id, {
      title: editTitle.trim(),
      outputGoal: editOutputGoal.trim(),
      currentState: editCurrentState.trim(),
      deadline: editDeadline ? Timestamp.fromDate(new Date(`${editDeadline}T23:59:59`)) : null,
    })
    setEditingTask(false)
  }

  if (editingTask) {
    return (
      <div className="neumorphic-raised bg-surface rounded-lg p-4 space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-bold text-outline">タイトル</label>
          <input
            className="w-full p-2.5 text-sm font-bold neumorphic-sunken border-none rounded-lg bg-surface"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-outline">完成イメージ（アウトプット）</label>
          <textarea
            className="w-full h-16 p-2.5 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
            value={editOutputGoal}
            onChange={(e) => setEditOutputGoal(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-outline">現在地（どこまで出来ているか）</label>
          <textarea
            className="w-full h-16 p-2.5 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
            value={editCurrentState}
            onChange={(e) => setEditCurrentState(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-outline">締切（任意）</label>
          <input
            type="date"
            className="p-2.5 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            value={editDeadline}
            onChange={(e) => setEditDeadline(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={() => setEditingTask(false)} className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant">
            Cancel
          </button>
          <button onClick={saveEditTask} className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-white">
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="neumorphic-raised bg-surface rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex-1 text-left min-w-0">
          <p className="text-sm font-bold text-on-surface truncate">{task.title || task.originalInput}</p>
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <span className="px-2 py-0.5 bg-surface-container-highest rounded-full text-[10px] font-bold text-on-surface-variant">
              {statusLabel[task.status]}
            </span>
            {task.deadline && (
              <span className="text-xs text-outline">
                締切: {task.deadline.toDate().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })}
              </span>
            )}
            {expanded && actions.length > 0 && (
              <span className="text-xs text-outline">
                {finishedCount}/{actions.length} 完了
              </span>
            )}
          </div>
        </button>
        <div className="flex gap-3 flex-shrink-0 pt-0.5">
          <button onClick={startEditTask} className="text-xs font-bold text-primary hover:underline whitespace-nowrap">
            編集
          </button>
          <button onClick={handleCompleteTask} className="text-xs font-bold text-primary hover:underline whitespace-nowrap">
            完了にする
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/20">
          {actions.length === 0 && <p className="text-xs text-outline">Actionがありません。</p>}
          {actions.map((a) => (
            <ActionRow key={a.id} action={a} userId={userId} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TaskListScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    if (!user) return
    return subscribeScheduledTasks(user.uid, setTasks)
  }, [user])

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => (a.deadline?.toMillis() ?? Infinity) - (b.deadline?.toMillis() ?? Infinity)),
    [tasks],
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant/20 bg-surface flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors flex-shrink-0"
        >
          <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
        </button>
        <div>
          <h1 className="text-lg font-bold text-on-surface">タスク一覧</h1>
          <p className="text-xs text-on-surface-variant">進行中のタスクを確認し、Action単位または一括で完了にできます</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {sortedTasks.length === 0 && <p className="text-sm text-on-surface-variant text-center py-8">進行中のタスクはありません。</p>}
          {user && sortedTasks.map((task) => <TaskRow key={task.id} task={task} userId={user.uid} />)}
        </div>
      </div>
    </div>
  )
}
