import { useState, ReactElement } from 'react';
import {
  LayoutDashboard,
  Stethoscope,
  Users,
  BarChart3,
  Languages,
  Bell,
  Settings,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react';
import { Permission, ROLE_LABELS } from '../../contracts';
import { useAuth } from '../../context/Auth';
import Logo from '../Logo';
import LoginView from './LoginView';
import DashboardSection from './sections/DashboardSection';
import DoctorsSection from './sections/DoctorsSection';
import PatientsSection from './sections/PatientsSection';
import AnalyticsSection from './sections/AnalyticsSection';
import LanguagesSection from './sections/LanguagesSection';
import NotificationsSection from './sections/NotificationsSection';
import SettingsSection from './sections/SettingsSection';
import RolesUsersSection from './sections/RolesUsersSection';

type SectionId =
  | 'dashboard'
  | 'doctors'
  | 'patients'
  | 'consultations'
  | 'reports'
  | 'analytics'
  | 'languages'
  | 'notifications'
  | 'settings'
  | 'roles'
  | 'search';

interface NavItem {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  render: () => ReactElement;
}

// Consultations / Reports / Search are intentionally omitted from the admin
// console — attribution now lives on the Patients page (each patient shows the
// attending doctor + their visit history), so the standalone lists are redundant.
const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', render: () => <DashboardSection /> },
  { id: 'doctors', label: 'Doctors', icon: Stethoscope, permission: 'doctors.view', render: () => <DoctorsSection /> },
  { id: 'patients', label: 'Patients', icon: Users, permission: 'patients.view', render: () => <PatientsSection /> },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics.view', render: () => <AnalyticsSection /> },
  { id: 'languages', label: 'Languages', icon: Languages, permission: 'analytics.view', render: () => <LanguagesSection /> },
  { id: 'notifications', label: 'Notifications', icon: Bell, permission: 'notifications.view', render: () => <NotificationsSection /> },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view', render: () => <SettingsSection /> },
  { id: 'roles', label: 'Roles & Users', icon: ShieldCheck, permission: 'users.manage', render: () => <RolesUsersSection /> },
];

interface AdminAppProps {
  /** Return to the main clinician app. */
  onExit?: () => void;
}

export default function AdminApp({ onExit }: AdminAppProps) {
  const { user, loading, logout, hasPermission } = useAuth();
  const [active, setActive] = useState<SectionId>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) return <LoginView />;

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.permission));
  // If the persisted section is no longer permitted, fall back to the first
  // available one.
  const current = visibleItems.find((i) => i.id === active) || visibleItems[0];

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive = current?.id === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              setActive(item.id);
              onNavigate?.();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
              isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={18} />
            {item.label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row">
      {/* Desktop sub-sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex-col hidden md:flex flex-shrink-0 h-screen sticky top-0">
        <div className="p-6">
          <Logo light />
          <div className="mt-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">Admin Console</div>
        </div>

        <div className="flex-1 px-4 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Management</div>
          <NavList />
        </div>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="px-2 py-1">
            <div className="text-sm font-semibold text-white truncate">{user.name}</div>
            <div className="text-xs text-slate-400">{ROLE_LABELS[user.role]}</div>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} /> Back to App
            </button>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden bg-slate-900 text-white flex items-center justify-between px-4 h-16 flex-shrink-0 sticky top-0 z-30">
        <Logo light />
        <button onClick={() => setMobileNavOpen((o) => !o)} className="p-2 text-slate-300 hover:text-white">
          {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {mobileNavOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-16 z-20 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <nav className="md:hidden fixed top-16 left-0 right-0 z-30 bg-slate-900 border-b border-slate-800 p-4 space-y-1 max-h-[70vh] overflow-y-auto">
            <NavList onNavigate={() => setMobileNavOpen(false)} />
            <div className="pt-2 mt-2 border-t border-slate-800 space-y-1">
              {onExit && (
                <button onClick={onExit} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
                  <ArrowLeft size={16} /> Back to App
                </button>
              )}
              <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </nav>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        {current ? current.render() : (
          <div className="p-12 text-center text-slate-500">You do not have access to any admin sections.</div>
        )}
      </main>
    </div>
  );
}
