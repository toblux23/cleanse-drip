import { Clock, Lock, Hourglass, Ban } from 'lucide-react';
import { isPastSlot, isWithinBuffer } from '../lib/bookingBuffer';
import type { TimeSlot } from '../lib/bookingSlots';

type SlotStatus = 'available' | 'booked' | 'buffer' | 'past';

export default function TimeSlotPicker({
  value, onChange, selectedDate, bufferMinutes, bookedSlots, slots,
}: {
  value: string;
  onChange: (v: string) => void;
  selectedDate: string;
  bufferMinutes: number;
  bookedSlots: Set<string>;
  slots: TimeSlot[];
}) {
  const slotStatus = (slotValue: string): SlotStatus => {
    if (!selectedDate) return 'available';
    if (isPastSlot(selectedDate, slotValue)) return 'past';
    if (isWithinBuffer(selectedDate, slotValue, bufferMinutes)) return 'buffer';
    if (bookedSlots.has(slotValue)) return 'booked';
    return 'available';
  };

  const statusCfg: Record<SlotStatus, { label: string; className: string; icon: React.ElementType; disabled: boolean }> = {
    available: { label: 'Available', className: 'border-slate-200 hover:border-teal-400 hover:bg-teal-50 text-slate-700 hover:text-teal-700 cursor-pointer', icon: Clock, disabled: false },
    booked: { label: 'Booked', className: 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed', icon: Lock, disabled: true },
    buffer: { label: 'Within Buffer', className: 'border-amber-200 bg-amber-50 text-amber-500 cursor-not-allowed', icon: Hourglass, disabled: true },
    past: { label: 'Past', className: 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed line-through', icon: Ban, disabled: true },
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {slots.map(s => {
          const status = slotStatus(s.value);
          const cfg = statusCfg[status];
          const active = value === s.value && status === 'available';
          const Icon = cfg.icon;
          return (
            <button
              key={s.value}
              type="button"
              disabled={cfg.disabled}
              onClick={() => status === 'available' && onChange(s.value)}
              title={cfg.label}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border-2 text-xs font-semibold transition-all ${active ? 'border-teal-500 bg-teal-500 text-white' : cfg.className}`}
            >
              <span>{s.label}</span>
              {status !== 'available' && (
                <span className="flex items-center gap-0.5 text-[9px] font-medium opacity-80">
                  <Icon className="w-2.5 h-2.5" /> {cfg.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-teal-500 bg-teal-500" /> Available</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-slate-200 bg-slate-100" /> Booked</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-amber-200 bg-amber-50" /> Within Buffer</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded border-2 border-slate-200 bg-slate-50" /> Past</span>
      </div>
    </div>
  );
}
