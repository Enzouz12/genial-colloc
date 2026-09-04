# Génial Coloc

Application web de comparaison d'annonces de location pour une recherche de colocation à Lyon. Les annonces sont affichées sur une carte interactive, colorées selon plusieurs critères, avec le temps de trajet réel jusqu'à l'Université Lyon 2 Campus Porte des Alpes. Le projet inclut une extension navigateur pour importer les annonces SeLoger et un stockage partagé en temps réel.

## Fonctionnalités

- Carte interactive Leaflet avec cinq vues de coloration des marqueurs :
  - loyer mensuel
  - temps de trajet en TCL le matin
  - temps de trajet à vélo
  - prix au m²
  - vue mixte : loyer à l'intérieur, trajet TCL en contour
- Temps de trajet réels jusqu'au campus, en TCL et à vélo, via Transitous, avec repli sur une estimation par distance si le service est indisponible
- Légende flottante qui s'adapte à la vue active
- Géocodage des adresses via la Base Adresse Nationale, restreint à l'agglomération lyonnaise
- Pointage d'une adresse au clic sur la carte par géocodage inverse
- Édition d'une offre enregistrée : sélectionner un marqueur ou une offre la charge dans le formulaire, un clic sur le fond de carte revient en mode ajout
- Saisie assistée : coller un lien SeLoger pré-remplit la zone et le type, coller le texte de l'annonce ajoute le loyer et la surface
- Extension navigateur Firefox et Chrome pour importer une annonce SeLoger en un clic
- Statut de suivi par offre (à visiter, visitée, favori, écartée) avec liseré coloré
- Filtres carte et liste par statut, loyer maximum et temps de trajet maximum
- Stockage partagé en temps réel via Supabase, ou stockage local du navigateur sans configuration
- Attribution de chaque annonce à un colocataire

## Stack

| Domaine      | Choix                                      |
| ------------ | ------------------------------------------ |
| Langage      | TypeScript                                 |
| Front        | React 19, Vite                             |
| Cartographie | react-leaflet, fond CARTO Voyager          |
| Géocodage    | Base Adresse Nationale, direct et inverse  |
| Itinéraires  | Transitous, moteur MOTIS, données TCL      |
| Stockage     | Supabase en temps réel, repli localStorage |
| Extension    | WebExtension Manifest V3, web-ext          |

Les itinéraires (Transitous) et le géocodage (BAN) sont des API publiques gratuites et sans clé.

## Configuration

Toute la configuration passe par un fichier `.env` (copié depuis [.env.example](.env.example)) :

```
cp .env.example .env
```

Les variables sont lues **au build** (`npm run build` ou `docker compose build`) : après toute modification du `.env`, il faut rebuild pour qu'elles soient prises en compte.

### Personnalisation

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `VITE_ROOMMATES` | Noms des colocataires, séparés par une virgule (le premier est sélectionné par défaut). Ex. `Angelo,Nathalie` | `Enzo,Esteban` |
| `VITE_REFERENCE_NAME` | Nom du lieu de référence affiché sur la carte | `Lyon 2 — Campus Porte des Alpes` |
| `VITE_REFERENCE_LAT` / `VITE_REFERENCE_LNG` | Coordonnées du lieu vers lequel les temps de trajet (TCL, vélo) sont calculés | campus Porte des Alpes |

Pour récupérer des coordonnées : sur Google Maps, clic droit sur le lieu puis cliquer sur les coordonnées pour les copier. Le géocodage des adresses reste biaisé sur l'agglomération lyonnaise ; le lieu de référence est donc attendu dans la région de Lyon.

### Stockage — trois modes

L'application choisit son backend de stockage automatiquement, dans cet ordre :

| Priorité | Mode | Déclencheur | Partagé | Temps réel | Médias |
| --- | --- | --- | --- | --- | --- |
| 1 | **Backend maison** (Node + Postgres) | `VITE_API_URL` défini | oui | oui (SSE) | oui (disque VPS) |
| 2 | **Supabase** | clés `VITE_SUPABASE_*` définies | oui | oui | oui (bucket privé) |
| 3 | **localStorage** | aucune config | non | non | non |

**Backend maison** — 100 % auto-hébergé, sans dépendance externe. Fourni clé en main par le `docker compose` ci-dessous (Postgres + API + médias sur disque). C'est le mode recommandé pour un VPS ; voir [server/README.md](server/README.md).

**Supabase** — pratique pour un déploiement statique (Vercel, Netlify). Ne pas définir `VITE_API_URL`. Créer un projet sur https://supabase.com, exécuter [supabase/schema.sql](supabase/schema.sql) dans le SQL Editor, puis renseigner `VITE_SUPABASE_URL` (sans le suffixe `/rest/v1/`) et `VITE_SUPABASE_ANON_KEY`. La clé anon est publique par conception, protégée côté base par les règles RLS.

## Déploiement sur un VPS (Docker)

Le `docker compose` fourni monte une stack auto-contenue en trois conteneurs :

- **db** — PostgreSQL (offres, volume persistant `db-data`)
- **api** — backend Node : API REST + temps réel (SSE) + médias sur disque (volume `media-data`), voir [server/](server/)
- **web** — front Vite servi par [nginx](nginx.conf), qui proxifie `/api` vers `api`

```
cp .env.example .env      # colocataires, lieu de référence, identifiants Postgres, PORT
docker compose up -d --build
```

L'application écoute sur `http://<vps>:8080` (port configurable via `PORT`). À placer derrière un reverse proxy HTTPS (nginx, Caddy, Traefik). Les offres et les médias survivent aux redémarrages (volumes Docker) ; une sauvegarde consiste à sauvegarder ces deux volumes.

Après toute modification des variables `VITE_` dans `.env`, relancer avec `docker compose up -d --build` (elles sont figées au build du front).

## Architecture

La persistance passe par l'interface `OfferStore` définie dans `src/lib/storage.ts`, avec trois implémentations (API maison, Supabase, localStorage) choisies selon la configuration. Les composants ignorent l'implémentation. Le backend maison vit dans `server/` (Express + `pg`), indépendant du front.

```
src/
  config.ts            campus, bornes de budget, prix au m², paliers de trajet
  types.ts             modèle Offer
  lib/
    geo.ts             Haversine, paliers, géocodage direct et inverse
    routing.ts         temps de trajet TCL et vélo via Transitous
    color.ts           échelles loyer, temps et prix au m² vers couleur
    parseSeLoger.ts    extraction depuis un lien ou un texte collé
    api.ts             client du backend maison (API REST)
    supabase.ts        client Supabase optionnel
    storage.ts         persistance : API maison, Supabase ou localStorage
    media.ts           upload/lecture des médias (API maison ou Supabase)
  components/
    MapView.tsx        carte, vues, sélection, pointage
    AddOfferForm.tsx   ajout et édition d'une offre
    OfferList.tsx      liste latérale
    Legend.tsx         légende dynamique
server/                backend maison auto-hébergé (Node + Postgres)
  src/index.js         API REST, temps réel SSE, médias sur disque
  src/db.js            pool PostgreSQL + schéma
  Dockerfile           image du backend
supabase/
  schema.sql           table offers, RLS, temps réel (mode Supabase)
extension/
  manifest.json        WebExtension Manifest V3
  content.js           extraction SeLoger et ouverture de l'app
```

## Démarrage

```
npm install
npm run dev
```

## Extension navigateur

L'extension ajoute un bouton sur les pages SeLoger qui importe l'annonce dans l'application. Chargement et signature détaillés dans [extension/README.md](extension/README.md).

```
npm run ext:lint     # valide le manifeste
npm run ext:sign     # signe via AMO pour une installation permanente
```

## Feuille de route

- Score pondéré classant les offres selon des critères ajustables
- Mises à jour automatiques de l'extension via un update_url

## SeLoger

SeLoger est protégé par DataDome et ne peut pas être interrogé depuis un serveur. La récupération du loyer et de la surface passe donc par l'extension, qui lit la page dans le navigateur, ou par un collage manuel.
