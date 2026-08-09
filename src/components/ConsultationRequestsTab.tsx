import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  Plus,
  Search,
  RefreshCw,
  Stethoscope,
  Calendar,
  Clock,
  User,
  CheckCircle,
  X,
  ChevronDown,
  FileText,
  XCircle,
  CalendarCheck,
  MapPin,
  Video,
  ExternalLink,
  ClipboardCheck,
} from 'lucide-react';
import { supabase, type Client, type ClientBooking, type TeamMember, type Branch, memberDisplayName } from '../lib/supabase';
import { fetchActiveTimeSlots, fetchBookedSlots, type TimeSlot } from '../lib/bookingSlots';
import { fetchActiveBufferMinutes, isWithinBuffer } from '../lib/bookingBuffer';

type ConsultationStatus = 'pending' | 'confirmed' | 'declined' | 'scheduled' | 'completed' | 'cancelled';

const STATUS_CFG: Record<ConsultationStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: 'Pending', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  declined: { label: 'Declined', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  scheduled: { label: 'Scheduled', color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', dot: 'bg-teal-500' },
  completed: { label: 'Completed', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
};

interface ConsultationRequest {
  id: string;
  client_id: string;
  booking_id: string | null;
  requested_by: string;
  request_date: string;
  reason: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: ConsultationStatus;
  created_at: string;
  updated_at: string | null;
  clients?: { full_name: string; email: string | null; phone: string | null } | null;
  appointments?: { id: string; scheduled_date: string; scheduled_time: string; status: string; meeting_platform: string | null; meeting_link: string | null; meeting_notes: string | null }[] | null;
}

interface RecommendationRecord {
  id: string;
  appointment_id: string | null;
  consultation_request_id: string | null;
  client_id: string | null;
  recommendation_text: string;
  recorded_by_email: string | null;
  recorded_at: string;
  created_at: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateConsultationModal({ onClose, onSaved, clients, bookings, sessionUserId }: {
  onClose: () => void;
  onSaved: () => void;
  clients: Client[];
  bookings: ClientBooking[];
  sessionUserId: string;
}) {
  const [clientId, setClientId] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch)
  );

  async function handleSave() {
    if (!clientId) { setError('Please select a client.'); return; }
    if (!reason.trim()) { setError('Please enter a reason for the consultation.'); return; }
    setSaving(true);
    setError('');
    const { error: dbErr } = await supabase.from('consultation_requests').insert({
      client_id: clientId,
      booking_id: bookingId,
      requested_by: sessionUserId,
      reason: reason.trim(),
      preferred_date: preferredDate || null,
      preferred_time: preferredTime || null,
      status: 'pending',
    });
    setSaving(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-4.5 h-4.5 text-teal-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">New Consultation Request</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Client picker */}
          <div className="relative">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              <User className="w-3.5 h-3.5" /> Client
            </label>
            <input
              type="text"
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setClientDropdownOpen(true); }}
              onFocus={() => setClientDropdownOpen(true)}
              placeholder="Search client by name, email, or phone…"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
            />
            {clientDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                {filteredClients.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">No clients found.</p>
                ) : (
                  filteredClients.slice(0, 20).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClientId(c.id);
                        setClientSearch(c.full_name);
                        setClientDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-teal-50 transition-colors border-b border-slate-50 last:border-0"
                    >
                      <p className="text-sm font-semibold text-slate-800">{c.full_name}</p>
                      <p className="text-xs text-slate-400">{c.email || c.phone || 'No contact'}</p>
                    </button>
                  ))
                )}
              </div>
            )}
            {clientId && (
              <p className="mt-1 text-xs text-teal-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Selected: {clients.find(c => c.id === clientId)?.full_name}
              </p>
            )}
          </div>

          {/* Optional booking link */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              <FileText className="w-3.5 h-3.5" /> Linked Booking (optional)
            </label>
            <div className="relative">
              <select
                value={bookingId ?? ''}
                onChange={e => setBookingId(e.target.value || null)}
                className="w-full pl-3.5 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 appearance-none bg-white cursor-pointer"
              >
                <option value="">No linked booking</option>
                {bookings
                  .filter(b => !clientId || b.client_id === clientId || b.full_name === clients.find(c => c.id === clientId)?.full_name)
                  .slice(0, 50)
                  .map(b => (
                    <option key={b.id} value={b.id}>
                      {b.full_name} — {formatDate(b.preferred_date)} {b.preferred_time ? formatTime(String(b.preferred_time)) : ''}
                    </option>
                  ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              <FileText className="w-3.5 h-3.5" /> Reason for Consultation
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe the reason for the doctor consultation…"
              rows={3}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Preferred schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Calendar className="w-3.5 h-3.5" /> Preferred Date
              </label>
              <input
                type="date"
                value={preferredDate}
                onChange={e => setPreferredDate(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Clock className="w-3.5 h-3.5" /> Preferred Time
              </label>
              <input
                type="time"
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create Request
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recommendation Modal ──────────────────────────────────────────────────

function RecommendationModal({ request, appointment, clientName, userEmail, onClose, onSaved }: {
  request: ConsultationRequest;
  appointment: { id: string; scheduled_date: string; scheduled_time: string } | null;
  clientName: string;
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!text.trim()) { setError('Please enter the doctor\'s recommendation.'); return; }
    setSaving(true);
    setError('');
    const { error: dbErr } = await supabase.from('consultation_recommendations').insert({
      appointment_id: appointment?.id ?? null,
      consultation_request_id: request.id,
      client_id: request.client_id,
      recommendation_text: text.trim(),
      recorded_by_email: userEmail,
      recorded_at: new Date().toISOString(),
    });
    setSaving(false);
    if (dbErr) { setError('Failed to save recommendation.'); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
              <ClipboardCheck className="w-4.5 h-4.5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Doctor Recommendation</h3>
              <p className="text-xs text-slate-500">{clientName}{appointment ? ` — ${formatDate(appointment.scheduled_date)} at ${formatTime(appointment.scheduled_time)}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Internal record only. This will NOT be shown to the client. Visible to authorized staff in the client\'s history.</span>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Recommendation Notes</label>
            <textarea
              rows={6}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter the doctor\'s recommendation after consultation…"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Save Recommendation
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Meeting Link Modal ─────────────────────────────────────────────────────

function MeetingLinkModal({ appointment, clientName, onClose, onSaved }: {
  appointment: { id: string; scheduled_date: string; scheduled_time: string; meeting_platform: string | null; meeting_link: string | null; meeting_notes: string | null };
  clientName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [platform, setPlatform] = useState(appointment.meeting_platform ?? '');
  const [link, setLink] = useState(appointment.meeting_link ?? '');
  const [notes, setNotes] = useState(appointment.meeting_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        meeting_platform: platform.trim() || null,
        meeting_link: link.trim() || null,
        meeting_notes: notes.trim() || null,
      })
      .eq('id', appointment.id);
    setSaving(false);
    if (updateErr) { setError('Failed to save meeting details.'); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-violet-50 rounded-lg flex items-center justify-center">
              <Video className="w-4.5 h-4.5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Meeting Details</h3>
              <p className="text-xs text-slate-500">{clientName} — {formatDate(appointment.scheduled_date)} at {formatTime(appointment.scheduled_time)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Meeting Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white cursor-pointer"
            >
              <option value="">— Select Platform —</option>
              <option value="Zoom">Zoom</option>
              <option value="Google Meet">Google Meet</option>
              <option value="Microsoft Teams">Microsoft Teams</option>
              <option value="Viber">Viber</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Phone Call">Phone Call</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Meeting Link</label>
            <input
              type="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://meet.example.com/abc-defg-hij"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Meeting Notes / Instructions</label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Join 5 minutes early. Password: 1234. Bring lab results."
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} Save Meeting Details
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Consultation Modal ─────────────────────────────────────────────

function ScheduleConsultationModal({ request, userEmail, onClose, onSaved }: {
  request: ConsultationRequest;
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(request.preferred_date ?? '');
  const [time, setTime] = useState(request.preferred_time ?? '');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function init() {
      const [branchRes, slotsRes] = await Promise.all([
        supabase.from('branches').select('id, name, is_active, created_at').eq('is_active', true).order('name'),
        fetchActiveTimeSlots(),
      ]);
      const loadedBranches = (branchRes.data ?? []) as Branch[];
      setBranches(loadedBranches);
      if (loadedBranches.length > 0) setBranchId(loadedBranches[0].id);
      setSlots(slotsRes);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (!date) { setBookedSlots(new Set()); return; }
    fetchBookedSlots(date).then(setBookedSlots);
  }, [date]);

  async function handleSave() {
    if (!branchId) { setError('Please select a branch.'); return; }
    if (!date) { setError('Date is required.'); return; }
    if (!time) { setError('Time is required.'); return; }

    const { minutes: bufferMinutes } = await fetchActiveBufferMinutes();
    if (isWithinBuffer(date, time, bufferMinutes)) {
      const earliest = new Date(Date.now() + bufferMinutes * 60_000);
      setError(`This time is within the minimum booking buffer (${bufferMinutes} min). Earliest bookable: ${earliest.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`);
      return;
    }

    setSaving(true);
    setError('');

    const { error: apptErr } = await supabase.from('appointments').insert({
      client_id: request.client_id,
      branch_id: branchId,
      scheduled_date: date,
      scheduled_time: time,
      service: 'Doctor Consultation',
      location: location.trim() || null,
      payment_status: 'pending',
      intake_form_status: 'completed',
      notes: notes.trim() || null,
      created_by_email: userEmail,
      booking_id: request.booking_id,
      consultation_request_id: request.id,
    });

    setSaving(false);
    if (apptErr) {
      setError('Failed to schedule consultation. Please try again.');
      return;
    }

    await supabase.from('consultation_requests')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', request.id);

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-teal-50 rounded-lg flex items-center justify-center">
              <CalendarCheck className="w-4.5 h-4.5 text-teal-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">Schedule Consultation</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
              </div>
            )}

            <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
              <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-700 mb-1">Confirmed consultation for {request.clients?.full_name ?? 'client'}</p>
                <p className="text-xs text-blue-600">Select an available time slot to schedule the appointment.</p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <MapPin className="w-3.5 h-3.5" /> Branch
              </label>
              <select
                value={branchId}
                onChange={e => setBranchId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white cursor-pointer"
              >
                <option value="">— Select Branch —</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> Time
                </label>
                <select
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white cursor-pointer"
                >
                  <option value="">— Select —</option>
                  {slots.map(s => (
                    <option key={s.value} value={s.value} disabled={bookedSlots.has(s.value)}>
                      {s.label}{bookedSlots.has(s.value) ? ' — booked' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <MapPin className="w-3.5 h-3.5" /> Location (optional)
              </label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Clinic, home address, hotel…"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <FileText className="w-3.5 h-3.5" /> Notes (optional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional notes…"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />} Schedule Consultation
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ConsultationRequestsTab({ userEmail, canCreate, canManage, canRecommend }: { userEmail: string; canCreate: boolean; canManage: boolean; canRecommend: boolean }) {
  // ─── Schedule Consultation Modal ─────────────────────────────────────────
  const [scheduleRequest, setScheduleRequest] = useState<ConsultationRequest | null>(null);
  const [meetingAppt, setMeetingAppt] = useState<{ id: string; scheduled_date: string; scheduled_time: string; meeting_platform: string | null; meeting_link: string | null; meeting_notes: string | null } | null>(null);
  const [meetingClientName, setMeetingClientName] = useState('');
  const [recommendRequest, setRecommendRequest] = useState<ConsultationRequest | null>(null);
  const [recommendAppt, setRecommendAppt] = useState<{ id: string; scheduled_date: string; scheduled_time: string } | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationRecord[]>([]);
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [memberLookup, setMemberLookup] = useState<Record<string, TeamMember>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ConsultationStatus | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUserId(session?.user.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [reqRes, clientsRes, bookingsRes, membersRes, recRes] = await Promise.all([
      supabase.from('consultation_requests')
        .select('*, clients(full_name, email, phone), appointments(id, scheduled_date, scheduled_time, status, meeting_platform, meeting_link, meeting_notes)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('full_name', { ascending: true }),
      supabase.from('client_bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('team_members').select('*').eq('status', 'approved'),
      supabase.from('consultation_recommendations').select('*').order('recorded_at', { ascending: false }),
    ]);
    if (reqRes.error) setError('Failed to load consultation requests.');
    else setRequests(reqRes.data as ConsultationRequest[]);
    setClients((clientsRes.data ?? []) as Client[]);
    setBookings((bookingsRes.data ?? []) as ClientBooking[]);
    const lookup: Record<string, TeamMember> = {};
    (membersRes.data ?? []).forEach((m: TeamMember) => { lookup[m.user_id] = m; });
    setMemberLookup(lookup);
    setRecommendations((recRes.data ?? []) as RecommendationRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(requestId: string, newStatus: ConsultationStatus) {
    setUpdatingStatusId(requestId);
    setError('');
    const { error: updateErr } = await supabase
      .from('consultation_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', requestId);
    setUpdatingStatusId(null);
    if (updateErr) {
      setError('Failed to update consultation status.');
      return;
    }
    setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus, updated_at: new Date().toISOString() } : r));
    setSuccessMsg(`Status updated to ${STATUS_CFG[newStatus].label}.`);
    setTimeout(() => setSuccessMsg(''), 4000);
  }

  const filtered = requests.filter(r => {
    const clientName = r.clients?.full_name ?? '';
    const matchesSearch = clientName.toLowerCase().includes(search.toLowerCase()) || r.reason.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || r.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    confirmed: requests.filter(r => r.status === 'confirmed').length,
    declined: requests.filter(r => r.status === 'declined').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Doctor Consultation Requests</h2>
          <p className="text-sm text-slate-500 mt-0.5">Create and track consultation requests after client agrees</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Request
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Requests', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Confirmed', value: stats.confirmed, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Declined', value: stats.declined, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center`}>
                <Stethoscope className={`w-5 h-5 ${s.color}`} />
              </div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</span>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client name or reason…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700"
          />
        </div>
        <div className="relative">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as ConsultationStatus | 'ALL')}
            className="pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none text-slate-700 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="declined">Declined</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 mb-5">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium mb-6 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
          <Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">
            {search || filterStatus !== 'ALL' ? 'No consultation requests match your filters.' : 'No consultation requests yet.'}
          </p>
          {canCreate && !search && filterStatus === 'ALL' && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" /> Create First Request
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map(r => {
            const cfg = STATUS_CFG[r.status];
            const requester = memberLookup[r.requested_by];
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-base">{r.clients?.full_name ?? 'Unknown Client'}</p>
                      <p className="text-xs text-slate-400">Requested {formatTs(r.created_at)}</p>
                    </div>
                  </div>
                  {canManage ? (
                    <div className="relative flex-shrink-0">
                      <select
                        value={r.status}
                        disabled={updatingStatusId === r.id}
                        onChange={e => updateStatus(r.id, e.target.value as ConsultationStatus)}
                        className={`pl-3 pr-9 py-1.5 rounded-full border text-xs font-semibold appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60 ${cfg.bg} ${cfg.color}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="declined">Declined</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      {updatingStatusId === r.id ? (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin pointer-events-none" />
                      ) : (
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none opacity-60" />
                      )}
                    </div>
                  ) : (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Request Date</p>
                      <p className="text-sm text-slate-700 font-semibold">{formatDate(r.request_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Preferred Schedule</p>
                      <p className="text-sm text-slate-700 font-semibold">
                        {r.preferred_date ? formatDate(r.preferred_date) : '—'}
                        {r.preferred_time ? ` at ${formatTime(r.preferred_time)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {r.updated_at ? (
                      <>
                        <RefreshCw className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Last Update</p>
                          <p className="text-sm text-slate-700 font-semibold">{formatTs(r.updated_at)}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-slate-400 font-medium">Requested By</p>
                          <p className="text-sm text-slate-700 font-semibold">{requester ? memberDisplayName(requester) : userEmail}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {r.updated_at && (
                  <div className="flex items-center gap-2.5 mb-4">
                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Requested By</p>
                      <p className="text-sm text-slate-700 font-semibold">{requester ? memberDisplayName(requester) : userEmail}</p>
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1">Reason for Consultation</p>
                  <p className="text-sm text-slate-700">{r.reason}</p>
                </div>

                {r.status === 'confirmed' && canManage && (
                  <button
                    onClick={() => setScheduleRequest(r)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm mt-4"
                  >
                    <CalendarCheck className="w-4 h-4" /> Schedule Consultation
                  </button>
                )}

                {r.appointments && r.appointments.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {r.appointments.map(a => {
                      const apptRecs = recommendations.filter(rec => rec.appointment_id === a.id || rec.consultation_request_id === r.id);
                      return (
                      <div key={a.id} className="px-4 py-3 bg-teal-50 border border-teal-100 rounded-xl">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <CalendarCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-teal-700">Appointment scheduled</p>
                              <p className="text-xs text-teal-600">{formatDate(a.scheduled_date)} at {formatTime(a.scheduled_time)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {canRecommend && (a.status === 'completed' || a.status === 'scheduled') && (
                              <button
                                onClick={() => { setRecommendRequest(r); setRecommendAppt(a); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" /> Add Recommendation
                              </button>
                            )}
                            {canManage && (
                              <button
                                onClick={() => { setMeetingAppt(a); setMeetingClientName(r.clients?.full_name ?? 'Client'); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
                              >
                                <Video className="w-3.5 h-3.5" /> {a.meeting_link ? 'Edit Meeting' : 'Add Meeting'}
                              </button>
                            )}
                          </div>
                        </div>
                        {a.meeting_platform && (
                          <div className="mt-2.5 pt-2.5 border-t border-teal-100/60 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Video className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                              <span className="text-xs font-semibold text-slate-700">{a.meeting_platform}</span>
                            </div>
                            {a.meeting_link && (
                              <a href={a.meeting_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-violet-600 hover:text-violet-700 hover:underline break-all">
                                <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> {a.meeting_link}
                              </a>
                            )}
                            {a.meeting_notes && (
                              <p className="text-xs text-slate-600 pl-5">{a.meeting_notes}</p>
                            )}
                          </div>
                        )}
                        {apptRecs.length > 0 && (
                          <div className="mt-2.5 pt-2.5 border-t border-teal-100/60 space-y-2">
                            {apptRecs.map(rec => (
                              <div key={rec.id} className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Doctor Recommendation</span>
                                  <span className="text-[11px] text-slate-400 ml-auto">{formatTs(rec.recorded_at)}</span>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{rec.recommendation_text}</p>
                                {rec.recorded_by_email && (
                                  <p className="text-[11px] text-slate-400 mt-1.5">Recorded by {rec.recorded_by_email}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && sessionUserId && (
        <CreateConsultationModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            load();
            setSuccessMsg('Consultation request created successfully.');
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
          clients={clients}
          bookings={bookings}
          sessionUserId={sessionUserId}
        />
      )}

      {scheduleRequest && (
        <ScheduleConsultationModal
          request={scheduleRequest}
          userEmail={userEmail}
          onClose={() => setScheduleRequest(null)}
          onSaved={() => {
            load();
            setSuccessMsg('Consultation scheduled successfully.');
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}

      {meetingAppt && (
        <MeetingLinkModal
          appointment={meetingAppt}
          clientName={meetingClientName}
          onClose={() => setMeetingAppt(null)}
          onSaved={() => {
            load();
            setSuccessMsg('Meeting details saved successfully.');
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}

      {recommendRequest && (
        <RecommendationModal
          request={recommendRequest}
          appointment={recommendAppt}
          clientName={recommendRequest.clients?.full_name ?? 'Client'}
          userEmail={userEmail}
          onClose={() => { setRecommendRequest(null); setRecommendAppt(null); }}
          onSaved={() => {
            load();
            setSuccessMsg('Recommendation saved successfully.');
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}
    </div>
  );
}
