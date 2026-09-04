# Backend maison

Serveur auto-hébergé qui remplace Supabase pour un déploiement sur VPS. Express et PostgreSQL, sans étape de build (JavaScript ESM).

## Rôle

- Offres : API REST sur PostgreSQL. Chaque offre est stockée en JSONB, avec le même modèle que le front, donc sans mapping de colonnes.
- Temps réel : un flux Server-Sent Events (`/events`) prévient le front à chaque écriture.
- Médias : images et vidéos stockées sur disque (`MEDIA_DIR`), servies via des URLs signées temporaires (HMAC, 1 h), avec un garde-fou contre la traversée de répertoire.

## Endpoints

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/offers` | liste des offres |
| POST | `/offers` | créer ou remplacer une offre (upsert par `id`) |
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
| `DATABASE_URL` | connexion PostgreSQL | requis |
| `MEDIA_DIR` | dossier de stockage des médias | `/data/media` |
| `MEDIA_SECRET` | secret de signature des URLs médias | aléatoire au démarrage |
| `PORT` | port d'écoute | `3000` |

## Lancement

En production, le `docker compose` à la racine du dépôt orchestre ce serveur avec Postgres et le front. En local, contre une base existante :

```
npm ci
DATABASE_URL=postgres://user:pass@localhost:5432/coloc MEDIA_DIR=./media npm start
```

Le schéma est créé au démarrage, avec quelques tentatives le temps que PostgreSQL soit prêt.
