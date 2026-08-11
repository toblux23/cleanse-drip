import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Loader2, AlertCircle, Search, Users, ChevronDown,
  ArrowLeft, Mail, Phone, Calendar, MessageSquare, FileCheck,
  FileText, Clock, User, Filter, ShieldCheck, CheckCircle, X,
  Download, Eye, PenLine, Stethoscope, Award,
} from 'lucide-react';
import { supabase, type Client, type ClientProfile } from '../lib/supabase';
import SignatureImage from './SignatureImage';
import { loadUnifiedClientProfile, type UnifiedClientProfile } from '../lib/clientProfile';
import { ClientProfileInformationSection } from './ClientProfileSections';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FullClient extends Client {
  client_profiles: ClientProfile | null;
}

interface BookingSummary {
  id: string;
  preferred_date: string;
  preferred_time: string;
  services_requested: string[];
  status: string;
  intake_form_status: string;
  consent_given: boolean | null;
  created_at: string;
  branch_id: string | null;
}

interface AppointmentSummary {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  service: string | null;
  status: string;
  payment_status: string;
  completed_at: string | null;
  nurse_name: string | null;
  branches: { name: string } | null;
}

interface FeedbackSummary {
  id: string;
  name: string;
  service_availed: string;
  overall_satisfaction: number;
  staff_professionalism: number;
  procedure_explained: string;
  avail_again: string;
  recommend: string;
  liked_most: string;
  comments_suggestions: string;
  created_at: string;
  appointment_id: string | null;
}

interface ConsentRecord {
  id: string;
  service: string | null;
  form_type: string;
  status: string;
  signatory_name: string | null;
  signature_data: string | null;
  signed_at: string | null;
  created_at: string;
  appointment_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: string | null): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

const BOOKING_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  NEW:      { label: 'New',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const APPT_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  scheduled:  { label: 'Scheduled',  cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  dispatched: { label: 'Dispatched',  cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  arrived:    { label: 'Arrived',    cls: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  'in-treatment': { label: 'In Treatment', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed:  { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-red-50 text-red-700 border-red-200' },
};

const PAY_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  paid:     { label: 'Paid',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial:  { label: 'Partial',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending:  { label: 'Unpaid',   cls: 'bg-red-50 text-red-700 border-red-200' },
  waived:   { label: 'Waived',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  refunded: { label: 'Refunded', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const CONSENT_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  signed:    { label: 'Signed',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:   { label: 'Pending',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  declined:  { label: 'Declined',  cls: 'bg-red-50 text-red-700 border-red-200' },
  expired:   { label: 'Expired',   cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function badge(cfg: Record<string, { label: string; cls: string }>, status: string) {
  const c = cfg[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${c.cls}`}>
      {c.label}
    </span>
  );
}

function downloadConsentForm(
  c: ConsentRecord,
  nurseName: string | null,
  apptDate: string | null,
) {
  const signed = c.signed_at ? fmtDateTime(c.signed_at) : 'Date not recorded';
  const sigImg = c.signature_data
    ? `<img src="${c.signature_data}" style="max-height:120px;max-width:400px;" />`
    : '<p style="color:#94a3b8;font-style:italic;">No signature image stored</p>';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Consent Record - ${c.service ?? 'General'}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 24px; color: #1e293b; }
      .header { background: linear-gradient(135deg, #f0fdfa, #ecfeff); border: 1px solid #ccfbf1; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
      .header .brand { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #0d9488; text-transform: uppercase; margin-bottom: 4px; }
      .header h1 { font-size: 22px; font-weight: 700; margin: 0 0 4px; text-transform: capitalize; }
      .header .service { font-size: 14px; color: #64748b; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
      .field label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; display: block; margin-bottom: 4px; }
      .field p { font-size: 14px; font-weight: 500; margin: 0; }
      .consent-text { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 24px; }
      .consent-text p { font-size: 12px; line-height: 1.6; margin: 0; }
      .sig-box { border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 8px; }
      .sig-name { font-size: 12px; color: #64748b; text-align: center; font-weight: 500; margin-top: 8px; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
    </style></head><body>
    <div class="header">
      <div class="brand">Cleanse &amp; Drip</div>
      <h1>${c.form_type} Form</h1>
      <div class="service">${c.service ?? 'Service not specified'}</div>
    </div>
    <div class="grid">
      <div class="field"><label>Signatory</label><p>${c.signatory_name ?? 'Not recorded'}</p></div>
      <div class="field"><label>Signed At</label><p>${signed}</p></div>
      <div class="field"><label>Registered Nurse</label><p>${nurseName ?? 'Not assigned'}</p></div>
      <div class="field"><label>License No.</label><p>N/A</p></div>
      ${apptDate ? `<div class="field"><label>Appointment Date</label><p>${apptDate}</p></div>` : ''}
      <div class="field"><label>Status</label><p style="text-transform:capitalize;">${c.status}</p></div>
    </div>
    <div class="consent-text">
      <p>I, the undersigned, consent to the ${c.form_type === 'waiver' ? 'waiver and release of liability for' : 'performance of'} the treatment/procedure described above. I have been informed of the nature, risks, benefits, and alternatives, and I have had the opportunity to ask questions. I confirm that the information I have provided is accurate and I have disclosed any changes since my previous visit.</p>
    </div>
    <div class="sig-box">${sigImg}</div>
    <p class="sig-name">${c.signatory_name ?? ''}</p>
    <div class="footer">Generated from Cleanse &amp; Drip Client Management System &middot; ${new Date().toLocaleString()}</div>
    </body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `consent-${(c.service ?? 'general').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${(c.signed_at ?? c.created_at).slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function ClientDetail({ client, onClose }: { client: FullClient; onClose: () => void }) {
  const [unified, setUnified] = useState<UnifiedClientProfile | null>(null);
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackSummary[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [viewConsent, setViewConsent] = useState<ConsentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [unifiedRes, bookingsRes, apptsRes, consentsRes] = await Promise.all([
          loadUnifiedClientProfile(client.id),
          supabase
            .from('client_bookings')
            .select('id, preferred_date, preferred_time, services_requested, status, intake_form_status, consent_given, created_at, branch_id, client_id, email, cellphone, full_name')
            .or(`client_id.eq.${client.id}`)
            .order('created_at', { ascending: false }),
          supabase
            .from('appointments')
            .select('id, scheduled_date, scheduled_time, service, status, payment_status, completed_at, nurse_name, branches(name)')
            .eq('client_id', client.id)
            .order('scheduled_date', { ascending: false }),
          supabase
            .from('client_consent_records')
            .select('id, service, form_type, status, signatory_name, signature_data, signed_at, created_at, appointment_id')
            .eq('client_id', client.id)
            .order('signed_at', { ascending: false }),
        ]);

        if (cancelled) return;

        setUnified(unifiedRes);
        setBookings((bookingsRes.data ?? []) as unknown as BookingSummary[]);
        setAppointments((apptsRes.data ?? []) as unknown as AppointmentSummary[]);
        setConsents((consentsRes.data ?? []) as unknown as ConsentRecord[]);

        // Feedback: linked by appointment_id, or by name (legacy)
        const apptIds = (apptsRes.data ?? []).map((a: { id: string }) => a.id);
        let allFeedback: FeedbackSummary[] = [];

        if (apptIds.length > 0) {
          const { data: apptFb } = await supabase
            .from('client_feedback')
            .select('id, name, service_availed, overall_satisfaction, staff_professionalism, procedure_explained, avail_again, recommend, liked_most, comments_suggestions, created_at, appointment_id')
            .in('appointment_id', apptIds)
            .order('created_at', { ascending: false });
          allFeedback = (apptFb ?? []) as unknown as FeedbackSummary[];
        }

        // Legacy name-based feedback (deduplicate)
        if (client.full_name) {
          const { data: nameFb } = await supabase
            .from('client_feedback')
            .select('id, name, service_availed, overall_satisfaction, staff_professionalism, procedure_explained, avail_again, recommend, liked_most, comments_suggestions, created_at, appointment_id')
            .ilike('name', client.full_name)
            .order('created_at', { ascending: false });
          const nameFeedbacks = (nameFb ?? []) as unknown as FeedbackSummary[];
          const seen = new Set(allFeedback.map(f => f.id));
          for (const f of nameFeedbacks) {
            if (!seen.has(f.id)) { allFeedback.push(f); seen.add(f.id); }
          }
        }

        if (!cancelled) setFeedbacks(allFeedback);
      } catch {
        if (!cancelled) setError('Failed to load client details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [client.id, client.full_name]);

  if (loading) {
    return (
      <div className="bg-slate-50 rounded-2xl border border-slate-100 p-8">
        <div className="flex items-center gap-2 text-slate-400 mb-6">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading client profile\u2026</span>
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-slate-100 rounded-xl" />
            <div className="h-20 bg-slate-100 rounded-xl" />
            <div className="h-20 bg-slate-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const servicesAvailed = new Set<string>();
  appointments.forEach(a => { if (a.service) servicesAvailed.add(a.service); });
  bookings.forEach(b => b.services_requested.forEach(s => servicesAvailed.add(s)));

  return (
    <div className="space-y-5">
      {/* Back button */}
      <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="w-4 h-4" /> All Clients
      </button>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Profile header */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-lg font-bold">{initials(client.full_name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 truncate">{client.full_name}</h2>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${client.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {client.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              {client.email && <span className="flex items-center gap-1 text-xs text-slate-400"><Mail className="w-3 h-3" /> {client.email}</span>}
              {client.phone && <span className="flex items-center gap-1 text-xs text-slate-400"><Phone className="w-3 h-3" /> {client.phone}</span>}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Bookings', value: bookings.length, Icon: FileText, color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'Appointments', value: appointments.length, Icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Feedback', value: feedbacks.length, Icon: MessageSquare, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Signed Consents', value: consents.filter(c => c.status === 'signed').length, Icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          ].map(s => {
            const Icon = s.Icon;
            return (
              <div key={s.label} className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-7 h-7 ${s.bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-3.5 h-3.5 ${s.color}`} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{s.label}</span>
                </div>
                <p className="text-lg font-bold text-slate-800">{s.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Services availed */}
      {servicesAvailed.size > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FileCheck className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-slate-700">Services Availed</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(servicesAvailed).map(s => (
              <span key={s} className="inline-flex items-center px-3 py-1.5 bg-teal-50 border border-teal-100 rounded-lg text-xs font-semibold text-teal-700">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Client profile information (reuses existing component) */}
      {unified && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <ClientProfileInformationSection profile={unified} showSensitive={true} variant="full" />
        </div>
      )}

      {/* Booking history */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <FileText className="w-4 h-4 text-teal-600" />
          <h3 className="text-sm font-bold text-slate-700">Booking History</h3>
          <span className="text-xs text-slate-400">({bookings.length})</span>
        </div>
        {bookings.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No bookings linked to this client.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {bookings.map(b => (
              <div key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{fmtDate(b.preferred_date)} at {b.preferred_time.slice(0, 5)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {b.services_requested.join(', ') || 'No services specified'}
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">Submitted {fmtDate(b.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {badge(BOOKING_STATUS_CFG, b.status)}
                  {b.consent_given && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
                      <CheckCircle className="w-3 h-3" /> Consent
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointment history */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-700">Appointment History</h3>
          <span className="text-xs text-slate-400">({appointments.length})</span>
        </div>
        {appointments.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No appointments linked to this client.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {appointments.map(a => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{a.service ?? 'Service not specified'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(a.scheduled_date)} at {a.scheduled_time.slice(0, 5)}
                    {a.branches?.name && ` \u00b7 ${a.branches.name}`}
                  </p>
                  {a.completed_at && (
                    <p className="text-[11px] text-emerald-500 mt-0.5">Completed {fmtDateTime(a.completed_at)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {badge(APPT_STATUS_CFG, a.status)}
                  {badge(PAY_STATUS_CFG, a.payment_status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Feedback history */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <MessageSquare className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-slate-700">Feedback History</h3>
          <span className="text-xs text-slate-400">({feedbacks.length})</span>
        </div>
        {feedbacks.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No feedback submitted yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {feedbacks.map(f => (
              <div key={f.id} className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold text-slate-800">{f.service_availed}</p>
                  <span className="text-xs text-slate-400">{fmtDate(f.created_at)}</span>
                </div>
                <div className="flex items-center gap-4 mb-2 flex-wrap">
                  <span className="text-xs text-slate-500">
                    Satisfaction: <span className="font-bold text-amber-600">{f.overall_satisfaction}/5</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    Professionalism: <span className="font-bold text-slate-700">{f.staff_professionalism}/5</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    Would avail again: <span className="font-bold text-slate-700">{f.avail_again}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    Would recommend: <span className="font-bold text-slate-700">{f.recommend}</span>
                  </span>
                </div>
                {f.liked_most && (
                  <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Liked most:</span> {f.liked_most}</p>
                )}
                {f.comments_suggestions && (
                  <p className="text-xs text-slate-500 mt-1"><span className="font-semibold">Comments:</span> {f.comments_suggestions}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signed Consent History */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
          <PenLine className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-700">Signed Consent History</h3>
          <span className="text-xs text-slate-400">({consents.filter(c => c.status === 'signed').length})</span>
        </div>
        {consents.filter(c => c.status === 'signed').length === 0 ? (
          <div className="px-5 py-10 text-center">
            <PenLine className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No signed consent history available.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {consents.filter(c => c.status === 'signed').map(c => {
              const appt = appointments.find(a => a.id === c.appointment_id);
              const nurseName = appt?.nurse_name ?? null;
              const apptDate = appt ? fmtDate(appt.scheduled_date) : null;
              const signedDate = c.signed_at ? fmtDateTime(c.signed_at) : null;
              const showApptDate = apptDate && signedDate && !signedDate.startsWith(apptDate.split(',')[0]);
              return (
                <div key={c.id} className="px-5 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.service ?? 'General consent'}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {signedDate ?? 'Date not recorded'}
                      </p>
                    </div>
                    {badge(CONSENT_STATUS_CFG, c.status)}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Client Signature</p>
                      {c.signature_data ? (
                        <SignatureImage signatureData={c.signature_data} className="max-h-16 w-auto object-contain" />
                      ) : (
                        <p className="text-xs text-slate-300 italic">No signature image</p>
                      )}
                      {c.signatory_name && (
                        <p className="text-[11px] text-slate-500 mt-1.5">{c.signatory_name}</p>
                      )}
                    </div>

                    <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 space-y-1.5">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Registered Nurse</p>
                        <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                          <Stethoscope className="w-3 h-3 text-teal-600" />
                          {nurseName ?? 'Not assigned'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">License No.</p>
                        <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                          <Award className="w-3 h-3 text-slate-400" />
                          N/A
                        </p>
                      </div>
                    </div>
                  </div>

                  {showApptDate && (
                    <p className="text-[11px] text-slate-400 mb-3 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Appointment Date: {apptDate}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewConsent(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-lg hover:bg-teal-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Full Consent
                    </button>
                    <button
                      onClick={() => downloadConsentForm(c, appt?.nurse_name ?? null, appt ? fmtDate(appt.scheduled_date) : null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View Consent Modal */}
      {viewConsent && (() => {
        const appt = appointments.find(a => a.id === viewConsent.appointment_id);
        const nurseName = appt?.nurse_name ?? null;
        const apptDate = appt ? fmtDate(appt.scheduled_date) : null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setViewConsent(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-teal-600" />
                  <h3 className="text-base font-bold text-slate-800">Consent Record</h3>
                </div>
                <button onClick={() => setViewConsent(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-5">
                <div className="bg-gradient-to-br from-teal-50 to-cyan-50/30 rounded-xl p-4 border border-teal-100">
                  <p className="text-xs font-bold tracking-widest text-teal-600 uppercase mb-1">Cleanse & Drip</p>
                  <h2 className="text-lg font-bold text-slate-900 capitalize">{viewConsent.form_type} Form</h2>
                  <p className="text-sm text-slate-500 mt-1">{viewConsent.service ?? 'Service not specified'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Signatory</p>
                    <p className="text-sm text-slate-700 font-medium">{viewConsent.signatory_name ?? 'Not recorded'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Signed At</p>
                    <p className="text-sm text-slate-700 font-medium">{viewConsent.signed_at ? fmtDateTime(viewConsent.signed_at) : 'Not recorded'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Registered Nurse</p>
                    <p className="text-sm text-slate-700 font-medium">{nurseName ?? 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">License No.</p>
                    <p className="text-sm text-slate-700 font-medium">N/A</p>
                  </div>
                  {apptDate && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Appointment Date</p>
                      <p className="text-sm text-slate-700 font-medium">{apptDate}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Status</p>
                    <p className="text-sm text-slate-700 font-medium capitalize">{viewConsent.status}</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    I, the undersigned, consent to the {viewConsent.form_type === 'waiver' ? 'waiver and release of liability for' : 'performance of'} the treatment/procedure described above.
                    I have been informed of the nature, risks, benefits, and alternatives, and I have had the opportunity to ask questions.
                    I confirm that the information I have provided is accurate and I have disclosed any changes since my previous visit.
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Client Signature</p>
                  {viewConsent.signature_data ? (
                    <div className="bg-white border-2 border-slate-200 rounded-xl p-4">
                      <SignatureImage signatureData={viewConsent.signature_data} className="max-h-32 w-auto mx-auto" />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 italic">No signature image stored</p>
                  )}
                  {viewConsent.signatory_name && (
                    <p className="text-xs text-slate-500 mt-2 text-center font-medium">{viewConsent.signatory_name}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => downloadConsentForm(viewConsent, nurseName, apptDate)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientProfiles() {
  const [clients, setClients] = useState<FullClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selected, setSelected] = useState<FullClient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabase
      .from('clients')
      .select('*, client_profiles(*)')
      .order('created_at', { ascending: false });
    if (dbErr) { setError('Failed to load clients.'); setLoading(false); return; }
    setClients((data ?? []) as unknown as FullClient[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      c.full_name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (selected) {
    return <ClientDetail client={selected} onClose={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Clients</p>
            <p className="text-2xl font-bold text-slate-800">{clients.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active</p>
            <p className="text-2xl font-bold text-slate-800">{clients.filter(c => c.status === 'active').length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-slate-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Inactive</p>
            <p className="text-2xl font-bold text-slate-800">{clients.filter(c => c.status === 'inactive').length}</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
            className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none text-slate-700 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
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
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-slate-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-40 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-24" />
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
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search || statusFilter !== 'all' ? 'No clients match your filters.' : 'No clients yet.'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Client records will appear here once they are created.'}
          </p>
        </div>
      )}

      {/* Client list */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1.5fr_1.5fr_1.2fr_0.8fr_1fr_auto] text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span>Client Name</span>
            <span>Email</span>
            <span>Phone</span>
            <span>Status</span>
            <span>Date Added</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-50">
            {filtered.map(c => (
              <div
                key={c.id}
                className="flex flex-col lg:grid lg:grid-cols-[1.5fr_1.5fr_1.2fr_0.8fr_1fr_auto] lg:items-center gap-2 lg:gap-3 px-6 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer"
                onClick={() => setSelected(c)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-teal-600" />
                  </div>
                  <p className="text-sm font-bold text-slate-800 truncate">{c.full_name}</p>
                </div>
                <p className="text-sm text-slate-500 truncate">{c.email ?? '\u2014'}</p>
                <p className="text-sm text-slate-500 truncate">{c.phone ?? '\u2014'}</p>
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-full border ${c.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    {c.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate-400">{fmtDate(c.created_at)}</p>
                <div className="flex justify-end">
                  <button className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors">
                    View Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
