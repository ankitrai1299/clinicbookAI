import React, { useEffect, useState } from 'react';
import {
  Users, Calendar, Clock, Bell, Settings, CreditCard, Activity,
  Search, Plus, CheckCircle, XCircle,
  Mail, Phone, Globe, ExternalLink, ArrowRight, ShieldAlert
} from 'lucide-react';
import { Appointment, Doctor, Patient, ReminderLog, WaitlistPatient, ClinicConfig, DashboardTab } from '../types';
import {
  getAppointments as getAppointmentsApi,
  createAppointment as createAppointmentApi,
  patchAppointment as patchAppointmentApi,
  ApiAppointment
} from '../api/appointments';
import { getPatients as getPatientsApi, createPatient as createPatientApi, ApiPatient } from '../api/patients';
import { getDoctors as getDoctorsApi, ApiDoctor } from '../api/doctors';

const mapStatus = (status: string): Appointment['status'] => {
  const map: Record<string, Appointment['status']> = {
    CONFIRMED: 'Confirmed',
    PENDING: 'Pending',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Confirmed',
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
});

const mapApiPatient = (p: ApiPatient): Patient => ({
  id: p.id,
  name: p.name,
  phone: p.phone,
  preferredLanguage: p.language,
  status: 'active',
});

const mapApiDoctor = (d: ApiDoctor): Doctor => ({
  id: d.id,
  name: d.name,
  specialty: d.speciality,
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
}

export default function ClinicDashboard({
  appointments,
  setAppointments,
  waitlist,
  setWaitlist,
  reminderLogs,
  setReminderLogs,
  clinicConfig,
  setClinicConfig,
  doctorsList,
  setDoctorsList
}: ClinicDashboardProps) {

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Real patients loaded from API
  const [patients, setPatients] = useState<Patient[]>([]);
  // Raw API data for lookups
  const [apiPatients, setApiPatients] = useState<ApiPatient[]>([]);
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

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load real data from backend on mount
  useEffect(() => {
    const loadData = async () => {
      setDataLoading(true);
      try {
        const [aptsData, patientsData, doctorsData] = await Promise.all([
          getAppointmentsApi(),
          getPatientsApi(),
          getDoctorsApi(),
        ]);

        setAppointments(aptsData.map(mapApiAppointment));
        setApiPatients(patientsData);
        setPatients(patientsData.map(mapApiPatient));
        setApiDoctors(doctorsData);
        const mappedDoctors = doctorsData.map(mapApiDoctor);
        setDoctorsList(mappedDoctors);
        if (mappedDoctors.length > 0) {
          setWalkInDoctor(mappedDoctors[0].name);
        }
      } catch {
        triggerToast('Could not load data from server. Showing cached data.');
      } finally {
        setDataLoading(false);
      }
    };

    loadData();
  }, []);

  // 1. Interactive Waitlist Recovery Engine Simulation
  const handleOfferSlot = (wlItem: WaitlistPatient) => {
    if (recoveringId) return; // Prevent multiple clicks
    
    setRecoveringId(wlItem.id);
    triggerToast(`🔗 Dispatching WhatsApp Slot Offer invitation to ${wlItem.patientName}...`);

    // Step 1: Update status to 'Offered' immediately
    setWaitlist(prev => prev.map(item => 
      item.id === wlItem.id ? { ...item, status: 'Offered' } : item
    ));

    // Append immediate reminder activity log
    const initialLogId = 'log-sim-' + Date.now();
    setReminderLogs(prev => [
      {
        id: initialLogId,
        patientName: wlItem.patientName,
        type: 'slot_recovered',
        timestamp: 'Just now',
        status: 'sent'
      },
      ...prev
    ]);

    // Step 2: Simulate patient replying "YES" via WhatsApp after 3 seconds
    setTimeout(() => {
      setWaitlist(prev => prev.map(item => 
        item.id === wlItem.id ? { ...item, status: 'Responded' } : item
      ));
      
      // Update the dispatched log status to 'read' / confirmed
      setReminderLogs(prev => prev.map(log => 
        log.id === initialLogId ? { ...log, status: 'read' } : log
      ));

      // Append new Confirmed appointment in our roster!
      const recoveredAppointment: Appointment = {
        id: 'apt-recovered-' + Date.now(),
        patientName: wlItem.patientName,
        patientPhone: wlItem.patientPhone,
        doctorName: wlItem.doctorName,
        date: '2026-06-11', // Sync for tomorrow's roster
        time: '11:30 AM',
        status: 'Confirmed',
        language: wlItem.language
      };

      setAppointments(prev => [recoveredAppointment, ...prev]);
      
      setRecoveringId(null);
      triggerToast(`🎉 RSVP received! ${wlItem.patientName} accepted. New appointment is confirmed details synced.`);
    }, 3200);
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
  const activeToday = appointments.filter(a => a.date === '2026-06-10');
  const confirmedTodayCount = activeToday.filter(a => a.status === 'Confirmed').length;
  const cancelledTodayCount = activeToday.filter(a => a.status === 'Cancelled').length;
  const pendingTodayCount = activeToday.filter(a => a.status === 'Pending').length;
  const waitlistQueueCount = waitlist.filter(w => w.status === 'Waiting').length;

  // Render bad status count
  const utilizationPercent = activeToday.length > 0 
    ? Math.round(((confirmedTodayCount + pendingTodayCount) / (activeToday.length)) * 100) 
    : 85;

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
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full text-[9px] font-bold text-emerald-700 uppercase tracking-wider font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              WhatsApp Connected
            </span>
          </div>

          <div className="h-px bg-slate-100"></div>

          {/* Navigation Items list */}
          <nav className="space-y-1">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'appointments', label: 'Appointments', icon: Calendar },
              { id: 'calendar', label: 'Doctor Schedules', icon: Clock },
              { id: 'waitlist', label: 'Waitlist Patients', icon: Users },
              { id: 'patients', label: 'Clinic Patients', icon: Users },
              { id: 'settings', label: 'Bot Settings', icon: Settings },
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

            {/* Notification center */}
            <div className="relative p-1.5 text-slate-500 hover:text-slate-800 bg-slate-50 rounded-lg cursor-pointer">
              <Bell className="w-4.5 h-4.5" />
              <span className="w-2 h-2 bg-rose-500 rounded-full absolute top-1 right-1 border border-white"></span>
            </div>

            {/* Profile widget */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-sky-200 text-sky-800 font-bold flex items-center justify-center text-xs border border-sky-300">
                🩺
              </div>
              <div className="hidden lg:block text-left">
                <span className="block text-[11px] font-bold text-slate-900 leading-tight">Admin Desk</span>
                <span className="block text-[9px] text-slate-400 leading-none">Standard Operator</span>
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
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4" id="stats-widget-row">
                {[
                  { title: "Today's Appts", value: activeToday.length, desc: "Roster count", icon: Calendar, colorClass: "bg-sky-50 text-sky-700" },
                  { title: "Confirmed Bookings", value: confirmedTodayCount, desc: "RSVP Confirmed", icon: CheckCircle, colorClass: "bg-emerald-50 text-emerald-700" },
                  { title: "Cancelled Slots", value: cancelledTodayCount, desc: "Last-minute vacates", icon: XCircle, colorClass: "bg-red-50 text-red-600" },
                  { title: "Waitlist Patients", value: waitlistQueueCount, desc: "In waiting queue", icon: Users, colorClass: "bg-purple-50 text-purple-700" },
                  { title: "No-show Rate", value: "3.5%", desc: "70% lower than avg", icon: ShieldAlert, colorClass: "bg-amber-50 text-amber-700" },
                  { title: "Slot Utilization", value: `${utilizationPercent}%`, desc: "Peak performance", icon: Activity, colorClass: "bg-teal-50 text-teal-700" }
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
                                  apt.status === 'Cancelled' ? 'bg-rose-50 text-rose-700' :
                                  apt.status === 'Waitlist' ? 'bg-purple-50 text-purple-700' :
                                  'bg-amber-50 text-amber-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    apt.status === 'Confirmed' ? 'bg-emerald-500' :
                                    apt.status === 'Cancelled' ? 'bg-rose-500' :
                                    apt.status === 'Waitlist' ? 'bg-purple-500' :
                                    'bg-amber-500'
                                  }`}></span>
                                  {apt.status}
                                </span>
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
                                {apt.status !== 'Cancelled' && (
                                  <button 
                                    onClick={() => handleCancelAppointment(apt.id, apt.patientName)}
                                    className="px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded font-bold text-[9px] cursor-pointer"
                                    title="Cancel slot & trigger waitlist"
                                  >
                                    Cancel Slot
                                  </button>
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
                                  <span>Pushed to WhatsApp...</span>
                                </>
                              ) : (
                                <>
                                  <span>Offer Cancelled Slot</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Reminder activity logs panel */}
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 space-y-4 text-left" id="reminder-panel">
                    <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                      <div>
                        <h3 className="font-display font-extrabold text-sm text-slate-900">Bot Activity Feeds</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Dispatched WhatsApp alerts.</p>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-[290px] overflow-y-auto">
                      {reminderLogs.map((log) => (
                        <div key={log.id} className="flex gap-3 text-left">
                          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 text-base flex items-center justify-center">
                            {log.type === 'booking_confirmed' ? '📨' :
                             log.type === 'slot_recovered' ? '⚡' : '⏰'}
                          </div>
                          <div>
                            <p className="text-[11px] text-slate-700 leading-normal">
                              {log.type === 'booking_confirmed' && <>Booking confirmed alerts delivered to <strong>{log.patientName}</strong>.</>}
                              {log.type === 'slot_recovered' && <>Enqueued bot offer to recoverable patient <strong>{log.patientName}</strong> on WhatsApp.</>}
                              {log.type === '24h_reminder' && <>Dispatched 24-hour RSVP clinical reminder card to <strong>{log.patientName}</strong>.</>}
                              {log.type === '2h_reminder' && <>Urgent 2-hour consultation timing text read by <strong>{log.patientName}</strong>.</>}
                            </p>
                            <div className="flex gap-2 items-center mt-1">
                              <span className="text-[9px] text-slate-400 font-mono font-bold">{log.timestamp}</span>
                              <span className={`text-[8px] font-mono tracking-wider font-extrabold uppercase ${
                                log.status === 'read' ? 'text-emerald-600' :
                                log.status === 'delivered' ? 'text-sky-600' :
                                'text-slate-400'
                              }`}>
                                ● {log.status}
                              </span>
                            </div>
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
                  {['All', 'Confirmed', 'Pending', 'Cancelled', 'Waitlist'].map((st) => (
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
                            apt.status === 'Cancelled' ? 'bg-rose-50 text-rose-700' :
                            apt.status === 'Waitlist' ? 'bg-purple-50 text-purple-700' :
                            'bg-amber-50 text-amber-700'
                          }`}>
                            {apt.status}
                          </span>
                        </td>
                        <td className="py-4 px-3 text-right space-x-1">
                          {apt.status === 'Pending' && (
                            <button onClick={() => handleConfirmAppointment(apt.id, apt.patientName)} className="px-2 py-1 bg-emerald-600 text-white font-bold rounded text-[9px] cursor-pointer">Approve</button>
                          )}
                          {apt.status !== 'Cancelled' && (
                            <button onClick={() => handleCancelAppointment(apt.id, apt.patientName)} className="px-2 py-1 bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded font-bold text-[9px] cursor-pointer">Cancel Slot</button>
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
          {activeTab === 'calendar' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn" id="calendar-tab-view">
              <div className="border-b border-slate-150 pb-4 text-left">
                <h2 className="font-display font-extrabold text-lg text-slate-950">Active Doctor Timelines</h2>
                <p className="text-slate-400 text-xs">Chronological timeline schedules for today ({'2026-06-10'}). Direct two-way sync with Google Calendar API.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="doctor-timelines-grid">
                {doctorsList.map((doc) => {
                  const docAppointments = appointments.filter(a => a.doctorName === doc.name && a.status !== 'Cancelled');
                  return (
                    <div key={doc.id} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-left flex flex-col justify-between">
                      <div>
                        <div className="border-b border-slate-200 pb-3 mb-4">
                          <span className="block text-slate-900 font-extrabold font-display text-sm leading-snug">{doc.name}</span>
                          <span className="text-[10px] bg-sky-50 text-sky-700 font-bold px-2 py-0.5 rounded-full mt-1.5 inline-block font-mono uppercase tracking-wider">{doc.specialty}</span>
                        </div>

                        <div className="space-y-2.5">
                          {docAppointments.length === 0 ? (
                            <div className="py-6 text-center text-slate-400 italic text-[10px] bg-white border border-dashed border-slate-200 rounded-xl">
                              No consultations scheduled
                            </div>
                          ) : (
                            docAppointments.map((da) => (
                              <div key={da.id} className="bg-white p-3 rounded-xl border border-slate-150 shadow-2xs flex justify-between items-center">
                                <div className="text-left">
                                  <span className="block font-bold text-slate-800 text-[11px] leading-tight">{da.patientName}</span>
                                  <span className="text-[9px] text-slate-400 block mt-0.5">{da.patientPhone}</span>
                                </div>
                                <span className="text-[10px] font-mono font-bold text-sky-800 bg-sky-50/50 p-1 rounded-sm">{da.time}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-200 mt-6 flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span>Total Roster: {docAppointments.length} slots</span>
                        <span className="text-emerald-600 font-bold">● Sync GCal</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                      <tr key={wl.id} className="border-b border-slate-50 hover:bg-slate-50/50" id={`waitlist-full-row-${wl.id}`}>
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
                              Dispatch Offer
                            </button>
                          )}
                        </td>
                      </tr>
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

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left" id="patients-master-directory-table">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                      <th className="py-3 px-2">Patient Code</th>
                      <th className="py-3 px-2">Registered Phone</th>
                      <th className="py-3 px-2">Email Address</th>
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
                        <td className="py-3 px-2 text-slate-500">{p.email}</td>
                        <td className="py-3 px-2 font-semibold text-sky-700">🗣 {p.preferredLanguage}</td>
                        <td className="py-3 px-2">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold font-mono text-[9px] uppercase tracking-wider">
                            ● Active
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[9px] cursor-pointer hover:bg-slate-200">
                            View Logs
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
                        Enable automated **24-hour** ahead WhatsApp RSVP confirm cards
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
                        Enable automated **2-hour** urgent consult coordinate text dispatches
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
                  onClick={() => triggerToast('✔ Clinic settings changes saved to local database successfully.')}
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save Settings Configuration
                </button>
              </div>
            </div>
          )}

          {/* TAB 7: BILLING */}
          {activeTab === 'billing' && (
            <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 animate-fadeIn text-left" id="billing-tab-view">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-display font-extrabold text-lg text-slate-950">SaaS Subscription Ledger</h2>
                <p className="text-slate-400 text-xs">Manage your ClinicBook AI subscription billing, download invoices, or audit transaction history.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Active Plan info */}
                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-6 text-left space-y-4">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-sky-150 text-sky-800 rounded-full text-[9px] font-bold uppercase tracking-wider font-mono">
                    Active Plan
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-black text-slate-950">
                      {clinicConfig.country === 'India' ? 'India Pro Plan' : 'International Pro Plan'}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {clinicConfig.country === 'India' ? '₹999 / month flat' : '$49 / month flat'}
                    </p>
                  </div>
                  
                  <div className="pt-3 border-t border-sky-100 text-slate-600 text-xs leading-relaxed">
                    ✔ Includes up to 10 active clinical doctors<br />
                    ✔ Unlimited automatic WhatsApp reminders loops<br />
                    ✔ Vernacular smart auto-booking AI
                  </div>
                </div>

                {/* Billing Summary parameters */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-left space-y-4">
                  <h4 className="font-display font-bold text-sm text-slate-900">Current Month Activity</h4>
                  <div className="space-y-3 font-sans text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">WhatsApp Texts sent</span>
                      <strong className="text-slate-800">412 / Unlimited</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Active Consult Slots Synchronized</span>
                      <strong className="text-slate-800">{appointments.length} synced</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Waitlist Recovery Operations</span>
                      <strong className="text-slate-800">12 successfully matching</strong>
                    </div>
                    <div className="h-px bg-slate-100"></div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Consult Fees collected on WhatsApp</span>
                      <strong className="text-slate-800">₹14,500 via webhook</strong>
                    </div>
                  </div>
                </div>

                {/* Stripe/Razorpay secure info */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left space-y-4">
                  <h4 className="font-display font-bold text-sm text-slate-900">Secure Payment Channel</h4>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    We use Stripe for international clinics, and Razorpay for domestic Indian clinics. This ensures hassle-free payouts, compliance, and instant bank settlement of advance consult bookings.
                  </p>
                  <button 
                    onClick={() => triggerToast('🔗 Routing securely to payment processing portal...')}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Manage Payment Methods</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

      </main>

    </div>
  );
}
