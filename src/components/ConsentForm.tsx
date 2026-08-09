import { useState, useEffect, useRef } from 'react';
import {
  CheckCircle, PenLine, X, AlertCircle, Loader2, ShieldCheck, FileText, User, Calendar,
} from 'lucide-react';
import { supabase, type Appointment } from '../lib/supabase';

type FormType = 'consent' | 'waiver';

interface ApptRow {
  id: string;
  client_id: string | null;
  client_name: string;
  service: string | null;
  scheduled_date: string;
  scheduled_time: string;
}

export default function ConsentForm() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const urlApptId = params.get('appointment_id') ?? null;
  const urlClientId = params.get('client_id') ?? null;
  const urlFormType = (params.get('form_type') as FormType | null) ?? 'consent';

  const [appt, setAppt] = useState<ApptRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formType, setFormType] = useState<FormType>(urlFormType);
  const [signatoryName, setSignatoryName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [existingRecords, setExistingRecords] = useState<{ id: string; form_type: string; status: string; signed_at: string | null }[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    if (!urlApptId) { setError('Missing appointment ID in link.'); setLoading(false); return; }
    (async () => {
      const { data, error: apptErr } = await supabase
        .from('appointments')
        .select(`id, client_id, scheduled_date, scheduled_time, service, clients(full_name)`)
        .eq('id', urlApptId)
        .maybeSingle();

      if (apptErr || !data) { setError('Unable to load appointment details.'); setLoading(false); return; }

      const a = data as any;
      setAppt({
        id: a.id,
        client_id: a.client_id ?? (urlClientId || null),
        client_name: a.clients?.full_name ?? '',
        service: a.service ?? null,
        scheduled_date: a.scheduled_date ?? '',
        scheduled_time: a.scheduled_time ?? '',
      });
      setSignatoryName(a.clients?.full_name ?? '');

      // Check for existing signed records
      const { data: existing } = await supabase
        .from('client_consent_records')
        .select('id, form_type, status, signed_at')
        .eq('appointment_id', urlApptId)
        .order('created_at', { ascending: false });

      setExistingRecords((existing ?? []) as any);
      setLoading(false);
    })();
  }, [urlApptId, urlClientId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDraw() { setDrawing(false); }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSave() {
    if (!hasSignature) { setError('Please draw a signature first.'); return; }
    if (!signatoryName.trim()) { setError('Signatory name is required.'); return; }
    if (!acknowledged) { setError('Client must acknowledge the consent statement.'); return; }
    if (!appt) { setError('Appointment details not loaded.'); return; }

    setSaving(true);
    setError(null);

    try {
      const canvas = canvasRef.current!;
      const signatureData = canvas.toDataURL('image/png');
      const now = new Date().toISOString();

      const payload = {
        client_id: appt.client_id,
        appointment_id: appt.id,
        service: appt.service,
        form_version: 'v1',
        form_type: formType,
        status: 'signed',
        signatory_name: signatoryName.trim(),
        signature_data: signatureData,
        signed_at: now,
        submission_method: 'qr_code',
        witness_user_id: null,
        ip_address: null,
        user_agent: navigator.userAgent,
      };
      console.log('CONSENT PAYLOAD (raw):', JSON.parse(JSON.stringify(payload)));
      console.log('CONSENT UUID FIELDS:', {
        client_id: { value: payload.client_id, type: typeof payload.client_id },
        appointment_id: { value: payload.appointment_id, type: typeof payload.appointment_id },
        witness_user_id: { value: payload.witness_user_id, type: typeof payload.witness_user_id },
      });

      const { error: insertErr } = await supabase.from('client_consent_records').insert(payload);

      if (insertErr) {
        console.error('Consent save error — code:', (insertErr as any).code);
        console.error('Consent save error — message:', (insertErr as any).message);
        console.error('Consent save error — details:', (insertErr as any).details);
        console.error('Consent save error — hint:', (insertErr as any).hint);
        console.error('Consent save error — full:', insertErr);
        setError(`[DEBUG] code=${(insertErr as any).code} | message=${(insertErr as any).message} | UUIDs: client_id=${JSON.stringify(payload.client_id)} appointment_id=${JSON.stringify(payload.appointment_id)} witness_user_id=${JSON.stringify(payload.witness_user_id)} | full_payload=${JSON.stringify(payload)}`);
        return;
      }

      setSaved(true);
    } catch (err) {
      console.error('Consent save exception:', err);
      setError('Unable to save the consent form. Please review the required information and try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Consent Recorded</h2>
          <p className="text-slate-500 leading-relaxed mb-6">
            Thank you, <span className="font-semibold text-slate-700">{signatoryName}</span>. Your {formType} has been signed and recorded.
          </p>
        </div>
      </div>
    );
  }

  if (error && !appt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to Load</h2>
          <p className="text-slate-500 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  const hasSigned = existingRecords.some(r => r.status === 'signed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-cyan-50/20 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 mb-6 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-teal-400 to-cyan-500" />
          <div className="flex items-start gap-4 mt-2">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
              <PenLine className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-teal-600 uppercase mb-1">Cleanse & Drip</p>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight capitalize">{formType} & Waiver Form</h1>
              <p className="text-slate-500 mt-1.5 text-sm leading-relaxed">Please review and sign the {formType} below.</p>
            </div>
          </div>
        </div>

        {hasSigned && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-5">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <p className="text-sm text-emerald-700 font-medium">A signed {formType} record already exists for this appointment. Signing again will create a new version.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7 space-y-5">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Form type toggle */}
          <div className="flex gap-2">
            {(['consent', 'waiver'] as const).map(t => (
              <button key={t} onClick={() => setFormType(t)} className={`px-4 py-2 text-sm font-bold rounded-xl border-2 transition-colors capitalize ${formType === t ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{t === 'consent' ? 'Consent' : 'Waiver'}</button>
            ))}
          </div>

          {/* Client info */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1">
            <p className="text-sm font-bold text-slate-700">{appt?.client_name ?? 'Unknown Client'}</p>
            <p className="text-xs text-slate-400">{appt?.service} · {appt?.scheduled_date} at {appt?.scheduled_time}</p>
          </div>

          {/* Consent text */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-slate-700 leading-relaxed">
              I, the undersigned, consent to the {formType === 'waiver' ? 'waiver and release of liability for' : 'performance of'} the treatment/procedure described above.
              I have been informed of the nature, risks, benefits, and alternatives, and I have had the opportunity to ask questions.
              I confirm that the information I have provided is accurate and I have disclosed any changes since my previous visit.
            </p>
          </div>

          {/* Signatory name */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Signatory Full Name</label>
            <input type="text" value={signatoryName} onChange={e => setSignatoryName(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" placeholder="Enter full legal name" />
          </div>

          {/* Signature pad */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Signature</label>
            <div className="relative">
              <canvas ref={canvasRef} width={500} height={180} className="w-full border-2 border-slate-200 rounded-xl touch-none bg-white cursor-crosshair" onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
              {!hasSignature && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-300 pointer-events-none">Draw signature here</p>}
            </div>
            <button onClick={clearCanvas} className="mt-2 text-xs font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1"><X className="w-3 h-3" /> Clear signature</button>
          </div>

          {/* Acknowledgment */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-400" />
            <span className="text-xs text-slate-600 leading-relaxed">I confirm that the information shown is accurate and I have disclosed any changes since my previous visit.</span>
          </label>

          <button onClick={handleSave} disabled={saving || !hasSignature || !acknowledged || !signatoryName.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Sign & Lock Record'}
          </button>
        </div>
      </div>
    </div>
  );
}
