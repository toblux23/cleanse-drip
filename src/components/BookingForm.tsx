import { useState, useEffect } from 'react';
import {
  CheckCircle,
  Calendar,
  Loader2,
  User,
  Droplets,
  Mail,
  MapPin,
  HeartPulse,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  Activity,
  ShieldCheck,
  FlaskConical,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchActiveBufferMinutes, isWithinBuffer } from '../lib/bookingBuffer';
import { fetchActiveTimeSlots, fetchBookedSlots, type TimeSlot } from '../lib/bookingSlots';
import TimeSlotPicker from './TimeSlotPicker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step1 {
  email: string;
  full_name: string;
  appointment_date: string;
  appointment_time: string;
  address: string;
  phone: string;
  age: string;
  birthday: string;
  gender: string;
}

interface Step2 {
  emergency_name: string;
  emergency_phone: string;
  weight: string;
  pregnant: string;
  pre_existing: string;
  pre_existing_detail: string;
  family_history: string[];
  medications: string;
  medications_detail: string;
  allergies: string;
  allergies_detail: string;
  bleeding: string;
}

interface Step3 {
  water_intake: string;
  exercise: string;
  alcohol: string;
  smoking: string;
  services: string[];
}

const INIT_S1: Step1 = {
  email: '', full_name: '', appointment_date: '', appointment_time: '',
  address: '', phone: '', age: '', birthday: '', gender: '',
};

const INIT_S2: Step2 = {
  emergency_name: '', emergency_phone: '', weight: '',
  pregnant: '', pre_existing: '', pre_existing_detail: '',
  family_history: [], medications: '', medications_detail: '',
  allergies: '', allergies_detail: '', bleeding: '',
};

const INIT_S3: Step3 = { water_intake: '', exercise: '', alcohol: '', smoking: '', services: [] };

const FAMILY_HISTORY_OPTIONS = [
  'Cancer', 'Cardiovascular Disease', 'Stroke', 'Diabetes Mellitus',
  'Thyroid Disorder', 'Asthma', 'Kidney Disease', 'Autoimmune Disorder',
  'Liver Disease', 'Obesity', 'NONE',
];

const CONSENT_ITEMS = [
  'I understand that results vary and multiple sessions may be recommended.',
  'I understand possible temporary side effects such as bruising, dizziness, nausea, or injection site discomfort.',
  'I confirm that I have disclosed all relevant medical history and current medications.',
  'I agree to inform the provider immediately if I experience discomfort during treatment.',
  'I agree to follow all pre-treatment and post-treatment instructions.',
  'I understand that this treatment is not intended to diagnose, treat, cure, or prevent medical conditions.',
  'I understand that results are not guaranteed.',
  'I voluntarily consent to receive IV Drip Therapy.',
];

// ─── Shared UI components ─────────────────────────────────────────────────────

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="flex items-center gap-1 text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
      {children}
      {!optional && <span className="text-red-500 normal-case tracking-normal font-bold ml-0.5">*</span>}
      {optional && <span className="text-slate-400 normal-case tracking-normal font-normal ml-1 text-[10px]">(optional)</span>}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text', required = true,
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <input
      type={type} required={required} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full border-0 border-b-2 border-slate-200 focus:border-teal-500 outline-none py-2.5 text-slate-800 placeholder-slate-300 bg-transparent transition-colors text-sm"
    />
  );
}

function SectionLabel({ icon: Icon, text, color = 'teal' }: { icon: React.ElementType; text: string; color?: 'teal' | 'rose' | 'violet' | 'cyan' | 'amber' }) {
  const colors = {
    teal: 'bg-teal-50 text-teal-600 text-teal-700',
    rose: 'bg-rose-50 text-rose-500 text-rose-700',
    violet: 'bg-violet-50 text-violet-600 text-violet-700',
    cyan: 'bg-cyan-50 text-cyan-600 text-cyan-700',
    amber: 'bg-amber-50 text-amber-600 text-amber-700',
  };
  const [bg, iconColor, labelColor] = colors[color].split(' ');
  return (
    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
      <div className={`w-7 h-7 ${bg} rounded-lg flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <span className={`text-xs font-bold tracking-widest ${labelColor} uppercase`}>{text}</span>
    </div>
  );
}

function RadioGroup<T extends string>({
  value, options, onChange, cols = 1,
}: { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void; cols?: number }) {
  return (
    <div className={`grid gap-2.5 ${cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
      {options.map(opt => {
        const sel = value === opt.value;
        return (
          <label key={opt.value} onClick={() => onChange(opt.value)}
            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${sel ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'border-teal-500 bg-teal-500' : 'border-slate-300'}`}>
              {sel && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <span className={`text-sm font-semibold ${sel ? 'text-teal-700' : 'text-slate-600'}`}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function YesNoSpecify({ value, details, onChange, onDetails, required = true }: {
  value: string; details: string; onChange: (v: string) => void;
  onDetails: (v: string) => void; required?: boolean;
}) {
  const needsDetail = value === 'Yes' || value === 'Other';
  return (
    <div className="space-y-3">
      <RadioGroup<string>
        value={value}
        options={[
          { label: 'No', value: 'No' },
          { label: 'Yes (please specify)', value: 'Yes' },
          { label: 'Other (please specify)', value: 'Other' },
        ]}
        onChange={onChange}
        cols={1}
      />
      {needsDetail && (
        <div className="ml-8">
          <input
            type="text"
            required={required && needsDetail}
            value={details}
            placeholder="Please specify..."
            onChange={e => onDetails(e.target.value)}
            className="w-full border-0 border-b-2 border-teal-300 focus:border-teal-500 outline-none py-2 text-slate-700 placeholder-slate-400 bg-transparent transition-colors text-sm"
          />
        </div>
      )}
    </div>
  );
}

function CheckboxGroup({
  selected, options, onChange,
}: { selected: string[]; options: string[]; onChange: (v: string[]) => void }) {
  function toggle(opt: string) {
    if (opt === 'NONE') {
      onChange(selected.includes('NONE') ? [] : ['NONE']);
      return;
    }
    const without = selected.filter(s => s !== 'NONE');
    onChange(without.includes(opt) ? without.filter(s => s !== opt) : [...without, opt]);
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {options.map(opt => {
        const checked = selected.includes(opt);
        return (
          <label key={opt} onClick={() => toggle(opt)}
            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'border-teal-500 bg-teal-500' : 'border-slate-300'}`}>
              {checked && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-semibold ${checked ? 'text-teal-700' : 'text-slate-600'}`}>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

interface BookingOption {
  id: string;
  label: string;
  description?: string;
}

function ServiceCard({ service, checked, onChange }: {
  service: BookingOption; checked: boolean; onChange: () => void;
}) {
  return (
    <label onClick={onChange}
      className={`flex gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all group ${checked ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'}`}>
      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${checked ? 'border-teal-500 bg-teal-500' : 'border-slate-300 group-hover:border-teal-400'}`}>
        {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold mb-1 ${checked ? 'text-teal-800' : 'text-slate-800'}`}>{service.label}</p>
        {service.description && (
          <p className={`text-xs leading-relaxed ${checked ? 'text-teal-700' : 'text-slate-500'}`}>{service.description}</p>
        )}
      </div>
    </label>
  );
}

interface CatalogCategory {
  id: string;
  name: string;
  description: string | null;
  items: { id: string; name: string; short_description: string | null }[];
}

const CONSULTATION_OPTION: BookingOption = {
  id: 'Consultation',
  label: 'Consultation',
  description: 'A comprehensive medical assessment to determine the most appropriate treatment plan based on your individual needs.',
};

function CategorySection({ category, selected, onToggle }: {
  category: CatalogCategory;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border-2 border-slate-200 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-800">{category.name}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-3 space-y-2.5">
          {category.items.map(item => {
            const opt: BookingOption = { id: item.name, label: item.name, description: item.short_description ?? undefined };
            const checked = selected.includes(item.name);
            return (
              <label key={item.id} onClick={() => onToggle(item.name)}
                className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:border-teal-200 hover:bg-slate-50'}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${checked ? 'border-teal-500 bg-teal-500' : 'border-slate-300'}`}>
                  {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${checked ? 'text-teal-800' : 'text-slate-700'}`}>{item.name}</p>
                  {item.short_description && (
                    <p className={`text-xs leading-relaxed mt-0.5 ${checked ? 'text-teal-600' : 'text-slate-400'}`}>{item.short_description}</p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Personal Info', 'Health Disclosure', 'Lifestyle & Services', 'Consent'];

function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="flex items-center">
      {([1, 2, 3, 4] as const).map((n, i) => {
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center flex-1 min-w-0">
            <div className={`flex flex-col items-center flex-shrink-0 ${active ? '' : done ? 'opacity-80' : 'opacity-40'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${active ? 'bg-teal-600 text-white shadow-md' : done ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'}`}>
                {done ? <CheckCircle className="w-4 h-4" /> : n}
              </div>
              <span className={`text-[10px] font-semibold mt-1 text-center hidden sm:block leading-tight ${active ? 'text-teal-700' : done ? 'text-teal-600' : 'text-slate-400'}`}>
                {STEP_LABELS[n - 1]}
              </span>
            </div>
            {i < 3 && <div className={`flex-1 h-0.5 mx-2 mb-4 sm:mb-0 transition-all ${done ? 'bg-teal-300' : 'bg-slate-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BookingForm() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [s1, setS1] = useState<Step1>(INIT_S1);
  const [s2, setS2] = useState<Step2>(INIT_S2);
  const [s3, setS3] = useState<Step3>(INIT_S3);
  const [consent, setConsent] = useState<boolean[]>(Array(CONSENT_ITEMS.length).fill(false));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bufferMinutes, setBufferMinutes] = useState(120);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);

  // Read source tag from URL: /?src=Branch+Name
  const urlSource = new URLSearchParams(window.location.search).get('src') ?? null;

  // Fetch the active booking lead-time buffer and configurable time slots on mount
  useEffect(() => {
    fetchActiveBufferMinutes().then(({ minutes }) => setBufferMinutes(minutes));
    fetchActiveTimeSlots().then(setTimeSlots);
  }, []);

  // Fetch active catalog categories with their active products/packages from Products & Packages
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: items, error } = await supabase
        .from('catalog_items')
        .select('id, name, short_description, category_id, catalog_categories!inner(id, name, description)')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (cancelled || error || !items) return;

      const byCategory = new Map<string, CatalogCategory>();
      for (const item of items) {
        const cat = item.catalog_categories as unknown as { id: string; name: string; description: string | null };
        if (!cat || !cat.id) continue;
        if (!byCategory.has(cat.id)) {
          byCategory.set(cat.id, { id: cat.id, name: cat.name, description: cat.description, items: [] });
        }
        byCategory.get(cat.id)!.items.push({
          id: item.id,
          name: item.name,
          short_description: item.short_description,
        });
      }
      setCatalogCategories(Array.from(byCategory.values()));
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch booked slots for the selected date so the time grid can show them
  useEffect(() => {
    if (!s1.appointment_date) { setBookedSlots(new Set()); return; }
    let cancelled = false;
    fetchBookedSlots(s1.appointment_date).then(slots => {
      if (!cancelled) setBookedSlots(slots);
    });
    return () => { cancelled = true; };
  }, [s1.appointment_date]);

  function up1<K extends keyof Step1>(k: K, v: Step1[K]) { setS1(p => ({ ...p, [k]: v })); }
  function up2<K extends keyof Step2>(k: K, v: Step2[K]) { setS2(p => ({ ...p, [k]: v })); }
  function up3<K extends keyof Step3>(k: K, v: Step3[K]) { setS3(p => ({ ...p, [k]: v })); }

  function goNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (step === 1) {
      if (!s1.gender) { setError('Please select your gender.'); return; }
      if (!s1.appointment_date || !s1.appointment_time) { setError('Please select your appointment date and time.'); return; }
      if (isWithinBuffer(s1.appointment_date, s1.appointment_time, bufferMinutes)) {
        const earliest = new Date(Date.now() + bufferMinutes * 60_000);
        setError(`This time slot is within the minimum booking buffer. Please choose a time on or after ${earliest.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}.`);
        return;
      }
    }
    if (step === 2) {
      if (!s2.pregnant) { setError('Please answer the pregnancy/breastfeeding question.'); return; }
      if (!s2.pre_existing) { setError('Please answer the pre-existing condition question.'); return; }
      if ((s2.pre_existing === 'Yes' || s2.pre_existing === 'Other') && !s2.pre_existing_detail.trim()) {
        setError('Please specify your pre-existing condition.'); return;
      }
      if (s2.family_history.length === 0) { setError('Please select at least one option for family history.'); return; }
      if (!s2.medications) { setError('Please answer the medications question.'); return; }
      if ((s2.medications === 'Yes' || s2.medications === 'Other') && !s2.medications_detail.trim()) {
        setError('Please specify your medications.'); return;
      }
      if (!s2.allergies) { setError('Please answer the allergies question.'); return; }
      if ((s2.allergies === 'Yes' || s2.allergies === 'Other') && !s2.allergies_detail.trim()) {
        setError('Please specify your allergies.'); return;
      }
      if (!s2.bleeding) { setError('Please answer the bleeding disorders question.'); return; }
    }
    if (step === 3) {
      if (!s3.exercise) { setError('Please select your exercise frequency.'); return; }
      if (!s3.alcohol) { setError('Please select your alcohol consumption.'); return; }
      if (!s3.smoking) { setError('Please answer the smoking/vaping question.'); return; }
      if (s3.services.length === 0) { setError('Please select at least one service.'); return; }
    }
    setStep((step + 1) as 1 | 2 | 3 | 4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const allConsented = consent.every(Boolean);
    if (!allConsented) {
      setError('Please check all consent boxes to proceed.');
      return;
    }
    setSubmitting(true);

    function combineYesNoSpecify(val: string, detail: string): string {
      if (val === 'Yes' || val === 'Other') return `${val}: ${detail}`;
      return val;
    }

    const payload = {
      email: s1.email.trim(),
      full_name: s1.full_name.trim(),
      preferred_date: s1.appointment_date,
      preferred_time: s1.appointment_time,
      address: s1.address.trim(),
      cellphone: s1.phone.trim(),
      age: s1.age ? parseInt(s1.age, 10) : null,
      date_of_birth: s1.birthday || null,
      gender: s1.gender,
      emergency_contact_name: s2.emergency_name.trim(),
      emergency_contact_number: s2.emergency_phone.trim(),
      weight: s2.weight.trim() || null,
      is_pregnant_breastfeeding: s2.pregnant,
      pre_existing_condition: combineYesNoSpecify(s2.pre_existing, s2.pre_existing_detail),
      family_history: s2.family_history,
      taking_medications: combineYesNoSpecify(s2.medications, s2.medications_detail),
      has_allergies: combineYesNoSpecify(s2.allergies, s2.allergies_detail),
      bleeding_disorders: s2.bleeding,
      water_intake: s3.water_intake || null,
      exercise_frequency: s3.exercise,
      alcohol_consumption: s3.alcohol,
      smoking_vaping: s3.smoking,
      services_requested: s3.services,
      consent_given: true,
      source: urlSource,
      intake_form_status: 'COMPLETED' as const,
    };

    // Resolve or create a client record so the intake appears in Client Management.
    // This runs as the anon role, which has no read access to clients or
    // client_profiles — both hold medical data. The duplicate check (email →
    // phone), the client insert and the profile write therefore happen inside
    // intake_upsert_client_and_profile, a SECURITY DEFINER function that returns
    // only the client id. Same order and same payload as before; an existing
    // client is matched and its profile left untouched.
    const email = s1.email.trim();
    const phone = s1.phone.trim();

    console.log('[Intake] Step: Resolve client', { email, phone });
    const { data: resolvedClientId, error: clientErr } = await supabase.rpc(
      'intake_upsert_client_and_profile',
      {
        p_client: {
          full_name: s1.full_name.trim(),
          email: email || null,
          phone: phone || null,
          address: s1.address.trim() || null,
        },
        p_profile: {
          date_of_birth: s1.birthday || null,
          age: s1.age ? parseInt(s1.age, 10) : null,
          gender: s1.gender || null,
          emergency_contact_name: s2.emergency_name.trim() || null,
          emergency_contact_number: s2.emergency_phone.trim() || null,
          allergies: combineYesNoSpecify(s2.allergies, s2.allergies_detail) || null,
          current_medications: combineYesNoSpecify(s2.medications, s2.medications_detail) || null,
          pregnancy_breastfeeding: s2.pregnant || null,
          pre_existing_conditions: combineYesNoSpecify(s2.pre_existing, s2.pre_existing_detail) || null,
          bleeding_disorders: s2.bleeding || null,
          family_history: s2.family_history,
          weight: s2.weight.trim() || null,
          smoking_vaping: s3.smoking || null,
          alcohol_consumption: s3.alcohol || null,
          exercise_frequency: s3.exercise || null,
          water_intake: s3.water_intake || null,
          consent_given: true,
          consent_date: new Date().toISOString(),
        },
      },
    );

    if (clientErr || !resolvedClientId) {
      console.error('[Intake] Client resolve failed:', clientErr);
      setSubmitting(false);
      setError('Something went wrong. Please try again.');
      return;
    }

    const clientId: string = resolvedClientId as string;
    console.log('[Intake] Client resolved:', { clientId });

    console.log('[Intake] Step: Booking insert', { clientId });
    const { error: dbError } = await supabase.from('client_bookings').insert({ ...payload, client_id: clientId });
    setSubmitting(false);
    if (dbError) {
      console.error('[Intake] Booking insert failed:', dbError);
      setError('Something went wrong. Please try again.');
      return;
    }
    console.log('[Intake] Booking insert success');

    // Fire-and-forget email notification
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'booking', data: payload }),
      },
    ).catch(() => {});

    setSubmitted(true);
  }

  function reset() {
    setS1(INIT_S1); setS2(INIT_S2); setS3(INIT_S3);
    setConsent(Array(CONSENT_ITEMS.length).fill(false));
    setStep(1); setSubmitted(false); setError(null);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Booking Submitted!</h2>
          <p className="text-slate-500 mb-2 leading-relaxed">
            Thank you, <span className="font-semibold text-slate-700">{s1.full_name}</span>.
          </p>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            Your appointment request and intake form have been received. Our team will confirm your schedule shortly.
          </p>
          <button onClick={reset} className="w-full py-3 px-6 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors">
            Submit Another Booking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20 py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 mb-6 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 via-cyan-400 to-teal-500" />
          <div className="flex items-start gap-4 mt-2">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-teal-600 uppercase mb-1">Cleanse & Drip Booking Engine v1.0</p>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">Client Intake Form</h1>
              <p className="text-slate-500 mt-1.5 text-sm leading-relaxed">
                Please complete this form before your appointment. All information provided will remain confidential and will be used to help ensure your safety and suitability for treatment.
              </p>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-red-500 font-medium">* Indicates required field</p>
            {urlSource && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-200 rounded-xl text-xs font-bold text-teal-700">
                <MapPin className="w-3.5 h-3.5" />
                {urlSource}
              </span>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 px-7 py-5 mb-6">
          <StepIndicator current={step} />
        </div>

        {/* ── STEP 1: Personal Information ──────────────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={goNext} className="space-y-5">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={Mail} text="Contact" />
              <div className="space-y-6">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <TextInput type="email" value={s1.email} onChange={v => up1('email', v)} placeholder="your@email.com" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={User} text="Personal Information" />
              <div className="space-y-6">
                <div>
                  <FieldLabel>Full Name</FieldLabel>
                  <TextInput value={s1.full_name} onChange={v => up1('full_name', v)} placeholder="Last name, First name, Middle name" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                  <div>
                    <FieldLabel>Age</FieldLabel>
                    <TextInput type="number" value={s1.age} onChange={v => up1('age', v)} placeholder="e.g. 28" />
                  </div>
                  <div>
                    <FieldLabel optional>Birthday</FieldLabel>
                    <input type="date" value={s1.birthday} max={new Date().toISOString().split('T')[0]}
                      onChange={e => up1('birthday', e.target.value)}
                      className="w-full border-0 border-b-2 border-slate-200 focus:border-teal-500 outline-none py-2.5 text-slate-700 bg-transparent transition-colors text-sm" />
                  </div>
                </div>
                <div>
                  <FieldLabel>Gender</FieldLabel>
                  <RadioGroup<string>
                    value={s1.gender}
                    options={[
                      { label: 'Male', value: 'Male' },
                      { label: 'Female', value: 'Female' },
                      { label: 'Prefer not to say', value: 'Prefer not to say' },
                    ]}
                    onChange={v => up1('gender', v)}
                    cols={3}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={MapPin} text="Address & Contact" color="cyan" />
              <div className="space-y-6">
                <div>
                  <FieldLabel>Address</FieldLabel>
                  <TextInput value={s1.address} onChange={v => up1('address', v)} placeholder="Street, Barangay, City, Province" />
                </div>
                <div>
                  <FieldLabel>Phone Number</FieldLabel>
                  <TextInput type="tel" value={s1.phone} onChange={v => up1('phone', v)} placeholder="+63 9XX XXX XXXX" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={Calendar} text="Appointment" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <FieldLabel>Preferred Date</FieldLabel>
                  <input type="date" required value={s1.appointment_date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => up1('appointment_date', e.target.value)}
                    className="w-full border-0 border-b-2 border-slate-200 focus:border-teal-500 outline-none py-2.5 text-slate-700 bg-transparent transition-colors text-sm" />
                </div>
                <div>
                  <FieldLabel>Preferred Time</FieldLabel>
                  <TimeSlotPicker value={s1.appointment_time} onChange={v => up1('appointment_time', v)} selectedDate={s1.appointment_date} bufferMinutes={bufferMinutes} bookedSlots={bookedSlots} slots={timeSlots} />
                </div>
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">{error}</div>}

            <div className="pb-6">
              <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                Next: Health Disclosure <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2: Emergency Contact + Medical & Health Disclosure ────────────── */}
        {step === 2 && (
          <form onSubmit={goNext} className="space-y-5">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={HeartPulse} text="Emergency Contact" color="rose" />
              <div className="space-y-6">
                <div>
                  <FieldLabel>Emergency Contact Name</FieldLabel>
                  <TextInput value={s2.emergency_name} onChange={v => up2('emergency_name', v)} placeholder="Full name" />
                </div>
                <div>
                  <FieldLabel>Phone Number</FieldLabel>
                  <TextInput type="tel" value={s2.emergency_phone} onChange={v => up2('emergency_phone', v)} placeholder="+63 9XX XXX XXXX" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={FlaskConical} text="Medical & Health Disclosure" color="violet" />
              <div className="space-y-8">
                <div>
                  <FieldLabel optional>Weight</FieldLabel>
                  <TextInput value={s2.weight} onChange={v => up2('weight', v)} placeholder="e.g. 65 kg" required={false} />
                </div>

                <div>
                  <FieldLabel>Are you pregnant or breastfeeding?</FieldLabel>
                  <RadioGroup<string>
                    value={s2.pregnant}
                    options={[{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }]}
                    onChange={v => up2('pregnant', v)}
                    cols={2}
                  />
                </div>

                <div>
                  <FieldLabel>Do you have a pre-existing medical condition?</FieldLabel>
                  <YesNoSpecify value={s2.pre_existing} details={s2.pre_existing_detail}
                    onChange={v => up2('pre_existing', v)} onDetails={v => up2('pre_existing_detail', v)} />
                </div>

                <div>
                  <FieldLabel>Do you have a family history of? (check all that apply)</FieldLabel>
                  <CheckboxGroup selected={s2.family_history} options={FAMILY_HISTORY_OPTIONS}
                    onChange={v => up2('family_history', v)} />
                </div>

                <div>
                  <FieldLabel>Are you taking any medication or supplements?</FieldLabel>
                  <YesNoSpecify value={s2.medications} details={s2.medications_detail}
                    onChange={v => up2('medications', v)} onDetails={v => up2('medications_detail', v)} />
                </div>

                <div>
                  <FieldLabel>Do you have any allergies to food or medicines?</FieldLabel>
                  <YesNoSpecify value={s2.allergies} details={s2.allergies_detail}
                    onChange={v => up2('allergies', v)} onDetails={v => up2('allergies_detail', v)} />
                </div>

                <div>
                  <FieldLabel>Do you have any bleeding disorders or take any blood thinners?</FieldLabel>
                  <RadioGroup<string>
                    value={s2.bleeding}
                    options={[{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }]}
                    onChange={v => up2('bleeding', v)}
                    cols={2}
                  />
                </div>
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">{error}</div>}

            <div className="flex items-center gap-4 pb-6">
              <button type="button" onClick={() => { setStep(1); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex items-center gap-2 px-6 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                Next: Lifestyle & Services <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 3: Lifestyle + Services ──────────────────────────────────────── */}
        {step === 3 && (
          <form onSubmit={goNext} className="space-y-5">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={Activity} text="Lifestyle" color="cyan" />
              <div className="space-y-8">
                <div>
                  <FieldLabel optional>Water intake per day</FieldLabel>
                  <RadioGroup<string>
                    value={s3.water_intake}
                    options={[
                      { label: 'Less than 1L', value: 'Less than 1L' },
                      { label: '1–2L', value: '1-2L' },
                      { label: 'More than 2L', value: 'More than 2L' },
                    ]}
                    onChange={v => up3('water_intake', v)}
                    cols={3}
                  />
                </div>

                <div>
                  <FieldLabel>Exercise Frequency</FieldLabel>
                  <RadioGroup<string>
                    value={s3.exercise}
                    options={[
                      { label: 'None', value: 'None' },
                      { label: '1–2x a week', value: '1-2x a week' },
                      { label: '3–5x a week', value: '3-5x a week' },
                      { label: 'Daily', value: 'Daily' },
                    ]}
                    onChange={v => up3('exercise', v)}
                    cols={2}
                  />
                </div>

                <div>
                  <FieldLabel>Alcohol Consumption</FieldLabel>
                  <RadioGroup<string>
                    value={s3.alcohol}
                    options={[
                      { label: 'Never', value: 'Never' },
                      { label: 'Occasionally', value: 'Occasionally' },
                      { label: 'Frequently', value: 'Frequently' },
                    ]}
                    onChange={v => up3('alcohol', v)}
                    cols={3}
                  />
                </div>

                <div>
                  <FieldLabel>Smoking or Vaping</FieldLabel>
                  <RadioGroup<string>
                    value={s3.smoking}
                    options={[{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }]}
                    onChange={v => up3('smoking', v)}
                    cols={2}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={Stethoscope} text="Service Requested" />
              <p className="text-xs text-slate-400 mb-4 -mt-2">Select all services that apply. <span className="text-red-500">*</span></p>
              <div className="space-y-3">
                <ServiceCard service={CONSULTATION_OPTION}
                  checked={s3.services.includes(CONSULTATION_OPTION.id)}
                  onChange={() => up3('services', s3.services.includes(CONSULTATION_OPTION.id) ? s3.services.filter(s => s !== CONSULTATION_OPTION.id) : [...s3.services, CONSULTATION_OPTION.id])}
                />
                {catalogCategories.map(cat => (
                  <CategorySection key={cat.id} category={cat} selected={s3.services}
                    onToggle={(id) => up3('services', s3.services.includes(id) ? s3.services.filter(s => s !== id) : [...s3.services, id])}
                  />
                ))}
                {catalogCategories.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">Loading available services...</p>
                )}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">{error}</div>}

            <div className="flex items-center gap-4 pb-6">
              <button type="button" onClick={() => { setStep(2); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex items-center gap-2 px-6 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm">
                Next: Consent <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 4: Consent ────────────────────────────────────────────────────── */}
        {step === 4 && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
              <SectionLabel icon={AlertTriangle} text="Treatment Information & Consent" color="amber" />
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 mb-6">
                <p className="text-sm text-slate-700 leading-relaxed mb-3">
                  <strong>IV Drip Therapy</strong> is a wellness treatment that delivers glutathione and other vitamins or antioxidants directly into the bloodstream through an intravenous infusion. It is commonly used to support antioxidant levels, improve overall wellness, and promote brighter-looking skin.
                </p>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Temporary side effects may include mild discomfort at the injection site, bruising, dizziness, or nausea. Results may vary between individuals, and multiple sessions may be recommended depending on treatment goals and individual response.
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">
                  Please check all boxes below <span className="text-red-500">*</span>
                </p>
                <div className="space-y-3">
                  {CONSENT_ITEMS.map((item, i) => {
                    const checked = consent[i];
                    return (
                      <label key={i} onClick={() => setConsent(prev => prev.map((v, j) => j === i ? !v : v))}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${checked ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-200 hover:bg-slate-50'}`}>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${checked ? 'border-teal-500 bg-teal-500' : 'border-slate-300'}`}>
                          {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span className={`text-sm leading-relaxed ${checked ? 'text-teal-800 font-medium' : 'text-slate-600'}`}>{item}</span>
                      </label>
                    );
                  })}
                </div>

                {consent.every(Boolean) && (
                  <div className="mt-4 flex items-center gap-2 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-semibold">All consent items acknowledged.</span>
                  </div>
                )}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">{error}</div>}

            <div className="flex items-center gap-4 pb-6">
              <button type="button" onClick={() => { setStep(3); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex items-center gap-2 px-6 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button type="submit" disabled={submitting || !consent.every(Boolean)}
                className="flex items-center gap-2 px-8 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Submitting...' : 'Submit Intake Form'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
