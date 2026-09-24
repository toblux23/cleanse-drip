import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ClipboardList, LayoutDashboard, MessageSquare, Droplets } from 'lucide-react';
import { supabase, type TeamMember } from './lib/supabase';
import BookingForm from './components/BookingForm';
import FeedbackForm from './components/FeedbackForm';
import ConsentForm from './components/ConsentForm';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import PendingApproval from './components/PendingApproval';

type View = 'booking' | 'feedback' | 'consent' | 'dashboard';

function hashToView(hash: string): View {
  const h = hash.replace('#', '').split('?')[0];
  if (h === 'feedback') return 'feedback';
  if (h === 'consent') return 'consent';
  if (h === 'dashboard') return 'dashboard';
  return 'booking';
}

export default function App() {
  const [view, setView] = useState<View>(() => hashToView(window.location.hash));
  const [session, setSession] = useState<Session | null>(null);
  const [memberRecord, setMemberRecord] = useState<TeamMember | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [authChecked, setAuthChecked] = useState(false);

  // Sync view → hash. Only rewrite when actually navigating to a different
  // view — a query string already on the current view's hash (e.g. an
  // appointment_id from a QR-scanned consent/feedback link) must survive
  // reload, or ConsentForm/FeedbackForm lose it on their very next re-render.
  useEffect(() => {
    const currentRoute = window.location.hash.replace('#', '').split('?')[0];
    if (currentRoute !== view) {
      window.location.hash = view;
    }
  }, [view]);

  // Browser back/forward support
  useEffect(() => {
    function onHashChange() {
      setView(hashToView(window.location.hash));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  async function fetchMember(userId: string) {
    const { data: rawData } = await supabase
      .from('team_members')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    // Defense in depth: the server should never return a row for a different
    // user_id than requested, but don't trust a mismatched row as "self" if it
    // ever does — that row's role/status must never drive this session's permissions.
    const data = rawData && rawData.user_id === userId ? rawData : null;
    setMemberRecord(data);

    if (data?.role && data.status === 'approved') {
      // No parameters here on purpose — get_my_permissions() derives the caller
      // entirely from auth.uid() server-side, so there's no client-supplied id
      // (role_id, user_id, etc.) left in this request for anyone to substitute.
      const { data: permKeys, error: permErr } = await supabase.rpc('get_my_permissions');
      setPermissions(permErr || !permKeys ? new Set() : new Set(permKeys as string[]));
    } else {
      setPermissions(new Set());
    }
  }

  const refreshMemberRecord = useCallback(async () => {
    if (!session) return;
    await fetchMember(session.user.id);
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: sess } }) => {
      setSession(sess);
      if (sess) await fetchMember(sess.user.id);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, sess) => {
      (async () => {
        setSession(sess);
        if (sess) {
          await fetchMember(sess.user.id);
        } else {
          setMemberRecord(null);
          setPermissions(new Set());
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Determine what to render for the dashboard tab
  function renderDashboardContent() {
    if (!session) return <Login />;

    // Still loading member record after sign-in
    if (session && memberRecord === null && authChecked) {
      // memberRecord is null — could be loading or genuinely missing
      // We treat no record as pending (trigger may not have fired yet)
      return (
        <PendingApproval
          member={null}
          onRefresh={refreshMemberRecord}
          onLogout={handleLogout}
        />
      );
    }

    if (memberRecord?.status !== 'approved') {
      return (
        <PendingApproval
          member={memberRecord}
          onRefresh={refreshMemberRecord}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <Dashboard
        userEmail={session.user.email ?? ''}
        memberRole={memberRecord.role}
        memberBranchId={memberRecord.branch_id ?? null}
        permissions={permissions}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 flex items-center flex-wrap gap-0">
          <div className="flex items-center gap-2.5 py-4 mr-8 flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center shadow-md">
              <Droplets className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight tracking-tight text-white">Cleanse & Drip Booking Engine v1.0</p>
              <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase leading-tight">Bookings</p>
            </div>
          </div>

          <div className="flex">
            {([
              { key: 'booking', label: 'Book Appointment', icon: ClipboardList },
              { key: 'feedback', label: 'Client Feedback', icon: MessageSquare },
              { key: 'dashboard', label: 'Team Dashboard', icon: LayoutDashboard },
            ] as { key: View; label: string; icon: React.ElementType }[]).map(item => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  view === item.key
                    ? 'border-teal-400 text-teal-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {view === 'booking' && <BookingForm />}
      {view === 'feedback' && <FeedbackForm />}
      {view === 'consent' && <ConsentForm />}
      {view === 'dashboard' && renderDashboardContent()}
    </div>
  );
}
