import { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle,
  ChevronDown, ChevronRight, FolderPlus, Tag, AlertTriangle,
} from 'lucide-react';
import { supabase, type InventoryCategory, type InventorySubcategory } from '../lib/supabase';

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400';

export default function CategoryManagerModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [subcategories, setSubcategories] = useState<InventorySubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');

  // Category form state
  const [catEditing, setCatEditing] = useState<InventoryCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  // Subcategory form state
  const [subEditing, setSubEditing] = useState<InventorySubcategory | null>(null);
  const [subParent, setSubParent] = useState('');
  const [subName, setSubName] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [subSaving, setSubSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'subcategory'; id: string; name: string } | null>(null);
  const [deleteCount, setDeleteCount] = useState<number | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const [catRes, subRes] = await Promise.all([
      supabase.from('inventory_categories').select('*').order('display_order').order('name'),
      supabase.from('inventory_subcategories').select('*').order('display_order').order('name'),
    ]);
    if (catRes.error) setErr(catRes.error.message);
    else if (subRes.error) setErr(subRes.error.message);
    setCategories(catRes.data ?? []);
    setSubcategories(subRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startAddCategory() {
    setCatEditing(null);
    setCatName('');
    setCatDesc('');
  }

  function startEditCategory(cat: InventoryCategory) {
    setCatEditing(cat);
    setCatName(cat.name);
    setCatDesc(cat.description ?? '');
  }

  async function saveCategory() {
    if (!catName.trim()) { setErr('Category name is required.'); return; }
    setCatSaving(true);
    setErr('');
    const payload = { name: catName.trim(), description: catDesc.trim() || null };
    let result;
    if (catEditing) {
      result = await supabase.from('inventory_categories').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', catEditing.id);
    } else {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.display_order), 0);
      result = await supabase.from('inventory_categories').insert({ ...payload, display_order: maxOrder + 1 });
    }
    setCatSaving(false);
    if (result.error) {
      setErr(result.error.code === '23505' ? 'A category with this name already exists.' : result.error.message);
      return;
    }
    setCatEditing(null);
    setCatName('');
    setCatDesc('');
    onChanged?.();
    load();
  }

  function startAddSubcategory(categoryId: string) {
    setSubEditing(null);
    setSubParent(categoryId);
    setSubName('');
    setSubDesc('');
    setExpanded(prev => new Set(prev).add(categoryId));
  }

  function startEditSubcategory(sub: InventorySubcategory) {
    setSubEditing(sub);
    setSubParent(sub.category_id);
    setSubName(sub.name);
    setSubDesc(sub.description ?? '');
    setExpanded(prev => new Set(prev).add(sub.category_id));
  }

  async function saveSubcategory() {
    if (!subParent) { setErr('Parent category is required.'); return; }
    if (!subName.trim()) { setErr('Subcategory name is required.'); return; }
    setSubSaving(true);
    setErr('');
    const payload = { category_id: subParent, name: subName.trim(), description: subDesc.trim() || null };
    let result;
    if (subEditing) {
      result = await supabase.from('inventory_subcategories').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', subEditing.id);
    } else {
      const catSubs = subcategories.filter(s => s.category_id === subParent);
      const maxOrder = catSubs.reduce((m, s) => Math.max(m, s.display_order), 0);
      result = await supabase.from('inventory_subcategories').insert({ ...payload, display_order: maxOrder + 1 });
    }
    setSubSaving(false);
    if (result.error) {
      setErr(result.error.code === '23505' ? 'A subcategory with this name already exists under this category.' : result.error.message);
      return;
    }
    setSubEditing(null);
    setSubParent('');
    setSubName('');
    setSubDesc('');
    onChanged?.();
    load();
  }

  async function toggleCategoryActive(cat: InventoryCategory) {
    setErr('');
    const { error } = await supabase.from('inventory_categories').update({ is_active: !cat.is_active, updated_at: new Date().toISOString() }).eq('id', cat.id);
    if (error) { setErr(error.message); return; }
    onChanged?.();
    load();
  }

  async function toggleSubcategoryActive(sub: InventorySubcategory) {
    setErr('');
    const { error } = await supabase.from('inventory_subcategories').update({ is_active: !sub.is_active, updated_at: new Date().toISOString() }).eq('id', sub.id);
    if (error) { setErr(error.message); return; }
    onChanged?.();
    load();
  }

  async function checkDelete(target: { type: 'category' | 'subcategory'; id: string; name: string }) {
    setDeleteChecking(true);
    setDeleteErr('');
    setDeleteCount(null);
    const column = target.type === 'category' ? 'category' : 'sub_category';
    const { count, error } = await supabase
      .from('inventory_products')
      .select('id', { count: 'exact', head: true })
      .eq(column, target.name);
    setDeleteChecking(false);
    if (error) { setDeleteErr(error.message); return; }
    setDeleteCount(count ?? 0);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteCount === null || deleteCount > 0) return;
    setDeleteChecking(true);
    setDeleteErr('');
    const table = deleteTarget.type === 'category' ? 'inventory_categories' : 'inventory_subcategories';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    setDeleteChecking(false);
    if (error) { setDeleteErr(error.message); return; }
    setDeleteTarget(null);
    setDeleteCount(null);
    onChanged?.();
    load();
  }

  const subFormVisible = subEditing !== null || subParent !== '';
  const catFormVisible = catEditing !== null || catName !== '';

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Tag className="w-5 h-5 text-teal-600" /> Manage Categories
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
            {err && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
              </div>
            )}

            {/* Add Category Form */}
            {catFormVisible ? (
              <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-3">
                <p className="text-sm font-bold text-slate-700">{catEditing ? 'Edit Category' : 'Add Category'}</p>
                <input className={inputCls} value={catName} onChange={e => setCatName(e.target.value)} placeholder="Category name *" />
                <textarea rows={2} className={inputCls} value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Description (optional)" />
                <div className="flex gap-2">
                  <button onClick={saveCategory} disabled={catSaving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
                    {catSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Save
                  </button>
                  <button onClick={() => { setCatEditing(null); setCatName(''); setCatDesc(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={startAddCategory} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors">
                <Plus className="w-4 h-4" /> Add Category
              </button>
            )}

            {/* Category List */}
            {loading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                <Tag className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No categories yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map(cat => {
                  const isOpen = expanded.has(cat.id);
                  const catSubs = subcategories.filter(s => s.category_id === cat.id);
                  return (
                    <div key={cat.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Category row */}
                      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50/50 transition-colors">
                        <button onClick={() => toggleExpanded(cat.id)} className="p-1 text-slate-400 hover:text-slate-600 flex-shrink-0">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{cat.name}</p>
                          {cat.description && <p className="text-xs text-slate-400 truncate">{cat.description}</p>}
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${cat.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <button onClick={() => startAddSubcategory(cat.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors flex-shrink-0" title="Add Subcategory">
                          <FolderPlus className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => startEditCategory(cat)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleCategoryActive(cat)} className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex-shrink-0">
                          {cat.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => { setDeleteTarget({ type: 'category', id: cat.id, name: cat.name }); setDeleteCount(null); setDeleteErr(''); checkDelete({ type: 'category', id: cat.id, name: cat.name }); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Subcategories */}
                      {isOpen && (
                        <div className="border-t border-slate-100 bg-slate-50/30">
                          {subFormVisible && subParent === cat.id ? (
                            <div className="p-3 mx-3 mb-2 mt-2 bg-white border border-teal-200 rounded-xl space-y-2">
                              <p className="text-sm font-bold text-slate-700">{subEditing ? 'Edit Subcategory' : `Add Subcategory to "${cat.name}"`}</p>
                              <input className={inputCls} value={subName} onChange={e => setSubName(e.target.value)} placeholder="Subcategory name *" />
                              <textarea rows={2} className={inputCls} value={subDesc} onChange={e => setSubDesc(e.target.value)} placeholder="Description (optional)" />
                              <div className="flex gap-2">
                                <button onClick={saveSubcategory} disabled={subSaving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
                                  {subSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Save
                                </button>
                                <button onClick={() => { setSubEditing(null); setSubParent(''); setSubName(''); setSubDesc(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                              </div>
                            </div>
                          ) : null}
                          {catSubs.length === 0 ? (
                            <p className="px-6 py-3 text-xs text-slate-400">No subcategories. Click <FolderPlus className="w-3 h-3 inline" /> to add one.</p>
                          ) : (
                            <div className="py-1">
                              {catSubs.map(sub => (
                                <div key={sub.id} className="flex items-center gap-2 px-6 py-2 hover:bg-white transition-colors">
                                  <span className="text-slate-300">—</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-700 truncate">{sub.name}</p>
                                    {sub.description && <p className="text-xs text-slate-400 truncate">{sub.description}</p>}
                                  </div>
                                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${sub.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {sub.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                  <button onClick={() => startEditSubcategory(sub)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => toggleSubcategoryActive(sub)} className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex-shrink-0">
                                    {sub.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button onClick={() => { setDeleteTarget({ type: 'subcategory', id: sub.id, name: sub.name }); setDeleteCount(null); setDeleteErr(''); checkDelete({ type: 'subcategory', id: sub.id, name: sub.name }); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="Delete">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
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
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-white flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Done</button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">Delete {deleteTarget.type === 'category' ? 'Category' : 'Subcategory'}?</h4>
                <p className="text-sm text-slate-500">"{deleteTarget.name}"</p>
              </div>
            </div>
            {deleteChecking ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Checking product references...</div>
            ) : deleteErr ? (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {deleteErr}</div>
            ) : deleteCount !== null ? (
              deleteCount > 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Cannot delete — <strong>{deleteCount}</strong> product{deleteCount === 1 ? '' : 's'} use{deleteCount === 1 ? 's' : ''} this {deleteTarget.type === 'category' ? 'category' : 'subcategory'}. Reassign or deactivate those products first, or deactivate this {deleteTarget.type === 'category' ? 'category' : 'subcategory'} instead.</span>
                </div>
              ) : (
                <p className="text-sm text-slate-600">No products reference this {deleteTarget.type === 'category' ? 'category' : 'subcategory'}. It can be safely deleted.</p>
              )
            ) : null}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteCount(null); setDeleteErr(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteChecking || deleteCount === null || deleteCount > 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {deleteChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
