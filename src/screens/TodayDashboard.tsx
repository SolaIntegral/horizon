import { Link } from 'react-router-dom'

export default function TodayDashboard() {
  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-primary tracking-tight">Today</h2>
            <p className="text-lg text-on-surface-variant">Wednesday, Oct 24</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/inbox"
              className="btn-squish neumorphic-raised bg-primary text-white font-bold p-3 px-6 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined">add_task</span>
              <span>Add Task</span>
            </Link>
            <button className="p-3 neumorphic-raised rounded-full flex items-center justify-center hover:text-primary transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined">layers</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <section className="lg:col-span-2 neumorphic-raised rounded-lg p-6 flex flex-col justify-between bg-surface">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-full pulse"></div>
                <span className="text-sm font-bold text-primary">Status: Working</span>
              </div>
              <span className="text-xs text-on-surface-variant bg-surface-container px-3 py-1 rounded-full">
                Session: 45m remaining
              </span>
            </div>
            <div className="flex items-center gap-8 mb-8">
              <div className="flex-shrink-0 w-24 h-24 neumorphic-sunken rounded-full flex items-center justify-center overflow-hidden bg-surface">
                <img
                  className="w-16 h-16 opacity-80"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7q1tpl1bOjd-sGOkDW1mextvHOHbB0OuuBDrnSaBrfVNvQtRG8sEGCRYfpoQlwwPZpKt8cYUiEQxmGX_CdmOlLAJlhg2asDWcK9W-3XIwv1UV4_yUZIn-aInzpYgzVTPQ8Y_FvvrZKFramVayvVeSrryKaZYmD7f9gmLDrBoLQptcdUwS2ctVtJpxacEH7zfeWQV9KSO0_QbnnuqU5c3lsAqCOChXLqTQ8GtrnXwLf3sr6lixcNsyYS2PcMHYAek2iz4oZgfHc1p_"
                  alt="AI character"
                />
              </div>
              <p className="text-lg font-medium italic text-on-surface">
                "Doing great. Let's make returning to focus our win for this session."
              </p>
            </div>
            <div className="flex gap-4">
              <button className="flex-1 btn-squish neumorphic-sunken text-primary border-2 border-primary/20 py-3 rounded-full">
                Work
              </button>
              <button className="flex-1 btn-squish neumorphic-raised py-3 rounded-full hover:bg-surface-container">
                Break
              </button>
              <button className="flex-1 btn-squish neumorphic-raised py-3 rounded-full hover:bg-surface-container">
                Replan
              </button>
            </div>
          </section>

          <section className="neumorphic-raised rounded-lg p-6 border-t-8 border-primary/40 flex flex-col bg-surface">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-primary">Main Time</h3>
              <span className="material-symbols-outlined text-primary/40">verified_user</span>
            </div>
            <div className="flex-grow flex flex-col items-center justify-center space-y-4">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    className="text-surface-container-highest"
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                  ></circle>
                  <circle
                    className="text-primary"
                    cx="64"
                    cy="64"
                    fill="transparent"
                    r="56"
                    stroke="currentColor"
                    strokeDasharray="351.8"
                    strokeDashoffset="140"
                    strokeWidth="12"
                  ></circle>
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-bold">60%</span>
                  <span className="text-[10px] font-bold uppercase opacity-50">of goal</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold">Thesis / Project</p>
                <p className="text-secondary text-xs mt-1 flex items-center gap-1 justify-center">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  2h behind target
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="neumorphic-raised rounded-xl p-8 bg-surface relative overflow-hidden ring-4 ring-primary/5">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <span className="material-symbols-outlined text-[120px] text-primary">bolt</span>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
            <div className="flex-grow space-y-4 w-full">
              <div className="flex items-center gap-2">
                <span className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">
                  Next 15 Action
                </span>
                <span className="text-xs text-on-surface-variant">Focus: Deep Work</span>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-primary leading-tight">Thesis: Fix Background Slides</h3>
                <p className="text-lg text-on-surface-variant mt-2">
                  Action: Read existing slides and note 3 points of friction.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 font-bold bg-surface-container-highest px-4 py-2 rounded-full text-sm">
                  <span className="material-symbols-outlined text-sm">timer</span> 15m
                </div>
                <div className="flex items-center gap-2 font-bold bg-surface-container-highest px-4 py-2 rounded-full text-sm">
                  <span className="material-symbols-outlined text-sm">psychology</span> Low Load
                </div>
              </div>
            </div>
            <div className="flex flex-col w-full md:w-auto gap-4">
              <Link
                to="/overlay"
                className="w-full md:w-48 py-4 neumorphic-raised bg-primary text-white text-xl font-bold rounded-full hover:scale-105 active:scale-95 transition-all text-center"
              >
                Start
              </Link>
              <div className="flex gap-4">
                <button className="flex-1 py-2 neumorphic-raised rounded-full text-sm hover:bg-surface-container">
                  Make Smaller
                </button>
                <button className="flex-1 py-2 neumorphic-raised rounded-full text-sm hover:bg-surface-container">
                  Skip
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
