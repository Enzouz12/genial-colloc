// Backend maison de Génial Coloc.
//
// Fournit ce que Supabase apportait, en auto-hébergé :
//   - API REST des offres (CRUD)          → PostgreSQL
//   - temps réel (Server-Sent Events)     → diffusion à chaque écriture
//   - médias images/vidéos                → fichiers sur disque + URLs signées
//
// Le front (servi par nginx) tape sur ce serveur via /api (proxy nginx), donc
// même origine : pas de souci CORS en production. CORS reste permissif pour le
// dev (front Vite sur un autre port).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { pool, initDb } from "./db.js";

const PORT = Number(process.env.PORT || 3000);
const MEDIA_DIR = process.env.MEDIA_DIR || "/data/media";
/** Secret de signature des URLs médias. Aléatoire par défaut (régénéré au
 *  redémarrage : les URLs signées sont de toute façon recréées à la demande). */
const MEDIA_SECRET = process.env.MEDIA_SECRET || crypto.randomBytes(32).toString("hex");
/** Validité d'une URL signée (secondes). */
const SIGNED_TTL = 3600;
/** Taille max d'un fichier média téléversé (200 Mo, > limite de découpe front). */
const MAX_UPLOAD = 200 * 1024 * 1024;

/** Résout un chemin média relatif en chemin disque, en interdisant la
 *  traversée de répertoires (../). Renvoie null si le chemin est invalide. */
function resolveMediaPath(rel) {
  const full = path.resolve(MEDIA_DIR, rel);
  const root = path.resolve(MEDIA_DIR);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

function signPath(rel, exp) {
  return crypto.createHmac("sha256", MEDIA_SECRET).update(`${rel}:${exp}`).digest("hex");
}

/**
 * Construit l'application Express sur un pool PostgreSQL donné.
 * Le pool est paramétrable pour permettre les tests d'intégration.
 */
export function createApp(db = pool) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // CORS permissif (outil personnel, modèle d'accès déjà ouvert côté données).
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ---------- Temps réel (SSE) ----------

  /** @type {Set<import("express").Response>} */
  const sseClients = new Set();

  /** Notifie tous les clients connectés qu'une offre a changé. */
  const broadcast = () => {
    for (const res of sseClients) res.write(`data: change\n\n`);
  };

  app.get("/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();
    res.write(`retry: 5000\n\n`);
    sseClients.add(res);
    // Ping périodique pour garder la connexion ouverte à travers les proxys.
    const ping = setInterval(() => res.write(`: ping\n\n`), 25000);
    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
  });

  // ---------- Offres (CRUD) ----------

  app.get("/offers", async (_req, res, next) => {
    try {
      const { rows } = await db.query(
        "select data from offers order by created_at desc"
      );
      res.json(rows.map((r) => r.data));
    } catch (err) {
      next(err);
    }
  });

  app.post("/offers", async (req, res, next) => {
    try {
      const offer = req.body;
      if (!offer?.id) return res.status(400).json({ error: "id manquant" });
      await db.query(
        `insert into offers (id, created_at, data) values ($1, $2, $3)
         on conflict (id) do update set data = excluded.data, created_at = excluded.created_at`,
        [offer.id, offer.createdAt ?? Date.now(), offer]
      );
      broadcast();
      res.status(201).end();
    } catch (err) {
      next(err);
    }
  });

  app.put("/offers/:id", async (req, res, next) => {
    try {
      const offer = req.body;
      const { rowCount } = await db.query(
        "update offers set data = $2, created_at = $3 where id = $1",
        [req.params.id, offer, offer.createdAt ?? Date.now()]
      );
      if (rowCount === 0) return res.status(404).end();
      broadcast();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.delete("/offers/:id", async (req, res, next) => {
    try {
      await db.query("delete from offers where id = $1", [req.params.id]);
      broadcast();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // ---------- Médias ----------

  const upload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        const dir = path.join(MEDIA_DIR, req.params.offerId);
        fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
      },
      filename(_req, file, cb) {
        // Le front envoie déjà un nom unique (uuid.ext) comme originalname.
        const safe = path.basename(file.originalname).replace(/[^\w.\-]/g, "_");
        cb(null, safe || `${crypto.randomUUID()}.bin`);
      },
    }),
    limits: { fileSize: MAX_UPLOAD },
  });

  // NB : ces deux routes doivent précéder POST/GET "/media/:offerId…" pour ne
  // pas être capturées par le paramètre :offerId ("sign"/"delete").
  app.get("/media/sign", (req, res) => {
    const rel = String(req.query.path || "");
    if (!resolveMediaPath(rel)) return res.status(400).json({ error: "chemin invalide" });
    const exp = Math.floor(Date.now() / 1000) + SIGNED_TTL;
    res.json({ exp, sig: signPath(rel, exp) });
  });

  app.post("/media/delete", (req, res) => {
    const paths = Array.isArray(req.body?.paths) ? req.body.paths : [];
    for (const rel of paths) {
      const full = resolveMediaPath(String(rel));
      if (full) fs.rm(full, { force: true }, () => {});
    }
    res.status(204).end();
  });

  app.post("/media/:offerId", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "fichier manquant" });
    const rel = `${req.params.offerId}/${req.file.filename}`;
    res.status(201).json({ path: rel });
  });

  app.get("/media/:offerId/:file", (req, res) => {
    const rel = `${req.params.offerId}/${req.params.file}`;
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig || "");
    const expected = signPath(rel, exp);
    const ok =
      Number.isFinite(exp) &&
      exp > Date.now() / 1000 &&
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.status(403).end();

    const full = resolveMediaPath(rel);
    if (!full || !fs.existsSync(full)) return res.status(404).end();
    res.sendFile(full);
  });

  // ---------- Divers ----------

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error("[api]", err);
    res.status(500).json({ error: "erreur serveur" });
  });

  return app;
}

/** Démarrage réel (ignoré quand le module est importé par un test). */
async function main() {
  await initDb();
  createApp().listen(PORT, () => console.log(`[api] à l'écoute sur :${PORT}`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("[api] démarrage impossible :", err);
    process.exit(1);
  });
}
