import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageCircle, RefreshCw, AlertCircle, ShieldCheck, ClipboardCheck, ChevronDown } from 'lucide-react';

import {
  completeEmbeddedSignup,
  getChannelStatus,
  getEmbeddedConfig,
  provisionTemplates,
  registerNumber,
  syncTemplates,
  type ChannelStatus,
  type EmbeddedConfig,
} from '../api/whatsapp';
import { ApiError } from '../api/client';
import { isMobileApp } from '../mediscribe/utils/platform';

// Minimal typing for the Facebook JS SDK surface we use.
interface FBSdk {
  init: (params: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
  login: (
    cb: (resp: { authResponse?: { code?: string } | null; status?: string }) => void,
    opts: Record<string, unknown>
  ) => void;
}
type WinWithFB = Window & { FB?: FBSdk; fbAsyncInit?: () => void };

// Load the Facebook SDK once (shared across mounts).
//
// The previous version could hang forever: when the script tag already existed
// but window.FB had not initialised yet, it returned WITHOUT resolving — and
// because the promise is cached, every later call awaited that same dead
// promise. The Connect button then sat on "Opening WhatsApp…" with nothing to
// click and no error. So this settles on every path: FB already present, init
// callback, a poll for the script-exists-but-not-ready case, a script load
// error, and a timeout. On failure the cache is CLEARED so the next click can
// genuinely retry instead of re-awaiting the same failure.
const SDK_TIMEOUT_MS = 15000;
let fbSdkPromise: Promise<void> | null = null;

const loadFbSdk = (appId: string, version: string): Promise<void> => {
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise<void>((resolve, reject) => {
    const w = window as WinWithFB;
    let settled = false;
    let poll = 0;
    let timer = 0;

    const stop = () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
    };
    const done = () => {
      if (settled || !w.FB) return;
      settled = true;
      stop();
      try {
        w.FB.init({ appId, version, cookie: true, xfbml: false });
      } catch {
        /* a repeat init must never break the flow */
      }
      resolve();
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      stop();
      fbSdkPromise = null; // let the next click retry from scratch
      reject(new Error(message));
    };

    if (w.FB) {
      done(); // already loaded by an earlier mount
      return;
    }

    w.fbAsyncInit = done;
    // The case the old code dropped: the script is already in the DOM (an
    // earlier mount added it), so fbAsyncInit may have fired for someone else
    // and will never fire again for us.
    poll = window.setInterval(done, 200);
    timer = window.setTimeout(
      () => fail('WhatsApp connector took too long to load. Please check your connection and retry.'),
      SDK_TIMEOUT_MS
    );

    const id = 'facebook-jssdk';
    if (!document.getElementById(id)) {
      const js = document.createElement('script');
      js.id = id;
      js.src = 'https://connect.facebook.net/en_US/sdk.js';
      js.async = true;
      js.defer = true;
      js.crossOrigin = 'anonymous';
      js.onerror = () => fail('Could not load the WhatsApp connector (network or an ad blocker).');
      document.body.appendChild(js);
    }
  });

  return fbSdkPromise;
};

type UiState = 'loading' | 'not-configured' | 'disconnected' | 'connecting' | 'connected' | 'needs-reconnect' | 'error';

interface Props {
  // Called when a connection (or reconnection) succeeds — lets a parent (e.g. the
  // Welcome screen) advance the flow.
  onConnected?: () => void;
  compact?: boolean;
}

export default function ConnectWhatsApp({ onConnected, compact }: Props) {
  const [config, setConfig] = useState<EmbeddedConfig | null>(null);
  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const [ui, setUi] = useState<UiState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'activate' | 'templates' | null>(null);
  // Session info from the Embedded Signup popup (phone_number_id + waba_id).
  const sessionInfo = useRef<{ phoneNumberId?: string; wabaId?: string }>({});

  const deriveUi = useCallback((cfg: EmbeddedConfig | null, st: ChannelStatus | null): UiState => {
    if (cfg && !cfg.configured) return 'not-configured';
    if (st?.channel && st.channel.status === 'ACTIVE') return st.healthy === false ? 'needs-reconnect' : 'connected';
    return 'disconnected';
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([getEmbeddedConfig(), getChannelStatus()]);
      setConfig(cfg);
      setStatus(st);
      setUi(deriveUi(cfg, st));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load WhatsApp status');
      setUi('error');
    }
  }, [deriveUi]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Meta reviews templates asynchronously (minutes to ~24h) and the clinic can
  // only message outside the 24h reply window once they are approved. Poll while
  // anything is still pending so the card turns green on its own instead of
  // making the clinic guess when to reload.
  const templatesPending = Boolean(
    status?.channel && status.templates && !status.templates.ready && status.templates.rejected === 0
  );
  useEffect(() => {
    if (!templatesPending) return;
    const id = window.setInterval(() => {
      void syncTemplates()
        .then((templates) => setStatus((s) => (s ? { ...s, templates } : s)))
        .catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [templatesPending]);

  // Retry Cloud API activation — needed when the number still had to be verified
  // in Meta WhatsApp Manager at connect time.
  const handleActivate = useCallback(async () => {
    setBusy('activate');
    setError(null);
    try {
      const result = await registerNumber();
      if (!result.registered) setError(result.detail);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not activate the number.');
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  // Resubmit templates Meta rejected or that never made it through.
  const handleRetryTemplates = useCallback(async () => {
    setBusy('templates');
    setError(null);
    try {
      const templates = await provisionTemplates();
      setStatus((s) => (s ? { ...s, templates } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resubmit the message templates.');
    } finally {
      setBusy(null);
    }
  }, []);

  // Capture the Embedded Signup session info posted by the popup.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!/facebook\.com$/.test(new URL(event.origin).hostname) && !event.origin.includes('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && data?.data) {
          sessionInfo.current = {
            phoneNumberId: data.data.phone_number_id,
            wabaId: data.data.waba_id,
          };
        }
      } catch {
        /* non-JSON messages from other widgets — ignore */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Start loading the SDK as soon as the config arrives, not on click. Meta's
  // popup must open inside the click's own user-gesture; awaiting a script load
  // first hands the gesture back to the browser, which then blocks the window —
  // and a blocked popup looks exactly like "cancelled or incomplete".
  useEffect(() => {
    if (!config?.configured || !config.appId) return;
    void loadFbSdk(config.appId, config.graphVersion).catch(() => undefined);
  }, [config]);

  const launchLogin = useCallback(
    (fb: FBSdk) => {
      if (!config?.configId) return;
      fb.login(
        (resp) => {
          void (async () => {
            const code = resp?.authResponse?.code;
            const { phoneNumberId, wabaId } = sessionInfo.current;
            // Two very different failures used to share one message, which made
            // them impossible to tell apart from the screen. No code means the
            // person closed the popup — their move, and retrying works. A code
            // WITHOUT the number/account ids means Meta completed sign-in but
            // never posted the session info, which retrying will not fix: the
            // Embedded Signup configuration is missing its WhatsApp assets.
            if (!code) {
              console.warn('[ConnectWhatsApp] no auth code returned', { status: resp?.status });
              setError('Sign-in was cancelled before it finished. Please try again.');
              setUi(deriveUi(config, status));
              return;
            }
            if (!phoneNumberId || !wabaId) {
              console.error('[ConnectWhatsApp] auth code received but no session info from Meta', {
                phoneNumberId,
                wabaId,
              });
              setError(
                'Meta signed you in but did not return a WhatsApp number. This usually means the ' +
                  'Embedded Signup configuration is missing its WhatsApp Business Account or phone ' +
                  'number — your platform administrator needs to add them in the Meta app.'
              );
              setUi('error');
              return;
            }
            try {
              await completeEmbeddedSignup({ code, phoneNumberId, wabaId });
              await refresh();
              setUi('connected');
              onConnected?.();
            } catch (e) {
              // Surface the backend's friendly messages (incl. the cross-clinic 409).
              setError(e instanceof ApiError ? e.message : 'Could not finish connecting. Please try again.');
              setUi('error');
            }
          })();
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { feature: 'whatsapp_embedded_signup', sessionInfoVersion: 3 },
        }
      );
    },
    [config, status, deriveUi, refresh, onConnected]
  );

  const handleConnect = useCallback(async () => {
    if (!config?.configured || !config.appId || !config.configId) return;
    setError(null);
    sessionInfo.current = {};

    const w = window as WinWithFB;
    // Preloaded (the common case): open the popup synchronously, still inside
    // the click, so the browser lets it through.
    if (w.FB) {
      setUi('connecting');
      launchLogin(w.FB);
      return;
    }

    // Not ready yet — wait for it, then try. The popup may be blocked here, so
    // the message says what to do about it rather than blaming the connection.
    setUi('connecting');
    try {
      await loadFbSdk(config.appId, config.graphVersion);
      const fb = (window as WinWithFB).FB;
      if (!fb) throw new Error('WhatsApp connector failed to load. Please retry.');
      launchLogin(fb);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} If a popup was blocked, allow popups for this site and try again.`
          : 'Could not open the WhatsApp connector.'
      );
      setUi('error');
    }
  }, [config, launchLogin]);

  // Inside the phone app the Meta sign-in popup can't run — Facebook blocks OAuth
  // in embedded WebViews — so connecting must happen in the system browser. Ask
  // the native shell to open the dashboard there (it handles `openExternal`); the
  // clinic signs in and connects from a real browser, then returns to the app.
  const inMobileApp = isMobileApp();
  const openInBrowser = useCallback(() => {
    const url = `${window.location.origin}/?app=clinicbook`;
    const w = window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } };
    if (w.ReactNativeWebView) {
      w.ReactNativeWebView.postMessage(JSON.stringify({ type: 'openExternal', url }));
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }, []);

  // ---- render ----
  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className={`bg-white border border-slate-200 rounded-2xl ${compact ? 'p-5' : 'p-6'} text-left`}>{children}</div>
  );

  if (ui === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading WhatsApp status…
        </div>
      </Card>
    );
  }

  if (ui === 'not-configured') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display font-bold text-sm text-slate-900">WhatsApp connector not enabled yet</h3>
            <p className="text-xs text-slate-500 mt-1">
              The platform administrator needs to finish the Meta app setup. Please check back shortly.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (ui === 'connected' && status?.channel) {
    const ch = status.channel;
    const tpl = status.templates;
    // Two things must be true before a clinic can message patients on its own
    // number: Meta must have ACTIVATED it for Cloud API, and it must have
    // APPROVED the templates on this clinic's own Business Account. Either can
    // still be outstanding right after connecting, so both get their own line —
    // a half-provisioned number that looks "Connected" is how clinics end up
    // silently sending nothing.
    const liveReady = ch.registered && Boolean(tpl?.ready);
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          {liveReady ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
          )}
          <h3 className="font-display font-extrabold text-base text-slate-900">
            {liveReady ? 'WhatsApp Connected Successfully' : 'WhatsApp Connected — finishing setup'}
          </h3>
        </div>

        <dl className="space-y-2 text-sm">
          <Row label="Business" value={ch.verifiedName ?? (ch.businessId ? 'Verified business account' : 'Connected')} />
          <Row label="WhatsApp Number" value={ch.displayPhoneNumber ?? 'Active number'} />
          <Row label="Webhook" value={<span className="text-emerald-600 font-semibold">Active</span>} />
          <Row
            label="Number"
            value={
              ch.registered ? (
                <span className="text-emerald-600 font-semibold">Activated for messaging</span>
              ) : (
                <span className="text-amber-600 font-semibold">Not activated yet</span>
              )
            }
          />
          <Row
            label="Templates"
            value={
              tpl ? (
                <span
                  className={
                    tpl.ready
                      ? 'text-emerald-600 font-semibold'
                      : tpl.rejected > 0
                        ? 'text-rose-600 font-semibold'
                        : 'text-amber-600 font-semibold'
                  }
                >
                  {tpl.approved}/{tpl.total} approved
                  {tpl.rejected > 0 ? ` · ${tpl.rejected} need attention` : ''}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )
            }
          />
        </dl>

        {!ch.registered && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>
                Meta has not activated this number for messaging yet, so replies and reminders will not
                be delivered. If you just verified it in WhatsApp Manager, activate it here.
              </p>
              <button
                onClick={handleActivate}
                disabled={busy === 'activate'}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-semibold rounded-lg cursor-pointer"
              >
                {busy === 'activate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Activate number
              </button>
            </div>
          </div>
        )}

        {tpl && !tpl.ready && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
            <div>
              <p>
                {tpl.missing > 0
                  ? 'New message templates are available and have not been sent to Meta for approval yet. Submit them to use the messages they carry — everything already approved keeps working.'
                  : tpl.rejected > 0
                    ? 'Some message templates were not approved. Patients can still chat with you, but reminders and confirmations sent outside a 24-hour conversation need approved templates.'
                    : 'Meta is reviewing your message templates. This usually takes a few minutes and can take up to 24 hours — patients can already message you in the meantime.'}
              </p>
              {/* Also shown for MISSING, not just rejected. A template added
                  after this clinic connected has no row, so it is neither
                  pending nor rejected — and without this the banner sat there
                  claiming Meta was reviewing it, with no way to send it. */}
              {(tpl.rejected > 0 || tpl.missing > 0) && (
                <button
                  onClick={handleRetryTemplates}
                  disabled={busy === 'templates'}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white font-semibold rounded-lg cursor-pointer"
                >
                  {busy === 'templates' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {tpl.missing > 0 ? 'Submit templates' : 'Resubmit templates'}
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={inMobileApp ? openInBrowser : handleConnect}
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reconnect a different number
        </button>
      </Card>
    );
  }

  const reconnect = ui === 'needs-reconnect';
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle className="w-5 h-5 text-emerald-600" />
        <h3 className="font-display font-extrabold text-base text-slate-900">
          {reconnect ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
        </h3>
      </div>
      <p className="text-xs text-slate-500 mb-4 max-w-md">
        {reconnect
          ? 'Your WhatsApp connection needs to be refreshed. Reconnect to keep receiving and replying to patient messages.'
          : 'Connect your WhatsApp Business number so patients can book, reschedule, and get reminders — all inside WhatsApp.'}
      </p>

      {/* The three things that decide whether this works, shown BEFORE the popup.
          Meta owns everything inside it, so the only place we can prevent a
          failed attempt is here. In order of how often each one is the cause:
          an existing WhatsApp account on the number is fatal and invisible until
          verification fails; the phone-call option is easy to miss because SMS
          is the default; and a landline is what most clinics should use but few
          realise they can. */}
      {!reconnect && <PrepChecklist />}

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Shown BEFORE connecting on purpose. Meta hands us a long-lived access
          token the moment this succeeds; if the server has no encryption key it
          is stored in plaintext, and adding the key afterwards does not go back
          and encrypt it — the clinic would have to reconnect. */}
      {config?.tokenEncryption === false && (
        <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Secure token storage isn’t switched on for this server yet. Ask your platform administrator to
            set it up before connecting, so your WhatsApp access is stored encrypted.
          </span>
        </div>
      )}

      <button
        onClick={inMobileApp ? openInBrowser : handleConnect}
        disabled={!inMobileApp && ui === 'connecting'}
        className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl text-sm shadow-sm cursor-pointer"
      >
        {!inMobileApp && ui === 'connecting' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Opening WhatsApp…
          </>
        ) : (
          <>
            <MessageCircle className="w-4 h-4" />{' '}
            {inMobileApp ? 'Connect in Browser' : reconnect ? 'Reconnect WhatsApp' : 'Connect WhatsApp'}
          </>
        )}
      </button>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-3">
        <ShieldCheck className="w-3.5 h-3.5" />{' '}
        {inMobileApp
          ? 'Opens in your browser for secure Meta sign-in.'
          : 'Secure official Meta sign-in. We never see your password.'}
      </p>
    </Card>
  );
}

// Everything a clinic needs to get through Meta's popup first time. Collapsed by
// default so the card stays a single button for anyone who already knows.
function PrepChecklist() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left cursor-pointer hover:bg-slate-100/70"
      >
        <ClipboardCheck className="w-4 h-4 text-slate-500 shrink-0" />
        <span className="text-xs font-bold text-slate-700">Before you start — 3 things (2 min read)</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3 text-xs text-slate-600">
          <div>
            <p className="font-bold text-slate-800">1. You can use your reception landline</p>
            <p className="mt-0.5">
              It does not have to be a mobile, and it should not be anyone’s personal number. Any number
              your clinic already gives patients works — the one on your board or visiting card.
            </p>
          </div>

          <div>
            <p className="font-bold text-slate-800">2. Choose “verify by phone call”, not SMS</p>
            <p className="mt-0.5">
              A landline cannot receive an SMS, but it can take a call. Meta rings the number and reads out
              a 6-digit code — so have someone at the phone, ready to write it down. If the line answers
              with a menu (“press 1 for…”), point it at a desk phone first, or nobody will hear the code.
            </p>
          </div>

          <div>
            <p className="font-bold text-rose-700">3. The number must not already be on WhatsApp</p>
            <p className="mt-0.5">
              A number can be on the normal WhatsApp app <em>or</em> on WhatsApp Business API — never both.
              If it is already on WhatsApp, delete that account first (WhatsApp → Settings → Account →
              Delete my account). Skipping this is the most common reason verification fails.
            </p>
          </div>

          <p className="pt-1 border-t border-slate-200 text-slate-500">
            Takes about 10 minutes, once. After the code is accepted we set the number up for messaging and
            submit your message templates automatically — nothing else for you to do.
          </p>
        </div>
      )}
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between">
    <dt className="text-slate-400 text-xs uppercase font-bold tracking-wide">{label}</dt>
    <dd className="text-slate-800 font-medium">{value}</dd>
  </div>
);
