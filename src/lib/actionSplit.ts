// Shared by DiagnoseScreen/BatchDiagnoseScreen — Action suggestions arrive
// already in intended execution order, so overflow beyond the per-task cap
// is just "everything after index cap", no AI judgement needed.
export const ACTIONS_PER_TASK_CAP = 4

export function splitOverflowActions<T>(items: T[], cap: number = ACTIONS_PER_TASK_CAP): { primary: T[]; overflow: T[] } {
  return { primary: items.slice(0, cap), overflow: items.slice(cap) }
}
