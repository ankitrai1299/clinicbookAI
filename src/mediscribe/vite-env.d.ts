/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API in production (e.g. https://novascribe-api.onrender.com). Empty in dev (uses the Vite proxy). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
