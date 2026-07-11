import { useState, useEffect } from 'react';
import {
  Search as SearchIcon,
  User,
  Stethoscope,
  FileText,
  Pill,
  FileCode,
  FlaskConical,
  Boxes,
  Loader2,
  LucideIcon,
} from 'lucide-react';
import { SearchResult, SearchEntity } from '../../../contracts';
import { globalSearch } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import { Page, SectionHeader, Card, EmptyState, ErrorState } from '../ui';

const ENTITY_META: Record<SearchEntity, { icon: LucideIcon; label: string; color: string }> = {
  patient: { icon: User, label: 'Patients', color: 'bg-indigo-50 text-indigo-600' },
  doctor: { icon: Stethoscope, label: 'Doctors', color: 'bg-blue-50 text-blue-600' },
  report: { icon: FileText, label: 'Reports', color: 'bg-purple-50 text-purple-600' },
  medicine: { icon: Pill, label: 'Medicines', color: 'bg-emerald-50 text-emerald-600' },
  icd: { icon: FileCode, label: 'ICD Codes', color: 'bg-amber-50 text-amber-600' },
  loinc: { icon: FlaskConical, label: 'LOINC Tests', color: 'bg-teal-50 text-teal-600' },
  rxnorm: { icon: Boxes, label: 'RxNorm', color: 'bg-rose-50 text-rose-600' },
};

const ENTITY_ORDER: SearchEntity[] = ['patient', 'doctor', 'report', 'medicine', 'icd', 'loinc', 'rxnorm'];

export default function SearchSection() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!token) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      globalSearch(token, q)
        .then((r) => {
          if (cancelled) return;
          setResults(r.results);
          setSearched(true);
        })
        .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Search failed'))
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, token]);

  const grouped = ENTITY_ORDER.map((entity) => ({
    entity,
    items: results.filter((r) => r.entity === entity),
  })).filter((g) => g.items.length > 0);

  return (
    <Page>
      <SectionHeader title="Global Search" description="Search patients, doctors, reports and clinical codes." />

      <div className="relative mb-6 max-w-2xl">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          autoFocus
          placeholder="Search across the platform…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-300 rounded-2xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
        />
        {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" size={20} />}
      </div>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {!query.trim() ? (
        <Card>
          <EmptyState icon={SearchIcon} label="Start typing to search." />
        </Card>
      ) : searched && grouped.length === 0 && !loading ? (
        <Card>
          <EmptyState icon={SearchIcon} label={`No results for "${query}".`} />
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => {
            const meta = ENTITY_META[group.entity];
            const Icon = meta.icon;
            return (
              <Card key={group.entity} className="overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                  <Icon size={16} className="text-slate-500" />
                  <h3 className="font-semibold text-slate-700 text-sm">{meta.label}</h3>
                  <span className="text-xs text-slate-400">({group.items.length})</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.items.map((r) => (
                    <div key={`${r.entity}-${r.id}`} className="flex items-center gap-3 px-5 py-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{r.title}</div>
                        <div className="text-xs text-slate-500 truncate">{r.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
