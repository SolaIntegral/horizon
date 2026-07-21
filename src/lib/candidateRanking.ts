import type { Action } from './actions'
import { isTaskBlocked, type Task } from './tasks'

export interface RankedCandidate {
  action: Action
  reason: string
  priority: number
}

// MorningSetupFormとWeeklyPlanScreenで共有する、Action候補の優先度付け。
// 締切が近い(3日以内) > 中断中 > 進行中 > その他、の順。
export function rankCandidateActions(activeActions: Action[], scheduledTasks: Task[]): RankedCandidate[] {
  const taskMap = new Map(scheduledTasks.map((t) => [t.id, t]))
  const scheduledTaskIds = new Set(scheduledTasks.map((t) => t.id))

  return activeActions
    .filter((a) => {
      const task = taskMap.get(a.taskId)
      return !task || !isTaskBlocked(task, scheduledTaskIds)
    })
    .map((a) => {
      const task = taskMap.get(a.taskId)
      let reason = 'その他'
      let priority = 3
      if (task?.deadline) {
        const days = (task.deadline.toDate().getTime() - Date.now()) / 86400000
        if (days <= 3) {
          reason = '締切が近い'
          priority = 0
        }
      }
      if (priority === 3 && task?.status === 'interrupted') {
        reason = '中断中'
        priority = 1
      }
      if (priority === 3 && task?.status === 'in_progress') {
        reason = '進行中'
        priority = 2
      }
      return { action: a, reason, priority }
    })
    .sort((a, b) => a.priority - b.priority)
}
