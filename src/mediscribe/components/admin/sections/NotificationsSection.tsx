import { useEffect, useState, useCallback } from 'react';
import {
  Bell,
  MicOff,
  FileWarning,
  LogIn,
  Activity,
  UserPlus,
  CheckCheck,
  LucideIcon,
} from 'lucide-react';
import { AdminNotification, NotificationType } from '../../../contracts';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import { Page, SectionHeader, Card, LoadingState, EmptyState, ErrorState, formatDate } from '../ui';

const ICONS: Record<NotificationType, { icon: LucideIcon; color: string }> = {
  failed_stt: { icon: MicOff, color: 'bg-red-50 text-red-600' },
  failed_report: { icon: FileWarning, color: 'bg-red-50 text-red-600' },
  doctor_login: { icon: LogIn, color: 'bg-blue-50 text-blue-600' },
  new_consultation: { icon: Activity, color: 'bg-emerald-50 text-emerald-600' },
  new_patient: { icon: UserPlus, color: 'bg-indigo-50 text-indigo-600' },
};

export default function NotificationsSection() {
  const { token } = useAuth();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications(token);
      // Newest first.
      setItems(
        [...data].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const unread = items.filter((n) => !n.read).length;

  const handleRead = async (n: AdminNotification) => {
    if (!token || n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await markNotificationRead(token, n.id);
    } catch {
      await load();
    }
  };

  const handleReadAll = async () => {
    if (!token) return;
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await markAllNotificationsRead(token);
    } catch {
      await load();
    }
  };

  return (
    <Page>
      <SectionHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread notification${unread === 1 ? '' : 's'}.` : 'You are all caught up.'}
        action={
          unread > 0 && (
            <button
              onClick={handleReadAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <CheckCheck size={16} /> Mark all read
            </button>
          )
        }
      />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} label="No notifications yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((n) => {
              const { icon: Icon, color } = ICONS[n.type] || { icon: Bell, color: 'bg-slate-100 text-slate-600' };
              return (
                <button
                  key={n.id}
                  onClick={() => handleRead(n)}
                  className={`w-full text-left flex items-start gap-3 px-5 py-4 transition-colors ${
                    n.read ? 'hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${n.read ? 'text-slate-700' : 'text-slate-900'}`}>{n.title}</span>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1">{formatDate(n.createdAt)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </Page>
  );
}
