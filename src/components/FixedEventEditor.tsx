// 固定予定（会議など）の行エディタ。MorningSetupFormの日次入力と
// WeeklyPlanScreenの週次一括入力の両方から使う共有部品。
export interface FixedEventDraft {
  title: string
  start: string // HH:mm
  end: string // HH:mm
}

export default function FixedEventEditor({
  title,
  value,
  onChange,
}: {
  title: string
  value: FixedEventDraft[]
  onChange: (next: FixedEventDraft[]) => void
}) {
  const addRow = () => onChange([...value, { title: '', start: '09:00', end: '10:00' }])
  const updateRow = (i: number, patch: Partial<FixedEventDraft>) => onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const removeRow = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-outline uppercase tracking-widest">{title}</h4>
        <button onClick={addRow} className="text-xs font-bold text-primary hover:underline">
          + 追加
        </button>
      </div>
      {value.length === 0 && <p className="text-sm text-outline">固定予定はありません。</p>}
      <div className="space-y-2">
        {value.map((f, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
              placeholder="予定名"
              value={f.title}
              onChange={(e) => updateRow(i, { title: e.target.value })}
            />
            <input
              type="time"
              className="p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
              value={f.start}
              onChange={(e) => updateRow(i, { start: e.target.value })}
            />
            <span className="text-xs text-outline">〜</span>
            <input
              type="time"
              className="p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
              value={f.end}
              onChange={(e) => updateRow(i, { end: e.target.value })}
            />
            <button onClick={() => removeRow(i)} className="text-outline hover:text-secondary">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
