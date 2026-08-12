import { useState, useEffect } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle, CreditCard, Building2, Banknote,
  Receipt, Upload, FileText, ArrowRight, ShieldCheck, Gift,
} from 'lucide-react';
import {
  supabase, type NurseCollection, type CollectionPaymentMethod,
  type RemittanceMethod, type CollectionStatus, COLLECTION_STATUS_CFG,
} from '../lib/supabase';

// ─── Record Payment Modal ────────────────────────────────────────────────────

interface AppointmentInfo {
  id: string | null;
  client_id: string | null;
  client_name: string;
  service: string | null;
  branch_id: string | null;
  scheduled_date: string;
  scheduled_time: string;
  amount_due: number;
}

export function RecordPaymentModal({
  appointment,
  nurseEmail,
  nurseUserId,
  onClose,
  onSaved,
}: {
  appointment: AppointmentInfo;
  nurseEmail: string;
  nurseUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amountReceived, setAmountReceived] = useState(appointment.amount_due > 0 ? String(appointment.amount_due) : '');
  const [paymentMethod, setPaymentMethod] = useState<CollectionPaymentMethod>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [payerName, setPayerName] = useState(appointment.client_name);
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingBalance = appointment.amount_due;

  async function uploadProof(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `payment-proofs/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) return null;
    // Store the object path, not a public URL: the bucket is private and reads
    // mint a short-lived signed URL instead (see lib/storageUrls.ts).
    return fileName;
  }

  async function handleSave() {
    setError(null);
    const amt = parseFloat(amountReceived);
    const isSponsored = paymentMethod === 'sponsored';
    if (!isSponsored && (isNaN(amt) || amt <= 0)) { setError('Amount received must be greater than zero.'); return; }
    if (!isSponsored && remainingBalance > 0 && amt > remainingBalance) {
      setError(`Amount received (₱${amt.toLocaleString()}) exceeds the remaining balance (₱${remainingBalance.toLocaleString()}).`); return;
    }
    if (paymentMethod === 'check' && !checkNumber.trim()) { setError('Check number is required for check payments.'); return; }
    if (paymentMethod === 'wire' && !referenceNumber.trim()) { setError('Reference number is required for wire/bank transfer.'); return; }
    if (!nurseUserId) { setError('Unable to identify your account. Please sign in again.'); return; }

    setSaving(true);

    let proofUrl: string | null = null;
    if (proofFile) {
      proofUrl = await uploadProof(proofFile);
      if (!proofUrl) { setError('Failed to upload proof of payment. Please try again.'); setSaving(false); return; }
    }

    // Generate collection number via RPC
    const { data: colNum } = await supabase.rpc('generate_collection_number');

    const now = new Date().toISOString();

    const insertPayload = {
      collection_number: colNum ?? `NC-${Date.now()}`,
      appointment_id: appointment.id || null,
      client_id: appointment.client_id,
      branch_id: appointment.branch_id,
      service: appointment.service,
      amount_due: isSponsored ? 0 : appointment.amount_due,
      amount_received: isSponsored ? 0 : amt,
      payment_method: paymentMethod,
      reference_number: paymentMethod === 'wire' ? referenceNumber.trim() : (referenceNumber.trim() || null),
      check_number: paymentMethod === 'check' ? checkNumber.trim() : null,
      payer_name: payerName.trim(),
      collected_by: nurseUserId,
      collected_by_email: nurseEmail,
      collected_at: now,
      notes: notes.trim() || null,
      proof_url: proofUrl,
      status: 'collected_by_nurse' as CollectionStatus,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('nurse_collections')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertErr || !inserted) {
      setError('Failed to record payment collection.'); setSaving(false); return;
    }

    // Audit trail
    await supabase.from('nurse_collection_audit').insert({
      collection_id: inserted.id,
      action: 'recorded',
      performed_by: nurseUserId,
      performed_by_email: nurseEmail,
      role: 'nurse',
      previous_status: null,
      new_status: 'collected_by_nurse',
      new_value: insertPayload as any,
      amount: amt,
      payment_method: paymentMethod,
      reference_number: referenceNumber.trim() || checkNumber.trim() || null,
    });

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">Record Client Payment</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Appointment summary */}
          <div className="bg-slate-50 rounded-xl p-3 space-y-1">
            <p className="text-sm font-bold text-slate-700">{appointment.client_name}</p>
            <p className="text-xs text-slate-400">{appointment.service} · {appointment.scheduled_date} at {appointment.scheduled_time}</p>
            {appointment.amount_due > 0 && (
              <p className="text-xs font-semibold text-slate-500">Amount Due: ₱{appointment.amount_due.toLocaleString()}</p>
            )}
          </div>

          {/* Amount received */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Amount Received (₱) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="0.00" disabled={paymentMethod === 'sponsored'} />
            {paymentMethod === 'sponsored' ? (
              <p className="text-xs text-slate-400 mt-1">Sponsored treatments are recorded at ₱0.00. The service value is tracked separately in financial reports.</p>
            ) : remainingBalance > 0 ? (
              <p className="text-xs text-slate-400 mt-1">Remaining balance: ₱{remainingBalance.toLocaleString()}</p>
            ) : null}
          </div>

          {/* Payment method */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Payment Method <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'cash', label: 'Cash', icon: Banknote },
                { key: 'check', label: 'Check', icon: FileText },
                { key: 'wire', label: 'Wire / Bank Transfer', icon: Building2 },
                { key: 'sponsored', label: 'Sponsored', icon: Gift },
              ] as { key: CollectionPaymentMethod; label: string; icon: React.ElementType }[]).map(m => (
                <button key={m.key} onClick={() => setPaymentMethod(m.key)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${paymentMethod === m.key ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                  <m.icon className="w-5 h-5" />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Check number */}
          {paymentMethod === 'check' && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Check Number <span className="text-red-500">*</span></label>
              <input type="text" value={checkNumber} onChange={e => setCheckNumber(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="Enter check number" />
            </div>
          )}

          {/* Reference number for wire */}
          {paymentMethod === 'wire' && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Bank / Transfer Reference Number <span className="text-red-500">*</span></label>
              <input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                placeholder="Enter reference number" />
            </div>
          )}

          {/* Payer name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Payer Name</label>
            <input type="text" value={payerName} onChange={e => setPayerName(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              placeholder="Payer name" />
          </div>

          {/* Received by (locked) */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Received By</label>
            <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 font-medium flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" /> {nurseEmail} <span className="text-xs text-slate-400 ml-auto">(locked)</span>
            </div>
          </div>

          {/* Proof of payment */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Proof of Payment (optional)</label>
            <input type="file" accept="image/*,application/pdf" onChange={e => setProofFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:font-semibold hover:file:bg-teal-100" />
            {proofFile && <p className="text-xs text-slate-400 mt-1">Selected: {proofFile.name}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              placeholder="Optional notes..." />
          </div>

          {paymentMethod === 'sponsored' ? (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-xs text-teal-700 font-medium leading-relaxed">
                <strong>Sponsored treatment.</strong> No cash collection is required. The service value will be tracked as Sponsored Value in financial reports, separate from cash revenue. This will still appear in remittance review, clearly labeled as Sponsored, contributing ₱0.00 to nurse remittance.
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-700 font-medium leading-relaxed">
                This payment will be held under your accountability as <strong>Collected by Nurse — Awaiting Remittance</strong>.
                It will not be treated as company revenue until an administrator confirms your remittance.
              </p>
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Submit Remittance Modal ──────────────────────────────────────────────────

export function SubmitRemittanceModal({
  collection,
  nurseEmail,
  nurseUserId,
  onClose,
  onSaved,
}: {
  collection: NurseCollection;
  nurseEmail: string;
  nurseUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [remittanceMethod, setRemittanceMethod] = useState<RemittanceMethod>('cash_turnover');
  const [remittanceAmount, setRemittanceAmount] = useState(String(collection.amount_received));
  const [remittanceReference, setRemittanceReference] = useState('');
  const [remittanceNotes, setRemittanceNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadProof(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `remittance-proofs/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('payment-receipts')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) return null;
    // Path, not public URL — see lib/storageUrls.ts.
    return fileName;
  }

  async function handleSubmit() {
    setError(null);
    const amt = parseFloat(remittanceAmount);
    const isSponsored = collection.payment_method === 'sponsored';
    if (isNaN(amt) || (isSponsored ? amt < 0 : amt <= 0)) { setError(isSponsored ? 'Amount cannot be negative.' : 'Remittance amount must be greater than zero.'); return; }
    if (amt !== collection.amount_received) {
      setError(`Remittance amount (₱${amt.toLocaleString()}) must match the collected amount (₱${collection.amount_received.toLocaleString()}).`); return;
    }
    if (!isSponsored && (remittanceMethod === 'bank_deposit' || remittanceMethod === 'bank_transfer') && !remittanceReference.trim()) {
      setError('Bank/deposit reference is required for bank deposit or bank transfer.'); return;
    }

    setSaving(true);

    let proofUrl: string | null = null;
    if (proofFile) {
      proofUrl = await uploadProof(proofFile);
      if (!proofUrl) { setError('Failed to upload proof of remittance.'); setSaving(false); return; }
    }

    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('nurse_collections')
      .update({
        status: 'pending_confirmation',
        remittance_method: remittanceMethod,
        remittance_amount: amt,
        remittance_reference: remittanceReference.trim() || null,
        remittance_proof_url: proofUrl,
        remittance_notes: remittanceNotes.trim() || null,
        remitted_at: now,
      })
      .eq('id', collection.id)
      .eq('status', 'collected_by_nurse');

    if (updateErr) { setError('Failed to submit remittance.'); setSaving(false); return; }

    // Audit trail
    await supabase.from('nurse_collection_audit').insert({
      collection_id: collection.id,
      action: 'remittance_submitted',
      performed_by: nurseUserId,
      performed_by_email: nurseEmail,
      role: 'nurse',
      previous_status: 'collected_by_nurse',
      new_status: 'pending_confirmation',
      amount: amt,
      payment_method: remittanceMethod,
      reference_number: remittanceReference.trim() || null,
    });

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">Submit Remittance</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Collection summary */}
          <div className="bg-slate-50 rounded-xl p-3 space-y-1">
            <p className="text-sm font-bold text-slate-700">{collection.collection_number}</p>
            <p className="text-xs text-slate-400">Collected: ₱{collection.amount_received.toLocaleString()} via {PAYMENT_METHOD_LABELS[collection.payment_method] ?? collection.payment_method}</p>
            <p className="text-xs text-slate-400">Collected at: {new Date(collection.collected_at).toLocaleString()}</p>
          </div>

          {collection.payment_method === 'sponsored' ? (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
              <p className="text-xs text-teal-700 font-medium leading-relaxed">
                <strong>Sponsored treatment.</strong> No cash remittance is required. Submitting will route this to admin review for confirmation. The service value will be tracked as Sponsored Value in financial reports, contributing ₱0.00 to nurse remittance.
              </p>
            </div>
          ) : (
            <>
              {/* Remittance method */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">Remittance Method <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'cash_turnover', label: 'Cash Turnover' },
                    { key: 'bank_deposit', label: 'Bank Deposit' },
                    { key: 'bank_transfer', label: 'Bank Transfer' },
                    { key: 'check_turnover', label: 'Check Turnover' },
                  ] as { key: RemittanceMethod; label: string }[]).map(m => (
                    <button key={m.key} onClick={() => setRemittanceMethod(m.key)}
                      className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${remittanceMethod === m.key ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Remittance amount */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Amount Being Remitted (₱) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" value={remittanceAmount} onChange={e => setRemittanceAmount(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                <p className="text-xs text-slate-400 mt-1">Must match collected amount: ₱{collection.amount_received.toLocaleString()}</p>
              </div>

              {/* Reference for bank methods */}
              {(remittanceMethod === 'bank_deposit' || remittanceMethod === 'bank_transfer') && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Bank / Deposit Reference <span className="text-red-500">*</span></label>
                  <input type="text" value={remittanceReference} onChange={e => setRemittanceReference(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="Enter reference number" />
                </div>
              )}

              {/* Proof of deposit */}
              {(remittanceMethod === 'bank_deposit' || remittanceMethod === 'bank_transfer') && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Proof of Deposit / Transfer</label>
                  <input type="file" accept="image/*,application/pdf" onChange={e => setProofFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:font-semibold hover:file:bg-teal-100" />
                  {proofFile && <p className="text-xs text-slate-400 mt-1">Selected: {proofFile.name}</p>}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                  After submission, the status becomes <strong>Remitted — Awaiting Confirmation</strong>.
                  An authorized administrator must confirm before this becomes an official financial record.
                </p>
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Nurse Notes</label>
            <textarea value={remittanceNotes} onChange={e => setRemittanceNotes(e.target.value)} rows={2}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              placeholder="Optional notes for the reviewer..." />
          </div>

          <button onClick={handleSubmit} disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {saving ? 'Submitting...' : 'Submit Remittance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment & Remittance Card ────────────────────────────────────────────────

const SHORT_STATUS_LABELS: Record<CollectionStatus, string> = {
  collected_by_nurse: 'Awaiting Remittance',
  for_remittance: 'Awaiting Remittance',
  pending_confirmation: 'Pending Confirmation',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  returned: 'Needs Correction',
  cancelled: 'Cancelled',
};

const PAYMENT_METHOD_LABELS: Record<CollectionPaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  wire: 'Wire / Bank Transfer',
  sponsored: 'Sponsored',
};

const REMITTANCE_METHOD_LABELS: Record<RemittanceMethod, string> = {
  cash_turnover: 'Cash Turnover',
  bank_deposit: 'Bank Deposit',
  bank_transfer: 'Bank Transfer',
  check_turnover: 'Check Turnover',
};

function MetaItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xs font-semibold text-slate-600 break-words">{value}</p>
    </div>
  );
}

export function PaymentRemittanceCard({
  collections,
  loadingCollections,
  onRecordPayment,
  onSubmitRemittance,
}: {
  collections: NurseCollection[];
  loadingCollections: boolean;
  onRecordPayment: () => void;
  onSubmitRemittance: (c: NurseCollection) => void;
}) {
  const totalCollected = collections.reduce((s, c) => s + c.amount_received, 0);
  const totalConfirmed = collections.filter(c => c.status === 'confirmed').reduce((s, c) => s + (c.confirmed_amount ?? c.amount_received), 0);
  const totalAwaiting = collections.filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance').reduce((s, c) => s + c.amount_received, 0);
  const totalPendingConf = collections.filter(c => c.status === 'pending_confirmation').reduce((s, c) => s + c.amount_received, 0);

  const summaryCards = [
    { label: 'Total Collected', value: totalCollected, bg: 'bg-slate-50', labelColor: 'text-slate-500', valueColor: 'text-slate-800' },
    { label: 'Confirmed', value: totalConfirmed, bg: 'bg-emerald-50', labelColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
    { label: 'Awaiting Remittance', value: totalAwaiting, bg: 'bg-amber-50', labelColor: 'text-amber-600', valueColor: 'text-amber-700' },
    { label: 'Pending Confirmation', value: totalPendingConf, bg: 'bg-blue-50', labelColor: 'text-blue-600', valueColor: 'text-blue-700' },
  ];

  return (
    <div className="mt-6 pt-6 border-t border-slate-200">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-slate-800">Payment & Remittance</h3>
        <p className="text-xs text-slate-400 mt-0.5">Track client collections, nurse-held funds, and remittance confirmation.</p>
      </div>

      {loadingCollections ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading payment records...
        </div>
      ) : collections.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
          <p className="text-sm text-slate-400 mb-4">No client payments have been recorded for this appointment.</p>
          <button onClick={onRecordPayment} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors">
            <CreditCard className="w-4 h-4" /> Record Client Payment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {summaryCards.map(card => (
              <div key={card.label} className={`rounded-2xl p-4 ${card.bg}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${card.labelColor}`}>{card.label}</p>
                <p className={`text-2xl font-bold mt-1 tabular-nums whitespace-nowrap ${card.valueColor}`}>
                  ₱{card.value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Collection records */}
          <div className="space-y-3">
            {collections.map(c => {
              const cfg = COLLECTION_STATUS_CFG[c.status] ?? COLLECTION_STATUS_CFG.collected_by_nurse;
              const shortLabel = SHORT_STATUS_LABELS[c.status] ?? cfg.label;
              const collectedDate = new Date(c.collected_at);
              const remittedDate = c.remitted_at ? new Date(c.remitted_at) : null;
              const refNum = c.payment_method === 'check' ? c.check_number : c.reference_number;
              return (
                <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  {/* Top row: amount + status badge */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{c.collection_number}</p>
                      <p className="text-2xl font-bold text-slate-800 tabular-nums whitespace-nowrap mt-0.5">
                        ₱{c.amount_received.toLocaleString()}
                      </p>
                    </div>
                    <span
                      title={cfg.label}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap flex-shrink-0 ${cfg.color} ${cfg.bg}`}
                    >
                      {shortLabel}
                    </span>
                  </div>

                  {/* Metadata grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 mb-4">
                    <MetaItem label="Payment Method" value={PAYMENT_METHOD_LABELS[c.payment_method] ?? c.payment_method} />
                    <MetaItem label="Date Collected" value={collectedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                    <MetaItem label="Collected By" value={c.collected_by_email} />
                    <MetaItem label="Reference Number" value={refNum} />
                    {c.remittance_method && (
                      <MetaItem label="Remittance Method" value={REMITTANCE_METHOD_LABELS[c.remittance_method] ?? c.remittance_method} />
                    )}
                    {remittedDate && (
                      <MetaItem label="Date Remitted" value={remittedDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-100">
                    {c.status === 'collected_by_nurse' && (
                      <button
                        onClick={() => onSubmitRemittance(c)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors w-full sm:w-auto"
                      >
                        <ArrowRight className="w-4 h-4" /> Submit Remittance
                      </button>
                    )}
                    {c.status === 'confirmed' && c.receipt_number && (
                      <button
                        className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors w-full sm:w-auto"
                      >
                        <Receipt className="w-4 h-4" /> View Receipt
                      </button>
                    )}
                    {(c.status === 'confirmed' || c.status === 'pending_confirmation' || c.status === 'rejected' || c.status === 'returned') && (
                      <button
                        className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors w-full sm:w-auto"
                      >
                        <FileText className="w-4 h-4" /> View Details
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Record payment button */}
          <button
            onClick={onRecordPayment}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
          >
            <CreditCard className="w-4 h-4" /> Record Client Payment
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Feedback Status Badge ────────────────────────────────────────────────────

export type FeedbackStatus = 'not_sent' | 'sent' | 'opened' | 'completed';

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const cfg: Record<FeedbackStatus, { label: string; color: string; bg: string }> = {
    not_sent: { label: 'Not Sent', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' },
    sent: { label: 'Sent', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    opened: { label: 'Opened', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    completed: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  };
  const c = cfg[status];
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${c.color} ${c.bg}`}>{c.label}</span>;
}
