import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Calendar,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  AlertCircle,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  Building2,
  Smartphone,
  Landmark,
  Layers,
} from 'lucide-react';
import { supabase, type Branch } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportMode = 'eod' | 'mtd';

interface ReportMetrics {
  appointmentsCompleted: number;
  appointmentsScheduled: number;
  revenueCollected: number;
  newOrdersBilled: number;
  outstandingAdded: number;
  expenses: number;
  net: number;
}

interface MethodBreakdown {
  cash: number;
  gcash: number;
  bank: number;
  card: number;
  other: number;
}

interface ReportResult {
  summary: ReportMetrics;
  byBranch: Array<{ id: string; name: string; metrics: ReportMetrics }>;
  methodBreakdown: MethodBreakdown;
  branches: Branch[];
  startDate: string;
  endDate: string;
}

interface RawAppt { id: string; branch_id: string; status: string; }
interface RawOrder { id: string; total_amount: number; appointment_id: string | null; }
interface RawPayment { id: string; amount: number; method: string; order_id: string; }
interface RawIncomeTx { amount: number; }

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_METRICS: ReportMetrics = {
  appointmentsCompleted: 0,
  appointmentsScheduled: 0,
  revenueCollected: 0,
  newOrdersBilled: 0,
  outstandingAdded: 0,
  expenses: 0,
  net: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstOfMonth(d: string) {
  const [y, m] = d.split('-');
  return `${y}-${m}-01`;
}

function nextDay(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return dt.toISOString().split('T')[0];
}

function getDateRange(date: string, mode: ReportMode) {
  return mode === 'eod'
    ? { start: date, end: date }
    : { start: firstOfMonth(date), end: date };
}

function fmtDay(d: string) {
  const [y, m, day] = d.split('-');
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtRangeLabel(start: string, end: string) {
  if (start === end) return fmtDay(start);
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  const s = new Date(Number(sy), Number(sm) - 1, Number(sd)).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const e = new Date(Number(ey), Number(em) - 1, Number(ed)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}

// ─── Metric computation ───────────────────────────────────────────────────────

function computeMetrics(
  appts: RawAppt[],
  orders: RawOrder[],
  pmts: RawPayment[],
  exps: { amount: number }[],
  manualIncome: RawIncomeTx[],
  branchId: string | null,
  apptBranchMap: Map<string, string>,
  orderApptMap: Map<string, string | null>,
): ReportMetrics {
  function orderBranch(o: RawOrder) {
    if (!o.appointment_id) return null;
    return apptBranchMap.get(o.appointment_id) ?? null;
  }
  function pmtBranch(p: RawPayment) {
    const apptId = orderApptMap.get(p.order_id);
    if (!apptId) return null;
    return apptBranchMap.get(apptId) ?? null;
  }

  const fa = branchId ? appts.filter(a => a.branch_id === branchId) : appts;
  const fo = branchId ? orders.filter(o => orderBranch(o) === branchId) : orders;
  const fp = branchId ? pmts.filter(p => pmtBranch(p) === branchId) : pmts;

  // Payment-linked revenue (branch-attributable); manual income has no branch so included in totals only
  const pmtRevenue    = fp.reduce((s, p) => s + Number(p.amount), 0);
  const manualRevenue = branchId ? 0 : manualIncome.reduce((s, t) => s + Number(t.amount), 0);
  const revenue       = pmtRevenue + manualRevenue;
  const billed        = fo.reduce((s, o) => s + Number(o.total_amount), 0);
  const expenses      = branchId ? 0 : exps.reduce((s, e) => s + Number(e.amount), 0);

  return {
    appointmentsCompleted: fa.filter(a => a.status === 'completed').length,
    appointmentsScheduled: fa.length,
    revenueCollected: revenue,
    newOrdersBilled: billed,
    outstandingAdded: billed - revenue,
    expenses,
    net: revenue - expenses,
  };
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchReportData(startDate: string, endDate: string): Promise<ReportResult> {
  const nd = nextDay(endDate);

  const [
    { data: rawAppts },
    { data: rawOrders },
    { data: rawPmts },
    { data: rawExps },
    { data: rawManualIncome },
    { data: rawBranches },
  ] = await Promise.all([
    supabase.from('appointments').select('id, branch_id, status')
      .gte('scheduled_date', startDate).lte('scheduled_date', endDate),

    supabase.from('orders').select('id, total_amount, appointment_id')
      .gte('created_at', startDate).lt('created_at', nd).neq('status', 'void'),

    supabase.from('payments').select('id, amount, method, order_id')
      .gte('paid_at', startDate).lt('paid_at', nd),

    supabase.from('finance_transactions').select('amount')
      .eq('type', 'expense').gte('date', startDate).lte('date', endDate),

    supabase.from('finance_transactions').select('amount')
      .eq('type', 'income').is('appointment_id', null)
      .gte('date', startDate).lte('date', endDate),

    supabase.from('branches').select('id, name, is_active, created_at')
      .eq('is_active', true).order('name'),
  ]);

  const appts        = (rawAppts        ?? []) as RawAppt[];
  const orders       = (rawOrders       ?? []) as RawOrder[];
  const pmts         = (rawPmts         ?? []) as RawPayment[];
  const exps         = (rawExps         ?? []) as { amount: number }[];
  const manualIncome = (rawManualIncome ?? []) as RawIncomeTx[];
  const branches     = (rawBranches     ?? []) as Branch[];

  // Build lookup maps
  const apptBranchMap = new Map<string, string>(appts.map(a => [a.id, a.branch_id]));
  const orderApptMap  = new Map<string, string | null>(orders.map(o => [o.id, o.appointment_id]));

  // Fetch appointment branches for orders/payments that reference out-of-range appointments
  const missingOrderIds = [...new Set(pmts.map(p => p.order_id).filter(id => !orderApptMap.has(id)))];
  if (missingOrderIds.length > 0) {
    const { data: extraOrders } = await supabase
      .from('orders').select('id, appointment_id').in('id', missingOrderIds);
    (extraOrders ?? []).forEach((o: { id: string; appointment_id: string | null }) =>
      orderApptMap.set(o.id, o.appointment_id));
  }

  const missingApptIds = new Set<string>();
  orderApptMap.forEach(apptId => {
    if (apptId && !apptBranchMap.has(apptId)) missingApptIds.add(apptId);
  });
  orders.forEach(o => {
    if (o.appointment_id && !apptBranchMap.has(o.appointment_id)) missingApptIds.add(o.appointment_id);
  });

  if (missingApptIds.size > 0) {
    const { data: extraAppts } = await supabase
      .from('appointments').select('id, branch_id').in('id', Array.from(missingApptIds));
    (extraAppts ?? []).forEach((a: { id: string; branch_id: string }) =>
      apptBranchMap.set(a.id, a.branch_id));
  }

  const summary  = computeMetrics(appts, orders, pmts, exps, manualIncome, null, apptBranchMap, orderApptMap);
  const byBranch = branches.map(b => ({
    id: b.id, name: b.name,
    metrics: computeMetrics(appts, orders, pmts, exps, manualIncome, b.id, apptBranchMap, orderApptMap),
  }));

  const methodBreakdown: MethodBreakdown = { cash: 0, gcash: 0, bank: 0, card: 0, other: 0 };
  for (const p of pmts) {
    const m = p.method as keyof MethodBreakdown;
    if (m in methodBreakdown) methodBreakdown[m] += Number(p.amount);
    else methodBreakdown.other += Number(p.amount);
  }

  return { summary, byBranch, methodBreakdown, branches, startDate, endDate };
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  valueColor,
  currency = false,
  dimmed = false,
}: {
  label: string;
  value: number | null;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
  currency?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${dimmed ? 'border-slate-100 opacity-60' : 'border-slate-100'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
      </div>
      {value === null ? (
        <p className="text-2xl font-bold text-slate-300">—</p>
      ) : (
        <p className={`text-2xl font-extrabold ${valueColor ?? 'text-slate-700'}`}>
          {currency ? fmtCurrency(value) : value.toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ─── Branch table row ─────────────────────────────────────────────────────────

function BranchRow({
  label,
  metrics,
  isTotals = false,
}: {
  label: string;
  metrics: ReportMetrics;
  isTotals?: boolean;
}) {
  const cls = isTotals
    ? 'bg-slate-50 font-bold'
    : 'bg-white';
  const textCls = isTotals ? 'text-slate-900 text-sm font-bold' : 'text-slate-700 text-sm font-semibold';
  const numCls = isTotals ? 'text-sm font-extrabold' : 'text-sm font-semibold';

  return (
    <div className={`grid grid-cols-[140px_70px_70px_110px_110px_110px_100px_110px] gap-2 px-4 py-3 border-t border-slate-100 items-center ${cls}`}>
      <p className={`${textCls} truncate`}>
        {isTotals ? (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
            {label}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            {label}
          </span>
        )}
      </p>
      <p className={`${numCls} text-right text-emerald-700`}>{metrics.appointmentsCompleted}</p>
      <p className={`${numCls} text-right text-blue-600`}>{metrics.appointmentsScheduled}</p>
      <p className={`${numCls} text-right text-teal-700`}>{fmtCurrency(metrics.revenueCollected)}</p>
      <p className={`${numCls} text-right text-slate-700`}>{fmtCurrency(metrics.newOrdersBilled)}</p>
      <p className={`${numCls} text-right ${metrics.outstandingAdded > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
        {fmtCurrency(metrics.outstandingAdded)}
      </p>
      {isTotals ? (
        <>
          <p className={`${numCls} text-right text-red-500`}>{fmtCurrency(metrics.expenses)}</p>
          <p className={`${numCls} text-right ${metrics.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
            {fmtCurrency(metrics.net)}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300 text-right">—</p>
          <p className="text-sm text-slate-300 text-right">—</p>
        </>
      )}
    </div>
  );
}

// ─── Main ReportsTab ──────────────────────────────────────────────────────────

export default function ReportsTab() {
  const [mode, setMode]               = useState<ReportMode>('eod');
  const [date, setDate]               = useState(todayStr());
  const [branchFilter, setBranchFilter] = useState('all');

  const [reportData, setReportData]   = useState<ReportResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { start, end } = getDateRange(date, mode);
    try {
      const result = await fetchReportData(start, end);
      setReportData(result);
    } catch {
      setError('Failed to load report data. Please try again.');
    }
    setLoading(false);
  }, [date, mode]);

  useEffect(() => { load(); }, [load]);

  // Resolve which metrics to show in summary cards
  const summaryMetrics: ReportMetrics = (() => {
    if (!reportData) return EMPTY_METRICS;
    if (branchFilter === 'all') return reportData.summary;
    return reportData.byBranch.find(b => b.id === branchFilter)?.metrics ?? EMPTY_METRICS;
  })();

  const isBranchSpecific = branchFilter !== 'all';
  const rangeLabel = reportData
    ? fmtRangeLabel(reportData.startDate, reportData.endDate)
    : '—';

  const netColor = summaryMetrics.net >= 0 ? 'text-teal-700' : 'text-red-600';

  const METHOD_CONFIG: Array<{
    key: keyof MethodBreakdown;
    label: string;
    icon: React.ElementType;
    color: string;
    bg: string;
  }> = [
    { key: 'cash',  label: 'Cash',          icon: Wallet,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { key: 'gcash', label: 'GCash',          icon: Smartphone, color: 'text-blue-700',   bg: 'bg-blue-50' },
    { key: 'bank',  label: 'Bank Transfer',  icon: Landmark,  color: 'text-violet-700',  bg: 'bg-violet-50' },
    { key: 'card',  label: 'Card',           icon: CreditCard, color: 'text-amber-700',  bg: 'bg-amber-50' },
    { key: 'other', label: 'Other',          icon: Layers,    color: 'text-slate-600',   bg: 'bg-slate-100' },
  ];

  return (
    <div className="space-y-6">

      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Branch filter */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              branchFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            All Branches
          </button>
          {(reportData?.branches ?? []).map(b => (
            <button
              key={b.id}
              onClick={() => setBranchFilter(b.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                branchFilter === b.id ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3.5 py-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          />
        </div>

        {/* EOD / MTD toggle */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1">
          {(['eod', 'mtd'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                mode === m ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50 ml-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Range label */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl">
          <Clock className="w-4 h-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">{rangeLabel}</p>
          <span className={`ml-1 px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
            mode === 'eod' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
          }`}>{mode}</span>
        </div>
        {isBranchSpecific && (
          <span className="text-xs text-slate-400 italic">
            Expenses and Net shown for selected branch only (revenue basis, no expense attribution)
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading overlay */}
      {loading && !reportData && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Loading report…</span>
        </div>
      )}

      {(reportData || loading) && (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>

          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="Appointments Completed"
              value={summaryMetrics.appointmentsCompleted}
              icon={CheckCircle}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              valueColor="text-emerald-700"
            />
            <MetricCard
              label="Appointments Scheduled"
              value={summaryMetrics.appointmentsScheduled}
              icon={Clock}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
              valueColor="text-blue-700"
            />
            <MetricCard
              label="Revenue Collected"
              value={summaryMetrics.revenueCollected}
              icon={ArrowUpCircle}
              iconBg="bg-teal-50"
              iconColor="text-teal-600"
              valueColor="text-teal-700"
              currency
            />
            <MetricCard
              label="New Orders Billed"
              value={summaryMetrics.newOrdersBilled}
              icon={TrendingUp}
              iconBg="bg-slate-100"
              iconColor="text-slate-500"
              valueColor="text-slate-700"
              currency
            />
            <MetricCard
              label="Outstanding Added"
              value={summaryMetrics.outstandingAdded}
              icon={TrendingDown}
              iconBg="bg-amber-50"
              iconColor="text-amber-500"
              valueColor={summaryMetrics.outstandingAdded > 0 ? 'text-amber-600' : 'text-slate-400'}
              currency
            />
            <MetricCard
              label="Expenses"
              value={isBranchSpecific ? null : summaryMetrics.expenses}
              icon={ArrowDownCircle}
              iconBg="bg-red-50"
              iconColor="text-red-500"
              valueColor="text-red-600"
              currency
              dimmed={isBranchSpecific}
            />
            <MetricCard
              label="Net (Revenue − Expenses)"
              value={isBranchSpecific ? null : summaryMetrics.net}
              icon={Wallet}
              iconBg={isBranchSpecific ? 'bg-slate-100' : summaryMetrics.net >= 0 ? 'bg-teal-50' : 'bg-red-50'}
              iconColor={isBranchSpecific ? 'text-slate-400' : summaryMetrics.net >= 0 ? 'text-teal-600' : 'text-red-500'}
              valueColor={isBranchSpecific ? undefined : netColor}
              currency
              dimmed={isBranchSpecific}
            />
          </div>

          {/* ── Per-branch breakdown table ─────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">
              Branch Breakdown
            </h3>
            <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-[780px]">
                  {/* Header */}
                  <div className="grid grid-cols-[140px_70px_70px_110px_110px_110px_100px_110px] gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                    {[
                      { label: 'Branch', align: 'left' },
                      { label: 'Done', align: 'right' },
                      { label: 'Sched.', align: 'right' },
                      { label: 'Collected', align: 'right' },
                      { label: 'Billed', align: 'right' },
                      { label: 'Outstanding+', align: 'right' },
                      { label: 'Expenses', align: 'right' },
                      { label: 'Net', align: 'right' },
                    ].map(col => (
                      <p
                        key={col.label}
                        className={`text-xs font-bold text-slate-400 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : ''}`}
                      >
                        {col.label}
                      </p>
                    ))}
                  </div>

                  {/* Branch rows */}
                  {(reportData?.byBranch ?? []).map(b => (
                    <BranchRow key={b.id} label={b.name} metrics={b.metrics} />
                  ))}

                  {/* Totals row */}
                  {reportData && (
                    <BranchRow label="Totals" metrics={reportData.summary} isTotals />
                  )}
                </div>
              </div>

              {/* Table footnote */}
              <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[11px] text-slate-400">
                  * Expenses are not branch-attributed and appear in the Totals row only. Outstanding+ = New Orders Billed − Revenue Collected for the period.
                </p>
              </div>
            </div>
          </div>

          {/* ── Payment method breakdown ───────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">
              Payment Method Breakdown
              <span className="ml-2 text-slate-300 normal-case tracking-normal font-normal text-xs">
                — all branches, revenue collected in period
              </span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {METHOD_CONFIG.map(({ key, label, icon: Icon, color, bg }) => {
                const amount = reportData?.methodBreakdown[key] ?? 0;
                const total  = reportData?.summary.revenueCollected ?? 0;
                const pct    = total > 0 ? Math.round((amount / total) * 100) : 0;
                return (
                  <div key={key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <p className={`text-xs font-bold uppercase tracking-wide ${color}`}>{label}</p>
                    </div>
                    <p className={`text-xl font-extrabold ${color}`}>{fmtCurrency(amount)}</p>
                    {total > 0 && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${bg.replace('bg-', 'bg-').replace('-50', '-400').replace('-100', '-500')}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 font-semibold">{pct}% of collected</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
