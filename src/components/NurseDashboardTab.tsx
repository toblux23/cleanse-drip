import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle, Clock, MapPin, Calendar,
  User, Phone, Mail, HeartPulse, ShieldAlert, Activity, Stethoscope,
  Syringe, Users, CalendarCheck, LogIn, LogOut, ChevronRight, ArrowLeft,
  Droplets, FlaskConical, FileText, Car, CreditCard, Camera, X,
  Bell, BellRing, Inbox, CheckCheck, Archive, QrCode, Copy, ClipboardCheck,
  PenLine, ShieldCheck, AlertTriangle, Eye, MessageSquare, Send,
  Settings2, Hourglass, Lock, Ban, ChevronDown, Plus, Stethoscope as StethoscopeIcon,
  Wallet, Zap, Navigation, CalendarDays, TrendingUp, Receipt, Play, Truck, Upload, Download,
} from 'lucide-react';
import {
  supabase, type Appointment, type AppointmentStatus, type ClientBooking,
  type Branch, type RoleKey, type NurseNotification, type ClientConsentRecord,
  type ClientTreatmentNote, type BookingBufferSetting, type TeamMember, type MemberLookup,
  buildMemberLookup, resolveMemberName, type NurseCollection,
} from '../lib/supabase';
import {
  RecordPaymentModal, SubmitRemittanceModal, PaymentRemittanceCard,
  FeedbackStatusBadge, type FeedbackStatus,
} from './NursePaymentModals';
import { fetchActiveBufferMinutes, isWithinBuffer } from '../lib/bookingBuffer';
import {
  getWfStage, WF_STAGE_CFG, WF_STAGE_ORDER, wfDuration, wfFmtTs,
  type WfAppointment,
} from './Dashboard';
import { resolveSignatureUrl } from '../lib/signatures';
import SignatureImage from './SignatureImage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppointmentRow extends Appointment {
  clients: { id: string; full_name: string; email: string | null; phone: string | null; address: string | null; health_notes: string | null } | null;
  branches: { id: string; name: string } | null;
}

interface TimeLog {
  id: string;
  clock_in: string | null;
  clock_out: string | null;
  staff_name: string | null;
  branch_id: string | null;
  notes: string | null;
  clock_in_photo_url: string | null;
  clock_out_photo_url: string | null;
}

interface NurseDashboardTabProps {
  userEmail: string;
  memberRole: RoleKey;
  memberBranchId: string | null;
  permissions?: Set<string>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_ORDER: AppointmentStatus[] = ['scheduled', 'dispatched', 'arrived', 'in_treatment', 'completed'];

type StatusCfg = {
  label: string; color: string; bg: string; dot: string;
  nextStatus?: AppointmentStatus; nextLabel?: string;
  tsField?: 'dispatched_at' | 'arrived_at' | 'treatment_started_at' | 'completed_at';
};

const STATUS_CFG: Record<string, StatusCfg> = {
  scheduled: { label: 'Scheduled', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', nextStatus: 'dispatched', nextLabel: 'Dispatch (OTW)', tsField: 'dispatched_at' },
  dispatched: { label: 'Dispatched — OTW', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', nextStatus: 'arrived', nextLabel: 'Mark Arrived', tsField: 'arrived_at' },
  arrived: { label: 'Arrived', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200', dot: 'bg-cyan-500', nextStatus: 'in_treatment', nextLabel: 'Start Treatment', tsField: 'treatment_started_at' },
  in_treatment: { label: 'In Treatment', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500', nextStatus: 'completed', nextLabel: 'Mark Completed', tsField: 'completed_at' },
  completed: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
};

const PAYMENT_CFG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Payment Pending', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  paid: { label: 'Paid', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  partial: { label: 'Partial', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  waived: { label: 'Waived', color: 'text-slate-600 bg-slate-100 border-slate-200' },
  sponsored: { label: 'Sponsored', color: 'text-teal-700 bg-teal-50 border-teal-200' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function todayStr() { return new Date().toISOString().split('T')[0]; }
function scheduleRange(dateStr: string, view: 'daily' | 'weekly' | 'monthly'): { start: string; end: string } {
  if (view === 'daily') return { start: dateStr, end: dateStr };
  const d = new Date(`${dateStr}T00:00:00`);
  if (view === 'weekly') {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: first.toISOString().split('T')[0], end: last.toISOString().split('T')[0] };
}
function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtTimeOnly(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtPeso(n: number) { return `\u20b1${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`; }
function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(ts: string | null): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// ─── Dashboard UI Components ──────────────────────────────────────────────────

const TONE_CFG: Record<string, { bg: string; text: string; iconBg: string; border: string }> = {
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    iconBg: 'bg-teal-100 text-teal-600',    border: 'border-teal-200' },
  blue:    { bg: 'bg-blue-50',     text: 'text-blue-700',    iconBg: 'bg-blue-100 text-blue-600',    border: 'border-blue-200' },
  amber:   { bg: 'bg-amber-50',    text: 'text-amber-700',   iconBg: 'bg-amber-100 text-amber-600',   border: 'border-amber-200' },
  red:     { bg: 'bg-red-50',      text: 'text-red-700',     iconBg: 'bg-red-100 text-red-600',     border: 'border-red-200' },
  emerald: { bg: 'bg-emerald-50',  text: 'text-emerald-700', iconBg: 'bg-emerald-100 text-emerald-600', border: 'border-emerald-200' },
  slate:   { bg: 'bg-slate-50',    text: 'text-slate-700',   iconBg: 'bg-slate-100 text-slate-600',   border: 'border-slate-200' },
};

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub: string; icon: React.ElementType; tone: string; emphasize?: boolean }) {
  const c = TONE_CFG[tone] ?? TONE_CFG.slate;
  return (
    <div className={`rounded-xl border ${c.border} bg-white p-4 flex flex-col justify-between min-h-[96px]`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <Icon className={`w-4 h-4 ${c.text}`} />
      </div>
      <div>
        <p className={`text-xl font-bold ${c.text} leading-tight`}>{value}</p>
        <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>
      </div>
    </div>
  );
}

function NextPatientCard({ appt, onStart, onView }: { appt: AppointmentRow | null; onStart: () => void; onView: () => void }) {
  if (!appt) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center min-h-[240px]">
        <Calendar className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-sm font-semibold text-slate-400">No upcoming appointments</p>
        <p className="text-xs text-slate-400 mt-1">Enjoy your break or check the schedule below.</p>
      </div>
    );
  }
  const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.scheduled;
  const client = appt.clients;
  const initials = (client?.full_name ?? '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-teal-600" />
          <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">My Next Patient</p>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1.5`} />{cfg.label}
        </span>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-slate-800 truncate">{client?.full_name ?? 'Unknown Client'}</p>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1.5"><Clock className="w-3.5 h-3.5" /> {appt.scheduled_time ? fmtTime(appt.scheduled_time) : '—'}</p>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><Droplets className="w-3.5 h-3.5" /> {appt.service ?? '—'}</p>
            {appt.branches && <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><MapPin className="w-3.5 h-3.5" /> {appt.branches.name}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-auto">
          <button onClick={onStart} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
            <Play className="w-4 h-4" /> Start Treatment
          </button>
          <button onClick={onView} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors border border-teal-200">
            <Eye className="w-4 h-4" /> View Details
          </button>
          <a href={client?.phone ? `tel:${client.phone}` : '#'} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
            <Phone className="w-4 h-4" /> Call
          </a>
          <a href={appt.location || client?.address ? `https://maps.google.com/?q=${encodeURIComponent(appt.location || client?.address || '')}` : '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200">
            <Navigation className="w-4 h-4" /> Navigate
          </a>
        </div>
      </div>
    </div>
  );
}

function ActionGroup({ title, dotClass, items }: { title: string; dotClass: string; items: { label: string; count: number; icon: React.ElementType; action: () => void }[] }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
      </div>
      <div className="divide-y divide-slate-50">
        {items.map(item => (
          <button key={item.label} onClick={item.action} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-4 h-4 text-slate-600" />
            </div>
            <span className="flex-1 text-sm font-semibold text-slate-700">{item.label}</span>
            {item.count > 0 && (
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${dotClass === 'bg-red-500' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{item.count}</span>
            )}
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ScheduleTimeline({ appointments, onSelect, showDate }: { appointments: AppointmentRow[]; onSelect: (a: AppointmentRow) => void; showDate?: boolean }) {
  const dotColor: Record<string, string> = {
    completed: '#10b981', in_treatment: '#3b82f6', scheduled: '#14b8a6',
    dispatched: '#f59e0b', arrived: '#f59e0b', cancelled: '#94a3b8',
  };
  return (
    <div className="relative py-2">
      <div className="absolute left-[27px] top-4 bottom-4 w-px bg-slate-200" />
      <div className="space-y-1">
        {appointments.map(appt => {
          const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.scheduled;
          return (
            <button key={appt.id} onClick={() => onSelect(appt)} className="relative w-full grid grid-cols-[24px_104px_1fr_auto] items-center gap-3 py-2.5 px-3 hover:bg-slate-50 rounded-lg transition-colors text-left group">
              {/* Column 1: Status Dot */}
              <div className="flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: dotColor[appt.status] ?? '#14b8a6' }} />
              </div>
              {/* Column 2: Date + Time */}
              <div className="flex flex-col">
                {showDate && <p className="text-[11px] font-semibold text-teal-600 leading-tight">{appt.scheduled_date ? fmtDate(appt.scheduled_date) : ''}</p>}
                <p className="text-sm font-bold text-slate-700 leading-tight">{fmtTime(appt.scheduled_time)}</p>
                <p className="text-xs text-slate-400 font-medium">{cfg.label}</p>
              </div>
              {/* Column 3: Appointment Info */}
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{appt.clients?.full_name ?? 'Unknown Client'}</p>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                  <span className="flex items-center gap-1"><Droplets className="w-3 h-3" /> {appt.service ?? '—'}</span>
                  {appt.branches && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {appt.branches.name}</span>}
                </p>
              </div>
              {/* Column 4: Status Badge + Chevron */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
                  {cfg.label}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FinancialSnapshot({ collections, onRecordPayment, onSubmitRemittance }: { collections: NurseCollection[]; onRecordPayment: () => void; onSubmitRemittance: (c: NurseCollection) => void }) {
  const collectedToday = collections.filter(c => isToday(c.collected_at)).reduce((s, c) => s + c.amount_received, 0);
  const cashOnHand = collections.filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance').reduce((s, c) => s + c.amount_received, 0);
  const pendingRemittance = collections.filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance').reduce((s, c) => s + c.amount_received, 0);
  const confirmed = collections.filter(c => c.status === 'confirmed').reduce((s, c) => s + (c.confirmed_amount ?? c.amount_received), 0);
  const rejected = collections.filter(c => c.status === 'rejected').reduce((s, c) => s + c.amount_received, 0);
  const pendingConf = collections.filter(c => c.status === 'pending_confirmation').reduce((s, c) => s + c.amount_received, 0);
  const lastRemit = collections.filter(c => c.remitted_at).sort((a, b) => (b.remitted_at! > a.remitted_at! ? 1 : -1))[0];
  const outstanding = cashOnHand + pendingConf;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Financial Snapshot</p>
      </div>
      <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-3">
        <FinRow label="Collected Today" value={fmtPeso(collectedToday)} tone="text-slate-800" />
        <FinRow label="Cash on Hand" value={fmtPeso(cashOnHand)} tone="text-amber-700" bold />
        <FinRow label="Pending Remittance" value={fmtPeso(pendingRemittance)} tone="text-amber-700" />
        <FinRow label="Awaiting Confirmation" value={fmtPeso(pendingConf)} tone="text-blue-700" />
        <FinRow label="Confirmed" value={fmtPeso(confirmed)} tone="text-emerald-700" />
        <FinRow label="Rejected" value={fmtPeso(rejected)} tone="text-red-700" />
        <FinRow label="Last Remittance" value={lastRemit?.remitted_at ? new Date(lastRemit.remitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} tone="text-slate-600" />
        {outstanding > 0 && <FinRow label="Outstanding Balance" value={fmtPeso(outstanding)} tone="text-red-700" bold />}
      </div>
      <div className="px-5 pb-5 grid grid-cols-2 gap-2.5">
        <button onClick={onRecordPayment} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
          <Droplets className="w-4 h-4" /> Record Payment
        </button>
        <button onClick={() => { const c = collections.find(x => x.status === 'collected_by_nurse' || x.status === 'for_remittance'); if (c) onSubmitRemittance(c); }} disabled={pendingRemittance === 0} className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <Receipt className="w-4 h-4" /> Submit Remittance
        </button>
      </div>
    </div>
  );
}

function FinRow({ label, value, tone, bold }: { label: string; value: string; tone: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className={`${bold ? 'text-sm font-bold' : 'text-sm font-semibold'} ${tone}`}>{value}</p>
    </div>
  );
}

function RecentActivity({ appointments, collections, timeLogs }: { appointments: AppointmentRow[]; collections: NurseCollection[]; timeLogs: TimeLog[] }) {
  type Activity = { ts: string; icon: React.ElementType; color: string; text: string };
  const acts: Activity[] = [];
  appointments.filter(a => a.status === 'completed' && a.completed_at).forEach(a => acts.push({ ts: a.completed_at!, icon: CheckCircle, color: 'text-emerald-600', text: `Treatment completed — ${a.clients?.full_name ?? 'Unknown'}` }));
  collections.filter(c => isToday(c.collected_at)).forEach(c => acts.push({ ts: c.collected_at, icon: Droplets, color: 'text-blue-600', text: `Payment collected — ${fmtPeso(c.amount_received)} (${c.collected_by_email})` }));
  collections.filter(c => c.remitted_at).forEach(c => acts.push({ ts: c.remitted_at!, icon: Receipt, color: 'text-amber-600', text: `Remittance submitted — ${fmtPeso(c.remittance_amount ?? c.amount_received)}` }));
  timeLogs.filter(l => l.clock_in && isToday(l.clock_in)).forEach(l => acts.push({ ts: l.clock_in, icon: LogIn, color: 'text-teal-600', text: `Clocked in at ${fmtTimeOnly(l.clock_in)}` }));
  acts.sort((a, b) => b.ts > a.ts ? 1 : -1);
  const recent = acts.slice(0, 8);
  if (recent.length === 0) return <div className="px-5 py-10 text-center text-sm text-slate-400 font-semibold">No recent activity today.</div>;
  return (
    <div className="divide-y divide-slate-50">
      {recent.map((a, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
            <a.icon className={`w-4 h-4 ${a.color}`} />
          </div>
          <p className="flex-1 text-sm text-slate-700 font-medium">{a.text}</p>
          <p className="text-xs text-slate-400 flex-shrink-0">{timeAgo(a.ts)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function NurseDashboardTab({ userEmail, memberRole, memberBranchId, permissions }: NurseDashboardTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [confirmedBookings, setConfirmedBookings] = useState<ClientBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [scheduleView, setScheduleView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [detailAppt, setDetailAppt] = useState<AppointmentRow | null>(null);
  const [bookingData, setBookingData] = useState<ClientBooking | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Attendance
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [clockingIn, setClockingIn] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ mode: 'in' | 'out' } | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notifications
  const [notifications, setNotifications] = useState<NurseNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  // Buffer
  const [bufferMinutes, setBufferMinutes] = useState(120);

  // Consent / Treatment notes
  const [consentRecords, setConsentRecords] = useState<ClientConsentRecord[]>([]);
  const [treatmentNotes, setTreatmentNotes] = useState<ClientTreatmentNote[]>([]);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const [showConsentQr, setShowConsentQr] = useState(false);
  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });
  const currentNurseName = resolveMemberName(userEmail, memberLookup);

  // Payment & Remittance
  const [nurseUserId, setNurseUserId] = useState<string | null>(null);
  const [collections, setCollections] = useState<NurseCollection[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRemittanceModal, setShowRemittanceModal] = useState<NurseCollection | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>('not_sent');

  // Dashboard-level data (all collections + batch consent/notes for today)
  const [allCollections, setAllCollections] = useState<NurseCollection[]>([]);
  const [dashboardConsent, setDashboardConsent] = useState<ClientConsentRecord[]>([]);
  const [dashboardNotes, setDashboardNotes] = useState<ClientTreatmentNote[]>([]);

  const isSuperAdmin = memberRole === 'superadmin';
  // `||` not `??`: permissions is always a real Set, so `.has()` returns false
  // rather than undefined and a `??` fallback would never fire.
  const canEditService = (permissions?.has('appointments.edit_service') ?? false) || isSuperAdmin;
  // `||` not `??`, for the same reason as canEditService above: permissions is
  // always a real Set, so `.has()` returns false and a `??` fallback is dead.
  const canManageBuffer = (permissions?.has('settings.manage') ?? false) || isSuperAdmin;
  const effectiveBranch = isSuperAdmin ? selectedBranch : (memberBranchId ?? 'all');

  // ─── Data loading ───────────────────────────────────────────────────────────

  // Load all collections for this nurse (for dashboard KPIs + financial snapshot)
  const loadAllCollections = useCallback(async () => {
    const { data } = await supabase
      .from('nurse_collections')
      .select('*')
      .eq('collected_by_email', userEmail)
      .order('collected_at', { ascending: false })
      .limit(200);
    if (data) setAllCollections((data as any[]).map((c: any) => ({
      ...c,
      amount_due: Number(c.amount_due) || 0,
      amount_received: Number(c.amount_received) || 0,
      remittance_amount: c.remittance_amount != null ? Number(c.remittance_amount) : null,
      confirmed_amount: c.confirmed_amount != null ? Number(c.confirmed_amount) : null,
    })) as NurseCollection[]);
  }, [userEmail]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { start: rangeStart, end: rangeEnd } = scheduleRange(selectedDate, scheduleView);
    let query = supabase
      .from('appointments')
      .select(`*, clients ( id, full_name, email, phone, address, health_notes ), branches ( id, name )`)
      .gte('scheduled_date', rangeStart)
      .lte('scheduled_date', rangeEnd)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (effectiveBranch !== 'all') query = query.eq('branch_id', effectiveBranch);

    const [apptRes, branchesRes, bookingsRes, membersRes] = await Promise.all([
      query,
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('client_bookings')
        .select('*')
        .eq('status', 'CONFIRMED')
        .order('confirmed_at', { ascending: false })
        .limit(20),
      supabase.from('team_members').select('user_id, email, full_name, role'),
    ]);

    if (apptRes.error) { setError('Failed to load appointments.'); setAppointments([]); }
    else setAppointments((apptRes.data ?? []) as unknown as AppointmentRow[]);

    if (!branchesRes.error) setBranches(branchesRes.data ?? []);
    setConfirmedBookings((bookingsRes.data ?? []) as ClientBooking[]);
    setMemberLookup(buildMemberLookup((membersRes.data ?? []) as TeamMember[]));

    setLoading(false);
    loadAllCollections();
  }, [selectedDate, scheduleView, effectiveBranch, loadAllCollections]);

  const loadAttendance = useCallback(async () => {
    const [logsRes, activeRes] = await Promise.all([
      supabase.from('time_logs').select('*').eq('staff_name', userEmail).order('clock_in', { ascending: false }).limit(30),
      supabase.from('time_logs').select('*').eq('staff_name', userEmail).is('clock_out', null).order('clock_in', { ascending: false }).maybeSingle(),
    ]);
    if (logsRes.data) setTimeLogs(logsRes.data as TimeLog[]);
    if (activeRes.data) setActiveLog(activeRes.data as TimeLog);
    else setActiveLog(null);
  }, [userEmail]);

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('nurse_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(data as NurseNotification[]);
      setUnreadCount((data as NurseNotification[]).filter(n => n.status === 'unread').length);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAttendance(); }, [loadAttendance]);
  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Batch-load consent + treatment notes for all today's appointments
  const loadDashboardAlerts = useCallback(async (appts: AppointmentRow[]) => {
    const apptIds = appts.map(a => a.id).filter(Boolean);
    if (apptIds.length === 0) { setDashboardConsent([]); setDashboardNotes([]); return; }
    const [consentRes, notesRes] = await Promise.all([
      supabase.from('client_consent_records').select('*').in('appointment_id', apptIds).order('created_at', { ascending: false }),
      supabase.from('client_treatment_notes').select('*').in('appointment_id', apptIds).order('created_at', { ascending: false }),
    ]);
    setDashboardConsent((consentRes.data ?? []) as ClientConsentRecord[]);
    setDashboardNotes((notesRes.data ?? []) as ClientTreatmentNote[]);
  }, []);

  useEffect(() => { loadAllCollections(); }, [loadAllCollections]);
  useEffect(() => { loadDashboardAlerts(appointments.filter(a => a.status !== 'cancelled')); }, [appointments, loadDashboardAlerts]);

  // Fetch nurse's auth user id
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setNurseUserId(session?.user.id ?? null);
    });
  }, []);

  // Load collections for an appointment
  const loadCollections = useCallback(async (apptId: string) => {
    setLoadingCollections(true);
    const { data } = await supabase
      .from('nurse_collections')
      .select('*')
      .eq('appointment_id', apptId)
      .order('collected_at', { ascending: false });
    setCollections((data ?? []).map((c: any) => ({
      ...c,
      amount_due: Number(c.amount_due) || 0,
      amount_received: Number(c.amount_received) || 0,
      remittance_amount: c.remittance_amount != null ? Number(c.remittance_amount) : null,
      confirmed_amount: c.confirmed_amount != null ? Number(c.confirmed_amount) : null,
    })) as NurseCollection[]);
    setLoadingCollections(false);
  }, []);

  // Load feedback status for an appointment
  const loadFeedbackStatus = useCallback(async (apptId: string) => {
    const { data } = await supabase
      .from('client_feedback')
      .select('id, created_at')
      .eq('appointment_id', apptId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setFeedbackStatus('completed');
    else setFeedbackStatus('not_sent');
  }, []);

  // Load collections + feedback when detail appt changes
  useEffect(() => {
    if (detailAppt) {
      loadCollections(detailAppt.id);
      loadFeedbackStatus(detailAppt.id);
    } else {
      setCollections([]);
      setFeedbackStatus('not_sent');
    }
  }, [detailAppt, loadCollections, loadFeedbackStatus]);

  // Poll notifications every 30s (real-time subscription not verified)
  useEffect(() => {
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Fetch buffer on mount
  useEffect(() => { fetchActiveBufferMinutes().then(({ minutes }) => setBufferMinutes(minutes)); }, []);

  // Auto-set branch for non-superadmin
  useEffect(() => {
    if (!isSuperAdmin && memberBranchId) setSelectedBranch(memberBranchId);
  }, [isSuperAdmin, memberBranchId]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function advanceStatus(appt: AppointmentRow) {
    const cfg = STATUS_CFG[appt.status];
    if (!cfg?.nextStatus || !cfg?.tsField) return;
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase.from('appointments').update({ status: cfg.nextStatus, [cfg.tsField]: now }).eq('id', appt.id);
    if (updateErr) { setError('Failed to update status.'); return; }
    setSuccessMsg(`Appointment moved to ${STATUS_CFG[cfg.nextStatus].label}.`);
    setTimeout(() => setSuccessMsg(null), 4000);
    load();
    if (detailAppt?.id === appt.id) setDetailAppt({ ...appt, status: cfg.nextStatus, [cfg.tsField]: now });

    // Starting treatment fires trg_treatment_inventory server-side. Re-read the
    // row so any deduction problem it recorded is shown rather than swallowed.
    if (cfg.nextStatus === 'in_treatment') {
      await refreshDeductionState(appt.id);
    }

    // Send Thank You email only when transitioning to completed
    if (cfg.nextStatus === 'completed' && appt.status !== 'completed') {
      const clientEmail = appt.clients?.email ?? null;
      const clientFirstName = appt.clients?.full_name?.split(' ')[0] ?? 'Valued Client';
      if (clientEmail) {
        const emailBody = {
          type: 'appointment_completed' as const,
          to: [clientEmail],
          data: {
            client_first_name: clientFirstName,
            service_name: appt.service ?? '—',
            appointment_date: appt.scheduled_date ?? '—',
            amount_paid: appt.payment_amount != null ? `₱${appt.payment_amount.toLocaleString()}` : '—',
            payment_method: appt.payment_method ?? '—',
            transaction_reference: appt.payment_reference ?? '—',
          },
        };
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailBody),
        }).catch((e) => console.error('[Appointment Completed Email] Failed to send:', e));
      } else {
        console.warn('[Appointment Completed Email] Skipped: no client email for appointment', appt.id);
      }
    }

    // Inventory deduction is handled server-side by trg_treatment_inventory,
    // which fires when the appointment enters 'in_treatment'. It used to run
    // here as well as in the database trigger, deducting twice.
  }

  // Deduction runs in a database trigger, so its outcome is only visible after
  // re-reading the row. Called after treatment starts and after a service change.
  async function refreshDeductionState(apptId: string) {
    const { data, error: readErr } = await supabase
      .from('appointments')
      .select('inventory_deducted_at, inventory_deducted_recipe_id, inventory_deduction_issues')
      .eq('id', apptId)
      .maybeSingle();
    if (readErr || !data) return;
    setDetailAppt(prev => (prev && prev.id === apptId ? { ...prev, ...data } : prev));
  }

  // ─── Availed service editing ───────────────────────────────────────────────
  // Clients change their mind on site. The nurse/assistant corrects the service
  // here rather than routing back through an admin.
  const [catalogOptions, setCatalogOptions] = useState<{ id: string; name: string; item_type: string }[]>([]);
  const [savingService, setSavingService] = useState(false);

  useEffect(() => {
    if (!canEditService) return;
    (async () => {
      const { data, error: catErr } = await supabase
        .from('catalog_items')
        .select('id, name, item_type')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (catErr) { console.error('[Service Editor] Failed to load catalog items:', catErr.message); return; }
      setCatalogOptions(data ?? []);
    })();
  }, [canEditService]);

  // Writes both the FK and the display text. `service` stays populated so every
  // existing read path (emails, reports, list rows) keeps working unchanged.
  async function updateApptService(appt: AppointmentRow, catalogItemId: string) {
    const picked = catalogOptions.find(c => c.id === catalogItemId);
    if (!picked) { setError('That service is no longer available. Refresh and try again.'); return; }
    if (picked.id === appt.catalog_item_id) return;

    setSavingService(true);
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ catalog_item_id: picked.id, service: picked.name })
      .eq('id', appt.id);
    setSavingService(false);

    if (updateErr) { setError(`Failed to update the service: ${updateErr.message}`); return; }

    setSuccessMsg(`Service changed to ${picked.name}.`);
    setTimeout(() => setSuccessMsg(null), 4000);
    if (detailAppt?.id === appt.id) {
      setDetailAppt({ ...detailAppt, catalog_item_id: picked.id, service: picked.name });
    }
    // A change after treatment start reverses the old recipe and applies the
    // new one in the trigger; re-read so the result is not silent.
    await refreshDeductionState(appt.id);
    load();
  }

  async function cancelAppt(appt: AppointmentRow) {
    const { error: updateErr } = await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
    if (updateErr) { setError('Failed to cancel appointment.'); return; }
    setSuccessMsg('Appointment cancelled.');
    setTimeout(() => setSuccessMsg(null), 4000);
    load();
    if (detailAppt?.id === appt.id) setDetailAppt({ ...appt, status: 'cancelled' });
  }

  async function loadBookingData(bookingId: string | null) {
    if (!bookingId) { setBookingData(null); return; }
    setLoadingDetail(true);
    const { data } = await supabase.from('client_bookings').select('*').eq('id', bookingId).maybeSingle();
    setBookingData(data as ClientBooking | null);
    setLoadingDetail(false);
  }

  async function loadConsentRecords(clientId: string | null, apptId: string | null) {
    if (!clientId && !apptId) { setConsentRecords([]); return; }
    let query = supabase.from('client_consent_records').select('*').order('created_at', { ascending: false });
    if (apptId) query = query.eq('appointment_id', apptId);
    else if (clientId) query = query.eq('client_id', clientId);
    const { data } = await query.limit(20);
    setConsentRecords((data ?? []) as ClientConsentRecord[]);
  }

  async function loadTreatmentNotes(clientId: string | null, apptId: string | null) {
    if (!clientId && !apptId) { setTreatmentNotes([]); return; }
    let query = supabase.from('client_treatment_notes').select('*').order('created_at', { ascending: false });
    if (apptId) query = query.eq('appointment_id', apptId);
    else if (clientId) query = query.eq('client_id', clientId);
    const { data } = await query.limit(20);
    setTreatmentNotes((data ?? []) as ClientTreatmentNote[]);
  }

  async function markNotificationRead(id: string) {
    await supabase.from('nurse_notifications').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', id);
    loadNotifications();
  }

  async function markAllRead() {
    const unreadIds = notifications.filter(n => n.status === 'unread').map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('nurse_notifications').update({ status: 'read', read_at: new Date().toISOString() }).in('id', unreadIds);
    loadNotifications();
  }

  async function archiveNotification(id: string) {
    await supabase.from('nurse_notifications').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', id);
    loadNotifications();
  }

  async function acknowledgeBooking(bookingId: string) {
    await supabase.from('client_bookings').update({ nurse_acknowledged_at: new Date().toISOString() }).eq('id', bookingId);
    setSuccessMsg('Booking acknowledged.');
    setTimeout(() => setSuccessMsg(null), 4000);
    load();
  }

  // ─── Attendance photo handlers (preserved from original) ────────────────────

  async function uploadAttendancePhoto(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `attendance/${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('attendance-photos').upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) return null;
    const { data: { publicUrl } } = supabase.storage.from('attendance-photos').getPublicUrl(fileName);
    return publicUrl;
  }

  async function handleClockIn(photoFile: File) {
    setUploadingPhoto(true);
    const photoUrl = await uploadAttendancePhoto(photoFile);
    setUploadingPhoto(false);
    if (!photoUrl) { setError('Failed to upload photo. Please try again.'); return; }
    setClockingIn(true);
    const { error: insertErr } = await supabase.from('time_logs').insert({
      staff_name: userEmail, branch_id: effectiveBranch !== 'all' ? effectiveBranch : null,
      clock_in: new Date().toISOString(), clock_in_photo_url: photoUrl,
    });
    if (insertErr) { setError('Failed to clock in.'); setClockingIn(false); return; }
    setSuccessMsg('Clocked in successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
    loadAttendance(); setClockingIn(false);
  }

  async function handleClockOut(photoFile: File) {
    if (!activeLog) return;
    setUploadingPhoto(true);
    const photoUrl = await uploadAttendancePhoto(photoFile);
    setUploadingPhoto(false);
    if (!photoUrl) { setError('Failed to upload photo. Please try again.'); return; }
    setClockingIn(true);
    const { error: updateErr } = await supabase.from('time_logs').update({ clock_out: new Date().toISOString(), clock_out_photo_url: photoUrl }).eq('id', activeLog.id);
    if (updateErr) { setError('Failed to clock out.'); setClockingIn(false); return; }
    setSuccessMsg('Clocked out successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
    loadAttendance(); setClockingIn(false);
  }

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCapturedPhoto(reader.result as string);
    reader.readAsDataURL(file);
    (fileInputRef.current as any)._selectedFile = file;
  }

  async function confirmPhoto() {
    const file = (fileInputRef.current as any)._selectedFile as File | undefined;
    if (!file || !photoModal) return;
    setPhotoModal(null); setCapturedPhoto(null);
    (fileInputRef.current as any)._selectedFile = null;
    if (photoModal.mode === 'in') await handleClockIn(file);
    else await handleClockOut(file);
  }

  function closePhotoModal() {
    setPhotoModal(null); setCapturedPhoto(null);
    (fileInputRef.current as any)._selectedFile = null;
  }

  // ─── Detail Page ─────────────────────────────────────────────────────────────

  if (detailAppt) {
    return (
      <>
      <AppointmentDetail
        appt={detailAppt}
        booking={bookingData}
        loadingBooking={loadingDetail}
        onBack={() => { setDetailAppt(null); setBookingData(null); setConsentRecords([]); setTreatmentNotes([]); }}
        onAdvance={() => advanceStatus(detailAppt)}
        onCancel={() => cancelAppt(detailAppt)}
        onLoadBooking={(id) => loadBookingData(id)}
        consentRecords={consentRecords}
        treatmentNotes={treatmentNotes}
        onLoadConsent={(cid, aid) => loadConsentRecords(cid, aid)}
        onLoadNotes={(cid, aid) => loadTreatmentNotes(cid, aid)}
        onOpenConsent={() => setShowConsentModal(true)}
        onOpenNotes={() => setShowNotesModal(true)}
        onOpenFeedbackQr={() => setShowFeedbackQr(true)}
        onOpenConsentQr={() => setShowConsentQr(true)}
        userEmail={userEmail}
        showConsentModal={showConsentModal}
        showNotesModal={showNotesModal}
        showFeedbackQr={showFeedbackQr}
        showConsentQr={showConsentQr}
        onCloseModals={() => { setShowConsentModal(false); setShowNotesModal(false); setShowFeedbackQr(false); setShowConsentQr(false); }}
        onConsentSaved={() => loadConsentRecords(detailAppt.clients?.id ?? null, detailAppt.id)}
        onNoteSaved={() => loadTreatmentNotes(detailAppt.clients?.id ?? null, detailAppt.id)}
        canEditService={canEditService}
        catalogOptions={catalogOptions}
        savingService={savingService}
        onChangeService={(catalogItemId) => updateApptService(detailAppt, catalogItemId)}
        collections={collections}
        loadingCollections={loadingCollections}
        onRecordPayment={() => setShowPaymentModal(true)}
        onSubmitRemittance={(c) => setShowRemittanceModal(c)}
        onOpenFeedbackForm={() => {
          const params = new URLSearchParams({
            src: 'nurse',
            name: detailAppt.clients?.full_name ?? '',
            appointment_id: detailAppt.id,
          });
          window.open(`${window.location.origin}/#feedback?${params.toString()}`, '_blank');
        }}
        feedbackStatus={feedbackStatus}
        nurseUserId={nurseUserId}
        currentNurseName={currentNurseName}
        memberLookup={memberLookup}
      />

      {showPaymentModal && (
        <RecordPaymentModal
          appointment={{
            id: detailAppt?.id ?? null,
            client_id: detailAppt?.clients?.id ?? null,
            client_name: detailAppt?.clients?.full_name ?? '',
            service: detailAppt?.service ?? null,
            branch_id: detailAppt?.branch_id ?? null,
            scheduled_date: detailAppt?.scheduled_date ?? todayStr(),
            scheduled_time: detailAppt?.scheduled_time ?? '',
            amount_due: detailAppt?.payment_amount ?? 0,
          }}
          nurseEmail={userEmail}
          nurseUserId={nurseUserId}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); if (detailAppt) loadCollections(detailAppt.id); loadAllCollections(); }}
        />
      )}

      {showRemittanceModal && (
        <SubmitRemittanceModal
          collection={showRemittanceModal}
          nurseEmail={userEmail}
          nurseUserId={nurseUserId}
          onClose={() => setShowRemittanceModal(null)}
          onSaved={() => { setShowRemittanceModal(null); if (detailAppt) loadCollections(detailAppt.id); loadAllCollections(); }}
        />
      )}
      </>
    );
  }

  // ─── Workspace Dashboard ─────────────────────────────────────────────────────

  const todays = appointments.filter(a => a.status !== 'cancelled');
  const statusCounts = STATUS_ORDER.reduce((acc, s) => { acc[s] = todays.filter(a => a.status === s).length; return acc; }, {} as Record<string, number>);

  // Next patient: first non-completed/cancelled appointment by time
  const nextPatient = todays
    .filter(a => a.status !== 'completed' && a.status !== 'cancelled')
    .sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || ''))[0] ?? null;

  // Needs Attention items
  const needsAttention: { appt: AppointmentRow; issue: string; severity: 'Critical' | 'High' | 'Medium' | 'Low'; action: string }[] = [];
  todays.forEach(a => {
    if (a.status === 'scheduled' && a.intake_form_status === 'PENDING') needsAttention.push({ appt: a, issue: 'Intake pending', severity: 'High', action: 'Review intake' });
    if (a.status === 'arrived' && a.intake_form_status !== 'COMPLETED') needsAttention.push({ appt: a, issue: 'Intake incomplete at arrival', severity: 'Critical', action: 'Complete intake' });
    if (a.status === 'scheduled' && !a.booking_id) needsAttention.push({ appt: a, issue: 'No booking/intake linked', severity: 'Medium', action: 'Link booking' });
    if (a.status === 'completed' && a.clients && !a.feedback_email_sent_at) needsAttention.push({ appt: a, issue: 'Feedback pending', severity: 'Low', action: 'Send feedback QR' });
  });


  const sevCfg = {
    Critical: 'bg-red-50 text-red-700 border-red-200',
    High: 'bg-amber-50 text-amber-700 border-amber-200',
    Medium: 'bg-blue-50 text-blue-700 border-blue-200',
    Low: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Nurse Dashboard</h2>
            <p className="text-xs text-slate-400">Welcome, {userEmail}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <div className="relative">
            <button onClick={() => setNotifOpen(o => !o)} className="relative p-2.5 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
              {unreadCount > 0 ? <BellRing className="w-4.5 h-4.5 text-teal-600" /> : <Bell className="w-4.5 h-4.5" />}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {notifOpen && (
              <NotificationFeed
                notifications={notifications}
                onMarkRead={markNotificationRead}
                onMarkAllRead={markAllRead}
                onArchive={archiveNotification}
                onClose={() => setNotifOpen(false)}
                onOpenBooking={(bookingId) => {
                  setNotifOpen(false);
                  if (bookingId) loadBookingData(bookingId);
                }}
              />
            )}
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Toasts */}
      {successMsg && <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4"><CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /><p className="text-sm text-emerald-700 font-medium">{successMsg}</p></div>}
      {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-5 py-4"><AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-sm text-red-700 font-medium">{error}</p></div>}

      {/* ═══ SECTION 1: ATTENDANCE / CLOCK IN ═══ */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeLog ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              <CalendarCheck className={`w-5 h-5 ${activeLog ? 'text-emerald-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Attendance</p>
              <p className="text-sm text-slate-400">
                {activeLog ? `Clocked in ${fmtTimeOnly(activeLog.clock_in)}` : 'Not clocked in today'}
                {activeLog && activeLog.clock_in && (
                  <> · Working {Math.floor((Date.now() - new Date(activeLog.clock_in).getTime()) / 3600000)}h {Math.floor(((Date.now() - new Date(activeLog.clock_in).getTime()) % 3600000) / 60000)}m</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${activeLog ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${activeLog ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {activeLog ? 'On Shift' : 'Off Shift'}
            </span>
            {activeLog ? (
              <button onClick={() => setPhotoModal({ mode: 'out' })} disabled={clockingIn || uploadingPhoto} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50">
                {clockingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Clock Out
              </button>
            ) : (
              <button onClick={() => setPhotoModal({ mode: 'in' })} disabled={clockingIn || uploadingPhoto} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50">
                {clockingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Clock In
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 2: MY NEXT PATIENT ═══ */}
      <section>
        <NextPatientCard
          appt={nextPatient}
          onStart={() => { if (nextPatient) { setDetailAppt(nextPatient); if (nextPatient.booking_id) loadBookingData(nextPatient.booking_id); } }}
          onView={() => { if (nextPatient) { setDetailAppt(nextPatient); if (nextPatient.booking_id) loadBookingData(nextPatient.booking_id); loadConsentRecords(nextPatient.clients?.id ?? null, nextPatient.id); loadTreatmentNotes(nextPatient.clients?.id ?? null, nextPatient.id); } }}
        />
      </section>

      {/* ═══ SECTION 3: TODAY'S SCHEDULE (timeline) ═══ */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><CalendarDays className="w-4 h-4 text-teal-600" /> Schedule</h3>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(['daily', 'weekly', 'monthly'] as const).map(v => (
                <button key={v} onClick={() => setScheduleView(v)} className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${scheduleView === v ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{v[0].toUpperCase() + v.slice(1)}</button>
              ))}
            </div>
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white" />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center"><Calendar className="w-10 h-10 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-400">No appointments for this {scheduleView === 'daily' ? 'date' : scheduleView === 'weekly' ? 'week' : 'month'}.</p></div>
        ) : (
          <ScheduleTimeline
            appointments={appointments}
            onSelect={(a) => { setDetailAppt(a); if (a.booking_id) loadBookingData(a.booking_id); loadConsentRecords(a.clients?.id ?? null, a.id); loadTreatmentNotes(a.clients?.id ?? null, a.id); }}
            showDate={scheduleView !== 'daily'}
          />
        )}
      </section>

      {/* ═══ SECTION 4: ACTION CENTER ═══ */}
      <section>
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Action Center</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ActionGroup
            title="Urgent" dotClass="bg-red-500"
            items={[
              { label: 'Review New Booking', count: confirmedBookings.filter(b => !b.nurse_acknowledged_at).length, icon: BellRing, action: () => setNotifOpen(true) },
              { label: 'Record Treatment Notes', count: todays.filter(a => a.status === 'completed' && !dashboardNotes.some(n => n.appointment_id === a.id)).length, icon: FileText, action: () => { const a = todays.find(x => x.status === 'completed' && !dashboardNotes.some(n => n.appointment_id === x.id)); if (a) { setDetailAppt(a); setShowNotesModal(true); } } },
              { label: 'Submit Remittance', count: allCollections.filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance').length, icon: Receipt, action: () => { const c = allCollections.find(x => x.status === 'collected_by_nurse' || x.status === 'for_remittance'); if (c) setShowRemittanceModal(c); } },
              { label: 'Report Adverse Reaction', count: 0, icon: ShieldAlert, action: () => { if (todays[0]) { setDetailAppt(todays[0]); setShowNotesModal(true); } } },
            ]}
          />
          <ActionGroup
            title="Pending" dotClass="bg-amber-500"
            items={[
              { label: 'Collect Feedback', count: todays.filter(a => a.status === 'completed' && !a.feedback_email_sent_at).length, icon: MessageSquare, action: () => { const a = todays.find(x => x.status === 'completed' && !x.feedback_email_sent_at); if (a) { setDetailAppt(a); if (a.booking_id) loadBookingData(a.booking_id); } } },
              { label: 'Consent Pending', count: todays.filter(a => !dashboardConsent.some(c => c.appointment_id === a.id && c.status === 'signed')).length, icon: Lock, action: () => { const a = todays.find(x => !dashboardConsent.some(c => c.appointment_id === x.id && c.status === 'signed')); if (a) { setDetailAppt(a); setShowConsentModal(true); } } },
              { label: 'Incomplete Documentation', count: todays.filter(a => a.intake_form_status !== 'COMPLETED').length, icon: FileText, action: () => { const a = todays.find(x => x.intake_form_status !== 'COMPLETED'); if (a) { setDetailAppt(a); if (a.booking_id) loadBookingData(a.booking_id); } } },
            ]}
          />
        </div>
      </section>

      {/* ═══ SECTION 5: TODAY'S SUMMARY (KPI cards — reduced weight) ═══ */}
      <section>
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Today's Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label="Appointments" value={todays.length} sub={`${statusCounts.completed || 0} done`} icon={CalendarCheck} tone="teal" />
          <KpiCard label="Completed" value={statusCounts.completed || 0} sub={todays.length > 0 ? `${Math.round(((statusCounts.completed || 0) / todays.length) * 100)}% of today` : '—'} icon={CheckCircle} tone="emerald" />
          <KpiCard label="Pending Tasks" value={needsAttention.length} sub={`${confirmedBookings.filter(b => !b.nurse_acknowledged_at).length} bookings`} icon={AlertTriangle} tone="slate" />
          <KpiCard label="Collections" value={fmtPeso(allCollections.filter(c => isToday(c.collected_at)).reduce((s, c) => s + c.amount_received, 0))} sub={`${allCollections.filter(c => isToday(c.collected_at)).length} today`} icon={Droplets} tone="blue" />
          <KpiCard label="Remittance" value={fmtPeso(allCollections.filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance' || c.status === 'pending_confirmation').reduce((s, c) => s + c.amount_received, 0))} sub={`${allCollections.filter(c => c.status === 'pending_confirmation').length} pending`} icon={Hourglass} tone="amber" />
        </div>
      </section>

      {/* ═══ SECTION 6: PATIENT ALERTS ═══ */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Patient Alerts</h3>
        </div>
        {needsAttention.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center"><CheckCircle className="w-10 h-10 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-400">No alerts — all patients are on track.</p></div>
        ) : (
          <div className="divide-y divide-slate-50">
            {needsAttention.slice(0, 10).map((item, i) => (
              <button key={i} onClick={() => { setDetailAppt(item.appt); if (item.appt.booking_id) loadBookingData(item.appt.booking_id); loadConsentRecords(item.appt.clients?.id ?? null, item.appt.id); loadTreatmentNotes(item.appt.clients?.id ?? null, item.appt.id); }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left">
                <div className={`flex-shrink-0 w-2 h-2 rounded-full ${item.severity === 'Critical' ? 'bg-red-500' : item.severity === 'High' ? 'bg-amber-500' : item.severity === 'Medium' ? 'bg-blue-500' : 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{item.appt.clients?.full_name ?? 'Unknown Client'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.appt.scheduled_date ? fmtDate(item.appt.scheduled_date) : ''} at {item.appt.scheduled_time ? fmtTime(item.appt.scheduled_time) : '—'} · {item.issue}</p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${sevCfg[item.severity]}`}>{item.severity}</span>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ═══ SECTION 7: UPCOMING APPOINTMENTS (7-day) ═══ */}
      <UpcomingAppointments branchFilter={effectiveBranch} onSelect={(a) => { setDetailAppt(a); if (a.booking_id) loadBookingData(a.booking_id); loadConsentRecords(a.clients?.id ?? null, a.id); loadTreatmentNotes(a.clients?.id ?? null, a.id); }} />

      {/* ═══ SECTION 8: FINANCIAL SNAPSHOT (near bottom, reduced weight) ═══ */}
      <section>
        <FinancialSnapshot collections={allCollections} onRecordPayment={() => setShowPaymentModal(true)} onSubmitRemittance={(c) => setShowRemittanceModal(c)} />
      </section>

      {/* ═══ SECTION 9: RECENT ACTIVITY ═══ */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100"><h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><TrendingUp className="w-4 h-4 text-teal-600" /> Recent Activity</h3></div>
        <RecentActivity appointments={todays} collections={allCollections} timeLogs={timeLogs} />
      </section>

      {/* Photo Capture Modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closePhotoModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2"><Camera className="w-5 h-5 text-teal-600" /><h3 className="text-base font-bold text-slate-800">{photoModal.mode === 'in' ? 'Clock In' : 'Clock Out'} Photo</h3></div>
              <button onClick={closePhotoModal} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {capturedPhoto ? (
                <div className="relative">
                  <img src={capturedPhoto} alt="Preview" className="w-full rounded-xl object-cover max-h-64" />
                  <button onClick={() => { setCapturedPhoto(null); (fileInputRef.current as any)._selectedFile = null; }} className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/80 transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
                  <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center"><Camera className="w-7 h-7 text-teal-600" /></div>
                  <p className="text-sm font-semibold text-slate-600">Take or upload a photo</p>
                  <p className="text-xs text-slate-400">Click here to use your camera or select a file</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={onPhotoSelected} className="hidden" />
              {capturedPhoto && (
                <button onClick={confirmPhoto} disabled={uploadingPhoto || clockingIn} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
                  {uploadingPhoto || clockingIn ? <><Loader2 className="w-4 h-4 animate-spin" /> {photoModal.mode === 'in' ? 'Clocking in...' : 'Clocking out...'}</> : <><CheckCircle className="w-4 h-4" /> Confirm {photoModal.mode === 'in' ? 'Clock In' : 'Clock Out'}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <RecordPaymentModal
          appointment={{
            id: detailAppt?.id ?? null,
            client_id: detailAppt?.clients?.id ?? null,
            client_name: detailAppt?.clients?.full_name ?? '',
            service: detailAppt?.service ?? null,
            branch_id: detailAppt?.branch_id ?? null,
            scheduled_date: detailAppt?.scheduled_date ?? todayStr(),
            scheduled_time: detailAppt?.scheduled_time ?? '',
            amount_due: detailAppt?.payment_amount ?? 0,
          }}
          nurseEmail={userEmail}
          nurseUserId={nurseUserId}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); if (detailAppt) loadCollections(detailAppt.id); loadAllCollections(); }}
        />
      )}

      {showRemittanceModal && (
        <SubmitRemittanceModal
          collection={showRemittanceModal}
          nurseEmail={userEmail}
          nurseUserId={nurseUserId}
          onClose={() => setShowRemittanceModal(null)}
          onSaved={() => { setShowRemittanceModal(null); if (detailAppt) loadCollections(detailAppt.id); loadAllCollections(); }}
        />
      )}
    </div>
  );
}

// ─── Notification Feed ─────────────────────────────────────────────────────────

function NotificationFeed({ notifications, onMarkRead, onMarkAllRead, onArchive, onClose, onOpenBooking }: {
  notifications: NurseNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onArchive: (id: string) => void;
  onClose: () => void;
  onOpenBooking: (bookingId: string | null) => void;
}) {
  const visible = notifications.filter(n => n.status !== 'archived');
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-40 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Bell className="w-4 h-4 text-teal-600" /> Notifications</h4>
          <button onClick={onMarkAllRead} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Mark all read</button>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10"><Inbox className="w-8 h-8 text-slate-300 mb-2" /><p className="text-sm text-slate-400">No notifications.</p></div>
          ) : visible.map(n => (
            <div key={n.id} className={`px-4 py-3 hover:bg-slate-50 transition-colors ${n.status === 'unread' ? 'bg-teal-50/40' : ''}`}>
              <button onClick={() => { if (n.status === 'unread') onMarkRead(n.id); onOpenBooking(n.booking_id); }} className="w-full text-left">
                <div className="flex items-start gap-2">
                  {n.status === 'unread' && <span className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{n.client_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                      <Clock className="w-3 h-3" /> {timeAgo(n.created_at)}
                      {n.appointment_date && <span>· {fmtDate(n.appointment_date)} {n.appointment_time ? fmtTime(n.appointment_time) : ''}</span>}
                    </div>
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-2 mt-2 pl-4">
                <button onClick={() => onArchive(n.id)} className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1"><Archive className="w-3 h-3" /> Archive</button>
              </div>
            </div>
          ))}
        </div>
        {/* Delivery channel status */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Delivery Channels</p>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-600"><CheckCircle className="w-3 h-3" /> In-app: Active</span>
            <span className="flex items-center gap-1 text-emerald-600"><CheckCircle className="w-3 h-3" /> Email: Configured</span>
            <span className="flex items-center gap-1 text-slate-400"><Ban className="w-3 h-3" /> SMS: Not configured</span>
            <span className="flex items-center gap-1 text-slate-400"><Ban className="w-3 h-3" /> Push: Not configured</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Upcoming Appointments (next 7 days) ──────────────────────────────────────

function UpcomingAppointments({ branchFilter, onSelect }: { branchFilter: string; onSelect: (a: AppointmentRow) => void }) {
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = todayStr();
    const end = new Date(); end.setDate(end.getDate() + 7);
    const endStr = end.toISOString().split('T')[0];
    let q = supabase
      .from('appointments')
      .select(`*, clients ( id, full_name, email, phone, address, health_notes ), branches ( id, name )`)
      .gte('scheduled_date', today)
      .lte('scheduled_date', endStr)
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    q.then(({ data }) => {
      setUpcoming((data ?? []) as unknown as AppointmentRow[]);
      setLoading(false);
    });
  }, [branchFilter]);

  return (
    <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><Calendar className="w-4 h-4 text-teal-600" /> Upcoming Appointments (7 days)</h3>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center"><Calendar className="w-10 h-10 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-400">No upcoming appointments.</p></div>
      ) : (
        <div className="divide-y divide-slate-50">
          {upcoming.slice(0, 8).map(a => (
            <button key={a.id} onClick={() => onSelect(a)} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left">
              <div className="flex-shrink-0 text-center w-20">
                <p className="text-xs font-semibold text-slate-500">{fmtDate(a.scheduled_date)}</p>
                <p className="text-sm font-bold text-teal-600">{fmtTime(a.scheduled_time)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{a.clients?.full_name ?? 'Unknown'}</p>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5"><Droplets className="w-3 h-3" /> {a.service ?? '—'} {a.branches && <>· <MapPin className="w-3 h-3" /> {a.branches.name}</>}</p>
              </div>
              {(() => { const s = STATUS_CFG[a.status] ?? STATUS_CFG.scheduled; return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${s.color} ${s.bg}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>
              ); })()}
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Appointment Detail (enhanced) ─────────────────────────────────────────────

function AppointmentDetail({
  appt, booking, loadingBooking, onBack, onAdvance, onCancel, onLoadBooking,
  consentRecords, treatmentNotes, onLoadConsent, onLoadNotes,
  onOpenConsent, onOpenNotes, onOpenFeedbackQr, onOpenConsentQr,
  userEmail, showConsentModal, showNotesModal, showFeedbackQr, showConsentQr,
  onCloseModals, onConsentSaved, onNoteSaved,
  canEditService, catalogOptions, savingService, onChangeService,
  collections, loadingCollections, onRecordPayment, onSubmitRemittance,
  onOpenFeedbackForm, feedbackStatus,
  nurseUserId, currentNurseName, memberLookup,
}: {
  appt: AppointmentRow;
  booking: ClientBooking | null;
  loadingBooking: boolean;
  onBack: () => void;
  onAdvance: () => void;
  onCancel: () => void;
  onLoadBooking: (id: string | null) => void;
  consentRecords: ClientConsentRecord[];
  treatmentNotes: ClientTreatmentNote[];
  onLoadConsent: (clientId: string | null, apptId: string | null) => void;
  onLoadNotes: (clientId: string | null, apptId: string | null) => void;
  onOpenConsent: () => void;
  onOpenNotes: () => void;
  onOpenFeedbackQr: () => void;
  onOpenConsentQr: () => void;
  userEmail: string;
  showConsentModal: boolean;
  showNotesModal: boolean;
  showFeedbackQr: boolean;
  showConsentQr: boolean;
  onCloseModals: () => void;
  canEditService: boolean;
  catalogOptions: { id: string; name: string; item_type: string }[];
  savingService: boolean;
  onChangeService: (catalogItemId: string) => void;
  onConsentSaved: () => void;
  onNoteSaved: () => void;
  collections: NurseCollection[];
  loadingCollections: boolean;
  onRecordPayment: () => void;
  onSubmitRemittance: (c: NurseCollection) => void;
  onOpenFeedbackForm: () => void;
  feedbackStatus: FeedbackStatus;
  nurseUserId: string | null;
  currentNurseName: string;
  memberLookup: MemberLookup;
}) {
  const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.scheduled;
  const payCfg = PAYMENT_CFG[appt.payment_status] ?? PAYMENT_CFG.pending;

  // Treatment readiness check
  const hasConsent = consentRecords.some(c => c.status === 'signed' && c.appointment_id === appt.id);
  const intakeComplete = appt.intake_form_status?.toUpperCase() === 'COMPLETED' || booking?.intake_form_status?.toUpperCase() === 'COMPLETED';
  const readyForTreatment = hasConsent && intakeComplete;
  const canStartTreatment = appt.status === 'arrived' || appt.status === 'scheduled';

  // Consent confirmation: allow proceeding without captured consent after explicit confirmation
  const [showProceedConsentDialog, setShowProceedConsentDialog] = useState(false);
  // Preview a captured consent without leaving the appointment for Client Management.
  const [previewConsent, setPreviewConsent] = useState<ClientConsentRecord | null>(null);
  const consentBlocksTreatment = canStartTreatment && cfg.nextStatus === 'in_treatment' && !hasConsent;
  const intakeBlocksTreatment = canStartTreatment && cfg.nextStatus === 'in_treatment' && !intakeComplete;

  function handleAdvance() {
    if (consentBlocksTreatment) {
      setShowProceedConsentDialog(true);
      return;
    }
    onAdvance();
  }

  async function proceedWithoutConsent() {
    setShowProceedConsentDialog(false);
    if (nurseUserId) {
      try {
        await supabase.from('nurse_notifications').insert({
          recipient_user_id: nurseUserId,
          appointment_id: appt.id,
          booking_id: appt.booking_id ?? null,
          client_name: appt.clients?.full_name ?? 'Unknown',
          service: appt.service ?? null,
          appointment_date: appt.scheduled_date ?? null,
          appointment_time: appt.scheduled_time ?? null,
          message: `Treatment started without a captured Consent & Waiver for ${appt.clients?.full_name ?? 'Unknown Client'}.`,
          event_type: 'treatment_started_without_consent',
          status: 'unread',
        });
      } catch { /* best-effort audit log */ }
    }
    onAdvance();
  }

  const readiness = !intakeComplete ? { label: 'Intake Pending', color: 'text-amber-700 bg-amber-50 border-amber-200' }
    : !hasConsent ? { label: 'Consent Pending', color: 'text-red-700 bg-red-50 border-red-200' }
    : readyForTreatment ? { label: 'Ready for Treatment', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
    : { label: 'Blocked', color: 'text-slate-700 bg-slate-100 border-slate-200' };

  // Warning badges
  const hasAllergies = booking?.has_allergies && booking.has_allergies.toLowerCase().startsWith('yes');
  const hasConditions = booking?.pre_existing_condition && booking.pre_existing_condition.toLowerCase().startsWith('yes');
  const hasMedications = booking?.taking_medications && booking.taking_medications.toLowerCase().startsWith('yes');

  return (
    <div className="bg-slate-50 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 lg:-mt-8 min-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</button>
        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800 truncate">{appt.clients?.full_name ?? 'Unknown Client'}</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.color} ${cfg.bg}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-bold ${readiness.color}`}>{readiness.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
        {/* Left: Details */}
        <div className="bg-white border-r border-slate-200 p-4 sm:p-6 lg:p-8 space-y-7">
          {/* Warning badges */}
          {(hasAllergies || hasConditions || hasMedications || !hasConsent) && (
            <div className="flex flex-wrap gap-2">
              {hasAllergies && <WarningBadge icon={ShieldAlert} label="Allergy" />}
              {hasConditions && <WarningBadge icon={HeartPulse} label="Pre-existing Condition" />}
              {hasMedications && <WarningBadge icon={Syringe} label="Taking Medications" />}
              {!hasConsent && <WarningBadge icon={FileText} label="Consent Missing" />}
            </div>
          )}

          {/* Appointment Info */}
          <SectionBlock title="Appointment Details">
            <div className="grid grid-cols-2 gap-4">
              <DetailField icon={Calendar} label="Date" value={fmtDate(appt.scheduled_date)} />
              <DetailField icon={Clock} label="Time" value={fmtTime(appt.scheduled_time)} />
              <DetailField icon={Droplets} label="Service" value={appt.service} />
              <DetailField icon={MapPin} label="Location" value={appt.location} />
              <DetailField icon={MapPin} label="Branch" value={appt.branches?.name} />
              <DetailField icon={Users} label="Pax" value={booking?.pax?.toString()} />
            </div>
          </SectionBlock>

          {/* Team Assignment */}
          <SectionBlock title="Team Assignment">
            <div className="grid grid-cols-2 gap-4">
              <DetailField icon={Stethoscope} label="Nurse" value={appt.nurse_name} />
              <DetailField icon={User} label="Assistant" value={appt.assistant_name} />
              <DetailField icon={Car} label="Driver" value={appt.driver_name} />
              <DetailField icon={Car} label="Vehicle" value={appt.vehicle} />
            </div>
          </SectionBlock>

          {/* Client Contact */}
          {appt.clients && (
            <SectionBlock title="Client Contact">
              <div className="grid grid-cols-2 gap-4">
                <DetailField icon={Mail} label="Email" value={appt.clients.email} />
                <DetailField icon={Phone} label="Phone" value={appt.clients.phone} />
                <DetailField icon={MapPin} label="Address" value={appt.clients.address} />
              </div>
            </SectionBlock>
          )}

          {/* Client Health / Intake Info */}
          <SectionBlock title="Client Health & Intake">
            {loadingBooking ? (
              <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading intake data...</div>
            ) : booking ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField icon={User} label="Age" value={booking.age?.toString()} />
                  <DetailField icon={User} label="Gender" value={booking.gender} />
                  <DetailField icon={Activity} label="Weight" value={booking.weight} />
                  <DetailField icon={Calendar} label="Date of Birth" value={booking.date_of_birth} />
                </div>
                <HealthFlag icon={HeartPulse} label="Pregnant / Breastfeeding" value={booking.is_pregnant_breastfeeding} />
                <HealthFlag icon={ShieldAlert} label="Pre-existing Conditions" value={booking.pre_existing_condition} />
                <HealthFlag icon={Syringe} label="Taking Medications" value={booking.taking_medications} />
                <HealthFlag icon={ShieldAlert} label="Allergies" value={booking.has_allergies} />
                <HealthFlag icon={ShieldAlert} label="Bleeding Disorders" value={booking.bleeding_disorders} />
                {booking.family_history && booking.family_history.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-1.5 flex items-center gap-1.5"><HeartPulse className="w-3.5 h-3.5" /> Family History</p>
                    <div className="flex flex-wrap gap-1.5">
                      {booking.family_history.map(h => <span key={h} className="px-2 py-0.5 bg-rose-50 border border-rose-200 rounded-full text-xs font-semibold text-rose-700">{h}</span>)}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <DetailField icon={Droplets} label="Water Intake" value={booking.water_intake} />
                  <DetailField icon={Activity} label="Exercise" value={booking.exercise_frequency} />
                  <DetailField icon={FlaskConical} label="Alcohol" value={booking.alcohol_consumption} />
                  <DetailField icon={Activity} label="Smoking/Vaping" value={booking.smoking_vaping} />
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-medium mb-2 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Emergency Contact</p>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField icon={User} label="Name" value={booking.emergency_contact_name} />
                    <DetailField icon={Phone} label="Phone" value={booking.emergency_contact_number} />
                  </div>
                </div>
                {booking.consent_given && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5"><CheckCircle className="w-4 h-4 text-emerald-500" /><span className="text-xs font-semibold text-emerald-700">Consent given by client at booking</span></div>}
              </div>
            ) : appt.booking_id ? (
              <button onClick={() => onLoadBooking(appt.booking_id)} className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-semibold"><FileText className="w-4 h-4" /> Load intake form data</button>
            ) : <p className="text-sm text-slate-400">No intake form linked to this appointment.</p>}
          </SectionBlock>

          {/* Consent & Waiver Records */}
          <SectionBlock title="Consent & Waiver Records">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${hasConsent ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
                  {hasConsent ? <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Consent Signed</> : <><AlertTriangle className="w-3.5 h-3.5 mr-1" /> Consent Missing</>}
                </span>
                <button onClick={onOpenConsent} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"><PenLine className="w-3.5 h-3.5" /> Capture Consent</button>
                <button onClick={onOpenConsentQr} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"><QrCode className="w-3.5 h-3.5" /> Consent QR</button>
              </div>
              {consentRecords.length > 0 && (
                <div className="space-y-2">
                  {consentRecords.map(c => (
                    <button key={c.id} type="button" onClick={() => setPreviewConsent(c)}
                      className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors hover:brightness-95 ${c.status === 'signed' ? 'bg-emerald-50 border-emerald-200' : c.status === 'superseded' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center flex-shrink-0">
                        {c.status === 'signed' ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : c.status === 'superseded' ? <Archive className="w-4 h-4 text-slate-400" /> : <Clock className="w-4 h-4 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-700">{c.form_type === 'waiver' ? 'Waiver' : 'Consent'} — {c.form_version}</p>
                        <p className="text-xs text-slate-400">{c.signatory_name ? `Signed by ${c.signatory_name}` : 'Pending'} · {c.signed_at ? fmtDateTime(c.signed_at) : '—'} · {c.submission_method ?? '—'}</p>
                      </div>
                      <span className={`text-xs font-bold ${c.status === 'signed' ? 'text-emerald-600' : c.status === 'superseded' ? 'text-slate-400' : 'text-amber-600'}`}>{c.status}</span>
                      <Eye className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SectionBlock>

          {/* Availed Service — editable on site when the client changes their mind */}
          <SectionBlock title="Availed Service">
            <ServiceEditor
              appt={appt}
              canEdit={canEditService}
              options={catalogOptions}
              saving={savingService}
              onChange={onChangeService}
            />
            <InventoryDeductionStatus appt={appt} />
          </SectionBlock>

          {/* Treatment Notes */}
          <SectionBlock title="Treatment Notes">
            <div className="space-y-3">
              <button onClick={onOpenNotes} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"><FileText className="w-3.5 h-3.5" /> Record Treatment Notes</button>
              {treatmentNotes.length > 0 && (
                <div className="space-y-2">
                  {treatmentNotes.map(n => (
                    <div key={n.id} className={`p-3 rounded-xl border ${n.adverse_reaction ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {n.adverse_reaction && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><ShieldAlert className="w-3.5 h-3.5" /> Adverse Reaction</span>}
                        <span className="text-xs text-slate-400">{n.nurse_name ? resolveMemberName(n.nurse_name, memberLookup) : currentNurseName} · {fmtDateTime(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.note_text}</p>
                      {n.reaction_details && <p className="text-xs text-red-600 mt-1">Details: {n.reaction_details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionBlock>

          {/* Notes */}
          {appt.notes && <SectionBlock title="Notes"><p className="text-sm text-slate-700 whitespace-pre-wrap">{appt.notes}</p></SectionBlock>}
        </div>

        {/* Right: Workflow Timeline + Actions */}
        <div className="bg-slate-50 p-4 sm:p-6 lg:p-8">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Workflow Timeline</p>
          <NurseWorkflowTimeline booking={booking} appt={appt} memberLookup={memberLookup} currentNurseName={currentNurseName} collections={collections} feedbackStatus={feedbackStatus} />

          {/* Action Buttons */}
          <div className="mt-6 space-y-2">
            {cfg.nextStatus && (
              <button
                onClick={handleAdvance}
                disabled={intakeBlocksTreatment}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white font-bold rounded-xl transition-colors text-sm ${
                  intakeBlocksTreatment
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                <ChevronRight className="w-4 h-4" /> {cfg.nextLabel}
              </button>
            )}
            {intakeBlocksTreatment && (
              <p className="text-xs text-red-600 font-semibold text-center">Treatment blocked: intake incomplete.</p>
            )}
            {consentBlocksTreatment && (
              <p className="text-xs text-amber-700 font-semibold text-center">Consent &amp; Waiver not captured. You can proceed after confirming the risk.</p>
            )}
            {appt.status !== 'cancelled' && appt.status !== 'completed' && (
              <button onClick={onCancel} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition-colors text-sm">Cancel Appointment</button>
            )}
          </div>

          {/* Quick action buttons */}
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Quick Actions</p>
            <button onClick={onOpenFeedbackForm} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 border border-teal-600 rounded-xl transition-colors"><MessageSquare className="w-4 h-4" /> Open Feedback Form</button>
            <button onClick={onOpenFeedbackQr} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"><QrCode className="w-4 h-4 text-teal-600" /> Display Feedback QR</button>
            <button onClick={onOpenConsentQr} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"><QrCode className="w-4 h-4 text-teal-600" /> Display Consent QR</button>
            <button onClick={onOpenConsent} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"><PenLine className="w-4 h-4 text-teal-600" /> Open Consent Form</button>
            <button onClick={onOpenNotes} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"><FileText className="w-4 h-4 text-teal-600" /> Record Treatment Notes</button>
          </div>

          {/* Feedback Status */}
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Feedback:</span>
            <FeedbackStatusBadge status={feedbackStatus} />
          </div>

          {/* Payment & Remittance */}
          <PaymentRemittanceCard
            collections={collections}
            loadingCollections={loadingCollections}
            onRecordPayment={onRecordPayment}
            onSubmitRemittance={onSubmitRemittance}
          />
        </div>
      </div>

      {/* Modals */}
      {showConsentModal && (
        <ConsentSignatureModal
          appt={appt}
          booking={booking}
          userEmail={userEmail}
          onClose={onCloseModals}
          onSaved={() => { onConsentSaved(); onCloseModals(); }}
        />
      )}
      {showNotesModal && (
        <TreatmentNotesModal
          appt={appt}
          userEmail={userEmail}
          nurseUserId={nurseUserId}
          nurseName={currentNurseName}
          onClose={onCloseModals}
          onSaved={() => { onNoteSaved(); onCloseModals(); }}
        />
      )}
      {showFeedbackQr && <QrModal title="Client Feedback QR" appt={appt} type="feedback" onClose={onCloseModals} />}
      {showConsentQr && <QrModal title="Consent & Waiver QR" appt={appt} type="consent" onClose={onCloseModals} />}
      {previewConsent && <ConsentPreviewModal record={previewConsent} onClose={() => setPreviewConsent(null)} />}
      {showProceedConsentDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowProceedConsentDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-800">Proceed Without Captured Consent?</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">This appointment does not have a captured Consent &amp; Waiver. Proceeding without documented consent may carry clinical and legal risk. Confirm only if consent will be obtained and recorded later.</p>
              <div className="flex gap-2.5">
                <button onClick={() => setShowProceedConsentDialog(false)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
                <button onClick={proceedWithoutConsent} className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors">Proceed Anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Consent Signature Modal ──────────────────────────────────────────────────

function ConsentSignatureModal({ appt, booking, userEmail, onClose, onSaved }: {
  appt: AppointmentRow;
  booking: ClientBooking | null;
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatoryName, setSignatoryName] = useState(booking?.full_name ?? appt.clients?.full_name ?? '');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formType, setFormType] = useState<'consent' | 'waiver'>('consent');
  const [captureMode, setCaptureMode] = useState<'signature' | 'upload'>('signature');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDraw() { setDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function saveConsent() {
    if (captureMode === 'signature' && !hasSignature) { setError('Please draw a signature first.'); return; }
    if (captureMode === 'upload' && !file) { setError('Please select a signed consent document to upload.'); return; }
    if (!signatoryName.trim()) { setError('Signatory name is required.'); return; }
    if (!acknowledged) { setError('Client must acknowledge the consent statement.'); return; }
    setSaving(true);
    setError(null);

    try {
      let signatureData: string;
      if (captureMode === 'signature') {
        signatureData = canvasRef.current!.toDataURL('image/png');
      } else {
        const ext = file!.name.split('.').pop() ?? 'bin';
        const safeName = `consent/${appt.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('client-documents').upload(safeName, file!);
        if (uploadErr) { setError(uploadErr.message); setSaving(false); return; }
        signatureData = safeName;
      }
      const now = new Date().toISOString();

      const consentPayload = {
        client_id: appt.client_id || null,
        appointment_id: appt.id,
        service: appt.service ?? null,
        form_version: 'v1',
        form_type: formType,
        status: 'signed',
        signatory_name: signatoryName.trim(),
        signature_data: signatureData,
        signed_at: now,
        submission_method: 'clinic_ipad',
        witness_user_id: null,
        ip_address: null,
        user_agent: navigator.userAgent,
      };

      const { error: insertErr } = await supabase.from('client_consent_records').insert(consentPayload);

      if (insertErr) {
        console.error('Consent save error:', insertErr);
        // The client is often watching this screen, so the message stays plain.
        // Diagnostics go to the console above, not into the UI.
        setError(`Could not save the consent form: ${insertErr.message}`);
        return;
      }
      onSaved();
    } catch (err) {
      console.error('Consent save exception:', err);
      setError('Unable to save the consent form. Please review the required information and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2"><PenLine className="w-5 h-5 text-teal-600" /><h3 className="text-base font-bold text-slate-800">Digital Consent & Waiver</h3></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-700 font-medium">{error}</p></div>}

          {/* Capture mode toggle */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Capture Method</label>
            <div className="flex gap-2">
              <button onClick={() => setCaptureMode('signature')} className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl border-2 transition-colors ${captureMode === 'signature' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><PenLine className="w-4 h-4" /> Electronic Signature</button>
              <button onClick={() => setCaptureMode('upload')} className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl border-2 transition-colors ${captureMode === 'upload' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Upload className="w-4 h-4" /> Upload Signed Consent</button>
            </div>
          </div>

          {/* Form type toggle */}
          <div className="flex gap-2">
            {(['consent', 'waiver'] as const).map(t => (
              <button key={t} onClick={() => setFormType(t)} className={`px-4 py-2 text-sm font-bold rounded-xl border-2 transition-colors capitalize ${formType === t ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{t === 'consent' ? 'Consent' : 'Waiver'}</button>
            ))}
          </div>

          {/* Client info */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1">
            <p className="text-sm font-bold text-slate-700">{appt.clients?.full_name ?? 'Unknown Client'}</p>
            <p className="text-xs text-slate-400">{appt.service} · {fmtDate(appt.scheduled_date)} at {fmtTime(appt.scheduled_time)}</p>
          </div>

          {/* Consent text */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-slate-700 leading-relaxed">
              I, the undersigned, consent to the {formType === 'waiver' ? 'waiver and release of liability for' : 'performance of'} the treatment/procedure described above.
              I have been informed of the nature, risks, benefits, and alternatives, and I have had the opportunity to ask questions.
              I confirm that the information I have provided is accurate and I have disclosed any changes since my previous visit.
            </p>
          </div>

          {/* Signatory name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Signatory Full Name</label>
            <input type="text" value={signatoryName} onChange={e => setSignatoryName(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="Enter full legal name" />
          </div>

          {/* Signature pad OR file upload */}
          {captureMode === 'signature' ? (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Signature</label>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={180}
                  className="w-full border-2 border-slate-200 rounded-xl touch-none bg-white cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
                {!hasSignature && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-300 pointer-events-none">Draw signature here</p>}
              </div>
              <button onClick={clearCanvas} className="mt-2 text-xs font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1"><X className="w-3 h-3" /> Clear signature</button>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Signed Consent Document</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors"
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-teal-600" />
                    <span className="text-sm font-medium text-slate-700">{file.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="ml-2 p-1 rounded hover:bg-slate-100">
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-medium">Click to upload a signed consent document</p>
                    <p className="text-xs text-slate-400 mt-0.5">PDF, JPG, JPEG, PNG</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          {/* Acknowledgment */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-400" />
            <span className="text-xs text-slate-600 leading-relaxed">I confirm that the information shown is accurate and I have disclosed any changes since my previous visit.</span>
          </label>

          <button onClick={saveConsent} disabled={saving || (captureMode === 'signature' ? !hasSignature : !file) || !acknowledged || !signatoryName.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saving ? 'Saving...' : captureMode === 'signature' ? 'Sign & Lock Record' : 'Upload & Lock Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Treatment Notes Modal ─────────────────────────────────────────────────────

function TreatmentNotesModal({ appt, userEmail, nurseUserId, nurseName, onClose, onSaved }: {
  appt: AppointmentRow;
  userEmail: string;
  nurseUserId: string | null;
  nurseName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [noteText, setNoteText] = useState('');
  const [adverseReaction, setAdverseReaction] = useState(false);
  const [reactionDetails, setReactionDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!noteText.trim()) { setError('Please enter a note.'); return; }
    if (!nurseUserId) { setError('Unable to identify your account. Please sign in again.'); return; }
    setSaving(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('client_treatment_notes').insert({
        client_id: appt.clients?.id ?? null,
        appointment_id: appt.id,
        nurse_user_id: nurseUserId,
        nurse_name: nurseName,
        note_text: noteText.trim(),
        adverse_reaction: adverseReaction,
        reaction_details: adverseReaction ? reactionDetails.trim() : null,
      });
      if (insertErr) {
        console.error('Treatment note save error:', insertErr);
        setError('Unable to save the treatment note. Please try again.');
        return;
      }
      onSaved();
    } catch (err) {
      console.error('Treatment note save exception:', err);
      setError('Unable to save the treatment note. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-teal-600" /><h3 className="text-base font-bold text-slate-800">Treatment Notes</h3></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-700 font-medium">{error}</p></div>}
          <div className="bg-slate-50 rounded-xl p-3"><p className="text-sm font-bold text-slate-700">{appt.clients?.full_name ?? 'Unknown'}</p><p className="text-xs text-slate-400">{appt.service} · {fmtDate(appt.scheduled_date)}</p></div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Note</label>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={5} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" placeholder="Enter treatment notes..." />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={adverseReaction} onChange={e => setAdverseReaction(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-400" />
            <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-red-500" /> Report adverse reaction</span>
          </label>
          {adverseReaction && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Reaction Details</label>
              <textarea value={reactionDetails} onChange={e => setReactionDetails(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" placeholder="Describe the adverse reaction..." />
            </div>
          )}
          <button onClick={save} disabled={saving || !noteText.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Save Note
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────

function QrModal({ title, appt, type, onClose }: { title: string; appt: AppointmentRow; type: 'feedback' | 'consent'; onClose: () => void }) {
  const baseUrl = window.location.origin;
  const link = type === 'feedback'
    ? `${baseUrl}/#feedback?src=qr&appointment_id=${appt.id}&client_id=${appt.clients?.id ?? ''}`
    : `${baseUrl}/#consent?form_type=consent&appointment_id=${appt.id}&client_id=${appt.clients?.id ?? ''}`;
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);

  function copyLink() {
    if (!link) { setQrError(true); return; }
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setQrError(true));
  }

  // Simple QR via public API (chart.googleapis is deprecated; use qr-server.com)
  const qrUrl = link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2"><QrCode className="w-5 h-5 text-teal-600" /><h3 className="text-base font-bold text-slate-800">{title}</h3></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-center">
          {qrError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-700 font-medium">Unable to generate the secure form link.</p></div>}
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl">
              <img src={qrUrl} alt="QR Code" width={200} height={200} className="rounded-lg" onError={() => setQrError(true)} />
            </div>
            <p className="text-xs text-slate-500">{appt.clients?.full_name ?? 'Unknown'} · {appt.service} · {fmtDate(appt.scheduled_date)}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
              <input readOnly value={link} className="flex-1 text-xs text-slate-500 bg-transparent outline-none truncate" />
              <button onClick={copyLink} className="text-teal-600 hover:text-teal-700 flex-shrink-0">{copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
            </div>
            <div className="flex gap-2">
              <a href={link} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"><Eye className="w-3.5 h-3.5" /> Open Form</a>
              <button onClick={onClose} className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors">Close</button>
            </div>
            <p className="text-[10px] text-slate-400">Scan with phone camera or copy the link to share with the client.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared UI Components ──────────────────────────────────────────────────────

// ─── Consent Preview Modal ───────────────────────────────────────────────────
// The consent list previously showed metadata only, so viewing an actual
// signature meant leaving the appointment for Client Management.

function ConsentPreviewModal({ record, onClose }: { record: ClientConsentRecord; onClose: () => void }) {
  async function download() {
    const url = await resolveSignatureUrl(record.signature_data);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `consent-${record.appointment_id ?? record.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="p-2 bg-teal-50 rounded-xl"><FileText className="w-5 h-5 text-teal-600" /></div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800">{record.form_type === 'waiver' ? 'Waiver' : 'Consent'} — {record.form_version}</h3>
            <p className="text-xs text-slate-400">{record.status}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DetailField icon={PenLine} label="Signatory" value={record.signatory_name} />
            <DetailField icon={Clock} label="Signed" value={record.signed_at ? fmtDateTime(record.signed_at) : null} />
            <DetailField icon={Droplets} label="Service" value={record.service} />
            <DetailField icon={QrCode} label="Method" value={record.submission_method} />
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Signature</p>
            {record.signature_data ? (
              <SignatureImage signatureData={record.signature_data}
                className="w-full max-h-56 border border-slate-200 rounded-xl bg-white object-contain p-3" />
            ) : (
              <p className="text-xs text-slate-300 italic">No signature image stored</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Close</button>
          {record.signature_data && (
            <button onClick={download} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors">
              <Download className="w-4 h-4" /> Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Availed Service Editor ──────────────────────────────────────────────────
// Sits below Consent & Waiver in the appointment detail screen so a nurse or
// assistant can correct the availed service on site. Locked once the
// appointment is completed or cancelled — at that point the service is part of
// the billing and inventory record and must not shift underneath it.

const SERVICE_LOCKED_STATUSES: AppointmentStatus[] = ['completed', 'cancelled'];

function ServiceEditor({ appt, canEdit, options, saving, onChange }: {
  appt: AppointmentRow;
  canEdit: boolean;
  options: { id: string; name: string; item_type: string }[];
  saving: boolean;
  onChange: (catalogItemId: string) => void;
}) {
  const locked = SERVICE_LOCKED_STATUSES.includes(appt.status);
  const current = appt.service ?? null;
  // Legacy rows carry free text with no catalog link, so nothing can be
  // deducted for them until the service is re-picked from the catalog.
  const unlinked = !appt.catalog_item_id && !!current;

  if (locked || !canEdit) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-800">{current ?? 'No service recorded'}</span>
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Lock className="w-3 h-3" />
          {locked
            ? `Service is locked once the appointment is ${appt.status}.`
            : 'You do not have permission to change the availed service.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <select
          value={appt.catalog_item_id ?? ''}
          disabled={saving}
          onChange={e => { if (e.target.value) onChange(e.target.value); }}
          className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all disabled:opacity-50"
        >
          <option value="">{current ? `${current} (not linked to catalog)` : 'Select a service'}</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {saving && <span className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</span>}
      </div>

      {unlinked && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>This service is free text from an older booking and is not linked to the catalog, so inventory cannot be deducted for it. Re-select it above to link it.</span>
        </p>
      )}

      <p className="text-[11px] text-slate-400">
        Changing the service updates what the client is billed and what is deducted from inventory.
      </p>
    </div>
  );
}

// ─── Inventory Deduction Status ──────────────────────────────────────────────
// Deduction happens in a database trigger at treatment start. Its problems used
// to be RAISE NOTICE only — invisible, so a treatment could consume nothing and
// nobody would know until a stock count disagreed. This surfaces them where the
// nurse can act on them.

function InventoryDeductionStatus({ appt }: { appt: AppointmentRow }) {
  const issues = appt.inventory_deduction_issues ?? [];
  const deducted = !!appt.inventory_deducted_at;
  const started = appt.status === 'in_treatment' || appt.status === 'completed';

  // Nothing to report until treatment has actually begun.
  if (!started) return null;

  if (issues.length > 0) {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
        <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Inventory was not fully deducted
        </p>
        <ul className="space-y-1">
          {issues.map((issue, i) => (
            <li key={i} className="text-xs text-amber-700 leading-relaxed">• {issue}</li>
          ))}
        </ul>
        <p className="text-[11px] text-amber-600 mt-2">Record the stock manually under Inventory, or correct the service above and it will retry.</p>
      </div>
    );
  }

  if (deducted) {
    return (
      <p className="mt-3 text-xs text-emerald-700 flex items-center gap-1.5">
        <CheckCircle className="w-3.5 h-3.5" />
        Inventory deducted at treatment start.
      </p>
    );
  }

  return (
    <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
      <AlertTriangle className="w-3.5 h-3.5" />
      No inventory has been deducted for this appointment.
    </p>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</p><div className="bg-slate-50 rounded-2xl p-5">{children}</div></div>;
}

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  return <div><p className="text-xs text-slate-400 font-medium mb-0.5 flex items-center gap-1.5"><Icon className="w-3 h-3" /> {label}</p><p className="text-sm text-slate-800 font-semibold">{value}</p></div>;
}

function HealthFlag({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  if (!value) return null;
  const isYes = value.toLowerCase().startsWith('yes') || value.toLowerCase() === 'yes';
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${isYes ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isYes ? 'text-rose-500' : 'text-slate-400'}`} />
      <div><p className={`text-xs font-bold ${isYes ? 'text-rose-700' : 'text-slate-600'}`}>{label}</p><p className={`text-sm ${isYes ? 'text-rose-600' : 'text-slate-600'}`}>{value}</p></div>
    </div>
  );
}

function WarningBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold bg-red-50 text-red-700 border-red-200"><Icon className="w-3.5 h-3.5" /> {label}</span>;
}

function NurseWorkflowTimeline({ booking, appt, memberLookup, currentNurseName, collections, feedbackStatus }: { booking: ClientBooking | null; appt: AppointmentRow; memberLookup: MemberLookup; currentNurseName: string; collections: NurseCollection[]; feedbackStatus: FeedbackStatus }) {
  const stage = getWfStage(booking ?? {} as ClientBooking, appt as unknown as WfAppointment);
  const cfg = WF_STAGE_CFG[stage];
  const stageIdx = stage === 'cancelled' ? 0 : WF_STAGE_ORDER.indexOf(stage);
  const progress = stage === 'cancelled' ? 0 : Math.round((stageIdx / (WF_STAGE_ORDER.length - 1)) * 100);

  const doneKeys = new Set<string>();
  if (booking) {
    doneKeys.add('submitted');
    if (booking.confirmed_at || booking.status !== 'NEW') doneKeys.add('confirmed');
  }
  if (appt) {
    doneKeys.add('appt');
    doneKeys.add('scheduled');
    if (appt.dispatched_at) doneKeys.add('dispatched');
    if (appt.arrived_at) doneKeys.add('arrived');
    if (appt.treatment_started_at) doneKeys.add('treatment');
    if (appt.completed_at) doneKeys.add('completed');
    if (appt.payment_recorded_at || appt.payment_status !== 'pending') doneKeys.add('payment');
  }

  const apptCollection = collections.find(c => c.appointment_id === appt.id && c.status !== 'cancelled' && c.status !== 'rejected');

  type MetaRow = { label: string; value: string };
  type Milestone = { key: string; label: string; ts: string | null; displayTs?: string; icon: React.ElementType; meta?: MetaRow[] };

  const milestones: Milestone[] = [
    {
      key: 'submitted', label: 'Booking Submitted', ts: booking?.created_at ?? appt.created_at, icon: FileText,
      meta: booking ? [
        { label: 'Source', value: booking.source ?? 'Web' },
        { label: 'Services', value: (booking.services_requested ?? []).join(', ') || '—' },
      ] : undefined,
    },
    {
      key: 'confirmed', label: 'Booking Confirmed', ts: booking?.confirmed_at ?? (booking && booking.status !== 'NEW' ? booking.created_at : null), icon: CheckCircle,
      meta: booking ? [{ label: 'Status', value: booking.status }] : undefined,
    },
    {
      key: 'appt', label: 'Appointment Created', ts: appt.created_at ?? null, icon: Calendar,
      meta: [
        { label: 'Created by', value: appt.created_by_email ?? 'System' },
        { label: 'Branch', value: appt.branches?.name ?? '—' },
      ],
    },
    {
      key: 'scheduled', label: 'Service Scheduled',
      ts: appt ? `${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00` : null,
      displayTs: appt
        ? new Date(`${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        : undefined,
      icon: Clock,
      meta: [
        { label: 'Service', value: appt.service ?? '—' },
        { label: 'Location', value: appt.location ?? booking?.preferred_location ?? '—' },
        ...(booking?.pax ? [{ label: 'Pax', value: String(booking.pax) }] : []),
      ],
    },
    {
      key: 'dispatched', label: 'Team Dispatched', ts: appt?.dispatched_at ?? null, icon: Truck,
      meta: [
        { label: 'Driver', value: appt.driver_name ?? '—' },
        { label: 'Vehicle', value: appt.vehicle ?? '—' },
      ],
    },
    {
      key: 'arrived', label: 'Team Arrived', ts: appt?.arrived_at ?? null, icon: MapPin,
      meta: [
        { label: 'Nurse', value: appt.nurse_name ?? currentNurseName },
        { label: 'Location', value: appt.location ?? booking?.preferred_location ?? appt.branches?.name ?? '—' },
      ],
    },
    {
      key: 'treatment', label: 'Treatment Started', ts: appt?.treatment_started_at ?? null, icon: Activity,
      meta: [
        { label: 'Nurse', value: appt.nurse_name ?? currentNurseName },
        { label: 'Assistant', value: appt.assistant_name ?? '—' },
      ],
    },
    {
      key: 'completed', label: 'Service Completed', ts: appt?.completed_at ?? null, icon: CheckCircle,
      meta: [{ label: 'Nurse', value: appt.nurse_name ?? currentNurseName }],
    },
    {
      key: 'payment', label: 'Payment Recorded', ts: appt?.payment_recorded_at ?? null, icon: CreditCard,
      meta: [
        { label: 'Method', value: appt.payment_method ?? apptCollection?.payment_method ?? '—' },
        { label: 'Status', value: appt.payment_status },
        { label: 'Recorded by', value: apptCollection?.collected_by_email ?? appt.created_by_email ?? '—' },
      ],
    },
  ];

  return (
    <div>
      {/* Overall stage + progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${cfg.bg} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          {stage !== 'cancelled' && (
            <span className="text-xs text-slate-400">Stage {stageIdx + 1} of {WF_STAGE_ORDER.length}</span>
          )}
        </div>
        {stage !== 'cancelled' && (
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Timeline */}
      <div>
        {milestones.map((m, i) => {
          const Icon = m.icon;
          const isDone = doneKeys.has(m.key);
          const nextDone = milestones.slice(i + 1).find(n => doneKeys.has(n.key));
          const dur = m.key !== 'scheduled' ? wfDuration(m.ts, nextDone?.ts ?? null) : null;
          const isLast = i === milestones.length - 1;
          return (
            <div key={m.key} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0 w-8">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 flex-shrink-0 ${isDone ? 'bg-teal-600 border-teal-600' : 'bg-white border-slate-200'}`}>
                  <Icon className={`w-3.5 h-3.5 ${isDone ? 'text-white' : 'text-slate-300'}`} />
                </div>
                {!isLast && (
                  <div className={`w-px flex-1 mt-1 ${isDone ? 'bg-teal-200' : 'bg-slate-100'}`} style={{ minHeight: 20 }} />
                )}
              </div>
              <div className="pb-4 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold leading-tight ${isDone ? 'text-slate-800' : 'text-slate-300'}`}>{m.label}</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${isDone ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'}`}>
                    {isDone ? 'Done' : 'Pending'}
                  </span>
                </div>
                {m.ts ? (
                  <p className="text-xs text-slate-400 mt-0.5">{m.displayTs ?? wfFmtTs(m.ts)}</p>
                ) : (
                  <p className="text-xs text-slate-300 mt-0.5 italic">Pending</p>
                )}
                {m.meta && isDone && m.meta.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {m.meta.map((row, mi) => (
                      <div key={mi} className="flex items-baseline gap-1.5 text-xs">
                        <span className="text-slate-400 font-medium">{row.label}:</span>
                        <span className="text-slate-600 font-semibold truncate">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {dur && (
                  <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                    +{dur} to next stage
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feedback status card */}
      <div className="mt-2 p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-100">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Feedback</p>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Status</span>
          <span className={`font-semibold capitalize ${feedbackStatus === 'completed' ? 'text-emerald-600' : feedbackStatus === 'sent' || feedbackStatus === 'opened' ? 'text-blue-600' : 'text-amber-600'}`}>
            {feedbackStatus === 'not_sent' ? 'Not Sent' : feedbackStatus}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Email Sent At</span>
          <span className="text-slate-700 font-medium">{appt.feedback_email_sent_at ? wfFmtTs(appt.feedback_email_sent_at) : '—'}</span>
        </div>
      </div>
    </div>
  );
}
