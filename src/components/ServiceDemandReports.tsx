import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart3, RefreshCw, Loader2, AlertCircle, Calendar, TrendingUp,
  ArrowUpCircle, ArrowDownCircle, Activity, Trophy, Filter,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppointmentRow {
  id: string;
  service: string | null;
  scheduled_date: string;
  status: string;
}

interface BookingRow {
  id: string;
  services_requested: string[];
  preferred_date: string;
  status: string;
}

interface ServiceCount {
  name: string;
  count: number;
}

interface TrendPoint {
  date: string;
  label: string;
  total: number;
  services: Record<string, number>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstOfMonth(d: string): string {
  const [y, m] = d.split('-');
  return `${y}-${m}-01`;
}

function daysAgoStr(days: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateFull(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Parse a service string that may contain comma-separated values into individual service names
function parseServices(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);
}

// Parse a services_requested array into individual service names
function parseArrayServices(arr: string[] | null): string[] {
  if (!arr || arr.length === 0) return [];
  return arr
    .flatMap(s => s.split(','))
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);
}

const RANK_COLORS = [
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-indigo-400',
  'bg-violet-400',
  'bg-purple-400',
  'bg-pink-400',
  'bg-rose-400',
  'bg-amber-400',
  'bg-orange-400',
];

const TREND_COLOR = 'bg-teal-500';

// ─── Component ─────────────────────────────────────────────────────────────────

type DatePreset = '7d' | '30d' | '90d' | 'mtd' | 'all';

export default function ServiceDemandReports() {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [serviceFilter, setServiceFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [apptRes, bookingRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, service, scheduled_date, status')
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('client_bookings')
        .select('id, services_requested, preferred_date, status')
        .order('preferred_date', { ascending: true }),
    ]);

    if (apptRes.error) { setError('Failed to load appointment data.'); setLoading(false); return; }
    if (bookingRes.error) { setError('Failed to load booking data.'); setLoading(false); return; }

    setAppointments((apptRes.data ?? []) as unknown as AppointmentRow[]);
    setBookings((bookingRes.data ?? []) as unknown as BookingRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Determine date range
  const { startDate, endDate } = useMemo(() => {
    if (useCustomRange && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    const end = todayStr();
    switch (datePreset) {
      case '7d':  return { startDate: daysAgoStr(6), endDate: end };
      case '30d': return { startDate: daysAgoStr(29), endDate: end };
      case '90d': return { startDate: daysAgoStr(89), endDate: end };
      case 'mtd': return { startDate: firstOfMonth(end), endDate: end };
      case 'all': return { startDate: '2000-01-01', endDate: end };
      default:    return { startDate: daysAgoStr(29), endDate: end };
    }
  }, [datePreset, useCustomRange, customStart, customEnd]);

  // Filter records by date range and extract all service entries
  const allServiceEntries = useMemo(() => {
    const entries: { date: string; service: string; source: 'appointment' | 'booking' }[] = [];

    for (const a of appointments) {
      if (!a.scheduled_date) continue;
      if (a.scheduled_date < startDate || a.scheduled_date > endDate) continue;
      const services = parseServices(a.service);
      for (const s of services) {
        entries.push({ date: a.scheduled_date, service: s, source: 'appointment' });
      }
    }

    for (const b of bookings) {
      if (!b.preferred_date) continue;
      if (b.preferred_date < startDate || b.preferred_date > endDate) continue;
      const services = parseArrayServices(b.services_requested);
      for (const s of services) {
        entries.push({ date: b.preferred_date, service: s, source: 'booking' });
      }
    }

    return entries;
  }, [appointments, bookings, startDate, endDate]);

  // Apply service filter
  const filteredEntries = useMemo(() => {
    if (serviceFilter === 'all') return allServiceEntries;
    return allServiceEntries.filter(e => e.service === serviceFilter);
  }, [allServiceEntries, serviceFilter]);

  // All unique service names for filter dropdown
  const allServiceNames = useMemo(() => {
    const set = new Set<string>();
    for (const e of allServiceEntries) set.add(e.service);
    return Array.from(set).sort();
  }, [allServiceEntries]);

  // Top services by count
  const topServices = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredEntries) {
      map.set(e.service, (map.get(e.service) ?? 0) + 1);
    }
    const arr: ServiceCount[] = Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return arr;
  }, [filteredEntries]);

  const maxServiceCount = topServices.length > 0 ? topServices[0].count : 0;
  const totalServiceCount = filteredEntries.length;

  // Trend over time (by day or week depending on range)
  const trendData = useMemo(() => {
    const byWeek = (endDate > startDate && daysBetween(startDate, endDate) > 45);

    const map = new Map<string, TrendPoint>();

    // Generate all buckets in range
    if (byWeek) {
      const buckets = generateWeekBuckets(startDate, endDate);
      for (const b of buckets) {
        map.set(b.key, { date: b.key, label: b.label, total: 0, services: {} });
      }
    } else {
      const buckets = generateDayBuckets(startDate, endDate);
      for (const b of buckets) {
        map.set(b.key, { date: b.key, label: b.label, total: 0, services: {} });
      }
    }

    for (const e of filteredEntries) {
      let key: string;
      let label: string;
      if (byWeek) {
        const wb = weekBucket(e.date);
        key = wb.key;
        label = wb.label;
      } else {
        key = e.date;
        label = fmtDate(e.date);
      }
      if (!map.has(key)) {
        map.set(key, { date: key, label, total: 0, services: {} });
      }
      const pt = map.get(key)!;
      pt.total += 1;
      pt.services[e.service] = (pt.services[e.service] ?? 0) + 1;
    }

    return Array.from(map.values());
  }, [filteredEntries, startDate, endDate]);

  const maxTrendValue = useMemo(() => {
    return trendData.reduce((max, p) => Math.max(max, p.total), 0);
  }, [trendData]);

  // Breakdown by source
  const sourceBreakdown = useMemo(() => {
    let apptCount = 0;
    let bookingCount = 0;
    for (const e of filteredEntries) {
      if (e.source === 'appointment') apptCount++;
      else bookingCount++;
    }
    return { appointments: apptCount, bookings: bookingCount };
  }, [filteredEntries]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Services Availed</p>
            <p className="text-2xl font-bold text-slate-800">{totalServiceCount}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unique Services</p>
            <p className="text-2xl font-bold text-slate-800">{allServiceNames.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">From Appointments</p>
            <p className="text-2xl font-bold text-slate-800">{sourceBreakdown.appointments}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ArrowDownCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">From Bookings</p>
            <p className="text-2xl font-bold text-slate-800">{sourceBreakdown.bookings}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {/* Date preset */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {([
            { key: '7d' as DatePreset, label: '7D' },
            { key: '30d' as DatePreset, label: '30D' },
            { key: '90d' as DatePreset, label: '90D' },
            { key: 'mtd' as DatePreset, label: 'MTD' },
            { key: 'all' as DatePreset, label: 'All' },
          ]).map(p => (
            <button
              key={p.key}
              onClick={() => { setDatePreset(p.key); setUseCustomRange(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                !useCustomRange && datePreset === p.key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={customStart}
            onChange={e => { setCustomStart(e.target.value); setUseCustomRange(true); }}
            className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          />
          <span className="text-slate-300 text-xs">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => { setCustomEnd(e.target.value); setUseCustomRange(true); }}
            className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          />
        </div>

        {/* Service filter */}
        <select
          value={serviceFilter}
          onChange={e => setServiceFilter(e.target.value)}
          className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
        >
          <option value="all">All Services</option>
          {allServiceNames.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 ml-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Range label */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-xl">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <p className="text-xs font-semibold text-slate-600">
            {fmtDateFull(startDate)} {'\u2014'} {fmtDateFull(endDate)}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Loading service demand data\u2026</span>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Service Trend Chart */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Service Demand Trend</h3>
                <p className="text-xs text-slate-400">Volume of services availed over time</p>
              </div>
            </div>

            {trendData.length === 0 || maxTrendValue === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <BarChart3 className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm font-medium">No service data in this period</p>
              </div>
            ) : (
              <>
                {/* Bar chart */}
                <div className="flex items-end gap-1 h-48 mb-3 overflow-x-auto">
                  {trendData.map((pt, i) => {
                    const heightPct = maxTrendValue > 0 ? (pt.total / maxTrendValue) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-[8px] flex flex-col items-center justify-end group relative"
                        style={{ height: '100%' }}
                      >
                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                            {pt.label}: {pt.total}
                          </div>
                        </div>
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${TREND_COLOR} hover:bg-teal-600`}
                          style={{ height: `${Math.max(heightPct, 2)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* X-axis labels */}
                <div className="flex gap-1 overflow-x-auto">
                  {trendData.map((pt, i) => {
                    // Show every Nth label to avoid crowding
                    const step = Math.ceil(trendData.length / 12);
                    const showLabel = i % step === 0 || i === trendData.length - 1;
                    return (
                      <div key={i} className="flex-1 min-w-[8px] text-center">
                        {showLabel && <span className="text-[10px] text-slate-400 whitespace-nowrap">{pt.label}</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Top Services Ranking */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Top Services by Demand</h3>
                <p className="text-xs text-slate-400">Ranked by number of times availed</p>
              </div>
            </div>

            {topServices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Trophy className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm font-medium">No service data available</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {topServices.map((s, i) => {
                  const pct = maxServiceCount > 0 ? (s.count / maxServiceCount) * 100 : 0;
                  const sharePct = totalServiceCount > 0 ? ((s.count / totalServiceCount) * 100).toFixed(1) : '0';
                  const barColor = RANK_COLORS[i % RANK_COLORS.length];
                  return (
                    <div key={s.name} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-slate-500">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-slate-700 truncate">{s.name}</span>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <span className="text-sm font-bold text-slate-800">{s.count}</span>
                            <span className="text-xs text-slate-400">({sharePct}%)</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Date bucket helpers ──────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function generateDayBuckets(start: string, end: string): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const cur = new Date(s);
  while (cur <= e) {
    const key = cur.toISOString().slice(0, 10);
    buckets.push({ key, label: fmtDate(key) });
    cur.setDate(cur.getDate() + 1);
  }
  return buckets;
}

function generateWeekBuckets(start: string, end: string): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  // Align to Monday
  const day = s.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  s.setDate(s.getDate() + diff);
  const cur = new Date(s);
  while (cur <= e) {
    const weekStart = new Date(cur);
    const key = weekStart.toISOString().slice(0, 10);
    buckets.push({ key, label: fmtDate(key) });
    cur.setDate(cur.getDate() + 7);
  }
  return buckets;
}

function weekBucket(dateStr: string): { key: string; label: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const key = d.toISOString().slice(0, 10);
  return { key, label: fmtDate(key) };
}
