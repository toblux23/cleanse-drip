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

// Reads ?accent=, ?bg=, ?hideLogo= — only meaningful for the <iframe> delivery
// (availability.html), where the embedding page can't reach the widget's DOM
// at all, so these query params on the src URL are the only safe customization
// channel. The direct <script> embed (embed.tsx) doesn't use these — there,
// the widget shares the host's DOM and the host's own CSS can already target
// every .cd-* class below directly, which is the whole point of that mode.
//
// Every value here is strictly validated before use: colors must match a
// plain #rrggbb hex pattern (or the literal word "transparent" for ?bg), and
// booleans are compared against a fixed set of truthy strings. Nothing is
// ever concatenated into a style string or HTML — values only ever reach a
// CSS custom property or a React boolean.
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

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// Public, read-only availability widget. No login, no booking action.
// Every element carries a stable `cd-*` class (documented below) alongside
// the Tailwind utility classes that give it a default look — the utility
// classes are an implementation detail and may change; the `cd-*` classes
// are the intended, stable hook for a host page's own CSS to override.
//
// Delivered two ways:
//  - availability.html (<iframe>): isolated, no-trust-required, styled via
//    the ?accent/?bg/?hideLogo/?compact URL params above.
//  - embed.js (<script> + host-provided container div): mounts directly into
//    the host's DOM, so their own stylesheet cascades in and can restyle
//    anything here with a plain `.cd-day { ... }` rule — no params needed.
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
    // color-mix()/var() in either inline styles or the <style> block. When
    // embedded via embed.js, a host stylesheet can simply redefine
    // `--accent` on #cd-availability (or override any .cd-* rule directly)
    // and it cascades through exactly the same way.
    <div
      className={cx('cd-widget min-h-screen flex items-start justify-center', pad)}
      style={{ ['--accent' as string]: accent, background }}
    >
      <style>{`
        .cd-day:hover:not(:disabled) { background-color: color-mix(in srgb, var(--accent) 10%, white); }
      `}</style>
      <div className="cd-container w-full max-w-md">
        {!hideLogo && (
          <div className="cd-header flex items-center gap-2 mb-4">
            <div className="cd-logo w-7 h-7 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg flex items-center justify-center shadow-sm flex-shrink-0">
              <Droplets className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="cd-logo-text font-bold text-sm text-slate-800">Cleanse &amp; Drip — Availability</p>
          </div>
        )}

        <div className={cx('cd-panel border border-slate-200 rounded-2xl overflow-hidden shadow-sm', background !== 'transparent' && 'bg-white')}>
          {/* Month header */}
          <div className={cx('cd-nav flex items-center justify-between px-4 bg-slate-50 border-b border-slate-200', dayPad)}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="cd-nav-btn cd-nav-prev p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="cd-month-label text-sm font-bold text-slate-800">{monthLabel}</p>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthCursor(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="cd-nav-btn cd-nav-next p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday labels */}
          <div className="cd-weekdays grid grid-cols-7 px-2 pt-3 text-center">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="cd-weekday text-[10px] font-bold text-slate-400 uppercase pb-1">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className={cx('cd-days grid grid-cols-7 gap-1 px-2', compact ? 'pb-2' : 'pb-3')}>
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
                  className={cx(
                    'cd-day aspect-square rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition-colors',
                    isPast ? 'text-slate-300 cursor-not-allowed cd-day--past' : 'cursor-pointer',
                    isSelected && 'cd-day--selected',
                    isToday && 'cd-day--today',
                    !isSelected && !isPast && hasOpening && 'text-slate-700 cd-day--available',
                    !isSelected && !isPast && hasOpening === false && 'text-slate-400 hover:bg-slate-50 cd-day--full'
                  )}
                  style={{
                    backgroundColor: isSelected ? 'var(--accent)' : undefined,
                    color: isSelected ? '#ffffff' : undefined,
                    boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px var(--accent)' : undefined,
                  }}
                >
                  <span className="cd-day-number">{Number(day.split('-')[2])}</span>
                  {!isPast && (
                    <span
                      className={cx('cd-day-dot w-1 h-1 rounded-full', isSelected ? 'bg-white' : !hasOpening && 'bg-slate-300')}
                      style={{ backgroundColor: !isSelected && hasOpening ? 'var(--accent)' : undefined }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day's time slots */}
        <div className="cd-slots-section mt-4">
          <p className="cd-selected-label text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </p>

          {loading && (
            <div className="cd-loading flex items-center justify-center py-10">
              <div
                className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
            </div>
          )}

          {error && <p className="cd-error text-sm text-rose-600 py-4">{error}</p>}

          {!loading && !error && selectedSlots.length === 0 && (
            <p className="cd-empty text-sm text-slate-400 py-4">No slots configured for this date.</p>
          )}

          {!loading && !error && selectedSlots.length > 0 && (
            <div className="cd-slots grid grid-cols-2 sm:grid-cols-3 gap-2">
              {selectedSlots.map(s => {
                const isOpen = s.status === 'available';
                return (
                  <div
                    key={s.slot_time}
                    className={cx(
                      'cd-slot flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold border',
                      dayPad === 'py-2' ? 'py-1.5' : 'py-2',
                      isOpen ? 'cd-slot--open' : 'bg-slate-50 border-slate-200 text-slate-400 line-through cd-slot--closed'
                    )}
                    style={isOpen ? {
                      backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)',
                      borderColor: 'color-mix(in srgb, var(--accent) 30%, white)',
                      color: 'var(--accent)',
                    } : undefined}
                  >
                    <Clock className="cd-slot-icon w-3 h-3 flex-shrink-0" />
                    {formatTime(s.slot_time, s.label)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="cd-footer mt-6 text-[11px] text-slate-400 text-center">
          Times shown are open slots only — availability updates automatically.
        </p>
      </div>
    </div>
  );
}
