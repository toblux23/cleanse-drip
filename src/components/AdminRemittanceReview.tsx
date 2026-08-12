import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle, XCircle, RotateCcw,
  CreditCard, Clock, User, FileText, Eye, ShieldCheck, Receipt,
  Filter, Calendar, Banknote, Building2,
} from 'lucide-react';
import {
  supabase, type NurseCollection, type NurseCollectionAudit,
  type CollectionStatus, COLLECTION_STATUS_CFG, type Branch,
  resolveMemberName, buildMemberLookup, type TeamMember, type MemberLookup,
} from '../lib/supabase';
import { openStorageObject } from '../lib/storageUrls';

interface AdminRemittanceReviewProps {
  userEmail: string;
  userRole: string;
  userUserId: string | null;
}

interface CollectionRow extends NurseCollection {
  clients?: { full_name: string } | null;
  appointments?: { scheduled_date: string; scheduled_time: string; service: string | null } | null;
  branches?: { name: string } | null;
}

export default function AdminRemittanceReview({ userEmail, userRole, userUserId }: AdminRemittanceReviewProps) {
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });
  const [statusFilter, setStatusFilter] = useState<string>('pending_confirmation');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [detailTarget, setDetailTarget] = useState<CollectionRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('nurse_collections')
      .select(`*, clients(full_name), appointments(scheduled_date, scheduled_time, service), branches(name)`)
      .order('collected_at', { ascending: false });

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    if (methodFilter !== 'all') q = q.eq('payment_method', methodFilter);

    const [colRes, branchRes, memberRes] = await Promise.all([
      q,
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('team_members').select('user_id, email, full_name, role'),
    ]);

    if (colRes.error) { setError('Failed to load collections.'); setCollections([]); }
    else setCollections((colRes.data ?? []) as CollectionRow[]);

    if (!branchRes.error) setBranches(branchRes.data ?? []);
    setMemberLookup(buildMemberLookup((memberRes.data ?? []) as TeamMember[]));
    setLoading(false);
  }, [statusFilter, branchFilter, methodFilter]);

  useEffect(() => { load(); }, [load]);

  async function confirmCollection(c: CollectionRow, confirmedAmount: number, receiptNumber: string, confirmationNotes: string) {
    setError(null);
    const isSponsored = c.payment_method === 'sponsored';
    if (!isSponsored && confirmedAmount <= 0) { setError('Confirmed amount must be greater than zero.'); return; }
    if (isSponsored && confirmedAmount < 0) { setError('Confirmed amount cannot be negative.'); return; }
    if (!userUserId) { setError('Unable to identify your account.'); return; }

    // Idempotency: check if already confirmed
    if (c.status === 'confirmed') { setError('This collection is already confirmed.'); return; }
    if (c.official_payment_id) { setError('Official payment already exists for this collection.'); return; }

    // Fetch or create order for this appointment
    let orderId: string | null = null;
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('appointment_id', c.appointment_id)
      .maybeSingle();

    if (existingOrder) {
      orderId = existingOrder.id;
    } else if (c.appointment_id) {
      const { data: newOrder, error: orderErr } = await supabase
        .from('orders')
        .insert({
          client_id: c.client_id!,
          appointment_id: c.appointment_id,
          total_amount: c.amount_due,
          status: 'paid',
          created_by: userUserId,
        })
        .select('id')
        .single();
      if (!orderErr && newOrder) orderId = newOrder.id;
    }

    // Create official payment record
    const { data: payment, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        order_id: orderId ?? '00000000-0000-0000-0000-000000000000',
        client_id: c.client_id!,
        amount: confirmedAmount,
        method: isSponsored ? 'sponsored' : (c.payment_method === 'wire' ? 'bank' : c.payment_method === 'check' ? 'other' : 'cash'),
        reference: c.reference_number ?? c.check_number ?? c.remittance_reference ?? null,
        paid_at: new Date().toISOString(),
        recorded_by: userUserId,
        appointment_id: c.appointment_id,
      })
      .select('id')
      .single();

    if (paymentErr || !payment) { setError('Failed to create official payment record.'); return; }

    // Create finance transaction (income)
    const { data: finTxn, error: finErr } = await supabase
      .from('finance_transactions')
      .insert({
        type: 'income',
        amount: confirmedAmount,
        category: isSponsored ? 'Sponsored Treatment' : 'Service Revenue',
        description: isSponsored ? `Sponsored treatment — ${c.collection_number}` : `Confirmed nurse collection ${c.collection_number}`,
        reference: receiptNumber || c.collection_number,
        appointment_id: c.appointment_id,
        created_by: userUserId,
        created_by_email: userEmail,
      })
      .select('id')
      .single();

    // Update collection to confirmed
    const { error: updateErr } = await supabase
      .from('nurse_collections')
      .update({
        status: 'confirmed',
        confirmed_by: userUserId,
        confirmed_by_email: userEmail,
        confirmed_at: new Date().toISOString(),
        confirmed_amount: confirmedAmount,
        receipt_number: receiptNumber.trim() || null,
        confirmation_notes: confirmationNotes.trim() || null,
        official_payment_id: payment.id,
        official_finance_txn_id: finErr ? null : finTxn?.id ?? null,
      })
      .eq('id', c.id)
      .neq('status', 'confirmed'); // idempotency guard: only update if not already confirmed

    if (updateErr) { setError('Failed to confirm collection. It may have already been confirmed.'); return; }

    // Audit trail
    await supabase.from('nurse_collection_audit').insert({
      collection_id: c.id,
      action: 'remittance_confirmed',
      performed_by: userUserId,
      performed_by_email: userEmail,
      role: userRole,
      previous_status: c.status,
      new_status: 'confirmed',
      amount: confirmedAmount,
      payment_method: c.payment_method,
      reference_number: receiptNumber.trim() || null,
    });

    await supabase.from('nurse_collection_audit').insert({
      collection_id: c.id,
      action: 'official_payment_created',
      performed_by: userUserId,
      performed_by_email: userEmail,
      role: userRole,
      previous_status: c.status,
      new_status: 'confirmed',
      amount: confirmedAmount,
      payment_method: c.payment_method,
      new_value: { payment_id: payment.id, finance_txn_id: finTxn?.id ?? null } as any,
    });

    // Update appointment payment status
    if (c.appointment_id) {
      await supabase.from('appointments').update({
        payment_status: 'paid',
        payment_amount: confirmedAmount,
        payment_method: c.payment_method,
        payment_recorded_at: new Date().toISOString(),
      }).eq('id', c.appointment_id);
    }

    setSuccessMsg(isSponsored
      ? `Sponsored collection ${c.collection_number} confirmed. Sponsored Value recorded.`
      : `Collection ${c.collection_number} confirmed. Official payment recorded.`);
    setTimeout(() => setSuccessMsg(null), 5000);
    setDetailTarget(null);
    load();
  }

  async function rejectCollection(c: CollectionRow, reason: string, action: 'rejected' | 'returned') {
    if (!reason.trim()) { setError('A reason is required for rejection or return.'); return; }
    if (!userUserId) { setError('Unable to identify your account.'); return; }

    const { error: updateErr } = await supabase
      .from('nurse_collections')
      .update({
        status: action,
        rejection_reason: reason.trim(),
      })
      .eq('id', c.id)
      .in('status', ['pending_confirmation', 'collected_by_nurse']);

    if (updateErr) { setError('Failed to update collection.'); return; }

    await supabase.from('nurse_collection_audit').insert({
      collection_id: c.id,
      action: action === 'rejected' ? 'remittance_rejected' : 'remittance_returned',
      performed_by: userUserId,
      performed_by_email: userEmail,
      role: userRole,
      previous_status: c.status,
      new_status: action,
      reason: reason.trim(),
    });

    setSuccessMsg(`Collection ${c.collection_number} ${action === 'rejected' ? 'rejected' : 'returned for correction'}.`);
    setTimeout(() => setSuccessMsg(null), 5000);
    setDetailTarget(null);
    load();
  }

  if (detailTarget) {
    return (
      <RemittanceDetail
        collection={detailTarget}
        memberLookup={memberLookup}
        userEmail={userEmail}
        userRole={userRole}
        onBack={() => setDetailTarget(null)}
        onConfirm={confirmCollection}
        onReject={rejectCollection}
        successMsg={successMsg}
        error={error}
        setError={setError}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Remittance Review</h2>
            <p className="text-xs text-slate-400">Confirm or reject nurse remittances</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {successMsg && <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4"><CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /><p className="text-sm text-emerald-700 font-medium">{successMsg}</p></div>}
      {error && <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-5 py-4"><AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-sm text-red-700 font-medium">{error}</p></div>}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
            <option value="all">All Statuses</option>
            <option value="pending_confirmation">Pending Confirmation</option>
            <option value="collected_by_nurse">Awaiting Remittance</option>
            <option value="confirmed">Confirmed</option>
            <option value="rejected">Rejected</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="all">All Payment Methods</option>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="wire">Wire / Bank Transfer</option>
          <option value="sponsored">Sponsored</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center"><CheckCircle className="w-10 h-10 text-slate-300 mb-3" /><p className="text-sm font-semibold text-slate-400">No collections found for this filter.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Collection #', 'Client', 'Appointment', 'Amount', 'Method', 'Collected By', 'Date Collected', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {collections.map(c => {
                  const cfg = COLLECTION_STATUS_CFG[c.status] ?? COLLECTION_STATUS_CFG.collected_by_nurse;
                  const ageHrs = Math.floor((Date.now() - new Date(c.collected_at).getTime()) / 3600000);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">{c.collection_number}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{c.clients?.full_name ?? c.payer_name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{c.appointments ? `${c.appointments.scheduled_date} ${c.appointments.scheduled_time}` : '—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-700">₱{c.amount_received.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">{c.payment_method === 'sponsored' ? <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold text-teal-700 bg-teal-50 border-teal-200">Sponsored</span> : c.payment_method}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{resolveMemberName(c.collected_by_email, memberLookup)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(c.collected_at).toLocaleDateString()} <span className="text-slate-400">({ageHrs}h ago)</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.color} ${cfg.bg}`}>{cfg.label}</span></td>
                      <td className="px-4 py-3"><button onClick={() => setDetailTarget(c)} className="flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700"><Eye className="w-3.5 h-3.5" /> Review</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Remittance Detail ─────────────────────────────────────────────────────────

function RemittanceDetail({
  collection, memberLookup, userEmail, userRole, onBack, onConfirm, onReject, successMsg, error, setError,
}: {
  collection: CollectionRow;
  memberLookup: MemberLookup;
  userEmail: string;
  userRole: string;
  onBack: () => void;
  onConfirm: (c: CollectionRow, amount: number, receipt: string, notes: string) => void;
  onReject: (c: CollectionRow, reason: string, action: 'rejected' | 'returned') => void;
  successMsg: string | null;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [auditTrail, setAuditTrail] = useState<NurseCollectionAudit[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [confirmAmount, setConfirmAmount] = useState(String(collection.amount_received));
  const [receiptNumber, setReceiptNumber] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    supabase
      .from('nurse_collection_audit')
      .select('*')
      .eq('collection_id', collection.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setAuditTrail((data ?? []) as NurseCollectionAudit[]); setLoadingAudit(false); });
  }, [collection.id]);

  const cfg = COLLECTION_STATUS_CFG[collection.status] ?? COLLECTION_STATUS_CFG.collected_by_nurse;
  const canConfirm = collection.status === 'pending_confirmation';
  const canReject = collection.status === 'pending_confirmation' || collection.status === 'collected_by_nurse';

  return (
    <div className="bg-slate-50 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 lg:-mt-8 min-h-[calc(100vh-64px)]">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium">
          <RefreshCw className="w-4 h-4" /> Back to Review
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800 truncate">{collection.collection_number}</h2>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${cfg.color} ${cfg.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px]">
        {/* Left: Details */}
        <div className="bg-white border-r border-slate-200 p-4 sm:p-6 lg:p-8 space-y-6">
          {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-sm text-red-700 font-medium">{error}</p></div>}
          {successMsg && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"><CheckCircle className="w-4 h-4 text-emerald-500" /><p className="text-sm text-emerald-700 font-medium">{successMsg}</p></div>}

          {/* Collection Info */}
          <DetailSection title="Collection Details">
            <div className="grid grid-cols-2 gap-4">
              <DetailItem icon={User} label="Client" value={collection.clients?.full_name ?? collection.payer_name ?? '—'} />
              <DetailItem icon={Calendar} label="Appointment" value={collection.appointments ? `${collection.appointments.scheduled_date} ${collection.appointments.scheduled_time}` : '—'} />
              <DetailItem icon={CreditCard} label="Amount Received" value={`₱${collection.amount_received.toLocaleString()}`} />
              <DetailItem icon={Banknote} label="Payment Method" value={collection.payment_method} />
              {collection.reference_number && <DetailItem icon={FileText} label="Reference Number" value={collection.reference_number} />}
              {collection.check_number && <DetailItem icon={FileText} label="Check Number" value={collection.check_number} />}
              <DetailItem icon={User} label="Collected By" value={resolveMemberName(collection.collected_by_email, memberLookup)} />
              <DetailItem icon={Clock} label="Collected At" value={new Date(collection.collected_at).toLocaleString()} />
              {collection.branches && <DetailItem icon={Building2} label="Branch" value={collection.branches.name} />}
            </div>
            {collection.notes && <p className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100"><strong>Notes:</strong> {collection.notes}</p>}
          </DetailSection>

          {/* Remittance Info */}
          {collection.remittance_method && (
            <DetailSection title="Remittance Details">
              <div className="grid grid-cols-2 gap-4">
                <DetailItem icon={CreditCard} label="Remittance Method" value={collection.remittance_method.replace(/_/g, ' ')} />
                <DetailItem icon={CreditCard} label="Remittance Amount" value={`₱${(collection.remittance_amount ?? 0).toLocaleString()}`} />
                {collection.remittance_reference && <DetailItem icon={FileText} label="Remittance Reference" value={collection.remittance_reference} />}
                {collection.remitted_at && <DetailItem icon={Clock} label="Remitted At" value={new Date(collection.remitted_at).toLocaleString()} />}
              </div>
              {collection.remittance_notes && <p className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100"><strong>Nurse Notes:</strong> {collection.remittance_notes}</p>}
              {collection.remittance_proof_url && (
                <button
                  type="button"
                  onClick={() => openStorageObject('payment-receipts', collection.remittance_proof_url)}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-teal-600 hover:text-teal-700"
                >
                  <Eye className="w-3.5 h-3.5" /> View Proof of Remittance
                </button>
              )}
            </DetailSection>
          )}

          {/* Confirmation Info */}
          {collection.status === 'confirmed' && (
            <DetailSection title="Confirmation Details">
              <div className="grid grid-cols-2 gap-4">
                <DetailItem icon={ShieldCheck} label="Confirmed By" value={resolveMemberName(collection.confirmed_by_email ?? '', memberLookup)} />
                <DetailItem icon={Clock} label="Confirmed At" value={collection.confirmed_at ? new Date(collection.confirmed_at).toLocaleString() : '—'} />
                <DetailItem icon={CreditCard} label="Confirmed Amount" value={`₱${(collection.confirmed_amount ?? 0).toLocaleString()}`} />
                {collection.receipt_number && <DetailItem icon={Receipt} label="Receipt Number" value={collection.receipt_number} />}
              </div>
              {collection.confirmation_notes && <p className="text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100"><strong>Finance Notes:</strong> {collection.confirmation_notes}</p>}
            </DetailSection>
          )}

          {/* Rejection Info */}
          {(collection.status === 'rejected' || collection.status === 'returned') && collection.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-bold uppercase text-red-600 mb-1">{collection.status === 'rejected' ? 'Rejected' : 'Returned for Correction'}</p>
              <p className="text-sm text-red-700">{collection.rejection_reason}</p>
            </div>
          )}

          {/* Audit Trail */}
          <DetailSection title="Audit History">
            {loadingAudit ? (
              <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading audit trail...</div>
            ) : auditTrail.length === 0 ? (
              <p className="text-sm text-slate-400">No audit records.</p>
            ) : (
              <div className="space-y-3">
                {auditTrail.map(a => (
                  <div key={a.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${a.action.includes('confirmed') ? 'bg-emerald-500' : a.action.includes('reject') || a.action.includes('return') ? 'bg-red-500' : 'bg-teal-500'}`}>
                        {a.action.includes('confirmed') ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : a.action.includes('reject') || a.action.includes('return') ? <XCircle className="w-3.5 h-3.5 text-white" /> : <Clock className="w-3 h-3 text-white" />}
                      </div>
                      {auditTrail.indexOf(a) < auditTrail.length - 1 && <div className="w-0.5 h-6 bg-slate-200" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-bold text-slate-700 capitalize">{a.action.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-400">{a.performed_by_email ? resolveMemberName(a.performed_by_email, memberLookup) : 'System'} · {a.role ?? '—'} · {new Date(a.created_at).toLocaleString()}</p>
                      {a.amount != null && <p className="text-xs text-slate-500">Amount: ₱{a.amount.toLocaleString()}</p>}
                      {a.reason && <p className="text-xs text-red-600 mt-0.5">Reason: {a.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </div>

        {/* Right: Actions */}
        <div className="bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Review Actions</p>

          {canConfirm && (
            <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
              <p className="text-sm font-bold text-slate-700">Confirm Remittance</p>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Confirmed Amount (₱)</label>
                <input type="number" step="0.01" value={confirmAmount} onChange={e => setConfirmAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Receipt Number (optional)</label>
                <input type="text" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="e.g. R-00001" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Finance Notes (optional)</label>
                <textarea value={confirmNotes} onChange={e => setConfirmNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none" />
              </div>
              <button onClick={() => onConfirm(collection, parseFloat(confirmAmount), receiptNumber, confirmNotes)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors">
                <CheckCircle className="w-4 h-4" /> Confirm Remittance
              </button>
            </div>
          )}

          {canReject && !showReject && (
            <button onClick={() => setShowReject(true)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-red-600 border-2 border-red-200 hover:bg-red-50 rounded-xl transition-colors">
              <XCircle className="w-4 h-4" /> Reject or Return
            </button>
          )}

          {showReject && (
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-3">
              <p className="text-sm font-bold text-red-700">Reject / Return</p>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Reason <span className="text-red-500">*</span></label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" placeholder="Explain why this is being rejected or returned..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => onReject(collection, rejectReason, 'returned')} disabled={!rejectReason.trim()} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-orange-600 border border-orange-200 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50">
                  <RotateCcw className="w-3.5 h-3.5" /> Return for Correction
                </button>
                <button onClick={() => onReject(collection, rejectReason, 'rejected')} disabled={!rejectReason.trim()} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
              <button onClick={() => { setShowReject(false); setRejectReason(''); }} className="w-full text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          )}

          {!canConfirm && !canReject && (
            <div className="bg-slate-100 rounded-xl p-4 text-center">
              <p className="text-sm text-slate-500">No actions available for this status.</p>
            </div>
          )}

          {/* Proof attachment */}
          {collection.proof_url && (
            <button
              type="button"
              onClick={() => openStorageObject('payment-receipts', collection.proof_url)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors"
            >
              <Eye className="w-4 h-4" /> View Proof of Payment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{title}</p><div className="bg-slate-50 rounded-2xl p-5">{children}</div></div>;
}

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div><p className="text-xs text-slate-400 font-medium mb-0.5 flex items-center gap-1.5"><Icon className="w-3 h-3" /> {label}</p><p className="text-sm text-slate-800 font-semibold capitalize">{value}</p></div>;
}
