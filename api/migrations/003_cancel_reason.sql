-- Why a booking was cancelled: NULL = by the player, 'court_deactivated' = the admin closed the court.
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT CHECK (cancel_reason IN ('court_deactivated'));

-- Waitlist entries closed by the facility (not left by the player).
ALTER TYPE waitlist_status ADD VALUE 'cancelled';
