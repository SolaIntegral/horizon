import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { subscribeScheduledTasks, type Task, type TaskStatus } from '../lib/tasks'
import { subscribeActionsForTask, completeAction, completeTaskManually, type Action } from '../lib/actions'

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
function TaskRow({ task, userId }: { task: Task; userId: string }) {
  const [expanded, setExpanded] = useState(false)
  const [actions, setActions] = useState<Action[]>([])

  useEffect(() => {
    if (!expanded) return
    return subscribeActionsForTask(userId, task.id, setActions)
  }, [expanded, userId, task.id])

  const finishedCount = actions.filter((a) => a.status === 'done' || a.status === 'skipped').length

  const handleCompleteTask = () => {
    if (!confirm(`「${task.title}」を完了にしますか？まだ終わっていないActionはスキップ扱いになります。`)) return
    completeTaskManually(userId, task.id)
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
        <button
          onClick={handleCompleteTask}
          className="text-xs font-bold text-primary hover:underline whitespace-nowrap flex-shrink-0 pt-0.5"
        >
          完了にする
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 pt-2 border-t border-outline-variant/20">
          {actions.length === 0 && <p className="text-xs text-outline">Actionがありません。</p>}
          {actions.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 neumorphic-sunken rounded-lg p-2.5">
              <div className="min-w-0">
                <p
                  className={`text-sm truncate ${
                    a.status === 'done' || a.status === 'skipped' ? 'text-on-surface-variant line-through' : 'text-on-surface font-bold'
                  }`}
                >
                  {a.title}
                </p>
                <p className="text-[10px] text-outline">
                  {a.estimatedMinutes}分 ・ {actionStatusLabel[a.status]}
                </p>
              </div>
              {(a.status === 'todo' || a.status === 'doing') && (
                <button
                  onClick={() => completeAction(a.id, a.taskId, userId)}
                  className="text-xs font-bold text-primary hover:underline flex-shrink-0"
                >
                  完了にする
                </button>
              )}
            </div>
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
