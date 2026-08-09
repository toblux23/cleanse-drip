import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  Lock,
  FileText,
  FilePen,
  FileCheck,
  FileX,
  Search,
  CheckCircle,
  PenLine,
} from 'lucide-react';
import { supabase, type Client, type DocumentType, type DocumentStatus, type ClientDocument } from '../lib/supabase';

// ─── Extended types ───────────────────────────────────────────────────────────

interface DocumentRow extends ClientDocument {
  clients: { id: string; full_name: string } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DOC_TYPE_CONFIG: Record<DocumentType, { label: string; color: string; bg: string }> = {
  waiver:  { label: 'Waiver',  color: 'text-blue-700',   bg: 'bg-blue-100'   },
  consent: { label: 'Consent', color: 'text-violet-700', bg: 'bg-violet-100' },
  profile: { label: 'Profile', color: 'text-teal-700',   bg: 'bg-teal-100'   },
  other:   { label: 'Other',   color: 'text-slate-700',  bg: 'bg-slate-100'  },
};

const STATUS_CONFIG: Record<DocumentStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  draft:    { label: 'Draft',    color: 'text-slate-600',  bg: 'bg-slate-100',   icon: FilePen   },
  signed:   { label: 'Signed',   color: 'text-emerald-700', bg: 'bg-emerald-100', icon: FileCheck },
  archived: { label: 'Archived', color: 'text-rose-700',   bg: 'bg-rose-100',    icon: FileX     },
};

// ─── Add Document Modal ───────────────────────────────────────────────────────

function AddDocumentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('waiver');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.from('clients').select('id, full_name, email, phone, address, health_notes, status, created_at').order('full_name').then(({ data }) => {
      setClients(data ?? []);
    });
  }, []);

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  function selectClient(c: Client) {
    setClientId(c.id);
    setClientSearch(c.full_name);
    setShowDropdown(false);
  }

  const DOC_TYPE_TEMPLATES: Record<DocumentType, string> = {
    waiver: `MEDICAL WAIVER & INFORMED CONSENT

I, the undersigned, hereby consent to receive IV Drip Therapy and/or other wellness services offered by the clinic.

I understand that:
1. IV therapy involves the insertion of a needle into a vein for the purpose of delivering fluids, vitamins, and/or medications.
2. There are potential risks including but not limited to bruising, infection, phlebitis, and allergic reactions.
3. I have disclosed all relevant medical history, medications, and allergies to my care provider.

I voluntarily consent to the treatment and release the clinic from liability arising from known risks.

Signature: _______________________  Date: _______________`,
    consent: `TREATMENT CONSENT FORM

I hereby provide my informed consent for the treatment plan discussed with my care provider.

Treatment details and expectations have been explained to me in full. I understand the procedure, associated risks, and alternatives.

Signature: _______________________  Date: _______________`,
    profile: `CLIENT HEALTH PROFILE

This document contains the client's health history and baseline wellness profile for reference during treatments.`,
    other: '',
  };

  function handleDocTypeChange(t: DocumentType) {
    setDocType(t);
    if (!content || content === DOC_TYPE_TEMPLATES[docType]) {
      setContent(DOC_TYPE_TEMPLATES[t]);
    }
  }

  // Pre-fill on mount
  useEffect(() => {
    setContent(DOC_TYPE_TEMPLATES.waiver);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!title.trim()) { setErr('Title is required.'); return; }
    setSaving(true);
    setErr('');
    const { error } = await supabase.from('documents').insert({
      client_id: clientId || null,
      doc_type: docType,
      title: title.trim(),
      content: content.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800">Add Document</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {err && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}
          {/* Client search */}
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Client (optional)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Search client..."
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
            </div>
            {showDropdown && filteredClients.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {filteredClients.slice(0, 8).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 text-slate-700 flex items-center gap-2"
                    onMouseDown={() => selectClient(c)}
                  >
                    <span className="font-medium">{c.full_name}</span>
                    {c.email && <span className="text-xs text-slate-400">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Document Type</label>
              <select
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                value={docType}
                onChange={e => handleDocTypeChange(e.target.value as DocumentType)}
              >
                <option value="waiver">Waiver</option>
                <option value="consent">Consent</option>
                <option value="profile">Profile</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title *</label>
              <input
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g. IV Therapy Waiver"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Content</label>
            <textarea
              rows={10}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y font-mono text-xs leading-relaxed"
              placeholder="Document content / waiver body..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Save Document
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View / Sign Modal ────────────────────────────────────────────────────────

function ViewDocumentModal({
  doc,
  onClose,
  onSigned,
}: {
  doc: DocumentRow;
  onClose: () => void;
  onSigned: () => void;
}) {
  const [signing, setSigning] = useState(false);

  async function handleSign() {
    setSigning(true);
    await supabase.from('documents').update({ status: 'signed' }).eq('id', doc.id);
    setSigning(false);
    onSigned();
  }

  const typeCfg = DOC_TYPE_CONFIG[doc.doc_type];
  const statusCfg = STATUS_CONFIG[doc.status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <FileText className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">{doc.title ?? 'Untitled'}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${typeCfg.bg} ${typeCfg.color}`}>
                  {typeCfg.label}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusCfg.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {doc.clients && (
            <p className="text-xs font-semibold text-slate-400 mb-3">Client: <span className="text-slate-700">{doc.clients.full_name}</span></p>
          )}
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
            {doc.content ?? '(No content)'}
          </pre>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Close
          </button>
          {doc.status === 'draft' && (
            <button
              onClick={handleSign}
              disabled={signing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {signing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
              Mark as Signed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DocumentsTabProps {
  canManage: boolean;
}

export default function DocumentsTab({ canManage }: DocumentsTabProps) {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocumentRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase
      .from('documents')
      .select('*, clients(id, full_name)')
      .order('created_at', { ascending: false });
    if (error) { setErr(error.message); setLoading(false); return; }
    setDocs((data ?? []) as DocumentRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from('documents').delete().eq('id', deleteId);
    setDeleting(false);
    setDeleteId(null);
    load();
  }

  const filtered = docs.filter(d => {
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchSearch = !search || (d.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (d.clients?.full_name ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const draftCount  = docs.filter(d => d.status === 'draft').length;
  const signedCount = docs.filter(d => d.status === 'signed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Documents & Waivers</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage client waivers, consent forms, and profiles.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Document
          </button>
        </div>
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Lock className="w-4 h-4 flex-shrink-0" />
          Delete actions are restricted to superadmins.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Documents</p>
            <p className="text-2xl font-bold text-slate-800">{docs.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center">
            <FilePen className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Drafts</p>
            <p className="text-2xl font-bold text-slate-800">{draftCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Signed</p>
            <p className="text-2xl font-bold text-slate-800">{signedCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white w-56"
            placeholder="Search title or client..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
          {(['all', 'draft', 'signed', 'archived'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${statusFilter === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <FileText className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">No documents found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_110px_110px_90px_120px_48px] text-xs font-semibold text-slate-400 uppercase tracking-wide px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span>Document</span>
            <span>Type</span>
            <span>Client</span>
            <span>Status</span>
            <span>Created</span>
            <span />
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(doc => {
              const typeCfg = DOC_TYPE_CONFIG[doc.doc_type];
              const statusCfg = STATUS_CONFIG[doc.status];
              const StatusIcon = statusCfg.icon;
              return (
                <div key={doc.id} className="grid grid-cols-[1fr_110px_110px_90px_120px_48px] items-center px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                  <button
                    onClick={() => setViewDoc(doc)}
                    className="flex items-center gap-2.5 text-left group"
                  >
                    <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-teal-100 transition-colors">
                      <FileText className="w-4 h-4 text-teal-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-teal-700 transition-colors truncate">
                      {doc.title ?? 'Untitled'}
                    </span>
                  </button>
                  <span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${typeCfg.bg} ${typeCfg.color}`}>
                      {typeCfg.label}
                    </span>
                  </span>
                  <span className="text-sm text-slate-600 truncate">
                    {doc.clients?.full_name ?? <span className="text-slate-300">—</span>}
                  </span>
                  <span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusCfg.label}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400">{fmtDate(doc.created_at)}</span>
                  <div className="flex justify-end">
                    {canManage && (
                      <button
                        onClick={() => setDeleteId(doc.id)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <AddDocumentModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}
      {viewDoc && (
        <ViewDocumentModal
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onSigned={() => { setViewDoc(null); load(); }}
        />
      )}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Delete Document?</h3>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
