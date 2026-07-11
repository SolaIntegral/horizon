import { useState, type ReactNode } from 'react'

export default function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="使い方を見る"
        className="neumorphic-raised w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors flex-shrink-0"
      >
        <span className="material-symbols-outlined text-base">help</span>
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-6" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg neumorphic-raised bg-surface rounded-xl p-8 space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-primary">{title}</h3>
              <button onClick={() => setOpen(false)} className="text-outline hover:text-secondary flex-shrink-0">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="text-sm text-on-surface-variant leading-relaxed space-y-3">{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
