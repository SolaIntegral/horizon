import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { createIdea, subscribeIdeas, updateIdea, type Idea, type IdeaCategory, type IdeaStatus } from '../../lib/ideas'
import { organizeIdea } from '../../lib/ai'

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
  converted: 'Converted',
  archived: 'Archived',
}

const statusFilters: (IdeaStatus | 'all')[] = ['all', 'raw', 'growing', 'maybe_task', 'converted', 'archived']

function deriveTitle(text: string): string {
  const firstLine = text.split('\n')[0].trim()
  return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
}

export default function IdeaParkingTab({ onSelectIdea }: { onSelectIdea: (id: string) => void }) {
  const { user } = useAuth()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | 'all'>('all')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!user) return
    return subscribeIdeas(user.uid, setIdeas)
  }, [user])

  const handleAdd = async (keepWriting: boolean, askAi: boolean) => {
    if (!user || !text.trim()) return
    setSubmitting(true)
    try {
      const title = deriveTitle(text.trim())
      const ideaId = await createIdea(user.uid, title, text.trim())
      if (askAi) {
        organizeIdea(title, text.trim()).then((result) => {
          updateIdea(ideaId, { aiSuggestion: result.suggestion, aiOptions: result.options })
        })
      }
      setText('')
      if (keepWriting) inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  const filteredIdeas = useMemo(() => {
    return ideas
      .filter((i) => (statusFilter === 'all' ? true : i.status === statusFilter))
      .filter((i) => (pinnedOnly ? i.pinned : true))
      .filter((i) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return i.title.toLowerCase().includes(q) || i.memo.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q))
      })
      .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1))
  }, [ideas, statusFilter, pinnedOnly, search])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-orange-600">Idea Parking</h2>
        <p className="text-sm text-on-surface-variant">タスク化前の思いつきを置いておく</p>
      </div>

      <section className="neumorphic-sunken rounded-xl p-4 space-y-3">
        <label className="text-xs font-bold text-outline uppercase tracking-widest">思いついたことをそのまま書く</label>
        <textarea
          ref={inputRef}
          className="w-full p-3 text-sm neumorphic-raised border-none rounded-lg bg-surface resize-none"
          rows={3}
          placeholder="例：研究の発表資料で使えそうな図のアイデア"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleAdd(false, false)}
            disabled={submitting || !text.trim()}
            className="px-4 py-2 rounded-full text-xs font-bold bg-orange-500 text-white disabled:opacity-40"
          >
            Add Idea
          </button>
          <button
            onClick={() => handleAdd(true, false)}
            disabled={submitting || !text.trim()}
            className="px-4 py-2 rounded-full text-xs font-bold neumorphic-raised disabled:opacity-40"
          >
            Add and Keep Writing
          </button>
          <button
            onClick={() => handleAdd(false, true)}
            disabled={submitting || !text.trim()}
            className="px-4 py-2 rounded-full text-xs font-bold neumorphic-raised text-orange-600 disabled:opacity-40 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">auto_awesome</span> Ask AI to lightly categorize
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <input
          className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
          placeholder="検索 (タイトル・メモ・タグ)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                statusFilter === s ? 'bg-orange-500 text-white' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {s === 'all' ? 'All' : statusLabel[s]}
            </button>
          ))}
          <button
            onClick={() => setPinnedOnly((v) => !v)}
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              pinnedOnly ? 'bg-orange-500 text-white' : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-xs">push_pin</span> Pinned
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {filteredIdeas.length === 0 && <p className="text-sm text-on-surface-variant text-center py-8">アイデアがありません。</p>}
        {filteredIdeas.map((idea) => (
          <button
            key={idea.id}
            onClick={() => onSelectIdea(idea.id)}
            className="w-full text-left neumorphic-raised bg-surface p-4 rounded-lg space-y-2 hover:scale-[1.01] transition-transform"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  {categoryLabel[idea.category]}
                </span>
                <span className="text-[10px] text-on-surface-variant font-semibold">{statusLabel[idea.status]}</span>
              </div>
              {idea.pinned && <span className="material-symbols-outlined text-orange-500 text-sm">push_pin</span>}
            </div>
            <h4 className="text-sm font-bold text-on-surface">{idea.title}</h4>
            <p className="text-xs text-on-surface-variant line-clamp-2">{idea.memo}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-outline">{idea.updatedAt?.toDate?.().toLocaleDateString() ?? ''}</span>
              {idea.notes?.length > 0 && (
                <span className="text-[10px] text-outline flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-xs">chat_bubble</span>
                  {idea.notes.length}
                </span>
              )}
            </div>
          </button>
        ))}
      </section>
    </div>
  )
}
