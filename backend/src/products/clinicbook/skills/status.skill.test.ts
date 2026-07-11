import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppointmentStatus } from '@prisma/client';

// Mock the one dependency (the appointments read); everything else — slotMath's
// upcoming logic, the registry, the formatting — runs for real.
const getAppointments = vi.fn();
vi.mock('../appointments/appointment.service.js', () => ({
  getAppointments: (...args: unknown[]) => getAppointments(...args)
}));

import { registerClinicBookStatusSkill } from './status.skill.js';
import { skillRegistry } from '../../../core/mcp/skillRegistry.js';
import type { McpContext } from '../../../core/mcp/index.js';

const ctx: McpContext = {
  clinicId: 'c1',
  channel: 'whatsapp',
  actor: { kind: 'patient', patientId: 'p1' }
};

const appt = (over: Partial<Record<string, unknown>>) => ({
  id: 'a1',
  patientId: 'p1',
  status: AppointmentStatus.CONFIRMED,
  appointmentDate: new Date('2099-06-12'),
  appointmentTime: '10:00 AM',
  doctor: { id: 'd1', name: 'Dr. Mehta', speciality: 'Cardiology' },
  ...over
});

const run = () => {
  registerClinicBookStatusSkill();
  return skillRegistry.get('clinicbook.status')!.handle(ctx, '', { activeSkill: null, data: {} });
};

describe('clinicbook.status skill', () => {
  beforeEach(() => {
    skillRegistry.clear();
    getAppointments.mockReset();
  });

  it('lists the patient\'s upcoming appointment', async () => {
    getAppointments.mockResolvedValue([appt({})]);
    const res = await run();
    expect(res.done).toBe(true);
    expect(String(res.reply)).toContain('12 Jun');
    expect(String(res.reply)).toContain('10:00 AM');
    expect(String(res.reply)).toContain('Dr. Mehta');
  });

  it('marks a PENDING appointment as confirmation-pending', async () => {
    getAppointments.mockResolvedValue([appt({ status: AppointmentStatus.PENDING })]);
    const res = await run();
    expect(String(res.reply)).toMatch(/confirmation pending/i);
  });

  it('hides past, cancelled and other patients\' appointments', async () => {
    getAppointments.mockResolvedValue([
      appt({ id: 'past', appointmentDate: new Date('2000-01-01') }),
      appt({ id: 'cancelled', status: AppointmentStatus.CANCELLED }),
      appt({ id: 'other', patientId: 'p2' })
    ]);
    const res = await run();
    expect(String(res.reply)).toMatch(/koi upcoming appointment abhi book nahi/i);
  });

  it('stays silent when there is no patient identity', async () => {
    getAppointments.mockResolvedValue([appt({})]);
    registerClinicBookStatusSkill();
    const res = await skillRegistry
      .get('clinicbook.status')!
      .handle({ ...ctx, actor: { kind: 'patient' } }, '', { activeSkill: null, data: {} });
    expect(res).toEqual({ reply: null, done: true });
  });
});
