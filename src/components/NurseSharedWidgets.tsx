import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, CalendarCheck, LogIn, LogOut, Camera, X, CheckCircle, AlertTriangle, ChevronRight, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Inventory Alerts (shared) ───────────────────────────────────────────────

export interface InventoryAlertCounts {
  low_stock: number;
  critical: number;
  out_of_stock: number;
  near_expiry: number;
}

export async function fetchInventoryAlerts(): Promise<InventoryAlertCounts | null> {
  const [prodRes, batchRes] = await Promise.all([
    supabase.from('inventory_product_summary').select('stock_status').eq('is_active', true),
    supabase.from('inventory_batch_summary').select('computed_status, expiration_date'),
  ]);
  if (prodRes.error || batchRes.error) return null;
  const counts: InventoryAlertCounts = { low_stock: 0, critical: 0, out_of_stock: 0, near_expiry: 0 };
  (prodRes.data ?? []).forEach((p: { stock_status: string }) => {
    if (p.stock_status === 'low_stock') counts.low_stock++;
    else if (p.stock_status === 'critical') counts.critical++;
    else if (p.stock_status === 'out_of_stock') counts.out_of_stock++;
  });
  const todayDate = new Date();
  const nearExpiryLimit = new Date(todayDate);
  nearExpiryLimit.setDate(nearExpiryLimit.getDate() + 30);
  (batchRes.data ?? []).forEach((b: { computed_status: string; expiration_date?: string }) => {
    if (b.computed_status === 'near_expiry') counts.near_expiry++;
    else if (b.expiration_date) {
      const exp = new Date(b.expiration_date);
      if (exp > todayDate && exp <= nearExpiryLimit) counts.near_expiry++;
    }
  });
  return counts;
}

export function InventoryAlertsWidget({
  alerts,
  onViewInventory,
}: {
  alerts: InventoryAlertCounts | null;
  onViewInventory?: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-5 h-5 text-teal-600" />
        <h2 className="text-base font-bold text-slate-800">Inventory Alerts</h2>
      </div>
      {alerts ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: 'Low Stock', value: alerts.low_stock, cls: 'bg-amber-50 text-amber-700' },
              { label: 'Critical', value: alerts.critical, cls: 'bg-red-50 text-red-700' },
              { label: 'Out of Stock', value: alerts.out_of_stock, cls: 'bg-red-50 text-red-700' },
              { label: 'Near Expiry', value: alerts.near_expiry, cls: 'bg-orange-50 text-orange-700' },
            ].map(a => (
              <div key={a.label} className={`rounded-xl p-3 ${a.cls}`}>
                <p className="text-2xl font-bold">{a.value}</p>
                <p className="text-xs font-semibold mt-0.5">{a.label}</p>
              </div>
            ))}
          </div>
          {onViewInventory && (
            <button
              onClick={onViewInventory}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
            >
              <Package className="w-4 h-4" /> View Inventory
            </button>
          )}
        </>
      ) : (
        <div className="py-6 text-center">
          <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">No active inventory to report.</p>
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimeLog {
  id: string;
  clock_in: string | null;
  clock_out: string | null;
  staff_name: string | null;
  branch_id: string | null;
  notes: string | null;
  clock_in_photo_url: string | null;
  clock_out_photo_url: string | null;
}

export interface NeedsAttentionItem {
  appt: AppointmentRowLite;
  issue: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  action: string;
}

// Minimal appointment shape required by NeedsAttentionWidget + computeNeedsAttention.
// Only declares the fields actually consumed — accepts both the Nurse Dashboard's
// full AppointmentRow and the Assistant Dashboard's AppointmentLite.
export interface AppointmentRowLite {
  id: string;
  status: string;
  intake_form_status: string;
  booking_id: string | null;
  feedback_email_sent_at: string | null;
  scheduled_date: string;
  scheduled_time: string;
  clients?: { id: string; full_name: string } | null;
  branches?: { id: string; name: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTimeOnly(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t: string | null): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const SEV_CFG: Record<string, string> = {
  Critical: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-amber-50 text-amber-700 border-amber-200',
  Medium: 'bg-blue-50 text-blue-700 border-blue-200',
  Low: 'bg-slate-50 text-slate-600 border-slate-200',
};

// ─── Needs Attention computation (shared logic) ───────────────────────────────

export function computeNeedsAttention(appts: AppointmentRowLite[]): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = [];
  appts.forEach(a => {
    if (a.status === 'scheduled' && a.intake_form_status === 'PENDING') {
      items.push({ appt: a, issue: 'Intake pending', severity: 'High', action: 'Review intake' });
    }
    if (a.status === 'arrived' && a.intake_form_status !== 'COMPLETED') {
      items.push({ appt: a, issue: 'Intake incomplete at arrival', severity: 'Critical', action: 'Complete intake' });
    }
    if (a.status === 'scheduled' && !a.booking_id) {
      items.push({ appt: a, issue: 'No booking/intake linked', severity: 'Medium', action: 'Link booking' });
    }
    if (a.status === 'completed' && a.clients && !a.feedback_email_sent_at) {
      items.push({ appt: a, issue: 'Feedback pending', severity: 'Low', action: 'Send feedback QR' });
    }
  });
  return items;
}

// ─── Needs Attention Widget ───────────────────────────────────────────────────

export function NeedsAttentionWidget({
  items,
  onSelect,
}: {
  items: NeedsAttentionItem[];
  onSelect?: (appt: AppointmentRowLite) => void;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Patient Alerts
        </h3>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-400">No alerts — all patients are on track.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {items.slice(0, 10).map((item, i) => {
            const Row = onSelect ? 'button' : 'div';
            return (
              <Row
                key={i}
                {...(onSelect ? { onClick: () => onSelect(item.appt) } : {})}
                className={`w-full flex items-center gap-3 px-5 py-3.5 ${onSelect ? 'hover:bg-slate-50 transition-colors text-left' : ''}`}
              >
                <div className={`flex-shrink-0 w-2 h-2 rounded-full ${item.severity === 'Critical' ? 'bg-red-500' : item.severity === 'High' ? 'bg-amber-500' : item.severity === 'Medium' ? 'bg-blue-500' : 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {item.appt.clients?.full_name ?? 'Unknown Client'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.appt.scheduled_date ? fmtDate(item.appt.scheduled_date) : ''} at {item.appt.scheduled_time ? fmtTime(item.appt.scheduled_time) : '—'} · {item.issue}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-bold ${SEV_CFG[item.severity]}`}>
                  {item.severity}
                </span>
                {onSelect && <ChevronRight className="w-4 h-4 text-slate-300" />}
              </Row>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Attendance Widget ────────────────────────────────────────────────────────

export function AttendanceWidget({
  userEmail,
  branchId,
}: {
  userEmail: string;
  branchId: string | null;
}) {
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [clockingIn, setClockingIn] = useState(false);
  const [photoModal, setPhotoModal] = useState<{ mode: 'in' | 'out' } | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAttendance = useCallback(async () => {
    const [logsRes, activeRes] = await Promise.all([
      supabase.from('time_logs').select('*').eq('staff_name', userEmail).order('clock_in', { ascending: false }).limit(30),
      supabase.from('time_logs').select('*').eq('staff_name', userEmail).is('clock_out', null).order('clock_in', { ascending: false }).maybeSingle(),
    ]);
    if (logsRes.data) setTimeLogs(logsRes.data as TimeLog[]);
    if (activeRes.data) setActiveLog(activeRes.data as TimeLog);
    else setActiveLog(null);
  }, [userEmail]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  async function uploadAttendancePhoto(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `attendance/${userEmail.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('attendance-photos').upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) return null;
    // Path, not public URL — the bucket is private; reads sign on demand.
    return fileName;
  }

  async function handleClockIn(photoFile: File) {
    setUploadingPhoto(true);
    const photoUrl = await uploadAttendancePhoto(photoFile);
    setUploadingPhoto(false);
    if (!photoUrl) { setError('Failed to upload photo. Please try again.'); return; }
    setClockingIn(true);
    const { error: insertErr } = await supabase.from('time_logs').insert({
      staff_name: userEmail,
      branch_id: branchId ?? null,
      clock_in: new Date().toISOString(),
      clock_in_photo_url: photoUrl,
    });
    if (insertErr) { setError('Failed to clock in.'); setClockingIn(false); return; }
    setSuccessMsg('Clocked in successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
    loadAttendance();
    setClockingIn(false);
  }

  async function handleClockOut(photoFile: File) {
    if (!activeLog) return;
    setUploadingPhoto(true);
    const photoUrl = await uploadAttendancePhoto(photoFile);
    setUploadingPhoto(false);
    if (!photoUrl) { setError('Failed to upload photo. Please try again.'); return; }
    setClockingIn(true);
    const { error: updateErr } = await supabase.from('time_logs').update({ clock_out: new Date().toISOString(), clock_out_photo_url: photoUrl }).eq('id', activeLog.id);
    if (updateErr) { setError('Failed to clock out.'); setClockingIn(false); return; }
    setSuccessMsg('Clocked out successfully.');
    setTimeout(() => setSuccessMsg(null), 4000);
    loadAttendance();
    setClockingIn(false);
  }

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCapturedPhoto(reader.result as string);
    reader.readAsDataURL(file);
    (fileInputRef.current as any)._selectedFile = file;
  }

  async function confirmPhoto() {
    const file = (fileInputRef.current as any)._selectedFile as File | undefined;
    if (!file || !photoModal) return;
    setPhotoModal(null); setCapturedPhoto(null);
    (fileInputRef.current as any)._selectedFile = null;
    if (photoModal.mode === 'in') await handleClockIn(file);
    else await handleClockOut(file);
  }

  function closePhotoModal() {
    setPhotoModal(null); setCapturedPhoto(null);
    (fileInputRef.current as any)._selectedFile = null;
  }

  return (
    <>
      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeLog ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              <CalendarCheck className={`w-5 h-5 ${activeLog ? 'text-emerald-600' : 'text-slate-400'}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Attendance</p>
              <p className="text-sm text-slate-400">
                {activeLog ? `Clocked in ${fmtTimeOnly(activeLog.clock_in)}` : 'Not clocked in today'}
                {activeLog && activeLog.clock_in && (
                  <> · Working {Math.floor((Date.now() - new Date(activeLog.clock_in).getTime()) / 3600000)}h {Math.floor(((Date.now() - new Date(activeLog.clock_in).getTime()) % 3600000) / 60000)}m</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${activeLog ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${activeLog ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {activeLog ? 'On Shift' : 'Off Shift'}
            </span>
            {activeLog ? (
              <button onClick={() => setPhotoModal({ mode: 'out' })} disabled={clockingIn || uploadingPhoto} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50">
                {clockingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Clock Out
              </button>
            ) : (
              <button onClick={() => setPhotoModal({ mode: 'in' })} disabled={clockingIn || uploadingPhoto} className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50">
                {clockingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} Clock In
              </button>
            )}
          </div>
        </div>
        {successMsg && <div className="flex items-center gap-2.5 mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"><CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" /><p className="text-sm text-emerald-700 font-medium">{successMsg}</p></div>}
        {error && <div className="flex items-center gap-2.5 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><X className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-sm text-red-700 font-medium">{error}</p></div>}
      </section>

      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closePhotoModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2"><Camera className="w-5 h-5 text-teal-600" /><h3 className="text-base font-bold text-slate-800">{photoModal.mode === 'in' ? 'Clock In' : 'Clock Out'} Photo</h3></div>
              <button onClick={closePhotoModal} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {capturedPhoto ? (
                <div className="relative">
                  <img src={capturedPhoto} alt="Preview" className="w-full rounded-xl object-cover max-h-64" />
                  <button onClick={() => { setCapturedPhoto(null); (fileInputRef.current as any)._selectedFile = null; }} className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full hover:bg-black/80 transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition-colors">
                  <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center"><Camera className="w-7 h-7 text-teal-600" /></div>
                  <p className="text-sm font-semibold text-slate-600">Take or upload a photo</p>
                  <p className="text-xs text-slate-400">Click here to use your camera or select a file</p>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" capture="user" onChange={onPhotoSelected} className="hidden" />
              {capturedPhoto && (
                <button onClick={confirmPhoto} disabled={uploadingPhoto || clockingIn} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
                  {uploadingPhoto || clockingIn ? <><Loader2 className="w-4 h-4 animate-spin" /> {photoModal.mode === 'in' ? 'Clocking in...' : 'Clocking out...'}</> : <><CheckCircle className="w-4 h-4" /> Confirm {photoModal.mode === 'in' ? 'Clock In' : 'Clock Out'}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
