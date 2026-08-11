import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, RefreshCw, X, Loader2, AlertCircle, Trash2, CheckCircle, Search,
  Pencil, AlertTriangle, Calendar, TrendingUp, TrendingDown, DollarSign,
  Package, PackageOpen, Snowflake, Pill, Stethoscope, ShieldAlert, Lock,
  ClipboardCheck, Boxes, FlaskConical, FileText, Clock, ArrowRight,
  ArrowDown, ArrowUp, Download, Upload, Eye, Activity, Zap, ShoppingCart,
} from 'lucide-react';
import {
  supabase, type Branch, type InventoryProduct, type InventoryProductSummary,
  type InventoryRequest, type InventoryRequestItem, type InventoryReservation,
  type InventoryCostHistory, type InventoryAudit, type InventoryAuditItem,
  type InventoryKit, type InventoryKitItem, type InventoryAttachment,
  type InventoryForecast, type InventoryTimelineEvent, type InventorySupplier,
  type InventoryTransfer, type InventoryBatchSummary, type RequestPriority,
  type RequestStatus, type AuditType, type AttachmentCategory, type MovementClass,
  INVENTORY_TYPES,
} from '../lib/supabase';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

const fmtMoney = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtNum = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function requestStatusLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case 'pending': return { label: 'Pending', cls: 'bg-amber-100 text-amber-700' };
    case 'approved': return { label: 'Approved', cls: 'bg-blue-100 text-blue-700' };
    case 'rejected': return { label: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'released': return { label: 'Released', cls: 'bg-teal-100 text-teal-700' };
    case 'completed': return { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' };
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' };
    default: return { label: status, cls: 'bg-slate-100 text-slate-500' };
  }
}

function priorityLabel(priority: string): { label: string; cls: string } {
  switch (priority) {
    case 'urgent': return { label: 'Urgent', cls: 'bg-red-100 text-red-700' };
    case 'high': return { label: 'High', cls: 'bg-orange-100 text-orange-700' };
    case 'normal': return { label: 'Normal', cls: 'bg-slate-100 text-slate-600' };
    case 'low': return { label: 'Low', cls: 'bg-slate-100 text-slate-400' };
    default: return { label: priority, cls: 'bg-slate-100 text-slate-500' };
  }
}

function transferStatusLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case 'requested': return { label: 'Requested', cls: 'bg-amber-100 text-amber-700' };
    case 'approved': return { label: 'Approved', cls: 'bg-blue-100 text-blue-700' };
    case 'in_transit': return { label: 'In Transit', cls: 'bg-purple-100 text-purple-700' };
    case 'received': return { label: 'Received', cls: 'bg-emerald-100 text-emerald-700' };
    case 'rejected': return { label: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' };
    default: return { label: status, cls: 'bg-slate-100 text-slate-500' };
  }
}

function auditStatusLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case 'in_progress': return { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' };
    case 'completed': return { label: 'Completed', cls: 'bg-blue-100 text-blue-700' };
    case 'approved': return { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' };
    default: return { label: status, cls: 'bg-slate-100 text-slate-500' };
  }
}

function movementClassLabel(mc: string): { label: string; cls: string } {
  switch (mc) {
    case 'fast_moving': return { label: 'Fast Moving', cls: 'bg-emerald-100 text-emerald-700' };
    case 'slow_moving': return { label: 'Slow Moving', cls: 'bg-amber-100 text-amber-700' };
    case 'dead_stock': return { label: 'Dead Stock', cls: 'bg-red-100 text-red-700' };
    default: return { label: 'Normal', cls: 'bg-slate-100 text-slate-600' };
  }
}

// ─── Safety Badges ─────────────────────────────────────────────────────────────

export function SafetyBadges({ product, size = 'sm' }: { product: InventoryProduct; size?: 'sm' | 'xs' }) {
  const badges: { icon: React.ElementType; cls: string; title: string }[] = [];
  if (product.cold_storage) badges.push({ icon: Snowflake, cls: 'bg-blue-50 text-blue-600', title: 'Cold Storage' });
  if (product.prescription_required) badges.push({ icon: Pill, cls: 'bg-purple-50 text-purple-600', title: 'Prescription Required' });
  if (product.physician_approval_required) badges.push({ icon: Stethoscope, cls: 'bg-teal-50 text-teal-600', title: 'Physician Approval' });
  if (product.hazardous) badges.push({ icon: ShieldAlert, cls: 'bg-orange-50 text-orange-600', title: 'Hazardous' });
  if (product.controlled) badges.push({ icon: Lock, cls: 'bg-red-50 text-red-600', title: 'Controlled' });
  if (badges.length === 0) return null;
  const sz = size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {badges.map((b, i) => (
        <span key={i} className={`inline-flex items-center justify-center w-5 h-5 rounded ${b.cls}`} title={b.title}>
          <b.icon className={sz} />
        </span>
      ))}
    </div>
  );
}

// ─── 1. Inventory Requests Sub-Tab ───────────────────────────────────────────

export function RequestsSubTab({ branches, branchFilter, canManage, canRequest, userEmail }: {
  branches: Branch[]; branchFilter: string; canManage: boolean; canRequest: boolean; userEmail: string;
}) {
  const [requests, setRequests] = useState<InventoryRequest[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState<InventoryRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_requests').select('*, branches(name), inventory_request_items(*, inventory_products(name, product_code, unit))').order('created_at', { ascending: false });
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const [reqRes, prodRes] = await Promise.all([
      q,
      supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name'),
    ]);
    setRequests(reqRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(req: InventoryRequest, status: RequestStatus, extra?: Record<string, unknown>) {
    const { data: userData } = await supabase.auth.getUser();
    const { data: memberData } = await supabase.from('team_members').select('email').eq('user_id', userData.user?.id ?? '').maybeSingle();
    const email = memberData?.email ?? userEmail;

    const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...extra };
    if (status === 'approved') { payload.approved_by = email; payload.approved_at = new Date().toISOString(); }
    if (status === 'rejected') { payload.rejected_by = email; payload.rejected_at = new Date().toISOString(); }
    if (status === 'completed') { payload.completed_at = new Date().toISOString(); }

    await supabase.from('inventory_requests').update(payload).eq('id', req.id);
    if (status === 'released') {
      await supabase.rpc('release_inventory_request', { p_request_id: req.id, p_user_email: email });
    }
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{requests.length} requests</p>
        {canRequest && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> New Request
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <ClipboardCheck className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No inventory requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => {
            const st = requestStatusLabel(r.status);
            const pr = priorityLabel(r.priority);
            return (
              <button key={r.id} onClick={() => setViewing(r)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-slate-200 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{r.request_number}</p>
                      <p className="text-xs text-slate-500">{r.requestor_name} · {r.branches?.name ?? 'All'} · {new Date(r.request_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${pr.cls}`}>{pr.label}</span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.label}</span>
                    <span className="text-xs text-slate-400">{r.inventory_request_items?.length ?? 0} items</span>
                  </div>
                </div>
                {r.reason && <p className="text-xs text-slate-500 mt-2">{r.reason}</p>}
              </button>
            );
          })}
        </div>
      )}

      {showAdd && <RequestModal branches={branches} branchFilter={branchFilter} products={products} userEmail={userEmail} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {viewing && <RequestDetailModal request={viewing} canManage={canManage} onClose={() => setViewing(null)} onAction={(status, extra) => { updateStatus(viewing, status, extra); setViewing(null); }} />}
    </div>
  );
}

function RequestModal({ branches, branchFilter, products, userEmail, onClose, onSaved }: {
  branches: Branch[]; branchFilter: string; products: InventoryProduct[]; userEmail: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    requestor_name: userEmail,
    branch_id: branchFilter !== 'all' ? branchFilter : '',
    priority: 'normal' as RequestPriority,
    reason: '',
    notes: '',
  });
  const [items, setItems] = useState<{ product_id: string; quantity: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form.requestor_name.trim()) { setErr('Requestor name is required.'); return; }
    if (items.length === 0) { setErr('Add at least one item.'); return; }
    setSaving(true); setErr('');
    const { data: userData } = await supabase.auth.getUser();
    const { data: reqData, error: reqErr } = await supabase.from('inventory_requests').insert({
      ...form,
      branch_id: form.branch_id || null,
      requestor_id: userData.user?.id ?? null,
      requestor_email: userEmail,
    }).select().single();
    if (reqErr) { setSaving(false); setErr(reqErr.message); return; }

    const itemPayload = items.filter(i => i.product_id).map(i => ({
      request_id: reqData.id, product_id: i.product_id, quantity: Number(i.quantity) || 1,
    }));
    if (itemPayload.length > 0) {
      const { error: itemErr } = await supabase.from('inventory_request_items').insert(itemPayload);
      if (itemErr) { setSaving(false); setErr(itemErr.message); return; }
    }
    setSaving(false); onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-bold text-slate-800">New Inventory Request</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Requestor Name *"><input className={inputCls} value={form.requestor_name} onChange={e => setForm({ ...form, requestor_name: e.target.value })} /></Field>
            <Field label="Branch"><select className={inputCls} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority"><select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as RequestPriority })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
          </div>
          <Field label="Reason"><input className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Why is this inventory needed?" /></Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Items</p>
              <button onClick={() => setItems([...items, { product_id: '', quantity: '1' }])} className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_32px] gap-2 items-center">
                  <select className={inputCls} value={it.product_id} onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, product_id: e.target.value } : x))}>
                    <option value="">— Product —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" placeholder="Qty" className={inputCls} value={it.quantity} onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                  <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No items added yet</p>}
            </div>
          </div>
          <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestDetailModal({ request, canManage, onClose, onAction }: {
  request: InventoryRequest; canManage: boolean; onClose: () => void; onAction: (status: RequestStatus, extra?: Record<string, unknown>) => void;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const st = requestStatusLabel(request.status);
  const pr = priorityLabel(request.priority);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">{request.request_number}</h3>
            <p className="text-xs text-slate-500">{request.requestor_name} · {new Date(request.request_date).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.label}</span>
            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${pr.cls}`}>{pr.label}</span>
          </div>
          {request.reason && <div><p className="text-xs font-semibold text-slate-400 mb-1">Reason</p><p className="text-sm text-slate-700">{request.reason}</p></div>}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Items</p>
            <div className="space-y-2">
              {request.inventory_request_items?.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div><p className="text-sm font-semibold text-slate-700">{item.inventory_products?.name}</p><p className="text-xs text-slate-400">{item.inventory_products?.product_code}</p></div>
                  <span className="text-sm font-bold text-slate-700">{fmtNum(item.quantity)} {item.inventory_products?.unit}</span>
                </div>
              ))}
            </div>
          </div>
          {showReject && (
            <Field label="Rejection Reason"><textarea rows={2} className={inputCls} value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></Field>
          )}
        </div>
        {canManage && request.status === 'pending' && (
          <div className="flex gap-2 px-6 py-4 border-t border-slate-100">
            {!showReject ? (
              <>
                <button onClick={() => onAction('approved')} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">Approve</button>
                <button onClick={() => setShowReject(true)} className="flex-1 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50">Reject</button>
              </>
            ) : (
              <>
                <button onClick={() => onAction('rejected', { rejection_reason: rejectReason })} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700">Confirm Reject</button>
                <button onClick={() => setShowReject(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              </>
            )}
          </div>
        )}
        {canManage && request.status === 'approved' && (
          <div className="flex gap-2 px-6 py-4 border-t border-slate-100">
            <button onClick={() => onAction('released')} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700">Release & Deduct</button>
            <button onClick={() => onAction('cancelled')} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          </div>
        )}
        {canManage && request.status === 'released' && (
          <div className="flex gap-2 px-6 py-4 border-t border-slate-100">
            <button onClick={() => onAction('completed')} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">Mark Completed</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2. Enhanced Transfers Sub-Tab ───────────────────────────────────────────

export function TransfersSubTab({ branches, branchFilter, canManage, userEmail }: {
  branches: Branch[]; branchFilter: string; canManage: boolean; userEmail: string;
}) {
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_transfers').select('*, inventory_products(name, product_code, unit), from_branch:branches!from_branch_id(name), to_branch:branches!to_branch_id(name)').order('created_at', { ascending: false });
    if (branchFilter !== 'all') q = q.or(`from_branch_id.eq.${branchFilter},to_branch_id.eq.${branchFilter}`);
    const [trRes, prodRes] = await Promise.all([
      q,
      supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name'),
    ]);
    setTransfers(trRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  async function updateTransfer(t: InventoryTransfer, status: string, extra?: Record<string, unknown>) {
    const payload: Record<string, unknown> = { status, ...extra };
    if (status === 'approved') { payload.approved_by = userEmail; payload.approved_at = new Date().toISOString(); }
    if (status === 'rejected') { payload.rejected_by = userEmail; payload.rejected_at = new Date().toISOString(); }
    if (status === 'received') { payload.received_by = userEmail; payload.received_at = new Date().toISOString(); }
    await supabase.from('inventory_transfers').update(payload).eq('id', t.id);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{transfers.length} transfers</p>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> New Transfer
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : transfers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <ArrowRight className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No transfers yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transfers.map(t => {
            const st = transferStatusLabel(t.status);
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{t.transfer_number}</p>
                    <p className="text-xs text-slate-500">{t.inventory_products?.name} · {fmtNum(t.quantity)} {t.inventory_products?.unit}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <span>{(t as any).from_branch?.name ?? '—'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{(t as any).to_branch?.name ?? '—'}</span>
                  <span className="text-slate-300">·</span>
                  <span>{new Date(t.transfer_date).toLocaleDateString()}</span>
                </div>
                {canManage && (
                  <div className="flex gap-2 flex-wrap">
                    {t.status === 'requested' && (
                      <>
                        <button onClick={() => updateTransfer(t, 'approved')} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Approve</button>
                        <button onClick={() => updateTransfer(t, 'rejected', { rejection_reason: 'Rejected by manager' })} className="px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Reject</button>
                      </>
                    )}
                    {t.status === 'approved' && (
                      <button onClick={() => updateTransfer(t, 'in_transit')} className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700">Mark In Transit</button>
                    )}
                    {t.status === 'in_transit' && (
                      <button onClick={() => updateTransfer(t, 'received')} className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Confirm Received</button>
                    )}
                    {(t.status === 'requested' || t.status === 'approved') && (
                      <button onClick={() => updateTransfer(t, 'cancelled')} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                    )}
                  </div>
                )}
                {t.rejection_reason && <p className="text-xs text-red-600 mt-2">Rejected: {t.rejection_reason}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <TransferModal branches={branches} branchFilter={branchFilter} products={products} userEmail={userEmail} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function TransferModal({ branches, branchFilter, products, userEmail, onClose, onSaved }: {
  branches: Branch[]; branchFilter: string; products: InventoryProduct[]; userEmail: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    product_id: '',
    quantity: '1',
    from_branch_id: branchFilter !== 'all' ? branchFilter : '',
    to_branch_id: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form.product_id) { setErr('Product is required.'); return; }
    if (!form.to_branch_id) { setErr('Destination branch is required.'); return; }
    if (form.from_branch_id === form.to_branch_id) { setErr('Source and destination must be different.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('inventory_transfers').insert({
      product_id: form.product_id,
      quantity: Number(form.quantity) || 1,
      from_branch_id: form.from_branch_id || null,
      to_branch_id: form.to_branch_id,
      notes: form.notes.trim() || null,
      status: 'requested',
      requested_by: userEmail,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">New Stock Transfer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Product *"><select className={inputCls} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}><option value="">— Select —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Quantity *"><input type="number" className={inputCls} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From Branch"><select className={inputCls} value={form.from_branch_id} onChange={e => setForm({ ...form, from_branch_id: e.target.value })}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="To Branch *"><select className={inputCls} value={form.to_branch_id} onChange={e => setForm({ ...form, to_branch_id: e.target.value })}><option value="">— Select —</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          </div>
          <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Create Transfer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Reservations Sub-Tab ──────────────────────────────────────────────────

export function ReservationsSubTab({ branchFilter }: { branchFilter: string }) {
  const [reservations, setReservations] = useState<InventoryReservation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_reservations').select('*, inventory_products(name, product_code, unit)').order('reserved_at', { ascending: false });
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setReservations(data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  const active = reservations.filter(r => r.status === 'active');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{active.length} active reservations · {reservations.length} total</p>
        <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : reservations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Package className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No reservations</p>
          <p className="text-xs text-slate-400 mt-1">Reservations are created automatically when bookings are confirmed</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.5fr_80px_100px_120px_90px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span>Product</span><span className="text-right">Qty</span><span>Status</span><span>Reserved At</span><span>Released/Consumed</span>
            </div>
            <div className="divide-y divide-slate-50">
              {reservations.map(r => (
                <div key={r.id} className="grid grid-cols-[1.5fr_80px_100px_120px_90px] items-center px-5 py-3 text-sm">
                  <div><p className="font-semibold text-slate-700 truncate">{r.inventory_products?.name}</p><p className="text-xs text-slate-400">{r.inventory_products?.product_code}</p></div>
                  <span className="text-right font-semibold text-slate-700">{fmtNum(r.quantity)}</span>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${r.status === 'active' ? 'bg-blue-100 text-blue-700' : r.status === 'consumed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.status}</span>
                  <span className="text-xs text-slate-500">{new Date(r.reserved_at).toLocaleString()}</span>
                  <span className="text-xs text-slate-400">{r.released_at ? new Date(r.released_at).toLocaleDateString() : r.consumed_at ? new Date(r.consumed_at).toLocaleDateString() : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 4. Inventory Calendar Sub-Tab ────────────────────────────────────────────

export function CalendarSubTab({ branches, branchFilter }: { branches: Branch[]; branchFilter: string }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<{ date: string; type: string; label: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);
    const startStr = monthStart.toISOString().slice(0, 10);
    const endStr = monthEnd.toISOString().slice(0, 10);

    let batchQ = supabase.from('inventory_batch_summary').select('expiration_date, inventory_products(name)').not('expiration_date', 'is', null);
    if (branchFilter !== 'all') batchQ = batchQ.eq('branch_id', branchFilter);

    let poQ = supabase.from('inventory_purchase_orders').select('expected_delivery, po_number, inventory_suppliers(name)').not('expected_delivery', 'is', null);
    if (branchFilter !== 'all') poQ = poQ.eq('branch_id', branchFilter);

    let apptQ = supabase.from('appointments').select('scheduled_date, service').gte('scheduled_date', startStr).lte('scheduled_date', endStr);
    if (branchFilter !== 'all') apptQ = apptQ.eq('branch_id', branchFilter);

    const [batchRes, poRes, apptRes] = await Promise.all([batchQ, poQ, apptQ]);

    const evs: { date: string; type: string; label: string; color: string }[] = [];
    (batchRes.data ?? []).forEach((b: any) => {
      if (b.expiration_date) evs.push({ date: b.expiration_date, type: 'expiry', label: `Expiry: ${b.inventory_products?.name ?? 'Product'}`, color: 'bg-red-500' });
    });
    (poRes.data ?? []).forEach((p: any) => {
      if (p.expected_delivery) evs.push({ date: p.expected_delivery, type: 'delivery', label: `Delivery: ${p.po_number}`, color: 'bg-blue-500' });
    });
    (apptRes.data ?? []).forEach((a: any) => {
      if (a.scheduled_date) evs.push({ date: a.scheduled_date, type: 'treatment', label: `Treatment: ${a.service ?? 'Service'}`, color: 'bg-teal-500' });
    });

    setEvents(evs);
    setLoading(false);
  }, [currentMonth, branchFilter]);

  useEffect(() => { load(); }, [load]);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const today = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function dateStr(d: number) {
    return `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ArrowRight className="w-4 h-4 rotate-180" /></button>
          <h3 className="text-base font-bold text-slate-800">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
          <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ArrowRight className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Expiry</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Delivery</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-500" /> Treatment</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-xs font-bold text-slate-400 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const ds = dateStr(d);
              const dayEvents = events.filter(e => e.date === ds);
              const isToday = ds === today;
              return (
                <div key={i} className={`min-h-[80px] p-1.5 rounded-lg border ${isToday ? 'border-teal-300 bg-teal-50/30' : 'border-slate-100'}`}>
                  <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-teal-600' : 'text-slate-500'}`}>{d}</p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((e, j) => (
                      <div key={j} className="flex items-center gap-1 text-[10px] text-slate-600">
                        <span className={`w-1.5 h-1.5 rounded-full ${e.color} flex-shrink-0`} />
                        <span className="truncate">{e.label}</span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && <p className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 5. Executive Analytics Sub-Tab ──────────────────────────────────────────

export function AnalyticsSubTab({ branchFilter }: { branchFilter: string }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<InventoryProductSummary[]>([]);
  const [forecasts, setForecasts] = useState<InventoryForecast[]>([]);
  const [batches, setBatches] = useState<InventoryBatchSummary[]>([]);
  const [monthConsumption, setMonthConsumption] = useState<{ date: string; qty: number }[]>([]);
  const [monthPurchases, setMonthPurchases] = useState<{ date: string; amt: number }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    let pq = supabase.from('inventory_products').select('*, branches(name)').eq('is_active', true);
    if (branchFilter !== 'all') pq = pq.eq('branch_id', branchFilter);
    let bq = supabase.from('inventory_batch_summary').select('*, inventory_products(name, product_code, unit), branches(name), inventory_suppliers(name)');
    if (branchFilter !== 'all') bq = bq.eq('branch_id', branchFilter);

    const [prodRes, forecastRes, batchRes, consRes, poRes] = await Promise.all([
      pq,
      supabase.from('inventory_forecast').select('*'),
      bq,
      supabase.from('inventory_transactions').select('transaction_date, quantity').eq('transaction_type', 'consumption').gte('transaction_date', new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString()).order('transaction_date'),
      supabase.from('inventory_purchase_orders').select('order_date, total_amount').gte('order_date', new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10)).order('order_date'),
    ]);

    setProducts(prodRes.data ?? []);
    setForecasts(forecastRes.data ?? []);
    setBatches(batchRes.data ?? []);

    // Aggregate monthly
    const consMap = new Map<string, number>();
    (consRes.data ?? []).forEach(t => {
      const m = (t as any).transaction_date.slice(0, 7);
      consMap.set(m, (consMap.get(m) ?? 0) + Number((t as any).quantity));
    });
    setMonthConsumption(Array.from(consMap.entries()).map(([date, qty]) => ({ date, qty })).sort());

    const poMap = new Map<string, number>();
    (poRes.data ?? []).forEach(p => {
      const m = (p as any).order_date.slice(0, 7);
      poMap.set(m, (poMap.get(m) ?? 0) + Number((p as any).total_amount));
    });
    setMonthPurchases(Array.from(poMap.entries()).map(([date, amt]) => ({ date, amt })).sort());

    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  // By branch — must be before any early return to respect the Rules of Hooks.
  const byBranch = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => {
      const name = (p as any).branches?.name ?? 'All Branches';
      map.set(name, (map.get(name) ?? 0) + Number(p.current_stock) * Number(p.average_cost));
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [products]);

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;

  const totalInvValue = products.reduce((s, p) => s + Number(p.current_stock) * Number(p.average_cost), 0);
  const totalInvCost = products.reduce((s, p) => s + Number(p.current_stock) * Number(p.standard_cost), 0);
  const totalSalesValue = products.reduce((s, p) => s + Number(p.current_stock) * Number(p.selling_price), 0);
  const totalPotentialProfit = products.reduce((s, p) => s + Number(p.current_stock) * (Number(p.selling_price) - Number(p.average_cost)), 0);
  const nearExpiry = batches.filter(b => b.computed_status === 'near_expiry');
  const expired = batches.filter(b => b.computed_status === 'expired');
  const fastMoving = forecasts.filter(f => f.movement_class === 'fast_moving').slice(0, 5);
  const slowMoving = forecasts.filter(f => f.movement_class === 'slow_moving').slice(0, 5);
  const deadStock = forecasts.filter(f => f.movement_class === 'dead_stock').slice(0, 5);

  const maxConsumption = Math.max(...monthConsumption.map(m => m.qty), 1);
  const maxPurchase = Math.max(...monthPurchases.map(m => m.amt), 1);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Inventory Value" value={fmtMoney(totalInvValue)} color="teal" />
        <KpiCard icon={DollarSign} label="Inventory Cost" value={fmtMoney(totalInvCost)} color="slate" />
        <KpiCard icon={TrendingUp} label="Potential Sales" value={fmtMoney(totalSalesValue)} color="blue" />
        <KpiCard icon={TrendingUp} label="Potential Profit" value={fmtMoney(totalPotentialProfit)} color="emerald" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={AlertTriangle} label="Near Expiry" value={fmtNum(nearExpiry.length)} color="orange" />
        <KpiCard icon={AlertCircle} label="Expired" value={fmtNum(expired.length)} color="red" />
        <KpiCard icon={Zap} label="Fast Moving" value={fmtNum(fastMoving.length)} color="emerald" />
        <KpiCard icon={Clock} label="Dead Stock" value={fmtNum(deadStock.length)} color="slate" />
      </div>

      {/* Monthly Consumption & Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Consumption</h3>
          {monthConsumption.length === 0 ? <p className="text-sm text-slate-400">No data</p> : (
            <div className="space-y-2">
              {monthConsumption.map(m => (
                <div key={m.date}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{m.date}</span><span className="text-slate-500">{fmtNum(m.qty)} units</span></div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${(m.qty / maxConsumption) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Purchases</h3>
          {monthPurchases.length === 0 ? <p className="text-sm text-slate-400">No data</p> : (
            <div className="space-y-2">
              {monthPurchases.map(m => (
                <div key={m.date}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{m.date}</span><span className="text-slate-500">{fmtMoney(m.amt)}</span></div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${(m.amt / maxPurchase) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Inventory by Branch */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Inventory Value by Branch</h3>
        <div className="space-y-3">
          {byBranch.map(([name, val]) => {
            const pct = totalInvValue > 0 ? (val / totalInvValue) * 100 : 0;
            return (
              <div key={name}>
                <div className="flex justify-between text-xs mb-1"><span className="font-semibold text-slate-600">{name}</span><span className="text-slate-500">{fmtMoney(val)}</span></div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fast / Slow / Dead Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StockList title="Fast Moving" icon={Zap} iconColor="text-emerald-600" items={fastMoving.map(f => ({ name: f.name, sub: `${fmtNum(f.avg_daily_usage)} units/day` }))} />
        <StockList title="Slow Moving" icon={Clock} iconColor="text-amber-600" items={slowMoving.map(f => ({ name: f.name, sub: `${fmtNum(f.avg_daily_usage)} units/day` }))} />
        <StockList title="Dead Stock" icon={PackageOpen} iconColor="text-red-600" items={deadStock.map(f => ({ name: f.name, sub: 'No consumption in 90 days' }))} />
      </div>

      {/* Forecasting */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Forecast & Reorder Recommendations</h3>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.5fr_80px_80px_80px_100px_90px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2 border-b border-slate-100">
              <span>Product</span><span className="text-right">Stock</span><span className="text-right">Daily Use</span><span className="text-right">Monthly</span><span className="text-right">Days to Out</span><span>Reorder</span>
            </div>
            <div className="divide-y divide-slate-50">
              {forecasts.filter(f => f.days_until_stockout !== null && f.days_until_stockout < 30).map(f => (
                <div key={f.product_id} className="grid grid-cols-[1.5fr_80px_80px_80px_100px_90px] items-center px-3 py-2 text-sm">
                  <p className="font-medium text-slate-700 truncate">{f.name}</p>
                  <span className="text-right text-slate-700">{fmtNum(f.current_stock)}</span>
                  <span className="text-right text-slate-500">{fmtNum(f.avg_daily_usage)}</span>
                  <span className="text-right text-slate-500">{fmtNum(f.avg_monthly_usage)}</span>
                  <span className={`text-right font-semibold ${f.days_until_stockout! < 7 ? 'text-red-600' : 'text-amber-600'}`}>{f.days_until_stockout}</span>
                  {f.reorder_recommended ? <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700 w-fit">Reorder</span> : <span className="text-xs text-slate-400">—</span>}
                </div>
              ))}
              {forecasts.filter(f => f.days_until_stockout !== null && f.days_until_stockout < 30).length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">No products need reordering soon</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600', blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-600', slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}><Icon className="w-5 h-5" /></div>
      <div className="min-w-0"><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">{label}</p><p className="text-lg font-bold text-slate-800 truncate">{value}</p></div>
    </div>
  );
}

function StockList({ title, icon: Icon, iconColor, items }: { title: string; icon: React.ElementType; iconColor: string; items: { name: string; sub: string }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Icon className={`w-4 h-4 ${iconColor}`} /> {title}</h3>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-slate-400">None</p> : items.map((it, i) => (
          <div key={i}><p className="text-sm font-medium text-slate-700 truncate">{it.name}</p><p className="text-xs text-slate-400">{it.sub}</p></div>
        ))}
      </div>
    </div>
  );
}

// ─── 6. Inventory Audit Sub-Tab ──────────────────────────────────────────────

export function AuditsSubTab({ branches, branchFilter, canManage, userEmail }: {
  branches: Branch[]; branchFilter: string; canManage: boolean; userEmail: string;
}) {
  const [audits, setAudits] = useState<InventoryAudit[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState<InventoryAudit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_audits').select('*, branches(name)').order('created_at', { ascending: false });
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const [audRes, prodRes] = await Promise.all([
      q,
      supabase.from('inventory_products').select('id, name, product_code, unit, current_stock').eq('is_active', true).order('name'),
    ]);
    setAudits(audRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{audits.length} audits</p>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> New Audit
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : audits.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <ClipboardCheck className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No audits yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {audits.map(a => {
            const st = auditStatusLabel(a.status);
            return (
              <button key={a.id} onClick={() => setViewing(a)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-slate-200 transition-colors">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-bold text-slate-800">{a.audit_number}</p><p className="text-xs text-slate-500">{a.audit_type} · {a.branches?.name ?? 'All'} · {new Date(a.audit_date).toLocaleDateString()}</p></div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.label}</span>
                    {a.total_variants > 0 && <span className="text-xs text-slate-400">{a.total_variants} variants</span>}
                  </div>
                </div>
                {a.total_variance_value !== 0 && <p className="text-xs text-slate-500 mt-1">Variance: {fmtMoney(a.total_variance_value)}</p>}
              </button>
            );
          })}
        </div>
      )}

      {showAdd && <AuditModal branches={branches} branchFilter={branchFilter} products={products} userEmail={userEmail} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {viewing && <AuditDetailModal audit={viewing} canManage={canManage} userEmail={userEmail} onClose={() => setViewing(null)} onChanged={() => { setViewing(null); load(); }} />}
    </div>
  );
}

function AuditModal({ branches, branchFilter, products, userEmail, onClose, onSaved }: {
  branches: Branch[]; branchFilter: string; products: InventoryProduct[]; userEmail: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    audit_type: 'cycle_count' as AuditType,
    branch_id: branchFilter !== 'all' ? branchFilter : '',
    auditor: userEmail,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setSaving(true); setErr('');
    const { data, error } = await supabase.from('inventory_audits').insert({
      ...form,
      branch_id: form.branch_id || null,
      status: 'in_progress',
    }).select().single();
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // Pre-populate audit items with all active products
    const items = products.map(p => ({
      audit_id: data.id,
      product_id: p.id,
      system_quantity: p.current_stock,
      counted_quantity: p.current_stock,
      variance: 0,
      variance_pct: 0,
    }));
    if (items.length > 0) await supabase.from('inventory_audit_items').insert(items);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">New Audit</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Audit Type"><select className={inputCls} value={form.audit_type} onChange={e => setForm({ ...form, audit_type: e.target.value as AuditType })}><option value="cycle_count">Cycle Count</option><option value="physical_count">Physical Count</option><option value="spot_check">Spot Check</option></select></Field>
          <Field label="Branch"><select className={inputCls} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Auditor"><input className={inputCls} value={form.auditor} onChange={e => setForm({ ...form, auditor: e.target.value })} /></Field>
          <Field label="Notes"><textarea rows={2} className={inputCls} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Start Audit
          </button>
        </div>
      </div>
    </div>
  );
}

function hasValidCost(item: InventoryAuditItem): boolean {
  const cost = Number(item.inventory_products?.average_cost ?? 0);
  return cost > 0;
}

function varianceValueOf(item: InventoryAuditItem): number {
  if (!hasValidCost(item)) return 0;
  return Number(item.variance) * Number(item.inventory_products!.average_cost);
}

function AuditDetailModal({ audit, canManage, userEmail, onClose, onChanged }: {
  audit: InventoryAudit; canManage: boolean; userEmail: string; onClose: () => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<InventoryAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Reconciliation writes used to discard their errors, so a count that failed
  // to save looked exactly like one that saved.
  const [auditErr, setAuditErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('inventory_audit_items').select('*, inventory_products(name, product_code, unit, average_cost)').eq('audit_id', audit.id).order('created_at');
    setItems(data ?? []);
    setLoading(false);
  }, [audit.id]);

  useEffect(() => { load(); }, [load]);

  async function updateCounted(item: InventoryAuditItem, counted: number) {
    const variance = counted - item.system_quantity;
    const variance_pct = item.system_quantity > 0 ? (variance / item.system_quantity) * 100 : 0;
    setAuditErr(null);

    const { error: countErr } = await supabase
      .from('inventory_audit_items')
      .update({ counted_quantity: counted, variance, variance_pct })
      .eq('id', item.id);

    if (countErr) {
      // Do not update local state: showing the count as saved when it was not
      // is what makes a physical count quietly disagree with the record.
      console.error('Audit count save failed:', countErr);
      setAuditErr(`Could not save the count for ${item.inventory_products?.name ?? 'this product'}: ${countErr.message}`);
      return;
    }

    setItems(items.map(i => i.id === item.id ? { ...i, counted_quantity: counted, variance, variance_pct } : i));
  }

  async function completeAudit() {
    const missingCost = items.filter(i => i.variance !== 0 && !hasValidCost(i));
    const shortageValue = items.filter(i => i.variance < 0).reduce((s, i) => s + varianceValueOf(i), 0);
    const excessValue = items.filter(i => i.variance > 0).reduce((s, i) => s + varianceValueOf(i), 0);
    const netValue = shortageValue + excessValue;

    let msg = `Total Shortage Value: ${fmtMoney(shortageValue)}\nTotal Excess Value: ${fmtMoney(excessValue)}\nNet Variance Value: ${fmtMoney(netValue)}`;
    if (missingCost.length > 0) {
      msg += `\n\nWarning: ${missingCost.length} item(s) have no valid unit cost and will be recorded as ₱0 variance value (flagged as Missing Cost).`;
    }
    msg += '\n\nComplete this audit?';
    if (!confirm(msg)) return;

    setSaving(true);
    setAuditErr(null);
    const variants = items.filter(i => i.variance !== 0).length;
    const { error: completeErr } = await supabase.from('inventory_audits').update({
      status: 'completed',
      total_items: items.length,
      total_variants: variants,
      total_variance_value: netValue,
      updated_at: new Date().toISOString(),
    }).eq('id', audit.id);
    setSaving(false);

    if (completeErr) {
      console.error('Audit completion failed:', completeErr);
      setAuditErr(`Could not complete this audit: ${completeErr.message}`);
      return;
    }
    onChanged();
  }

  async function approveAudit() {
    setSaving(true);
    setAuditErr(null);

    const { error: approveErr } = await supabase.from('inventory_audits').update({
      status: 'approved',
      approved_by: userEmail,
      approved_at: new Date().toISOString(),
    }).eq('id', audit.id);

    if (approveErr) {
      console.error('Audit approval failed:', approveErr);
      setAuditErr(`Could not approve this audit: ${approveErr.message}`);
      setSaving(false);
      return;
    }

    // Apply adjustments for items with variance. Each item is marked adjusted
    // ONLY if its stock movement actually succeeded — previously a failed
    // adjustment was still flagged as applied, so the variance silently
    // disappeared from the audit without the stock ever moving.
    const failures: string[] = [];
    for (const item of items.filter(i => i.variance !== 0 && !i.adjusted)) {
      const name = item.inventory_products?.name ?? item.product_id;

      const { error: adjErr } = await supabase.rpc('adjust_inventory', {
        p_product_id: item.product_id,
        p_quantity: item.variance,
        p_reason: `Audit adjustment: ${audit.audit_number}`,
        p_notes: `Counted: ${item.counted_quantity}, System: ${item.system_quantity}`,
        p_user_id: null,
        p_user_email: userEmail,
      });

      if (adjErr) {
        console.error('Audit adjustment failed for', item.product_id, adjErr);
        failures.push(`${name}: ${adjErr.message}`);
        continue;
      }

      const { error: markErr } = await supabase.from('inventory_audit_items').update({ adjusted: true }).eq('id', item.id);
      if (markErr) {
        console.error('Could not mark item adjusted:', markErr);
        failures.push(`${name}: stock was adjusted but the item could not be marked as applied (${markErr.message})`);
      }
    }

    setSaving(false);

    if (failures.length > 0) {
      setAuditErr(`${failures.length} adjustment(s) did not apply:\n${failures.join('\n')}`);
      return;
    }
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div><h3 className="text-base font-bold text-slate-800">{audit.audit_number}</h3><p className="text-xs text-slate-500">{audit.audit_type} · {new Date(audit.audit_date).toLocaleDateString()}</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {auditErr && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 whitespace-pre-line leading-relaxed">{auditErr}</p>
            </div>
          )}
          {loading ? <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div> : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[1.5fr_70px_70px_70px_90px_100px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 py-2 border-b border-slate-100">
                  <span>Product</span><span className="text-right">System</span><span className="text-right">Counted</span><span className="text-right">Variance</span><span className="text-right">Unit Cost</span><span className="text-right">Var Value</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {items.map(item => {
                    const missing = !hasValidCost(item);
                    const vValue = varianceValueOf(item);
                    return (
                    <div key={item.id} className="grid grid-cols-[1.5fr_70px_70px_70px_90px_100px] items-center px-3 py-2 text-sm">
                      <p className="font-medium text-slate-700 truncate">{item.inventory_products?.name}</p>
                      <span className="text-right text-slate-600">{fmtNum(item.system_quantity)}</span>
                      {audit.status === 'in_progress' ? (
                        <input type="number" className="w-14 px-2 py-1 text-sm border border-slate-200 rounded text-right" value={item.counted_quantity} onChange={e => updateCounted(item, Number(e.target.value))} />
                      ) : (
                        <span className="text-right text-slate-700">{fmtNum(item.counted_quantity)}</span>
                      )}
                      <span className={`text-right font-semibold ${item.variance < 0 ? 'text-red-600' : item.variance > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{item.variance > 0 ? '+' : ''}{fmtNum(item.variance)}</span>
                      <span className="text-right text-slate-600">
                        {missing ? <span className="text-amber-600 font-semibold text-xs">Missing Cost</span> : fmtMoney(Number(item.inventory_products?.average_cost))}
                      </span>
                      <span className={`text-right font-semibold ${vValue < 0 ? 'text-red-600' : vValue > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{vValue > 0 ? '+' : ''}{fmtMoney(vValue)}</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        {audit.status === 'in_progress' && items.length > 0 && (() => {
          const missingCost = items.filter(i => i.variance !== 0 && !hasValidCost(i));
          const shortageValue = items.filter(i => i.variance < 0).reduce((s, i) => s + varianceValueOf(i), 0);
          const excessValue = items.filter(i => i.variance > 0).reduce((s, i) => s + varianceValueOf(i), 0);
          const netValue = shortageValue + excessValue;
          return (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Total Shortage Value:</span><span className="font-semibold text-red-600">{fmtMoney(shortageValue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total Excess Value:</span><span className="font-semibold text-emerald-600">{fmtMoney(excessValue)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Net Variance Value:</span><span className="font-bold text-slate-800">{fmtMoney(netValue)}</span></div>
              {missingCost.length > 0 && <div className="flex items-center gap-2 pt-1 text-amber-700 text-xs"><AlertCircle className="w-3.5 h-3.5" /> {missingCost.length} item(s) flagged as Missing Cost (₱0 variance value)</div>}
            </div>
          );
        })()}
        {canManage && (
          <div className="flex gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
            {audit.status === 'in_progress' && <button onClick={completeAudit} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700">Complete Audit</button>}
            {audit.status === 'completed' && <button onClick={approveAudit} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">Approve & Apply Adjustments</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 7. Medical Kit Builder Sub-Tab ───────────────────────────────────────────

export function KitsSubTab({ canManage }: { canManage: boolean }) {
  const [kits, setKits] = useState<InventoryKit[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InventoryKit | null>(null);
  const [items, setItems] = useState<InventoryKitItem[]>([]);
  const [showAddKit, setShowAddKit] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [kitRes, prodRes] = await Promise.all([
      supabase.from('inventory_kits').select('*').order('name'),
      supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name'),
    ]);
    setKits(kitRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadItems(kitId: string) {
    const { data } = await supabase.from('inventory_kit_items').select('*, inventory_products(name, product_code, unit)').eq('kit_id', kitId).order('created_at');
    setItems(data ?? []);
  }

  async function consumeKit(kit: InventoryKit) {
    if (!confirm(`Consume one ${kit.name}? This will deduct all kit items from inventory.`)) return;
    for (const item of items) {
      await supabase.rpc('deduct_inventory_fifo', {
        p_product_id: item.product_id,
        p_quantity: item.quantity,
        p_reference_type: 'kit',
        p_reference_id: kit.id,
        p_reason: `Kit consumption: ${kit.name}`,
        p_notes: 'Consumed via Kit Builder',
      });
    }
    alert('Kit consumed. Inventory deducted.');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{kits.length} kits</p>
        {canManage && (
          <button onClick={() => setShowAddKit(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> New Kit
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-2">
            {kits.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400"><FlaskConical className="w-10 h-10 mb-2 opacity-30" /><p className="text-sm font-medium">No kits yet</p></div>
            ) : kits.map(k => (
              <button key={k.id} onClick={() => { setSelected(k); loadItems(k.id); }} className={`w-full text-left p-4 rounded-xl border transition-colors ${selected?.id === k.id ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                <p className="text-sm font-semibold text-slate-800">{k.name}</p>
                {k.description && <p className="text-xs text-slate-500 mt-0.5">{k.description}</p>}
                <p className="text-xs text-slate-400 mt-1">{k.kit_code}</p>
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div><h3 className="text-base font-bold text-slate-800">{selected.name}</h3>{selected.description && <p className="text-sm text-slate-500">{selected.description}</p>}</div>
                  <div className="flex gap-2">
                    {canManage && <button onClick={() => setShowAddItem(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700"><Plus className="w-3.5 h-3.5" /> Add Item</button>}
                    <button onClick={() => consumeKit(selected)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Consume Kit</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">No items in this kit</p> : items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div><p className="text-sm font-semibold text-slate-700">{item.inventory_products?.name}</p><p className="text-xs text-slate-400">{item.inventory_products?.product_code}</p></div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700">{fmtNum(item.quantity)} {item.inventory_products?.unit}</span>
                        {canManage && <button onClick={async () => { await supabase.from('inventory_kit_items').delete().eq('id', item.id); loadItems(selected.id); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-2xl border border-slate-100"><Boxes className="w-10 h-10 mb-2 opacity-30" /><p className="text-sm font-medium">Select a kit to view its contents</p></div>
            )}
          </div>
        </div>
      )}

      {showAddKit && <KitModal onClose={() => setShowAddKit(false)} onSaved={() => { setShowAddKit(false); load(); }} />}
      {showAddItem && selected && <KitItemModal kit={selected} products={products} onClose={() => setShowAddItem(false)} onSaved={() => { setShowAddItem(false); loadItems(selected.id); }} />}
    </div>
  );
}

function KitModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) { setErr('Kit name is required.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('inventory_kits').insert({ name: name.trim(), description: desc.trim() || null, category: category.trim() || null });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">New Medical Kit</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button></div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Kit Name *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NAD Kit, Myers Kit" /></Field>
          <Field label="Category"><input className={inputCls} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. IV Therapy, Recovery" /></Field>
          <Field label="Description"><textarea rows={2} className={inputCls} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Add Kit</button>
        </div>
      </div>
    </div>
  );
}

function KitItemModal({ kit, products, onClose, onSaved }: { kit: InventoryKit; products: InventoryProduct[]; onClose: () => void; onSaved: () => void }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!productId) { setErr('Product is required.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('inventory_kit_items').insert({ kit_id: kit.id, product_id: productId, quantity: Number(quantity) || 1 });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100"><h3 className="text-base font-bold text-slate-800">Add Kit Item</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button></div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Product *"><select className={inputCls} value={productId} onChange={e => setProductId(e.target.value)}><option value="">— Select —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></Field>
          <Field label="Quantity *"><input type="number" step="0.01" className={inputCls} value={quantity} onChange={e => setQuantity(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Add Item</button>
        </div>
      </div>
    </div>
  );
}

// ─── 8. Product Timeline Sub-Tab ──────────────────────────────────────────────

export function TimelineSubTab({ branchFilter }: { branchFilter: string }) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [events, setEvents] = useState<InventoryTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProducts = useCallback(async () => {
    let q = supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name');
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setProducts(data ?? []);
  }, [branchFilter]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const loadTimeline = useCallback(async () => {
    if (!selectedProduct) return;
    setLoading(true);
    const { data } = await supabase.from('inventory_product_timeline').select('*').eq('product_id', selectedProduct).limit(100);
    setEvents(data ?? []);
    setLoading(false);
  }, [selectedProduct]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  function eventIcon(type: string): React.ElementType {
    switch (type) {
      case 'purchase': return ArrowDown;
      case 'consumption': return ArrowUp;
      case 'adjustment': return Activity;
      case 'reserved': return Package;
      case 'consumed': return CheckCircle;
      case 'cost_change': return DollarSign;
      case 'transfer': return ArrowRight;
      case 'return': return ArrowDown;
      default: return Activity;
    }
  }

  function eventColor(type: string): string {
    switch (type) {
      case 'purchase': return 'text-emerald-600 bg-emerald-50';
      case 'consumption': return 'text-red-600 bg-red-50';
      case 'adjustment': return 'text-amber-600 bg-amber-50';
      case 'reserved': return 'text-blue-600 bg-blue-50';
      case 'consumed': return 'text-teal-600 bg-teal-50';
      case 'cost_change': return 'text-purple-600 bg-purple-50';
      default: return 'text-slate-600 bg-slate-50';
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className={inputCls + ' max-w-xs'} value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
          <option value="">— Select Product —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!selectedProduct ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Clock className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">Select a product to view its timeline</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400"><p className="text-sm font-medium">No events recorded</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="space-y-3">
            {events.map((e, i) => {
              const Icon = eventIcon(e.event_type);
              const color = eventColor(e.event_type);
              return (
                <div key={i} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pb-3 border-b border-slate-50 last:border-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700 capitalize">{e.event_type.replace('_', ' ')}</p>
                      <p className="text-xs text-slate-400">{new Date(e.event_date).toLocaleString()}</p>
                    </div>
                    {e.quantity !== null && <p className="text-xs text-slate-500 mt-0.5">Quantity: {fmtNum(e.quantity)}</p>}
                    {e.before_quantity !== null && e.after_quantity !== null && <p className="text-xs text-slate-500">Stock: {fmtNum(e.before_quantity)} → {fmtNum(e.after_quantity)}</p>}
                    {e.reason && <p className="text-xs text-slate-500 mt-0.5">{e.reason}</p>}
                    {e.user_email && <p className="text-xs text-slate-400 mt-0.5">by {e.user_email}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 9. Attachments Sub-Tab ───────────────────────────────────────────────────

export function AttachmentsSubTab({ branchFilter }: { branchFilter: string }) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [attachments, setAttachments] = useState<InventoryAttachment[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<AttachmentCategory>('document');

  const loadProducts = useCallback(async () => {
    let q = supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name');
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const { data } = await q;
    setProducts(data ?? []);
  }, [branchFilter]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const loadAttachments = useCallback(async () => {
    if (!selectedProduct) return;
    setLoading(true);
    const { data } = await supabase.from('inventory_attachments').select('*').eq('product_id', selectedProduct).order('created_at', { ascending: false });
    setAttachments(data ?? []);
    setLoading(false);
  }, [selectedProduct]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  async function uploadFile(file: File) {
    if (!selectedProduct) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `inventory/${selectedProduct}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('inventory-attachments').upload(path, file);
    if (upErr) { alert('Upload failed: ' + upErr.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from('inventory-attachments').getPublicUrl(path);
    const { data: userData } = await supabase.auth.getUser();
    const { data: memberData } = await supabase.from('team_members').select('email').eq('user_id', userData.user?.id ?? '').maybeSingle();

    await supabase.from('inventory_attachments').insert({
      product_id: selectedProduct,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: file.type,
      file_size: file.size,
      category,
      uploaded_by: memberData?.email ?? null,
    });
    setUploading(false);
    loadAttachments();
  }

  async function deleteAttachment(att: InventoryAttachment) {
    if (!confirm(`Delete ${att.file_name}?`)) return;
    await supabase.from('inventory_attachments').delete().eq('id', att.id);
    loadAttachments();
  }

  const CATEGORIES: { value: AttachmentCategory; label: string }[] = [
    { value: 'invoice', label: 'Invoice' }, { value: 'receipt', label: 'Receipt' },
    { value: 'photo', label: 'Photo' }, { value: 'certificate', label: 'Certificate' },
    { value: 'batch_document', label: 'Batch Document' }, { value: 'expiry_certificate', label: 'Expiry Certificate' },
    { value: 'msds', label: 'MSDS' }, { value: 'document', label: 'Document' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className={inputCls + ' max-w-xs'} value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
          <option value="">— Select Product —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProduct && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-3">
            <select className={inputCls + ' max-w-xs'} value={category} onChange={e => setCategory(e.target.value as AttachmentCategory)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <label className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 cursor-pointer">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading...' : 'Upload File'}
              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} disabled={uploading} />
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
          ) : attachments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No attachments yet</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map(a => (
                <div key={a.id} className="border border-slate-100 rounded-xl p-3 hover:border-slate-200 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 capitalize">{a.category.replace('_', ' ')}</span>
                    <button onClick={() => deleteAttachment(a)} className="p-1 rounded text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="block">
                    <p className="text-sm font-medium text-slate-700 truncate hover:text-teal-600">{a.file_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : ''} · {new Date(a.created_at).toLocaleDateString()}</p>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 10. Executive Alerts ────────────────────────────────────────────────────

export function ExecutiveAlerts({ branchFilter }: { branchFilter: string }) {
  const [alerts, setAlerts] = useState<{ type: string; label: string; count: number; severity: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let pq = supabase.from('inventory_products').select('id, name, current_stock, min_stock_level, reorder_point, reserved_stock').eq('is_active', true);
    if (branchFilter !== 'all') pq = pq.eq('branch_id', branchFilter);
    let bq = supabase.from('inventory_batch_summary').select('id, computed_status, inventory_products(name)');
    if (branchFilter !== 'all') bq = bq.eq('branch_id', branchFilter);

    const [prodRes, batchRes] = await Promise.all([pq, bq]);
    const prods = prodRes.data ?? [];
    const batches = batchRes.data ?? [];

    const outOfStock = prods.filter(p => Number(p.current_stock) <= 0).length;
    const critical = prods.filter(p => Number(p.current_stock) > 0 && Number(p.current_stock) <= Number((p as any).min_stock_level)).length;
    const lowStock = prods.filter(p => Number(p.current_stock) > Number((p as any).min_stock_level) && Number(p.current_stock) <= Number((p as any).reorder_point)).length;
    const negativeInv = prods.filter(p => Number(p.current_stock) < 0).length;
    const nearExpiry = batches.filter((b: any) => b.computed_status === 'near_expiry').length;
    const expired = batches.filter((b: any) => b.computed_status === 'expired').length;
    const missingBatch = prods.filter(p => Number(p.current_stock) > 0).length; // simplified

    const a: { type: string; label: string; count: number; severity: string }[] = [];
    if (outOfStock > 0) a.push({ type: 'out_of_stock', label: 'Out of Stock', count: outOfStock, severity: 'critical' });
    if (critical > 0) a.push({ type: 'critical', label: 'Critical Stock', count: critical, severity: 'critical' });
    if (lowStock > 0) a.push({ type: 'low_stock', label: 'Low Stock', count: lowStock, severity: 'warning' });
    if (negativeInv > 0) a.push({ type: 'negative', label: 'Negative Inventory', count: negativeInv, severity: 'critical' });
    if (nearExpiry > 0) a.push({ type: 'near_expiry', label: 'Products Near Expiry', count: nearExpiry, severity: 'warning' });
    if (expired > 0) a.push({ type: 'expired', label: 'Expired Products', count: expired, severity: 'critical' });

    setAlerts(a);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle className="w-5 h-5 text-emerald-600" />
        <p className="text-sm font-semibold text-emerald-700">All clear — no active alerts</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {alerts.map(a => (
        <div key={a.type} className={`p-4 rounded-xl border ${a.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${a.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
            <p className={`text-sm font-bold ${a.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>{a.label}</p>
          </div>
          <p className={`text-2xl font-bold ${a.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>{a.count}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 11. Inventory Workflow Diagram ──────────────────────────────────────────

export function WorkflowDiagram() {
  const steps = [
    { label: 'Purchase', icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: 'Receiving', icon: ArrowDown, color: 'text-teal-600 bg-teal-50' },
    { label: 'Storage', icon: Package, color: 'text-slate-600 bg-slate-100' },
    { label: 'Reservation', icon: PackageOpen, color: 'text-purple-600 bg-purple-50' },
    { label: 'Treatment', icon: Stethoscope, color: 'text-teal-600 bg-teal-50' },
    { label: 'Consumption', icon: ArrowUp, color: 'text-red-600 bg-red-50' },
    { label: 'Reporting', icon: FileText, color: 'text-slate-600 bg-slate-100' },
  ];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-4">Inventory Workflow</h3>
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1 flex-shrink-0">
            <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}><s.icon className="w-5 h-5" /></div>
              <p className="text-xs font-semibold text-slate-600">{s.label}</p>
            </div>
            {i < steps.length - 1 && <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
