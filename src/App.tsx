import React, { useEffect, useState } from 'react';

import { PageType, Appointment, WaitlistPatient, ReminderLog, ClinicConfig, Doctor } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navigation from './components/Navigation';
import LandingPage from './components/LandingPage';
import ClinicDashboard from './components/ClinicDashboard';
import NovaScribeApp from './novascribe/NovaScribeApp';
import ProductHub from './components/ProductHub';
import NovaScribeLanding from './components/NovaScribeLanding';
import type { ActiveProduct } from './components/Navigation';
import SignupPage from './components/SignupPage';
import LoginPage from './components/LoginPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import WelcomeScreen from './components/WelcomeScreen';
import PatientRegistration from './components/PatientRegistration';
import type { AuthUser } from './api/auth';

import { DEFAULT_CLINIC_CONFIG } from './data/mockData';

function AppShell() {
  const { user, loading, logout, setAuth } = useAuth();
  // The platform launcher (product chooser) is the first screen.
  const [currentPage, setCurrentPage] = useState<PageType>('hub');
  // Which product's app to land on after a successful login.
  const [intendedApp, setIntendedApp] = useState<'dashboard' | 'novascribe'>('dashboard');
  // Self-service onboarding hand-off: email pending OTP verification, and the
  // clinic config captured at signup to apply once verified.
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingConfig, setPendingConfig] = useState<Partial<ClinicConfig> | null>(null);

  // Dashboard lists start empty and are populated from the backend on load.
  // No demo/sample data is seeded into the UI.
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistPatient[]>([]);
  const [reminderLogs, setReminderLogs] = useState<ReminderLog[]>([]);
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig>(DEFAULT_CLINIC_CONFIG);
  const [doctorsList, setDoctorsList] = useState<Doctor[]>([]);
  const [globalNotification, setGlobalNotification] = useState<string | null>(null);

  // Gate the authenticated apps; after login land on the product the user chose.
  useEffect(() => {
    if (loading) return;
    if (!user && (currentPage === 'dashboard' || currentPage === 'novascribe')) {
      setCurrentPage('login');
    }
    if (user && (currentPage === 'login' || currentPage === 'signup')) {
      setCurrentPage(intendedApp);
    }
  }, [user, loading]);

  const handleSetPage = (page: PageType) => {
    if ((page === 'dashboard' || page === 'novascribe') && !user) {
      setIntendedApp(page);
      setCurrentPage('login');
      return;
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Platform launcher handlers — open a product (straight to its app when logged
  // in, otherwise its landing / login).
  const openHub = () => handleSetPage('hub');
  const openClinicBook = () => {
    setIntendedApp('dashboard');
    handleSetPage(user ? 'dashboard' : 'landing');
  };
  const openNovaScribe = () => {
    if (user) {
      handleSetPage('novascribe');
    } else {
      setIntendedApp('novascribe');
      handleSetPage('novascribe-landing');
    }
  };
  // The login/signup/verify screens belong to whichever product the user is
  // entering, so the navbar brands them as NovaScribe when that's the intent.
  const onNovaAuthFlow =
    (currentPage === 'login' || currentPage === 'signup' || currentPage === 'verify-email') &&
    intendedApp === 'novascribe';
  const activeProduct: ActiveProduct =
    currentPage === 'novascribe' || currentPage === 'novascribe-landing' || onNovaAuthFlow
      ? 'novascribe'
      : currentPage === 'hub'
        ? null
        : 'clinicbook';

  const handleLogout = () => {
    logout();
    setCurrentPage('hub');
    setIntendedApp('dashboard');
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

  const applyClinicConfig = (customConfig: Partial<ClinicConfig>) => {
    setClinicConfig(prev => ({
      ...prev,
      ...customConfig,
      whatsappNumber: customConfig.phone || prev.whatsappNumber
    }));
  };

  // Signup succeeded but the email is unverified — capture the email + the config
  // to apply after verification, then route to the OTP screen.
  const handlePendingVerification = (email: string, customConfig: Partial<ClinicConfig> | null) => {
    setPendingEmail(email);
    setPendingConfig(customConfig);
    setCurrentPage('verify-email');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // OTP verified — store the session, apply any captured config, go to Welcome.
  const handleVerified = (token: string, verifiedUser: AuthUser) => {
    setAuth(token, verifiedUser);
    if (pendingConfig) applyClinicConfig(pendingConfig);
    setPendingConfig(null);
    setCurrentPage('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // NovaScribe is a full-screen app (own sidebar). Render it as a takeover — the
  // "All Apps" item in its sidebar returns to the platform hub.
  if (user && currentPage === 'novascribe') {
    return <NovaScribeApp onExitToHub={openHub} doctorName={user.name} />;
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
        activeProduct={activeProduct}
        onOpenHub={openHub}
      />

      <div className="flex-1">
        {currentPage === 'hub' && (
          <ProductHub
            userName={user?.name}
            onOpenClinicBook={openClinicBook}
            onOpenNovaScribe={openNovaScribe}
          />
        )}

        {currentPage === 'novascribe-landing' && (
          <NovaScribeLanding
            isLoggedIn={!!user}
            onOpen={() => handleSetPage('novascribe')}
            onBack={openHub}
          />
        )}

        {currentPage === 'landing' && (
          <LandingPage setCurrentPage={handleSetPage} />
        )}

        {currentPage === 'login' && (
          <LoginPage
            setCurrentPage={handleSetPage}
            onNeedVerification={(email) => handlePendingVerification(email, null)}
            product={intendedApp === 'novascribe' ? 'novascribe' : 'clinicbook'}
          />
        )}

        {currentPage === 'signup' && (
          <SignupPage
            onPendingVerification={handlePendingVerification}
            setCurrentPage={handleSetPage}
          />
        )}

        {currentPage === 'verify-email' && (
          <VerifyEmailPage
            email={pendingEmail}
            onVerified={handleVerified}
            onBack={() => setCurrentPage('signup')}
          />
        )}

        {currentPage === 'welcome' && user && (
          <WelcomeScreen
            clinicName={clinicConfig.name}
            ownerName={clinicConfig.ownerName || user.name}
            onContinue={() => handleSetPage('dashboard')}
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
