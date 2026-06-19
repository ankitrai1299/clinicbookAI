import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { DoctorAccount, DoctorAuthResult, clearDoctorToken, getDoctorMe, getDoctorToken, setDoctorToken } from '../../api/doctorPortal';
import DoctorAuthPage from './DoctorAuthPage';
import DoctorDashboard from './DoctorDashboard';

// Entry point for the standalone Doctor Portal, served at /doctor. Manages its
// OWN auth (separate doctor_token), completely isolated from the Admin shell.
export default function DoctorPortal() {
  const [doctor, setDoctor] = useState<DoctorAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getDoctorToken()) {
      setLoading(false);
      return;
    }
    getDoctorMe()
      .then(setDoctor)
      .catch(() => clearDoctorToken())
      .finally(() => setLoading(false));
  }, []);

  const handleAuthed = (res: DoctorAuthResult) => {
    setDoctorToken(res.accessToken);
    setDoctor(res.doctor);
  };

  const handleLogout = () => {
    clearDoctorToken();
    setDoctor(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafcff]">
        <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
      </div>
    );
  }

  return doctor ? (
    <DoctorDashboard doctor={doctor} onLogout={handleLogout} />
  ) : (
    <DoctorAuthPage onAuthed={handleAuthed} />
  );
}
