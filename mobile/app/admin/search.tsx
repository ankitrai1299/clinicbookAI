import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SearchBar, EmptyState } from '../../src/components/ui';
import { AdminScreen, SEARCH_ENTITY_META } from '../../src/components/admin/shared';
import { useAuth } from '../../src/context/Auth';
import { globalSearch } from '../../src/services/api';
import { SearchResult, SearchEntity } from '../../src/contracts';
import { colors } from '../../src/theme';

// Group order for the results (matches the entity-meta map).
const ORDER: SearchEntity[] = ['patient', 'doctor', 'report', 'medicine', 'icd', 'loinc', 'rxnorm'];

export default function GlobalSearchScreen() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = useCallback(
    async (q: string) => {
      if (!token || q.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      setLoading(true);
      try {
        const res = await globalSearch(q.trim(), token);
        setResults(res.results || []);
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const t = setTimeout(() => run(query), 350);
    return () => clearTimeout(t);
  }, [query, run]);

  const grouped = ORDER.map((entity) => ({
    entity,
    items: results.filter((r) => r.entity === entity),
  })).filter((g) => g.items.length > 0);

  return (
    <AdminScreen title="Global Search" subtitle="Patients, doctors, reports & codes" permission="dashboard.view">
      <View className="px-5 pt-4 pb-2">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search everything..." />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24, paddingTop: 6, gap: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="items-center py-16"><ActivityIndicator color={colors.brand} /></View>
        ) : query.trim().length < 2 ? (
          <EmptyState icon="search-outline" title="Search the console" subtitle="Type at least 2 characters to search patients, doctors, reports, medicines and clinical codes." />
        ) : searched && grouped.length === 0 ? (
          <EmptyState icon="search-outline" title="No results" subtitle={`Nothing matched "${query}".`} />
        ) : (
          grouped.map((g) => {
            const meta = SEARCH_ENTITY_META[g.entity];
            return (
              <View key={g.entity} className="gap-2">
                <View className="flex-row items-center gap-2">
                  <View className={`w-6 h-6 rounded-lg items-center justify-center ${meta.bg}`}>
                    <Ionicons name={meta.icon} size={13} color={meta.tint} />
                  </View>
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{meta.label}</Text>
                  <Text className="text-[11px] font-bold text-slate-300">{g.items.length}</Text>
                </View>
                <View className="gap-2">
                  {g.items.map((r) => (
                    <Card key={`${r.entity}-${r.id}`} className="p-3.5 flex-row items-center" elevation="sm">
                      <View className={`w-9 h-9 rounded-xl items-center justify-center ${meta.bg}`}>
                        <Ionicons name={meta.icon} size={16} color={meta.tint} />
                      </View>
                      <View className="flex-1 ml-3">
                        <Text className="text-[14px] font-semibold text-slate-800" numberOfLines={1}>{r.title}</Text>
                        {r.subtitle ? <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{r.subtitle}</Text> : null}
                      </View>
                    </Card>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </AdminScreen>
  );
}
