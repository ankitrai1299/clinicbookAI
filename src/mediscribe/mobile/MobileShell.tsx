import React from 'react';
import { Home, Users, Mic, FileText, LayoutGrid } from 'lucide-react';
import type { Permission } from '../contracts';

// Native-style bottom-tab shell for the phone app (WebView only). The web —
// desktop AND mobile browser — never renders this.
//
// Four tabs around a raised mic button. The mic is the app's whole purpose, so
// it gets the centre position and is reachable from every screen rather than
// only from the home card. Tabs stay permission-gated; the app is doctors-only,
// but the gate is what keeps that true rather than assumed.

interface Tab {
  id: string;
  label: string;
  icon: typeof Home;
  permission: Permission;
}

const LEFT: Tab[] = [
  { id: 'dashboard', label: 'Home', icon: Home, permission: 'dashboard.view' },
  { id: 'patients', label: 'Patients', icon: Users, permission: 'patients.view' },
];

const RIGHT: Tab[] = [
  { id: 'consultations', label: 'Notes', icon: FileText, permission: 'consultations.view' },
  { id: 'more', label: 'More', icon: LayoutGrid, permission: 'settings.view' },
];

interface MobileShellProps {
  activeView: string;
  onNavigate: (view: string) => void;
  canView: (permission: Permission) => boolean;
  /** The mic button — starts a new consultation from wherever the doctor is. */
  onRecord: () => void;
  children: React.ReactNode;
}

export default function MobileShell({ activeView, onNavigate, canView, onRecord, children }: MobileShellProps) {
  const renderTab = (t: Tab) => {
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
        <Icon size={21} strokeWidth={active ? 2.5 : 2} />
        <span className="text-[10.5px] font-semibold tracking-tight">{t.label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAFBFC] font-sans text-slate-900 flex flex-col">
      {/* Padding-bottom clears the bar AND the mic button that rides above it. */}
      <div className="flex-1 overflow-y-auto pb-28">{children}</div>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E8ECF2] shadow-[0_-4px_20px_rgba(15,23,42,0.07)]">
        <div className="relative flex items-stretch px-2 pt-2 pb-[max(env(safe-area-inset-bottom),10px)]">
          {LEFT.filter((t) => canView(t.permission)).map(renderTab)}

          {/* Spacer holding the gap the mic button sits in. */}
          <div className="w-16 flex-shrink-0" aria-hidden />

          {RIGHT.filter((t) => canView(t.permission)).map(renderTab)}

          <button
            onClick={onRecord}
            aria-label="Start a new consultation"
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-[58px] h-[58px] rounded-full bg-gradient-to-br from-[#5B5CEB] to-[#4A4BD4] text-white flex items-center justify-center shadow-lg shadow-[#5B5CEB]/35 ring-4 ring-white active:scale-95 transition-transform"
          >
            <Mic size={24} strokeWidth={2.4} />
          </button>
        </div>
      </nav>
    </div>
  );
}
