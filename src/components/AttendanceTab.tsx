import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  Clock,
  Users,
  CheckCircle,
  Lock,
  Trash2,
  Timer,
  LogIn,
  LogOut,
} from 'lucide-react';
import { supabase, type Branch, type TimeLog } from '../lib/supabase';

// ─── Extended types ───────────────────────────────────────────────────────────

interface TimeLogRow extends TimeLog {
  branches: { name: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function hoursWorked(clockIn: string, clockOut: string | null): string {
  if (!clockOut) return '—';
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
  return diff.toFixed(2) + 'h';
}

function hoursWorkedNum(clockIn: string, clockOut: string | null): number {
  if (!clockOut) return 0;
  return (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ─── Add Time Log Modal ───────────────────────────────────────────────────────

function AddTimeLogModal({
  branches,
  onClose,
  onSaved,
}: {
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [staffName, setStaffName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [clockIn, setClockIn] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [clockOut, setClockOut] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!staffName.trim()) { setErr('Staff name is required.'); return; }
    if (!clockIn) { setErr('Clock-in time is required.'); return; }
    setSaving(true);
    setErr('');
    const { error } = await supabase.from('time_logs').insert({
      staff_name: staffName.trim(),
      branch_id: branchId || null,
      clock_in: new Date(clockIn).toISOString(),
      clock_out: clockOut ? new Date(clockOut).toISOString() : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Add Time Log</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Staff Name *</label>
            <input
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. Maria Santos"
              value={staffName}
              onChange={e => setStaffName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Branch</label>
            <select
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
            >
              <option value="">— All Branches —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Clock In *</label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={clockIn}
                onChange={e => setClockIn(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Clock Out</label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={clockOut}
                onChange={e => setClockOut(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes</label>
            <textarea
              rows={2}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              placeholder="Optional notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Save Log
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clock Out Modal ──────────────────────────────────────────────────────────

function ClockOutModal({
  log,
  onClose,
  onSaved,
}: {
  log: TimeLogRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clockOut, setClockOut] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('time_logs')
      .update({ clock_out: new Date(clockOut).toISOString() })
      .eq('id', log.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Clock Out — {log.staff_name}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Clock Out Time</label>
            <input
              type="datetime-local"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={clockOut}
              onChange={e => setClockOut(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">Clocked in at {fmtTime(log.clock_in)}</p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Confirm Clock Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AttendanceTabProps {
  canManage: boolean;
}

export default function AttendanceTab({ canManage }: AttendanceTabProps) {
  const [logs, setLogs] = useState<TimeLogRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [clockOutTarget, setClockOutTarget] = useState<TimeLogRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [branchRes, logsRes] = await Promise.all([
      supabase.from('branches').select('id, name, is_active, created_at').eq('is_active', true).order('name'),
      supabase
        .from('time_logs')
        .select('*, branches(name)')
        .gte('clock_in', selectedDate + 'T00:00:00')
        .lt('clock_in', selectedDate + 'T23:59:59.999')
        .order('clock_in', { ascending: false }),
    ]);
    if (branchRes.error) { setErr(branchRes.error.message); setLoading(false); return; }
    if (logsRes.error) { setErr(logsRes.error.message); setLoading(false); return; }
    setBranches(branchRes.data ?? []);
    setLogs((logsRes.data ?? []) as TimeLogRow[]);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from('time_logs').delete().eq('id', deleteId);
    setDeleting(false);
    setDeleteId(null);
    load();
  }

  const filtered = branchFilter === 'all'
    ? logs
    : logs.filter(l => l.branch_id === branchFilter);

  const activeLogs = filtered.filter(l => !l.clock_out);
  const completedLogs = filtered.filter(l => !!l.clock_out);
  const totalHours = filtered.reduce((s, l) => s + hoursWorkedNum(l.clock_in, l.clock_out), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Staff Attendance</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track daily clock-in and clock-out for all staff.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Log
          </button>
        </div>
      </div>

      {/* Non-superadmin notice */}
      {!canManage && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Lock className="w-4 h-4 flex-shrink-0" />
          Delete actions are restricted to superadmins.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${branchFilter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All Branches
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => setBranchFilter(b.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${branchFilter === b.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
        />
      </div>

      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={LogIn} label="Clocked In (Active)" value={activeLogs.length} color="text-emerald-600" bg="bg-emerald-50" />
        <SummaryCard icon={Users} label="Total Logs" value={filtered.length} color="text-teal-600" bg="bg-teal-50" />
        <SummaryCard icon={Timer} label="Total Hours Logged" value={totalHours.toFixed(2) + 'h'} color="text-blue-600" bg="bg-blue-50" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Clock className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No time logs for {fmtDate(selectedDate)}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_110px_110px_90px_140px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span>Staff</span>
            <span>Branch</span>
            <span>Clock In</span>
            <span>Clock Out</span>
            <span>Hours</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(log => (
              <div key={log.id} className="grid grid-cols-[1fr_120px_110px_110px_90px_140px] items-center px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-teal-700">
                      {(log.staff_name ?? '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{log.staff_name ?? '—'}</p>
                    {log.notes && <p className="text-xs text-slate-400 truncate max-w-[160px]">{log.notes}</p>}
                  </div>
                </div>
                <span className="text-sm text-slate-600">{log.branches?.name ?? '—'}</span>
                <span className="text-sm text-slate-700">{fmtTime(log.clock_in)}</span>
                <span className="text-sm text-slate-700">
                  {log.clock_out ? fmtTime(log.clock_out) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Active
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold text-slate-700">{hoursWorked(log.clock_in, log.clock_out)}</span>
                <div className="flex items-center justify-end gap-2">
                  {!log.clock_out && (
                    <button
                      onClick={() => setClockOutTarget(log)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      <LogOut className="w-3 h-3" />
                      Clock Out
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setDeleteId(log.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddTimeLogModal
          branches={branches}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {clockOutTarget && (
        <ClockOutModal
          log={clockOutTarget}
          onClose={() => setClockOutTarget(null)}
          onSaved={() => { setClockOutTarget(null); load(); }}
        />
      )}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Delete Time Log?</h3>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
