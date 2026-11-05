import type { Slot } from '../api/types'
import type { makeGrid } from '../utils/grid'
import { formatHour, money } from '../utils/format'
import { Empty } from './Empty'

interface Props {
  slots: Slot[]
  grid: ReturnType<typeof makeGrid>
  selected: number | null
  duration: 1 | 2
  priceCents?: number
  onSelect: (hour: number) => void
}

/** The day's hours as buttons, coloured by status, with a legend. */
export function SlotGrid({ slots, grid, selected, duration, priceCents, onSelect }: Props) {
  const { mode } = grid.selection(selected, duration)
  const isSelected = (h: number) => mode !== null && selected !== null && (h === selected || (duration === 2 && h === selected + 1))

  return (
    <>
      <div className="legend" aria-hidden="true">
        <span><i className="dot available" />Free</span>
        <span><i className="dot selected" />Selected</span>
        <span><i className="dot taken" />Booked</span>
        <span><i className="dot mine" />Yours</span>
        <span><i className="dot waiting" />On your waitlist</span>
        <span><i className="dot past" />Past</span>
      </div>
      {slots.length === 0 ? <Empty>No slots for this court.</Empty> : (
        <div className="slots">
          {slots.map((s) => {
            const label = grid.label(s, priceCents, money)
            return (
              <button
                key={s.hour}
                className={`slot ${grid.className(s, isSelected(s.hour))}`}
                disabled={!grid.clickable(s)}
                onClick={() => onSelect(s.hour)}
                aria-pressed={isSelected(s.hour)}
                aria-label={`${formatHour(s.hour)} ${label}`}
              >
                <strong>{formatHour(s.hour)}</strong>
                <small>{label}</small>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
