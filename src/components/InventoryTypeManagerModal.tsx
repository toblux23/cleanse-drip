import { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Pencil, Trash2, Loader2, AlertCircle, CheckCircle,
  AlertTriangle, Boxes,
} from 'lucide-react';
import { supabase, type InventoryTypeRecord } from '../lib/supabase';

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-400';

export default function InventoryTypeManagerModal({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [types, setTypes] = useState<InventoryTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [editing, setEditing] = useState<InventoryTypeRecord | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<InventoryTypeRecord | null>(null);
  const [deleteCount, setDeleteCount] = useState<number | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase.from('inventory_types').select('*').order('display_order').order('name');
    if (error) setErr(error.message);
    setTypes((data as InventoryTypeRecord[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startAdd() { setEditing(null); setName(''); setDesc(''); }
  function startEdit(t: InventoryTypeRecord) { setEditing(t); setName(t.name); setDesc(t.description ?? ''); }

  async function save() {
    if (!name.trim()) { setErr('Inventory type name is required.'); return; }
    setSaving(true);
    setErr('');
    const payload = { name: name.trim(), description: desc.trim() || null };
    let result;
    if (editing) {
      result = await supabase.from('inventory_types').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id);
    } else {
      const maxOrder = types.reduce((m, t) => Math.max(m, t.display_order), 0);
      result = await supabase.from('inventory_types').insert({ ...payload, display_order: maxOrder + 1 });
    }
    setSaving(false);
    if (result.error) {
      setErr(result.error.code === '23505' ? 'An inventory type with this name already exists.' : result.error.message);
      return;
    }
    setEditing(null); setName(''); setDesc('');
    onChanged?.();
    load();
  }

  async function toggleActive(t: InventoryTypeRecord) {
    setErr('');
    const { error } = await supabase.from('inventory_types').update({ is_active: !t.is_active, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) { setErr(error.message); return; }
    onChanged?.();
    load();
  }

  async function checkDelete(t: InventoryTypeRecord) {
    setDeleteChecking(true);
    setDeleteErr('');
    setDeleteCount(null);
    const { count, error } = await supabase
      .from('inventory_products')
      .select('id', { count: 'exact', head: true })
      .eq('inventory_type', t.name);
    setDeleteChecking(false);
    if (error) { setDeleteErr(error.message); return; }
    setDeleteCount(count ?? 0);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteCount === null || deleteCount > 0) return;
    setDeleteChecking(true);
    setDeleteErr('');
    const { error } = await supabase.from('inventory_types').delete().eq('id', deleteTarget.id);
    setDeleteChecking(false);
    if (error) { setDeleteErr(error.message); return; }
    setDeleteTarget(null); setDeleteCount(null);
    onChanged?.();
    load();
  }

  const formVisible = editing !== null || name !== '';

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Boxes className="w-5 h-5 text-teal-600" /> Manage Inventory Types
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
            {err && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
              </div>
            )}

            {formVisible ? (
              <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-3">
                <p className="text-sm font-bold text-slate-700">{editing ? 'Edit Inventory Type' : 'Add Inventory Type'}</p>
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Type name *" />
                <textarea rows={2} className={inputCls} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" />
                <div className="flex gap-2">
                  <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Save
                  </button>
                  <button onClick={() => { setEditing(null); setName(''); setDesc(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={startAdd} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors">
                <Plus className="w-4 h-4" /> Add Inventory Type
              </button>
            )}

            {loading ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div>
            ) : types.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                <Boxes className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No inventory types yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {types.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                      {t.description && <p className="text-xs text-slate-400 truncate">{t.description}</p>}
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0" title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleActive(t)} className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex-shrink-0">
                      {t.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => { setDeleteTarget(t); setDeleteCount(null); setDeleteErr(''); checkDelete(t); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-white flex-shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Done</button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-800">Delete Inventory Type?</h4>
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
                  <span>Cannot delete — <strong>{deleteCount}</strong> product{deleteCount === 1 ? '' : 's'} use{deleteCount === 1 ? 's' : ''} this inventory type. Reassign or deactivate those products first, or deactivate this type instead.</span>
                </div>
              ) : (
                <p className="text-sm text-slate-600">No products reference this inventory type. It can be safely deleted.</p>
              )
            ) : null}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteCount(null); setDeleteErr(''); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDelete} disabled={deleteChecking || deleteCount === null || deleteCount > 0} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50">
                {deleteChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
