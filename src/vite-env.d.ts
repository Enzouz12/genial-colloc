/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Stockage partagé (optionnel). Voir .env.example.
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // Backend maison auto-hébergé (Node + Postgres). Voir .env.example.
  readonly VITE_API_URL?: string;
  // Personnalisation au déploiement. Voir .env.example.
  readonly VITE_ROOMMATES?: string;
  readonly VITE_REFERENCE_NAME?: string;
  readonly VITE_REFERENCE_LAT?: string;
  readonly VITE_REFERENCE_LNG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
