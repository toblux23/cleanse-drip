/*
# get_availability() — public, read-only slot status for an embeddable calendar

## Purpose
An embeddable widget on a third-party site needs to show which dates/times
are open, with no login. The existing public booking form already computes
this client-side, but does so incorrectly for anon callers: `appointments`
and `booking_buffer_settings` have no anon SELECT policy, so
fetchBookedSlots()/fetchActiveBufferMinutes() silently see partial or
fallback data (see BookingForm.tsx / bookingSlots.ts / bookingBuffer.ts).

Rather than widen anon access to those tables directly — which would expose
client names, services, and every operational field on `appointments` to the
public internet — this function does the same computation SECURITY DEFINER
(so it can see both `client_bookings` and `appointments` in full) and returns
only a slot's status. No client identity, no service, no appointment id.

## Shape
There is no per-date/day-of-week/branch variation anywhere in this schema —
booking_time_slots is one global list of times-of-day. So availability for a
range is just: every active slot, on every date in range, marked booked if it
matches an active client_bookings or appointments row for that exact
date+time, buffer if inside the configured lead time, past if already gone.

## Abuse note
No auth is required by design (that's the point of an embeddable widget), so
the date range is capped at 60 days server-side to bound the work per call.
*/

CREATE OR REPLACE FUNCTION public.get_availability(p_start date, p_end date)
RETURNS TABLE(slot_date date, slot_time time, label text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_buffer_minutes integer;
BEGIN
  IF p_end < p_start THEN
    RAISE EXCEPTION 'p_end must not be before p_start';
  END IF;
  IF p_end - p_start > 60 THEN
    RAISE EXCEPTION 'Range too large: max 60 days per call';
  END IF;

  SELECT CASE bs.buffer_unit WHEN 'hours' THEN bs.buffer_value * 60 ELSE bs.buffer_value END
  INTO v_buffer_minutes
  FROM booking_buffer_settings bs
  WHERE bs.is_active = true AND bs.effective_date <= CURRENT_DATE
  ORDER BY bs.created_at DESC
  LIMIT 1;
  v_buffer_minutes := COALESCE(v_buffer_minutes, 120); -- same fallback as bookingBuffer.ts

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(p_start, p_end, '1 day')::date AS d
  ),
  candidate AS (
    SELECT d.d AS slot_date, ts.slot_time, ts.label
    FROM days d
    CROSS JOIN booking_time_slots ts
    WHERE ts.is_active = true
  ),
  booked AS (
    SELECT cb.preferred_date AS slot_date, cb.preferred_time AS slot_time
    FROM client_bookings cb
    WHERE cb.status IN ('NEW', 'CONFIRMED')
      AND cb.preferred_date BETWEEN p_start AND p_end
    UNION
    SELECT a.scheduled_date, a.scheduled_time::time
    FROM appointments a
    WHERE a.status <> 'cancelled'
      AND a.scheduled_date BETWEEN p_start AND p_end
  )
  SELECT
    c.slot_date, c.slot_time, c.label,
    CASE
      WHEN (c.slot_date + c.slot_time) < now() THEN 'past'
      WHEN (c.slot_date + c.slot_time) < (now() + make_interval(mins => v_buffer_minutes)) THEN 'buffer'
      WHEN b.slot_date IS NOT NULL THEN 'booked'
      ELSE 'available'
    END AS status
  FROM candidate c
  LEFT JOIN booked b ON b.slot_date = c.slot_date AND b.slot_time = c.slot_time
  ORDER BY c.slot_date, c.slot_time;
END;
$$;

REVOKE ALL ON FUNCTION public.get_availability(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_availability(date, date) TO anon, authenticated;
