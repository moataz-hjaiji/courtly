// Shapes of the JSON the API returns. Times are ISO strings in UTC.
export type Role = 'user' | 'admin'
export interface User { id: number; name: string; email: string; role: Role }

export interface Court {
  id: number; name: string; sport: string; hourlyPriceCents: number
  openHour: number; closeHour: number; isActive: boolean
  /** Admins only: confirmed bookings still ahead on this court. */
  futureBookings?: number
}

export type SlotStatus = 'available' | 'taken' | 'past'
/** One hour on a court's day. `mine` is true when the logged-in user holds the booking. */
export interface Slot { hour: number; startAt: string; status: SlotStatus; mine: boolean }

export interface Booking {
  id: number; courtId: number; courtName: string; sport: string; userId: number
  startAt: string; endAt: string; priceCents: number; status: 'confirmed' | 'cancelled'
  userName?: string; userEmail?: string
  /** null when the player cancelled; 'court_deactivated' when the admin closed the court. */
  cancelReason?: 'court_deactivated' | null
}

export interface WaitlistEntry {
  id: number; courtId: number; courtName: string; sport: string; startAt: string; endAt: string
  status: 'waiting' | 'promoted' | 'left' | 'cancelled'; bookingId: number | null; position: number | null
}
