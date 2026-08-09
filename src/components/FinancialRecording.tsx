import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, CheckCircle, Clock, CreditCard,
  Banknote, Wallet, TrendingUp, TrendingDown, Receipt, Calendar,
  Filter, Eye, FileText, User, ShieldCheck,
} from 'lucide-react';
import {
  supabase, type NurseCollection, type CollectionStatus,
  COLLECTION_STATUS_CFG, type Branch,
  resolveMemberName, buildMemberLookup, type TeamMember, type MemberLookup,
} from '../lib/supabase';

interface FinancialRecordingProps {
  userEmail: string;
  userRole: string;
}

interface CollectionRow extends NurseCollection {
  clients?: { full_name: string } | null;
  appointments?: { scheduled_date: string; scheduled_time: string; service: string | null } | null;
  branches?: { name: string } | null;
}

type SubTab = 'overview' | 'pending' | 'confirmed' | 'outstanding' | 'activity';

export default function FinancialRecording({ userEmail, userRole }: FinancialRecordingProps) {
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [memberLookup, setMemberLookup] = useState<MemberLookup>({ byUserId: new Map(), byEmail: new Map() });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('nurse_collections')
      .select(`*, clients(full_name), appointments(scheduled_date, scheduled_time, service), branches(name)`)
      .order('collected_at', { ascending: false });

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    if (dateFrom) q = q.gte('collected_at', `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte('collected_at', `${dateTo}T23:59:59`);

    const [colRes, branchRes, memberRes] = await Promise.all([
      q,
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('team_members').select('user_id, email, full_name, role'),
    ]);

    if (!colRes.error) setCollections((colRes.data ?? []) as CollectionRow[]);
    if (!branchRes.error) setBranches(branchRes.data ?? []);
    setMemberLookup(buildMemberLookup((memberRes.data ?? []) as TeamMember[]));
    setLoading(false);
  }, [statusFilter, branchFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Overview calculations
  const totalCollectedAwaiting = collections
    .filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance')
    .reduce((s, c) => s + c.amount_received, 0);
  const totalPendingConf = collections
    .filter(c => c.status === 'pending_confirmation')
    .reduce((s, c) => s + c.amount_received, 0);
  const totalConfirmedToday = collections
    .filter(c => c.status === 'confirmed' && c.confirmed_at && new Date(c.confirmed_at).toDateString() === new Date().toDateString())
    .reduce((s, c) => s + (c.confirmed_amount ?? c.amount_received), 0);
  const totalConfirmedMonth = collections
    .filter(c => c.status === 'confirmed' && c.confirmed_at && new Date(c.confirmed_at).getMonth() === new Date().getMonth() && new Date(c.confirmed_at).getFullYear() === new Date().getFullYear())
    .reduce((s, c) => s + (c.confirmed_amount ?? c.amount_received), 0);
  const totalOutstanding = collections
    .filter(c => c.status !== 'confirmed' && c.status !== 'cancelled' && c.status !== 'rejected')
    .reduce((s, c) => s + Math.max(0, c.amount_due - (c.confirmed_amount ?? 0)), 0);
  const partialPaid = collections.filter(c => c.status !== 'confirmed' && c.status !== 'cancelled' && c.status !== 'rejected' && (c.confirmed_amount ?? 0) > 0 && (c.confirmed_amount ?? 0) < c.amount_due);

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: 'overview', label: 'Financial Overview' },
    { key: 'pending', label: 'Pending Remittances' },
    { key: 'confirmed', label: 'Confirmed Payments' },
    { key: 'outstanding', label: 'Outstanding Payments' },
    { key: 'activity', label: 'Payment Activity' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Wallet className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Financial Recording</h2>
            <p className="text-xs text-slate-400">Track collections, remittances, and confirmed payments</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${subTab === t.key ? 'border-teal-500 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : subTab === 'overview' ? (
        <OverviewSection
          totalCollectedAwaiting={totalCollectedAwaiting}
          totalPendingConf={totalPendingConf}
          totalConfirmedToday={totalConfirmedToday}
          totalConfirmedMonth={totalConfirmedMonth}
          totalOutstanding={totalOutstanding}
          partialPaidCount={partialPaid.length}
          collections={collections}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="all">All Statuses</option>
                <option value="collected_by_nurse">Awaiting Remittance</option>
                <option value="pending_confirmation">Pending Confirmation</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
                <option value="returned">Returned</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
              <option value="all">All Branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>

          <CollectionTable collections={collections} memberLookup={memberLookup} subTab={subTab} />
        </>
      )}
    </div>
  );
}

// ─── Overview Section ──────────────────────────────────────────────────────────

function OverviewSection({
  totalCollectedAwaiting, totalPendingConf, totalConfirmedToday, totalConfirmedMonth,
  totalOutstanding, partialPaidCount, collections,
}: {
  totalCollectedAwaiting: number;
  totalPendingConf: number;
  totalConfirmedToday: number;
  totalConfirmedMonth: number;
  totalOutstanding: number;
  partialPaidCount: number;
  collections: CollectionRow[];
}) {
  const cards = [
    { label: 'Collected by Nurses — Awaiting Remittance', value: totalCollectedAwaiting, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    { label: 'Remitted — Awaiting Confirmation', value: totalPendingConf, icon: ShieldCheck, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    { label: 'Confirmed Collections Today', value: totalConfirmedToday, icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    { label: 'Confirmed Collections This Month', value: totalConfirmedMonth, icon: TrendingUp, color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200' },
    { label: 'Outstanding Client Balance', value: totalOutstanding, icon: Wallet, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
    { label: 'Partially Paid Appointments', value: partialPaidCount, icon: CreditCard, color: 'text-slate-700', bg: 'bg-slate-100 border-slate-200' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`rounded-2xl border p-5 ${c.bg}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg bg-white flex items-center justify-center`}>
                <c.icon className={`w-4 h-4 ${c.color}`} />
              </div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.label}</p>
            </div>
            <p className={`text-2xl font-bold ${c.color}`}>₱{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs text-amber-700 font-medium leading-relaxed">
          <strong>Important:</strong> Pending nurse-held money is NOT confirmed company revenue.
          Sponsored and complimentary treatment values are tracked separately and not mixed with collected revenue.
        </p>
      </div>
    </div>
  );
}

// ─── Collection Table ─────────────────────────────────────────────────────────

function CollectionTable({ collections, memberLookup, subTab }: { collections: CollectionRow[]; memberLookup: MemberLookup; subTab: SubTab }) {
  const filtered = subTab === 'pending'
    ? collections.filter(c => c.status === 'collected_by_nurse' || c.status === 'for_remittance' || c.status === 'pending_confirmation')
    : subTab === 'confirmed'
    ? collections.filter(c => c.status === 'confirmed')
    : subTab === 'outstanding'
    ? collections.filter(c => c.status !== 'confirmed' && c.status !== 'cancelled' && c.status !== 'rejected')
    : collections;

  if (filtered.length === 0) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 text-center"><CheckCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-400">No records found.</p></div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {(subTab === 'confirmed' ? ['Payment #', 'Client', 'Appointment', 'Amount', 'Method', 'Collected By', 'Confirmed By', 'Date Confirmed', 'Receipt #'] : ['Collection #', 'Client', 'Appointment', 'Amount', 'Method', 'Collected By', 'Date Collected', 'Status', 'Age']).map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(c => {
              const cfg = COLLECTION_STATUS_CFG[c.status] ?? COLLECTION_STATUS_CFG.collected_by_nurse;
              const ageHrs = Math.floor((Date.now() - new Date(c.collected_at).getTime()) / 3600000);
              const isOverdue = (c.status === 'collected_by_nurse' || c.status === 'for_remittance') && ageHrs >= 24;
              return (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">{c.collection_number}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.clients?.full_name ?? c.payer_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{c.appointments ? `${c.appointments.scheduled_date} ${c.appointments.scheduled_time}` : '—'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-slate-700">₱{c.amount_received.toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 capitalize">{c.payment_method}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{resolveMemberName(c.collected_by_email, memberLookup)}</td>
                  {subTab === 'confirmed' ? (
                    <>
                      <td className="px-4 py-3 text-xs text-slate-500">{resolveMemberName(c.confirmed_by_email ?? '', memberLookup)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{c.confirmed_at ? new Date(c.confirmed_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-600">{c.receipt_number ?? '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(c.collected_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${cfg.color} ${cfg.bg}`}>{cfg.label}</span></td>
                      <td className={`px-4 py-3 text-xs font-bold ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>{ageHrs}h{isOverdue ? ' ⚠ Overdue' : ''}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
