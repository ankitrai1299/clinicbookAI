import { AppointmentStatus } from '@prisma/client';

import type { TenantClient } from '../../config/tenantPrisma.js';

export interface LanguageStat {
  language: string;
  count: number;
  percentage: number;
}

export interface DashboardStats {
  totalAppointments: number;
  noShowRate: number;
  activePatients: number;
  slotUtilization: number;
  languageBreakdown: LanguageStat[];
}

// `db` is a clinic-scoped Prisma client (from forClinic / req.db). Every query
// below is automatically constrained to the caller's clinic — no manual
// `where: { clinicId }` needed, and impossible to forget.
export const getDashboardStats = async (db: TenantClient): Promise<DashboardStats> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const [totalAppointments, statusCounts, activePatients, totalPatients, languageGroups] =
    await Promise.all([
      // Total appointments ever booked for this clinic
      db.appointment.count(),

      // Per-status counts — drives no-show rate + slot utilization
      db.appointment.groupBy({
        by: ['status'],
        _count: { status: true }
      }),

      // Patients with at least one appointment in the last 30 days
      db.patient.count({
        where: {
          appointments: {
            some: { appointmentDate: { gte: thirtyDaysAgo } }
          }
        }
      }),

      // Total patients — denominator for language percentages
      db.patient.count(),

      // Patient language distribution
      db.patient.groupBy({
        by: ['language'],
        _count: { language: true },
        orderBy: { _count: { language: 'desc' } }
      })
    ]);

  // Map status → count for easy lookup
  const byStatus = Object.fromEntries(
    statusCounts.map((row) => [row.status, row._count.status])
  ) as Partial<Record<AppointmentStatus, number>>;

  const completed = byStatus[AppointmentStatus.COMPLETED] ?? 0;
  const noShow    = byStatus[AppointmentStatus.NO_SHOW]   ?? 0;
  const confirmed = byStatus[AppointmentStatus.CONFIRMED] ?? 0;
  const pending   = byStatus[AppointmentStatus.PENDING]   ?? 0;

  // No-show rate: of resolved appointments (completed + no-show), what % were no-shows?
  const resolvedTotal = completed + noShow;
  const noShowRate = resolvedTotal > 0
    ? round2(noShow / resolvedTotal * 100)
    : 0;

  // Slot utilization: of all non-cancelled appointments, what % are confirmed or completed?
  const nonCancelled = pending + confirmed + completed + noShow;
  const slotUtilization = nonCancelled > 0
    ? round2((confirmed + completed) / nonCancelled * 100)
    : 0;

  const languageBreakdown: LanguageStat[] = languageGroups.map((row) => ({
    language: row.language,
    count: row._count.language,
    percentage: totalPatients > 0 ? round2(row._count.language / totalPatients * 100) : 0
  }));

  return {
    totalAppointments,
    noShowRate,
    activePatients,
    slotUtilization,
    languageBreakdown
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;
