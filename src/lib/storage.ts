import type { Offer, OfferStatus, OfferDetails } from "../types";
import { supabase, hasSupabaseConfig } from "./supabase";
import { hasApi, apiFetch, apiUrl } from "./api";

/**
 * Couche d'accès aux données.
 *
 * Trois implémentations derrière la même interface, choisies dans cet ordre :
 * - `apiStore` (backend maison Node + Postgres) si VITE_API_URL est défini,
 * - `supabaseStore` (collaboration temps réel) si les clés Supabase sont là,
 * - `localStore` (localStorage, zéro config) sinon.
 *
 * Les composants ne connaissent que `store` et ignorent l'implémentation.
 */
export interface OfferStore {
  getAll(): Promise<Offer[]>;
  add(offer: Offer): Promise<void>;
  update(offer: Offer): Promise<void>;
  remove(id: string): Promise<void>;
  /** S'abonne aux changements externes. Retourne une fonction de désinscription. */
  subscribe?(onChange: () => void): () => void;
}

// ---------- localStorage ----------

const KEY = "genial-coloc.offers";

function read(): Offer[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Offer[]) : [];
  } catch {
    return [];
  }
}

function write(offers: Offer[]): void {
  localStorage.setItem(KEY, JSON.stringify(offers));
}

export const localStore: OfferStore = {
  async getAll() {
    return read().sort((a, b) => b.createdAt - a.createdAt);
  },
  async add(offer) {
    const offers = read();
    offers.push(offer);
    write(offers);
  },
  async update(offer) {
    write(read().map((o) => (o.id === offer.id ? offer : o)));
  },
  async remove(id) {
    write(read().filter((o) => o.id !== id));
  },
};

// ---------- Supabase ----------

/** Ligne de la table `offers` (colonnes en snake_case). */
interface OfferRow {
  id: string;
  url: string | null;
  title: string;
  price: number;
  surface: number | null;
  rooms: number | null;
  location: string;
  lat: number;
  lng: number;
  transit_min: number | null;
  bike_min: number | null;
  added_by: string | null;
  notes: string | null;
  created_at: number;
  status?: string | null;
  interested_by?: string[] | null;
  details?: OfferDetails | null;
}

function toRow(o: Offer): OfferRow {
  return {
    id: o.id,
    url: o.url || null,
    title: o.title,
    price: o.price,
    surface: o.surface ?? null,
    rooms: o.rooms ?? null,
    location: o.location,
    lat: o.lat,
    lng: o.lng,
    transit_min: o.transitMin ?? null,
    bike_min: o.bikeMin ?? null,
    added_by: o.addedBy ?? null,
    notes: o.notes ?? null,
    created_at: o.createdAt,
    status: o.status ?? null,
    interested_by: o.interestedBy ?? null,
    details: o.details ?? null,
  };
}

/** Retire les colonnes optionnelles d'une ligne (repli si absentes en base). */
function withoutOptionalColumns(row: OfferRow): OfferRow {
  const clone = { ...row };
  delete clone.status;
  delete clone.interested_by;
  delete clone.details;
  return clone;
}

/** Vrai si l'erreur Supabase vient d'une colonne optionnelle absente. */
function missingOptionalColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || /status|interested|details/i.test(error.message ?? "");
}

function fromRow(r: OfferRow): Offer {
  return {
    id: r.id,
    url: r.url ?? "",
    title: r.title,
    price: r.price,
    surface: r.surface ?? undefined,
    rooms: r.rooms ?? undefined,
    location: r.location,
    lat: r.lat,
    lng: r.lng,
    transitMin: r.transit_min ?? undefined,
    bikeMin: r.bike_min ?? undefined,
    addedBy: r.added_by ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    status: (r.status as OfferStatus) ?? undefined,
    interestedBy: r.interested_by ?? undefined,
    details: r.details ?? undefined,
  };
}

export const supabaseStore: OfferStore = {
  async getAll() {
    const { data, error } = await supabase!
      .from("offers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as OfferRow[]).map(fromRow);
  },
  async add(offer) {
    const row = toRow(offer);
    let { error } = await supabase!.from("offers").insert(row);
    if (error && missingOptionalColumn(error)) {
      ({ error } = await supabase!.from("offers").insert(withoutOptionalColumns(row)));
    }
    if (error) throw error;
  },
  async update(offer) {
    const row = toRow(offer);
    let { error } = await supabase!.from("offers").update(row).eq("id", offer.id);
    if (error && missingOptionalColumn(error)) {
      ({ error } = await supabase!
        .from("offers")
        .update(withoutOptionalColumns(row))
        .eq("id", offer.id));
    }
    if (error) throw error;
  },
  async remove(id) {
    const { error } = await supabase!.from("offers").delete().eq("id", id);
    if (error) throw error;
  },
  subscribe(onChange) {
    const channel = supabase!
      .channel("offers-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers" },
        onChange
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  },
};

// ---------- Backend maison (Node + Postgres) ----------

/**
 * Store branché sur l'API auto-hébergée. Contrairement à Supabase, l'API
 * échange directement des objets `Offer` (le serveur les stocke en JSONB),
 * donc aucun mapping de colonnes n'est nécessaire.
 */
export const apiStore: OfferStore = {
  async getAll() {
    return apiFetch<Offer[]>("/offers");
  },
  async add(offer) {
    await apiFetch<void>("/offers", {
      method: "POST",
      body: JSON.stringify(offer),
    });
  },
  async update(offer) {
    await apiFetch<void>(`/offers/${encodeURIComponent(offer.id)}`, {
      method: "PUT",
      body: JSON.stringify(offer),
    });
  },
  async remove(id) {
    await apiFetch<void>(`/offers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  subscribe(onChange) {
    // Temps réel via Server-Sent Events : le serveur pousse un message à
    // chaque écriture. EventSource se reconnecte tout seul en cas de coupure.
    const source = new EventSource(apiUrl("/events"));
    source.onmessage = () => onChange();
    return () => source.close();
  },
};

/** Store actif : API maison, sinon Supabase, sinon localStorage. */
export const store: OfferStore = hasApi
  ? apiStore
  : hasSupabaseConfig
    ? supabaseStore
    : localStore;
