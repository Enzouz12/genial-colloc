// Upload et accès aux médias (images/vidéos) d'une annonce.
//
// Deux backends derrière la même interface :
// - API maison (VITE_API_URL) : fichiers stockés sur le disque du VPS, servis
//   par le serveur Node via des URLs signées temporaires.
// - Supabase Storage : bucket PRIVÉ, URLs signées temporaires.
// En mode localStorage (aucun des deux), les médias sont indisponibles.

import type { OfferMedia } from "../types";
import { supabase } from "./supabase";
import { hasApi, apiUrl, apiFetch } from "./api";

/** Nom du bucket de stockage des médias d'annonces (Supabase, privé). */
export const MEDIA_BUCKET = "offer-media";

/** Limite par fichier (150 Mo) — seuil de découpe des vidéos côté client. */
export const MEDIA_FILE_LIMIT = 150 * 1024 * 1024;

/** Durée de validité des URLs signées, en secondes (1 h). */
const SIGNED_TTL = 3600;

/** Vrai si le stockage de médias est disponible (API maison ou Supabase). */
export const mediaAvailable = hasApi || Boolean(supabase);

function extOf(name: string, type: "image" | "video"): string {
  const fromName = name.includes(".") ? name.split(".").pop() : "";
  return (fromName || (type === "video" ? "mp4" : "jpg")).toLowerCase();
}

/** Téléverse un fichier (image ou vidéo) et renvoie sa référence média. */
export async function uploadMedia(offerId: string, file: File): Promise<OfferMedia> {
  const type: OfferMedia["type"] = file.type.startsWith("video") ? "video" : "image";
  return upload(offerId, file, type, file.name, file.type);
}

/** Téléverse un blob déjà préparé (vidéo compressée/segmentée). */
export async function uploadBlob(
  offerId: string,
  blob: Blob,
  type: OfferMedia["type"],
  name?: string
): Promise<OfferMedia> {
  const contentType = blob.type || (type === "video" ? "video/mp4" : "image/jpeg");
  return upload(offerId, blob, type, name, contentType);
}

/** Implémentation commune du téléversement, routée vers l'API ou Supabase. */
async function upload(
  offerId: string,
  data: Blob,
  type: OfferMedia["type"],
  name: string | undefined,
  contentType: string
): Promise<OfferMedia> {
  const ext = extOf(name ?? "", type);

  if (hasApi) {
    const form = new FormData();
    form.append("file", data, `${crypto.randomUUID()}.${ext}`);
    const res = await fetch(apiUrl(`/media/${encodeURIComponent(offerId)}`), {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload média → ${res.status}`);
    const { path } = (await res.json()) as { path: string };
    return { id: crypto.randomUUID(), path, type, name };
  }

  if (!supabase) throw new Error("Stockage indisponible");
  const path = `${offerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, data, { contentType, upsert: false });
  if (error) throw error;
  return { id: crypto.randomUUID(), path, type, name };
}

/** Génère une URL signée temporaire pour afficher un média. */
export async function signedUrl(path: string): Promise<string | null> {
  if (hasApi) {
    const { exp, sig } = await apiFetch<{ exp: number; sig: string }>(
      `/media/sign?path=${encodeURIComponent(path)}`
    );
    return apiUrl(`/media/${path}?exp=${exp}&sig=${sig}`);
  }
  if (!supabase) return null;
  const { data } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

/** Supprime des fichiers du stockage (best-effort). */
export async function deleteMedia(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (hasApi) {
    await apiFetch<void>("/media/delete", {
      method: "POST",
      body: JSON.stringify({ paths }),
    }).catch(() => {});
    return;
  }
  if (!supabase) return;
  await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}
