import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Trash2, Activity, FileText, Sparkles, Loader2 } from 'lucide-react';
import { ConsultationBucket } from '../../../contracts';
import { AdminConsultation } from '../../../services/api';
import {
  getAdminConsultations,
  retryConsultation,
  deleteConsultation,
} from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import {
  Page,
  SectionHeader,
  Card,
  Badge,
  ConfirmDialog,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../ui';

const BUCKETS: { id: ConsultationBucket; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'previous', label: 'Previous' },
  { id: 'draft', label: 'Draft' },
  { id: 'failed', label: 'Failed' },
];

function statusTone(status?: string): 'emerald' | 'amber' | 'red' | 'blue' {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'emerald';
  if (s === 'failed') return 'red';
  if (s === 'recording' || s === 'processing') return 'blue';
  return 'amber';
}

export default function ConsultationsSection() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('consultations.manage');
  const [bucket, setBucket] = useState<ConsultationBucket>('previous');
  const [items, setItems] = useState<AdminConsultation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminConsultation | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (b: ConsultationBucket, q = '') => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        setItems(await getAdminConsultations(token, b, q));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load consultations');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const t = setTimeout(() => load(bucket, search), 300);
    return () => clearTimeout(t);
  }, [bucket, search, load]);

  const handleRetry = async (c: AdminConsultation) => {
    if (!token) return;
    setRetrying(c.id);
    setError(null);
    try {
      await retryConsultation(token, c.id);
      await load(bucket, search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleting) return;
    setBusy(true);
    try {
      await deleteConsultation(token, deleting.id);
      setDeleting(null);
      await load(bucket, search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <SectionHeader
        title="Consultation Management"
        description="Monitor sessions across their lifecycle."
      />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            onClick={() => setBucket(b.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              bucket === b.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by patient or date…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState icon={Activity} label={`No ${bucket} consultations.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3">Patient</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Transcript</th>
                  <th className="px-5 py-3">AI Report</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => {
                  const hasTranscript = !!(c.transcriptText || c.originalTranscript || c.transcript?.length);
                  const hasReport = !!c.report;
                  const canRetry = ['failed', 'draft'].includes((c.status || '').toLowerCase());
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-slate-900">{c.patientName || 'Unknown'}</td>
                      <td className="px-5 py-3 text-slate-600">{c.date || '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${hasTranscript ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <FileText size={14} /> {hasTranscript ? 'Available' : 'None'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${hasReport ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <Sparkles size={14} /> {hasReport ? 'Generated' : 'None'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={statusTone(c.status)}>{c.status || 'Draft'}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && canRetry && (
                            <button
                              onClick={() => handleRetry(c)}
                              disabled={retrying === c.id}
                              title="Retry report generation"
                              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                            >
                              {retrying === c.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <RefreshCw size={16} />
                              )}
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => setDeleting(c)}
                              title="Delete"
                              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                              <Trash2 size={16} className="text-red-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {deleting && (
        <ConfirmDialog
          title="Delete consultation"
          message={`Delete the session for ${deleting.patientName || 'this patient'}? This cannot be undone.`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}
