import React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Check, Plus, ShieldCheck, UserCog } from 'lucide-react';
import {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  Role,
  Permission,
  AuthUser,
} from '../../../contracts';
import { getUsers, createUser, updateUserRole } from '../../../services/api';
import { useAuth } from '../../../context/Auth';
import {
  Page,
  SectionHeader,
  Card,
  Badge,
  PrimaryButton,
  Modal,
  Field,
  inputClass,
  LoadingState,
  EmptyState,
  ErrorState,
} from '../ui';

const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard.view': 'View Dashboard',
  'analytics.view': 'View Analytics',
  'doctors.view': 'View Doctors',
  'doctors.manage': 'Manage Doctors',
  'patients.view': 'View Patients',
  'patients.manage': 'Manage Patients',
  'consultations.view': 'View Consultations',
  'consultations.manage': 'Manage Consultations',
  'reports.view': 'View Reports',
  'reports.manage': 'Manage Reports',
  'settings.view': 'View Settings',
  'settings.manage': 'Manage Settings',
  'users.manage': 'Manage Users',
  'notifications.view': 'View Notifications',
};

export default function RolesUsersSection() {
  const { token } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setUsers(await getUsers(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRoleChange = async (id: string, role: Role) => {
    if (!token) return;
    try {
      await updateUserRole(token, id, role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  return (
    <Page>
      <SectionHeader
        title="Roles & Users"
        description="Review the permission matrix and manage admin users."
        action={
          <PrimaryButton onClick={() => setCreating(true)}>
            <Plus size={18} /> Add User
          </PrimaryButton>
        }
      />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {/* Permission matrix */}
      <Card className="overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <ShieldCheck size={18} className="text-blue-500" />
          <h3 className="font-semibold text-slate-800">Role Permissions Matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PERMISSIONS.map((perm) => (
                <tr key={perm} className="hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-medium text-slate-700">{PERMISSION_LABELS[perm]}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-4 py-2.5 text-center">
                      {ROLE_PERMISSIONS[r].includes(perm) ? (
                        <Check size={16} className="text-emerald-600 inline" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Users */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <UserCog size={18} className="text-blue-500" />
          <h3 className="font-semibold text-slate-800">Users</h3>
        </div>
        {loading ? (
          <LoadingState />
        ) : users.length === 0 ? (
          <EmptyState icon={UserCog} label="No users found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-slate-900">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={u.status === 'active' ? 'emerald' : 'red'}>
                        {u.status === 'active' ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
    </Page>
  );
}

function CreateUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('doctor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await createUser(token, { name, email, password, role });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add User" subtitle="Create a new admin user" onClose={onClose}>
      <form onSubmit={submit} className="p-4 sm:p-6 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">{error}</div>
        )}
        <Field label="Full Name">
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
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
            {busy ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
