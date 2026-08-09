import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText, Upload, Search, RefreshCw, Loader2, AlertCircle, X,
  Download, Eye, Calendar, User, Stethoscope, Filter,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientOption {
  id: string;
  full_name: string;
}

interface AppointmentOption {
  id: string;
  client_id: string | null;
  scheduled_date: string;
  service: string | null;
  status: string | null;
}

interface TeamMemberLookup {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface DocumentRecord {
  id: string;
  client_id: string | null;
  appointment_id: string | null;
  doc_type: string | null;
  title: string | null;
  content: string | null;
  status: string | null;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  created_by: string | null;
  client: { full_name: string } | null;
  appointment: { scheduled_date: string; service: string | null } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  prescription: 'Prescription',
  recommendation: 'Doctor Recommendation',
  waiver: 'Waiver',
  consent: 'Consent Form',
  profile: 'Profile Document',
  other: 'Other',
};

function docTypeLabel(t: string | null): string {
  if (!t) return 'Other';
  return DOC_TYPE_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

const DOC_TYPE_COLORS: Record<string, string> = {
  prescription: 'bg-blue-50 text-blue-700 border-blue-200',
  recommendation: 'bg-teal-50 text-teal-700 border-teal-200',
  waiver: 'bg-amber-50 text-amber-700 border-amber-200',
  consent: 'bg-purple-50 text-purple-700 border-purple-200',
  profile: 'bg-slate-50 text-slate-700 border-slate-200',
  other: 'bg-slate-50 text-slate-600 border-slate-200',
};

function docTypeCls(t: string | null): string {
  return DOC_TYPE_COLORS[t ?? 'other'] ?? DOC_TYPE_COLORS.other;
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadPrescriptionModal({
  clients,
  appointments,
  userEmail,
  userId,
  onClose,
  onSaved,
}: {
  clients: ClientOption[];
  appointments: AppointmentOption[];
  userEmail: string;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [docType, setDocType] = useState('prescription');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredAppointments = clientId
    ? appointments.filter(a => a.client_id === clientId)
    : appointments;

  async function handleSave() {
    if (!clientId) { setErr('Please select a client.'); return; }
    if (!title.trim()) { setErr('Document title is required.'); return; }
    if (!file) { setErr('Please select a file to upload.'); return; }
    setSaving(true);
    setErr(null);

    const ext = file.name.split('.').pop() ?? 'bin';
    const safeName = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('client-documents').upload(safeName, file);
    if (uploadErr) { setErr(uploadErr.message); setSaving(false); return; }

    const payload: Record<string, unknown> = {
      client_id: clientId,
      doc_type: docType,
      title: title.trim(),
      file_path: safeName,
      file_name: file.name,
      status: 'signed',
    };
    if (appointmentId) payload.appointment_id = appointmentId;
    if (userId) payload.created_by = userId;

    const { error: dbErr } = await supabase.from('documents').insert(payload);
    if (dbErr) { setErr(dbErr.message); setSaving(false); return; }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-base font-bold text-slate-800">Upload Prescription / Recommendation</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}

          {/* Client selection */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Client *</label>
            <select
              value={clientId}
              onChange={e => { setClientId(e.target.value); setAppointmentId(''); }}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
            >
              <option value="">Select a client\u2026</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>

          {/* Optional appointment link */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Related Appointment (optional)</label>
            <select
              value={appointmentId}
              onChange={e => setAppointmentId(e.target.value)}
              disabled={!clientId}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">{clientId ? 'None' : 'Select a client first'}</option>
              {filteredAppointments.map(a => (
                <option key={a.id} value={a.id}>
                  {fmtDate(a.scheduled_date)}{a.service ? ` \u2014 ${a.service}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Doc type + title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Document Type</label>
              <select
                value={docType}
                onChange={e => setDocType(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
              >
                <option value="prescription">Prescription</option>
                <option value="recommendation">Doctor Recommendation</option>
                <option value="waiver">Waiver</option>
                <option value="consent">Consent Form</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Dr. Smith IV Therapy Rx"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
              />
            </div>
          </div>

          {/* Upload date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Upload Date</label>
            <input
              type="date"
              value={uploadDate}
              onChange={e => setUploadDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Upload File *</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors"
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  <span className="text-sm font-medium text-slate-700">{file.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="ml-2 p-1 rounded hover:bg-slate-100">
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Click to upload a file</p>
                  <p className="text-xs text-slate-400 mt-0.5">PDF, JPG, PNG up to 10MB</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Uploaded by info */}
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-xl px-4 py-2.5">
            <User className="w-3.5 h-3.5" />
            <span>Uploaded by: <span className="font-semibold text-slate-600">{userEmail}</span></span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !clientId || !title.trim() || !file}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {saving ? 'Uploading\u2026' : 'Upload Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────

function DocViewerModal({ doc, onClose }: { doc: DocumentRecord; onClose: () => void }) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (doc.file_path) {
      setLoading(true);
      supabase.storage.from('client-documents').createSignedUrl(doc.file_path, 3600).then(({ data }) => {
        setFileUrl(data?.signedUrl ?? null);
        setLoading(false);
      });
    }
  }, [doc.file_path]);

  async function handleDownload() {
    if (!doc.file_path) return;
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(doc.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <FileText className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">{doc.title ?? 'Untitled Document'}</h2>
              <p className="text-xs text-slate-400">{doc.client?.full_name ?? 'No client'} {'\u00b7'} {docTypeLabel(doc.doc_type)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {doc.file_path ? (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                </div>
              ) : fileUrl ? (
                <div>
                  {fileUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img src={fileUrl} alt={doc.title ?? 'Document'} className="w-full rounded-xl border border-slate-100" />
                  ) : fileUrl.match(/\.(pdf)$/i) ? (
                    <iframe src={fileUrl} className="w-full h-[60vh] rounded-xl border border-slate-100" title={doc.title ?? 'Document'} />
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">Preview not available for this file type.</p>
                    </div>
                  )}
                  <button onClick={handleDownload} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              ) : (
                <p className="text-sm text-red-500 text-center py-8">Failed to load file.</p>
              )}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
              {doc.content ?? '(No content)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PrescriptionUploads({ userEmail }: { userEmail: string }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [memberLookup, setMemberLookup] = useState<Map<string, TeamMemberLookup>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocumentRecord | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Get current user ID for created_by field
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [docsRes, clientsRes, apptsRes, membersRes] = await Promise.all([
      supabase
        .from('documents')
        .select(`
          id, client_id, appointment_id, doc_type, title, content, status,
          file_path, file_name, created_at, created_by,
          client:clients!client_id(full_name),
          appointment:appointments!appointment_id(scheduled_date, service)
        `)
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, full_name').order('full_name'),
      supabase.from('appointments').select('id, client_id, scheduled_date, service, status').order('scheduled_date', { ascending: false }),
      supabase.from('team_members').select('user_id, full_name, email').eq('status', 'approved'),
    ]);

    if (docsRes.error) { setError('Failed to load documents.'); setLoading(false); return; }
    if (clientsRes.error) { setError('Failed to load clients.'); setLoading(false); return; }

    const lookup = new Map<string, TeamMemberLookup>();
    for (const m of (membersRes.data ?? []) as unknown as TeamMemberLookup[]) {
      if (m.user_id) lookup.set(m.user_id, m);
    }
    setMemberLookup(lookup);
    setDocuments((docsRes.data ?? []) as unknown as DocumentRecord[]);
    setClients((clientsRes.data ?? []) as unknown as ClientOption[]);
    setAppointments((apptsRes.data ?? []) as unknown as AppointmentOption[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const docTypes = Array.from(new Set(documents.map(d => d.doc_type).filter(Boolean) as string[]));

  const filtered = documents.filter(d => {
    if (typeFilter !== 'all' && d.doc_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (d.title ?? '').toLowerCase().includes(q) ||
      (d.file_name ?? '').toLowerCase().includes(q) ||
      (d.client?.full_name ?? '').toLowerCase().includes(q) ||
      (memberLookup.get(d.created_by ?? '')?.full_name ?? memberLookup.get(d.created_by ?? '')?.email ?? '').toLowerCase().includes(q)
    );
  });

  async function handleDownload(doc: DocumentRecord) {
    if (!doc.file_path) return;
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(doc.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Documents</p>
            <p className="text-2xl font-bold text-slate-800">{documents.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Stethoscope className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Prescriptions</p>
            <p className="text-2xl font-bold text-slate-800">{documents.filter(d => d.doc_type === 'prescription').length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Recommendations</p>
            <p className="text-2xl font-bold text-slate-800">{documents.filter(d => d.doc_type === 'recommendation').length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Other Docs</p>
            <p className="text-2xl font-bold text-slate-800">{documents.filter(d => !['prescription', 'recommendation'].includes(d.doc_type ?? '')).length}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, client, or uploader\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-700 cursor-pointer"
        >
          <option value="all">All Types</option>
          {docTypes.map(t => (
            <option key={t} value={t}>{docTypeLabel(t)}</option>
          ))}
        </select>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm"
        >
          <Upload className="w-4 h-4" /> Upload Document
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
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-200 rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-32" />
                </div>
                <div className="h-6 bg-slate-100 rounded-full w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search || typeFilter !== 'all' ? 'No matching documents' : 'No documents uploaded yet'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {search || typeFilter !== 'all' ? 'Try a different search or filter.' : 'Click "Upload Document" to upload a prescription or recommendation.'}
          </p>
        </div>
      )}

      {/* Document list */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-5 py-3">Document</th>
                  <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Client</th>
                  <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Type</th>
                  <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Uploaded By</th>
                  <th className="text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Date</th>
                  <th className="text-right text-[11px] font-bold text-slate-400 uppercase tracking-wide px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-teal-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{doc.title ?? 'Untitled'}</p>
                          {doc.file_name && <p className="text-xs text-slate-400 truncate">{doc.file_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-slate-600">{doc.client?.full_name ?? '\u2014'}</span>
                      {doc.appointment && (
                        <span className="text-xs text-slate-400 block">{fmtDate(doc.appointment.scheduled_date)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${docTypeCls(doc.doc_type)}`}>
                        {docTypeLabel(doc.doc_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-slate-500">
                        {memberLookup.get(doc.created_by ?? '')?.full_name ?? memberLookup.get(doc.created_by ?? '')?.email ?? '\u2014'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-slate-400">{fmtDate(doc.created_at)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewDoc(doc)}
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="View document"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {doc.file_path && (
                          <button
                            onClick={() => handleDownload(doc)}
                            className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadPrescriptionModal
          clients={clients}
          appointments={appointments}
          userEmail={userEmail}
          userId={userId}
          onClose={() => setShowUpload(false)}
          onSaved={load}
        />
      )}

      {/* Viewer modal */}
      {viewDoc && <DocViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />}
    </div>
  );
}
