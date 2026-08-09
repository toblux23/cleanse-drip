import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  X,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle,
  Trash2,
  Lock,
  CreditCard,
  Wallet,
  Users,
  ChevronDown,
  ChevronRight,
  User,
  Layers,
  ArrowDownCircle,
  Receipt,
  ShieldAlert,
} from 'lucide-react';
import {
  supabase,
  type ServicePackage,
  type Order,
  type OrderStatus,
  type PaymentMethod,
} from '../lib/supabase';

// ─── Extended types ───────────────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
}

interface OrderRow extends Order {
  clients: { id: string; full_name: string; email: string | null; phone: string | null } | null;
  packages: { id: string; name: string; price: number } | null;
  payments: PaymentRow[];
  paid_total: number;
  outstanding: number;
}

interface ClientAR {
  client_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  total_billed: number;
  total_paid: number;
  outstanding: number;
  orders: OrderRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildOrderRow(raw: Record<string, unknown>): OrderRow {
  const pmts = ((raw.payments as PaymentRow[]) ?? []);
  const paid = pmts.reduce((s, p) => s + Number(p.amount), 0);
  return {
    ...(raw as unknown as Order),
    clients: raw.clients as OrderRow['clients'],
    packages: raw.packages as OrderRow['packages'],
    payments: pmts,
    paid_total: paid,
    outstanding: Number(raw.total_amount) - paid,
  };
}

function buildClientAR(rows: OrderRow[]): ClientAR[] {
  const map = new Map<string, ClientAR>();
  for (const o of rows) {
    if (!o.clients) continue;
    if (!map.has(o.client_id)) {
      map.set(o.client_id, {
        client_id: o.client_id,
        full_name: o.clients.full_name,
        email: o.clients.email,
        phone: o.clients.phone,
        total_billed: 0,
        total_paid: 0,
        outstanding: 0,
        orders: [],
      });
    }
    const ar = map.get(o.client_id)!;
    ar.total_billed += Number(o.total_amount);
    ar.total_paid += o.paid_total;
    ar.outstanding += o.outstanding;
    ar.orders.push(o);
  }
  return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
}

function arStatus(ar: ClientAR): 'paid' | 'partial' | 'unpaid' {
  if (ar.total_billed <= 0) return 'unpaid';
  if (ar.outstanding <= 0) return 'paid';
  if (ar.total_paid > 0) return 'partial';
  return 'unpaid';
}

// ─── Status badge configs ─────────────────────────────────────────────────────

const AR_STATUS_CFG = {
  paid:    { label: 'Paid',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  partial: { label: 'Partial', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  unpaid:  { label: 'Unpaid',  color: 'text-red-700 bg-red-50 border-red-200' },
};

const ORDER_STATUS_CFG: Record<OrderStatus, { label: string; color: string }> = {
  unpaid:  { label: 'Unpaid',  color: 'text-red-700 bg-red-50 border-red-200' },
  partial: { label: 'Partial', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  paid:    { label: 'Paid',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  void:    { label: 'Void',    color: 'text-slate-500 bg-slate-100 border-slate-200' },
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', bank: 'Bank Transfer', card: 'Card', other: 'Other',
};

// ─── Add Order Modal ──────────────────────────────────────────────────────────

function AddOrderModal({
  preselectedClientId,
  preselectedClientName,
  onClose,
  onSaved,
}: {
  preselectedClientId: string | null;
  preselectedClientName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<{ id: string; full_name: string; phone: string | null }[]>([]);
  const [pkgs, setPkgs] = useState<ServicePackage[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [clientSearch, setClientSearch] = useState(preselectedClientName ?? '');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(preselectedClientId);
  const [showClientDrop, setShowClientDrop] = useState(false);

  const [selectedPkgId, setSelectedPkgId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clients').select('id, full_name, phone').eq('status', 'active').order('full_name'),
        supabase.from('packages').select('*').eq('is_active', true).order('name'),
      ]);
      setClients((c ?? []) as { id: string; full_name: string; phone: string | null }[]);
      setPkgs((p ?? []) as ServicePackage[]);
      setLoadingInit(false);
    }
    init();
  }, []);

  function selectPkg(pkgId: string) {
    setSelectedPkgId(pkgId);
    const pkg = pkgs.find(p => p.id === pkgId);
    if (pkg) {
      setDescription(pkg.name);
      setTotalAmount(String(pkg.price));
    } else {
      setDescription('');
      setTotalAmount('');
    }
  }

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch)
  );

  async function handleSave() {
    if (!selectedClientId) { setError('Please select a client.'); return; }
    const amt = parseFloat(totalAmount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than zero.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }

    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: dbErr } = await supabase.from('orders').insert({
      client_id: selectedClientId,
      package_id: selectedPkgId || null,
      description: description.trim(),
      total_amount: amt,
      status: 'unpaid',
      created_by: user?.id ?? null,
    });

    setSaving(false);
    if (dbErr) { setError('Failed to create order. Please try again.'); return; }
    onSaved();
    onClose();
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-300';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900">Add Order</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {loadingInit ? (
            <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {/* Client */}
              <div>
                <label className={labelCls}>Client *</label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search by name or phone…"
                      value={clientSearch}
                      readOnly={!!preselectedClientId}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setSelectedClientId(null);
                        setShowClientDrop(true);
                      }}
                      onFocus={() => !preselectedClientId && setShowClientDrop(true)}
                      className={`w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-300 ${preselectedClientId ? 'bg-slate-50 cursor-default' : ''}`}
                    />
                    {selectedClientId && (
                      <CheckCircle className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-500" />
                    )}
                  </div>
                  {showClientDrop && !preselectedClientId && clientSearch && !selectedClientId && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-44 overflow-y-auto">
                      {filteredClients.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400 text-center">No clients found</div>
                      ) : filteredClients.slice(0, 8).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedClientId(c.id);
                            setClientSearch(c.full_name);
                            setShowClientDrop(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-teal-50 transition-colors"
                        >
                          <p className="text-sm font-semibold text-slate-800">{c.full_name}</p>
                          {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Package (optional) */}
              {pkgs.length > 0 && (
                <div>
                  <label className={labelCls}>Package <span className="text-slate-300 normal-case font-normal tracking-normal">(optional)</span></label>
                  <select
                    value={selectedPkgId}
                    onChange={e => selectPkg(e.target.value)}
                    className={inputCls + ' cursor-pointer bg-white'}
                  >
                    <option value="">— No package / custom —</option>
                    {pkgs.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(Number(p.price))}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className={labelCls}>Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Myers Cocktail IV Drip, 1 session"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={inputCls}
                />
              </div>

              {/* Amount */}
              <div>
                <label className={labelCls}>Total Amount (PHP) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₱</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    className={inputCls + ' pl-8'}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loadingInit}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 text-white font-bold rounded-2xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Payment Modal ─────────────────────────────────────────────────────

function RecordPaymentModal({
  clientAR,
  onClose,
  onSaved,
}: {
  clientAR: ClientAR;
  onClose: () => void;
  onSaved: () => void;
}) {
  const outstandingOrders = clientAR.orders.filter(
    o => o.status !== 'paid' && o.status !== 'void' && o.outstanding > 0
  );

  const [selectedOrderId, setSelectedOrderId] = useState<string>(outstandingOrders[0]?.id ?? '');
  const [amount, setAmount] = useState<string>(() => {
    const first = outstandingOrders[0];
    return first ? String(first.outstanding.toFixed(2)) : '';
  });
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectOrder(orderId: string) {
    setSelectedOrderId(orderId);
    const o = outstandingOrders.find(x => x.id === orderId);
    if (o) setAmount(String(o.outstanding.toFixed(2)));
  }

  async function handleSave() {
    if (!selectedOrderId) { setError('Please select an order.'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount.'); return; }

    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    const order = outstandingOrders.find(o => o.id === selectedOrderId);

    const { error: payErr } = await supabase.from('payments').insert({
      order_id: selectedOrderId,
      client_id: clientAR.client_id,
      amount: amt,
      method,
      reference: reference.trim() || null,
      recorded_by: user?.id ?? null,
    });

    if (payErr) {
      setSaving(false);
      setError('Failed to record payment. Please try again.');
      return;
    }

    if (order) {
      const newPaid = order.paid_total + amt;
      const newStatus: OrderStatus =
        newPaid >= Number(order.total_amount) ? 'paid'
        : newPaid > 0 ? 'partial'
        : 'unpaid';
      await supabase.from('orders').update({ status: newStatus }).eq('id', selectedOrderId);

      // Fire feedback email on paid or partial; guard against duplicates via feedback_email_sent_at
      if ((newStatus === 'paid' || newStatus === 'partial') && clientAR.email) {
        const apptId = order.appointment_id;
        let alreadySent = false;

        if (apptId) {
          const { data: apptCheck } = await supabase
            .from('appointments').select('feedback_email_sent_at')
            .eq('id', apptId).single();
          alreadySent = !!apptCheck?.feedback_email_sent_at;
        }

        if (!alreadySent) {
          if (apptId) {
            await supabase.from('appointments')
              .update({ feedback_email_sent_at: new Date().toISOString() })
              .eq('id', apptId);
          }

          const urlParams = new URLSearchParams({ src: 'email', name: clientAR.full_name });
          if (apptId) urlParams.set('appointment_id', apptId);
          const feedbackUrl = `${window.location.origin}/?${urlParams.toString()}#feedback`;

          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'feedback_request',
                data: {
                  client_name: clientAR.full_name,
                  service_name: order.description ?? 'your recent session',
                  feedback_url: feedbackUrl,
                },
                to: [clientAR.email],
              }),
            },
          ).catch(() => {});
        }
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder-slate-300';
  const labelCls = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Record Payment</h2>
            <p className="text-sm text-slate-500 mt-0.5">{clientAR.full_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {outstandingOrders.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-slate-600 font-semibold">No outstanding orders</p>
              <p className="text-sm text-slate-400 mt-1">This client has no unpaid orders.</p>
            </div>
          ) : (
            <>
              {/* Order select */}
              <div>
                <label className={labelCls}>Apply to Order *</label>
                <select
                  value={selectedOrderId}
                  onChange={e => selectOrder(e.target.value)}
                  className={inputCls + ' cursor-pointer bg-white'}
                >
                  {outstandingOrders.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.description ?? 'Order'} — {fmtCurrency(o.outstanding)} outstanding
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className={labelCls}>Amount (PHP) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₱</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className={inputCls + ' pl-8'}
                  />
                </div>
              </div>

              {/* Method */}
              <div>
                <label className={labelCls}>Payment Method *</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['cash', 'gcash', 'bank', 'card', 'other'] as PaymentMethod[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                        method === m
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference */}
              <div>
                <label className={labelCls}>Reference <span className="text-slate-300 normal-case font-normal tracking-normal">(optional)</span></label>
                <input
                  type="text"
                  placeholder="GCash ref, bank ref, receipt #…"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  className={inputCls}
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-medium rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          {outstandingOrders.length > 0 && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownCircle className="w-4 h-4" />}
              {saving ? 'Recording…' : 'Record Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main BillingTab ──────────────────────────────────────────────────────────

export default function BillingTab({
  canManage,
}: {
  canManage: boolean;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showAddOrder, setShowAddOrder] = useState(false);
  const [addOrderClient, setAddOrderClient] = useState<{ id: string; name: string } | null>(null);
  const [recordPayClient, setRecordPayClient] = useState<ClientAR | null>(null);

  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<OrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabase
      .from('orders')
      .select(`
        id, client_id, package_id, appointment_id, description,
        total_amount, status, created_at, created_by,
        clients(id, full_name, email, phone),
        packages(id, name, price),
        payments(id, amount, method, reference, paid_at)
      `)
      .neq('status', 'void')
      .order('created_at', { ascending: false });
    if (dbErr) { setError('Failed to load billing data.'); setLoading(false); return; }
    setOrders(((data ?? []) as Record<string, unknown>[]).map(buildOrderRow));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toast(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleDeleteOrder() {
    if (!deleteOrderTarget) return;
    setDeleting(true);
    await supabase.from('orders').delete().eq('id', deleteOrderTarget.id);
    setDeleting(false);
    setDeleteOrderTarget(null);
    toast('Order deleted.');
    load();
  }

  function toggleExpand(clientId: string) {
    setExpandedClients(prev => {
      const next = new Set(prev);
      next.has(clientId) ? next.delete(clientId) : next.add(clientId);
      return next;
    });
  }

  const clientAR = buildClientAR(orders);

  const filtered = search
    ? clientAR.filter(ar =>
        ar.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (ar.phone ?? '').includes(search)
      )
    : clientAR;

  const totalOutstanding = clientAR.reduce((s, ar) => s + ar.outstanding, 0);
  const totalCollected = clientAR.reduce((s, ar) => s + ar.total_paid, 0);
  const clientsWithBalance = clientAR.filter(ar => ar.outstanding > 0).length;

  return (
    <div className="space-y-6">
      {/* Non-superadmin notice */}
      {!canManage && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            You can view and add billing records, but only a <span className="font-bold">Superadmin</span> can delete orders.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</p>
          </div>
          <p className="text-2xl font-extrabold text-red-600">{fmtCurrency(totalOutstanding)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Collected</p>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{fmtCurrency(totalCollected)}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clients with Balance</p>
          </div>
          <p className="text-2xl font-extrabold text-slate-700">{clientsWithBalance}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search client by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={() => { setAddOrderClient(null); setShowAddOrder(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Order
        </button>
      </div>

      {/* Success / error */}
      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-50 animate-pulse">
              <div className="w-8 h-8 bg-slate-200 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-40 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-24" />
              </div>
              <div className="h-4 bg-slate-100 rounded w-20" />
              <div className="h-4 bg-slate-100 rounded w-20" />
              <div className="h-4 bg-slate-100 rounded w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-slate-600 font-semibold text-lg">
            {search ? 'No matching clients' : 'No orders yet'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {search ? 'Try a different search term.' : 'Create an order to start tracking accounts receivable.'}
          </p>
          {!search && (
            <button
              onClick={() => { setAddOrderClient(null); setShowAddOrder(true); }}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Order
            </button>
          )}
        </div>
      )}

      {/* AR Table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_120px_130px_90px_140px] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Billed</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Paid</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Balance</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</p>
            <div />
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(ar => {
              const st = arStatus(ar);
              const cfg = AR_STATUS_CFG[st];
              const isExpanded = expandedClients.has(ar.client_id);

              return (
                <div key={ar.client_id}>
                  {/* Client summary row */}
                  <div className="sm:grid sm:grid-cols-[1fr_120px_120px_130px_90px_140px] gap-3 items-center px-5 py-4 hover:bg-slate-50/60 transition-colors">
                    {/* Client name */}
                    <div className="flex items-center gap-3 mb-2 sm:mb-0 min-w-0">
                      <button
                        onClick={() => toggleExpand(ar.client_id)}
                        className="p-1 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
                        title={isExpanded ? 'Collapse orders' : 'Expand orders'}
                      >
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      </button>
                      <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{ar.full_name}</p>
                        {ar.phone && <p className="text-xs text-slate-400">{ar.phone}</p>}
                        <p className="text-[11px] text-slate-300 sm:hidden">
                          {ar.orders.length} order{ar.orders.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Billed */}
                    <p className="text-sm font-semibold text-slate-700 sm:text-right mb-1 sm:mb-0">
                      <span className="sm:hidden text-xs text-slate-400 mr-1">Billed:</span>
                      {fmtCurrency(ar.total_billed)}
                    </p>

                    {/* Paid */}
                    <p className="text-sm font-semibold text-emerald-600 sm:text-right mb-1 sm:mb-0">
                      <span className="sm:hidden text-xs text-slate-400 mr-1">Paid:</span>
                      {fmtCurrency(ar.total_paid)}
                    </p>

                    {/* Balance */}
                    <p className={`text-sm font-extrabold sm:text-right mb-1 sm:mb-0 ${ar.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      <span className="sm:hidden text-xs text-slate-400 mr-1 font-normal">Balance:</span>
                      {fmtCurrency(ar.outstanding)}
                    </p>

                    {/* Status badge */}
                    <div className="mb-2 sm:mb-0">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => { setAddOrderClient({ id: ar.client_id, name: ar.full_name }); setShowAddOrder(true); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Order
                      </button>
                      <button
                        onClick={() => setRecordPayClient(ar)}
                        disabled={ar.outstanding <= 0}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <CreditCard className="w-3 h-3" /> Pay
                      </button>
                    </div>
                  </div>

                  {/* Expanded orders sub-table */}
                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100">
                      {/* Sub-header */}
                      <div className="hidden sm:grid grid-cols-[1fr_90px_90px_80px_70px_32px] gap-3 px-10 py-2 border-b border-slate-100">
                        <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Description</p>
                        <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right">Total</p>
                        <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider text-right">Paid</p>
                        <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Status</p>
                        <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Date</p>
                        <div />
                      </div>

                      {ar.orders.map(order => {
                        const oStCfg = ORDER_STATUS_CFG[order.status as OrderStatus] ?? ORDER_STATUS_CFG.unpaid;
                        return (
                          <div key={order.id} className="sm:grid sm:grid-cols-[1fr_90px_90px_80px_70px_32px] gap-3 items-center px-10 py-2.5 border-b border-slate-100 last:border-b-0 group hover:bg-white/60 transition-colors">
                            <div className="flex items-center gap-2 mb-1 sm:mb-0 min-w-0">
                              <Layers className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700 truncate">{order.description ?? '—'}</p>
                                {order.packages && <p className="text-[10px] text-slate-400">{order.packages.name}</p>}
                              </div>
                            </div>
                            <p className="text-xs font-semibold text-slate-600 sm:text-right">{fmtCurrency(Number(order.total_amount))}</p>
                            <p className="text-xs font-semibold text-emerald-600 sm:text-right">{fmtCurrency(order.paid_total)}</p>
                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${oStCfg.color}`}>
                              {oStCfg.label}
                            </span>
                            <p className="text-[10px] text-slate-400">{fmtDate(order.created_at)}</p>
                            <div className="flex justify-end">
                              {canManage ? (
                                <button
                                  onClick={() => setDeleteOrderTarget(order)}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                                  title="Delete order"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : <div className="w-7" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete order confirm */}
      {deleteOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-1">Delete Order?</h3>
            <p className="text-sm text-slate-500 text-center mb-1 truncate px-2">
              {deleteOrderTarget.description ?? '—'}
            </p>
            <p className="text-base font-extrabold text-center text-red-600 mb-2">
              {fmtCurrency(Number(deleteOrderTarget.total_amount))}
            </p>
            <p className="text-xs text-slate-400 text-center mb-6">
              All recorded payments for this order will also be deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteOrderTarget(null)}
                disabled={deleting}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteOrder}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 disabled:opacity-60 transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddOrder && (
        <AddOrderModal
          preselectedClientId={addOrderClient?.id ?? null}
          preselectedClientName={addOrderClient?.name ?? null}
          onClose={() => { setShowAddOrder(false); setAddOrderClient(null); }}
          onSaved={() => { load(); toast('Order created successfully.'); }}
        />
      )}

      {recordPayClient && (
        <RecordPaymentModal
          clientAR={recordPayClient}
          onClose={() => setRecordPayClient(null)}
          onSaved={() => { load(); toast('Payment recorded successfully.'); }}
        />
      )}
    </div>
  );
}
