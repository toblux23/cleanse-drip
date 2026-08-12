import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, RefreshCw, X, Loader2, AlertCircle, Trash2, Lock, Package, PackageOpen,
  AlertTriangle, CheckCircle, Minus, Search, Pencil, ShoppingCart, Truck,
  FlaskConical, BarChart3, Boxes, Calendar, TrendingUp, TrendingDown, DollarSign,
  FileText, ChevronDown, Filter, Edit3, ClipboardList, Archive, Clock, Upload,
  Tag, Settings, ArrowUpToLine, ArrowDownFromLine, Info, Warehouse, Hash, ArrowRightLeft,
} from 'lucide-react';
import InventoryImportModal from './InventoryImportModal';
import CategoryManagerModal from './CategoryManagerModal';
import InventoryTypeManagerModal from './InventoryTypeManagerModal';
import {
  RequestsSubTab, TransfersSubTab, ReservationsSubTab, CalendarSubTab,
  AnalyticsSubTab, AuditsSubTab, KitsSubTab, TimelineSubTab, AttachmentsSubTab,
  ExecutiveAlerts, WorkflowDiagram, SafetyBadges,
} from './InventoryEnterprise';
import {
  supabase, type Branch, type InventoryProduct, type InventoryProductSummary,
  type InventoryBatch, type InventoryBatchSummary, type InventoryTransaction,
  type TreatmentRecipe, type TreatmentRecipeItem, type InventorySupplier,
  type InventoryPurchaseOrder, type InventoryPurchaseOrderItem,
  type InventoryTransfer, type StockStatus, type BatchStatus,
  type PurchaseOrderStatus, INVENTORY_TYPES,
  type InventoryCategory, type InventorySubcategory,
  type InventoryTypeRecord,
} from '../lib/supabase';

// ─── Helpers ────────────────────────────────────────────────────────────────

const INVENTORY_CATEGORIES = [
  'IV Solutions', 'IV Vitamins', 'Peptides', 'Drips', 'Consumables',
  'Medical Supplies', 'Equipment', 'PPE', 'Retail Products', 'Office Supplies', 'Other',
];

// Fallback categories used only if the database has no managed categories yet.
// Once inventory_categories is seeded, the ProductModal uses those records instead.
const FALLBACK_CATEGORIES = INVENTORY_CATEGORIES;

const UNITS = ['unit', 'vial', 'bag', 'box', 'bottle', 'ampoule', 'set', 'pair', 'piece', 'ml', 'mg', 'g', 'pack', 'dose'];

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function stockStatusLabel(status: StockStatus): { label: string; cls: string } {
  switch (status) {
    case 'out_of_stock': return { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' };
    case 'critical': return { label: 'Critical', cls: 'bg-red-100 text-red-700' };
    case 'low_stock': return { label: 'Low Stock', cls: 'bg-amber-100 text-amber-700' };
    case 'overstock': return { label: 'Overstock', cls: 'bg-blue-100 text-blue-700' };
    default: return { label: 'Normal', cls: 'bg-emerald-100 text-emerald-700' };
  }
}

function batchStatusLabel(status: BatchStatus): { label: string; cls: string } {
  switch (status) {
    case 'expired': return { label: 'Expired', cls: 'bg-red-100 text-red-700' };
    case 'near_expiry': return { label: 'Near Expiry', cls: 'bg-amber-100 text-amber-700' };
    case 'quarantined': return { label: 'Quarantined', cls: 'bg-purple-100 text-purple-700' };
    default: return { label: 'Good', cls: 'bg-emerald-100 text-emerald-700' };
  }
}

function poStatusLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case 'draft': return { label: 'Draft', cls: 'bg-slate-100 text-slate-600' };
    case 'ordered': return { label: 'Ordered', cls: 'bg-blue-100 text-blue-700' };
    case 'partially_received': return { label: 'Partially Received', cls: 'bg-amber-100 text-amber-700' };
    case 'received': return { label: 'Received', cls: 'bg-emerald-100 text-emerald-700' };
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-red-100 text-red-700' };
    default: return { label: status, cls: 'bg-slate-100 text-slate-600' };
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface InventoryTabProps {
  canManage: boolean;
  canPurchase: boolean;
  canViewReports: boolean;
  canDelete: boolean;
  canRequest?: boolean;
  canAudit?: boolean;
  canManageKits?: boolean;
  canManageTransfers?: boolean;
  userEmail?: string;
}

type SubTab = 'dashboard' | 'products' | 'batches' | 'recipes' | 'purchases' | 'suppliers' | 'reports' | 'requests' | 'transfers' | 'reservations' | 'calendar' | 'analytics' | 'audits' | 'kits' | 'timeline' | 'attachments';

interface InventoryModule {
  key: SubTab;
  label: string;
  description: string;
  icon: React.ElementType;
  can: boolean;
}

const INVENTORY_MODULES: InventoryModule[] = [
  { key: 'products', label: 'Products', description: 'Manage inventory items.', icon: Package, can: true },
  { key: 'batches', label: 'Batches & Expiry', description: 'Track batches and expiration dates.', icon: Boxes, can: true },
  { key: 'recipes', label: 'Treatment Recipes', description: 'Define inventory consumption per treatment.', icon: FlaskConical, can: true },
  { key: 'kits', label: 'Medical Kits', description: 'Manage predefined medical kits.', icon: Boxes, can: true },
  { key: 'purchases', label: 'Purchase Orders', description: 'Create and receive supplier orders.', icon: ShoppingCart, can: true },
  { key: 'suppliers', label: 'Suppliers', description: 'Manage supplier information.', icon: Truck, can: true },
  { key: 'requests', label: 'Inventory Requests', description: 'Internal stock requests.', icon: ClipboardList, can: true },
  { key: 'transfers', label: 'Stock Transfers', description: 'Move inventory between branches.', icon: Archive, can: true },
  { key: 'reservations', label: 'Reservations', description: 'Reserved inventory for appointments.', icon: PackageOpen, can: true },
  { key: 'audits', label: 'Inventory Audit', description: 'Cycle count and reconciliation.', icon: ClipboardList, can: true },
  { key: 'analytics', label: 'Analytics', description: 'Inventory performance and forecasting.', icon: TrendingUp, can: true },
  { key: 'reports', label: 'Reports', description: 'Inventory valuation and reports.', icon: FileText, can: true },
  { key: 'attachments', label: 'Documents', description: 'Invoices, certificates, and attachments.', icon: FileText, can: true },
  { key: 'timeline', label: 'Timeline', description: 'Complete inventory activity history.', icon: Clock, can: true },
];

const MODULE_LABELS: Record<SubTab, string> = {
  dashboard: 'Workspace',
  products: 'Products',
  batches: 'Batches & Expiry',
  recipes: 'Treatment Recipes',
  purchases: 'Purchase Orders',
  suppliers: 'Suppliers',
  reports: 'Reports',
  requests: 'Inventory Requests',
  transfers: 'Stock Transfers',
  reservations: 'Reservations',
  calendar: 'Calendar',
  analytics: 'Analytics',
  audits: 'Inventory Audit',
  kits: 'Medical Kits',
  timeline: 'Timeline',
  attachments: 'Documents',
};

export default function InventoryTab({ canManage, canPurchase, canViewReports, canDelete, canRequest, canAudit, canManageKits, canManageTransfers, userEmail }: InventoryTabProps) {
  const [subTab, setSubTab] = useState<SubTab>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('cd_inventory_subtab') as SubTab | null : null;
    return saved ?? 'dashboard';
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState<string>('all');

  const loadBranches = useCallback(async () => {
    const { data } = await supabase.from('branches').select('id, name, is_active, created_at').eq('is_active', true).order('name');
    setBranches(data ?? []);
  }, []);

  useEffect(() => { loadBranches(); }, [loadBranches]);
  useEffect(() => { window.localStorage.setItem('cd_inventory_subtab', subTab); }, [subTab]);

  function selectSubTab(key: SubTab) { setSubTab(key); }

  const visibleModules = INVENTORY_MODULES.filter(m => {
    switch (m.key) {
      case 'purchases':
      case 'suppliers': return canPurchase;
      case 'recipes': return canManage;
      case 'kits': return canManageKits ?? canManage;
      case 'transfers': return canManageTransfers ?? canManage;
      case 'audits': return canAudit ?? canManage;
      case 'reports':
      case 'analytics': return canViewReports;
      case 'requests': return canRequest ?? true;
      default: return true;
    }
  });

  const quickActions = [
    { label: 'Add Product', icon: Plus, target: 'products' as SubTab, can: canManage },
    { label: 'Create Purchase Order', icon: ShoppingCart, target: 'purchases' as SubTab, can: canPurchase },
    { label: 'Stock Adjustment', icon: Archive, target: 'products' as SubTab, can: canManage },
    { label: 'Import Inventory', icon: Upload, target: 'products' as SubTab, can: canManage },
  ].filter(a => a.can);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-600 to-teal-700 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Inventory & Medical Supplies</h2>
            <p className="text-sm text-teal-50/90 mt-0.5">Manage products, purchasing, stock movement, inventory control, analytics, and reporting.</p>
          </div>
        </div>
      </div>

      {subTab !== 'dashboard' && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setSubTab('dashboard')} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <ChevronDown className="w-4 h-4 rotate-90 text-slate-400" /> Back to Workspace
          </button>
          <h3 className="text-base font-bold text-slate-800">{MODULE_LABELS[subTab]}</h3>
        </div>
      )}

      {subTab !== 'dashboard' && (
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {subTab === 'dashboard' ? (
        <div className="space-y-6">
          {/* Quick Actions */}
          {quickActions.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {quickActions.map(action => (
                  <button
                    key={action.label}
                    onClick={() => selectSubTab(action.target)}
                    className="group flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl hover:border-teal-300 hover:shadow-md transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700 group-hover:text-teal-700">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Overview KPIs */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Inventory Overview</h3>
            <InventoryOverviewCards branchFilter={branchFilter} branches={branches} setBranchFilter={setBranchFilter} />
          </div>

          {/* Inventory Modules */}
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">Inventory Modules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleModules.map(mod => (
                <button
                  key={mod.key}
                  onClick={() => selectSubTab(mod.key)}
                  className="group flex flex-col p-5 bg-white border border-slate-200 rounded-2xl hover:border-teal-300 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center group-hover:bg-teal-50 group-hover:text-teal-600 transition-colors">
                      <mod.icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-bold text-slate-800 group-hover:text-teal-700">{mod.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{mod.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {subTab === 'products' && <ProductsSubTab branches={branches} branchFilter={branchFilter} canManage={canManage} canDelete={canDelete} />}
          {subTab === 'batches' && <BatchesSubTab branches={branches} branchFilter={branchFilter} canManage={canManage} />}
          {subTab === 'recipes' && <RecipesSubTab canManage={canManage} />}
          {subTab === 'purchases' && <PurchasesSubTab branches={branches} branchFilter={branchFilter} canPurchase={canPurchase} />}
          {subTab === 'suppliers' && <SuppliersSubTab canPurchase={canPurchase} />}
          {subTab === 'requests' && <RequestsSubTab branches={branches} branchFilter={branchFilter} canManage={canManage} canRequest={canRequest ?? true} userEmail={userEmail ?? ''} />}
          {subTab === 'transfers' && <TransfersSubTab branches={branches} branchFilter={branchFilter} canManage={canManageTransfers ?? canManage} userEmail={userEmail ?? ''} />}
          {subTab === 'reservations' && <ReservationsSubTab branchFilter={branchFilter} />}
          {subTab === 'calendar' && <CalendarSubTab branches={branches} branchFilter={branchFilter} />}
          {subTab === 'analytics' && <AnalyticsSubTab branchFilter={branchFilter} />}
          {subTab === 'audits' && <AuditsSubTab branches={branches} branchFilter={branchFilter} canManage={canAudit ?? canManage} userEmail={userEmail ?? ''} />}
          {subTab === 'kits' && <KitsSubTab canManage={canManageKits ?? canManage} />}
          {subTab === 'timeline' && <TimelineSubTab branchFilter={branchFilter} />}
          {subTab === 'attachments' && <AttachmentsSubTab branchFilter={branchFilter} />}
          {subTab === 'reports' && <ReportsSubTab branches={branches} branchFilter={branchFilter} canViewReports={canViewReports} />}
        </div>
      )}
    </div>
  );
}

// ─── Inventory Overview Cards (workspace KPIs) ───────────────────────────────

function InventoryOverviewCards({ branchFilter, branches, setBranchFilter }: { branchFilter: string; branches: Branch[]; setBranchFilter: (v: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<InventoryProductSummary[]>([]);
  const [batches, setBatches] = useState<InventoryBatchSummary[]>([]);
  const [monthPurchases, setMonthPurchases] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    let productQuery = supabase.from('inventory_products').select('*, branches(name)').eq('is_active', true);
    if (branchFilter !== 'all') productQuery = productQuery.eq('branch_id', branchFilter);

    let batchQuery = supabase.from('inventory_batch_summary').select('*, inventory_products(name, product_code, unit), branches(name), inventory_suppliers(name)');
    if (branchFilter !== 'all') batchQuery = batchQuery.eq('branch_id', branchFilter);

    const [prodRes, batchRes, poRes] = await Promise.all([
      productQuery,
      batchQuery,
      supabase.from('inventory_purchase_orders').select('total_amount').gte('order_date', monthStart.slice(0, 10)),
    ]);

    setProducts(prodRes.data ?? []);
    setBatches(batchRes.data ?? []);
    setMonthPurchases(poRes.data?.reduce((s, p) => s + Number(p.total_amount), 0) ?? 0);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  const totalInvValue = products.reduce((s, p) => s + Number(p.current_stock) * Number(p.average_cost), 0);
  const lowStock = products.filter(p => p.current_stock <= p.reorder_point && p.current_stock > 0).length;
  const outOfStock = products.filter(p => p.current_stock <= 0).length;
  const nearExpiry = batches.filter(b => b.computed_status === 'near_expiry').length;

  if (loading) return <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-slate-400" />
        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <option value="all">All Branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={DollarSign} label="Total Inventory Value" value={fmtMoney(totalInvValue)} color="teal" />
        <KpiCard icon={AlertTriangle} label="Low Stock" value={fmtNum(lowStock)} color="amber" />
        <KpiCard icon={Calendar} label="Near Expiry" value={fmtNum(nearExpiry)} color="orange" />
        <KpiCard icon={PackageOpen} label="Out of Stock" value={fmtNum(outOfStock)} color="red" />
        <KpiCard icon={ShoppingCart} label="Purchases This Month" value={fmtMoney(monthPurchases)} color="blue" />
      </div>
    </div>
  );
}

// ─── Dashboard Sub-Tab ──────────────────────────────────────────────────────

function DashboardSubTab({ branches, branchFilter, canViewReports }: { branches: Branch[]; branchFilter: string; canViewReports: boolean }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<InventoryProductSummary[]>([]);
  const [batches, setBatches] = useState<InventoryBatchSummary[]>([]);
  const [todayConsumption, setTodayConsumption] = useState(0);
  const [monthConsumption, setMonthConsumption] = useState(0);
  const [monthPurchases, setMonthPurchases] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    let productQuery = supabase.from('inventory_products').select('*, branches(name)').eq('is_active', true);
    if (branchFilter !== 'all') productQuery = productQuery.eq('branch_id', branchFilter);

    let batchQuery = supabase.from('inventory_batch_summary').select('*, inventory_products(name, product_code, unit), branches(name), inventory_suppliers(name)');
    if (branchFilter !== 'all') batchQuery = batchQuery.eq('branch_id', branchFilter);

    const [prodRes, batchRes, todayRes, monthRes, poRes] = await Promise.all([
      productQuery,
      batchQuery,
      supabase.from('inventory_transactions').select('quantity').eq('transaction_type', 'consumption').gte('transaction_date', today + 'T00:00:00'),
      supabase.from('inventory_transactions').select('quantity').eq('transaction_type', 'consumption').gte('transaction_date', monthStart),
      supabase.from('inventory_purchase_orders').select('total_amount').gte('order_date', monthStart.slice(0, 10)),
    ]);

    setProducts(prodRes.data ?? []);
    setBatches(batchRes.data ?? []);
    setTodayConsumption(todayRes.data?.reduce((s, t) => s + Number(t.quantity), 0) ?? 0);
    setMonthConsumption(monthRes.data?.reduce((s, t) => s + Number(t.quantity), 0) ?? 0);
    setMonthPurchases(poRes.data?.reduce((s, p) => s + Number(p.total_amount), 0) ?? 0);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  const totalInvValue = products.reduce((s, p) => s + Number(p.current_stock) * Number(p.average_cost), 0);
  const totalSalesValue = products.reduce((s, p) => s + Number(p.current_stock) * Number(p.selling_price), 0);
  const totalPotentialProfit = products.reduce((s, p) => s + Number(p.current_stock) * (Number(p.selling_price) - Number(p.average_cost)), 0);
  const lowStockItems = products.filter(p => p.current_stock <= p.reorder_point && p.current_stock > 0);
  const outOfStockItems = products.filter(p => p.current_stock <= 0);
  const nearExpiryBatches = batches.filter(b => b.computed_status === 'near_expiry');
  const expiredBatches = batches.filter(b => b.computed_status === 'expired');

  // Category breakdown
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => {
      const cat = p.inventory_type || 'Other';
      map.set(cat, (map.get(cat) ?? 0) + Number(p.current_stock) * Number(p.average_cost));
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [products]);

  // Fast/slow moving (by transaction count - simplified: by current stock vs beginning)
  const fastMoving = useMemo(() => products
    .filter(p => p.beginning_stock > 0)
    .map(p => ({ ...p, turnover: (p.beginning_stock - p.current_stock) / p.beginning_stock }))
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 5), [products]);

  if (loading) return <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Inventory Value" value={fmtMoney(totalInvValue)} color="teal" />
        <KpiCard icon={TrendingUp} label="Potential Sales" value={fmtMoney(totalSalesValue)} color="blue" />
        <KpiCard icon={TrendingUp} label="Potential Profit" value={fmtMoney(totalPotentialProfit)} color="emerald" />
        <KpiCard icon={ShoppingCart} label="Purchases (Month)" value={fmtMoney(monthPurchases)} color="amber" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Package} label="Total Products" value={fmtNum(products.length)} color="slate" />
        <KpiCard icon={AlertTriangle} label="Low Stock" value={fmtNum(lowStockItems.length)} color="amber" />
        <KpiCard icon={PackageOpen} label="Out of Stock" value={fmtNum(outOfStockItems.length)} color="red" />
        <KpiCard icon={Calendar} label="Near Expiry" value={fmtNum(nearExpiryBatches.length)} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KpiCard icon={Minus} label="Today's Consumption" value={fmtNum(todayConsumption) + ' units'} color="blue" />
        <KpiCard icon={TrendingDown} label="Month Consumption" value={fmtNum(monthConsumption) + ' units'} color="slate" />
      </div>

      {/* Alerts */}
      {(lowStockItems.length > 0 || outOfStockItems.length > 0 || nearExpiryBatches.length > 0 || expiredBatches.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Active Alerts
          </h3>
          <div className="space-y-2">
            {outOfStockItems.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Out of Stock</span>
                <span className="text-slate-700 font-medium">{p.name}</span>
                <span className="text-slate-400 text-xs">{p.product_code}</span>
              </div>
            ))}
            {lowStockItems.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full">Low Stock</span>
                <span className="text-slate-700 font-medium">{p.name}</span>
                <span className="text-slate-400 text-xs">Stock: {fmtNum(p.current_stock)} / Reorder: {fmtNum(p.reorder_point)}</span>
              </div>
            ))}
            {expiredBatches.slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">Expired</span>
                <span className="text-slate-700 font-medium">{b.inventory_products?.name}</span>
                <span className="text-slate-400 text-xs">Batch: {b.batch_number}</span>
              </div>
            ))}
            {nearExpiryBatches.slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full">Near Expiry</span>
                <span className="text-slate-700 font-medium">{b.inventory_products?.name}</span>
                <span className="text-slate-400 text-xs">Batch: {b.batch_number} — Exp: {b.expiration_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Inventory by Category</h3>
          <div className="space-y-3">
            {byCategory.map(([cat, val]) => {
              const pct = totalInvValue > 0 ? (val / totalInvValue) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-600">{cat}</span>
                    <span className="text-slate-500">{fmtMoney(val)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Fast Moving Products</h3>
          <div className="space-y-2">
            {fastMoving.length === 0 ? (
              <p className="text-sm text-slate-400">No data available</p>
            ) : fastMoving.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-500">Turnover: {((p as any).turnover * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!canViewReports && (
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
          <Lock className="w-4 h-4 flex-shrink-0" /> You have view-only access to inventory reports.
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-50 text-teal-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide truncate">{label}</p>
        <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Products Sub-Tab ───────────────────────────────────────────────────────

function ProductsSubTab({ branches, branchFilter, canManage, canDelete }: { branches: Branch[]; branchFilter: string; canManage: boolean; canDelete: boolean }) {
  const [products, setProducts] = useState<InventoryProductSummary[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  // Write failures used to be discarded, so a deactivation that did not happen
  // looked the same as one that did.
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [managedTypes, setManagedTypes] = useState<string[]>([]);
  const [editing, setEditing] = useState<InventoryProduct | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryProductSummary | null>(null);
  const [initialStockFor, setInitialStockFor] = useState<InventoryProductSummary | null>(null);
  const [viewing, setViewing] = useState<InventoryProductSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryProductSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_products').select('*, branches(name)').eq('is_active', true).order('name');
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const [prodRes, supRes] = await Promise.all([
      q,
      supabase.from('inventory_suppliers').select('*').order('name'),
    ]);
    setProducts(prodRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  const loadManagedTypes = useCallback(async () => {
    const { data } = await supabase.from('inventory_types').select('name').eq('is_active', true).order('display_order').order('name');
    setManagedTypes((data as { name: string }[] | null)?.map(d => d.name) ?? []);
  }, []);

  useEffect(() => { loadManagedTypes(); }, [loadManagedTypes]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (typeFilter !== 'all' && p.inventory_type !== typeFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s) || p.product_code.toLowerCase().includes(s) || (p.barcode ?? '').includes(s) || (p.sku ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [products, search, typeFilter]);

  return (
    <div className="space-y-4">
      {actionErr && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{actionErr}</p>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, code, barcode, SKU..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
          <option value="all">All Types</option>
          {(managedTypes.length > 0 ? managedTypes : INVENTORY_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors flex-shrink-0">
          <RefreshCw className="w-4 h-4" />
        </button>
        {canManage && (
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors flex-shrink-0">
            <Upload className="w-4 h-4" /> Import
          </button>
        )}
        {canManage && (
          <button onClick={() => setShowCatManager(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0">
            <Tag className="w-4 h-4" /> Categories
          </button>
        )}
        {canManage && (
          <button onClick={() => setShowTypeManager(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0">
            <Boxes className="w-4 h-4" /> Types
          </button>
        )}
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Package className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No products found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="relative max-h-[calc(100vh-260px)] overflow-auto overscroll-contain">
            <div className="min-w-max w-max pb-2">
            <div className="grid grid-cols-[minmax(220px,2fr)_120px_100px_80px_90px_90px_110px_120px_150px_160px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
              <span className="whitespace-nowrap">Product</span>
              <span className="whitespace-nowrap">Type</span>
              <span className="whitespace-nowrap">Branch</span>
              <span className="text-center whitespace-nowrap">Stock</span>
              <span className="text-center whitespace-nowrap">Avail.</span>
              <span className="text-center whitespace-nowrap">Reserved</span>
              <span className="text-right whitespace-nowrap">Avg Cost</span>
              <span className="text-center whitespace-nowrap">Status</span>
              <span className="text-right whitespace-nowrap pr-5">Inv Value</span>
              <span className="text-right whitespace-nowrap pl-5 border-l border-slate-100">Actions</span>
            </div>
            <div className="divide-y divide-slate-50">
              {filtered.map(p => {
                const status = computeStockStatus(p);
                const st = stockStatusLabel(status);
                const available = p.current_stock - p.reserved_stock;
                const invValue = Number(p.current_stock) * Number(p.average_cost);
                return (
                  <div key={p.id} className="grid grid-cols-[minmax(220px,2fr)_120px_100px_80px_90px_90px_110px_120px_150px_160px] items-center px-5 py-3 hover:bg-slate-50/50 transition-colors text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                        <SafetyBadges product={p} size="xs" />
                      </div>
                      <p className="text-xs text-slate-400 whitespace-nowrap">{p.product_code} · {p.unit}</p>
                    </div>
                    <span className="text-xs text-slate-600 truncate" title={p.inventory_type}>{p.inventory_type}</span>
                    <span className="text-xs text-slate-500 truncate" title={p.branches?.name ?? 'All'}>{p.branches?.name ?? 'All'}</span>
                    <span className="text-center font-semibold text-slate-700 whitespace-nowrap">{fmtNum(p.current_stock)}</span>
                    <span className="text-center text-slate-500 whitespace-nowrap">{fmtNum(available)}</span>
                    <span className="text-center text-amber-600 whitespace-nowrap">{fmtNum(p.reserved_stock)}</span>
                    <span className="text-right text-slate-600 whitespace-nowrap">{fmtMoney(p.average_cost)}</span>
                    <span className="text-center"><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span></span>
                    <span className="text-right text-slate-600 whitespace-nowrap pr-5">{fmtMoney(invValue)}</span>
                    <div className="flex items-center justify-end gap-2 pl-5 border-l border-slate-100">
                      <button onClick={() => setViewing(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="View Details">
                        <Info className="w-3.5 h-3.5" />
                      </button>
                      {canManage && (
                        <>
                          <button onClick={() => setInitialStockFor(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Add Initial Stock">
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setAdjusting(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors" title="Adjust Stock">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>
      )}

      {showImport && <InventoryImportModal branches={branches} suppliers={suppliers} products={products} onClose={() => setShowImport(false)} onImported={() => load()} />}
      {showCatManager && <CategoryManagerModal onClose={() => setShowCatManager(false)} onChanged={() => load()} />}
      {showTypeManager && <InventoryTypeManagerModal onClose={() => setShowTypeManager(false)} onChanged={() => { loadManagedTypes(); load(); } } />}
      {showAdd && <ProductModal branches={branches} branchFilter={branchFilter} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {editing && <ProductModal branches={branches} branchFilter={branchFilter} product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {adjusting && <AdjustStockModal product={adjusting} branches={branches} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />}
      {initialStockFor && <InitialStockModal product={initialStockFor} branches={branches} onClose={() => setInitialStockFor(null)} onSaved={() => { setInitialStockFor(null); load(); }} />}
      {viewing && <ProductDetailsModal product={viewing} branches={branches} onClose={() => setViewing(null)} onAdjust={() => { setAdjusting(viewing); setViewing(null); }} onInitialStock={() => { setInitialStockFor(viewing); setViewing(null); }} />}
      {deleteTarget && <DeleteConfirmModal name={deleteTarget.name} onClose={() => setDeleteTarget(null)} onConfirm={async () => {
        const { error: deactivateErr } = await supabase.from('inventory_products').update({ is_active: false }).eq('id', deleteTarget.id);
        if (deactivateErr) {
          console.error('Product deactivation failed:', deactivateErr);
          setActionErr(`Could not deactivate ${deleteTarget.name}: ${deactivateErr.message}`);
          return;
        }
        setDeleteTarget(null); load();
      }} />}
    </div>
  );
}

function computeStockStatus(p: InventoryProduct): StockStatus {
  if (p.current_stock <= 0) return 'out_of_stock';
  if (p.current_stock <= p.min_stock_level) return 'critical';
  if (p.current_stock <= p.reorder_point) return 'low_stock';
  if (p.max_stock_level > 0 && p.current_stock >= p.max_stock_level) return 'overstock';
  return 'normal';
}

function ProductModal({ branches, branchFilter, product, onClose, onSaved }: {
  branches: Branch[]; branchFilter: string; product?: InventoryProduct; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    category: product?.category ?? '',
    sub_category: product?.sub_category ?? '',
    brand: product?.brand ?? '',
    unit: product?.unit ?? 'unit',
    inventory_type: product?.inventory_type ?? 'Consumables',
    barcode: product?.barcode ?? '',
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    image_url: product?.image_url ?? '',
    branch_id: product?.branch_id ?? (branchFilter !== 'all' ? branchFilter : ''),
    min_stock_level: product?.min_stock_level ?? 0,
    max_stock_level: product?.max_stock_level ?? 0,
    reorder_point: product?.reorder_point ?? 0,
    reorder_quantity: product?.reorder_quantity ?? 0,
    standard_cost: product?.standard_cost ?? 0,
    selling_price: product?.selling_price ?? 0,
    suggested_selling_price: product?.suggested_selling_price ?? 0,
    cold_storage: product?.cold_storage ?? false,
    prescription_required: product?.prescription_required ?? false,
    physician_approval_required: product?.physician_approval_required ?? false,
    hazardous: product?.hazardous ?? false,
    controlled: product?.controlled ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [dbCategories, setDbCategories] = useState<InventoryCategory[]>([]);
  const [dbSubcategories, setDbSubcategories] = useState<InventorySubcategory[]>([]);
  const [dbTypes, setDbTypes] = useState<InventoryTypeRecord[]>([]);

  useEffect(() => {
    (async () => {
      const [catRes, subRes, typeRes] = await Promise.all([
        supabase.from('inventory_categories').select('*').eq('is_active', true).order('display_order').order('name'),
        supabase.from('inventory_subcategories').select('*').eq('is_active', true).order('display_order').order('name'),
        supabase.from('inventory_types').select('*').eq('is_active', true).order('display_order').order('name'),
      ]);
      setDbCategories((catRes.data as InventoryCategory[]) ?? []);
      setDbSubcategories((subRes.data as InventorySubcategory[]) ?? []);
      setDbTypes((typeRes.data as InventoryTypeRecord[]) ?? []);
    })();
  }, []);

  const categoryNames = dbCategories.length > 0 ? dbCategories.map(c => c.name) : FALLBACK_CATEGORIES;
  const activeTypeNames = dbTypes.length > 0 ? dbTypes.map(t => t.name) : INVENTORY_TYPES;
  // Preserve the product's current type even if it's not in the managed active list
  const typeOptions = form.inventory_type && !activeTypeNames.includes(form.inventory_type)
    ? [...activeTypeNames, form.inventory_type]
    : activeTypeNames;

  const filteredSubs = form.category
    ? dbSubcategories.filter(s => {
        const cat = dbCategories.find(c => c.name === form.category);
        return cat && s.category_id === cat.id;
      })
    : [];

  async function save() {
    setSaving(true); setErr('');
    const payload = {
      ...form,
      branch_id: form.branch_id || null,
      min_stock_level: Number(form.min_stock_level) || 0,
      max_stock_level: Number(form.max_stock_level) || 0,
      reorder_point: Number(form.reorder_point) || 0,
      reorder_quantity: Number(form.reorder_quantity) || 0,
      standard_cost: Number(form.standard_cost) || 0,
      selling_price: Number(form.selling_price) || 0,
      suggested_selling_price: Number(form.suggested_selling_price) || 0,
    };
    const { error } = product
      ? await supabase.from('inventory_products').update(payload).eq('id', product.id)
      : await supabase.from('inventory_products').insert({ ...payload, beginning_stock: 0, current_stock: 0 });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800">{product ? 'Edit Product' : 'Add Product'}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
            {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Product Name *"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Normal Saline 500ml" /></Field>
              <Field label="Brand"><input className={inputCls} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Category"><select className={inputCls} value={form.category} onChange={e => {
                const newCat = e.target.value;
                const subs = newCat ? dbSubcategories.filter(s => {
                  const cat = dbCategories.find(c => c.name === newCat);
                  return cat && s.category_id === cat.id;
                }) : [];
                const subStillValid = subs.some(s => s.name === form.sub_category);
                setForm({ ...form, category: newCat, sub_category: subStillValid ? form.sub_category : '' });
              }}><option value="">—</option>{categoryNames.map(c => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Sub-Category"><select className={inputCls} value={form.sub_category} onChange={e => setForm({ ...form, sub_category: e.target.value })} disabled={!form.category}><option value="">—</option>{filteredSubs.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></Field>
              <Field label="Inventory Type"><select className={inputCls} value={form.inventory_type} onChange={e => setForm({ ...form, inventory_type: e.target.value })}>{typeOptions.map(t => <option key={t}>{t}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Unit"><select className={inputCls} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
              <Field label="Barcode"><input className={inputCls} value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })} /></Field>
              <Field label="SKU"><input className={inputCls} value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></Field>
            </div>
            <div className="md:col-span-2"><Field label="Description"><textarea rows={2} className={inputCls} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Branch"><select className={inputCls} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Image URL"><input className={inputCls} value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></Field>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Stock Levels</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Field label="Min Stock"><input type="number" className={inputCls} value={form.min_stock_level} onChange={e => setForm({ ...form, min_stock_level: Number(e.target.value) })} /></Field>
                <Field label="Max Stock"><input type="number" className={inputCls} value={form.max_stock_level} onChange={e => setForm({ ...form, max_stock_level: Number(e.target.value) })} /></Field>
                <Field label="Reorder Point"><input type="number" className={inputCls} value={form.reorder_point} onChange={e => setForm({ ...form, reorder_point: Number(e.target.value) })} /></Field>
                <Field label="Reorder Qty"><input type="number" className={inputCls} value={form.reorder_quantity} onChange={e => setForm({ ...form, reorder_quantity: Number(e.target.value) })} /></Field>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Costing (PHP)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Standard Cost"><input type="number" step="0.01" className={inputCls} value={form.standard_cost} onChange={e => setForm({ ...form, standard_cost: Number(e.target.value) })} /></Field>
                <Field label="Selling Price"><input type="number" step="0.01" className={inputCls} value={form.selling_price} onChange={e => setForm({ ...form, selling_price: Number(e.target.value) })} /></Field>
                <Field label="Suggested Price"><input type="number" step="0.01" className={inputCls} value={form.suggested_selling_price} onChange={e => setForm({ ...form, suggested_selling_price: Number(e.target.value) })} /></Field>
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Medical Safety Flags</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={form.cold_storage} onChange={e => setForm({ ...form, cold_storage: e.target.checked })} className="rounded" /> Cold Storage</label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={form.prescription_required} onChange={e => setForm({ ...form, prescription_required: e.target.checked })} className="rounded" /> Prescription</label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={form.physician_approval_required} onChange={e => setForm({ ...form, physician_approval_required: e.target.checked })} className="rounded" /> Physician Approval</label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={form.hazardous} onChange={e => setForm({ ...form, hazardous: e.target.checked })} className="rounded" /> Hazardous</label>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer"><input type="checkbox" checked={form.controlled} onChange={e => setForm({ ...form, controlled: e.target.checked })} className="rounded" /> Controlled</label>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-white flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {product ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdjustStockModal({ product, branches, onClose, onSaved }: { product: InventoryProductSummary; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<'increase' | 'decrease'>('increase');
  const [adjustQty, setAdjustQty] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [branchId, setBranchId] = useState(product.branch_id ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const raw = Number(adjustQty);
    if (!raw || raw <= 0) { setErr('Enter a positive quantity.'); return; }
    if (!reason.trim()) { setErr('Reason is required for audit trail.'); return; }
    const qty = mode === 'decrease' ? -Math.abs(raw) : Math.abs(raw);
    setSaving(true); setErr('');
    const { data: userData } = await supabase.auth.getUser();
    const { data: memberData } = await supabase.from('team_members').select('email').eq('user_id', userData.user?.id ?? '').maybeSingle();
    const { error } = await supabase.rpc('adjust_inventory', {
      p_product_id: product.id,
      p_quantity: qty,
      p_reason: reason.trim(),
      p_notes: notes.trim() || null,
      p_user_id: userData.user?.id ?? null,
      p_user_email: memberData?.email ?? null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-teal-600" /> Adjust Inventory</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{product.name}</p>
            <p className="text-xs text-slate-500">Current stock: {fmtNum(product.current_stock)} {product.unit}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode('increase')} className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${mode === 'increase' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <ArrowUpToLine className="w-4 h-4" /> Increase
            </button>
            <button onClick={() => setMode('decrease')} className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${mode === 'decrease' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <ArrowDownFromLine className="w-4 h-4" /> Decrease
            </button>
          </div>
          <Field label={`Quantity (${mode === 'decrease' ? 'to remove' : 'to add'}) *`}><input type="number" min="0" className={inputCls} value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="e.g. 10" /></Field>
          <Field label="Branch"><select className={inputCls} value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">Default Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Reason *"><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder={mode === 'increase' ? 'e.g. Found stock, Miscount correction' : 'e.g. Damaged, Expired, Sample usage'} /></Field>
          <Field label="Notes"><textarea rows={2} className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 ${mode === 'decrease' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} {mode === 'decrease' ? 'Decrease Stock' : 'Increase Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InitialStockModal({ product, branches, onClose, onSaved }: { product: InventoryProductSummary; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    branch_id: product.branch_id ?? '',
    warehouse: '',
    quantity: '',
    unit_cost: '',
    reference_number: '',
    remarks: '',
    reason: 'Opening Balance',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) { setErr('Beginning quantity must be greater than zero.'); return; }
    setSaving(true); setErr('');
    const { data: userData } = await supabase.auth.getUser();
    const { data: memberData } = await supabase.from('team_members').select('email').eq('user_id', userData.user?.id ?? '').maybeSingle();
    const { error } = await supabase.rpc('add_initial_stock', {
      p_product_id: product.id,
      p_quantity: qty,
      p_unit_cost: Number(form.unit_cost) || 0,
      p_reference_number: form.reference_number.trim() || null,
      p_remarks: form.remarks.trim() || null,
      p_reason: form.reason.trim() || 'Opening Balance',
      p_branch_id: form.branch_id || null,
      p_user_id: userData.user?.id ?? null,
      p_user_email: memberData?.email ?? null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><ArrowUpToLine className="w-4 h-4 text-emerald-600" /> Add Initial Stock</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{product.name}</p>
            <p className="text-xs text-slate-500">Current stock: {fmtNum(product.current_stock)} {product.unit}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch"><select className={inputCls} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">Default Branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Warehouse (optional)"><input className={inputCls} value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} placeholder="e.g. Main WH" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Beginning Quantity *"><input type="number" min="0" className={inputCls} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="e.g. 100" /></Field>
            <Field label="Unit Cost"><input type="number" min="0" step="0.01" className={inputCls} value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} placeholder="0.00" /></Field>
          </div>
          <Field label="Reference Number"><input className={inputCls} value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} placeholder="e.g. OB-001" /></Field>
          <Field label="Reason"><input className={inputCls} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Opening Balance" /></Field>
          <Field label="Remarks"><textarea rows={2} className={inputCls} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Optional notes about this initial stock" /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Record Initial Stock
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductDetailsModal({ product, branches, onClose, onAdjust, onInitialStock }: { product: InventoryProductSummary; branches: Branch[]; onClose: () => void; onAdjust: () => void; onInitialStock: () => void }) {
  const [txn, setTxn] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('product_id', product.id)
        .order('transaction_date', { ascending: false })
        .limit(10);
      setTxn((data as InventoryTransaction[]) ?? []);
      setLoading(false);
    })();
  }, [product.id]);

  const lastAdjustment = txn.find(t => t.transaction_type === 'adjustment');
  const lastReceived = txn.find(t => t.transaction_type === 'beginning' || t.transaction_type === 'purchase');
  const incoming = txn.filter(t => t.quantity > 0 && (t.transaction_type === 'purchase' || t.transaction_type === 'transfer')).reduce((s, t) => s + t.quantity, 0);
  const outgoing = txn.filter(t => t.quantity < 0 || t.transaction_type === 'consumption' || t.transaction_type === 'damage' || t.transaction_type === 'expired').reduce((s, t) => s + Math.abs(t.quantity), 0);

  const summaryRows = [
    { label: 'Current Stock', value: `${fmtNum(product.current_stock)} ${product.unit}`, tone: 'text-slate-800', bold: true },
    { label: 'Available Stock', value: `${fmtNum(product.available_stock)} ${product.unit}`, tone: 'text-teal-700', bold: true },
    { label: 'Reserved Stock', value: `${fmtNum(product.reserved_stock)} ${product.unit}`, tone: 'text-amber-700' },
    { label: 'Incoming', value: `${fmtNum(incoming)} ${product.unit}`, tone: 'text-blue-700' },
    { label: 'Outgoing', value: `${fmtNum(outgoing)} ${product.unit}`, tone: 'text-red-700' },
    { label: 'Minimum Stock', value: `${fmtNum(product.min_stock_level)} ${product.unit}`, tone: 'text-slate-600' },
    { label: 'Maximum Stock', value: `${fmtNum(product.max_stock_level)} ${product.unit}`, tone: 'text-slate-600' },
    { label: 'Reorder Point', value: `${fmtNum(product.reorder_point)} ${product.unit}`, tone: 'text-slate-600' },
    { label: 'Last Adjustment', value: lastAdjustment ? new Date(lastAdjustment.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', tone: 'text-slate-500' },
    { label: 'Last Received', value: lastReceived ? new Date(lastReceived.transaction_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', tone: 'text-slate-500' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-800 truncate">{product.name}</h3>
              <p className="text-xs text-slate-400">{product.product_code} · {product.category ?? 'Uncategorized'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* Inventory Summary */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5" /> Inventory Summary</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 rounded-xl p-4">
              {summaryRows.map(r => (
                <div key={r.label} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <p className="text-xs text-slate-400 font-medium">{r.label}</p>
                  <p className={`${r.bold ? 'text-sm font-bold' : 'text-sm font-semibold'} ${r.tone}`}>{r.value}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Recent Transactions */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2"><ClipboardList className="w-3.5 h-3.5" /> Recent Transactions</h4>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-teal-600" /></div>
            ) : txn.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400"><PackageOpen className="w-8 h-8 mb-2 opacity-40" /><p className="text-sm font-medium">No transactions yet</p></div>
            ) : (
              <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl">
                {txn.map(t => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.quantity >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      {t.quantity >= 0 ? <ArrowUpToLine className="w-3.5 h-3.5 text-emerald-600" /> : <ArrowDownFromLine className="w-3.5 h-3.5 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 capitalize">{t.transaction_type}{t.reason ? ` · ${t.reason}` : ''}</p>
                      <p className="text-xs text-slate-400">{new Date(t.transaction_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}{t.reference_id ? ` · Ref: ${t.reference_id}` : ''}</p>
                    </div>
                    <p className={`text-sm font-bold ${t.quantity >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{t.quantity >= 0 ? '+' : ''}{fmtNum(t.quantity)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onAdjust} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100">
            <ArrowRightLeft className="w-4 h-4" /> Adjust Inventory
          </button>
          <button onClick={onInitialStock} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700">
            <ArrowUpToLine className="w-4 h-4" /> Add Initial Stock
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Batches Sub-Tab ────────────────────────────────────────────────────────

function BatchesSubTab({ branches, branchFilter, canManage }: { branches: Branch[]; branchFilter: string; canManage: boolean }) {
  const [batches, setBatches] = useState<InventoryBatchSummary[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_batch_summary').select('*, inventory_products(name, product_code, unit), branches(name), inventory_suppliers(name)').order('expiration_date', { nullsFirst: false });
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const [batchRes, prodRes, supRes] = await Promise.all([
      q,
      supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name'),
      supabase.from('inventory_suppliers').select('*').order('name'),
    ]);
    setBatches(batchRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{batches.length} batches tracked</p>
        {canManage && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Batch
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : batches.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Boxes className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No batches tracked yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[1.5fr_120px_100px_100px_80px_80px_90px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span>Product</span>
              <span>Batch Number</span>
              <span>Supplier</span>
              <span>Expiry Date</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Remaining</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-slate-50">
              {batches.map(b => {
                const st = batchStatusLabel(b.computed_status as BatchStatus);
                const daysToExpiry = b.expiration_date ? Math.ceil((new Date(b.expiration_date).getTime() - Date.now()) / 86400000) : null;
                return (
                  <div key={b.id} className="grid grid-cols-[1.5fr_120px_100px_100px_80px_80px_90px] items-center px-5 py-3 hover:bg-slate-50/50 transition-colors text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{b.inventory_products?.name}</p>
                      <p className="text-xs text-slate-400">{b.inventory_products?.product_code}</p>
                    </div>
                    <span className="text-xs font-mono text-slate-600">{b.batch_number}</span>
                    <span className="text-xs text-slate-500">{b.inventory_suppliers?.name ?? '—'}</span>
                    <div>
                      <p className="text-xs text-slate-600">{b.expiration_date ?? '—'}</p>
                      {daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry >= 0 && <p className="text-[10px] text-amber-600 font-semibold">{daysToExpiry} days left</p>}
                      {daysToExpiry !== null && daysToExpiry < 0 && <p className="text-[10px] text-red-600 font-semibold">Expired</p>}
                    </div>
                    <span className="text-right font-semibold text-slate-700">{fmtNum(b.quantity)}</span>
                    <span className="text-right text-slate-600">{fmtNum(b.remaining_quantity)}</span>
                    <span><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.label}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showAdd && <BatchModal products={products} suppliers={suppliers} branches={branches} branchFilter={branchFilter} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function BatchModal({ products, suppliers, branches, branchFilter, onClose, onSaved }: {
  products: InventoryProduct[]; suppliers: InventorySupplier[]; branches: Branch[]; branchFilter: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    product_id: '',
    batch_number: '',
    supplier_id: '',
    manufacturing_date: '',
    expiration_date: '',
    quantity: '',
    branch_id: branchFilter !== 'all' ? branchFilter : '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form.product_id) { setErr('Product is required.'); return; }
    if (!form.batch_number.trim()) { setErr('Batch number is required.'); return; }
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) { setErr('Quantity must be positive.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('inventory_batches').insert({
      product_id: form.product_id,
      batch_number: form.batch_number.trim(),
      supplier_id: form.supplier_id || null,
      manufacturing_date: form.manufacturing_date || null,
      expiration_date: form.expiration_date || null,
      quantity: qty,
      remaining_quantity: qty,
      branch_id: form.branch_id || null,
      status: 'good',
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Add Batch</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Product *"><select className={inputCls} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}><option value="">— Select —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Batch Number *"><input className={inputCls} value={form.batch_number} onChange={e => setForm({ ...form, batch_number: e.target.value })} placeholder="e.g. LOT-2024-001" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier"><select className={inputCls} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}><option value="">—</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Quantity *"><input type="number" className={inputCls} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mfg Date"><input type="date" className={inputCls} value={form.manufacturing_date} onChange={e => setForm({ ...form, manufacturing_date: e.target.value })} /></Field>
            <Field label="Expiration Date"><input type="date" className={inputCls} value={form.expiration_date} onChange={e => setForm({ ...form, expiration_date: e.target.value })} /></Field>
          </div>
          <Field label="Branch"><select className={inputCls} value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Add Batch
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recipes Sub-Tab ────────────────────────────────────────────────────────

function RecipesSubTab({ canManage }: { canManage: boolean }) {
  const [recipeErr, setRecipeErr] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<TreatmentRecipe[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipe, setSelectedRecipe] = useState<TreatmentRecipe | null>(null);
  const [items, setItems] = useState<TreatmentRecipeItem[]>([]);
  const [showAddRecipe, setShowAddRecipe] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [recRes, prodRes] = await Promise.all([
      supabase.from('treatment_recipes').select('*').order('treatment_name'),
      supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name'),
    ]);
    setRecipes(recRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadItems(recipeId: string) {
    const { data } = await supabase.from('treatment_recipe_items').select('*, inventory_products(name, product_code, unit)').eq('recipe_id', recipeId).order('created_at');
    setItems(data ?? []);
  }

  async function deleteItem(itemId: string) {
    const { error: delErr } = await supabase.from('treatment_recipe_items').delete().eq('id', itemId);
    if (delErr) {
      console.error('Recipe component delete failed:', delErr);
      setRecipeErr(`Could not remove that component: ${delErr.message}`);
      return;
    }
    setRecipeErr(null);
    if (selectedRecipe) loadItems(selectedRecipe.id);
  }

  return (
    <div className="space-y-4">
      {recipeErr && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{recipeErr}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Treatment recipes for automatic inventory deduction</p>
        {canManage && (
          <button onClick={() => setShowAddRecipe(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Recipe
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recipe list */}
          <div className="lg:col-span-1 space-y-2">
            {recipes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <FlaskConical className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">No recipes yet</p>
              </div>
            ) : recipes.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelectedRecipe(r); loadItems(r.id); }}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  selectedRecipe?.id === r.id ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-100 hover:border-slate-200'
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">{r.treatment_name}</p>
                {r.description && <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>}
                <span className={`inline-flex mt-2 px-2 py-0.5 text-xs font-semibold rounded-full ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {r.is_active ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))}
          </div>

          {/* Recipe detail */}
          <div className="lg:col-span-2">
            {selectedRecipe ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{selectedRecipe.treatment_name}</h3>
                    {selectedRecipe.description && <p className="text-sm text-slate-500">{selectedRecipe.description}</p>}
                  </div>
                  {canManage && (
                    <button onClick={() => setShowAddItem(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No items in this recipe. Add items to enable automatic deduction.</p>
                  ) : items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{item.inventory_products?.name}</p>
                        <p className="text-xs text-slate-400">{item.inventory_products?.product_code}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700">{fmtNum(item.quantity)} {item.inventory_products?.unit}</span>
                        {canManage && (
                          <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-2xl border border-slate-100">
                <ClipboardList className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">Select a recipe to view its items</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddRecipe && <RecipeModal onClose={() => setShowAddRecipe(false)} onSaved={() => { setShowAddRecipe(false); load(); }} />}
      {showAddItem && selectedRecipe && <RecipeItemModal recipe={selectedRecipe} products={products} onClose={() => setShowAddItem(false)} onSaved={() => { setShowAddItem(false); loadItems(selectedRecipe.id); }} />}
    </div>
  );
}

function RecipeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) { setErr('Treatment name is required.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('treatment_recipes').insert({ treatment_name: name.trim(), description: desc.trim() || null });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Add Treatment Recipe</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Treatment Name *"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Myers Cocktail, NAD 500" /></Field>
          <Field label="Description"><textarea rows={2} className={inputCls} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-teal-700">The treatment name must match the service name used in appointments for automatic deduction to work.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Add Recipe
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeItemModal({ recipe, products, onClose, onSaved }: { recipe: TreatmentRecipe; products: InventoryProduct[]; onClose: () => void; onSaved: () => void }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!productId) { setErr('Product is required.'); return; }
    const qty = Number(quantity);
    if (!qty || qty <= 0) { setErr('Quantity must be positive.'); return; }
    setSaving(true); setErr('');
    const { error } = await supabase.from('treatment_recipe_items').insert({ recipe_id: recipe.id, product_id: productId, quantity: qty });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Add Recipe Item</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Product *"><select className={inputCls} value={productId} onChange={e => setProductId(e.target.value)}><option value="">— Select —</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></Field>
          <Field label="Quantity *"><input type="number" step="0.01" className={inputCls} value={quantity} onChange={e => setQuantity(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Purchases Sub-Tab ───────────────────────────────────────────────────────

function PurchasesSubTab({ branches, branchFilter, canPurchase }: { branches: Branch[]; branchFilter: string; canPurchase: boolean }) {
  const [pos, setPos] = useState<InventoryPurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewingPo, setViewingPo] = useState<InventoryPurchaseOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('inventory_purchase_orders').select('*, inventory_suppliers(name), branches(name)').order('created_at', { ascending: false });
    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    const [poRes, supRes, prodRes] = await Promise.all([
      q, supabase.from('inventory_suppliers').select('*').order('name'),
      supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name'),
    ]);
    setPos(poRes.data ?? []);
    setSuppliers(supRes.data ?? []);
    setProducts(prodRes.data ?? []);
    setLoading(false);
  }, [branchFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{pos.length} purchase orders</p>
        {canPurchase && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> New Purchase Order
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : pos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No purchase orders yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[120px_1fr_100px_100px_100px_90px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span>PO Number</span>
              <span>Supplier</span>
              <span>Order Date</span>
              <span>Expected</span>
              <span className="text-right">Total</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-slate-50">
              {pos.map(po => {
                const st = poStatusLabel(po.status);
                return (
                  <button key={po.id} onClick={() => setViewingPo(po)} className="w-full grid grid-cols-[120px_1fr_100px_100px_100px_90px] items-center px-5 py-3 hover:bg-slate-50/50 transition-colors text-sm text-left">
                    <span className="text-xs font-mono text-slate-600">{po.po_number}</span>
                    <span className="font-medium text-slate-700">{po.inventory_suppliers?.name ?? '—'}</span>
                    <span className="text-xs text-slate-500">{po.order_date}</span>
                    <span className="text-xs text-slate-500">{po.expected_delivery ?? '—'}</span>
                    <span className="text-right font-semibold text-slate-700">{fmtMoney(po.total_amount)}</span>
                    <span><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${st.cls}`}>{st.label}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showAdd && <PurchaseOrderModal suppliers={suppliers} products={products} branches={branches} branchFilter={branchFilter} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {viewingPo && <PurchaseOrderDetail po={viewingPo} products={products} canPurchase={canPurchase} onClose={() => setViewingPo(null)} onChanged={() => { setViewingPo(null); load(); }} />}
    </div>
  );
}

function PurchaseOrderModal({ suppliers, products, branches, branchFilter, onClose, onSaved }: {
  suppliers: InventorySupplier[]; products: InventoryProduct[]; branches: Branch[]; branchFilter: string; onClose: () => void; onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [branchId, setBranchId] = useState(branchFilter !== 'all' ? branchFilter : '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ product_id: string; quantity: string; unit_cost: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  function addItem() { setItems([...items, { product_id: '', quantity: '1', unit_cost: '0' }]); }
  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: 'product_id' | 'quantity' | 'unit_cost', val: string) {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  const total = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0);

  async function save() {
    if (!supplierId) { setErr('Supplier is required.'); return; }
    if (items.length === 0) { setErr('Add at least one item.'); return; }
    setSaving(true); setErr('');
    const { data: userData } = await supabase.auth.getUser();
    const { data: poData, error: poErr } = await supabase.from('inventory_purchase_orders').insert({
      supplier_id: supplierId,
      expected_delivery: expectedDelivery || null,
      branch_id: branchId || null,
      notes: notes.trim() || null,
      total_amount: total,
      status: 'draft',
      created_by: userData.user?.id ?? null,
    }).select().single();
    if (poErr) { setSaving(false); setErr(poErr.message); return; }

    const itemPayload = items.filter(it => it.product_id).map(it => ({
      po_id: poData.id,
      product_id: it.product_id,
      quantity_ordered: Number(it.quantity) || 0,
      quantity_received: 0,
      unit_cost: Number(it.unit_cost) || 0,
      line_total: (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0),
    }));
    if (itemPayload.length > 0) {
      const { error: itemErr } = await supabase.from('inventory_purchase_order_items').insert(itemPayload);
      if (itemErr) { setSaving(false); setErr(itemErr.message); return; }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-bold text-slate-800">New Purchase Order</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier *"><select className={inputCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">— Select —</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Branch"><select className={inputCls} value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          </div>
          <Field label="Expected Delivery"><input type="date" className={inputCls} value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} /></Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Items</p>
              <button onClick={addItem} className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                  <select className={inputCls} value={it.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}>
                    <option value="">— Product —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" placeholder="Qty" className={inputCls} value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                  <input type="number" step="0.01" placeholder="Cost" className={inputCls} value={it.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} />
                  <button onClick={() => removeItem(idx)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No items added yet</p>}
            </div>
          </div>

          <div className="flex justify-between items-center bg-slate-50 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-slate-600">Total</span>
            <span className="text-lg font-bold text-slate-800">{fmtMoney(total)}</span>
          </div>
          <Field label="Notes"><textarea rows={2} className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Create PO
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchaseOrderDetail({ po, products, canPurchase, onClose, onChanged }: {
  po: InventoryPurchaseOrder; products: InventoryProduct[]; canPurchase: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [items, setItems] = useState<InventoryPurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [poErr, setPoErr] = useState<string | null>(null);
  const [receivingItem, setReceivingItem] = useState<InventoryPurchaseOrderItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('inventory_purchase_order_items').select('*, inventory_products(name, product_code, unit)').eq('po_id', po.id).order('created_at');
    setItems(data ?? []);
    setLoading(false);
  }, [po.id]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(status: string) {
    const { error: statusErr } = await supabase.from('inventory_purchase_orders').update({ status }).eq('id', po.id);
    if (statusErr) {
      console.error('Purchase order status update failed:', statusErr);
      setPoErr(`Could not set the status to ${status}: ${statusErr.message}`);
      return;
    }
    setPoErr(null);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {poErr && (
          <div className="m-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{poErr}</p>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-base font-bold text-slate-800">{po.po_number}</h3>
            <p className="text-xs text-slate-500">{po.inventory_suppliers?.name} · {po.order_date}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-slate-400">Status</p><p className="font-semibold text-slate-700">{poStatusLabel(po.status).label}</p></div>
                <div><p className="text-xs text-slate-400">Expected</p><p className="font-semibold text-slate-700">{po.expected_delivery ?? '—'}</p></div>
                <div><p className="text-xs text-slate-400">Total</p><p className="font-semibold text-slate-700">{fmtMoney(po.total_amount)}</p></div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Items</p>
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{item.inventory_products?.name}</p>
                        <p className="text-xs text-slate-400">{fmtNum(item.quantity_ordered)} ordered · {fmtNum(item.quantity_received)} received · {fmtMoney(item.unit_cost)}/unit</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.quantity_received < item.quantity_ordered && canPurchase && po.status !== 'cancelled' && (
                          <button onClick={() => setReceivingItem(item)} className="px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700">Receive</button>
                        )}
                        {item.quantity_received >= item.quantity_ordered && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {canPurchase && (
                <div className="flex gap-2 border-t border-slate-100 pt-4">
                  {po.status === 'draft' && <button onClick={() => updateStatus('ordered')} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700">Mark as Ordered</button>}
                  {po.status === 'ordered' && <button onClick={() => updateStatus('partially_received')} className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-xl hover:bg-amber-700">Mark Partial</button>}
                  {po.status !== 'received' && po.status !== 'cancelled' && <button onClick={() => updateStatus('received')} className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700">Mark Received</button>}
                  {po.status !== 'received' && po.status !== 'cancelled' && <button onClick={() => updateStatus('cancelled')} className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50">Cancel</button>}
                </div>
              )}
            </>
          )}
        </div>
        {receivingItem && <ReceiveItemModal item={receivingItem} po={po} onClose={() => setReceivingItem(null)} onSaved={() => { setReceivingItem(null); load(); }} />}
      </div>
    </div>
  );
}

function ReceiveItemModal({ item, po, onClose, onSaved }: { item: InventoryPurchaseOrderItem; po: InventoryPurchaseOrder; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(String(item.quantity_ordered - item.quantity_received));
  const [batchNumber, setBatchNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    const receivedQty = Number(qty);
    if (!receivedQty || receivedQty <= 0) { setErr('Quantity must be positive.'); return; }
    setSaving(true); setErr('');
    const { data: userData } = await supabase.auth.getUser();
    const { data: memberData } = await supabase.from('team_members').select('email').eq('user_id', userData.user?.id ?? '').maybeSingle();
    const { error } = await supabase.rpc('receive_purchase_order_item', {
      p_po_item_id: item.id,
      p_received_qty: receivedQty,
      p_batch_number: batchNumber.trim() || null,
      p_expiration_date: expirationDate || null,
      p_user_id: userData.user?.id ?? null,
      p_user_email: memberData?.email ?? null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">Receive Item</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <div className="bg-slate-50 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">{item.inventory_products?.name}</p>
            <p className="text-xs text-slate-500">Ordered: {fmtNum(item.quantity_ordered)} · Already received: {fmtNum(item.quantity_received)}</p>
          </div>
          <Field label="Quantity Received *"><input type="number" className={inputCls} value={qty} onChange={e => setQty(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Batch Number"><input className={inputCls} value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="Optional" /></Field>
            <Field label="Expiration Date"><input type="date" className={inputCls} value={expirationDate} onChange={e => setExpirationDate(e.target.value)} /></Field>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Receive & Update Stock
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Suppliers Sub-Tab ───────────────────────────────────────────────────────

function SuppliersSubTab({ canPurchase }: { canPurchase: boolean }) {
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<InventorySupplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('inventory_suppliers').select('*').order('name');
    setSuppliers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{suppliers.length} suppliers</p>
        {canPurchase && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Supplier
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Truck className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No suppliers yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {suppliers.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-slate-800">{s.name}</p>
                  {s.contact_person && <p className="text-xs text-slate-500">{s.contact_person}</p>}
                </div>
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {s.status}
                </span>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                {s.mobile && <p>{s.mobile}</p>}
                {s.email && <p>{s.email}</p>}
                {s.address && <p>{s.address}</p>}
                {s.lead_time_days > 0 && <p className="text-slate-400">Lead time: {s.lead_time_days} days</p>}
                {s.payment_terms && <p className="text-slate-400">Terms: {s.payment_terms}</p>}
              </div>
              {canPurchase && (
                <button onClick={() => setEditing(s)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && <SupplierModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {editing && <SupplierModal supplier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier?: InventorySupplier; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact_person: supplier?.contact_person ?? '',
    mobile: supplier?.mobile ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    products_supplied: supplier?.products_supplied ?? '',
    lead_time_days: supplier?.lead_time_days ?? 0,
    payment_terms: supplier?.payment_terms ?? '',
    status: supplier?.status ?? 'active',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!form.name.trim()) { setErr('Supplier name is required.'); return; }
    setSaving(true); setErr('');
    const payload = { ...form, lead_time_days: Number(form.lead_time_days) || 0 };
    const { error } = supplier
      ? await supabase.from('inventory_suppliers').update(payload).eq('id', supplier.id)
      : await supabase.from('inventory_suppliers').insert(payload);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">{supplier ? 'Edit Supplier' : 'Add Supplier'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}</div>}
          <Field label="Supplier Name *"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Person"><input className={inputCls} value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></Field>
            <Field label="Mobile"><input className={inputCls} value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Address"><textarea rows={2} className={inputCls} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Products Supplied"><input className={inputCls} value={form.products_supplied} onChange={e => setForm({ ...form, products_supplied: e.target.value })} placeholder="e.g. IV fluids, vitamins" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead Time (days)"><input type="number" className={inputCls} value={form.lead_time_days} onChange={e => setForm({ ...form, lead_time_days: Number(e.target.value) })} /></Field>
            <Field label="Payment Terms"><input className={inputCls} value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. Net 30" /></Field>
          </div>
          <Field label="Status"><select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} {supplier ? 'Save' : 'Add Supplier'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reports Sub-Tab ─────────────────────────────────────────────────────────

function ReportsSubTab({ branches, branchFilter, canViewReports }: { branches: Branch[]; branchFilter: string; canViewReports: boolean }) {
  const [reportType, setReportType] = useState('valuation');
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [products, setProducts] = useState<InventoryProductSummary[]>([]);
  const [batches, setBatches] = useState<InventoryBatchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const REPORTS = [
    { key: 'valuation', label: 'Inventory Valuation' },
    { key: 'transactions', label: 'Stock Movement / Stock Card' },
    { key: 'low_stock', label: 'Low Stock Report' },
    { key: 'near_expiry', label: 'Near Expiry Report' },
    { key: 'expired', label: 'Expired Products' },
    { key: 'consumption', label: 'Consumption Report' },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    if (reportType === 'valuation' || reportType === 'low_stock') {
      let q = supabase.from('inventory_products').select('*, branches(name)').eq('is_active', true).order('name');
      if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data } = await q;
      setProducts(data ?? []);
    } else if (reportType === 'near_expiry' || reportType === 'expired') {
      let q = supabase.from('inventory_batch_summary').select('*, inventory_products(name, product_code, unit), branches(name), inventory_suppliers(name)').order('expiration_date');
      if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      const { data } = await q;
      setBatches(data ?? []);
    } else if (reportType === 'transactions' || reportType === 'consumption') {
      let q = supabase.from('inventory_transactions').select('*, inventory_products(name, product_code, unit)').order('transaction_date', { ascending: false }).limit(200);
      if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      if (dateFrom) q = q.gte('transaction_date', dateFrom + 'T00:00:00');
      if (dateTo) q = q.lte('transaction_date', dateTo + 'T23:59:59');
      if (reportType === 'consumption') q = q.eq('transaction_type', 'consumption');
      const { data } = await q;
      setTransactions(data ?? []);
    }
    setLoading(false);
  }, [reportType, branchFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  if (!canViewReports) {
    return <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500"><Lock className="w-4 h-4" /> You need inventory reports permission to view this section.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select value={reportType} onChange={e => setReportType(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
          {REPORTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        {(reportType === 'transactions' || reportType === 'consumption') && (
          <>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </>
        )}
        <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
      ) : reportType === 'valuation' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.5fr_100px_90px_100px_100px_100px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span>Product</span><span>Type</span><span className="text-right">Stock</span><span className="text-right">Avg Cost</span><span className="text-right">Inv Value</span><span className="text-right">Sell Value</span>
            </div>
            <div className="divide-y divide-slate-50">
              {products.map(p => (
                <div key={p.id} className="grid grid-cols-[1.5fr_100px_90px_100px_100px_100px] items-center px-5 py-3 text-sm">
                  <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                  <span className="text-xs text-slate-500">{p.inventory_type}</span>
                  <span className="text-right text-slate-700">{fmtNum(p.current_stock)}</span>
                  <span className="text-right text-slate-600">{fmtMoney(p.average_cost)}</span>
                  <span className="text-right font-semibold text-slate-700">{fmtMoney(Number(p.current_stock) * Number(p.average_cost))}</span>
                  <span className="text-right text-slate-600">{fmtMoney(Number(p.current_stock) * Number(p.selling_price))}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-[1.5fr_100px_90px_100px_100px_100px] px-5 py-3 bg-slate-50 border-t-2 border-slate-200 text-sm font-bold text-slate-800">
              <span>Total</span><span></span><span></span><span></span>
              <span className="text-right">{fmtMoney(products.reduce((s, p) => s + Number(p.current_stock) * Number(p.average_cost), 0))}</span>
              <span className="text-right">{fmtMoney(products.reduce((s, p) => s + Number(p.current_stock) * Number(p.selling_price), 0))}</span>
            </div>
          </div>
        </div>
      ) : reportType === 'low_stock' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {products.filter(p => p.current_stock <= p.reorder_point).map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div><p className="font-semibold text-slate-800">{p.name}</p><p className="text-xs text-slate-400">{p.product_code}</p></div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-600">Stock: <span className="font-bold text-amber-600">{fmtNum(p.current_stock)}</span></span>
                  <span className="text-slate-500">Reorder at: {fmtNum(p.reorder_point)}</span>
                  <span className="text-slate-500">Reorder qty: {fmtNum(p.reorder_quantity)}</span>
                </div>
              </div>
            ))}
            {products.filter(p => p.current_stock <= p.reorder_point).length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No low stock items</p>}
          </div>
        </div>
      ) : reportType === 'near_expiry' || reportType === 'expired' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1.5fr_120px_100px_100px_80px_90px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span>Product</span><span>Batch</span><span>Supplier</span><span>Expiry</span><span className="text-right">Remaining</span><span>Status</span>
            </div>
            <div className="divide-y divide-slate-50">
              {batches.filter(b => reportType === 'expired' ? b.computed_status === 'expired' : b.computed_status === 'near_expiry').map(b => (
                <div key={b.id} className="grid grid-cols-[1.5fr_120px_100px_100px_80px_90px] items-center px-5 py-3 text-sm">
                  <p className="font-semibold text-slate-800 truncate">{b.inventory_products?.name}</p>
                  <span className="text-xs font-mono text-slate-600">{b.batch_number}</span>
                  <span className="text-xs text-slate-500">{b.inventory_suppliers?.name ?? '—'}</span>
                  <span className="text-xs text-slate-600">{b.expiration_date}</span>
                  <span className="text-right text-slate-700">{fmtNum(b.remaining_quantity)}</span>
                  <span><span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${batchStatusLabel(b.computed_status as BatchStatus).cls}`}>{batchStatusLabel(b.computed_status as BatchStatus).label}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[120px_1fr_90px_80px_80px_80px_80px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span>Date</span><span>Product</span><span>Type</span><span className="text-right">Qty</span><span className="text-right">Before</span><span className="text-right">After</span><span>Reason</span>
            </div>
            <div className="divide-y divide-slate-50">
              {transactions.map(t => (
                <div key={t.id} className="grid grid-cols-[120px_1fr_90px_80px_80px_80px_80px] items-center px-5 py-2.5 text-sm">
                  <span className="text-xs text-slate-500">{new Date(t.transaction_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <p className="font-medium text-slate-700 truncate">{t.inventory_products?.name}</p>
                  <span className="text-xs text-slate-500">{t.transaction_type}</span>
                  <span className={`text-right font-semibold ${Number(t.quantity) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{Number(t.quantity) > 0 ? '+' : ''}{fmtNum(t.quantity)}</span>
                  <span className="text-right text-slate-500">{fmtNum(t.before_quantity)}</span>
                  <span className="text-right text-slate-700">{fmtNum(t.after_quantity)}</span>
                  <span className="text-xs text-slate-400 truncate">{t.reason ?? '—'}</span>
                </div>
              ))}
              {transactions.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No transactions found</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared UI Helpers ───────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function DeleteConfirmModal({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: () => void }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-600" /></div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Deactivate Product?</h3>
            <p className="text-sm text-slate-500">{name} will be marked inactive.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false); }} disabled={deleting} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}
