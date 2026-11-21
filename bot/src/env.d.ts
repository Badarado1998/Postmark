// The shared app modules read import.meta.env.VITE_DEPLOYMENT; esbuild replaces it at build time.
interface ImportMetaEnv { readonly VITE_DEPLOYMENT?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
declare const window: unknown;
