import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Search, ChevronDown, ChevronRight,
  FileText, CheckCircle, Calendar, Clock, Truck, MapPin, Activity,
  CreditCard, User, Filter, Eye,
} from 'lucide-react';
import {
  supabase, type ClientBooking, type ClientFeedback, type TeamMember,
  buildMemberLookup, resolveMemberName, type MemberLookup,
} from '../lib/supabase';
import {
  getWfStage, WF_STAGE_CFG, WF_STAGE_ORDER, wfFmtTs, type WfAppointment,
} from './Dashboard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OversightAppt extends WfAppointment {
  id: string;
  booking_id: string | null;
  nurse_name: string | null;
  assistant_name: string | null;
  driver_name: string | null;
  vehicle: string | null;
  payment_method: string | null;
  payment_amount: number | null;
  created_by_email: string | null;
  feedback_email_sent_at: string | null;
  clients: { id: string; full_name: string; email: string | null; phone: string | null } | null;
  branches: { id: string; name: string } | null;
}

interface OversightRow {
  booking: ClientBooking | null;
  appt: OversightAppt | null;
  feedback: ClientFeedback | null;
  stage: ReturnType<typeof getWfStage>;
}

type StageFilter = 'all' | 'submitted' | 'confirmed' | 'scheduled' | 'dispatched' | 'in_treatment' | 'completed' | 'paid' | 'cancelled';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  paid:     { label: 'Paid',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial:  { label: 'Partial',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending:  { label: 'Unpaid',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  waived:   { label: 'Waived',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  refunded: { label: 'Refunded', cls: 'bg-red-50 text-red-700 border-red-200' },
};

function feedbackStatus(row: OversightRow): 'completed' | 'sent' | 'not_sent' {
  if (row.feedback) return 'completed';
  if (row.appt?.feedback_email_sent_at) return 'sent';
  return 'not_sent';
}

const FEEDBACK_BADGE: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  sent:      { label: 'Sent',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  not_sent:  { label: 'Not Sent',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Milestone mini-timeline (reuses getWfStage logic) ─────────────────────────

function MiniTimeline({ row }: { row: OversightRow }) {
  const { booking, appt } = row;
  const doneKeys = new Set<string>(['submitted']);
  if (booking && (booking.confirmed_at || booking.status !== 'NEW')) doneKeys.add('confirmed');
  if (appt) {
    doneKeys.add('appt');
    doneKeys.add('scheduled');
    if (appt.dispatched_at) doneKeys.add('dispatched');
    if (appt.arrived_at) doneKeys.add('arrived');
    if (appt.treatment_started_at) doneKeys.add('treatment');
    if (appt.completed_at) doneKeys.add('completed');
    if (appt.payment_recorded_at || appt.payment_status !== 'pending') doneKeys.add('payment');
  }

  const milestones = [
    { key: 'submitted',  icon: FileText,     ts: booking?.created_at ?? null },
    { key: 'confirmed',  icon: CheckCircle,   ts: booking?.confirmed_at ?? (booking && booking.status !== 'NEW' ? booking.created_at : null) },
    { key: 'appt',       icon: Calendar,      ts: appt?.created_at ?? null },
    { key: 'scheduled',  icon: Clock,         ts: appt ? `${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00` : null },
    { key: 'dispatched', icon: Truck,         ts: appt?.dispatched_at ?? null },
    { key: 'arrived',    icon: MapPin,        ts: appt?.arrived_at ?? null },
    { key: 'treatment',  icon: Activity,      ts: appt?.treatment_started_at ?? null },
    { key: 'completed',  icon: CheckCircle,   ts: appt?.completed_at ?? null },
    { key: 'payment',    icon: CreditCard,    ts: appt?.payment_recorded_at ?? null },
  ];

  // Determine current stage index (first not-done milestone minus 1)
  let currentIdx = -1;
  for (let i = 0; i < milestones.length; i++) {
    if (!doneKeys.has(milestones[i].key)) { currentIdx = i - 1; break; }
    if (i === milestones.length - 1) currentIdx = i;
  }

  return (
    <div className="flex items-center gap-0.5">
      {milestones.map((m, i) => {
        const Icon = m.icon;
        const isDone = doneKeys.has(m.key);
        const isCurrent = i === currentIdx && isDone;
        const isLast = i === milestones.length - 1;
        const nextDone = !isLast && doneKeys.has(milestones[i + 1].key);
        return (
          <div key={m.key} className="flex items-center">
            <div
              title={`${m.key}: ${m.ts ? wfFmtTs(m.ts) : 'pending'}`}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                isCurrent
                  ? 'bg-teal-600 ring-2 ring-teal-200 ring-offset-1'
                  : isDone
                    ? 'bg-teal-500'
                    : 'bg-slate-100'
              }`}
            >
              <Icon className={`w-3 h-3 ${isCurrent || isDone ? 'text-white' : 'text-slate-300'}`} />
            </div>
            {!isLast && (
              <div className={`w-3.5 h-0.5 rounded-full transition-colors ${nextDone ? 'bg-teal-400' : 'bg-slate-150'}`} style={{ backgroundColor: nextDone ? undefined : '#f1f5f9' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Expanded row detail ──────────────────────────────────────────────────────

function ExpandedDetail({ row, memberLookup }: { row: OversightRow; memberLookup: MemberLookup }) {
  const { booking, appt } = row;
  const doneKeys = new Set<string>(['submitted']);
  if (booking && (booking.confirmed_at || booking.status !== 'NEW')) doneKeys.add('confirmed');
  if (appt) {
    doneKeys.add('appt');
    doneKeys.add('scheduled');
    if (appt.dispatched_at) doneKeys.add('dispatched');
    if (appt.arrived_at) doneKeys.add('arrived');
    if (appt.treatment_started_at) doneKeys.add('treatment');
    if (appt.completed_at) doneKeys.add('completed');
    if (appt.payment_recorded_at || appt.payment_status !== 'pending') doneKeys.add('payment');
  }

  const milestones = [
    { key: 'submitted',  label: 'Booking Submitted',   icon: FileText,     ts: booking?.created_at ?? null },
    { key: 'confirmed',  label: 'Booking Confirmed',   icon: CheckCircle,  ts: booking?.confirmed_at ?? (booking && booking.status !== 'NEW' ? booking.created_at : null) },
    { key: 'appt',       label: 'Appointment Created',  icon: Calendar,      ts: appt?.created_at ?? null },
    {
      key: 'scheduled', label: 'Service Scheduled', icon: Clock,
      ts: appt ? `${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00` : null,
      displayTs: appt ? new Date(`${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : undefined,
    },
    { key: 'dispatched', label: 'Team Dispatched',     icon: Truck,        ts: appt?.dispatched_at ?? null },
    { key: 'arrived',    label: 'Team Arrived',        icon: MapPin,       ts: appt?.arrived_at ?? null },
    { key: 'treatment',  label: 'Treatment Started',   icon: Activity,     ts: appt?.treatment_started_at ?? null },
    { key: 'completed',  label: 'Service Completed',   icon: CheckCircle,  ts: appt?.completed_at ?? null },
    { key: 'payment',    label: 'Payment Recorded',    icon: CreditCard,   ts: appt?.payment_recorded_at ?? null },
  ];

  // Find current stage (first not-done)
  let currentKey: string | null = null;
  for (const m of milestones) {
    if (!doneKeys.has(m.key)) { currentKey = m.key; break; }
  }

  const nurseName = appt?.nurse_name
    ? resolveMemberName(appt.nurse_name, memberLookup)
    : booking?.assigned_nurse_id
      ? resolveMemberName(booking.assigned_nurse_id, memberLookup)
      : '—';

  return (
    <div className="px-6 py-5 bg-slate-50 border-t border-slate-100">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Workflow Timeline</p>
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-200" />
            <div className="space-y-0">
              {milestones.map((m, i) => {
                const Icon = m.icon;
                const isDone = doneKeys.has(m.key);
                const isCurrent = m.key === currentKey;
                const isLast = i === milestones.length - 1;
                const displayTime = (m as { displayTs?: string }).displayTs ?? (m.ts ? wfFmtTs(m.ts) : null);
                return (
                  <div key={m.key} className="flex gap-3 relative">
                    <div className="flex flex-col items-center flex-shrink-0 w-7 z-10">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-all ${
                          isCurrent
                            ? 'bg-white border-teal-500 shadow-md ring-4 ring-teal-100'
                            : isDone
                              ? 'bg-teal-500 border-teal-500'
                              : 'bg-white border-slate-200'
                        }`}
                      >
                        <Icon className={`w-3 h-3 ${isCurrent ? 'text-teal-600' : isDone ? 'text-white' : 'text-slate-300'}`} />
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 flex-1 mt-1 rounded-full ${isDone ? 'bg-teal-300' : 'bg-slate-200'}`} style={{ minHeight: 14 }} />
                      )}
                    </div>
                    <div className="pb-3 pt-0.5">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold leading-tight ${isCurrent ? 'text-teal-700' : isDone ? 'text-slate-800' : 'text-slate-400'}`}>{m.label}</p>
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-teal-100 text-teal-700 uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" /> Current
                          </span>
                        )}
                      </div>
                      {displayTime ? (
                        <p className="text-xs text-slate-500 mt-0.5 font-medium">{displayTime}</p>
                      ) : (
                        <p className="text-xs text-slate-300 mt-0.5 italic">Pending</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Assignment</p>
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Nurse</span>
                <span className="text-slate-700 font-medium">{nurseName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Assistant</span>
                <span className="text-slate-700 font-medium">{appt?.assistant_name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Driver</span>
                <span className="text-slate-700 font-medium">{appt?.driver_name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Vehicle</span>
                <span className="text-slate-700 font-medium">{appt?.vehicle ?? '—'}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment & Feedback</p>
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Payment Status</span>
                <span className="font-semibold capitalize">{appt?.payment_status ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Payment Method</span>
                <span className="text-slate-700 font-medium">{appt?.payment_method ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Feedback</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${FEEDBACK_BADGE[feedbackStatus(row)].cls}`}>
                  {FEEDBACK_BADGE[feedbackStatus(row)].label}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Feedback Email Sent</span>
                <span className="text-slate-700 font-medium">{appt?.feedback_email_sent_at ? wfFmtTs(appt.feedback_email_sent_at) : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OperationsOversight() {
  const [rows, setRows] = useState<OversightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bookingsRes, apptsRes, feedbackRes, membersRes] = await Promise.all([
        supabase.from('client_bookings').select('*').order('created_at', { ascending: false }).limit(200),
        supabase
          .from('appointments')
          .select('id, created_at, scheduled_date, scheduled_time, service, status, dispatched_at, arrived_at, treatment_started_at, completed_at, payment_recorded_at, payment_status, payment_method, payment_amount, booking_id, nurse_name, assistant_name, driver_name, vehicle, created_by_email, feedback_email_sent_at, clients(id, full_name, email, phone), branches(id, name)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('client_feedback').select('id, name, appointment_id, created_at').order('created_at', { ascending: false }),
        supabase.from('team_members').select('*').eq('status', 'approved'),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;
      if (apptsRes.error) throw apptsRes.error;
      if (feedbackRes.error) throw feedbackRes.error;

      setMemberLookup(buildMemberLookup((membersRes.data ?? []) as TeamMember[]));

      const bookings = (bookingsRes.data ?? []) as ClientBooking[];
      const appts = (apptsRes.data ?? []) as OversightAppt[];
      const feedbacks = (feedbackRes.data ?? []) as Pick<ClientFeedback, 'id' | 'name' | 'appointment_id' | 'created_at'>[];

      const apptByBookingId = new Map<string, OversightAppt>();
      const apptById = new Map<string, OversightAppt>();
      for (const a of appts) {
        apptById.set(a.id, a);
        if (a.booking_id) apptByBookingId.set(a.booking_id, a);
      }

      const feedbackByApptId = new Map<string, Pick<ClientFeedback, 'id' | 'name' | 'appointment_id' | 'created_at'>>();
      for (const f of feedbacks) {
        if (f.appointment_id && !feedbackByApptId.has(f.appointment_id)) {
          feedbackByApptId.set(f.appointment_id, f);
        }
      }

      const merged: OversightRow[] = [];

      // Bookings with or without appointments
      for (const b of bookings) {
        const appt = apptByBookingId.get(b.id) ?? null;
        const fb = appt ? (feedbackByApptId.get(appt.id) ?? null) : null;
        merged.push({ booking: b, appt, feedback: fb as ClientFeedback | null, stage: getWfStage(b, appt) });
      }

      // Appointments without a matching booking (orphan safety)
      for (const a of appts) {
        if (!a.booking_id || !apptByBookingId.has(a.booking_id)) {
          if (!merged.some(r => r.appt?.id === a.id)) {
            const fb = feedbackByApptId.get(a.id) ?? null;
            const dummyBooking: ClientBooking | null = null;
            merged.push({ booking: dummyBooking, appt: a, feedback: fb as ClientFeedback | null, stage: getWfStage(dummyBooking ?? {} as ClientBooking, a) });
          }
        }
      }

      setRows(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered rows
  const filtered = rows.filter(r => {
    if (stageFilter !== 'all' && r.stage !== stageFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = r.booking?.full_name ?? r.appt?.clients?.full_name ?? '';
      const service = r.appt?.service ?? r.booking?.services_requested?.join(' ') ?? '';
      if (!name.toLowerCase().includes(q) && !service.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // KPI counts
  const kpiCounts = {
    total: rows.length,
    inProgress: rows.filter(r => r.stage === 'dispatched' || r.stage === 'in_treatment').length,
    completed: rows.filter(r => r.stage === 'completed' || r.stage === 'paid').length,
    pendingPayment: rows.filter(r => r.appt && r.appt.payment_status === 'pending' && r.stage !== 'cancelled').length,
  };

  const stageOptions: { key: StageFilter; label: string }[] = [
    { key: 'all', label: 'All Stages' },
    ...WF_STAGE_ORDER.map(s => ({ key: s as StageFilter, label: WF_STAGE_CFG[s].label })),
    { key: 'cancelled', label: WF_STAGE_CFG.cancelled.label },
  ];

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex justify-end">
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Records', value: kpiCounts.total, tone: 'text-slate-800', bg: 'bg-slate-50' },
          { label: 'In Progress', value: kpiCounts.inProgress, tone: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Completed', value: kpiCounts.completed, tone: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Pending Payment', value: kpiCounts.pendingPayment, tone: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-xl border border-slate-100 ${kpi.bg} p-4`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.tone} mt-1`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client name or service..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value as StageFilter)}
            className="px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 bg-white"
          >
            {stageOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Records */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button onClick={loadData} className="mt-3 text-sm text-teal-600 font-medium hover:underline">Try again</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-400">No records found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(row => {
            const rowId = row.booking?.id ?? row.appt?.id ?? '';
            const isExpanded = expandedId === rowId;
            const clientName = row.booking?.full_name ?? row.appt?.clients?.full_name ?? 'Unknown';
            const bookingDate = row.booking?.created_at ?? row.appt?.created_at ?? null;
            const services = row.appt?.service ?? row.booking?.services_requested?.join(', ') ?? '—';
            const cfg = WF_STAGE_CFG[row.stage];
            const payCfg = row.appt ? (PAYMENT_BADGE[row.appt.payment_status] ?? PAYMENT_BADGE.pending) : PAYMENT_BADGE.pending;
            const fbStatus = feedbackStatus(row);
            const fbCfg = FEEDBACK_BADGE[fbStatus];
            const nurseName = row.appt?.nurse_name
              ? resolveMemberName(row.appt.nurse_name, memberLookup)
              : row.booking?.assigned_nurse_id
                ? resolveMemberName(row.booking.assigned_nurse_id, memberLookup)
                : '—';

            return (
              <div
                key={rowId}
                className={`bg-white border rounded-2xl overflow-hidden transition-all ${
                  isExpanded ? 'border-teal-300 shadow-md' : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'
                }`}
              >
                {/* Card header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : rowId)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{clientName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDate(bookingDate)}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>
                </button>

                {/* Card body */}
                <div className="px-4 pb-4 space-y-3">
                  {/* Service */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">Service</p>
                    <p className="text-sm text-slate-600 line-clamp-2">{services}</p>
                  </div>

                  {/* Mini timeline */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">Workflow</p>
                    <MiniTimeline row={row} />
                  </div>

                  {/* Badges row */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${payCfg.cls}`}>
                      {payCfg.label}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${fbCfg.cls}`}>
                      {fbCfg.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium ml-auto truncate">
                      <User className="w-3 h-3 text-slate-300" />
                      {nurseName}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    <ExpandedDetail row={row} memberLookup={memberLookup} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
