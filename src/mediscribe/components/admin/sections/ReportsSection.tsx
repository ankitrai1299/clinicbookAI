import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Eye,
  Trash2,
  Download,
  Printer,
  Share2,
  ClipboardList,
  FileText,
} from 'lucide-react';
import { ReportRecord, ReportData, MedicationRow, ComplaintRow, AllergyRow, SystemGroup, Vitals, FollowUp } from '../../../types';
import { getAdminReports, deleteReport } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import {
  REPORT_SECTIONS,
  ReportSectionDef,
  sectionHasContent,
  normalizeReport,
  buildReportHtml,
  COMPLAINT_COLUMNS,
  ALLERGY_COLUMNS,
  TREATMENT_COLUMNS,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
  ColumnDef,
} from '../../../utils/report';
import { downloadReportPdf } from '../../../utils/download';
import {
  Page,
  SectionHeader,
  Card,
  Modal,
  ConfirmDialog,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../ui';

export default function ReportsSection() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('reports.manage');
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ReportRecord | null>(null);
  const [deleting, setDeleting] = useState<ReportRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (q = '') => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        setReports(await getAdminReports(token, q));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleDelete = async () => {
    if (!token || !deleting) return;
    setBusy(true);
    try {
      await deleteReport(token, deleting.id);
      setDeleting(null);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <SectionHeader title="Reports" description="View, export and manage generated clinical reports." />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

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
        ) : reports.length === 0 ? (
          <EmptyState icon={ClipboardList} label="No reports found." />
        ) : (
          <div className="divide-y divide-slate-100">
            {reports.map((r) => {
              const cc = normalizeReport(r.report).chiefComplaint;
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900">{r.patientName || 'Unknown Patient'}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {r.date} {cc.length > 0 && <span>• CC: {cc.join('; ')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewing(r)}
                      title="View"
                      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                    {canManage && (
                      <button
                        onClick={() => setDeleting(r)}
                        title="Delete"
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        <Trash2 size={16} className="text-red-600" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {viewing && <ReportViewModal record={viewing} onClose={() => setViewing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete report"
          message={`Delete the report for ${deleting.patientName || 'this patient'}? This cannot be undone.`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}

function ReportViewModal({ record, onClose }: { record: ReportRecord; onClose: () => void }) {
  const report = normalizeReport(record.report);
  const meta = { patientName: record.patientName, date: record.date };
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const handlePrint = () => {
    const html = buildReportHtml(report, meta);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const handleShare = async () => {
    const text = `MediScribe Clinical Report — ${record.patientName || 'Patient'} (${record.date})`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Clinical Report', text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareMsg('Copied to clipboard');
        setTimeout(() => setShareMsg(null), 2000);
      }
    } catch {
      /* user cancelled share */
    }
  };

  const visible = REPORT_SECTIONS.filter((s) => sectionHasContent(report, s));

  return (
    <Modal title={record.patientName || 'Clinical Report'} subtitle={record.date} onClose={onClose} wide>
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap gap-2 mb-5">
          <ActionButton icon={<Download size={16} />} label="Download PDF" onClick={() => downloadReportPdf(report, meta)} />
          <ActionButton icon={<Printer size={16} />} label="Print" onClick={handlePrint} />
          <ActionButton icon={<Share2 size={16} />} label={shareMsg || 'Share'} onClick={handleShare} />
        </div>

        {visible.length === 0 ? (
          <EmptyState label="This report has no content." />
        ) : (
          <div className="space-y-6">
            {visible.map((s, i) => (
              <div key={s.key as string}>
                <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wide border-b border-slate-200 pb-1.5 mb-3">
                  {i + 1}. {s.title}
                </h3>
                <SectionBody report={report} section={s} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
    >
      {icon} {label}
    </button>
  );
}

function DataTable({ columns, rows }: { columns: ColumnDef[]; rows: Record<string, any>[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-blue-50 text-blue-900 text-left">
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-semibold text-xs uppercase tracking-wide">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-700 align-top">
                  {r[c.key] || (c.key === 'dose' ? r.dosage : '') || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValue({ pairs }: { pairs: [string, string][] }) {
  return (
    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
      {pairs.map(([k, v]) => (
        <div key={k} className="flex gap-3 px-3 py-2 text-sm">
          <span className="w-40 flex-shrink-0 font-medium text-slate-500">{k}</span>
          <span className="text-slate-800">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
      {items.filter(Boolean).map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function SectionBody({ report, section }: { report: ReportData; section: ReportSectionDef }) {
  const value = report[section.key];
  switch (section.kind) {
    case 'overview':
      return <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{value as string}</p>;
    case 'complaints':
      return <DataTable columns={COMPLAINT_COLUMNS} rows={value as ComplaintRow[]} />;
    case 'allergies':
      return <DataTable columns={ALLERGY_COLUMNS} rows={value as AllergyRow[]} />;
    case 'medications':
      return <DataTable columns={section.columns || TREATMENT_COLUMNS} rows={value as MedicationRow[]} />;
    case 'vitals': {
      const v = value as Vitals;
      const pairs = VITALS_FIELDS.filter((f) => (v[f.key] || '').trim()).map((f) => [f.label, v[f.key]] as [string, string]);
      return <KeyValue pairs={pairs} />;
    }
    case 'followup': {
      const f = value as FollowUp;
      const pairs = FOLLOWUP_FIELDS.filter((x) => (f[x.key] || '').trim()).map((x) => [x.label, f[x.key]] as [string, string]);
      return <KeyValue pairs={pairs} />;
    }
    case 'groups':
      return (
        <div className="space-y-3">
          {(value as SystemGroup[])
            .filter((g) => g.findings.length || g.name.trim())
            .map((g, i) => (
              <div key={i}>
                <div className="text-sm font-semibold text-slate-700 mb-1">{g.name || 'Findings'}</div>
                <Bullets items={g.findings} />
              </div>
            ))}
        </div>
      );
    default:
      return <Bullets items={value as string[]} />;
  }
}
