// Constantes métier de Génial Coloc.
import type { Offer, OfferStatus, OfferReview } from "./types";

/**
 * Lit une variable d'environnement Vite (préfixe VITE_), avec repli si elle
 * est absente ou vide. Permet de configurer l'app au déploiement sans toucher
 * au code (voir .env.example). Les valeurs sont figées au build.
 */
function envStr(v: string | undefined, fallback: string): string {
  return v != null && v.trim() !== "" ? v.trim() : fallback;
}

function envNum(v: string | undefined, fallback: number): number {
  const n = v != null && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function envList(v: string | undefined, fallback: string[]): string[] {
  if (v == null) return fallback;
  const items = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

/**
 * Point de référence de l'outil : le lieu vers lequel les temps de trajet sont
 * calculés (par défaut Université Lyon 2 — Campus Porte des Alpes, Bron).
 * Configurable au déploiement via VITE_REFERENCE_NAME / _LAT / _LNG.
 */
export const CAMPUS = {
  name: envStr(import.meta.env.VITE_REFERENCE_NAME, "Lyon 2 — Campus Porte des Alpes"),
  lat: envNum(import.meta.env.VITE_REFERENCE_LAT, 45.722593),
  lng: envNum(import.meta.env.VITE_REFERENCE_LNG, 4.915127),
} as const;

/** Centre de carte par défaut (Lyon). */
export const LYON_CENTER = { lat: 45.764, lng: 4.8357 } as const;

/**
 * Bornes de budget pour le dégradé de couleur.
 * En dessous de GREEN → vert vif (très avantageux).
 * Au-dessus de RED → rouge (au plafond / trop cher).
 */
export const BUDGET = {
  green: 700,
  red: 1100,
} as const;

/**
 * Bornes du prix au m² (loyer / surface) pour la vue qualité-prix.
 * Vert = avantageux, rouge = cher au m². Calé sur le marché lyonnais.
 */
export const VALUE = {
  green: 8,
  red: 18,
} as const;

/**
 * Estimation du temps de trajet jusqu'au campus à partir de la distance
 * à vol d'oiseau, puis classement par paliers.
 */
export const COMMUTE = {
  /** Vitesse effective moyenne en km/h appliquée à la distance estimée. */
  averageSpeedKmh: 14,
  /** Facteur de détour : le trajet réel est plus long que la ligne droite. */
  detourFactor: 1.35,
  /** Paliers de temps de trajet TCL, en minutes. Calés sur les temps réels
   *  vers le campus de Bron (≈ 24–51 min depuis l'agglo lyonnaise). */
  thresholds: [20, 30, 40, 50],
  /** Paliers de temps de trajet à vélo, en minutes. Au-delà de ~45 min de
   *  vélo le trajet quotidien n'est plus réaliste → borne haute à 45. */
  bikeThresholds: [15, 25, 35, 45],
} as const;

/**
 * Noms des colocataires (pour le champ "ajouté par" et le handshake d'intérêt).
 * Configurable au déploiement via VITE_ROOMMATES (liste séparée par des virgules,
 * ex. "Angelo,Nathalie"). Deux noms attendus, mais la liste peut en contenir plus.
 */
export const ROOMMATES: readonly string[] = envList(
  import.meta.env.VITE_ROOMMATES,
  ["Enzo", "Esteban"],
);

/** Statuts de suivi d'une offre, avec libellé et couleur. */
export const STATUSES: { id: OfferStatus; label: string; color: string }[] = [
  { id: "new", label: "Nouvelle", color: "#9aa0aa" },
  { id: "to_call", label: "À appeler", color: "#f59e0b" },
  { id: "pending", label: "En attente", color: "#14b8a6" },
  { id: "to_visit", label: "À visiter", color: "#3b82f6" },
  { id: "visited", label: "Visitée", color: "#a855f7" },
  { id: "reviewing", label: "En examen", color: "#6366f1" },
  { id: "favorite", label: "Favori", color: "#22c55e" },
  { id: "rejected", label: "Écartée", color: "#ef4444" },
];

/** Couleur d'un statut (gris par défaut). */
export function statusColor(status: OfferStatus | undefined): string {
  return STATUSES.find((s) => s.id === (status ?? "new"))?.color ?? "#9aa0aa";
}

/** Moyenne des notes d'avis (0-10), ou null si aucun avis. */
export function averageScore(reviews: OfferReview[] | undefined): number | null {
  if (!reviews || reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
}

/** Formate une note (1 décimale max, virgule française, sans « ,0 »). */
export function formatScore(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

/** Couleur d'une note 0-10 : vert (bon), ambre (moyen), rouge (faible). */
export function scoreColor(score: number): string {
  if (score >= 7) return "#22c55e";
  if (score >= 4) return "#f59e0b";
  return "#ef4444";
}

/**
 * Handshake : bascule l'intérêt de `me` pour une offre. Quand les deux
 * colocataires ont validé, l'offre passe en « à appeler » — mais seulement si
 * elle était encore « nouvelle » (on n'écrase pas un statut posé à la main).
 * On ne rétrograde jamais si un intérêt est ensuite retiré.
 */
export function applyInterest(offer: Offer, me: string): Offer {
  const set = new Set(offer.interestedBy ?? []);
  if (set.has(me)) set.delete(me);
  else set.add(me);
  const allIn = ROOMMATES.every((r) => set.has(r));
  const status: OfferStatus =
    allIn && (offer.status ?? "new") === "new" ? "to_call" : offer.status ?? "new";
  return { ...offer, interestedBy: [...set], status };
}
