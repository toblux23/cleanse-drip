import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  RefreshCw, Loader2, AlertCircle, Wallet, TrendingUp, TrendingDown,
  DollarSign, CreditCard, Receipt, ArrowUpCircle, ArrowDownCircle,
  FileText, Download, Calendar, Clock, Users, BarChart3,
  Landmark, Building2, ShieldCheck, Info, ChevronRight, Package,
  PieChart, BookOpen, Scale, Archive, Gift,
} from 'lucide-react';
import { supabase, type FinanceTransaction, type Branch } from '../lib/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function monthsAgoStr(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleKey = 'overview' | 'statements' | 'compliance' | 'receivables' | 'payables' | 'budget' | 'analytics' | 'export';

interface OrderRow {
  id: string;
  client_id: string;
  total_amount: number;
  status: string;
  created_at: string;
  description: string | null;
  clients: { full_name: string; email: string | null; phone: string | null } | null;
  payments: { id: string; amount: number; method: string; paid_at: string }[];
  paid_total: number;
  outstanding: number;
}

interface MonthlyAgg {
  month: string;
  income: number;
  expense: number;
  net: number;
  collected: number;
  billed: number;
  bookings: number;
  newClients: number;
}

// ─── Export utility ─────────────────────────────────────────────────────────────

function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = 'Sheet1') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

// ─── Module tab config ────────────────────────────────────────────────────────

const MODULES: { key: ModuleKey; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Executive Overview', icon: BarChart3 },
  { key: 'statements', label: 'Financial Statements', icon: FileText },
  { key: 'compliance', label: 'Government & Compliance', icon: ShieldCheck },
  { key: 'receivables', label: 'Accounts Receivable', icon: CreditCard },
  { key: 'payables', label: 'Accounts Payable', icon: Landmark },
  { key: 'budget', label: 'Budget vs Actual', icon: Scale },
  { key: 'analytics', label: 'Business Analytics', icon: PieChart },
  { key: 'export', label: 'Export & Reports', icon: Download },
];

// ─── Mini bar chart (CSS-only) ────────────────────────────────────────────────

function MiniBarChart({ data, color = 'bg-teal-500', height = 160 }: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex items-end justify-center flex-1">
            <div
              className={`w-full max-w-[32px] ${color} rounded-t-md transition-all hover:opacity-80`}
              style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
              title={`${d.label}: ${fmtCurrency(d.value)}`}
            />
          </div>
          <span className="text-[10px] text-slate-400 font-semibold truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Line chart (SVG) ──────────────────────────────────────────────────────────

function LineChart({ data, color = '#0d9488', height = 180 }: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const points = data.map((d, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / range) * h;
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const areaD = `${pathD} L ${w} ${h} L 0 ${h} Z`;

  return (
    <div style={{ height }} className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {data.map((d, i) => (
          <span key={i} className="text-[10px] text-slate-400 font-semibold">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, iconBg, iconColor, valueColor }: {
  label: string;
  value: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center gap-3 mb-2.5">
        <div className={`w-9 h-9 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
      </div>
      <p className={`text-2xl font-extrabold ${valueColor ?? 'text-slate-700'}`}>{value}</p>
    </div>
  );
}

// ─── Coming Soon placeholder ───────────────────────────────────────────────────

function ComingSoon({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <Info className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="text-base font-bold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mx-auto">{message}</p>
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children, action }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-teal-600" />
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ExecutiveFinanceCenter({ canManage, userEmail }: {
  canManage: boolean;
  userEmail: string;
}) {
  const [activeModule, setActiveModule] = useState<ModuleKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [monthlyAgg, setMonthlyAgg] = useState<MonthlyAgg[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; status: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sixMonthsAgo = monthsAgoStr(5);

      const [
        txRes, orderRes, branchRes, supplierRes,
        apptRes, clientRes,
      ] = await Promise.all([
        supabase.from('finance_transactions').select('*').order('date', { ascending: false }),
        supabase.from('orders').select(`
          id, client_id, total_amount, status, created_at, description,
          clients(id, full_name, email, phone),
          payments(id, amount, method, paid_at)
        `).order('created_at', { ascending: false }),
        supabase.from('branches').select('id, name, is_active, created_at').eq('is_active', true).order('name'),
        supabase.from('inventory_suppliers').select('id, name, status'),
        supabase.from('appointments').select('id, scheduled_date, status').gte('scheduled_date', sixMonthsAgo),
        supabase.from('clients').select('id, created_at').gte('created_at', sixMonthsAgo),
      ]);

      const txs = (txRes.data ?? []) as FinanceTransaction[];
      const rawOrders = (orderRes.data ?? []) as Record<string, unknown>[];
      setTransactions(txs);
      setBranches((branchRes.data ?? []) as Branch[]);
      setSuppliers((supplierRes.data ?? []) as { id: string; name: string; status: string }[]);

      const builtOrders: OrderRow[] = rawOrders.map(raw => {
        const pmts = ((raw.payments as OrderRow['payments']) ?? []);
        const paid = pmts.reduce((s, p) => s + Number(p.amount), 0);
        return {
          ...(raw as unknown as OrderRow),
          payments: pmts,
          paid_total: paid,
          outstanding: Number(raw.total_amount) - paid,
        };
      });
      setOrders(builtOrders);

      // Build monthly aggregation for last 6 months
      const appts = (apptRes.data ?? []) as { id: string; scheduled_date: string; status: string }[];
      const clients = (clientRes.data ?? []) as { id: string; created_at: string }[];

      const months: MonthlyAgg[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthStart = `${ym}-01`;
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const monthEnd = nextMonth.toISOString().split('T')[0];

        const monthTxs = txs.filter(t => t.date >= monthStart && t.date < monthEnd);
        const monthOrders = builtOrders.filter(o => o.created_at >= monthStart && o.created_at < monthEnd);
        const monthAppts = appts.filter(a => a.scheduled_date >= monthStart && a.scheduled_date < monthEnd);
        const monthClients = clients.filter(c => c.created_at >= monthStart && c.created_at < monthEnd);

        const income = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const expense = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const collected = monthOrders.flatMap(o => o.payments).filter(p => p.paid_at >= monthStart && p.paid_at < monthEnd).reduce((s, p) => s + Number(p.amount), 0);
        const billed = monthOrders.reduce((s, o) => s + Number(o.total_amount), 0);

        months.push({
          month: ym,
          income,
          expense,
          net: income - expense,
          collected,
          billed,
          bookings: monthAppts.length,
          newClients: monthClients.length,
        });
      }
      setMonthlyAgg(months);
    } catch {
      setError('Failed to load financial data. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Derived metrics ───────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const sponsoredValue = transactions.filter(t => t.type === 'income' && t.category === 'Sponsored Treatment').reduce((s, t) => s + Number(t.amount), 0);
    const totalIncome = transactions.filter(t => t.type === 'income' && t.category !== 'Sponsored Treatment').reduce((s, t) => s + Number(t.amount), 0);
    const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const grossProfit = totalIncome - totalExpenses;
    const totalCollected = orders.flatMap(o => o.payments).filter(p => p.method !== 'sponsored').reduce((s, p) => s + Number(p.amount), 0);
    const totalOutstanding = orders.filter(o => o.status !== 'void').reduce((s, o) => s + Math.max(0, o.outstanding), 0);
    const totalBilled = orders.filter(o => o.status !== 'void').reduce((s, o) => s + Number(o.total_amount), 0);
    const refunds = orders.filter(o => o.status === 'void').reduce((s, o) => s + Number(o.total_amount), 0);

    // Revenue growth: compare last month vs previous month
    const lastMonth = monthlyAgg[monthlyAgg.length - 1];
    const prevMonth = monthlyAgg[monthlyAgg.length - 2];
    const revenueGrowth = lastMonth && prevMonth
      ? prevMonth.income > 0
        ? ((lastMonth.income - prevMonth.income) / prevMonth.income) * 100
        : lastMonth.income > 0 ? 100 : 0
      : 0;

    return {
      revenue: totalIncome,
      expenses: totalExpenses,
      grossProfit,
      netProfit: grossProfit,
      outstandingReceivables: totalOutstanding,
      cashCollected: totalCollected,
      refunds,
      revenueGrowth,
      totalBilled,
      sponsoredValue,
    };
  }, [transactions, orders, monthlyAgg]);

  // ─── AR data ───────────────────────────────────────────────────────────────

  const arData = useMemo(() => {
    const map = new Map<string, {
      client_id: string; full_name: string; total_billed: number; total_paid: number;
      outstanding: number; orders: OrderRow[]; oldestDate: string;
    }>();

    for (const o of orders) {
      if (!o.clients || o.status === 'void') continue;
      const cid = o.client_id;
      if (!map.has(cid)) {
        map.set(cid, { client_id: cid, full_name: o.clients.full_name, total_billed: 0, total_paid: 0, outstanding: 0, orders: [], oldestDate: o.created_at });
      }
      const ar = map.get(cid)!;
      ar.total_billed += Number(o.total_amount);
      ar.total_paid += o.paid_total;
      ar.outstanding += o.outstanding;
      ar.orders.push(o);
      if (o.created_at < ar.oldestDate) ar.oldestDate = o.created_at;
    }

    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [orders]);

  const arSummary = useMemo(() => {
    const paid = arData.filter(a => a.outstanding <= 0 && a.total_paid > 0).length;
    const partial = arData.filter(a => a.outstanding > 0 && a.total_paid > 0).length;
    const unpaid = arData.filter(a => a.outstanding > 0 && a.total_paid === 0).length;
    const totalOutstanding = arData.reduce((s, a) => s + a.outstanding, 0);

    // Aging buckets
    const now = new Date();
    const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const a of arData) {
      if (a.outstanding <= 0) continue;
      const days = Math.floor((now.getTime() - new Date(a.oldestDate).getTime()) / 86400000);
      if (days <= 0) aging.current += a.outstanding;
      else if (days <= 30) aging.d1_30 += a.outstanding;
      else if (days <= 60) aging.d31_60 += a.outstanding;
      else if (days <= 90) aging.d61_90 += a.outstanding;
      else aging.d90plus += a.outstanding;
    }
    return { paid, partial, unpaid, totalOutstanding, aging };
  }, [arData]);

  // ─── Service profitability ───────────────────────────────────────────────────

  const serviceData = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; count: number }>();
    for (const o of orders) {
      if (o.status === 'void') continue;
      const name = o.description ?? 'Unknown';
      if (!map.has(name)) map.set(name, { name, revenue: 0, count: 0 });
      const s = map.get(name)!;
      s.revenue += o.paid_total;
      s.count++;
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [orders]);

  // ─── Export handlers ────────────────────────────────────────────────────────

  function handleExportTransactions() {
    const rows = transactions.map(t => ({
      Date: t.date,
      Type: t.type,
      Category: t.category,
      Description: t.description ?? '',
      Amount: Number(t.amount),
      Reference: t.reference ?? '',
      Notes: t.notes ?? '',
      'Payment Type': t.category === 'Sponsored Treatment' ? 'Sponsored' : 'Standard',
    }));
    exportToExcel(rows, 'finance_transactions.xlsx', 'Transactions');
  }

  function handleExportAR() {
    const rows = arData.map(a => ({
      Client: a.full_name,
      'Total Billed': a.total_billed,
      'Total Paid': a.total_paid,
      Outstanding: a.outstanding,
      'Order Count': a.orders.length,
    }));
    exportToExcel(rows, 'accounts_receivable.xlsx', 'AR');
  }

  function handleExportMonthly() {
    const rows = monthlyAgg.map(m => ({
      Month: monthLabel(m.month),
      Income: m.income,
      Expense: m.expense,
      Net: m.net,
      Collected: m.collected,
      Billed: m.billed,
      Bookings: m.bookings,
      'New Clients': m.newClients,
    }));
    exportToExcel(rows, 'monthly_summary.xlsx', 'Monthly');
  }

  function handleExportIncomeStatement() {
    const incomeByCat = new Map<string, number>();
    const expenseByCat = new Map<string, number>();
    for (const t of transactions) {
      const map = t.type === 'income' ? incomeByCat : expenseByCat;
      map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount));
    }
    const rows = [
      { Section: 'REVENUE', Category: '', Amount: '' },
      ...Array.from(incomeByCat.entries()).map(([cat, amt]) => ({ Section: '', Category: cat, Amount: amt })),
      { Section: 'Total Revenue', Category: '', Amount: metrics.revenue },
      { Section: '', Category: '', Amount: '' },
      { Section: 'EXPENSES', Category: '', Amount: '' },
      ...Array.from(expenseByCat.entries()).map(([cat, amt]) => ({ Section: '', Category: cat, Amount: amt })),
      { Section: 'Total Expenses', Category: '', Amount: metrics.expenses },
      { Section: '', Category: '', Amount: '' },
      { Section: 'Net Profit', Category: '', Amount: metrics.netProfit },
    ];
    exportToExcel(rows as unknown as Record<string, unknown>[], 'income_statement.xlsx', 'Income Statement');
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm font-medium">Loading Executive Finance Center…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{error}</span>
        <button onClick={() => load()} className="text-xs font-bold text-red-700 hover:text-red-800 underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Executive Finance Center</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Comprehensive financial intelligence, statements, and compliance reporting.
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Module tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {MODULES.map(m => {
          const Icon = m.icon;
          const active = activeModule === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setActiveModule(m.key)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                active ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* ─── Module: Executive Overview ─────────────────────────────────────── */}
      {activeModule === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Revenue" value={fmtCurrency(metrics.revenue)} icon={ArrowUpCircle} iconBg="bg-emerald-50" iconColor="text-emerald-600" valueColor="text-emerald-700" />
            <KpiCard label="Total Expenses" value={fmtCurrency(metrics.expenses)} icon={ArrowDownCircle} iconBg="bg-red-50" iconColor="text-red-500" valueColor="text-red-600" />
            <KpiCard label="Gross Profit" value={fmtCurrency(metrics.grossProfit)} icon={TrendingUp} iconBg="bg-teal-50" iconColor="text-teal-600" valueColor={metrics.grossProfit >= 0 ? 'text-teal-700' : 'text-red-600'} />
            <KpiCard label="Net Profit" value={fmtCurrency(metrics.netProfit)} icon={Wallet} iconBg={metrics.netProfit >= 0 ? 'bg-teal-50' : 'bg-red-50'} iconColor={metrics.netProfit >= 0 ? 'text-teal-600' : 'text-red-500'} valueColor={metrics.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'} />
            <KpiCard label="Outstanding Receivables" value={fmtCurrency(metrics.outstandingReceivables)} icon={CreditCard} iconBg="bg-amber-50" iconColor="text-amber-600" valueColor="text-amber-700" />
            <KpiCard label="Cash Collected" value={fmtCurrency(metrics.cashCollected)} icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600" valueColor="text-emerald-700" />
            <KpiCard label="Sponsored Value" value={fmtCurrency(metrics.sponsoredValue)} icon={Gift} iconBg="bg-teal-50" iconColor="text-teal-600" valueColor="text-teal-700" />
            <KpiCard label="Refunds / Void" value={fmtCurrency(metrics.refunds)} icon={TrendingDown} iconBg="bg-slate-100" iconColor="text-slate-500" valueColor="text-slate-600" />
            <KpiCard
              label="Revenue Growth (MoM)"
              value={`${metrics.revenueGrowth >= 0 ? '+' : ''}${metrics.revenueGrowth.toFixed(1)}%`}
              icon={TrendingUp}
              iconBg={metrics.revenueGrowth >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
              iconColor={metrics.revenueGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}
              valueColor={metrics.revenueGrowth >= 0 ? 'text-emerald-700' : 'text-red-600'}
            />
          </div>

          <SectionCard title="Monthly Trend (Last 6 Months)" icon={BarChart3}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Income Trend</p>
                <LineChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.income }))} color="#0d9488" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Expense Trend</p>
                <LineChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.expense }))} color="#ef4444" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Net Profit Trend</p>
                <LineChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.net }))} color="#6366f1" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Monthly Summary Table" icon={Calendar}
            action={<button onClick={handleExportMonthly} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"><Download className="w-3.5 h-3.5" /> Excel</button>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="font-semibold px-3 py-2">Month</th>
                    <th className="font-semibold px-3 py-2 text-right">Income</th>
                    <th className="font-semibold px-3 py-2 text-right">Expense</th>
                    <th className="font-semibold px-3 py-2 text-right">Net</th>
                    <th className="font-semibold px-3 py-2 text-right">Collected</th>
                    <th className="font-semibold px-3 py-2 text-right">Billed</th>
                    <th className="font-semibold px-3 py-2 text-right">Bookings</th>
                    <th className="font-semibold px-3 py-2 text-right">New Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyAgg.map(m => (
                    <tr key={m.month} className="border-t border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-semibold text-slate-700">{monthLabel(m.month)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold">{fmtCurrency(m.income)}</td>
                      <td className="px-3 py-2.5 text-right text-red-500 font-semibold">{fmtCurrency(m.expense)}</td>
                      <td className={`px-3 py-2.5 text-right font-bold ${m.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{fmtCurrency(m.net)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold">{fmtCurrency(m.collected)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600 font-semibold">{fmtCurrency(m.billed)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{m.bookings}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{m.newClients}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ─── Module: Financial Statements ───────────────────────────────────── */}
      {activeModule === 'statements' && (
        <div className="space-y-5">
          {/* Income Statement */}
          <SectionCard title="Income Statement (Profit & Loss)" icon={FileText}
            action={<button onClick={handleExportIncomeStatement} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"><Download className="w-3.5 h-3.5" /> Excel</button>}
          >
            <IncomeStatementContent transactions={transactions} metrics={metrics} />
          </SectionCard>

          {/* Balance Sheet */}
          <ComingSoon
            title="Balance Sheet"
            message="Requires Accounting Module — a chart of accounts, asset/liability registers, and equity tracking are needed to generate a balance sheet. This is not available in the current system."
          />

          {/* Cash Flow Statement */}
          <ComingSoon
            title="Cash Flow Statement"
            message="Requires Accounting Module — cash flow categorization (operating, investing, financing) is not tracked in the current finance system."
          />

          {/* Trial Balance */}
          <ComingSoon
            title="Trial Balance"
            message="Requires Accounting Module — a double-entry ledger with debits and credits is needed to generate a trial balance."
          />

          {/* General Ledger */}
          <ComingSoon
            title="General Ledger"
            message="Requires Accounting Module — a chart of accounts and journal entry system are needed to generate a general ledger."
          />
        </div>
      )}

      {/* ─── Module: Government & Compliance ─────────────────────────────────── */}
      {activeModule === 'compliance' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3.5">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-sm text-blue-700 font-medium">
              Compliance reports below use existing financial data where available. Reports requiring dedicated tax/accounting fields are marked accordingly.
            </p>
          </div>

          {/* BIR-ready Sales Report */}
          <SectionCard title="BIR-Ready Sales Report" icon={ShieldCheck}
            action={<button onClick={() => {
              const rows = orders.filter(o => o.status !== 'void').map(o => ({
                'Date': fmtDate(o.created_at),
                'Client': o.clients?.full_name ?? '—',
                'Description': o.description ?? '—',
                'Amount': Number(o.total_amount),
                'Collected': o.paid_total,
                'Outstanding': o.outstanding,
                'Payment Type': o.payments.some(p => p.method === 'sponsored') ? 'Sponsored' : 'Standard',
              }));
              exportToExcel(rows, 'bir_sales_report.xlsx', 'Sales');
            }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"><Download className="w-3.5 h-3.5" /> Excel</button>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                    <th className="font-semibold px-3 py-2">Date</th>
                    <th className="font-semibold px-3 py-2">Client</th>
                    <th className="font-semibold px-3 py-2">Description</th>
                    <th className="font-semibold px-3 py-2 text-right">Amount</th>
                    <th className="font-semibold px-3 py-2 text-right">Collected</th>
                    <th className="font-semibold px-3 py-2 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.filter(o => o.status !== 'void').slice(0, 20).map(o => (
                    <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 text-slate-600">{fmtDate(o.created_at)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{o.clients?.full_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{o.description ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{fmtCurrency(Number(o.total_amount))}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">{fmtCurrency(o.paid_total)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-600">{fmtCurrency(o.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orders.filter(o => o.status !== 'void').length > 20 && (
                <p className="text-xs text-slate-400 mt-2 px-3">Showing 20 of {orders.filter(o => o.status !== 'void').length} records. Export for full list.</p>
              )}
            </div>
          </SectionCard>

          {/* Expense Summary */}
          <SectionCard title="Expense Summary" icon={Receipt}
            action={<button onClick={() => {
              const map = new Map<string, number>();
              transactions.filter(t => t.type === 'expense').forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount)));
              const rows = Array.from(map.entries()).map(([cat, amt]) => ({ Category: cat, Amount: amt }));
              exportToExcel(rows, 'expense_summary.xlsx', 'Expenses');
            }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"><Download className="w-3.5 h-3.5" /> Excel</button>}
          >
            <ExpenseSummaryContent transactions={transactions} />
          </SectionCard>

          {/* VAT / Withholding / Payroll */}
          <ComingSoon
            title="VAT Sales Summary"
            message="Requires Accounting Module — VAT-inclusive/exclusive tracking on transactions is not available in the current schema. Tax fields must be added before this report can be generated."
          />
          <ComingSoon
            title="VAT Purchases Summary"
            message="Requires Accounting Module — supplier invoice VAT tracking is not available. The inventory_suppliers table exists but does not store VAT data."
          />
          <ComingSoon
            title="Withholding Tax Summary"
            message="Requires Accounting Module — withholding tax categories and rates are not tracked in the current system."
          />
          <ComingSoon
            title="Payroll Summary"
            message="Requires Payroll Module — salary, deductions, and withholding data are not tracked. The system records attendance but not payroll amounts."
          />
        </div>
      )}

      {/* ─── Module: Accounts Receivable ────────────────────────────────────── */}
      {activeModule === 'receivables' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Outstanding" value={fmtCurrency(arSummary.totalOutstanding)} icon={CreditCard} iconBg="bg-red-50" iconColor="text-red-500" valueColor="text-red-600" />
            <KpiCard label="Paid Clients" value={String(arSummary.paid)} icon={ShieldCheck} iconBg="bg-emerald-50" iconColor="text-emerald-600" valueColor="text-emerald-700" />
            <KpiCard label="Partial Payment" value={String(arSummary.partial)} icon={Clock} iconBg="bg-amber-50" iconColor="text-amber-500" valueColor="text-amber-600" />
            <KpiCard label="Unpaid Clients" value={String(arSummary.unpaid)} icon={AlertCircle} iconBg="bg-red-50" iconColor="text-red-500" valueColor="text-red-600" />
          </div>

          {/* Aging */}
          <SectionCard title="Receivables Aging" icon={Clock}>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Current', value: arSummary.aging.current, cls: 'bg-emerald-50 text-emerald-700' },
                { label: '1–30 days', value: arSummary.aging.d1_30, cls: 'bg-amber-50 text-amber-700' },
                { label: '31–60 days', value: arSummary.aging.d31_60, cls: 'bg-orange-50 text-orange-700' },
                { label: '61–90 days', value: arSummary.aging.d61_90, cls: 'bg-red-50 text-red-700' },
                { label: '90+ days', value: arSummary.aging.d90plus, cls: 'bg-red-100 text-red-800' },
              ].map(b => (
                <div key={b.label} className={`rounded-xl p-4 ${b.cls}`}>
                  <p className="text-xl font-bold">{fmtCurrency(b.value)}</p>
                  <p className="text-xs font-semibold mt-0.5">{b.label}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* AR Table */}
          <SectionCard title="Client Balances" icon={Users}
            action={<button onClick={handleExportAR} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors"><Download className="w-3.5 h-3.5" /> Excel</button>}
          >
            {arData.length === 0 ? (
              <div className="py-10 text-center">
                <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-500">No receivables data</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="font-semibold px-3 py-2">Client</th>
                      <th className="font-semibold px-3 py-2 text-right">Billed</th>
                      <th className="font-semibold px-3 py-2 text-right">Paid</th>
                      <th className="font-semibold px-3 py-2 text-right">Outstanding</th>
                      <th className="font-semibold px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arData.slice(0, 30).map(a => {
                      const status = a.outstanding <= 0 ? 'paid' : a.total_paid > 0 ? 'partial' : 'unpaid';
                      const cfg = status === 'paid' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : status === 'partial' ? 'text-amber-700 bg-amber-50 border-amber-200'
                        : 'text-red-700 bg-red-50 border-red-200';
                      return (
                        <tr key={a.client_id} className="border-t border-slate-50 hover:bg-slate-50/60">
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{a.full_name}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{fmtCurrency(a.total_billed)}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-600">{fmtCurrency(a.total_paid)}</td>
                          <td className={`px-3 py-2.5 text-right font-bold ${a.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}>{fmtCurrency(a.outstanding)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${cfg}`}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {arData.length > 30 && <p className="text-xs text-slate-400 mt-2 px-3">Showing 30 of {arData.length} clients. Export for full list.</p>}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ─── Module: Accounts Payable ────────────────────────────────────────── */}
      {activeModule === 'payables' && (
        <div className="space-y-5">
          {suppliers.length > 0 ? (
            <SectionCard title="Supplier Directory" icon={Building2}>
              <p className="text-sm text-slate-500 mb-4">
                The system has {suppliers.length} supplier(s) on record. However, outstanding payables, invoice amounts, and due dates are not tracked in the current schema. To enable full accounts payable reporting, a supplier invoices/payables module would need to be added.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      <th className="font-semibold px-3 py-2">Supplier Name</th>
                      <th className="font-semibold px-3 py-2">Status</th>
                      <th className="font-semibold px-3 py-2 text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map(s => (
                      <tr key={s.id} className="border-t border-slate-50">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{s.name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${s.status === 'active' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-600 bg-slate-100 border-slate-200'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400">Not tracked</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : (
            <ComingSoon
              title="Accounts Payable"
              message="No supplier data found. A supplier invoices/payables module is needed to track outstanding payables, due dates, and payment status."
            />
          )}
          <ComingSoon
            title="Outstanding Payables & Due Dates"
            message="Requires Accounts Payable Module — supplier invoice amounts, due dates, and payment tracking are not available in the current schema."
          />
        </div>
      )}

      {/* ─── Module: Budget vs Actual ───────────────────────────────────────── */}
      {activeModule === 'budget' && (
        <ComingSoon
          title="Budget vs Actual"
          message="Requires Budget Module — budget targets, categories, and periods are not tracked in the current system. A budget management module would need to be added to compare planned vs actual spending."
        />
      )}

      {/* ─── Module: Business Analytics ─────────────────────────────────────── */}
      {activeModule === 'analytics' && (
        <div className="space-y-5">
          <SectionCard title="Revenue vs Expense Trend" icon={BarChart3}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Revenue Trend</p>
                <LineChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.income }))} color="#0d9488" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Expense Trend</p>
                <LineChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.expense }))} color="#ef4444" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Profit Trend" icon={TrendingUp}>
            <LineChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.net }))} color="#6366f1" height={200} />
          </SectionCard>

          <SectionCard title="Top-Performing Services (by Collected Revenue)" icon={Package}>
            {serviceData.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 font-medium">No service revenue data available.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {serviceData.map((s, i) => {
                  const maxRev = serviceData[0].revenue || 1;
                  return (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-400 w-6">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold text-slate-700 truncate">{s.name}</p>
                          <p className="text-sm font-bold text-teal-700 ml-2">{fmtCurrency(s.revenue)}</p>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(s.revenue / maxRev) * 100}%` }} />
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{s.count} order{s.count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Client & Booking Growth" icon={Users}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">New Clients per Month</p>
                <MiniBarChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.newClients }))} color="bg-blue-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Bookings per Month</p>
                <MiniBarChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.bookings }))} color="bg-violet-400" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Payment Collection Trend" icon={CreditCard}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Collected per Month</p>
                <MiniBarChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.collected }))} color="bg-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Billed per Month</p>
                <MiniBarChart data={monthlyAgg.map(m => ({ label: monthLabel(m.month), value: m.billed }))} color="bg-amber-400" />
              </div>
            </div>
          </SectionCard>

          <ComingSoon
            title="Service Profitability (Cost-Adjusted)"
            message="Requires Cost Tracking Module — service-level cost of goods sold (COGS) is not tracked. Revenue per service is shown above, but profit margin requires cost data."
          />
        </div>
      )}

      {/* ─── Module: Export & Reports ───────────────────────────────────────── */}
      {activeModule === 'export' && (
        <div className="space-y-5">
          <SectionCard title="Export Financial Data" icon={Download}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ExportButton label="All Finance Transactions" desc="Complete income & expense ledger" onClick={handleExportTransactions} icon={Receipt} />
              <ExportButton label="Income Statement (P&L)" desc="Revenue and expenses by category" onClick={handleExportIncomeStatement} icon={FileText} />
              <ExportButton label="Accounts Receivable" desc="Client balances and outstanding" onClick={handleExportAR} icon={CreditCard} />
              <ExportButton label="Monthly Summary" desc="6-month income, expense, net, bookings" onClick={handleExportMonthly} icon={BarChart3} />
              <ExportButton label="BIR-Ready Sales Report" desc="All sales transactions" onClick={() => {
                const rows = orders.filter(o => o.status !== 'void').map(o => ({
                  Date: fmtDate(o.created_at), Client: o.clients?.full_name ?? '—',
                  Description: o.description ?? '—', Amount: Number(o.total_amount),
                  Collected: o.paid_total, Outstanding: o.outstanding,
                }));
                exportToExcel(rows, 'bir_sales_report.xlsx', 'Sales');
              }} icon={ShieldCheck} />
              <ExportButton label="Expense Summary" desc="Expenses grouped by category" onClick={() => {
                const map = new Map<string, number>();
                transactions.filter(t => t.type === 'expense').forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount)));
                exportToExcel(Array.from(map.entries()).map(([cat, amt]) => ({ Category: cat, Amount: amt })), 'expense_summary.xlsx', 'Expenses');
              }} icon={ArrowDownCircle} />
            </div>
          </SectionCard>

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3.5">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <p className="text-sm text-blue-700 font-medium">
              All exports are generated in Excel (.xlsx) format using existing financial data. PDF export requires a server-side rendering service which is not currently configured.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ExportButton({ label, desc, onClick, icon: Icon }: {
  label: string;
  desc: string;
  onClick: () => void;
  icon: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-xl border border-slate-100 hover:border-teal-200 hover:bg-teal-50 transition-colors text-left"
    >
      <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-teal-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      <Download className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </button>
  );
}

function IncomeStatementContent({ transactions, metrics }: {
  transactions: FinanceTransaction[];
  metrics: { revenue: number; expenses: number; netProfit: number };
}) {
  const incomeByCat = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter(t => t.type === 'income').forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const expenseByCat = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter(t => t.type === 'expense').forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-3">Revenue</h4>
        <div className="space-y-2">
          {incomeByCat.map(([cat, amt]) => (
            <div key={cat} className="flex items-center justify-between py-1.5 border-b border-slate-50">
              <span className="text-sm text-slate-600">{cat}</span>
              <span className="text-sm font-semibold text-emerald-600">{fmtCurrency(amt)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-slate-700">Total Revenue</span>
            <span className="text-sm font-extrabold text-emerald-700">{fmtCurrency(metrics.revenue)}</span>
          </div>
        </div>
      </div>
      <div>
        <h4 className="text-xs font-bold text-red-500 uppercase tracking-wide mb-3">Expenses</h4>
        <div className="space-y-2">
          {expenseByCat.map(([cat, amt]) => (
            <div key={cat} className="flex items-center justify-between py-1.5 border-b border-slate-50">
              <span className="text-sm text-slate-600">{cat}</span>
              <span className="text-sm font-semibold text-red-500">{fmtCurrency(amt)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-slate-700">Total Expenses</span>
            <span className="text-sm font-extrabold text-red-600">{fmtCurrency(metrics.expenses)}</span>
          </div>
        </div>
      </div>
      <div className="md:col-span-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-bold text-slate-800">Net Profit</span>
          <span className={`text-lg font-extrabold ${metrics.netProfit >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
            {fmtCurrency(metrics.netProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ExpenseSummaryContent({ transactions }: { transactions: FinanceTransaction[] }) {
  const expenseByCat = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter(t => t.type === 'expense').forEach(t => map.set(t.category, (map.get(t.category) ?? 0) + Number(t.amount)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const total = expenseByCat.reduce((s, [, amt]) => s + amt, 0);

  if (expenseByCat.length === 0) {
    return (
      <div className="py-8 text-center">
        <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 font-medium">No expense data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {expenseByCat.map(([cat, amt]) => (
        <div key={cat}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700">{cat}</span>
            <span className="text-sm font-bold text-red-500">{fmtCurrency(amt)}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-red-400 rounded-full" style={{ width: `${total > 0 ? (amt / total) * 100 : 0}%` }} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{total > 0 ? ((amt / total) * 100).toFixed(1) : 0}% of total</p>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-sm font-bold text-slate-800">Total Expenses</span>
        <span className="text-sm font-extrabold text-red-600">{fmtCurrency(total)}</span>
      </div>
    </div>
  );
}
