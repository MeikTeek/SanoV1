/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACTUAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
