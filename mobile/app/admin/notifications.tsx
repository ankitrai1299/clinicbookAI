import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState, IconButton } from '../../src/components/ui';
import { AdminScreen, NOTIFICATION_META } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../src/services/api';
import { AdminNotification } from '../../src/contracts';
import { colors } from '../../src/theme';

const timeAgo = (iso: string): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

export default function NotificationsScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setItems(await getNotifications(token));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRead = async (n: AdminNotification) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await markNotificationRead(n.id, token);
    } catch {
      load();
    }
  };

  const onReadAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await markAllNotificationsRead(token);
    } catch {
      load();
    }
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <AdminScreen
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
      permission="notifications.view"
      right={unread > 0 ? <IconButton icon="checkmark-done-outline" onPress={onReadAll} bg="bg-white/20" color={colors.white} /> : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && items.length === 0 ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : items.length === 0 ? (
          <EmptyState icon="notifications-off-outline" title="No notifications" subtitle="System alerts and activity will appear here." />
        ) : (
          items.map((n) => {
            const meta = NOTIFICATION_META[n.type] || { icon: 'information-circle-outline' as const, tint: colors.slate500, bg: 'bg-slate-100' };
            return (
              <TouchableOpacity key={n.id} activeOpacity={0.7} onPress={() => onRead(n)}>
                <Card className={`p-4 flex-row ${n.read ? '' : 'border-brand-100'}`} elevation="sm">
                  <View className={`w-10 h-10 rounded-2xl items-center justify-center ${meta.bg}`}>
                    <Ionicons name={meta.icon} size={19} color={meta.tint} />
                  </View>
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center gap-2">
                      <Text className={`flex-1 text-[14px] ${n.read ? 'font-semibold text-slate-700' : 'font-bold text-slate-900'}`} numberOfLines={1}>
                        {n.title}
                      </Text>
                      {!n.read ? <View className="w-2 h-2 rounded-full bg-brand-500" /> : null}
                    </View>
                    <Text className="text-xs text-slate-500 mt-0.5 leading-4" numberOfLines={2}>{n.message}</Text>
                    <Text className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </AdminScreen>
  );
}
