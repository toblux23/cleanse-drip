import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, AlertCircle, Plus, Users, Calendar, Clock, MapPin, User, Stethoscope,
  Search, Check, ChevronsUpDown, UserPlus, ArrowLeft, ShieldCheck, HeartPulse,
  Contact, Activity, Cigarette, Wine, Dumbbell, Droplets, Cake, Baby, FileText,
  MessageSquarePlus, CheckCircle2, Tag, ChevronDown,
} from 'lucide-react';
import { supabase, type TeamMember, type ClientBooking, type Client, type ClientProfile, memberDisplayName, ROLES } from '../lib/supabase';
import { fetchActiveBufferMinutes, isWithinBuffer } from '../lib/bookingBuffer';
import { fetchActiveTimeSlots, fetchBookedSlots, type TimeSlot } from '../lib/bookingSlots';
import TimeSlotPicker from './TimeSlotPicker';

interface Branch {
  id: string;
  name: string;
}

interface ManualEntryModalProps {
  onClose: () => void;
  onSaved: () => void;
  editBooking?: ClientBooking | null;
}

const YES_NO_NA = ['Yes', 'No', 'N/A', 'Prefer not to say'];

const CONSULTATION_OPTION = { id: 'Consultation', label: 'Consultation', description: 'A comprehensive medical assessment to determine the most appropriate treatment plan.' };

interface CatalogCategory {
  id: string;
  name: string;
  items: { id: string; name: string; short_description: string | null }[];
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}
function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Inline Intake Form Types ─────────────────────────────────────────────────

interface IntakeFormData {
  full_name: string;
  email: string;
  phone: string;
  address: string;
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
  consent_given: boolean;
}

const EMPTY_INTAKE: IntakeFormData = {
  full_name: '', email: '', phone: '', address: '',
  date_of_birth: '', age: '', gender: '',
  emergency_contact_name: '', emergency_contact_relationship: '', emergency_contact_number: '',
  allergies: '', current_medications: '', pregnancy_breastfeeding: '',
  pre_existing_conditions: '', bleeding_disorders: '', family_history: '',
  weight: '', smoking_vaping: '', alcohol_consumption: '',
  exercise_frequency: '', water_intake: '', consent_given: false,
};

// ─── Reusable Form Primitives ──────────────────────────────────────────────────

function IntakeField({ label, value, onChange, placeholder, type = 'text', required = false }: {
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

function IntakeSelect({ label, value, onChange, options, placeholder }: {
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

function IntakeArea({ label, value, onChange, placeholder, rows = 2 }: {
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

function SectionLabel({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" /> {title}
    </p>
  );
}

function CatalogCategoryBlock({ category, selected, onToggle }: {
  category: CatalogCategory;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border-2 border-slate-200 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors">
        <span className="text-sm font-bold text-slate-700">{category.name}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-2 space-y-1.5">
          {category.items.map(item => {
            const checked = selected.includes(item.name);
            return (
              <button key={item.id} type="button" onClick={() => onToggle(item.name)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border-2 text-left transition-all ${
                  checked ? 'border-teal-500 bg-teal-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-teal-500 border-teal-500' : 'border-slate-300'
                }`}>
                  {checked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${checked ? 'text-teal-700' : 'text-slate-700'}`}>{item.name}</p>
                  {item.short_description && <p className="text-xs text-slate-400 truncate">{item.short_description}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Step = 'select' | 'existing' | 'intake' | 'schedule' | 'consultation_offer';

export default function ManualEntryModal({ onClose, onSaved, editBooking }: ManualEntryModalProps) {
  const isEdit = !!editBooking;
  const [step, setStep] = useState<Step>(isEdit ? 'schedule' : 'select');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [nurses, setNurses] = useState<TeamMember[]>([]);
  const [assistants, setAssistants] = useState<TeamMember[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolved client (from either flow)
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(editBooking?.client_id ?? null);
  const [resolvedClientName, setResolvedClientName] = useState(editBooking?.full_name ?? '');

  // Existing client search state
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // New client intake form state
  const [intake, setIntake] = useState<IntakeFormData>(EMPTY_INTAKE);

  // Booking schedule state
  const [preferredDate, setPreferredDate] = useState(editBooking?.preferred_date ?? '');
  const [preferredTime, setPreferredTime] = useState(editBooking?.preferred_time ?? '');
  const [branchId, setBranchId] = useState(editBooking?.branch_id ?? '');
  const [preferredLocation, setPreferredLocation] = useState(editBooking?.preferred_location ?? '');
  const [assignedNurseId, setAssignedNurseId] = useState(editBooking?.assigned_nurse_id ?? '');
  const [assignedAssistantId, setAssignedAssistantId] = useState(editBooking?.assigned_nurse_assistant_id ?? '');
  const [pax, setPax] = useState(editBooking?.pax ?? 1);
  const [selectedServices, setSelectedServices] = useState<string[]>(editBooking?.services_requested ?? []);

  // Slot availability state
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [bufferMinutes, setBufferMinutes] = useState(120);

  // Consultation offer state
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [consultationReason, setConsultationReason] = useState('');
  const [savingConsultation, setSavingConsultation] = useState(false);

  // Location combobox state
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  // Booking source tag
  const [bookingSources, setBookingSources] = useState<string[]>([]);
  const [bookingSource, setBookingSource] = useState(editBooking?.source ?? 'Manual Entry');
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);

  // ─── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('team_members').select('*').eq('status', 'approved').order('full_name', { ascending: true, nullsFirst: false }).order('email', { ascending: true }),
      supabase.from('clients').select('*').order('full_name', { ascending: true }),
    ]).then(([branchesRes, nursesRes, clientsRes]) => {
      if (cancelled) return;
      if (branchesRes.error) {
        setError('Failed to load branches: ' + branchesRes.error.message);
      } else {
        setBranches(branchesRes.data ?? []);
      }
      if (!nursesRes.error) {
        const allMembers = nursesRes.data ?? [];
        setNurses(allMembers);
        setAssistants(allMembers.filter(m => m.role === 'nurse_assistant'));
      }
      setAllClients((clientsRes.data ?? []) as Client[]);
      setLoadingBranches(false);
    }).catch(() => {
      if (cancelled) return;
      setError('Failed to load form data.');
      setLoadingBranches(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch configurable time slots and buffer on mount
  useEffect(() => {
    fetchActiveBufferMinutes().then(({ minutes }) => setBufferMinutes(minutes));
    fetchActiveTimeSlots().then(setTimeSlots);
  }, []);

  // Fetch active catalog categories with their active products/packages (same source as BookingForm)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: items, error } = await supabase
        .from('catalog_items')
        .select('id, name, short_description, category_id, catalog_categories!inner(id, name)')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (cancelled || error || !items) return;
      const byCategory = new Map<string, CatalogCategory>();
      for (const item of items) {
        const cat = item.catalog_categories as unknown as { id: string; name: string };
        if (!cat || !cat.id) continue;
        if (!byCategory.has(cat.id)) {
          byCategory.set(cat.id, { id: cat.id, name: cat.name, items: [] });
        }
        byCategory.get(cat.id)!.items.push({ id: item.id, name: item.name, short_description: item.short_description });
      }
      setCatalogCategories(Array.from(byCategory.values()));
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch booking source tags from qr_sources
  useEffect(() => {
    let cancelled = false;
    supabase.from('qr_sources').select('name').eq('is_active', true).order('name')
      .then(({ data }) => {
        if (cancelled || !data) return;
        const names = data.map((r: { name: string }) => r.name);
        setBookingSources(names.includes('Manual Entry') ? names : ['Manual Entry', ...names]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Close client dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Close location dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target as Node)) {
        setLocationDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Fetch booked slots when the selected date changes
  useEffect(() => {
    if (!preferredDate) { setBookedSlots(new Set()); return; }
    let cancelled = false;
    fetchBookedSlots(preferredDate).then(slots => {
      if (!cancelled) setBookedSlots(slots);
    });
    return () => { cancelled = true; };
  }, [preferredDate]);

  // ─── Existing client search ──────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return allClients.slice(0, 8);
    const q = clientSearch.toLowerCase();
    return allClients
      .filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [clientSearch, allClients]);

  function selectExistingClient(c: Client) {
    setSelectedClient(c);
    setClientSearch(c.full_name);
    setClientDropdownOpen(false);
    setResolvedClientId(c.id);
    setResolvedClientName(c.full_name);
  }

  function clearSelectedClient() {
    setSelectedClient(null);
    setClientSearch('');
    setResolvedClientId(null);
    setResolvedClientName('');
    setClientDropdownOpen(false);
  }

  // ─── New client intake helpers ───────────────────────────────────────────────

  function setIntakeField<K extends keyof IntakeFormData>(k: K, v: IntakeFormData[K]) {
    setIntake(prev => ({ ...prev, [k]: v }));
  }

  async function createNewClient(): Promise<{ clientId: string; clientName: string } | null> {
    if (!intake.full_name.trim()) {
      setError('Full name is required.');
      return null;
    }
    if (!intake.consent_given) {
      setError('Client consent is required to create a profile.');
      return null;
    }

    const clientPayload = {
      full_name: intake.full_name.trim(),
      email: intake.email.trim() || null,
      phone: intake.phone.trim() || null,
      address: intake.address.trim() || null,
      health_notes: null,
      status: 'active',
      updated_at: new Date().toISOString(),
    };

    const { data: clientData, error: clientErr } = await supabase
      .from('clients').insert(clientPayload).select('id').single();
    if (clientErr) { setError(clientErr.message); return null; }

    const profilePayload = {
      client_id: clientData.id,
      date_of_birth: intake.date_of_birth || null,
      age: intake.age ? parseInt(intake.age, 10) : null,
      gender: intake.gender || null,
      emergency_contact_name: intake.emergency_contact_name.trim() || null,
      emergency_contact_relationship: intake.emergency_contact_relationship.trim() || null,
      emergency_contact_number: intake.emergency_contact_number.trim() || null,
      allergies: intake.allergies.trim() || null,
      current_medications: intake.current_medications.trim() || null,
      pregnancy_breastfeeding: intake.pregnancy_breastfeeding || null,
      pre_existing_conditions: intake.pre_existing_conditions.trim() || null,
      bleeding_disorders: intake.bleeding_disorders.trim() || null,
      family_history: intake.family_history.split(',').map(s => s.trim()).filter(Boolean),
      weight: intake.weight.trim() || null,
      smoking_vaping: intake.smoking_vaping || null,
      alcohol_consumption: intake.alcohol_consumption || null,
      exercise_frequency: intake.exercise_frequency || null,
      water_intake: intake.water_intake || null,
      consent_given: intake.consent_given,
      consent_date: new Date().toISOString(),
    };

    const { error: profErr } = await supabase.from('client_profiles')
      .upsert(profilePayload, { onConflict: 'client_id' });
    if (profErr) { setError(profErr.message); return null; }

    return { clientId: clientData.id, clientName: intake.full_name.trim() };
  }

  // ─── Booking schedule helpers ────────────────────────────────────────────────

  function toggleService(id: string) {
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id],
    );
  }

  function onLocationChange(v: string) {
    setPreferredLocation(v);
    setBranchId('');
  }

  function selectBranch(b: Branch) {
    setBranchId(b.id);
    setPreferredLocation(b.name);
    setLocationDropdownOpen(false);
  }

  // ─── Step transitions ────────────────────────────────────────────────────────

  function proceedToSchedule() {
    setError(null);
    if (!resolvedClientId || !resolvedClientName.trim()) {
      setError('No client selected.');
      return;
    }
    setStep('schedule');
  }

  async function handleExistingContinue() {
    if (!selectedClient) {
      setError('Please select an existing client.');
      return;
    }
    proceedToSchedule();
  }

  async function handleIntakeContinue() {
    setError(null);
    setSaving(true);
    const result = await createNewClient();
    setSaving(false);
    if (result) {
      setResolvedClientId(result.clientId);
      setResolvedClientName(result.clientName);
      setStep('schedule');
    }
  }

  // ─── Save booking ─────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null);

    if (!resolvedClientId) { setError('No client linked.'); return; }
    if (!resolvedClientName.trim()) { setError('Client name is required.'); return; }
    if (!preferredDate) { setError('Preferred date is required.'); return; }
    if (!preferredTime) { setError('Preferred time is required.'); return; }
    if (selectedServices.length === 0) { setError('Select at least one service.'); return; }

    // Enforce booking lead-time buffer
    const { minutes: bufferMinutes } = await fetchActiveBufferMinutes();
    if (isWithinBuffer(preferredDate, preferredTime, bufferMinutes)) {
      const earliest = new Date(Date.now() + bufferMinutes * 60_000);
      setError(`This time is within the minimum booking buffer (${bufferMinutes} min). Earliest bookable: ${earliest.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`);
      return;
    }

    setSaving(true);

    try {
      if (isEdit && editBooking) {
        const { error: updateErr } = await supabase.from('client_bookings').update({
          preferred_date: preferredDate,
          preferred_time: preferredTime,
          branch_id: branchId || null,
          preferred_location: !branchId && preferredLocation.trim() ? preferredLocation.trim() : null,
          assigned_nurse_id: assignedNurseId || null,
          assigned_nurse_assistant_id: assignedAssistantId || null,
          pax,
          services_requested: selectedServices,
          source: bookingSource,
        }).eq('id', editBooking.id);

        if (updateErr) {
          setError(updateErr.message);
          return;
        }
        onSaved();
        onClose();
        return;
      }

      const { data: bookingData, error: insertErr } = await supabase.from('client_bookings').insert({
        client_id: resolvedClientId,
        full_name: resolvedClientName.trim(),
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        branch_id: branchId || null,
        preferred_location: !branchId && preferredLocation.trim() ? preferredLocation.trim() : null,
        assigned_nurse_id: assignedNurseId || null,
        assigned_nurse_assistant_id: assignedAssistantId || null,
        pax,
        services_requested: selectedServices,
        intake_form_status: resolvedClientId ? 'COMPLETED' : 'PENDING',
        status: 'NEW',
        source: bookingSource,
      }).select('id').single();

      if (insertErr) {
        setError(insertErr.message);
        return;
      }

      // Notify parent that a booking was saved (refreshes list) but keep modal open for consultation offer
      onSaved();
      setCreatedBookingId(bookingData.id);
      setStep('consultation_offer');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create booking.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateConsultation() {
    if (!resolvedClientId || !consultationReason.trim()) return;
    setSavingConsultation(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: cErr } = await supabase.from('consultation_requests').insert({
        client_id: resolvedClientId,
        booking_id: createdBookingId,
        requested_by: user?.id ?? null,
        reason: consultationReason.trim(),
        preferred_date: preferredDate || null,
        preferred_time: preferredTime || null,
        status: 'pending',
      });
      if (cErr) {
 setError(cErr.message); setSavingConsultation(false); return;
      }
      onClose();
    } catch {
      setError('Failed to create consultation request.');
      setSavingConsultation(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const stepTitle: Record<Step, string> = {
    select: 'New Booking',
    existing: 'Select Existing Client',
    intake: 'New Client Intake',
    schedule: isEdit ? 'Edit Booking' : 'Schedule Booking',
    consultation_offer: 'Consultation Offer',
  };
  const stepSubtitle: Record<Step, string> = {
    select: 'Choose client type to begin',
    existing: 'Search and select a registered client',
    intake: 'Capture required client details',
    schedule: isEdit ? 'Update date, time, and service details' : 'Set date, time, and service details',
    consultation_offer: 'Offer a doctor consultation to this client',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 sticky top-0 bg-white rounded-t-3xl z-10 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {step !== 'select' && step !== 'consultation_offer' && !isEdit && (
              <button
                onClick={() => {
                  setStep(step === 'schedule' ? (selectedClient ? 'existing' : 'intake') : 'select');
                  setError(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
            )}
            <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
              {step === 'select' ? <Plus className="w-5 h-5 text-teal-600" /> :
               step === 'existing' ? <Search className="w-5 h-5 text-teal-600" /> :
               step === 'intake' ? <UserPlus className="w-5 h-5 text-teal-600" /> :
               <Calendar className="w-5 h-5 text-teal-600" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{stepTitle[step]}</h2>
              <p className="text-xs text-slate-400">{stepSubtitle[step]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* ─── Step 1: Client Type Selection ─── */}
          {step === 'select' && (
            <div className="space-y-3">
              <button
                onClick={() => { setStep('existing'); setError(null); }}
                className="w-full flex items-center gap-4 p-5 border-2 border-slate-200 rounded-2xl hover:border-teal-400 hover:bg-teal-50/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-teal-100 transition-colors">
                  <Search className="w-6 h-6 text-teal-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Existing Client</p>
                  <p className="text-xs text-slate-400 mt-0.5">Search and select a registered client profile</p>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
              </button>

              <button
                onClick={() => { setStep('intake'); setError(null); }}
                className="w-full flex items-center gap-4 p-5 border-2 border-slate-200 rounded-2xl hover:border-teal-400 hover:bg-teal-50/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-teal-100 transition-colors">
                  <UserPlus className="w-6 h-6 text-teal-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">New Client</p>
                  <p className="text-xs text-slate-400 mt-0.5">Complete intake form to create a new client profile</p>
                </div>
                <ChevronsUpDown className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
              </button>
            </div>
          )}

          {/* ─── Step 2a: Existing Client Search ─── */}
          {step === 'existing' && (
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <User className="w-3.5 h-3.5" /> Search Client
                </label>
                <div className="relative" ref={clientDropdownRef}>
                  <div className="relative">
                    {selectedClient ? (
                      <Check className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-500" />
                    ) : (
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    )}
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setSelectedClient(null);
                        setClientDropdownOpen(true);
                      }}
                      onFocus={() => setClientDropdownOpen(true)}
                      placeholder="Search by name, email, or phone…"
                      className={`w-full pl-10 pr-10 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent ${
                        selectedClient ? 'border-teal-300 bg-teal-50/30' : 'border-slate-200'
                      }`}
                    />
                    {selectedClient && (
                      <button
                        onClick={clearSelectedClient}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {clientDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto z-20">
                      {filteredClients.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500">
                          {clientSearch.trim()
                            ? <span>No match found. Try a different search or go back and choose "New Client".</span>
                            : 'Start typing to search clients…'}
                        </div>
                      ) : (
                        filteredClients.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectExistingClient(c)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-teal-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                          >
                            <div className="w-7 h-7 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-teal-700 text-[10px] font-bold">
                                {c.full_name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-700 truncate">{c.full_name}</p>
                              <p className="text-xs text-slate-400 truncate">
                                {c.email || c.phone || 'No contact info'}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {selectedClient ? 'Existing client selected. Intake form will be skipped.' : 'Search to select an existing client.'}
                </p>
              </div>

              {selectedClient && (
                <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-teal-500" />
                    <p className="text-sm font-bold text-teal-700">Client Profile Loaded</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-400">Name:</span> <span className="font-semibold text-slate-700">{selectedClient.full_name}</span></div>
                    {selectedClient.email && <div><span className="text-slate-400">Email:</span> <span className="font-semibold text-slate-700">{selectedClient.email}</span></div>}
                    {selectedClient.phone && <div><span className="text-slate-400">Phone:</span> <span className="font-semibold text-slate-700">{selectedClient.phone}</span></div>}
                    <div><span className="text-slate-400">Status:</span> <span className="font-semibold text-slate-700 capitalize">{selectedClient.status}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2b: New Client Intake Form ─── */}
          {step === 'intake' && (
            <div className="space-y-5">
              <div>
                <SectionLabel icon={Users} title="Personal Details" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <IntakeField label="Full Name" required value={intake.full_name} onChange={v => setIntakeField('full_name', v)} placeholder="Juan dela Cruz" />
                  </div>
                  <IntakeField label="Date of Birth" type="date" value={intake.date_of_birth} onChange={v => setIntakeField('date_of_birth', v)} />
                  <IntakeField label="Age" type="number" value={intake.age} onChange={v => setIntakeField('age', v)} placeholder="35" />
                  <IntakeSelect label="Gender" value={intake.gender} onChange={v => setIntakeField('gender', v)} options={['Male', 'Female', 'Non-binary', 'Prefer not to say']} placeholder="Select gender" />
                </div>
              </div>

              <div>
                <SectionLabel icon={Contact} title="Contact Information" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <IntakeField label="Email" type="email" value={intake.email} onChange={v => setIntakeField('email', v)} placeholder="juan@example.com" />
                  <IntakeField label="Phone" type="tel" value={intake.phone} onChange={v => setIntakeField('phone', v)} placeholder="+63 912 345 6789" />
                  <div className="sm:col-span-2">
                    <IntakeField label="Address" value={intake.address} onChange={v => setIntakeField('address', v)} placeholder="123 Rizal Street, Quezon City" />
                  </div>
                </div>
              </div>

              <div>
                <SectionLabel icon={ShieldCheck} title="Emergency Contact" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <IntakeField label="Contact Person" value={intake.emergency_contact_name} onChange={v => setIntakeField('emergency_contact_name', v)} placeholder="Maria dela Cruz" />
                  <IntakeField label="Relationship" value={intake.emergency_contact_relationship} onChange={v => setIntakeField('emergency_contact_relationship', v)} placeholder="Spouse" />
                  <IntakeField label="Phone Number" type="tel" value={intake.emergency_contact_number} onChange={v => setIntakeField('emergency_contact_number', v)} placeholder="+63 912 345 6789" />
                </div>
              </div>

              <div>
                <SectionLabel icon={HeartPulse} title="Health Information" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <IntakeArea label="Allergies" value={intake.allergies} onChange={v => setIntakeField('allergies', v)} placeholder="Penicillin, shellfish…" />
                  <IntakeArea label="Current Medications" value={intake.current_medications} onChange={v => setIntakeField('current_medications', v)} placeholder="Metformin, Lisinopril…" />
                  <IntakeSelect label="Pregnancy / Breastfeeding" value={intake.pregnancy_breastfeeding} onChange={v => setIntakeField('pregnancy_breastfeeding', v)} options={YES_NO_NA} placeholder="Select status" />
                  <IntakeArea label="Pre-existing Conditions" value={intake.pre_existing_conditions} onChange={v => setIntakeField('pre_existing_conditions', v)} placeholder="Diabetes, hypertension…" />
                  <IntakeArea label="Bleeding Disorders" value={intake.bleeding_disorders} onChange={v => setIntakeField('bleeding_disorders', v)} placeholder="Hemophilia…" />
                  <IntakeField label="Family History" value={intake.family_history} onChange={v => setIntakeField('family_history', v)} placeholder="Heart disease, cancer (comma-separated)" />
                  <IntakeField label="Weight" value={intake.weight} onChange={v => setIntakeField('weight', v)} placeholder="65 kg" />
                </div>
              </div>

              <div>
                <SectionLabel icon={Activity} title="Lifestyle Information" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <IntakeSelect label="Smoking / Vaping" value={intake.smoking_vaping} onChange={v => setIntakeField('smoking_vaping', v)} options={YES_NO_NA} placeholder="Select" />
                  <IntakeSelect label="Alcohol Consumption" value={intake.alcohol_consumption} onChange={v => setIntakeField('alcohol_consumption', v)} options={['Never', 'Occasionally', 'Regularly', 'Daily', 'Prefer not to say']} placeholder="Select" />
                  <IntakeSelect label="Exercise Frequency" value={intake.exercise_frequency} onChange={v => setIntakeField('exercise_frequency', v)} options={['Never', 'Rarely', '1-2x/week', '3-4x/week', 'Daily']} placeholder="Select" />
                  <IntakeSelect label="Daily Water Intake" value={intake.water_intake} onChange={v => setIntakeField('water_intake', v)} options={['< 1L', '1-2L', '2-3L', '> 3L']} placeholder="Select" />
                </div>
              </div>

              <div>
                <SectionLabel icon={ShieldCheck} title="Consent" />
                <label className="flex items-start gap-3 cursor-pointer p-3 border-2 border-slate-200 rounded-xl hover:border-teal-300 transition-colors">
                  <input type="checkbox" checked={intake.consent_given} onChange={e => setIntakeField('consent_given', e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-400" />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    Client acknowledges that the information provided is accurate and consents to the treatment/procedure.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* ─── Step 3b: Consultation Offer ─── */}
          {step === 'consultation_offer' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-700">Booking created successfully</p>
                  <p className="text-xs text-emerald-600 mt-0.5">{resolvedClientName} — {formatDate(preferredDate)} at {formatTime(preferredTime)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border-2 border-teal-200 bg-teal-50/40 rounded-2xl">
                <Stethoscope className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-700">Would you like to offer a doctor consultation?</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    A consultation request will be created with status <span className="font-semibold">Pending</span>, linked to this client and booking. The doctor will review and respond from the Consultations tab.
                  </p>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <FileText className="w-3.5 h-3.5" /> Reason for Consultation
                </label>
                <textarea
                  value={consultationReason}
                  onChange={e => setConsultationReason(e.target.value)}
                  placeholder="Describe the reason for the doctor consultation…"
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {/* ─── Step 3: Schedule Booking ─── */}
          {step === 'schedule' && (
            <div className="space-y-5">
              {/* Resolved client banner */}
              <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-teal-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Booking for</p>
                  <p className="text-sm font-bold text-slate-700 truncate">{resolvedClientName}</p>
                </div>
              </div>

              {/* Date & Time */}
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Preferred Date
                  </label>
                  <input
                    type="date"
                    value={preferredDate}
                    onChange={e => setPreferredDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    <Clock className="w-3.5 h-3.5" /> Preferred Time
                  </label>
                  <TimeSlotPicker
                    value={preferredTime}
                    onChange={setPreferredTime}
                    selectedDate={preferredDate}
                    bufferMinutes={bufferMinutes}
                    bookedSlots={bookedSlots}
                    slots={timeSlots}
                  />
                </div>
              </div>

              {/* Preferred Location (editable combobox) & Pax */}
              <div className="grid grid-cols-[1fr_100px] gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Preferred Location
                  </label>
                  <div className="relative" ref={locationDropdownRef}>
                    <input
                      type="text"
                      value={preferredLocation}
                      onChange={e => onLocationChange(e.target.value)}
                      onFocus={() => setLocationDropdownOpen(true)}
                      disabled={loadingBranches}
                      placeholder="Select branch or type custom location…"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent disabled:opacity-60"
                    />
                    <ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    {locationDropdownOpen && !loadingBranches && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-20">
                        {branches.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-slate-500">No active branches. Type a custom location above.</div>
                        ) : (
                          branches.map(b => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => selectBranch(b)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-teal-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                            >
                              <MapPin className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                              <span className="text-sm font-medium text-slate-700">{b.name}</span>
                              {branchId === b.id && <Check className="w-4 h-4 text-teal-600 ml-auto" />}
                            </button>
                          ))
                        )}
                        {preferredLocation.trim() && !branches.some(b => b.name.toLowerCase() === preferredLocation.toLowerCase()) && (
                          <div className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100 bg-slate-50/50">
                            "<span className="font-semibold text-slate-600">{preferredLocation.trim()}</span>" will be saved as a custom location.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    <Users className="w-3.5 h-3.5" /> Pax
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={pax}
                    onChange={e => setPax(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Assign Nurse */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Stethoscope className="w-3.5 h-3.5" /> Assign Nurse
                </label>
                <select
                  value={assignedNurseId}
                  onChange={e => setAssignedNurseId(e.target.value)}
                  disabled={loadingBranches}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent bg-white disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {nurses.map(n => {
                    const name = memberDisplayName(n);
                    const roleLabel = ROLES.find(r => r.key === n.role)?.label ?? n.role;
                    const isFallback = !n.full_name || !n.full_name.trim();
                    return (
                      <option key={n.user_id} value={n.user_id}>
                        {isFallback ? name : `${name} — ${roleLabel}`}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Optionally assign a nurse to handle this booking.</p>
              </div>

              {/* Booking Source Tag */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Tag className="w-3.5 h-3.5" /> Booking Source
                </label>
                <select
                  value={bookingSource}
                  onChange={e => setBookingSource(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent bg-white"
                >
                  {bookingSources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Tag this booking with its source for attribution reporting.</p>
              </div>

              {/* Assign Nurse Assistant */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Users className="w-3.5 h-3.5" /> Assign Nurse Assistant
                </label>
                <select
                  value={assignedAssistantId}
                  onChange={e => setAssignedAssistantId(e.target.value)}
                  disabled={loadingBranches}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent bg-white disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {assistants.map(a => {
                    const name = memberDisplayName(a);
                    return (
                      <option key={a.user_id} value={a.user_id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Optionally assign a nurse assistant to support this booking.</p>
              </div>

              {/* Services (multi-select) */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  <Plus className="w-3.5 h-3.5" /> Preferred Service(s)
                </label>
                <div className="space-y-2">
                  {/* Consultation — always available, independent of catalog */}
                  <button
                    type="button"
                    onClick={() => toggleService(CONSULTATION_OPTION.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-left transition-all ${
                      selectedServices.includes(CONSULTATION_OPTION.id)
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedServices.includes(CONSULTATION_OPTION.id) ? 'bg-teal-500 border-teal-500' : 'border-slate-300'}`}>
                      {selectedServices.includes(CONSULTATION_OPTION.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${selectedServices.includes(CONSULTATION_OPTION.id) ? 'text-teal-700' : 'text-slate-700'}`}>{CONSULTATION_OPTION.label}</p>
                      <p className="text-xs text-slate-400 truncate">{CONSULTATION_OPTION.description}</p>
                    </div>
                  </button>

                  {/* Dynamic categories from Products & Packages */}
                  {catalogCategories.map(cat => (
                    <CatalogCategoryBlock key={cat.id} category={cat} selected={selectedServices} onToggle={toggleService} />
                  ))}

                  {catalogCategories.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">Loading available services…</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl px-3.5 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 sticky bottom-0 bg-white border-t border-slate-100 rounded-b-3xl">
          {step === 'select' ? (
            <button onClick={onClose}
              className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
              Cancel
            </button>
          ) : step === 'existing' ? (
            <>
              <button onClick={() => { setStep('select'); setError(null); }}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                Back
              </button>
              <button onClick={handleExistingContinue} disabled={!selectedClient}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                Continue to Schedule
              </button>
            </>
          ) : step === 'intake' ? (
            <>
              <button onClick={() => { setStep('select'); setError(null); }}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                Back
              </button>
              <button onClick={handleIntakeContinue} disabled={saving || !intake.full_name.trim() || !intake.consent_given}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {saving ? 'Creating Profile…' : 'Create & Continue'}
              </button>
            </>
          ) : step === 'consultation_offer' ? (
            <>
              <button onClick={onClose}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                Skip & Finish
              </button>
              <button onClick={handleCreateConsultation} disabled={savingConsultation || !consultationReason.trim()}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {savingConsultation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
                {savingConsultation ? 'Creating…' : 'Create Consultation'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => isEdit ? onClose() : setStep(selectedClient ? 'existing' : 'intake')}
                className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-2xl hover:bg-slate-50 transition-colors text-sm">
                {isEdit ? 'Cancel' : 'Back'}
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Booking'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
