import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, AlertCircle, Calendar, Clock, MapPin, User, Stethoscope,
  Eye, CreditCard, Bell, FileText, X, CheckCircle, ChevronRight,
  ClipboardList, Hourglass, Activity, DollarSign, TrendingUp, Printer,
  ArrowLeft, MessageSquare, QrCode, Copy, Droplets, Mail, Phone,
  Users, HeartPulse, ShieldAlert, Syringe, Truck,
} from 'lucide-react';
import {
  supabase, type ClientBooking, type Branch, type TeamMember,
  type NurseNotification, type NurseCollection,
  memberDisplayName, buildMemberLookup, type MemberLookup,
} from '../lib/supabase';
import { RecordPaymentModal } from './NursePaymentModals';
import {
  getWfStage, WF_STAGE_CFG, WF_STAGE_ORDER, wfDuration, wfFmtTs,
  type WfAppointment,
} from './Dashboard';
import {
  AttendanceWidget, NeedsAttentionWidget, computeNeedsAttention,
  InventoryAlertsWidget, fetchInventoryAlerts, type InventoryAlertCounts,
  type AppointmentRowLite,
} from './NurseSharedWidgets';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssistantBooking extends ClientBooking {
  branches: { name: string } | null;
}

interface AppointmentLite {
  id: string;
  client_id: string | null;
  branch_id: string | null;
  scheduled_date: string;
  scheduled_time: string;
  service: string | null;
  catalog_item_id: string | null;
  inventory_deducted_at: string | null;
  inventory_deduction_issues: string[] | null;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  payment_method: string | null;
  booking_id: string | null;
  created_at: string | null;
  dispatched_at: string | null;
  arrived_at: string | null;
  treatment_started_at: string | null;
  completed_at: string | null;
  payment_recorded_at: string | null;
  payment_reference: string | null;
  intake_form_status: string;
  feedback_email_sent_at: string | null;
}

const ASSISTANT_STATUSES = ['Assigned', 'Preparing', 'Ready', 'In Progress', 'Completed'] as const;
type AssistantStatus = typeof ASSISTANT_STATUSES[number];

const STATUS_CFG: Record<AssistantStatus, { label: string; color: string; bg: string; dot: string }> = {
  'Assigned':    { label: 'Assigned',    color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200',       dot: 'bg-sky-500' },
  'Preparing':   { label: 'Preparing',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-500' },
  'Ready':       { label: 'Ready',       color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  'In Progress': { label: 'In Progress', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500' },
  'Completed':   { label: 'Completed',   color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
};

const PAYMENT_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: 'text-amber-700',  bg: 'bg-amber-100' },
  paid:     { label: 'Paid',     color: 'text-emerald-700',bg: 'bg-emerald-100' },
  partial:  { label: 'Partial',   color: 'text-blue-700',   bg: 'bg-blue-100' },
  waived:   { label: 'Waived',    color: 'text-slate-600',  bg: 'bg-slate-100' },
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  userEmail: string;
  memberRole: string;
  memberBranchId: string | null;
  permissions: Set<string>;
}

export default function NurseAssistantDashboardTab({ userEmail, memberBranchId, permissions }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookings, setBookings] = useState<AssistantBooking[]>([]);
  const [appointments, setAppointments] = useState<Map<string, AppointmentLite>>(new Map());
  const [collections, setCollections] = useState<NurseCollection[]>([]);
  const [notifications, setNotifications] = useState<NurseNotification[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [memberLookup, setMemberLookup] = useState<MemberLookup | null>(null);
  const [invAlerts, setInvAlerts] = useState<InventoryAlertCounts | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'list' | 'detail' | 'report'>('list');
  const [selectedBooking, setSelectedBooking] = useState<AssistantBooking | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAppointment, setPaymentAppointment] = useState<AppointmentLite | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  // ─── Availed service editing ───────────────────────────────────────────────
  // Mirrors the nurse dashboard: the assistant can correct the availed service
  // on site when the client changes their mind.
  const canEditService = permissions.has('appointments.edit_service');
  const [catalogOptions, setCatalogOptions] = useState<{ id: string; name: string }[]>([]);
  const [savingService, setSavingService] = useState(false);

  useEffect(() => {
    if (!canEditService) return;
    (async () => {
      const { data, error: catErr } = await supabase
        .from('catalog_items')
        .select('id, name')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (catErr) { console.error('[Service Editor] Failed to load catalog items:', catErr.message); return; }
      setCatalogOptions(data ?? []);
    })();
  }, [canEditService]);

  // Writes both the FK and the display text, matching the nurse dashboard.
  async function updateApptService(appt: AppointmentLite, catalogItemId: string) {
    const picked = catalogOptions.find(c => c.id === catalogItemId);
    if (!picked || picked.id === appt.catalog_item_id) return;

    setSavingService(true);
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({ catalog_item_id: picked.id, service: picked.name })
      .eq('id', appt.id);
    setSavingService(false);

    if (updateErr) { setError(`Failed to update the service: ${updateErr.message}`); return; }
    load();
  }

  // Load user id
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');

    try {
      const [bookingsRes, apptsRes, collectionsRes, notifRes, branchesRes, membersRes] = await Promise.all([
        supabase.from('client_bookings')
          .select('*, branches(name)')
          .eq('assigned_nurse_assistant_id', userId)
          .order('preferred_date', { ascending: false }),
        supabase.from('appointments').select('*'),
        supabase.from('nurse_collections').select('*').eq('collected_by', userId).order('collected_at', { ascending: false }),
        supabase.from('nurse_notifications').select('*').eq('recipient_user_id', userId).order('created_at', { ascending: false }),
        supabase.from('branches').select('*').order('name'),
        supabase.from('team_members').select('user_id, email, full_name, role'),
      ]);

      if (bookingsRes.error) throw bookingsRes.error;

      setBookings((bookingsRes.data as AssistantBooking[]) ?? []);
      setCollections((collectionsRes.data as NurseCollection[]) ?? []);
      setNotifications((notifRes.data as NurseNotification[]) ?? []);
      setBranches((branchesRes.data as Branch[]) ?? []);

      const apptMap = new Map<string, AppointmentLite>();
      (apptsRes.data as AppointmentLite[] | null)?.forEach(a => {
        if (a.booking_id) apptMap.set(a.booking_id, a);
      });
      setAppointments(apptMap);

      if (membersRes.data) {
        setMemberLookup(buildMemberLookup(membersRes.data as TeamMember[]));
      }

      const alerts = await fetchInventoryAlerts();
      setInvAlerts(alerts);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // ─── KPI Cards ───────────────────────────────────────────────────────────

  const today = todayStr();
  const todaysBookings = useMemo(() => bookings.filter(b => b.preferred_date === today), [bookings, today]);
  const todaysCompleted = todaysBookings.filter(b => b.assistant_status === 'Completed').length;
  const todaysInProgress = todaysBookings.filter(b => b.assistant_status === 'In Progress').length;
  const todaysWaiting = todaysBookings.filter(b =>
    b.assistant_status === 'Assigned' || b.assistant_status === 'Preparing' || b.assistant_status === 'Ready'
  ).length;
  const todaysCollections = useMemo(() =>
    collections.filter(c => c.collected_at && c.collected_at.slice(0, 10) === today),
    [collections, today]
  );
  const todaysCollectionTotal = todaysCollections.reduce((sum, c) => sum + (c.amount_received ?? 0), 0);
  const unreadNotifications = notifications.filter(n => n.status === 'unread').length;

  // ─── Needs Attention (reuses shared computation) ─────────────────────────
  const needsAttentionItems = useMemo(() => {
    const todayAppts = Array.from(appointments.values()).filter(
      a => a.scheduled_date === today && a.status !== 'cancelled'
    );
    return computeNeedsAttention(todayAppts.map(a => ({
      id: a.id,
      status: a.status,
      intake_form_status: a.intake_form_status ?? 'PENDING',
      booking_id: a.booking_id,
      feedback_email_sent_at: a.feedback_email_sent_at ?? null,
      scheduled_date: a.scheduled_date,
      scheduled_time: a.scheduled_time,
      clients: null,
    })));
  }, [appointments, today]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  async function updateStatus(booking: AssistantBooking, newStatus: AssistantStatus) {
    setStatusUpdating(booking.id);
    const { error: updErr } = await supabase
      .from('client_bookings')
      .update({ assistant_status: newStatus })
      .eq('id', booking.id);
    setStatusUpdating(null);
    if (updErr) { setError(updErr.message); return; }
    setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, assistant_status: newStatus } : b));
    if (selectedBooking?.id === booking.id) {
      setSelectedBooking(prev => prev ? { ...prev, assistant_status: newStatus } : prev);
    }

    const appt = appointments.get(booking.id);
    if (appt && appt.status !== 'cancelled') {
      const ORDER = ['scheduled', 'dispatched', 'arrived', 'in_treatment', 'completed'];
      let target: string | null = null;
      if (newStatus === 'In Progress') target = 'in_treatment';
      else if (newStatus === 'Completed') target = 'completed';
      if (target) {
        const currentIdx = ORDER.indexOf(appt.status);
        const targetIdx = ORDER.indexOf(target);
        if (targetIdx > currentIdx) {
          const now = new Date().toISOString();
          const update: Record<string, string> = { status: target };
          if (target === 'in_treatment') update.treatment_started_at = now;
          if (target === 'completed') update.completed_at = now;
          const { error: apptErr } = await supabase.from('appointments').update(update).eq('id', appt.id);
          // Send Thank You email only when appointment transitions to completed
          if (!apptErr && target === 'completed' && appt.status !== 'completed') {
            const clientEmail = booking.email ?? null;
            const clientFirstName = booking.full_name?.split(' ')[0] ?? 'Valued Client';
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
              console.warn('[Appointment Completed Email] Skipped: no client email for booking', booking.id);
            }
          }
        }
      }
    }
  }

  // Advance the linked appointment through the same Dispatch / Arrived / In Treatment / Completed
  // workflow used by the Nurse dashboard. Reuses the same status + timestamp fields.
  const APPT_NEXT: Record<string, { status: string; tsField: 'dispatched_at' | 'arrived_at' | 'treatment_started_at' | 'completed_at' } | null> = {
    scheduled: { status: 'dispatched', tsField: 'dispatched_at' },
    dispatched: { status: 'arrived', tsField: 'arrived_at' },
    arrived: { status: 'in_treatment', tsField: 'treatment_started_at' },
    in_treatment: { status: 'completed', tsField: 'completed_at' },
    completed: null,
  };

  async function advanceAppointmentStatus(booking: AssistantBooking) {
    const appt = appointments.get(booking.id);
    if (!appt || appt.status === 'cancelled') return;
    const next = APPT_NEXT[appt.status];
    if (!next) return;
    setStatusUpdating(booking.id);
    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('appointments')
      .update({ status: next.status, [next.tsField]: now })
      .eq('id', appt.id);
    setStatusUpdating(null);
    if (updErr) { setError(updErr.message); return; }
    const updatedAppt: AppointmentLite = { ...appt, status: next.status, [next.tsField]: now };
    setAppointments(prev => { const m = new Map(prev); m.set(booking.id, updatedAppt); return m; });
    if (selectedBooking?.id === booking.id) {
      setSelectedBooking(prev => prev ? { ...prev } : prev);
    }

    // Send Thank You email only when transitioning to completed
    if (next.status === 'completed' && appt.status !== 'completed') {
      const clientEmail = booking.email ?? null;
      const clientFirstName = booking.full_name?.split(' ')[0] ?? 'Valued Client';
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
      }
    }
  }

  function openDetail(booking: AssistantBooking) {
    setSelectedBooking(booking);
    setActiveView('detail');
  }

  function openPayment(booking: AssistantBooking) {
    const appt = appointments.get(booking.id);
    if (appt) {
      setPaymentAppointment(appt);
    } else {
      setPaymentAppointment({
        id: '',
        client_id: null,
        branch_id: booking.branch_id ?? null,
        scheduled_date: booking.preferred_date ?? '',
        scheduled_time: booking.preferred_time ? String(booking.preferred_time) : '',
        service: booking.services_requested?.length ? booking.services_requested.join(', ') : null,
        catalog_item_id: null,
        inventory_deducted_at: null,
        inventory_deduction_issues: null,
        status: '',
        payment_status: 'pending',
        payment_amount: null,
        payment_method: null,
        booking_id: booking.id,
        created_at: null,
        dispatched_at: null,
        arrived_at: null,
        treatment_started_at: null,
        completed_at: null,
        payment_recorded_at: null,
      });
    }
    setShowPaymentModal(true);
  }

  async function markNotificationRead(n: NurseNotification) {
    if (n.status !== 'unread') return;
    await supabase.from('nurse_notifications').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', n.id);
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, status: 'read' } : x));
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (error && bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-sm text-red-600 font-medium">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 text-sm font-semibold text-teal-700 border border-teal-200 rounded-xl hover:bg-teal-50">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Nurse Assistant Dashboard</h2>
          <p className="text-slate-500 mt-1 text-sm">Your assigned bookings, payments, and daily reports.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveView('list'); setSelectedBooking(null); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${activeView === 'list' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <ClipboardList className="w-4 h-4" /> My Bookings
          </button>
          <button
            onClick={() => setActiveView('report')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${activeView === 'report' ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <FileText className="w-4 h-4" /> End of Day Report
          </button>
        </div>
      </div>

      {/* Attendance — Clock In / Clock Out */}
      <AttendanceWidget userEmail={userEmail} branchId={memberBranchId} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={ClipboardList} label="Today's Bookings" value={todaysBookings.length} color="text-sky-600" bg="bg-sky-50" />
        <KpiCard icon={Hourglass} label="Waiting" value={todaysWaiting} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard icon={Activity} label="In Progress" value={todaysInProgress} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard icon={CheckCircle} label="Completed Today" value={todaysCompleted} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard icon={DollarSign} label="Today's Collections" value={`₱${todaysCollectionTotal.toLocaleString()}`} color="text-teal-600" bg="bg-teal-50" />
        <KpiCard icon={Bell} label="Unread Notifications" value={unreadNotifications} color="text-rose-600" bg="bg-rose-50" />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Main content area */}
      {activeView === 'list' && (
        <BookingsList
          bookings={bookings}
          appointments={appointments}
          memberLookup={memberLookup}
          branches={branches}
          onView={openDetail}
          onStatusUpdate={updateStatus}
          onRecordPayment={openPayment}
          statusUpdating={statusUpdating}
        />
      )}

      {activeView === 'detail' && selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          appointment={appointments.get(selectedBooking.id) ?? null}
          memberLookup={memberLookup}
          userEmail={userEmail}
          onBack={() => { setActiveView('list'); setSelectedBooking(null); }}
          onStatusUpdate={updateStatus}
          onAdvanceAppointment={advanceAppointmentStatus}
          onRecordPayment={openPayment}
          statusUpdating={statusUpdating}
          canEditService={canEditService}
          catalogOptions={catalogOptions}
          savingService={savingService}
          onChangeService={updateApptService}
        />
      )}

      {activeView === 'report' && (
        <DailyReport bookings={bookings} collections={collections} appointments={appointments} onBack={() => setActiveView('list')} />
      )}

      {/* Patient Alerts — Needs Attention */}
      <NeedsAttentionWidget items={needsAttentionItems} />

      {/* Inventory Alerts */}
      <InventoryAlertsWidget alerts={invAlerts} />

      {/* Notifications feed */}
      <NotificationsFeed notifications={notifications} onRead={markNotificationRead} />

      {/* Payment Modal */}
      {showPaymentModal && paymentAppointment && (
        <RecordPaymentModal
          appointment={{
            id: paymentAppointment.id,
            client_id: paymentAppointment.client_id,
            client_name: selectedBooking?.full_name ?? 'Client',
            service: paymentAppointment.service,
            branch_id: paymentAppointment.branch_id,
            scheduled_date: paymentAppointment.scheduled_date,
            scheduled_time: paymentAppointment.scheduled_time,
            amount_due: paymentAppointment.payment_amount ?? 0,
          }}
          nurseEmail={userEmail}
          nurseUserId={userId}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, bg }: { icon: React.ElementType; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4">
      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

// ─── Bookings List ────────────────────────────────────────────────────────────

function BookingsList({
  bookings, appointments, memberLookup, branches, onView, onStatusUpdate, onRecordPayment, statusUpdating,
}: {
  bookings: AssistantBooking[];
  appointments: Map<string, AppointmentLite>;
  memberLookup: MemberLookup | null;
  branches: Branch[];
  onView: (b: AssistantBooking) => void;
  onStatusUpdate: (b: AssistantBooking, s: AssistantStatus) => void;
  onRecordPayment: (b: AssistantBooking) => void;
  statusUpdating: string | null;
}) {
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming' | 'completed'>('all');
  const today = todayStr();

  const filtered = useMemo(() => {
    switch (filter) {
      case 'today': return bookings.filter(b => b.preferred_date === today);
      case 'upcoming': return bookings.filter(b => b.preferred_date > today);
      case 'completed': return bookings.filter(b => b.assistant_status === 'Completed');
      default: return bookings;
    }
  }, [bookings, filter, today]);

  function nurseName(booking: AssistantBooking): string {
    if (!booking.assigned_nurse_id || !memberLookup) return 'Unassigned';
    const m = memberLookup.byUserId.get(booking.assigned_nurse_id);
    return m ? (m.full_name ?? m.email) : 'Unknown';
  }

  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
        <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-500">No bookings assigned to you yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['all', 'today', 'upcoming', 'completed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${filter === f ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            {f === 'all' ? 'All' : f === 'today' ? "Today" : f === 'upcoming' ? 'Upcoming' : 'Completed'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <p className="text-sm text-slate-400">No bookings match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(booking => {
            const appt = appointments.get(booking.id);
            const status = (booking.assistant_status ?? 'Assigned') as AssistantStatus;
            const cfg = STATUS_CFG[status] ?? STATUS_CFG['Assigned'];
            const payStatus = appt?.payment_status ?? 'pending';
            const payBadge = PAYMENT_BADGE[payStatus] ?? PAYMENT_BADGE['pending'];
            return (
              <div key={booking.id} className="bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800">{booking.full_name}</p>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${payBadge.bg} ${payBadge.color}`}>{payBadge.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3" />{(booking.services_requested ?? []).join(', ') || 'N/A'}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{booking.branches?.name ?? 'No branch'}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(booking.preferred_date)}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(booking.preferred_time)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Nurse: {nurseName(booking)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={status}
                      disabled={statusUpdating === booking.id}
                      onChange={e => onStatusUpdate(booking, e.target.value as AssistantStatus)}
                      className="text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
                    >
                      {ASSISTANT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => onRecordPayment(booking)} disabled={!appt}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={appt ? 'Record payment' : 'No appointment linked'}>
                      <CreditCard className="w-3.5 h-3.5" /> Payment
                    </button>
                    <button onClick={() => onView(booking)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Booking Detail ───────────────────────────────────────────────────────────

function BookingDetail({
  booking, appointment, memberLookup, userEmail, onBack, onStatusUpdate, onAdvanceAppointment, onRecordPayment, statusUpdating,
  canEditService, catalogOptions, savingService, onChangeService,
}: {
  booking: AssistantBooking;
  appointment: AppointmentLite | null;
  memberLookup: MemberLookup | null;
  userEmail: string;
  onBack: () => void;
  onStatusUpdate: (b: AssistantBooking, s: AssistantStatus) => void;
  onAdvanceAppointment: (b: AssistantBooking) => void;
  onRecordPayment: (b: AssistantBooking) => void;
  statusUpdating: string | null;
  canEditService: boolean;
  catalogOptions: { id: string; name: string }[];
  savingService: boolean;
  onChangeService: (appt: AppointmentLite, catalogItemId: string) => void;
}) {
  const [showFeedbackQr, setShowFeedbackQr] = useState(false);
  const status = (booking.assistant_status ?? 'Assigned') as AssistantStatus;
  const cfg = STATUS_CFG[status] ?? STATUS_CFG['Assigned'];
  const statusIndex = ASSISTANT_STATUSES.indexOf(status);
  const nextStatus: AssistantStatus | null = statusIndex < ASSISTANT_STATUSES.length - 1 ? ASSISTANT_STATUSES[statusIndex + 1] : null;

  function nurseName(id: string | null): string {
    if (!id || !memberLookup) return 'Unassigned';
    const m = memberLookup.byUserId.get(id);
    return m ? (m.full_name ?? m.email) : 'Unknown';
  }

  const hasAllergies = booking.has_allergies?.toLowerCase().startsWith('yes');
  const hasConditions = booking.pre_existing_condition?.toLowerCase().startsWith('yes');
  const hasMedications = booking.taking_medications?.toLowerCase().startsWith('yes');

  function openFeedbackForm() {
    const params = new URLSearchParams({
      src: 'assistant',
      name: booking.full_name ?? '',
      appointment_id: appointment?.id ?? booking.id,
    });
    window.open(`${window.location.origin}/#feedback?${params.toString()}`, '_blank');
  }

  return (
    <div className="bg-slate-50 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 lg:-mt-8 min-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800 truncate">{booking.full_name}</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.color} ${cfg.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
        {/* Left: Details */}
        <div className="bg-white border-r border-slate-200 p-4 sm:p-6 lg:p-8 space-y-7">
          {/* Warning badges */}
          {(hasAllergies || hasConditions || hasMedications) && (
            <div className="flex flex-wrap gap-2">
              {hasAllergies && <WarningBadge icon={ShieldAlert} label="Allergy" />}
              {hasConditions && <WarningBadge icon={HeartPulse} label="Pre-existing Condition" />}
              {hasMedications && <WarningBadge icon={Syringe} label="Taking Medications" />}
            </div>
          )}

          {/* Appointment Info */}
          <SectionBlock title="Appointment Details">
            <div className="grid grid-cols-2 gap-4">
              <DetailField icon={Calendar} label="Date" value={formatDate(booking.preferred_date)} />
              <DetailField icon={Clock} label="Time" value={formatTime(booking.preferred_time)} />
              <DetailField icon={Droplets} label="Services" value={(booking.services_requested ?? []).join(', ') || null} />
              <DetailField icon={MapPin} label="Branch" value={booking.branches?.name} />
              <DetailField icon={MapPin} label="Preferred Location" value={booking.preferred_location} />
              <DetailField icon={Users} label="Pax" value={booking.pax?.toString()} />
            </div>
          </SectionBlock>

          {/* Availed Service — editable on site when the client changes their mind */}
          {appointment && (
            <SectionBlock title="Availed Service">
              <AssistantServiceEditor
                appt={appointment}
                canEdit={canEditService}
                options={catalogOptions}
                saving={savingService}
                onChange={(catalogItemId) => onChangeService(appointment, catalogItemId)}
              />
            </SectionBlock>
          )}

          {/* Client Contact */}
          <SectionBlock title="Client Contact">
            <div className="grid grid-cols-2 gap-4">
              <DetailField icon={Mail} label="Email" value={booking.email} />
              <DetailField icon={Phone} label="Phone" value={booking.cellphone} />
            </div>
          </SectionBlock>

          {/* Client Health */}
          <SectionBlock title="Client Health & Intake">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <DetailField icon={User} label="Age" value={booking.age?.toString()} />
                <DetailField icon={User} label="Gender" value={booking.gender} />
              </div>
              <HealthFlag icon={HeartPulse} label="Pregnant / Breastfeeding" value={booking.is_pregnant_breastfeeding} />
              <HealthFlag icon={ShieldAlert} label="Pre-existing Conditions" value={booking.pre_existing_condition} />
              <HealthFlag icon={Syringe} label="Taking Medications" value={booking.taking_medications} />
              <HealthFlag icon={ShieldAlert} label="Allergies" value={booking.has_allergies} />
            </div>
          </SectionBlock>

          {/* Assigned Staff */}
          <SectionBlock title="Team Assignment">
            <div className="grid grid-cols-2 gap-4">
              <DetailField icon={Stethoscope} label="Nurse" value={nurseName(booking.assigned_nurse_id)} />
              <DetailField icon={User} label="Assistant" value={nurseName(booking.assigned_nurse_assistant_id)} />
            </div>
          </SectionBlock>

          {/* Linked Appointment */}
          {appointment && (
            <SectionBlock title="Appointment & Payment">
              <div className="grid grid-cols-2 gap-4">
                <DetailField icon={Activity} label="Appointment Status" value={appointment.status} />
                <DetailField icon={CreditCard} label="Payment Status" value={appointment.payment_status} />
                {appointment.payment_amount != null && <DetailField icon={CreditCard} label="Amount" value={`\u20b1${appointment.payment_amount.toLocaleString()}`} />}
                <DetailField icon={CreditCard} label="Payment Method" value={appointment.payment_method} />
              </div>
            </SectionBlock>
          )}

          {/* Notes */}
          {booking.notes && (
            <SectionBlock title="Notes">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{booking.notes}</p>
            </SectionBlock>
          )}
        </div>

        {/* Right: Workflow Timeline + Actions */}
        <div className="bg-slate-50 p-4 sm:p-6 lg:p-8">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Workflow Timeline</p>
          <NurseWorkflowTimeline booking={booking} appt={appointment} />

          {/* Appointment workflow: Dispatch / Arrived / In Treatment / Completed */}
          {appointment && appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Appointment Workflow</p>
              <button
                onClick={() => onAdvanceAppointment(booking)}
                disabled={statusUpdating === booking.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white font-bold rounded-xl transition-colors text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              >
                {statusUpdating === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {appointment.status === 'scheduled' && <><Truck className="w-4 h-4" /> Dispatch (OTW)</>}
                {appointment.status === 'dispatched' && <><MapPin className="w-4 h-4" /> Mark Arrived</>}
                {appointment.status === 'arrived' && <><Activity className="w-4 h-4" /> Start Treatment</>}
                {appointment.status === 'in_treatment' && <><CheckCircle className="w-4 h-4" /> Complete Service</>}
              </button>
            </div>
          )}

          {/* Advance Status Button */}
          <div className="mt-6 space-y-2">
            {nextStatus && (
              <button
                onClick={() => onStatusUpdate(booking, nextStatus)}
                disabled={statusUpdating === booking.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white font-bold rounded-xl transition-colors text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
              >
                {statusUpdating === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                Advance to {nextStatus}
              </button>
            )}
            {/* Status dropdown (manual override) */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Set:</label>
              <select
                value={status}
                disabled={statusUpdating === booking.id}
                onChange={e => onStatusUpdate(booking, e.target.value as AssistantStatus)}
                className="flex-1 text-xs font-semibold border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
              >
                {ASSISTANT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-6 border-t border-slate-200 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Quick Actions</p>
            {appointment && (
              <button onClick={() => onRecordPayment(booking)} disabled={statusUpdating === booking.id}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 border border-teal-600 rounded-xl transition-colors disabled:opacity-50">
                <CreditCard className="w-4 h-4" /> Record Payment
              </button>
            )}
            <button onClick={openFeedbackForm}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <MessageSquare className="w-4 h-4 text-teal-600" /> Open Feedback Form
            </button>
            <button onClick={() => setShowFeedbackQr(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <QrCode className="w-4 h-4 text-teal-600" /> Display Feedback QR
            </button>
          </div>

          {/* Payment Status Badge */}
          {appointment && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Payment:</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${PAYMENT_BADGE[appointment.payment_status ?? 'pending']?.bg ?? PAYMENT_BADGE.pending.bg} ${PAYMENT_BADGE[appointment.payment_status ?? 'pending']?.color ?? PAYMENT_BADGE.pending.color}`}>
                {PAYMENT_BADGE[appointment.payment_status ?? 'pending']?.label ?? 'Pending'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* QR Modal */}
      {showFeedbackQr && (
        <AssistantQrModal booking={booking} appointment={appointment} onClose={() => setShowFeedbackQr(false)} />
      )}
    </div>
  );
}

// ─── Shared UI Components (matching Nurse Dashboard style) ─────────────────────

// ─── Availed Service Editor (assistant) ──────────────────────────────────────
// Same contract as the nurse dashboard's ServiceEditor: locked once the
// appointment is completed or cancelled, since the service is then part of the
// billing and inventory record.

function AssistantServiceEditor({ appt, canEdit, options, saving, onChange }: {
  appt: AppointmentLite;
  canEdit: boolean;
  options: { id: string; name: string }[];
  saving: boolean;
  onChange: (catalogItemId: string) => void;
}) {
  const locked = appt.status === 'completed' || appt.status === 'cancelled';
  const current = appt.service ?? null;
  const unlinked = !appt.catalog_item_id && !!current;

  if (locked || !canEdit) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-teal-600" />
          <span className="text-sm font-semibold text-slate-800">{current ?? 'No service recorded'}</span>
        </div>
        <p className="text-xs text-slate-400">
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
        {saving && <span className="text-xs text-slate-400">Saving...</span>}
      </div>

      {unlinked && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          This service is free text from an older booking and is not linked to the catalog, so inventory cannot be deducted for it. Re-select it above to link it.
        </p>
      )}

      <p className="text-[11px] text-slate-400">
        Changing the service updates what the client is billed and what is deducted from inventory.
      </p>

      {(appt.inventory_deduction_issues?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs font-bold text-amber-800 mb-1.5">Inventory was not fully deducted</p>
          <ul className="space-y-1">
            {(appt.inventory_deduction_issues ?? []).map((issue, i) => (
              <li key={i} className="text-xs text-amber-700 leading-relaxed">• {issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
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

function NurseWorkflowTimeline({ booking, appt }: { booking: AssistantBooking; appt: AppointmentLite | null }) {
  const stage = getWfStage(booking, appt as WfAppointment | null);
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

// ─── QR Modal (simplified from Nurse Dashboard) ───────────────────────────────

function AssistantQrModal({ booking, appointment, onClose }: { booking: AssistantBooking; appointment: AppointmentLite | null; onClose: () => void }) {
  const baseUrl = window.location.origin;
  const link = `${baseUrl}/#feedback?src=qr&appointment_id=${appointment?.id ?? booking.id}&client_id=${booking.id}`;
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setQrError(true));
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(link)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2"><QrCode className="w-5 h-5 text-teal-600" /><h3 className="text-base font-bold text-slate-800">Client Feedback QR</h3></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-center">
          {qrError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-700 font-medium">Unable to generate the secure form link.</p></div>}
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl">
              <img src={qrUrl} alt="QR Code" width={200} height={200} className="rounded-lg" onError={() => setQrError(true)} />
            </div>
            <p className="text-xs text-slate-500">{booking.full_name} · {formatDate(booking.preferred_date)}</p>
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

// ─── Daily Report ─────────────────────────────────────────────────────────────

function DailyReport({ bookings, collections, appointments, onBack }: { bookings: AssistantBooking[]; collections: NurseCollection[]; appointments: Map<string, AppointmentLite>; onBack: () => void }) {
  const [reportDate, setReportDate] = useState(todayStr());

  const dayBookings = useMemo(() => bookings.filter(b => b.preferred_date === reportDate), [bookings, reportDate]);
  const dayCollections = useMemo(() => collections.filter(c => c.collected_at && c.collected_at.slice(0, 10) === reportDate), [collections, reportDate]);

  const totalAssigned = dayBookings.length;
  const completed = dayBookings.filter(b => b.assistant_status === 'Completed').length;
  const pending = dayBookings.filter(b => b.assistant_status !== 'Completed' && b.status !== 'CANCELLED').length;
  const cancelled = dayBookings.filter(b => b.status === 'CANCELLED').length;

  const cashCollected = dayCollections.filter(c => c.payment_method === 'cash').reduce((s, c) => s + (c.amount_received ?? 0), 0);
  const checkCollected = dayCollections.filter(c => c.payment_method === 'check').reduce((s, c) => s + (c.amount_received ?? 0), 0);
  const wireCollected = dayCollections.filter(c => c.payment_method === 'wire').reduce((s, c) => s + (c.amount_received ?? 0), 0);
  const totalCollection = cashCollected + checkCollected + wireCollected;

  function getPaymentInfo(booking: AssistantBooking): { status: string } {
    if (booking.status === 'CANCELLED') return { status: 'cancelled' };
    const appt = appointments.get(booking.id);
    if (!appt) return { status: 'pending' };
    const bookingCollections = collections.filter(c => c.appointment_id === appt.id && c.status !== 'cancelled' && c.status !== 'rejected');
    if (bookingCollections.length === 0) return { status: 'pending' };
    const totalReceived = bookingCollections.reduce((sum, c) => sum + (c.amount_received ?? 0), 0);
    const amountDue = bookingCollections[0]?.amount_due ?? appt.payment_amount ?? 0;
    if (amountDue > 0 && totalReceived >= amountDue) return { status: 'paid' };
    if (totalReceived > 0 && totalReceived < amountDue) return { status: 'partial' };
    if (amountDue === 0 && totalReceived > 0) return { status: 'paid' };
    return { status: 'pending' };
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
        <ChevronRight className="w-4 h-4 rotate-180" /> Back to list
      </button>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-lg font-bold text-slate-900">End of Day Report</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">Date:</label>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400" />
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <ReportStat label="Total Assigned" value={totalAssigned} />
          <ReportStat label="Completed" value={completed} color="text-emerald-600" />
          <ReportStat label="Pending" value={pending} color="text-amber-600" />
          <ReportStat label="Cancelled" value={cancelled} color="text-red-600" />
          <ReportStat label="Cash Collected" value={`₱${cashCollected.toLocaleString()}`} color="text-teal-600" />
          <ReportStat label="Check Collected" value={`₱${checkCollected.toLocaleString()}`} color="text-blue-600" />
          <ReportStat label="Wire Collected" value={`₱${wireCollected.toLocaleString()}`} color="text-violet-600" />
        </div>

        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-teal-800">Total Collection</span>
          <span className="text-lg font-bold text-teal-700">₱{totalCollection.toLocaleString()}</span>
        </div>

        {/* Booking list */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Bookings for {formatDate(reportDate)}</p>
          {dayBookings.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No bookings assigned for this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="text-left py-2 px-2 font-bold">Client</th>
                    <th className="text-left py-2 px-2 font-bold">Service</th>
                    <th className="text-left py-2 px-2 font-bold">Time</th>
                    <th className="text-left py-2 px-2 font-bold">Status</th>
                    <th className="text-right py-2 px-2 font-bold">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {dayBookings.map(b => {
                    const payInfo = getPaymentInfo(b);
                    const badge = payInfo.status === 'cancelled'
                      ? { label: 'Cancelled', color: 'text-slate-600', bg: 'bg-slate-100' }
                      : PAYMENT_BADGE[payInfo.status] ?? PAYMENT_BADGE.pending;
                    return (
                      <tr key={b.id} className="border-b border-slate-50">
                        <td className="py-2 px-2 font-semibold text-slate-700">{b.full_name}</td>
                        <td className="py-2 px-2 text-slate-500">{(b.services_requested ?? []).join(', ') || 'N/A'}</td>
                        <td className="py-2 px-2 text-slate-500">{formatTime(b.preferred_time)}</td>
                        <td className="py-2 px-2"><span className="text-xs font-semibold text-slate-600">{b.assistant_status ?? 'Assigned'}</span></td>
                        <td className="py-2 px-2 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${badge.bg} ${badge.color}`}>{badge.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

// ─── Notifications Feed ───────────────────────────────────────────────────────

function NotificationsFeed({ notifications, onRead }: { notifications: NurseNotification[]; onRead: (n: NurseNotification) => void }) {
  const [expanded, setExpanded] = useState(false);
  const display = expanded ? notifications : notifications.slice(0, 5);

  if (notifications.length === 0) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Bell className="w-4 h-4 text-rose-500" /> Notifications
        </h3>
        {notifications.length > 5 && (
          <button onClick={() => setExpanded(e => !e)} className="text-xs font-semibold text-teal-600 hover:text-teal-700">
            {expanded ? 'Show less' : `Show all (${notifications.length})`}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {display.map(n => (
          <div key={n.id} onClick={() => onRead(n)}
            className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${n.status === 'unread' ? 'bg-teal-50/50 border border-teal-100' : 'bg-slate-50/50'}`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.status === 'unread' ? 'bg-teal-500' : 'bg-slate-300'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">{n.message || n.event_type?.replace(/_/g, ' ')}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span>{n.client_name}</span>
                {n.service && <span>· {n.service}</span>}
                {n.appointment_date && <span>· {formatDate(n.appointment_date)}</span>}
              </div>
            </div>
            <span className="text-xs text-slate-300 flex-shrink-0">
              {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
