import React, { useEffect, useState } from 'react';

import { PageType, Appointment, WaitlistPatient, ReminderLog, ClinicConfig, Doctor } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navigation from './components/Navigation';
import LandingPage from './components/LandingPage';
import ClinicDashboard from './components/ClinicDashboard';
import SignupPage from './components/SignupPage';
import LoginPage from './components/LoginPage';
import PatientRegistration from './components/PatientRegistration';

import { DEFAULT_CLINIC_CONFIG } from './data/mockData';

function AppShell() {
  const { user, loading, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageType>('landing');

  // Dashboard lists start empty and are populated from the backend on load.
  // No demo/sample data is seeded into the UI.
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistPatient[]>([]);
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig>(DEFAULT_CLINIC_CONFIG);
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [globalNotification, setGlobalNotification] = useState<string | null>(null);

  // Redirect to login when accessing dashboard without auth, and vice versa
  useEffect(() => {
    if (loading) return;
    if (!user && currentPage === 'dashboard') {
      setCurrentPage('login');
    }
    if (user && (currentPage === 'login' || currentPage === 'signup')) {
      setCurrentPage('dashboard');
    }
  }, [user, loading]);

  const handleSetPage = (page: PageType) => {
    if (page === 'dashboard' && !user) {
      setCurrentPage('login');
      return;
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    logout();
    setCurrentPage('landing');
    // Clear dashboard state on logout (no demo data)
    setAppointments([]);
    setWaitlist([]);
    setReminderLogs([]);
    setClinicConfig(DEFAULT_CLINIC_CONFIG);
    setDoctorsList([]);
  };

  const displayGlobalNotification = (message: string) => {
    setGlobalNotification(message);
    setTimeout(() => setGlobalNotification(null), 6000);
  };

  const handleClinicSignup = (customConfig: Partial<ClinicConfig>) => {
    setClinicConfig(prev => ({
      ...prev,
      ...customConfig,
      whatsappNumber: customConfig.phone || prev.whatsappNumber
    }));
    displayGlobalNotification(`🎉 Welcome on board! "${customConfig.name}" has been set up with WhatsApp booking enabled.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafcff] flex flex-col font-sans selection:bg-sky-100 antialiased" id="clinicbook-ai-app">

      {globalNotification && (
        <div className="bg-sky-600 text-white text-xs px-4 py-2.5 font-semibold text-center z-50 flex items-center justify-center gap-2 shadow-inner animate-slideDown" id="global-alert-toast">
          <span className="w-2 h-2 rounded-full bg-lightgreen animate-pulse" />
          <span>{globalNotification}</span>
        </div>
      )}

      <Navigation
        currentPage={currentPage}
        setCurrentPage={handleSetPage}
        clinicName={clinicConfig.name}
        user={user}
        onLogout={handleLogout}
      />

      <div className="flex-1">
        {currentPage === 'landing' && (
          <LandingPage setCurrentPage={handleSetPage} />
        )}

        {currentPage === 'login' && (
          <LoginPage setCurrentPage={handleSetPage} />
        )}

        {currentPage === 'signup' && (
          <SignupPage
            onSignupSuccess={handleClinicSignup}
            setCurrentPage={handleSetPage}
          />
        )}

        {currentPage === 'dashboard' && user && (
          <ClinicDashboard
            appointments={appointments}
            setAppointments={setAppointments}
            waitlist={waitlist}
            setWaitlist={setWaitlist}
            reminderLogs={reminderLogs}
            setReminderLogs={setReminderLogs}
            clinicConfig={clinicConfig}
            setClinicConfig={setClinicConfig}
            doctorsList={doctorsList}
            setDoctorsList={setDoctorsList}
          />
        )}
      </div>

    </div>
  );
}

export default function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') : '';

  // Public, unauthenticated patient self-registration page. Served at /register
  // with the clinic identified by a ?clinic=<clinicId> query param. Rendered
  // outside the auth shell so anonymous visitors can reach it directly.
  if (path === '/register') {
    const params = new URLSearchParams(window.location.search);
    const clinicId = params.get('clinic') ?? params.get('c') ?? '';
    return <PatientRegistration clinicId={clinicId} />;
  }

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
