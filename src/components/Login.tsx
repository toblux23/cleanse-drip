import { useState } from 'react';
import {
  Droplets, Mail, Lock, Loader2, AlertCircle, UserPlus, LogIn,
  Eye, EyeOff, ShieldCheck, ChevronDown, ChevronUp, CheckCircle2,
  Users, Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup' | 'created';

const TERMS = [
  'This portal is for authorized Cleanse & Drip team members only. Clients do not use this system.',
  'Access is subject to administrator approval. Your account will be reviewed before you can log in.',
  'You are solely responsible for keeping your credentials confidential. Do not share your password.',
  'All client booking data you access through this portal is confidential and must not be shared externally.',
  'Misuse of this system or unauthorized access to client data may result in immediate account revocation.',
  'By creating an account, you confirm you are an authorized employee or affiliate of Cleanse & Drip.',
];

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState('');

  function switchMode(m: 'signin' | 'signup') {
    setMode(m);
    setError(null);
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    setShowConfirm(false);
    setAgreedToTerms(false);
    setShowTerms(false);
  }

  function passwordStrength(p: string): { label: string; color: string; width: string } {
    if (p.length === 0) return { label: '', color: '', width: 'w-0' };
    if (p.length < 6) return { label: 'Too short', color: 'bg-red-400', width: 'w-1/4' };
    if (p.length < 8) return { label: 'Weak', color: 'bg-orange-400', width: 'w-2/4' };
    if (p.length < 12 && !/[^a-zA-Z0-9]/.test(p)) return { label: 'Fair', color: 'bg-yellow-400', width: 'w-3/4' };
    return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (password !== confirm) { setError('Passwords do not match.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (!agreedToTerms) { setError('Please read and agree to the Terms of Use before continuing.'); return; }
    }

    setLoading(true);

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setLoading(false);
      if (err) {
        setError(
          err.message.toLowerCase().includes('invalid')
            ? 'Invalid email or password. Please check your credentials and try again.'
            : err.message,
        );
      }
    } else {
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
      setLoading(false);
      if (err) {
        setError(
          err.message.toLowerCase().includes('already')
            ? 'An account with this email already exists. Try signing in instead.'
            : err.message,
        );
      } else {
        setCreatedEmail(email.trim());
        setMode('created');
      }
    }
  }

  const strength = passwordStrength(password);

  // ─── Account Created ───────────────────────────────────────────────────────
  if (mode === 'created') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <BrandMark />
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-teal-400 to-cyan-400" />
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Account Request Submitted</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-5">
                Your account has been created and is now awaiting approval from a superadmin.
                You'll be able to access the dashboard once your request is reviewed.
              </p>

              {/* Step tracker */}
              <div className="flex items-center justify-center gap-0 mb-6">
                <Step label="Account Created" done />
                <Connector />
                <Step label="Under Review" active />
                <Connector />
                <Step label="Access Granted" />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-6 text-left">
                <p className="text-xs text-slate-400 mb-0.5">Registered as</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{createdEmail}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3 mb-6 text-left">
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Please be patient while we verify your identity. You will gain access once a Superadmin approves your request.
                </p>
              </div>

              <button
                onClick={() => { setMode('signin'); setEmail(''); setPassword(''); setConfirm(''); }}
                className="w-full py-3 border-2 border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm"
              >
                Back to Sign In
              </button>
            </div>
          </div>
          <BottomNote />
        </div>
      </div>
    );
  }

  // ─── Sign In / Sign Up ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <BrandMark />

        {/* Members-only badge */}
        <div className="flex justify-center mb-5">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm rounded-full px-4 py-2">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span className="text-xs font-semibold text-white/80 tracking-wide">Team Members Only</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-teal-400 to-cyan-400" />

          {/* Mode tabs */}
          <div className="flex border-b border-slate-100">
            {([
              { key: 'signin' as const, label: 'Sign In', icon: LogIn },
              { key: 'signup' as const, label: 'Create Account', icon: UserPlus },
            ]).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => switchMode(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition-colors ${
                  mode === tab.key
                    ? 'text-teal-700 border-b-2 border-teal-500 bg-teal-50/50'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-7 space-y-4">
            {/* Sign-up notice */}
            {mode === 'signup' && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                <Users className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-600 mb-0.5">This portal is for team members only.</p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    New accounts require superadmin approval before access is granted. Client booking features are separate.
                  </p>
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  placeholder="you@cleansedrip.ph"
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700 placeholder-slate-300"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700 placeholder-slate-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength bar */}
              {mode === 'signup' && password.length > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                  </div>
                  <p className={`text-[11px] mt-1 font-medium ${strength.color.replace('bg-', 'text-').replace('-400', '-600').replace('-500', '-600')}`}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password (signup only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    value={confirm}
                    placeholder="Re-enter your password"
                    onChange={e => setConfirm(e.target.value)}
                    className={`w-full pl-10 pr-11 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-700 placeholder-slate-300 ${
                      confirm.length > 0 && confirm !== password
                        ? 'border-red-300 bg-red-50/30'
                        : confirm.length > 0 && confirm === password
                          ? 'border-emerald-300'
                          : 'border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirm.length > 0 && confirm !== password && (
                  <p className="text-[11px] text-red-500 mt-1 font-medium">Passwords do not match</p>
                )}
                {confirm.length > 0 && confirm === password && (
                  <p className="text-[11px] text-emerald-600 mt-1 font-medium">Passwords match</p>
                )}
              </div>
            )}

            {/* Terms & Conditions (signup only) */}
            {mode === 'signup' && (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTerms(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Terms of Use</span>
                  {showTerms
                    ? <ChevronUp className="w-4 h-4 text-slate-400" />
                    : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {showTerms && (
                  <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50">
                    <ol className="mt-3 space-y-2">
                      {TERMS.map((t, i) => (
                        <li key={i} className="flex gap-2 text-xs text-slate-500 leading-relaxed">
                          <span className="font-bold text-slate-400 flex-shrink-0">{i + 1}.</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <label className="flex items-start gap-3 px-4 pb-4 pt-3 cursor-pointer border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={e => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 flex-shrink-0"
                  />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    I have read and agree to the <span className="font-semibold text-teal-700">Terms of Use</span> above.
                    I confirm I am an authorized Cleanse &amp; Drip team member.
                  </span>
                </label>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm text-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'signin' ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In to Dashboard' : 'Submit Account Request'}
            </button>

            {/* Sign-in disclaimer */}
            {mode === 'signin' && (
              <p className="text-center text-xs text-slate-400 leading-relaxed">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-teal-600 font-semibold hover:underline"
                >
                  Create one here
                </button>
                . Accounts require admin approval.
              </p>
            )}
          </form>
        </div>

        <BottomNote />
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function BrandMark() {
  return (
    <div className="text-center mb-6">
      <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
        <Droplets className="w-8 h-8 text-white" />
      </div>
      <h1 className="text-2xl font-bold text-white tracking-tight">Cleanse &amp; Drip</h1>
      <p className="text-slate-400 text-sm mt-1">Booking &amp; Operations Dashboard</p>
    </div>
  );
}

function BottomNote() {
  return (
    <div className="mt-6 space-y-2 text-center">
      <p className="text-xs text-slate-500">
        This portal is for <span className="text-slate-300 font-medium">team members only</span>.
        Clients do not use this system.
      </p>
      <p className="text-xs text-slate-600">
        Client self-service booking coming soon.
      </p>
    </div>
  );
}

function Step({ label, done = false, active = false }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done ? 'bg-emerald-500 text-white' : active ? 'bg-teal-600 text-white ring-4 ring-teal-100' : 'bg-slate-100 text-slate-400'
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : active ? '2' : '3'}
      </div>
      <span className={`text-[10px] font-semibold text-center leading-tight max-w-[60px] ${
        done ? 'text-emerald-600' : active ? 'text-teal-700' : 'text-slate-400'
      }`}>
        {label}
      </span>
    </div>
  );
}

function Connector() {
  return <div className="w-8 h-0.5 bg-slate-200 mb-4 flex-shrink-0" />;
}
