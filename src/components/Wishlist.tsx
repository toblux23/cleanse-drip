import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Lightbulb, Plus, Search, Filter, Copy, RefreshCw, History, MessageSquarePlus,
  Trash2, X, Loader2, ChevronDown, AlertTriangle, CheckCircle2, Clock,
  User as UserIcon, FileText, ClipboardCheck, ExternalLink, Paperclip,
  Wrench, ShieldAlert, Send, Eye, ThumbsUp, ThumbsDown, Sparkles, Calendar,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  type WishlistRequest, type WishlistVote, type WishlistHistoryEntry,
  type WishlistCategory, type WishlistUrgency, type WishlistBusinessImpact,
  type WishlistStatus, type WishlistEffort, type TeamMember, memberDisplayName,
  WISHLIST_CATEGORIES, WISHLIST_URGENCIES, WISHLIST_URGENCY_CFG,
  WISHLIST_IMPACTS, WISHLIST_IMPACT_CFG, WISHLIST_STATUSES, WISHLIST_STATUS_CFG,
  WISHLIST_EFFORTS, WISHLIST_ACTIVE_STATUSES,
} from '../lib/supabase';

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

// ─── Bolt Implementation Prompt Generator ────────────────────────────────────

function generateBoltPrompt(w: WishlistRequest): string {
  const assessment = w.management_assessment
    ? [
      w.strategic_alignment ? `Strategic alignment: ${w.strategic_alignment}` : null,
      w.technical_feasibility ? `Technical feasibility: ${w.technical_feasibility}` : null,
      w.estimated_effort ? `Estimated effort: ${w.estimated_effort}` : null,
      w.dependencies ? `Dependencies: ${w.dependencies}` : null,
      w.risks ? `Risks: ${w.risks}` : null,
    ].filter(Boolean).join('\n')
    : null;

  return `Build only one exact requested improvement.

Request:
${w.title}

Problem or opportunity:
${w.problem_or_opportunity}

Requested improvement:
${w.description}

Who will benefit:
${w.beneficiaries || 'Not specified'}

Expected benefit:
${w.expected_benefit}

Where it is needed:
${w.location}

Suggested solution:
${w.suggested_solution || 'No solution specified'}

Business impact:
${w.business_impact}

Urgency:
${w.urgency}

Management assessment:
${assessment || 'Not yet assessed'}

Important:
Verify the current implementation before changing anything.

Tasks:
1. Locate the exact component, workflow, data source, and database objects involved.
2. Confirm how the requested area currently works.
3. Identify the minimum implementation required.
4. Use the current live schema and existing application architecture.
5. Preserve all unrelated behavior.
6. Reuse existing components, services, utilities, and design patterns where possible.
7. Apply only the approved wishlist scope.
8. Validate permissions and RLS.
9. Run the build and report errors.

Output before implementation:
1. Exact file(s) involved
2. Current data source used
3. Current behavior
4. Proposed minimum implementation
5. Database impact
6. Security and permission impact
7. Validation steps

Then apply the implementation.

Important:
- Implement only this wishlist request.
- Do not broad-refactor.
- Do not guess fields, tables, roles, or schema.
- Do not create duplicate functionality.
- Do not modify unrelated pages.
- Do not weaken RLS.
- Do not add new database calls unless required.
- Preserve current authentication and permission behavior.
- Use the current live schema only.
- Build must pass.`;
}

// ─── Badges ────────────────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: WishlistUrgency }) {
  const cfg = WISHLIST_URGENCY_CFG[urgency];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: WishlistBusinessImpact }) {
  const cfg = WISHLIST_IMPACT_CFG[impact];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: WishlistStatus }) {
  const cfg = WISHLIST_STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: WishlistCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold text-slate-600 bg-slate-50 border-slate-200">
      <Sparkles className="w-3 h-3" />
      {category}
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

function HistoryModal({ request, onClose, canAdd }: { request: WishlistRequest; onClose: () => void; canAdd: boolean }) {
  const [history, setHistory] = useState<WishlistHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('wishlist_history')
      .select('*')
      .eq('wishlist_id', request.id)
      .order('created_at', { ascending: true });
    setHistory((data ?? []) as WishlistHistoryEntry[]);
    setLoading(false);
  }, [request.id]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    if (!note.trim()) return;
    setAdding(true);
    await supabase.from('wishlist_history').insert({
      wishlist_id: request.id,
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
            <h3 className="text-base font-bold text-slate-800">History — {request.title}</h3>
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
            <Field label="Add Note">
              <textarea
                className={inputCls}
                rows={2}
                placeholder="Add a note to the timeline…"
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

function PromptModal({ request, onClose }: { request: WishlistRequest; onClose: () => void }) {
  const [text, setText] = useState(() => request.latest_generated_prompt || generateBoltPrompt(request));
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function regenerate() {
    setText(generateBoltPrompt(request));
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
    await supabase.from('wishlist_requests').update({ latest_generated_prompt: text }).eq('id', request.id);
    await supabase.from('wishlist_history').insert({
      wishlist_id: request.id,
      action_type: 'bolt_prompt_generated',
      note: 'Bolt Implementation Prompt generated and saved.',
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
            <h3 className="text-base font-bold text-slate-800">Bolt Implementation Prompt</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <textarea
            className={inputCls + ' font-mono text-xs leading-relaxed'}
            rows={30}
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

// ─── Request Details / Management Modal ────────────────────────────────────────

function RequestDetailsModal({
  request, onClose, canManage, members, currentUserId, onChanged,
}: {
  request: WishlistRequest;
  onClose: () => void;
  canManage: boolean;
  members: TeamMember[];
  currentUserId: string | null;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const [history, setHistory] = useState<WishlistHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // editable management fields
  const [status, setStatus] = useState<WishlistStatus>(request.status);
  const [assignedOwner, setAssignedOwner] = useState<string>(request.assigned_owner ?? '');
  const [category, setCategory] = useState<WishlistCategory>(request.category);
  const [urgency, setUrgency] = useState<WishlistUrgency>(request.urgency);
  const [businessImpact, setBusinessImpact] = useState<WishlistBusinessImpact>(request.business_impact);
  const [estimatedEffort, setEstimatedEffort] = useState<WishlistEffort>(request.estimated_effort);
  const [managementAssessment, setManagementAssessment] = useState(request.management_assessment ?? '');
  const [strategicAlignment, setStrategicAlignment] = useState(request.strategic_alignment ?? '');
  const [technicalFeasibility, setTechnicalFeasibility] = useState(request.technical_feasibility ?? '');
  const [dependencies, setDependencies] = useState(request.dependencies ?? '');
  const [risks, setRisks] = useState(request.risks ?? '');
  const [decisionReason, setDecisionReason] = useState(request.decision_reason ?? '');
  const [implementationNotes, setImplementationNotes] = useState(request.implementation_notes ?? '');
  const [relatedModule, setRelatedModule] = useState(request.related_module ?? '');
  const [targetDate, setTargetDate] = useState(request.target_date ?? '');

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('wishlist_history')
      .select('*')
      .eq('wishlist_id', request.id)
      .order('created_at', { ascending: true });
    setHistory((data ?? []) as WishlistHistoryEntry[]);
    setLoadingHistory(false);
  }, [request.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function addHistoryNote() {
    if (!note.trim()) return;
    setSaving(true);
    await supabase.from('wishlist_history').insert({
      wishlist_id: request.id,
      action_type: 'note_added',
      note: note.trim(),
    });
    setNote('');
    setSaving(false);
    loadHistory();
  }

  async function saveManagement() {
    setSaving(true);
    const updates: Partial<WishlistRequest> = {};
    if (status !== request.status) updates.status = status;
    if (assignedOwner !== (request.assigned_owner ?? '')) updates.assigned_owner = assignedOwner || null;
    if (category !== request.category) updates.category = category;
    if (urgency !== request.urgency) updates.urgency = urgency;
    if (businessImpact !== request.business_impact) updates.business_impact = businessImpact;
    if (estimatedEffort !== request.estimated_effort) updates.estimated_effort = estimatedEffort;
    if (managementAssessment !== (request.management_assessment ?? '')) updates.management_assessment = managementAssessment;
    if (strategicAlignment !== (request.strategic_alignment ?? '')) updates.strategic_alignment = strategicAlignment;
    if (technicalFeasibility !== (request.technical_feasibility ?? '')) updates.technical_feasibility = technicalFeasibility;
    if (dependencies !== (request.dependencies ?? '')) updates.dependencies = dependencies;
    if (risks !== (request.risks ?? '')) updates.risks = risks;
    if (decisionReason !== (request.decision_reason ?? '')) updates.decision_reason = decisionReason;
    if (implementationNotes !== (request.implementation_notes ?? '')) updates.implementation_notes = implementationNotes;
    if (relatedModule !== (request.related_module ?? '')) updates.related_module = relatedModule;
    if (targetDate !== (request.target_date ?? '')) updates.target_date = targetDate || null;

    if (status !== request.status) {
      if (status === 'Completed') updates.completed_at = new Date().toISOString();
      if (status === 'Archived') updates.archived_at = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('wishlist_requests').update(updates).eq('id', request.id);

      // record history events
      const events: { action_type: string; note: string }[] = [];
      if (updates.status) {
        events.push({ action_type: 'status_changed', note: `${request.status} → ${updates.status}` });
        if (updates.status === 'Approved') events.push({ action_type: 'request_approved', note: decisionReason || 'Request approved.' });
        if (updates.status === 'Deferred') events.push({ action_type: 'request_deferred', note: decisionReason || 'Request deferred.' });
        if (updates.status === 'Rejected') events.push({ action_type: 'request_rejected', note: decisionReason || 'Request rejected.' });
        if (updates.status === 'Needs Clarification') events.push({ action_type: 'clarification_requested', note: decisionReason || 'Clarification requested.' });
        if (updates.status === 'Planned') events.push({ action_type: 'request_planned', note: decisionReason || 'Request moved to planning.' });
        if (updates.status === 'In Development') events.push({ action_type: 'development_started', note: 'Development started.' });
        if (updates.status === 'Ready for Testing') events.push({ action_type: 'ready_for_testing', note: 'Request ready for testing.' });
        if (updates.status === 'Completed') events.push({ action_type: 'completed', note: 'Request completed.' });
        if (updates.status === 'Archived') events.push({ action_type: 'archived', note: 'Request archived.' });
      }
      if (updates.assigned_owner !== undefined) {
        const owner = members.find(m => m.user_id === updates.assigned_owner);
        events.push({ action_type: 'owner_assigned', note: owner ? memberDisplayName(owner) : 'Unassigned' });
      }
      if (updates.category) events.push({ action_type: 'category_changed', note: `${request.category} → ${updates.category}` });
      if (updates.urgency) events.push({ action_type: 'urgency_changed', note: `${request.urgency} → ${updates.urgency}` });
      if (updates.business_impact) events.push({ action_type: 'business_impact_changed', note: `${request.business_impact} → ${updates.business_impact}` });
      if (updates.management_assessment !== undefined) events.push({ action_type: 'management_note_added', note: managementAssessment });

      if (events.length > 0) {
        await supabase.from('wishlist_history').insert(events.map(e => ({ wishlist_id: request.id, ...e })));
      }

      // notifications
      const statusMsg = `Wishlist request "${request.title}" status changed to ${WISHLIST_STATUS_CFG[status].label}.`;
      await supabase.from('nurse_notifications').insert({
        recipient_user_id: request.submitted_by,
        event_type: 'wishlist',
        client_name: statusMsg,
      });

      if (updates.assigned_owner && updates.assigned_owner !== request.assigned_owner) {
        await supabase.from('nurse_notifications').insert({
          recipient_user_id: updates.assigned_owner,
          event_type: 'wishlist',
          client_name: `Wishlist request "${request.title}" has been assigned to you.`,
        });
      }

      // notify voters when completed
      if (updates.status === 'Completed') {
        const { data: voters } = await supabase
          .from('wishlist_votes')
          .select('user_id')
          .eq('wishlist_id', request.id)
          .neq('user_id', request.submitted_by);
        if (voters && voters.length > 0) {
          const uniqueVoters = Array.from(new Set(voters.map(v => (v as WishlistVote).user_id)));
          await supabase.from('nurse_notifications').insert(
            uniqueVoters.map(uid => ({
              recipient_user_id: uid,
              event_type: 'wishlist',
              client_name: `A wishlist request you voted for, "${request.title}", has been completed.`,
            }))
          );
        }
      }
    }

    setSaving(false);
    onChanged();
    onClose();
  }

  async function deleteRequest() {
    if (!confirm('Delete this wishlist request? This cannot be undone.')) return;
    setSaving(true);
    await supabase.from('wishlist_requests').delete().eq('id', request.id);
    setSaving(false);
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <Lightbulb className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <h3 className="text-base font-bold text-slate-800 truncate">{request.title}</h3>
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
              {/* read-only request fields */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Category</p><CategoryBadge category={request.category} /></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Urgency</p><UrgencyBadge urgency={request.urgency} /></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Status</p><StatusBadge status={request.status} /></div>
              </div>

              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Business Impact</p><ImpactBadge impact={request.business_impact} /></div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Who will benefit</p><p className="text-sm text-slate-700">{request.beneficiaries || '—'}</p></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Where it is needed</p><p className="text-sm text-slate-700">{request.location}</p></div>
              </div>

              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Request description</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.description}</p></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Problem or opportunity</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.problem_or_opportunity}</p></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Expected benefit</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.expected_benefit}</p></div>
              <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Suggested solution</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.suggested_solution || 'No solution specified'}</p></div>

              {request.attachment_url && (
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Attachment / reference</p><a href={request.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline"><ExternalLink className="w-3.5 h-3.5" />View attachment</a></div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Submitted by</p><p className="text-sm text-slate-700">{members.find(m => m.user_id === request.submitted_by) ? memberDisplayName(members.find(m => m.user_id === request.submitted_by)!) : 'Submitter'}</p></div>
                <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Date submitted</p><p className="text-sm text-slate-700">{fmtDateTime(request.created_at)}</p></div>
              </div>

              {/* management section */}
              {canManage ? (
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Management Assessment</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Status">
                      <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as WishlistStatus)}>
                        {WISHLIST_STATUSES.map(s => <option key={s} value={s}>{WISHLIST_STATUS_CFG[s].label}</option>)}
                      </select>
                    </Field>
                    <Field label="Assigned owner">
                      <select className={selectCls} value={assignedOwner} onChange={e => setAssignedOwner(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</option>)}
                      </select>
                    </Field>
                    <Field label="Estimated effort">
                      <select className={selectCls} value={estimatedEffort} onChange={e => setEstimatedEffort(e.target.value as WishlistEffort)}>
                        {WISHLIST_EFFORTS.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Category">
                      <select className={selectCls} value={category} onChange={e => setCategory(e.target.value as WishlistCategory)}>
                        {WISHLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Urgency">
                      <select className={selectCls} value={urgency} onChange={e => setUrgency(e.target.value as WishlistUrgency)}>
                        {WISHLIST_URGENCIES.map(u => <option key={u} value={u}>{WISHLIST_URGENCY_CFG[u].label}</option>)}
                      </select>
                    </Field>
                    <Field label="Business impact">
                      <select className={selectCls} value={businessImpact} onChange={e => setBusinessImpact(e.target.value as WishlistBusinessImpact)}>
                        {WISHLIST_IMPACTS.map(i => <option key={i} value={i}>{WISHLIST_IMPACT_CFG[i].label}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Related module">
                      <input className={inputCls} value={relatedModule} onChange={e => setRelatedModule(e.target.value)} placeholder="Module, page, or workflow" />
                    </Field>
                    <Field label="Target date">
                      <input type="date" className={inputCls} value={targetDate} onChange={e => setTargetDate(e.target.value)} />
                    </Field>
                  </div>

                  <Field label="Strategic alignment">
                    <textarea className={inputCls} rows={2} value={strategicAlignment} onChange={e => setStrategicAlignment(e.target.value)} placeholder="How does this align with strategy?" />
                  </Field>
                  <Field label="Technical feasibility">
                    <textarea className={inputCls} rows={2} value={technicalFeasibility} onChange={e => setTechnicalFeasibility(e.target.value)} placeholder="Technical assessment…" />
                  </Field>
                  <Field label="Dependencies">
                    <textarea className={inputCls} rows={2} value={dependencies} onChange={e => setDependencies(e.target.value)} placeholder="Dependencies…" />
                  </Field>
                  <Field label="Risks">
                    <textarea className={inputCls} rows={2} value={risks} onChange={e => setRisks(e.target.value)} placeholder="Risks…" />
                  </Field>
                  <Field label="Management assessment">
                    <textarea className={inputCls} rows={3} value={managementAssessment} onChange={e => setManagementAssessment(e.target.value)} placeholder="Overall assessment…" />
                  </Field>
                  <Field label="Decision reason">
                    <textarea className={inputCls} rows={2} value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Reason for approve/defer/reject/clarification…" />
                  </Field>
                  <Field label="Implementation notes">
                    <textarea className={inputCls} rows={2} value={implementationNotes} onChange={e => setImplementationNotes(e.target.value)} placeholder="Implementation notes…" />
                  </Field>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={deleteRequest}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Request
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
                  {request.management_assessment && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Management assessment</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.management_assessment}</p></div>}
                  {request.strategic_alignment && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Strategic alignment</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.strategic_alignment}</p></div>}
                  {request.technical_feasibility && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Technical feasibility</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.technical_feasibility}</p></div>}
                  {request.estimated_effort && request.estimated_effort !== 'To Be Assessed' && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Estimated effort</p><p className="text-sm text-slate-700">{request.estimated_effort}</p></div>}
                  {request.dependencies && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Dependencies</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.dependencies}</p></div>}
                  {request.risks && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Risks</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.risks}</p></div>}
                  {request.decision_reason && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Decision reason</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.decision_reason}</p></div>}
                  {request.implementation_notes && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Implementation notes</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{request.implementation_notes}</p></div>}
                  {request.related_module && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Related module</p><p className="text-sm text-slate-700">{request.related_module}</p></div>}
                  {request.target_date && <div><p className="text-xs font-semibold text-slate-400 mb-0.5">Target date</p><p className="text-sm text-slate-700">{fmtDate(request.target_date)}</p></div>}
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
                <Field label="Add Note">
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

// ─── Vote Button ───────────────────────────────────────────────────────────────

function VoteButton({ requestId, voteCount, userVoted, onVoted }: { requestId: string; voteCount: number; userVoted: boolean; onVoted: () => void }) {
  const [voting, setVoting] = useState(false);

  async function toggleVote() {
    setVoting(true);
    if (userVoted) {
      await supabase.from('wishlist_votes').delete().eq('wishlist_id', requestId).eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      await supabase.from('wishlist_history').insert({
        wishlist_id: requestId,
        action_type: 'vote_removed',
        note: 'Vote removed.',
      });
    } else {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from('wishlist_votes').insert({ wishlist_id: requestId, user_id: userData.user.id });
        await supabase.from('wishlist_history').insert({
          wishlist_id: requestId,
          action_type: 'vote_added',
          note: 'Vote added.',
        });
      }
    }
    setVoting(false);
    onVoted();
  }

  return (
    <button
      onClick={toggleVote}
      disabled={voting}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        userVoted
          ? 'text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100'
          : 'text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200'
      }`}
    >
      {voting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : userVoted ? <ThumbsUp className="w-3.5 h-3.5 fill-teal-500 text-teal-600" /> : <ThumbsUp className="w-3.5 h-3.5" />}
      {userVoted ? 'Voted' : 'Vote'}
      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-bold">{voteCount}</span>
    </button>
  );
}

// ─── Main Wishlist Page ────────────────────────────────────────────────────────

export default function Wishlist({ userEmail, memberRole }: { userEmail: string; memberRole: string | null }) {
  const canManage = isManagement(memberRole);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [requests, setRequests] = useState<WishlistRequest[]>([]);
  const [votes, setVotes] = useState<WishlistVote[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [problemOrOpportunity, setProblemOrOpportunity] = useState('');
  const [expectedBenefit, setExpectedBenefit] = useState('');
  const [location, setLocation] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');
  const [suggestedSolution, setSuggestedSolution] = useState('');
  const [category, setCategory] = useState<WishlistCategory>('New Feature');
  const [urgency, setUrgency] = useState<WishlistUrgency>('Medium');
  const [businessImpact, setBusinessImpact] = useState<WishlistBusinessImpact>('To Be Assessed');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'active' | 'all' | WishlistStatus>('active');
  const [filterCategory, setFilterCategory] = useState<'all' | WishlistCategory>('all');
  const [filterUrgency, setFilterUrgency] = useState<'all' | WishlistUrgency>('all');
  const [filterImpact, setFilterImpact] = useState<'all' | WishlistBusinessImpact>('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  const [filterSubmitter, setFilterSubmitter] = useState('all');
  const [filterMyRequests, setFilterMyRequests] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most_voted' | 'urgency' | 'impact' | 'updated'>('newest');

  // modals
  const [selectedRequest, setSelectedRequest] = useState<WishlistRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<WishlistRequest | null>(null);
  const [historyRequest, setHistoryRequest] = useState<WishlistRequest | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('wishlist_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRequests((data ?? []) as WishlistRequest[]);
    setLoading(false);
  }, []);

  const loadVotes = useCallback(async () => {
    const { data } = await supabase
      .from('wishlist_votes')
      .select('*');
    setVotes((data ?? []) as WishlistVote[]);
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

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setCurrentUserId(userData.user?.id ?? null);
    })();
    loadRequests();
    loadVotes();
    loadMembers();
  }, [loadRequests, loadVotes, loadMembers]);

  const submitterName = useMemo(() => {
    const me = members.find(m => m.email === userEmail);
    return me ? memberDisplayName(me) : userEmail;
  }, [members, userEmail]);

  const myUserId = useMemo(() => {
    const me = members.find(m => m.email === userEmail);
    return me?.user_id ?? currentUserId ?? null;
  }, [members, userEmail, currentUserId]);

  // vote count per request
  const voteCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of votes) {
      map.set(v.wishlist_id, (map.get(v.wishlist_id) ?? 0) + 1);
    }
    return map;
  }, [votes]);

  // voted set for current user
  const myVotedIds = useMemo(() => {
    const set = new Set<string>();
    if (!myUserId) return set;
    for (const v of votes) {
      if (v.user_id === myUserId) set.add(v.wishlist_id);
    }
    return set;
  }, [votes, myUserId]);

  // filtered + sorted requests
  const visibleRequests = useMemo(() => {
    let list = [...requests];

    if (filterStatus === 'active') {
      list = list.filter(r => WISHLIST_ACTIVE_STATUSES.includes(r.status));
    } else if (filterStatus !== 'all') {
      list = list.filter(r => r.status === filterStatus);
    }

    if (filterCategory !== 'all') list = list.filter(r => r.category === filterCategory);
    if (filterUrgency !== 'all') list = list.filter(r => r.urgency === filterUrgency);
    if (filterImpact !== 'all') list = list.filter(r => r.business_impact === filterImpact);
    if (filterAssigned !== 'all') {
      list = list.filter(r => filterAssigned === 'unassigned' ? !r.assigned_owner : r.assigned_owner === filterAssigned);
    }
    if (filterSubmitter !== 'all') list = list.filter(r => r.submitted_by === filterSubmitter);
    if (filterMyRequests && myUserId) list = list.filter(r => r.submitted_by === myUserId);

    if (dateFrom) list = list.filter(r => new Date(r.created_at) >= new Date(dateFrom));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      list = list.filter(r => new Date(r.created_at) <= end);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        (r.beneficiaries ?? '').toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q) ||
        (r.suggested_solution ?? '').toLowerCase().includes(q)
      );
    }

    const urgencyRank: Record<WishlistUrgency, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, 'Future Idea': 4 };
    const impactRank: Record<WishlistBusinessImpact, number> = { Transformational: 0, High: 1, Moderate: 2, Low: 3, 'To Be Assessed': 4 };

    list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'most_voted') return (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0);
      if (sortBy === 'urgency') return urgencyRank[a.urgency] - urgencyRank[b.urgency];
      if (sortBy === 'impact') return impactRank[a.business_impact] - impactRank[b.business_impact];
      if (sortBy === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return 0;
    });

    return list;
  }, [requests, filterStatus, filterCategory, filterUrgency, filterImpact, filterAssigned, filterSubmitter, filterMyRequests, myUserId, dateFrom, dateTo, search, sortBy, voteCounts]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Required';
    if (!description.trim()) errs.description = 'Required';
    if (!problemOrOpportunity.trim()) errs.problemOrOpportunity = 'Required';
    if (!expectedBenefit.trim()) errs.expectedBenefit = 'Required';
    if (!location.trim()) errs.location = 'Required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submitRequest() {
    if (!validate()) return;
    setSubmitting(true);
    const { data, error } = await supabase.from('wishlist_requests').insert({
      title: title.trim(),
      description: description.trim(),
      problem_or_opportunity: problemOrOpportunity.trim(),
      expected_benefit: expectedBenefit.trim(),
      location: location.trim(),
      beneficiaries: beneficiaries.trim() || null,
      suggested_solution: suggestedSolution.trim() || null,
      category,
      urgency,
      business_impact: businessImpact,
      attachment_url: attachmentUrl.trim() || null,
    }).select().maybeSingle();

    if (!error && data) {
      await supabase.from('wishlist_history').insert({
        wishlist_id: (data as WishlistRequest).id,
        action_type: 'wishlist_submitted',
        note: 'Wishlist request submitted.',
      });

      // notify management team
      const managers = members.filter(m => MANAGEMENT_ROLES.has(m.role));
      if (managers.length > 0) {
        await supabase.from('nurse_notifications').insert(
          managers.map(m => ({
            recipient_user_id: m.user_id,
            event_type: 'wishlist',
            client_name: `New wishlist request: "${title.trim()}"`,
          }))
        );
      }
    }

    setSubmitting(false);

    if (error) {
      setSuccessMsg('');
      return;
    }

    setTitle(''); setDescription(''); setProblemOrOpportunity(''); setExpectedBenefit('');
    setLocation(''); setBeneficiaries(''); setSuggestedSolution('');
    setCategory('New Feature'); setUrgency('Medium'); setBusinessImpact('To Be Assessed');
    setAttachmentUrl(''); setFormErrors({});
    setSuccessMsg('Wishlist request submitted and added to the queue.');
    setTimeout(() => setSuccessMsg(''), 4000);
    loadRequests();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Lightbulb className="w-5 h-5 text-teal-600" /> Wishlist</h2>
          <p className="text-sm text-slate-500 mt-0.5">Submit feature requests, improvements, and ideas for the platform.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Signed in as</p>
          <p className="text-sm font-semibold text-slate-700">{submitterName}</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', count: requests.filter(r => WISHLIST_ACTIVE_STATUSES.includes(r.status)).length, icon: Clock, color: 'text-blue-600' },
          { label: 'Approved', count: requests.filter(r => r.status === 'Approved' || r.status === 'Planned' || r.status === 'In Development').length, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Completed', count: requests.filter(r => r.status === 'Completed').length, icon: Sparkles, color: 'text-teal-600' },
          { label: 'Total', count: requests.length, icon: Lightbulb, color: 'text-slate-600' },
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

      {/* Submission Form */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><Plus className="w-4 h-4 text-teal-600" /> Submit Wishlist Request</h3>
        </div>
        <div className="p-5 space-y-4">
          {successMsg && (
            <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> {successMsg}
            </div>
          )}

          <Field label="Request title" required>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary of the request" />
            {formErrors.title && <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>}
          </Field>

          <Field label="Request description" required>
            <textarea className={inputCls} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the requested improvement or feature" />
            {formErrors.description && <p className="text-xs text-red-500 mt-1">{formErrors.description}</p>}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Problem or opportunity" required>
              <textarea className={inputCls} rows={3} value={problemOrOpportunity} onChange={e => setProblemOrOpportunity(e.target.value)} placeholder="What problem does this solve or what opportunity does it create?" />
              {formErrors.problemOrOpportunity && <p className="text-xs text-red-500 mt-1">{formErrors.problemOrOpportunity}</p>}
            </Field>
            <Field label="Expected benefit" required>
              <textarea className={inputCls} rows={3} value={expectedBenefit} onChange={e => setExpectedBenefit(e.target.value)} placeholder="What benefit will this bring?" />
              {formErrors.expectedBenefit && <p className="text-xs text-red-500 mt-1">{formErrors.expectedBenefit}</p>}
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Who will benefit">
              <input className={inputCls} value={beneficiaries} onChange={e => setBeneficiaries(e.target.value)} placeholder="e.g. All staff, Nurses, Clients" />
            </Field>
            <Field label="Where it is needed" required>
              <input className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="Module, page, or workflow" />
              {formErrors.location && <p className="text-xs text-red-500 mt-1">{formErrors.location}</p>}
            </Field>
          </div>

          <Field label="Suggested solution">
            <textarea className={inputCls} rows={2} value={suggestedSolution} onChange={e => setSuggestedSolution(e.target.value)} placeholder="How would you suggest implementing this? (optional)" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Category">
              <select className={selectCls} value={category} onChange={e => setCategory(e.target.value as WishlistCategory)}>
                {WISHLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Urgency">
              <select className={selectCls} value={urgency} onChange={e => setUrgency(e.target.value as WishlistUrgency)}>
                {WISHLIST_URGENCIES.map(u => <option key={u} value={u}>{WISHLIST_URGENCY_CFG[u].label}</option>)}
              </select>
            </Field>
            <Field label="Business impact">
              <select className={selectCls} value={businessImpact} onChange={e => setBusinessImpact(e.target.value as WishlistBusinessImpact)}>
                {WISHLIST_IMPACTS.map(i => <option key={i} value={i}>{WISHLIST_IMPACT_CFG[i].label}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Attachment / reference URL">
              <input className={inputCls} value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} placeholder="Link to reference material (optional)" />
            </Field>
            <Field label="Submitted by">
              <input className={inputCls + ' bg-slate-50'} value={submitterName} disabled />
            </Field>
          </div>

          <div className="flex justify-end">
            <button
              onClick={submitRequest}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Submit Request
            </button>
          </div>
        </div>
      </section>

      {/* Wishlist Queue */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2"><Filter className="w-4 h-4 text-teal-600" /> Wishlist Queue</h3>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input className={inputCls + ' pl-9'} placeholder="Search requests…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className={selectCls + ' sm:w-44'} value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most_voted">Most voted</option>
              <option value="urgency">Highest urgency</option>
              <option value="impact">Highest impact</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <select className={selectCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'active' | 'all' | WishlistStatus)}>
              <option value="active">Active only</option>
              <option value="all">Show all</option>
              {WISHLIST_STATUSES.map(s => <option key={s} value={s}>{WISHLIST_STATUS_CFG[s].label}</option>)}
            </select>
            <select className={selectCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value as 'all' | WishlistCategory)}>
              <option value="all">All categories</option>
              {WISHLIST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className={selectCls} value={filterUrgency} onChange={e => setFilterUrgency(e.target.value as 'all' | WishlistUrgency)}>
              <option value="all">All urgency</option>
              {WISHLIST_URGENCIES.map(u => <option key={u} value={u}>{WISHLIST_URGENCY_CFG[u].label}</option>)}
            </select>
            <select className={selectCls} value={filterImpact} onChange={e => setFilterImpact(e.target.value as 'all' | WishlistBusinessImpact)}>
              <option value="all">All impact</option>
              {WISHLIST_IMPACTS.map(i => <option key={i} value={i}>{WISHLIST_IMPACT_CFG[i].label}</option>)}
            </select>
            <select className={selectCls} value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
              <option value="all">All owners</option>
              <option value="unassigned">Unassigned</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</option>)}
            </select>
            <select className={selectCls} value={filterSubmitter} onChange={e => setFilterSubmitter(e.target.value)}>
              <option value="all">All submitters</option>
              {members.map(m => <option key={m.user_id} value={m.user_id}>{memberDisplayName(m)}</option>)}
            </select>
            <button
              onClick={() => setFilterMyRequests(!filterMyRequests)}
              className={`px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${filterMyRequests ? 'text-teal-700 bg-teal-50 border-teal-200' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              {filterMyRequests ? 'My Requests: On' : 'My Requests'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
            <input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className={inputCls} value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
          </div>
        </div>

        {/* Request list */}
        <div className="divide-y divide-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
          ) : visibleRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Lightbulb className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-400">No requests match the current filters.</p>
            </div>
          ) : (
            visibleRequests.map(r => {
              const owner = members.find(m => m.user_id === r.assigned_owner);
              const submitter = members.find(m => m.user_id === r.submitted_by);
              const voteCount = voteCounts.get(r.id) ?? 0;
              const userVoted = myVotedIds.has(r.id);
              return (
                <div key={r.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <button onClick={() => setSelectedRequest(r)} className="text-sm font-bold text-slate-800 hover:text-teal-600 transition-colors text-left">
                          {r.title}
                        </button>
                        <CategoryBadge category={r.category} />
                        <UrgencyBadge urgency={r.urgency} />
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500">
                        <p><span className="font-semibold text-slate-400">Submitted by:</span> {submitter ? memberDisplayName(submitter) : 'Submitter'}</p>
                        <p><span className="font-semibold text-slate-400">Date:</span> {fmtDateTime(r.created_at)}</p>
                        <p><span className="font-semibold text-slate-400">Where:</span> {r.location}</p>
                        <p><span className="font-semibold text-slate-400">Owner:</span> {owner ? memberDisplayName(owner) : 'Unassigned'}</p>
                        <p><span className="font-semibold text-slate-400">Who benefits:</span> {r.beneficiaries || '—'}</p>
                        <p><span className="font-semibold text-slate-400">Business impact:</span> {r.business_impact}</p>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        <p><span className="font-semibold text-slate-400">Description:</span> <span className="line-clamp-2">{r.description}</span></p>
                        {r.suggested_solution && <p><span className="font-semibold text-slate-400">Suggested solution:</span> <span className="line-clamp-2">{r.suggested_solution}</span></p>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <VoteButton requestId={r.id} voteCount={voteCount} userVoted={userVoted} onVoted={() => { loadVotes(); loadRequests(); }} />
                    <button onClick={() => setSelectedRequest(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                    <button onClick={() => setPromptRequest(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                      <Wrench className="w-3.5 h-3.5" /> Bolt Prompt
                    </button>
                    <button onClick={() => setHistoryRequest(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      <History className="w-3.5 h-3.5" /> History
                    </button>
                    <button onClick={() => setHistoryRequest(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
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
      {selectedRequest && (
        <RequestDetailsModal
          request={selectedRequest}
          canManage={canManage}
          members={members}
          currentUserId={myUserId}
          onClose={() => setSelectedRequest(null)}
          onChanged={loadRequests}
        />
      )}
      {promptRequest && (
        <PromptModal request={promptRequest} onClose={() => { setPromptRequest(null); loadRequests(); }} />
      )}
      {historyRequest && (
        <HistoryModal request={historyRequest} canAdd onClose={() => setHistoryRequest(null)} />
      )}
    </div>
  );
}
