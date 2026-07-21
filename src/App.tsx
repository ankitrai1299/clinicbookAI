import React, { useEffect, useState } from 'react';

import { PageType, DashboardTab, Appointment, WaitlistPatient, ReminderLog, ClinicConfig, Doctor } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navigation from './components/Navigation';
import LandingPage from './components/LandingPage';
import DeveloperDocs from './components/DeveloperDocs';
import ClinicDashboard from './components/ClinicDashboard';
import MediscribeApp from './mediscribe/MediscribeApp';
import ProductHub from './components/ProductHub';
import MediScribeLanding from './components/MediScribeLanding';
import type { ActiveProduct } from './components/Navigation';
import SignupPage from './components/SignupPage';
import LoginPage from './components/LoginPage';
import VerifyEmailPage from './components/VerifyEmailPage';
import WelcomeScreen from './components/WelcomeScreen';
import PatientRegistration from './components/PatientRegistration';
import type { AuthUser } from './api/auth';

import { DEFAULT_CLINIC_CONFIG } from './data/mockData';

// Each product gets its own shareable URL, so a link can be sent to a clinic or a
// doctor without landing them on the product chooser:
//
//   /clinicbook   → ClinicBook AI (patient booking)   — its landing page
//   /novascribe   → NovaScribe (AI scribe)            — its landing page
//   ?app=novascribe → opens straight INTO the scribe app (the phone app's
//                     WebView loads this, so it must keep working)
//
// vercel.json already rewrites unknown paths to index.html, so these resolve.
type Entry = { page: PageType; app: 'dashboard' | 'novascribe' } | null;

function readEntry(): Entry {
  if (typeof window === 'undefined') return null;

  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  if (path === '/novascribe' || path === '/nova' || path === '/scribe') {
    return { page: 'novascribe-landing', app: 'novascribe' };
  }
  if (path === '/clinicbook' || path === '/booking') {
    return { page: 'landing', app: 'dashboard' };
  }

  // Query form — used by the phone app, which wants the APP, not the landing.
  const app = new URLSearchParams(window.location.search).get('app');
  if (app === 'novascribe') return { page: 'novascribe', app: 'novascribe' };
  if (app === 'clinicbook') return { page: 'dashboard', app: 'dashboard' };

  return null;
}

const ENTRY = readEntry();

// Keep the address bar in step with the product being viewed, so whatever a user
// is looking at is what they copy out of the URL bar.
const PAGE_PATHS: Partial<Record<PageType, string>> = {
  hub: '/',
  landing: '/clinicbook',
  dashboard: '/clinicbook',
  'novascribe-landing': '/novascribe',
  novascribe: '/novascribe',
};

function AppShell() {
  const { user, loading, logout, setAuth } = useAuth();
  // The platform launcher (product chooser) is the first screen — unless deep-linked
  // straight to a product (e.g. the mobile app loads `?app=novascribe`).
  const [currentPage, setCurrentPage] = useState<PageType>(ENTRY?.page ?? 'hub');
  // Which product's app to land on after a successful login.
  const [intendedApp, setIntendedApp] = useState<'dashboard' | 'novascribe'>(
    ENTRY?.app ?? 'dashboard',
  );
  // Deep-link a specific dashboard tab (e.g. the docs page's "Get an API key"
  // jumps a logged-in clinic straight to Developers & API, not the Overview).
  const [dashboardTab, setDashboardTab] = useState<DashboardTab | undefined>(undefined);
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

  // Reflect the current product in the URL (replace, not push, so the back button
  // still leaves the site rather than walking every in-app screen). The phone
  // app's `?app=` entry is left alone so its WebView keeps its deep link.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search.includes('app=')) return;
    const next = PAGE_PATHS[currentPage];
    if (next && window.location.pathname !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [currentPage]);

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

  // "Get an API key" on the public docs page: a logged-in clinic goes straight to
  // its Developers & API tab; a visitor is sent to sign up (a key needs a clinic).
  const openDeveloperKeys = () => {
    if (user) {
      setDashboardTab('developers');
      handleSetPage('dashboard');
    } else {
      handleSetPage('signup');
    }
  };

  // Clear the deep-link once we've left the dashboard, so the NEXT normal entry
  // (via "Clinic Dashboard") opens on Overview rather than stale Developers.
  useEffect(() => {
    if (currentPage !== 'dashboard' && dashboardTab) setDashboardTab(undefined);
  }, [currentPage, dashboardTab]);

  // Platform launcher handlers — open a product (straight to its app when logged
  // in, otherwise its landing / login).
  const openHub = () => handleSetPage('hub');
  const openClinicBook = () => {
    setIntendedApp('dashboard');
    handleSetPage(user ? 'dashboard' : 'landing');
  };
  const openMediScribe = () => {
    if (user) {
      handleSetPage('novascribe');
    } else {
      setIntendedApp('novascribe');
      handleSetPage('novascribe-landing');
    }
  };
  // The login/signup/verify screens belong to whichever product the user is
  // entering, so the navbar brands them as MediScribe when that's the intent.
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

  // MediScribe is a full-screen app (own sidebar). Render it as a takeover — the
  // "All Apps" item in its sidebar returns to the platform hub.
  if (user && currentPage === 'novascribe') {
    return <MediscribeApp onExitToHub={openHub} doctorName={user.name} />;
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
            onOpenMediScribe={openMediScribe}
          />
        )}

        {currentPage === 'novascribe-landing' && (
          <MediScribeLanding
            isLoggedIn={!!user}
            onOpen={() => handleSetPage('novascribe')}
            onBack={openHub}
          />
        )}

        {currentPage === 'landing' && (
          <LandingPage setCurrentPage={handleSetPage} />
        )}

        {/* Public API docs — reachable without a login so a partner's developer
            can evaluate the integration before signing up. */}
        {currentPage === 'developers' && (
          <DeveloperDocs setCurrentPage={handleSetPage} onGetApiKey={openDeveloperKeys} isLoggedIn={!!user} />
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
            initialTab={dashboardTab}
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
