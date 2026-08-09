import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Plus, TrendingUp, TrendingDown,
  Wallet, Calendar, Receipt, X, CreditCard, CheckCircle, Gift,
} from 'lucide-react';
import {
  supabase, type FinanceTransaction, type Payment, EXPENSE_CATEGORIES,
} from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  userEmail: string;
}

interface PaymentRow extends Payment {
  appointments?: { service: string | null; scheduled_date: string } | null;
  clients?: { full_name: string } | null;
}

type DayKey = string;

interface DaySummary {
  date: DayKey;
  sales: number;
  salesCount: number;
  expenses: number;
  expenseCount: number;
  net: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeso(n: number): string {
  return `\u20b1${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', bank: 'Bank Transfer', card: 'Card', other: 'Other', sponsored: 'Sponsored',
};

// ─── Add Expense Modal ────────────────────────────────────────────────────────

function AddExpenseModal({ userEmail, onSaved, onClose }: { userEmail: string; onSaved: () => void; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter a valid amount greater than 0.'); return; }
    if (!description.trim()) { setErr('Description is required.'); return; }
    if (!date) { setErr('Select a date.'); return; }
    setSaving(true);
    setErr(null);

    const { error } = await supabase.from('finance_transactions').insert({
      type: 'expense',
      amount: amt,
      category,
      description: description.trim(),
      date,
      notes: notes.trim() || null,
      created_by_email: userEmail,
    });

    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="rounded-t-3xl px-6 pt-6 pb-5 sticky top-0 z-10 bg-red-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Add Expense</h2>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-black/10 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Amount (PHP)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">\u20b1</span>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="e.g. IV supplies purchase, transport cost..."
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent">
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Notes <span className="text-slate-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Additional details..."
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none" />
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SalesDailyExpenses({ userEmail }: Props) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<FinanceTransaction[]>([]);
  const [sponsoredTxns, setSponsoredTxns] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [payRes, expRes, sponsoredRes] = await Promise.all([
        supabase
          .from('payments')
          .select('id, order_id, client_id, amount, method, reference, paid_at, recorded_by, appointment_id, appointments(service, scheduled_date), clients(full_name)')
          .order('paid_at', { ascending: false })
          .limit(500),
        supabase
          .from('finance_transactions')
          .select('*')
          .eq('type', 'expense')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('finance_transactions')
          .select('*')
          .eq('type', 'income')
          .eq('category', 'Sponsored Treatment')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      if (payRes.error) throw payRes.error;
      if (expRes.error) throw expRes.error;
      if (sponsoredRes.error) throw sponsoredRes.error;

      setPayments((payRes.data ?? []) as PaymentRow[]);
      setExpenses((expRes.data ?? []) as FinanceTransaction[]);
      setSponsoredTxns((sponsoredRes.data ?? []) as FinanceTransaction[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Group payments by date (YYYY-MM-DD from paid_at)
  const paymentsByDate = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    if (!p.paid_at) continue;
    const day = p.paid_at.slice(0, 10);
    if (!paymentsByDate.has(day)) paymentsByDate.set(day, []);
    paymentsByDate.get(day)!.push(p);
  }

  // Group expenses by date
  const expensesByDate = new Map<string, FinanceTransaction[]>();
  for (const e of expenses) {
    const day = e.date;
    if (!expensesByDate.has(day)) expensesByDate.set(day, []);
    expensesByDate.get(day)!.push(e);
  }

  // Build day summaries (union of all dates)
  const allDates = new Set<string>([...paymentsByDate.keys(), ...expensesByDate.keys()]);
  const daySummaries: DaySummary[] = Array.from(allDates).sort((a, b) => b.localeCompare(a)).map(date => {
    const dayPayments = paymentsByDate.get(date) ?? [];
    const dayExpenses = expensesByDate.get(date) ?? [];
    const sales = dayPayments.reduce((s, p) => s + Number(p.amount), 0);
    const exp = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);
    return {
      date,
      sales,
      salesCount: dayPayments.length,
      expenses: exp,
      expenseCount: dayExpenses.length,
      net: sales - exp,
    };
  });

  // Selected day details
  const selectedDayPayments = paymentsByDate.get(selectedDate) ?? [];
  const selectedDayExpenses = expensesByDate.get(selectedDate) ?? [];
  const selectedSummary = daySummaries.find(d => d.date === selectedDate) ?? {
    date: selectedDate, sales: 0, salesCount: 0, expenses: 0, expenseCount: 0, net: 0,
  };

  // Overall totals
  const totalSales = payments.filter(p => p.method !== 'sponsored').reduce((s, p) => s + Number(p.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalSponsoredValue = sponsoredTxns.reduce((s, t) => s + Number(t.amount), 0);
  const totalNet = totalSales - totalExpenses;

  // Payment method breakdown for selected day
  const methodBreakdown = new Map<string, number>();
  for (const p of selectedDayPayments) {
    const key = p.method ?? 'other';
    methodBreakdown.set(key, (methodBreakdown.get(key) ?? 0) + Number(p.amount));
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2 justify-end">
        <button onClick={loadData} disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      {/* Overall summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sales</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{fmtPeso(totalSales)}</p>
          <p className="text-xs text-slate-400 mt-1">{payments.filter(p => p.method !== 'sponsored').length} payment records</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
              <Gift className="w-4 h-4 text-teal-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sponsored Value</p>
          </div>
          <p className="text-2xl font-bold text-teal-600">{fmtPeso(totalSponsoredValue)}</p>
          <p className="text-xs text-slate-400 mt-1">{sponsoredTxns.length} sponsored services</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Expenses</p>
          </div>
          <p className="text-2xl font-bold text-red-500">{fmtPeso(totalExpenses)}</p>
          <p className="text-xs text-slate-400 mt-1">{expenses.length} expense entries</p>
        </div>
        <div className={`rounded-xl border p-4 ${totalNet >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-red-50 border-red-100'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${totalNet >= 0 ? 'bg-teal-100' : 'bg-red-100'}`}>
              <Wallet className={`w-4 h-4 ${totalNet >= 0 ? 'text-teal-600' : 'text-red-500'}`} />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Total</p>
          </div>
          <p className={`text-2xl font-bold ${totalNet >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{fmtPeso(totalNet)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
          <p className="text-sm font-semibold text-red-600">{error}</p>
          <button onClick={loadData} className="mt-3 text-sm text-teal-600 font-medium hover:underline">Try again</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
          {/* Daily summary table */}
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Daily Summary</p>
            </div>
            <div className="overflow-y-auto max-h-[480px]">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-sm">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Sales</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Expenses</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {daySummaries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">No records found</td>
                    </tr>
                  ) : daySummaries.map(d => (
                    <tr
                      key={d.date}
                      onClick={() => setSelectedDate(d.date)}
                      className={`cursor-pointer transition-colors ${selectedDate === d.date ? 'bg-teal-50/60' : 'hover:bg-slate-50/50'}`}
                    >
                      <td className="px-4 py-2.5 text-sm text-slate-600">{fmtDate(d.date)}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-emerald-600 text-right">{fmtPeso(d.sales)}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-red-500 text-right">{fmtPeso(d.expenses)}</td>
                      <td className={`px-4 py-2.5 text-sm font-bold text-right ${d.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{fmtPeso(d.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected day detail */}
          <div className="space-y-4">
            {/* Day summary card */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{fmtDate(selectedDate)}</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Sales</p>
                  <p className="text-lg font-bold text-emerald-600">{fmtPeso(selectedSummary.sales)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedSummary.salesCount} payments</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Expenses</p>
                  <p className="text-lg font-bold text-red-500">{fmtPeso(selectedSummary.expenses)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{selectedSummary.expenseCount} entries</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-400 mb-1">Net</p>
                  <p className={`text-lg font-bold ${selectedSummary.net >= 0 ? 'text-teal-700' : 'text-red-600'}`}>{fmtPeso(selectedSummary.net)}</p>
                </div>
              </div>

              {/* Payment method breakdown */}
              {methodBreakdown.size > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Breakdown</p>
                  <div className="space-y-1.5">
                    {Array.from(methodBreakdown.entries()).map(([method, amount]) => (
                      <div key={method} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600 flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                          {PAYMENT_METHOD_LABEL[method] ?? method}
                        </span>
                        <span className="font-semibold text-slate-700">{fmtPeso(amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sales transactions for the day */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-700">Sales Transactions</p>
                <span className="ml-auto text-xs font-semibold text-slate-400">{selectedDayPayments.length}</span>
              </div>
              <div className="overflow-y-auto max-h-[200px] divide-y divide-slate-50">
                {selectedDayPayments.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No sales on this date</p>
                ) : selectedDayPayments.map(p => (
                  <div key={p.id} className="px-5 py-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{p.clients?.full_name ?? 'Unknown Client'}</p>
                      <p className="text-xs text-slate-400">
                        {p.appointments?.service ?? 'Service'} \u00b7 {PAYMENT_METHOD_LABEL[p.method] ?? p.method} \u00b7 {fmtDateTime(p.paid_at)}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 flex-shrink-0 ml-3">{fmtPeso(Number(p.amount))}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense entries for the day */}
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-red-400" />
                <p className="text-sm font-semibold text-slate-700">Expense Entries</p>
                <span className="ml-auto text-xs font-semibold text-slate-400">{selectedDayExpenses.length}</span>
              </div>
              <div className="overflow-y-auto max-h-[200px] divide-y divide-slate-50">
                {selectedDayExpenses.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No expenses on this date</p>
                ) : selectedDayExpenses.map(e => (
                  <div key={e.id} className="px-5 py-2.5 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{e.description ?? '—'}</p>
                      <p className="text-xs text-slate-400">
                        {e.category} {e.created_by_email ? `\u00b7 ${e.created_by_email}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-red-500 flex-shrink-0 ml-3">{fmtPeso(Number(e.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <AddExpenseModal userEmail={userEmail} onSaved={loadData} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
