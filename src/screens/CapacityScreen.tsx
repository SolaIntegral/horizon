const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export default function CapacityScreen() {
  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-bold text-primary">Weekly Capacity</h2>
            <p className="text-lg text-on-surface-variant">Week of Oct 23 – Oct 29</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-4 neumorphic-raised p-6 rounded-lg bg-surface flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase">Summary</h3>
              <div className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm fill-1">warning</span> Caution
              </div>
            </div>
            <div className="flex-grow flex flex-col justify-center">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-4xl font-bold text-primary">18h</p>
                  <p className="text-xs text-on-surface-variant font-bold">Total Available</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">14h</p>
                  <p className="text-xs text-on-surface-variant font-bold">Scheduled</p>
                </div>
              </div>
              <div className="w-full h-6 neumorphic-sunken rounded-full p-1">
                <div className="h-full rounded-full bg-primary" style={{ width: '77%' }}></div>
              </div>
            </div>
          </section>

          <section className="lg:col-span-8 neumorphic-raised p-6 rounded-lg bg-surface overflow-x-auto scrollbar-hide">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-6">Risk Timeline</h3>
            <div className="flex justify-between min-w-[600px] gap-4 h-48">
              {days.map((day, i) => (
                <div key={day} className="flex-1 flex flex-col items-center gap-2">
                  <span className={`text-[10px] font-bold ${day === 'THU' ? 'text-secondary' : 'text-on-surface-variant'}`}>
                    {day}
                  </span>
                  <div
                    className={`w-full h-full neumorphic-sunken rounded-xl flex flex-col justify-end p-1 ${
                      day === 'THU' ? 'border-2 border-secondary/20' : ''
                    }`}
                  >
                    <div
                      className={`w-full rounded-lg ${day === 'THU' ? 'bg-secondary h-full' : 'bg-primary'}`}
                      style={{ height: day === 'THU' ? '90%' : `${30 + i * 10}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
