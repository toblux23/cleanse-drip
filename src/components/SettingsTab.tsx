import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  Mail,
  ClipboardList,
  FileText,
  Users,
  ShieldCheck,
  Crown,
  ToggleLeft,
  ToggleRight,
  BellRing,
  Lock,
  Check,
  Hourglass,
  Save,
  Clock,
  Plus,
  Trash2,
  X,
  Pencil,
} from 'lucide-react';
import { supabase, type TeamMember, type Role, type Permission, type FeatureSetting, type BookingBufferSetting, type BookingBufferAudit, ROLES } from '../lib/supabase';

// ─── Time Slot Types ──────────────────────────────────────────────────────────

interface BookingTimeSlot {
  id: string;
  slot_time: string;
  label: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string | null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationSetting {
  id: string | null;
  team_member_id: string;
  notify_booking: boolean;
  notify_intake_form: boolean;
}

interface MemberRow extends TeamMember {
  settings: NotificationSetting;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
      title={value ? 'On — click to disable' : 'Off — click to enable'}
    >
      {value ? (
        <ToggleRight className="w-8 h-8 text-teal-600" />
      ) : (
        <ToggleLeft className="w-8 h-8 text-slate-300" />
      )}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Presentation for known feature flags. Without this, a key like
// `inventory.auto_deduct` renders as "Inventory.auto Deduct" with the generic
// "Feature toggle." description — too vague for a switch that moves real stock.
const FEATURE_META: Record<string, { label: string; description: string; warning?: string }> = {
  client_management: {
    label: 'Enable Client Management',
    description: 'Show the Client Management module for maintaining the master client list.',
  },
  'inventory.auto_deduct': {
    label: 'Automatic Inventory Deduction',
    description: 'Deduct a treatment’s recipe components from stock when the nurse starts the treatment, instead of at completion.',
    warning: 'This moves real stock. While disabled, nothing is deducted automatically and inventory must be adjusted manually.',
  },
};

function featureMeta(key: string): { label: string; description: string; warning?: string } {
  return FEATURE_META[key] ?? {
    label: key.replace(/[_.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: 'Feature toggle.',
  };
}

export default function SettingsTab() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [view, setView] = useState<'notifications' | 'roles' | 'features' | 'buffer' | 'slots'>('notifications');

  // Roles & permissions state
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<number, Set<number>>>({});
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [savingPerm, setSavingPerm] = useState<string | null>(null);
  const [rolesErr, setRolesErr] = useState('');

  // Feature toggles state
  const [features, setFeatures] = useState<FeatureSetting[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [savingFeature, setSavingFeature] = useState<string | null>(null);
  const [featuresErr, setFeaturesErr] = useState('');

  // Buffer settings state
  const [bufferSettings, setBufferSettings] = useState<BookingBufferSetting[]>([]);
  const [bufferAudit, setBufferAudit] = useState<BookingBufferAudit[]>([]);
  const [loadingBuffer, setLoadingBuffer] = useState(false);
  const [savingBuffer, setSavingBuffer] = useState(false);
  const [bufferErr, setBufferErr] = useState('');
  const [bufferForm, setBufferForm] = useState({ buffer_value: 2, buffer_unit: 'hours' as 'minutes' | 'hours', scope_type: 'all' as BookingBufferSetting['scope_type'], scope_target: '', effective_date: new Date().toISOString().split('T')[0], is_active: true, reason: '' });

  // Time slots state
  const [timeSlots, setTimeSlots] = useState<BookingTimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotsErr, setSlotsErr] = useState('');
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotLabel, setNewSlotLabel] = useState('');
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ slot_time: '', label: '', display_order: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [membersRes, settingsRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('*')
        .eq('status', 'approved')
        .order('email'),
      supabase
        .from('notification_settings')
        .select('*'),
    ]);

    if (membersRes.error) { setErr(membersRes.error.message); setLoading(false); return; }
    if (settingsRes.error) { setErr(settingsRes.error.message); setLoading(false); return; }

    const settingsMap = new Map<string, NotificationSetting>(
      (settingsRes.data ?? []).map(s => [s.team_member_id, s as NotificationSetting])
    );

    const rows: MemberRow[] = (membersRes.data ?? []).map(m => ({
      ...m,
      settings: settingsMap.get(m.id) ?? {
        id: null,
        team_member_id: m.id,
        notify_booking: true,
        notify_intake_form: true,
      },
    }));

    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRolesPermissions = useCallback(async () => {
    setLoadingRoles(true);
    setRolesErr('');
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      supabase.from('roles').select('*').order('id'),
      supabase.from('permissions').select('*').order('id'),
      supabase.from('role_permissions').select('*'),
    ]);
    setRoles(rolesRes.data ?? []);
    setAllPermissions(permsRes.data ?? []);
    const map: Record<number, Set<number>> = {};
    for (const rp of (rpRes.data ?? [])) {
      if (!map[rp.role_id]) map[rp.role_id] = new Set();
      map[rp.role_id].add(rp.permission_id);
    }
    setRolePerms(map);
    setLoadingRoles(false);
  }, []);

  useEffect(() => {
    if (view === 'roles') loadRolesPermissions();
  }, [view, loadRolesPermissions]);

  const loadFeatures = useCallback(async () => {
    setLoadingFeatures(true);
    setFeaturesErr('');
    const { data, error: dbErr } = await supabase
      .from('feature_settings')
      .select('*')
      .order('key');
    if (dbErr) setFeaturesErr(dbErr.message);
    else setFeatures(data ?? []);
    setLoadingFeatures(false);
  }, []);

  useEffect(() => {
    if (view === 'features') loadFeatures();
  }, [view, loadFeatures]);

  const loadTimeSlots = useCallback(async () => {
    setLoadingSlots(true);
    setSlotsErr('');
    const { data, error: dbErr } = await supabase
      .from('booking_time_slots')
      .select('*')
      .order('display_order', { ascending: true });
    if (dbErr) setSlotsErr(dbErr.message);
    else setTimeSlots((data ?? []) as BookingTimeSlot[]);
    setLoadingSlots(false);
  }, []);

  useEffect(() => {
    if (view === 'slots') loadTimeSlots();
  }, [view, loadTimeSlots]);

  async function addTimeSlot() {
    if (!newSlotTime) { setSlotsErr('Select a time first.'); return; }
    setSavingSlot(true);
    setSlotsErr('');
    const maxOrder = timeSlots.length > 0 ? Math.max(...timeSlots.map(s => s.display_order)) : 0;
    const { error: insertErr } = await supabase.from('booking_time_slots').insert({
      slot_time: newSlotTime,
      label: newSlotLabel.trim() || null,
      display_order: maxOrder + 1,
      is_active: true,
    });
    if (insertErr) {
      setSlotsErr(insertErr.code === '23505' ? 'A slot for this time already exists.' : insertErr.message);
      setSavingSlot(false);
      return;
    }
    setNewSlotTime('');
    setNewSlotLabel('');
    setSavingSlot(false);
    loadTimeSlots();
  }

  async function toggleSlot(slot: BookingTimeSlot) {
    setSavingSlot(true);
    setSlotsErr('');
    const { error } = await supabase
      .from('booking_time_slots')
      .update({ is_active: !slot.is_active, updated_at: new Date().toISOString() })
      .eq('id', slot.id);
    if (error) setSlotsErr(error.message);
    else setTimeSlots(prev => prev.map(s => s.id === slot.id ? { ...s, is_active: !s.is_active } : s));
    setSavingSlot(false);
  }

  async function deleteSlot(slot: BookingTimeSlot) {
    setSavingSlot(true);
    setSlotsErr('');
    const { error } = await supabase
      .from('booking_time_slots')
      .delete()
      .eq('id', slot.id);
    if (error) setSlotsErr(error.message);
    else setTimeSlots(prev => prev.filter(s => s.id !== slot.id));
    setSavingSlot(false);
  }

  function startEditSlot(slot: BookingTimeSlot) {
    setEditingSlotId(slot.id);
    setEditForm({ slot_time: slot.slot_time, label: slot.label ?? '', display_order: slot.display_order });
    setSlotsErr('');
  }

  function cancelEditSlot() {
    setEditingSlotId(null);
    setSlotsErr('');
  }

  async function saveEditSlot(slot: BookingTimeSlot) {
    if (!editForm.slot_time) { setSlotsErr('Time is required.'); return; }
    setSavingSlot(true);
    setSlotsErr('');
    const { error } = await supabase
      .from('booking_time_slots')
      .update({
        slot_time: editForm.slot_time,
        label: editForm.label.trim() || null,
        display_order: editForm.display_order,
        updated_at: new Date().toISOString(),
      })
      .eq('id', slot.id);
    if (error) {
      setSlotsErr(error.code === '23505' ? 'A slot with this time already exists.' : error.message);
      setSavingSlot(false);
      return;
    }
    setEditingSlotId(null);
    setSavingSlot(false);
    loadTimeSlots();
  }

  const loadBuffer = useCallback(async () => {
    setLoadingBuffer(true);
    setBufferErr('');
    const [settingsRes, auditRes] = await Promise.all([
      supabase.from('booking_buffer_settings').select('*').order('created_at', { ascending: false }),
      supabase.from('booking_buffer_audit').select('*').order('changed_at', { ascending: false }).limit(20),
    ]);
    if (settingsRes.data) setBufferSettings(settingsRes.data as BookingBufferSetting[]);
    if (auditRes.data) setBufferAudit(auditRes.data as BookingBufferAudit[]);
    setLoadingBuffer(false);
  }, []);

  useEffect(() => {
    if (view === 'buffer') loadBuffer();
  }, [view, loadBuffer]);

  async function saveBufferSetting() {
    setSavingBuffer(true);
    setBufferErr('');
    const { data: userData } = await supabase.auth.getUser();
    const changedBy = userData.user?.email ?? 'unknown';
    const oldValue = bufferSettings.find(s => s.scope_type === bufferForm.scope_type && s.is_active)
      ? `${bufferSettings.find(s => s.scope_type === bufferForm.scope_type && s.is_active)!.buffer_value} ${bufferSettings.find(s => s.scope_type === bufferForm.scope_type && s.is_active)!.buffer_unit}`
      : 'none';
    const newValue = `${bufferForm.buffer_value} ${bufferForm.buffer_unit}`;
    const { data, error: insertErr } = await supabase.from('booking_buffer_settings').insert({
      buffer_value: bufferForm.buffer_value,
      buffer_unit: bufferForm.buffer_unit,
      scope_type: bufferForm.scope_type,
      scope_target: bufferForm.scope_target || null,
      effective_date: bufferForm.effective_date,
      is_active: bufferForm.is_active,
      created_by: changedBy,
    }).select().single();
    if (insertErr) { setBufferErr(insertErr.message); setSavingBuffer(false); return; }
    await supabase.from('booking_buffer_audit').insert({
      setting_id: data.id,
      old_value: oldValue,
      new_value: newValue,
      changed_by: changedBy,
      reason: bufferForm.reason || null,
    });
    setSavingBuffer(false);
    setBufferForm(prev => ({ ...prev, reason: '' }));
    loadBuffer();
  }

  async function toggleFeature(key: string, enabled: boolean) {
    setSavingFeature(key);
    setFeaturesErr('');
    const { error: dbErr } = await supabase
      .from('feature_settings')
      .update({ enabled: !enabled, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (dbErr) setFeaturesErr(dbErr.message);
    else setFeatures(prev => prev.map(f => f.key === key ? { ...f, enabled: !enabled } : f));
    setSavingFeature(null);
  }

  async function togglePermission(roleId: number, permId: number, enabled: boolean) {
    const role = roles.find(r => r.id === roleId);
    if (role?.is_system && role.key === 'superadmin') return;
    setSavingPerm(`${roleId}-${permId}`);
    setRolesErr('');
    if (enabled) {
      const { error } = await supabase.from('role_permissions').insert({ role_id: roleId, permission_id: permId });
      if (error) setRolesErr(error.message);
      else setRolePerms(prev => ({ ...prev, [roleId]: new Set([...(prev[roleId] ?? []), permId]) }));
    } else {
      const { error } = await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', permId);
      if (error) setRolesErr(error.message);
      else setRolePerms(prev => {
        const next = new Set(prev[roleId] ?? []);
        next.delete(permId);
        return { ...prev, [roleId]: next };
      });
    }
    setSavingPerm(null);
  }

  async function upsertSetting(memberId: string, patch: Partial<Omit<NotificationSetting, 'id' | 'team_member_id'>>) {
    setSaving(s => ({ ...s, [memberId]: true }));

    const member = members.find(m => m.id === memberId);
    if (!member) { setSaving(s => ({ ...s, [memberId]: false })); return; }

    const current = member.settings;
    const payload = {
      team_member_id: memberId,
      notify_booking: patch.notify_booking ?? current.notify_booking,
      notify_intake_form: patch.notify_intake_form ?? current.notify_intake_form,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('notification_settings')
      .upsert(payload, { onConflict: 'team_member_id' });

    setSaving(s => ({ ...s, [memberId]: false }));
    if (error) { setErr(error.message); return; }

    setMembers(prev =>
      prev.map(m =>
        m.id === memberId
          ? { ...m, settings: { ...m.settings, ...payload } }
          : m
      )
    );
  }

  async function handleTurnOffAll() {
    setSaving({ all: true });
    setErr('');
    const results = await Promise.allSettled(
      members.map(m =>
        upsertSetting(m.id, { notify_booking: false, notify_intake_form: false })
      )
    );
    setSaving({ all: false });
    const anyFailed = results.some(r => r.status === 'rejected');
    if (!anyFailed) {
      setSuccessMsg('All notifications turned off.');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  }

  async function handleTurnOnAll() {
    setSaving({ all: true });
    setErr('');
    await Promise.allSettled(
      members.map(m =>
        upsertSetting(m.id, { notify_booking: true, notify_intake_form: true })
      )
    );
    setSaving({ all: false });
    setSuccessMsg('All notifications turned on.');
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  const totalEnabled = members.filter(
    m => m.settings.notify_booking || m.settings.notify_intake_form
  ).length;

  const bookingEnabled = members.filter(m => m.settings.notify_booking).length;
  const intakeEnabled  = members.filter(m => m.settings.notify_intake_form).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage notification preferences and role-based access control.
          </p>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setView('notifications')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              view === 'notifications' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Bell className="w-4 h-4" /> Notifications
          </button>
          <button
            onClick={() => setView('roles')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              view === 'roles' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <ShieldCheck className="w-4 h-4" /> Roles & Permissions
          </button>
          <button
            onClick={() => setView('features')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              view === 'features' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <ToggleLeft className="w-4 h-4" /> Feature Toggles
          </button>
          <button
            onClick={() => setView('buffer')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              view === 'buffer' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Hourglass className="w-4 h-4" /> Booking Buffer
          </button>
          <button
            onClick={() => setView('slots')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              view === 'slots' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Clock className="w-4 h-4" /> Time Slots
          </button>
        </div>
      </div>

      {view === 'notifications' && (<>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleTurnOnAll}
            disabled={!!saving['all']}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-xl hover:bg-teal-100 disabled:opacity-50 transition-colors"
          >
            <Bell className="w-4 h-4" />
            Enable All
          </button>
          <button
            onClick={handleTurnOffAll}
            disabled={!!saving['all']}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 border border-slate-200 bg-white rounded-xl hover:bg-red-50 hover:text-red-700 hover:border-red-200 disabled:opacity-50 transition-colors"
          >
            {saving['all'] ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
            Turn Off All
          </button>
        </div>

      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <Bell className="w-4 h-4 flex-shrink-0" /> {successMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Receiving Any Alert</p>
            <p className="text-2xl font-bold text-slate-800">{totalEnabled} <span className="text-sm font-normal text-slate-400">/ {members.length}</span></p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Booking Alerts On</p>
            <p className="text-2xl font-bold text-slate-800">{bookingEnabled} <span className="text-sm font-normal text-slate-400">/ {members.length}</span></p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Intake Form Alerts On</p>
            <p className="text-2xl font-bold text-slate-800">{intakeEnabled} <span className="text-sm font-normal text-slate-400">/ {members.length}</span></p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-teal-50 border border-teal-200 rounded flex items-center justify-center">
            <ClipboardList className="w-2.5 h-2.5 text-teal-600" />
          </div>
          Bookings — new appointment requests from the public form
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-violet-50 border border-violet-200 rounded flex items-center justify-center">
            <FileText className="w-2.5 h-2.5 text-violet-600" />
          </div>
          Intake Form — client feedback / post-visit form submissions
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Users className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No approved team members</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_160px_160px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span>Team Member</span>
            <span className="flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-blue-500" />
              Bookings
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-violet-500" />
              Intake Form
            </span>
          </div>

          <div className="divide-y divide-slate-50">
            {members.map(member => {
              const isSaving = !!saving[member.id];
              const allOff = !member.settings.notify_booking && !member.settings.notify_intake_form;
              return (
                <div
                  key={member.id}
                  className={`grid grid-cols-[1fr_160px_160px] items-center px-6 py-4 transition-colors ${allOff ? 'bg-slate-50/60 opacity-75' : 'hover:bg-slate-50/40'}`}
                >
                  {/* Member info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${member.role === 'superadmin' ? 'bg-amber-100' : 'bg-teal-100'}`}>
                      {member.role === 'superadmin'
                        ? <Crown className="w-4 h-4 text-amber-600" />
                        : <ShieldCheck className="w-4 h-4 text-teal-600" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">{member.email}</p>
                        {member.role === 'superadmin' && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md leading-tight">
                            ADMIN
                          </span>
                        )}
                      </div>
                      {allOff && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <BellOff className="w-3 h-3 text-slate-400" />
                          <span className="text-xs text-slate-400">All notifications off</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Booking toggle */}
                  <div className="flex items-center gap-2.5">
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    ) : (
                      <Toggle
                        value={member.settings.notify_booking}
                        onChange={v => upsertSetting(member.id, { notify_booking: v })}
                      />
                    )}
                    <span className={`text-sm font-medium ${member.settings.notify_booking ? 'text-teal-700' : 'text-slate-400'}`}>
                      {member.settings.notify_booking ? 'On' : 'Off'}
                    </span>
                  </div>

                  {/* Intake Form toggle */}
                  <div className="flex items-center gap-2.5">
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    ) : (
                      <Toggle
                        value={member.settings.notify_intake_form}
                        onChange={v => upsertSetting(member.id, { notify_intake_form: v })}
                      />
                    )}
                    <span className={`text-sm font-medium ${member.settings.notify_intake_form ? 'text-teal-700' : 'text-slate-400'}`}>
                      {member.settings.notify_intake_form ? 'On' : 'Off'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer info */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs text-slate-400">
              Changes take effect immediately. Members with all notifications off will not receive any email alerts.
            </p>
          </div>
        </div>
      )}
      </>)}

      {view === 'features' && (
        <div className="space-y-6">
          {featuresErr && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {featuresErr}
            </div>
          )}
          {loadingFeatures ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {features.map(f => {
                const isClientMgmt = f.key === 'client_management';
                const meta = featureMeta(f.key);
                return (
                  <div key={f.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${f.enabled ? 'bg-teal-50' : 'bg-slate-100'}`}>
                          {isClientMgmt ? <Users className={`w-5 h-5 ${f.enabled ? 'text-teal-600' : 'text-slate-400'}`} /> : <ToggleLeft className={`w-5 h-5 ${f.enabled ? 'text-teal-600' : 'text-slate-400'}`} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{meta.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{meta.description}</p>
                          {meta.warning && (
                            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2 flex items-start gap-1.5">
                              <AlertTriangle className="w-3 h-3 mt-px flex-shrink-0" />
                              <span>{meta.warning}</span>
                            </p>
                          )}
                          <p className="text-[11px] text-slate-300 mt-1.5">Last updated {f.updated_at ? new Date(f.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleFeature(f.key, f.enabled)}
                        disabled={savingFeature === f.key}
                        className="flex-shrink-0"
                      >
                        {savingFeature === f.key ? (
                          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        ) : f.enabled ? (
                          <ToggleRight className="w-8 h-8 text-teal-600" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
            <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-700">Feature Toggles</p>
              <p className="text-xs text-blue-600 mt-1">
                Toggle modules on or off. When disabled, the navigation item is hidden but no data is deleted.
                Access to each module is still controlled by RBAC permissions.
              </p>
            </div>
          </div>
        </div>
      )}

      {view === 'roles' && (
        <RolesPermissionsView
          roles={roles}
          permissions={allPermissions}
          rolePerms={rolePerms}
          loading={loadingRoles}
          savingPerm={savingPerm}
          onToggle={togglePermission}
          err={rolesErr}
        />
      )}

      {view === 'buffer' && (
        <BufferSettingsView
          settings={bufferSettings}
          audit={bufferAudit}
          loading={loadingBuffer}
          saving={savingBuffer}
          err={bufferErr}
          form={bufferForm}
          setForm={setBufferForm}
          onSave={saveBufferSetting}
        />
      )}

      {view === 'slots' && (
        <TimeSlotsView
          slots={timeSlots}
          loading={loadingSlots}
          saving={savingSlot}
          err={slotsErr}
          newSlotTime={newSlotTime}
          setNewSlotTime={setNewSlotTime}
          newSlotLabel={newSlotLabel}
          setNewSlotLabel={setNewSlotLabel}
          onAdd={addTimeSlot}
          onToggle={toggleSlot}
          onDelete={deleteSlot}
          editingSlotId={editingSlotId}
          editForm={editForm}
          setEditForm={setEditForm}
          onStartEdit={startEditSlot}
          onCancelEdit={cancelEditSlot}
          onSaveEdit={saveEditSlot}
        />
      )}
    </div>
  );
}

// ─── Buffer Settings View ─────────────────────────────────────────────────────

interface BufferFormState {
  buffer_value: number;
  buffer_unit: 'minutes' | 'hours';
  scope_type: BookingBufferSetting['scope_type'];
  scope_target: string;
  effective_date: string;
  is_active: boolean;
  reason: string;
}

function BufferSettingsView({
  settings, audit, loading, saving, err, form, setForm, onSave,
}: {
  settings: BookingBufferSetting[];
  audit: BookingBufferAudit[];
  loading: boolean;
  saving: boolean;
  err: string;
  form: BufferFormState;
  setForm: React.Dispatch<React.SetStateAction<BufferFormState>>;
  onSave: () => void;
}) {
  const presets = [
    { label: '1 hour', value: 1, unit: 'hours' as const },
    { label: '2 hours', value: 2, unit: 'hours' as const },
    { label: '3 hours', value: 3, unit: 'hours' as const },
    { label: '4 hours', value: 4, unit: 'hours' as const },
  ];

  return (
    <div className="space-y-6">
      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* New / edit form */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Hourglass className="w-5 h-5 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-700">Configure Booking Lead-Time Buffer</h3>
        </div>

        {/* Presets */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Presets</label>
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <button key={p.label} onClick={() => setForm(prev => ({ ...prev, buffer_value: p.value, buffer_unit: p.unit }))}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border-2 transition-colors ${form.buffer_value === p.value && form.buffer_unit === p.unit ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{p.label}</button>
            ))}
            <button onClick={() => setForm(prev => ({ ...prev, buffer_value: 30, buffer_unit: 'minutes' }))}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border-2 transition-colors ${form.buffer_value === 30 && form.buffer_unit === 'minutes' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Custom</button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Value</label>
            <input type="number" min={1} value={form.buffer_value} onChange={e => setForm(prev => ({ ...prev, buffer_value: Number(e.target.value) }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Unit</label>
            <select value={form.buffer_unit} onChange={e => setForm(prev => ({ ...prev, buffer_unit: e.target.value as 'minutes' | 'hours' }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Effective Date</label>
            <input type="date" value={form.effective_date} onChange={e => setForm(prev => ({ ...prev, effective_date: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Apply To</label>
            <select value={form.scope_type} onChange={e => setForm(prev => ({ ...prev, scope_type: e.target.value as BookingBufferSetting['scope_type'] }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
              <option value="all">All Nurses</option>
              <option value="selected_nurse">Selected Nurse</option>
              <option value="selected_branch">Selected Branch</option>
              <option value="selected_service">Selected Service</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Target (ID or name)</label>
            <input type="text" value={form.scope_target} onChange={e => setForm(prev => ({ ...prev, scope_target: e.target.value }))} disabled={form.scope_type === 'all'} placeholder={form.scope_type === 'all' ? '—' : 'Enter target'} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50 disabled:text-slate-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Status</label>
            <select value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm(prev => ({ ...prev, is_active: e.target.value === 'active' }))} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Reason (required for audit log)</label>
          <input type="text" value={form.reason} onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))} placeholder="e.g. Increased buffer for holiday season" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>

        <button onClick={onSave} disabled={saving || !form.reason.trim()} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Buffer Setting
        </button>
      </div>

      {/* Active settings list */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-700">All Buffer Settings</h3></div>
          <div className="divide-y divide-slate-50">
            {settings.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No buffer settings configured.</p>
            ) : settings.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.is_active ? 'bg-teal-50' : 'bg-slate-100'}`}><Hourglass className={`w-4 h-4 ${s.is_active ? 'text-teal-600' : 'text-slate-400'}`} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{s.buffer_value} {s.buffer_unit}</p>
                  <p className="text-xs text-slate-400">Scope: {s.scope_type.replace('_', ' ')}{s.scope_target ? ` → ${s.scope_target}` : ''} · Effective {s.effective_date}</p>
                </div>
                <span className={`text-xs font-bold ${s.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit log */}
      {audit.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-700">Change Audit Log</h3></div>
          <div className="divide-y divide-slate-50">
            {audit.map(a => (
              <div key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{a.old_value ?? 'none'} → {a.new_value ?? '—'}</p>
                  <span className="text-xs text-slate-400">{new Date(a.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <p className="text-xs text-slate-400">By {a.changed_by ?? '—'}{a.reason ? ` · ${a.reason}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
        <Hourglass className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-700">Booking Lead-Time Buffer</p>
          <p className="text-xs text-blue-600 mt-1">
            Sets the minimum time between now and a bookable appointment start. Default: 2 hours.
            Applies to the public booking form, internal booking, and rescheduling. Every change is logged with old value, new value, changed by, and reason.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Time Slots View ──────────────────────────────────────────────────────────

function formatSlotLabel(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const hour12 = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function TimeSlotsView({
  slots, loading, saving, err, newSlotTime, setNewSlotTime, newSlotLabel, setNewSlotLabel, onAdd, onToggle, onDelete,
  editingSlotId, editForm, setEditForm, onStartEdit, onCancelEdit, onSaveEdit,
}: {
  slots: BookingTimeSlot[];
  loading: boolean;
  saving: boolean;
  err: string;
  newSlotTime: string;
  setNewSlotTime: (v: string) => void;
  newSlotLabel: string;
  setNewSlotLabel: (v: string) => void;
  onAdd: () => void;
  onToggle: (slot: BookingTimeSlot) => void;
  onDelete: (slot: BookingTimeSlot) => void;
  editingSlotId: string | null;
  editForm: { slot_time: string; label: string; display_order: number };
  setEditForm: (f: { slot_time: string; label: string; display_order: number }) => void;
  onStartEdit: (slot: BookingTimeSlot) => void;
  onCancelEdit: () => void;
  onSaveEdit: (slot: BookingTimeSlot) => void;
}) {
  return (
    <div className="space-y-6">
      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Add new slot */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-700">Add New Time Slot</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Time</label>
            <input
              type="time"
              value={newSlotTime}
              onChange={e => setNewSlotTime(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Label (optional)</label>
            <input
              type="text"
              value={newSlotLabel}
              onChange={e => setNewSlotLabel(e.target.value)}
              placeholder="e.g. Late Afternoon"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onAdd}
              disabled={saving || !newSlotTime}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Slot
            </button>
          </div>
        </div>
      </div>

      {/* Slots list */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Configured Time Slots</h3>
            <span className="text-xs text-slate-400">{slots.filter(s => s.is_active).length} active of {slots.length} total</span>
          </div>
          {slots.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No time slots configured. Add one above.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {slots.map(slot => (
                <div key={slot.id} className="px-5 py-3.5">
                  {editingSlotId === slot.id ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        <input
                          type="time"
                          value={editForm.slot_time}
                          onChange={e => setEditForm({ ...editForm, slot_time: e.target.value })}
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 w-28"
                        />
                      </div>
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                        placeholder="Label (optional)"
                        className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <input
                        type="number"
                        min={1}
                        value={editForm.display_order}
                        onChange={e => setEditForm({ ...editForm, display_order: Number(e.target.value) })}
                        className="w-16 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onSaveEdit(slot)}
                          disabled={saving}
                          className="p-1.5 rounded-lg text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-colors"
                          title="Save changes"
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={onCancelEdit}
                          disabled={saving}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                          title="Cancel edit"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${slot.is_active ? 'bg-teal-50' : 'bg-slate-100'}`}>
                        <Clock className={`w-4 h-4 ${slot.is_active ? 'text-teal-600' : 'text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">{slot.label || formatSlotLabel(slot.slot_time)}</p>
                        <p className="text-xs text-slate-400">{slot.slot_time} · Order #{slot.display_order}</p>
                      </div>
                      <button
                        onClick={() => onStartEdit(slot)}
                        disabled={saving}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
                        title="Edit slot"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onToggle(slot)}
                        disabled={saving}
                        className="flex-shrink-0"
                        title={slot.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {slot.is_active ? <ToggleRight className="w-8 h-8 text-teal-600" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                      </button>
                      <button
                        onClick={() => onDelete(slot)}
                        disabled={saving}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Delete slot"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
        <Clock className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-700">Configurable Time Slots</p>
          <p className="text-xs text-blue-600 mt-1">
            Manage the appointment time slots shown on the public booking form and internal manual entry.
            Toggle slots on/off without deleting them, add late-afternoon or after-hours slots as needed,
            or remove unused slots entirely. If all slots are deactivated, the system falls back to default slots.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Roles & Permissions View ────────────────────────────────────────────────

function RolesPermissionsView({
  roles,
  permissions,
  rolePerms,
  loading,
  savingPerm,
  onToggle,
  err,
}: {
  roles: Role[];
  permissions: Permission[];
  rolePerms: Record<number, Set<number>>;
  loading: boolean;
  savingPerm: string | null;
  onToggle: (roleId: number, permId: number, enabled: boolean) => void;
  err: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Role cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => {
          const perms = rolePerms[role.id] ?? new Set<number>();
          const isSuper = role.key === 'superadmin' && role.is_system;
          return (
            <div key={role.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Role header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  role.key === 'superadmin' ? 'bg-amber-100' : role.key === 'nurse' ? 'bg-teal-100' : 'bg-slate-100'
                }`}>
                  {role.key === 'superadmin'
                    ? <Crown className="w-4 h-4 text-amber-600" />
                    : role.key === 'nurse'
                    ? <ShieldCheck className="w-4 h-4 text-teal-600" />
                    : <Users className="w-4 h-4 text-slate-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{role.label}</p>
                  <p className="text-xs text-slate-400">{role.description || 'No description'}</p>
                </div>
                {isSuper && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-bold text-amber-700">
                    <Lock className="w-2.5 h-2.5" /> LOCKED
                  </span>
                )}
              </div>

              {/* Permissions list */}
              <div className="p-3 space-y-1">
                {permissions.map(perm => {
                  const enabled = perms.has(perm.id);
                  const saving = savingPerm === `${role.id}-${perm.id}`;
                  const locked = isSuper;
                  return (
                    <button
                      key={perm.id}
                      onClick={() => !locked && onToggle(role.id, perm.id, !enabled)}
                      disabled={locked || saving}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        locked ? 'cursor-default opacity-60' : 'hover:bg-slate-50'
                      }`}
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin text-teal-500 flex-shrink-0" />
                      ) : enabled ? (
                        <ToggleRight className={`w-5 h-5 flex-shrink-0 ${locked ? 'text-amber-500' : 'text-teal-500'}`} />
                      ) : (
                        <ToggleLeft className="w-5 h-5 flex-shrink-0 text-slate-300" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${enabled ? 'text-slate-700' : 'text-slate-400'}`}>
                          {perm.label}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{perm.description || 'No description'}</p>
                      </div>
                      {enabled && !saving && (
                        <Check className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
                <p className="text-xs text-slate-400">
                  {perms.size} of {permissions.length} permissions granted
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
        <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-700">How RBAC Works</p>
          <p className="text-xs text-blue-600 mt-1">
            Each role has a set of permissions. Users assigned to that role inherit all its permissions.
            The Superadmin role is locked and always has all permissions. Assign roles to team members
            from the Team Members tab.
          </p>
        </div>
      </div>
    </div>
  );
}
