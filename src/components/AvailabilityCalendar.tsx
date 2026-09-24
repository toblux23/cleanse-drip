import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Droplets, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

type SlotStatus = 'available' | 'booked' | 'buffer' | 'past';

type SlotRow = {
  slot_date: string;   // 'YYYY-MM-DD'
  slot_time: string;   // 'HH:MM:SS'
  label: string | null;
  status: SlotStatus;
};

const DEFAULT_ACCENT = '#0d9488'; // Tailwind teal-600, the widget's default look
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Reads ?accent=, ?bg=, ?hideLogo= from the embedding page's chosen iframe src
// so a third-party site can restyle the widget to match its own brand without
// us needing to trust anything from them beyond a color code — a cross-origin
// iframe can't be reached into with CSS/JS from the parent page anyway, so
// query params on the src URL are the standard, safe way to do this.
//
// Every value is strictly validated before use: colors must match a plain
// #rrggbb hex pattern (or the literal word "transparent" for ?bg), and
// booleans are compared against a fixed set of truthy strings. Nothing here
// is ever concatenated into a style string or HTML — values only ever reach
// a CSS custom property or a React boolean, so there's no way an embedder
// (or anyone editing the iframe src) can inject CSS/JS through these.
function readCustomization() {
  const params = new URLSearchParams(window.location.search);

  const rawAccent = params.get('accent');
  const accent = rawAccent && HEX_COLOR.test(`#${rawAccent.replace(/^#/, '')}`)
    ? `#${rawAccent.replace(/^#/, '')}`
    : DEFAULT_ACCENT;

  const rawBg = params.get('bg');
  const background = rawBg === 'transparent'
    ? 'transparent'
    : rawBg && HEX_COLOR.test(`#${rawBg.replace(/^#/, '')}`)
    ? `#${rawBg.replace(/^#/, '')}`
    : '#ffffff';

  const hideLogo = ['1', 'true', 'yes'].includes((params.get('hideLogo') ?? '').toLowerCase());
  const compact = ['1', 'true', 'yes'].includes((params.get('compact') ?? '').toLowerCase());

  return { accent, background, hideLogo, compact };
}

function ymd(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(slotTime: string, label: string | null): string {
  if (label) return label;
  const [hStr, mStr] = slotTime.split(':');
  const h = Number(hStr);
  const displayH = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${displayH}:${mStr} ${ampm}`;
}

// Public, read-only availability widget. No login, no booking action —
// designed to be embedded via <iframe> on a third-party site to show what
// dates/times are open. Deliberately renders with no app nav/chrome so it
// looks native wherever it's embedded.
export default function AvailabilityCalendar() {
  const [{ accent, background, hideLogo, compact }] = useState(readCustomization);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => ymd(new Date()));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
      const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
      const { data, error: rpcError } = await supabase.rpc('get_availability', {
        p_start: ymd(start),
        p_end: ymd(end),
      });
      if (cancelled) return;
      if (rpcError) {
        setError('Could not load availability. Please try again shortly.');
        setSlots([]);
      } else {
        setSlots((data ?? []) as SlotRow[]);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [monthCursor]);

  const dayHasOpening = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of slots) {
      if (s.status === 'available') map.set(s.slot_date, true);
      else if (!map.has(s.slot_date)) map.set(s.slot_date, false);
    }
    return map;
  }, [slots]);

  const selectedSlots = useMemo(
    () => slots.filter(s => s.slot_date === selectedDate).sort((a, b) => a.slot_time.localeCompare(b.slot_time)),
    [slots, selectedDate]
  );

  const todayStr = ymd(new Date());
  const gridDays = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(ymd(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d)));
    }
    return cells;
  }, [monthCursor]);

  const monthLabel = monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const pad = compact ? 'p-2 sm:p-3' : 'p-3 sm:p-6';
  const dayPad = compact ? 'py-2' : 'py-3';

  return (
    // The --accent custom property drives every customizable color below via
    // color-mix()/var() in either inline styles or the <style> block — nothing
    // here builds a CSS/HTML string out of it, so the strict hex validation
    // above is the only gate this ever needs.
    <div
      className={`min-h-screen flex items-start justify-center ${pad}`}
      style={{ ['--accent' as string]: accent, background }}
    >
      <style>{`
        .cd-day:hover:not(:disabled) { background-color: color-mix(in srgb, var(--accent) 10%, white); }
      `}</style>
      <div className="w-full max-w-md">
        {!hideLogo && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
              <Droplets className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="font-bold text-sm text-slate-800">Cleanse &amp; Drip — Availability</p>
          </div>
        )}

        <div className={`border border-slate-200 rounded-2xl overflow-hidden shadow-sm ${background === 'transparent' ? '' : 'bg-white'}`}>
          {/* Month header */}
          <div className={`flex items-center justify-between px-4 ${dayPad} bg-slate-50 border-b border-slate-200`}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-slate-800">{monthLabel}</p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 px-2 pt-3 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-[10px] font-bold text-slate-400 uppercase pb-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className={`grid grid-cols-7 gap-1 px-2 ${compact ? 'pb-2' : 'pb-3'}`}>
            {gridDays.map((day, i) => {
              if (!day) return <div key={i} />;
              const isPast = day < todayStr;
              const hasOpening = dayHasOpening.get(day);
              const isSelected = day === selectedDate;
              const isToday = day === todayStr;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPast}
                  onClick={() => setSelectedDate(day)}
                  className={`cd-day aspect-square rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors
                    ${isPast ? 'text-slate-300 cursor-not-allowed' : 'cursor-pointer'}
                    ${!isSelected && !isPast && hasOpening ? 'text-slate-700' : ''}
                    ${!isSelected && !isPast && hasOpening === false ? 'text-slate-400 hover:bg-slate-50' : ''}
                  `}
                  style={{
                    backgroundColor: isSelected ? 'var(--accent)' : undefined,
                    color: isSelected ? '#ffffff' : undefined,
                    boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px var(--accent)' : undefined,
                  }}
                >
                  <span>{Number(day.split('-')[2])}</span>
                  {!isPast && (
                    <span
                      className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : !hasOpening ? 'bg-slate-300' : ''}`}
                      style={{ backgroundColor: !isSelected && hasOpening ? 'var(--accent)' : undefined }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day's time slots */}
        <div className="mt-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </p>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <div
                className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
            </div>
          )}

          {error && <p className="text-sm text-rose-600 py-4">{error}</p>}

          {!loading && !error && selectedSlots.length === 0 && (
            <p className="text-sm text-slate-400 py-4">No slots configured for this date.</p>
          )}

          {!loading && !error && selectedSlots.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {selectedSlots.map(s => {
                const isOpen = s.status === 'available';
                return (
                  <div
                    key={s.slot_time}
                    className={`flex items-center gap-1.5 px-3 ${dayPad === 'py-2' ? 'py-1.5' : 'py-2'} rounded-lg text-xs font-semibold border
                      ${isOpen ? '' : 'bg-slate-50 border-slate-200 text-slate-400 line-through'}
                    `}
                    style={isOpen ? {
                      backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)',
                      borderColor: 'color-mix(in srgb, var(--accent) 30%, white)',
                      color: 'var(--accent)',
                    } : undefined}
                  >
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {formatTime(s.slot_time, s.label)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="mt-6 text-[11px] text-slate-400 text-center">
          Times shown are open slots only — availability updates automatically.
        </p>
      </div>
    </div>
  );
}
