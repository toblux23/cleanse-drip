import { useState } from 'react';
import { CheckCircle, MessageSquare, Star, Loader2, MapPin } from 'lucide-react';
import { supabase, SERVICES } from '../lib/supabase';

type YesNo = 'Yes' | 'No' | '';
type YesNoMaybe = 'Yes' | 'No' | 'Maybe' | '';
type MarketingConsent = 'Yes, with my name' | 'Yes, but anonymously' | 'No' | '';

interface FeedbackState {
  name: string;
  service_availed: string;
  overall_satisfaction: number;
  staff_professionalism: number;
  procedure_explained: YesNo;
  avail_again: YesNoMaybe;
  recommend: YesNoMaybe;
  liked_most: string;
  comments_suggestions: string;
  marketing_consent: MarketingConsent;
}

const INITIAL: FeedbackState = {
  name: '',
  service_availed: '',
  overall_satisfaction: 0,
  staff_professionalism: 0,
  procedure_explained: '',
  avail_again: '',
  recommend: '',
  liked_most: '',
  comments_suggestions: '',
  marketing_consent: '',
};

function SectionLabel({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
      <div className="w-7 h-7 bg-cyan-50 rounded-lg flex items-center justify-center">
        <Icon className="w-4 h-4 text-cyan-600" />
      </div>
      <span className="text-xs font-bold tracking-widest text-cyan-700 uppercase">{text}</span>
    </div>
  );
}

function RadioGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2.5">
      {options.map(opt => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              selected
                ? 'border-cyan-500 bg-cyan-50'
                : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                selected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300'
              }`}
            >
              {selected && <div className="w-2 h-2 rounded-full bg-white" />}
            </div>
            <span className={`text-sm font-semibold ${selected ? 'text-cyan-700' : 'text-slate-600'}`}>
              {opt.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(n)}
            className="p-1 transition-transform hover:scale-110 focus:outline-none"
          >
            <Star
              className={`w-8 h-8 transition-colors ${
                n <= (hovered || value)
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-slate-100 text-slate-300'
              }`}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs font-medium text-slate-400 px-1 max-w-xs">
        <span>Not Satisfied</span>
        <span>Very Satisfied</span>
      </div>
      {value > 0 && (
        <p className="text-xs text-cyan-600 font-semibold">
          {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][value]} ({value}/5)
        </p>
      )}
    </div>
  );
}

export default function FeedbackForm() {
  // Read source + pre-fill params from URL hash (e.g. #feedback?src=nurse&appointment_id=...)
  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const urlSource = hashParams.get('src') ?? null;
  const urlName   = hashParams.get('name') ?? '';
  const urlApptId = hashParams.get('appointment_id') ?? null;
  const isEmailPath = urlSource === 'email';

  const [form, setForm] = useState<FeedbackState>({ ...INITIAL, name: urlName });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FeedbackState>(key: K, value: FeedbackState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.service_availed) { setError('Please select the service you availed.'); return; }
    if (form.overall_satisfaction === 0) { setError('Please rate your overall experience.'); return; }
    if (form.staff_professionalism === 0) { setError('Please rate staff professionalism.'); return; }
    if (!form.procedure_explained) { setError('Please answer whether the procedure was explained.'); return; }
    if (!form.avail_again) { setError('Please answer if you would avail again.'); return; }
    if (!form.recommend) { setError('Please answer if you would recommend us.'); return; }
    if (!form.marketing_consent) { setError('Please select your marketing consent preference.'); return; }

    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      service_availed: form.service_availed,
      overall_satisfaction: form.overall_satisfaction,
      staff_professionalism: form.staff_professionalism,
      procedure_explained: form.procedure_explained,
      avail_again: form.avail_again,
      recommend: form.recommend,
      liked_most: form.liked_most.trim(),
      comments_suggestions: form.comments_suggestions.trim(),
      marketing_consent: form.marketing_consent,
      source: urlSource,
      appointment_id: urlApptId,
    };
    const { error: dbError } = await supabase.from('client_feedback').insert(payload);

    setSubmitting(false);
    if (dbError) {
      setError('Something went wrong. Please try again.');
      return;
    }
    // Fire-and-forget: email failure never blocks the success screen
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-email`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'feedback', data: payload }),
      },
    ).catch(() => {});
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-cyan-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Thank You!</h2>
          <p className="text-slate-500 leading-relaxed mb-8">
            We appreciate your valuable feedback,{' '}
            <span className="font-semibold text-slate-700">{form.name || 'valued client'}</span>. Your
            wellness journey matters to us.
          </p>
          <button
            onClick={() => { setForm(INITIAL); setSubmitted(false); }}
            className="w-full py-3 px-6 bg-cyan-600 text-white font-semibold rounded-xl hover:bg-cyan-700 transition-colors"
          >
            Submit Another Response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 mb-6 overflow-hidden relative">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-500" />
          <div className="flex items-start gap-4 mt-2">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-cyan-600 uppercase mb-1">
                Cleanse & Drip Booking Engine v1.0
              </p>
              <h1 className="text-2xl font-bold text-slate-900 leading-tight">
                {isEmailPath && urlName ? `Hi, ${urlName}!` : 'Client Feedback'}
              </h1>
              <p className="text-slate-500 mt-1.5 text-sm leading-relaxed">
                {isEmailPath
                  ? 'Thank you for your recent session. Your honest feedback helps us improve. All responses are confidential.'
                  : 'Thank you for choosing our services. Your feedback helps us improve and provide the best care possible. Please answer honestly. All responses are confidential.'}
              </p>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-red-500 font-medium">* Indicates required field</p>
            {urlSource && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 border border-cyan-200 rounded-xl text-xs font-bold text-cyan-700">
                <MapPin className="w-3.5 h-3.5" />
                {urlSource}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              Name
            </label>
            <input
              type="text"
              placeholder="Your answer"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border-0 border-b-2 border-slate-200 focus:border-cyan-500 outline-none py-2.5 text-slate-800 placeholder-slate-300 bg-transparent transition-colors text-base"
            />
          </div>

          {/* Service availed */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
              Which service did you avail? <span className="text-red-500">*</span>
            </label>
            <RadioGroup
              value={form.service_availed as string}
              options={SERVICES.map(s => ({ label: s.label, value: s.id }))}
              onChange={v => set('service_availed', v)}
            />
          </div>

          {/* Satisfaction ratings */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <SectionLabel icon={Star} text="Service Ratings" />
            <div className="space-y-8">
              <div>
                <p className="text-sm font-bold text-slate-700 mb-4">
                  How satisfied are you with your overall experience?{' '}
                  <span className="text-red-500">*</span>
                </p>
                <StarRating
                  value={form.overall_satisfaction}
                  onChange={v => set('overall_satisfaction', v)}
                />
              </div>
              <div className="border-t border-slate-100 pt-6">
                <p className="text-sm font-bold text-slate-700 mb-4">
                  How would you rate the professionalism of our staff/nurses?{' '}
                  <span className="text-red-500">*</span>
                </p>
                <StarRating
                  value={form.staff_professionalism}
                  onChange={v => set('staff_professionalism', v)}
                />
              </div>
            </div>
          </div>

          {/* Procedure explained */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
              Was the procedure properly explained to you before treatment?{' '}
              <span className="text-red-500">*</span>
            </label>
            <RadioGroup
              value={form.procedure_explained}
              options={[{ label: 'Yes', value: 'Yes' }, { label: 'No', value: 'No' }]}
              onChange={v => set('procedure_explained', v as YesNo)}
            />
          </div>

          {/* Avail again */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
              Would you avail of our services again?{' '}
              <span className="text-red-500">*</span>
            </label>
            <RadioGroup
              value={form.avail_again}
              options={[
                { label: 'Yes', value: 'Yes' },
                { label: 'No', value: 'No' },
                { label: 'Maybe', value: 'Maybe' },
              ]}
              onChange={v => set('avail_again', v as YesNoMaybe)}
            />
          </div>

          {/* Recommend */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
              Would you recommend our services to others?{' '}
              <span className="text-red-500">*</span>
            </label>
            <RadioGroup
              value={form.recommend}
              options={[
                { label: 'Yes', value: 'Yes' },
                { label: 'No', value: 'No' },
                { label: 'Maybe', value: 'Maybe' },
              ]}
              onChange={v => set('recommend', v as YesNoMaybe)}
            />
          </div>

          {/* Liked most */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              What did you like most about your experience with us?{' '}
              <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              placeholder="Your answer"
              rows={3}
              value={form.liked_most}
              onChange={e => set('liked_most', e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-300"
            />
          </div>

          {/* Comments */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              Comments or Suggestions <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              placeholder="Your answer"
              rows={3}
              value={form.comments_suggestions}
              onChange={e => set('comments_suggestions', e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-slate-300"
            />
          </div>

          {/* Marketing consent */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-7">
            <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
              May we use your feedback/testimonial for marketing purposes?{' '}
              <span className="text-red-500">*</span>
            </label>
            <RadioGroup
              value={form.marketing_consent}
              options={[
                { label: 'Yes, with my name', value: 'Yes, with my name' },
                { label: 'Yes, but anonymously', value: 'Yes, but anonymously' },
                { label: 'No', value: 'No' },
              ]}
              onChange={v => set('marketing_consent', v as MarketingConsent)}
            />
            <div className="mt-5 p-4 bg-cyan-50 rounded-xl border border-cyan-100">
              <p className="text-xs text-cyan-700 leading-relaxed font-medium">
                Thank you for your valuable feedback! We appreciate your trust and support.
                Your wellness journey matters to us.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center gap-4 pb-6">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-cyan-600 text-white font-semibold rounded-xl hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
            <button
              type="button"
              onClick={() => { setForm(INITIAL); setError(null); }}
              className="px-6 py-3 text-slate-500 font-medium hover:text-slate-700 transition-colors"
            >
              Clear form
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
