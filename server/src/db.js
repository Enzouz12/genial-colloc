// Accès PostgreSQL : pool de connexions + initialisation du schéma.
//
// Table volontairement simple : le serveur stocke l'objet Offer complet en
// JSONB (le front et le serveur partagent le même modèle), avec l'id et la
// date de création extraits pour le tri. Aucun mapping de colonnes à maintenir.

import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const SCHEMA = `
  create table if not exists offers (
    id         text primary key,
    created_at bigint not null,
    data       jsonb not null
  );
  create index if not exists offers_created_at_idx on offers (created_at desc);
`;

/**
 * Initialise le schéma, avec quelques tentatives : au démarrage de la stack
 * Docker, Postgres peut ne pas être encore prêt à accepter des connexions.
 */
export async function initDb(retries = 10, delayMs = 2000) {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(SCHEMA);
      console.log("[db] schéma prêt");
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      console.warn(
        `[db] connexion impossible (essai ${attempt}/${retries}) : ${err.message} — nouvel essai dans ${delayMs} ms`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
