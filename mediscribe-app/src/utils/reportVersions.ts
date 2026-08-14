// Report versioning: every saved edit appends an immutable snapshot so a doctor
// can review or restore any earlier draft. The newest version's `report` always
// mirrors the consultation's live `report`.
import { ReportData, ReportVersion } from '../types';

/**
 * Append a new version snapshot. Skips the write when the report is byte-for-byte
 * identical to the latest version (avoids spamming versions on no-op saves).
 */
export function appendReportVersion(
  existing: ReportVersion[] | undefined,
  report: ReportData,
  label: string,
): ReportVersion[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  const last = list[list.length - 1];
  if (last && JSON.stringify(last.report) === JSON.stringify(report)) return list;
  list.push({
    version: (last?.version || 0) + 1,
    report,
    savedAt: new Date().toISOString(),
    label,
  });
  return list;
}

/** Human-friendly relative-ish timestamp for a version row. */
export function versionTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
