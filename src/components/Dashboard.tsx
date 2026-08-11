import React, { useState, useEffect, useCallback } from 'react';

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DashboardErrorBoundary]', error, info);
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-5">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1.5">Team Dashboard could not be loaded</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md">
            An unexpected error occurred while rendering this module. Try again, or return to the overview.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={this.handleReset} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
            <button onClick={() => { this.handleReset(); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
              <LayoutDashboard className="w-4 h-4" /> Return to Overview
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  RefreshCw,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  AlertCircle,
  ChevronDown,
  X,
  Loader2,
  ClipboardList,
  Stethoscope,
  StickyNote,
  TrendingUp,
  Users,
  BadgeCheck,
  Hourglass,
  MessageSquare,
  Star,
  ThumbsUp,
  BarChart3,
  Mail,
  Phone,
  MapPin,
  HeartPulse,
  Eye,
  Trash2,
  LogOut,
  Lock,
  ShieldAlert,
  CheckCircle,
  ShieldCheck,
  UserCheck,
  UserX,
  Crown,
  Activity,
  FlaskConical,
  QrCode,
  Copy,
  Download,
  ExternalLink,
  Tag,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Globe,
  Settings2,
  DollarSign,
  TrendingDown,
  Wallet,
  Receipt,
  ArrowUpCircle,
  ArrowDownCircle,
  PlusCircle,
  Package,
  FileText,
  CalendarCheck,
  CalendarPlus,
  Truck,
  CreditCard,
  ArrowLeft,
  Contact,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Boxes,
  Bug,
  Lightbulb,
} from 'lucide-react';
import { supabase, type ClientBooking, type ClientFeedback, type BookingStatus, type TeamMember, type QrSource, type FinanceTransaction, type Branch, type RoleKey, type PermissionKey, ROLES, INCOME_CATEGORIES, EXPENSE_CATEGORIES, memberDisplayName, resolveMemberName, buildMemberLookup, type MemberLookup } from '../lib/supabase';
import OperationsTab, { AppointmentDetailPage, type AppointmentRow } from './OperationsTab';
import BillingTab from './BillingTab';
import ReportsTab from './ReportsTab';
import AttendanceTab from './AttendanceTab';
import InventoryTab from './InventoryTab';
import ProductsPackagesTab from './ProductsPackagesTab';
import DocumentsTab from './DocumentsTab';
import SettingsTab from './SettingsTab';
import BookingToAppointmentModal from './BookingToAppointmentModal';
import ManualEntryModal from './ManualEntryModal';
import NurseDashboardTab from './NurseDashboardTab';
import NurseAssistantDashboardTab from './NurseAssistantDashboardTab';
import ClientManagementTab from './ClientManagementTab';
import AdminRemittanceReview from './AdminRemittanceReview';
import FinancialRecording from './FinancialRecording';
import ExecutiveFinanceCenter from './ExecutiveFinanceCenter';
import ConsultationRequestsTab from './ConsultationRequestsTab';
import HeadOfClinicalOperationsDashboard from './HeadOfClinicalOperationsDashboard';
import { loadUnifiedClientProfileFromBooking, loadUnifiedClientProfileFromAppointment, type UnifiedClientProfile } from '../lib/clientProfile';
import { ClientProfileInformationSection } from './ClientProfileSections';
import OperationsOverview from './OperationsOverview';
import BugTrack from './BugTrack';
import Wishlist from './Wishlist';

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; bg: string; dot: string }> = {
  NEW: { label: 'New', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  CONFIRMED: { label: 'Confirmed', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  CANCELLED: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
};

const TYPE_CONFIG: Record<string, {
  label: string; accent: string; bg: string; text: string; dot: string;
  cardBorder: string; qrBorder: string; qrFg: string; qrBg: string;
}> = {
  branch:       { label: 'Branch',       accent: 'bg-gradient-to-r from-teal-400 to-cyan-400',   bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-400',   cardBorder: 'border-teal-100',   qrBorder: 'border-teal-100 bg-teal-50/40',   qrFg: '0F766E', qrBg: 'F0FDFA' },
  event:        { label: 'Event',        accent: 'bg-gradient-to-r from-violet-400 to-purple-400', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-400', cardBorder: 'border-violet-100', qrBorder: 'border-violet-100 bg-violet-50/40', qrFg: '7C3AED', qrBg: 'F5F3FF' },
  social_media: { label: 'Social Media', accent: 'bg-gradient-to-r from-pink-400 to-rose-400',   bg: 'bg-pink-50',   text: 'text-pink-700',   dot: 'bg-pink-400',   cardBorder: 'border-pink-100',   qrBorder: 'border-pink-100 bg-pink-50/40',   qrFg: 'DB2777', qrBg: 'FDF2F8' },
  partner:      { label: 'Partner',      accent: 'bg-gradient-to-r from-amber-400 to-orange-400', bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400',  cardBorder: 'border-amber-100',  qrBorder: 'border-amber-100 bg-amber-50/40',  qrFg: 'D97706', qrBg: 'FFFBEB' },
  walkin:       { label: 'Walk-in',      accent: 'bg-gradient-to-r from-blue-400 to-sky-400',    bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400',   cardBorder: 'border-blue-100',   qrBorder: 'border-blue-100 bg-blue-50/40',   qrFg: '1D4ED8', qrBg: 'EFF6FF' },
  other:        { label: 'Other',        accent: 'bg-gradient-to-r from-slate-400 to-slate-500', bg: 'bg-slate-100', text: 'text-slate-600',  dot: 'bg-slate-400',  cardBorder: 'border-slate-200',  qrBorder: 'border-slate-200 bg-slate-50',    qrFg: '475569', qrBg: 'F8FAFC' },
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatTs(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-200'}`} />
      ))}
      <span className="ml-1.5 text-xs font-bold text-slate-600">{value}/5</span>
    </div>
  );
}

// ─── Detail field helper ─────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 font-semibold">{value}</p>
    </div>
  );
}

// ─── Notes Modal ────────────────────────────────────────────────────────────

function NotesModal({ booking, onClose, onSaved }: { booking: ClientBooking; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await supabase.from('client_bookings').update({ notes }).eq('id', booking.id);
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800 text-lg">Internal Notes</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">Client: <span className="font-semibold text-slate-700">{booking.full_name}</span></p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add internal notes..." rows={5}
          className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
        <div className="flex gap-3 mt-5">
          <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Notes
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Workflow Panel ───────────────────────────────────────────────────────────

export interface WfAppointment {
  id: string;
  created_at: string;
  scheduled_date: string;
  scheduled_time: string;
  service: string | null;
  status: string;
  dispatched_at: string | null;
  arrived_at: string | null;
  treatment_started_at: string | null;
  completed_at: string | null;
  payment_recorded_at: string | null;
  payment_status: string;
  clients: { full_name: string; email: string | null; phone: string | null } | null;
  branches: { name: string } | null;
}

export type WfStage = 'submitted' | 'confirmed' | 'scheduled' | 'dispatched' | 'in_treatment' | 'completed' | 'paid' | 'cancelled';

export const WF_STAGE_CFG: Record<WfStage, { label: string; color: string; bg: string; dot: string }> = {
  submitted:    { label: 'Booking Received',  color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200',       dot: 'bg-sky-500' },
  confirmed:    { label: 'Confirmed',         color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  scheduled:    { label: 'Scheduled',         color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500' },
  dispatched:   { label: 'Dispatched',        color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  in_treatment: { label: 'In Progress',       color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500' },
  completed:    { label: 'Completed',         color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  paid:         { label: 'Paid',              color: 'text-green-700',   bg: 'bg-green-50 border-green-200',   dot: 'bg-green-500' },
  cancelled:    { label: 'Cancelled',         color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       dot: 'bg-red-500' },
};

export const WF_STAGE_ORDER: WfStage[] = ['submitted', 'confirmed', 'scheduled', 'dispatched', 'in_treatment', 'completed', 'paid'];

export function wfDuration(a: string | null, b: string | null): string | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

export function wfFmtTs(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function getWfStage(booking: ClientBooking, appt: WfAppointment | null): WfStage {
  if (booking.status === 'CANCELLED') return 'cancelled';
  if (!appt) return booking.status === 'CONFIRMED' ? 'confirmed' : 'submitted';
  if (appt.payment_recorded_at || appt.payment_status !== 'pending') return 'paid';
  if (appt.status === 'completed') return 'completed';
  if (appt.status === 'in_treatment') return 'in_treatment';
  if (appt.status === 'dispatched' || appt.status === 'arrived') return 'dispatched';
  return 'scheduled';
}

function WorkflowPanel({ booking }: { booking: ClientBooking }) {
  const [appt, setAppt] = useState<WfAppointment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('appointments')
      .select('id, created_at, scheduled_date, scheduled_time, service, status, dispatched_at, arrived_at, treatment_started_at, completed_at, payment_recorded_at, payment_status, clients(full_name, email, phone), branches(name)')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        setAppt((data?.[0] ?? null) as WfAppointment | null);
        setLoading(false);
      });
  }, [booking.id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
      </div>
    );
  }

  const stage = getWfStage(booking, appt);
  const cfg = WF_STAGE_CFG[stage];
  const stageIdx = stage === 'cancelled' ? 0 : WF_STAGE_ORDER.indexOf(stage);
  const progress = stage === 'cancelled' ? 0 : Math.round((stageIdx / (WF_STAGE_ORDER.length - 1)) * 100);

  const doneKeys = new Set<string>(['submitted']);
  if (booking.confirmed_at || booking.status !== 'NEW') doneKeys.add('confirmed');
  if (appt) {
    doneKeys.add('appt');
    doneKeys.add('scheduled');
    if (appt.dispatched_at) doneKeys.add('dispatched');
    if (appt.arrived_at) doneKeys.add('arrived');
    if (appt.treatment_started_at) doneKeys.add('treatment');
    if (appt.completed_at) doneKeys.add('completed');
    if (appt.payment_recorded_at || appt.payment_status !== 'pending') doneKeys.add('payment');
  }

  const milestones: { key: string; label: string; ts: string | null; displayTs?: string; icon: React.ElementType }[] = [
    { key: 'submitted',  label: 'Booking Submitted',   ts: booking.created_at, icon: FileText },
    { key: 'confirmed',  label: 'Booking Confirmed',   ts: booking.confirmed_at ?? (booking.status !== 'NEW' ? booking.created_at : null), icon: CheckCircle },
    { key: 'appt',       label: 'Appointment Created', ts: appt?.created_at ?? null, icon: Calendar },
    {
      key: 'scheduled', label: 'Service Scheduled',
      ts: appt ? `${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00` : null,
      displayTs: appt
        ? new Date(`${appt.scheduled_date}T${appt.scheduled_time.slice(0, 5)}:00`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        : undefined,
      icon: Clock,
    },
    { key: 'dispatched', label: 'Team Dispatched',     ts: appt?.dispatched_at ?? null, icon: Truck },
    { key: 'arrived',    label: 'Team Arrived',        ts: appt?.arrived_at ?? null, icon: MapPin },
    { key: 'treatment',  label: 'Treatment Started',   ts: appt?.treatment_started_at ?? null, icon: Activity },
    { key: 'completed',  label: 'Service Completed',   ts: appt?.completed_at ?? null, icon: CheckCircle },
    { key: 'payment',    label: 'Payment Recorded',    ts: appt?.payment_recorded_at ?? null, icon: CreditCard },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-7 py-5">
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
                <p className={`text-sm font-semibold leading-tight ${isDone ? 'text-slate-800' : 'text-slate-300'}`}>{m.label}</p>
                {m.ts ? (
                  <p className="text-xs text-slate-400 mt-0.5">{m.displayTs ?? wfFmtTs(m.ts)}</p>
                ) : (
                  <p className="text-xs text-slate-300 mt-0.5 italic">Pending</p>
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

      {/* Appointment info card */}
      {appt ? (
        <div className="mt-2 p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Appointment Info</p>
          {appt.service && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Service</span>
              <span className="text-slate-700 font-medium">{appt.service}</span>
            </div>
          )}
          {appt.branches?.name && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Branch</span>
              <span className="text-slate-700">{appt.branches.name}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Payment</span>
            <span className={`font-semibold capitalize ${appt.payment_status === 'paid' ? 'text-emerald-600' : appt.payment_status === 'partial' ? 'text-blue-600' : 'text-amber-600'}`}>
              {appt.payment_status}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-2 p-4 bg-slate-50 rounded-xl border border-slate-100 text-center">
          <p className="text-xs text-slate-400">No appointment linked to this booking yet.</p>
        </div>
      )}
    </div>
  );
}

// ─── Booking Detail Page ─────────────────────────────────────────────────────

function BookingDetailPage({ booking, onBack, canViewSensitive }: { booking: ClientBooking; onBack: () => void; canViewSensitive?: boolean }) {
  const [unifiedProfile, setUnifiedProfile] = useState<UnifiedClientProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfileLoading(true);
    loadUnifiedClientProfileFromBooking(booking).then(p => {
      if (!cancelled) { setUnifiedProfile(p); setProfileLoading(false); }
    });
    return () => { cancelled = true; };
  }, [booking.id]);
  const cfg = STATUS_CONFIG[booking.status];

  function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</p>
        <div className="bg-slate-50 rounded-2xl p-5">{children}</div>
      </div>
    );
  }

  const hasHealth = booking.weight || booking.is_pregnant_breastfeeding || booking.pre_existing_condition ||
    (booking.family_history && booking.family_history.length > 0) || booking.taking_medications ||
    booking.has_allergies || booking.bleeding_disorders;

  const hasLifestyle = booking.water_intake || booking.exercise_frequency || booking.alcohol_consumption || booking.smoking_vaping;

  return (
    <div className="bg-slate-50 -mx-8 -mt-8">
      {/* Page header */}
      <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bookings
        </button>
        <div className="h-5 w-px bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Client Intake Details</p>
          <h2 className="text-base font-bold text-slate-900 truncate">{booking.full_name}</h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="text-xs text-slate-400 hidden sm:block">Submitted {formatTs(booking.created_at)}</p>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] border-b border-slate-200">
        <div className="px-8 py-2.5 border-r border-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Details</p>
        </div>
        <div className="px-8 py-2.5 hidden lg:block">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Workflow</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px]">

        {/* Left: Client Details */}
        <div className="bg-white border-r border-slate-200 p-8 space-y-7 min-h-[calc(100vh-180px)]">

          <SectionBlock title="Personal Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <DetailField label="Full Name" value={booking.full_name} />
              <DetailField label="Email Address" value={booking.email} />
              <DetailField label="Phone Number" value={booking.cellphone} />
              <DetailField label="Age" value={booking.age != null ? String(booking.age) : null} />
              <DetailField label="Gender" value={booking.gender} />
              <DetailField label="Birthday" value={booking.date_of_birth ? formatDate(booking.date_of_birth) : null} />
              {booking.source && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-1">Booking Source</p>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-lg text-xs font-bold text-teal-700">
                    <Tag className="w-3.5 h-3.5" />{booking.source}
                  </span>
                </div>
              )}
              <div className="sm:col-span-2">
                <DetailField label="Address" value={booking.address} />
              </div>
            </div>
          </SectionBlock>

          {(booking.emergency_contact_name || booking.emergency_contact_number) && (
            <SectionBlock title="Emergency Contact">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                <DetailField label="Contact Person" value={booking.emergency_contact_name} />
                <DetailField label="Contact Number" value={booking.emergency_contact_number} />
              </div>
            </SectionBlock>
          )}

          <SectionBlock title="Appointment Details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <DetailField label="Preferred Date" value={formatDate(booking.preferred_date)} />
                <DetailField label="Preferred Time" value={formatTime(booking.preferred_time)} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">Services Requested</p>
                <div className="flex flex-wrap gap-2">
                  {booking.services_requested.map(s => (
                    <span key={s} className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-lg border border-teal-100">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </SectionBlock>

          {hasHealth && (
            <SectionBlock title="Medical & Health Disclosure">
              <div className="space-y-4">
                {booking.weight && <DetailField label="Weight" value={booking.weight} />}
                {booking.is_pregnant_breastfeeding && (
                  <DetailField label="Pregnant / Breastfeeding" value={booking.is_pregnant_breastfeeding} />
                )}
                {booking.pre_existing_condition && (
                  <DetailField label="Pre-existing Condition" value={booking.pre_existing_condition} />
                )}
                {booking.family_history && booking.family_history.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Family History</p>
                    <div className="flex flex-wrap gap-2">
                      {booking.family_history.map(h => (
                        <span key={h} className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${h === 'NONE' ? 'bg-white text-slate-500 border-slate-200' : 'bg-violet-50 text-violet-700 border-violet-100'}`}>{h}</span>
                      ))}
                    </div>
                  </div>
                )}
                {booking.taking_medications && (
                  <DetailField label="Medications / Supplements" value={booking.taking_medications} />
                )}
                {booking.has_allergies && (
                  <DetailField label="Allergies" value={booking.has_allergies} />
                )}
                {booking.bleeding_disorders && (
                  <DetailField label="Bleeding Disorders / Blood Thinners" value={booking.bleeding_disorders} />
                )}
              </div>
            </SectionBlock>
          )}

          {hasLifestyle && (
            <SectionBlock title="Lifestyle">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {booking.water_intake && <DetailField label="Water Intake / Day" value={booking.water_intake} />}
                {booking.exercise_frequency && <DetailField label="Exercise Frequency" value={booking.exercise_frequency} />}
                {booking.alcohol_consumption && <DetailField label="Alcohol Consumption" value={booking.alcohol_consumption} />}
                {booking.smoking_vaping && <DetailField label="Smoking / Vaping" value={booking.smoking_vaping} />}
              </div>
            </SectionBlock>
          )}

          {booking.consent_given != null && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-emerald-700">
                {booking.consent_given ? 'Client has acknowledged and signed all treatment consent items.' : 'Consent not yet provided.'}
              </span>
            </div>
          )}

          {booking.notes && (
            <SectionBlock title="Internal Notes">
              <p className="text-sm text-slate-700 leading-relaxed">{booking.notes}</p>
            </SectionBlock>
          )}

          {/* Client Profile Information (master client + profile, with booking fallback) */}
          {profileLoading ? (
            <SectionBlock title="Client Profile Information">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading client profile…
              </div>
            </SectionBlock>
          ) : unifiedProfile ? (
            <ClientProfileInformationSection profile={unifiedProfile} showSensitive={canViewSensitive} variant="compact" />
          ) : null}

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-300 font-medium">Booking ID: {booking.id}</p>
          </div>
        </div>

        {/* Right: Workflow */}
        <div className="bg-white">
          <WorkflowPanel booking={booking} />
        </div>

      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ────────────────────────────────────────────────────

function DeleteBookingModal({
  booking,
  userEmail,
  onClose,
  onDeleted,
}: {
  booking: ClientBooking;
  userEmail: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!password) { setError('Password is required.'); return; }
    setProcessing(true);
    setError(null);

    // Re-authenticate to verify identity before destructive action
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: userEmail, password });
    if (authErr) {
      setProcessing(false);
      setError('Incorrect password. Please try again.');
      return;
    }

    const { error: dbErr } = await supabase.from('client_bookings').delete().eq('id', booking.id);
    setProcessing(false);
    if (dbErr) {
      setError('Failed to delete the record. Please try again.');
      return;
    }

    onDeleted(booking.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        {/* Warning icon */}
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Delete Booking</h3>
        <p className="text-sm text-slate-500 text-center mb-1 leading-relaxed">
          You are about to permanently delete the booking for
        </p>
        <p className="text-base font-bold text-slate-800 text-center mb-5">"{booking.full_name}"</p>
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-red-600 font-medium text-center leading-relaxed">
            This action cannot be undone. All intake data for this client will be permanently removed.
          </p>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Enter your password to confirm
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                autoFocus
                value={password}
                placeholder="Your account password"
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent text-slate-700 placeholder-slate-300"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing || !password}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {processing ? 'Verifying...' : 'Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Bookings Tab ─────────────────────────────────────────────────────────────

function BookingsTab({ userEmail, canViewSensitive, canManage = true }: { userEmail: string; canViewSensitive?: boolean; canManage?: boolean }) {
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<BookingStatus | 'ALL'>('ALL');
  const [notesTarget, setNotesTarget] = useState<ClientBooking | null>(null);
  const [detailTarget, setDetailTarget] = useState<ClientBooking | null>(null);
  const [linkedAppt, setLinkedAppt] = useState<AppointmentRow | null>(null);
  const [loadingLinkedAppt, setLoadingLinkedAppt] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientBooking | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingApptBooking, setPendingApptBooking] = useState<ClientBooking | null>(null);
  const [bookedBookingIds, setBookedBookingIds] = useState<Set<string>>(new Set());
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientBooking | null>(null);
  const [memberLookup, setMemberLookup] = useState<Record<string, TeamMember>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [bookingsRes, apptRes, membersRes] = await Promise.all([
      supabase.from('client_bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('appointments').select('booking_id').not('booking_id', 'is', null),
      supabase.from('team_members').select('*').eq('status', 'approved'),
    ]);
    if (bookingsRes.error) setError('Failed to load bookings.');
    else setBookings(bookingsRes.data ?? []);
    setBookedBookingIds(new Set((apptRes.data ?? []).map(a => a.booking_id as string)));
    const lookup: Record<string, TeamMember> = {};
    (membersRes.data ?? []).forEach((m: TeamMember) => { lookup[m.user_id] = m; });
    setMemberLookup(lookup);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!detailTarget) { setLinkedAppt(null); return; }
    setLoadingLinkedAppt(true);
    setLinkedAppt(null);
    supabase
      .from('appointments')
      .select('*, clients(id, full_name, email, phone), branches(id, name)')
      .eq('booking_id', detailTarget.id)
      .maybeSingle()
      .then(({ data }) => {
        setLinkedAppt((data as AppointmentRow) ?? null);
        setLoadingLinkedAppt(false);
      });
  }, [detailTarget?.id]);

  async function updateStatus(id: string, status: BookingStatus) {
    setUpdatingId(id);
    const { error: dbErr } = await supabase.from('client_bookings').update({ status }).eq('id', id);
    if (!dbErr) setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
    setUpdatingId(null);
  }

  async function handleConfirmBooking(booking: ClientBooking) {
    // Prevent duplicate confirmation emails when re-confirming an already-confirmed booking
    const wasAlreadyConfirmed = booking.status === 'CONFIRMED';
    setUpdatingId(booking.id);
    const now = new Date().toISOString();
    const { error: dbErr } = await supabase.from('client_bookings').update({ status: 'CONFIRMED', confirmed_at: now }).eq('id', booking.id);
    if (!dbErr) {
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'CONFIRMED', confirmed_at: now } : b));
      setPendingApptBooking(booking);

      // Send confirmation email to the client (only on first confirmation, not re-confirmations)
      if (!wasAlreadyConfirmed) {
        // Resolve recipient email: prefer booking.email, fall back to client record
        let recipientEmail = booking.email;
        if (!recipientEmail && booking.client_id) {
          const { data: clientRow } = await supabase
            .from('clients')
            .select('email')
            .eq('id', booking.client_id)
            .maybeSingle();
          recipientEmail = clientRow?.email ?? null;
        }

        if (recipientEmail) {
          const nurseName = booking.assigned_nurse_id
            ? memberDisplayName(memberLookup[booking.assigned_nurse_id])
            : 'To be assigned';
          const intakeFormLink = `${window.location.origin}/#booking`;
          const emailBody = {
            type: 'booking_confirmation',
            to: [recipientEmail],
            data: {
              client_name: booking.full_name,
              service_name: booking.services_requested?.length ? booking.services_requested.join(', ') : '—',
              appointment_date: booking.preferred_date ?? '—',
              appointment_time: booking.preferred_time ? String(booking.preferred_time) : '—',
              service_location: booking.preferred_location ?? '—',
              nurse_name: nurseName,
              intake_form_link: intakeFormLink,
            },
          };
          // Fire-and-forget: email failure must not roll back the booking confirmation
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailBody),
          }).catch((e) => console.error('[Booking Confirmation Email] Failed to send:', e));
        } else {
          console.warn('[Booking Confirmation Email] Skipped: no email address on booking or client record for', booking.id);
        }
      }

      // Create in-app notification for the assigned nurse (unique constraint prevents duplicates)
      if (booking.assigned_nurse_id) {
        const services = booking.services_requested?.length ? booking.services_requested.join(', ') : null;
        const message = `New confirmed booking for ${booking.full_name}${services ? ` — ${services}` : ''}${booking.preferred_date ? ` on ${booking.preferred_date}` : ''}${booking.preferred_time ? ` at ${booking.preferred_time}` : ''}.`;
        const { data: notifData, error: notifErr } = await supabase.from('nurse_notifications').insert({
          recipient_user_id: booking.assigned_nurse_id,
          booking_id: booking.id,
          client_name: booking.full_name,
          booking_ref: booking.id.slice(0, 8),
          service: services,
          appointment_date: booking.preferred_date ?? null,
          appointment_time: booking.preferred_time ? String(booking.preferred_time) : null,
          service_location: booking.preferred_location ?? null,
          message,
          event_type: 'booking_confirmed',
          status: 'unread',
        }).select().single();

        // If insert succeeded (not a duplicate), create delivery records linked to the notification
        if (!notifErr && notifData) {
          const nowIso = new Date().toISOString();
          await supabase.from('notification_deliveries').insert([
            { notification_id: notifData.id, channel: 'in_app', status: 'sent', sent_at: nowIso },
            { notification_id: notifData.id, channel: 'email', status: 'pending' },
            { notification_id: notifData.id, channel: 'sms', status: 'not_configured' },
            { notification_id: notifData.id, channel: 'push', status: 'not_configured' },
          ]);
        }
      }

      // Create in-app notification for the assigned nurse assistant
      if (booking.assigned_nurse_assistant_id) {
        const services = booking.services_requested?.length ? booking.services_requested.join(', ') : null;
        const astMessage = `New confirmed booking for ${booking.full_name}${services ? ` — ${services}` : ''}${booking.preferred_date ? ` on ${booking.preferred_date}` : ''}${booking.preferred_time ? ` at ${booking.preferred_time}` : ''}.`;
        const { data: astNotifData, error: astNotifErr } = await supabase.from('nurse_notifications').insert({
          recipient_user_id: booking.assigned_nurse_assistant_id,
          booking_id: booking.id,
          client_name: booking.full_name,
          booking_ref: booking.id.slice(0, 8),
          service: services,
          appointment_date: booking.preferred_date ?? null,
          appointment_time: booking.preferred_time ? String(booking.preferred_time) : null,
          service_location: booking.preferred_location ?? null,
          message: astMessage,
          event_type: 'booking_confirmed',
          status: 'unread',
        }).select().single();

        if (!astNotifErr && astNotifData) {
          const nowIso = new Date().toISOString();
          await supabase.from('notification_deliveries').insert([
            { notification_id: astNotifData.id, channel: 'in_app', status: 'sent', sent_at: nowIso },
            { notification_id: astNotifData.id, channel: 'email', status: 'pending' },
            { notification_id: astNotifData.id, channel: 'sms', status: 'not_configured' },
            { notification_id: astNotifData.id, channel: 'push', status: 'not_configured' },
          ]);
        }
      }
    }
    setUpdatingId(null);
  }

  function handleDeleted(id: string) {
    setBookings(prev => prev.filter(b => b.id !== id));
    setSuccessMsg('Booking deleted successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  const filtered = bookings.filter(b =>
    b.full_name.toLowerCase().includes(search.toLowerCase()) &&
    (filterStatus === 'ALL' || b.status === filterStatus)
  );

  if (detailTarget) {
    if (loadingLinkedAppt) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      );
    }
    if (linkedAppt) {
      return (
        <AppointmentDetailPage
          appt={linkedAppt}
          onBack={() => { setDetailTarget(null); setLinkedAppt(null); }}
          backLabel="Back to Bookings"
          onPaymentRecorded={(updated) => setLinkedAppt(updated)}
          canViewSensitive={canViewSensitive}
        />
      );
    }
    return <BookingDetailPage booking={detailTarget} onBack={() => setDetailTarget(null)} canViewSensitive={canViewSensitive} />;
  }

  const stats = {
    total: bookings.length,
    newCount: bookings.filter(b => b.status === 'NEW').length,
    confirmed: bookings.filter(b => b.status === 'CONFIRMED').length,
    cancelled: bookings.filter(b => b.status === 'CANCELLED').length,
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Bookings', value: stats.total, icon: Users, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'New Requests', value: stats.newCount, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Confirmed', value: stats.confirmed, icon: BadgeCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Cancelled', value: stats.cancelled, icon: Hourglass, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by client name..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700" />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as BookingStatus | 'ALL')}
            className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none text-slate-700 cursor-pointer">
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button onClick={() => setShowManualEntry(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Manual Entry
        </button>
      </div>

      {showManualEntry && (
        <ManualEntryModal
          onClose={() => setShowManualEntry(false)}
          onSaved={() => {
            load();
            setSuccessMsg('Manual booking created successfully.');
            setTimeout(() => setSuccessMsg(null), 4000);
          }}
        />
      )}
      {editTarget && (
        <ManualEntryModal
          editBooking={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            load();
            setSuccessMsg('Booking updated successfully.');
            setTimeout(() => setSuccessMsg(null), 4000);
          }}
        />
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-5">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium mb-6 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 animate-pulse">
              <div className="flex justify-between mb-4"><div className="h-5 bg-slate-200 rounded w-48" /><div className="h-6 bg-slate-200 rounded-full w-24" /></div>
              <div className="grid grid-cols-3 gap-4"><div className="h-4 bg-slate-100 rounded" /><div className="h-4 bg-slate-100 rounded" /><div className="h-4 bg-slate-100 rounded" /></div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">{search || filterStatus !== 'ALL' ? 'No bookings match your filters.' : 'No bookings yet.'}</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map(booking => {
            const cfg = STATUS_CONFIG[booking.status];
            return (
              <div key={booking.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                {/* Card header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-base">{booking.full_name}</p>
                      <p className="text-xs text-slate-400">Submitted {formatTs(booking.created_at)}</p>
                      {booking.source && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-teal-50 border border-teal-100 rounded-lg text-[11px] font-bold text-teal-700">
                          <Tag className="w-3 h-3" />{booking.source}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </div>
                </div>

                {/* Contact summary row */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div><p className="text-xs text-slate-400 font-medium">Date</p><p className="text-sm text-slate-700 font-semibold">{formatDate(booking.preferred_date)}</p></div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div><p className="text-xs text-slate-400 font-medium">Time</p><p className="text-sm text-slate-700 font-semibold">{formatTime(booking.preferred_time)}</p></div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Stethoscope className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Assigned Staff</p>
                      <p className="text-sm text-slate-700 font-semibold truncate">{[booking.assigned_nurse_id, booking.assigned_nurse_assistant_id].filter(Boolean).map(id => memberDisplayName(memberLookup[id])).filter(Boolean).join(', ') || 'Unassigned'}</p>
                    </div>
                  </div>
                  {booking.email && (
                    <div className="flex items-center gap-2.5">
                      <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div><p className="text-xs text-slate-400 font-medium">Email</p><p className="text-sm text-slate-700 font-semibold truncate">{booking.email}</p></div>
                    </div>
                  )}
                  {!booking.email && booking.cellphone && (
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <div><p className="text-xs text-slate-400 font-medium">Cellphone</p><p className="text-sm text-slate-700 font-semibold">{booking.cellphone}</p></div>
                    </div>
                  )}
                </div>

                {/* Services */}
                <div className="mb-5">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Services</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {booking.services_requested.map(s => (
                      <span key={s} className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-lg border border-teal-100">{s}</span>
                    ))}
                  </div>
                </div>

                {/* Notes preview */}
                {booking.notes && (
                  <div className="mb-5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                      <p className="text-xs text-amber-600 font-semibold">Notes</p>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{booking.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100">
                  {canManage && (
                    <>
                      <p className="text-xs text-slate-400 font-medium mr-1">Status:</p>
                      {(['NEW', 'CONFIRMED', 'CANCELLED'] as BookingStatus[]).map(s => {
                        const c = STATUS_CONFIG[s];
                        const isActive = booking.status === s;
                        return (
                          <button key={s} disabled={isActive || updatingId === booking.id}
                            onClick={() => s === 'CONFIRMED' ? handleConfirmBooking(booking) : updateStatus(booking.id, s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isActive ? `${c.bg} ${c.color} border-current cursor-default` : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white'} disabled:opacity-60`}>
                            {c.label}
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* Right-side action buttons */}
                  <div className="ml-auto flex items-center gap-2">
                    {canManage && booking.status === 'CONFIRMED' && !bookedBookingIds.has(booking.id) && (
                      <button
                        onClick={() => setPendingApptBooking(booking)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Make Appointment
                      </button>
                    )}
                    {canManage && (
                      <button onClick={() => setNotesTarget(booking)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-colors">
                        <StickyNote className="w-3.5 h-3.5" />
                        {booking.notes ? 'Edit Notes' : 'Add Notes'}
                      </button>
                    )}
                    {canManage && (
                      <button onClick={() => setEditTarget(booking)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    <button onClick={() => setDetailTarget(booking)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </button>
                    {canManage && (
                      <button onClick={() => setDeleteTarget(booking)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notesTarget && <NotesModal booking={notesTarget} onClose={() => setNotesTarget(null)} onSaved={load} />}
      {pendingApptBooking && (
        <BookingToAppointmentModal
          booking={pendingApptBooking}
          userEmail={userEmail}
          onClose={() => setPendingApptBooking(null)}
          onSaved={() => {
            if (pendingApptBooking) {
              setBookedBookingIds(prev => new Set([...prev, pendingApptBooking.id]));
              const d = pendingApptBooking.preferred_date;
              const [y, m, day] = d.split('-').map(Number);
              const label = new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
              setSuccessMsg(`Appointment created for ${label}. In Operations, set the date to ${label} to manage it.`);
              setTimeout(() => setSuccessMsg(null), 8000);
            }
            setPendingApptBooking(null);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteBookingModal
          booking={deleteTarget}
          userEmail={userEmail}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

// ─── Delete Feedback Modal ────────────────────────────────────────────────────

function DeleteFeedbackModal({
  feedback,
  userEmail,
  onClose,
  onDeleted,
}: {
  feedback: ClientFeedback;
  userEmail: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!password) { setError('Password is required.'); return; }
    setProcessing(true);
    setError(null);

    const { error: authErr } = await supabase.auth.signInWithPassword({ email: userEmail, password });
    if (authErr) {
      setProcessing(false);
      setError('Incorrect password. Please try again.');
      return;
    }

    const { error: dbErr } = await supabase.from('client_feedback').delete().eq('id', feedback.id);
    setProcessing(false);
    if (dbErr) {
      setError('Failed to delete the record. Please try again.');
      return;
    }

    onDeleted(feedback.id);
    onClose();
  }

  const label = feedback.name || 'Anonymous';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Delete Feedback</h3>
        <p className="text-sm text-slate-500 text-center mb-1 leading-relaxed">
          You are about to permanently delete the feedback from
        </p>
        <p className="text-base font-bold text-slate-800 text-center mb-5">"{label}"</p>
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-red-600 font-medium text-center leading-relaxed">
            This action cannot be undone. All feedback data for this submission will be permanently removed.
          </p>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Enter your password to confirm
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                autoFocus
                value={password}
                placeholder="Your account password"
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent text-slate-700 placeholder-slate-300"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={processing || !password}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {processing ? 'Verifying...' : 'Delete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Feedback Tab ─────────────────────────────────────────────────────────────

function FeedbackTab({ userEmail }: { userEmail: string }) {
  const [feedbacks, setFeedbacks] = useState<ClientFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClientFeedback | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabase
      .from('client_feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (dbErr) setError('Failed to load feedback.');
    else setFeedbacks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleDeleted(id: string) {
    setFeedbacks(prev => prev.filter(f => f.id !== id));
    setSuccessMsg('Feedback deleted successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  const filtered = feedbacks.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.service_availed.toLowerCase().includes(search.toLowerCase())
  );

  const avgOverall = feedbacks.length
    ? (feedbacks.reduce((a, f) => a + f.overall_satisfaction, 0) / feedbacks.length).toFixed(1) : '–';
  const avgStaff = feedbacks.length
    ? (feedbacks.reduce((a, f) => a + f.staff_professionalism, 0) / feedbacks.length).toFixed(1) : '–';
  const wouldRecommend = feedbacks.length
    ? Math.round((feedbacks.filter(f => f.recommend === 'Yes').length / feedbacks.length) * 100) : 0;

  function yesNoColor(v: string) {
    if (v === 'Yes') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (v === 'No') return 'text-red-600 bg-red-50 border-red-200';
    return 'text-amber-600 bg-amber-50 border-amber-200';
  }

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Responses', value: feedbacks.length, icon: MessageSquare, color: 'text-cyan-600', bg: 'bg-cyan-50' },
          { label: 'Avg. Satisfaction', value: avgOverall, icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Avg. Staff Rating', value: avgStaff, icon: ThumbsUp, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: '% Would Recommend', value: feedbacks.length ? `${wouldRecommend}%` : '–', icon: BarChart3, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name or service..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-slate-700" />
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium mb-6 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-5">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-40 mb-4" />
              <div className="grid grid-cols-3 gap-4"><div className="h-4 bg-slate-100 rounded" /><div className="h-4 bg-slate-100 rounded" /><div className="h-4 bg-slate-100 rounded" /></div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">{search ? 'No feedback matches your search.' : 'No feedback submitted yet.'}</p>
          <p className="text-slate-400 text-sm mt-1">Client feedback will appear here after appointments.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map(fb => (
            <div key={fb.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-base">{fb.name || 'Anonymous'}</p>
                    <p className="text-xs text-slate-400">{formatTs(fb.created_at)}</p>
                    {fb.source && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-cyan-50 border border-cyan-100 rounded-lg text-[11px] font-bold text-cyan-700">
                        <Tag className="w-3 h-3" />{fb.source}
                      </span>
                    )}
                  </div>
                </div>
                <span className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-semibold rounded-full border border-cyan-200">{fb.service_availed}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div><p className="text-xs text-slate-400 font-medium mb-1.5">Overall Experience</p><StarDisplay value={fb.overall_satisfaction} /></div>
                <div><p className="text-xs text-slate-400 font-medium mb-1.5">Staff Professionalism</p><StarDisplay value={fb.staff_professionalism} /></div>
              </div>
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="text-xs text-slate-500 font-medium self-center">Procedure explained:</span>
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${yesNoColor(fb.procedure_explained)}`}>{fb.procedure_explained}</span>
                <span className="text-xs text-slate-400 self-center mx-1">|</span>
                <span className="text-xs text-slate-500 font-medium self-center">Avail again:</span>
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${yesNoColor(fb.avail_again)}`}>{fb.avail_again}</span>
                <span className="text-xs text-slate-400 self-center mx-1">|</span>
                <span className="text-xs text-slate-500 font-medium self-center">Recommend:</span>
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${yesNoColor(fb.recommend)}`}>{fb.recommend}</span>
              </div>
              <div className="space-y-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-400 font-semibold mb-1.5">What they liked most</p><p className="text-sm text-slate-700 leading-relaxed">{fb.liked_most}</p></div>
                <div className="bg-slate-50 rounded-xl p-4"><p className="text-xs text-slate-400 font-semibold mb-1.5">Comments & Suggestions</p><p className="text-sm text-slate-700 leading-relaxed">{fb.comments_suggestions}</p></div>
              </div>
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Marketing consent: </span>
                  <span className="text-xs font-semibold text-slate-600">{fb.marketing_consent}</span>
                </div>
                <button onClick={() => setDeleteTarget(fb)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteFeedbackModal
          feedback={deleteTarget}
          userEmail={userEmail}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

// ─── Team Members Tab (superadmin only) ─────────────────────────────────────

function AddEditMemberModal({
  mode,
  member,
  branches,
  saving,
  onClose,
  onSubmit,
}: {
  mode: 'add' | 'edit';
  member?: TeamMember | null;
  branches: Branch[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (email: string, fullName: string, roleKey: string, branchId: string) => void;
}) {
  const [email, setEmail] = useState(member?.email ?? '');
  const [fullName, setFullName] = useState(member?.full_name ?? '');
  const [role, setRole] = useState(member?.role ?? 'staff');
  const [branchId, setBranchId] = useState(member?.branch_id ?? '');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (mode === 'add' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setEmailErr('Enter a valid email address.');
      return;
    }
    setEmailErr(null);

    const trimmedName = fullName.trim();
    if (mode === 'edit') {
      if (trimmedName.length < 2) {
        setNameErr('Full name is required (at least 2 characters).');
        return;
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedName)) {
        setNameErr('Enter a full name, not an email address.');
        return;
      }
      if (!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'\-]+$/.test(trimmedName)) {
        setNameErr('Use letters, spaces, hyphens, and apostrophes only.');
        return;
      }
    }
    setNameErr(null);

    // In edit mode the first arg is the member's UUID (user_id), not the email.
    // In add mode the first arg is the invitee's email address.
    const identifier = mode === 'edit' ? (member?.user_id ?? '') : normalized;
    onSubmit(identifier, trimmedName, role, branchId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">
            {mode === 'add' ? 'Add Team Member' : 'Edit Member'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailErr(null); }}
              disabled={mode === 'edit'}
              className={`mt-1.5 w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                emailErr ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } ${mode === 'edit' ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : ''}`}
              placeholder="name@example.com"
            />
            {emailErr && <p className="mt-1 text-xs text-red-500">{emailErr}</p>}
            {mode === 'edit' && (
              <p className="mt-1 text-[11px] text-slate-400">Email cannot be changed after creation.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={e => { setFullName(e.target.value); setNameErr(null); }}
              className={`mt-1.5 w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                nameErr ? 'border-red-300 bg-red-50' : 'border-slate-200'
              }`}
              placeholder={mode === 'edit' ? 'Enter full name' : 'Optional display name'}
            />
            {nameErr && <p className="mt-1 text-xs text-red-500">{nameErr}</p>}
            {mode === 'edit' && !nameErr && (
              <p className="mt-1 text-[11px] text-slate-400">This name appears in assignment dropdowns and timelines.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Branch</label>
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              <option value="">No branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          {mode === 'add' && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-teal-700 leading-relaxed">
                An invitation email will be sent to this address. The invitee must set their password to activate the account.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'add' ? <Plus className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              {mode === 'add' ? 'Send Invitation' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteMemberModal({
  member,
  saving,
  onClose,
  onConfirm,
}: {
  member: TeamMember;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Delete Member</h3>
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm font-semibold text-slate-800">{member.full_name || member.email}</p>
            <p className="text-xs text-slate-500">{member.email}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs text-red-700 leading-relaxed">
              <strong className="font-bold">Permanent deletion.</strong> This will permanently remove the member's account and login access. This action cannot be undone.
            </p>
            <p className="text-xs text-red-600 leading-relaxed mt-2">
              This is different from <strong>Revoke Access</strong>, which only disables login while keeping the member record. Historical records (bookings, appointments, payments) will be preserved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete Permanently
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamMembersTab({ canAdd, canEdit, canDelete }: { canAdd: boolean; canEdit: boolean; canDelete: boolean }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Add / Edit / Delete modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Test notification state
  const [testStatus, setTestStatus] = useState<Record<string, { state: 'idle' | 'sending' | 'ok' | 'error'; msg: string; debug?: string; failDetails?: string[] }>>(
    { booking: { state: 'idle', msg: '' }, feedback: { state: 'idle', msg: '' } },
  );
  const [testEmail, setTestEmail] = useState('');

  async function sendTestNotification(type: 'booking' | 'feedback') {
    setTestStatus(prev => ({ ...prev, [type]: { state: 'sending', msg: '' } }));

    const mockBooking = {
      full_name: 'Maria Santos (TEST)',
      email: 'maria.santos@example.com',
      cellphone: '+63 912 345 6789',
      preferred_date: '2026-08-15',
      preferred_time: '10:00',
      services_requested: ['IV Drip Therapy', 'Consultation'],
      date_of_birth: '1990-05-20',
      address: '123 Rizal Street, Quezon City',
      emergency_contact_name: 'Jose Santos',
      emergency_contact_relationship: 'Spouse',
      emergency_contact_number: '+63 917 654 3210',
      source: 'TEST',
    };

    const mockFeedback = {
      name: 'Ana Reyes (TEST)',
      service_availed: 'IV Drip Therapy',
      overall_satisfaction: 5,
      staff_professionalism: 5,
      procedure_explained: 'Yes',
      avail_again: 'Yes',
      recommend: 'Yes',
      liked_most: 'The staff were very professional and the clinic was spotless.',
      comments_suggestions: 'Maybe add more flavors to the IV drip options!',
      marketing_consent: 'Yes, with my name',
      source: 'TEST',
    };

    try {
      const body: { type: string; data: Record<string, unknown>; to?: string[] } = {
        type,
        data: type === 'booking' ? mockBooking : mockFeedback,
      };
      if (testEmail.trim()) body.to = [testEmail.trim()];

      const { data, error: fnErr } = await supabase.functions.invoke('send-notification-email', { body });
      if (fnErr) throw new Error(fnErr.message);
      const resp = data as { sent?: number; failed?: string[]; error?: string; debug?: { smtp: string; port: number; tls: boolean; from: string } };
      if (resp?.error) throw new Error(resp.error);
      const sent = resp?.sent ?? 0;
      const failed = resp?.failed;
      const debug = resp?.debug;
      const debugStr = debug ? `via ${debug.smtp}:${debug.port} (${debug.tls ? 'SSL' : 'STARTTLS'}) from ${debug.from}` : '';
      const failNote = failed && failed.length > 0 ? ` — ${failed.length} failed` : '';
      setTestStatus(prev => ({
        ...prev,
        [type]: {
          state: sent > 0 ? 'ok' : 'error',
          msg: sent > 0 ? `Sent to ${sent} recipient${sent === 1 ? '' : 's'}${failNote}.` : `0 sent${failNote}.`,
          debug: debugStr,
          failDetails: failed,
        },
      }));
    } catch (e) {
      setTestStatus(prev => ({
        ...prev,
        [type]: { state: 'error', msg: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);
    const [membersRes, branchesRes] = await Promise.all([
      supabase.from('team_members').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
    ]);
    setMembers(membersRes.data ?? []);
    setBranches(branchesRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAction(userId: string, rpc: string) {
    setActioningId(userId);
    setError(null);
    const { error: err } = await supabase.rpc(rpc, { member_user_id: userId });
    if (err) setError(err.message);
    await load();
    setActioningId(null);
  }

  async function assignBranch(userId: string, branchId: string) {
    const { error: err } = await supabase
      .from('team_members')
      .update({ branch_id: branchId || null })
      .eq('user_id', userId);
    if (err) setError(err.message);
    else await load();
  }

  async function assignRole(userId: string, roleKey: string) {
    const { error: err } = await supabase.rpc('change_member_role', {
      member_user_id: userId,
      new_role_key: roleKey,
    });
    if (err) setError(err.message);
    else await load();
  }

  async function inviteMember(email: string, fullName: string, roleKey: string, branchId: string) {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team-invite-member`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email,
          full_name: fullName || undefined,
          role: roleKey || undefined,
          branch_id: branchId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Invitation failed (${res.status})`);
      } else {
        setSuccessMsg(data.message || `Invitation sent to ${email}.`);
        setShowAddModal(false);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invitation.');
    }
    setSaving(false);
  }

  async function editMember(userId: string, fullName: string, roleKey: string, branchId: string) {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    const { error: err } = await supabase.rpc('update_member_profile', {
      member_user_id: userId,
      new_full_name: fullName || null,
      new_role_key: roleKey || null,
      new_branch_id: branchId || null,
    });
    if (err) {
      console.error('update_member_profile failed:', err);
      setError('Unable to save the team member\u2019s name. Please try again.');
    } else {
      setSuccessMsg('Member profile updated.');
      setEditingMember(null);
      await load();
    }
    setSaving(false);
  }

  async function deleteMember(userId: string) {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/team-delete-member`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Deletion failed (${res.status})`);
      } else {
        setSuccessMsg(data.message || 'Member permanently deleted.');
        setDeletingMember(null);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete member.');
    }
    setSaving(false);
  }

  const pending = members.filter(m => m.status === 'pending');
  const approved = members.filter(m => m.status === 'approved');
  const rejected = members.filter(m => m.status === 'rejected');

  function MemberRow({
    member,
    actions,
    showBranch = false,
    showRole = false,
    isSelf = false,
    onEdit,
    onDelete,
  }: {
    member: TeamMember;
    actions: { label: string; icon: React.ElementType; rpc: string; style: string }[];
    showBranch?: boolean;
    showRole?: boolean;
    isSelf?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
  }) {
    const acting = actioningId === member.user_id;
    const roleLabel = ROLES.find(r => r.key === member.role)?.label ?? member.role;
    const menuOpen = menuOpenId === member.user_id;
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            member.role === 'superadmin' ? 'bg-amber-100' : 'bg-teal-100'
          }`}>
            {member.role === 'superadmin'
              ? <Crown className="w-4 h-4 text-amber-600" />
              : <User className="w-4 h-4 text-teal-600" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{memberDisplayName(member)}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs font-medium ${member.role === 'superadmin' ? 'text-amber-600' : 'text-slate-400'}`}>
                {roleLabel}
              </span>
              <span className="text-slate-200">·</span>
              <span className="text-xs text-slate-400">
                Registered {new Date(member.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {member.approved_at && (
                <>
                  <span className="text-slate-200">·</span>
                  <span className="text-xs text-slate-400">
                    Approved {new Date(member.approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {showRole && !isSelf && (
          <select
            value={member.role}
            onChange={e => assignRole(member.user_id, e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        )}
        {showBranch && !isSelf && (
          <select
            value={member.branch_id ?? ''}
            onChange={e => assignBranch(member.user_id, e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="">No branch</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions.map(a => (
            <button
              key={a.rpc}
              onClick={() => runAction(member.user_id, a.rpc)}
              disabled={acting}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 ${a.style}`}
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <a.icon className="w-3.5 h-3.5" />}
              {a.label}
            </button>
          ))}
          {(onEdit || onDelete) && (
            <div className="relative">
              <button
                onClick={() => setMenuOpenId(menuOpen ? null : member.user_id)}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors"
                title="More actions"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpenId(null)} />
                  <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
                    {onEdit && (
                      <button
                        onClick={() => { setMenuOpenId(null); onEdit(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-left"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-400" /> Edit Member
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => { setMenuOpenId(null); onDelete(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete Member
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-emerald-700 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />{successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Page header with Add Member button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Team Management</h2>
        {canAdd && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Member
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: pending.length, color: 'text-amber-600', bg: 'bg-amber-50', icon: Hourglass },
          { label: 'Approved', value: approved.length, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: UserCheck },
          { label: 'Rejected', value: rejected.length, color: 'text-red-600', bg: 'bg-red-50', icon: UserX },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 ${s.bg} rounded-xl flex items-center justify-center`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pending approvals */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Hourglass className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Pending Approval</h3>
          {pending.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">{pending.length}</span>
          )}
        </div>
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin mx-auto" />
          </div>
        ) : pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <CheckCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No pending approvals</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            {pending.map(m => (
              <MemberRow key={m.id} member={m} actions={[
                { label: 'Approve', icon: UserCheck, rpc: 'approve_member', style: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
                { label: 'Reject', icon: UserX, rpc: 'reject_member', style: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
              ]} />
            ))}
          </div>
        )}
      </div>

      {/* Approved members */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Approved Members</h3>
        </div>
        {!loading && approved.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-400">No approved members yet</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            {approved.map(m => (
              <MemberRow
                key={m.id}
                member={m}
                showBranch
                showRole
                isSelf={m.user_id === currentUserId}
                actions={
                  m.role === 'superadmin' ? [] : [
                    { label: 'Revoke Access', icon: UserX, rpc: 'revoke_member', style: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
                  ]
                }
                onEdit={canEdit ? () => setEditingMember(m) : undefined}
                onDelete={canDelete && m.user_id !== currentUserId ? () => setDeletingMember(m) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rejected members */}
      {rejected.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <UserX className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Rejected / Revoked</h3>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            {rejected.map(m => (
              <MemberRow key={m.id} member={m} actions={[
                { label: 'Restore Access', icon: UserCheck, rpc: 'approve_member', style: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
              ]} />
            ))}
          </div>
        </div>
      )}

      {/* ── Test Notifications ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Test Email Notifications</h3>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            Send a test email to all <span className="font-semibold text-slate-700">{members.filter(m => m.status === 'approved').length} approved members</span> to verify the notification system is working.
            Each test uses realistic mock data — check your inboxes after clicking.
          </p>
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Override recipient (optional)
            </label>
            <input
              type="email"
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="e.g. johndaveb892@gmail.com — leave blank to send to all approved members"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent placeholder:text-slate-300"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['booking', 'feedback'] as const).map(type => {
              const s = testStatus[type];
              return (
                <div key={type} className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    {type === 'booking' ? 'Booking Notification' : 'Feedback Notification'}
                  </p>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    {type === 'booking'
                      ? 'Simulates a new client booking request with full intake data.'
                      : 'Simulates a completed client feedback form with 5-star ratings.'}
                  </p>
                  <button
                    onClick={() => sendTestNotification(type)}
                    disabled={s.state === 'sending'}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-60 ${
                      s.state === 'ok'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                        : s.state === 'error'
                          ? 'bg-red-50 border border-red-200 text-red-600'
                          : 'bg-slate-900 text-white hover:bg-slate-700'
                    }`}
                  >
                    {s.state === 'sending'
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                      : s.state === 'ok'
                        ? <><CheckCircle className="w-3.5 h-3.5" /> {s.msg}</>
                        : s.state === 'error'
                          ? <><AlertCircle className="w-3.5 h-3.5" /> {s.msg || 'Failed — retry'}</>
                          : <><Mail className="w-3.5 h-3.5" /> Send Test {type === 'booking' ? 'Booking' : 'Feedback'} Email</>}
                  </button>
                  {s.debug && (
                    <p className="text-[10px] text-slate-400 mt-2 text-center font-mono leading-relaxed">{s.debug}</p>
                  )}
                  {s.failDetails && s.failDetails.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {s.failDetails.map((f, i) => (
                        <p key={i} className="text-[10px] text-red-500 bg-red-50 rounded-lg px-2.5 py-1.5 leading-relaxed font-mono">{f}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <AddEditMemberModal
          mode="add"
          branches={branches}
          saving={saving}
          onClose={() => setShowAddModal(false)}
          onSubmit={inviteMember}
        />
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <AddEditMemberModal
          mode="edit"
          member={editingMember}
          branches={branches}
          saving={saving}
          onClose={() => setEditingMember(null)}
          onSubmit={editMember}
        />
      )}

      {/* Delete Confirmation */}
      {deletingMember && (
        <DeleteMemberModal
          member={deletingMember}
          saving={saving}
          onClose={() => setDeletingMember(null)}
          onConfirm={() => deleteMember(deletingMember.user_id)}
        />
      )}
    </div>
  );
}

// ─── Finance Tab ──────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n);
}

function fmtTxDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TxFormData {
  type: 'income' | 'expense';
  amount: string;
  description: string;
  date: string;
  notes: string;
}

function AddEntryModal({ userEmail, onClose, onSaved }: { userEmail: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<TxFormData>({ type: 'income', amount: '', description: '', date: today, notes: '' });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function setField<K extends keyof TxFormData>(k: K, v: TxFormData[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setReceiptFile(file);
    if (file) {
      setReceiptPreview(URL.createObjectURL(file));
    } else {
      setReceiptPreview(null);
    }
  }

  async function handleSave() {
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) { setErr('Enter a valid amount greater than 0.'); return; }
    if (!form.description.trim()) { setErr('Description is required.'); return; }
    if (!form.date) { setErr('Select a date.'); return; }
    setSaving(true);
    setErr('');

    let receipt_url: string | null = null;
    if (receiptFile) {
      const ext = receiptFile.name.split('.').pop();
      const path = `receipts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('finance-receipts').upload(path, receiptFile);
      if (uploadErr) { setErr(`Receipt upload failed: ${uploadErr.message}`); setSaving(false); return; }
      receipt_url = path;
    }

    const { error } = await supabase.from('finance_transactions').insert({
      type: form.type,
      amount,
      category: 'General',
      description: form.description.trim(),
      date: form.date,
      notes: form.notes.trim() || null,
      receipt_url,
      created_by_email: userEmail,
    });
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`rounded-t-3xl px-6 pt-6 pb-5 sticky top-0 z-10 ${form.type === 'income' ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Add Entry</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-black/10 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          {/* Addition / Subtraction toggle */}
          <div className="flex gap-2">
            {([['income', 'Addition'], ['expense', 'Subtraction']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setField('type', val)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ${
                  form.type === val
                    ? val === 'income' ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' : 'bg-red-500 border-red-500 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                }`}>
                {val === 'income' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (PHP)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₱</span>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setField('amount', e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <input type="text" value={form.description} onChange={e => setField('description', e.target.value)}
              placeholder="e.g. IV Drip session payment, Supplies purchase…"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent" />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date" value={form.date} onChange={e => setField('date', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent" />
          </div>

          {/* Receipt upload */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Receipt Image <span className="text-slate-300 font-normal normal-case">(optional)</span>
            </label>
            {receiptPreview ? (
              <div className="relative">
                <img src={receiptPreview} alt="Receipt preview" className="w-full h-40 object-cover rounded-xl border border-slate-200" />
                <button onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                  className="absolute top-2 right-2 p-1.5 bg-white rounded-lg shadow border border-slate-200 hover:bg-red-50 hover:text-red-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-5 cursor-pointer hover:border-teal-300 hover:bg-teal-50/30 transition-colors">
                <Receipt className="w-6 h-6 text-slate-300" />
                <span className="text-xs font-semibold text-slate-400">Click to upload (GCash screenshot, OR, etc.)</span>
                <span className="text-[10px] text-slate-300">JPG, PNG, WEBP — max 10 MB</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Notes <span className="text-slate-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2}
              placeholder="Additional details…"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none" />
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`flex-1 py-3 font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${
              form.type === 'income'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinanceTab({ canManage, userEmail }: { canManage: boolean; userEmail: string }) {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FinanceTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });

  const load = useCallback(async () => {
    setLoading(true);
    const [txRes, memRes] = await Promise.all([
      supabase
        .from('finance_transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('team_members').select('user_id, email, full_name, role'),
    ]);
    setTransactions(txRes.data ?? []);
    setMemberLookup(buildMemberLookup((memRes.data ?? []) as TeamMember[]));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = typeFilter === 'all' ? transactions : transactions.filter(t => t.type === typeFilter);

  const visibleAdditions = visible.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const visibleSubtractions = visible.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const net = visibleAdditions - visibleSubtractions;

  async function openReceipt(path: string) {
    setLoadingReceipt(true);
    const { data } = await supabase.storage.from('finance-receipts').createSignedUrl(path, 3600);
    setLoadingReceipt(false);
    if (data?.signedUrl) setReceiptUrl(data.signedUrl);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    if (deleteTarget.receipt_url) {
      await supabase.storage.from('finance-receipts').remove([deleteTarget.receipt_url]);
    }
    await supabase.from('finance_transactions').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="space-y-6">
      {/* Read-only notice for non-superadmin */}
      {!canManage && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            You can view and add entries, but only a <span className="font-bold">Superadmin</span> can delete financial records.
          </p>
        </div>
      )}

      {/* Summary cards — calculated from visible (filtered) rows */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Additions</p>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{fmtCurrency(visibleAdditions)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <ArrowDownCircle className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Subtractions</p>
          </div>
          <p className="text-2xl font-extrabold text-red-500">{fmtCurrency(visibleSubtractions)}</p>
        </div>
        <div className={`rounded-2xl border p-5 ${net >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-red-50 border-red-100'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${net >= 0 ? 'bg-teal-100' : 'bg-red-100'}`}>
              <Wallet className={`w-5 h-5 ${net >= 0 ? 'text-teal-600' : 'text-red-500'}`} />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Total</p>
          </div>
          <p className={`text-2xl font-extrabold ${net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{fmtCurrency(net)}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1">
          {([['all', 'All'], ['income', 'Additions'], ['expense', 'Subtractions']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setTypeFilter(val)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                typeFilter === val
                  ? val === 'income' ? 'bg-emerald-600 text-white' : val === 'expense' ? 'bg-red-500 text-white' : 'bg-slate-900 text-white'
                  : 'text-slate-400 hover:text-slate-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="sm:ml-auto flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-2xl hover:bg-slate-700 transition-colors">
          <PlusCircle className="w-4 h-4" /> Add Entry
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_110px_120px_56px_40px] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Type</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Amount</p>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Receipt</p>
          <div />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading entries…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Receipt className="w-10 h-10 opacity-30" />
            <p className="text-sm font-semibold">No entries found</p>
            <p className="text-xs">Add your first entry using the button above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {visible.map(tx => (
              <div key={tx.id} className="sm:grid sm:grid-cols-[1fr_110px_120px_56px_40px] gap-3 items-center px-5 py-3.5 hover:bg-slate-50/60 transition-colors group">
                <div className="min-w-0 mb-2 sm:mb-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{tx.description || '—'}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-400">{fmtTxDate(tx.date)}</span>
                    {tx.created_by_email && (
                      <>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs text-slate-400 truncate max-w-[160px]">{resolveMemberName(tx.created_by_email, memberLookup)}</span>
                      </>
                    )}
                    {tx.notes && (
                      <>
                        <span className="text-slate-200">·</span>
                        <span className="text-xs text-slate-400 italic truncate max-w-[180px]">{tx.notes}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex sm:block mb-2 sm:mb-0">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    tx.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {tx.type === 'income' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                    {tx.type === 'income' ? 'Addition' : 'Subtraction'}
                  </span>
                </div>

                <p className={`text-sm font-extrabold sm:text-right mb-2 sm:mb-0 ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {tx.type === 'income' ? '+' : '−'}{fmtCurrency(Number(tx.amount))}
                </p>

                <div className="flex justify-start sm:justify-center mb-2 sm:mb-0">
                  {tx.receipt_url ? (
                    <button onClick={() => openReceipt(tx.receipt_url!)}
                      className="w-8 h-8 bg-slate-100 hover:bg-teal-100 rounded-lg flex items-center justify-center transition-colors group/r" title="View receipt">
                      {loadingReceipt ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : <Receipt className="w-3.5 h-3.5 text-slate-400 group-hover/r:text-teal-600 transition-colors" />}
                    </button>
                  ) : (
                    <span className="w-8 h-8 flex items-center justify-center text-slate-200 text-xs">—</span>
                  )}
                </div>

                <div className="flex justify-end">
                  {canManage ? (
                    <button onClick={() => setDeleteTarget(tx)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : <div className="w-7" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add entry modal */}
      {showAdd && <AddEntryModal userEmail={userEmail} onClose={() => setShowAdd(false)} onSaved={load} />}

      {/* Receipt viewer */}
      {receiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setReceiptUrl(null)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setReceiptUrl(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-red-50 transition-colors">
              <X className="w-4 h-4 text-slate-600" />
            </button>
            <img src={receiptUrl} alt="Receipt" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Delete Entry?</h3>
            <p className="text-sm text-slate-500 text-center mb-1 truncate px-2">{deleteTarget.description || '—'}</p>
            <p className={`text-base font-extrabold text-center mb-6 ${deleteTarget.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
              {deleteTarget.type === 'income' ? '+' : '−'}{fmtCurrency(Number(deleteTarget.amount))}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface DashboardProps {
  userEmail: string;
  memberRole: RoleKey;
  memberBranchId: string | null;
  permissions: Set<string>;
  onLogout: () => void;
}

// ─── QR Codes / Source Manager ───────────────────────────────────────────────

function SourceModal({
  source,
  onClose,
  onSaved,
}: {
  source: QrSource | null;
  onClose: () => void;
  onSaved: (s: QrSource) => void;
}) {
  const [name, setName] = useState(source?.name ?? '');
  const [description, setDescription] = useState(source?.description ?? '');
  const [type, setType] = useState(source?.type ?? 'branch');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = source !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError(null);
    if (isEdit) {
      const { data, error: dbErr } = await supabase
        .from('qr_sources').update({ name: name.trim(), description: description.trim() || null, type })
        .eq('id', source.id).select().single();
      setSaving(false);
      if (dbErr) { setError(dbErr.message); return; }
      onSaved(data as QrSource);
    } else {
      const { data, error: dbErr } = await supabase
        .from('qr_sources').insert({ name: name.trim(), description: description.trim() || null, type })
        .select().single();
      setSaving(false);
      if (dbErr) { setError(dbErr.message); return; }
      onSaved(data as QrSource);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-7 pb-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit Source' : 'New Booking Source'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Source Name *</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Main Branch, BGC Branch, Instagram"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Type</label>
            <select value={type} onChange={e => setType(e.target.value as QrSource['type'])}
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 bg-white cursor-pointer">
              <option value="branch">Branch / Location</option>
              <option value="event">Event / Promotion</option>
              <option value="social_media">Social Media</option>
              <option value="partner">Partner Referral</option>
              <option value="walkin">Walk-in</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Description <span className="text-slate-400 normal-case tracking-normal font-normal">(optional)</span>
            </label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Taguig location, Lazada promo"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800" />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QRCodesTab({ canManage }: { canManage: boolean }) {
  const [sources, setSources] = useState<QrSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<QrSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QrSource | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [qrView, setQrView] = useState<Record<string, 'booking' | 'feedback'>>({});

  // Persisted base URL so QR codes always point to the production domain
  const [siteUrl, setSiteUrl] = useState<string>(() => {
    return localStorage.getItem('cd_site_url') || window.location.origin;
  });
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(siteUrl);

  function saveSiteUrl() {
    const cleaned = urlDraft.replace(/\/$/, '');
    setSiteUrl(cleaned);
    setUrlDraft(cleaned);
    localStorage.setItem('cd_site_url', cleaned);
    setEditingUrl(false);
  }

  function getView(id: string): 'booking' | 'feedback' {
    return qrView[id] ?? 'booking';
  }

  function setCardView(id: string, v: 'booking' | 'feedback') {
    setQrView(prev => ({ ...prev, [id]: v }));
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('qr_sources').select('*').order('created_at', { ascending: true });
    setSources((data ?? []) as QrSource[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(s: QrSource) {
    setToggling(s.id);
    const { data } = await supabase.from('qr_sources').update({ is_active: !s.is_active }).eq('id', s.id).select().single();
    setToggling(null);
    if (data) setSources(prev => prev.map(x => x.id === s.id ? data as QrSource : x));
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await supabase.from('qr_sources').delete().eq('id', deleteTarget.id);
    setSources(prev => prev.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  async function copyUrl(url: string, key: string) {
    await navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function downloadQR(url: string, name: string, key: string) {
    setDownloading(key);
    try {
      const src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&margin=24&format=png`;
      const res = await fetch(src);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `qr-${name.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&margin=24`, '_blank');
    } finally {
      setDownloading(null);
    }
  }

  function sourceUrl(s: QrSource, view: 'booking' | 'feedback' = 'booking') {
    return `${siteUrl}/?src=${encodeURIComponent(s.name)}#${view}`;
  }

  function openSourceForm(src: QrSource | null) {
    setEditTarget(src);
    setShowForm(true);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Booking Sources</h2>
          <p className="text-slate-500 mt-1 text-sm leading-relaxed">
            Each source gets a unique QR code. When a client scans it, their booking is automatically tagged with that source so you can track where bookings come from.
          </p>
        </div>
        {canManage && (
          <button onClick={() => openSourceForm(null)}
            className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0">
            <Plus className="w-4 h-4" /> Add Source
          </button>
        )}
      </div>

      {/* Read-only notice for non-superadmin */}
      {!canManage && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 mb-6">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            You can view and use QR codes, but only a <span className="font-bold">Superadmin</span> can add, edit, or remove sources.
          </p>
        </div>
      )}

      {/* Site URL config — ensures QR codes point to the correct production domain */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 mb-8 flex items-center gap-3">
        <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Globe className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">QR Base URL</p>
          {editingUrl ? (
            <input
              autoFocus
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveSiteUrl(); if (e.key === 'Escape') { setEditingUrl(false); setUrlDraft(siteUrl); } }}
              className="w-full text-sm font-mono text-slate-800 bg-transparent focus:outline-none border-b-2 border-teal-400"
            />
          ) : (
            <p className="text-sm font-mono text-slate-700 truncate">{siteUrl}</p>
          )}
        </div>
        {editingUrl ? (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={saveSiteUrl}
              className="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 transition-colors">
              Save
            </button>
            <button onClick={() => { setEditingUrl(false); setUrlDraft(siteUrl); }}
              className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        ) : canManage ? (
          <button onClick={() => { setEditingUrl(true); setUrlDraft(siteUrl); }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0">
            <Settings2 className="w-3.5 h-3.5" /> Edit
          </button>
        ) : null}
      </div>

      {/* Stats */}
      {sources.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Sources', value: sources.length, color: 'text-slate-900' },
            { label: 'Active', value: sources.filter(s => s.is_active).length, color: 'text-emerald-600' },
            { label: 'Inactive', value: sources.filter(s => !s.is_active).length, color: 'text-slate-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-5">
              <p className="text-xs text-slate-400 font-medium mb-1">{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-3xl border border-slate-100 p-7 animate-pulse space-y-4">
              <div className="h-5 bg-slate-200 rounded w-32" />
              <div className="h-4 bg-slate-100 rounded w-48" />
              <div className="aspect-square bg-slate-100 rounded-2xl" />
              <div className="h-4 bg-slate-100 rounded" />
              <div className="flex gap-2"><div className="flex-1 h-9 bg-slate-100 rounded-xl" /><div className="w-20 h-9 bg-slate-100 rounded-xl" /></div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && sources.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-slate-700 font-bold text-lg mb-2">No sources yet</h3>
          <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
            Add your first source — a branch, location, or marketing channel — and generate its dedicated QR code.
          </p>
          {canManage && (
            <button onClick={() => openSourceForm(null)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors">
              <Plus className="w-4 h-4" /> Add First Source
            </button>
          )}
        </div>
      )}

      {/* Source cards */}
      {!loading && sources.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sources.map(src => {
            const cfg = TYPE_CONFIG[src.type] ?? TYPE_CONFIG.other;
            const view = getView(src.id);
            const url = sourceUrl(src, view);
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}&margin=16&bgcolor=${cfg.qrBg}&color=${cfg.qrFg}&format=svg`;
            return (
              <div key={src.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden transition-opacity ${!src.is_active ? 'opacity-55' : ''} ${cfg.cardBorder}`}>
                <div className={`h-1.5 ${cfg.accent}`} />
                <div className="p-6">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 leading-tight truncate text-base">{src.name}</p>
                      {src.description && <p className="text-xs text-slate-400 mt-0.5 truncate">{src.description}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full flex-shrink-0 ${cfg.bg} ${cfg.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Active indicator */}
                  <div className="flex items-center gap-1.5 mb-4">
                    <span className={`w-1.5 h-1.5 rounded-full ${src.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={`text-xs font-semibold ${src.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {src.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Booking / Feedback toggle */}
                  <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
                    <button
                      onClick={() => setCardView(src.id, 'booking')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        view === 'booking'
                          ? 'bg-white shadow-sm text-teal-700'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Booking QR
                    </button>
                    <button
                      onClick={() => setCardView(src.id, 'feedback')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        view === 'feedback'
                          ? 'bg-white shadow-sm text-cyan-700'
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Feedback QR
                    </button>
                  </div>
                  <div className={`flex items-center justify-center rounded-2xl p-4 mb-4 border-2 ${cfg.qrBorder}`}>
                    <img src={qrSrc} alt={`QR code for ${src.name}`} width={176} height={176} className="w-44 h-44" loading="lazy" />
                  </div>

                  {/* URL chip */}
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 mb-4 border border-slate-200">
                    <span className="text-[11px] text-slate-500 font-mono truncate flex-1 min-w-0">{url}</span>
                    <button onClick={() => copyUrl(url, `${src.id}-${view}`)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0 ${
                        copied === `${src.id}-${view}`
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}>
                      {copied === `${src.id}-${view}` ? <><CheckCircle className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>

                  {/* Action row 1 */}
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => downloadQR(url, `${src.name}-${view}`, `${src.id}-${view}`)} disabled={downloading === `${src.id}-${view}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-60">
                      {downloading === `${src.id}-${view}`
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading...</>
                        : <><Download className="w-3.5 h-3.5" /> Download QR</>}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> Test
                    </a>
                  </div>

                  {/* Action row 2: superadmin only */}
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => toggleActive(src)} disabled={toggling === src.id}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 border text-xs font-semibold rounded-xl transition-colors disabled:opacity-60 ${
                          src.is_active
                            ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        }`}>
                        {toggling === src.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : src.is_active
                            ? <><ToggleLeft className="w-3.5 h-3.5" /> Deactivate</>
                            : <><ToggleRight className="w-3.5 h-3.5" /> Activate</>}
                      </button>
                      <button onClick={() => openSourceForm(src)}
                        className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button onClick={() => setDeleteTarget(src)}
                        className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-xs font-semibold rounded-xl text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works tip */}
      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-5 flex gap-4">
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <Tag className="w-5 h-5 text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800 mb-1">How source tracking works</p>
          <p className="text-sm text-slate-500 leading-relaxed">
            Each source has a unique booking URL with its name embedded. When a client scans the QR and submits their intake form, the booking is automatically tagged with that source. Filter by source in the Bookings tab to see where your clients come from.
          </p>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <SourceModal
          source={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={saved => setSources(prev => {
            const idx = prev.findIndex(s => s.id === saved.id);
            return idx >= 0 ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved];
          })}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Source?</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              "<span className="font-semibold text-slate-700">{deleteTarget.name}</span>" will be removed. Existing bookings tagged with this source keep their label.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ userEmail, memberRole, memberBranchId, permissions, onLogout }: DashboardProps) {
  type Tab = 'overview' | 'bookings' | 'feedback' | 'team' | 'qr' | 'finance' | 'operations' | 'billing' | 'reports' | 'attendance' | 'inventory' | 'documents' | 'settings' | 'nurse' | 'nurse_assistant' | 'client_management' | 'remittance' | 'finance_recording' | 'products' | 'booking_staff' | 'consultations' | 'head_clinical_ops' | 'bugtrack' | 'wishlist';
  const [tab, setTab] = useState<Tab>(() => {
    const saved = typeof window !== 'undefined' ? (window.localStorage.getItem('cd_active_tab') as Tab | null) : null;
    const VALID_TABS: Tab[] = ['overview', 'bookings', 'feedback', 'team', 'qr', 'finance', 'operations', 'billing', 'reports', 'attendance', 'inventory', 'documents', 'settings', 'nurse', 'client_management', 'remittance', 'finance_recording', 'products', 'booking_staff', 'consultations', 'head_clinical_ops', 'bugtrack', 'wishlist'];
    if (saved && VALID_TABS.includes(saved)) return saved;
    return 'overview';
  });

  // Safety net: if the persisted tab is hidden or unauthorized, reset to 'overview'.
  // This runs after permissions are loaded so the check is accurate.
  useEffect(() => {
    const VISIBLE_TABS: Set<Tab> = new Set(['overview', 'bookings', 'feedback', 'team', 'qr', 'settings', 'nurse', 'nurse_assistant', 'inventory', 'client_management', 'remittance', 'finance', 'finance_recording', 'products', 'booking_staff', 'consultations', 'head_clinical_ops', 'bugtrack', 'wishlist']);
    if (!VISIBLE_TABS.has(tab)) {
      setTab('overview');
      return;
    }
    const PERMISSION_MAP: Partial<Record<Tab, PermissionKey>> = {
      client_management: 'clients.view',
      team: 'team.manage',
      settings: 'settings.manage',
      inventory: 'inventory.view',
      products: 'catalog.view',
      nurse: 'nurse.view',
      nurse_assistant: 'nurse_assistant.view',
      remittance: 'payments.confirm_remittance',
      finance: 'finance.view_summary',
      finance_recording: 'finance.view_summary',
      booking_staff: 'booking_staff.view',
      consultations: 'consultations.view',
      head_clinical_ops: 'head_clinical_ops.view',
    };
    const requiredPerm = PERMISSION_MAP[tab];
    if (requiredPerm && !permissions.has(requiredPerm) && memberRole !== 'superadmin') {
      setTab('overview');
    }
  }, [tab, permissions, memberRole]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.localStorage.getItem('cd_sidebar_collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUserId(session?.user.id ?? null);
    });
  }, []);

  const can = (perm: PermissionKey) => permissions.has(perm);
  const isSuperAdmin = memberRole === 'superadmin';

  useEffect(() => { window.localStorage.setItem('cd_active_tab', tab); }, [tab]);
  useEffect(() => { window.localStorage.setItem('cd_sidebar_collapsed', collapsed ? '1' : '0'); }, [collapsed]);

  async function handleLogout() {
    setLoggingOut(true);
    await onLogout();
  }

  const VISIBLE_TABS = new Set<Tab>(['overview', 'bookings', 'feedback', 'team', 'qr', 'settings', 'nurse', 'nurse_assistant', 'inventory', 'client_management', 'remittance', 'finance', 'finance_recording', 'products', 'booking_staff', 'consultations', 'head_clinical_ops', 'bugtrack', 'wishlist']);

  interface NavItem { key: Tab; label: string; icon: React.ElementType; permission?: PermissionKey }
  const tabs: NavItem[] = [
    { key: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'bookings', label: 'Bookings', icon: ClipboardList },
    { key: 'feedback', label: 'Client Feedback', icon: MessageSquare },
    { key: 'client_management', label: 'Client Management', icon: Contact, permission: 'clients.view' },
    { key: 'operations', label: 'Operations', icon: Activity },
    { key: 'team', label: 'Team Members', icon: ShieldCheck, permission: 'team.manage' },
    { key: 'settings', label: 'Settings', icon: Settings2, permission: 'settings.manage' },
    { key: 'qr', label: 'QR Codes', icon: QrCode },
    { key: 'finance', label: 'Finance Center', icon: DollarSign, permission: 'finance.view_summary' },
    { key: 'reports', label: 'Reports', icon: BarChart3 },
    { key: 'billing', label: 'Billing', icon: Wallet },
    { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
    { key: 'inventory', label: 'Inventory', icon: Package, permission: 'inventory.view' },
    { key: 'products', label: 'Products & Packages', icon: Boxes, permission: 'catalog.view' },
    { key: 'documents', label: 'Documents', icon: FileText },
    { key: 'nurse', label: 'Nurse', icon: Stethoscope, permission: 'nurse.view' },
    { key: 'nurse_assistant', label: 'Nurse Assistant', icon: Stethoscope, permission: 'nurse_assistant.view' },
    { key: 'booking_staff', label: 'Booking Staff', icon: Contact, permission: 'booking_staff.view' },
    { key: 'consultations', label: 'Consultations', icon: Stethoscope, permission: 'consultations.view' },
    { key: 'head_clinical_ops', label: 'Head of Clinical Ops', icon: Stethoscope, permission: 'head_clinical_ops.view' },
    { key: 'remittance', label: 'Remittance Review', icon: ShieldCheck, permission: 'payments.confirm_remittance' },
    { key: 'finance_recording', label: 'Financial Recording', icon: Wallet, permission: 'finance.view_summary' },
    { key: 'bugtrack', label: 'BugTrack', icon: Bug },
    { key: 'wishlist', label: 'Wishlist', icon: Lightbulb },
  ];

  const isVisible = (t: NavItem) => VISIBLE_TABS.has(t.key) && (!t.permission || can(t.permission));
  const tabMap = new Map(tabs.map(t => [t.key, t]));

  const navGroups: { label: string; items: Tab[] }[] = [
    { label: 'Overview', items: ['overview', 'bookings'] },
    { label: 'Client Management', items: ['client_management', 'feedback'] },
    { label: 'Clinical & Operations', items: ['nurse', 'nurse_assistant', 'booking_staff', 'consultations', 'head_clinical_ops'] },
    { label: 'Finance', items: ['finance', 'remittance', 'finance_recording'] },
    { label: 'Inventory', items: ['inventory', 'products'] },
    { label: 'Administration', items: ['team', 'qr', 'settings', 'bugtrack', 'wishlist'] },
  ];

  function selectTab(t: Tab) {
    setTab(t);
    setMobileOpen(false);
  }

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-60';

  const SidebarContent = (
    <div className="flex flex-col h-full">
      {/* Collapse toggle (desktop only) */}
      <div className="hidden lg:flex items-center justify-end px-3 py-3 border-b border-slate-100">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {navGroups.map(group => {
          const items = group.items.map(k => tabMap.get(k)).filter((t): t is NavItem => !!t && isVisible(t));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
              )}
              <div className="space-y-0.5">
                {items.map(t => {
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => selectTab(t.key)}
                      title={collapsed ? t.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        active
                          ? 'bg-teal-50 text-teal-700 border border-teal-200'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 border border-transparent'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <t.icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                      {!collapsed && <span className="truncate">{t.label}</span>}
                      {!collapsed && t.key === 'team' && can('team.manage') && (
                        <span className="ml-auto px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md leading-tight">ADMIN</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-3 border-t border-slate-100 space-y-2">
        <div className={`flex items-center gap-2 px-2 py-2 rounded-xl bg-slate-50 border border-slate-100 ${collapsed ? 'justify-center' : ''}`}>
          {isSuperAdmin && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
          <div className="w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-3.5 h-3.5 text-teal-600" />
          </div>
          {!collapsed && <span className="text-xs font-semibold text-slate-600 truncate">{userEmail}</span>}
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title={collapsed ? 'Sign Out' : undefined}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50 ${collapsed ? 'justify-center' : ''}`}
        >
          {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile header */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-slate-800">{tabMap.get(tab)?.label ?? 'Dashboard'}</span>
          <div className="w-9" />
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div className={`lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-xl transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {SidebarContent}
      </div>

      {/* Desktop layout: sidebar + content */}
      <div className="flex">
        <aside className={`hidden lg:block ${sidebarWidth} flex-shrink-0 h-screen sticky top-0 bg-white border-r border-slate-100 transition-all duration-200`}>
          {SidebarContent}
        </aside>

        <main className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            <DashboardErrorBoundary>
            {tab === 'overview' && <OperationsOverview userEmail={userEmail} permissions={permissions} onNavigate={(t) => setTab(t as Tab)} />}
            {tab === 'bookings' && <BookingsTab userEmail={userEmail} canViewSensitive={can('clients.view')} />}
            {tab === 'feedback' && <FeedbackTab userEmail={userEmail} />}
            {tab === 'client_management' && can('clients.view') && <ClientManagementTab canManage={can('clients.manage')} canViewSensitive={can('clients.view')} canDelete={can('clients.delete')} />}
            {tab === 'operations' && <OperationsTab canManage={can('appointments.delete')} userEmail={userEmail} canViewSensitive={can('clients.view')} />}
            {tab === 'team' && can('team.manage') && <TeamMembersTab canAdd={can('team.add')} canEdit={can('team.edit')} canDelete={can('team.delete')} />}
            {tab === 'settings' && can('settings.manage') && <SettingsTab />}
            {tab === 'qr' && <QRCodesTab canManage={can('qr.manage')} />}
            {tab === 'finance' && <ExecutiveFinanceCenter canManage={can('finance.manage')} userEmail={userEmail} />}
            {tab === 'reports' && <ReportsTab />}
            {tab === 'billing' && <BillingTab canManage={can('billing.delete')} />}
            {tab === 'attendance' && <AttendanceTab canManage={can('attendance.delete')} />}
            {tab === 'inventory' && <InventoryTab canManage={can('inventory.manage')} canPurchase={can('inventory.purchasing')} canViewReports={can('inventory.reports')} canDelete={can('inventory.delete')} canRequest={can('inventory.requests') || can('inventory.view')} canAudit={can('inventory.audit')} canManageKits={can('inventory.kits')} canManageTransfers={can('inventory.transfers')} userEmail={userEmail} />}
            {tab === 'products' && can('catalog.view') && <ProductsPackagesTab canCreate={can('catalog.create')} canEdit={can('catalog.edit')} canActivate={can('catalog.activate')} canManagePricing={can('catalog.manage_pricing')} canManageRecipes={can('catalog.manage_recipes')} canManageCategories={can('catalog.manage_categories')} canDelete={can('catalog.delete')} />}
            {tab === 'documents' && <DocumentsTab canManage={can('documents.delete')} />}
            {tab === 'nurse' && can('nurse.view') && <NurseDashboardTab userEmail={userEmail} memberRole={memberRole} memberBranchId={memberBranchId} permissions={permissions} />}
            {tab === 'nurse_assistant' && can('nurse_assistant.view') && <NurseAssistantDashboardTab userEmail={userEmail} memberRole={memberRole} memberBranchId={memberBranchId} permissions={permissions} />}
            {tab === 'remittance' && can('payments.confirm_remittance') && <AdminRemittanceReview userEmail={userEmail} userRole={memberRole ?? 'staff'} userUserId={sessionUserId} />}
            {tab === 'finance_recording' && can('finance.view_summary') && <FinancialRecording userEmail={userEmail} userRole={memberRole ?? 'staff'} />}
            {tab === 'booking_staff' && can('booking_staff.view') && <BookingsTab userEmail={userEmail} canViewSensitive={can('clients.view')} canManage={can('bookings.manage')} />}
            {tab === 'consultations' && can('consultations.view') && <ConsultationRequestsTab userEmail={userEmail} canCreate={can('consultations.create')} canManage={can('consultations.manage')} canRecommend={can('consultations.recommend')} />}
            {tab === 'head_clinical_ops' && can('head_clinical_ops.view') && <HeadOfClinicalOperationsDashboard userEmail={userEmail} permissions={permissions} />}
            {tab === 'bugtrack' && <BugTrack userEmail={userEmail} memberRole={memberRole} />}
            {tab === 'wishlist' && <Wishlist userEmail={userEmail} memberRole={memberRole} />}
            </DashboardErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
