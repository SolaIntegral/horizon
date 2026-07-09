import { useState } from 'react'
import {
  addFeatureNote,
  deleteFeature,
  setCurrentFocus,
  updateFeature,
  type Difficulty,
  type Feature,
  type FeatureColumn,
  type Priority,
} from '../../lib/features'

const columnLabel: Record<FeatureColumn, string> = { mvp: 'MVP', next: 'Next', later: 'Later', ideas: 'Ideas' }
const statusLabel: Record<Feature['status'], string> = {
  idea: 'Idea',
  selected: 'Selected',
  designing: 'Designing',
  ready: 'Ready',
  building: 'Building',
  testing: 'Testing',
  done: 'Done',
}

function EditableField({
  label,
  value,
  onSave,
  multiline = false,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">{label}</label>
        {multiline ? (
          <textarea
            className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface resize-none"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <input
            className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditing(false)
              setDraft(value)
            }}
            className="px-3 py-1 rounded-full text-xs font-bold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(draft)
              setEditing(false)
            }}
            className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500 text-white"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)} className="w-full text-left space-y-1 group">
      <label className="text-[10px] font-bold text-outline uppercase tracking-widest">{label}</label>
      <p className="text-sm text-on-surface group-hover:text-orange-600 transition-colors whitespace-pre-wrap">
        {value || <span className="text-outline italic">未入力(クリックして追加)</span>}
      </p>
    </button>
  )
}

export default function FeatureDetailPanel({
  feature,
  currentFocusId,
  onBack,
}: {
  feature: Feature
  currentFocusId: string | null
  onBack: () => void
}) {
  const [noteText, setNoteText] = useState('')

  const handleMoveColumn = async (column: FeatureColumn) => {
    await updateFeature(feature.id, { column })
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    await addFeatureNote(feature.id, noteText.trim())
    setNoteText('')
  }

  const handleSetFocus = async () => {
    await setCurrentFocus(feature.id, currentFocusId, {
      reason: feature.focusReason || '',
      expectedEffect: feature.focusExpectedEffect || '',
      nextAction: feature.focusNextAction || '',
    })
  }

  const handleDelete = async () => {
    if (!confirm(`「${feature.name}」を削除しますか？`)) return
    await deleteFeature(feature.id)
    onBack()
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-orange-600">
        <span className="material-symbols-outlined text-lg">arrow_back</span> Board に戻る
      </button>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{columnLabel[feature.column]}</span>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant">
          {statusLabel[feature.status]}
        </span>
        {feature.isCurrentFocus && (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-500 text-white flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">bolt</span> Current Focus
          </span>
        )}
      </div>

      <EditableField label="機能名" value={feature.name} onSave={(v) => updateFeature(feature.id, { name: v })} />
      <EditableField label="説明" value={feature.description} onSave={(v) => updateFeature(feature.id, { description: v })} multiline />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Priority</label>
          <select
            className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            value={feature.priority}
            onChange={(e) => updateFeature(feature.id, { priority: e.target.value as Priority })}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Difficulty</label>
          <select
            className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            value={feature.difficulty}
            onChange={(e) => updateFeature(feature.id, { difficulty: e.target.value as Difficulty })}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">Status</label>
        <select
          className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
          value={feature.status}
          onChange={(e) => updateFeature(feature.id, { status: e.target.value as Feature['status'] })}
        >
          {(Object.keys(statusLabel) as Feature['status'][]).map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">列を移動</label>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => handleMoveColumn('mvp')} className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold">
            Add to MVP
          </button>
          <button onClick={() => handleMoveColumn('next')} className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold">
            Move to Next
          </button>
          <button onClick={() => handleMoveColumn('later')} className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold">
            Move to Later
          </button>
          <button onClick={() => handleMoveColumn('ideas')} className="px-4 py-2 neumorphic-raised rounded-full text-xs font-bold">
            Keep as Idea
          </button>
        </div>
      </div>

      <button
        onClick={handleSetFocus}
        disabled={feature.isCurrentFocus}
        className="w-full py-3 rounded-full text-sm font-bold bg-orange-500 text-white disabled:opacity-40"
      >
        {feature.isCurrentFocus ? '現在のCurrent Focusです' : 'Current Focusに設定'}
      </button>

      <div className="space-y-3">
        <label className="text-[10px] font-bold text-outline uppercase tracking-widest">ユーザーの意見・追記メモ ({feature.notes?.length ?? 0})</label>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {(feature.notes ?? []).map((n, i) => (
            <div key={i} className="neumorphic-sunken rounded-lg p-3 text-sm">
              <p className="text-[10px] text-outline font-bold mb-1">{n.createdAt?.toDate?.().toLocaleString() ?? ''}</p>
              <p className="text-on-surface">{n.text}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
            placeholder="追記する"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <button onClick={handleAddNote} className="px-4 py-2 rounded-full text-xs font-bold bg-orange-500 text-white">
            Add Note
          </button>
        </div>
      </div>

      <button onClick={handleDelete} className="text-xs font-bold text-secondary hover:underline">
        この機能を削除
      </button>
    </div>
  )
}
