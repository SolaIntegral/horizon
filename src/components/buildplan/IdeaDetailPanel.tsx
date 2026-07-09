import { useState } from 'react'
import { addIdeaNote, deleteIdea, togglePin, updateIdea, type Idea, type IdeaCategory, type IdeaStatus } from '../../lib/ideas'
import { createFeature } from '../../lib/features'
import { organizeIdea } from '../../lib/ai'
import { useAuth } from '../../lib/AuthContext'

const categoryLabel: Record<IdeaCategory, string> = {
  app_idea: 'App Idea',
  research: 'Research',
  design: 'Design',
  learning: 'Learning',
  life_workflow: 'Life / Workflow',
  writing: 'Writing',
  other: 'Other',
}

const statusLabel: Record<IdeaStatus, string> = {
  raw: 'Raw Idea',
  growing: 'Growing',
  maybe_task: 'Maybe Task',
  converted: 'Converted to Task',
  archived: 'Archived',
}

export default function IdeaDetailPanel({ idea, onBack }: { idea: Idea; onBack: () => void }) {
  const { user } = useAuth()
  const [noteText, setNoteText] = useState('')
  const [organizing, setOrganizing] = useState(false)
  const [converting, setConverting] = useState(false)

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    await addIdeaNote(idea.id, noteText.trim())
    setNoteText('')
    if (idea.status === 'raw') await updateIdea(idea.id, { status: 'growing' })
  }

  const handleOrganize = async () => {
    setOrganizing(true)
    try {
      const result = await organizeIdea(idea.title, idea.memo)
      await updateIdea(idea.id, { aiSuggestion: result.suggestion, aiOptions: result.options })
    } finally {
      setOrganizing(false)
    }
  }

  const handleConvertToFeature = async () => {
    if (!user) return
    setConverting(true)
    try {
      const featureId = await createFeature(user.uid, {
        name: idea.title,
        description: idea.memo,
        column: 'ideas',
        priority: 'medium',
        difficulty: 'medium',
        tags: idea.tags ?? [],
      })
      await updateIdea(idea.id, { status: 'converted', linkedFeatureId: featureId })
    } finally {
      setConverting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`「${idea.title}」を削除しますか？`)) return
    await deleteIdea(idea.id)
    onBack()
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-orange-600">
        <span className="material-symbols-outlined text-lg">arrow_back</span> Idea一覧に戻る
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{categoryLabel[idea.category]}</span>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant">
          {statusLabel[idea.status]}
        </span>
        <button
          onClick={() => togglePin(idea.id, !idea.pinned)}
          className={`p-1.5 rounded-full ${idea.pinned ? 'text-orange-500' : 'text-outline'}`}
          title="Pin"
        >
          <span className="material-symbols-outlined text-lg" style={idea.pinned ? { fontVariationSettings: "'FILL' 1" } : undefined}>
            push_pin
          </span>
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">タイトル</label>
        <input
          className="w-full p-2 text-lg font-bold neumorphic-sunken border-none rounded-lg bg-surface"
          value={idea.title}
          onChange={(e) => updateIdea(idea.id, { title: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">元のメモ</label>
        <textarea
          className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
          rows={3}
          value={idea.memo}
          onChange={(e) => updateIdea(idea.id, { memo: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">カテゴリ / 状態</label>
        <div className="flex gap-2">
          <select
            className="flex-1 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            value={idea.category}
            onChange={(e) => updateIdea(idea.id, { category: e.target.value as IdeaCategory })}
          >
            {(Object.keys(categoryLabel) as IdeaCategory[]).map((c) => (
              <option key={c} value={c}>
                {categoryLabel[c]}
              </option>
            ))}
          </select>
          <select
            className="flex-1 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            value={idea.status}
            onChange={(e) => updateIdea(idea.id, { status: e.target.value as IdeaStatus })}
          >
            {(Object.keys(statusLabel) as IdeaStatus[]).map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="neumorphic-sunken rounded-xl p-4 bg-orange-50/50 border-l-4 border-orange-400">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-orange-500 text-lg">auto_awesome</span>
          <h4 className="text-xs font-bold text-orange-700 uppercase">AI整理</h4>
        </div>
        {idea.aiSuggestion ? (
          <>
            <p className="text-sm text-on-surface mb-3">{idea.aiSuggestion}</p>
            <div className="flex flex-wrap gap-2">
              {(idea.aiOptions ?? []).map((opt, i) => (
                <span key={i} className="px-3 py-1 rounded-full text-xs font-bold bg-surface border border-orange-200 text-orange-700">
                  {opt}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-on-surface-variant">AIに軽く整理してもらいましょう(自動では決定しません)。</p>
        )}
        <button
          onClick={handleOrganize}
          disabled={organizing}
          className="mt-3 px-4 py-2 rounded-full text-xs font-bold bg-orange-500 text-white disabled:opacity-50"
        >
          {organizing ? '整理中…' : 'Ask AI to organize'}
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleConvertToFeature}
          disabled={converting || !!idea.linkedFeatureId}
          className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold disabled:opacity-40"
        >
          {idea.linkedFeatureId ? 'Feature化済み' : converting ? '変換中…' : 'Convert to Feature Idea'}
        </button>
        <button
          onClick={() => updateIdea(idea.id, { status: 'maybe_task' })}
          className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold"
        >
          Mark as Maybe Task
        </button>
        <button
          onClick={() => updateIdea(idea.id, { status: 'archived' })}
          className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold"
        >
          Archive
        </button>
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">追記メモ ({idea.notes?.length ?? 0})</label>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {(idea.notes ?? []).map((n, i) => (
            <div key={i} className="neumorphic-sunken rounded-lg p-3 text-sm">
              <p className="text-[10px] text-outline font-bold mb-1">{n.createdAt?.toDate?.().toLocaleString() ?? ''}</p>
              <p className="text-on-surface">{n.text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            placeholder="このアイデアに追記する"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <button onClick={handleAddNote} className="px-4 py-2 rounded-full text-xs font-bold bg-orange-500 text-white">
            Add
          </button>
        </div>
      </div>

      <button onClick={handleDelete} className="text-xs font-bold text-secondary hover:underline">
        このアイデアを削除
      </button>
    </div>
  )
}
