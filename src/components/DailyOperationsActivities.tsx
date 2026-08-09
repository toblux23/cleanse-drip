import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Search, CalendarCheck, Plus,
  X, User, Clock, CheckCircle2, Circle, Loader, Trash2, ChevronDown,
  Filter, Calendar, AlertTriangle, ClipboardList,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMemberOption {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface ClientOption {
  id: string;
  full_name: string;
}

interface BookingOption {
  id: string;
  full_name: string;
  preferred_date: string;
  services_requested: string[];
}

interface OperationalTask {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  client_id: string | null;
  booking_id: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  assignee: TeamMemberOption | null;
  client: ClientOption | null;
  booking: BookingOption | null;
}

type TaskStatus = 'pending' | 'in_progress' | 'completed';
type TaskPriority = 'low' | 'normal' | 'high';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

const STATUS_CFG: Record<TaskStatus, { label: string; icon: React.ElementType; cls: string; iconCls: string }> = {
  pending:     { label: 'Pending',     icon: Circle,       cls: 'bg-slate-50 text-slate-600 border-slate-200',     iconCls: 'text-slate-400' },
  in_progress: { label: 'In Progress', icon: Loader,        cls: 'bg-blue-50 text-blue-700 border-blue-200',       iconCls: 'text-blue-500' },
  completed:   { label: 'Completed',   icon: CheckCircle2,  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', iconCls: 'text-emerald-500' },
};

const PRIORITY_CFG: Record<TaskPriority, { label: string; cls: string }> = {
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  normal: { label: 'Normal', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  high:   { label: 'High',   cls: 'bg-red-50 text-red-700 border-red-200' },
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'in_progress',
};

// ─── Create Task Modal ────────────────────────────────────────────────────────

function CreateTaskModal({
  teamMembers,
  clients,
  bookings,
  onClose,
  onCreated,
}: {
  teamMembers: TeamMemberOption[];
  clients: ClientOption[];
  bookings: BookingOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Task title is required.'); return; }
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      assigned_to: assignedTo || null,
      client_id: clientId || null,
      booking_id: bookingId || null,
      priority,
      due_date: dueDate || null,
    };

    const { error: dbErr } = await supabase.from('operational_tasks').insert(payload);
    if (dbErr) {
      setError('Failed to create task. You may not have permission.');
      setSaving(false);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-base font-bold text-slate-800">New Operational Task</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Task Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Prepare IV drip supplies for morning appointments"
              autoFocus
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Description / Notes</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Operational notes and details\u2026"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Assign To</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name ?? m.email} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Related Client</label>
              <select
                value={clientId}
                onChange={e => { setClientId(e.target.value); setBookingId(''); }}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
              >
                <option value="">None</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Related Booking</label>
            <select
              value={bookingId}
              onChange={e => setBookingId(e.target.value)}
              disabled={!clientId}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{clientId ? 'None' : 'Select a client first'}</option>
              {bookings
                .filter(b => !clientId || b.full_name === clients.find(c => c.id === clientId)?.full_name)
                .map(b => (
                  <option key={b.id} value={b.id}>
                    {b.full_name} \u2014 {fmtDate(b.preferred_date)} ({b.services_requested.join(', ') || 'No services'})
                  </option>
                ))
              }
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DailyOperationsActivities({ canManage }: { canManage: boolean }) {
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [bookings, setBookings] = useState<BookingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tasksRes, membersRes, clientsRes, bookingsRes] = await Promise.all([
      supabase
        .from('operational_tasks')
        .select(`
          id, title, description, assigned_to, client_id, booking_id,
          status, priority, due_date, created_by, created_at, updated_at, completed_at,
          assignee:team_members!assigned_to(id, full_name, email, role),
          client:clients!client_id(id, full_name),
          booking:client_bookings!booking_id(id, full_name, preferred_date, services_requested)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('team_members').select('id, full_name, email, role').eq('status', 'approved').order('full_name'),
      supabase.from('clients').select('id, full_name').order('full_name'),
      supabase.from('client_bookings').select('id, full_name, preferred_date, services_requested').order('created_at', { ascending: false }),
    ]);

    if (tasksRes.error) { setError('Failed to load operational tasks.'); setLoading(false); return; }

    setTasks((tasksRes.data ?? []) as unknown as OperationalTask[]);
    setTeamMembers((membersRes.data ?? []) as unknown as TeamMemberOption[]);
    setClients((clientsRes.data ?? []) as unknown as ClientOption[]);
    setBookings((bookingsRes.data ?? []) as unknown as BookingOption[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function advanceStatus(task: OperationalTask) {
    const nextStatus = NEXT_STATUS[task.status as TaskStatus];
    setUpdatingId(task.id);
    const updates: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'completed') updates.completed_at = new Date().toISOString();
    if (nextStatus !== 'completed') updates.completed_at = null;

    const { error: dbErr } = await supabase.from('operational_tasks').update(updates).eq('id', task.id);
    setUpdatingId(null);
    if (dbErr) { setError('Failed to update task status.'); return; }
    load();
  }

  async function deleteTask(taskId: string) {
    setUpdatingId(taskId);
    const { error: dbErr } = await supabase.from('operational_tasks').delete().eq('id', taskId);
    setUpdatingId(null);
    if (dbErr) { setError('Failed to delete task.'); return; }
    load();
  }

  const filtered = tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      (t.assignee?.full_name ?? t.assignee?.email ?? '').toLowerCase().includes(q) ||
      (t.client?.full_name ?? '').toLowerCase().includes(q)
    );
  });

  const statusCounts: Record<string, number> = { pending: 0, in_progress: 0, completed: 0 };
  for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;

  const overdueCount = tasks.filter(t => isOverdue(t.due_date, t.status)).length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Tasks</p>
            <p className="text-2xl font-bold text-slate-800">{tasks.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Loader className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">In Progress</p>
            <p className="text-2xl font-bold text-slate-800">{statusCounts.in_progress ?? 0}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Completed</p>
            <p className="text-2xl font-bold text-slate-800">{statusCounts.completed ?? 0}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Overdue</p>
            <p className="text-2xl font-bold text-slate-800">{overdueCount}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by task, assignee, or client\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
          {(['all', 'pending', 'in_progress', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                statusFilter === f
                  ? f === 'pending' ? 'bg-slate-500 text-white'
                    : f === 'in_progress' ? 'bg-blue-500 text-white'
                    : f === 'completed' ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : STATUS_CFG[f as TaskStatus].label}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-slate-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-32" />
                </div>
                <div className="h-6 bg-slate-100 rounded-full w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search || statusFilter !== 'all' ? 'No matching tasks' : 'No operational tasks yet'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {search || statusFilter !== 'all' ? 'Try a different search or filter.' : canManage ? 'Click "New Task" to create the first operational task.' : 'Tasks will appear here once they are created.'}
          </p>
        </div>
      )}

      {/* Task list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(t => {
            const status = t.status as TaskStatus;
            const statusCfg = STATUS_CFG[status];
            const priorityCfg = PRIORITY_CFG[t.priority as TaskPriority] ?? PRIORITY_CFG.normal;
            const StatusIcon = statusCfg.icon;
            const overdue = isOverdue(t.due_date, t.status);
            const isUpdating = updatingId === t.id;

            return (
              <div key={t.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${overdue ? 'border-red-200' : 'border-slate-100'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-5 py-4">
                  {/* Status icon + title */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${status === 'completed' ? 'bg-emerald-50' : status === 'in_progress' ? 'bg-blue-50' : 'bg-slate-50'}`}>
                      <StatusIcon className={`w-4 h-4 ${statusCfg.iconCls} ${status === 'in_progress' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-bold text-slate-800 ${status === 'completed' ? 'line-through text-slate-400' : ''}`}>{t.title}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full border ${priorityCfg.cls}`}>
                          {priorityCfg.label}
                        </span>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full border bg-red-50 border-red-200 text-red-600">
                            <AlertTriangle className="w-3 h-3" /> Overdue
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 flex-wrap text-xs text-slate-400">
                        {t.assignee && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {t.assignee.full_name ?? t.assignee.email}
                          </span>
                        )}
                        {t.client && (
                          <span className="flex items-center gap-1">
                            <ClipboardList className="w-3 h-3" />
                            {t.client.full_name}
                          </span>
                        )}
                        {t.booking && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {fmtDate(t.booking.preferred_date)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Created {fmtDate(t.created_at)}
                        </span>
                        {t.due_date && (
                          <span className={`flex items-center gap-1 font-semibold ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                            <Calendar className="w-3 h-3" />
                            Due {fmtDate(t.due_date)}
                          </span>
                        )}
                        {t.completed_at && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed {fmtDateTime(t.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status badge + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                    {canManage && (
                      <>
                        <button
                          onClick={() => advanceStatus(t)}
                          disabled={isUpdating}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50"
                          title={`Mark as ${NEXT_STATUS[status] === 'completed' ? 'Completed' : STATUS_CFG[NEXT_STATUS[status]].label}`}
                        >
                          {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          {status === 'pending' ? 'Start' : status === 'in_progress' ? 'Complete' : 'Reopen'}
                        </button>
                        <button
                          onClick={() => deleteTask(t.id)}
                          disabled={isUpdating}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create task modal */}
      {showCreate && canManage && (
        <CreateTaskModal
          teamMembers={teamMembers}
          clients={clients}
          bookings={bookings}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
