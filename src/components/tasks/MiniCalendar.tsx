const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function getWeekDates(anchor: Date): Date[] {
  const diffToMonday = (anchor.getDay() + 6) % 7
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - diffToMonday)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface MiniCalendarProps {
  selectedDate: Date
  taskDates: Set<string>
  onSelect: (date: Date) => void
}

export default function MiniCalendar({ selectedDate, taskDates, onSelect }: MiniCalendarProps) {
  const today = toISODate(new Date())
  const selectedStr = toISODate(selectedDate)
  const weekDates = getWeekDates(selectedDate)

  return (
    <div className="px-5 py-3 border-b border-white/10">
      <div className="grid grid-cols-7 gap-0.5">
        {weekDates.map((d, i) => {
          const iso = toISODate(d)
          const isSelected = iso === selectedStr
          const isToday = iso === today
          const hasTasks = taskDates.has(iso)

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(d)}
              aria-label={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              className="flex flex-col items-center gap-1 py-1.5 rounded-lg transition-colors hover:bg-white/10"
            >
              <span className="text-[10px] text-white/40 font-medium leading-none">
                {DAY_LETTERS[i]}
              </span>

              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold leading-none transition-colors ${
                  isSelected
                    ? 'bg-accent-green text-white'
                    : isToday
                    ? 'ring-1 ring-white/50 text-white'
                    : 'text-white/70'
                }`}
              >
                {d.getDate()}
              </span>

              {/* Task dot */}
              <span
                className={`w-1 h-1 rounded-full transition-opacity ${
                  hasTasks ? 'bg-accent-gold opacity-90' : 'opacity-0'
                }`}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
