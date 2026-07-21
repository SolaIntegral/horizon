// MorningSetupFormと夜間見直しフロー（DailyPlanScreenの翌日replan）で共有する
// 疲労度→詰め込み度(fillRatio)の対応表。
export type Fatigue = 'good' | 'normal' | 'tired'

export const fatigueRatio: Record<Fatigue, number> = { good: 0.8, normal: 0.75, tired: 0.5 }
export const fatigueLabel: Record<Fatigue, string> = { good: '良い', normal: '普通', tired: 'しんどい' }
