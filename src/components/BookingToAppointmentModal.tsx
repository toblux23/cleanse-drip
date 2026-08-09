import { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Search,
  Calendar,
  Clock,
  MapPin,
  FlaskConical,
  CalendarCheck,
} from 'lucide-react';
import { supabase, type ClientBooking, type Client, type Branch, type TeamMember, memberDisplayName, ROLES } from '../lib/supabase';
import { fetchActiveBufferMinutes, isWithinBuffer } from '../lib/bookingBuffer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(t: string) {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Field label with optional icon ──────────────────────────────────────────

function Label({ children, prefilled }: { children: React.ReactNode; prefilled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="text-xs font-semibold text-slate-600">{children}</span>
      {prefilled && (
        <span className="text-[10px] font-bold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md leading-tight">
          pre-filled
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  booking: ClientBooking;
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function BookingToAppointmentModal({ booking, userEmail, onClose, onSaved }: Props) {
  const defaultService = Array.isArray(booking.services_requested)
    ? booking.services_requested.join(', ')
    : String(booking.services_requested ?? '');

  // Data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [nurses, setNurses] = useState<TeamMember[]>([]);
  const [assistants, setAssistants] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Client search
  const [clientSearch, setClientSearch] = useState(booking.full_name);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);

  // Pre-filled fields
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(booking.preferred_date);
  const [time, setTime] = useState(booking.preferred_time);
  const [service, setService] = useState(defaultService);
  const [location, setLocation] = useState(booking.address ?? '');

  // Team fields (user fills)
  const [nurseName, setNurseName] = useState('');
  const [assistantName, setAssistantName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [notes, setNotes] = useState('');

  // Save
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // On mount: load branches and search for matching client
  useEffect(() => {
    async function init() {
      const [branchRes, clientRes, membersRes] = await Promise.all([
        supabase
          .from('branches')
          .select('id, name, is_active, created_at')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('clients')
          .select('id, full_name, email, phone, address, health_notes, status, created_at')
          .ilike('full_name', `%${booking.full_name}%`)
          .limit(20),
        supabase
          .from('team_members')
          .select('*')
          .eq('status', 'approved')
          .order('full_name', { ascending: true, nullsFirst: false })
          .order('email', { ascending: true }),
      ]);

      const loadedBranches = branchRes.data ?? [];
      setBranches(loadedBranches);
      if (loadedBranches.length > 0) setBranchId(loadedBranches[0].id);

      const loadedClients = (clientRes.data ?? []) as Client[];
      setClients(loadedClients);

      const allMembers = (membersRes.data ?? []) as TeamMember[];
      setNurses(allMembers);
      setAssistants(allMembers.filter(m => m.role === 'nurse_assistant'));

      // Auto-select exact name match
      const exact = loadedClients.find(
        c => c.full_name.toLowerCase() === booking.full_name.toLowerCase()
      );
      if (exact) setSelectedClient(exact);

      setLoading(false);
    }
    init();
  }, [booking.full_name]);

  async function handleClientSearchChange(val: string) {
    setClientSearch(val);
    setSelectedClient(null);
    if (val.trim().length < 2) { setClients([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, address, health_notes, status, created_at')
      .ilike('full_name', `%${val.trim()}%`)
      .limit(10);
    setClients((data ?? []) as Client[]);
    setSearching(false);
  }

  async function handleSave() {
    if (!branchId) { setErr('Please select a branch.'); return; }
    if (!date) { setErr('Date is required.'); return; }
    if (!time) { setErr('Time is required.'); return; }

    // Enforce booking lead-time buffer
    const { minutes: bufferMinutes } = await fetchActiveBufferMinutes();
    if (isWithinBuffer(date, time, bufferMinutes)) {
      const earliest = new Date(Date.now() + bufferMinutes * 60_000);
      setErr(`This time is within the minimum booking buffer (${bufferMinutes} min). Earliest bookable: ${earliest.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`);
      return;
    }

    setSaving(true);
    setErr('');

    let clientId = selectedClient?.id ?? '';

    if (!clientId) {
      // Auto-create a client record from the booking data
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          full_name: booking.full_name,
          phone: booking.cellphone ?? null,
          email: booking.email ?? null,
          address: booking.address ?? null,
        })
        .select()
        .single();

      if (clientErr || !newClient) {
        setSaving(false);
        setErr('Failed to create client record. Please try again.');
        return;
      }
      clientId = (newClient as Client).id;
    }

    const { error: apptErr } = await supabase.from('appointments').insert({
      client_id: clientId,
      branch_id: branchId,
      scheduled_date: date,
      scheduled_time: time,
      service: service.trim() || null,
      location: location.trim() || null,
      nurse_name: nurseName.trim() || null,
      assistant_name: assistantName.trim() || null,
      driver_name: driverName.trim() || null,
      vehicle: vehicle.trim() || null,
      payment_status: 'pending',
      intake_form_status: 'completed',
      notes: notes.trim() || null,
      created_by_email: userEmail,
      booking_id: booking.id,
    });

    setSaving(false);
    if (apptErr) { setErr('Failed to create appointment. Please try again.'); return; }
    onSaved();
    onClose();
  }

  const dropdownClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Create Appointment</h2>
              <p className="text-xs text-slate-500 mt-0.5">From confirmed booking — {booking.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 h-56">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

            {err && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
              </div>
            )}

            {/* Booking summary banner */}
            <div className="flex items-start gap-3 px-4 py-3.5 bg-teal-50 border border-teal-100 rounded-xl">
              <CheckCircle className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-teal-700 mb-1.5">Booking data auto-filled — only Team Assignment needs to be completed</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-teal-600">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {fmtDate(booking.preferred_date)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtTime(booking.preferred_time)}
                  </span>
                  {defaultService && (
                    <span className="flex items-center gap-1">
                      <FlaskConical className="w-3 h-3" /> {defaultService}
                    </span>
                  )}
                  {booking.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {booking.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section: Appointment Details ── */}
            <section>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                Appointment Details
              </p>
              <div className="space-y-3">

                {/* Client */}
                <div>
                  <Label>
                    Client
                    {selectedClient && (
                      <span className="ml-1 text-emerald-600 font-semibold text-[11px]">
                        — matched to existing record
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-400" />
                    )}
                    <input
                      className={`w-full pl-9 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors ${selectedClient ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}
                      placeholder="Search client by name..."
                      value={clientSearch}
                      onChange={e => handleClientSearchChange(e.target.value)}
                      onFocus={() => setShowDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    />
                  </div>
                  {showDropdown && dropdownClients.length > 0 && (
                    <div className="relative z-10">
                      <div className="absolute w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto">
                        {dropdownClients.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 text-slate-700 flex items-center justify-between"
                            onMouseDown={() => {
                              setSelectedClient(c);
                              setClientSearch(c.full_name);
                              setShowDropdown(false);
                            }}
                          >
                            <span className="font-medium">{c.full_name}</span>
                            {c.phone && <span className="text-xs text-slate-400">{c.phone}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!selectedClient && (
                    <p className="text-[11px] text-amber-600 mt-1.5 leading-tight">
                      No existing client selected — a new client record will be created automatically on save.
                    </p>
                  )}
                </div>

                {/* Branch */}
                <div>
                  <Label>Branch</Label>
                  <select
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                  >
                    <option value="">— Select Branch —</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>

                {/* Date + Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label prefilled>Date</Label>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 text-sm border border-teal-200 bg-teal-50/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label prefilled>Time</Label>
                    <input
                      type="time"
                      className="w-full px-3 py-2.5 text-sm border border-teal-200 bg-teal-50/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={time}
                      onChange={e => setTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Service */}
                <div>
                  <Label prefilled>Service</Label>
                  <input
                    className="w-full px-3 py-2.5 text-sm border border-teal-200 bg-teal-50/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Service(s) requested..."
                    value={service}
                    onChange={e => setService(e.target.value)}
                  />
                </div>

                {/* Visit Location */}
                <div>
                  <Label prefilled={!!booking.address}>Visit Location</Label>
                  <input
                    className={`w-full px-3 py-2.5 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 ${booking.address ? 'border border-teal-200 bg-teal-50/40' : 'border border-slate-200'}`}
                    placeholder="Home address, hotel, clinic..."
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* ── Section: Team Assignment ── */}
            <section>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                Team Assignment
                <span className="ml-2 text-slate-300 font-normal normal-case tracking-normal">— complete below</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nurse</Label>
                  <select
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white cursor-pointer"
                    value={nurseName}
                    onChange={e => setNurseName(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {nurses.map(n => {
                      const name = memberDisplayName(n);
                      const roleLabel = ROLES.find(r => r.key === n.role)?.label ?? n.role;
                      const isFallback = !n.full_name || !n.full_name.trim();
                      return (
                        <option key={n.user_id} value={name}>
                          {isFallback ? name : `${name} — ${roleLabel}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <Label>Assistant</Label>
                  <select
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white cursor-pointer"
                    value={assistantName}
                    onChange={e => setAssistantName(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {assistants.map(a => {
                      const name = memberDisplayName(a);
                      return (
                        <option key={a.user_id} value={name}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <Label>Driver</Label>
                  <input
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Driver name"
                    value={driverName}
                    onChange={e => setDriverName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Vehicle</Label>
                  <input
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Plate / description"
                    value={vehicle}
                    onChange={e => setVehicle(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Notes */}
            <div>
              <Label>Notes (optional)</Label>
              <textarea
                rows={2}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                placeholder="Additional operational notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Auto-set fields notice */}
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                Payment status: Pending
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" />
                Intake form: Approved
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel — keep booking confirmed
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarCheck className="w-3.5 h-3.5" />}
            Create Appointment
          </button>
        </div>
      </div>
    </div>
  );
}
