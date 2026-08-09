import { supabase } from './supabase';

export interface TimeSlot {
  label: string;
  value: string;
}

const DEFAULT_SLOTS: TimeSlot[] = (() => {
  const slots: TimeSlot[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m === 30) break;
      const hour12 = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      slots.push({
        label: `${hour12}:${String(m).padStart(2, '0')} ${ampm}`,
        value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      });
    }
  }
  return slots;
})();

function formatTimeLabel(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export async function fetchActiveTimeSlots(): Promise<TimeSlot[]> {
  const { data } = await supabase
    .from('booking_time_slots')
    .select('slot_time, label, display_order')
    .eq('is_active', true)
    .order('slot_time', { ascending: true });

  if (!data || data.length === 0) return DEFAULT_SLOTS;

  return data.map(row => ({
    label: row.label || formatTimeLabel(row.slot_time),
    value: row.slot_time,
  }));
}

export async function fetchBookedSlots(date: string): Promise<Set<string>> {
  if (!date) return new Set();
  const [bookingsRes, apptsRes] = await Promise.all([
    supabase.from('client_bookings')
      .select('preferred_time')
      .eq('preferred_date', date)
      .in('status', ['NEW', 'CONFIRMED']),
    supabase.from('appointments')
      .select('scheduled_time')
      .eq('scheduled_date', date)
      .neq('status', 'cancelled'),
  ]);
  const slots = new Set<string>();
  (bookingsRes.data ?? []).forEach(b => { if (b.preferred_time) slots.add(b.preferred_time); });
  (apptsRes.data ?? []).forEach(a => { if (a.scheduled_time) slots.add(a.scheduled_time); });
  return slots;
}

export { DEFAULT_SLOTS };
