import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Filter, RefreshCw, Plus, Pencil, Eye, X, Loader2, AlertCircle, MoreVertical,
  CheckCircle, Users, UserPlus, Mail, Phone, MapPin, HeartPulse, StickyNote,
  ShieldCheck, ChevronDown, Contact, Calendar, Cake, User, FileText,
  Upload, Download, Trash2, Cigarette, Wine, Dumbbell, Droplets, Activity,
  Stethoscope, AlertTriangle, Baby, ClipboardList, Bell, Lock, Star,
  MessageSquare, CreditCard, Clock, Tag, ArrowLeft, TrendingUp, Building2,
  Activity as ActivityIcon, Syringe, Heart, FlaskConical, BadgeCheck,
  ShieldAlert, DollarSign, CalendarClock, UserCircle, FileCheck,
  Video, ExternalLink, ClipboardCheck,
} from 'lucide-react';
import { supabase, type Client, type ClientProfile, type ClientDocument, type DocumentType } from '../lib/supabase';
import { resolveSignatureUrl } from '../lib/signatures';
import SignatureImage from './SignatureImage';
import { loadUnifiedClientProfile, type UnifiedClientProfile } from '../lib/clientProfile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// `client-documents` is a private bucket, so uploaded signatures need a signed
// URL rather than a public one. See src/lib/signatures.ts.
async function downloadConsent(record: ConsentRecord) {
  const url = await resolveSignatureUrl(record.signature_data);
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `consent-${record.appointment_id ?? record.id}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

type StatusFilter = 'all' | 'active' | 'inactive';

const YES_NO_NA = ['Yes', 'No', 'N/A', 'Prefer not to say'];

const RISK_VALUES = new Set(['yes', 'pregnant', 'breastfeeding', 'positive', 'confirmed', 'true']);
function isRiskValue(v?: string | null): boolean {
  if (!v) return false;
  return RISK_VALUES.has(v.toLowerCase().trim());
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch { id: string; name: string; }

interface FullClient extends Client {
  client_profiles?: ClientProfile | null;
}

interface DocRow extends ClientDocument {
  branches?: { name: string } | null;
}

interface AppointmentSummary {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  service: string | null;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  payment_method: string | null;
  completed_at: string | null;
  branches: { name: string } | null;
  meeting_platform: string | null;
  meeting_link: string | null;
  meeting_notes: string | null;
  nurse_name: string | null;
  feedback?: FeedbackSummary | null;
  recommendations?: { id: string; recommendation_text: string; recorded_by_email: string | null; recorded_at: string }[] | null;
  // Consent captured against this appointment, if any. Attached in openView so
  // the appointment history can show signed/missing without a second lookup.
  consent?: ConsentRecord | null;
}

// Workflow stages an appointment moves through, used for the progress indicator
// in the appointment history.
const APPT_PROGRESS_STAGES = ['scheduled', 'dispatched', 'arrived', 'in_treatment', 'completed'];

function apptProgress(status: string): { index: number; total: number; pct: number } {
  const total = APPT_PROGRESS_STAGES.length;
  const index = APPT_PROGRESS_STAGES.indexOf(status);
  if (index === -1) return { index: 0, total, pct: 0 };   // cancelled / unknown
  return { index: index + 1, total, pct: Math.round(((index + 1) / total) * 100) };
}

interface FeedbackSummary {
  id: string;
  overall_satisfaction: number;
  staff_professionalism: number;
  liked_most: string;
  comments_suggestions: string;
  avail_again: string;
  recommend: string;
  created_at: string;
}

interface ConsentRecord {
  id: string;
  appointment_id: string | null;
  service: string | null;
  form_type: string;
  form_version: string;
  status: string;
  signatory_name: string | null;
  signature_data: string | null;
  signed_at: string | null;
  submission_method: string | null;
  appointment?: {
    scheduled_date: string;
    scheduled_time: string;
    service: string | null;
    nurse_name: string | null;
  } | null;
}

// ─── Form Data ─────────────────────────────────────────────────────────────────

interface FormData {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  health_notes: string;
  status: string;
  date_of_birth: string;
  age: string;
  gender: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_number: string;
  allergies: string;
  current_medications: string;
  pregnancy_breastfeeding: string;
  pre_existing_conditions: string;
  bleeding_disorders: string;
  family_history: string;
  weight: string;
  smoking_vaping: string;
  alcohol_consumption: string;
  exercise_frequency: string;
  water_intake: string;
  preferred_services: string;
  preferred_location: string;
  preferred_branch_id: string;
  consent_given: boolean;
  consent_date: string;
  general_notes: string;
  operational_notes: string;
}

const EMPTY_FORM: FormData = {
  full_name: '', email: '', phone: '', address: '', health_notes: '', status: 'active',
  date_of_birth: '', age: '', gender: '', emergency_contact_name: '', emergency_contact_relationship: '',
  emergency_contact_number: '', allergies: '', current_medications: '', pregnancy_breastfeeding: '',
  pre_existing_conditions: '', bleeding_disorders: '', family_history: '', weight: '',
  smoking_vaping: '', alcohol_consumption: '', exercise_frequency: '', water_intake: '',
  preferred_services: '', preferred_location: '', preferred_branch_id: '', consent_given: false,
  consent_date: '', general_notes: '', operational_notes: '',
};

function clientToForm(c: Client, p: ClientProfile | null): FormData {
  return {
    full_name: c.full_name, email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '',
    health_notes: c.health_notes ?? '', status: c.status,
    date_of_birth: p?.date_of_birth ?? '', age: p?.age?.toString() ?? '', gender: p?.gender ?? '',
    emergency_contact_name: p?.emergency_contact_name ?? '', emergency_contact_relationship: p?.emergency_contact_relationship ?? '',
    emergency_contact_number: p?.emergency_contact_number ?? '', allergies: p?.allergies ?? '',
    current_medications: p?.current_medications ?? '', pregnancy_breastfeeding: p?.pregnancy_breastfeeding ?? '',
    pre_existing_conditions: p?.pre_existing_conditions ?? '', bleeding_disorders: p?.bleeding_disorders ?? '',
    family_history: (p?.family_history ?? []).join(', '), weight: p?.weight ?? '',
    smoking_vaping: p?.smoking_vaping ?? '', alcohol_consumption: p?.alcohol_consumption ?? '',
    exercise_frequency: p?.exercise_frequency ?? '', water_intake: p?.water_intake ?? '',
    preferred_services: (p?.preferred_services ?? []).join(', '), preferred_location: p?.preferred_location ?? '',
    preferred_branch_id: p?.preferred_branch_id ?? '', consent_given: p?.consent_given ?? false,
    consent_date: p?.consent_date ? p.consent_date.split('T')[0] : '', general_notes: p?.general_notes ?? '',
    operational_notes: p?.operational_notes ?? '',
  };
}

function formToClientPayload(f: FormData) {
  return {
    full_name: f.full_name.trim(),
    email: f.email.trim() || null,
    phone: f.phone.trim() || null,
    address: f.address.trim() || null,
    health_notes: f.health_notes.trim() || null,
    status: f.status,
    updated_at: new Date().toISOString(),
  };
}

function formToProfilePayload(f: FormData, clientId: string) {
  return {
    client_id: clientId,
    date_of_birth: f.date_of_birth || null,
    age: f.age ? parseInt(f.age, 10) : null,
    gender: f.gender || null,
    emergency_contact_name: f.emergency_contact_name.trim() || null,
    emergency_contact_relationship: f.emergency_contact_relationship.trim() || null,
    emergency_contact_number: f.emergency_contact_number.trim() || null,
    allergies: f.allergies.trim() || null,
    current_medications: f.current_medications.trim() || null,
    pregnancy_breastfeeding: f.pregnancy_breastfeeding || null,
    pre_existing_conditions: f.pre_existing_conditions.trim() || null,
    bleeding_disorders: f.bleeding_disorders.trim() || null,
    family_history: f.family_history.split(',').map(s => s.trim()).filter(Boolean),
    weight: f.weight.trim() || null,
    smoking_vaping: f.smoking_vaping || null,
    alcohol_consumption: f.alcohol_consumption || null,
    exercise_frequency: f.exercise_frequency || null,
    water_intake: f.water_intake || null,
    preferred_services: f.preferred_services.split(',').map(s => s.trim()).filter(Boolean),
    preferred_location: f.preferred_location.trim() || null,
    preferred_branch_id: f.preferred_branch_id || null,
    consent_given: f.consent_given,
    consent_date: f.consent_date ? new Date(f.consent_date).toISOString() : null,
    general_notes: f.general_notes.trim() || null,
    operational_notes: f.operational_notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

// ─── Reusable Form Components ─────────────────────────────────────────────────

function SectionLabel({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" /> {title}
    </p>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent" />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows = 2 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none" />
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
        <option value="">{placeholder ?? 'Select…'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function BranchSelectField({ label, value, onChange, branches }: {
  label: string; value: string; onChange: (v: string) => void; branches: Branch[];
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white">
        <option value="">No preference</option>
        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </label>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function ClientFormModal({
  mode, initial, initialProfile, branches, canManage, onClose, onSaved,
}: {
  mode: 'add' | 'edit';
  initial: Client | null;
  initialProfile: ClientProfile | null;
  branches: Branch[];
  canManage: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState<FormData>(
    initial ? clientToForm(initial, initialProfile) : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [dupWarning, setDupWarning] = useState<{ id: string; full_name: string; email: string | null; phone: string | null } | null>(null);
  const [dupDismissed, setDupDismissed] = useState(false);

  function setField<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function checkDuplicate(email: string, phone: string, fullName: string, excludeId?: string): Promise<typeof dupWarning> {
    const excludeUuid = excludeId ?? '00000000-0000-0000-0000-000000000000';
    if (email.trim()) {
      const { data } = await supabase.from('clients').select('id, full_name, email, phone')
        .ilike('email', email.trim()).neq('id', excludeUuid).maybeSingle();
      if (data) return data as typeof dupWarning;
    }
    if (phone.trim()) {
      const { data } = await supabase.from('clients').select('id, full_name, email, phone')
        .eq('phone', phone.trim()).neq('id', excludeUuid).maybeSingle();
      if (data) return data as typeof dupWarning;
    }
    if (fullName.trim()) {
      const { data } = await supabase.from('clients').select('id, full_name, email, phone')
        .ilike('full_name', fullName.trim()).neq('id', excludeUuid).maybeSingle();
      if (data) return data as typeof dupWarning;
    }
    return null;
  }

  async function handleSave(force = false) {
    if (!form.full_name.trim()) { setErr('Full name is required.'); return; }
    if (!canManage) { setErr('You do not have permission to manage clients.'); return; }

    setSaving(true);
    setErr('');

    if (!force) {
      const dup = await checkDuplicate(form.email, form.phone, form.full_name, initial?.id);
      if (dup) {
        setDupWarning(dup);
        setSaving(false);
        return;
      }
    }
    setDupWarning(null);

    const clientPayload = formToClientPayload(form);

    let clientId = initial?.id;
    if (mode === 'edit' && initial) {
      const { error } = await supabase.from('clients').update(clientPayload).eq('id', initial.id);
      if (error) { setErr(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('clients').insert(clientPayload).select('id').single();
      if (error) { setErr(error.message); setSaving(false); return; }
      clientId = data.id;
    }

    if (clientId) {
      const profilePayload = formToProfilePayload(form, clientId);
      const { error: profErr } = await supabase.from('client_profiles')
        .upsert(profilePayload, { onConflict: 'client_id' });
      if (profErr) { setErr(profErr.message); setSaving(false); return; }
    }

    setSaving(false);
    onSaved(mode === 'edit' ? 'Client updated successfully.' : 'Client added successfully.');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="rounded-t-3xl px-6 pt-6 pb-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
                {mode === 'add' ? <UserPlus className="w-5 h-5 text-teal-600" /> : <Pencil className="w-5 h-5 text-teal-600" />}
              </div>
              <h2 className="text-lg font-bold text-slate-800">{mode === 'add' ? 'Add Client' : 'Edit Client'}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
          {dupWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-700">Possible Duplicate Client</p>
                  <p className="text-xs text-amber-600 mt-1">
                    A client with a matching email, phone, or name already exists:
                    <span className="font-semibold"> {dupWarning.full_name}</span>
                    {dupWarning.email && <span> ({dupWarning.email})</span>}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setDupDismissed(true)} className="px-3 py-1.5 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors">
                      Cancel
                    </button>
                    <button onClick={() => { setDupWarning(null); setDupDismissed(true); }} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      View Existing
                    </button>
                    <button onClick={() => handleSave(true)} className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors">
                      Save Anyway
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {dupDismissed && !dupWarning && null}

          <div>
            <SectionLabel icon={Users} title="Personal Details" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <TextField label="Full Name" required value={form.full_name} onChange={v => setField('full_name', v)} placeholder="Juan dela Cruz" />
              </div>
              <TextField label="Date of Birth" type="date" value={form.date_of_birth} onChange={v => setField('date_of_birth', v)} />
              <TextField label="Age" type="number" value={form.age} onChange={v => setField('age', v)} placeholder="35" />
              <SelectField label="Gender" value={form.gender} onChange={v => setField('gender', v)} options={['Male', 'Female', 'Non-binary', 'Prefer not to say']} placeholder="Select gender" />
              <SelectField label="Status" value={form.status} onChange={v => setField('status', v)} options={['active', 'inactive']} placeholder="Select status" />
            </div>
          </div>

          <div>
            <SectionLabel icon={Contact} title="Contact Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField label="Email" type="email" value={form.email} onChange={v => setField('email', v)} placeholder="juan@example.com" />
              <TextField label="Phone" type="tel" value={form.phone} onChange={v => setField('phone', v)} placeholder="+63 912 345 6789" />
              <div className="sm:col-span-2">
                <TextAreaField label="Address" value={form.address} onChange={v => setField('address', v)} placeholder="123 Rizal Street, Quezon City" />
              </div>
              <BranchSelectField label="Preferred Branch" value={form.preferred_branch_id} onChange={v => setField('preferred_branch_id', v)} branches={branches} />
              <TextField label="Preferred Location" value={form.preferred_location} onChange={v => setField('preferred_location', v)} placeholder="Home service, clinic, etc." />
            </div>
          </div>

          <div>
            <SectionLabel icon={ShieldCheck} title="Emergency Contact" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TextField label="Contact Person" value={form.emergency_contact_name} onChange={v => setField('emergency_contact_name', v)} placeholder="Maria dela Cruz" />
              <TextField label="Relationship" value={form.emergency_contact_relationship} onChange={v => setField('emergency_contact_relationship', v)} placeholder="Spouse" />
              <TextField label="Phone Number" type="tel" value={form.emergency_contact_number} onChange={v => setField('emergency_contact_number', v)} placeholder="+63 912 345 6789" />
            </div>
          </div>

          <div>
            <SectionLabel icon={HeartPulse} title="Health Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextAreaField label="Allergies" value={form.allergies} onChange={v => setField('allergies', v)} placeholder="Penicillin, shellfish…" />
              <TextAreaField label="Current Medications" value={form.current_medications} onChange={v => setField('current_medications', v)} placeholder="Metformin, Lisinopril…" />
              <SelectField label="Pregnancy / Breastfeeding" value={form.pregnancy_breastfeeding} onChange={v => setField('pregnancy_breastfeeding', v)} options={YES_NO_NA} placeholder="Select status" />
              <TextAreaField label="Pre-existing Conditions" value={form.pre_existing_conditions} onChange={v => setField('pre_existing_conditions', v)} placeholder="Diabetes, hypertension…" />
              <TextAreaField label="Bleeding Disorders" value={form.bleeding_disorders} onChange={v => setField('bleeding_disorders', v)} placeholder="Hemophilia, von Willebrand…" />
              <TextField label="Family History" value={form.family_history} onChange={v => setField('family_history', v)} placeholder="Heart disease, cancer (comma-separated)" />
              <TextField label="Weight" value={form.weight} onChange={v => setField('weight', v)} placeholder="65 kg" />
              <TextAreaField label="Health Notes" value={form.health_notes} onChange={v => setField('health_notes', v)} placeholder="Additional health disclosures…" />
            </div>
          </div>

          <div>
            <SectionLabel icon={Activity} title="Lifestyle Information" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField label="Smoking / Vaping" value={form.smoking_vaping} onChange={v => setField('smoking_vaping', v)} options={YES_NO_NA} placeholder="Select" />
              <SelectField label="Alcohol Consumption" value={form.alcohol_consumption} onChange={v => setField('alcohol_consumption', v)} options={['Never', 'Occasionally', 'Regularly', 'Daily', 'Prefer not to say']} placeholder="Select" />
              <SelectField label="Exercise Frequency" value={form.exercise_frequency} onChange={v => setField('exercise_frequency', v)} options={['Never', 'Rarely', '1-2x/week', '3-4x/week', 'Daily']} placeholder="Select" />
              <SelectField label="Daily Water Intake" value={form.water_intake} onChange={v => setField('water_intake', v)} options={['< 1L', '1-2L', '2-3L', '> 3L']} placeholder="Select" />
            </div>
          </div>

          <div>
            <SectionLabel icon={ClipboardList} title="Services & Preferences" />
            <div className="grid grid-cols-1 gap-3">
              <TextField label="Preferred Services" value={form.preferred_services} onChange={v => setField('preferred_services', v)} placeholder="IV Drip, Vitamin Shot (comma-separated)" />
            </div>
          </div>

          <div>
            <SectionLabel icon={ShieldCheck} title="Consent" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <div className="pt-2">
                <CheckboxField label="Consent Given" checked={form.consent_given} onChange={v => setField('consent_given', v)} />
              </div>
              <TextField label="Consent Date" type="date" value={form.consent_date} onChange={v => setField('consent_date', v)} />
            </div>
          </div>

          <div>
            <SectionLabel icon={StickyNote} title="Internal Notes" />
            <div className="grid grid-cols-1 gap-3">
              <TextAreaField label="General Notes" value={form.general_notes} onChange={v => setField('general_notes', v)} placeholder="Internal notes about this client…" rows={2} />
              <TextAreaField label="Operational / Service Notes" value={form.operational_notes} onChange={v => setField('operational_notes', v)} placeholder="Notes for operations or service delivery…" rows={2} />
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3 border-t border-slate-100 pt-4 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
          <button onClick={() => handleSave(false)} disabled={saving || !form.full_name.trim() || !canManage}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'add' ? <Plus className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {saving ? 'Saving…' : mode === 'add' ? 'Add Client' : 'Save Changes'}
          </button>
        </div>
        {!canManage && (
          <div className="px-6 pb-4 flex items-center gap-2 text-xs text-amber-600">
            <Lock className="w-3 h-3" /> You need the "Manage Clients" permission to add or edit clients.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Document Upload Modal ─────────────────────────────────────────────────────

function DocumentUploadModal({ client, onClose, onSaved }: {
  client: Client; onClose: () => void; onSaved: () => void;
}) {
  const [docType, setDocType] = useState<DocumentType>('consent');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!title.trim()) { setErr('Title is required.'); return; }
    if (!file && !content.trim()) { setErr('Either upload a file or enter text content.'); return; }
    setSaving(true);
    setErr('');

    let filePath: string | null = null;
    let fileName: string | null = null;

    if (file) {
      const ext = file.name.split('.').pop() ?? 'bin';
      const safeName = `${client.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('client-documents').upload(safeName, file);
      if (uploadErr) { setErr(uploadErr.message); setSaving(false); return; }
      filePath = safeName;
      fileName = file.name;
    }

    const { error } = await supabase.from('documents').insert({
      client_id: client.id,
      doc_type: docType,
      title: title.trim(),
      content: content.trim() || null,
      file_path: filePath,
      file_name: fileName,
      status: 'signed',
    });

    if (error) { setErr(error.message); setSaving(false); return; }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
                <Upload className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Upload Document</h2>
                <p className="text-xs text-slate-400">{client.full_name}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Document Type" value={docType} onChange={v => setDocType(v as DocumentType)} options={['waiver', 'consent', 'profile', 'other']} placeholder="Select type" />
            <TextField label="Title" required value={title} onChange={v => setTitle(v)} placeholder="IV Therapy Waiver" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Upload File</label>
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

          <div>
            <TextAreaField label="Or Enter Text Content" value={content} onChange={v => setContent(v)} placeholder="Type or paste document content…" rows={4} />
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {saving ? 'Uploading…' : 'Save Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────

function DocViewerModal({ doc, onClose }: { doc: DocRow; onClose: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <FileText className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-base font-bold text-slate-800">{doc.title ?? 'Untitled'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
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

// ─── Detail View Primitives ────────────────────────────────────────────────────

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  const hasValue = value?.trim();
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className={`text-sm font-semibold ${hasValue ? 'text-slate-800' : 'text-slate-300 italic'}`}>{hasValue ? value : 'Not provided'}</p>
      </div>
    </div>
  );
}

function HealthField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  const missing = !value?.trim();
  if (missing) {
    return (
      <div>
        <p className="text-xs text-slate-400 font-medium mb-0.5 flex items-center gap-1.5">
          <Icon className="w-3 h-3" /> {label}
        </p>
        <p className="text-sm font-semibold text-slate-300 italic">Not provided</p>
      </div>
    );
  }
  const hasRisk = isRiskValue(value);
  if (!hasRisk) {
    return (
      <div>
        <p className="text-xs text-slate-400 font-medium mb-0.5 flex items-center gap-1.5">
          <Icon className="w-3 h-3" /> {label}
        </p>
        <p className="text-sm font-semibold text-slate-800">{value}</p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-rose-50 border-rose-200 p-3">
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
      <div>
        <p className="text-xs font-bold text-rose-700">{label}</p>
        <p className="text-sm font-semibold text-rose-600">{value}</p>
      </div>
    </div>
  );
}

function SectionBlock({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-slate-400" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`w-3.5 h-3.5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-200'}`} />
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-600">{value}/5</span>
    </div>
  );
}

const APPT_STATUS_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  scheduled:    { label: 'Scheduled',    color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500' },
  dispatched:   { label: 'Dispatched',   color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500' },
  arrived:      { label: 'Arrived',      color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500' },
  in_treatment: { label: 'In Progress',  color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  completed:    { label: 'Completed',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled:    { label: 'Cancelled',    color: 'text-red-700',     bg: 'bg-red-50 border-red-200',       dot: 'bg-red-500' },
};

const PAY_CFG: Record<string, { color: string; label: string }> = {
  paid:    { color: 'text-emerald-600', label: 'Paid' },
  partial: { color: 'text-blue-600',   label: 'Partial' },
  pending: { color: 'text-amber-600',  label: 'Pending' },
  waived:  { color: 'text-slate-400',  label: 'Waived' },
};

// ─── Consent Viewer Modal ─────────────────────────────────────────────────────

function ConsentViewerModal({ record, onClose }: { record: ConsentRecord; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-bold text-slate-800">Consent & Waiver Record</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Form Type</p>
              <p className="text-sm font-semibold text-slate-700 capitalize">{record.form_type}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Version</p>
              <p className="text-sm font-semibold text-slate-700">{record.form_version}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Status</p>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${record.status === 'signed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {record.status === 'signed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />} {record.status}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Submission Method</p>
              <p className="text-sm font-semibold text-slate-700">{record.submission_method ?? '—'}</p>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Treatment / Service</p>
                <p className="text-sm text-slate-700">{record.appointment?.service ?? record.service ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Appointment Date</p>
                <p className="text-sm text-slate-700">{record.appointment ? formatTs(record.appointment.scheduled_date) : '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Date & Time Signed</p>
                <p className="text-sm text-slate-700">{formatDateTime(record.signed_at)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Registered Nurse</p>
                <p className="text-sm text-slate-700">{record.appointment?.nurse_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">RN License Number</p>
                <p className="text-sm text-slate-700">—</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Signatory Name</p>
                <p className="text-sm text-slate-700">{record.signatory_name ?? '—'}</p>
              </div>
            </div>
          </div>
          {record.signature_data && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Client Signature</p>
              <SignatureImage signatureData={record.signature_data} className="max-h-40 border border-slate-200 rounded-xl bg-white object-contain p-2" />
            </div>
          )}
          <button onClick={() => downloadConsent(record)} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors">
            <Download className="w-4 h-4" /> Download Consent
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 360° Client Workspace ─────────────────────────────────────────────────────

type WorkspaceTab = 'overview' | 'personal' | 'medical' | 'appointments' | 'feedback' | 'documents' | 'timeline';

function ClientWorkspace({
  client, profile, unified, documents, appointments, feedbacks, branches, canManage, canViewSensitive, onClose, onEdit, onUploadDoc, onDocClick,
}: {
  client: FullClient;
  profile: ClientProfile | null;
  unified: UnifiedClientProfile | null;
  documents: DocRow[];
  appointments: AppointmentSummary[];
  feedbacks: FeedbackSummary[];
  branches: Branch[];
  canManage: boolean;
  canViewSensitive: boolean;
  onClose: () => void;
  onEdit: (c: Client, p: ClientProfile | null) => void;
  onUploadDoc: () => void;
  onDocClick: (d: DocRow) => void;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [viewConsent, setViewConsent] = useState<ConsentRecord | null>(null);
  const u = unified;
  const branchName = profile?.preferred_branch_id ? branches.find(b => b.id === profile.preferred_branch_id)?.name : null;

  const appointmentCount = appointments.length;
  const completedCount = appointments.filter(a => a.status === 'completed').length;
  const totalPaid = appointments
    .filter(a => a.payment_status === 'paid' || a.payment_status === 'partial')
    .reduce((s, a) => s + (a.payment_amount ?? 0), 0);
  const avgSatisfaction = feedbacks.length > 0
    ? (feedbacks.reduce((s, f) => s + f.overall_satisfaction, 0) / feedbacks.length).toFixed(1)
    : null;

  const lastAppt = appointments.length > 0
    ? appointments.reduce((latest, a) => new Date(a.scheduled_date) > new Date(latest.scheduled_date) ? a : latest)
    : null;
  const nextAppt = appointments.find(a => new Date(a.scheduled_date) >= new Date() && a.status !== 'cancelled') ?? null;

  const tabs: { key: WorkspaceTab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: ActivityIcon },
    { key: 'personal', label: 'Personal Info', icon: User },
    { key: 'medical', label: 'Medical Profile', icon: HeartPulse },
    { key: 'appointments', label: 'Appointments', icon: Calendar, count: appointmentCount },
    { key: 'feedback', label: 'Feedback', icon: MessageSquare, count: feedbacks.length },
    { key: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { key: 'timeline', label: 'Workflow Timeline', icon: Clock },
  ];

  return (
    <div className="bg-slate-50 -mx-8 -mt-8 min-h-[calc(100vh-64px)]">
      {/* Premium Profile Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center gap-4 mb-1">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" /> All Clients
          </button>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-5 mt-4">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-xl font-bold">{initials(client.full_name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900 truncate">{client.full_name}</h2>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${client.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {client.status === 'active' ? 'Active' : 'Inactive'}
              </span>
              <span className="text-xs text-slate-400 font-mono">ID: {client.id.slice(0, 8)}</span>
            </div>
            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
              {client.email && <span className="flex items-center gap-1 text-xs text-slate-400"><Mail className="w-3 h-3" /> {client.email}</span>}
              {client.phone && <span className="flex items-center gap-1 text-xs text-slate-400"><Phone className="w-3 h-3" /> {client.phone}</span>}
              {(u?.age ?? profile?.age) != null && <span className="flex items-center gap-1 text-xs text-slate-400"><Cake className="w-3 h-3" /> {(u?.age ?? profile?.age)} yrs</span>}
              {(u?.gender ?? profile?.gender) && <span className="flex items-center gap-1 text-xs text-slate-400"><User className="w-3 h-3" /> {u?.gender ?? profile?.gender}</span>}
            </div>
          </div>
          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {totalPaid > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700">₱{totalPaid.toLocaleString()}</span>
              </div>
            )}
            {avgSatisfaction && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-xs font-bold text-amber-700">{avgSatisfaction} avg</span>
              </div>
            )}
            {canManage && (
              <>
                <button onClick={onUploadDoc} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
                <button onClick={() => onEdit(client, profile)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
              </>
            )}
          </div>
        </div>

        {/* Compact summary cards row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Appointments', value: String(appointmentCount), Icon: Calendar, color: 'text-teal-600', bg: 'bg-teal-50' },
            { label: 'Last Visit', value: lastAppt ? formatDate(lastAppt.scheduled_date) : 'None', Icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
            { label: 'Next Appointment', value: nextAppt ? formatDate(nextAppt.scheduled_date) : 'None', Icon: CalendarClock, color: 'text-sky-600', bg: 'bg-sky-50' },
            { label: 'Preferred Branch', value: branchName ?? 'Not set', Icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
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
                <p className="text-sm font-bold text-slate-800 truncate">{s.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-8 flex gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === t.key ? 'border-teal-500 text-teal-700' : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}>
                <Icon className="w-4 h-4" />
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded-md leading-tight">{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-6xl mx-auto px-8 py-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Quick Statistics */}
            <div className="lg:col-span-2 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total Treatments', value: String(completedCount), Icon: ActivityIcon, color: 'text-teal-600', bg: 'bg-teal-50' },
                  { label: 'Lifetime Spending', value: `₱${totalPaid.toLocaleString()}`, Icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Avg Visit Value', value: completedCount > 0 ? `₱${Math.round(totalPaid / completedCount).toLocaleString()}` : '—', Icon: TrendingUp, color: 'text-sky-600', bg: 'bg-sky-50' },
                  { label: 'Last Treatment', value: lastAppt ? formatTs(lastAppt.scheduled_date) : 'None', Icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
                  { label: 'Feedback Rating', value: avgSatisfaction ? `${avgSatisfaction}/5` : '—', Icon: Star, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Upcoming', value: nextAppt ? formatDate(nextAppt.scheduled_date) : 'None', Icon: CalendarClock, color: 'text-blue-600', bg: 'bg-blue-50' },
                ].map(s => {
                  const Icon = s.Icon;
                  return (
                    <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${s.color}`} />
                        </div>
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                    </div>
                  );
                })}
              </div>

              <SectionBlock title="Quick Notes" icon={StickyNote}>
                <DetailField icon={StickyNote} label="General Notes" value={u?.general_notes ?? profile?.general_notes} />
                <DetailField icon={ClipboardList} label="Operational / Service Notes" value={u?.operational_notes ?? profile?.operational_notes} />
                <DetailField icon={HeartPulse} label="Health Notes" value={u?.health_notes ?? client.health_notes} />
              </SectionBlock>
            </div>

            {/* Status sidebar */}
            <div className="space-y-5">
              <SectionBlock title="Membership & Status" icon={ShieldCheck}>
                <DetailField icon={BadgeCheck} label="Client Status" value={client.status === 'active' ? 'Active' : 'Inactive'} />
                <DetailField icon={FileCheck} label="Consent" value={(u?.consent_given ?? profile?.consent_given) ? 'Given' : 'Not given'} />
                <DetailField icon={Calendar} label="Consent Date" value={(u?.consent_date ?? profile?.consent_date) ? formatTs((u?.consent_date ?? profile?.consent_date) as string) : null} />
                <DetailField icon={Building2} label="Preferred Branch" value={branchName} />
              </SectionBlock>
              <SectionBlock title="Outstanding Balance" icon={CreditCard}>
                <p className="text-3xl font-bold text-slate-800">₱0</p>
                <p className="text-xs text-slate-400 mt-1">No outstanding balance recorded.</p>
              </SectionBlock>
            </div>
          </div>
        )}

        {activeTab === 'personal' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionBlock title="Personal Details" icon={Users}>
              <DetailField icon={User} label="Full Name" value={client.full_name} />
              <DetailField icon={Cake} label="Date of Birth" value={(u?.date_of_birth ?? profile?.date_of_birth) ? formatTs((u?.date_of_birth ?? profile?.date_of_birth) as string) : null} />
              <DetailField icon={User} label="Age" value={(u?.age ?? profile?.age) != null ? `${u?.age ?? profile?.age} years` : null} />
              <DetailField icon={User} label="Gender" value={u?.gender ?? profile?.gender} />
              <DetailField icon={ShieldCheck} label="Status" value={client.status === 'active' ? 'Active' : 'Inactive'} />
            </SectionBlock>

            <SectionBlock title="Contact Information" icon={Contact}>
              <DetailField icon={Mail} label="Email" value={client.email} />
              <DetailField icon={Phone} label="Phone" value={client.phone} />
              <DetailField icon={MapPin} label="Address" value={u?.address ?? client.address} />
              <DetailField icon={MapPin} label="Preferred Branch" value={branchName} />
              <DetailField icon={MapPin} label="Preferred Location" value={u?.preferred_location ?? profile?.preferred_location} />
            </SectionBlock>

            <SectionBlock title="Emergency Contact" icon={ShieldCheck}>
              <DetailField icon={User} label="Contact Person" value={u?.emergency_contact_name ?? profile?.emergency_contact_name} />
              <DetailField icon={Contact} label="Relationship" value={u?.emergency_contact_relationship ?? profile?.emergency_contact_relationship} />
              <DetailField icon={Phone} label="Phone Number" value={u?.emergency_contact_number ?? profile?.emergency_contact_number} />
            </SectionBlock>

            <SectionBlock title="Services & Preferences" icon={ClipboardList}>
              <DetailField icon={ClipboardList} label="Preferred Services" value={((u?.preferred_services ?? profile?.preferred_services) ?? []).join(', ') || null} />
              <DetailField icon={MapPin} label="Preferred Location" value={u?.preferred_location ?? profile?.preferred_location} />
              <DetailField icon={MapPin} label="Preferred Branch" value={branchName} />
            </SectionBlock>

            <SectionBlock title="Consent" icon={ShieldCheck}>
              <div className="flex items-center gap-3">
                {(u?.consent_given ?? profile?.consent_given) ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                    <CheckCircle className="w-3.5 h-3.5" /> Consent Given
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-50 border border-slate-200 text-slate-500">
                    <X className="w-3.5 h-3.5" /> Consent Not Given
                  </span>
                )}
              </div>
              <DetailField icon={Calendar} label="Consent Date" value={(u?.consent_date ?? profile?.consent_date) ? formatTs((u?.consent_date ?? profile?.consent_date) as string) : null} />
            </SectionBlock>

            <SectionBlock title="Internal Notes" icon={StickyNote}>
              <DetailField icon={StickyNote} label="General Notes" value={u?.general_notes ?? profile?.general_notes} />
              <DetailField icon={ClipboardList} label="Operational / Service Notes" value={u?.operational_notes ?? profile?.operational_notes} />
            </SectionBlock>
          </div>
        )}

        {activeTab === 'medical' && canViewSensitive && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SectionBlock title="Medical History" icon={HeartPulse}>
              <HealthField icon={AlertTriangle} label="Allergies" value={u?.allergies ?? profile?.allergies} />
              <HealthField icon={Stethoscope} label="Current Medications" value={u?.current_medications ?? profile?.current_medications} />
              <HealthField icon={Baby} label="Pregnancy / Breastfeeding" value={u?.pregnancy_breastfeeding ?? profile?.pregnancy_breastfeeding} />
              <HealthField icon={HeartPulse} label="Pre-existing Conditions" value={u?.pre_existing_conditions ?? profile?.pre_existing_conditions} />
              <HealthField icon={HeartPulse} label="Bleeding Disorders" value={u?.bleeding_disorders ?? profile?.bleeding_disorders} />
              <HealthField icon={HeartPulse} label="Family History" value={((u?.family_history ?? profile?.family_history) ?? []).join(', ') || null} />
            </SectionBlock>

            <SectionBlock title="Lifestyle" icon={Activity}>
              <DetailField icon={Cigarette} label="Smoking / Vaping" value={u?.smoking_vaping ?? profile?.smoking_vaping} />
              <DetailField icon={Wine} label="Alcohol Consumption" value={u?.alcohol_consumption ?? profile?.alcohol_consumption} />
              <DetailField icon={Dumbbell} label="Exercise Frequency" value={u?.exercise_frequency ?? profile?.exercise_frequency} />
              <DetailField icon={Droplets} label="Daily Water Intake" value={u?.water_intake ?? profile?.water_intake} />
              <DetailField icon={Activity} label="Weight" value={u?.weight ?? profile?.weight} />
            </SectionBlock>

            <SectionBlock title="Clinical Notes" icon={Stethoscope}>
              <DetailField icon={HeartPulse} label="Health Notes" value={u?.health_notes ?? client.health_notes} />
            </SectionBlock>
          </div>
        )}
        {activeTab === 'medical' && !canViewSensitive && (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <Lock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">Medical information requires clinical access permission.</p>
          </div>
        )}

        {activeTab === 'appointments' && (
          <div className="space-y-5">
            {appointments.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
                <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-400">No appointments linked to this client yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {appointments.map(appt => {
                  const statusCfg = APPT_STATUS_CFG[appt.status] ?? APPT_STATUS_CFG.scheduled;
                  const payCfg = PAY_CFG[appt.payment_status] ?? PAY_CFG.pending;
                  const hasFeedback = !!appt.feedback;
                  return (
                    <div key={appt.id} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between px-5 py-4 border-b border-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                            <Stethoscope className="w-5 h-5 text-teal-600" />
                          </div>
                          <div>
                            {appt.service && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 border border-teal-100 rounded-lg text-xs font-bold text-teal-700 mb-1">
                                {appt.service}
                              </span>
                            )}
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <Calendar className="w-3 h-3 text-slate-400" /> {formatDate(appt.scheduled_date)}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <Clock className="w-3 h-3 text-slate-400" /> {formatTime(appt.scheduled_time)}
                              </span>
                              {appt.branches?.name && (
                                <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                  <MapPin className="w-3 h-3 text-slate-400" /> {appt.branches.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${statusCfg.bg} ${statusCfg.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${
                            appt.payment_status === 'paid' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                            appt.payment_status === 'partial' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                            appt.payment_status === 'waived' ? 'bg-slate-50 border-slate-200 text-slate-500' :
                            'bg-amber-50 border-amber-200 text-amber-700'
                          }`}>
                            <CreditCard className="w-3 h-3" />
                            {payCfg.label}
                          </span>
                          {hasFeedback && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold bg-violet-50 border-violet-200 text-violet-700">
                              <MessageSquare className="w-3 h-3" /> Feedback
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${
                            appt.consent?.status === 'signed'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-red-50 border-red-200 text-red-600'
                          }`}>
                            {appt.consent?.status === 'signed'
                              ? <><CheckCircle className="w-3 h-3" /> Consent Signed</>
                              : <><AlertTriangle className="w-3 h-3" /> Consent Missing</>}
                          </span>
                          <AppointmentRowMenu
                            hasConsent={!!appt.consent}
                            onViewConsent={() => appt.consent && setViewConsent(appt.consent)}
                          />
                        </div>
                      </div>

                      {/* Workflow progress */}
                      <div className="px-5 pt-3">
                        {(() => {
                          const p = apptProgress(appt.status);
                          const cancelled = appt.status === 'cancelled';
                          return (
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${cancelled ? 'bg-slate-300' : 'bg-teal-500'}`}
                                  style={{ width: `${cancelled ? 100 : p.pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                                {cancelled ? 'Cancelled' : `Stage ${p.index} of ${p.total}`}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="px-5 py-3 flex items-center gap-6 flex-wrap">
                        {appt.payment_amount != null && appt.payment_amount > 0 && (
                          <span className="text-sm font-bold text-slate-700">₱{appt.payment_amount.toLocaleString()}</span>
                        )}
                        {appt.payment_method && (
                          <span className="text-xs text-slate-400 capitalize">{appt.payment_method}</span>
                        )}
                        {appt.completed_at && (
                          <span className="text-xs text-slate-400">Completed {formatTs(appt.completed_at)}</span>
                        )}
                      </div>
                      {appt.meeting_platform && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-violet-50/40">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-500 mb-2 flex items-center gap-1.5">
                            <Video className="w-3 h-3" /> Virtual Meeting
                          </p>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-700">{appt.meeting_platform}</span>
                            </div>
                            {appt.meeting_link && (
                              <a href={appt.meeting_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-violet-600 hover:text-violet-700 hover:underline break-all">
                                <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> {appt.meeting_link}
                              </a>
                            )}
                            {appt.meeting_notes && (
                              <p className="text-xs text-slate-600">{appt.meeting_notes}</p>
                            )}
                          </div>
                        </div>
                      )}
                      {appt.feedback && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                            <MessageSquare className="w-3 h-3" /> Client Feedback
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-slate-400 mb-1">Overall Satisfaction</p>
                              <StarDisplay value={appt.feedback.overall_satisfaction} />
                            </div>
                            <div>
                              <p className="text-xs text-slate-400 mb-1">Staff Professionalism</p>
                              <StarDisplay value={appt.feedback.staff_professionalism} />
                            </div>
                            {appt.feedback.liked_most && (
                              <div className="sm:col-span-2">
                                <p className="text-xs text-slate-400 mb-0.5">What they liked most</p>
                                <p className="text-sm text-slate-700">&ldquo;{appt.feedback.liked_most}&rdquo;</p>
                              </div>
                            )}
                            {appt.feedback.comments_suggestions && (
                              <div className="sm:col-span-2">
                                <p className="text-xs text-slate-400 mb-0.5">Comments</p>
                                <p className="text-sm text-slate-600 italic">&ldquo;{appt.feedback.comments_suggestions}&rdquo;</p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-4 mt-3">
                            <span className="text-xs text-slate-400">Avail again: <span className={`font-semibold ${appt.feedback.avail_again === 'Yes' ? 'text-emerald-600' : appt.feedback.avail_again === 'No' ? 'text-red-500' : 'text-amber-600'}`}>{appt.feedback.avail_again}</span></span>
                            <span className="text-xs text-slate-400">Recommend: <span className={`font-semibold ${appt.feedback.recommend === 'Yes' ? 'text-emerald-600' : appt.feedback.recommend === 'No' ? 'text-red-500' : 'text-amber-600'}`}>{appt.feedback.recommend}</span></span>
                          </div>
                        </div>
                      )}
                      {appt.recommendations && appt.recommendations.length > 0 && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-emerald-50/30">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 mb-3 flex items-center gap-1.5">
                            <ClipboardCheck className="w-3 h-3" /> Doctor Recommendation
                          </p>
                          <div className="space-y-3">
                            {appt.recommendations.map(rec => (
                              <div key={rec.id} className="p-3 bg-white border border-emerald-100 rounded-lg">
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{rec.recommendation_text}</p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[11px] text-slate-400">{formatTs(rec.recorded_at)}</span>
                                  {rec.recorded_by_email && (
                                    <span className="text-[11px] text-slate-400">by {rec.recorded_by_email}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="space-y-5">
            {feedbacks.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
                <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-400">No feedback submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedbacks.map(f => (
                  <div key={f.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Overall Satisfaction</p>
                        <StarDisplay value={f.overall_satisfaction} />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">Staff Professionalism</p>
                        <StarDisplay value={f.staff_professionalism} />
                      </div>
                    </div>
                    {f.liked_most && <p className="text-sm text-slate-700 mb-1">&ldquo;{f.liked_most}&rdquo;</p>}
                    {f.comments_suggestions && <p className="text-sm text-slate-500 italic">&ldquo;{f.comments_suggestions}&rdquo;</p>}
                    <div className="flex gap-4 mt-3">
                      <span className="text-xs text-slate-400">Avail again: <span className={`font-semibold ${f.avail_again === 'Yes' ? 'text-emerald-600' : f.avail_again === 'No' ? 'text-red-500' : 'text-amber-600'}`}>{f.avail_again}</span></span>
                      <span className="text-xs text-slate-400">Recommend: <span className={`font-semibold ${f.recommend === 'Yes' ? 'text-emerald-600' : f.recommend === 'No' ? 'text-red-500' : 'text-amber-600'}`}>{f.recommend}</span></span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{formatTs(f.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <SectionBlock title="Consent & Documents" icon={FileText}>
            {documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No documents uploaded yet.</p>
                {canManage && (
                  <button onClick={onUploadDoc} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors mx-auto">
                    <Upload className="w-3.5 h-3.5" /> Upload Document
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/40 transition-colors cursor-pointer" onClick={() => onDocClick(doc)}>
                    <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{doc.title ?? 'Untitled'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase">{doc.doc_type}</span>
                        {doc.file_name && <span className="text-xs text-slate-400">· {doc.file_name}</span>}
                        <span className="text-xs text-slate-400">· {formatTs(doc.created_at)}</span>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                      doc.status === 'signed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      doc.status === 'draft' ? 'bg-slate-50 border-slate-200 text-slate-500' :
                      'bg-rose-50 border-rose-200 text-rose-700'
                    }`}>
                      {doc.status}
                    </span>
                    {doc.file_path && <Download className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                ))}
              </div>
            )}
          </SectionBlock>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Complete audit trail of client activity, derived from appointments and records.</p>
            {appointments.length === 0 && documents.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center">
                <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-400">No timeline events yet.</p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-5">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200" />
                {/* Client created */}
                <TimelineEvent icon={UserPlus} date={client.created_at} title="Client Record Created" note={`Added to client management`} />
                {/* Consent */}
                {(u?.consent_given ?? profile?.consent_given) && (u?.consent_date ?? profile?.consent_date) && (
                  <TimelineEvent icon={FileCheck} date={(u?.consent_date ?? profile?.consent_date) as string} title="Consent Given" note="Client acknowledged terms" />
                )}
                {/* Documents */}
                {documents.map(d => (
                  <TimelineEvent key={d.id} icon={FileText} date={d.created_at} title={`Document: ${d.title ?? d.doc_type}`} note={`${d.doc_type} · ${d.status}`} />
                ))}
                {/* Appointments */}
                {appointments.map(a => (
                  <TimelineEvent key={a.id} icon={Calendar} date={a.scheduled_date} title={`Appointment: ${a.service ?? 'Service'}`} note={`${a.status} · ${a.branches?.name ?? ''} · ${formatTime(a.scheduled_time)}`} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rendered at the workspace root so it opens from any tab, not just
          Personal Info where it previously lived. */}
      {viewConsent && <ConsentViewerModal record={viewConsent} onClose={() => setViewConsent(null)} />}
    </div>
  );
}

// ─── Appointment row overflow menu ───────────────────────────────────────────

function AppointmentRowMenu({ hasConsent, onViewConsent }: { hasConsent: boolean; onViewConsent: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Appointment actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          <button
            role="menuitem"
            type="button"
            disabled={!hasConsent}
            onClick={() => { setOpen(false); onViewConsent(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          >
            <Eye className="w-3.5 h-3.5 text-teal-600" />
            {hasConsent ? 'View Consent' : 'No consent captured'}
          </button>
        </div>
      )}
    </div>
  );
}

function TimelineEvent({ icon: Icon, date, title, note }: { icon: React.ElementType; date: string; title: string; note: string }) {
  return (
    <div className="relative">
      <div className="absolute -left-[18px] top-1 w-3 h-3 rounded-full bg-teal-400 ring-4 ring-slate-50" />
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{note}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(date)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Everything destroyed by deleting a client. All of these cascade at the database
// level (see 20260809150000_client_delete_cascades_all_records), so the delete
// always succeeds — these counts exist to show what is about to be lost.
const CLIENT_CASCADE_TABLES: { table: string; label: string }[] = [
  { table: 'appointments', label: 'appointment' },
  { table: 'orders', label: 'order' },
  { table: 'payments', label: 'payment' },
  { table: 'consultation_requests', label: 'consultation request' },
  { table: 'client_consent_records', label: 'signed consent form' },
  { table: 'client_treatment_notes', label: 'treatment note' },
];

export default function ClientManagementTab({ canManage = false, canViewSensitive = true, canDelete = false }: { canManage?: boolean; canViewSensitive?: boolean; canDelete?: boolean }) {
  const [clients, setClients] = useState<FullClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [editProfile, setEditProfile] = useState<ClientProfile | null>(null);
  const [viewTarget, setViewTarget] = useState<FullClient | null>(null);
  // Deletion. Mirrors the catalog delete flow: check real dependencies first,
  // require the name typed back, and offer deactivation as the safe alternative.
  const [deleteTarget, setDeleteTarget] = useState<FullClient | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlockers, setDeleteBlockers] = useState<string[] | null>(null);
  const [checkingDeps, setCheckingDeps] = useState(false);
  const [viewProfile, setViewProfile] = useState<ClientProfile | null>(null);
  const [viewUnified, setViewUnified] = useState<UnifiedClientProfile | null>(null);
  const [viewDocs, setViewDocs] = useState<DocRow[]>([]);
  const [viewAppointments, setViewAppointments] = useState<AppointmentSummary[]>([]);
  const [viewFeedbacks, setViewFeedbacks] = useState<FeedbackSummary[]>([]);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocRow | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const PAGE_SIZE = 12;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: dbErr } = await supabase
      .from('clients')
      .select('*, client_profiles(*)')
      .order('created_at', { ascending: false });
    if (dbErr) setError('Failed to load clients.');
    else setClients(data ?? []);
    setLoading(false);
  }, []);

  const loadBranches = useCallback(async () => {
    const { data } = await supabase.from('branches').select('id, name').order('name');
    setBranches(data ?? []);
  }, []);

  useEffect(() => { load(); loadBranches(); }, [load, loadBranches]);

  function handleSaved(msg: string) {
    load();
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function openView(c: FullClient) {
    setViewTarget(c);
    setViewProfile(c.client_profiles ?? null);
    setViewUnified(null);
    setViewDocs([]);
    setViewAppointments([]);
    setViewFeedbacks([]);

    const [unified, docsRes, apptRes] = await Promise.all([
      loadUnifiedClientProfile(c.id),
      supabase.from('documents').select('*').eq('client_id', c.id).order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('id, scheduled_date, scheduled_time, service, status, payment_status, payment_amount, payment_method, completed_at, meeting_platform, meeting_link, meeting_notes, nurse_name, branches(name)')
        .eq('client_id', c.id)
        .order('scheduled_date', { ascending: false }),
    ]);
    setViewUnified(unified);
    setViewDocs((docsRes.data ?? []) as DocRow[]);

    const appointments: AppointmentSummary[] = (apptRes.data ?? []) as AppointmentSummary[];

    // Fetch feedback linked by appointment_id
    const apptIds = appointments.map(a => a.id);
    let apptFeedback: (FeedbackSummary & { appointment_id?: string | null })[] = [];
    let apptRecs: { id: string; appointment_id: string | null; recommendation_text: string; recorded_by_email: string | null; recorded_at: string }[] = [];
    if (apptIds.length > 0) {
      const [afRes, recRes] = await Promise.all([
        supabase
          .from('client_feedback')
          .select('id, overall_satisfaction, staff_professionalism, liked_most, comments_suggestions, avail_again, recommend, created_at, appointment_id')
          .in('appointment_id', apptIds),
        supabase
          .from('consultation_recommendations')
          .select('id, appointment_id, recommendation_text, recorded_by_email, recorded_at')
          .in('appointment_id', apptIds)
          .order('recorded_at', { ascending: false }),
      ]);
      apptFeedback = (afRes.data ?? []) as (FeedbackSummary & { appointment_id?: string | null })[];
      apptRecs = (recRes.data ?? []) as typeof apptRecs;
    }

    // Also fetch feedback by client name (legacy linkage)
    let nameFeedbacks: (FeedbackSummary & { appointment_id?: string | null })[] = [];
    if (c.full_name) {
      const { data: nf } = await supabase
        .from('client_feedback')
        .select('id, overall_satisfaction, staff_professionalism, liked_most, comments_suggestions, avail_again, recommend, created_at, appointment_id')
        .ilike('name', c.full_name)
        .order('created_at', { ascending: false });
      nameFeedbacks = (nf ?? []) as (FeedbackSummary & { appointment_id?: string | null })[];
    }

    // Merge feedback and recommendations onto appointments
    const enrichedAppointments = appointments.map(appt => ({
      ...appt,
      feedback: apptFeedback.find(f => f.appointment_id === appt.id) ?? null,
      recommendations: apptRecs.filter(r => r.appointment_id === appt.id) ?? [],
    }));
    setViewAppointments(enrichedAppointments);

    // Deduplicated feedback list
    const allFeedbackIds = new Set<string>();
    const allFeedbacks: FeedbackSummary[] = [];
    [...apptFeedback, ...nameFeedbacks].forEach(f => {
      if (!allFeedbackIds.has(f.id)) {
        allFeedbackIds.add(f.id);
        allFeedbacks.push(f);
      }
    });
    setViewFeedbacks(allFeedbacks);

    // Fetch signed consent records.
    // Matched by client_id OR by any of this client's appointments: records
    // captured when the appointment carried no client_id are still correctly
    // linked by appointment_id, and would otherwise be invisible here while
    // showing fine on the nurse's appointment screen.
    const consentApptIds = enrichedAppointments.map(a => a.id);
    const consentFilter = consentApptIds.length > 0
      ? `client_id.eq.${c.id},appointment_id.in.(${consentApptIds.join(',')})`
      : `client_id.eq.${c.id}`;

    const { data: consentData, error: consentErr } = await supabase
      .from('client_consent_records')
      .select('id, appointment_id, service, form_type, form_version, status, signatory_name, signature_data, signed_at, submission_method')
      .or(consentFilter)
      .order('signed_at', { ascending: false });

    if (consentErr) {
      console.error('Consent records load failed:', consentErr);
      setError(`Could not load consent records: ${consentErr.message}`);
    }
    const consentRecords: ConsentRecord[] = (consentData ?? []).map(cr => {
      const appt = appointments.find(a => a.id === cr.appointment_id);
      return {
        ...cr,
        appointment: appt ? { scheduled_date: appt.scheduled_date, scheduled_time: appt.scheduled_time, service: appt.service, nurse_name: appt.nurse_name } : null,
      };
    });

    // Attach each appointment's consent so the history can show signed/missing.
    // A signed record wins over a pending one for the same appointment.
    const consentByAppt = new Map<string, ConsentRecord>();
    consentRecords.forEach(cr => {
      if (!cr.appointment_id) return;
      const existing = consentByAppt.get(cr.appointment_id);
      if (!existing || (existing.status !== 'signed' && cr.status === 'signed')) {
        consentByAppt.set(cr.appointment_id, cr);
      }
    });
    setViewAppointments(enrichedAppointments.map(a => ({ ...a, consent: consentByAppt.get(a.id) ?? null })));
  }

  function openEdit(c: Client, p: ClientProfile | null) {
    setEditTarget(c);
    setEditProfile(p);
    setViewTarget(null);
  }

  // Counts what the cascade will destroy, so the confirmation can state it
  // plainly instead of asking the user to delete an unknown amount of history.
  async function countClientRecords(clientId: string): Promise<string[]> {
    const found = await Promise.all(CLIENT_CASCADE_TABLES.map(async b => {
      const { count, error: depErr } = await supabase
        .from(b.table)
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId);
      if (depErr) return `${b.label} records could not be counted (${depErr.message})`;
      const n = count ?? 0;
      return n > 0 ? `${n} ${b.label}${n === 1 ? '' : 's'}` : null;
    }));
    return found.filter((f): f is string => f !== null);
  }

  async function openDelete(c: FullClient) {
    setDeleteTarget(c);
    setDeleteConfirmName('');
    setDeleteError(null);
    setDeleteBlockers(null);
    setCheckingDeps(true);
    setDeleteBlockers(await countClientRecords(c.id));
    setCheckingDeps(false);
  }

  function closeDelete() {
    setDeleteTarget(null);
    setDeleteConfirmName('');
    setDeleteError(null);
    setDeleteBlockers(null);
  }

  async function handleDelete(c: FullClient) {
    if (!canDelete) return;
    setDeleting(true);
    setDeleteError(null);

    // The database cascades everything belonging to this client.
    const { error: delErr } = await supabase.from('clients').delete().eq('id', c.id);
    setDeleting(false);

    if (delErr) {
      console.error('Client delete failed:', delErr);
      setDeleteError(`Failed to delete this client: ${delErr.message}`);
      return;
    }

    closeDelete();
    setViewTarget(null);
    load();
  }

  async function deactivateClient(c: FullClient) {
    const { error: updErr } = await supabase.from('clients').update({ status: 'inactive' }).eq('id', c.id);
    if (updErr) { setDeleteError(`Failed to deactivate: ${updErr.message}`); return; }
    closeDelete();
    load();
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = c.full_name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesBranch = branchFilter === 'all' || (c.client_profiles?.preferred_branch_id ?? '') === branchFilter;
    return matchesSearch && matchesStatus && matchesBranch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    inactive: clients.filter(c => c.status === 'inactive').length,
  };

  // ─── Detail View ───
  if (viewTarget) {
    return (
      <div className="space-y-6">
        <ClientWorkspace
          client={viewTarget}
          profile={viewProfile}
          unified={viewUnified}
          documents={viewDocs}
          appointments={viewAppointments}
          feedbacks={viewFeedbacks}
          branches={branches}
          canManage={canManage}
          canViewSensitive={canViewSensitive}
          onClose={() => setViewTarget(null)}
          onEdit={openEdit}
          onUploadDoc={() => setShowDocUpload(true)}
          onDocClick={(d) => setViewDoc(d)}
        />
        {showDocUpload && viewTarget && (
          <DocumentUploadModal
            client={viewTarget}
            onClose={() => setShowDocUpload(false)}
            onSaved={() => {
              setShowDocUpload(false);
              setSuccessMsg('Document uploaded successfully.');
              setTimeout(() => setSuccessMsg(null), 4000);
              supabase.from('documents').select('*').eq('client_id', viewTarget.id).order('created_at', { ascending: false })
                .then(({ data }) => setViewDocs((data ?? []) as DocRow[]));
            }}
          />
        )}
        {viewDoc && <DocViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />}
        {successMsg && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 shadow-lg">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
          </div>
        )}
      </div>
    );
  }

  // ─── List View ───
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Client Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">The complete 360° client record — profiles, appointments, feedback, documents, and timeline.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Clients', value: stats.total, icon: Users, color: 'text-teal-600', bg: 'bg-teal-50' },
          { label: 'Active', value: stats.active, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Inactive', value: stats.inactive, icon: Users, color: 'text-slate-500', bg: 'bg-slate-100' },
        ].map(s => {
          const Icon = s.icon;
          return (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
            <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by name, email, or phone…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700" />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(0); }}
            className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none text-slate-700 cursor-pointer">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <div className="relative">
          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(0); }}
            className="pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none text-slate-700 cursor-pointer">
            <option value="all">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {canManage && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Client
          </button>
        )}
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Lock className="w-4 h-4 flex-shrink-0" /> You have view-only access. Adding and editing clients requires the "Manage Clients" permission.
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
              <div className="flex justify-between mb-4">
                <div className="h-5 bg-slate-200 rounded w-48" />
                <div className="h-6 bg-slate-200 rounded-full w-20" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="h-4 bg-slate-100 rounded" />
                <div className="h-4 bg-slate-100 rounded" />
                <div className="h-4 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search || statusFilter !== 'all' || branchFilter !== 'all' ? 'No clients match your filters.' : 'No clients yet.'}
          </p>
          <p className="text-slate-400 text-sm mt-1">
            {search || statusFilter !== 'all' || branchFilter !== 'all' ? 'Try adjusting your search or filters.' : canManage ? 'Click "Add Client" to create the first client record.' : 'No client records have been added yet.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="hidden lg:grid grid-cols-[1.5fr_1.5fr_1.2fr_0.8fr_1fr_1fr_auto] text-xs font-semibold text-slate-400 uppercase tracking-wide px-6 py-3 border-b border-slate-100 bg-slate-50">
            <span>Client Name</span><span>Email</span><span>Phone</span><span>Status</span><span>Date Added</span><span>Last Updated</span><span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-50">
            {pageItems.map(client => (
              <div key={client.id} className="grid grid-cols-1 lg:grid-cols-[1.5fr_1.5fr_1.2fr_0.8fr_1fr_1fr_auto] items-center px-6 py-4 gap-3 lg:gap-4 hover:bg-slate-50/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-teal-700 font-bold text-xs">{initials(client.full_name)}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{client.full_name}</p>
                </div>
                <div className="min-w-0"><p className="text-sm text-slate-600 truncate">{client.email || <span className="text-slate-300 italic">Not provided</span>}</p></div>
                <div className="min-w-0"><p className="text-sm text-slate-600 truncate">{client.phone || <span className="text-slate-300 italic">Not provided</span>}</p></div>
                <div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${client.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {client.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div><p className="text-sm text-slate-500">{formatTs(client.created_at)}</p></div>
                <div><p className="text-sm text-slate-500">{formatTs(client.updated_at)}</p></div>
                <div className="flex items-center gap-2 lg:justify-end">
                  <button onClick={() => openView(client)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors">
                    <Eye className="w-3.5 h-3.5" /> <span className="lg:hidden">View</span>
                  </button>
                  {canManage && (
                    <button onClick={() => openEdit(client, client.client_profiles ?? null)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> <span className="lg:hidden">Edit</span>
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => openDelete(client)} title="Delete client"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> <span className="lg:hidden">Delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <p className="text-xs text-slate-400">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 transition-colors">Previous</button>
                <span className="text-xs text-slate-400 font-medium">Page {page + 1} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-40 transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showAdd && canManage && (
        <ClientFormModal mode="add" initial={null} initialProfile={null} branches={branches} canManage={canManage}
          onClose={() => setShowAdd(false)} onSaved={handleSaved} />
      )}
      {editTarget && canManage && (
        <ClientFormModal mode="edit" initial={editTarget} initialProfile={editProfile} branches={branches} canManage={canManage}
          onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <DeleteClientModal
          client={deleteTarget}
          blockers={deleteBlockers}
          checking={checkingDeps}
          confirmName={deleteConfirmName}
          onConfirmNameChange={setDeleteConfirmName}
          deleting={deleting}
          error={deleteError}
          onCancel={closeDelete}
          onConfirm={() => handleDelete(deleteTarget)}
          onDeactivate={() => deactivateClient(deleteTarget)}
        />
      )}
      {showDocUpload && viewTarget && canManage && (
        <DocumentUploadModal client={viewTarget} onClose={() => setShowDocUpload(false)}
          onSaved={() => {
            setShowDocUpload(false);
            setSuccessMsg('Document uploaded successfully.');
            setTimeout(() => setSuccessMsg(null), 4000);
            supabase.from('documents').select('*').eq('client_id', viewTarget.id).order('created_at', { ascending: false })
              .then(({ data }) => setViewDocs((data ?? []) as DocRow[]));
          }} />
      )}
    </div>
  );
}

// ─── Delete Client Modal ─────────────────────────────────────────────────────
// Deleting a client is permanent and cannot be undone, so this asks for the name
// to be typed back. When clinical or financial records reference the client the
// delete is blocked outright and deactivation is offered instead — that keeps
// history intact while stopping the client appearing in future workflows.

function DeleteClientModal({
  client, blockers, checking, confirmName, onConfirmNameChange, deleting, error, onCancel, onConfirm, onDeactivate,
}: {
  client: { id: string; full_name: string; status: string };
  blockers: string[] | null;
  checking: boolean;
  confirmName: string;
  onConfirmNameChange: (v: string) => void;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onDeactivate: () => void;
}) {
  const impact = blockers ?? [];
  const nameMatches = confirmName.trim().toLowerCase() === client.full_name.trim().toLowerCase();
  const canConfirm = !checking && nameMatches && !deleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="p-2 bg-red-50 rounded-xl"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
          <h3 className="text-base font-bold text-slate-800">Delete Client</h3>
          <button onClick={onCancel} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Counting linked records...
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600 leading-relaxed">
                You are about to permanently delete <span className="font-bold text-slate-800">'{client.full_name}'</span> and everything belonging to them. This cannot be undone.
              </p>

              {impact.length > 0 ? (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-red-800 mb-2">These records will be destroyed:</p>
                  <ul className="space-y-1">
                    {impact.map((b, i) => (
                      <li key={i} className="text-sm text-red-700 font-semibold">• {b}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  This client has no appointments, billing, consultations, consent forms, or treatment notes. Only the client record and profile will be removed.
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Type the client's full name to confirm</label>
                <input
                  value={confirmName}
                  onChange={e => onConfirmNameChange(e.target.value)}
                  placeholder={client.full_name}
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-all"
                />
              </div>

              {client.status === 'active' && (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Deactivating instead keeps all history and removes the client from future workflows.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
            Cancel
          </button>
          {client.status === 'active' && (
            <button onClick={onDeactivate} disabled={deleting}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl transition-colors disabled:opacity-40">
              Deactivate
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Delete Permanently</>}
          </button>
        </div>
      </div>
    </div>
  );
}
