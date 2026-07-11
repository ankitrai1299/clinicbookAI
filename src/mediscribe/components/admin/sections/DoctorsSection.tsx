import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Ban,
  CheckCircle2,
  Eye,
  Stethoscope,
  Mail,
  Phone,
  BadgeCheck,
  Building2,
  Clock,
} from 'lucide-react';
import { AuthUser } from '../../../contracts';
import {
  getDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  suspendDoctor,
  activateDoctor,
  DoctorInput,
} from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import {
  Page,
  SectionHeader,
  Card,
  Badge,
  PrimaryButton,
  Modal,
  ConfirmDialog,
  Field,
  inputClass,
  LoadingState,
  EmptyState,
  ErrorState,
  formatDate,
} from '../ui';

export default function DoctorsSection() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('doctors.manage');
  const [doctors, setDoctors] = useState<AuthUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<AuthUser | null>(null);
  const [deleting, setDeleting] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (q = '') => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        setDoctors(await getDoctors(token, q));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load doctors');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Debounced server-side search.
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleToggleStatus = async (d: AuthUser) => {
    if (!token) return;
    try {
      if (d.status === 'active') await suspendDoctor(token, d.id);
      else await activateDoctor(token, d.id);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!token || !deleting) return;
    setBusy(true);
    try {
      await deleteDoctor(token, deleting.id);
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
      <SectionHeader
        title="Doctor Management"
        description="Manage doctor accounts, profiles and access."
        action={
          canManage && (
            <PrimaryButton onClick={() => setCreating(true)}>
              <Plus size={18} /> Add Doctor
            </PrimaryButton>
          )
        }
      />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by name, email, specialization…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : doctors.length === 0 ? (
          <EmptyState icon={Stethoscope} label="No doctors found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                  <th className="px-5 py-3">Doctor</th>
                  <th className="px-5 py-3">Specialization</th>
                  <th className="px-5 py-3">License</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900">{d.name}</div>
                      <div className="text-slate-500 text-xs">{d.email}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{d.specialization || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{d.licenseNumber || '—'}</td>
                    <td className="px-5 py-3">
                      <Badge tone={d.status === 'active' ? 'emerald' : 'red'}>
                        {d.status === 'active' ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton title="View profile" onClick={() => setViewing(d)}>
                          <Eye size={16} />
                        </IconButton>
                        {canManage && (
                          <>
                            <IconButton title="Edit" onClick={() => setEditing(d)}>
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton
                              title={d.status === 'active' ? 'Suspend' : 'Activate'}
                              onClick={() => handleToggleStatus(d)}
                            >
                              {d.status === 'active' ? (
                                <Ban size={16} className="text-amber-600" />
                              ) : (
                                <CheckCircle2 size={16} className="text-emerald-600" />
                              )}
                            </IconButton>
                            <IconButton title="Delete" onClick={() => setDeleting(d)}>
                              <Trash2 size={16} className="text-red-600" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <DoctorFormModal
          doctor={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await load(search);
          }}
        />
      )}

      {viewing && <DoctorProfileModal doctor={viewing} onClose={() => setViewing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete doctor"
          message={`Permanently delete ${deleting.name}? This cannot be undone.`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
    >
      {children}
    </button>
  );
}

function DoctorFormModal({
  doctor,
  onClose,
  onSaved,
}: {
  doctor: AuthUser | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState<DoctorInput & { password?: string }>({
    name: doctor?.name || '',
    email: doctor?.email || '',
    specialization: doctor?.specialization || '',
    licenseNumber: doctor?.licenseNumber || '',
    hospital: doctor?.hospital || '',
    experience: doctor?.experience || 0,
    phone: doctor?.phone || '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const payload: DoctorInput = {
        name: form.name,
        email: form.email,
        specialization: form.specialization,
        licenseNumber: form.licenseNumber,
        hospital: form.hospital,
        experience: Number(form.experience) || 0,
        phone: form.phone,
      };
      if (form.password) payload.password = form.password;
      if (doctor) await updateDoctor(token, doctor.id, payload);
      else await createDoctor(token, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save doctor');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={doctor ? 'Edit Doctor' : 'Add New Doctor'}
      subtitle={doctor ? 'Update doctor details' : 'Create a new doctor account'}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="p-4 sm:p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name">
            <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Specialization">
            <input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} className={inputClass} />
          </Field>
          <Field label="License Number">
            <input value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Hospital">
            <input value={form.hospital} onChange={(e) => set('hospital', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Experience (years)">
            <input
              type="number"
              min={0}
              value={form.experience}
              onChange={(e) => set('experience', e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
          </Field>
          <Field label={doctor ? 'Reset Password (optional)' : 'Password'}>
            <input
              type="password"
              autoComplete="new-password"
              required={!doctor}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              className={inputClass}
              placeholder={doctor ? 'Leave blank to keep' : ''}
            />
          </Field>
        </div>
        <div className="pt-2 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-semibold shadow-sm transition-colors"
          >
            {busy ? 'Saving…' : doctor ? 'Save Changes' : 'Create Doctor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DoctorProfileModal({ doctor, onClose }: { doctor: AuthUser; onClose: () => void }) {
  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Mail size={16} />, label: 'Email', value: doctor.email },
    { icon: <BadgeCheck size={16} />, label: 'Specialization', value: doctor.specialization || '—' },
    { icon: <BadgeCheck size={16} />, label: 'License Number', value: doctor.licenseNumber || '—' },
    { icon: <Building2 size={16} />, label: 'Hospital', value: doctor.hospital || '—' },
    { icon: <Clock size={16} />, label: 'Experience', value: doctor.experience ? `${doctor.experience} years` : '—' },
    { icon: <Phone size={16} />, label: 'Phone', value: doctor.phone || '—' },
    { icon: <Clock size={16} />, label: 'Last Login', value: formatDate(doctor.lastLoginAt) },
    { icon: <Clock size={16} />, label: 'Created', value: formatDate(doctor.createdAt) },
  ];
  return (
    <Modal title={doctor.name} subtitle="Doctor profile" onClose={onClose}>
      <div className="p-4 sm:p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <Stethoscope size={26} />
          </div>
          <div>
            <div className="font-bold text-lg text-slate-900">{doctor.name}</div>
            <Badge tone={doctor.status === 'active' ? 'emerald' : 'red'}>
              {doctor.status === 'active' ? 'Active' : 'Suspended'}
            </Badge>
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="text-slate-400">{r.icon}</span>
              <span className="text-sm text-slate-500 w-32 flex-shrink-0">{r.label}</span>
              <span className="text-sm font-medium text-slate-900">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
