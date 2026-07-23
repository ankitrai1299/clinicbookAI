import React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Consultation,
  ReportData,
  MedicationRow,
  SystemGroup,
  Vitals,
  FollowUp,
  TranscriptLine,
  Patient,
} from '../types';
import { loadDoctorProfile, loadLanguage } from '../utils/settings';
import { Mic, Square, FileText, CheckCircle, Printer, AlertCircle, Plus, Trash2, Download, Upload, Search, Clock, Pause, Play, Activity, ArrowUp, ArrowDown, ArrowRight, ArrowLeft, Users, Send } from 'lucide-react';
import Logo from './Logo';
import UploadedAudioPlayer from './UploadedAudioPlayer';
import PatientSnapshot from './PatientSnapshot';
import DrugSafetyAlerts from './DrugSafetyAlerts';
import { checkDrugSafety } from '../utils/drugSafety';
import { saveChunk, loadRecording, clearRecording, type StoredRecording } from '../utils/recordingStore';
import {
  transcribeAudio,
  translateTranscript,
  generateReport,
  saveConsultation,
  saveReport,
  savePrescription,
  saveTranscript,
  uploadConsultationAudio,
  resolveMediaUrl,
  deleteConsultationAudio,
  labelSpeakers,
  sendPrescriptionToPatient,
} from '../services/api';
import {
  REPORT_SECTIONS,
  ReportSectionDef,
  ColumnDef,
  createEmptyReport,
  normalizeReport,
  emptyMedicationRow,
  emptyComplaintRow,
  emptyAllergyRow,
  emptyGroup,
  sectionHasContent,
  buildReportHtml,
  VITALS_FIELDS,
  FOLLOWUP_FIELDS,
  COMPLAINT_COLUMNS,
  ALLERGY_COLUMNS,
  TREATMENT_COLUMNS,
} from '../utils/report';
import { printReport } from '../utils/pdf';
import { debug } from '../utils/debug';
import FollowUpBooking from './FollowUpBooking';
import { favouriteMedicines, knownMedicineNames } from '../utils/favouriteMedicines';
import {
  buildVisitComparison,
  reportHasClinicalContent,
  buildVisitSummary,
  buildComparisonBullets,
  buildPreviousVisitPdf,
  type PreviousMedicine,
} from '../utils/compareVisits';
import { createVAD, VADController } from '../utils/vad';
// The export libraries (jsPDF / docx) are heavy, so they are loaded on demand
// via dynamic import() inside the download handlers — keeps the initial bundle small.

interface ConsultationWorkspaceProps {
  consultation: Consultation;
  // The patient record (age / gender / phone) for the report header. Optional so
  // an unlinked session still renders; demographics are simply omitted.
  patient?: Patient;
  // Sessions for the currently selected patient only (scoped by the parent).
  patientHistory: Consultation[];
  // Every session this doctor has saved — used to work out which medicines they
  // prescribe most, so the prescription editor can offer them in one tap.
  allConsultations?: Consultation[];
  onFinish: (updatedReport: ReportData, transcript: TranscriptLine[]) => void;
  onSaveReport: (report: ReportData) => void;
  // Mobile-only: return to the dashboard from the full-screen report page.
  onExit?: () => void;
  // Sessions panel: start a new session for this patient / open an existing one.
  onNewSession?: () => void;
  onSelectSession?: (session: Consultation) => void;
  // Live updates so the parent's session list stays in sync (auto-save).
  onSessionUpdate?: (session: Consultation) => void;
  // Raised while this consultation holds the microphone, so the shell can stand
  // the voice assistant down rather than have two features fight over the mic.
  onRecordingChange?: (recording: boolean) => void;
}

// Why a prescription couldn't be sent, phrased as something the doctor can act
// on. "no-phone" and "no-medicines" need different fixes, so they can't collapse
// into one generic failure.
const SEND_FAILURE: Record<string, string> = {
  'not-completed': 'Save the report first — only a completed note can be sent.',
  'no-medicines': 'There are no medicines in this prescription yet.',
  'no-phone': "This patient has no phone number on file, so WhatsApp can't reach them.",
  'already-sent': 'Already sent to this patient.',
  invalid: 'This consultation is not linked to a patient.',
};

// Whisper language codes. "auto" → let Whisper auto-detect the spoken language.
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'pa', label: 'Punjabi' },
];

// BCP-47 locales for the browser's Web Speech API (live recognition). Keys match
// the LANGUAGES codes above. "auto" → Indian English, which copes well with the
// common English/Hindi code-mixing seen in consultations.
const RECOGNITION_LANG: Record<string, string> = {
  auto: 'en-IN',
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  bn: 'bn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  ur: 'ur-IN',
};

// Whether this browser supports the Web Speech API. When true we use live
// transcription (real-time transcript in the same box, with Pause/Resume, and
// auto-report on Stop); otherwise we fall back to the MediaRecorder → Whisper
// batch flow so recording still works. Audio-file uploads always go through
// backend Whisper regardless, so speaker-played / mixed-language clips can still
// be transcribed accurately via the Upload button.
const liveSupported =
  typeof window !== 'undefined' &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

// Accepted audio uploads. Validation is intentionally permissive: a file is
// accepted if its MIME type starts with "audio/", is one of the explicit MIME
// types below, OR its extension is in the fallback list. Browsers report audio
// MIME types inconsistently (e.g. a valid MP3 may arrive as audio/mpeg,
// audio/mp3, an empty string, or even video/mpeg on Chrome/Windows), so no
// single check is authoritative — any one passing is enough.
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25MB
const UPLOAD_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
  'audio/3gpp',
  'audio/amr',
  'audio/opus',
];
const UPLOAD_EXTENSIONS = [
  'mp3', 'mpeg', 'wav', 'm4a', 'webm', 'ogg', 'aac', 'flac', 'mp4', '3gp', 'amr', 'opus',
];
const UPLOAD_ACCEPT = ['audio/*', ...UPLOAD_MIME_TYPES, ...UPLOAD_EXTENSIONS.map(e => `.${e}`)].join(',');

// Decide whether a picked file is acceptable audio, by MIME type OR extension.
// Returns the reason so it can be logged for both accept and reject decisions.
function checkAudioFile(name: string, mimeType: string): { accepted: boolean; reason: string } {
  const mime = (mimeType || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('audio/')) return { accepted: true, reason: `MIME ${mime}` };
  // MP3/MPEG audio is sometimes reported as video/mpeg on Chrome/Windows.
  if (mime === 'video/mpeg' && (ext === 'mpeg' || ext === 'mp3')) {
    return { accepted: true, reason: `video/mpeg with .${ext} (MP3/MPEG audio)` };
  }
  if (UPLOAD_MIME_TYPES.includes(mime)) return { accepted: true, reason: `allowed MIME ${mime}` };
  if (UPLOAD_EXTENSIONS.includes(ext)) return { accepted: true, reason: `extension .${ext}` };
  return { accepted: false, reason: `unrecognised audio (mime=${mime || 'empty'}, ext=${ext || 'none'})` };
}

// Phrases Whisper commonly hallucinates on silent/unclear audio (YouTube-style
// fillers that never occur in a real medical consultation).
const HALLUCINATION_PHRASES = [
  'thank you for watching',
  'thanks for watching',
  'for more information',
  'visit www',
  'subscribe',
  'cst.eu.com',
  'www.cst',
  'isglobal',
];

// If the transcript is one of these filler phrases, it is a hallucination — do
// not insert it into the transcript.
function isLikelyHallucination(text: string): boolean {
  const lower = text.toLowerCase();
  return HALLUCINATION_PHRASES.some(p => lower.includes(p));
}

export default function ConsultationWorkspace({ consultation, patient, patientHistory, allConsultations, onFinish, onSaveReport, onExit, onNewSession, onSelectSession, onSessionUpdate, onRecordingChange }: ConsultationWorkspaceProps) {
  const [isRecording, setIsRecording] = useState(false);
  // Live-recording is paused (still the same consultation; transcript retained).
  const [isPaused, setIsPaused] = useState(false);
  // Live auto-save feedback for the transcript while recording.
  const [transcriptSaveStatus, setTranscriptSaveStatus] =
    useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  // Settings promises "new recordings use this language", so honour it here —
  // the picker below still overrides it for a one-off visit in another language.
  const [language, setLanguage] = useState<string>(
    () => LANGUAGES.find((l) => l.label === loadLanguage())?.code ?? 'auto',
  );
  const [timer, setTimer] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportStatus, setReportStatus] = useState<'idle' | 'generated' | 'failed'>(
    consultation.report ? 'generated' : 'idle',
  );
  // Saved status of THIS session. Starts from what was persisted (Draft for a
  // new session). Becomes 'Completed' only when the user clicks Save, and drops
  // back to 'Draft' as soon as the transcript/report/audio is edited again.
  const [sessionStatus, setSessionStatus] = useState<Consultation['status']>(
    consultation.status || 'Draft',
  );
  const [error, setError] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  // Sending the prescription to the patient, and what to tell the doctor after.
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // Set once the note's follow-up has been booked as a real appointment.
  // The medicines this doctor prescribes most, and every name they have used —
  // derived from their own saved consultations, so it is right about their
  // practice from the first week without any drug database to maintain.
  const favourites = useMemo(() => favouriteMedicines(allConsultations ?? []), [allConsultations]);
  const medicineNames = useMemo(() => knownMedicineNames(allConsultations ?? []), [allConsultations]);

  // Sections the doctor has opened to add content the visit didn't capture.
  const [revealed, setRevealed] = useState<(keyof ReportData)[]>([]);
  const [followUpAppointmentId, setFollowUpAppointmentId] = useState<string | undefined>(
    () => (consultation as { followUpAppointmentId?: string }).followUpAppointmentId,
  );
  // Doctor's name for the final review / signature block (print + export only).
  // Seeded from the saved Settings profile so the doctor doesn't retype it.
  const [doctorName, setDoctorName] = useState(() => loadDoctorProfile().name || '');

  // Patient demographics + doctor letterhead (qualification / reg no) that print
  // on the report & prescription. Demographics come from the linked patient; the
  // letterhead from the per-device Settings profile.
  const reportPatientMeta = {
    patientAge: typeof patient?.age === 'number' ? patient.age : undefined,
    patientGender: patient?.gender,
    patientPhone: patient?.phone || undefined,
  };
  const letterhead = (() => {
    const p = loadDoctorProfile();
    return {
      doctorQualification: p.qualification || undefined,
      doctorRegNo: p.regNo || undefined,
      clinicName: p.clinicName || undefined,
    };
  })();

  // originalTranscript = raw Whisper output (in the originally spoken language).
  // displayedTranscript = what is shown in the textarea (translated + editable).
  const initialText = (consultation.transcript || []).map(l => l.text).join(' ').trim();
  const [originalTranscript, setOriginalTranscript] = useState<string>(initialText);
  const [displayedTranscript, setDisplayedTranscript] = useState<string>(initialText);

  // Normalize on load so older saved reports are migrated into the Premium
  // structure and every section/field always exists.
  const [reportData, setReportData] = useState<ReportData>(
    consultation.report ? normalizeReport(consultation.report) : createEmptyReport(),
  );

  // ── Upload-audio flow state (separate from the live recording flow) ──
  const [audioUrl, setAudioUrl] = useState<string>(consultation.audioUrl || '');
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sessions panel search box.
  const [sessionQuery, setSessionQuery] = useState('');

  // Transient "Saved" confirmation shown after a successful Save (auto-clears).
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Centered "Report Saved Successfully" modal shown after a successful Save.
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  // Which previous medicines the doctor has actioned this session
  // (Continue / Modify → carried into the current plan; Stop → dismissed).
  const [prevMedActions, setPrevMedActions] = useState<Record<string, 'continued' | 'modified' | 'stopped'>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (savedModalTimerRef.current) clearTimeout(savedModalTimerRef.current);
  }, []);

  // Pending debounced auto-save timer (so Save can cancel it and never get
  // overwritten by a late 'Draft' write).
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The in-flight auto-save request (if any). Save awaits it so a Draft write can
  // never land AFTER the Completed write and revert the status.
  const inFlightAutoSaveRef = useRef<Promise<unknown> | null>(null);
  // Serialized snapshot of the content as it was last persisted (loaded or
  // saved). Auto-save / Draft only trigger when the live content DIFFERS from
  // this — so merely opening, re-rendering, or React StrictMode's double-invoke
  // never flips a saved session back to Draft.
  const lastSavedSnapshotRef = useRef<string>(
    JSON.stringify({
      t: initialText,
      o: initialText,
      a: consultation.audioUrl || '',
      r: consultation.report ? normalizeReport(consultation.report) : createEmptyReport(),
    }),
  );

  // MediaRecorder refs (Whisper fallback path)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Sequence counter so persisted chunks can be reassembled in order.
  const chunkSeqRef = useRef(0);
  // An unsent recording found on disk for this consultation (crash recovery, or a
  // transcription that failed). Null when there's nothing to recover.
  const [recovered, setRecovered] = useState<StoredRecording | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  // Speaker-labelled turns (Doctor / Patient) for the current transcript. Empty
  // until the doctor asks for them; cleared whenever the transcript changes so a
  // stale labelling is never shown against edited text.
  const [speakerTurns, setSpeakerTurns] = useState<{ speaker: 'Doctor' | 'Patient'; text: string }[]>([]);
  const [isLabelling, setIsLabelling] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  // Wall-clock start of the current MediaRecorder capture (ms) — used only to
  // log the recording duration for debugging audio-capture issues.
  const recordStartMsRef = useRef<number>(0);
  // Transcript text that existed BEFORE the current live recording started. The
  // backend (Whisper) transcript of the recorded audio is appended after this on
  // Stop, so repeat recordings in the same session append instead of overwriting.
  const recordingBaseRef = useRef<string>('');

  // Live transcription (Web Speech API) refs.
  // recognitionRef   — the active SpeechRecognition instance.
  // shouldListenRef  — whether recognition should keep auto-restarting (false
  //                    while paused/stopped, so onend does not relaunch it).
  // committedRef     — authoritative finalized transcript for the current
  //                    recording (survives the recognizer's internal restarts).
  // liveActiveRef    — true while the live path (not the Whisper fallback) is in
  //                    use, so stop/Pause target the right engine.
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef<boolean>(false);
  const committedRef = useRef<string>('');
  const liveActiveRef = useRef<boolean>(false);
  // Voice Activity Detection over the live mic stream. Used only to gate the live
  // preview: brief accidental sounds (keyboard clicks, a single cough, fan/AC hum)
  // that are not sustained speech are ignored, while real speech starts/resumes
  // transcription immediately. Recording itself is never gated by this — the final
  // transcript is always re-derived from the recorded audio via backend Whisper.
  const vadRef = useRef<VADController | null>(null);
  // A real Stop (End consultation) is in flight: the next onend must finalize the
  // transcript and auto-generate the report. Guards against double Stop clicks.
  const pendingStopRef = useRef<boolean>(false);
  // True while a report is being generated — prevents overlapping/duplicate
  // generations (e.g. Stop clicked rapidly, or Stop + manual button).
  const reportGenRef = useRef<boolean>(false);

  // Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRecording && !isPaused) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRecording, isPaused]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const hasTranscript = displayedTranscript.trim().length > 0;
  const canGenerate =
    hasTranscript && !isRecording && !isTranscribing && !isTranslating && !isGenerating && !isUploading;

  // Convert the visible transcript into the stored TranscriptLine[] shape.
  const transcriptToLines = (): TranscriptLine[] =>
    displayedTranscript.trim()
      ? [{
          speaker: 'System',
          text: displayedTranscript.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }]
      : [];

  // Build the full session document that gets persisted for this consultation.
  // `status` is passed in explicitly so the caller controls it: auto-save always
  // persists 'Draft' (it only runs on edits), while Save persists 'Completed'.
  const buildSessionDoc = (status: Consultation['status']): Consultation => {
    const now = new Date().toISOString();
    return {
      ...consultation,
      status,
      transcript: transcriptToLines(),
      transcriptText: displayedTranscript.trim(),
      originalTranscript: originalTranscript.trim(),
      // Use the live audioUrl directly (no fallback to consultation.audioUrl) so
      // clearing it via "Remove audio" actually persists as empty.
      audioUrl,
      report: reportData,
      createdAt: consultation.createdAt || now,
      updatedAt: now,
    } as Consultation;
  };

  // Serialized snapshot of the CURRENT (live) content.
  const contentSnapshot = (): string =>
    JSON.stringify({
      t: displayedTranscript.trim(),
      o: originalTranscript.trim(),
      a: audioUrl,
      r: reportData,
    });

  // Log the loaded status once when the session opens.
  useEffect(() => {
    debug('[session] loaded', {
      sessionId: consultation.id,
      patientId: consultation.patientId,
      status: consultation.status || 'Draft',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save: only when the content actually DIFFERS from what was last
  // persisted does the session become unsaved work → mark it 'Draft' and
  // debounce-persist. Opening/viewing/re-rendering (and StrictMode's double
  // invoke) produce no diff, so a saved session is never flipped to Draft just
  // by being reopened. Status only becomes 'Completed' via Save (handleSave).
  useEffect(() => {
    const snapshot = contentSnapshot();
    if (snapshot === lastSavedSnapshotRef.current) return; // no real edit

    setSessionStatus('Draft');
    setSaveSuccess(false);
    setTranscriptSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const doc = buildSessionDoc('Draft');
      onSessionUpdate?.(doc);
      debug('[session] auto-save', {
        sessionId: doc.id,
        patientId: doc.patientId,
        status: doc.status,
      });
      const req = saveConsultation(doc)
        .then(() => { lastSavedSnapshotRef.current = snapshot; setTranscriptSaveStatus('saved'); })
        .catch(err => { setTranscriptSaveStatus('failed'); console.error('Session auto-save error:', err); })
        .finally(() => { if (inFlightAutoSaveRef.current === req) inFlightAutoSaveRef.current = null; });
      inFlightAutoSaveRef.current = req;
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedTranscript, originalTranscript, reportData, audioUrl]);

  // ── Live transcription (Web Speech API) ───────────────────────────────
  // Primary recording path: the transcript appears live as people speak, with
  // Pause/Resume. Only finalized phrases are committed to the transcript (and
  // auto-saved); the in-progress words show as a separate ghost caption. When
  // the browser lacks SpeechRecognition we fall back to startWhisperRecording.

  // Generate the clinical report from a given transcript and update report state.
  // Shared by the manual "Generate Report" button and the automatic generation
  // that fires when recording stops. reportGenRef prevents duplicate/overlapping
  // runs (e.g. Stop tapped twice quickly, or Stop + manual button together).
  const runReportGeneration = async (rawTranscript: string) => {
    const transcript = rawTranscript.trim();
    if (!transcript || reportGenRef.current) return;
    reportGenRef.current = true;
    setIsGenerating(true);
    setError(null);
    setReportStatus('idle');
    try {
      // Always generated from the COMPLETE current transcript (old + appended),
      // so the latest report replaces the previous one with all changes.
      const report = await generateReport(transcript);
      setReportData(report);
      setReportStatus('generated');
      const lines: TranscriptLine[] = [{
        speaker: 'System',
        text: transcript,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }];
      onFinish(report, lines);
    } catch (err) {
      console.error('Report generation error:', err);
      const detail = err instanceof Error ? err.message : '';
      setError(detail || 'Report generation failed. Please try again.');
      setReportStatus('failed');
    } finally {
      setIsGenerating(false);
      reportGenRef.current = false;
    }
  };

  // ── Parallel raw-audio capture for the LIVE path ──────────────────────
  // While Web Speech shows the live transcript, we ALSO record the actual mic
  // audio so Stop can produce an accurate FINAL transcript from the real
  // recording via backend Whisper. Raw constraints (DSP off) let audio played
  // from a phone/speaker near the mic be captured faithfully. Reuses the same
  // MediaRecorder refs as the Whisper fallback (only one path is ever active).
  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Attach Voice Activity Detection to the same stream (no extra mic access,
      // no added transcription latency). It only informs the live preview which
      // sounds are real speech vs. brief noise; it never gates the recording.
      try {
        vadRef.current = createVAD(stream, {
          onSpeechStart: () => debug('[vad] speech detected'),
          onSpeechEnd: () => debug('[vad] pause (silence)'),
        });
      } catch (e) {
        vadRef.current = null; // fail-open: never suppress real speech
      }

      const track = stream.getAudioTracks()[0];
      debug('[record] microphone:', track?.label || 'unknown device');
      debug('[record] audio track settings:', track?.getSettings?.() ?? {});

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      debug('[record] MIME:', mimeType);

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      chunkSeqRef.current = 0;
      void clearRecording(consultation.id); // fresh capture — drop any stale chunks
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          // Crash-safety: persist each chunk as it arrives (fire-and-forget).
          void saveChunk(consultation.id, e.data, chunkSeqRef.current++, mediaRecorder.mimeType || mimeType);
        }
      };
      recordStartMsRef.current = Date.now();
      mediaRecorder.start(1000); // timeslice flushes data periodically
    } catch (err) {
      // If audio capture can't start, the live (Web Speech) transcript still
      // works — we just won't have a backend-corrected final transcript.
      console.error('[record] audio capture failed (live transcript still works):', err);
      mediaRecorderRef.current = null;
    }
  };

  // Stop the parallel capture and resolve the complete recorded blob (or null).
  const stopAudioCaptureGetBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      // Tear down VAD as recording ends (releases its AudioContext).
      try { vadRef.current?.stop(); } catch { /* noop */ } finally { vadRef.current = null; }
      if (!recorder) { resolve(null); return; }
      mediaRecorderRef.current = null; // guard against double-stop
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const chunks = audioChunksRef.current;
        const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        const durationSec = recordStartMsRef.current
          ? (Date.now() - recordStartMsRef.current) / 1000
          : 0;
        debug('[record] duration (s):', durationSec.toFixed(1));
        debug('[record] blob size (bytes):', blob.size);
        debug('[record] blob mimetype:', blob.type || mimeType);
        resolve(blob);
      };
      // Flush any buffered audio into a final chunk so the blob is complete.
      try { recorder.requestData(); } catch { /* not all browsers support it */ }
      try { recorder.stop(); } catch { resolve(null); }
    });

  // Convert a transcript into the currently selected OUTPUT language. Auto Detect
  // (or empty text) returns the text unchanged — the transcript stays in the
  // detected spoken language. Any specific language translates the ENTIRE
  // transcript into it via the backend (no summarising). On failure the original
  // text is kept so the transcript is never lost. Shared by every transcription
  // path (live recording, Whisper fallback, upload) and the dropdown handler.
  const toOutputLanguage = async (text: string, target: string = language): Promise<string> => {
    const source = (text || '').trim();
    if (!source || !target || target === 'auto') return source;
    setIsTranslating(true);
    try {
      const converted = (await translateTranscript(source, target)).trim();
      return converted || source;
    } catch (tErr) {
      console.error('Transcript language conversion error:', tErr);
      const d = tErr instanceof Error ? tErr.message : '';
      setError(d || 'Failed to convert the transcript into the selected language.');
      return source;
    } finally {
      setIsTranslating(false);
    }
  };

  // Finalize a stopped recording: show the finalized transcript, convert it into
  // the selected output language, then auto-generate the report from the COMPLETE
  // transcript. Runs from onend so the recognizer's last flushed final result is
  // already committed (nothing spoken is lost).
  const finalizeStop = async () => {
    liveActiveRef.current = false;
    recognitionRef.current = null;
    setIsRecording(false);
    setIsPaused(false);

    // Live (browser SpeechRecognition) transcript captured during this recording.
    // Used only as a fallback if backend transcription is unavailable.
    const liveText = committedRef.current.trim();
    let finalText = liveText;

    // Produce the accurate FINAL transcript from the ACTUAL recorded audio via the
    // existing backend Whisper flow. Browser SpeechRecognition handles audio played
    // from a phone/speaker near the mic poorly; the recorded blob does not, so this
    // is what makes externally-played audio transcribe correctly. STT always
    // AUTO-DETECTS the spoken language here (best accuracy for mixed Hindi/English/
    // Urdu speech); converting to the selected output language happens afterwards
    // via translation. Falls back to the live transcript if nothing usable was
    // recorded or the backend errors, so direct-voice recording keeps working.
    try {
      setIsTranscribing(true);
      const blob = await stopAudioCaptureGetBlob();
      if (blob && blob.size >= 2000) {
        debug('[transcribe] sending recorded blob to backend — size (bytes):', blob.size, '| type:', blob.type);
        const result = await transcribeAudio(blob);
        const whisperText = (result.rawText || '').trim();
        debug('[transcribe] backend response — text length:', whisperText.length);
        if (whisperText && !isLikelyHallucination(whisperText)) {
          // Append the accurate transcription after any pre-recording transcript.
          finalText = (recordingBaseRef.current
            ? `${recordingBaseRef.current} ${whisperText}`
            : whisperText).trim();
        }
        // Transcribed — the persisted audio has served its purpose.
        void clearRecording(consultation.id);
        setRecovered(null);
      } else {
        console.warn('[transcribe] recorded blob too small/missing — keeping live transcript:', blob?.size ?? 'none');
        void clearRecording(consultation.id);
      }
    } catch (err) {
      // KEEP the audio: transcription failed (usually the network), so surface it
      // for a retry instead of silently dropping the consultation's recording.
      console.error('[transcribe] backend error — recording kept for retry:', err);
      const saved = await loadRecording(consultation.id);
      if (saved) {
        setRecovered(saved);
        setError('Could not transcribe the recording — your audio is saved. Tap "Transcribe now" to retry.');
      }
    } finally {
      setIsTranscribing(false);
    }

    // originalTranscript = exact spoken words in the detected language (source of
    // truth). displayedTranscript = converted into the selected output language.
    setOriginalTranscript(finalText);

    // Convert the FULL transcript into the selected output language. Auto Detect
    // keeps the original spoken language; any specific choice translates the
    // entire transcript into it (no mixed-language leftovers).
    const displayText = await toOutputLanguage(finalText);
    setDisplayedTranscript(displayText);

    // Auto-generate the report from the full updated transcript (unchanged
    // existing behaviour — the report uses the displayed transcript).
    if (displayText) await runReportGeneration(displayText);
  };

  // Create a fresh SpeechRecognition wired to our handlers and start it. A new
  // instance is used on every start/resume so an aborted instance is never
  // reused (which Chrome can reject).
  const beginRecognition = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = RECOGNITION_LANG[language] || 'en-IN';

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';
      // resultIndex marks the first changed result, so finalized results are
      // never reprocessed → no duplicated text.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0]?.transcript || '';
        if (res.isFinal) finalChunk += `${txt} `;
        else interim += txt;
      }
      const clean = finalChunk.trim();
      // VAD gate for the live preview: accept a finalized chunk only when real
      // (sustained) speech occurred recently, so brief accidental sounds — a
      // keyboard click, single cough, fan/AC hum — that occasionally produce a
      // spurious final result are ignored. Fail-open: if VAD is unavailable, the
      // chunk is always accepted so no real word is ever lost. The window is
      // generous to absorb timing jitter between the audio and the recognizer.
      const vad = vadRef.current;
      const speechConfirmed = !vad || vad.spokeRecently(2000);
      // Commit finalized text to the single source of truth. committedRef means
      // the recognizer's internal restarts never lose or duplicate words.
      if (clean && !isLikelyHallucination(clean) && speechConfirmed) {
        committedRef.current = (committedRef.current ? `${committedRef.current} ${clean}` : clean).trim();
        setOriginalTranscript(committedRef.current);
      }
      // ONE transcript box: show committed text followed by the in-progress
      // (interim) words. The value is rebuilt from committedRef every time — the
      // interim tail is replaced by its finalized form on the next result, so no
      // word is ever duplicated. Only committedRef is persisted/translated.
      const live = interim.trim();
      setDisplayedTranscript(live ? `${committedRef.current} ${live}`.trim() : committedRef.current);
    };

    recognition.onerror = (event: any) => {
      // Permission errors are fatal; transient ones (no-speech / aborted /
      // network) are handled by onend's auto-restart while we should still listen.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        liveActiveRef.current = false;
        setError('Microphone access is required. Please allow microphone permissions and try again.');
        setIsRecording(false);
        setIsPaused(false);
      }
    };

    recognition.onend = () => {
      // Keep listening: Chrome stops recognition periodically (and on silence),
      // so relaunch while the consultation is active and not paused.
      if (shouldListenRef.current) {
        try { recognition.start(); } catch { /* already starting — ignore */ }
        return;
      }
      // A real Stop is in flight → the last final result has now been flushed, so
      // finalize the transcript and auto-generate the report.
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        void finalizeStop();
      }
      // Otherwise we are merely paused — keep everything captured, do nothing.
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      /* start() can throw if called too soon after stop() — onend will retry. */
    }
  };

  const startLiveRecording = () => {
    liveActiveRef.current = true;
    // Snapshot the current transcript so live results append AFTER existing text
    // (and after any manual edits made before recording).
    committedRef.current = displayedTranscript.trim();
    // Same snapshot as the base the backend transcript will append to on Stop.
    recordingBaseRef.current = displayedTranscript.trim();
    shouldListenRef.current = true;
    setError(null);
    setIsPaused(false);
    setTimer(0);
    setIsRecording(true);
    // Acquire the mic + start the parallel recorder FIRST, then start live
    // recognition on top of the already-open device. Starting recognition before
    // getUserMedia made Chrome abort the recognizer's audio capture when the
    // recorder stream was acquired, so interim words stopped streaming and the
    // transcript only appeared (from the backend) after Stop. Capturing first
    // restores continuous word-by-word streaming. If capture fails, recognition
    // still starts so the live transcript works regardless.
    void startAudioCapture().finally(() => {
      if (liveActiveRef.current && shouldListenRef.current) beginRecognition();
    });
  };

  const pauseRecording = () => {
    // Stop listening but keep everything captured. stop() flushes pending speech
    // as a final result before ending, so no words are lost.
    shouldListenRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    // Pause the audio recording too — the blob stays continuous across pauses.
    try { if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.pause(); } catch { /* noop */ }
    setIsPaused(true);
    // Drop any trailing interim words → keep the finalized transcript only.
    setDisplayedTranscript(committedRef.current);
  };

  const resumeRecording = () => {
    // Re-capture the (possibly hand-edited) transcript as the base, then listen
    // again — new speech is appended below the existing transcript.
    committedRef.current = displayedTranscript.trim();
    shouldListenRef.current = true;
    setError(null);
    setIsPaused(false);
    beginRecognition();
    // Resume the same audio recording (do NOT reset recordingBaseRef — the blob
    // spans the whole Start→Stop session).
    try { if (mediaRecorderRef.current?.state === 'paused') mediaRecorderRef.current.resume(); } catch { /* noop */ }
  };

  const stopLiveRecording = () => {
    // Ignore repeat Stop clicks while a stop/finalize/report run is in progress.
    if (pendingStopRef.current || reportGenRef.current) return;
    shouldListenRef.current = false;
    setIsRecording(false); // immediate UI feedback

    if (isPaused) {
      // Already stopped while paused: no further final result will arrive, so
      // finalize (and auto-generate) right away.
      setIsPaused(false);
      try { recognitionRef.current?.stop(); } catch { /* noop */ }
      void finalizeStop();
      return;
    }

    const rec = recognitionRef.current;
    if (!rec) { void finalizeStop(); return; }

    // stop() flushes any pending speech as a final result, then fires onend —
    // finalizeStop runs there so the last spoken words are included.
    pendingStopRef.current = true;
    try {
      rec.stop();
    } catch {
      pendingStopRef.current = false;
      void finalizeStop();
    }
  };

  // ── MediaRecorder + Whisper fallback (used when Web Speech is unavailable) ──
  const startWhisperRecording = async () => {
    try {
      // Capture the RAW mic signal. The browser's default DSP (echo cancellation,
      // noise suppression, auto gain) is tuned for a person speaking directly into
      // the mic and badly mangles audio played from a phone/speaker near the mic:
      // echo cancellation treats the played audio as an "echo" to remove, and
      // noise suppression strips speech it considers non-voice. Turning them off
      // lets Whisper hear the actual conversation. Mono @ ~16 kHz is the sweet
      // spot for speech recognition (Whisper resamples to 16 kHz internally).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Log what the browser actually granted (constraints are best-effort hints).
      const settings = stream.getAudioTracks()[0]?.getSettings?.() ?? {};
      debug('[record] audio track settings:', settings);

      // Prefer Opus-in-WebM (best quality/compatibility for Whisper), else plain webm.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      debug('[record] MIME:', mimeType);

      const mediaRecorder = mimeType
        ? // Higher bitrate keeps speaker-played audio intelligible for Whisper.
          new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      // Always start from a clean chunk buffer — never reuse a previous recording.
      audioChunksRef.current = [];
      chunkSeqRef.current = 0;
      void clearRecording(consultation.id);

      mediaRecorder.ondataavailable = (e) => {
        // Only keep non-empty chunks.
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          // Crash-safety: persist each chunk as it arrives (fire-and-forget).
          void saveChunk(consultation.id, e.data, chunkSeqRef.current++, mediaRecorder.mimeType || mimeType);
        }
      };

      // Timeslice so data is flushed periodically (and a final chunk on stop).
      recordStartMsRef.current = Date.now();
      mediaRecorder.start(1000);
      setError(null);
      setTimer(0);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access error:', err);
      setError('Microphone access is required. Please allow microphone permissions and try again.');
    }
  };

  const stopWhisperRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    setIsRecording(false);
    setIsTranscribing(true);
    setError(null);

    recorder.onstop = async () => {
      // Recording has fully stopped — release the mic and assemble the blob.
      streamRef.current?.getTracks().forEach(t => t.stop());

      const chunks = audioChunksRef.current;
      const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
      // Assemble ALL captured chunks into one complete blob (nothing dropped).
      const audioBlob = new Blob(chunks, { type: mimeType });
      const durationSec = recordStartMsRef.current
        ? (Date.now() - recordStartMsRef.current) / 1000
        : 0;

      // ── Debug logs for audio-capture diagnosis ──────────────────────────
      debug('[record] duration (s):', durationSec.toFixed(1));
      debug('[record] chunks:', chunks.length);
      debug('[record] blob size (bytes):', audioBlob.size);
      debug('[record] blob mimetype:', audioBlob.type || mimeType);

      // Guard against empty recordings (silence / mic not captured), which make
      // Whisper return generic hallucinated text. Kept low so short but real
      // clips (~1–2s) are still transcribed.
      if (audioBlob.size < 2000) {
        console.warn('[record] blob too small — not sending to Whisper:', audioBlob.size);
        setError('Recording too short or microphone audio not captured.');
        setIsTranscribing(false);
        return;
      }

      try {
        // Whisper AUTO-DETECTS the spoken language and returns the exact spoken
        // words from THIS recording (best accuracy for mixed Hindi/English/Urdu).
        // Conversion into the selected output language happens afterwards.
        debug('[transcribe] sending file — size (bytes):', audioBlob.size, '| type:', audioBlob.type || mimeType);
        const result = await transcribeAudio(audioBlob);
        const text = (result.rawText || '').trim();
        debug('[transcribe] API response — text length:', text.length);

        // Never insert a known hallucination phrase into the transcript.
        if (text && isLikelyHallucination(text)) {
          setError('Transcription unclear. Please record again closer to the microphone.');
          setIsTranscribing(false);
          return;
        }

        if (text) {
          // Append the exact spoken words to the transcript (source of truth),
          // then convert the full transcript into the selected output language.
          const newOriginal = (originalTranscript ? `${originalTranscript} ${text}` : text).trim();
          setOriginalTranscript(newOriginal);
          setIsTranscribing(false);
          setDisplayedTranscript(await toOutputLanguage(newOriginal));
        }
      } catch (err) {
        console.error('[transcribe] API error:', err);
        const detail = err instanceof Error ? err.message : '';
        setError(detail || 'Failed to transcribe the audio. Please try again.');
      } finally {
        setIsTranscribing(false);
      }
    };

    // Flush any buffered audio into a final chunk before stopping, so the blob
    // is complete and never truncated, then stop (fires the final dataavailable
    // + onstop above).
    try { recorder.requestData(); } catch { /* not all browsers support it */ }
    recorder.stop();
  };

  // Dispatchers: prefer the live Web Speech path, fall back to Whisper batch.
  const startRecording = () => {
    if (liveSupported) startLiveRecording();
    else startWhisperRecording();
  };

  const stopRecording = () => {
    if (liveActiveRef.current) stopLiveRecording();
    else stopWhisperRecording();
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // Release the mic / stop the recognizer if the component unmounts mid-session.
  useEffect(() => () => {
    shouldListenRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* noop */ }
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Upload an audio file and run it through the existing transcription API ──
  const triggerFilePicker = () => {
    // Guard: an active session is required to attach the audio to.
    if (!consultation?.id) {
      setError('Create/select a session first.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    // Re-check the session guard at upload time.
    if (!consultation?.id) {
      setError('Create/select a session first.');
      return;
    }

    // Accept by MIME ("audio/*" or explicit list) OR extension fallback. This
    // fixes valid MP3/MPEG files (which can arrive as audio/mpeg or even
    // video/mpeg) being wrongly rejected by an extension/MIME-only check.
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const { accepted, reason } = checkAudioFile(file.name, file.type);
    debug('[audio-upload] selected file', {
      originalName: file.name,
      mimetype: file.type,
      extension: ext,
      size: file.size,
      decision: accepted ? 'accepted' : 'rejected',
      reason,
    });

    if (!accepted) {
      console.error('[audio-upload] rejected:', reason);
      setError('Please upload a valid audio file.');
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      console.error('[audio-upload] rejected: file exceeds 25MB', { size: file.size });
      setError('Audio file is too large. Maximum size is 25MB.');
      return;
    }

    setError(null);
    setUploadFileName(file.name);
    setUploadProgress(0);
    setIsUploading(true);

    try {
      const result = await uploadConsultationAudio(file, {
        consultationId: consultation.id,
        // STT auto-detects the spoken language for accuracy; conversion into the
        // selected output language happens afterwards via toOutputLanguage.
        language: 'auto',
        onProgress: setUploadProgress,
      });

      // Audio is uploaded; now transcribing on the server.
      setIsUploading(false);
      setIsTranscribing(true);

      const text = (result.rawText || '').trim();
      if (result.audioUrl) setAudioUrl(result.audioUrl);

      if (!text) {
        setError('No speech could be transcribed from this audio file.');
        return;
      }

      // Append the exact spoken words to the transcript (same source-of-truth
      // model as recording), then convert the full transcript into the selected
      // output language (Auto Detect keeps the original spoken language).
      const newOriginal = (originalTranscript ? `${originalTranscript} ${text}` : text).trim();
      // Success is silent by design: the audio player + loaded transcript are the
      // feedback. No success banner/toast — nothing interrupts the doctor's review.
      setOriginalTranscript(newOriginal);
      setIsTranscribing(false);
      setDisplayedTranscript(await toOutputLanguage(newOriginal));
      setUploadFileName('');
    } catch (err) {
      console.error('Audio upload error:', err);
      const detail = err instanceof Error ? err.message : '';
      setError(detail || 'Failed to upload and transcribe the audio file.');
      setUploadFileName('');
    } finally {
      setIsUploading(false);
      setIsTranscribing(false);
    }
  };

  // Remove the uploaded audio from the CURRENT session only. Clears the audio
  // reference (so the player hides and the upload button returns) and best-effort
  // deletes the stored file from server storage. Transcript and report are left
  // untouched. Persistence happens via the normal auto-save (audioUrl changed).
  const handleRemoveAudio = async () => {
    if (!audioUrl) return;
    if (!window.confirm('Remove this audio from the session?')) return;

    // Best-effort storage cleanup — never blocks clearing the reference.
    await deleteConsultationAudio(audioUrl);

    setAudioUrl('');
    // Clear the upload file name too, so no stale progress note remains.
    setUploadFileName('');
  };

  // The dropdown selects the OUTPUT language. Changing it converts the ENTIRE
  // existing transcript into the new language immediately (Auto Detect restores
  // the original spoken language), and future recordings/uploads are converted to
  // it too. Conversion always runs off originalTranscript — the source-of-truth
  // spoken text — so switching languages never compounds/re-translates lossy text.
  const handleLanguageChange = async (newLang: string) => {
    setLanguage(newLang);

    const source = (originalTranscript.trim() || displayedTranscript.trim());
    if (!source) return; // nothing to convert yet — just remember the selection

    setError(null);
    // Auto Detect → show the original spoken-language text unchanged.
    setDisplayedTranscript(newLang === 'auto' ? source : await toOutputLanguage(source, newLang));
  };

  const handleGenerateReport = async () => {
    if (!canGenerate) return;
    // OpenAI generates the report from the currently visible (translated)
    // transcript — same shared path used by auto-generation on Stop.
    await runReportGeneration(displayedTranscript);
  };

  // Bullet-list helpers (chiefComplaint, HPI, review of systems, etc.).
  const updateBullet = (section: keyof ReportData, index: number, value: string) => {
    setReportData(prev => {
      const items = [...(prev[section] as string[])];
      items[index] = value;
      return { ...prev, [section]: items };
    });
  };

  const addBullet = (section: keyof ReportData) => {
    setReportData(prev => ({
      ...prev,
      [section]: [...(prev[section] as string[]), ''],
    }));
  };

  const removeBullet = (section: keyof ReportData, index: number) => {
    setReportData(prev => ({
      ...prev,
      [section]: (prev[section] as string[]).filter((_, i) => i !== index),
    }));
  };

  // Vitals (Clinical Measurements) — editable key/value.
  const updateVital = (field: keyof Vitals, value: string) => {
    setReportData(prev => ({ ...prev, clinicalMeasurements: { ...prev.clinicalMeasurements, [field]: value } }));
  };

  // Follow-up plan — editable key/value.
  const updateFollowUp = (field: keyof FollowUp, value: string) => {
    setReportData(prev => ({ ...prev, followUp: { ...prev.followUp, [field]: value } }));
  };

  // Medication table helpers.
  const updateMed = (section: keyof ReportData, index: number, field: keyof MedicationRow, value: string) => {
    setReportData(prev => {
      const rows = [...(prev[section] as MedicationRow[])];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [section]: rows };
    });
  };

  const addMed = (section: keyof ReportData) => {
    setReportData(prev => ({
      ...prev,
      [section]: [...(prev[section] as MedicationRow[]), emptyMedicationRow()],
    }));
  };

  const removeMed = (section: keyof ReportData, index: number) => {
    setReportData(prev => ({
      ...prev,
      [section]: (prev[section] as MedicationRow[]).filter((_, i) => i !== index),
    }));
  };

  // Print goes through the shared helper, which hands off to the phone app's
  // NATIVE print dialog when we're inside the WebView. Doing it inline here meant
  // the app fell back to window.open(), which a WebView blocks — so Print simply
  // failed on the phone even though the bridge for it already existed.
  const handlePrint = (scope?: 'prescription' | 'full') => {
    try {
      printReport(reportData, {
        patientName: consultation.patientName,
        ...reportPatientMeta,
        date: consultation.date,
        doctorName: doctorName.trim() || undefined,
        ...letterhead,
        previousVisit: previousVisitPdf,
      }, { scope });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to print. Please try again.');
    }
  };

  // Export metadata + download dispatcher for the transcript/report files.
  // `pick` selects the export function from the lazily-loaded download module.
  const exportMeta = {
    patientName: consultation.patientName,
    ...reportPatientMeta,
    date: consultation.date,
    doctorName: doctorName.trim() || undefined,
    ...letterhead,
  };
  type DownloadModule = typeof import('../utils/download');
  const runDownload = (pick: (m: DownloadModule) => void | Promise<void>) => {
    setDownloadOpen(false);
    import('../utils/download')
      .then(m => pick(m))
      .catch(() => setError('Download failed. Please try again.'));
  };

  const handleSave = async (e?: React.MouseEvent<HTMLButtonElement>): Promise<boolean> => {
    // Defensive: never let a click trigger a form submit / page reload.
    e?.preventDefault();

    // Cancel any pending debounced auto-save so it can't later overwrite the
    // 'Completed' status we are about to persist with a stale 'Draft' write.
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    // And let any ALREADY-dispatched auto-save land first, so our Completed write
    // is the last one to hit the store (the backend also refuses to downgrade a
    // Completed consultation, so this is belt-and-suspenders).
    if (inFlightAutoSaveRef.current) {
      try { await inFlightAutoSaveRef.current; } catch { /* ignore */ }
    }

    const now = new Date().toISOString();
    const lines = transcriptToLines();
    const text = displayedTranscript.trim();
    const base = {
      id: consultation.id,
      // Explicit link so reports/prescriptions/transcripts group under one
      // consultation in the Previous Consultation History view. Equals `id`
      // (which the app already keys these records by), so existing records that
      // predate this field still group correctly.
      consultationId: consultation.id,
      patientId: consultation.patientId,
      patientName: consultation.patientName,
      date: consultation.date,
      createdAt: now,
    };

    // One full consultation document …
    const consultationDoc = {
      ...consultation,
      status: 'Completed' as const,
      transcript: lines,
      transcriptText: text,
      originalTranscript: originalTranscript.trim(),
      audioUrl,
      report: reportData,
      prescriptions: reportData.prescribedMedications,
      createdAt: (consultation as any).createdAt || now,
      updatedAt: now,
    };

    try {
      // … plus dedicated collection records, all persisted to MongoDB.
      await Promise.all([
        saveConsultation(consultationDoc as unknown as Consultation),
        saveReport({ ...base, report: reportData }),
        savePrescription({
          ...base,
          prescribedMedications: reportData.prescribedMedications,
          advice: reportData.advice,
        }),
        saveTranscript({ ...base, transcript: lines, transcriptText: text }),
      ]);
    } catch (err) {
      console.error('Database save error:', err);
      setError('Failed to save to the database. Please try again.');
      return false;
    }

    // Save succeeded → this is the only path that marks the session Completed.
    // Stay on the same session (no redirect, no reload) and show a confirmation.
    // Record the saved snapshot so the now-Completed content is not treated as
    // an edit (which would immediately flip it back to Draft).
    lastSavedSnapshotRef.current = contentSnapshot();
    setSessionStatus('Completed');
    onSessionUpdate?.(consultationDoc as unknown as Consultation);
    debug('[session] saved', {
      sessionId: consultationDoc.id,
      patientId: consultationDoc.patientId,
      status: consultationDoc.status,
    });

    setSaveSuccess(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSaveSuccess(false), 3000);

    // Centered confirmation modal — auto-closes after ~2.5s if the doctor does
    // nothing (they can also close it or jump to the consultation).
    setSavedModalOpen(true);
    if (savedModalTimerRef.current) clearTimeout(savedModalTimerRef.current);
    savedModalTimerRef.current = setTimeout(() => setSavedModalOpen(false), 2500);

    onSaveReport(reportData);
    return true;
  };

  // Send the prescription to the patient on WhatsApp, now. Saves first, because
  // the server sends what it has stored — transmitting a note it never received
  // would deliver yesterday's prescription.
  const handleSendToPatient = async () => {
    setSendStatus(null);
    setIsSending(true);
    try {
      if (!(await handleSave())) return; // handleSave already surfaced the error
      const result = await sendPrescriptionToPatient(consultation.id);
      if (result.sent) {
        setSendStatus({
          ok: true,
          message: result.pdfSent
            ? 'Sent on WhatsApp with the prescription PDF.'
            : 'Sent on WhatsApp. The PDF follows once the patient replies.',
        });
      } else {
        setSendStatus({ ok: false, message: SEND_FAILURE[result.reason ?? 'invalid'] });
      }
    } catch (err) {
      setSendStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Could not send the prescription.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const showEmptyState =
    !hasTranscript && !isRecording && !isTranscribing && !isTranslating && !isGenerating && !isUploading;

  // ── Sessions panel data ───────────────────────────────────────
  // A short label for a stored session (chief complaint → transcript → fallback).
  const sessionLabel = (s: Consultation): string =>
    s.report?.chiefComplaint?.find(Boolean) ||
    (s.transcript || []).map(l => l.text).join(' ').trim() ||
    'Empty session';

  // Sortable timestamp for a session: updatedAt → createdAt → display date.
  const sessionTime = (s: Consultation): number => {
    const raw = s.updatedAt || s.createdAt || s.date;
    const parsed = raw ? Date.parse(raw) : NaN;
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  // Canonical "M/D/YYYY" date for a session, derived from the best available
  // timestamp. This makes date search behave the same for every session
  // regardless of how its `date` string was originally formatted (locale, etc.).
  const normalizedDate = (s: Consultation): string => {
    const raw = s.updatedAt || s.createdAt || s.date;
    const d = raw ? new Date(raw) : null;
    if (d && !Number.isNaN(d.getTime())) {
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    }
    return s.date || '';
  };

  // Does a session match the query? Matches patient name, date (raw +
  // normalized), status, notes, report text and transcript preview.
  const sessionMatches = (s: Consultation, q: string): boolean =>
    [
      s.patientName,
      s.date,
      normalizedDate(s),
      s.status,
      s.report?.notes,
      (s.report?.chiefComplaint || []).join(' '),
      (s.report?.assessment || []).join(' '),
      (s.report?.advice || []).join(' '),
      (s.report?.ordersDiagnostics || []).flatMap(g => g.findings).join(' '),
      (s.transcript || []).map(l => l.text).join(' '),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);

  // Live label/status for the current session. Status reflects the saved state
  // (Draft until the user clicks Save), NOT whether a report exists.
  const currentStatus: Consultation['status'] = sessionStatus;
  const currentLabel =
    reportData.chiefComplaint?.find(Boolean) || displayedTranscript.trim() || 'New session';

  const query = sessionQuery.trim().toLowerCase();

  // Sessions belonging ONLY to the currently selected patient. `patientHistory`
  // is already scoped to this patient by the parent; we additionally guard on
  // patientId so a session from another patient can never leak in. The active
  // session is excluded so it is never duplicated (it stays in the Current
  // section).
  const allPrevious = patientHistory.filter(
    s => s.id !== consultation.id && s.patientId === consultation.patientId,
  );

  // Search mode: match only within THIS patient's sessions. Other patients'
  // sessions are never shown, even when the date matches. Matches sorted
  // newest → oldest.
  const searchResults: { session: Consultation; matched: boolean }[] = query
    ? allPrevious
        .filter(s => sessionMatches(s, query))
        .sort((a, b) => sessionTime(b) - sessionTime(a))
        .map(session => ({ session, matched: true }))
    : [];

  // Default mode: previous sessions grouped by date, newest → oldest.
  const groupedPrevious: { date: string; items: Consultation[] }[] = [];
  if (!query) {
    const sorted = [...allPrevious].sort((a, b) => sessionTime(b) - sessionTime(a));
    for (const s of sorted) {
      const key = s.date || 'Undated';
      const group = groupedPrevious.find(g => g.date === key);
      if (group) group.items.push(s);
      else groupedPrevious.push({ date: key, items: [s] });
    }
  }

  const statusBadgeClass = (status?: string) =>
    status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

  // Shared previous-session card. `highlighted` adds a ring when it matches the
  // active search query.
  const renderSessionCard = (s: Consultation, highlighted = false) => (
    <button
      key={s.id}
      onClick={() => onSelectSession?.(s)}
      className={`w-full text-left p-3 border rounded-xl hover:border-blue-300 hover:bg-white cursor-pointer transition-colors ${
        highlighted ? 'border-blue-400 bg-blue-50/60 ring-2 ring-blue-300' : 'border-slate-200 bg-slate-50'
      }`}
      title="Open this session"
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
          <Clock size={12} /> {s.date}
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusBadgeClass(s.status)}`}>
          {s.status}
        </span>
      </div>
      <p className="text-sm text-slate-800 line-clamp-2 font-medium">{sessionLabel(s)}</p>
    </button>
  );

  // ── Premium report section renderers ────────────────────────
  const inputCls =
    'w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
  const fieldLabelCls = 'text-[10px] font-semibold uppercase tracking-wide text-slate-400';
  const cell = (r: Record<string, any>, key: string): string =>
    (typeof r[key] === 'string' && r[key]) || (key === 'dose' ? (r.dosage as string) || '' : '');

  // The read-only renderers that lived here are gone: every section is now
  // editable, so nothing renders as static text any more.

  // Editable: medication table (cards with one input per column).
  const renderMedEditor = (section: ReportSectionDef) => {
    const cols = section.columns || TREATMENT_COLUMNS;
    const rows = reportData[section.key] as MedicationRow[];
    const addFavourite = (fav: MedicationRow) =>
      setReportData(prev => ({
        ...prev,
        [section.key]: [...(prev[section.key] as MedicationRow[]), { ...fav }],
      }));
    return (
      <div className="space-y-2">
        {/* One tap for the drugs this doctor actually prescribes. The whole line
            is filled — strength, dose, frequency, timing — because the medicine
            name was never the slow part. Ranked from their own history. */}
        {favourites.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">
              Frequently prescribed
            </span>
            {favourites.map(f => (
              <button
                key={f.label}
                type="button"
                onClick={() => addFavourite(f.row)}
                title={`Used ${f.uses} time${f.uses === 1 ? '' : 's'}`}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-full px-2.5 py-1 transition-colors"
              >
                <Plus size={11} /> {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Autocomplete over every medicine name the doctor has used before. */}
        <datalist id="mediscribe-medicines">
          {medicineNames.map(n => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {rows.length === 0 && <p className="text-xs text-slate-400 italic">No medicines added.</p>}
        {rows.map((row, i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Medicine {i + 1}</span>
              <button
                onClick={() => removeMed(section.key, i)}
                className="text-slate-400 hover:text-red-600 transition-colors"
                title="Remove medicine"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {cols.map(col => (
                <input
                  key={col.key}
                  value={(row as Record<string, any>)[col.key] ?? cell(row, col.key)}
                  onChange={e => updateMed(section.key, i, col.key as keyof MedicationRow, e.target.value)}
                  placeholder={col.label}
                  list={col.key === 'medicine' ? 'mediscribe-medicines' : undefined}
                  className={inputCls}
                />
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={() => addMed(section.key)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus size={14} /> Add medicine
        </button>
      </div>
    );
  };

  // Editable: bullet list (care plan).
  const renderBulletEditor = (section: ReportSectionDef) => {
    const items = reportData[section.key] as string[];
    return (
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-xs text-slate-400 italic">Nothing added.</p>}
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-slate-400 mt-2.5 leading-none">•</span>
            <input
              value={item}
              onChange={e => updateBullet(section.key, i, e.target.value)}
              placeholder="—"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            <button
              onClick={() => removeBullet(section.key, i)}
              className="text-slate-400 hover:text-red-600 transition-colors mt-2"
              title="Remove item"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <button
          onClick={() => addBullet(section.key)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors mt-1"
        >
          <Plus size={14} /> Add item
        </button>
      </div>
    );
  };

  // Editable: the AI-written summary paragraph.
  const renderOverviewEditor = () => (
    <textarea
      value={reportData.clinicalOverview}
      onChange={e => setReportData(prev => ({ ...prev, clinicalOverview: e.target.value }))}
      rows={4}
      placeholder="Summary of the visit…"
      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-y"
    />
  );

  // Editable: a table of fixed-shape rows (complaints, allergies). One card per
  // row so it stays usable on a phone, where a real table would need scrolling.
  const renderRowEditor = <T extends object>(
    section: ReportSectionDef,
    cols: ColumnDef[],
    makeEmpty: () => T,
    noun: string,
  ) => {
    const rows = (reportData[section.key] as unknown as Record<string, string>[]) || [];
    const write = (next: Record<string, string>[]) =>
      setReportData(prev => ({ ...prev, [section.key]: next }));
    return (
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-slate-400 italic">Nothing added.</p>}
        {rows.map((row, i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {noun} {i + 1}
              </span>
              <button
                onClick={() => write(rows.filter((_, n) => n !== i))}
                className="text-slate-400 hover:text-red-600 transition-colors"
                title={`Remove ${noun.toLowerCase()}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {cols.map(col => (
                <input
                  key={col.key}
                  value={row[col.key] ?? ''}
                  onChange={e =>
                    write(rows.map((r, n) => (n === i ? { ...r, [col.key]: e.target.value } : r)))
                  }
                  placeholder={col.label}
                  className={inputCls}
                />
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={() => write([...rows, makeEmpty() as unknown as Record<string, string>])}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus size={14} /> Add {noun.toLowerCase()}
        </button>
      </div>
    );
  };

  // Editable: named groups of findings (review of systems, examination, orders).
  const renderGroupsEditor = (section: ReportSectionDef) => {
    const groups = (reportData[section.key] as SystemGroup[]) || [];
    const write = (next: SystemGroup[]) => setReportData(prev => ({ ...prev, [section.key]: next }));
    const setGroup = (i: number, patch: Partial<SystemGroup>) =>
      write(groups.map((g, n) => (n === i ? { ...g, ...patch } : g)));
    return (
      <div className="space-y-2.5">
        {groups.length === 0 && <p className="text-xs text-slate-400 italic">Nothing added.</p>}
        {groups.map((g, i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={g.name}
                onChange={e => setGroup(i, { name: e.target.value })}
                placeholder="Group (e.g. Respiratory)"
                className={`${inputCls} font-semibold flex-1`}
              />
              <button
                onClick={() => write(groups.filter((_, n) => n !== i))}
                className="text-slate-400 hover:text-red-600 transition-colors"
                title="Remove group"
              >
                <Trash2 size={13} />
              </button>
            </div>
            {g.findings.map((f, fi) => (
              <div key={fi} className="flex items-start gap-2 pl-2">
                <span className="text-slate-400 mt-2 leading-none">•</span>
                <input
                  value={f}
                  onChange={e =>
                    setGroup(i, { findings: g.findings.map((x, n) => (n === fi ? e.target.value : x)) })
                  }
                  placeholder="Finding"
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={() => setGroup(i, { findings: g.findings.filter((_, n) => n !== fi) })}
                  className="text-slate-400 hover:text-red-600 transition-colors mt-1.5"
                  title="Remove finding"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setGroup(i, { findings: [...g.findings, ''] })}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors pl-2"
            >
              <Plus size={12} /> Add finding
            </button>
          </div>
        ))}
        <button
          onClick={() => write([...groups, emptyGroup()])}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Plus size={14} /> Add group
        </button>
      </div>
    );
  };

  // Editable: vitals key/value grid.
  const renderVitalsEditor = () => (
    <div className="grid grid-cols-2 gap-2">
      {VITALS_FIELDS.map(f => (
        <label key={f.key} className="flex flex-col gap-0.5">
          <span className={fieldLabelCls}>{f.label}</span>
          <input
            value={reportData.clinicalMeasurements[f.key]}
            onChange={e => updateVital(f.key, e.target.value)}
            placeholder={f.label}
            className={inputCls}
          />
        </label>
      ))}
    </div>
  );

  // Editable: follow-up key/value.
  const renderFollowUpEditor = () => (
    <div className="space-y-2">
      {FOLLOWUP_FIELDS.map(f => (
        <label key={f.key} className="flex flex-col gap-0.5">
          <span className={fieldLabelCls}>{f.label}</span>
          <input
            value={reportData.followUp[f.key]}
            onChange={e => updateFollowUp(f.key, e.target.value)}
            placeholder={f.label}
            className={inputCls}
          />
        </label>
      ))}

      {/* The follow-up date used to print on the PDF and go nowhere. Booking it
          here makes it a real appointment, with the usual patient reminders. */}
      <FollowUpBooking
        consultationId={consultation.id}
        followUpText={reportData.followUp.date || reportData.followUp.duration}
        bookedAppointmentId={followUpAppointmentId}
        doctorName={doctorName}
        onBooked={setFollowUpAppointmentId}
      />
    </div>
  );

  // Dispatch a section to the right renderer (editable vs read-only).
  const renderSectionBody = (section: ReportSectionDef) => {
    // Every section is editable now. Thirteen of the eighteen used to render as
    // static text, so when the model got a history or an assessment wrong the
    // doctor could see the error and had no way to fix it — they could only
    // regenerate the whole note and hope. Correcting the record is the one thing
    // a clinician must always be able to do.
    switch (section.kind) {
      case 'overview':
        return renderOverviewEditor();
      case 'complaints':
        return renderRowEditor(section, COMPLAINT_COLUMNS, emptyComplaintRow, 'Complaint');
      case 'allergies':
        return renderRowEditor(section, ALLERGY_COLUMNS, emptyAllergyRow, 'Allergy');
      case 'groups':
        return renderGroupsEditor(section);
      case 'medications':
        return renderMedEditor(section);
      case 'vitals':
        return renderVitalsEditor();
      case 'followup':
        return renderFollowUpEditor();
      default:
        return renderBulletEditor(section);
    }
  };

  // Sections on screen: the core ones always, the rest once they have content —
  // otherwise all eighteen would be open at once and the note would be unreadable.
  // `revealed` holds sections the doctor has explicitly opened to add something.
  const visibleSections = REPORT_SECTIONS.filter(
    s => s.alwaysShow || revealed.includes(s.key) || sectionHasContent(reportData, s),
  );
  const hiddenSections = REPORT_SECTIONS.filter(s => !visibleSections.includes(s));

  // ── Crash recovery ──────────────────────────────────────────
  // On open, look for audio that was recorded for this consultation but never
  // transcribed (tab closed, crash, phone call, failed upload) and offer it back.
  useEffect(() => {
    let cancelled = false;
    if (!consultation.id) return;
    loadRecording(consultation.id)
      .then(saved => { if (!cancelled && saved) setRecovered(saved); })
      .catch(() => { /* recovery is best-effort */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation.id]);

  useEffect(() => {
    onRecordingChange?.(isRecording);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  useEffect(() => () => onRecordingChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before leaving mid-recording — the audio is saved, but the doctor almost
  // certainly meant to press Stop first.
  useEffect(() => {
    if (!isRecording) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isRecording]);

  // Transcribe a recovered recording (crash recovery or a failed upload retry).
  const handleRecoverRecording = async () => {
    if (!recovered || isRecovering) return;
    setIsRecovering(true);
    setError(null);
    try {
      const result = await transcribeAudio(recovered.blob);
      const text = (result.rawText || '').trim();
      if (!text || isLikelyHallucination(text)) {
        setError('The saved recording could not be transcribed. You can try again or discard it.');
        return;
      }
      // Append to whatever is already there, mirroring the normal stop-recording
      // path: originalTranscript holds the spoken words, displayedTranscript the
      // version converted into the selected output language.
      const base = originalTranscript.trim();
      const finalText = base ? `${base} ${text}`.trim() : text;
      setOriginalTranscript(finalText);
      setDisplayedTranscript(await toOutputLanguage(finalText));
      await clearRecording(consultation.id);
      setRecovered(null);
    } catch (err) {
      console.error('[recover] transcription failed:', err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not transcribe the saved recording. Please check your connection and try again.',
      );
    } finally {
      setIsRecovering(false);
    }
  };

  const handleDiscardRecording = async () => {
    await clearRecording(consultation.id);
    setRecovered(null);
  };

  // Split the transcript into Doctor/Patient turns. Read-only: the transcript
  // text itself is never modified, so this can be toggled off at any time.
  const handleIdentifySpeakers = async () => {
    if (isLabelling) return;
    if (speakerTurns.length) { setSpeakerTurns([]); return; } // toggle back to plain
    const text = displayedTranscript.trim();
    if (!text) return;
    setIsLabelling(true);
    setError(null);
    try {
      const turns = await labelSpeakers(text);
      if (turns.length === 0) {
        setError('Could not confidently separate the speakers for this transcript.');
        return;
      }
      setSpeakerTurns(turns);
    } catch (err) {
      console.error('[speakers] labelling failed:', err);
      setError(err instanceof Error && err.message ? err.message : 'Could not identify speakers.');
    } finally {
      setIsLabelling(false);
    }
  };

  // Any edit to the transcript invalidates an existing labelling.
  useEffect(() => {
    setSpeakerTurns([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedTranscript]);

  // Prescribing safety — recomputed only when the medicines or allergies change,
  // so it never runs on every keystroke elsewhere in the report.
  const safetyAlerts = React.useMemo(
    () => checkDrugSafety(reportData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportData.prescribedMedications, reportData.medicationHistory, reportData.allergies],
  );

  // ── Compare Previous Visit ──────────────────────────────────────────────
  // The immediately previous visit = the most recent session of THIS patient
  // (allPrevious is already scoped to this patient and excludes the active
  // session) that occurred at or before the current one and carries clinical
  // content. Read-only: this never mutates sessions, reports or the database.
  const currentVisitTime = sessionTime(consultation);
  const previousVisit =
    [...allPrevious]
      .filter(s => s.report && reportHasClinicalContent(normalizeReport(s.report)))
      .sort((a, b) => sessionTime(b) - sessionTime(a))
      .find(s => sessionTime(s) <= currentVisitTime) || null;

  const currentHasReport = reportHasClinicalContent(reportData);
  const visitComparison =
    previousVisit && currentHasReport
      ? buildVisitComparison(normalizeReport(previousVisit.report as ReportData), reportData)
      : null;

  // Structured summary of the previous visit (used for the Previous Medications
  // carry-forward list + the PDF section).
  const previousReport = previousVisit ? normalizeReport(previousVisit.report as ReportData) : null;
  const previousSummary = previousReport ? buildVisitSummary(previousReport) : null;

  // CONCISE clinical comparison (max 8 bullets) — the on-screen "Compare Previous
  // Visit" card and the PDF section both use these, so they stay short and identical.
  const comparisonBullets =
    previousReport && currentHasReport ? buildComparisonBullets(previousReport, reportData) : [];

  // Structured previous-visit block baked into the report HTML (print + PDF).
  const previousVisitPdf =
    previousReport && previousVisit
      ? buildPreviousVisitPdf(previousReport, reportData, previousVisit.date)
      : null;

  // Key for a previous medicine (case-insensitive name).
  const medKey = (m: PreviousMedicine) => m.medicine.trim().toLowerCase();

  // Carry a previous medicine into the CURRENT treatment plan (Continue/Modify),
  // or dismiss it (Stop). Continue/Modify append the row to prescribedMedications
  // if it isn't already there; the doctor edits it in the Treatment Plan table.
  const applyPrevMed = (m: PreviousMedicine, action: 'continued' | 'modified' | 'stopped') => {
    setPrevMedActions(prev => ({ ...prev, [medKey(m)]: action }));
    if (action === 'stopped') return;
    setReportData(prev => {
      const exists = (prev.prescribedMedications || []).some(
        r => (r.medicine || '').trim().toLowerCase() === medKey(m),
      );
      if (exists) return prev;
      const row: MedicationRow = {
        medicine: m.medicine,
        strength: '',
        dose: m.dose,
        route: '',
        frequency: m.frequency,
        timing: '',
        duration: '',
        instructions: '',
        purpose: m.reason,
        compliance: '',
      };
      return { ...prev, prescribedMedications: [...(prev.prescribedMedications || []), row] };
    });
  };

  // One labelled change block (e.g. "New symptoms") — rendered only when it has
  // items, so empty comparison rows never appear.
  const renderChangeGroup = (label: string, items: string[], tone: 'good' | 'warn' | 'info' | 'neutral') => {
    if (!items.length) return null;
    const toneCls =
      tone === 'good'
        ? 'bg-emerald-50 text-emerald-700'
        : tone === 'warn'
          ? 'bg-amber-50 text-amber-700'
          : tone === 'info'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-slate-100 text-slate-600';
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={i} className={`text-xs font-medium px-2 py-0.5 rounded-md ${toneCls}`}>
              {it}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // A titled sub-section inside the compare card — omitted entirely when empty.
  const renderCompareSection = (title: string, body: React.ReactNode) =>
    body ? (
      <div className="space-y-2">
        <h5 className="text-xs font-bold text-slate-700">{title}</h5>
        {body}
      </div>
    ) : null;

  const progressBadgeCls = (label: string) =>
    label === 'Improving'
      ? 'bg-emerald-50 text-emerald-700'
      : label === 'Needs attention'
        ? 'bg-amber-50 text-amber-700'
        : label === 'Mixed'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-slate-100 text-slate-600';

  // One labelled row of chips for the Last Visit summary.
  const summaryRow = (label: string, items: string[]) =>
    items.length ? (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={i} className="text-xs font-medium px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
              {it}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  // "Last Visit" summary — the previous completed consultation at a glance.
  const renderPreviousSummary = () => {
    if (!previousSummary) return null;
    const s = previousSummary;
    const medNames = s.medications.map(m => [m.medicine, m.dose].filter(Boolean).join(' '));
    const any =
      s.diagnosis.length || s.complaints.length || medNames.length || s.investigations.length ||
      s.followUp.length || s.allergies.length || s.chronic.length;
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Last Visit</h5>
          {previousVisit?.date && <span className="text-xs font-medium text-slate-500">{previousVisit.date}</span>}
        </div>
        {any ? (
          <div className="space-y-2.5">
            {summaryRow('Diagnosis', s.diagnosis)}
            {summaryRow('Chief Complaints', s.complaints)}
            {summaryRow('Medications', medNames)}
            {summaryRow('Investigations', s.investigations)}
            {summaryRow('Follow-up', s.followUp)}
            {summaryRow('Allergies', s.allergies)}
            {summaryRow('Chronic Conditions', s.chronic)}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No structured details recorded for the last visit.</p>
        )}
      </div>
    );
  };

  // "Previous Medications" — carry forward with Continue / Modify / Stop.
  const renderPreviousMeds = () => {
    if (!previousSummary || !previousSummary.medications.length) return null;
    return (
      <div className="rounded-xl border border-slate-200 p-3.5">
        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Previous Medications</h5>
        <div className="space-y-2">
          {previousSummary.medications.map((m, i) => {
            const action = prevMedActions[medKey(m)];
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.medicine}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[m.dose, m.frequency, m.reason && `• ${m.reason}`].filter(Boolean).join(' ')}
                  </p>
                </div>
                {action ? (
                  <span
                    className={`text-[11px] font-semibold px-2 py-1 rounded-md whitespace-nowrap ${
                      action === 'stopped' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {action === 'continued' ? 'Continued' : action === 'modified' ? 'Modified' : 'Stopped'}
                  </span>
                ) : (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => applyPrevMed(m, 'continued')}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                      Continue
                    </button>
                    <button
                      onClick={() => applyPrevMed(m, 'modified')}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      Modify
                    </button>
                    <button
                      onClick={() => applyPrevMed(m, 'stopped')}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      Stop
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Continue / Modify adds the medicine to this visit's Treatment Plan (edit it there). Stop dismisses it.
        </p>
      </div>
    );
  };

  const renderCompareCard = () => (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <Activity size={16} className="text-blue-600" />
        <h4 className="text-sm font-bold text-slate-900">Compare Previous Visit</h4>
        {previousVisit && (
          <span className="text-xs font-normal text-slate-400">• vs {previousVisit.date}</span>
        )}
      </div>
      <div className="p-4 space-y-4">
        {!previousVisit ? (
          <p className="text-sm text-slate-500">No previous visit available for comparison.</p>
        ) : (
          <>
            {/* CONCISE clinical comparison — only meaningful differences (max 8). */}
            {!currentHasReport ? (
              <p className="text-sm text-slate-500">
                Generate the current report to compare it with the previous visit.
              </p>
            ) : comparisonBullets.length === 0 ? (
              <p className="text-sm text-slate-500">No significant clinical changes since the previous visit.</p>
            ) : (
              <ul className="space-y-1.5">
                {comparisonBullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-blue-500 leading-5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Previous Medications — compact carry-forward (Continue / Modify / Stop). */}
            {renderPreviousMeds()}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* LEFT PANEL: SESSIONS */}
      <div className="w-64 sm:w-80 border-r border-slate-200 bg-white flex flex-col hidden md:flex">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold flex-shrink-0">
              {consultation.patientName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 truncate">{consultation.patientName}</h3>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Sessions</p>
            </div>
          </div>
          <button
            onClick={() => onNewSession?.()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
            title="Start a new session for this patient"
          >
            <Plus size={16} /> New Session
          </button>
        </div>

        {/* Search sessions */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={sessionQuery}
              onChange={e => setSessionQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
          {/* Current session — always shown at the top, highlighted. */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1">Current session</p>
            <div className="p-3 border-2 border-blue-500 bg-blue-50/50 rounded-xl">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Clock size={12} /> {consultation.date}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusBadgeClass(currentStatus)}`}>
                  {currentStatus}
                </span>
              </div>
              <p className="text-sm text-slate-800 line-clamp-2 font-medium">{currentLabel}</p>
            </div>
          </div>

          {/* Previous sessions: grouped by date by default; a relevance-sorted
              flat list (matches highlighted, floated to top) while searching. */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1">Previous sessions</p>
            {query ? (
              searchResults.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No sessions found for this patient.</p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(({ session, matched }) => renderSessionCard(session, matched))}
                </div>
              )
            ) : allPrevious.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No previous sessions.</p>
            ) : (
              <div className="space-y-3">
                {groupedPrevious.map(group => (
                  <div key={group.date}>
                    <p className="text-[11px] font-semibold text-slate-400 mb-1.5 px-1">{group.date}</p>
                    <div className="space-y-2">
                      {group.items.map(s => renderSessionCard(s))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CENTER PANEL: TRANSCRIPT */}
      <div className="flex-1 flex flex-col border-r border-slate-200 relative bg-slate-50/50">
        <div className="p-5 border-b border-slate-200 bg-white flex justify-between items-center gap-3 shadow-sm z-10">
          <div className="flex items-center gap-3">
             <div className={`w-3 h-3 rounded-full ${isRecording ? (isPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse') : 'bg-slate-300'}`}></div>
             <span className="font-semibold font-mono tracking-wider tabular-nums text-lg text-slate-800">
               {formatTimer(timer)}
             </span>
             {/* Live transcript auto-save feedback (shown during the consultation). */}
             {(isRecording || transcriptSaveStatus === 'saving' || transcriptSaveStatus === 'failed') && transcriptSaveStatus !== 'idle' && (
               transcriptSaveStatus === 'saving' ? (
                 <span className="text-xs font-semibold text-blue-600 flex items-center gap-1.5">
                   <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></span>
                   Saving transcript…
                 </span>
               ) : transcriptSaveStatus === 'saved' ? (
                 <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                   <CheckCircle size={12} /> Transcript saved
                 </span>
               ) : (
                 <span className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                   <AlertCircle size={12} /> Failed to save transcript
                 </span>
               )
             )}
          </div>

          <div className="flex items-center gap-2">
            {isRecording ? (
              isPaused ? (
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1.5">
                  <Pause size={12} /> Paused
                </span>
              ) : (
                <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1.5">
                  <Mic size={12} /> Recording...
                </span>
              )
            ) : isTranscribing ? (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></span>
                Transcribing
              </span>
            ) : (
              <>
                {hasTranscript && reportStatus !== 'generated' && (
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md uppercase tracking-widest">
                    Review transcript
                  </span>
                )}
                <button
                  onClick={handleGenerateReport}
                  disabled={!canGenerate}
                  title="Generate report from the transcript"
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
                >
                  <FileText size={16} />
                  {isGenerating ? 'Generating report...' : 'Generate Report'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Transcript Area */}
        <div className="flex-1 flex flex-col overflow-hidden p-6 bg-slate-50">
          {/* Visit-start context — last visit, what they were on, what's pending.
              Collapsible; silent on a first visit. */}
          {consultation.patientId && (
            <div className="mb-4 flex-shrink-0">
              <PatientSnapshot patientId={consultation.patientId} patientName={consultation.patientName} />
            </div>
          )}

          {/* Unsent recording found — crash recovery, or a retry after a failed
              transcription. The audio is safe on disk until it's used or dropped. */}
          {recovered && !isRecording && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Mic size={18} className="text-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Unsent recording found</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {recovered.seconds > 0 ? `About ${Math.floor(recovered.seconds / 60)}m ${recovered.seconds % 60}s of ` : ''}
                  audio from this consultation was saved but never transcribed.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleRecoverRecording}
                  disabled={isRecovering}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
                >
                  {isRecovering ? 'Transcribing…' : 'Transcribe now'}
                </button>
                <button
                  onClick={handleDiscardRecording}
                  disabled={isRecovering}
                  className="text-amber-700 hover:text-amber-900 disabled:opacity-50 text-xs font-bold uppercase tracking-wide px-2"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-sm font-medium">{error}</div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-wide"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Upload PROGRESS only (while the file uploads/transcribes). No success
              banner — once done, the audio player + loaded transcript are the only
              feedback, so nothing interrupts the doctor's review. */}
          {isUploading && (
            <div className="mb-4 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <Upload size={18} className="flex-shrink-0 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{uploadFileName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : 'Transcribing'}
                  </p>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${uploadProgress < 100 ? uploadProgress : 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Player for the uploaded audio attached to this session. Download,
              playback speed, and remove all live in its single ⋮ menu. */}
          {audioUrl && (
            <UploadedAudioPlayer
              src={resolveMediaUrl(audioUrl)}
              onRemove={handleRemoveAudio}
            />
          )}

          {/* Transcript heading + language selector + review note */}
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              Transcript
            </h2>
            <div className="flex items-center gap-3">
              {isTranslating && (
                <span className="text-xs font-semibold text-blue-600 flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></span>
                  Translating transcript...
                </span>
              )}
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                Language
                <select
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  disabled={isRecording || isTranscribing || isTranslating || isGenerating}
                  title="Output language for the transcript. Auto Detect keeps the spoken language; selecting a language converts the entire transcript into that language and script. Applies to recordings and uploaded audio."
                  className="bg-white border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs text-slate-500">Review and edit transcript before generating report.</p>
            {hasTranscript && !isRecording && (
              <button
                onClick={handleIdentifySpeakers}
                disabled={isLabelling || isTranscribing || isTranslating}
                title="Split the transcript into Doctor / Patient turns"
                className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-white border border-slate-200 hover:border-blue-300 disabled:opacity-50 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <Users size={13} />
                {isLabelling ? 'Identifying…' : speakerTurns.length ? 'Show plain text' : 'Identify speakers'}
              </button>
            )}
          </div>

          {showEmptyState ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <Mic size={48} className="mb-4 opacity-50" />
              <p className="text-lg font-medium text-slate-500">Start the consultation</p>
              <p className="text-sm mt-2">Press the mic to record, or upload an audio file. The transcript will appear here.</p>
            </div>
          ) : speakerTurns.length > 0 ? (
            /* Speaker-labelled view — read-only; "Show plain text" returns to the
               editable transcript. The underlying text is never modified. */
            <div className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-y-auto custom-scrollbar mb-24 space-y-4">
              {speakerTurns.map((t, i) => {
                const isDoctor = t.speaker === 'Doctor';
                return (
                  <div key={i} className="flex gap-3">
                    <span
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${
                        isDoctor ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isDoctor ? 'Dr' : 'Pt'}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-[11px] font-bold uppercase tracking-wide mb-0.5 ${
                          isDoctor ? 'text-blue-600' : 'text-emerald-600'
                        }`}
                      >
                        {t.speaker}
                      </p>
                      <p className="text-[15px] leading-relaxed text-slate-800">{t.text}</p>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                Speakers identified by AI — please verify. Switch to plain text to edit.
              </p>
            </div>
          ) : (
            <textarea
              value={displayedTranscript}
              onChange={(e) => setDisplayedTranscript(e.target.value)}
              readOnly={isRecording && !isPaused}
              placeholder={isRecording ? (liveSupported ? 'Listening… your words appear here as you speak.' : 'Listening… the transcript will appear after you stop recording.') : 'Transcript will appear here. You can edit it before generating the report.'}
              className="flex-1 w-full bg-white border border-slate-200 rounded-2xl p-5 text-[15px] leading-relaxed text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none custom-scrollbar mb-24"
            />
          )}
        </div>

        {/* Recording / Upload Control — mic toggle plus an audio-file upload. */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white px-5 py-4 rounded-full shadow-lg border border-slate-200">
          <button
            onClick={toggleRecording}
            disabled={isTranscribing || isGenerating || isUploading}
            className={`${isRecording ? 'bg-slate-900 hover:bg-slate-800' : 'bg-red-500 hover:bg-red-600'} disabled:opacity-50 text-white w-14 h-14 rounded-full flex justify-center items-center shadow-sm transition-transform hover:scale-105`}
            title={isRecording ? 'End consultation (stop recording)' : 'Start recording'}
          >
            {isRecording ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
          </button>

          {/* Pause / Resume — live recording only (Web Speech API path). */}
          {isRecording && liveSupported && (
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              disabled={isTranscribing || isGenerating || isUploading}
              className={`${isPaused ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'} disabled:opacity-50 text-white px-4 py-2.5 rounded-full text-sm font-semibold shadow-sm transition-colors flex items-center gap-2`}
              title={isPaused ? 'Resume recording' : 'Pause recording'}
            >
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}

          <div className="w-px h-8 bg-slate-200" />

          {/* Hidden native picker, opened by the upload button below. */}
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={handleUploadChange}
            className="hidden"
          />
          <button
            onClick={triggerFilePicker}
            disabled={isRecording || isTranscribing || isTranslating || isGenerating || isUploading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-full text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
            title="Upload an audio file (mp3, wav, m4a, webm, ogg — max 25MB) to this session"
          >
            <Upload size={18} />
            {isUploading ? 'Uploading…' : 'Upload audio to session'}
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: REPORT EDITOR
          Desktop (lg+): static 450px side panel — unchanged.
          Tablet (md–lg): hidden — unchanged.
          Mobile (<md): full-screen page once a report is generating/generated. */}
      <div
        className={`bg-white flex-col min-h-0 md:hidden lg:static lg:inset-auto lg:z-auto lg:w-[450px] lg:flex ${
          isGenerating || reportStatus === 'generated' ? 'fixed inset-0 z-40 flex' : 'hidden'
        }`}
      >
        <div className="flex-1 flex flex-col min-h-0">
          {/* Fixed header */}
          <div className="flex-shrink-0 p-4 border-b border-slate-200 bg-white shadow-sm z-10 flex justify-between items-center gap-2">
            {/* Mobile-only back + logo — returns to the previous screen */}
            <div className="flex items-center gap-1.5 md:hidden">
              {onExit && (
                <button
                  onClick={() => onExit()}
                  aria-label="Back"
                  className="p-1.5 -ml-1 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <Logo onClick={() => onExit?.()} />
            </div>
            <h3 className="hidden md:flex font-bold text-slate-900 items-center gap-2">
              <FileText size={18} className="text-blue-600" />
              Report Editor
            </h3>
            <div className="flex gap-2 items-center">
              {isGenerating && (
                <span className="hidden md:inline-block text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">Generating report...</span>
              )}
              {!isGenerating && reportStatus === 'generated' && (
                <span className="hidden md:flex text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md items-center gap-1">
                  <CheckCircle size={12} /> Report generated
                </span>
              )}
              {!isGenerating && reportStatus === 'failed' && (
                <span className="hidden md:flex text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-md items-center gap-1">
                  <AlertCircle size={12} /> Report failed
                </span>
              )}
              {saveSuccess && (
                <span className="hidden md:flex text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md items-center gap-1">
                  <CheckCircle size={12} /> Saved
                </span>
              )}
              {/* Download menu: transcript (.txt/.pdf) + report (.pdf/.docx) */}
              <div className="relative">
                <button
                  onClick={() => setDownloadOpen(o => !o)}
                  className="p-2 text-slate-500 hover:bg-slate-100 rounded-md transition-colors flex items-center"
                  title="Download transcript / report"
                >
                  <Download size={18} />
                </button>
                {downloadOpen && (
                  <>
                    {/* Click-away backdrop */}
                    <div className="fixed inset-0 z-20" onClick={() => setDownloadOpen(false)} />
                    <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1.5 text-sm">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Transcript</div>
                      <button
                        onClick={() => runDownload(m => m.downloadTranscriptTxt(displayedTranscript, exportMeta))}
                        disabled={!hasTranscript}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-slate-700"
                      >
                        <FileText size={15} /> Transcript (.txt)
                      </button>
                      <button
                        onClick={() => runDownload(m => m.downloadTranscriptPdf(displayedTranscript, exportMeta))}
                        disabled={!hasTranscript}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-slate-700"
                      >
                        <FileText size={15} /> Transcript (.pdf)
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Medical Report</div>
                      <button
                        onClick={() => runDownload(m => m.downloadReportPdf(reportData, { ...exportMeta, previousVisit: previousVisitPdf }))}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                      >
                        <FileText size={15} /> Report (.pdf)
                      </button>
                      <button
                        onClick={() => runDownload(m => m.downloadReportDocx(reportData, exportMeta))}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                      >
                        <FileText size={15} /> Report (.docx)
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() => handlePrint()}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
                title="Export / Print PDF"
              >
                <Printer size={18} />
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-semibold shadow-sm transition-colors flex items-center gap-2"
              >
                <CheckCircle size={16} /> Save
              </button>
            </div>
          </div>
          {/* Scrollable body — only this area scrolls; header stays fixed */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 custom-scrollbar bg-white relative">
            <div className="space-y-6 pb-24">
              {/* Compare Previous Visit — read-only summary vs the patient's
                  immediately previous visit. Additive; does not affect the
                  report sections, save, or any other flow below. */}
              {renderCompareCard()}

              {/* Prescribing safety — allergy conflicts, interactions and
                  duplicates in the treatment plan. Advisory; never blocks. */}
              <DrugSafetyAlerts
                alerts={safetyAlerts}
                hasPrescription={(reportData.prescribedMedications || []).some(m => (m.medicine || '').trim())}
              />

              {visibleSections.map((section, idx) => (
                <div key={section.key as string}>
                  {/* No Editable/Read-only badge any more — every section is
                      editable, so the distinction it drew no longer exists. */}
                  <div className="mb-2 border-b border-slate-100 pb-1">
                    <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                      {idx + 1}. {section.title}
                    </h4>
                  </div>
                  {renderSectionBody(section)}
                </div>
              ))}

              {/* Sections the visit didn't produce. They stay out of the way until
                  the doctor wants one — an empty Family History on every note is
                  noise, but not being able to add one is a missing record. */}
              {hiddenSections.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Add a section
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {hiddenSections.map(s => (
                      <button
                        key={s.key as string}
                        type="button"
                        onClick={() => setRevealed(prev => [...prev, s.key])}
                        className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-50 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-full px-2.5 py-1 transition-colors"
                      >
                        <Plus size={11} /> {s.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Doctor Final Review */}
              <div>
                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide border-b border-slate-100 pb-1 mb-2">
                  {visibleSections.length + 1}. Doctor Final Review
                </h4>
                <label className="flex flex-col gap-0.5 mb-3">
                  <span className={fieldLabelCls}>Doctor Name</span>
                  <input
                    value={doctorName}
                    onChange={e => setDoctorName(e.target.value)}
                    placeholder="Dr. Full Name"
                    className={inputCls}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors"
                  >
                    <CheckCircle size={14} /> Save Report
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrint()}
                    className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                  >
                    <Printer size={14} /> Print Prescription
                  </button>
                  <button
                    type="button"
                    onClick={() => runDownload(m => m.downloadReportPdf(reportData, { ...exportMeta, previousVisit: previousVisitPdf }))}
                    className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                  >
                    <Download size={14} /> Export PDF
                  </button>
                  {/* Sending used to happen invisibly on the server when a note was
                      finalized, so the doctor could neither confirm it went nor send
                      it again when the patient asked. Now it's in their hand. */}
                  <button
                    type="button"
                    onClick={handleSendToPatient}
                    disabled={isSending}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Send size={14} /> {isSending ? 'Sending…' : 'Send to patient'}
                  </button>
                </div>

                {sendStatus && (
                  <p
                    className={`text-xs mt-2 flex items-start gap-1.5 ${
                      sendStatus.ok ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {sendStatus.ok ? (
                      <CheckCircle size={13} className="mt-px flex-shrink-0" />
                    ) : (
                      <AlertCircle size={13} className="mt-px flex-shrink-0" />
                    )}
                    <span>{sendStatus.message}</span>
                  </p>
                )}
              </div>
            </div>

            {isGenerating && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                <h3 className="font-bold text-lg text-slate-900 mb-1">Generating report...</h3>
                <p className="text-sm text-slate-600">Creating the clinical report from the edited transcript</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Centered "Report Saved Successfully" confirmation. Auto-closes ~2.5s. */}
      {savedModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
          onClick={() => setSavedModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle size={30} className="text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Report Saved Successfully</h3>
            <p className="text-sm text-slate-600 mb-5">
              This consultation has been saved successfully. It is now available under Previous Consultations.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  if (savedModalTimerRef.current) clearTimeout(savedModalTimerRef.current);
                  setSavedModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
              >
                View Consultation
              </button>
              <button
                onClick={() => {
                  if (savedModalTimerRef.current) clearTimeout(savedModalTimerRef.current);
                  setSavedModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
