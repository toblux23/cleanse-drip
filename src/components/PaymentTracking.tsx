import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Search, Wallet, Receipt,
  TrendingDown, Users, ChevronDown, ChevronRight, User,
} from 'lucide-react';
import { supabase, type Order, type OrderStatus } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  appointments: { id: string; scheduled_date: string; service: string | null } | null;
  paid_total: number;
  outstanding: number;
}

type TrackingStatus = 'paid' | 'partial' | 'unpaid' | 'refunded';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return '\u20b1' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildOrderRow(raw: Record<string, unknown>): OrderRow {
  const pmts = ((raw.payments as PaymentRow[]) ?? []);
  const paid = pmts.reduce((s, p) => s + Number(p.amount), 0);
  return {
    ...(raw as unknown as Order),
    clients: raw.clients as OrderRow['clients'],
    packages: raw.packages as OrderRow['packages'],
    appointments: raw.appointments as OrderRow['appointments'],
    payments: pmts,
    paid_total: paid,
    outstanding: Number(raw.total_amount) - paid,
  };
}

function computeStatus(o: OrderRow): TrackingStatus {
  if (o.status === 'void') return 'refunded';
  if (o.outstanding <= 0 && o.paid_total > 0) return 'paid';
  if (o.paid_total > 0) return 'partial';
  return 'unpaid';
}

const STATUS_CFG: Record<TrackingStatus, { label: string; color: string }> = {
  paid:     { label: 'Paid',     color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  partial:  { label: 'Partial',  color: 'text-amber-700 bg-amber-50 border-amber-200' },
  unpaid:   { label: 'Unpaid',   color: 'text-red-700 bg-red-50 border-red-200' },
  refunded: { label: 'Refunded', color: 'text-slate-600 bg-slate-100 border-slate-200' },
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', bank: 'Bank Transfer', card: 'Card', other: 'Other',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function PaymentTracking() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TrackingStatus>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        payments(id, amount, method, reference, paid_at),
        appointments(id, scheduled_date, service)
      `)
      .order('created_at', { ascending: false });
    if (dbErr) { setError('Failed to load payment data.'); setLoading(false); return; }
    setOrders(((data ?? []) as Record<string, unknown>[]).map(buildOrderRow));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rowsWithStatus = orders.map(o => ({ ...o, _status: computeStatus(o) }));

  const filtered = rowsWithStatus.filter(o => {
    if (statusFilter !== 'all' && o._status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.clients?.full_name ?? '').toLowerCase().includes(q) ||
      (o.description ?? '').toLowerCase().includes(q) ||
      (o.appointments?.service ?? '').toLowerCase().includes(q)
    );
  });

  const totalOutstanding = rowsWithStatus
    .filter(o => o._status !== 'refunded')
    .reduce((s, o) => s + Math.max(0, o.outstanding), 0);
  const totalCollected = rowsWithStatus.reduce((s, o) => s + o.paid_total, 0);
  const clientsWithBalance = new Set(
    rowsWithStatus.filter(o => o.outstanding > 0 && o._status !== 'refunded').map(o => o.client_id)
  ).size;

  const statusCounts: Record<TrackingStatus, number> = { paid: 0, partial: 0, unpaid: 0, refunded: 0 };
  for (const o of rowsWithStatus) statusCounts[o._status]++;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding</p>
          </div>
          <p className="text-2xl font-extrabold text-red-600">{fmtCurrency(totalOutstanding)}</p>
          <p className="text-xs text-slate-400 mt-1">{clientsWithBalance} client{clientsWithBalance !== 1 ? 's' : ''} with balance</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Collected</p>
          </div>
          <p className="text-2xl font-extrabold text-emerald-600">{fmtCurrency(totalCollected)}</p>
          <p className="text-xs text-slate-400 mt-1">{rowsWithStatus.length} total order{rowsWithStatus.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-500" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status Breakdown</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['paid', 'partial', 'unpaid', 'refunded'] as TrackingStatus[]).map(s => (
              <span key={s} className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${STATUS_CFG[s].color}`}>
                {STATUS_CFG[s].label} {statusCounts[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, service, or description\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
          {(['all', 'unpaid', 'partial', 'paid', 'refunded'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                statusFilter === f
                  ? f === 'unpaid' ? 'bg-red-500 text-white'
                    : f === 'partial' ? 'bg-amber-500 text-white'
                    : f === 'paid' ? 'bg-emerald-600 text-white'
                    : f === 'refunded' ? 'bg-slate-500 text-white'
                    : 'bg-slate-900 text-white'
                  : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : STATUS_CFG[f].label}
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
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
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
            <Wallet className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-slate-600 font-semibold text-lg">
            {search || statusFilter !== 'all' ? 'No matching orders' : 'No orders yet'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {search || statusFilter !== 'all' ? 'Try a different search or filter.' : 'Orders will appear here once they are created.'}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {/* Header */}
          <div className="hidden lg:grid grid-cols-[28px_1fr_140px_110px_110px_110px_100px_28px] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50">
            <div />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client / Service</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Appt Date</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Total</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Paid</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Balance</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</p>
            <div />
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(o => {
              const st = o._status;
              const cfg = STATUS_CFG[st];
              const isExpanded = expandedId === o.id;
              const service = o.appointments?.service ?? o.packages?.name ?? o.description ?? '\u2014';
              const apptDate = o.appointments?.scheduled_date ?? null;

              return (
                <div key={o.id}>
                  {/* Row */}
                  <div
                    className="lg:grid lg:grid-cols-[28px_1fr_140px_110px_110px_110px_100px_28px] gap-3 items-center px-5 py-3.5 hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  >
                    <div className="hidden lg:flex items-center justify-center">
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                    </div>

                    {/* Client + service */}
                    <div className="flex items-center gap-3 min-w-0 mb-2 lg:mb-0">
                      <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{o.clients?.full_name ?? 'Unknown Client'}</p>
                        <p className="text-xs text-slate-400 truncate">{service}</p>
                      </div>
                    </div>

                    {/* Appt date */}
                    <p className="text-sm text-slate-600 mb-2 lg:mb-0">
                      <span className="lg:hidden text-xs text-slate-400 mr-1">Date:</span>
                      {fmtDate(apptDate)}
                    </p>

                    {/* Total */}
                    <p className="text-sm font-semibold text-slate-700 lg:text-right mb-2 lg:mb-0">
                      <span className="lg:hidden text-xs text-slate-400 mr-1">Total:</span>
                      {fmtCurrency(Number(o.total_amount))}
                    </p>

                    {/* Paid */}
                    <p className="text-sm font-semibold text-emerald-600 lg:text-right mb-2 lg:mb-0">
                      <span className="lg:hidden text-xs text-slate-400 mr-1">Paid:</span>
                      {fmtCurrency(o.paid_total)}
                    </p>

                    {/* Balance */}
                    <p className={`text-sm font-extrabold lg:text-right mb-2 lg:mb-0 ${o.outstanding > 0 && st !== 'refunded' ? 'text-red-600' : 'text-slate-400'}`}>
                      <span className="lg:hidden text-xs text-slate-400 mr-1 font-normal">Balance:</span>
                      {st === 'refunded' ? '\u2014' : fmtCurrency(Math.max(0, o.outstanding))}
                    </p>

                    {/* Status */}
                    <div className="mb-2 lg:mb-0">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>

                    <div className="hidden lg:block" />
                  </div>

                  {/* Expanded payment detail */}
                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100 px-5 py-4">
                      {o.payments.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No payments recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment History</p>
                          {o.payments.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-4 py-2.5">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-700">
                                  {METHOD_LABELS[p.method] ?? p.method}
                                  {p.reference && <span className="text-slate-400 font-normal"> \u00b7 Ref: {p.reference}</span>}
                                </p>
                                <p className="text-xs text-slate-400">{fmtDate(p.paid_at)}</p>
                              </div>
                              <span className="text-sm font-bold text-emerald-600 flex-shrink-0 ml-3">{fmtCurrency(Number(p.amount))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
