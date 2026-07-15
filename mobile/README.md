# NovaScribe AI — Mobile (Expo)

React Native (Expo Router + TypeScript + NativeWind) mobile client for the
existing NovaScribe AI app. It talks to the **same backend** as the web app —
same endpoints, payloads, responses and MongoDB. No backend changes.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Point the app at your backend. Either create a `.env` from `.env.example`:

   ```
   EXPO_PUBLIC_API_URL=https://your-backend-host
   ```

   …or set `API_BASE_URL_FALLBACK` in [`src/config.ts`](src/config.ts).
   (Connection status is shown on the Settings screen.)

3. Start:

   ```bash
   npx expo start
   ```

   Open in Expo Go, a dev build, or an emulator. Microphone permission is
   requested on first recording.

## How it maps to the web app

| Web | Mobile |
| --- | --- |
| `src/types.ts`, `src/utils/report.ts` | copied **verbatim** to `src/` |
| `src/services/api.ts` | ported (`EXPO_PUBLIC_API_URL`, RN `FormData`) |
| Web Speech / MediaRecorder → Whisper | `expo-audio` recording → same `/api/transcribe` |
| file upload | `expo-document-picker` |
| localStorage | `AsyncStorage` (settings only; data stays in Mongo) |
| jsPDF / docx / file-saver | `expo-print` (reuses `buildReportHtml`) + `docx` + `expo-file-system` + `expo-sharing` |

The AI report structure, section keys, editable fields and "hide empty
sections" rules are unchanged from the web app.

## Note on ES private class fields ("private properties are not supported")

Some bundled libraries (React Native core, reanimated, expo-router) ship ES
private class fields (`this.#field`) that older Hermes runtimes (e.g. Expo Go)
reject with *"private properties are not supported"*. This is handled in
[`babel.config.js`](babel.config.js) via the
`@babel/plugin-transform-private-methods` / `-class-properties` /
`-private-property-in-object` plugins, which strip the syntax from the whole
bundle (Metro runs Babel over `node_modules`). If you edit the Babel config,
restart Metro with a cleared cache so it takes effect:

```bash
npx expo start -c
```
