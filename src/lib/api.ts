// Backend maison auto-hébergé (Node + Postgres), alternative à Supabase.
//
// Actif dès que VITE_API_URL est défini (ex. "/api" quand le front est servi
// par le même nginx que l'API, voir docker-compose.yml). Le front tape alors
// sur cette API HTTP plutôt que sur Supabase.

/** Base de l'API sans slash final (ex. "/api"), ou "" si non configurée. */
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Vrai si un backend maison est configuré. */
export const hasApi = Boolean(API_URL);

/** Construit une URL vers l'API. */
export function apiUrl(path: string): string {
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** fetch JSON avec gestion d'erreur homogène. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
