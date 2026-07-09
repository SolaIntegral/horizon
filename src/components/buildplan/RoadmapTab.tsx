import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import {
  createFeature,
  seedInitialFeatures,
  subscribeFeatures,
  type Difficulty,
  type Feature,
  type FeatureColumn,
  type Priority,
} from '../../lib/features'
import { compareFeatureCandidates, type FeatureComparisonResult } from '../../lib/ai'
import { subscribeUserSettings, setScopeGuard, type UserSettings } from '../../lib/userSettings'

const columns: { id: FeatureColumn; label: string }[] = [
  { id: 'mvp', label: 'MVP' },
  { id: 'next', label: 'Next' },
  { id: 'later', label: 'Later' },
  { id: 'ideas', label: 'Ideas' },
]

const priorityColor: Record<Priority, string> = {
  high: 'text-secondary',
  medium: 'text-orange-600',
  low: 'text-outline',
}

const phases = ['Phase 0: Design', 'Phase 1: Web MVP', 'Phase 2: Daily Use', 'Phase 3: PC Overlay', 'Phase 4: Mobile Support']
const CURRENT_PHASE_INDEX = 1

const defaultScopeGuard = {
  doNow: ['タスクを入れる', 'AI診断する', 'Next 15を出す', '作業/休憩状態を切り替える'],
  notNow: ['完全自動スケジューリング', '高度な分析ダッシュボード', 'チーム管理', '完全なデスクトップ常駐アプリ'],
}

function FeatureCard({ feature, onClick }: { feature: Feature; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left neumorphic-raised bg-surface p-4 rounded-lg space-y-2 hover:scale-[1.02] transition-transform"
    >
      <div className="flex flex-wrap gap-1">
        {feature.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
            {tag}
          </span>
        ))}
      </div>
      <h5 className="text-sm font-bold text-on-surface">{feature.name}</h5>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase ${priorityColor[feature.priority]}`}>{feature.priority}</span>
        {feature.notes?.length > 0 && (
          <span className="text-[10px] text-outline flex items-center gap-0.5">
            <span className="material-symbols-outlined text-xs">chat_bubble</span>
            {feature.notes.length}
          </span>
        )}
      </div>
    </button>
  )
}

export default function RoadmapTab({ onSelectFeature }: { onSelectFeature: (id: string) => void }) {
  const { user } = useAuth()
  const [features, setFeatures] = useState<Feature[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [seeded, setSeeded] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColumn, setNewColumn] = useState<FeatureColumn>('ideas')
  const [newPriority, setNewPriority] = useState<Priority>('medium')
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>('medium')
  const [newTags, setNewTags] = useState('')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [comparing, setComparing] = useState(false)
  const [comparisonResults, setComparisonResults] = useState<FeatureComparisonResult[] | null>(null)
  const [editingScopeGuard, setEditingScopeGuard] = useState(false)
  const [doNowDraft, setDoNowDraft] = useState('')
  const [notNowDraft, setNotNowDraft] = useState('')

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeFeatures(user.uid, setFeatures)
    const unsub2 = subscribeUserSettings(user.uid, setSettings)
    return () => {
      unsub1()
      unsub2()
    }
  }, [user])

  useEffect(() => {
    if (!user || seeded) return
    // Only seed once we've received the first (possibly empty) snapshot.
    const timer = setTimeout(async () => {
      if (features.length === 0) {
        await seedInitialFeatures(user.uid)
      }
      setSeeded(true)
    }, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, seeded, features.length])

  const currentFocus = useMemo(() => features.find((f) => f.isCurrentFocus) ?? null, [features])
  const scopeGuard = settings?.scopeGuard ?? defaultScopeGuard

  const byColumn = useMemo(() => {
    const map: Record<FeatureColumn, Feature[]> = { mvp: [], next: [], later: [], ideas: [] }
    for (const f of features) map[f.column].push(f)
    return map
  }, [features])

  const handleAddFeature = async () => {
    if (!user || !newName.trim()) return
    await createFeature(user.uid, {
      name: newName.trim(),
      description: newDescription.trim(),
      column: newColumn,
      priority: newPriority,
      difficulty: newDifficulty,
      tags: newTags
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`)),
    })
    setNewName('')
    setNewDescription('')
    setNewTags('')
    setShowAddForm(false)
  }

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]))
    setComparisonResults(null)
  }

  const handleCompare = async () => {
    const candidates = features.filter((f) => compareIds.includes(f.id))
    if (candidates.length < 2) return
    setComparing(true)
    try {
      const results = await compareFeatureCandidates(candidates.map((c) => ({ name: c.name, description: c.description })))
      setComparisonResults(results)
    } finally {
      setComparing(false)
    }
  }

  const startEditingScopeGuard = () => {
    setDoNowDraft(scopeGuard.doNow.join('\n'))
    setNotNowDraft(scopeGuard.notNow.join('\n'))
    setEditingScopeGuard(true)
  }

  const saveScopeGuard = async () => {
    if (!user) return
    await setScopeGuard(user.uid, {
      doNow: doNowDraft.split('\n').map((s) => s.trim()).filter(Boolean),
      notNow: notNowDraft.split('\n').map((s) => s.trim()).filter(Boolean),
    })
    setEditingScopeGuard(false)
  }

  const compareCandidatePool = features.filter((f) => f.column !== 'mvp')

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-orange-600">Build Roadmap</h2>
        <p className="text-sm text-on-surface-variant">このツールをどう育てるか</p>
      </div>

      <section className="space-y-2">
        <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Phase Tracker</span>
        <div className="flex items-center gap-2">
          {phases.map((phase, i) => (
            <div key={phase} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-2 rounded-full ${i <= CURRENT_PHASE_INDEX ? 'bg-orange-500' : 'bg-surface-container-high'}`}></div>
              <span className={`text-[9px] font-bold text-center ${i === CURRENT_PHASE_INDEX ? 'text-orange-600' : 'text-outline'}`}>
                P{i}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant text-center">{phases[CURRENT_PHASE_INDEX]}</p>
      </section>

      {currentFocus && (
        <section
          onClick={() => onSelectFeature(currentFocus.id)}
          className="neumorphic-raised bg-orange-50 border border-orange-200 p-5 rounded-xl cursor-pointer hover:scale-[1.01] transition-transform"
        >
          <div className="flex justify-between items-start mb-2">
            <span className="bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
              Current Focus
            </span>
            <span className="text-xs font-bold text-orange-700">{currentFocus.status}</span>
          </div>
          <h3 className="text-lg font-bold text-on-surface mb-1">{currentFocus.name}</h3>
          {currentFocus.focusReason && <p className="text-sm text-on-surface-variant mb-1">なぜ今: {currentFocus.focusReason}</p>}
          {currentFocus.focusExpectedEffect && (
            <p className="text-sm text-on-surface-variant mb-1">期待する効果: {currentFocus.focusExpectedEffect}</p>
          )}
          {currentFocus.focusNextAction && <p className="text-sm text-orange-700 font-semibold">次のアクション: {currentFocus.focusNextAction}</p>}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-on-surface">Roadmap Board</h3>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">add</span> Add Feature Idea
          </button>
        </div>

        {showAddForm && (
          <div className="neumorphic-sunken rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-outline uppercase">このシステムに追加したい機能・改善案を書く</p>
            <input
              className="w-full p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
              placeholder="機能名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <textarea
              className="w-full p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface resize-none"
              rows={2}
              placeholder="例：休憩中の声掛けをもう少し優しくしたい"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
            <input
              className="w-full p-2 text-sm neumorphic-raised border-none rounded-lg bg-surface"
              placeholder="タグ (例: Overlay Recovery)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                className="p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface"
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value as FeatureColumn)}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                className="p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Priority)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                className="p-2 text-xs neumorphic-raised border-none rounded-lg bg-surface"
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value as Difficulty)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <button onClick={handleAddFeature} className="w-full py-2 rounded-full text-sm font-bold bg-orange-500 text-white">
              Add Feature Idea
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {columns.map((col) => (
            <div key={col.id} className="space-y-2">
              <h4 className="text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded-md inline-block">
                {col.label} ({byColumn[col.id].length})
              </h4>
              <div className="space-y-2">
                {byColumn[col.id].map((f) => (
                  <FeatureCard key={f.id} feature={f} onClick={() => onSelectFeature(f.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="neumorphic-sunken rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-orange-500">balance</span>
          <h4 className="text-xs font-bold text-orange-700 uppercase">Compare Candidates</h4>
        </div>
        <p className="text-xs text-on-surface-variant">MVP以外から2〜3件選んで比較します。AIは決めません、比較軸を整理するだけです。</p>
        <div className="flex flex-wrap gap-2">
          {compareCandidatePool.map((f) => (
            <button
              key={f.id}
              onClick={() => toggleCompare(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                compareIds.includes(f.id) ? 'bg-orange-500 text-white border-orange-500' : 'bg-surface border-outline-variant text-on-surface-variant'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
        <button
          onClick={handleCompare}
          disabled={compareIds.length < 2 || comparing}
          className="px-4 py-2 rounded-full text-xs font-bold bg-orange-500 text-white disabled:opacity-40"
        >
          {comparing ? '比較中…' : 'Compare with AI'}
        </button>

        {comparisonResults && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {comparisonResults.map((r) => (
              <div key={r.name} className="bg-surface rounded-lg p-3 space-y-1 border border-orange-100">
                <p className="text-sm font-bold text-on-surface">{r.name}</p>
                <p className="text-xs text-on-surface-variant">早く使えるか: {r.quickToUse}</p>
                <p className="text-xs text-on-surface-variant">中心課題への効果: {r.coreImpact}</p>
                <p className="text-xs text-on-surface-variant">難易度: {r.difficulty}</p>
                <p className="text-xs text-on-surface-variant">他機能への依存: {r.dependencies}</p>
                <p className="text-xs text-on-surface-variant">後回しリスク: {r.deferRisk}</p>
                <p className="text-xs text-on-surface-variant">Claude Codeへの渡しやすさ: {r.claudeCodeReadiness}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-on-surface text-surface p-5 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-400">security</span>
            <span className="text-[10px] font-bold uppercase text-orange-400">Scope Guard</span>
          </div>
          {!editingScopeGuard && (
            <button onClick={startEditingScopeGuard} className="text-[10px] font-bold text-orange-300 hover:underline">
              編集
            </button>
          )}
        </div>
        {editingScopeGuard ? (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-orange-300 uppercase">Do Now (1行ずつ)</label>
            <textarea
              className="w-full p-2 text-xs rounded-lg bg-white/10 border-none resize-none"
              rows={4}
              value={doNowDraft}
              onChange={(e) => setDoNowDraft(e.target.value)}
            />
            <label className="text-[10px] font-bold text-orange-300 uppercase">Not Now (1行ずつ)</label>
            <textarea
              className="w-full p-2 text-xs rounded-lg bg-white/10 border-none resize-none"
              rows={4}
              value={notNowDraft}
              onChange={(e) => setNotNowDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={() => setEditingScopeGuard(false)} className="flex-1 py-2 rounded-full text-xs font-bold bg-white/10">
                Cancel
              </button>
              <button onClick={saveScopeGuard} className="flex-1 py-2 rounded-full text-xs font-bold bg-orange-500 text-white">
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-orange-300 uppercase mb-1">Do Now</p>
              <ul className="text-xs space-y-1">
                {scopeGuard.doNow.map((item, i) => (
                  <li key={i}>・{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold opacity-50 uppercase mb-1">Not Now</p>
              <ul className="text-xs space-y-1 opacity-60">
                {scopeGuard.notNow.map((item, i) => (
                  <li key={i} className="line-through">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
