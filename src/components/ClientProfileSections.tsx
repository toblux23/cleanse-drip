import { useState } from 'react';
import {
  Users, Contact, ShieldCheck, HeartPulse, Activity, ClipboardList, StickyNote,
  Mail, Phone, MapPin, Cake, User, Calendar, CheckCircle, X, AlertTriangle,
  Stethoscope, Baby, Cigarette, Wine, Dumbbell, Droplets, FileText,
  ChevronDown, ChevronRight, FileCheck,
} from 'lucide-react';
import type { UnifiedClientProfile } from '../lib/clientProfile';

function isRiskValue(v?: string | null): boolean {
  if (!v?.trim()) return false;
  const lower = v.trim().toLowerCase();
  return !['none', 'no', 'n/a', 'na', 'nil', 'none reported', 'nothing', 'none.'].includes(lower);
}

function DetailField({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  const hasValue = value?.trim();
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className={`text-sm font-semibold ${hasValue ? 'text-slate-800' : 'text-slate-300 italic'}`}>
          {hasValue ? value : 'Not provided'}
        </p>
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

// ---- Compact variant primitives -------------------------------------------

function CompactCard({ title, icon: Icon, children, className = '' }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 ${className}`}>
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      </div>
      {children}
    </div>
  );
}

function CompactRow({ icon: Icon, label, value, badge = false }: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
  badge?: boolean;
}) {
  const hasValue = value?.trim();
  if (badge) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-slate-400" /> {label}
        </span>
        {hasValue ? (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{value}</span>
        ) : (
          <span className="text-[11px] text-slate-300 italic">N/A</span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 font-medium leading-tight">{label}</p>
        <p className={`text-[13px] font-semibold leading-tight mt-0.5 ${hasValue ? 'text-slate-800' : 'text-slate-300 italic'}`}>
          {hasValue ? value : 'Not provided'}
        </p>
      </div>
    </div>
  );
}

function CompactHealthRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | null }) {
  const hasValue = value?.trim();
  const hasRisk = isRiskValue(value);
  if (!hasValue) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-slate-400" /> {label}
        </span>
        <span className="text-[11px] text-slate-300 italic">N/A</span>
      </div>
    );
  }
  if (!hasRisk) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-slate-400" /> {label}
        </span>
        <span className="text-[11px] font-semibold text-slate-600 truncate text-right">{value}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-rose-50 border-rose-200 px-2 py-1.5">
      <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-rose-500" /> {label}
      </span>
      <span className="text-[11px] font-semibold text-rose-600 truncate text-right">{value}</span>
    </div>
  );
}

function DisclosureGroup({ title, icon: Icon, children, defaultOpen = false, className = '' }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`bg-white rounded-xl border border-slate-100 shadow-sm ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
      >
        <Icon className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" /> : <ChevronRight className="w-4 h-4 text-slate-400 ml-auto" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>}
    </div>
  );
}

function SourceBadge({ source }: { source: UnifiedClientProfile['source'] }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
      source === 'profile' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : source === 'mixed' ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-slate-50 border-slate-200 text-slate-500'
    }`}>
      {source === 'profile' ? 'Master Profile' : source === 'mixed' ? 'Master + Booking' : 'Booking Intake'}
    </span>
  );
}

// ---- Compact layout --------------------------------------------------------

function CompactClientProfileInformationSection({
  profile,
  showSensitive = true,
}: {
  profile: UnifiedClientProfile;
  showSensitive?: boolean;
}) {
  const services = (profile.preferred_services ?? []).join(', ') || null;
  const familyHist = (profile.family_history ?? []).join(', ') || null;
  const hasAnySecondary =
    !!profile.smoking_vaping?.trim() || !!profile.alcohol_consumption?.trim() ||
    !!profile.exercise_frequency?.trim() || !!profile.water_intake?.trim() ||
    !!familyHist || !!services || !!profile.general_notes?.trim() || !!profile.operational_notes?.trim() ||
    !!profile.address?.trim() || !!profile.date_of_birth?.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-teal-500" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600">Client Profile Information</p>
        <SourceBadge source={profile.source} />
      </div>

      {/* Priority summary cards — always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Profile Overview */}
        <CompactCard title="Profile Overview" icon={User}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <CompactRow icon={Cake} label="DOB" value={profile.date_of_birth} />
            <CompactRow icon={User} label="Age" value={profile.age != null ? `${profile.age} yrs` : null} />
            <CompactRow icon={User} label="Gender" value={profile.gender} />
            <CompactRow icon={Phone} label="Phone" value={profile.phone} />
            <CompactRow icon={Mail} label="Email" value={profile.email} />
            <CompactRow icon={MapPin} label="Preferred Location" value={profile.preferred_location} />
            <div className="col-span-2">
              <CompactRow icon={ClipboardList} label="Requested Services" value={services} />
            </div>
          </div>
        </CompactCard>

        {/* Client Safety */}
        <CompactCard title="Client Safety" icon={ShieldCheck}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <CompactRow icon={User} label="Emergency Contact" value={profile.emergency_contact_name} />
            <CompactRow icon={Contact} label="Relationship" value={profile.emergency_contact_relationship} />
            <div className="col-span-2">
              <CompactRow icon={Phone} label="Emergency Phone" value={profile.emergency_contact_number} />
            </div>
            <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <FileCheck className="w-3 h-3 text-slate-400" /> Consent
              </span>
              {profile.consent_given ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <CheckCircle className="w-3 h-3" /> Given
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 border border-slate-200 text-slate-500">
                  <X className="w-3 h-3" /> Not given
                </span>
              )}
            </div>
          </div>
        </CompactCard>
      </div>

      {/* Health Summary — always visible when sensitive allowed */}
      {showSensitive && (
        <CompactCard title="Health Summary" icon={HeartPulse}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <CompactHealthRow icon={AlertTriangle} label="Allergies" value={profile.allergies} />
            <CompactHealthRow icon={Stethoscope} label="Medications" value={profile.current_medications} />
            <CompactHealthRow icon={Baby} label="Pregnancy" value={profile.pregnancy_breastfeeding} />
            <CompactHealthRow icon={HeartPulse} label="Pre-existing" value={profile.pre_existing_conditions} />
            <CompactHealthRow icon={HeartPulse} label="Bleeding" value={profile.bleeding_disorders} />
            <CompactHealthRow icon={Activity} label="Weight" value={profile.weight} />
          </div>
        </CompactCard>
      )}

      {/* Secondary details — collapsed by default */}
      {hasAnySecondary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DisclosureGroup title="Lifestyle" icon={Activity}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <CompactRow icon={Cigarette} label="Smoking / Vaping" value={profile.smoking_vaping} />
              <CompactRow icon={Wine} label="Alcohol" value={profile.alcohol_consumption} />
              <CompactRow icon={Dumbbell} label="Exercise" value={profile.exercise_frequency} />
              <CompactRow icon={Droplets} label="Water Intake" value={profile.water_intake} />
            </div>
          </DisclosureGroup>

          <DisclosureGroup title="Family History" icon={HeartPulse}>
            <CompactRow icon={HeartPulse} label="Family History" value={familyHist} />
          </DisclosureGroup>

          <DisclosureGroup title="Service Preferences" icon={ClipboardList}>
            <CompactRow icon={ClipboardList} label="Preferred Services" value={services} />
            <CompactRow icon={MapPin} label="Preferred Location" value={profile.preferred_location} />
          </DisclosureGroup>

          <DisclosureGroup title="Additional Personal Details" icon={User}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              <CompactRow icon={Cake} label="Date of Birth" value={profile.date_of_birth} />
              <CompactRow icon={MapPin} label="Address" value={profile.address} />
              <CompactRow icon={Calendar} label="Consent Date" value={profile.consent_date} />
            </div>
          </DisclosureGroup>

          {showSensitive && (
            <DisclosureGroup title="Internal Notes" icon={StickyNote} className="md:col-span-2">
              <CompactRow icon={StickyNote} label="General Notes" value={profile.general_notes} />
              <CompactRow icon={ClipboardList} label="Operational / Service Notes" value={profile.operational_notes} />
            </DisclosureGroup>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Full layout (Client Management / Client Profiles) ---------------------

function FullClientProfileInformationSection({
  profile,
  showSensitive = true,
}: {
  profile: UnifiedClientProfile;
  showSensitive?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-teal-500" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600">Client Profile Information</p>
        <SourceBadge source={profile.source} />
      </div>

      <SectionBlock title="Personal Details" icon={Users}>
        <DetailField icon={User} label="Full Name" value={profile.full_name} />
        <DetailField icon={Cake} label="Date of Birth" value={profile.date_of_birth} />
        <DetailField icon={User} label="Age" value={profile.age != null ? `${profile.age} years` : null} />
        <DetailField icon={User} label="Gender" value={profile.gender} />
      </SectionBlock>

      <SectionBlock title="Contact Information" icon={Contact}>
        <DetailField icon={Mail} label="Email" value={profile.email} />
        <DetailField icon={Phone} label="Phone" value={profile.phone} />
        <DetailField icon={MapPin} label="Address" value={profile.address} />
      </SectionBlock>

      <SectionBlock title="Emergency Contact" icon={ShieldCheck}>
        <DetailField icon={User} label="Contact Person" value={profile.emergency_contact_name} />
        <DetailField icon={Contact} label="Relationship" value={profile.emergency_contact_relationship} />
        <DetailField icon={Phone} label="Phone Number" value={profile.emergency_contact_number} />
      </SectionBlock>

      {showSensitive && (
        <SectionBlock title="Health Information" icon={HeartPulse}>
          <HealthField icon={AlertTriangle} label="Allergies" value={profile.allergies} />
          <HealthField icon={Stethoscope} label="Current Medications" value={profile.current_medications} />
          <HealthField icon={Baby} label="Pregnancy / Breastfeeding" value={profile.pregnancy_breastfeeding} />
          <HealthField icon={HeartPulse} label="Pre-existing Conditions" value={profile.pre_existing_conditions} />
          <HealthField icon={HeartPulse} label="Bleeding Disorders" value={profile.bleeding_disorders} />
          <HealthField icon={HeartPulse} label="Family History" value={(profile.family_history ?? []).join(', ') || null} />
          <HealthField icon={Activity} label="Weight" value={profile.weight} />
          <HealthField icon={HeartPulse} label="Health Notes" value={profile.health_notes} />
        </SectionBlock>
      )}

      <SectionBlock title="Lifestyle Information" icon={Activity}>
        <DetailField icon={Cigarette} label="Smoking / Vaping" value={profile.smoking_vaping} />
        <DetailField icon={Wine} label="Alcohol Consumption" value={profile.alcohol_consumption} />
        <DetailField icon={Dumbbell} label="Exercise Frequency" value={profile.exercise_frequency} />
        <DetailField icon={Droplets} label="Daily Water Intake" value={profile.water_intake} />
      </SectionBlock>

      <SectionBlock title="Services & Preferences" icon={ClipboardList}>
        <DetailField icon={ClipboardList} label="Preferred Services" value={(profile.preferred_services ?? []).join(', ') || null} />
        <DetailField icon={MapPin} label="Preferred Location" value={profile.preferred_location} />
      </SectionBlock>

      <SectionBlock title="Consent" icon={ShieldCheck}>
        <div className="flex items-center gap-3">
          {profile.consent_given ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
              <CheckCircle className="w-3.5 h-3.5" /> Consent Given
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-50 border border-slate-200 text-slate-500">
              <X className="w-3.5 h-3.5" /> Consent Not Given
            </span>
          )}
        </div>
        <DetailField icon={Calendar} label="Consent Date" value={profile.consent_date} />
      </SectionBlock>

      {showSensitive && (
        <SectionBlock title="Internal Notes" icon={StickyNote}>
          <DetailField icon={StickyNote} label="General Notes" value={profile.general_notes} />
          <DetailField icon={ClipboardList} label="Operational / Service Notes" value={profile.operational_notes} />
        </SectionBlock>
      )}
    </div>
  );
}

// Reusable "Client Profile Information" section block.
// variant="compact" → condensed cards + collapsible secondary details (Booking/Appointment details).
// variant="full" (default) → full stacked sections (Client Management / Client Profiles).
// showSensitive controls health info + internal notes visibility (permission-gated by caller).
export function ClientProfileInformationSection({
  profile,
  showSensitive = true,
  variant = 'full',
}: {
  profile: UnifiedClientProfile;
  showSensitive?: boolean;
  variant?: 'full' | 'compact';
}) {
  if (variant === 'compact') {
    return <CompactClientProfileInformationSection profile={profile} showSensitive={showSensitive} />;
  }
  return <FullClientProfileInformationSection profile={profile} showSensitive={showSensitive} />;
}

// Compact client-documents list (used by Client Management detail view).
export function ClientDocumentsList({
  documents,
  onDocClick,
}: {
  documents: { id: string; title: string | null; doc_type: string; status: string; created_at: string; file_path: string | null; file_name: string | null }[];
  onDocClick?: (d: { id: string }) => void;
}) {
  return (
    <SectionBlock title="Client Documents" icon={FileText}>
      {documents.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50/40 transition-colors cursor-pointer"
              onClick={() => onDocClick?.({ id: doc.id })}
            >
              <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{doc.title ?? 'Untitled'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase">{doc.doc_type}</span>
                  {doc.file_name && <span className="text-xs text-slate-400">· {doc.file_name}</span>}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                doc.status === 'signed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : doc.status === 'draft' ? 'bg-slate-50 border-slate-200 text-slate-500'
                : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionBlock>
  );
}
