import { useState } from 'react';
import {
  Droplets, Clock, XCircle, Loader2, LogOut, RefreshCw,
  CheckCircle2, ShieldCheck, Mail,
} from 'lucide-react';
import type { TeamMember } from '../lib/supabase';

interface Props {
  member: TeamMember | null;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
}

export default function PendingApproval({ member, onRefresh, onLogout }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isRejected = member?.status === 'rejected';

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    onLogout();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
            <Droplets className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Cleanse &amp; Drip</h1>
          <p className="text-slate-400 text-sm mt-1">Booking &amp; Operations Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className={`h-1.5 ${isRejected ? 'bg-gradient-to-r from-red-400 to-rose-400' : 'bg-gradient-to-r from-amber-400 to-orange-400'}`} />

          <div className="p-8">
            {isRejected ? (
              <>
                {/* Rejected state */}
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <XCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Access Not Granted</h2>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Your account request was not approved by the administrator.
                  </p>
                </div>

                {member?.email && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400">Registered as</p>
                      <p className="text-sm font-semibold text-slate-800">{member.email}</p>
                    </div>
                  </div>
                )}

                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-6">
                  <p className="text-xs text-red-700 leading-relaxed">
                    If you believe this is a mistake, please contact the system administrator to request a review of your account.
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Pending state */}
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8 text-amber-500" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">Pending Approval</h2>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Your account has been created and is now awaiting review by a superadmin.
                  </p>
                </div>

                {/* Step tracker */}
                <div className="flex items-center justify-center gap-0 mb-6">
                  <StatusStep label="Account Created" done />
                  <StatusConnector done />
                  <StatusStep label="Under Review" active />
                  <StatusConnector />
                  <StatusStep label="Access Granted" />
                </div>

                {member?.email && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-5 flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-400">Registered as</p>
                      <p className="text-sm font-semibold text-slate-800">{member.email}</p>
                    </div>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-6">
                  <p className="text-xs font-bold text-amber-700 mb-1">What happens next?</p>
                  <ul className="space-y-1">
                    {[
                      'A Superadmin will review and approve your account.',
                      'Once approved, you\'ll have full dashboard access.',
                      'Use "Check Approval Status" below to check for updates.',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-600 leading-relaxed">
                        <span className="font-bold mt-0.5">{i + 1}.</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="space-y-3">
              {!isRejected && (
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-60 transition-colors text-sm"
                >
                  {refreshing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</>
                    : <><RefreshCw className="w-4 h-4" /> Check Approval Status</>}
                </button>
              )}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-colors text-sm"
              >
                {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Bottom note */}
        <div className="mt-6 space-y-1.5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <p className="text-xs text-slate-400">Team members portal · Access is by approval only</p>
          </div>
          <p className="text-xs text-slate-600">Client self-service booking coming soon.</p>
        </div>
      </div>
    </div>
  );
}

function StatusStep({ label, done = false, active = false }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
        done ? 'bg-emerald-500 text-white'
          : active ? 'bg-amber-500 text-white ring-4 ring-amber-100'
          : 'bg-slate-100 text-slate-400'
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : active ? '2' : '3'}
      </div>
      <span className={`text-[10px] font-semibold text-center leading-tight max-w-[60px] ${
        done ? 'text-emerald-600' : active ? 'text-amber-600' : 'text-slate-400'
      }`}>
        {label}
      </span>
    </div>
  );
}

function StatusConnector({ done = false }: { done?: boolean }) {
  return <div className={`w-8 h-0.5 mb-4 flex-shrink-0 ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />;
}
