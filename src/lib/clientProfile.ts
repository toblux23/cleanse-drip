import { supabase, type Client, type ClientProfile, type ClientBooking } from './supabase';

// Unified client profile shape used by Client Profiles, Client Management,
// and Booking/Appointment View Details. Master source is clients + client_profiles;
// client_bookings is used only as a legacy fallback for fields the master record lacks.
export interface UnifiedClientProfile {
  // identity / contact (from clients)
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  health_notes: string | null;
  status: string;
  // extended info (from client_profiles, fallback to client_bookings)
  date_of_birth: string | null;
  age: number | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_number: string | null;
  allergies: string | null;
  current_medications: string | null;
  pregnancy_breastfeeding: string | null;
  pre_existing_conditions: string | null;
  bleeding_disorders: string | null;
  family_history: string[];
  weight: string | null;
  smoking_vaping: string | null;
  alcohol_consumption: string | null;
  exercise_frequency: string | null;
  water_intake: string | null;
  preferred_services: string[];
  preferred_location: string | null;
  consent_given: boolean;
  consent_date: string | null;
  general_notes: string | null;
  operational_notes: string | null;
  // provenance
  source: 'profile' | 'booking' | 'mixed';
}

function pick(master: string | null | undefined, fallback: string | null | undefined): string | null {
  const m = master?.trim() ? master : null;
  return m ?? (fallback?.trim() ? fallback : null);
}

function pickArr(master: string[] | null | undefined, fallback: string[] | null | undefined): string[] {
  if (master && master.length > 0) return master;
  if (fallback && fallback.length > 0) return fallback;
  return [];
}

function merge(
  client: Pick<Client, 'id' | 'full_name' | 'email' | 'phone' | 'address' | 'health_notes' | 'status'>,
  profile: ClientProfile | null,
  booking: ClientBooking | null,
): UnifiedClientProfile {
  const p = profile;
  const b = booking;
  const usedProfile = !!p;
  const usedBooking = !!b && (!p || hasProfileGaps(p));

  return {
    id: client.id,
    full_name: client.full_name,
    email: client.email ?? null,
    phone: client.phone ?? null,
    address: pick(client.address, b?.address ?? null),
    health_notes: pick(client.health_notes, null),
    status: client.status,
    date_of_birth: pick(p?.date_of_birth ?? null, b?.date_of_birth ?? null),
    age: p?.age ?? b?.age ?? null,
    gender: pick(p?.gender ?? null, b?.gender ?? null),
    emergency_contact_name: pick(p?.emergency_contact_name ?? null, b?.emergency_contact_name ?? null),
    emergency_contact_relationship: pick(p?.emergency_contact_relationship ?? null, b?.emergency_contact_relationship ?? null),
    emergency_contact_number: pick(p?.emergency_contact_number ?? null, b?.emergency_contact_number ?? null),
    allergies: pick(p?.allergies ?? null, b?.has_allergies ?? null),
    current_medications: pick(p?.current_medications ?? null, b?.taking_medications ?? null),
    pregnancy_breastfeeding: pick(p?.pregnancy_breastfeeding ?? null, b?.is_pregnant_breastfeeding ?? null),
    pre_existing_conditions: pick(p?.pre_existing_conditions ?? null, b?.pre_existing_condition ?? null),
    bleeding_disorders: pick(p?.bleeding_disorders ?? null, b?.bleeding_disorders ?? null),
    family_history: pickArr(p?.family_history ?? null, b?.family_history ?? null),
    weight: pick(p?.weight ?? null, b?.weight ?? null),
    smoking_vaping: pick(p?.smoking_vaping ?? null, b?.smoking_vaping ?? null),
    alcohol_consumption: pick(p?.alcohol_consumption ?? null, b?.alcohol_consumption ?? null),
    exercise_frequency: pick(p?.exercise_frequency ?? null, b?.exercise_frequency ?? null),
    water_intake: pick(p?.water_intake ?? null, b?.water_intake ?? null),
    preferred_services: pickArr(p?.preferred_services ?? null, b?.services_requested ?? null),
    preferred_location: pick(p?.preferred_location ?? null, b?.preferred_location ?? null),
    consent_given: p?.consent_given ?? b?.consent_given ?? false,
    consent_date: p?.consent_date ?? null,
    general_notes: pick(p?.general_notes ?? null, b?.notes ?? null),
    operational_notes: p?.operational_notes ?? null,
    source: usedProfile && usedBooking ? 'mixed' : usedProfile ? 'profile' : 'booking',
  };
}

function hasProfileGaps(p: ClientProfile): boolean {
  return !p.allergies || !p.emergency_contact_name || !p.current_medications ||
    !p.pregnancy_breastfeeding || !p.pre_existing_conditions || !p.bleeding_disorders ||
    !p.gender || !p.smoking_vaping || !p.alcohol_consumption || !p.exercise_frequency ||
    !p.water_intake;
}

async function findFallbackBooking(email: string | null, phone: string | null, fullName: string): Promise<ClientBooking | null> {
  if (email?.trim()) {
    const { data } = await supabase
      .from('client_bookings')
      .select('*')
      .ilike('email', email.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ClientBooking;
  }
  if (phone?.trim()) {
    const { data } = await supabase
      .from('client_bookings')
      .select('*')
      .eq('cellphone', phone.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ClientBooking;
  }
  const { data } = await supabase
    .from('client_bookings')
    .select('*')
    .ilike('full_name', fullName.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClientBooking) ?? null;
}

// Primary loader: given a verified client_id, load the unified profile.
// Falls back to client_bookings data when the master profile has gaps.
export async function loadUnifiedClientProfile(clientId: string): Promise<UnifiedClientProfile | null> {
  const { data: clientRow } = await supabase
    .from('clients')
    .select('*, client_profiles(*)')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientRow) return null;

  const client = clientRow as Client & { client_profiles?: ClientProfile | null };
  const profile = client.client_profiles ?? null;

  let fallbackBooking: ClientBooking | null = null;
  if (!profile || hasProfileGaps(profile)) {
    fallbackBooking = await findFallbackBooking(client.email, client.phone, client.full_name);
  }

  return merge(client, profile, fallbackBooking);
}

// Loader for booking/appointment view details: resolves the client_id from the
// appointment (if linked), otherwise by normalized email/phone, then loads the
// unified profile. Accepts an optional pre-loaded booking to avoid a duplicate query.
export async function loadUnifiedClientProfileFromBooking(
  booking: ClientBooking,
): Promise<UnifiedClientProfile | null> {
  // 1. Try to find a linked appointment with a client_id
  let clientId: string | null = null;
  const { data: appt } = await supabase
    .from('appointments')
    .select('client_id')
    .eq('booking_id', booking.id)
    .not('client_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (appt?.client_id) clientId = appt.client_id as string;

  // 2. Fall back to matching clients by email / phone / name
  if (!clientId) {
    if (booking.email?.trim()) {
      const { data: c } = await supabase
        .from('clients')
        .select('id')
        .ilike('email', booking.email.trim())
        .maybeSingle();
      if (c?.id) clientId = c.id;
    }
    if (!clientId && booking.cellphone?.trim()) {
      const { data: c } = await supabase
        .from('clients')
        .select('id')
        .eq('phone', booking.cellphone.trim())
        .maybeSingle();
      if (c?.id) clientId = c.id;
    }
    if (!clientId) {
      const { data: c } = await supabase
        .from('clients')
        .select('id')
        .ilike('full_name', booking.full_name.trim())
        .maybeSingle();
      if (c?.id) clientId = c.id;
    }
  }

  if (clientId) {
    const unified = await loadUnifiedClientProfile(clientId);
    if (unified) return unified;
  }

  // 3. No client record at all — build from booking alone
  return merge(
    {
      id: '',
      full_name: booking.full_name,
      email: booking.email,
      phone: booking.cellphone,
      address: booking.address,
      health_notes: null,
      status: 'active',
    },
    null,
    booking,
  );
}

// Loader for appointment view details: uses the appointment's client_id directly.
export async function loadUnifiedClientProfileFromAppointment(
  clientId: string,
  bookingId?: string | null,
): Promise<UnifiedClientProfile | null> {
  let fallbackBooking: ClientBooking | null = null;
  if (bookingId) {
    const { data: b } = await supabase
      .from('client_bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    fallbackBooking = (b as ClientBooking) ?? null;
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('*, client_profiles(*)')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientRow) {
    // No client record — build from booking alone if we have one
    if (fallbackBooking) {
      return merge(
        { id: '', full_name: fallbackBooking.full_name, email: fallbackBooking.email, phone: fallbackBooking.cellphone, address: fallbackBooking.address, health_notes: null, status: 'active' },
        null,
        fallbackBooking,
      );
    }
    return null;
  }

  const client = clientRow as Client & { client_profiles?: ClientProfile | null };
  const profile = client.client_profiles ?? null;

  if (!profile || hasProfileGaps(profile)) {
    if (!fallbackBooking) {
      fallbackBooking = await findFallbackBooking(client.email, client.phone, client.full_name);
    }
  }

  return merge(client, profile, fallbackBooking);
}
