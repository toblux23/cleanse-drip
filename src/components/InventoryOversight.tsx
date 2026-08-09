import { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, RefreshCw, Loader2, AlertCircle, AlertTriangle,
  TrendingDown, ArrowUpCircle, ArrowDownCircle, ArrowRightCircle,
  Boxes, ClipboardList, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryProduct {
  id: string;
  product_code: string;
  name: string;
  category: string | null;
  sub_category: string | null;
  unit: string;
  inventory_type: string;
  current_stock: string;
  min_stock_level: string;
  reorder_point: string;
  max_stock_level: string;
  reserved_stock: string;
  is_active: boolean;
  branch_id: string | null;
  updated_at: string;
  last_counted_at: string | null;
  branches: { name: string } | null;
}

interface InventoryTransaction {
  id: string;
  product_id: string;
  batch_id: string | null;
  transaction_type: string;
  quantity: string;
  unit_cost: string;
  before_quantity: string;
  after_quantity: string;
  user_id: string | null;
  user_email: string | null;
  reference_type: string | null;
  reason: string | null;
  notes: string | null;
  transaction_date: string;
  inventory_products: { name: string; unit: string } | null;
}

type StockStatus = 'out' | 'low' | 'reorder' | 'ok';
type ViewMode = 'levels' | 'movements' | 'lowstock';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v: string | null): string {
  if (v === null || v === undefined) return '0';
  const n = parseFloat(v);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function getStockStatus(p: InventoryProduct): StockStatus {
  const current = parseFloat(p.current_stock);
  const min = parseFloat(p.min_stock_level);
  const reorder = parseFloat(p.reorder_point);

  if (current <= 0) return 'out';
  if (reorder > 0 && current <= reorder) return 'reorder';
  if (min > 0 && current <= min) return 'low';
  return 'ok';
}

const STATUS_CFG: Record<StockStatus, { label: string; cls: string; dotCls: string }> = {
  out:     { label: 'Out of Stock', cls: 'bg-red-50 text-red-700 border-red-200',       dotCls: 'bg-red-500' },
  low:     { label: 'Low Stock',     cls: 'bg-amber-50 text-amber-700 border-amber-200', dotCls: 'bg-amber-500' },
  reorder: { label: 'Reorder',       cls: 'bg-orange-50 text-orange-700 border-orange-200', dotCls: 'bg-orange-500' },
  ok:      { label: 'In Stock',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotCls: 'bg-emerald-500' },
};

const TXN_TYPE_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  beginning:     { label: 'Beginning Balance', icon: Boxes,            cls: 'text-slate-500 bg-slate-50' },
  purchase:      { label: 'Purchase',          icon: ArrowUpCircle,    cls: 'text-blue-600 bg-blue-50' },
  consumption:   { label: 'Consumption',        icon: ArrowDownCircle,  cls: 'text-red-600 bg-red-50' },
  transfer_in:   { label: 'Transfer In',       icon: ArrowRightCircle, cls: 'text-teal-600 bg-teal-50' },
  transfer_out:  { label: 'Transfer Out',      icon: ArrowRightCircle, cls: 'text-orange-600 bg-orange-50' },
  adjustment:    { label: 'Adjustment',         icon: TrendingDown,     cls: 'text-amber-600 bg-amber-50' },
  return:        { label: 'Return',             icon: ArrowUpCircle,    cls: 'text-emerald-600 bg-emerald-50' },
  reservation:   { label: 'Reservation',        icon: ClipboardList,    cls: 'text-purple-600 bg-purple-50' },
  release:       { label: 'Release',            icon: CheckCircle2,     cls: 'text-teal-600 bg-teal-50' },
  audit:         { label: 'Audit',              icon: ClipboardList,    cls: 'text-slate-600 bg-slate-50' },
};

function getTxnCfg(type: string) {
  return TXN_TYPE_CFG[type] ?? { label: type.charAt(0).toUpperCase() + type.slice(1), icon: ArrowRightCircle, cls: 'text-slate-600 bg-slate-50' };
}

function isPositiveMovement(type: string): boolean {
  return ['beginning', 'purchase', 'transfer_in', 'return', 'release'].includes(type);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function InventoryOversight() {
  const [view, setView] = useState<ViewMode>('levels');
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [prodRes, txnRes] = await Promise.all([
      supabase
        .from('inventory_products')
        .select('id, product_code, name, category, sub_category, unit, inventory_type, current_stock, min_stock_level, reorder_point, max_stock_level, reserved_stock, is_active, branch_id, updated_at, last_counted_at, branches(name)')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('inventory_transactions')
        .select('id, product_id, batch_id, transaction_type, quantity, unit_cost, before_quantity, after_quantity, user_id, user_email, reference_type, reason, notes, transaction_date, inventory_products(name, unit)')
        .order('transaction_date', { ascending: false })
        .limit(100),
    ]);

    if (prodRes.error) { setError('Failed to load inventory products.'); setLoading(false); return; }
    if (txnRes.error) { setError('Failed to load inventory transactions.'); setLoading(false); return; }

    setProducts((prodRes.data ?? []) as unknown as InventoryProduct[]);
    setTransactions((txnRes.data ?? []) as unknown as InventoryTransaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const productsWithStatus = products.map(p => ({ ...p, _status: getStockStatus(p) }));

  const lowStockItems = productsWithStatus
    .filter(p => p._status === 'out' || p._status === 'low' || p._status === 'reorder')
    .sort((a, b) => {
      const order: Record<StockStatus, number> = { out: 0, low: 1, reorder: 2, ok: 3 };
      return order[a._status] - order[b._status];
    });

  const statusCounts = {
    total: products.length,
    out: productsWithStatus.filter(p => p._status === 'out').length,
    low: productsWithStatus.filter(p => p._status === 'low').length,
    reorder: productsWithStatus.filter(p => p._status === 'reorder').length,
    ok: productsWithStatus.filter(p => p._status === 'ok').length,
  };

  const filteredProducts = productsWithStatus.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.product_code.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q);
  });

  const filteredTxns = transactions.filter(t => {
    if (typeFilter !== 'all' && t.transaction_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.inventory_products?.name ?? '').toLowerCase().includes(q) || (t.user_email ?? '').toLowerCase().includes(q) || (t.reason ?? '').toLowerCase().includes(q);
  });

  const txnTypes = Array.from(new Set(transactions.map(t => t.transaction_type)));

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Items</p>
            <p className="text-2xl font-bold text-slate-800">{statusCounts.total}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">In Stock</p>
            <p className="text-2xl font-bold text-slate-800">{statusCounts.ok}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Low / Reorder</p>
            <p className="text-2xl font-bold text-slate-800">{statusCounts.low + statusCounts.reorder}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Out of Stock</p>
            <p className="text-2xl font-bold text-slate-800">{statusCounts.out}</p>
          </div>
        </div>
      </div>

      {/* View tabs + toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {([
            { key: 'levels' as ViewMode, label: 'Stock Levels', icon: Package },
            { key: 'movements' as ViewMode, label: 'Movements', icon: ArrowRightCircle },
            { key: 'lowstock' as ViewMode, label: 'Low Stock', icon: AlertTriangle },
          ]).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  view === t.key ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
                {t.key === 'lowstock' && lowStockItems.length > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 text-[10px] rounded-full ${view === t.key ? 'bg-white/20' : 'bg-red-100 text-red-600'}`}>
                    {lowStockItems.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={view === 'movements' ? 'Search by item, user, or reason\u2026' : 'Search by item name, code, or category\u2026'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>

        {view === 'movements' && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
          >
            <option value="all">All Types</option>
            {txnTypes.map(t => (
              <option key={t} value={t}>{getTxnCfg(t).label}</option>
            ))}
          </select>
        )}

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
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
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-40 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-24" />
                </div>
                <div className="h-6 bg-slate-100 rounded-full w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Stock Levels View ─── */}
      {!loading && view === 'levels' && (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          {filteredProducts.length === 0 ? (
            <div className="p-16 text-center">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">{search ? 'No matching items' : 'No inventory items found'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-5 py-3">Item</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Category</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Current Qty</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Unit</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredProducts.map(p => {
                    const sc = STATUS_CFG[p._status];
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">{p.product_code}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-500">{p.category || p.inventory_type || '\u2014'}</span>
                          {p.sub_category && <span className="text-xs text-slate-400 block">{p.sub_category}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-sm font-bold ${p._status === 'out' ? 'text-red-600' : 'text-slate-800'}`}>
                            {fmtNum(p.current_stock)}
                          </span>
                          {parseFloat(p.reserved_stock) > 0 && (
                            <span className="text-xs text-slate-400 block">({fmtNum(p.reserved_stock)} reserved)</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-500">{p.unit}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full border ${sc.cls}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dotCls}`} />
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-400">{fmtDate(p.updated_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Movements View ─── */}
      {!loading && view === 'movements' && (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          {filteredTxns.length === 0 ? (
            <div className="p-16 text-center">
              <ArrowRightCircle className="w-10 h-10 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">{search || typeFilter !== 'all' ? 'No matching movements' : 'No inventory movements recorded'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-5 py-3">Item</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Type</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Qty Change</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">After</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Recorded By</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredTxns.map(t => {
                    const cfg = getTxnCfg(t.transaction_type);
                    const Icon = cfg.icon;
                    const positive = isPositiveMovement(t.transaction_type);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-slate-800">{t.inventory_products?.name ?? 'Unknown item'}</p>
                          {t.reason && <p className="text-xs text-slate-400 mt-0.5">{t.reason}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold rounded-lg ${cfg.cls}`}>
                            <Icon className="w-3 h-3" /> {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-sm font-bold ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
                            {positive ? '+' : '-'}{fmtNum(t.quantity)}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">{t.inventory_products?.unit}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className="text-sm text-slate-600">{fmtNum(t.after_quantity)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-500">{t.user_email ?? '\u2014'}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-slate-400">{fmtDateTime(t.transaction_date)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Low Stock View ─── */}
      {!loading && view === 'lowstock' && (
        <div className="space-y-3">
          {lowStockItems.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">All items are well stocked</p>
              <p className="text-slate-400 text-sm mt-1">No items are below their threshold levels.</p>
            </div>
          ) : (
            lowStockItems.map(p => {
              const sc = STATUS_CFG[p._status];
              const current = parseFloat(p.current_stock);
              const min = parseFloat(p.min_stock_level);
              const reorder = parseFloat(p.reorder_point);
              const threshold = reorder > 0 ? reorder : min;

              return (
                <div key={p.id} className={`bg-white rounded-2xl border shadow-sm p-5 ${p._status === 'out' ? 'border-red-200' : p._status === 'low' ? 'border-amber-200' : 'border-orange-200'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p._status === 'out' ? 'bg-red-50' : p._status === 'low' ? 'bg-amber-50' : 'bg-orange-50'}`}>
                      <AlertTriangle className={`w-5 h-5 ${p._status === 'out' ? 'text-red-500' : p._status === 'low' ? 'text-amber-500' : 'text-orange-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800">{p.name}</p>
                        <span className="text-xs text-slate-400">{p.product_code}</span>
                        {p.category && <span className="text-xs text-slate-400">{'\u00b7'} {p.category}</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs">
                        <span className="text-slate-500">
                          Current: <span className={`font-bold ${p._status === 'out' ? 'text-red-600' : 'text-slate-700'}`}>{fmtNum(p.current_stock)} {p.unit}</span>
                        </span>
                        {min > 0 && (
                          <span className="text-slate-400">Min: {fmtNum(p.min_stock_level)} {p.unit}</span>
                        )}
                        {reorder > 0 && (
                          <span className="text-slate-400">Reorder at: {fmtNum(p.reorder_point)} {p.unit}</span>
                        )}
                        {threshold > 0 && (
                          <span className="text-slate-400">
                            Shortfall: <span className="font-semibold text-red-500">{fmtNum((Math.max(0, threshold - current)).toString())} {p.unit}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border ${sc.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dotCls}`} />
                        {sc.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
