import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bug, Plus, Search, Filter, Copy, RefreshCw, History, MessageSquarePlus,
  Trash2, X, Loader2, ChevronDown, AlertTriangle, CheckCircle2, Clock,
  User as UserIcon, FileText, ClipboardCheck, ExternalLink, Paperclip,
  Wrench, ShieldAlert, Send, Eye,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  type BugReport, type BugHistoryEntry, type BugSeverity, type BugStatus,
  type TeamMember, memberDisplayName, ROLES,
  BUG_SEVERITY_CFG, BUG_STATUS_CFG, BUG_SEVERITIES, BUG_STATUSES,
} from '../lib/supabase';

const ACTIVE_STATUSES: BugStatus[] = ['open', 'investigating', 'fix_in_progress', 'ready_for_testing', 'reopened'];
const MANAGEMENT_ROLES = new Set(['superadmin', 'head_clinical_ops']);

function isManagement(role: string | null | undefined): boolean {
  return !!role && MANAGEMENT_ROLES.has(role);
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Bolt Fix Prompt Generator ────────────────────────────────────────────────

function generateBoltPrompt(b: BugReport): string {
  return `We will fix only one exact issue.

Issue:
${b.issue_title}

Who is affected:
${b.affected_users || 'Not specified'}

What I see:
${b.observed_behavior}

Expected:
${b.expected_behavior}

Error message:
${b.error_message || 'No specific error message'}

Where it happens:
${b.location}

Scope:
Fix only this exact issue.

Verify before changing anything.

Tasks:
1. Locate the exact component, function, query, database object, or workflow responsible for the issue.
2. Identify the current data source.
3. Confirm the root cause before applying changes.
4. Apply the minimum fix required.
5. Preserve all behavior outside this exact issue.
6. Validate the fix using the current live schema and existing application behavior.
7. Run the build and report any errors.

Output format:
1. Exact file(s) involved
2. Current data source used
3. Root cause
4. Minimum fix applied
5. Validation steps
6. Build result
7. Then apply the implementation

Important:
- Fix only this exact issue.
- Do not broad-refactor.
- Do not guess database fields, tables, roles, or schema.
- Do not add new database calls unless required.
- Do not modify unrelated pages or workflows.
- Do not weaken RLS.
- Preserve authentication and role permissions.
- Use the current live schema only.`;
}

// ─── Severity / Status Badges ──────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: BugSeverity }) {
  const cfg = BUG_SEVERITY_CFG[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: BugStatus }) {
  const cfg = BUG_STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white';
const selectCls = inputCls + ' cursor-pointer';

// ─── History Modal ─────────────────────────────────────────────────────────────

function HistoryModal({ bug, onClose, canAdd }: { bug: BugReport; onClose: () => void; canAdd: boolean }) {
  const [history, setHistory] = useState<BugHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bug_history')
      .select('*')
      .eq('bug_id', bug.id)
      .order('created_at', { ascending: true });
    setHistory((data ?? []) as BugHistoryEntry[]);
    setLoading(false);
  }, [bug.id]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    if (!note.trim()) return;
    setAdding(true);
    await supabase.from('bug_history').insert({
      bug_id: bug.id,
      action_type: 'note_added',
      note: note.trim(),
    });
    setNote('');
    setAdding(false);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">Bug History — {bug.issue_title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No history entries yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map(h => (
                <div key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                    {h.id !== history[history.length - 1].id && <div className="w-0.5 flex-1 bg-slate-200" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-sm font-semibold text-slate-800 capitalize">{h.action_type.replace(/_/g, ' ')}</p>
                    {h.note && <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{h.note}</p>}
                    <p className="text-xs text-slate-400 mt-1">{fmtDateTime(h.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canAdd && (
          <div className="px-5 py-4 border-t border-slate-100">
            <Field label="Add History Note">
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Add an internal note to the timeline…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </Field>
            <div className="flex justify-end mt-2">
              <button
                onClick={addNote}
                disabled={!note.trim() || adding}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Add Note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bolt Prompt Modal ─────────────────────────────────────────────────────────

function PromptModal({ bug, onClose }: { bug: BugReport; onClose: () => void }) {
  const [text, setText] = useState(() => bug.latest_generated_prompt || generateBoltPrompt(bug));
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function regenerate() {
    const fresh = generateBoltPrompt(bug);
    setText(fresh);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  async function saveAndRecord() {
    setSaving(true);
    await supabase.from('bug_reports').update({ latest_generated_prompt: text }).eq('id', bug.id);
    await supabase.from('bug_history').insert({
      bug_id: bug.id,
      action_type: 'fix_prompt_generated',
      note: 'Bolt Fix Prompt generated and saved.',
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">Bolt Fix Prompt</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea
            className={inputCls + ' font-mono text-xs leading-relaxed'}
            rows={26}
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100">
          <button
            onClick={regenerate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Regenerate
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors"
            >
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Prompt'}
            </button>
            <button
              onClick={saveAndRecord}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save & Record
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bug Details / Management Modal ────────────────────────────────────────────

function BugDetailsModal({
  bug, onClose, canManage, members, onChanged,
}: {
  bug: BugReport;
  onClose: () => void;
  canManage: boolean;
  members: TeamMember[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [history, setHistory] = useState<BugHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // editable management fields
  const [severity, setSeverity] = useState<BugSeverity>(bug.severity);
  const [status, setStatus] = useState<BugStatus>(bug.status);
  const [assignedId, setAssignedId] = useState<string>(bug.assigned_user_id ?? '');
  const [rootCause, setRootCause] = useState(bug.root_cause ?? '');
  const [filesInvolved, setFilesInvolved] = useState(bug.files_involved ?? '');
  const [currentDataSource, setCurrentDataSource] = useState(bug.current_data_source ?? '');
  const [minimumFix, setMinimumFix] = useState(bug.minimum_fix ?? '');
  const [validationSteps, setValidationSteps] = useState(bug.validation_steps ?? '');

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('bug_history')
      .select('*')
      .eq('bug_id', bug.id)
      .order('created_at', { ascending: true });
    setHistory((data ?? []) as BugHistoryEntry[]);
    setLoadingHistory(false);
  }, [bug.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function addHistoryNote() {
    if (!note.trim()) return;
    setSaving(true);
    await supabase.from('bug_history').insert({
      bug_id: bug.id,
      action_type: 'note_added',
      note: note.trim(),
    });
    setNote('');
    setSaving(false);
    loadHistory();
  }

  async function saveManagement() {
    setSaving(true);
    const updates: Partial<BugReport> = {};
    if (severity !== bug.severity) updates.severity = severity;
    if (status !== bug.status) updates.status = status;
    if (assignedId !== (bug.assigned_user_id ?? '')) updates.assigned_user_id = assignedId || null;
    if (rootCause !== (bug.root_cause ?? '')) updates.root_cause = rootCause;
    if (filesInvolved !== (bug.files_involved ?? '')) updates.files_involved = filesInvolved;
    if (currentDataSource !== (bug.current_data_source ?? '')) updates.current_data_source = currentDataSource;
    if (minimumFix !== (bug.minimum_fix ?? '')) updates.minimum_fix = minimumFix;
    if (validationSteps !== (bug.validation_steps ?? '')) updates.validation_steps = validationSteps;

    if (status !== bug.status) {
      if (status === 'resolved') updates.resolved_at = new Date().toISOString();
      if (status === 'closed') updates.closed_at = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('bug_reports').update(updates).eq('id', bug.id);

      // record history events
      const events: { action_type: string; note: string }[] = [];
      if (updates.severity) events.push({ action_type: 'severity_changed', note: `${bug.severity} → ${updates.severity}` });
      if (updates.status) events.push({ action_type: 'status_changed', note: `${bug.status} → ${updates.status}` });
      if (updates.assigned_user_id !== undefined) {
        const assignee = members.find(m => m.user_id === updates.assigned_user_id);
        events.push({ action_type: 'assigned', note: assignee ? memberDisplayName(assignee) : 'Unassigned' });
      }
      if (updates.root_cause !== undefined) events.push({ action_type: 'root_cause_documented', note: rootCause });
      if (updates.minimum_fix !== undefined) events.push({ action_type: 'fix_applied', note: minimumFix });
      if (updates.validation_steps !== undefined) events.push({ action_type: 'validation_completed', note: validationSteps });
      if (updates.status === 'resolved') events.push({ action_type: 'bug_resolved', note: 'Bug marked as resolved.' });
      if (updates.status === 'closed') events.push({ action_type: 'bug_closed', note: 'Bug closed.' });
      if (updates.status === 'reopened') events.push({ action_type: 'bug_reopened', note: 'Bug reopened.' });

      if (events.length > 0) {
        await supabase.from('bug_history').insert(events.map(e => ({ bug_id: bug.id, ...e })));
      }

      // notifications
      const reporterMsg = `Bug "${bug.issue_title}" status changed to ${BUG_STATUS_CFG[status].label}.`;
      await supabase.from('nurse_notifications').insert({
        recipient_user_id: bug.reporter_user_id,
        event_type: 'bugtrack',
        client_name: reporterMsg,
      }).then(() => {});

      if (updates.assigned_user_id && updates.assigned_user_id !== bug.assigned_user_id) {
        await supabase.from('nurse_notifications').insert({
          recipient_user_id: updates.assigned_user_id,
          event_type: 'bugtrack',
          client_name: `Bug "${bug.issue_title}" has been assigned to you.`,
        });
      }
    }

    setSaving(false);
    onChanged();
    onClose();
  }

  async function deleteBug() {
    if (!confirm('Delete this bug report? This cannot be undone.')) return;
    setSaving(true);
    await supabase.from('bug_reports').delete().eq('id', bug.id);
    setSaving(false);
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <Bug className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <h3 className="text-base font-bold text-slate-800 truncate">{bug.issue_title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-slate-100">
          {(['details', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors capitalize ${tab === t ? 'border-teal-500 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {t === 'details' ? 'Details & Manage' : 'History'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'details' ? (
            <div className="space-y-4">
              {/* read-only report fields */}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Severity</p><SeverityBadge severity={bug.severity} /></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Status</p><StatusBadge status={bug.status} /></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Who is affected</p><p className="text-sm text-slate-700">{bug.affected_users || '—'}</p></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Where it happens</p><p className="text-sm text-slate-700">{bug.location}</p></div>
              </div>

              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">What I see</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.observed_behavior}</p></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Expected behavior</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.expected_behavior}</p></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Error message</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.error_message || 'No specific error message'}</p></div>

              {bug.attachment_url && (
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Attachment</p><a href={bug.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline"><ExternalLink className="w-3.5 h-3.5" />View attachment</a></div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Reported by</p><p className="text-sm text-slate-700">{members.find(m => m.user_id === bug.reporter_user_id) ? memberDisplayName(members.find(m => m.user_id === bug.reporter_user_id)!) : 'Reporter'}</p></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Date reported</p><p className="text-sm text-slate-700">{fmtDateTime(bug.created_at)}</p></div>
              </div>

              {/* management section */}
              {canManage ? (
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Bug Management</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Severity">
                      <select className={selectCls} value={severity} onChange={e => setSeverity(e.target.value as BugSeverity)}>
                        {BUG_SEVERITIES.map(s => <option key={s} value={s}>{BUG_SEVERITY_CFG[s].label}</option>)}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as BugStatus)}>
                        {BUG_STATUSES.map(s => <option key={s} value={s}>{BUG_STATUS_CFG[s].label}</option>)}
                      </select>
                    </Field>
                    <Field label="Assigned to">
                      <select className={selectCls} value={assignedId} onChange={e => setAssignedId(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Root cause">
                    <textarea className={inputCls} rows={2} value={rootCause} onChange={e => setRootCause(e.target.value)} placeholder="Documented root cause…" />
                  </Field>
                  <Field label="Files involved">
                    <textarea className={inputCls} rows={2} value={filesInvolved} onChange={e => setFilesInvolved(e.target.value)} placeholder="Files / components involved…" />
                  </Field>
                  <Field label="Current data source">
                    <input className={inputCls} value={currentDataSource} onChange={e => setCurrentDataSource(e.target.value)} placeholder="Table, query, or API the bug touches…" />
                  </Field>
                  <Field label="Minimum fix applied">
                    <textarea className={inputCls} rows={2} value={minimumFix} onChange={e => setMinimumFix(e.target.value)} placeholder="Describe the minimum fix…" />
                  </Field>
                  <Field label="Validation steps">
                    <textarea className={inputCls} rows={2} value={validationSteps} onChange={e => setValidationSteps(e.target.value)} placeholder="Steps to validate the fix…" />
                  </Field>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={deleteBug}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Bug
                    </button>
                    <button
                      onClick={saveManagement}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  {bug.root_cause && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Root cause</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.root_cause}</p></div>}
                  {bug.files_involved && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Files involved</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.files_involved}</p></div>}
                  {bug.current_data_source && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Current data source</p><p className="text-sm text-slate-700">{bug.current_data_source}</p></div>}
                  {bug.minimum_fix && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Minimum fix</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.minimum_fix}</p></div>}
                  {bug.validation_steps && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Validation steps</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{bug.validation_steps}</p></div>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
              ) : history.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No history entries yet.</p>
              ) : (
                history.map(h => (
                  <div key={h.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                      {h.id !== history[history.length - 1].id && <div className="w-0.5 flex-1 bg-slate-200" />}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-sm font-semibold text-slate-800 capitalize">{h.action_type.replace(/_/g, ' ')}</p>
                      {h.note && <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{h.note}</p>}
                      <p className="text-xs text-slate-400 mt-1">{fmtDateTime(h.created_at)}</p>
                    </div>
                  </div>
                ))
              )}

              <div className="pt-3 border-t border-slate-100">
                <Field label="Add History Note">
                  <textarea className={inputCls} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note to the timeline…" />
                </Field>
                <div className="flex justify-end mt-2">
                  <button onClick={addHistoryNote} disabled={!note.trim() || saving} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Add Note
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main BugTrack Page ────────────────────────────────────────────────────────

export default function BugTrack({ userEmail, memberRole }: { userEmail: string; memberRole: string | null }) {
  const canManage = isManagement(memberRole);

  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // form state
  const [issueTitle, setIssueTitle] = useState('');
  const [affectedUsers, setAffectedUsers] = useState('');
  const [observedBehavior, setObservedBehavior] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [location, setLocation] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('medium');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'active' | 'all' | BugStatus>('active');
  const [filterSeverity, setFilterSeverity] = useState<'all' | BugSeverity>('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  const [filterReporter, setFilterReporter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'severity' | 'status'>('newest');

  // modals
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null);
  const [promptBug, setPromptBug] = useState<BugReport | null>(null);
  const [historyBug, setHistoryBug] = useState<BugReport | null>(null);

  const loadBugs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });
    setBugs((data ?? []) as BugReport[]);
    setLoading(false);
  }, []);

  const loadMembers = useCallback(async () => {
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('status', 'approved')
      .order('full_name', { ascending: true, nullsFirst: false })
      .order('email', { ascending: true });
    setMembers((data ?? []) as TeamMember[]);
  }, []);

  useEffect(() => { loadBugs(); loadMembers(); }, [loadBugs, loadMembers]);

  const reporterName = useMemo(() => {
    const me = members.find(m => m.email === userEmail);
    return me ? memberDisplayName(me) : userEmail;
  }, [members, userEmail]);

  // filtered + sorted bugs
  const visibleBugs = useMemo(() => {
    let list = [...bugs];

    if (filterStatus === 'active') {
      list = list.filter(b => ACTIVE_STATUSES.includes(b.status));
    } else if (filterStatus !== 'all') {
      list = list.filter(b => b.status === filterStatus);
    }

    if (filterSeverity !== 'all') list = list.filter(b => b.severity === filterSeverity);
    if (filterAssigned !== 'all') {
      list = list.filter(b => filterAssigned === 'unassigned' ? !b.assigned_user_id : b.assigned_user_id === filterAssigned);
    }
    if (filterReporter !== 'all') list = list.filter(b => b.reporter_user_id === filterReporter);

    if (dateFrom) list = list.filter(b => new Date(b.created_at) >= new Date(dateFrom));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      list = list.filter(b => new Date(b.created_at) <= end);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.issue_title.toLowerCase().includes(q) ||
        (b.affected_users ?? '').toLowerCase().includes(q) ||
        (b.observed_behavior ?? '').toLowerCase().includes(q) ||
        (b.location ?? '').toLowerCase().includes(q) ||
        (b.error_message ?? '').toLowerCase().includes(q)
      );
    }

    const sevRank: Record<BugSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusRank: Record<BugStatus, number> = { open: 0, investigating: 1, fix_in_progress: 2, ready_for_testing: 3, reopened: 4, resolved: 5, closed: 6 };

    list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'severity') return sevRank[a.severity] - sevRank[b.severity];
      if (sortBy === 'status') return statusRank[a.status] - statusRank[b.status];
      return 0;
    });

    return list;
  }, [bugs, filterStatus, filterSeverity, filterAssigned, filterReporter, dateFrom, dateTo, search, sortBy]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!issueTitle.trim()) errs.issueTitle = 'Required';
    if (!observedBehavior.trim()) errs.observedBehavior = 'Required';
    if (!expectedBehavior.trim()) errs.expectedBehavior = 'Required';
    if (!location.trim()) errs.location = 'Required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submitBug() {
    if (!validate()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('bug_reports').insert({
      issue_title: issueTitle.trim(),
      affected_users: affectedUsers.trim() || null,
      observed_behavior: observedBehavior.trim(),
      expected_behavior: expectedBehavior.trim(),
      error_message: errorMessage.trim() || null,
      location: location.trim(),
      severity,
      attachment_url: attachmentUrl.trim() || null,
    }).select().maybeSingle();

    if (!error && data) {
      await supabase.from('bug_history').insert({
        bug_id: (data as BugReport).id,
        action_type: 'bug_submitted',
        note: 'Bug report submitted.',
      });

      // notify management team for critical bugs
      if (severity === 'critical') {
        const managers = members.filter(m => MANAGEMENT_ROLES.has(m.role));
        if (managers.length > 0) {
          await supabase.from('nurse_notifications').insert(
            managers.map(m => ({
              recipient_user_id: m.user_id,
              event_type: 'bugtrack',
              client_name: `Critical bug reported: "${issueTitle.trim()}"`,
            }))
          );
        }
      }
    }

    setSubmitting(false);

    if (error) {
      setSuccessMsg('');
      return;
    }

    // reset form
    setIssueTitle(''); setAffectedUsers(''); setObservedBehavior('');
    setExpectedBehavior(''); setErrorMessage(''); setLocation('');
    setSeverity('medium'); setAttachmentUrl(''); setFormErrors({});
    setSuccessMsg('Bug report submitted and added to the Fix Queue.');
    setTimeout(() => setSuccessMsg(''), 4000);
    loadBugs();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Bug className="w-5 h-5 text-teal-600" /> BugTrack</h2>
          <p className="text-sm text-slate-500 mt-0.5">Report software bugs, manage fixes, and generate Bolt fix prompts.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Signed in as</p>
          <p className="text-sm font-semibold text-slate-700">{reporterName}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', count: bugs.filter(b => ACTIVE_STATUSES.includes(b.status)).length, icon: Clock, color: 'text-blue-600' },
          { label: 'Critical', count: bugs.filter(b => b.severity === 'critical' && ACTIVE_STATUSES.includes(b.status)).length, icon: ShieldAlert, color: 'text-red-600' },
          { label: 'Resolved', count: bugs.filter(b => b.status === 'resolved').length, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Total', count: bugs.length, icon: Bug, color: 'text-slate-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-1">{s.count}</p>
          </div>
        ))}
      </div>

      {/* Bug Report Form */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><Plus className="w-4 h-4 text-teal-600" /> Report a Bug</h3>
        </div>
        <div className="p-5 space-y-4">
          {successMsg && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> {successMsg}
            </div>
          )}

          <Field label="Issue title" required>
            <input className={inputCls} value={issueTitle} onChange={e => setIssueTitle(e.target.value)} placeholder="Short summary of the bug" />
            {formErrors.issueTitle && <p className="text-xs text-red-500 mt-1">{formErrors.issueTitle}</p>}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Who is affected">
              <input className={inputCls} value={affectedUsers} onChange={e => setAffectedUsers(e.target.value)} placeholder="e.g. All nurses, Admins only" />
            </Field>
            <Field label="Severity" required>
              <select className={selectCls} value={severity} onChange={e => setSeverity(e.target.value as BugSeverity)}>
                {BUG_SEVERITIES.map(s => <option key={s} value={s}>{BUG_SEVERITY_CFG[s].label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="What I see" required>
            <textarea className={inputCls} rows={3} value={observedBehavior} onChange={e => setObservedBehavior(e.target.value)} placeholder="Describe the current / incorrect behavior" />
            {formErrors.observedBehavior && <p className="text-xs text-red-500 mt-1">{formErrors.observedBehavior}</p>}
          </Field>

          <Field label="Expected behavior" required>
            <textarea className={inputCls} rows={3} value={expectedBehavior} onChange={e => setExpectedBehavior(e.target.value)} placeholder="Describe what should happen" />
            {formErrors.expectedBehavior && <p className="text-xs text-red-500 mt-1">{formErrors.expectedBehavior}</p>}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Error message">
              <input className={inputCls} value={errorMessage} onChange={e => setErrorMessage(e.target.value)} placeholder="Exact error text, if any" />
            </Field>
            <Field label="Where it happens" required>
              <input className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Page, module, or workflow" />
              {formErrors.location && <p className="text-xs text-red-500 mt-1">{formErrors.location}</p>}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Attachment / screenshot URL">
              <input className={inputCls} value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} placeholder="Link to screenshot (optional)" />
            </Field>
            <Field label="Reported by">
              <input className={inputCls + ' bg-slate-50'} value={reporterName} disabled />
            </Field>
          </div>

          <div className="flex justify-end">
            <button
              onClick={submitBug}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Submit Bug Report
            </button>
          </div>
        </div>
      </section>

      {/* Fix Queue */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><Filter className="w-4 h-4 text-teal-600" /> Fix Queue</h3>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input className={inputCls + ' pl-9'} placeholder="Search bugs…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className={selectCls + ' sm:w-40'} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="severity">Severity</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <select className={selectCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'active' | 'all' | BugStatus)}>
              <option value="active">Active only</option>
              <option value="all">Show all</option>
              {BUG_STATUSES.map(s => <option key={s} value={s}>{BUG_STATUS_CFG[s].label}</option>)}
            </select>
            <select className={selectCls} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value as 'all' | BugSeverity)}>
              <option value="all">All severities</option>
              {BUG_SEVERITIES.map(s => <option key={s} value={s}>{BUG_SEVERITY_CFG[s].label}</option>)}
            </select>
            <select className={selectCls} value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
              <option value="all">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</option>)}
            </select>
            <select className={selectCls} value={filterReporter} onChange={e => setFilterReporter(e.target.value)}>
              <option value="all">All reporters</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</option>)}
            </select>
            <input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className={inputCls} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
          </div>
        </div>

        {/* Bug list */}
        <div className="divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
          ) : visibleBugs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bug className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-400">No bugs match the current filters.</p>
            </div>
          ) : (
            visibleBugs.map(b => {
              const assignee = members.find(m => m.user_id === b.assigned_user_id);
              return (
                <div key={b.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <button onClick={() => setSelectedBug(b)} className="text-sm font-bold text-slate-800 hover:text-teal-600 transition-colors text-left">
                          {b.issue_title}
                        </button>
                        <SeverityBadge severity={b.severity} />
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
                        <p><span className="font-semibold text-slate-400">Reported by:</span> {members.find(m => m.user_id === b.reporter_user_id) ? memberDisplayName(members.find(m => m.user_id === b.reporter_user_id)!) : 'Reporter'}</p>
                        <p><span className="font-semibold text-slate-400">Date:</span> {fmtDateTime(b.created_at)}</p>
                        <p><span className="font-semibold text-slate-400">Where:</span> {b.location}</p>
                        <p><span className="font-semibold text-slate-400">Assigned:</span> {assignee ? memberDisplayName(assignee) : 'Unassigned'}</p>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <p><span className="font-semibold text-slate-400">What I see:</span> <span className="line-clamp-2">{b.observed_behavior}</span></p>
                        <p><span className="font-semibold text-slate-400">Expected:</span> <span className="line-clamp-2">{b.expected_behavior}</span></p>
                        {b.error_message && <p><span className="font-semibold text-slate-400">Error:</span> <span className="line-clamp-2">{b.error_message}</span></p>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button onClick={() => setSelectedBug(b)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      <Eye className="w-3.5 h-3.5" /> View / Manage
                    </button>
                    <button onClick={() => setPromptBug(b)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                      <Wrench className="w-3.5 h-3.5" /> Bolt Prompt
                    </button>
                    <button onClick={() => setHistoryBug(b)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      <History className="w-5 h-5" /> History
                    </button>
                    <button onClick={() => { setHistoryBug(b); }} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      <MessageSquarePlus className="w-3.5 h-3.5" /> Add Note
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Modals */}
      {selectedBug && (
        <BugDetailsModal
          bug={selectedBug}
          canManage={canManage}
          members={members}
          onClose={() => setSelectedBug(null)}
          onChanged={loadBugs}
        />
      )}
      {promptBug && (
        <PromptModal bug={promptBug} onClose={() => { setPromptBug(null); loadBugs(); }} />
      )}
      {historyBug && (
        <HistoryModal bug={historyBug} canAdd onClose={() => setHistoryBug(null)} />
      )}
    </div>
  );
}
