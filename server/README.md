# Backend maison — Génial Coloc

Serveur auto-hébergé qui remplace Supabase pour un déploiement 100 % sur VPS.
Express + PostgreSQL, sans build (JavaScript ESM natif).

## Rôle

- **Offres** — API REST (CRUD) sur PostgreSQL. Chaque offre est stockée telle
  quelle en JSONB (même modèle que le front), donc aucun mapping de colonnes.
- **Temps réel** — endpoint Server-Sent Events (`/events`) : le serveur pousse
  un message à chaque écriture, le front recharge la liste.
- **Médias** — upload d'images/vidéos stockées sur disque (`MEDIA_DIR`), servies
  via des URLs signées temporaires (HMAC, 1 h), avec garde-fou anti-traversée.

## Endpoints

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/offers` | liste des offres (triées par date) |
| POST | `/offers` | créer/remplacer une offre (upsert par `id`) |
| PUT | `/offers/:id` | mettre à jour une offre |
| DELETE | `/offers/:id` | supprimer une offre |
| GET | `/events` | flux SSE des changements |
| POST | `/media/:offerId` | téléverser un fichier (multipart, champ `file`) |
| GET | `/media/sign?path=` | obtenir `{ exp, sig }` pour une URL signée |
| GET | `/media/:offerId/:file` | lire un média (avec `?exp=&sig=`) |
| POST | `/media/delete` | supprimer des fichiers (`{ paths: [] }`) |
| GET | `/health` | sonde de vie |

## Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `DATABASE_URL` | connexion PostgreSQL | — (requis) |
| `MEDIA_DIR` | répertoire de stockage des médias | `/data/media` |
| `MEDIA_SECRET` | secret de signature des URLs médias | aléatoire au démarrage |
| `PORT` | port d'écoute | `3000` |

## Lancement

En production, c'est `docker compose` à la racine du dépôt qui orchestre ce
serveur avec Postgres et le front. En local, contre une base existante :

```
npm ci
DATABASE_URL=postgres://user:pass@localhost:5432/coloc MEDIA_DIR=./media npm start
```

Le schéma est créé automatiquement au démarrage (avec quelques tentatives, le
temps que PostgreSQL soit prêt).
