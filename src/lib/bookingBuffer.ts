import { supabase, type BookingBufferSetting } from './supabase';

export interface ResolvedBuffer {
  minutes: number;
  source: BookingBufferSetting | null;
}

/**
 * Fetch the active booking lead-time buffer in minutes.
 * Falls back to 120 minutes (2 hours) if no setting is found.
 */
export async function fetchActiveBufferMinutes(): Promise<ResolvedBuffer> {
  const { data } = await supabase
    .from('booking_buffer_settings')
    .select('*')
    .eq('is_active', true)
    .lte('effective_date', new Date().toISOString().split('T')[0])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { minutes: 120, source: null };

  const setting = data as BookingBufferSetting;
  const minutes = setting.buffer_unit === 'hours'
    ? setting.buffer_value * 60
    : setting.buffer_value;
  return { minutes, source: setting };
}

/**
 * Returns true if the given date+time slot is within the buffer window
 * (i.e. too soon to book).
 */
export function isWithinBuffer(
  dateStr: string,
  timeStr: string,
  bufferMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!dateStr || !timeStr) return false;
  const slot = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(slot.getTime())) return false;
  const earliest = new Date(now.getTime() + bufferMinutes * 60_000);
  return slot.getTime() < earliest.getTime();
}

/**
 * Returns true if the slot is in the past.
 */
export function isPastSlot(dateStr: string, timeStr: string, now: Date = new Date()): boolean {
  if (!dateStr || !timeStr) return false;
  const slot = new Date(`${dateStr}T${timeStr}:00`);
  if (Number.isNaN(slot.getTime())) return false;
  return slot.getTime() < now.getTime();
}

/**
 * Compute the earliest bookable Date given a buffer in minutes.
 */
export function earliestBookableDate(bufferMinutes: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + bufferMinutes * 60_000);
}
