import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, Calendar, Clock, User, AlertCircle, ClipboardList, BadgeCheck,
  Stethoscope, Package, Users, ShieldCheck, Activity, ChevronRight, Loader2,
  CreditCard, FileText, CalendarPlus, Truck, AlertTriangle, CheckCircle,
  Hourglass, XCircle, Info,
} from 'lucide-react';
import { supabase, type ClientBooking, type PermissionKey, type TeamMember, buildMemberLookup, resolveMemberName, type MemberLookup } from '../lib/supabase';
import { fetchInventoryAlerts, InventoryAlertsWidget, type InventoryAlertCounts } from './NurseSharedWidgets';

interface OperationsOverviewProps {
  userEmail: string;
  permissions: Set<string>;
  onNavigate: (tab: string) => void;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApptRow {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  service: string | null;
  status: string;
  payment_status: string;
  intake_form_status: string;
  location: string | null;
  nurse_name: string | null;
  driver_name: string | null;
  booking_id: string | null;
  completed_at: string | null;
  clients: { id: string; full_name: string } | null;
  branches: { name: string } | null;
}

interface ConsentRow {
  appointment_id: string;
  status: string;
}

interface TreatmentNoteRow {
  appointment_id: string;
  adverse_reaction: boolean;
  client_id: string;
}

interface OrderRow {
  id: string;
  total_amount: number;
  status: string;
  appointment_id: string | null;
  created_at: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  order_id: string;
  appointment_id: string | null;
}

interface TeamMemberRow {
  id: string;
  full_name: string | null;
  role: string;
  email: string;
}

interface TimeLogRow {
  team_member_id: string;
  staff_name: string;
  clock_in: string;
  clock_out: string | null;
}

interface DashboardData {
  bookings: ClientBooking[];
  appts: ApptRow[];
  consents: ConsentRow[];
  treatmentNotes: TreatmentNoteRow[];
  orders: OrderRow[];
  payments: PaymentRow[];
  teamMembers: TeamMemberRow[];
  timeLogs: TimeLogRow[];
  invAlerts: InventoryAlertCounts | null;
}

interface LoadResult {
  data: DashboardData | null;
  error: string | null;
}

// ─── Business timezone ───────────────────────────────────────────────────────

const BUSINESS_TIMEZONE = 'Asia/Manila';

function getBusinessDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

function getBusinessTimestamp(): Date {
  const now = new Date();
  const manilaStr = now.toLocaleString('en-US', { timeZone: BUSINESS_TIMEZONE });
  return new Date(manilaStr);
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const isThisYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(isThisYear ? {} : { year: 'numeric' }) });
}

function daysBetween(dateStr: string, refDate: string): number {
  const [y1, m1, d1] = dateStr.split('-').map(Number);
  const [y2, m2, d2] = refDate.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ─── Status configs ──────────────────────────────────────────────────────────

const APPT_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  dispatched: { label: 'Dispatched', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  arrived: { label: 'Arrived', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_treatment: { label: 'In Treatment', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Partial', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending: { label: 'Pending', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const INTAKE_CFG: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDING: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

// ─── Attention item ──────────────────────────────────────────────────────────

interface AttentionItem {
  id: string;
  name: string;
  issue: string;
  due: string;
  severity: 'critical' | 'high' | 'medium';
  action: () => void;
  icon: React.ElementType;
  overdueDays: number;
}

const SEVERITY_CFG: Record<string, { cls: string; label: string }> = {
  critical: { cls: 'bg-red-50 text-red-600 border-red-200', label: 'Critical' },
  high: { cls: 'bg-amber-50 text-amber-600 border-amber-200', label: 'High' },
  medium: { cls: 'bg-blue-50 text-blue-600 border-blue-200', label: 'Medium' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OperationsOverview({ userEmail, permissions, onNavigate }: OperationsOverviewProps) {
  const can = (p: PermissionKey) => permissions.has(p);
  const canViewInventory = can('inventory.view');
  const canViewClients = can('clients.view');
  const canViewFinance = can('finance.manage');
  const canManageBookings = can('bookings.delete');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const today = getBusinessDate();
      const queries = await Promise.all([
        supabase.from('client_bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('appointments')
          .select('id, scheduled_date, scheduled_time, service, status, payment_status, intake_form_status, location, nurse_name, driver_name, booking_id, completed_at, clients(id, full_name), branches(name)')
          .order('scheduled_date', { ascending: false }),
        supabase.from('client_consent_records').select('appointment_id, status'),
        supabase.from('client_treatment_notes').select('appointment_id, adverse_reaction, client_id'),
        supabase.from('orders').select('id, total_amount, status, appointment_id, created_at'),
        supabase.from('payments').select('id, amount, method, paid_at, order_id, appointment_id'),
        supabase.from('team_members').select('id, full_name, role, email').eq('status', 'approved'),
        supabase.from('time_logs').select('team_member_id, staff_name, clock_in, clock_out'),
      ]);

      const errors = queries.filter(q => q.error);
      if (errors.length > 0) {
        throw new Error(errors[0].error?.message ?? 'Failed to load dashboard data');
      }

      let invAlerts: InventoryAlertCounts | null = null;
      if (canViewInventory) {
        invAlerts = await fetchInventoryAlerts();
      }

      setData({
        bookings: queries[0].data as ClientBooking[],
        appts: queries[1].data as ApptRow[],
        consents: queries[2].data as ConsentRow[],
        treatmentNotes: queries[3].data as TreatmentNoteRow[],
        orders: queries[4].data as OrderRow[],
        payments: queries[5].data as PaymentRow[],
        teamMembers: queries[6].data as TeamMemberRow[],
        timeLogs: queries[7].data as TimeLogRow[],
        invAlerts,
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewInventory]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    refreshTimer.current = setInterval(() => load(true), 60000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [load]);

  // ─── Derived data ───────────────────────────────────────────────────────────

  const businessDate = getBusinessDate();
  const allBookings = data?.bookings ?? [];
  const allAppts = data?.appts ?? [];
  const allConsents = data?.consents ?? [];
  const allNotes = data?.treatmentNotes ?? [];
  const allOrders = data?.orders ?? [];
  const allPayments = data?.payments ?? [];
  const allTeamMembers = data?.teamMembers ?? [];
  const memberLookup: MemberLookup = buildMemberLookup(allTeamMembers as unknown as TeamMember[]);
  const allTimeLogs = data?.timeLogs ?? [];

  // Active appointments = not cancelled
  const activeAppts = allAppts.filter(a => a.status !== 'cancelled');
  const todaysAppts = activeAppts.filter(a => a.scheduled_date === businessDate);
  const todaysCompleted = activeAppts.filter(a => a.status === 'completed' && a.completed_at && a.completed_at.slice(0, 10) === businessDate);

  // Confirmed bookings awaiting scheduling = CONFIRMED, not cancelled, no active appointment
  const apptBookingIds = new Set(activeAppts.map(a => a.booking_id).filter(Boolean));
  const confirmedAwaitingSched = allBookings.filter(b =>
    b.status === 'CONFIRMED' && !apptBookingIds.has(b.id)
  );

  // Pending intake = active records with pending intake
  const pendingIntakeBookings = allBookings.filter(b =>
    b.status !== 'CANCELLED' && b.intake_form_status === 'PENDING'
  );
  const pendingIntakeAppts = activeAppts.filter(a => a.intake_form_status === 'pending');
  const pendingIntakeCount = pendingIntakeBookings.length + pendingIntakeAppts.length;

  // Pending payment = active appointments with payment_status != paid
  const pendingPayments = activeAppts.filter(a => a.payment_status !== 'paid');

  // Cancelled today = appointments cancelled today (no cancelled_at timestamp, so count cancelled bookings by preferred_date)
  // No cancelled_at column exists; we count cancelled bookings whose preferred_date is today
  const cancelledToday = allBookings.filter(b =>
    b.status === 'CANCELLED' && b.preferred_date === businessDate
  );

  // Expected revenue today = sum of order total_amount for orders linked to today's active appointments
  const todaysApptIds = new Set(todaysAppts.map(a => a.id));
  const todaysOrders = allOrders.filter(o => o.appointment_id && todaysApptIds.has(o.appointment_id));
  const expectedRevenueToday = todaysOrders.length > 0
    ? todaysOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)
    : null;

  // Collected today = sum of payments paid today
  const collectedToday = allPayments
    .filter(p => p.paid_at && p.paid_at.slice(0, 10) === businessDate)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Pending today = sum of order balances for today's appointments with partial/pending status
  const pendingTodayAmount = todaysOrders
    .filter(o => o.status !== 'paid')
    .reduce((sum, o) => {
      const paidForOrder = allPayments
        .filter(p => p.order_id === o.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      return sum + (Number(o.total_amount) - paidForOrder);
    }, 0);

  // ─── KPI definitions ────────────────────────────────────────────────────────

  const kpis = [
    {
      label: "Today's Appointments",
      value: todaysAppts.length,
      icon: Calendar,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      tooltip: 'Active appointments scheduled for today (excludes cancelled)',
      onClick: () => onNavigate('operations'),
    },
    {
      label: 'Confirmed Awaiting Scheduling',
      value: confirmedAwaitingSched.length,
      icon: Hourglass,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      tooltip: 'Confirmed bookings without an active appointment yet',
      onClick: () => onNavigate('bookings'),
    },
    {
      label: 'Pending Intake',
      value: pendingIntakeCount,
      icon: FileText,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      tooltip: 'Active records where intake form is not completed',
      onClick: () => onNavigate('bookings'),
    },
    {
      label: 'Pending Payment',
      value: pendingPayments.length,
      icon: CreditCard,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      tooltip: 'Active appointments with unpaid or partially paid status',
      onClick: () => onNavigate('operations'),
    },
    {
      label: 'Cancelled Today',
      value: cancelledToday.length,
      icon: XCircle,
      color: 'text-slate-600',
      bg: 'bg-slate-100',
      tooltip: 'Bookings cancelled for today\u2019s date',
      onClick: () => onNavigate('bookings'),
    },
    {
      label: 'Completed Today',
      value: todaysCompleted.length,
      icon: CheckCircle,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      tooltip: 'Treatments completed today',
      onClick: () => onNavigate('operations'),
    },
  ];

  // ─── Needs Attention ───────────────────────────────────────────────────────

  const consentByAppt = new Map<string, string>();
  allConsents.forEach(c => {
    if (c.appointment_id) consentByAppt.set(c.appointment_id, c.status);
  });

  const adverseReactionsByClient = new Set<string>();
  allNotes.forEach(n => {
    if (n.adverse_reaction && n.client_id) adverseReactionsByClient.add(n.client_id);
  });

  const attentionItems: AttentionItem[] = [];

  // Critical: Appointment today with missing consent
  todaysAppts.forEach(a => {
    const consentStatus = a.booking_id ? consentByAppt.get(a.id) : null;
    const bookingConsent = allBookings.find(b => b.id === a.booking_id)?.consent_given;
    if (!consentStatus && !bookingConsent) {
      attentionItems.push({
        id: a.id + '-consent',
        name: a.clients?.full_name ?? 'Unknown',
        issue: 'Missing consent for today\u2019s appointment',
        due: fmtTime(a.scheduled_time),
        severity: 'critical',
        action: () => onNavigate('nurse'),
        icon: ShieldCheck,
        overdueDays: 0,
      });
    }
  });

  // Critical: Appointment today with no assigned nurse
  todaysAppts.forEach(a => {
    if (!a.nurse_name) {
      attentionItems.push({
        id: a.id + '-nurse',
        name: a.clients?.full_name ?? 'Unknown',
        issue: 'No nurse assigned for today\u2019s appointment',
        due: fmtTime(a.scheduled_time),
        severity: 'critical',
        action: () => onNavigate('operations'),
        icon: User,
        overdueDays: 0,
      });
    }
  });

  // Critical: Previous adverse reaction requiring review
  todaysAppts.forEach(a => {
    const clientId = a.clients?.id;
    if (clientId && adverseReactionsByClient.has(clientId)) {
      attentionItems.push({
        id: a.id + '-adverse',
        name: a.clients?.full_name ?? 'Unknown',
        issue: 'Previous adverse reaction — review before treatment',
        due: fmtTime(a.scheduled_time),
        severity: 'critical',
        action: () => onNavigate('nurse'),
        icon: AlertTriangle,
        overdueDays: 0,
      });
    }
  });

  // High: Confirmed booking awaiting scheduling beyond 1 day
  confirmedAwaitingSched.forEach(b => {
    const overdue = daysBetween(b.preferred_date, businessDate);
    if (overdue > 0) {
      attentionItems.push({
        id: b.id + '-awaiting',
        name: b.full_name,
        issue: `Confirmed booking awaiting scheduling (${overdue}d overdue)`,
        due: fmtDateShort(b.preferred_date),
        severity: 'high',
        action: () => onNavigate('bookings'),
        icon: Hourglass,
        overdueDays: overdue,
      });
    }
  });

  // High: Past-due scheduled appointments (still "scheduled" but date has passed)
  activeAppts.filter(a => a.status === 'scheduled' && a.scheduled_date < businessDate).forEach(a => {
    const overdue = daysBetween(a.scheduled_date, businessDate);
    attentionItems.push({
      id: a.id + '-overdue',
      name: a.clients?.full_name ?? 'Unknown',
      issue: `Appointment past due — still scheduled (${overdue}d overdue)`,
      due: fmtDateShort(a.scheduled_date),
      severity: 'high',
      action: () => onNavigate('operations'),
      icon: AlertTriangle,
      overdueDays: overdue,
    });
  });

  // High: Appointment today with pending intake
  todaysAppts.forEach(a => {
    if (a.intake_form_status === 'pending') {
      attentionItems.push({
        id: a.id + '-intake',
        name: a.clients?.full_name ?? 'Unknown',
        issue: 'Intake incomplete for today\u2019s appointment',
        due: fmtTime(a.scheduled_time),
        severity: 'high',
        action: () => onNavigate('nurse'),
        icon: FileText,
        overdueDays: 0,
      });
    }
  });

  // High: Payment required before service but still pending
  todaysAppts.forEach(a => {
    if (a.payment_status === 'pending') {
      attentionItems.push({
        id: a.id + '-payment',
        name: a.clients?.full_name ?? 'Unknown',
        issue: 'Payment pending for today\u2019s appointment',
        due: fmtTime(a.scheduled_time),
        severity: 'high',
        action: () => onNavigate('operations'),
        icon: CreditCard,
        overdueDays: 0,
      });
    }
  });

  // High: Appointment not acknowledged by nurse (has assigned_nurse_id but no nurse_acknowledged_at)
  const todaysApptBookingIds = new Set(todaysAppts.map(a => a.booking_id).filter(Boolean));
  allBookings.filter(b => todaysApptBookingIds.has(b.id) && b.assigned_nurse_id && !b.nurse_acknowledged_at).forEach(b => {
    attentionItems.push({
      id: b.id + '-ack',
      name: b.full_name,
      issue: 'Nurse acknowledgment pending for today\u2019s appointment',
      due: fmtDateShort(b.preferred_date),
      severity: 'high',
      action: () => onNavigate('nurse'),
      icon: Stethoscope,
      overdueDays: 0,
    });
  });

  // Sort by severity then overdue
  const sevOrder = { critical: 0, high: 1, medium: 2 };
  attentionItems.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.overdueDays - a.overdueDays);

  // ─── Pipeline ───────────────────────────────────────────────────────────────

  const pipeline = [
    {
      label: 'New Inquiry',
      count: allBookings.filter(b => b.status === 'NEW').length,
      icon: ClipboardList,
      color: 'text-slate-600',
      onClick: () => onNavigate('bookings'),
    },
    {
      label: 'Awaiting Intake',
      count: allBookings.filter(b => b.status !== 'CANCELLED' && b.intake_form_status === 'PENDING').length,
      icon: FileText,
      color: 'text-amber-600',
      onClick: () => onNavigate('bookings'),
    },
    {
      label: 'For Medical Review',
      count: 0,
      icon: Stethoscope,
      color: 'text-blue-600',
      onClick: () => onNavigate('nurse'),
      na: true,
    },
    {
      label: 'Ready for Scheduling',
      count: confirmedAwaitingSched.length,
      icon: BadgeCheck,
      color: 'text-emerald-600',
      onClick: () => onNavigate('bookings'),
    },
    {
      label: 'Scheduled',
      count: activeAppts.filter(a => a.status === 'scheduled').length,
      icon: Calendar,
      color: 'text-teal-600',
      onClick: () => onNavigate('operations'),
    },
    {
      label: 'In Treatment',
      count: activeAppts.filter(a => a.status === 'in_treatment').length,
      icon: Activity,
      color: 'text-indigo-600',
      onClick: () => onNavigate('operations'),
    },
    {
      label: 'Completed',
      count: activeAppts.filter(a => a.status === 'completed').length,
      icon: CheckCircle,
      color: 'text-emerald-600',
      onClick: () => onNavigate('operations'),
    },
  ];

  // ─── Team Readiness ────────────────────────────────────────────────────────

  const todaysTimeLogs = allTimeLogs.filter(tl => tl.clock_in && tl.clock_in.slice(0, 10) === businessDate);
  const clockedInMemberIds = new Set(todaysTimeLogs.filter(tl => !tl.clock_out).map(tl => tl.team_member_id));
  const nursesOnDuty = allTeamMembers.filter(m => m.role === 'nurse' || m.role === 'superadmin');
  const nursesClockedIn = nursesOnDuty.filter(m => clockedInMemberIds.has(m.id));
  const apptsWithoutNurse = todaysAppts.filter(a => !a.nurse_name);
  const nurseAcksPending = allBookings.filter(b =>
    todaysApptBookingIds.has(b.id) && b.assigned_nurse_id && !b.nurse_acknowledged_at
  ).length;

  // ─── Quick Actions ──────────────────────────────────────────────────────────

  const quickActions: { label: string; icon: React.ElementType; onClick: () => void; show: boolean }[] = [
    { label: 'Add Manual Booking', icon: CalendarPlus, onClick: () => onNavigate('bookings'), show: true },
    { label: "View Today's Appointments", icon: Calendar, onClick: () => onNavigate('operations'), show: true },
    { label: 'Open Client Management', icon: Users, onClick: () => onNavigate('client_management'), show: can('clients.view') },
    { label: 'Assign Nurse', icon: Stethoscope, onClick: () => onNavigate('nurse'), show: can('nurse.view') },
    { label: 'Review Pending Intake', icon: FileText, onClick: () => onNavigate('bookings'), show: true },
    { label: 'Open Inventory', icon: Package, onClick: () => onNavigate('inventory'), show: canViewInventory },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  const businessDateDisplay = new Date(businessDate + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: BUSINESS_TIMEZONE,
  });

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: BUSINESS_TIMEZONE })
    : '—';

  return (
    <div className="space-y-5">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Executive Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time business performance and operational health at a glance.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {businessDateDisplay}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {BUSINESS_TIMEZONE}
            </span>
            {lastUpdated && (
              <span className="flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                Last updated: {lastUpdatedStr}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${(loading || refreshing) ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => load(true)} className="text-xs font-bold text-red-700 hover:text-red-800 underline">
            Retry
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div className="w-9 h-9 bg-slate-200 rounded-xl mb-3" />
                <div className="h-8 bg-slate-200 rounded w-16 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-24" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-40 mb-4" />
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl mb-2" />)}
            </div>
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div className="h-5 bg-slate-200 rounded w-32 mb-4" />
                <div className="h-8 bg-slate-100 rounded mb-2" />
                <div className="h-8 bg-slate-100 rounded mb-2" />
              </div>
            </div>
          </div>
        </div>
      ) : data ? (
        <>
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map(k => {
              const Icon = k.icon;
              return (
              <button
                key={k.label}
                onClick={k.onClick}
                title={k.tooltip}
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md hover:border-teal-200 transition-all"
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`w-9 h-9 ${k.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${k.color}`} />
                  </div>
                </div>
                <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1 leading-tight">{k.label}</p>
              </button>
              );
            })}
            {canViewFinance && (
              <button
                onClick={() => onNavigate('billing')}
                title="Total payments collected today"
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md hover:border-teal-200 transition-all"
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-5 h-5 text-teal-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-teal-600">₱{collectedToday.toLocaleString()}</p>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mt-1 leading-tight">Collected Today</p>
              </button>
            )}
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Needs Attention + Today's Schedule */}
            <div className="lg:col-span-2 space-y-5">
              {/* Needs Attention */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base font-bold text-slate-800">Needs Attention</h2>
                  {attentionItems.length > 0 && (
                    <span className="ml-auto text-xs font-bold text-white bg-amber-500 px-2 py-0.5 rounded-full">{attentionItems.length}</span>
                  )}
                </div>
                {attentionItems.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-7 h-7 text-emerald-500" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Nothing needs attention right now</p>
                    <p className="text-xs text-slate-400 mt-1">All operational items are on track.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {attentionItems.map(item => {
                      const sev = SEVERITY_CFG[item.severity];
                      const ItemIcon = item.icon;
                      return (
                        <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border flex-shrink-0 ${sev.cls}`}>
                            <ItemIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.issue} · {item.due}</p>
                          </div>
                          {item.overdueDays > 0 && (
                            <span className="hidden sm:inline-block text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              {item.overdueDays}d overdue
                            </span>
                          )}
                          <span className={`hidden sm:inline-block text-xs font-bold px-2 py-0.5 rounded-full border ${sev.cls}`}>
                            {sev.label}
                          </span>
                          <button
                            onClick={item.action}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors flex-shrink-0"
                          >
                            View <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Today's Schedule */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-teal-600" />
                  <h2 className="text-base font-bold text-slate-800">Today's Schedule</h2>
                  <span className="ml-auto text-xs font-semibold text-slate-400">{todaysAppts.length} appointments</span>
                </div>
                {todaysAppts.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Calendar className="w-7 h-7 text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">No active appointments scheduled for today</p>
                    <p className="text-xs text-slate-400 mt-1 mb-4">Create a booking or schedule a confirmed booking as an appointment.</p>
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => onNavigate('bookings')}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors"
                      >
                        <ClipboardList className="w-4 h-4" /> View Bookings
                      </button>
                      <button
                        onClick={() => onNavigate('bookings')}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors"
                      >
                        <CalendarPlus className="w-4 h-4" /> Add Manual Booking
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto -mx-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                            <th className="font-semibold px-3 py-2">Time</th>
                            <th className="font-semibold px-3 py-2">Client</th>
                            <th className="font-semibold px-3 py-2">Service</th>
                            <th className="font-semibold px-3 py-2">Location</th>
                            <th className="font-semibold px-3 py-2">Nurse</th>
                            <th className="font-semibold px-3 py-2">Intake</th>
                            <th className="font-semibold px-3 py-2">Payment</th>
                            <th className="font-semibold px-3 py-2">Status</th>
                            <th className="font-semibold px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {todaysAppts.map(a => {
                            const apptCfg = APPT_STATUS_CFG[a.status] ?? { label: a.status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                            const payCfg = PAYMENT_CFG[a.payment_status] ?? { label: a.payment_status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                            const intakeCfg = INTAKE_CFG[a.intake_form_status] ?? { label: a.intake_form_status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                            const consentStatus = a.booking_id ? consentByAppt.get(a.id) : null;
                            const bookingConsent = allBookings.find(b => b.id === a.booking_id)?.consent_given;
                            const hasConsent = consentStatus === 'signed' || bookingConsent === true;
                            return (
                              <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">{fmtTime(a.scheduled_time)}</td>
                                <td className="px-3 py-3 font-semibold text-slate-800">{a.clients?.full_name ?? '—'}</td>
                                <td className="px-3 py-3 text-slate-600">{a.service ?? '—'}</td>
                                <td className="px-3 py-3 text-slate-600">{a.location ?? a.branches?.name ?? '—'}</td>
                                <td className="px-3 py-3 text-slate-600">
                                  {a.nurse_name ? resolveMemberName(a.nurse_name, memberLookup) : <span className="text-red-600 font-semibold">Unassigned</span>}
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${intakeCfg.cls}`}>
                                    {intakeCfg.label}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${payCfg.cls}`}>
                                    {payCfg.label}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex items-center gap-1">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${apptCfg.cls}`}>
                                      {apptCfg.label}
                                    </span>
                                    {!hasConsent && a.status !== 'completed' && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border text-xs font-bold bg-red-50 text-red-700 border-red-200" title="Consent missing">
                                        <ShieldCheck className="w-3 h-3" />
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <button
                                    onClick={() => onNavigate('operations')}
                                    className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-3">
                      {todaysAppts.map(a => {
                        const apptCfg = APPT_STATUS_CFG[a.status] ?? { label: a.status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                        const payCfg = PAYMENT_CFG[a.payment_status] ?? { label: a.payment_status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                        const intakeCfg = INTAKE_CFG[a.intake_form_status] ?? { label: a.intake_form_status, cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                        const consentStatus = a.booking_id ? consentByAppt.get(a.id) : null;
                        const bookingConsent = allBookings.find(b => b.id === a.booking_id)?.consent_given;
                        const hasConsent = consentStatus === 'signed' || bookingConsent === true;
                        return (
                          <div key={a.id} className="p-3 rounded-xl border border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-slate-700">{fmtTime(a.scheduled_time)}</span>
                              <div className="flex items-center gap-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${apptCfg.cls}`}>
                                  {apptCfg.label}
                                </span>
                                {!hasConsent && a.status !== 'completed' && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full border text-xs font-bold bg-red-50 text-red-700 border-red-200" title="Consent missing">
                                    <ShieldCheck className="w-3 h-3" />
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-slate-800">{a.clients?.full_name ?? '—'}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{a.service ?? '—'}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${intakeCfg.cls}`}>
                                {intakeCfg.label}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${payCfg.cls}`}>
                                {payCfg.label}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                              <span className="text-xs text-slate-500">
                                {a.nurse_name ? resolveMemberName(a.nurse_name, memberLookup) : <span className="text-red-600 font-semibold">Unassigned</span>}
                              </span>
                              <button
                                onClick={() => onNavigate('operations')}
                                className="text-xs font-semibold text-teal-700"
                              >
                                View Details
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right column: Financial + Team + Inventory + Quick Actions */}
            <div className="space-y-5">
              {/* Financial Performance */}
              {canViewFinance && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard className="w-5 h-5 text-teal-600" />
                    <h2 className="text-base font-bold text-slate-800">Financial Performance</h2>
                  </div>
                  <div className="space-y-2.5">
                    <ReadinessRow label="Collected Today" value={`₱${collectedToday.toLocaleString()}`} />
                    <ReadinessRow label="Pending Today" value={`₱${pendingTodayAmount.toLocaleString()}`} />
                    <ReadinessRow
                      label="Expected Revenue Today"
                      value={expectedRevenueToday !== null ? `₱${expectedRevenueToday.toLocaleString()}` : 'Not Available'}
                    />
                    <ReadinessRow label="Partially Paid Orders" value={todaysOrders.filter(o => o.status === 'partial').length.toString()} />
                  </div>
                  <button
                    onClick={() => onNavigate('finance')}
                    className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors"
                  >
                    <CreditCard className="w-4 h-4" /> View Billing
                  </button>
                </div>
              )}

              {/* Team Readiness */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-teal-600" />
                  <h2 className="text-base font-bold text-slate-800">Team Readiness</h2>
                </div>
                <div className="space-y-2.5">
                  <ReadinessRow label="Clocked In Today" value={nursesClockedIn.length.toString()} />
                  <ReadinessRow label="Appointments Without Nurse" value={apptsWithoutNurse.length.toString()} />
                  <ReadinessRow label="Nurse Acknowledgments Pending" value={nurseAcksPending.toString()} />
                  <ReadinessRow label="Drivers Assigned" value={todaysAppts.filter(a => a.driver_name).length.toString()} />
                  <ReadinessRow label="Drivers Pending" value={todaysAppts.filter(a => !a.driver_name && a.location).length.toString()} />
                </div>
              </div>

              {/* Inventory Alerts */}
              {canViewInventory && (
                <InventoryAlertsWidget
                  alerts={data?.invAlerts ?? null}
                  onViewInventory={() => onNavigate('inventory')}
                />
              )}

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-teal-600" />
                  <h2 className="text-base font-bold text-slate-800">Quick Actions</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.filter(a => a.show).map(a => {
                    const ActionIcon = a.icon;
                    return (
                    <button
                      key={a.label}
                      onClick={a.onClick}
                      className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-slate-700 rounded-xl border border-slate-100 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 transition-colors"
                    >
                      <ActionIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{a.label}</span>
                    </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Operational Pipeline */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-800">Operational Pipeline</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {pipeline.map((stage, idx) => {
                const StageIcon = stage.icon;
                return (
                  <div key={stage.label} className="relative">
                    {idx < pipeline.length - 1 && (
                      <div className="hidden lg:block absolute top-1/2 -right-2 w-4 h-px bg-slate-200" />
                    )}
                    <button
                      onClick={stage.onClick}
                      disabled={stage.na}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${stage.na ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60' : 'border-slate-100 hover:border-teal-200 hover:bg-teal-50'}`}
                    >
                      <StageIcon className={`w-5 h-5 ${stage.color} mb-2`} />
                      <p className={`text-2xl font-bold ${stage.color}`}>{stage.na ? 'N/A' : stage.count}</p>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5 leading-tight">{stage.label}</p>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : !error ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">No data available.</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Helper component ────────────────────────────────────────────────────────

function ReadinessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
    </div>
  );
}
