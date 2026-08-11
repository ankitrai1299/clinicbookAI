import React from 'react';
import { LayoutGrid, Users, Activity, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import type { Permission } from '../contracts';

// Native-style bottom-tab shell for the phone app (WebView only). The web —
// desktop AND mobile browser — never renders this.
//
// Four tabs, matching the native MediScribe app: Home, Patients, Sessions,
// Settings. The assistant is NOT a tab — it is a floating "Ask" button that
// stays reachable from every screen, because a question about a patient occurs
// while you are looking at that patient, not after navigating away.
//
// Tabs stay permission-gated; the app is doctors-only, but the gate is what
// keeps that true rather than assumed.

interface Tab {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  permission: Permission;
}

const TABS: Tab[] = [
  { id: 'dashboard', label: 'Home', icon: LayoutGrid, permission: 'dashboard.view' },
  { id: 'patients', label: 'Patients', icon: Users, permission: 'patients.view' },
  { id: 'consultations', label: 'Sessions', icon: Activity, permission: 'consultations.view' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, permission: 'settings.view' }
];

interface MobileShellProps {
  activeView: string;
  onNavigate: (view: string) => void;
  canView: (permission: Permission) => boolean;
  /** The floating assistant — reachable from every screen. */
  onAsk?: () => void;
  children: React.ReactNode;
}

export default function MobileShell({ activeView, onNavigate, canView, onAsk, children }: MobileShellProps) {
  const tabs = TABS.filter((t) => canView(t.permission));

  return (
    <div className="min-h-screen bg-[#FAFBFC] font-sans text-slate-900 flex flex-col">
      <div className="flex-1 overflow-y-auto pb-24">{children}</div>

      {onAsk && (
        <button
          onClick={onAsk}
          aria-label="Ask the assistant"
          className="fixed right-5 bottom-[92px] z-50 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
        >
          <span className="w-14 h-14 rounded-full bg-[#5B5CEB] text-white flex items-center justify-center shadow-lg shadow-[#5B5CEB]/35">
            <Sparkles size={24} />
          </span>
          <span className="text-[11px] font-semibold text-[#5B5CEB]">Ask</span>
        </button>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E8ECF2]">
        <div className="flex items-stretch px-2 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeView === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onNavigate(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
                  active ? 'text-[#5B5CEB]' : 'text-slate-400'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-semibold tracking-tight">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
