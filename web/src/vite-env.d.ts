/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Set for the static build (GitHub Pages), which runs without the api.
  readonly VITE_STATIC?: string;
}
