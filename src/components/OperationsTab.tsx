import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  RefreshCw,
  MapPin,
  User,
  X,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  Trash2,
  ShieldAlert,
  Lock,
  Car,
  CreditCard,
  ClipboardCheck,
  Clock,
  Users,
  ArrowRight,
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  Stethoscope,
  Eye,
  Calendar,
  Phone,
  Mail,
  Activity,
  Truck,
  Receipt,
  Camera,
  MessageSquare,
  Star,
  Cpu,
} from 'lucide-react';
import {
  supabase,
  SERVICES,
  type Branch,
  type Client,
  type Appointment,
  type AppointmentStatus,
  type OrderStatus,
  type PaymentMethod,
  type TeamMember,
  type MemberLookup,
  buildMemberLookup,
  resolveMemberName,
  memberDisplayName,
  ROLES,
} from '../lib/supabase';
import { loadUnifiedClientProfileFromAppointment, type UnifiedClientProfile } from '../lib/clientProfile';
import { ClientProfileInformationSection } from './ClientProfileSections';

// ─── Extended type with joins ─────────────────────────────────────────────────

export interface AppointmentRow extends Appointment {
  clients: { id: string; full_name: string; email: string | null; phone: string | null } | null;
  branches: { id: string; name: string } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_ORDER: AppointmentStatus[] = [
  'scheduled',
  'dispatched',
  'arrived',
  'in_treatment',
  'completed',
];

type StatusCfg = {
  label: string;
  sectionLabel: string;
  color: string;
  bg: string;
  dot: string;
  nextStatus?: AppointmentStatus;
  nextLabel?: string;
  tsField?: 'dispatched_at' | 'arrived_at' | 'treatment_started_at' | 'completed_at';
};

const STATUS_CFG: Record<string, StatusCfg> = {
  scheduled: {
    label: 'Scheduled',
    sectionLabel: 'Scheduled',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    dot: 'bg-blue-500',
    nextStatus: 'dispatched',
    nextLabel: 'Dispatch (OTW)',
    tsField: 'dispatched_at',
  },
  dispatched: {
    label: 'Dispatched — OTW',
    sectionLabel: 'Dispatched — On The Way',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    dot: 'bg-amber-500',
    nextStatus: 'arrived',
    nextLabel: 'Mark Arrived',
    tsField: 'arrived_at',
  },
  arrived: {
    label: 'Arrived (Area)',
    sectionLabel: 'Arrived — In Area',
    color: 'text-cyan-700',
    bg: 'bg-cyan-50 border-cyan-200',
    dot: 'bg-cyan-500',
    nextStatus: 'in_treatment',
    nextLabel: 'Start Treatment',
    tsField: 'treatment_started_at',
  },
  in_treatment: {
    label: 'In Treatment',
    sectionLabel: 'In Treatment',
    color: 'text-violet-700',
    bg: 'bg-violet-50 border-violet-200',
    dot: 'bg-violet-500',
    nextStatus: 'completed',
    nextLabel: 'Mark Completed',
    tsField: 'completed_at',
  },
  completed: {
    label: 'Completed',
    sectionLabel: 'Completed',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    sectionLabel: 'Cancelled',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    dot: 'bg-red-500',
  },
};

const PAYMENT_CFG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Payment Pending', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  paid: { label: 'Paid', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  partial: { label: 'Partial', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  waived: { label: 'Waived', color: 'text-slate-600 bg-slate-100 border-slate-200' },
};

const INTAKE_CFG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Intake Pending', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  completed: { label: 'Intake Done', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function wfDur(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (isNaN(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `+${mins}m to next`;
  const hrs = ms / 3600000;
  if (hrs < 24) return `+${Math.round(hrs * 10) / 10}h to next`;
  return `+${Math.round(hrs / 24)}d to next`;
}

// ─── Small badge helpers ──────────────────────────────────────────────────────

function PaymentBadge({ status }: { status: string }) {
  const cfg = PAYMENT_CFG[status] ?? PAYMENT_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full border ${cfg.color}`}>
      <CreditCard className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function IntakeBadge({ status }: { status: string }) {
  const cfg = INTAKE_CFG[status] ?? INTAKE_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full border ${cfg.color}`}>
      <ClipboardCheck className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ─── Appointment Card ─────────────────────────────────────────────────────────

function AppointmentCard({
  appt,
  canManage,
  memberLookup,
  onAdvance,
  onCancel,
  onDelete,
  onViewDetail,
  onRecordPayment,
}: {
  appt: AppointmentRow;
  canManage: boolean;
  memberLookup: MemberLookup;
  onAdvance: (appt: AppointmentRow) => void;
  onCancel: (appt: AppointmentRow) => void;
  onDelete: (appt: AppointmentRow) => void;
  onViewDetail: (appt: AppointmentRow) => void;
  onRecordPayment: (appt: AppointmentRow) => void;
}) {
  const cfg = STATUS_CFG[appt.status];
  const clientName = appt.clients?.full_name ?? '—';
  const branchName = appt.branches?.name ?? '—';
  const isTerminal = appt.status === 'completed' || appt.status === 'cancelled';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-teal-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-base leading-tight truncate">{clientName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-400">{branchName}</span>
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Time + Service */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
          <Clock className="w-3 h-3 text-slate-400" />
          {fmtTime(appt.scheduled_time)}
        </span>
        {appt.service && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 border border-teal-100 rounded-lg text-xs font-semibold text-teal-700">
            <Stethoscope className="w-3 h-3" />
            {appt.service}
          </span>
        )}
      </div>

      {/* Location */}
      {appt.location && (
        <div className="flex items-start gap-1.5 mb-3">
          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 leading-relaxed">{appt.location}</p>
        </div>
      )}

      {/* Team */}
      {(appt.nurse_name || appt.assistant_name || appt.driver_name || appt.vehicle) && (
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {appt.nurse_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3 h-3 text-teal-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 truncate">{resolveMemberName(appt.nurse_name, memberLookup)}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">Nurse</span>
            </div>
          )}
          {appt.assistant_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Users className="w-3 h-3 text-blue-400 flex-shrink-0" />
              <span className="text-xs text-slate-600 truncate">{resolveMemberName(appt.assistant_name, memberLookup)}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">Asst.</span>
            </div>
          )}
          {appt.driver_name && (
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 truncate">{resolveMemberName(appt.driver_name, memberLookup)}</span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">Driver</span>
            </div>
          )}
          {appt.vehicle && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Car className="w-3 h-3 text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-600 truncate">{appt.vehicle}</span>
            </div>
          )}
        </div>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <PaymentBadge status={appt.payment_status} />
        <IntakeBadge status={appt.intake_form_status} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
        {!isTerminal && cfg.nextStatus && (
          <button
            onClick={() => onAdvance(appt)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors"
          >
            {cfg.nextLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
        {appt.status !== 'cancelled' && appt.status !== 'completed' && (
          <button
            onClick={() => onCancel(appt)}
            className="px-3 py-2 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            Cancel
          </button>
        )}
        {isTerminal && (
          appt.status === 'completed' ? (
            <button
              onClick={() => onRecordPayment(appt)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-teal-50 text-teal-700 text-xs font-bold rounded-xl hover:bg-teal-100 border border-teal-200 transition-colors"
            >
              <Receipt className="w-3.5 h-3.5" />
              {appt.payment_recorded_at ? 'Update Payment' : 'Record Payment'}
            </button>
          ) : (
            <div className="flex-1 py-2 text-center text-xs font-semibold text-slate-400">
              Appointment cancelled
            </div>
          )
        )}
        {canManage ? (
          <button
            onClick={() => onDelete(appt)}
            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-200"
            title="Delete appointment"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
        <button
          onClick={() => onViewDetail(appt)}
          className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors border border-transparent hover:border-teal-200"
          title="View details"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Delete Appointment Modal ─────────────────────────────────────────────────

function DeleteAppointmentModal({
  appt,
  onClose,
  onDeleted,
}: {
  appt: AppointmentRow;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await supabase.from('appointments').delete().eq('id', appt.id);
    setDeleting(false);
    onDeleted(appt.id);
    onClose();
  }

  const clientName = appt.clients?.full_name ?? '—';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Delete Appointment?</h3>
        <p className="text-sm text-slate-500 text-center mb-1 leading-relaxed">
          You are about to permanently delete the appointment for
        </p>
        <p className="text-base font-bold text-slate-800 text-center mb-5">"{clientName}"</p>
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
          <p className="text-xs text-red-600 font-medium text-center leading-relaxed">
            This action cannot be undone.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 disabled:opacity-60 transition-colors"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Appointment Modal ────────────────────────────────────────────────────

type ClientMode = 'select' | 'new';

interface AppointmentForm {
  branchId: string;
  date: string;
  time: string;
  service: string;
  location: string;
  nurseName: string;
  assistantName: string;
  driverName: string;
  vehicle: string;
  paymentStatus: string;
  intakeFormStatus: string;
  notes: string;
}

function AddAppointmentModal({
  branches,
  defaultDate,
  userEmail,
  onClose,
  onSaved,
}: {
  branches: Branch[];
  defaultDate: string;
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientMode, setClientMode] = useState<ClientMode>('select');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const [form, setForm] = useState<AppointmentForm>({
    branchId: branches[0]?.id ?? '',
    date: defaultDate,
    time: '09:00',
    service: '',
    location: '',
    nurseName: '',
    assistantName: '',
    driverName: '',
    vehicle: '',
    paymentStatus: 'pending',
    intakeFormStatus: 'pending',
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [nurses, setNurses] = useState<TeamMember[]>([]);
  const [assistants, setAssistants] = useState<TeamMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [clientsRes, membersRes] = await Promise.all([
        supabase.from('clients').select('*').eq('status', 'active').order('full_name'),
        supabase.from('team_members').select('*').eq('status', 'approved').order('full_name', { ascending: true, nullsFirst: false }).order('email', { ascending: true }),
      ]);
      if (cancelled) return;
      setAllClients((clientsRes.data ?? []) as Client[]);
      setLoadingClients(false);
      const allMembers = (membersRes.data ?? []) as TeamMember[];
      setNurses(allMembers);
      setAssistants(allMembers.filter(m => m.role === 'nurse_assistant'));
    }
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClients = allClients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch)
  );

  function setField<K extends keyof AppointmentForm>(key: K, val: AppointmentForm[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function selectClient(c: Client) {
    setSelectedClient(c);
    setClientSearch(c.full_name);
    setShowDropdown(false);
  }

  async function handleSave() {
    if (clientMode === 'select' && !selectedClient) {
      setError('Please select a client or add a new one.');
      return;
    }
    if (clientMode === 'new' && !newClientName.trim()) {
      setError('Client name is required.');
      return;
    }
    if (!form.branchId) { setError('Please select a branch.'); return; }
    if (!form.date) { setError('Please pick a date.'); return; }
    if (!form.time) { setError('Please pick a time.'); return; }

    setSaving(true);
    setError(null);

    let clientId = selectedClient?.id ?? '';

    if (clientMode === 'new') {
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({ full_name: newClientName.trim(), phone: newClientPhone.trim() || null })
        .select()
        .single();
      if (clientErr || !newClient) {
        setSaving(false);
        setError('Failed to create client. Please try again.');
        return;
      }
      clientId = (newClient as Client).id;
    }

    const { error: apptErr } = await supabase.from('appointments').insert({
      client_id: clientId,
      branch_id: form.branchId,
      scheduled_date: form.date,
      scheduled_time: form.time,
      service: form.service.trim() || null,
      location: form.location.trim() || null,
      nurse_name: form.nurseName.trim() || null,
      assistant_name: form.assistantName.trim() || null,
      driver_name: form.driverName.trim() || null,
      vehicle: form.vehicle.trim() || null,
      payment_status: form.paymentStatus,
      intake_form_status: form.intakeFormStatus,
      notes: form.notes.trim() || null,
      created_by_email: userEmail,
      payment_recorded_at: form.paymentStatus !== 'pending' ? new Date().toISOString() : null,
    });

    setSaving(false);
    if (apptErr) {
      setError('Failed to save appointment. Please try again.');
      return;
    }
    onSaved();
    onClose();
  }

  const inputCls =
    'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-300';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900">New Appointment</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Client */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls.replace(' mb-1.5', '')}>Client *</label>
              <button
                type="button"
                onClick={() => {
                  setClientMode(clientMode === 'select' ? 'new' : 'select');
                  setSelectedClient(null);
                  setClientSearch('');
                  setNewClientName('');
                  setNewClientPhone('');
                }}
                className="text-xs text-teal-600 font-semibold hover:text-teal-700 transition-colors"
              >
                {clientMode === 'select' ? '+ Add new client instead' : '← Search existing clients'}
              </button>
            </div>

            {clientMode === 'select' ? (
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={loadingClients ? 'Loading clients…' : 'Search by name or phone…'}
                    value={clientSearch}
                    disabled={loadingClients}
                    onChange={e => {
                      setClientSearch(e.target.value);
                      setSelectedClient(null);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-300 disabled:opacity-50"
                  />
                  {selectedClient && (
                    <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-500" />
                  )}
                </div>
                {showDropdown && clientSearch && !selectedClient && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {filteredClients.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-slate-400 text-center">No clients found</div>
                    ) : (
                      filteredClients.slice(0, 8).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectClient(c)}
                          className="w-full text-left px-4 py-2.5 hover:bg-teal-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-slate-800">{c.full_name}</p>
                          {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Maria Santos"
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 09171234567"
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Branch + Date + Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Branch *</label>
              <select
                value={form.branchId}
                onChange={e => setField('branchId', e.target.value)}
                className={inputCls + ' cursor-pointer bg-white'}
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Time *</label>
              <input
                type="time"
                value={form.time}
                onChange={e => setField('time', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Service */}
          <div>
            <label className={labelCls}>Service</label>
            <input
              type="text"
              list="services-list"
              placeholder="e.g. IV Drip Therapy, Myers Cocktail…"
              value={form.service}
              onChange={e => setField('service', e.target.value)}
              className={inputCls}
            />
            <datalist id="services-list">
              {SERVICES.map(s => <option key={s.id} value={s.label} />)}
            </datalist>
          </div>

          {/* Location */}
          <div>
            <label className={labelCls}>Visit Location</label>
            <input
              type="text"
              placeholder="Street address or landmark for this visit"
              value={form.location}
              onChange={e => setField('location', e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Team */}
          <div>
            <p className={labelCls}>Team Assignment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nurse</label>
                <select
                  value={form.nurseName}
                  onChange={e => setField('nurseName', e.target.value)}
                  className={inputCls + ' cursor-pointer bg-white'}
                >
                  <option value="">Unassigned</option>
                  {nurses.map(n => {
                    const name = memberDisplayName(n);
                    const roleLabel = ROLES.find(r => r.key === n.role)?.label ?? n.role;
                    const isFallback = !n.full_name || !n.full_name.trim();
                    return (
                      <option key={n.user_id} value={name}>
                        {isFallback ? name : `${name} — ${roleLabel}`}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Assistant</label>
                <select
                  value={form.assistantName}
                  onChange={e => setField('assistantName', e.target.value)}
                  className={inputCls + ' cursor-pointer bg-white'}
                >
                  <option value="">Unassigned</option>
                  {assistants.map(a => {
                    const name = memberDisplayName(a);
                    return (
                      <option key={a.user_id} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Driver</label>
                <input
                  type="text"
                  placeholder="Driver name"
                  value={form.driverName}
                  onChange={e => setField('driverName', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Vehicle</label>
                <input
                  type="text"
                  placeholder="Plate or description"
                  value={form.vehicle}
                  onChange={e => setField('vehicle', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Payment + Intake status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Payment Status</label>
              <select
                value={form.paymentStatus}
                onChange={e => setField('paymentStatus', e.target.value)}
                className={inputCls + ' cursor-pointer bg-white'}
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="waived">Waived</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Intake Form</label>
              <select
                value={form.intakeFormStatus}
                onChange={e => setField('intakeFormStatus', e.target.value)}
                className={inputCls + ' cursor-pointer bg-white'}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes <span className="text-slate-300 normal-case font-normal tracking-normal">(optional)</span></label>
            <textarea
              rows={2}
              placeholder="Internal ops notes…"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              className={inputCls + ' resize-none'}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Add Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Appointment Workflow Panel ───────────────────────────────────────────────

interface WorkflowActor {
  name: string;
  role: string;
  source?: 'manual' | 'system' | 'mobile' | 'web';
}

interface WorkflowEvent {
  label: string;
  iconEl: React.ElementType;
  done: (a: AppointmentRow) => boolean;
  ts: (a: AppointmentRow) => string | null;
  actor: (a: AppointmentRow) => WorkflowActor;
  detail?: (a: AppointmentRow) => string | null;
  expected?: (a: AppointmentRow) => string | null;
  dotCls: string;
  iconCls: string;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Operations Manager',
  nurse: 'Registered Nurse',
  staff: 'Operations Coordinator',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDateShort(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTimeShort(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const WORKFLOW_EVENTS: WorkflowEvent[] = [
  {
    label: 'Appointment Created',
    iconEl: Calendar,
    done: () => true,
    ts: (a) => a.created_at,
    actor: (a) => ({
      name: a.created_by_email ?? 'Unknown',
      role: a.created_by_email ? 'Operations Coordinator' : '',
      source: 'web',
    }),
    dotCls: 'bg-teal-100 border-teal-400',
    iconCls: 'text-teal-500',
  },
  {
    label: 'Service Scheduled',
    iconEl: Clock,
    done: () => true,
    ts: (a) => `${a.scheduled_date}T${a.scheduled_time.slice(0, 5)}:00`,
    actor: (a) => ({
      name: a.created_by_email ?? 'Unknown',
      role: a.created_by_email ? 'Operations Coordinator' : '',
      source: 'web',
    }),
    detail: (a) => a.service,
    expected: (a) => fmtTimeShort(`${a.scheduled_date}T${a.scheduled_time.slice(0, 5)}:00`),
    dotCls: 'bg-blue-100 border-blue-400',
    iconCls: 'text-blue-500',
  },
  {
    label: 'Nurse Assigned',
    iconEl: Stethoscope,
    done: (a) => !!a.nurse_name,
    ts: (a) => a.created_at,
    actor: (a) => ({
      name: a.created_by_email ?? 'Unknown',
      role: a.created_by_email ? 'Operations Coordinator' : '',
      source: 'web',
    }),
    detail: (a) => a.nurse_name,
    dotCls: 'bg-teal-100 border-teal-400',
    iconCls: 'text-teal-500',
  },
  {
    label: 'Dispatch (OTW)',
    iconEl: Truck,
    done: (a) => !!a.dispatched_at,
    ts: (a) => a.dispatched_at,
    actor: (a) => ({
      name: a.driver_name ?? a.nurse_name ?? 'Unknown',
      role: a.driver_name ? 'Driver' : a.nurse_name ? 'Registered Nurse' : '',
      source: 'mobile',
    }),
    detail: (a) => a.vehicle,
    dotCls: 'bg-amber-100 border-amber-400',
    iconCls: 'text-amber-500',
  },
  {
    label: 'Arrived',
    iconEl: MapPin,
    done: (a) => !!a.arrived_at,
    ts: (a) => a.arrived_at,
    actor: (a) => ({
      name: a.nurse_name ?? a.driver_name ?? 'Unknown',
      role: a.nurse_name ? 'Registered Nurse' : a.driver_name ? 'Driver' : '',
      source: 'mobile',
    }),
    detail: (a) => a.location,
    dotCls: 'bg-cyan-100 border-cyan-400',
    iconCls: 'text-cyan-500',
  },
  {
    label: 'Treatment Started',
    iconEl: Activity,
    done: (a) => !!a.treatment_started_at,
    ts: (a) => a.treatment_started_at,
    actor: (a) => ({
      name: a.nurse_name ?? 'Unknown',
      role: a.nurse_name ? 'Registered Nurse' : '',
      source: 'mobile',
    }),
    dotCls: 'bg-violet-100 border-violet-400',
    iconCls: 'text-violet-500',
  },
  {
    label: 'Treatment Completed',
    iconEl: CheckCircle,
    done: (a) => !!a.completed_at,
    ts: (a) => a.completed_at,
    actor: (a) => ({
      name: a.nurse_name ?? 'Unknown',
      role: a.nurse_name ? 'Registered Nurse' : '',
      source: 'mobile',
    }),
    detail: (a) => (a.notes ? 'Treatment notes available' : null),
    dotCls: 'bg-emerald-100 border-emerald-400',
    iconCls: 'text-emerald-500',
  },
  {
    label: 'Payment Recorded',
    iconEl: Receipt,
    done: (a) => !!a.payment_recorded_at,
    ts: (a) => a.payment_recorded_at,
    actor: (a) => ({
      name: a.created_by_email ?? 'Unknown',
      role: a.created_by_email ? 'Operations Coordinator' : '',
      source: 'web',
    }),
    detail: (a) => a.payment_method ? `${a.payment_method} · ${a.payment_status}` : null,
    dotCls: 'bg-teal-100 border-teal-400',
    iconCls: 'text-teal-500',
  },
];

function ActorBadge({ actor, done }: { actor: WorkflowActor; done: boolean }) {
  const isSystem = actor.name === 'System Automation';
  const isUnknown = actor.name === 'Unknown';
  const showInitials = !isSystem && !isUnknown && done;
  const bgCls = isSystem
    ? 'bg-slate-100 text-slate-500'
    : isUnknown
    ? 'bg-slate-50 text-slate-300'
    : 'bg-teal-100 text-teal-700';

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${bgCls}`}>
        {isSystem ? <Cpu className="w-3 h-3" /> : isUnknown ? '?' : initials(actor.name)}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 leading-tight truncate">{actor.name}</p>
        {actor.role && <p className="text-[10px] text-slate-400 leading-tight">{actor.role}</p>}
      </div>
    </div>
  );
}

function WorkflowEventRow({
  event,
  appt,
  creatorName,
  isLast,
  isCurrent,
  isCancelled,
}: {
  event: WorkflowEvent;
  appt: AppointmentRow;
  creatorName: string;
  isLast: boolean;
  isCurrent: boolean;
  isCancelled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = event.done(appt) && !isCancelled;
  const ts = event.ts(appt);
  const rawActor = event.actor(appt);
  const actor: WorkflowActor =
    rawActor.name === appt.created_by_email
      ? { ...rawActor, name: creatorName }
      : rawActor;
  const detail = event.detail?.(appt) ?? null;
  const expected = event.expected?.(appt) ?? null;
  const Icon = event.iconEl;

  const stateCls = isCancelled && done
    ? 'bg-red-50 border-red-300'
    : done
    ? event.dotCls
    : isCurrent
    ? 'bg-blue-50 border-blue-400 ring-4 ring-blue-100'
    : 'bg-slate-50 border-slate-200';

  return (
    <div className="relative flex gap-4">
      {!isLast && (
        <div className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${done ? 'bg-slate-200' : 'bg-slate-100'}`} />
      )}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 ${stateCls}`}>
        <Icon className={`w-3.5 h-3.5 ${done ? event.iconCls : 'text-slate-300'}`} />
      </div>
      <div className="flex-1 pb-5 min-w-0">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="text-left w-full"
        >
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold leading-tight ${done ? 'text-slate-800' : 'text-slate-400'}`}>
              {event.label}
            </p>
            {done && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                isCancelled ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}>
                {isCancelled ? 'CANCELLED' : 'DONE'}
              </span>
            )}
            {!done && isCurrent && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-50 text-blue-600 border-blue-200">
                CURRENT
              </span>
            )}
            {!done && !isCurrent && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-400 border-slate-200">
                PENDING
              </span>
            )}
          </div>
          {done ? (
            <p className="text-xs text-slate-500 mt-0.5">
              {fmtDateShort(ts)} · {fmtTimeShort(ts)}
            </p>
          ) : expected ? (
            <p className="text-xs text-slate-400 mt-0.5">
              Pending · Expected: {expected}
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-0.5">Pending</p>
          )}
        </button>

        {done && (
          <div className="mt-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {event.label.includes('Nurse') ? 'Assigned by' : event.label.includes('Created') || event.label.includes('Scheduled') || event.label.includes('Payment') ? 'Performed by' : 'Updated by'}
            </p>
            <ActorBadge actor={actor} done={done} />
          </div>
        )}

        {done && detail && (
          <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
            {detail}
          </p>
        )}

        {expanded && done && actor.source && (
          <div className="mt-2 text-[10px] text-slate-400 space-y-0.5 bg-slate-50/50 border border-slate-100 rounded-lg px-2.5 py-1.5">
            <p>Source: <span className="font-semibold capitalize">{actor.source}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}

function ApptWorkflow({
  appt,
  memberLookup,
  feedbackAt,
  feedbackUrl,
  feedbackQrSrc,
  feedback,
}: {
  appt: AppointmentRow;
  memberLookup: MemberLookup;
  feedbackAt?: string | null;
  feedbackUrl?: string;
  feedbackQrSrc?: string;
  feedback?: { overall_satisfaction: number; staff_professionalism: number; liked_most: string; comments_suggestions: string; name: string; created_at: string } | null;
}) {
  const hasFeedbackEntry = feedbackAt !== undefined;
  const isCancelled = appt.status === 'cancelled';

  const creatorName = resolveMemberName(appt.created_by_email, memberLookup);

  const currentIdx = WORKFLOW_EVENTS.findIndex(e => !e.done(appt));

  return (
    <div className="p-6">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-6">Workflow Timeline</p>
      <div>
        {WORKFLOW_EVENTS.map((m, i) => (
          <WorkflowEventRow
            key={m.label}
            event={m}
            appt={appt}
            creatorName={creatorName}
            isLast={i === WORKFLOW_EVENTS.length - 1 && !hasFeedbackEntry}
            isCurrent={i === currentIdx && !isCancelled}
            isCancelled={isCancelled}
          />
        ))}

        {/* Feedback email sent — system event */}
        {hasFeedbackEntry && (
          <div className="relative flex gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 ${feedbackAt ? 'bg-cyan-100 border-cyan-400' : 'bg-slate-50 border-slate-200'}`}>
              <MessageSquare className={`w-3.5 h-3.5 ${feedbackAt ? 'text-cyan-500' : 'text-slate-300'}`} />
            </div>
            <div className="flex-1 pb-5 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-semibold leading-tight ${feedbackAt ? 'text-slate-800' : 'text-slate-400'}`}>
                  Feedback Sent
                </p>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${feedbackAt ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  {feedbackAt ? 'DONE' : 'PENDING'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {feedbackAt ? `${fmtDateShort(feedbackAt)} · ${fmtTimeShort(feedbackAt)}` : 'Pending'}
              </p>
              <div className="mt-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sent by</p>
                <ActorBadge actor={{ name: 'System Automation', role: 'Automated notification', source: 'system' }} done={!!feedbackAt} />
              </div>
            </div>
          </div>
        )}

        {/* Feedback submitted — client event */}
        {feedback && (
          <div className="relative flex gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 bg-cyan-100 border-cyan-400">
              <Star className="w-3.5 h-3.5 text-cyan-500" />
            </div>
            <div className="flex-1 pb-5 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold leading-tight text-slate-800">Feedback Submitted</p>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">DONE</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {fmtDateShort(feedback.created_at)} · {fmtTimeShort(feedback.created_at)}
              </p>
              <div className="mt-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submitted by</p>
                <ActorBadge actor={{ name: feedback.name || 'Client', role: 'Client', source: 'web' }} done={true} />
              </div>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Rating:</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} className={`w-3 h-3 ${n <= feedback.overall_satisfaction ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Client Feedback — QR section */}
      {feedbackUrl && feedbackQrSrc && (
        <div className="mt-2 pt-5 border-t border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Client Feedback</p>
          <p className="text-xs text-slate-400 mb-4">Scan or share this after the service is completed.</p>
          <div className="flex flex-col items-center gap-3">
            <a
              href={feedbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-2xl p-2.5 border border-slate-200 hover:border-teal-300 transition-colors shadow-sm"
              title="Scan or tap to open pre-filled feedback form"
            >
              <img src={feedbackQrSrc} alt="Feedback QR Code" className="w-32 h-32" />
            </a>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Staff can scan on-site to open the{' '}
              <span className="font-semibold text-slate-700">pre-filled feedback form</span>{' '}
              for this appointment.
            </p>
            {feedback && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-50 border border-cyan-200 rounded-full text-xs font-semibold text-cyan-700">
                <MessageSquare className="w-3 h-3" />
                Feedback already received
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Record Payment Modal ────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', bank: 'Bank Transfer', card: 'Card', other: 'Other',
};

function serviceToFinanceCategory(service: string | null): string {
  if (!service) return 'Other Income';
  const s = service.toUpperCase();
  if (s.includes('IV DRIP')) return 'IV Drip Revenue';
  if (s.includes('PEPTIDE')) return 'Peptide Therapy Revenue';
  if (s.includes('CONSULTATION')) return 'Consultation Fee';
  return 'Other Income';
}

function RecordPaymentModal({ appt, onClose, onSaved }: {
  appt: AppointmentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(
    appt.payment_status === 'pending' ? 'paid' : appt.payment_status
  );
  const [amount, setAmount] = useState(
    appt.payment_amount != null ? String(appt.payment_amount) : ''
  );
  const [method, setMethod] = useState(appt.payment_method ?? 'cash');
  const [reference, setReference] = useState(appt.payment_reference ?? '');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(appt.payment_receipt_url ?? null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-300 bg-white';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
  }

  function removeImage() {
    if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    if (status !== 'waived' && !amount.trim()) {
      setError('Please enter the payment amount.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // ── 1. Image upload ──────────────────────────────────────────────────
      let receiptUrl: string | null = imageRemoved ? null : (appt.payment_receipt_url ?? null);
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `appointments/${appt.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('payment-receipts')
          .upload(path, imageFile, { upsert: true });
        if (uploadErr) throw new Error('Failed to upload receipt image. Please try again.');
        const { data: { publicUrl } } = supabase.storage.from('payment-receipts').getPublicUrl(path);
        receiptUrl = publicUrl;
      }

      const finAmount = status !== 'waived' ? Number(amount) : 0;
      const paidAt = new Date().toISOString();
      const today = paidAt.split('T')[0];
      const clientName = appt.clients?.full_name ?? 'Client';
      const svcLabel = appt.service ?? 'Service';
      const dateLabel = new Date(appt.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const refNote = reference.trim() || null;

      // ── 2. Update appointment ────────────────────────────────────────────
      const { error: apptErr } = await supabase
        .from('appointments')
        .update({
          payment_status: status,
          payment_amount: status !== 'waived' && amount ? finAmount : null,
          payment_method: method,
          payment_reference: refNote,
          payment_receipt_url: receiptUrl,
          payment_recorded_at: paidAt,
        })
        .eq('id', appt.id);
      if (apptErr) throw apptErr;

      // ── 3. Finance transaction (income; skip for waived) ─────────────────
      const { data: existingTx } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('appointment_id', appt.id)
        .maybeSingle();

      if (status === 'waived') {
        if (existingTx) {
          await supabase.from('finance_transactions').delete().eq('id', existingTx.id);
        }
      } else {
        const txData = {
          type: 'income' as const,
          amount: finAmount,
          category: serviceToFinanceCategory(appt.service),
          description: `${clientName} · ${svcLabel} (${dateLabel})`,
          date: today,
          reference: refNote,
          appointment_id: appt.id,
        };
        if (existingTx) {
          const { error: e } = await supabase.from('finance_transactions').update(txData).eq('id', existingTx.id);
          if (e) throw e;
        } else {
          const { error: e } = await supabase.from('finance_transactions').insert(txData);
          if (e) throw e;
        }
      }

      // ── 4. Billing: order + payment ──────────────────────────────────────
      const orderStatus: OrderStatus = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'void';

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('appointment_id', appt.id)
        .maybeSingle();

      let orderId: string;
      if (existingOrder) {
        orderId = existingOrder.id;
        const { error: e } = await supabase
          .from('orders')
          .update({ total_amount: finAmount, status: orderStatus })
          .eq('id', orderId);
        if (e) throw e;
      } else {
        const { data: newOrd, error: e } = await supabase
          .from('orders')
          .insert({
            client_id: appt.client_id,
            appointment_id: appt.id,
            description: `${svcLabel} — ${clientName} (${dateLabel})`,
            total_amount: finAmount,
            status: orderStatus,
          })
          .select('id')
          .single();
        if (e || !newOrd) throw new Error('Failed to create billing order.');
        orderId = newOrd.id;
      }

      // Replace auto-generated payment row (tagged by appointment_id)
      await supabase.from('payments').delete().eq('appointment_id', appt.id);
      if (status !== 'waived' && finAmount > 0) {
        const { error: e } = await supabase.from('payments').insert({
          order_id: orderId,
          client_id: appt.client_id,
          amount: finAmount,
          method: method as PaymentMethod,
          reference: refNote,
          appointment_id: appt.id,
          paid_at: paidAt,
        });
        if (e) throw e;
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-7 pt-7 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-slate-900">Record Payment</h3>
            <button onClick={onClose} disabled={saving} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <p className="text-sm text-slate-500">
            {appt.clients?.full_name ?? '—'}
            {appt.service ? ` · ${appt.service}` : ''}
          </p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-7 pb-2">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Payment Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls + ' cursor-pointer'}>
                <option value="paid">Paid (Full)</option>
                <option value="partial">Partial Payment</option>
                <option value="waived">Waived</option>
              </select>
            </div>

            {status !== 'waived' && (
              <div>
                <label className={labelCls}>Amount</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold select-none">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                  />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls + ' cursor-pointer'}>
                {Object.entries(METHOD_LABELS).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>
                Reference Note{' '}
                <span className="text-slate-300 normal-case font-normal tracking-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. GCash ref #, receipt no."
                value={reference}
                onChange={e => setReference(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Image attachment */}
            <div>
              <label className={labelCls}>
                Receipt Image{' '}
                <span className="text-slate-300 normal-case font-normal tracking-normal">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={handleFileChange}
              />
              {imagePreview ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                  <img
                    src={imagePreview}
                    alt="Receipt preview"
                    className="w-full max-h-48 object-cover"
                  />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-sm transition-colors"
                      title="Replace image"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                    <button
                      type="button"
                      onClick={removeImage}
                      className="p-1.5 bg-white/90 hover:bg-white rounded-lg shadow-sm transition-colors"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl py-6 text-slate-400 hover:border-teal-400 hover:text-teal-500 hover:bg-teal-50/40 transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  <span className="text-xs font-semibold">Click to attach receipt</span>
                  <span className="text-[11px] text-slate-300">JPG, PNG, WebP up to 10 MB</span>
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-7 py-5 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Appointment Detail Page ──────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export function AppointmentDetailPage({
  appt: initialAppt,
  onBack,
  backLabel = 'Back to Operations',
  onPaymentRecorded,
  canViewSensitive,
}: {
  appt: AppointmentRow;
  onBack: () => void;
  backLabel?: string;
  onPaymentRecorded?: (updated: AppointmentRow) => void;
  canViewSensitive?: boolean;
}) {
  const [appt, setAppt] = useState(initialAppt);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [unifiedProfile, setUnifiedProfile] = useState<UnifiedClientProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    overall_satisfaction: number;
    staff_professionalism: number;
    liked_most: string;
    comments_suggestions: string;
    name: string;
    created_at: string;
  } | null>(null);
  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });

  useEffect(() => {
    supabase
      .from('team_members')
      .select('user_id, email, full_name, role')
      .then(({ data }) => {
        setMemberLookup(buildMemberLookup((data ?? []) as TeamMember[]));
      });
  }, []);

  useEffect(() => {
    supabase
      .from('client_feedback')
      .select('overall_satisfaction, staff_professionalism, liked_most, comments_suggestions, name, created_at')
      .eq('appointment_id', appt.id)
      .maybeSingle()
      .then(({ data }) => setFeedback(data as typeof feedback));
  }, [appt.id]);

  useEffect(() => {
    let cancelled = false;
    if (!appt.client_id) { setUnifiedProfile(null); return; }
    setProfileLoading(true);
    loadUnifiedClientProfileFromAppointment(appt.client_id, appt.booking_id).then(p => {
      if (!cancelled) { setUnifiedProfile(p); setProfileLoading(false); }
    });
    return () => { cancelled = true; };
  }, [appt.client_id, appt.booking_id]);

  const cfg = STATUS_CFG[appt.status];
  const clientName = appt.clients?.full_name ?? '—';
  const branchName = appt.branches?.name ?? '—';
  const hasTeam = appt.nurse_name || appt.assistant_name || appt.driver_name || appt.vehicle;

  const feedbackUrl = `${window.location.origin}/?src=email&name=${encodeURIComponent(appt.clients?.full_name ?? '')}&appointment_id=${appt.id}#feedback`;
  const feedbackQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(feedbackUrl)}&margin=12&bgcolor=f0fdfa&color=0f766e&format=svg`;

  async function handlePaymentSaved() {
    setShowPaymentModal(false);
    const { data } = await supabase
      .from('appointments')
      .select('*, clients(id, full_name, email, phone), branches(id, name)')
      .eq('id', appt.id)
      .single();
    if (data) {
      const updated = data as AppointmentRow;
      setAppt(updated);
      onPaymentRecorded?.(updated);
    }
  }

  function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</p>
        <div className="bg-slate-50 rounded-2xl p-5">{children}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 -mx-8 -mt-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>
        <div className="h-5 w-px bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Appointment Details</p>
          <h2 className="text-base font-bold text-slate-900 truncate">{clientName}</h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <p className="text-xs text-slate-400 hidden sm:block">{fmtDate(appt.scheduled_date)}</p>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.bg} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] border-b border-slate-200">
        <div className="px-8 py-2.5 border-r border-slate-200">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Details</p>
        </div>
        <div className="px-8 py-2.5 hidden lg:block">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Workflow</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">

        {/* Left: Details */}
        <div className="bg-white border-r border-slate-200 p-8 space-y-7 min-h-[calc(100vh-180px)]">

          <SectionBlock title="Client Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <DetailRow label="Full Name" value={clientName} />
              <DetailRow label="Branch" value={branchName} />
              {appt.clients?.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{appt.clients.email}</span>
                </div>
              )}
              {appt.clients?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{appt.clients.phone}</span>
                </div>
              )}
            </div>
          </SectionBlock>

          <SectionBlock title="Appointment Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <DetailRow label="Scheduled Date" value={fmtDate(appt.scheduled_date)} />
              <DetailRow label="Scheduled Time" value={fmtTime(appt.scheduled_time)} />
              {appt.service && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-400 font-medium mb-1">Service</p>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 border border-teal-100 rounded-lg text-xs font-semibold text-teal-700">
                    <Stethoscope className="w-3 h-3" />{appt.service}
                  </span>
                </div>
              )}
              {appt.location && (
                <div className="sm:col-span-2 flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{appt.location}</span>
                </div>
              )}
            </div>
          </SectionBlock>

          {hasTeam && (
            <SectionBlock title="Team Assignment">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <DetailRow label="Nurse" value={appt.nurse_name ? resolveMemberName(appt.nurse_name, memberLookup) : undefined} />
                <DetailRow label="Assistant" value={appt.assistant_name ? resolveMemberName(appt.assistant_name, memberLookup) : undefined} />
                <DetailRow label="Driver" value={appt.driver_name ? resolveMemberName(appt.driver_name, memberLookup) : undefined} />
                <DetailRow label="Vehicle" value={appt.vehicle} />
              </div>
            </SectionBlock>
          )}

          <SectionBlock title="Status">
            <div className="flex flex-wrap gap-2 mb-3">
              <PaymentBadge status={appt.payment_status} />
              <IntakeBadge status={appt.intake_form_status} />
            </div>
            {appt.status === 'completed' && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl hover:bg-teal-700 transition-colors"
              >
                <Receipt className="w-3.5 h-3.5" />
                {appt.payment_recorded_at ? 'Update Payment' : 'Record Payment'}
              </button>
            )}
            {appt.payment_recorded_at && (
              <p className="text-xs text-slate-400 mt-2">
                Last recorded {fmtDateTime(appt.payment_recorded_at)}
                {appt.payment_method ? ` · ${METHOD_LABELS[appt.payment_method] ?? appt.payment_method}` : ''}
                {appt.payment_amount != null ? ` · ₱${Number(appt.payment_amount).toLocaleString()}` : ''}
              </p>
            )}
            {appt.payment_receipt_url && (
              <a
                href={appt.payment_receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-3 rounded-2xl overflow-hidden border border-slate-200 hover:border-teal-300 transition-colors"
                title="View full receipt"
              >
                <img
                  src={appt.payment_receipt_url}
                  alt="Payment receipt"
                  className="w-full max-h-48 object-cover"
                />
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-t border-slate-200">
                  <Camera className="w-3 h-3 text-slate-400" />
                  <span className="text-[11px] text-slate-400 font-medium">Tap to view full receipt</span>
                </div>
              </a>
            )}
          </SectionBlock>

          {appt.notes && (
            <SectionBlock title="Internal Notes">
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </SectionBlock>
          )}

          {feedback && (
            <SectionBlock title="Client Feedback">
              <div className="space-y-4">
                <div className="flex items-start gap-6">
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1.5">Overall Experience</p>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <span key={n} className={`text-lg leading-none ${n <= feedback.overall_satisfaction ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                      ))}
                      <span className="text-xs font-bold text-slate-500 ml-1.5">{feedback.overall_satisfaction}/5</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1.5">Staff Professionalism</p>
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <span key={n} className={`text-lg leading-none ${n <= feedback.staff_professionalism ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                      ))}
                      <span className="text-xs font-bold text-slate-500 ml-1.5">{feedback.staff_professionalism}/5</span>
                    </div>
                  </div>
                </div>
                {feedback.liked_most && (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1">What they liked</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{feedback.liked_most}</p>
                  </div>
                )}
                {feedback.comments_suggestions && (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1">Comments &amp; Suggestions</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{feedback.comments_suggestions}</p>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <MessageSquare className="w-3 h-3 text-slate-300 flex-shrink-0" />
                  <p className="text-xs text-slate-400">
                    Submitted by <span className="font-medium text-slate-500">{feedback.name || 'Anonymous'}</span>
                    {' · '}{fmtDateTime(feedback.created_at)}
                  </p>
                </div>
              </div>
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
            <p className="text-xs text-slate-300 font-medium">Appointment ID: {appt.id}</p>
          </div>
        </div>

        {/* Right: Workflow */}
        <div className="bg-white">
          <ApptWorkflow
            appt={appt}
            memberLookup={memberLookup}
            feedbackAt={feedback?.created_at ?? null}
            feedbackUrl={feedbackUrl}
            feedbackQrSrc={feedbackQrSrc}
            feedback={feedback}
          />
        </div>

      </div>

      {showPaymentModal && (
        <RecordPaymentModal
          appt={appt}
          onClose={() => setShowPaymentModal(false)}
          onSaved={handlePaymentSaved}
        />
      )}
    </div>
  );
}

// ─── Status Section Header ────────────────────────────────────────────────────

function SectionHeader({ status, count }: { status: string; count: number }) {
  const cfg = STATUS_CFG[status];
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{cfg.sectionLabel}</h3>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${count > 0 ? `${cfg.bg} ${cfg.color}` : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
        {count}
      </span>
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

// ─── Main OperationsTab ───────────────────────────────────────────────────────

export default function OperationsTab({
  canManage,
  userEmail,
  canViewSensitive,
}: {
  canManage: boolean;
  userEmail: string;
  canViewSensitive?: boolean;
}) {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppointmentRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<AppointmentRow | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<AppointmentRow | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelledSection, setShowCancelledSection] = useState(false);

  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });

  useEffect(() => {
    supabase
      .from('team_members')
      .select('user_id, email, full_name, role')
      .then(({ data }) => {
        setMemberLookup(buildMemberLookup((data ?? []) as TeamMember[]));
      });
  }, []);

  const loadBranches = useCallback(async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name');
    setBranches((data ?? []) as Branch[]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('appointments')
      .select('*, clients(id, full_name, email, phone), branches(id, name)')
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true });

    if (dateFilter) {
      query = query.eq('scheduled_date', dateFilter);
    }

    if (branchFilter !== 'all') {
      query = query.eq('branch_id', branchFilter);
    }

    const { data, error: dbErr } = await query;
    if (dbErr) setError('Failed to load appointments.');
    else setAppointments((data ?? []) as AppointmentRow[]);
    setLoading(false);
  }, [dateFilter, branchFilter]);

  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { load(); }, [load]);

  function toast(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleAdvance(appt: AppointmentRow) {
    const cfg = STATUS_CFG[appt.status];
    if (!cfg.nextStatus || !cfg.tsField) return;
    setAdvancingId(appt.id);
    const update: Record<string, string> = {
      status: cfg.nextStatus,
      [cfg.tsField]: new Date().toISOString(),
    };
    const { error: dbErr } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', appt.id);
    setAdvancingId(null);
    if (dbErr) { setError('Failed to update status.'); return; }
    toast(`Appointment marked as ${STATUS_CFG[cfg.nextStatus].label}.`);
    load();
  }

  async function handleCancel(appt: AppointmentRow) {
    setCancellingId(appt.id);
    const { error: dbErr } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appt.id);
    setCancellingId(null);
    if (dbErr) { setError('Failed to cancel appointment.'); return; }
    toast('Appointment cancelled.');
    load();
  }

  function handleDeleted(id: string) {
    setAppointments(prev => prev.filter(a => a.id !== id));
    toast('Appointment deleted.');
  }

  const byStatus = (s: string) =>
    appointments.filter(a => {
      const matches = a.status === s;
      if (!matches) return false;
      if (advancingId === a.id || cancellingId === a.id) return false;
      return true;
    });

  const totalActive = appointments.filter(a => a.status !== 'cancelled').length;
  const cancelledList = byStatus('cancelled');

  if (detailTarget) {
    return (
      <AppointmentDetailPage
        appt={detailTarget}
        onBack={() => setDetailTarget(null)}
        onPaymentRecorded={(updated) => { setDetailTarget(updated); load(); toast('Payment recorded.'); }}
        canViewSensitive={canViewSensitive}
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        {/* Branch filter */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              branchFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            All Branches
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => setBranchFilter(b.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                branchFilter === b.id ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3.5 py-2">
          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          />
          {dateFilter ? (
            <button
              onClick={() => setDateFilter('')}
              className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
              title="Show all dates"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-xs font-semibold text-teal-600 whitespace-nowrap">All dates</span>
          )}
        </div>

        <div className="sm:ml-auto flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Appointment
          </button>
        </div>
      </div>

      {/* Non-superadmin notice */}
      {!canManage && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 mb-6">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            You can view the board, add appointments, and advance statuses, but only a <span className="font-bold">Superadmin</span> can delete appointment records.
          </p>
        </div>
      )}

      {/* Success toast */}
      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-5">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium mb-6">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-200 animate-pulse" />
                <div className="h-4 bg-slate-200 rounded w-32 animate-pulse" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2].map(j => (
                  <div key={j} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                    <div className="h-5 bg-slate-200 rounded w-40 mb-3" />
                    <div className="h-4 bg-slate-100 rounded w-24 mb-2" />
                    <div className="h-4 bg-slate-100 rounded w-32" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && totalActive === 0 && cancelledList.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-slate-600 font-semibold text-lg">No appointments</p>
          <p className="text-slate-400 text-sm mt-1">
            No appointments found for the selected filters.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Appointment
          </button>
        </div>
      )}

      {/* Status sections */}
      {!loading && (totalActive > 0 || cancelledList.length > 0) && (
        <div className="space-y-8">
          {STATUS_ORDER.map(status => {
            const cards = byStatus(status);
            return (
              <div key={status}>
                <SectionHeader status={status} count={cards.length} />
                {cards.length === 0 ? (
                  <div className="border-2 border-dashed border-slate-100 rounded-2xl py-6 text-center">
                    <p className="text-xs text-slate-300 font-semibold">No appointments in this stage</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cards.map(appt => (
                      <div key={appt.id} className={`transition-opacity ${advancingId === appt.id || cancellingId === appt.id ? 'opacity-50 pointer-events-none' : ''}`}>
                        <AppointmentCard
                          appt={appt}
                          canManage={canManage}
                          memberLookup={memberLookup}
                          onAdvance={handleAdvance}
                          onCancel={handleCancel}
                          onDelete={setDeleteTarget}
                          onViewDetail={setDetailTarget}
                          onRecordPayment={setPaymentTarget}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cancelled — collapsible */}
          {cancelledList.length > 0 && (
            <div>
              <button
                onClick={() => setShowCancelledSection(p => !p)}
                className="flex items-center gap-3 w-full mb-3 group"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-red-400" />
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Cancelled</h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600">
                  {cancelledList.length}
                </span>
                <div className="flex-1 h-px bg-slate-100" />
                {showCancelledSection
                  ? <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />}
              </button>
              {showCancelledSection && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cancelledList.map(appt => (
                    <AppointmentCard
                      key={appt.id}
                      appt={appt}
                      canManage={canManage}
                      memberLookup={memberLookup}
                      onAdvance={handleAdvance}
                      onCancel={handleCancel}
                      onDelete={setDeleteTarget}
                      onViewDetail={setDetailTarget}
                      onRecordPayment={setPaymentTarget}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddAppointmentModal
          branches={branches}
          defaultDate={dateFilter}
          userEmail={userEmail}
          onClose={() => setShowAdd(false)}
          onSaved={() => { load(); toast('Appointment added successfully.'); }}
        />
      )}

      {deleteTarget && (
        <DeleteAppointmentModal
          appt={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      {paymentTarget && (
        <RecordPaymentModal
          appt={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => { load(); setPaymentTarget(null); toast('Payment recorded.'); }}
        />
      )}
    </div>
  );
}
