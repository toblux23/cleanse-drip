import { useState } from 'react';
import {
  Activity,
  DollarSign,
  Contact,
  CalendarCheck,
  Package,
  BarChart3,
  FileText,
  Stethoscope,
  LayoutDashboard,
  ClipboardList,
  TrendingUp,
} from 'lucide-react';
import OperationsOversight from './OperationsOversight';
import SalesDailyExpenses from './SalesDailyExpenses';
import PaymentTracking from './PaymentTracking';
import ClientProfiles from './ClientProfiles';
import DailyOperationsActivities from './DailyOperationsActivities';
import InventoryOversight from './InventoryOversight';
import PrescriptionUploads from './PrescriptionUploads';
import ServiceDemandReports from './ServiceDemandReports';
import type { PermissionKey } from '../lib/supabase';

type TabKey = 'overview' | 'financials' | 'clients' | 'reports';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

const TABS: TabDef[] = [
  { key: 'overview',   label: 'Operations', icon: LayoutDashboard, iconColor: 'text-teal-600',    iconBg: 'bg-teal-100' },
  { key: 'financials', label: 'Financials', icon: DollarSign,      iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  { key: 'clients',    label: 'Clients',     icon: Contact,         iconColor: 'text-blue-600',    iconBg: 'bg-blue-100' },
  { key: 'reports',    label: 'Reports',      icon: BarChart3,       iconColor: 'text-amber-600',   iconBg: 'bg-amber-100' },
];

export default function HeadOfClinicalOperationsDashboard({ userEmail, permissions }: { userEmail: string; permissions: Set<PermissionKey> }) {
  const canManageOps = permissions.has('operations.manage' as PermissionKey);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-sm">
          <Stethoscope className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Head of Clinical Operations</h1>
          <p className="text-sm text-slate-500 mt-0.5">Executive oversight of clinical operations, sales, payments, and reports.</p>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tab.iconColor}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <>
            <SectionHeader icon={Activity} title="Operations Oversight" subtitle="End-to-end visibility of all bookings, appointments, payments, and feedback." color="teal" />
            <OperationsOversight />
            <SectionHeader icon={CalendarCheck} title="Daily Operations Activities" subtitle="Operational task assignments and activity tracking." color="blue" />
            <DailyOperationsActivities canManage={canManageOps} />
          </>
        )}

        {activeTab === 'financials' && (
          <>
            <SectionHeader icon={DollarSign} title="Financials" subtitle="Daily sales, expenses, and payment tracking." color="emerald" />
            <SalesDailyExpenses userEmail={userEmail} />
            <PaymentTracking />
          </>
        )}

        {activeTab === 'clients' && (
          <>
            <SectionHeader icon={Contact} title="Client Profiles" subtitle="Client management and profile oversight." color="blue" />
            <ClientProfiles />
            <SectionHeader icon={FileText} title="Prescription Uploads" subtitle="Doctor recommendation and prescription document management." color="teal" />
            <PrescriptionUploads userEmail={userEmail} />
          </>
        )}

        {activeTab === 'reports' && (
          <>
            <SectionHeader icon={TrendingUp} title="Service Demand Reports" subtitle="Service demand trends and top services analytics." color="amber" />
            <ServiceDemandReports />
            <SectionHeader icon={Package} title="Inventory Oversight" subtitle="Inventory levels and stock management oversight." color="teal" />
            <InventoryOversight />
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, color }: { icon: React.ElementType; title: string; subtitle: string; color: 'teal' | 'emerald' | 'blue' | 'amber' | 'slate' }) {
  const colorMap = {
    teal:    { bg: 'bg-teal-100',    text: 'text-teal-600' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
    blue:    { bg: 'bg-blue-100',    text: 'text-blue-600' },
    amber:   { bg: 'bg-amber-100',   text: 'text-amber-600' },
    slate:   { bg: 'bg-slate-100',   text: 'text-slate-600' },
  };
  const c = colorMap[color];
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className={`w-9 h-9 ${c.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4.5 h-4.5 ${c.text}`} />
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}
