import { useCallback, useRef, useState } from 'react';

// ── Optional native module ───────────────────────────────────
// expo-speech-recognition is a NATIVE module: it only exists in a development
// build, NOT in Expo Go. Importing it in Expo Go throws "Cannot find native
// module 'ExpoSpeechRecognition'" at load time and crashes the whole bundle.
// We therefore load it defensively and degrade gracefully — when it's absent the
// app still runs and recording falls back to the Whisper (record → stop) path.
let SpeechModule: any = null;
let useSpeechEventReal: ((name: string, handler: (e: any) => void) => void) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-speech-recognition');
  SpeechModule = mod?.ExpoSpeechRecognitionModule ?? null;
  useSpeechEventReal = mod?.useSpeechRecognitionEvent ?? null;
} catch {
  SpeechModule = null;
  useSpeechEventReal = null;
}

/** True only in a dev/production build where the native module is present. */
export const LIVE_STT_AVAILABLE = !!SpeechModule && !!useSpeechEventReal;

// Stable event-subscription function whether or not the native module exists, so
// the component's hook order never changes for a given runtime.
const useSpeechEvent: (name: string, handler: (e: any) => void) => void =
  useSpeechEventReal ?? (() => {});

// Language code → BCP-47 recognition locale (mirrors the web app's
// RECOGNITION_LANG). "auto" uses Indian English for English/Hindi code-mixing.
const LOCALES: Record<string, string> = {
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
};

export interface LiveTranscription {
  liveText: string;
  interim: string;
  isListening: boolean;
  isPaused: boolean;
  error: string | null;
  available: boolean;
  start: (langCode: string, baseText: string) => void;
  pause: () => void;
  resume: (baseText: string) => void;
  stop: () => Promise<string>;
  clearError: () => void;
}

// On-device live speech-to-text (the native equivalent of the web app's Web
// Speech API). Finalized phrases are committed so the recognizer's internal
// restarts never lose/duplicate words; the interim tail shows live.
export function useLiveTranscription(): LiveTranscription {
  const [liveText, setLiveText] = useState('');
  const [interim, setInterimState] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const committedRef = useRef('');
  const shouldListenRef = useRef(false);
  const pendingStopRef = useRef(false);
  const langRef = useRef('en-IN');
  const stopResolveRef = useRef<((text: string) => void) | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const render = useCallback((interimText: string) => {
    const c = committedRef.current;
    setInterimState(interimText);
    setLiveText(interimText ? (c ? `${c} ${interimText}` : interimText) : c);
  }, []);

  const begin = useCallback(() => {
    if (!SpeechModule) return;
    try {
      SpeechModule.start({
        lang: langRef.current,
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
      });
    } catch {
      // start() can throw if called too soon after stop — 'end' retries.
    }
  }, []);

  useSpeechEvent('result', (event: any) => {
    const text = event?.results?.[0]?.transcript ?? '';
    if (event?.isFinal) {
      const clean = text.trim();
      if (clean) {
        committedRef.current = (committedRef.current ? `${committedRef.current} ${clean}` : clean).trim();
      }
      render('');
    } else {
      render(text.trim());
    }
  });

  useSpeechEvent('end', () => {
    if (shouldListenRef.current) {
      begin();
      return;
    }
    setIsListening(false);
    if (pendingStopRef.current) {
      pendingStopRef.current = false;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopResolveRef.current?.(committedRef.current.trim());
      stopResolveRef.current = null;
    }
  });

  useSpeechEvent('error', (event: any) => {
    const code = event?.error;
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      shouldListenRef.current = false;
      setIsListening(false);
      setError('Speech recognition permission is required. Enable it in settings and try again.');
    }
  });

  const start = useCallback((langCode: string, baseText: string) => {
    if (!SpeechModule) return;
    langRef.current = LOCALES[langCode] || 'en-IN';
    committedRef.current = baseText.trim();
    shouldListenRef.current = true;
    pendingStopRef.current = false;
    setError(null);
    setIsPaused(false);
    setIsListening(true);
    render('');
    begin();
  }, [begin, render]);

  const pause = useCallback(() => {
    if (!SpeechModule) return;
    shouldListenRef.current = false;
    setIsPaused(true);
    try { SpeechModule.stop(); } catch {}
    render('');
  }, [render]);

  const resume = useCallback((baseText: string) => {
    if (!SpeechModule) return;
    committedRef.current = baseText.trim();
    shouldListenRef.current = true;
    setError(null);
    setIsPaused(false);
    setIsListening(true);
    begin();
  }, [begin]);

  const stop = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      shouldListenRef.current = false;
      if (!SpeechModule) {
        setIsListening(false);
        resolve(committedRef.current.trim());
        return;
      }
      pendingStopRef.current = true;
      stopResolveRef.current = resolve;
      setIsPaused(false);
      try {
        SpeechModule.stop();
      } catch {
        pendingStopRef.current = false;
        setIsListening(false);
        resolve(committedRef.current.trim());
        return;
      }
      stopTimerRef.current = setTimeout(() => {
        if (pendingStopRef.current) {
          pendingStopRef.current = false;
          setIsListening(false);
          stopResolveRef.current?.(committedRef.current.trim());
          stopResolveRef.current = null;
        }
      }, 4000);
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    liveText,
    interim,
    isListening,
    isPaused,
    error,
    available: LIVE_STT_AVAILABLE,
    start,
    pause,
    resume,
    stop,
    clearError,
  };
}

// Whether on-device live recognition can be used (native module present +
// available + permission granted). Returns false in Expo Go so the caller falls
// back to the Whisper record→transcribe path.
export async function ensureLiveRecognition(): Promise<boolean> {
  if (!LIVE_STT_AVAILABLE || !SpeechModule) return false;
  try {
    const available = SpeechModule.isRecognitionAvailable();
    if (!available) return false;
    const perm = await SpeechModule.requestPermissionsAsync();
    return !!perm.granted;
  } catch {
    return false;
  }
}
