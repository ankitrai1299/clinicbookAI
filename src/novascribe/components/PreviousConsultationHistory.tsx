import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  ChevronDown,
  FileText,
  MessageSquareText,
  Stethoscope,
  Pill,
  ClipboardList,
  CalendarClock,
  ArrowDownUp,
  X,
} from 'lucide-react';
import { ConsultationHistoryItem } from '../types';
import { getPatientHistory } from '../services/api';

interface PreviousConsultationHistoryProps {
  patientId: string;
  // Retained for caller compatibility; "View Report" now opens an in-place
  // modal instead of redirecting to the workspace.
  onOpenConsultation?: (consultationId: string) => void;
}

// Format an ISO timestamp (or a loose date string) into a readable visit label.
function formatVisit(value: string): string {
  if (!value) return 'Unknown date';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value; // already a display string
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: 'Draft' | 'Completed' }) {
  const done = status === 'Completed';
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${
        done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {status}
    </span>
  );
}

// A single labelled detail block inside an expanded card.
function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
        {icon} {label}
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function medicineLine(m: ConsultationHistoryItem['medicines'][number]): string {
  return [m.medicine, m.strength, m.dose, m.frequency, m.duration, m.instructions]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(' • ');
}

export default function PreviousConsultationHistory({
  patientId,
}: PreviousConsultationHistoryProps) {
  const [items, setItems] = useState<ConsultationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // false = oldest → newest (chronological, the requested default).
  const [newestFirst, setNewestFirst] = useState(false);
  // Transcript currently shown in the modal (null = closed).
  const [transcriptModal, setTranscriptModal] = useState<{ when: string; text: string } | null>(
    null,
  );
  // Report currently shown in the modal (null = closed).
  const [reportModal, setReportModal] = useState<{ when: string; item: ConsultationHistoryItem } | null>(
    null,
  );

  // Fetch when the patient profile is opened (or the patient changes).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPatientHistory(patientId)
      .then(data => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message || 'Failed to load consultation history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  // The API returns oldest → newest; reverse in memory when requested so the
  // toggle is instant and needs no extra request.
  const ordered = useMemo(
    () => (newestFirst ? [...items].reverse() : items),
    [items, newestFirst],
  );

  return (
    <section className="mt-2">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-base font-bold text-slate-900">Previous Consultation History</h3>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => setNewestFirst(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-white border border-slate-200 hover:border-blue-300 rounded-lg px-2.5 py-1.5 transition-colors"
            title="Reverse the order"
          >
            <ArrowDownUp size={13} />
            {newestFirst ? 'Newest first' : 'Oldest first'}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
          <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
          Loading consultation history…
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
          {error}
        </div>
      ) : ordered.length === 0 ? (
        <div className="text-sm text-slate-500 bg-white border border-dashed border-slate-200 rounded-lg px-4 py-8 text-center">
          No previous consultations found.
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map(item => {
            const isOpen = expandedId === item.consultationId;
            const primaryComplaint =
              item.chiefComplaints[0] || item.diagnosis[0] || 'Consultation record';
            return (
              <div
                key={item.consultationId}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                {/* Card header — always visible, toggles the card */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isOpen ? null : item.consultationId)
                  }
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{primaryComplaint}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <Clock size={12} /> {formatVisit(item.visitDateTime)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={item.reportStatus} />
                    <ChevronDown
                      size={18}
                      className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/60 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Detail icon={<Stethoscope size={13} />} label="Chief Complaint(s)">
                        {item.chiefComplaints.length ? (
                          <ul className="list-disc list-inside space-y-0.5">
                            {item.chiefComplaints.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400">Not recorded</span>
                        )}
                      </Detail>

                      <Detail icon={<ClipboardList size={13} />} label="Diagnosis / Assessment">
                        {item.diagnosis.length ? (
                          <ul className="list-disc list-inside space-y-0.5">
                            {item.diagnosis.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400">Not recorded</span>
                        )}
                      </Detail>

                      <Detail icon={<Pill size={13} />} label="Prescribed Medicines">
                        {item.medicines.length ? (
                          <ul className="space-y-0.5">
                            {item.medicines.map((m, i) => (
                              <li key={i}>{medicineLine(m)}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </Detail>

                      <Detail icon={<CalendarClock size={13} />} label="Follow-up Recommendation">
                        {item.followUp ? item.followUp : <span className="text-slate-400">None</span>}
                      </Detail>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setReportModal({
                            when: formatVisit(item.visitDateTime),
                            item,
                          })
                        }
                        disabled={!item.hasReport}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 transition-colors"
                      >
                        <FileText size={14} /> View Report
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTranscriptModal({
                            when: formatVisit(item.visitDateTime),
                            text: item.transcriptText,
                          })
                        }
                        disabled={!item.transcriptText}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 transition-colors"
                      >
                        <MessageSquareText size={14} /> View Transcript
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript modal */}
      {transcriptModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setTranscriptModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <MessageSquareText size={16} className="text-blue-600" /> Transcript
                <span className="text-xs font-normal text-slate-400">• {transcriptModal.when}</span>
              </div>
              <button
                type="button"
                onClick={() => setTranscriptModal(null)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close transcript"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-slate-700 whitespace-pre-line leading-relaxed">
              {transcriptModal.text || 'No transcript available.'}
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setReportModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <FileText size={16} className="text-blue-600" /> Report
                <span className="text-xs font-normal text-slate-400">• {reportModal.when}</span>
              </div>
              <button
                type="button"
                onClick={() => setReportModal(null)}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close report"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-slate-700 leading-relaxed space-y-4">
              <Detail icon={<Stethoscope size={13} />} label="Chief Complaint(s)">
                {reportModal.item.chiefComplaints.length ? (
                  <ul className="list-disc list-inside space-y-0.5">
                    {reportModal.item.chiefComplaints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-400">Not recorded</span>
                )}
              </Detail>

              <Detail icon={<ClipboardList size={13} />} label="Diagnosis / Assessment">
                {reportModal.item.diagnosis.length ? (
                  <ul className="list-disc list-inside space-y-0.5">
                    {reportModal.item.diagnosis.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-400">Not recorded</span>
                )}
              </Detail>

              <Detail icon={<Pill size={13} />} label="Prescribed Medicines">
                {reportModal.item.medicines.length ? (
                  <ul className="space-y-0.5">
                    {reportModal.item.medicines.map((m, i) => (
                      <li key={i}>{medicineLine(m)}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-400">None</span>
                )}
              </Detail>

              <Detail icon={<CalendarClock size={13} />} label="Follow-up Recommendation">
                {reportModal.item.followUp ? (
                  reportModal.item.followUp
                ) : (
                  <span className="text-slate-400">None</span>
                )}
              </Detail>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
