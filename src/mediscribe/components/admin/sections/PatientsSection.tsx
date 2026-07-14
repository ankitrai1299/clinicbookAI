import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { realPhone } from '../../../../utils/phone';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
} from 'lucide-react';
import { Patient, ConsultationHistoryItem } from '../../../types';
import {
  getAdminPatients,
  deletePatient,
  getAdminPatientHistory,
  savePatient,
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
} from '../ui';

export default function PatientsSection() {
  const { token, hasPermission } = useAuth();
  const canManage = hasPermission('patients.manage');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Patient | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (q = '') => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        setPatients(await getAdminPatients(token, q));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patients');
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
      await deletePatient(token, deleting.id);
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
        title="Patient Management"
        description="Search patients and review their consultation history."
        action={
          canManage && (
            <PrimaryButton onClick={() => setCreating(true)}>
              <Plus size={18} /> Add Patient
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
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : patients.length === 0 ? (
          <EmptyState icon={Users} label="No patients found." />
        ) : (
          <div className="divide-y divide-slate-100">
            {patients.map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <button
                    onClick={() => setExpanded((e) => (e === p.id ? null : p.id))}
                    className="p-1 text-slate-400 hover:text-slate-700"
                    title="History"
                  >
                    {expanded === p.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.age} yrs • {p.gender}
                      {realPhone(p.phone) ? ` • ${realPhone(p.phone)}` : ''}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        title="Edit"
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleting(p)}
                        title="Delete"
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        <Trash2 size={16} className="text-red-600" />
                      </button>
                    </div>
                  )}
                </div>
                {expanded === p.id && <PatientHistoryPanel patientId={p.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      {(creating || editing) && (
        <PatientFormModal
          patient={editing}
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

      {deleting && (
        <ConfirmDialog
          title="Delete patient"
          message={`Permanently delete ${deleting.name}? This cannot be undone.`}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Page>
  );
}

function PatientHistoryPanel({ patientId }: { patientId: string }) {
  const { token } = useAuth();
  const [items, setItems] = useState<ConsultationHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getAdminPatientHistory(token, patientId, 'desc')
      .then((data) => !cancelled && setItems(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load history'));
    return () => {
      cancelled = true;
    };
  }, [token, patientId]);

  return (
    <div className="bg-slate-50 px-5 py-4 border-t border-slate-100">
      {error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : !items ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading history…
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500">No previous consultations.</div>
      ) : (
        <div className="space-y-3">
          {items.map((h) => (
            <div key={h.consultationId} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FileText size={15} className="text-blue-500" />
                  {h.visitDateTime}
                </div>
                <Badge tone={h.reportStatus === 'Completed' ? 'emerald' : 'amber'}>
                  {h.reportStatus}
                </Badge>
              </div>
              {h.chiefComplaints.length > 0 && (
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">CC:</span> {h.chiefComplaints.join('; ')}
                </p>
              )}
              {h.diagnosis.length > 0 && (
                <p className="text-sm text-slate-600 mt-1">
                  <span className="font-semibold text-slate-700">Dx:</span> {h.diagnosis.join('; ')}
                </p>
              )}
              {h.medicines.length > 0 && (
                <p className="text-sm text-slate-600 mt-1">
                  <span className="font-semibold text-slate-700">Rx:</span>{' '}
                  {h.medicines.map((m) => m.medicine).filter(Boolean).join(', ')}
                </p>
              )}
              {h.followUp && (
                <p className="text-sm text-slate-600 mt-1">
                  <span className="font-semibold text-slate-700">Follow-up:</span> {h.followUp}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PatientFormModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(patient?.name || '');
  const [age, setAge] = useState(String(patient?.age ?? ''));
  const [gender, setGender] = useState(patient?.gender || 'Male');
  const [phone, setPhone] = useState(patient?.phone || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const record: Patient = {
        id: patient?.id || `pat-${Date.now()}`,
        name,
        age: parseInt(age, 10) || 0,
        gender,
        phone,
      };
      await savePatient(record);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save patient');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={patient ? 'Edit Patient' : 'Add New Patient'}
      subtitle={patient ? 'Update patient details' : 'Create a patient record'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="p-4 sm:p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}
        <Field label="Full Name">
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Age">
            <input type="number" required min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Gender">
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Phone (Optional)">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </Field>
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
            {busy ? 'Saving…' : patient ? 'Save Changes' : 'Create Patient'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
