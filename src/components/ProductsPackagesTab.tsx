import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, Plus, Pencil, Copy, Eye, Loader2, X, ChevronDown,
  Package, Droplet, FlaskConical, PlusCircle, Layers, Boxes, Tag,
  CheckCircle, AlertCircle, DollarSign, Clock, ToggleLeft, ToggleRight,
  ArrowLeft, Save, Trash2, Link2, Link2Off, AlertTriangle,
} from 'lucide-react';
import { supabase, type CatalogItem, type CatalogItemType, type CatalogCategory, type TreatmentRecipeItem } from '../lib/supabase';

// ─── Constants ──────────────────────────────────────────────────────────────

const ITEM_TYPE_CFG: Record<CatalogItemType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  iv_drip: { label: 'IV Drip', icon: Droplet, color: 'text-teal-600', bg: 'bg-teal-50' },
  peptide: { label: 'Peptide', icon: FlaskConical, color: 'text-violet-600', bg: 'bg-violet-50' },
  add_on: { label: 'Add-on', icon: PlusCircle, color: 'text-amber-600', bg: 'bg-amber-50' },
  session_package: { label: 'Session Package', icon: Layers, color: 'text-blue-600', bg: 'bg-blue-50' },
  physical_product: { label: 'Physical Product', icon: Package, color: 'text-slate-600', bg: 'bg-slate-50' },
};

const SUB_TABS: { key: string; label: string; icon: React.ElementType; filter?: CatalogItemType }[] = [
  { key: 'all', label: 'All Items', icon: Boxes },
  { key: 'iv_drip', label: 'IV Drips', icon: Droplet, filter: 'iv_drip' },
  { key: 'peptide', label: 'Peptides', icon: FlaskConical, filter: 'peptide' },
  { key: 'add_on', label: 'Add-ons', icon: PlusCircle, filter: 'add_on' },
  { key: 'session_package', label: 'Session Packages', icon: Layers, filter: 'session_package' },
  { key: 'mapping', label: 'Inventory Mapping', icon: Link2 },
  { key: 'categories', label: 'Categories', icon: Tag },
];

// Item types that consume inventory. A session package or physical product has
// nothing to deduct, so an absent recipe is only a problem for these.
const RECIPE_REQUIRED_TYPES: CatalogItemType[] = ['iv_drip', 'peptide', 'add_on'];

type RecipeGap = { label: string; detail: string } | null;

// Returns the warning to show for an item, or null when nothing is wrong.
// `coverage` maps catalog_item_id -> component count; a missing key means the
// item has no linked recipe at all.
function recipeGapFor(item: CatalogItem, coverage: Map<string, number>): RecipeGap {
  if (!item.is_active) return null;
  if (!RECIPE_REQUIRED_TYPES.includes(item.item_type)) return null;

  if (!coverage.has(item.id)) {
    return { label: 'No recipe', detail: 'No inventory recipe is linked, so nothing will be deducted when this treatment is given.' };
  }
  if (coverage.get(item.id) === 0) {
    return { label: 'Empty recipe', detail: 'The linked recipe has no components, so nothing will be deducted when this treatment is given.' };
  }
  return null;
}

function formatPeso(n: number | null | undefined): string {
  return `₱${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ProductsPackagesTab({
  canCreate, canEdit, canActivate, canManagePricing, canManageRecipes, canManageCategories, canDelete,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canActivate: boolean;
  canManagePricing: boolean;
  canManageRecipes: boolean;
  canManageCategories: boolean;
  canDelete: boolean;
}) {
  const [subTab, setSubTab] = useState('all');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterActive, setFilterActive] = useState('ALL');
  const [filterMapping, setFilterMapping] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'category' | 'display_order'>('display_order');

  // Modals
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [viewing, setViewing] = useState<CatalogItem | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogItem | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // catalog_item_id -> component count. Missing key means no linked recipe.
  const [recipeCoverage, setRecipeCoverage] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [itemsRes, catRes, recipeRes, recipeItemRes] = await Promise.all([
      supabase.from('catalog_items')
        .select('*, catalog_categories(id,name), included_catalog_item:catalog_items!included_catalog_item_id(id,name)')
        .order('display_order', { ascending: true }),
      supabase.from('catalog_categories').select('*').order('display_order', { ascending: true }),
      // Recipe coverage, so items that would silently deduct nothing are visible.
      supabase.from('treatment_recipes').select('id, catalog_item_id').eq('is_active', true),
      supabase.from('treatment_recipe_items').select('recipe_id'),
    ]);

    // catalog_item_id -> number of components (absent = no recipe at all)
    const componentCount = new Map<string, number>();
    if (recipeRes.data && recipeItemRes.data) {
      const perRecipe = new Map<string, number>();
      recipeItemRes.data.forEach(ri => perRecipe.set(ri.recipe_id, (perRecipe.get(ri.recipe_id) ?? 0) + 1));
      recipeRes.data.forEach(r => {
        if (r.catalog_item_id) componentCount.set(r.catalog_item_id, perRecipe.get(r.id) ?? 0);
      });
    }
    setRecipeCoverage(componentCount);
    if (itemsRes.error) setError(itemsRes.error.message);
    else setItems((itemsRes.data ?? []) as unknown as CatalogItem[]);
    if (catRes.error) setError(catRes.error.message);
    else setCategories(catRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered + sorted items
  const filtered = items
    .filter(i => {
      if (subTab === 'mapping') return true;
      const typeFilter = SUB_TABS.find(s => s.key === subTab)?.filter;
      if (typeFilter && i.item_type !== typeFilter) return false;
      if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !(i.internal_code ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory !== 'ALL' && i.category_id !== filterCategory) return false;
      if (filterActive === 'active' && !i.is_active) return false;
      if (filterActive === 'inactive' && i.is_active) return false;
      if (filterMapping === 'mapped' && !i.inventory_tracking_enabled) return false;
      if (filterMapping === 'partial' && i.inventory_tracking_enabled && !i.inventory_product_id) return false;
      if (filterMapping === 'unmapped' && !i.inventory_tracking_enabled) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'price': return a.selling_price - b.selling_price;
        case 'category': return (a.catalog_categories?.name ?? '').localeCompare(b.catalog_categories?.name ?? '');
        default: return a.display_order - b.display_order;
      }
    });

  async function toggleActive(item: CatalogItem) {
    if (!canActivate) return;
    const { error: err } = await supabase.from('catalog_items').update({ is_active: !item.is_active }).eq('id', item.id);
    if (err) setError(err.message);
    else { setSuccessMsg(`${item.name} ${!item.is_active ? 'activated' : 'deactivated'}.`); setTimeout(() => setSuccessMsg(null), 3000); load(); }
  }

  async function duplicate(item: CatalogItem) {
    if (!canCreate) return;
    const { id, created_at, updated_at, created_by, updated_by, ...rest } = item;
    const { error: err } = await supabase.from('catalog_items').insert({
      ...rest,
      name: `${item.name} (Copy)`,
      internal_code: null,
      is_active: false,
      display_order: item.display_order + 1,
    });
    if (err) setError(err.message);
    else { setSuccessMsg('Item duplicated. Review and activate when ready.'); setTimeout(() => setSuccessMsg(null), 4000); load(); }
  }

  // Dependency check against live schema FKs to catalog_items.
  // Blockers: another package including this item (included_catalog_item_id).
  // Owned config (treatment_recipes.catalog_item_id) is cleaned up WITH the item, not a blocker.
  async function checkDependencies(itemId: string): Promise<{ blocked: boolean; reason?: string }> {
    const { count: includedIn } = await supabase
      .from('catalog_items')
      .select('id', { count: 'exact', head: true })
      .eq('included_catalog_item_id', itemId);
    if ((includedIn ?? 0) > 0) {
      return { blocked: true, reason: 'This product is included in one or more session packages.' };
    }
    return { blocked: false };
  }

  async function handleDelete(item: CatalogItem) {
    if (!canDelete || !deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { blocked, reason } = await checkDependencies(item.id);
      if (blocked) {
        setDeleteError(reason ?? 'This product cannot be permanently deleted because it is already connected to existing records. Deactivate it instead to prevent future use while preserving historical data.');
        return;
      }
      // Clean up owned configuration: the treatment recipe attached to this catalog item.
      const { data: recipe } = await supabase.from('treatment_recipes').select('id').eq('catalog_item_id', item.id).maybeSingle();
      if (recipe) {
        await supabase.from('treatment_recipe_items').delete().eq('recipe_id', recipe.id);
        await supabase.from('treatment_recipes').delete().eq('id', recipe.id);
      }
      const { error: delErr } = await supabase.from('catalog_items').delete().eq('id', item.id);
      if (delErr) {
        console.error('Catalog delete failed:', delErr);
        setDeleteError('This product cannot be permanently deleted because it is already connected to existing records. Deactivate it instead to prevent future use while preserving historical data.');
        return;
      }
      setDeleteTarget(null);
      setDeleteConfirmName('');
      setSuccessMsg('Product deleted successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
      await load();
    } catch (e) {
      console.error('Catalog delete error:', e);
      setDeleteError('Unable to delete this product right now. Please try again or contact support.');
    } finally {
      setDeleting(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (viewing) {
    return <ItemDetail item={viewing} categories={categories} onBack={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); setShowEditor(true); }} />;
  }

  if (showEditor) {
    return (
      <ItemEditor
        item={editing}
        categories={categories}
        allItems={items}
        canManagePricing={canManagePricing}
        canManageRecipes={canManageRecipes}
        onClose={() => { setShowEditor(false); setEditing(null); }}
        onSaved={() => { setShowEditor(false); setEditing(null); load(); setSuccessMsg('Saved successfully.'); setTimeout(() => setSuccessMsg(null), 3000); }}
      />
    );
  }

  if (subTab === 'categories') {
    return <CategoriesTab categories={categories} canManage={canManageCategories} onRefresh={load} onBack={() => setSubTab('all')} error={error} successMsg={successMsg} clearSuccess={() => setSuccessMsg(null)} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Products & Packages</h2>
          <p className="text-xs text-slate-400 mt-0.5">Central catalog for IV drips, peptides, add-ons, and session packages.</p>
        </div>
        {canCreate && (
          <button onClick={() => { setEditing(null); setShowEditor(true); }} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Item
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {SUB_TABS.map(st => {
          const Icon = st.icon;
          const active = subTab === st.key;
          return (
            <button key={st.key} onClick={() => setSubTab(st.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${active ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
              <Icon className="w-3.5 h-3.5" /> {st.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm mb-4">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name or code..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700" />
        </div>
        {subTab !== 'mapping' && (
          <>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="ALL">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500">
              <option value="ALL">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </>
        )}
        <select value={filterMapping} onChange={e => setFilterMapping(e.target.value)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="ALL">All Mapping</option>
          <option value="mapped">Mapped</option>
          <option value="partial">Partially Mapped</option>
          <option value="unmapped">Not Mapped</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="display_order">Sort: Display Order</option>
          <option value="name">Sort: Name</option>
          <option value="price">Sort: Price</option>
          <option value="category">Sort: Category</option>
        </select>
      </div>

      {/* Recipe coverage summary. Without this, an item that deducts nothing is
          indistinguishable from one that works until stock stops adding up. */}
      {!loading && (() => {
        const gaps = items.filter(i => recipeGapFor(i, recipeCoverage));
        if (gaps.length === 0) return null;
        return (
          <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-800">
                {gaps.length} active {gaps.length === 1 ? 'treatment has' : 'treatments have'} no inventory recipe
              </p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Nothing is deducted from stock when {gaps.length === 1 ? 'it is' : 'these are'} given: {gaps.slice(0, 6).map(g => g.name).join(', ')}
                {gaps.length > 6 ? `, and ${gaps.length - 6} more` : ''}.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm">No items found. {canCreate && 'Create your first catalog item.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cfg = ITEM_TYPE_CFG[item.item_type];
            const Icon = cfg.icon;
            const gap = recipeGapFor(item, recipeCoverage);
            const mappingStatus = !item.inventory_tracking_enabled ? 'unmapped' : item.inventory_product_id ? 'mapped' : 'partial';
            const mappingCfg = mappingStatus === 'mapped' ? { label: 'Mapped', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' }
              : mappingStatus === 'partial' ? { label: 'Partially Mapped', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' }
              : { label: 'Not Mapped', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200' };
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Icon + name */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-10 h-10 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                        {!item.is_active && <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full">INACTIVE</span>}
                        {item.featured && <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[10px] font-bold rounded-full border border-teal-100">FEATURED</span>}
                        {gap && (
                          <span title={gap.detail}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-full">
                            <AlertTriangle className="w-2.5 h-2.5" /> {gap.label.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{item.internal_code ?? 'No code'} · {cfg.label}{item.catalog_categories ? ` · ${item.catalog_categories.name}` : ''}</p>
                      {item.short_description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{item.short_description}</p>}
                    </div>
                  </div>
                  {/* Price + badges */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 flex-shrink-0">
                    <p className="text-lg font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatPeso(item.selling_price)}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${mappingCfg.bg} ${mappingCfg.color}`}>
                      {mappingCfg.label}
                    </span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                  <button onClick={() => setViewing(item)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  {canEdit && (
                    <button onClick={() => { setEditing(item); setShowEditor(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                  {canActivate && (
                    <button onClick={() => toggleActive(item)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors ${item.is_active ? 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100' : 'text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}>
                      {item.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {item.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                  {canCreate && (
                    <button onClick={() => duplicate(item)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => { setDeleteTarget(item); setDeleteConfirmName(''); setDeleteError(null); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          confirmName={deleteConfirmName}
          setConfirmName={setDeleteConfirmName}
          deleting={deleting}
          error={deleteError}
          onCancel={() => { setDeleteTarget(null); setDeleteConfirmName(''); setDeleteError(null); }}
          onConfirm={() => handleDelete(deleteTarget)}
          onDeactivate={() => { toggleActive(deleteTarget); setDeleteTarget(null); setDeleteConfirmName(''); setDeleteError(null); }}
        />
      )}
    </div>
  );
}

// ─── Delete Confirmation Modal ──────────────────────────────────────────────

function DeleteConfirmModal({ item, confirmName, setConfirmName, deleting, error, onCancel, onConfirm, onDeactivate }: {
  item: CatalogItem;
  confirmName: string;
  setConfirmName: (v: string) => void;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onDeactivate: () => void;
}) {
  const nameMatches = confirmName.trim() === item.name;
  const isInactive = !item.is_active;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800 text-lg">Delete product permanently?</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {error ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {isInactive && (
              <p className="text-xs text-slate-400 text-center">This product is inactive and retained for historical records.</p>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
              {!isInactive && (
                <button onClick={onDeactivate} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors">
                  <ToggleLeft className="w-4 h-4" /> Deactivate Product
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              You are about to permanently delete <span className="font-bold text-slate-800">'{item.name}'</span>. This action cannot be undone.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                Type the product name to confirm: <span className="font-bold text-slate-700">{item.name}</span>
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder={item.name}
                autoFocus
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
              <button
                onClick={onConfirm}
                disabled={!nameMatches || deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item Detail View ───────────────────────────────────────────────────────

function ItemDetail({ item, categories, onBack, onEdit }: {
  item: CatalogItem; categories: CatalogCategory[]; onBack: () => void; onEdit: () => void;
}) {
  const cfg = ITEM_TYPE_CFG[item.item_type];
  const Icon = cfg.icon;
  const cat = categories.find(c => c.id === item.category_id);
  const [recipeItems, setRecipeItems] = useState<TreatmentRecipeItem[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRecipe(true);
      const { data: recipe } = await supabase.from('treatment_recipes').select('id').eq('catalog_item_id', item.id).maybeSingle();
      if (recipe) {
        const { data: items } = await supabase.from('treatment_recipe_items')
          .select('*, inventory_products(name, product_code, unit)')
          .eq('recipe_id', recipe.id);
        if (!cancelled) setRecipeItems((items ?? []) as unknown as TreatmentRecipeItem[]);
      } else {
        if (!cancelled) setRecipeItems([]);
      }
      if (!cancelled) setLoadingRecipe(false);
    })();
    return () => { cancelled = true; };
  }, [item.id]);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Catalog
      </button>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className={`w-14 h-14 ${cfg.bg} rounded-2xl flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-7 h-7 ${cfg.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{item.name}</h2>
              {!item.is_active && <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full">INACTIVE</span>}
              {item.featured && <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[10px] font-bold rounded-full border border-teal-100">FEATURED</span>}
            </div>
            <p className="text-sm text-slate-400 mt-1">{item.internal_code ?? 'No internal code'} · {cfg.label}{cat ? ` · ${cat.name}` : ''}</p>
          </div>
          <p className="text-2xl font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatPeso(item.selling_price)}</p>
        </div>

        {item.full_description && (
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Description</p>
            <p className="text-sm text-slate-600 leading-relaxed">{item.full_description}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-6">
          <DetailRow label="Item Type" value={cfg.label} />
          <DetailRow label="Category" value={cat?.name} />
          <DetailRow label="Selling Price" value={formatPeso(item.selling_price)} />
          <DetailRow label="Cost" value={item.cost != null ? formatPeso(item.cost) : null} />
          <DetailRow label="Taxable" value={item.taxable ? 'Yes' : 'No'} />
          <DetailRow label="Duration" value={item.duration_minutes ? `${item.duration_minutes} min` : null} />
          {item.item_type === 'session_package' && (
            <>
              <DetailRow label="Paid Sessions" value={item.paid_sessions?.toString()} />
              <DetailRow label="Free Sessions" value={item.free_sessions?.toString()} />
              <DetailRow label="Total Usable" value={item.total_usable_sessions?.toString()} />
              <DetailRow label="Validity" value={item.validity_days ? `${item.validity_days} days` : null} />
              <DetailRow label="Transferable" value={item.transferable === true ? 'Yes' : item.transferable === false ? 'No' : null} />
            </>
          )}
          <DetailRow label="Inventory Tracking" value={item.inventory_tracking_enabled ? 'Enabled' : 'Disabled'} />
          <DetailRow label="Display Order" value={item.display_order.toString()} />
        </div>

        {item.terms_notes && (
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Terms & Notes</p>
            <p className="text-sm text-slate-600 leading-relaxed">{item.terms_notes}</p>
          </div>
        )}

        {/* Recipe mapping */}
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Inventory Recipe</p>
          {loadingRecipe ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading recipe...</div>
          ) : recipeItems.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <Link2Off className="w-4 h-4" /> Not mapped to any inventory recipe.
            </div>
          ) : (
            <div className="space-y-2">
              {recipeItems.map(ri => (
                <div key={ri.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{ri.inventory_products?.name ?? 'Unknown product'}</p>
                    <p className="text-xs text-slate-400">{ri.inventory_products?.product_code} · {ri.inventory_products?.unit}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-700 tabular-nums">{Number(ri.quantity)} {ri.unit_of_measure ?? ri.inventory_products?.unit}</span>
                  {ri.is_required ? (
                    <span className="px-2 py-0.5 bg-teal-50 text-teal-600 text-[10px] font-bold rounded-full border border-teal-100">REQUIRED</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full">OPTIONAL</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4 border-t border-slate-100">
          <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors">
            <Pencil className="w-4 h-4" /> Edit Item
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-semibold">{value}</p>
    </div>
  );
}

// ─── Item Editor ────────────────────────────────────────────────────────────

function ItemEditor({ item, categories, allItems, canManagePricing, canManageRecipes, onClose, onSaved }: {
  item: CatalogItem | null;
  categories: CatalogCategory[];
  allItems: CatalogItem[];
  canManagePricing: boolean;
  canManageRecipes: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPackage = (item?.item_type ?? 'iv_drip') === 'session_package';
  const [form, setForm] = useState({
    name: item?.name ?? '',
    internal_code: item?.internal_code ?? '',
    category_id: item?.category_id ?? '',
    item_type: item?.item_type ?? 'iv_drip',
    short_description: item?.short_description ?? '',
    full_description: item?.full_description ?? '',
    selling_price: item?.selling_price ?? 0,
    cost: item?.cost ?? '',
    taxable: item?.taxable ?? false,
    is_active: item?.is_active ?? true,
    featured: item?.featured ?? false,
    display_order: item?.display_order ?? 0,
    image_url: item?.image_url ?? '',
    duration_minutes: item?.duration_minutes ?? '',
    inventory_tracking_enabled: item?.inventory_tracking_enabled ?? false,
    // Package fields
    paid_sessions: item?.paid_sessions ?? '',
    free_sessions: item?.free_sessions ?? '',
    validity_days: item?.validity_days ?? '',
    transferable: item?.transferable ?? false,
    terms_notes: item?.terms_notes ?? '',
    included_catalog_item_id: item?.included_catalog_item_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Recipe state
  const [recipeItems, setRecipeItems] = useState<TreatmentRecipeItem[]>([]);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [inventoryProducts, setInventoryProducts] = useState<{ id: string; name: string; product_code: string; unit: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('inventory_products').select('id, name, product_code, unit').eq('is_active', true).order('name');
      setInventoryProducts(data ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!item) { setRecipeItems([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingRecipe(true);
      const { data: recipe } = await supabase.from('treatment_recipes').select('id').eq('catalog_item_id', item.id).maybeSingle();
      if (recipe && !cancelled) {
        const { data: items } = await supabase.from('treatment_recipe_items')
          .select('*, inventory_products(name, product_code, unit)')
          .eq('recipe_id', recipe.id);
        setRecipeItems((items ?? []) as unknown as TreatmentRecipeItem[]);
      } else if (!cancelled) {
        setRecipeItems([]);
      }
      if (!cancelled) setLoadingRecipe(false);
    })();
    return () => { cancelled = true; };
  }, [item]);

  const showRecipeSection = ['iv_drip', 'peptide', 'add_on'].includes(form.item_type);
  const showPackageSection = form.item_type === 'session_package';
  const showDuration = ['iv_drip', 'peptide'].includes(form.item_type);

  async function checkCodeUnique(code: string): Promise<boolean> {
    if (!code) return true;
    let query = supabase.from('catalog_items').select('id').eq('internal_code', code);
    if (item?.id) query = query.neq('id', item.id);
    const { data } = await query;
    return !data || data.length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCodeError(null);

    if (!form.name.trim()) { setError('Name is required.'); return; }

    const code = form.internal_code.trim();
    if (code) {
      const unique = await checkCodeUnique(code);
      if (!unique) { setCodeError('This internal code is already in use. Choose a unique code.'); return; }
    }

    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      internal_code: code || null,
      category_id: form.category_id || null,
      item_type: form.item_type,
      short_description: form.short_description || null,
      full_description: form.full_description || null,
      selling_price: Number(form.selling_price) || 0,
      cost: form.cost === '' ? null : Number(form.cost),
      taxable: form.taxable,
      is_active: form.is_active,
      featured: form.featured,
      display_order: Number(form.display_order) || 0,
      image_url: form.image_url || null,
      duration_minutes: showDuration ? (form.duration_minutes === '' ? null : Number(form.duration_minutes)) : null,
      inventory_tracking_enabled: form.inventory_tracking_enabled,
      paid_sessions: showPackageSection ? (form.paid_sessions === '' ? null : Number(form.paid_sessions)) : null,
      free_sessions: showPackageSection ? (form.free_sessions === '' ? null : Number(form.free_sessions)) : null,
      validity_days: showPackageSection ? (form.validity_days === '' ? null : Number(form.validity_days)) : null,
      transferable: showPackageSection ? form.transferable : null,
      terms_notes: showPackageSection ? (form.terms_notes || null) : null,
      included_catalog_item_id: showPackageSection ? (form.included_catalog_item_id || null) : null,
    };

    let savedId = item?.id;
    if (item) {
      const { error: err } = await supabase.from('catalog_items').update(payload).eq('id', item.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { data, error: err } = await supabase.from('catalog_items').insert(payload).select('id').single();
      if (err) { setError(err.message); setSaving(false); return; }
      savedId = data.id;
    }

    // Save recipe items if recipe section is visible and user can manage recipes.
    // The catalog item is already persisted at this point, so any failure below is
    // reported without closing the editor — the recipe is the only unsaved part.
    if (showRecipeSection && canManageRecipes && savedId) {
      // Upsert recipe
      const { data: existingRecipe, error: findErr } = await supabase.from('treatment_recipes').select('id').eq('catalog_item_id', savedId).maybeSingle();
      if (findErr) { setError(`Product saved, but the inventory recipe could not be loaded: ${findErr.message}`); setSaving(false); return; }

      let recipeId = existingRecipe?.id;
      if (!recipeId) {
        const { data: newRecipe, error: recipeErr } = await supabase.from('treatment_recipes').insert({
          treatment_name: form.name.trim(),
          description: form.short_description || null,
          is_active: true,
          catalog_item_id: savedId,
        }).select('id').single();
        if (recipeErr) { setError(`Product saved, but the inventory recipe could not be created: ${recipeErr.message}`); setSaving(false); return; }
        recipeId = newRecipe?.id;
      } else {
        const { error: updateErr } = await supabase.from('treatment_recipes').update({ treatment_name: form.name.trim(), updated_at: new Date().toISOString() }).eq('id', recipeId);
        if (updateErr) { setError(`Product saved, but the inventory recipe could not be updated: ${updateErr.message}`); setSaving(false); return; }
      }

      if (!recipeId) { setError('Product saved, but the inventory recipe could not be created. Components were not saved.'); setSaving(false); return; }

      // Delete old items and re-insert
      const { error: clearErr } = await supabase.from('treatment_recipe_items').delete().eq('recipe_id', recipeId);
      if (clearErr) { setError(`Product saved, but existing components could not be replaced: ${clearErr.message}`); setSaving(false); return; }

      const validItems = recipeItems.filter(ri => ri.product_id);
      if (validItems.length > 0) {
        const { error: itemsErr } = await supabase.from('treatment_recipe_items').insert(validItems.map(ri => ({
          recipe_id: recipeId,
          product_id: ri.product_id,
          quantity: Number(ri.quantity) || 1,
          unit_of_measure: ri.unit_of_measure || null,
          is_required: ri.is_required,
          allow_substitution: ri.allow_substitution,
          waste_allowance: ri.waste_allowance != null ? Number(ri.waste_allowance) : null,
          notes: ri.notes || null,
        })));
        if (itemsErr) { setError(`Product saved, but the components could not be saved: ${itemsErr.message}`); setSaving(false); return; }
      }
    }

    setSaving(false);
    onSaved();
  }

  function addRecipeItem() {
    setRecipeItems(prev => [...prev, {
      id: crypto.randomUUID(),
      recipe_id: '',
      product_id: '',
      quantity: 1,
      notes: null,
      created_at: new Date().toISOString(),
      unit_of_measure: null,
      is_required: true,
      allow_substitution: false,
      waste_allowance: null,
      inventory_products: null,
    }]);
  }

  function updateRecipeItem(idx: number, field: string, value: unknown) {
    setRecipeItems(prev => prev.map((ri, i) => i === idx ? { ...ri, [field]: value } : ri));
  }

  function removeRecipeItem(idx: number) {
    setRecipeItems(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
          <h2 className="text-lg font-bold text-slate-800">{item ? 'Edit Item' : 'New Catalog Item'}</h2>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* A. Basic Information */}
        <FormSection title="Basic Information">
          <Field label="Name" required>
            <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className={inputCls} placeholder="e.g. Cellular Renewal (Pure NAD)" />
          </Field>
          <Field label="Internal Code / SKU">
            <input type="text" value={form.internal_code} onChange={e => { setForm({ ...form, internal_code: e.target.value }); setCodeError(null); }}
              className={`${inputCls} ${codeError ? 'border-red-300 bg-red-50' : ''}`} placeholder="Unique code (optional)" />
            {codeError && <p className="text-xs text-red-500 mt-1">{codeError}</p>}
          </Field>
          <Field label="Item Type">
            <select value={form.item_type} onChange={e => setForm({ ...form, item_type: e.target.value as CatalogItemType })} className={inputCls} disabled={!!item}>
              {Object.entries(ITEM_TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              <option value="physical_product">Physical Product</option>
            </select>
            {item && <p className="text-[11px] text-slate-400 mt-1">Item type cannot be changed after creation.</p>}
          </Field>
          <Field label="Category">
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={inputCls}>
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Short Description" full>
            <input type="text" value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })}
              className={inputCls} placeholder="One-line summary" />
          </Field>
          <Field label="Full Description" full>
            <textarea value={form.full_description} onChange={e => setForm({ ...form, full_description: e.target.value })}
              className={`${inputCls} resize-none`} rows={3} placeholder="Detailed description" />
          </Field>
          <Field label="Image URL" full>
            <input type="text" value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })}
              className={inputCls} placeholder="https://..." />
          </Field>
        </FormSection>

        {/* B. Pricing */}
        <FormSection title="Pricing">
          <Field label="Selling Price">
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="number" step="0.01" value={form.selling_price} onChange={e => setForm({ ...form, selling_price: e.target.value })}
                className={`${inputCls} pl-9`} disabled={!canManagePricing && !!item} />
            </div>
          </Field>
          <Field label="Cost (optional)">
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="number" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })}
                className={`${inputCls} pl-9`} placeholder="0.00" disabled={!canManagePricing && !!item} />
            </div>
          </Field>
          <Field label="Taxable">
            <Toggle checked={form.taxable} onChange={v => setForm({ ...form, taxable: v })} />
          </Field>
        </FormSection>

        {/* C. Service Settings */}
        {showDuration && (
          <FormSection title="Service Settings">
            <Field label="Duration (minutes)">
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })}
                  className={`${inputCls} pl-9`} placeholder="e.g. 45" />
              </div>
            </Field>
          </FormSection>
        )}

        {/* D. Package Configuration */}
        {showPackageSection && (
          <FormSection title="Package Configuration">
            <Field label="Included Treatment / Service">
              <select value={form.included_catalog_item_id} onChange={e => setForm({ ...form, included_catalog_item_id: e.target.value })} className={inputCls}>
                <option value="">Select treatment...</option>
                {allItems.filter(i => i.id !== item?.id && ['iv_drip', 'peptide', 'add_on'].includes(i.item_type)).map(i => (
                  <option key={i.id} value={i.id}>{i.name} — {formatPeso(i.selling_price)}</option>
                ))}
              </select>
            </Field>
            <Field label="Paid Sessions">
              <input type="number" value={form.paid_sessions} onChange={e => setForm({ ...form, paid_sessions: e.target.value })}
                className={inputCls} placeholder="e.g. 10" />
            </Field>
            <Field label="Free Sessions">
              <input type="number" value={form.free_sessions} onChange={e => setForm({ ...form, free_sessions: e.target.value })}
                className={inputCls} placeholder="e.g. 2" />
            </Field>
            <Field label="Total Usable Sessions">
              <p className="text-sm font-bold text-slate-700 py-2.5 tabular-nums">
                {(Number(form.paid_sessions) || 0) + (Number(form.free_sessions) || 0)}
              </p>
            </Field>
            <Field label="Validity (days)">
              <input type="number" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })}
                className={inputCls} placeholder="e.g. 90" />
            </Field>
            <Field label="Transferable">
              <Toggle checked={!!form.transferable} onChange={v => setForm({ ...form, transferable: v })} />
            </Field>
            <Field label="Terms & Notes" full>
              <textarea value={form.terms_notes} onChange={e => setForm({ ...form, terms_notes: e.target.value })}
                className={`${inputCls} resize-none`} rows={3} placeholder="Package terms, conditions, and notes" />
            </Field>
          </FormSection>
        )}

        {/* E. Inventory Recipe */}
        {showRecipeSection && (
          <FormSection title="Inventory Recipe">
            {!canManageRecipes && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">You do not have permission to edit inventory recipes.</p>
            )}
            {loadingRecipe ? (
              <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading recipe...</div>
            ) : (
              <div className="space-y-3">
                {recipeItems.map((ri, idx) => {
                  const productInList = inventoryProducts.some(p => p.id === ri.product_id);
                  return (
                  <div key={idx} className="flex flex-col sm:flex-row gap-2 bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <select value={ri.product_id} onChange={e => updateRecipeItem(idx, 'product_id', e.target.value)}
                      className={`${inputCls} flex-1 sm:w-auto`} disabled={!canManageRecipes}>
                      <option value="">Select a Product</option>
                      {inventoryProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      {!productInList && ri.product_id && ri.inventory_products && (
                        <option value={ri.product_id}>{ri.inventory_products.name} ({ri.inventory_products.product_code})</option>
                      )}
                    </select>
                    <input type="number" step="0.01" value={ri.quantity} onChange={e => updateRecipeItem(idx, 'quantity', e.target.value)}
                      className={`${inputCls} sm:w-24`} placeholder="Qty" disabled={!canManageRecipes} />
                    <input type="text" value={ri.unit_of_measure ?? ''} onChange={e => updateRecipeItem(idx, 'unit_of_measure', e.target.value)}
                      className={`${inputCls} sm:w-24`} placeholder="Unit" disabled={!canManageRecipes} />
                    <select value={ri.is_required ? 'required' : 'optional'} onChange={e => updateRecipeItem(idx, 'is_required', e.target.value === 'required')}
                      className={`${inputCls} sm:w-28`} disabled={!canManageRecipes}>
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                    <button type="button" onClick={() => removeRecipeItem(idx)} disabled={!canManageRecipes}
                      className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  );
                })}
                {canManageRecipes && (
                  <button type="button" onClick={addRecipeItem}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-600 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add Component
                  </button>
                )}
                <p className="text-[11px] text-slate-400">Recipe mapping is optional. Inventory is not deducted during catalog creation.</p>
              </div>
            )}
          </FormSection>
        )}

        {/* F. Visibility and Status */}
        <FormSection title="Visibility and Status">
          <Field label="Active">
            <Toggle checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
          </Field>
          <Field label="Featured">
            <Toggle checked={form.featured} onChange={v => setForm({ ...form, featured: v })} />
          </Field>
          <Field label="Display Order">
            <input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: e.target.value })}
              className={inputCls} />
          </Field>
          <Field label="Inventory Tracking Enabled">
            <Toggle checked={form.inventory_tracking_enabled} onChange={v => setForm({ ...form, inventory_tracking_enabled: v })} />
          </Field>
        </FormSection>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400';

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 py-2.5 ${checked ? 'text-teal-600' : 'text-slate-400'}`}>
      {checked ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
      <span className="text-sm font-semibold">{checked ? 'Yes' : 'No'}</span>
    </button>
  );
}

// ─── Categories Tab ─────────────────────────────────────────────────────────

function CategoriesTab({ categories, canManage, onRefresh, onBack, error, successMsg, clearSuccess }: {
  categories: CatalogCategory[];
  canManage: boolean;
  onRefresh: () => void;
  onBack: () => void;
  error: string | null;
  successMsg: string | null;
  clearSuccess: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingCat, setEditingCat] = useState<CatalogCategory | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  function openNew() { setEditingCat(null); setName(''); setDescription(''); setDisplayOrder(0); setShowModal(true); }
  function openEdit(c: CatalogCategory) { setEditingCat(c); setName(c.name); setDescription(c.description ?? ''); setDisplayOrder(c.display_order); setShowModal(true); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { name: name.trim(), description: description || null, display_order: Number(displayOrder) || 0 };
    if (editingCat) {
      await supabase.from('catalog_categories').update(payload).eq('id', editingCat.id);
    } else {
      await supabase.from('catalog_categories').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    onRefresh();
  }

  async function deleteCat(c: CatalogCategory) {
    if (!confirm(`Delete category "${c.name}"? Items will be uncategorized.`)) return;
    await supabase.from('catalog_categories').delete().eq('id', c.id);
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h2 className="text-lg font-bold text-slate-800">Categories</h2>
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Category
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm mb-4">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm mb-4">
          <CheckCircle className="w-4 h-4" /> {successMsg}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <Tag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium text-sm">No categories yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Tag className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">{c.name}</p>
                {c.description && <p className="text-xs text-slate-400 mt-0.5">{c.description}</p>}
              </div>
              <span className="text-xs text-slate-400">Order: {c.display_order}</span>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(c)} className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteCat(c)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-slate-800 text-lg">{editingCat ? 'Edit Category' : 'New Category'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. IV Drips" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} resize-none`} rows={2} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Display Order</label>
                <input type="number" value={displayOrder} onChange={e => setDisplayOrder(Number(e.target.value))} className={inputCls} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
