import { useState } from 'react'
import { addMonths, monthCells, monthLabel, monthOf, WEEKDAYS } from '../utils/calendar'
import { dayLabel, today } from '../utils/format'

interface Props {
  value: string // selected day, YYYY-MM-DD
  onChange: (day: string) => void
  /** Days before this can't be picked (YYYY-MM-DD). */
  min?: string
}

/** Month view to pick a day. Shows the month of the selected day; arrows move between months. */
export function MonthCalendar({ value, onChange, min }: Props) {
  const [month, setMonth] = useState(monthOf(value))
  // Follow the selected day when it's changed from outside (e.g. reset).
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setMonth(monthOf(value))
  }
  const now = today()

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="btn btn-ghost icon" aria-label="Previous month"
          disabled={!!min && month <= monthOf(min)} onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <strong aria-live="polite">{monthLabel(month)}</strong>
        <button type="button" className="btn btn-ghost icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((d) => <span key={d} className="calendar-weekday" aria-hidden="true">{d}</span>)}
        {monthCells(month).map((day, i) => day === null
          ? <span key={`blank-${i}`} />
          : (
            <button
              key={day}
              type="button"
              className={`calendar-day${day === value ? ' selected' : ''}${day === now ? ' today' : ''}`}
              disabled={!!min && day < min}
              aria-pressed={day === value}
              aria-label={dayLabel(day) + (day === now ? ' (today)' : '')}
              onClick={() => onChange(day)}
            >
              {Number(day.slice(8))}
            </button>
          ))}
      </div>
    </div>
  )
}
