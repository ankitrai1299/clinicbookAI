import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';

import { Consultation, ReportData, TranscriptLine } from '../../src/types';
import { useAppData } from '../../src/context/AppData';
import {
  transcribeAudio,
  uploadConsultationAudio,
  translateTranscript,
  generateReportStreaming,
  type ReportProgressEvent,
  saveConsultation,
  saveReport,
  savePrescription,
  saveTranscript,
  deleteConsultationAudio,
  resolveMediaUrl,
  correctTranscriptTerminology,
  RNAudioFile,
  type TerminologyCorrection,
  type TranscriptionResponse,
} from '../../src/services/api';
import {
  createEmptyReport,
  normalizeReport,
  formatConsultDate,
  formatConsultTime,
  type ReportMeta,
} from '../../src/utils/report';
import { buildComparisonMeta } from '../../src/utils/compareVisits';
import { appendReportVersion } from '../../src/utils/reportVersions';
import { LANGUAGES, languageLabel, isLikelyHallucination } from '../../src/constants';
import { loadSettings } from '../../src/services/storage';
import {
  exportTranscriptTxt,
  exportTranscriptPdf,
  exportReportPdf,
  exportReportDocx,
  printReport,
} from '../../src/utils/export';
import { useLiveTranscription, ensureLiveRecognition } from '../../src/hooks/useLiveTranscription';
import ReportEditor from '../../src/components/ReportEditor';
import AudioPlayer from '../../src/components/AudioPlayer';
import Waveform from '../../src/components/Waveform';
import LiveRecordingScreen from '../../src/components/LiveRecordingScreen';
import MicOrb from '../../src/components/MicOrb';
import { Button, Field, ErrorBanner, WarningBanner, IconButton, Tabs } from '../../src/components/ui';
import { colors, gradients, shadow } from '../../src/theme';

type Step = 'capture' | 'report';

export default function ConsultationScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t: tt, i18n } = useTranslation();
  const { consultations, patients, updateSession, reload } = useAppData();

  const consultation = consultations.find((c) => c.id === id);
  // Age / gender / phone live on the patient record, not the consultation, and
  // the exported report's Patient Information block needs them.
  const patient = patients.find((p) => p.id === consultation?.patientId);

  // ── Live on-device transcription (primary) + expo-audio→Whisper fallback ──
  const live = useLiveTranscription();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [liveMode, setLiveMode] = useState(true);
  const [fbPaused, setFbPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const initialText = (consultation?.transcript || []).map((l) => l.text).join(' ').trim();
  const [originalTranscript, setOriginalTranscript] = useState(initialText);
  const [displayedTranscript, setDisplayedTranscript] = useState(initialText);

  const [reportData, setReportData] = useState<ReportData>(
    consultation?.report ? normalizeReport(consultation.report) : createEmptyReport(),
  );

  const [language, setLanguage] = useState('auto');
  const [doctorName, setDoctorName] = useState('');

  // What the speech model heard, before terminology normalisation. Kept
  // alongside the working transcript so a correction can always be audited.
  // NOTE: distinct from `originalTranscript` above, which is the pre-TRANSLATION
  // text — these are different stages and both are preserved.
  const [uncorrectedTranscript, setUncorrectedTranscript] = useState(
    consultation?.uncorrectedTranscript || '',
  );
  const [terminologyCorrections, setTerminologyCorrections] = useState<TerminologyCorrection[]>(
    consultation?.terminologyCorrections || [],
  );

  const [audioUrl, setAudioUrl] = useState(consultation?.audioUrl || '');
  const [durationSec, setDurationSec] = useState(consultation?.durationSec || 0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  // Last generation stage the server reported finishing. Null before the first
  // one lands, and for the whole run on a backend with no streaming route.
  const [progress, setProgress] = useState<ReportProgressEvent | null>(null);
  // Stages that produced nothing, so the doctor can be told which parts of the
  // report are missing rather than empty. Cleared at the start of every run.
  const [failedStages, setFailedStages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reportStatus, setReportStatus] = useState<'idle' | 'generated' | 'failed'>(
    consultation?.report ? 'generated' : 'idle',
  );
  const [sessionStatus, setSessionStatus] = useState<Consultation['status']>(consultation?.status || 'Draft');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(consultation?.report ? 'report' : 'capture');
  const [exportOpen, setExportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const reportGenRef = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshot = useRef<string>('');
  const didAuto = useRef(false);

  // Unified recording state across the live + fallback engines.
  const isRecording = liveMode ? live.isListening : recorderState.isRecording;
  const isPaused = liveMode ? live.isPaused : fbPaused;

  useEffect(() => {
    loadSettings().then((s) => {
      setLanguage(s.defaultLanguage || 'auto');
      setDoctorName(s.doctorName || '');
    });
    lastSavedSnapshot.current = JSON.stringify({
      t: initialText,
      o: initialText,
      a: consultation?.audioUrl || '',
      r: consultation?.report ? normalizeReport(consultation.report) : createEmptyReport(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recording timer (works for both engines).
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    if (isRecording && !isPaused) id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (id) clearInterval(id); };
  }, [isRecording, isPaused]);

  // Stream live transcript into the editable field while listening.
  useEffect(() => {
    if (liveMode && live.isListening) {
      setDisplayedTranscript(live.liveText);
      setOriginalTranscript(live.liveText);
    }
  }, [live.liveText, live.isListening, liveMode]);

  // Surface live-recognition permission errors.
  useEffect(() => {
    if (live.error) setError(live.error);
  }, [live.error]);

  const hasTranscript = displayedTranscript.trim().length > 0;
  const canGenerate =
    hasTranscript && !isRecording && !isTranscribing && !isTranslating && !isGenerating && !isUploading;

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const transcriptToLines = useCallback(
    (): TranscriptLine[] =>
      displayedTranscript.trim()
        ? [{ speaker: 'System', text: displayedTranscript.trim(), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]
        : [],
    [displayedTranscript],
  );

  const contentSnapshot = useCallback(
    () => JSON.stringify({ t: displayedTranscript.trim(), o: originalTranscript.trim(), a: audioUrl, r: reportData, d: durationSec }),
    [displayedTranscript, originalTranscript, audioUrl, reportData, durationSec],
  );

  // Auto-save (debounced) on real content change — also persists the live
  // transcript every couple of seconds while recording (draft restore).
  useEffect(() => {
    if (!consultation) return;
    const snapshot = contentSnapshot();
    if (snapshot === lastSavedSnapshot.current) return;
    setSessionStatus('Draft');
    setSaved(false);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const now = new Date().toISOString();
      const doc = {
        ...consultation,
        status: 'Draft' as const,
        transcript: transcriptToLines(),
        transcriptText: displayedTranscript.trim(),
        originalTranscript: originalTranscript.trim(),
        audioUrl,
        durationSec,
        language,
        uncorrectedTranscript,
        terminologyCorrections,
        report: reportData,
        createdAt: consultation.createdAt || now,
        updatedAt: now,
      };
      updateSession(doc as unknown as Consultation);
      saveConsultation(doc as unknown as Consultation)
        .then(() => { lastSavedSnapshot.current = snapshot; })
        .catch((err) => console.error('Session auto-save error:', err));
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedTranscript, originalTranscript, reportData, audioUrl, durationSec]);

  // Append text from the Whisper fallback / upload paths (translates if needed).
  /**
   * Record what the terminology engine changed on a server-side transcription.
   *
   * The server returns the CORRECTED text as `rawText`, so the visible transcript
   * needs nothing here — this only keeps the audit trail: the pre-correction text
   * and the list of substitutions. Both accumulate, because one consultation can
   * be built from several uploads.
   *
   * Older backends omit these fields; then the uncorrected copy simply tracks
   * the corrected one, which is accurate — nothing was changed.
   */
  const recordTerminology = (result: TranscriptionResponse) => {
    const heard = (result.originalTranscript ?? result.rawText ?? '').trim();
    if (heard) {
      setUncorrectedTranscript((prev) => (prev ? `${prev} ${heard}` : heard).trim());
    }
    const applied = result.terminology?.corrections;
    if (applied?.length) {
      setTerminologyCorrections((prev) => [...prev, ...applied]);
    }
  };

  const appendTranscribedText = async (text: string) => {
    if (!text) return;
    if (isLikelyHallucination(text)) {
      setError(tt('consultation.unclear'));
      return;
    }
    const newOriginal = (originalTranscript ? `${originalTranscript} ${text}` : text).trim();
    setOriginalTranscript(newOriginal);
    if (!language || language === 'auto') {
      setDisplayedTranscript(newOriginal);
      return;
    }
    setIsTranslating(true);
    try {
      const translated = await translateTranscript(newOriginal, language);
      setDisplayedTranscript(translated);
    } catch (tErr) {
      setDisplayedTranscript(newOriginal);
      setError(tErr instanceof Error ? tErr.message : tt('consultation.translateFailed'));
    } finally {
      setIsTranslating(false);
    }
  };

  // ── Recording controls (live primary, Whisper fallback) ──────
  const startRecording = async () => {
    setError(null);
    setSeconds(0);
    const canLive = await ensureLiveRecognition();
    if (canLive) {
      setLiveMode(true);
      live.start(language, displayedTranscript);
      return;
    }
    // Fallback: record audio and transcribe with Whisper on stop.
    setLiveMode(false);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setFbPaused(false);
    } catch (err) {
      console.error('Record error:', err);
      setError(tt('consultation.startRecordingFailed'));
    }
  };

  const pauseRecording = () => {
    if (liveMode) { live.pause(); return; }
    try { recorder.pause(); setFbPaused(true); } catch {}
  };

  const resumeRecording = () => {
    if (liveMode) { live.resume(displayedTranscript); return; }
    try { recorder.record(); setFbPaused(false); } catch {}
  };

  const stopRecording = async () => {
    if (liveMode) {
      const finalText = await live.stop();
      if (finalText) {
        setDisplayedTranscript(finalText);
        setOriginalTranscript(finalText);
        // Live recognition runs on-device and never reaches the server, so this
        // is the transcript's one chance to be checked against the full clinical
        // terminology index. Uploaded audio is already corrected inside
        // /transcribe. Failure is non-fatal — the doctor keeps what was heard.
        setIsTranscribing(true);
        try {
          const fix = await correctTranscriptTerminology(finalText);
          // Record what was heard unconditionally, whether or not anything was
          // changed — the upload path does the same. Setting it only when a
          // correction fired left the field empty after a clean recording,
          // which reads as "never captured" rather than "nothing to correct".
          setUncorrectedTranscript(fix?.originalTranscript || finalText);
          setTerminologyCorrections(fix?.corrections || []);
          if (fix && fix.correctedTranscript !== fix.originalTranscript) {
            setDisplayedTranscript(fix.correctedTranscript);
          }
        } finally {
          setIsTranscribing(false);
        }
      }
      setDurationSec((prev) => Math.max(prev, seconds));
      return;
    }
    // ── Fallback: expo-audio → Whisper ──
    const finalMs = recorderState.durationMillis;
    try { await recorder.stop(); setFbPaused(false); } catch (err) { console.error('Stop error:', err); }
    const uri = recorder.uri;
    if (!uri || finalMs < 700) {
      setError(tt('consultation.recordingTooShort'));
      return;
    }
    setDurationSec((prev) => prev + Math.round(finalMs / 1000));
    setIsTranscribing(true);
    setError(null);
    try {
      const file: RNAudioFile = { uri, name: 'consultation.m4a', type: 'audio/m4a' };
      const result = await transcribeAudio(file);
      recordTerminology(result);
      await appendTranscribedText((result.rawText || '').trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : tt('consultation.transcribeFailed'));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleUpload = async () => {
    if (!consultation?.id) { setError('Create/select a session first.'); return; }
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    } catch (err) { console.error('Picker error:', err); return; }
    if (picked.canceled || !picked.assets?.[0]) {
      return;
    }
    const a = picked.assets[0];
    setError(null);
    setUploadProgress(0);
    setIsUploading(true);
    try {
      // Pass the picker's mimeType through untouched — including undefined.
      // Substituting "audio/*" here (as this did) buried the fact that the OS
      // gave us nothing, and sent a wildcard the speech service rejects.
      // sttMimeType() falls back to the file extension instead.
      const file: RNAudioFile = { uri: a.uri, name: a.name || 'audio', type: a.mimeType || '' };
      const result = await uploadConsultationAudio(file, {
        consultationId: consultation.id,
        language,
        onProgress: setUploadProgress,
      });
      // Upload finished; the server is now transcribing. Swapping the flags here
      // is what moves the UI from a progress bar to "Transcribing…", which is
      // the longer of the two phases for a real consultation.
      setIsUploading(false);
      setIsTranscribing(true);
      if (result.audioUrl) setAudioUrl(result.audioUrl);
      const text = (result.rawText || '').trim();
      if (!text) {
        setError(tt('consultation.noSpeech'));
        return;
      }
      recordTerminology(result);
      await appendTranscribedText(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : tt('consultation.uploadFailed');
      console.error('[upload] failed:', message);
      setError(message);
    } finally {
      setIsUploading(false);
      setIsTranscribing(false);
    }
  };

  // Auto-start record/upload when opened from the New Consultation sheet.
  useEffect(() => {
    if (didAuto.current || !consultation) return;
    didAuto.current = true;
    if (mode === 'record') setTimeout(() => { startRecording(); }, 500);
    else if (mode === 'upload') setTimeout(() => { handleUpload(); }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultation, mode]);

  const handleRemoveAudio = () => {
    if (!audioUrl) return;
    Alert.alert(tt('consultation.removeAudioTitle'), tt('consultation.removeAudioBody'), [
      { text: tt('common.cancel'), style: 'cancel' },
      { text: tt('common.remove'), style: 'destructive', onPress: async () => { await deleteConsultationAudio(audioUrl); setAudioUrl(''); } },
    ]);
  };

  const handleLanguageChange = async (newLang: string) => {
    setLanguage(newLang);
    setLangOpen(false);
    const source = originalTranscript.trim() || displayedTranscript.trim();
    if (!source) return;
    if (newLang === 'auto') { setDisplayedTranscript(source); return; }
    setError(null);
    setIsTranslating(true);
    try {
      const translated = await translateTranscript(source, newLang);
      setDisplayedTranscript(translated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to translate the transcript.');
    } finally {
      setIsTranslating(false);
    }
  };

  const runReportGeneration = async () => {
    const transcript = displayedTranscript.trim();
    if (!transcript || reportGenRef.current) return;
    reportGenRef.current = true;
    setIsGenerating(true);
    setProgress(null);
    setFailedStages([]);
    setError(null);
    setReportStatus('idle');
    setStep('report');
    // Collected here rather than in state so the final list is complete when the
    // report lands — a state update queued from the last event would not have
    // applied yet by the time we set the report.
    const failed: string[] = [];
    try {
      const report = await generateReportStreaming(transcript, i18n.language, (ev) => {
        setProgress(ev);
        if (ev.failed) failed.push(ev.stage);
      });
      setReportData(report);
      setFailedStages(failed);
      setReportStatus('generated');
    } catch (err) {
      setError(err instanceof Error ? err.message : tt('consultation.reportGenFailed'));
      setReportStatus('failed');
    } finally {
      setIsGenerating(false);
      setProgress(null);
      reportGenRef.current = false;
    }
  };

  const handleSave = async () => {
    if (!consultation) return;
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    const now = new Date().toISOString();
    const lines = transcriptToLines();
    const text = displayedTranscript.trim();
    const base = { id: consultation.id, patientId: consultation.patientId, patientName: consultation.patientName, date: consultation.date, createdAt: now };
    const consultationDoc = {
      ...consultation,
      status: 'Completed' as const,
      transcript: lines,
      transcriptText: text,
      originalTranscript: originalTranscript.trim(),
      audioUrl,
      durationSec,
      language,
      uncorrectedTranscript,
      terminologyCorrections,
      report: reportData,
      // Snapshot this saved report as a new version (no-op if unchanged).
      reportVersions: appendReportVersion(consultation.reportVersions, reportData, 'Doctor-reviewed report'),
      prescriptions: reportData.prescribedMedications,
      createdAt: consultation.createdAt || now,
      updatedAt: now,
    };
    try {
      await Promise.all([
        saveConsultation(consultationDoc as unknown as Consultation),
        saveReport({ ...base, report: reportData }),
        savePrescription({ ...base, prescribedMedications: reportData.prescribedMedications, advice: reportData.advice }),
        saveTranscript({ ...base, transcript: lines, transcriptText: text }),
      ]);
    } catch (err) {
      setError(tt('consultation.saveFailed'));
      return;
    }
    lastSavedSnapshot.current = contentSnapshot();
    setSessionStatus('Completed');
    updateSession(consultationDoc as unknown as Consultation);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    reload();
  };

  // Meta for every export/print path. Fields left undefined are omitted from
  // the document rather than printed as "N/A" — see patientInfoHtml().
  const exportMeta: ReportMeta = {
    patientName: consultation?.patientName,
    date: consultation?.date,
    doctorName: doctorName.trim() || undefined,
    patientAge: patient?.age || undefined,
    patientGender: patient?.gender || undefined,
    patientPhone: patient?.phone || undefined,
    patientId: consultation?.patientId || undefined,
    consultationDate: formatConsultDate(consultation),
    consultationTime: formatConsultTime(consultation),
    // `language` is the live selection on this screen; 'auto' means the doctor
    // never chose one, so the document says nothing rather than claiming a
    // language the transcription may not actually have used.
    transcriptionLanguage: language && language !== 'auto' ? languageLabel(language) : undefined,
    // "Since Last Visit" panel — the diff against this patient's previous
    // consultation. Built from the report as it stands on screen, so an export
    // taken mid-edit compares what the doctor is actually looking at.
    comparison: consultation ? buildComparisonMeta(consultation, consultations, reportData) : undefined,
  };
  const runExport = async (fn: () => Promise<void>) => {
    setExportOpen(false);
    try { await fn(); } catch { setError(tt('consultation.exportFailed')); }
  };

  if (!consultation) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={40} color={colors.slate300} />
        <Text className="text-slate-500 mt-3">{tt('consultation.sessionNotFound')}</Text>
        <View className="mt-4"><Button label={tt("consultation.goBack")} variant="secondary" onPress={() => router.back()} /></View>
      </SafeAreaView>
    );
  }

  // Immersive full-screen dark capture while recording (reference screen 4).
  if (isRecording) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LiveRecordingScreen
          patientName={consultation.patientName}
          timer={formatTimer(seconds)}
          isPaused={isPaused}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
        />
      </>
    );
  }


  const hasReport = reportStatus === 'generated' || !!consultation.report;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header — flat on the canvas, dark text, hairline divider. The two-tab
          switch below already shows the phase, so no separate progress bar. */}
      <View className="flex-row items-center gap-2.5 px-4 pt-3 pb-3 border-b border-slate-100">
        <IconButton icon="arrow-back" onPress={() => router.back()} bg="bg-white border border-slate-200" color={colors.slate700} accessibilityLabel={tt('common.back')} />
        <View className="flex-1">
          <Text className="text-[17px] font-bold text-slate-900 tracking-tight" numberOfLines={1}>{consultation.patientName}</Text>
          <Text className="text-xs text-slate-400">{consultation.date}</Text>
        </View>
        <View className={`rounded-full px-2.5 py-1 ${sessionStatus === 'Completed' ? 'bg-success-50' : 'bg-slate-100'}`}>
          <Text className={`text-[11px] font-semibold ${sessionStatus === 'Completed' ? 'text-success-700' : 'text-slate-600'}`}>{sessionStatus}</Text>
        </View>
        <IconButton icon="share-outline" onPress={() => setExportOpen(true)} bg="bg-white border border-slate-200" color={colors.slate700} accessibilityLabel={tt('common.share')} />
        <IconButton icon="ellipsis-vertical" onPress={() => setMenuOpen(true)} bg="bg-white border border-slate-200" color={colors.slate700} accessibilityLabel={tt('common.moreOptions')} />
      </View>

      {/* Step switch */}
      <View className="mx-4 my-3">
        <Tabs tabs={['Capture', 'Report']} active={step === 'capture' ? 'Capture' : 'Report'} onChange={(v) => setStep(v === 'Capture' ? 'capture' : 'report')} renderLabel={(v) => (v === 'Capture' ? tt('consultation.capture') : tt('consultation.report'))} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        {step === 'capture' ? (
          <CaptureStep
            insetsBottom={insets.bottom}
            error={error}
            onDismissError={() => setError(null)}
            audioUrl={audioUrl}
            onRemoveAudio={handleRemoveAudio}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            isTranscribing={isTranscribing}
            isTranslating={isTranslating}
            language={language}
            onOpenLang={() => setLangOpen(true)}
            displayedTranscript={displayedTranscript}
            setDisplayedTranscript={setDisplayedTranscript}
            isRecording={isRecording}
            isPaused={isPaused}
            liveText={live.liveText}
            interim={live.interim}
            timer={formatTimer(seconds)}
            onStart={startRecording}
            onStop={stopRecording}
            onPause={pauseRecording}
            onResume={resumeRecording}
            canGenerate={canGenerate}
            isGenerating={isGenerating}
            onGenerate={runReportGeneration}
          />
        ) : (
          <ReportStep
            insetsBottom={insets.bottom}
            error={error}
            onDismissError={() => setError(null)}
            isGenerating={isGenerating}
            progress={progress}
            failedStages={failedStages}
            reportStatus={reportStatus}
            reportData={reportData}
            onChangeReport={setReportData}
            doctorName={doctorName}
            setDoctorName={setDoctorName}
            saved={saved}
            onSave={handleSave}
            onPrint={() => runExport(() => printReport(reportData, exportMeta))}
            onExportPdf={() => runExport(() => exportReportPdf(reportData, exportMeta))}
            hasTranscript={hasTranscript}
            canGenerate={canGenerate}
            onGenerate={runReportGeneration}
            onView={() => router.push(`/report/${consultation.id}` as any)}
          />
        )}
      </KeyboardAvoidingView>

      {/* Header three-dot menu — houses the occasional actions (uploading a
          pre-recorded file) so the capture screen stays a single clear choice. */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View className="absolute right-3" style={{ top: insets.top + 52 }}>
            <View className="bg-surface rounded-2xl border border-slate-200 py-1.5 min-w-[220px]" style={shadow.lg}>
              <TouchableOpacity
                onPress={() => { setMenuOpen(false); handleUpload(); }}
                activeOpacity={0.7}
                className="flex-row items-center gap-3 px-4 py-3"
              >
                <View className="w-9 h-9 rounded-full bg-brand-50 items-center justify-center">
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-slate-800">{tt('consultation.uploadExisting')}</Text>
                  <Text className="text-[11.5px] text-slate-400 mt-0.5">{tt('consultation.uploadHelperFull')}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={langOpen} transparent animationType="fade" onRequestClose={() => setLangOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-center px-8" activeOpacity={1} onPress={() => setLangOpen(false)}>
          <View className="bg-surface rounded-2xl overflow-hidden">
            <Text className="text-sm font-bold text-slate-900 px-4 pt-4 pb-2">{tt('consultation.transcriptLanguage')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {LANGUAGES.map((l) => (
                <TouchableOpacity key={l.code} onPress={() => handleLanguageChange(l.code)} className={`px-4 py-3 border-t border-slate-50 ${language === l.code ? 'bg-blue-50' : ''}`}>
                  <Text className={`text-sm ${language === l.code ? 'text-blue-700 font-semibold' : 'text-slate-700'}`}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={exportOpen} transparent animationType="slide" onRequestClose={() => setExportOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-end" activeOpacity={1} onPress={() => setExportOpen(false)}>
          <View className="bg-surface rounded-t-3xl p-5 gap-1" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="items-center pb-2"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
            <Text className="text-lg font-bold text-slate-900 mb-1">{tt('consultation.downloadShare')}</Text>
            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{tt('consultation.tabTranscript')}</Text>
            <ExportRow icon="document-text-outline" label={`${tt('consultation.tabTranscript')} (.txt)`} disabled={!hasTranscript} onPress={() => runExport(() => exportTranscriptTxt(displayedTranscript, exportMeta))} />
            <ExportRow icon="document-outline" label={`${tt('consultation.tabTranscript')} (.pdf)`} disabled={!hasTranscript} onPress={() => runExport(() => exportTranscriptPdf(displayedTranscript, exportMeta))} />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2">{tt('consultation.tabReport')}</Text>
            <ExportRow icon="document-outline" label={`${tt('consultation.tabReport')} (.pdf)`} onPress={() => runExport(() => exportReportPdf(reportData, exportMeta))} />
            <ExportRow icon="document-attach-outline" label={`${tt('consultation.tabReport')} (.docx)`} onPress={() => runExport(() => exportReportDocx(reportData, exportMeta))} />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function ExportRow({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} className={`flex-row items-center gap-3 py-3 px-1 ${disabled ? 'opacity-40' : ''}`} activeOpacity={0.7}>
      <Ionicons name={icon} size={20} color={colors.slate600} />
      <Text className="text-slate-700 font-medium">{label}</Text>
    </TouchableOpacity>
  );
}

function highlightMatches(text: string, q: string) {
  if (!q) return <Text className="text-[15px] leading-6 text-slate-800">{text}</Text>;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  let from = 0;
  let idx = lower.indexOf(ql, from);
  let key = 0;
  while (idx !== -1) {
    if (idx > from) parts.push(<Text key={key++}>{text.slice(from, idx)}</Text>);
    parts.push(<Text key={key++} style={{ backgroundColor: '#fde68a' }}>{text.slice(idx, idx + q.length)}</Text>);
    from = idx + q.length;
    idx = lower.indexOf(ql, from);
  }
  parts.push(<Text key={key++}>{text.slice(from)}</Text>);
  return <Text className="text-[15px] leading-6 text-slate-800">{parts}</Text>;
}

function CaptureStep(props: any) {
  const { t: tt } = useTranslation();
  const {
    insetsBottom, error, onDismissError, audioUrl, onRemoveAudio, isUploading, uploadProgress,
    isTranscribing, isTranslating, language, onOpenLang, displayedTranscript, setDisplayedTranscript,
    isRecording, isPaused, liveText, interim, timer, onStart, onStop, onPause, onResume,
    canGenerate, isGenerating, onGenerate,
  } = props;

  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const liveScrollRef = useRef<ScrollView | null>(null);

  const showEmpty = !displayedTranscript.trim() && !isTranscribing && !isTranslating && !isUploading;
  const matchCount = search ? (displayedTranscript.toLowerCase().split(search.toLowerCase()).length - 1) : 0;

  const copy = async () => {
    await Clipboard.setStringAsync(displayedTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Live recording view (real-time transcript) ──────────────
  if (isRecording) {
    const committed = interim && liveText.endsWith(interim) ? liveText.slice(0, liveText.length - interim.length) : liveText;
    return (
      <View className="flex-1" style={{ paddingBottom: insetsBottom + 16 }}>
        {/* Status + timer + compact waveform */}
        <View className="items-center pt-2 pb-1">
          <View className={`px-3 py-1 rounded-full ${isPaused ? 'bg-amber-50' : 'bg-red-50'} mb-2`}>
            <View className="flex-row items-center gap-1.5">
              <View className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-red-500'}`} />
              <Text className={`text-xs font-bold uppercase tracking-widest ${isPaused ? 'text-amber-600' : 'text-red-600'}`}>
                {isPaused ? tt('consultation.paused') : tt('consultation.recording')}
              </Text>
            </View>
          </View>
          <Text className="text-4xl font-bold text-slate-900 tabular-nums tracking-tight">{timer}</Text>
          <View className="w-full px-6 mt-2"><Waveform active={isRecording} paused={isPaused} /></View>
        </View>

        {/* Live transcript panel (auto-scrolls; interim highlighted) */}
        <View className="flex-1 mx-4 mb-3 bg-surface border border-slate-200 rounded-2xl overflow-hidden">
          <View className="flex-row items-center gap-1.5 px-4 pt-3 pb-1">
            <Ionicons name="radio-outline" size={14} color={colors.brand} />
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">{tt('consultation.liveTranscript')}</Text>
          </View>
          <ScrollView
            ref={liveScrollRef}
            className="flex-1 px-4 pb-3"
            onContentSizeChange={() => liveScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {liveText.trim() ? (
              <Text className="text-[15px] leading-6 text-slate-800">
                {committed}
                {interim ? <Text className="text-blue-500">{committed ? ' ' : ''}{interim}</Text> : null}
              </Text>
            ) : (
              <Text className="text-sm text-slate-400 italic mt-2">{tt('consultation.listeningHint')}</Text>
            )}
          </ScrollView>
        </View>

        {/* Controls: Pause/Resume + Stop */}
        <View className="flex-row items-center justify-center gap-8">
          <TouchableOpacity onPress={isPaused ? onResume : onPause} activeOpacity={0.85} className="w-16 h-16 rounded-full items-center justify-center bg-surface border border-slate-200">
            <Ionicons name={isPaused ? 'play' : 'pause'} size={26} color={colors.slate700} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onStop} activeOpacity={0.85} className="w-20 h-20 rounded-full items-center justify-center bg-red-500">
            <Ionicons name="stop" size={32} color={colors.white} />
          </TouchableOpacity>
          <View className="w-16 h-16" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        {error ? <View className="mt-2"><ErrorBanner message={error} onDismiss={onDismissError} /></View> : null}

        {isUploading ? (
          <View className="bg-surface border border-slate-200 rounded-xl px-4 py-3 mt-3">
            <Text className="text-sm font-semibold text-slate-800">{uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : 'Transcribing'}</Text>
            <View className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <View className="h-full bg-blue-600" style={{ width: `${uploadProgress}%` }} />
            </View>
          </View>
        ) : null}

        {audioUrl ? <View className="mt-3"><AudioPlayer src={resolveMediaUrl(audioUrl)} onRemove={onRemoveAudio} /></View> : null}

        <View className="flex-row items-center justify-between mt-5 mb-2">
          <View className="flex-row items-center gap-2">
            <Ionicons name="document-text" size={18} color={colors.brand} />
            <Text className="font-bold text-slate-900">{tt('consultation.tabTranscript')}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {displayedTranscript.trim() ? (
              <TouchableOpacity onPress={copy} className="flex-row items-center gap-1 bg-slate-100 rounded-md px-2.5 py-1.5">
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.emerald600 : colors.slate600} />
                <Text className={`text-xs font-medium ${copied ? 'text-emerald-600' : 'text-slate-600'}`}>{copied ? tt('consultation.copied') : tt('consultation.copy')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onOpenLang} disabled={isTranscribing || isTranslating} className="flex-row items-center gap-1 bg-surface border border-slate-200 rounded-md px-2.5 py-1.5">
              <Ionicons name="language-outline" size={14} color={colors.slate500} />
              <Text className="text-xs font-medium text-slate-700">{languageLabel(language)}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.slate500} />
            </TouchableOpacity>
          </View>
        </View>

        {isTranslating ? (
          <View className="flex-row items-center gap-1.5 mb-2">
            <ActivityIndicator size="small" color={colors.brand} />
            <Text className="text-xs font-semibold text-blue-600">{tt('consultation.translatingTranscript')}</Text>
          </View>
        ) : null}

        {showEmpty ? (
          // One clear action: tap the mic to start recording. Uploading a
          // pre-recorded file is the exception, tucked into the header's
          // three-dot menu rather than competing here.
          <View className="items-center pt-12 pb-2">
            <TouchableOpacity
              onPress={onStart}
              activeOpacity={0.85}
              disabled={isTranscribing || isUploading}
              accessibilityRole="button"
              accessibilityLabel={tt('consultation.startRecording')}
            >
              <View
                className="w-28 h-28 rounded-full bg-error-500 items-center justify-center"
                style={{ shadowColor: '#EF4444', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}
              >
                <Ionicons name="mic" size={46} color={colors.white} />
              </View>
            </TouchableOpacity>
            <Text className="text-[20px] font-bold text-slate-900 tracking-tight mt-7">
              {tt('consultation.startTitle')}
            </Text>
            <Text className="text-[13.5px] text-slate-500 mt-1.5 text-center px-8">
              {tt('consultation.tapMicToStart')}
            </Text>
          </View>
        ) : (
          <>
            {displayedTranscript.trim() ? (
              <View className="flex-row items-center bg-surface border border-slate-200 rounded-lg px-3 mb-2">
                <Ionicons name="search" size={15} color={colors.slate400} />
                <TextInput value={search} onChangeText={setSearch} placeholder={tt("consultation.searchTranscript")} placeholderTextColor={colors.slate400} className="flex-1 py-2 px-2 text-sm text-slate-900" />
                {search ? <Text className="text-xs text-slate-400 mr-1">{matchCount} {matchCount === 1 ? tt('consultation.matchOne') : tt('consultation.matchMany')}</Text> : null}
                {search ? <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><Ionicons name="close-circle" size={15} color={colors.slate400} /></TouchableOpacity> : null}
              </View>
            ) : null}

            {search ? (
              <View className="bg-surface border border-slate-200 rounded-2xl p-4 min-h-[200px]">
                {highlightMatches(displayedTranscript, search)}
                <Text className="text-[11px] text-slate-400 mt-3">{tt('consultation.clearSearchHint')}</Text>
              </View>
            ) : (
              <TextInput
                value={displayedTranscript}
                onChangeText={setDisplayedTranscript}
                multiline
                textAlignVertical="top"
                placeholder={tt("consultation.transcriptPlaceholder")}
                placeholderTextColor={colors.slate400}
                className="bg-surface border border-slate-200 rounded-2xl p-4 text-[15px] leading-6 text-slate-800 min-h-[220px]"
              />
            )}
          </>
        )}

        {displayedTranscript.trim() && !search ? (
          <View className="mt-4">
            <Button label={isGenerating ? tt('consultation.generatingReport') : tt('consultation.reportButton')} icon="document-text-outline" onPress={onGenerate} disabled={!canGenerate} loading={isGenerating} size="lg" />
          </View>
        ) : null}
      </ScrollView>

      {/* Once a transcript exists, recording more is a single primary CTA.
          Uploading now lives in the header's three-dot menu, so no secondary
          link competes here. When empty, the tap-to-record mic above owns the
          decision, so this bar is hidden. */}
      {!isTranscribing && !isUploading && !showEmpty ? (
        <View className="absolute left-0 right-0 px-5" style={{ bottom: insetsBottom + 14 }}>
          <TouchableOpacity onPress={onStart} activeOpacity={0.9}>
            <View
              className="bg-brand-500 rounded-2xl py-3.5 flex-row items-center justify-center gap-2"
              style={{ shadowColor: '#111827', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}
            >
              <Ionicons name="mic" size={20} color={colors.white} />
              <Text className="text-white font-bold text-[15px]">{tt('consultation.startRecording')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {isTranscribing ? (
        <View className="absolute left-0 right-0 items-center" style={{ bottom: insetsBottom + 24 }}>
          <View className="flex-row items-center gap-2 bg-slate-900 px-4 py-3 rounded-full">
            <ActivityIndicator size="small" color={colors.white} />
            <Text className="text-white font-semibold text-sm">{tt('consultation.transcribing')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReportStep(props: any) {
  const { t: tt } = useTranslation();
  const {
    insetsBottom, error, onDismissError, isGenerating, progress, failedStages, reportStatus, reportData, onChangeReport,
    doctorName, setDoctorName, saved, onSave, onPrint, onExportPdf, hasTranscript, canGenerate, onGenerate,
    onView,
  } = props;

  if (isGenerating) {
    // The server reports each stage as it FINISHES, so `completed` is work already
    // done — the bar is a record of progress, not an estimate of it. Until the
    // first stage lands (and on a backend with no streaming route) `progress` is
    // null and this falls back to the original indeterminate copy.
    const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;
    return (
      <View className="flex-1 items-center justify-center px-8">
        <MicOrb size={72} active coreColors={gradients.brand as unknown as string[]} />
        <Text className="font-bold text-lg text-slate-900 mt-5">{tt('consultation.generating')}</Text>
        {progress ? (
          <View className="w-full items-center mt-2">
            <Text className="text-sm text-slate-500 text-center leading-5">
              {tt(`consultation.stage.${progress.stage}`, {
                // An unrecognised stage from a newer backend must not render the
                // raw key at a doctor, so fall back to the generic sentence.
                defaultValue: tt('consultation.analyzingBody'),
              })}
            </Text>
            <View
              className="h-1.5 w-full max-w-xs bg-slate-100 rounded-full overflow-hidden mt-4"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: pct }}
            >
              <View className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
            </View>
            <Text className="text-xs text-slate-400 mt-2">
              {tt('consultation.stageProgress', { completed: progress.completed, total: progress.total })}
            </Text>
          </View>
        ) : (
          <Text className="text-sm text-slate-500 mt-1.5 text-center leading-5">{tt('consultation.analyzingBody')}</Text>
        )}
      </View>
    );
  }

  const empty = reportStatus !== 'generated' && reportData.clinicalOverview === '' && reportData.prescribedMedications.length === 0 && !reportData.assessment.length;

  // Trailing space = the design's 48 plus whatever the device reserves, so the
  // last card clears the home indicator. CaptureStep already did this; this step
  // was the one place in the screen still using a flat number.
  return (
    <ScrollView
      className="flex-1 px-4"
      contentContainerStyle={{ paddingBottom: insetsBottom + 48 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {error ? <View className="mt-2"><ErrorBanner message={error} onDismiss={onDismissError} /></View> : null}

      {failedStages?.length ? (
        <View className="mt-2">
          <WarningBanner
            title={tt('consultation.sectionsMissingTitle')}
            message={tt('consultation.sectionsMissingBody', {
              sections: failedStages
                .map((s: string) => tt(`consultation.stageSection.${s}`, { defaultValue: s }))
                .join(', '),
            })}
          />
        </View>
      ) : null}

      {empty ? (
        <View className="items-center justify-center py-12">
          <View className="w-20 h-20 rounded-full bg-brand-50 items-center justify-center mb-4">
            <Ionicons name="clipboard-outline" size={34} color={colors.brand} />
          </View>
          <Text className="text-base font-bold text-slate-800 text-center">{tt('consultation.noReportTitle')}</Text>
          <Text className="text-sm text-slate-400 mt-1.5 text-center px-6 leading-5">{tt('consultation.noReportBody')}</Text>
          {hasTranscript ? <View className="mt-5 w-full px-6"><Button label={tt("consultation.generateAiReport")} icon="sparkles" onPress={onGenerate} disabled={!canGenerate} /></View> : null}
        </View>
      ) : (
        <>
          {/* Status row */}
          <View className="flex-row items-center justify-between mt-3 mb-3">
            {reportStatus === 'generated' ? (
              <View className="flex-row items-center gap-1.5 bg-success-50 px-2.5 py-1 rounded-full">
                <Ionicons name="checkmark-circle" size={14} color={colors.successDark} />
                <Text className="text-xs font-semibold text-success-700">{tt('consultation.aiReportReady')}</Text>
              </View>
            ) : reportStatus === 'failed' ? (
              <View className="flex-row items-center gap-1.5 bg-error-50 px-2.5 py-1 rounded-full">
                <Ionicons name="alert-circle" size={14} color={colors.errorDark} />
                <Text className="text-xs font-semibold text-error-600">{tt('consultation.reportFailedTitle')}</Text>
              </View>
            ) : <Text className="text-xs text-slate-400">{tt('consultation.editableReport')}</Text>}
            {saved ? (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="checkmark-circle" size={14} color={colors.successDark} />
                <Text className="text-xs font-semibold text-success-700">{tt('common.saved')}</Text>
              </View>
            ) : null}
          </View>

          <ReportEditor report={reportData} onChange={onChangeReport} />
          <View className="mt-6">
            <Text className="text-xs font-bold text-brand-700 uppercase tracking-wide border-b border-slate-100 pb-1 mb-2">{tt('consultation.doctorFinalReview')}</Text>
            <Field label={tt('consultation.doctorNameLabel')} value={doctorName} onChangeText={setDoctorName} placeholder={tt('consultation.doctorNamePlaceholder')} />
          </View>
          <View className="gap-2.5 mt-5">
            <Button label={tt('consultation.finalizeSave')} icon="checkmark-circle" onPress={onSave} size="lg" />
            <Button label={tt('consultation.openReportViewer')} icon="reader-outline" variant="accent" onPress={onView} />
            <View className="flex-row gap-2.5">
              <View className="flex-1"><Button label={tt('consultation.print')} icon="print-outline" variant="secondary" onPress={onPrint} /></View>
              <View className="flex-1"><Button label={tt('consultation.exportPdf')} icon="download-outline" variant="secondary" onPress={onExportPdf} /></View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
