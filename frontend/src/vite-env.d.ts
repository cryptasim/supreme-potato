/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute origin of the API (e.g. https://api.example.com). Defaults to same-origin. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
