import React from 'react';
import { LayoutGrid, Users, Activity, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import type { Permission } from '../contracts';
import { usePrefs } from './prefs';

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
  { id: 'dashboard', label: 'nav.home', icon: LayoutGrid, permission: 'dashboard.view' },
  { id: 'patients', label: 'nav.patients', icon: Users, permission: 'patients.view' },
  { id: 'consultations', label: 'nav.sessions', icon: Activity, permission: 'consultations.view' },
  { id: 'settings', label: 'nav.settings', icon: SettingsIcon, permission: 'settings.view' }
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
  const { t: tr, appearance } = usePrefs();
  const tabs = TABS.filter((t) => canView(t.permission));

  return (
    <div className={`ms-phone ${appearance === 'dark' ? 'ms-dark' : ''} min-h-screen bg-[#FAFBFC] text-slate-900 flex flex-col`}>
      {/* Padding-bottom is exactly the bar: 60px plus whatever the device
          reserves for its gesture pill. The old pb-24/pb-28 was a guess that
          left a visible band of empty canvas under every screen. */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(60px + min(env(safe-area-inset-bottom), 12px))' }}
      >
        {children}
      </div>

      {onAsk && (
        <button
          onClick={onAsk}
          aria-label="Ask the assistant"
          style={{ bottom: 'calc(76px + min(env(safe-area-inset-bottom), 12px))' }}
          className="fixed right-5 z-50 flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
        >
          <span className="w-14 h-14 rounded-full bg-[#5B5CEB] text-white flex items-center justify-center shadow-lg shadow-[#5B5CEB]/35">
            <Sparkles size={24} />
          </span>
          <span className="text-[11px] font-semibold text-[#5B5CEB]">{tr('nav.ask')}</span>
        </button>
      )}

      {/* 60px bar + the device inset, pt-2 — the native app's own measurements. */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 shadow-[0_-10px_24px_rgba(17,24,39,0.08)]"
        style={{ paddingBottom: 'min(env(safe-area-inset-bottom), 12px)' }}
      >
        <div className="flex items-stretch px-2 pt-2" style={{ height: 60 }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeView === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onNavigate(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-start pt-0.5 transition-colors ${
                  active ? 'text-[#5B5CEB]' : 'text-slate-400'
                }`}
              >
                <Icon size={23} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-semibold mt-0.5">{tr(t.label)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
