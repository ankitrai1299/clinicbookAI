import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, Calendar, Clock, Bell, Settings, CreditCard, Activity,
  Search, Plus, CheckCircle, CheckCheck, XCircle,
  Mail, Phone, Globe, ExternalLink, ArrowRight, ShieldAlert,
  QrCode, Copy, Check, Key
} from 'lucide-react';
import AiAssistant from './AiAssistant';
import DoctorWorkflow from './DoctorWorkflow';
import ConnectWhatsApp from './ConnectWhatsApp';
import WhatsAppShareCard from './WhatsAppShareCard';
import DeveloperApi from './DeveloperApi';
import { getChannelStatus as getChannelStatusApi } from '../api/whatsapp';
import { Appointment, Doctor, Patient, ReminderLog, WaitlistPatient, ClinicConfig, DashboardTab } from '../types';
import {
  getAppointments as getAppointmentsApi,
  createAppointment as createAppointmentApi,
  patchAppointment as patchAppointmentApi,
  completeAppointment as completeAppointmentApi,
  ApiAppointment
} from '../api/appointments';
import { getPatients as getPatientsApi, createPatient as createPatientApi, ApiPatient } from '../api/patients';
import PatientRecordModal from './PatientRecordModal';
import { getDoctors as getDoctorsApi, ApiDoctor } from '../api/doctors';
import { getWaitlist as getWaitlistApi, offerWaitlistSlot as offerWaitlistSlotApi, convertWaitlistEntry as convertWaitlistEntryApi, ApiWaitlistEntry } from '../api/waitlist';
import { getMyClinic as getMyClinicApi, updateMyClinic as updateMyClinicApi } from '../api/clinic';
import { getBillingStatus, createCheckoutSession as createCheckoutSessionApi, createPortalSession as createPortalSessionApi } from '../api/billing';
import { getNotifications as getNotificationsApi, markAllNotificationsRead as markAllNotificationsReadApi, ApiNotification } from '../api/notifications';
import { API_BASE } from '../api/client';

const mapStatus = (status: string): Appointment['status'] => {
  const map: Record<string, Appointment['status']> = {
    CONFIRMED: 'Confirmed',
    PENDING: 'Pending',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    NO_SHOW: 'Cancelled',
  };
  return map[status] ?? 'Pending';
};

const mapApiAppointment = (a: ApiAppointment): Appointment => ({
  id: a.id,
  patientName: a.patient?.name ?? 'Unknown',
  patientPhone: a.patient?.phone ?? '',
  doctorName: a.doctor?.name ?? 'Unknown',
  date: a.appointmentDate.split('T')[0],
  time: a.appointmentTime,
  status: mapStatus(a.status),
  language: a.patient?.language ?? 'English',
  completedAt: a.completedAt ?? null,
});

const mapApiPatient = (p: ApiPatient): Patient => ({
  id: p.id,
  name: p.name,
  phone: p.phone,
  preferredLanguage: p.language,
  status: 'active',
  age: p.age,
  gender: p.gender,
  healthConcern: p.healthConcern,
  source: p.source,
});

const mapApiDoctor = (d: ApiDoctor): Doctor => ({
  id: d.id,
  name: d.name,
  specialty: d.speciality,
});

const TODAY = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const mapWaitlistStatus = (status: string): WaitlistPatient['status'] => {
  const map: Record<string, WaitlistPatient['status']> = {
    WAITING: 'Waiting',
    OFFERED: 'Offered',
    RESPONDED: 'Responded',
  };
  return map[status] ?? 'Waiting';
};

const mapApiWaitlist = (w: ApiWaitlistEntry): WaitlistPatient => ({
  id: w.id,
  patientName: w.patient?.name ?? 'Unknown',
  patientPhone: w.patient?.phone ?? '',
  doctorName: '—',
  preferredTimeSlot: '—',
  preferredDoctor: '—',
  language: w.patient?.language ?? 'English',
  dateAdded: '—',
  status: mapWaitlistStatus(w.status),
});

interface ClinicDashboardProps {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  waitlist: WaitlistPatient[];
  setWaitlist: React.Dispatch<React.SetStateAction<WaitlistPatient[]>>;
  reminderLogs: ReminderLog[];
  setReminderLogs: React.Dispatch<React.SetStateAction<ReminderLog[]>>;
  clinicConfig: ClinicConfig;
  setClinicConfig: React.Dispatch<React.SetStateAction<ClinicConfig>>;
  doctorsList: Doctor[];
  setDoctorsList: React.Dispatch<React.SetStateAction<Doctor[]>>;
  // Which tab to land on. Lets the public docs page's "Get an API key" deep-link
  // straight into Developers & API instead of the Overview tab.
  initialTab?: DashboardTab;
}

export default function ClinicDashboard({
  appointments,
  setAppointments,
  waitlist,
  setWaitlist,
  setReminderLogs,
  clinicConfig,
  setClinicConfig,
  doctorsList,
  setDoctorsList,
  initialTab
}: ClinicDashboardProps) {

  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab ?? 'overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Real patients loaded from API
  const [patients, setPatients] = useState<Patient[]>([]);
  // Clinic id for building the public patient-registration share link
  const [clinicId, setClinicId] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  // Raw API data for lookups
  const [apiPatients, setApiPatients] = useState<ApiPatient[]>([]);
  // Patient 360 record modal — the patient whose full record is open (id/code).
  const [recordPatientId, setRecordPatientId] = useState<string | null>(null);
  const [apiDoctors, setApiDoctors] = useState<ApiDoctor[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // States for interactive modal dialogs or walk-in overrides
  const [showAddWalkIn, setShowAddWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInDoctor, setWalkInDoctor] = useState(doctorsList[0]?.name || '');
  const [walkInTime, setWalkInTime] = useState('12:00 PM');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInDate, setWalkInDate] = useState(new Date().toISOString().split('T')[0]);

  // Waitlist recovery animation/loading tracker
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [convertingWlId, setConvertingWlId] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({ doctorId: '', date: '', time: '10:00' });
  const [convertLoading, setConvertLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);

  // Real dashboard notifications (bell + activity feed), polled for near-real-time updates.
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Live WhatsApp connection status (drives the sidebar badge + Settings card).
  const [waConnected, setWaConnected] = useState<boolean | null>(null);
  useEffect(() => {
    getChannelStatusApi()
      .then((s) => setWaConnected(Boolean(s.channel && s.channel.status === 'ACTIVE' && s.healthy !== false)))
      .catch(() => setWaConnected(false));
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Public, shareable patient self-registration link for this clinic.
  const registrationUrl =
    clinicId && typeof window !== 'undefined'
      ? `${window.location.origin}/register?clinic=${clinicId}`
      : '';

  const handleCopyRegistrationLink = async () => {
    if (!registrationUrl) return;
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      triggerToast('Could not copy link. Please copy it manually.');
    }
  };

  // Load real data from backend on mount
  useEffect(() => {
    const loadData = async () => {
      setDataLoading(true);
      try {
        const [aptsData, patientsData, doctorsData, waitlistData, clinicData, billingStatus, notifData] = await Promise.all([
          getAppointmentsApi(),
          getPatientsApi(),
          getDoctorsApi(),
          getWaitlistApi(),
          getMyClinicApi(),
          getBillingStatus().catch(() => ({ configured: false })),
          getNotificationsApi().catch(() => [] as ApiNotification[]),
        ]);

        setNotifications(notifData);
        setAppointments(aptsData.map(mapApiAppointment));
        setApiPatients(patientsData);
        setPatients(patientsData.map(mapApiPatient));
        setApiDoctors(doctorsData);
        const mappedDoctors = doctorsData.map(mapApiDoctor);
        setDoctorsList(mappedDoctors);
        if (mappedDoctors.length > 0) {
          setWalkInDoctor(mappedDoctors[0].name);
        }
        const activeWaitlist = waitlistData.filter(w => w.status !== 'CANCELLED' && w.status !== 'CONVERTED');
        setWaitlist(activeWaitlist.map(mapApiWaitlist));
        setClinicId(clinicData.id);
        setClinicConfig(prev => ({ ...prev, name: clinicData.name, email: clinicData.email, phone: clinicData.phone, plan: clinicData.plan }));
        setStripeConfigured(billingStatus.configured);
      } catch {
        triggerToast('Could not load data from server. Showing cached data.');
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
  }, []);

  // Pull the latest live data (appointments, waitlist, notifications) in one shot.
  const refreshLive = useCallback(async () => {
    try {
      const [apts, wl, notifs] = await Promise.all([
        getAppointmentsApi(),
        getWaitlistApi(),
        getNotificationsApi(),
      ]);
      setAppointments(apts.map(mapApiAppointment));
      setWaitlist(wl.filter((w) => w.status !== 'CANCELLED' && w.status !== 'CONVERTED').map(mapApiWaitlist));
      setNotifications(notifs);
    } catch {
      /* transient failure ignored */
    }
  }, [setAppointments, setWaitlist]);

  // REAL-TIME: subscribe to server-sent events so bot-driven bookings appear the
  // instant they happen (no poll wait). On each pushed event we refetch the live
  // data, and pop a toast for a new booking. EventSource auto-reconnects.
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const es = new EventSource(`${API_BASE}/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('notification', (e) => {
      void refreshLive();
      try {
        const data = JSON.parse((e as MessageEvent).data) as { notificationType?: string; title?: string };
        if (data.notificationType === 'APPOINTMENT_BOOKED') {
          setToastMessage(`🔔 ${data.title ?? 'New appointment booked'}`);
          setTimeout(() => setToastMessage(null), 4000);
        }
      } catch {
        /* ignore malformed event */
      }
    });
    return () => es.close();
  }, [refreshLive]);

  // Safety-net polling: covers SSE reconnect gaps / proxies that buffer streams.
  // Fires immediately on mount and whenever the tab regains focus.
  useEffect(() => {
    void refreshLive();
    const id = setInterval(refreshLive, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshLive();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshLive]);

  const handleMarkNotificationsRead = async () => {
    if (unreadCount === 0) return;
    try {
      await markAllNotificationsReadApi();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* ignore */
    }
  };

  // 1. Offer a cancelled slot to a waitlist patient
  const handleOfferSlot = async (wlItem: WaitlistPatient) => {
    if (recoveringId) return;
    setRecoveringId(wlItem.id);
    try {
      await offerWaitlistSlotApi(wlItem.id);
      setWaitlist(prev => prev.map(item =>
        item.id === wlItem.id ? { ...item, status: 'Offered' } : item
      ));
      setReminderLogs(prev => [
        { id: 'log-' + Date.now(), patientName: wlItem.patientName, type: 'slot_recovered', timestamp: 'Just now', status: 'sent' },
        ...prev
      ]);
      triggerToast(`Slot offer sent to ${wlItem.patientName}. Use "Book Appointment" once confirmed.`);
    } catch {
      triggerToast('Failed to send slot offer.');
    } finally {
      setRecoveringId(null);
    }
  };

  const openConvertForm = (wlId: string) => {
    setConvertingWlId(wlId);
    setConvertForm({ doctorId: apiDoctors[0]?.id ?? '', date: TOMORROW, time: '10:00' });
  };

  const handleConvertWaitlist = async (wlId: string, patientName: string) => {
    if (!convertForm.doctorId || !convertForm.date) return;
    setConvertLoading(true);
    try {
      await convertWaitlistEntryApi(wlId, {
        doctorId: convertForm.doctorId,
        appointmentDate: convertForm.date,
        appointmentTime: convertForm.time,
      });
      const freshApts = await getAppointmentsApi();
      setAppointments(freshApts.map(mapApiAppointment));
      setWaitlist(prev => prev.filter(w => w.id !== wlId));
      setConvertingWlId(null);
      triggerToast(`Appointment booked for ${patientName}.`);
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Failed to book appointment.');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      await updateMyClinicApi({ name: clinicConfig.name, phone: clinicConfig.whatsappNumber || clinicConfig.phone });
      triggerToast('Clinic settings saved.');
    } catch {
      triggerToast('Failed to save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleUpgradePlan = async () => {
    setBillingLoading(true);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckoutSessionApi(
        `${origin}/?billing=success`,
        `${origin}/?billing=cancelled`
      );
      window.location.href = url;
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Could not start checkout.');
      setBillingLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingLoading(true);
    try {
      const { url } = await createPortalSessionApi(window.location.origin + '/');
      window.location.href = url;
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : 'Could not open billing portal.');
      setBillingLoading(false);
    }
  };

  // 2. Action Trigger: Cancel Appointment & Suggest Waitlist
  const handleCancelAppointment = async (id: string, patientName: string) => {
    try {
      await patchAppointmentApi(id, 'CANCELLED');
      setAppointments(prev => prev.map(apt =>
        apt.id === id ? { ...apt, status: 'Cancelled' as const } : apt
      ));
      triggerToast(`🚫 Cancelled appointment for ${patientName}. Triggering waitlist recovery automatically...`);
    } catch (err: unknown) {
      triggerToast(`Error: ${err instanceof Error ? err.message : 'Failed to cancel appointment'}`);
    }
  };

  // 3. Action Trigger: Confirm Pending Appointment
  const handleConfirmAppointment = async (id: string, patientName: string) => {
    try {
      await patchAppointmentApi(id, 'CONFIRMED');
      setAppointments(prev => prev.map(apt =>
        apt.id === id ? { ...apt, status: 'Confirmed' as const } : apt
      ));
      triggerToast(`✔ Manually confirmed appointment for ${patientName}`);
    } catch (err: unknown) {
      triggerToast(`Error: ${err instanceof Error ? err.message : 'Failed to confirm appointment'}`);
    }
  };

  // 3b. Action Trigger: Mark a CONFIRMED appointment as COMPLETED. The backend
  // validates the transition, stamps completedAt/completedBy, and sends the
  // patient an automatic thank-you message on WhatsApp.
  const handleCompleteAppointment = async (id: string, patientName: string) => {
    try {
      const updated = await completeAppointmentApi(id);
      setAppointments(prev => prev.map(apt =>
        apt.id === id
          ? { ...apt, status: 'Completed' as const, completedAt: updated.completedAt ?? new Date().toISOString() }
          : apt
      ));
      triggerToast(`✅ Visit completed for ${patientName}. Thank-you message sent on WhatsApp.`);
    } catch (err: unknown) {
      triggerToast(`Error: ${err instanceof Error ? err.message : 'Failed to mark completed'}`);
    }
  };

  // 4. Create new Quick walk-in appointment
  const handleCreateWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName || !walkInPhone) return;

    try {
      // Find or create patient
      let patient = apiPatients.find(p => p.phone === walkInPhone.trim());
      if (!patient) {
        patient = await createPatientApi({ name: walkInName, phone: walkInPhone.trim(), language: 'English' });
        setApiPatients(prev => [...prev, patient!]);
        setPatients(prev => [...prev, mapApiPatient(patient!)]);
      }

      // Resolve doctorId from selected name
      const selectedDoc = apiDoctors.find(d => d.name === walkInDoctor);
      if (!selectedDoc) {
        triggerToast('Error: Selected doctor not found. Please refresh.');
        return;
      }

      const newApiApt = await createAppointmentApi({
        doctorId: selectedDoc.id,
        patientId: patient.id,
        appointmentDate: walkInDate,
        appointmentTime: walkInTime,
      });

      setAppointments(prev => [mapApiAppointment(newApiApt), ...prev]);
      setWalkInName('');
      setWalkInPhone('');
      setShowAddWalkIn(false);
      triggerToast(`🚶 Walk-in added for ${walkInName} at ${walkInTime}.`);
    } catch (err: unknown) {
      triggerToast(`Error: ${err instanceof Error ? err.message : 'Failed to create appointment'}`);
    }
  };

  // Math Calculations for Dashboard metrics
  const activeToday = appointments.filter(a => a.date === TODAY);
  const confirmedTodayCount = activeToday.filter(a => a.status === 'Confirmed').length;
  const cancelledTodayCount = activeToday.filter(a => a.status === 'Cancelled').length;
  const pendingTodayCount = activeToday.filter(a => a.status === 'Pending').length;
  const completedTodayCount = activeToday.filter(a => a.status === 'Completed').length;
  const waitlistQueueCount = waitlist.filter(w => w.status === 'Waiting').length;

  // Render bad status count
  const utilizationPercent = activeToday.length > 0
    ? Math.round(((confirmedTodayCount + pendingTodayCount) / (activeToday.length)) * 100)
    : 0;
  // No-show rate derived from today's roster (0 when there are no appointments)
  const noShowRate = activeToday.length > 0
    ? Math.round((cancelledTodayCount / activeToday.length) * 100)
    : 0;

  const filteredAppointments = appointments.filter(apt => {
    const matchesSearch = apt.patientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          apt.doctorName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'All' || apt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50 text-left relative" id="dashboard-container">
      
      {/* Toast Notification HUD */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-slideIn">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping"></div>
          <p className="text-xs font-medium font-sans">{toastMessage}</p>
        </div>
      )}

      {/* Sidebar Navigation Panel (Desktop Only) */}
      <aside className="w-64 bg-white border-r border-slate-100 shrink-0 hidden md:flex flex-col justify-between p-5" id="dashboard-sidebar">
        <div className="space-y-6">
          
          {/* Logo & Info */}
          <div className="space-y-1 py-1 px-2">
            <h4 className="font-display font-bold text-slate-800 text-sm tracking-tight truncate">
              {clinicConfig.name}
            </h4>
            <button
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono cursor-pointer ${
                waConnected
                  ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                  : 'bg-amber-50 border border-amber-100 text-amber-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${waConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              {waConnected === null ? 'Checking…' : waConnected ? 'WhatsApp Connected' : 'Connect WhatsApp'}
            </button>
          </div>

          <div className="h-px bg-slate-100"></div>

          {/* Navigation Items list */}
          <nav className="space-y-1">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'appointments', label: 'Appointments', icon: Calendar },
              { id: 'calendar', label: 'Doctors & Schedules', icon: Clock },
              { id: 'waitlist', label: 'Waitlist Patients', icon: Users },
              { id: 'patients', label: 'Clinic Patients', icon: Users },
              { id: 'settings', label: 'Bot Settings', icon: Settings },
              { id: 'developers', label: 'Developers & API', icon: Key },
              { id: 'billing', label: 'Subscription Billing', icon: CreditCard }
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`sidebar-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id as DashboardTab)}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-100'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Pro Plan badge */}
        <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100/60 mt-auto">
          <div className="flex gap-2.5 items-start">
            <span className="text-xl">⭐</span>
            <div className="space-y-1">
              <h5 className="font-bold text-slate-900 text-[11px]">Pro Active Activation</h5>
              <p className="text-[10px] text-slate-500 leading-normal">Your automated reminder bot is online and auditing no-shows.</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Dynamic View Area */}
      <main className="flex-1 overflow-y-auto" id="dashboard-content-area">
        
        {/* Top dashboard control bar */}
        <header className="bg-white border-b border-slate-100 h-16 px-6 flex items-center justify-between sticky top-0 z-20">
          
          {/* Left panel info */}
          <div className="flex items-center gap-3">
            {/* Sidebar toggle option for mobile */}
            <div className="md:hidden flex gap-1.5 overflow-x-auto">
              {['overview', 'appointments', 'waitlist', 'settings'].map((mTab) => (
                <button
                  key={mTab}
                  onClick={() => setActiveTab(mTab as DashboardTab)}
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-sm ${
                    activeTab === mTab ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {mTab}
                </button>
              ))}
            </div>
            
            <div className="hidden md:block">
              <h1 className="font-display font-extrabold text-slate-950 text-base flex items-center gap-2">
                <span>Clinic Management Desk</span>
                <span className="text-[10px] bg-sky-100 text-sky-800 font-mono px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">
                  Admin Active
                </span>
              </h1>
            </div>
          </div>

          {/* Search bar and Notifications */}
          <div className="flex items-center gap-4">
            
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, doctor..."
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-60 focus:outline-hidden focus:border-sky-500 font-sans"
              />
            </div>

            {/* Notification center — real unread count, click to mark all read */}
            <button
              onClick={handleMarkNotificationsRead}
              title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'} — click to mark read` : 'No new notifications'}
              className="relative p-1.5 text-slate-500 hover:text-slate-800 bg-slate-50 rounded-lg cursor-pointer"
              id="notification-bell"
            >
              <Bell className="w-4.5 h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Profile widget — real clinic identity */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-sky-200 text-sky-800 font-bold flex items-center justify-center text-xs border border-sky-300">
                🩺
              </div>
              <div className="hidden lg:block text-left">
                <span className="block text-[11px] font-bold text-slate-900 leading-tight">{clinicConfig.name}</span>
                <span className="block text-[9px] text-slate-400 leading-none">Clinic Admin</span>
              </div>
            </div>

          </div>
        </header>

        {/* Dynamic Inner Tab Router */}
        <div className="p-6 space-y-6">
          
          {/* TAB 1: OVERVIEW COMPONENT */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn" id="overview-tab-view">
              
              {/* Today's Operational KPI Stats Array */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats-widget-row">
                {[
                  { title: "Today's Appts", value: activeToday.length, desc: "Roster count", icon: Calendar, colorClass: "bg-sky-50 text-sky-700" },
                  { title: "Confirmed Bookings", value: confirmedTodayCount, desc: "RSVP Confirmed", icon: CheckCircle, colorClass: "bg-emerald-50 text-emerald-700" },
                  { title: "Pending Bookings", value: pendingTodayCount, desc: "Awaiting confirm", icon: Clock, colorClass: "bg-amber-50 text-amber-700" },
                  { title: "Completed Visits", value: completedTodayCount, desc: "Consultations done", icon: CheckCheck, colorClass: "bg-indigo-50 text-indigo-700" },
                  { title: "Cancelled Slots", value: cancelledTodayCount, desc: "Last-minute vacates", icon: XCircle, colorClass: "bg-red-50 text-red-600" },
                  { title: "Waitlist Patients", value: waitlistQueueCount, desc: "In waiting queue", icon: Users, colorClass: "bg-purple-50 text-purple-700" },
                  { title: "No-show Rate", value: `${noShowRate}%`, desc: "Of today's roster", icon: ShieldAlert, colorClass: "bg-amber-50 text-amber-700" },
                  { title: "Slot Utilization", value: `${utilizationPercent}%`, desc: "Booked vs roster", icon: Activity, colorClass: "bg-teal-50 text-teal-700" }
                ].map((stat, idx) => {
                  const SIcon = stat.icon;
                  return (
                    <div key={idx} className="bg-white rounded-2xl p-4.5 border border-slate-100 shadow-xs flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono shrink flex-wrap">{stat.title}</span>
                        <div className={`p-1.5 rounded-lg ${stat.colorClass}`}>
                          <SIcon className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <span className="block text-2xl font-black text-slate-900 font-display">{stat.value}</span>
                        <span className="block text-[10px] text-slate-400 font-medium font-sans leading-none">{stat.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Roster & Interaction Double-Column Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Roster list table - 8 Columns */}
                <div className="lg:col-span-8 bg-white border border-slate-100 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-150">
                    <div className="text-left">
                      <h3 className="font-display font-extrabold text-base text-slate-950">Appointments Feed</h3>
                      <p className="text-slate-400 text-[10px] font-medium mt-0.5">Live roster for clinic staff. Filtered by active status.</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowAddWalkIn(true)}
                        className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all duration-200"
                        id="add-walk-in-trigger-btn"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Appointment
                      </button>
                    </div>
                  </div>

                  {/* Add walk in inline form */}
                  {showAddWalkIn && (
                    <form onSubmit={handleCreateWalkIn} className="p-5 bg-sky-50/50 rounded-2xl border border-sky-100/80 space-y-4 animate-fadeIn text-left" id="add-appointment-form">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Patient Name</label>
                          <input 
                            type="text" 
                            required 
                            value={walkInName} 
                            onChange={(e)=>setWalkInName(e.target.value)} 
                            placeholder="Full Name" 
                            className="w-full text-xs bg-white border border-slate-200 px-3 py-2 rounded-xl focus:outline-hidden focus:border-sky-500 font-sans" 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">WhatsApp Mobile</label>
                          <input 
                            type="tel" 
                            required 
                            value={walkInPhone} 
                            onChange={(e)=>setWalkInPhone(e.target.value)} 
                            placeholder="Mobile" 
                            className="w-full text-xs bg-white border border-slate-200 px-3 py-2 rounded-xl focus:outline-hidden focus:border-sky-500 font-sans" 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Select Date</label>
                          <input 
                            type="date" 
                            required 
                            value={walkInDate} 
                            onChange={(e)=>setWalkInDate(e.target.value)} 
                            className="w-full text-xs bg-white border border-slate-200 px-3 py-2 rounded-xl focus:outline-hidden focus:border-sky-500 font-sans cursor-pointer" 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Time Unit</label>
                          <select 
                            value={walkInTime} 
                            onChange={(e)=>setWalkInTime(e.target.value)} 
                            className="w-full text-xs bg-white border border-slate-200 px-3 py-2 rounded-xl focus:outline-hidden focus:border-sky-500 font-sans cursor-pointer"
                          >
                            <option value="10:00 AM">10:00 AM</option>
                            <option value="11:30 AM">11:30 AM</option>
                            <option value="12:30 PM">12:30 PM</option>
                            <option value="02:00 PM">02:00 PM</option>
                            <option value="03:30 PM">03:30 PM</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-slate-100">
                        <div className="w-full sm:max-w-md">
                          <label className="block text-[10px] font-bold text-sky-800 uppercase tracking-wider mb-1">Doctor & Specialization</label>
                          <select 
                            value={walkInDoctor} 
                            onChange={(e)=>setWalkInDoctor(e.target.value)} 
                            className="w-full text-xs bg-white border border-slate-200 px-3 py-2 rounded-xl focus:outline-hidden focus:border-sky-500 font-sans cursor-pointer"
                          >
                            {doctorsList.map((doc) => (
                              <option key={doc.id} value={doc.name}>
                                {doc.name} - {doc.specialty}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0">
                          <button type="submit" className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs tracking-wide shadow-xs cursor-pointer transition-all">Submit Appointment</button>
                          <button type="button" onClick={()=>setShowAddWalkIn(false)} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer transition-all">Cancel</button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* HTML ID Attribute Guideline compliant Appointments table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse text-left" id="appointments-primary-table">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-2">Patient Details</th>
                          <th className="py-3 px-2">Doctor Assignment</th>
                          <th className="py-3 px-2">Date / Time</th>
                          <th className="py-3 px-2">Status</th>
                          <th className="py-3 px-2 text-right">Administrative</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredAppointments.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-slate-400 font-mono italic">
                              No compatible patient roster found.
                            </td>
                          </tr>
                        ) : (
                          filteredAppointments.map((apt) => (
                            <tr key={apt.id} className="hover:bg-slate-50/50 transition-colors" id={`appointment-row-${apt.id}`}>
                              <td className="py-3 px-2">
                                <span className="block font-bold text-slate-900 text-xs">{apt.patientName}</span>
                                <span className="block font-mono text-[9px] text-slate-400">{apt.patientPhone}</span>
                              </td>
                              <td className="py-3 px-2 font-medium text-slate-600">
                                {apt.doctorName}
                              </td>
                              <td className="py-3 px-2">
                                <span className="block font-bold text-slate-800 text-xs">{apt.time}</span>
                                <span className="block text-[9px] text-slate-400">{apt.date}</span>
                              </td>
                              <td className="py-3 px-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono ${
                                  apt.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' :
                                  apt.status === 'Completed' ? 'bg-indigo-50 text-indigo-700' :
                                  apt.status === 'Cancelled' ? 'bg-rose-50 text-rose-700' :
                                  apt.status === 'Waitlist' ? 'bg-purple-50 text-purple-700' :
                                  'bg-amber-50 text-amber-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    apt.status === 'Confirmed' ? 'bg-emerald-500' :
                                    apt.status === 'Completed' ? 'bg-indigo-500' :
                                    apt.status === 'Cancelled' ? 'bg-rose-500' :
                                    apt.status === 'Waitlist' ? 'bg-purple-500' :
                                    'bg-amber-500'
                                  }`}></span>
                                  {apt.status}
                                </span>
                                {apt.status === 'Completed' && apt.completedAt && (
                                  <span className="block text-[9px] text-slate-400 font-mono mt-1">
                                    {new Date(apt.completedAt).toLocaleString()}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-2 text-right space-x-1">
                                {apt.status === 'Pending' && (
                                  <button
                                    onClick={() => handleConfirmAppointment(apt.id, apt.patientName)}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[9px] cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                )}
                                {apt.status === 'Confirmed' && (
                                  <button
                                    onClick={() => handleCompleteAppointment(apt.id, apt.patientName)}
                                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[9px] cursor-pointer"
                                    title="Mark consultation finished & send thank-you on WhatsApp"
                                  >
                                    Mark Completed
                                  </button>
                                )}
                                {apt.status !== 'Cancelled' && apt.status !== 'Completed' && (
                                  <button
                                    onClick={() => handleCancelAppointment(apt.id, apt.patientName)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded font-bold text-[9px] cursor-pointer"
                                    title="Cancel slot & trigger waitlist"
                                  >
                                    Cancel Slot
                                  </button>
                                )}
                                {apt.status === 'Completed' && (
                                  <span className="text-[9px] font-bold text-indigo-600 font-mono">✓ Done</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Post-back info */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-500 text-left">
                    💡 <strong>Tip for Clinic Operator:</strong> Cancelling any <em>"Confirmed"</em> dermatology or pediatric appointment will trigger an alert that automatically offers the empty slot to waitlist patients below!
                  </div>
                </div>

                {/* Side waitlist & reminder control widgets - 4 Columns */}
                <div className="lg:col-span-4 space-y-6">
                  
                  {/* Waitlist Control panel */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-4 text-left" id="waitlist-quickpanel">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="font-display font-extrabold text-sm text-slate-900">Waitlist Queue (Smart Recovery)</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Automated queue matching the next best consultation.</p>
                    </div>

                    <div className="space-y-3.5">
                      {waitlist.map((wl) => (
                        <div key={wl.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-100/80 space-y-2.5 hover:border-sky-300 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="text-left">
                              <span className="block font-bold text-slate-900 text-xs leading-normal">{wl.patientName}</span>
                              <span className="text-[9px] font-mono text-slate-400">{wl.patientPhone}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider ${
                              wl.status === 'Waiting' ? 'bg-purple-150 text-purple-700 bg-purple-50' :
                              wl.status === 'Offered' ? 'bg-amber-50 text-amber-600 animate-pulse' :
                              'bg-emerald-50 text-emerald-700 font-bold'
                            }`}>
                              {wl.status === 'Waiting' ? '⏳ In Queue' : 
                               wl.status === 'Offered' ? '📨 Offered' : '🎉 Recovered'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <p className="text-[10px] text-slate-500">
                              👨‍⚕️ Preferred: <strong>{wl.doctorName}</strong>
                            </p>
                            <p className="text-[10px] text-slate-500">
                              ⏰ Window: <strong>{wl.preferredTimeSlot}</strong>
                            </p>
                          </div>

                          {wl.status === 'Waiting' && (
                            <button
                              disabled={recoveringId !== null}
                              onClick={() => handleOfferSlot(wl)}
                              className="w-full mt-2 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 text-white disabled:text-slate-400 font-bold rounded-lg text-[10px] tracking-wide transition-all uppercase flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                            >
                              {recoveringId === wl.id ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  <span>Sending...</span>
                                </>
                              ) : (
                                <>
                                  <span>Offer Cancelled Slot</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          )}
                          {(wl.status === 'Offered' || wl.status === 'Responded') && convertingWlId !== wl.id && (
                            <button
                              onClick={() => openConvertForm(wl.id)}
                              className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] tracking-wide transition-all uppercase flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <span>Book Appointment</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {convertingWlId === wl.id && (
                            <div className="space-y-2 mt-2">
                              <select
                                value={convertForm.doctorId}
                                onChange={e => setConvertForm(f => ({ ...f, doctorId: e.target.value }))}
                                className="w-full text-[10px] px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                              >
                                {apiDoctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                              <input
                                type="date"
                                value={convertForm.date}
                                min={new Date().toISOString().split('T')[0]}
                                onChange={e => setConvertForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full text-[10px] px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                              />
                              <input
                                type="time"
                                value={convertForm.time}
                                onChange={e => setConvertForm(f => ({ ...f, time: e.target.value }))}
                                className="w-full text-[10px] px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  disabled={convertLoading || !convertForm.doctorId || !convertForm.date}
                                  onClick={() => handleConvertWaitlist(wl.id, wl.patientName)}
                                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white disabled:text-slate-400 font-bold rounded-lg text-[10px] cursor-pointer transition-all"
                                >
                                  {convertLoading ? '...' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setConvertingWlId(null)}
                                  className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-[10px] cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live notification feed — real records from the backend */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-4 text-left" id="notification-panel">
                    <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                      <div>
                        <h3 className="font-display font-extrabold text-sm text-slate-900">Notifications</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Live activity from the WhatsApp booking engine.</p>
                      </div>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkNotificationsRead} className="text-[10px] font-bold text-sky-600 hover:text-sky-700">
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 max-h-[290px] overflow-y-auto">
                      {notifications.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic py-6 text-center">No notifications yet. Bookings, approvals and cancellations will appear here.</p>
                      )}
                      {notifications.map((n) => (
                        <div key={n.id} className={`flex gap-3 text-left p-2 rounded-xl ${n.read ? '' : 'bg-sky-50/50'}`}>
                          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 text-base flex items-center justify-center">
                            {n.type === 'APPOINTMENT_BOOKED' ? '📩' :
                             n.type === 'APPOINTMENT_CONFIRMED' ? '✅' :
                             n.type === 'APPOINTMENT_COMPLETED' ? '🎉' :
                             n.type === 'APPOINTMENT_CANCELLED' ? '⚡' : '🔁'}
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-slate-800 leading-tight">{n.title}</p>
                            <p className="text-[11px] text-slate-600 leading-normal">{n.body}</p>
                            <span className="text-[9px] text-slate-400 font-mono font-bold">{new Date(n.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* TAB 2: APPOINTMENTS EXPANDED */}
          {activeTab === 'appointments' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn" id="appointments-tab-view">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div className="text-left">
                  <h2 className="font-display font-extrabold text-lg text-slate-950">Grand Bookings Roster</h2>
                  <p className="text-slate-400 text-xs">A comprehensive audit workspace to search, filter, and inspect historic and walk-in clinical reservations.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {['All', 'Confirmed', 'Pending', 'Cancelled', 'Completed', 'Waitlist'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        statusFilter === st 
                          ? 'bg-sky-600 text-white' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Appointment list filters */}
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e)=>setSearchQuery(e.target.value)}
                    placeholder="Type name, doctor or specialty to query data rows instantly..."
                    className="pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs w-full focus:outline-hidden focus:border-sky-500 font-sans"
                  />
                </div>
              </div>

              {/* Roster table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left" id="appointments-expanded-roster-table">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-3">
                      <th className="py-3 px-3">Patient Code</th>
                      <th className="py-3 px-3">Contact</th>
                      <th className="py-3 px-3">Physician</th>
                      <th className="py-3 px-3">Consult Date</th>
                      <th className="py-3 px-3">Time</th>
                      <th className="py-3 px-3">Status Badging</th>
                      <th className="py-3 px-3 text-right"> Roster Management</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAppointments.map((apt) => (
                      <tr key={apt.id} className="hover:bg-slate-50/60" id={`expanded-row-${apt.id}`}>
                        <td className="py-4 px-3 font-bold text-slate-900">{apt.patientName}</td>
                        <td className="py-4 px-3 font-mono text-[10px] text-slate-500">{apt.patientPhone}</td>
                        <td className="py-4 px-3 text-slate-600 font-medium">{apt.doctorName}</td>
                        <td className="py-4 px-3 text-slate-500">{apt.date}</td>
                        <td className="py-4 px-3 font-bold text-slate-800">{apt.time}</td>
                        <td className="py-4 px-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono ${
                            apt.status === 'Confirmed' ? 'bg-emerald-50 text-emerald-700' :
                            apt.status === 'Completed' ? 'bg-indigo-50 text-indigo-700' :
                            apt.status === 'Cancelled' ? 'bg-rose-50 text-rose-700' :
                            apt.status === 'Waitlist' ? 'bg-purple-50 text-purple-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {apt.status}
                          </span>
                          {apt.status === 'Completed' && apt.completedAt && (
                            <span className="block text-[9px] text-slate-400 font-mono mt-1">
                              {new Date(apt.completedAt).toLocaleString()}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-3 text-right space-x-1">
                          {apt.status === 'Pending' && (
                            <button onClick={() => handleConfirmAppointment(apt.id, apt.patientName)} className="px-2 py-1 bg-emerald-600 text-white font-bold rounded text-[9px] cursor-pointer">Approve</button>
                          )}
                          {apt.status === 'Confirmed' && (
                            <button onClick={() => handleCompleteAppointment(apt.id, apt.patientName)} className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-[9px] cursor-pointer" title="Mark consultation finished & send thank-you on WhatsApp">Mark Completed</button>
                          )}
                          {apt.status !== 'Cancelled' && apt.status !== 'Completed' && (
                            <button onClick={() => handleCancelAppointment(apt.id, apt.patientName)} className="px-2 py-1 bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded font-bold text-[9px] cursor-pointer">Cancel Slot</button>
                          )}
                          {apt.status === 'Completed' && (
                            <span className="text-[9px] font-bold text-indigo-600 font-mono">✓ Done</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: CALENDAR GRID */}
          {activeTab === 'calendar' && <DoctorWorkflow />}

          {/* DEVELOPERS: issue/revoke public-API keys without a terminal */}
          {activeTab === 'developers' && (
            <div className="animate-fadeIn text-left" id="developers-tab-view">
              <DeveloperApi />
            </div>
          )}

          {/* TAB 4: WAITLIST */}
          {activeTab === 'waitlist' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn text-left" id="waitlist-tab-view">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-display font-extrabold text-lg text-slate-950">Active Patient Waitlist Queue</h2>
                <p className="text-slate-400 text-xs">Patients waiting to fill cancelled slots dynamically. Our bot offers them vacating timings immediately.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left" id="waitlist-comprehensive-table">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] pb-2">
                      <th className="py-3 px-2">Patient</th>
                      <th className="py-3 px-2">Preferred Consultant</th>
                      <th className="py-3 px-2">Time Constraints</th>
                      <th className="py-3 px-2">Date Added</th>
                      <th className="py-3 px-2">WhatsApp Preference</th>
                      <th className="py-3 px-2">Current Status</th>
                      <th className="py-3 px-2 text-right">Action Desk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitlist.map((wl) => (
                      <React.Fragment key={wl.id}>
                        <tr className="border-b border-slate-50 hover:bg-slate-50/50" id={`waitlist-full-row-${wl.id}`}>
                          <td className="py-4 px-2">
                            <span className="block font-bold text-slate-900">{wl.patientName}</span>
                            <span className="text-[9px] text-slate-400 font-mono">{wl.patientPhone}</span>
                          </td>
                          <td className="py-4 px-2 font-medium text-slate-600">{wl.preferredDoctor}</td>
                          <td className="py-4 px-2 text-slate-500">{wl.preferredTimeSlot}</td>
                          <td className="py-4 px-2 font-mono text-slate-400">{wl.dateAdded}</td>
                          <td className="py-4 px-2">
                            <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold font-mono text-slate-600">🗣 {wl.language}</span>
                          </td>
                          <td className="py-4 px-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono ${
                              wl.status === 'Waiting' ? 'bg-purple-50 text-purple-700' :
                              wl.status === 'Offered' ? 'bg-amber-50 text-amber-700' :
                              'bg-emerald-50 text-emerald-700'
                            }`}>
                              {wl.status}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-right">
                            {wl.status === 'Waiting' && (
                              <button
                                onClick={() => handleOfferSlot(wl)}
                                disabled={recoveringId !== null}
                                className="px-3 py-1 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg font-bold text-[9px] uppercase cursor-pointer"
                              >
                                {recoveringId === wl.id ? '...' : 'Dispatch Offer'}
                              </button>
                            )}
                            {(wl.status === 'Offered' || wl.status === 'Responded') && (
                              <button
                                onClick={() => openConvertForm(wl.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[9px] uppercase cursor-pointer"
                              >
                                Book Appointment
                              </button>
                            )}
                          </td>
                        </tr>
                        {convertingWlId === wl.id && (
                          <tr className="bg-emerald-50/60 border-b border-emerald-100">
                            <td colSpan={7} className="px-4 py-3">
                              <div className="flex gap-3 items-end flex-wrap">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Doctor</label>
                                  <select
                                    value={convertForm.doctorId}
                                    onChange={e => setConvertForm(f => ({ ...f, doctorId: e.target.value }))}
                                    className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                                  >
                                    {apiDoctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Date</label>
                                  <input
                                    type="date"
                                    value={convertForm.date}
                                    min={new Date().toISOString().split('T')[0]}
                                    onChange={e => setConvertForm(f => ({ ...f, date: e.target.value }))}
                                    className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Time</label>
                                  <input
                                    type="time"
                                    value={convertForm.time}
                                    onChange={e => setConvertForm(f => ({ ...f, time: e.target.value }))}
                                    className="text-xs px-2 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
                                  />
                                </div>
                                <button
                                  disabled={convertLoading || !convertForm.doctorId || !convertForm.date}
                                  onClick={() => handleConvertWaitlist(wl.id, wl.patientName)}
                                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-lg font-bold text-xs cursor-pointer transition-all"
                                >
                                  {convertLoading ? 'Booking...' : 'Confirm Booking'}
                                </button>
                                <button
                                  onClick={() => setConvertingWlId(null)}
                                  className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg font-bold text-xs cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: PATIENTS MASTER */}
          {activeTab === 'patients' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn text-left" id="patients-tab-view">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-display font-extrabold text-lg text-slate-950">Patient Master Directory</h2>
                <p className="text-slate-400 text-xs text-left">The central register of database contacts whose profiles are associated with WhatsApp conversation histories.</p>
              </div>

              {/* Public self-registration share panel: link + QR code */}
              <div
                className="bg-gradient-to-br from-sky-50 to-white border border-sky-100 rounded-2xl p-5"
                id="patient-registration-share"
              >
                <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-2.5">
                    {registrationUrl ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(registrationUrl)}`}
                        alt="Patient registration QR code"
                        width={120}
                        height={120}
                        className="w-[120px] h-[120px] block"
                      />
                    ) : (
                      <div className="w-[120px] h-[120px] flex items-center justify-center text-slate-300">
                        <QrCode className="w-10 h-10" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <QrCode className="w-4 h-4 text-sky-600" />
                      <h3 className="font-display font-black text-sm text-slate-950">Public Patient Registration</h3>
                    </div>
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                      Share this link or QR code with patients. They can self-register from any phone, and
                      will appear here automatically with a WhatsApp confirmation sent on submit.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        readOnly
                        value={registrationUrl || 'Loading clinic link…'}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-w-0 text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-slate-600 focus:outline-none focus:border-sky-500"
                        id="patient-registration-url"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleCopyRegistrationLink}
                          disabled={!registrationUrl}
                          className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          id="copy-registration-link-btn"
                        >
                          {linkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {linkCopied ? 'Copied' : 'Copy'}
                        </button>
                        {registrationUrl && (
                          <a
                            href={registrationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left" id="patients-master-directory-table">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="py-3 px-2">Patient Code</th>
                      <th className="py-3 px-2">Registered Phone</th>
                      <th className="py-3 px-2">Age / Gender</th>
                      <th className="py-3 px-2">Reason for Visit</th>
                      <th className="py-3 px-2">Preferred Chat Accent</th>
                      <th className="py-3 px-2">Activity State</th>
                      <th className="py-3 px-2 text-right">Action History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50" id={`patient-dir-row-${p.id}`}>
                        <td className="py-3 px-2 font-bold text-slate-900">{p.name}</td>
                        <td className="py-3 px-2 font-mono text-[10px] text-slate-500">{p.phone}</td>
                        <td className="py-3 px-2 text-slate-500">
                          {p.age != null || p.gender ? `${p.age ?? '—'}${p.gender ? ` · ${p.gender}` : ''}` : '—'}
                        </td>
                        <td className="py-3 px-2 text-slate-500 max-w-[220px] truncate" title={p.healthConcern ?? ''}>
                          {p.healthConcern || '—'}
                        </td>
                        <td className="py-3 px-2 font-semibold text-sky-700">🗣 {p.preferredLanguage}</td>
                        <td className="py-3 px-2">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold font-mono text-[9px] uppercase tracking-wider">
                            ● Active
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={() => setRecordPatientId(p.id)}
                            className="px-2.5 py-1 bg-sky-600 border border-sky-600 text-white rounded text-[9px] cursor-pointer hover:bg-sky-700 font-bold"
                          >
                            View Record
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: SETTINGS COMPONENT (INLINE EXPOSURE) */}
          {activeTab === 'settings' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn" id="settings-tab-view">
              <div className="border-b border-slate-100 pb-4 text-left">
                <h2 className="font-display font-extrabold text-lg text-slate-950">Bot Integration Settings</h2>
                <p className="text-slate-400 text-xs">Configure how the ClinicBook AI speaks, operates, and checks calendar synchronization.</p>
              </div>

              {/* WhatsApp connection — one-click Meta Embedded Signup */}
              <div className="text-left">
                <h3 className="font-display font-black text-sm text-slate-950 mb-3">WhatsApp Connection</h3>
                <ConnectWhatsApp onConnected={() => setWaConnected(true)} />
                {/* Zero-Meta-setup alternative: share the clinic's join QR/link. */}
                <WhatsAppShareCard />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                {/* Clinic Info card */}
                <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <h3 className="font-display font-black text-sm text-slate-950">1. Clinic Profile</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Clinic Name</label>
                      <input 
                        type="text" 
                        value={clinicConfig.name}
                        onChange={(e)=>setClinicConfig({...clinicConfig, name: e.target.value})}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-sans"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">WhatsApp Virtual Booking Mobile</label>
                      <input 
                        type="text" 
                        value={clinicConfig.whatsappNumber}
                        onChange={(e)=>setClinicConfig({...clinicConfig, whatsappNumber: e.target.value})}
                        className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-sans"
                      />
                    </div>
                  </div>
                </div>

                {/* Reminder triggers */}
                <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <h3 className="font-display font-black text-sm text-slate-950">2. Reminder Dispatches</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={clinicConfig.reminderSettings.send24h}
                        onChange={(e)=>setClinicConfig({
                          ...clinicConfig, 
                          reminderSettings: { ...clinicConfig.reminderSettings, send24h: e.target.checked }
                        })}
                        className="rounded text-sky-600 bg-white"
                      />
                      <span className="text-xs text-slate-700 leading-normal">
                        Enable automated <strong className="font-bold">24-hour</strong> ahead WhatsApp RSVP confirm cards
                      </span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={clinicConfig.reminderSettings.send2h}
                        onChange={(e)=>setClinicConfig({
                          ...clinicConfig, 
                          reminderSettings: { ...clinicConfig.reminderSettings, send2h: e.target.checked }
                        })}
                        className="rounded text-sky-600 bg-white"
                      />
                      <span className="text-xs text-slate-700 leading-normal">
                        Enable automated <strong className="font-bold">2-hour</strong> urgent consult coordinate text dispatches
                      </span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={clinicConfig.reminderSettings.autoWaitlist}
                        onChange={(e)=>setClinicConfig({
                          ...clinicConfig, 
                          reminderSettings: { ...clinicConfig.reminderSettings, autoWaitlist: e.target.checked }
                        })}
                        className="rounded text-sky-600 bg-white"
                      />
                      <span className="text-xs text-slate-700 leading-normal">
                        Autonomously trigger waitlist recovery queue on patient vacates
                      </span>
                    </label>
                  </div>
                </div>

                {/* Available Doctors */}
                <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 lg:col-span-2">
                  <h3 className="font-display font-black text-sm text-slate-950">3. Registered Clinic Doctors</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {doctorsList.map((d, i) => (
                      <div key={d.id} className="bg-white p-3.5 rounded-xl border border-slate-200">
                        <span className="block font-bold text-xs text-slate-900 leading-tight">{d.name}</span>
                        <span className="block mt-1 bg-sky-50 text-[10px] text-sky-700 font-bold px-2 py-0.5 rounded-lg w-fit font-mono">{d.specialty}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              <div className="pt-4 border-t border-slate-150 flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={settingsSaving}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  {settingsSaving ? 'Saving...' : 'Save Settings Configuration'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 7: BILLING */}
          {activeTab === 'billing' && (() => {
            const isStarter = clinicConfig.plan === 'STARTER';
            const planLabel: Record<string, string> = {
              STARTER: 'Starter (Free)',
              GROWTH: clinicConfig.country === 'India' ? 'Growth — ₹999 / mo' : 'Growth — $29 / mo',
              SCALE: clinicConfig.country === 'India' ? 'Scale — ₹2,499 / mo' : 'Scale — $79 / mo',
              ENTERPRISE: 'Enterprise',
            };
            const currentLabel = planLabel[clinicConfig.plan] ?? clinicConfig.plan;
            return (
              <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn text-left" id="billing-tab-view">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="font-display font-extrabold text-lg text-slate-950">SaaS Subscription Ledger</h2>
                  <p className="text-slate-400 text-xs">Manage your ClinicBook AI subscription billing, download invoices, or audit transaction history.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Active Plan info */}
                  <div className={`${isStarter ? 'bg-slate-50 border-slate-200' : 'bg-sky-50 border-sky-100'} border rounded-2xl p-6 text-left space-y-4`}>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono ${isStarter ? 'bg-slate-200 text-slate-600' : 'bg-sky-100 text-sky-800'}`}>
                      {isStarter ? 'Free Tier' : 'Active Plan'}
                    </span>
                    <div>
                      <h3 className="font-display text-2xl font-black text-slate-950">{currentLabel}</h3>
                      {isStarter && (
                        <p className="text-[11px] text-slate-500 mt-1">Upgrade to unlock unlimited reminders and WhatsApp booking.</p>
                      )}
                    </div>
                    {!isStarter && (
                      <div className="pt-3 border-t border-sky-100 text-slate-600 text-xs leading-relaxed">
                        ✔ Includes up to 10 active clinical doctors<br />
                        ✔ Unlimited automatic WhatsApp reminders loops<br />
                        ✔ Vernacular smart auto-booking AI
                      </div>
                    )}
                    {isStarter && stripeConfigured && (
                      <button
                        onClick={handleUpgradePlan}
                        disabled={billingLoading}
                        className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                      >
                        {billingLoading ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Redirecting...</span></>
                        ) : (
                          <><span>Upgrade to Growth Plan</span><ExternalLink className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    )}
                    {isStarter && !stripeConfigured && (
                      <p className="text-[10px] text-amber-600 font-semibold mt-2">Billing not yet configured — add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to backend/.env to enable upgrades.</p>
                    )}
                  </div>

                  {/* Current Month Activity */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 text-left space-y-4">
                    <h4 className="font-display font-bold text-sm text-slate-900">Current Month Activity</h4>
                    <div className="space-y-3 font-sans text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Active Consult Slots</span>
                        <strong className="text-slate-800">{appointments.length} synced</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Patients on record</span>
                        <strong className="text-slate-800">{patients.length} registered</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Waitlist entries</span>
                        <strong className="text-slate-800">{waitlist.length} queued</strong>
                      </div>
                      <div className="h-px bg-slate-100" />
                      <div className="flex justify-between">
                        <span className="text-slate-500">Subscription plan</span>
                        <strong className={`${isStarter ? 'text-slate-500' : 'text-sky-700'}`}>{clinicConfig.plan}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Stripe portal / payment channel */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left space-y-4">
                    <h4 className="font-display font-bold text-sm text-slate-900">Secure Payment Channel</h4>
                    <p className="text-slate-500 text-[11px] leading-relaxed">
                      Powered by Stripe. Manage your subscription, download invoices, update payment methods, or cancel anytime from the Stripe customer portal.
                    </p>
                    {!isStarter ? (
                      <button
                        onClick={handleManageBilling}
                        disabled={billingLoading}
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {billingLoading ? (
                          <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Redirecting...</span></>
                        ) : (
                          <><span>Manage Subscription</span><ExternalLink className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full py-2.5 bg-slate-200 text-slate-400 font-bold rounded-xl text-xs cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <span>No active subscription</span>
                      </button>
                    )}
                  </div>

                </div>
              </div>
            );
          })()}

        </div>

      </main>

      <AiAssistant />

      {recordPatientId && (
        <PatientRecordModal patientId={recordPatientId} onClose={() => setRecordPatientId(null)} />
      )}

    </div>
  );
}
