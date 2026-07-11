import { LayoutDashboard, Users, Clock, FileText, ClipboardList, Pill, Settings, Shield, LayoutGrid } from 'lucide-react';
import Logo from './Logo';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  // When hosted inside the ClinicBook platform hub, returns to the app switcher.
  onExitToHub?: () => void;
  doctorName?: string;
}

export default function Sidebar({ activeView, onNavigate, onExitToHub, doctorName }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'patients', label: 'Patients', icon: Users },
    { id: 'consultations', label: 'Sessions', icon: Clock },
    { id: 'transcripts', label: 'Transcripts', icon: FileText },
    { id: 'reports', label: 'AI Reports', icon: ClipboardList },
    { id: 'prescriptions', label: 'Prescriptions', icon: Pill },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex flex-shrink-0">
      <div className="p-6">
        <Logo light />
      </div>

      <div className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Main Menu</div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-800 space-y-1">
        {onExitToHub && (
          <button
            onClick={onExitToHub}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LayoutGrid size={18} />
            All Apps
          </button>
        )}
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-semibold">
            {(doctorName || 'D').trim().charAt(0).toUpperCase()}
          </div>
          <div className="text-left min-w-0">
            <div className="text-sm font-semibold text-white truncate">{doctorName || 'Doctor'}</div>
            <div className="text-xs text-slate-400">Clinician</div>
          </div>
        </div>
      </div>
    </div>
  );
}
