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
  generateReport,
  saveConsultation,
  saveReport,
  savePrescription,
  saveTranscript,
  deleteConsultationAudio,
  resolveMediaUrl,
  RNAudioFile,
} from '../../src/services/api';
import { createEmptyReport, normalizeReport } from '../../src/utils/report';
import { appendReportVersion } from '../../src/utils/reportVersions';
import { findPreviousVisit } from '../../src/utils/compareVisits';
import CompareVisit from '../../src/components/CompareVisit';
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
import { Button, Field, ErrorBanner, IconButton, Tabs, ProgressSteps, Card, Chip } from '../../src/components/ui';
import { colors, gradients, gradientProps } from '../../src/theme';
import { LinearGradient } from 'expo-linear-gradient';

type Step = 'capture' | 'report';

export default function ConsultationScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { consultations, updateSession, reload } = useAppData();

  const consultation = consultations.find((c) => c.id === id);

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

  const [audioUrl, setAudioUrl] = useState(consultation?.audioUrl || '');
  const [durationSec, setDurationSec] = useState(consultation?.durationSec || 0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reportStatus, setReportStatus] = useState<'idle' | 'generated' | 'failed'>(
    consultation?.report ? 'generated' : 'idle',
  );
  const [sessionStatus, setSessionStatus] = useState<Consultation['status']>(consultation?.status || 'Draft');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(consultation?.report ? 'report' : 'capture');
  const [exportOpen, setExportOpen] = useState(false);
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
  const appendTranscribedText = async (text: string) => {
    if (!text) return;
    if (isLikelyHallucination(text)) {
      setError('Transcription unclear. Please record again closer to the mic.');
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
      setError(tErr instanceof Error ? tErr.message : 'Failed to translate the transcript.');
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
      setError('Could not start recording. Check microphone permission and try again.');
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
      }
      setDurationSec((prev) => Math.max(prev, seconds));
      return;
    }
    // ── Fallback: expo-audio → Whisper ──
    const finalMs = recorderState.durationMillis;
    try { await recorder.stop(); setFbPaused(false); } catch (err) { console.error('Stop error:', err); }
    const uri = recorder.uri;
    console.log('[record] stopped (fallback)', { uri, durationMs: finalMs });
    if (!uri || finalMs < 700) {
      setError('Recording too short. Hold the phone close, speak, then tap stop.');
      return;
    }
    setDurationSec((prev) => prev + Math.round(finalMs / 1000));
    setIsTranscribing(true);
    setError(null);
    try {
      const file: RNAudioFile = { uri, name: 'consultation.m4a', type: 'audio/m4a' };
      const result = await transcribeAudio(file);
      await appendTranscribedText((result.rawText || '').trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transcribe the audio. Please try again.');
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
    if (picked.canceled || !picked.assets?.[0]) return;
    const a = picked.assets[0];
    setError(null);
    setUploadProgress(0);
    setIsUploading(true);
    try {
      const file: RNAudioFile = { uri: a.uri, name: a.name || 'audio', type: a.mimeType || 'audio/*' };
      const result = await uploadConsultationAudio(file, { consultationId: consultation.id, language, onProgress: setUploadProgress });
      setIsUploading(false);
      setIsTranscribing(true);
      if (result.audioUrl) setAudioUrl(result.audioUrl);
      const text = (result.rawText || '').trim();
      if (!text) { setError('No speech could be transcribed from this audio file.'); return; }
      await appendTranscribedText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload and transcribe the audio file.');
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
    Alert.alert('Remove audio', 'Remove this audio from the session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteConsultationAudio(audioUrl); setAudioUrl(''); } },
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
    setError(null);
    setReportStatus('idle');
    setStep('report');
    try {
      const report = await generateReport(transcript);
      setReportData(report);
      setReportStatus('generated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed. Please try again.');
      setReportStatus('failed');
    } finally {
      setIsGenerating(false);
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
      setError('Failed to save to the database. Please try again.');
      return;
    }
    lastSavedSnapshot.current = contentSnapshot();
    setSessionStatus('Completed');
    updateSession(consultationDoc as unknown as Consultation);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    reload();
  };

  const exportMeta = { patientName: consultation?.patientName, date: consultation?.date, doctorName: doctorName.trim() || undefined };
  const runExport = async (fn: () => Promise<void>) => {
    setExportOpen(false);
    try { await fn(); } catch (err) { setError('Export failed. Please try again.'); }
  };

  if (!consultation) {
    return (
      <SafeAreaView className="flex-1 bg-canvas items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={40} color={colors.slate300} />
        <Text className="text-slate-500 mt-3">Session not found.</Text>
        <View className="mt-4"><Button label="Go back" variant="secondary" onPress={() => router.back()} /></View>
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
          liveText={live.liveText}
          interim={live.interim}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
        />
      </>
    );
  }

  const previousVisit = findPreviousVisit(consultation, consultations);
  const previousReport = previousVisit?.report ? normalizeReport(previousVisit.report) : null;

  const hasReport = reportStatus === 'generated' || !!consultation.report;
  const progress = [
    { label: 'Record', done: hasTranscript },
    { label: 'Transcript', done: hasTranscript },
    { label: 'AI Report', done: hasReport, active: hasTranscript && !hasReport },
    { label: 'Review', done: sessionStatus === 'Completed', active: hasReport && sessionStatus !== 'Completed' },
  ];

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Gradient header */}
      <View className="overflow-hidden">
        <LinearGradient colors={gradients.brand as any} {...gradientProps.horizontal} className="absolute inset-0" />
        <View className="flex-row items-center gap-3 px-4 pt-3 pb-4">
          <IconButton icon="arrow-back" onPress={() => router.back()} bg="bg-white/20" color={colors.white} />
          <View className="flex-1">
            <Text className="text-base font-bold text-white" numberOfLines={1}>{consultation.patientName}</Text>
            <Text className="text-xs text-white/70">{consultation.date}</Text>
          </View>
          <View className="bg-white/20 rounded-full px-2.5 py-1">
            <Text className="text-[11px] font-semibold text-white">{sessionStatus}</Text>
          </View>
          <IconButton icon="share-outline" onPress={() => setExportOpen(true)} bg="bg-white/20" color={colors.white} />
        </View>
        {/* Progress steps on the gradient */}
        <View className="px-5 pb-4">
          <ProgressSteps steps={progress} />
        </View>
      </View>

      {/* Step switch */}
      <View className="mx-4 my-3">
        <Tabs tabs={['Capture', 'Report']} active={step === 'capture' ? 'Capture' : 'Report'} onChange={(t) => setStep(t === 'Capture' ? 'capture' : 'report')} />
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
            onUpload={handleUpload}
            canGenerate={canGenerate}
            isGenerating={isGenerating}
            onGenerate={runReportGeneration}
          />
        ) : (
          <ReportStep
            error={error}
            onDismissError={() => setError(null)}
            isGenerating={isGenerating}
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
            durationSec={durationSec}
            transcriptText={displayedTranscript}
            previousReport={previousReport}
            previousDate={previousVisit?.date}
            onView={() => router.push(`/report/${consultation.id}` as any)}
          />
        )}
      </KeyboardAvoidingView>

      <Modal visible={langOpen} transparent animationType="fade" onRequestClose={() => setLangOpen(false)}>
        <TouchableOpacity className="flex-1 bg-black/40 justify-center px-8" activeOpacity={1} onPress={() => setLangOpen(false)}>
          <View className="bg-white rounded-2xl overflow-hidden">
            <Text className="text-sm font-bold text-slate-900 px-4 pt-4 pb-2">Transcript language</Text>
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
          <View className="bg-white rounded-t-3xl p-5 gap-1" style={{ paddingBottom: insets.bottom + 16 }}>
            <View className="items-center pb-2"><View className="w-10 h-1.5 rounded-full bg-slate-200" /></View>
            <Text className="text-lg font-bold text-slate-900 mb-1">Download / Share</Text>
            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Transcript</Text>
            <ExportRow icon="document-text-outline" label="Transcript (.txt)" disabled={!hasTranscript} onPress={() => runExport(() => exportTranscriptTxt(displayedTranscript, exportMeta))} />
            <ExportRow icon="document-outline" label="Transcript (.pdf)" disabled={!hasTranscript} onPress={() => runExport(() => exportTranscriptPdf(displayedTranscript, exportMeta))} />
            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-2">Medical Report</Text>
            <ExportRow icon="document-outline" label="Report (.pdf)" onPress={() => runExport(() => exportReportPdf(reportData, exportMeta))} />
            <ExportRow icon="document-attach-outline" label="Report (.docx)" onPress={() => runExport(() => exportReportDocx(reportData, exportMeta))} />
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
  const {
    insetsBottom, error, onDismissError, audioUrl, onRemoveAudio, isUploading, uploadProgress,
    isTranscribing, isTranslating, language, onOpenLang, displayedTranscript, setDisplayedTranscript,
    isRecording, isPaused, liveText, interim, timer, onStart, onStop, onPause, onResume, onUpload,
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
                {isPaused ? 'Paused' : 'Recording'}
              </Text>
            </View>
          </View>
          <Text className="text-4xl font-bold text-slate-900 tabular-nums tracking-tight">{timer}</Text>
          <View className="w-full px-6 mt-2"><Waveform active={isRecording} paused={isPaused} /></View>
        </View>

        {/* Live transcript panel (auto-scrolls; interim highlighted) */}
        <View className="flex-1 mx-4 mb-3 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <View className="flex-row items-center gap-1.5 px-4 pt-3 pb-1">
            <Ionicons name="radio-outline" size={14} color={colors.brand} />
            <Text className="text-xs font-bold uppercase tracking-wide text-slate-400">Live Transcript</Text>
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
              <Text className="text-sm text-slate-400 italic mt-2">Listening… speak naturally and the transcript will appear here.</Text>
            )}
          </ScrollView>
        </View>

        {/* Controls: Pause/Resume + Stop */}
        <View className="flex-row items-center justify-center gap-8">
          <TouchableOpacity onPress={isPaused ? onResume : onPause} activeOpacity={0.85} className="w-16 h-16 rounded-full items-center justify-center bg-white border border-slate-200">
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
          <View className="bg-white border border-slate-200 rounded-xl px-4 py-3 mt-3">
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
            <Text className="font-bold text-slate-900">Transcript</Text>
          </View>
          <View className="flex-row items-center gap-2">
            {displayedTranscript.trim() ? (
              <TouchableOpacity onPress={copy} className="flex-row items-center gap-1 bg-slate-100 rounded-md px-2.5 py-1.5">
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? colors.emerald600 : colors.slate600} />
                <Text className={`text-xs font-medium ${copied ? 'text-emerald-600' : 'text-slate-600'}`}>{copied ? 'Copied' : 'Copy'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onOpenLang} disabled={isTranscribing || isTranslating} className="flex-row items-center gap-1 bg-white border border-slate-200 rounded-md px-2.5 py-1.5">
              <Ionicons name="language-outline" size={14} color={colors.slate500} />
              <Text className="text-xs font-medium text-slate-700">{languageLabel(language)}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.slate500} />
            </TouchableOpacity>
          </View>
        </View>

        {isTranslating ? (
          <View className="flex-row items-center gap-1.5 mb-2">
            <ActivityIndicator size="small" color={colors.brand} />
            <Text className="text-xs font-semibold text-blue-600">Translating transcript…</Text>
          </View>
        ) : null}

        {showEmpty ? (
          <View className="items-center justify-center py-16">
            <View className="w-16 h-16 rounded-full bg-slate-100 items-center justify-center mb-4">
              <Ionicons name="mic-outline" size={30} color={colors.slate400} />
            </View>
            <Text className="text-base font-semibold text-slate-700">Start the consultation</Text>
            <Text className="text-sm text-slate-400 mt-1.5 text-center px-6 leading-5">
              Tap the mic to transcribe live as you speak, or upload an audio file.
            </Text>
          </View>
        ) : (
          <>
            {displayedTranscript.trim() ? (
              <View className="flex-row items-center bg-white border border-slate-200 rounded-lg px-3 mb-2">
                <Ionicons name="search" size={15} color={colors.slate400} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search in transcript..." placeholderTextColor={colors.slate400} className="flex-1 py-2 px-2 text-sm text-slate-900" />
                {search ? <Text className="text-xs text-slate-400 mr-1">{matchCount} {matchCount === 1 ? 'match' : 'matches'}</Text> : null}
                {search ? <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><Ionicons name="close-circle" size={15} color={colors.slate400} /></TouchableOpacity> : null}
              </View>
            ) : null}

            {search ? (
              <View className="bg-white border border-slate-200 rounded-2xl p-4 min-h-[200px]">
                {highlightMatches(displayedTranscript, search)}
                <Text className="text-[11px] text-slate-400 mt-3">Clear search to edit the transcript.</Text>
              </View>
            ) : (
              <TextInput
                value={displayedTranscript}
                onChangeText={setDisplayedTranscript}
                multiline
                textAlignVertical="top"
                placeholder="Transcript will appear here. You can edit it before generating the report."
                placeholderTextColor={colors.slate400}
                className="bg-white border border-slate-200 rounded-2xl p-4 text-[15px] leading-6 text-slate-800 min-h-[220px]"
              />
            )}
          </>
        )}

        {displayedTranscript.trim() && !search ? (
          <View className="mt-4">
            <Button label={isGenerating ? 'Generating report…' : 'Report'} icon="document-text-outline" onPress={onGenerate} disabled={!canGenerate} loading={isGenerating} size="lg" />
          </View>
        ) : null}
      </ScrollView>

      {!isTranscribing && !isUploading ? (
        <View className="absolute left-0 right-0 items-center" style={{ bottom: insetsBottom + 16 }}>
          <View className="flex-row items-center gap-4 bg-white px-5 py-3.5 rounded-full border border-slate-100" style={{ shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <TouchableOpacity onPress={onStart} activeOpacity={0.85} className="w-16 h-16 rounded-full items-center justify-center bg-red-500">
              <Ionicons name="mic" size={28} color={colors.white} />
            </TouchableOpacity>
            <View className="w-px h-8 bg-slate-200" />
            <TouchableOpacity onPress={onUpload} activeOpacity={0.85} className="flex-row items-center gap-2 px-4 py-3 rounded-full bg-blue-600">
              <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
              <Text className="text-white font-semibold text-sm">Upload</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {isTranscribing ? (
        <View className="absolute left-0 right-0 items-center" style={{ bottom: insetsBottom + 24 }}>
          <View className="flex-row items-center gap-2 bg-slate-900 px-4 py-3 rounded-full">
            <ActivityIndicator size="small" color={colors.white} />
            <Text className="text-white font-semibold text-sm">Transcribing…</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const fmtClock = (sec?: number) => {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

// Short, chip-friendly detected conditions from the generated report.
const detectedConditions = (r: ReportData): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...(r.assessment || []), ...(r.chiefComplaint || [])]) {
    const t = (raw || '').split(/[,.;(]/)[0].trim();
    if (t && t.length <= 26 && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
    if (out.length >= 4) break;
  }
  return out;
};

function ReportStep(props: any) {
  const {
    error, onDismissError, isGenerating, reportStatus, reportData, onChangeReport,
    doctorName, setDoctorName, saved, onSave, onPrint, onExportPdf, hasTranscript, canGenerate, onGenerate,
    durationSec, transcriptText, onView, previousReport, previousDate,
  } = props;

  if (isGenerating) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <MicOrb size={72} active coreColors={gradients.brand as unknown as string[]} />
        <Text className="font-bold text-lg text-slate-900 mt-5">Generating report…</Text>
        <Text className="text-sm text-slate-500 mt-1.5 text-center leading-5">Analyzing the consultation and drafting the clinical report with medical coding.</Text>
      </View>
    );
  }

  const empty = reportStatus !== 'generated' && reportData.clinicalOverview === '' && reportData.prescribedMedications.length === 0 && !reportData.assessment.length;

  const words = (transcriptText || '').trim() ? (transcriptText || '').trim().split(/\s+/).length : 0;
  const vit = reportData.clinicalMeasurements || {};
  const vitals: { label: string; value: string }[] = [
    { label: 'BP', value: vit.bloodPressure },
    { label: 'Pulse', value: vit.pulse },
    { label: 'Temp', value: vit.temperature },
    { label: 'SpO₂', value: vit.spo2 },
  ].filter((v) => v.value && String(v.value).trim());
  const conditions = detectedConditions(reportData);
  const meds = (reportData.prescribedMedications || []).filter((m: any) => m?.medicine).slice(0, 4);
  const codeSystems = ['ICD-10', 'SNOMED CT', 'LOINC', 'RxNorm'];

  return (
    <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {error ? <View className="mt-2"><ErrorBanner message={error} onDismiss={onDismissError} /></View> : null}

      {empty ? (
        <View className="items-center justify-center py-12">
          <View className="w-20 h-20 rounded-full bg-brand-50 items-center justify-center mb-4">
            <Ionicons name="clipboard-outline" size={34} color={colors.brand} />
          </View>
          <Text className="text-base font-bold text-slate-800 text-center">No report yet</Text>
          <Text className="text-sm text-slate-400 mt-1.5 text-center px-6 leading-5">Record or upload audio on the Capture tab, then generate the clinical report.</Text>
          {hasTranscript ? <View className="mt-5 w-full px-6"><Button label="Generate AI Report" icon="sparkles" onPress={onGenerate} disabled={!canGenerate} /></View> : null}
        </View>
      ) : (
        <>
          {/* Status row */}
          <View className="flex-row items-center justify-between mt-3 mb-3">
            {reportStatus === 'generated' ? (
              <View className="flex-row items-center gap-1.5 bg-success-50 px-2.5 py-1 rounded-full">
                <Ionicons name="checkmark-circle" size={14} color={colors.successDark} />
                <Text className="text-xs font-semibold text-success-700">AI report ready</Text>
              </View>
            ) : reportStatus === 'failed' ? (
              <View className="flex-row items-center gap-1.5 bg-error-50 px-2.5 py-1 rounded-full">
                <Ionicons name="alert-circle" size={14} color={colors.errorDark} />
                <Text className="text-xs font-semibold text-error-600">Report failed</Text>
              </View>
            ) : <Text className="text-xs text-slate-400">Editable report</Text>}
            {saved ? (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="checkmark-circle" size={14} color={colors.successDark} />
                <Text className="text-xs font-semibold text-success-700">Saved</Text>
              </View>
            ) : null}
          </View>

          {/* Compare Previous Visit (mirrors the web app) */}
          {previousReport ? (
            <View className="mb-3">
              <CompareVisit current={reportData} previous={previousReport} previousDate={previousDate} />
            </View>
          ) : null}

          {/* Session progress metrics */}
          <Card className="flex-row p-4 mb-3" elevation="sm">
            {[
              { icon: 'time-outline' as const, label: 'Duration', value: fmtClock(durationSec) },
              { icon: 'text-outline' as const, label: 'Words', value: words ? words.toLocaleString() : '—' },
              { icon: 'documents-outline' as const, label: 'Medications', value: String((reportData.prescribedMedications || []).filter((m: any) => m?.medicine).length || 0) },
            ].map((m, i) => (
              <View key={m.label} className={`flex-1 items-center ${i < 2 ? 'border-r border-slate-100' : ''}`}>
                <Ionicons name={m.icon} size={16} color={colors.brand} />
                <Text className="text-lg font-bold text-slate-900 mt-1">{m.value}</Text>
                <Text className="text-[11px] font-medium text-slate-400">{m.label}</Text>
              </View>
            ))}
          </Card>

          {/* AI insights */}
          {(conditions.length > 0 || vitals.length > 0 || meds.length > 0) ? (
            <Card className="p-4 mb-3" elevation="sm">
              <View className="flex-row items-center gap-2 mb-3">
                <View className="w-7 h-7 rounded-lg bg-accent-50 items-center justify-center">
                  <Ionicons name="sparkles" size={15} color={colors.accent} />
                </View>
                <Text className="font-bold text-[15px] text-slate-900">AI Insights</Text>
                <View className="bg-accent-50 rounded-full px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-accent-600 uppercase tracking-wide">Beta</Text>
                </View>
              </View>

              {conditions.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Detected Conditions</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {conditions.map((c, i) => (
                      <Chip key={c} label={c} tone={(['brand', 'accent', 'success', 'warning'] as const)[i % 4]} icon="pulse" />
                    ))}
                  </View>
                </View>
              ) : null}

              {meds.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Medications</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {meds.map((m: any, i: number) => (
                      <Chip key={i} label={[m.medicine, m.strength].filter(Boolean).join(' ')} tone="neutral" icon="medkit-outline" />
                    ))}
                  </View>
                </View>
              ) : null}

              {vitals.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Vitals Mentioned</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {vitals.map((v) => (
                      <View key={v.label} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
                        <Text className="text-[10px] font-medium text-slate-400">{v.label}</Text>
                        <Text className="text-[13px] font-bold text-slate-800">{v.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View className="pt-1 border-t border-slate-100 mt-1">
                <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5 mt-2">Standardized Coding</Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {codeSystems.map((c) => (
                    <View key={c} className="flex-row items-center gap-1 bg-brand-50 rounded-lg px-2 py-1">
                      <Ionicons name="shield-checkmark" size={11} color={colors.brand} />
                      <Text className="text-[11px] font-semibold text-brand-700">{c}</Text>
                    </View>
                  ))}
                </View>
                <Text className="text-[11px] text-slate-400 mt-2 leading-4">Cross-referenced against clinical terminologies during report generation.</Text>
              </View>
            </Card>
          ) : null}

          <ReportEditor report={reportData} onChange={onChangeReport} />
          <View className="mt-6">
            <Text className="text-xs font-bold text-brand-700 uppercase tracking-wide border-b border-slate-100 pb-1 mb-2">Doctor Final Review</Text>
            <Field label="Doctor name" value={doctorName} onChangeText={setDoctorName} placeholder="Dr. Full Name" />
          </View>
          <View className="gap-2.5 mt-5">
            <Button label="Finalize & Save Report" icon="checkmark-circle" onPress={onSave} size="lg" />
            <Button label="Open Report Viewer" icon="reader-outline" variant="accent" onPress={onView} />
            <View className="flex-row gap-2.5">
              <View className="flex-1"><Button label="Print" icon="print-outline" variant="secondary" onPress={onPrint} /></View>
              <View className="flex-1"><Button label="Export PDF" icon="download-outline" variant="secondary" onPress={onExportPdf} /></View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
