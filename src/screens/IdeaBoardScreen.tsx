import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { createIdea, deleteIdea, moveIdea, subscribeIdeas, updateIdea, type Idea, type StickyColor } from '../lib/ideas'
import { createFeature } from '../lib/features'

const NOTE_W = 144
const NOTE_H = 144
const CANVAS_MARGIN = 400

const colorClasses: Record<StickyColor, string> = {
  yellow: 'bg-amber-200 text-amber-950',
  pink: 'bg-pink-200 text-pink-950',
  blue: 'bg-sky-200 text-sky-950',
  green: 'bg-emerald-200 text-emerald-950',
  purple: 'bg-violet-200 text-violet-950',
}

function deriveFeatureName(memo: string): string {
  const firstLine = memo.split('\n')[0].trim()
  return (firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine) || '無題のアイデア'
}

function StickyNote({
  idea,
  zIndex,
  editing,
  converting,
  onBringFront,
  onStartEdit,
  onCommitMemo,
  onMoveEnd,
  onDelete,
  onConvert,
}: {
  idea: Idea
  zIndex: number
  editing: boolean
  converting: boolean
  onBringFront: () => void
  onStartEdit: () => void
  onCommitMemo: (text: string) => void
  onMoveEnd: (x: number, y: number) => void
  onDelete: () => void
  onConvert: () => void
}) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [draftText, setDraftText] = useState(idea.memo)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
      setDraftText(idea.memo)
      const t = textareaRef.current
      if (t) {
        t.focus()
        t.selectionStart = t.selectionEnd = t.value.length
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const x = dragPos?.x ?? idea.x ?? 0
  const y = dragPos?.y ?? idea.y ?? 0

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    onBringFront()
    if (editing) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: idea.x ?? 0, origY: idea.y ?? 0, moved: false }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    if (!state) return
    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    if (!state.moved && Math.hypot(dx, dy) > 4) {
      state.moved = true
      setDragging(true)
    }
    if (state.moved) {
      setDragPos({ x: Math.max(0, state.origX + dx), y: Math.max(0, state.origY + dy) })
    }
  }

  const handlePointerUp = () => {
    const state = dragState.current
    dragState.current = null
    setDragging(false)
    if (!state) return
    if (state.moved && dragPos) {
      onMoveEnd(dragPos.x, dragPos.y)
    } else if (!state.moved) {
      onStartEdit()
    }
    setDragPos(null)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: NOTE_W,
        height: NOTE_H,
        zIndex,
        touchAction: 'none',
        transform: editing || dragging ? undefined : `rotate(${idea.rotation ?? 0}deg)`,
      }}
      className={`p-2 rounded-sm shadow-md flex flex-col select-none ${colorClasses[idea.color] ?? colorClasses.yellow} ${
        dragging ? 'shadow-xl scale-105' : ''
      } transition-transform`}
    >
      <div className="flex items-center justify-between -mt-1 -mx-1 mb-0.5">
        {idea.linkedFeatureId ? (
          <span className="p-1 opacity-60 flex items-center" title="Featureに変換済み">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
          </span>
        ) : (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onConvert()
            }}
            disabled={converting}
            className="p-1 rounded hover:bg-black/10 active:bg-black/20 disabled:opacity-40"
            title="Featureに変換"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 rounded hover:bg-black/10 active:bg-black/20"
          title="削除"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      </div>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={() => onCommitMemo(draftText)}
          className="flex-1 w-full bg-transparent resize-none outline-none text-sm leading-snug"
        />
      ) : (
        <p className="flex-1 w-full text-sm leading-snug whitespace-pre-wrap overflow-hidden">
          {idea.memo || <span className="opacity-50">タップして入力…</span>}
        </p>
      )}
    </div>
  )
}

export default function IdeaBoardScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [zOrder, setZOrder] = useState<Record<string, number>>({})
  const zCounter = useRef(1)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    return subscribeIdeas(user.uid, setIdeas)
  }, [user])

  const canvasSize = useMemo(() => {
    let w = 1200
    let h = 1400
    for (const idea of ideas) {
      w = Math.max(w, (idea.x ?? 0) + NOTE_W + CANVAS_MARGIN)
      h = Math.max(h, (idea.y ?? 0) + NOTE_H + CANVAS_MARGIN)
    }
    return { w, h }
  }, [ideas])

  const bringToFront = (id: string) => {
    zCounter.current += 1
    setZOrder((prev) => ({ ...prev, [id]: zCounter.current }))
  }

  const handleAdd = async () => {
    if (!user) return
    const container = scrollRef.current
    const jitter = () => Math.round((Math.random() - 0.5) * 60)
    const x = Math.max(0, (container ? container.scrollLeft + container.clientWidth / 2 : 200) - NOTE_W / 2 + jitter())
    const y = Math.max(0, (container ? container.scrollTop + container.clientHeight / 2 : 200) - NOTE_H / 2 + jitter())
    const id = await createIdea(user.uid, '', x, y)
    bringToFront(id)
    setEditingId(id)
  }

  const handleCommitMemo = async (idea: Idea, text: string) => {
    setEditingId(null)
    const trimmed = text.trim()
    if (!trimmed) {
      await deleteIdea(idea.id)
      return
    }
    if (trimmed !== idea.memo) {
      await updateIdea(idea.id, { memo: trimmed })
    }
  }

  const handleDelete = async (idea: Idea) => {
    if (!confirm('この付箋を削除しますか？')) return
    await deleteIdea(idea.id)
  }

  const handleConvert = async (idea: Idea) => {
    if (!user || idea.linkedFeatureId) return
    setConvertingId(idea.id)
    try {
      const featureId = await createFeature(user.uid, {
        name: deriveFeatureName(idea.memo),
        description: idea.memo,
        column: 'ideas',
        priority: 'medium',
        difficulty: 'medium',
        tags: [],
      })
      await updateIdea(idea.id, { linkedFeatureId: featureId })
    } finally {
      setConvertingId(null)
    }
  }

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
          <h1 className="text-lg font-bold text-on-surface">アイデアボード</h1>
          <p className="text-xs text-on-surface-variant">付箋をドラッグして自由に並べ替えられます</p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto relative bg-surface-container-low"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      >
        <div className="relative" style={{ width: canvasSize.w, height: canvasSize.h }}>
          {ideas.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant text-center px-8">
              右下の + から付箋を追加できます
            </p>
          )}
          {ideas.map((idea) => (
            <StickyNote
              key={idea.id}
              idea={idea}
              zIndex={zOrder[idea.id] ?? 0}
              editing={editingId === idea.id}
              converting={convertingId === idea.id}
              onBringFront={() => bringToFront(idea.id)}
              onStartEdit={() => setEditingId(idea.id)}
              onCommitMemo={(text) => handleCommitMemo(idea, text)}
              onMoveEnd={(x, y) => moveIdea(idea.id, x, y)}
              onDelete={() => handleDelete(idea)}
              onConvert={() => handleConvert(idea)}
            />
          ))}
        </div>
      </div>

      <button
        onClick={handleAdd}
        className="fixed bottom-24 left-5 md:bottom-10 md:left-10 w-14 h-14 rounded-full bg-orange-500 text-white shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-20"
        aria-label="付箋を追加"
      >
        <span className="material-symbols-outlined text-3xl">add</span>
      </button>
    </div>
  )
}
