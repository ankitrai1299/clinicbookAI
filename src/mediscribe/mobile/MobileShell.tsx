import React from 'react';
import { LayoutGrid, Users, Clock, Settings, Shield } from 'lucide-react';
import type { Permission } from '../contracts';

// Native-style bottom-tab shell for the phone app (WebView only). Wraps the
// active screen and renders a fixed bottom tab bar. Tabs are permission-gated so
// a Doctor sees Dashboard / Patients / Sessions / Settings, while an admin also
// gets the Admin console tab. The web (desktop + mobile browser) never uses this.

interface Tab {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  permission: Permission;
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, permission: 'dashboard.view' },
  { id: 'patients', label: 'Patients', icon: Users, permission: 'patients.view' },
  { id: 'consultations', label: 'Sessions', icon: Clock, permission: 'consultations.view' },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view' },
  { id: 'admin', label: 'Admin', icon: Shield, permission: 'analytics.view' },
];

interface MobileShellProps {
  activeView: string;
  onNavigate: (view: string) => void;
  canView: (permission: Permission) => boolean;
  children: React.ReactNode;
}

export default function MobileShell({ activeView, onNavigate, canView, children }: MobileShellProps) {
  const tabs = TABS.filter((t) => canView(t.permission));

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Scrollable content — padding-bottom clears the fixed tab bar. */}
      <div className="flex-1 overflow-y-auto pb-24">{children}</div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <div className="flex items-stretch justify-around px-1 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeView === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onNavigate(t.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-1 rounded-lg transition-colors ${
                  active ? 'text-blue-600' : 'text-slate-400'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-semibold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
