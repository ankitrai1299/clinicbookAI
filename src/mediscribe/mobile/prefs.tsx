import React from 'react';

// Phone-app preferences: interface language and appearance.
//
// Both are per DEVICE, not per account — a doctor who reads Hindi wants Hindi on
// their own phone, and the same login on the clinic's shared tablet should not
// inherit it. Stored in localStorage, which is what the WebView keeps.
//
// Only the phone screens are translated/themed. The browser dashboard is
// unchanged, so nothing here can alter what the web shows.

export type Lang = 'en' | 'hi';
export type Appearance = 'light' | 'dark';

const LANG_KEY = 'mediscribe.appLanguage';
const THEME_KEY = 'mediscribe.appearance';

const read = (key: string, fallback: string): string => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    // Private mode / storage disabled — the app still works, it just forgets.
    return fallback;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export const loadLang = (): Lang => (read(LANG_KEY, 'en') === 'hi' ? 'hi' : 'en');
export const loadAppearance = (): Appearance => (read(THEME_KEY, 'light') === 'dark' ? 'dark' : 'light');

// ── Strings ─────────────────────────────────────────────────────────────────
// Only what a phone screen actually shows. A key with no Hindi falls back to
// English rather than rendering the key itself — a doctor should never see
// `settings.appearance` on screen because a translation was missed.

type Dict = Record<string, string>;

const EN: Dict = {
  'nav.home': 'Home',
  'nav.patients': 'Patients',
  'nav.sessions': 'Sessions',
  'nav.settings': 'Settings',
  'nav.ask': 'Ask',

  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',

  'dashboard.startNew': 'Start a new',
  'dashboard.consultation': 'Consultation',
  'dashboard.ready': 'Ready to listen and transcribe',
  'dashboard.tapToBegin': 'Tap to begin',
  'dashboard.quickRx': 'Quick prescription',
  'dashboard.practiceOverview': 'Practice Overview',
  'dashboard.todaysQueue': "Today's Queue",
  'dashboard.recent': 'Recent Consultations',
  'dashboard.viewAll': 'View all',
  'dashboard.searchPatients': 'Search patients…',
  'dashboard.noneTitle': 'No consultations yet',
  'dashboard.noneBody': 'Tap the card above to record your first one.',
  'dashboard.start': 'Start',

  'stats.consultations': 'Consultations',
  'stats.drafts': 'Draft reports',
  'stats.completed': 'Completed',
  'stats.followUps': 'Follow-ups due',
  'common.viewDetails': 'View Details',
  'common.new': 'New',

  'range.today': 'Today',
  'range.week': 'This week',
  'range.month': 'This month',
  'range.all': 'All time',

  'sessions.title': 'Sessions',
  'sessions.count': 'recorded consultations',
  'sessions.search': 'Search by patient or date…',
  'sessions.recording': 'Recording',
  'sessions.transcriptReady': 'Transcript ready',
  'sessions.reportReady': 'Report ready',
  'sessions.transcript': 'Transcript',
  'sessions.report': 'Report',
  'sessions.noneTitle': 'No sessions yet',
  'sessions.noneBody': 'Record a consultation and it will appear here.',

  'status.Draft': 'Draft',
  'status.Completed': 'Completed',
  'status.Recording': 'Recording',
  'status.Processing': 'Processing',

  'patients.title': 'Patients',
  'patients.subtitle': 'records & visit history',
  'patients.search': 'Search patients by name…',
  'patients.lastVisit': 'Last visit',
  'patients.noVisit': 'No visit yet',
  'patients.consultations': 'consultations',
  'patients.consultation': 'consultation',
  'patients.ageUnknown': 'Age not recorded',
  'patients.noneTitle': 'No patients yet',
  'patients.noneBody': 'Patients appear here once they are registered.',

  'settings.title': 'Settings',
  'settings.account': 'Account',
  'settings.signOut': 'Sign Out',
  'settings.doctorProfile': 'Doctor Profile',
  'settings.doctorName': 'Doctor name',
  'settings.qualification': 'Qualification',
  'settings.registrationNumber': 'Registration number',
  'settings.clinicName': 'Clinic name',
  'settings.saveProfile': 'Save profile',
  'settings.saved': 'Saved',
  'settings.printsOn': 'This is what prints on your prescriptions and reports.',
  'settings.preferences': 'Preferences',
  'settings.appLanguage': 'Language',
  'settings.appLanguageHint': 'Language of the app interface',
  'settings.defaultTranscriptionLanguage': 'Default transcription language',
  'settings.appearance': 'Appearance',
  'settings.light': 'Light',
  'settings.dark': 'Dark',
  'settings.about': 'About',
  'settings.appVersion': 'App version',
  'settings.privacyPolicy': 'Privacy Policy',
  'settings.termsOfService': 'Terms of Service',
  'settings.support': 'Support',
  'settings.more': 'More',
  'settings.qualificationNotSet': 'Qualification not set',

  'lists.today.title': 'Consultations',
  'lists.drafts.title': 'Draft Reports',
  'lists.drafts.subtitle': 'not yet completed',
  'lists.completed.title': 'Completed',
  'lists.completed.subtitle': 'with a finished report',
  'lists.followups.title': 'Pending Follow-ups',
  'lists.followups.subtitle': 'pending',
  'lists.followups.overdue': 'Overdue',
  'lists.inPeriod': 'in this period',
  'lists.emptyBody': 'Try a wider date range.',

  'empty.nothingMatches': 'Nothing matches',

  'recording.title': 'New Consultation',
  'recording.live': 'Live',
  'recording.paused': 'Paused',
  'recording.listening': 'Listening…',
  'recording.pause': 'Pause',
  'recording.resume': 'Resume',
  'recording.stop': 'Stop',
  'recording.mark': 'Mark',
  'recording.hint': 'Keep the phone between you and the patient. The report is written when you stop.'
};

const HI: Dict = {
  'nav.home': 'होम',
  'nav.patients': 'मरीज़',
  'nav.sessions': 'सत्र',
  'nav.settings': 'सेटिंग्स',
  'nav.ask': 'सहायक',

  'greeting.morning': 'सुप्रभात',
  'greeting.afternoon': 'नमस्कार',
  'greeting.evening': 'शुभ संध्या',

  'dashboard.startNew': 'नया शुरू करें',
  'dashboard.consultation': 'परामर्श',
  'dashboard.ready': 'सुनने और लिखने के लिए तैयार',
  'dashboard.tapToBegin': 'शुरू करने के लिए टैप करें',
  'dashboard.quickRx': 'त्वरित पर्चा',
  'dashboard.practiceOverview': 'प्रैक्टिस अवलोकन',
  'dashboard.todaysQueue': 'आज की कतार',
  'dashboard.recent': 'हाल के परामर्श',
  'dashboard.viewAll': 'सभी देखें',
  'dashboard.searchPatients': 'मरीज़ खोजें…',
  'dashboard.noneTitle': 'अभी कोई परामर्श नहीं',
  'dashboard.noneBody': 'पहला परामर्श रिकॉर्ड करने के लिए ऊपर टैप करें।',
  'dashboard.start': 'शुरू',

  'stats.consultations': 'परामर्श',
  'stats.drafts': 'ड्राफ्ट रिपोर्ट',
  'stats.completed': 'पूर्ण',
  'stats.followUps': 'फ़ॉलो-अप बाकी',
  'common.viewDetails': 'विवरण देखें',
  'common.new': 'नया',

  'range.today': 'आज',
  'range.week': 'इस सप्ताह',
  'range.month': 'इस महीने',
  'range.all': 'सभी समय',

  'sessions.title': 'सत्र',
  'sessions.count': 'रिकॉर्ड किए गए परामर्श',
  'sessions.search': 'मरीज़ या तारीख़ से खोजें…',
  'sessions.recording': 'रिकॉर्डिंग',
  'sessions.transcriptReady': 'ट्रांसक्रिप्ट तैयार',
  'sessions.reportReady': 'रिपोर्ट तैयार',
  'sessions.transcript': 'ट्रांसक्रिप्ट',
  'sessions.report': 'रिपोर्ट',
  'sessions.noneTitle': 'अभी कोई सत्र नहीं',
  'sessions.noneBody': 'परामर्श रिकॉर्ड करें, यहाँ दिखेगा।',

  'status.Draft': 'ड्राफ्ट',
  'status.Completed': 'पूर्ण',
  'status.Recording': 'रिकॉर्डिंग',
  'status.Processing': 'प्रोसेसिंग',

  'patients.title': 'मरीज़',
  'patients.subtitle': 'रिकॉर्ड और विज़िट इतिहास',
  'patients.search': 'नाम से मरीज़ खोजें…',
  'patients.lastVisit': 'पिछली विज़िट',
  'patients.noVisit': 'अभी कोई विज़िट नहीं',
  'patients.consultations': 'परामर्श',
  'patients.consultation': 'परामर्श',
  'patients.ageUnknown': 'उम्र दर्ज नहीं',
  'patients.noneTitle': 'अभी कोई मरीज़ नहीं',
  'patients.noneBody': 'पंजीकरण के बाद मरीज़ यहाँ दिखेंगे।',

  'settings.title': 'सेटिंग्स',
  'settings.account': 'खाता',
  'settings.signOut': 'साइन आउट',
  'settings.doctorProfile': 'डॉक्टर प्रोफ़ाइल',
  'settings.doctorName': 'डॉक्टर का नाम',
  'settings.qualification': 'योग्यता',
  'settings.registrationNumber': 'पंजीकरण संख्या',
  'settings.clinicName': 'क्लिनिक का नाम',
  'settings.saveProfile': 'प्रोफ़ाइल सहेजें',
  'settings.saved': 'सहेजा गया',
  'settings.printsOn': 'यही आपके पर्चे और रिपोर्ट पर छपता है।',
  'settings.preferences': 'प्राथमिकताएँ',
  'settings.appLanguage': 'भाषा',
  'settings.appLanguageHint': 'ऐप इंटरफ़ेस की भाषा',
  'settings.defaultTranscriptionLanguage': 'डिफ़ॉल्ट ट्रांसक्रिप्शन भाषा',
  'settings.appearance': 'दिखावट',
  'settings.light': 'लाइट',
  'settings.dark': 'डार्क',
  'settings.about': 'ऐप के बारे में',
  'settings.appVersion': 'ऐप संस्करण',
  'settings.privacyPolicy': 'गोपनीयता नीति',
  'settings.termsOfService': 'सेवा की शर्तें',
  'settings.support': 'सहायता',
  'settings.more': 'और',
  'settings.qualificationNotSet': 'योग्यता दर्ज नहीं',

  'lists.today.title': 'परामर्श',
  'lists.drafts.title': 'ड्राफ्ट रिपोर्ट',
  'lists.drafts.subtitle': 'अभी पूर्ण नहीं',
  'lists.completed.title': 'पूर्ण',
  'lists.completed.subtitle': 'रिपोर्ट सहित',
  'lists.followups.title': 'बाकी फ़ॉलो-अप',
  'lists.followups.subtitle': 'बाकी',
  'lists.followups.overdue': 'समय बीत गया',
  'lists.inPeriod': 'इस अवधि में',
  'lists.emptyBody': 'बड़ी अवधि चुनकर देखें।',

  'empty.nothingMatches': 'कुछ नहीं मिला',

  'recording.title': 'नया परामर्श',
  'recording.live': 'लाइव',
  'recording.paused': 'रुका हुआ',
  'recording.listening': 'सुन रहे हैं…',
  'recording.pause': 'रोकें',
  'recording.resume': 'जारी रखें',
  'recording.stop': 'बंद करें',
  'recording.mark': 'चिह्न',
  'recording.hint': 'फ़ोन को अपने और मरीज़ के बीच रखें। बंद करते ही रिपोर्ट बनेगी।'
};

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  appearance: Appearance;
  setAppearance: (a: Appearance) => void;
  /** Translate a key; falls back to English, then to the key's own text. */
  t: (key: string) => string;
}

const PrefsContext = React.createContext<Prefs | null>(null);

export const PrefsProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = React.useState<Lang>(loadLang);
  const [appearance, setAppearanceState] = React.useState<Appearance>(loadAppearance);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    write(LANG_KEY, l);
  }, []);

  const setAppearance = React.useCallback((a: Appearance) => {
    setAppearanceState(a);
    write(THEME_KEY, a);
  }, []);

  const t = React.useCallback(
    (key: string) => (lang === 'hi' ? HI[key] : undefined) ?? EN[key] ?? key,
    [lang]
  );

  const value = React.useMemo(
    () => ({ lang, setLang, appearance, setAppearance, t }),
    [lang, setLang, appearance, setAppearance, t]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
};

/**
 * Usable outside the provider too — the phone screens are lazy-loaded and a
 * stray render before the provider mounts should show English in light mode,
 * not crash.
 */
export const usePrefs = (): Prefs => {
  const ctx = React.useContext(PrefsContext);
  return (
    ctx ?? {
      lang: 'en',
      setLang: () => {},
      appearance: 'light',
      setAppearance: () => {},
      t: (k: string) => EN[k] ?? k
    }
  );
};
