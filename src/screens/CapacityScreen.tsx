import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { subscribeThisWeekTasks, type Task } from '../lib/tasks'
import { subscribeUserSettings, setCapacitySettings, type UserSettings } from '../lib/userSettings'
import { getWeekDays, isSameDay } from '../lib/dateUtils'

const DEFAULT_WEEKDAY_HOURS = 3
const DEFAULT_WEEKEND_HOURS = 2
const CAUTION_THRESHOLD = 0.7

const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export default function CapacityScreen() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [editing, setEditing] = useState(false)
  const [weekdayHoursInput, setWeekdayHoursInput] = useState(String(DEFAULT_WEEKDAY_HOURS))
  const [weekendHoursInput, setWeekendHoursInput] = useState(String(DEFAULT_WEEKEND_HOURS))

  useEffect(() => {
    if (!user) return
    const unsub1 = subscribeThisWeekTasks(user.uid, setTasks)
    const unsub2 = subscribeUserSettings(user.uid, setSettings)
    return () => {
      unsub1()
      unsub2()
    }
  }, [user])

  const weekdayMinutes = settings?.weekdayCapacityMinutes ?? DEFAULT_WEEKDAY_HOURS * 60
  const weekendMinutes = settings?.weekendCapacityMinutes ?? DEFAULT_WEEKEND_HOURS * 60

  const weekDays = useMemo(() => getWeekDays(), [])

  const dayLoads = useMemo(
    () =>
      weekDays.map((day) => {
        const isWeekend = day.getDay() === 0 || day.getDay() === 6
        const capacity = isWeekend ? weekendMinutes : weekdayMinutes
        const loadMinutes = tasks
          .filter((t) => t.dueDate && isSameDay(t.dueDate.toDate(), day))
          .reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0)
        return { day, capacity, loadMinutes, isOverloaded: capacity > 0 && loadMinutes > capacity }
      }),
    [weekDays, tasks, weekdayMinutes, weekendMinutes],
  )

  const totalAvailableMinutes = weekdayMinutes * 5 + weekendMinutes * 2
  const totalScheduledMinutes = dayLoads.reduce((sum, d) => sum + d.loadMinutes, 0)
  const scheduledRatio = totalAvailableMinutes > 0 ? totalScheduledMinutes / totalAvailableMinutes : 0
  const isCaution = scheduledRatio >= CAUTION_THRESHOLD

  const handleSaveCapacity = async () => {
    if (!user) return
    const wd = Math.max(0, Math.round(parseFloat(weekdayHoursInput || '0') * 60))
    const we = Math.max(0, Math.round(parseFloat(weekendHoursInput || '0') * 60))
    await setCapacitySettings(user.uid, wd, we)
    setEditing(false)
  }

  const startEditing = () => {
    setWeekdayHoursInput(String(weekdayMinutes / 60))
    setWeekendHoursInput(String(weekendMinutes / 60))
    setEditing(true)
  }

  const weekRangeLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric' },
  )}`

  return (
    <div className="flex-grow p-6 lg:p-10 overflow-y-auto pb-32 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-10">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-bold text-primary">Weekly Capacity</h2>
            <p className="text-lg text-on-surface-variant">Week of {weekRangeLabel}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-4 neumorphic-raised p-6 rounded-lg bg-surface flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-on-surface-variant uppercase">Summary</h3>
              {isCaution ? (
                <div className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm fill-1">warning</span> Caution
                </div>
              ) : (
                <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span> On Track
                </div>
              )}
            </div>

            {editing ? (
              <div className="flex-grow flex flex-col justify-center gap-3">
                <label className="text-xs font-bold text-outline">平日 1日あたり(h)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                  value={weekdayHoursInput}
                  onChange={(e) => setWeekdayHoursInput(e.target.value)}
                />
                <label className="text-xs font-bold text-outline">週末 1日あたり(h)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full p-2 text-sm neumorphic-sunken border-none rounded-lg bg-surface"
                  value={weekendHoursInput}
                  onChange={(e) => setWeekendHoursInput(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 py-2 rounded-full text-xs font-bold text-on-surface-variant hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                  <button onClick={handleSaveCapacity} className="flex-1 py-2 rounded-full text-xs font-bold bg-primary text-white">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col justify-center">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-4xl font-bold text-primary">{Math.round(totalAvailableMinutes / 60)}h</p>
                    <p className="text-xs text-on-surface-variant font-bold">Total Available</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{Math.round(totalScheduledMinutes / 60)}h</p>
                    <p className="text-xs text-on-surface-variant font-bold">Scheduled</p>
                  </div>
                </div>
                <div className="w-full h-6 neumorphic-sunken rounded-full p-1">
                  <div
                    className={`h-full rounded-full ${isCaution ? 'bg-secondary' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, scheduledRatio * 100)}%` }}
                  ></div>
                </div>
                <button onClick={startEditing} className="mt-4 text-xs font-bold text-primary hover:underline self-start">
                  稼働時間を編集
                </button>
              </div>
            )}
          </section>

          <section className="lg:col-span-8 neumorphic-raised p-6 rounded-lg bg-surface overflow-x-auto scrollbar-hide">
            <h3 className="text-xs font-bold text-on-surface-variant uppercase mb-6">Risk Timeline</h3>
            <div className="flex justify-between min-w-[600px] gap-4 h-48">
              {dayLoads.map(({ capacity, loadMinutes, isOverloaded }, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <span className={`text-[10px] font-bold ${isOverloaded ? 'text-secondary' : 'text-on-surface-variant'}`}>
                    {dayLabels[i]}
                  </span>
                  <div
                    className={`w-full h-full neumorphic-sunken rounded-xl flex flex-col justify-end p-1 ${
                      isOverloaded ? 'border-2 border-secondary/20' : ''
                    }`}
                  >
                    <div
                      className={`w-full rounded-lg ${isOverloaded ? 'bg-secondary' : 'bg-primary'}`}
                      style={{ height: `${capacity > 0 ? Math.min(100, (loadMinutes / capacity) * 100) : 0}%` }}
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
