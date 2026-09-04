# Génial Coloc

Comparateur d'annonces de colocation à Lyon. Les annonces s'affichent sur une carte, colorées par loyer, prix au m² ou temps de trajet jusqu'à un point de référence (par défaut le campus Lyon 2 Porte des Alpes). Fait pour chercher à deux. React, Vite, Leaflet.

## Fonctions

- Carte avec plusieurs colorations : loyer, prix au m², trajet en transports, vélo.
- Temps de trajet jusqu'au point de référence, en TCL et à vélo.
- Statut par annonce (à visiter, visitée, favori, écartée) et qui l'a ajoutée.
- Photos, vidéos, notes et contacts par annonce.
- Stockage partagé entre colocs, ou local dans le navigateur.
- Extension navigateur pour importer une annonce SeLoger.

Le géocodage (Base Adresse Nationale) et les itinéraires (Transitous) sont gratuits et sans clé.

## Héberger sur un VPS (Docker)

C'est la façon normale de l'installer. Il faut Docker et Docker Compose.

```
cp .env.example .env      # colocs, point de référence, mot de passe Postgres
docker compose up -d --build
```

Ça tourne sur `http://<serveur>:8080`. Change le port avec `PORT`, et mets un reverse proxy HTTPS devant (nginx, Caddy, Traefik).

Compose lance trois conteneurs : Postgres, l'API Node (offres, temps réel, médias) et nginx pour le front. Les données et les médias vivent dans des volumes Docker, donc ils restent après un redémarrage ; pour sauvegarder, tu copies ces volumes.

Les variables `VITE_` sont lues au build du front. Si tu les changes dans `.env`, relance `docker compose up -d --build`. L'API est décrite dans [server/README.md](server/README.md).

## Autres façons

**Vercel ou Netlify, avec Supabase.** Pas de serveur à gérer. Crée un projet sur https://supabase.com, lance [supabase/schema.sql](supabase/schema.sql), mets `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans `.env` (laisse `VITE_API_URL` vide), puis déploie le front.

**En local, pour développer.**

```
npm install
npm run dev
```

Sans config, les annonces restent dans le navigateur, sans partage ni médias. Pour tester le mode VPS sur ta machine, lance plutôt le `docker compose` ci-dessus.

## Configuration

Tout est dans `.env` (copie de [.env.example](.env.example)).

| Variable | Rôle |
| --- | --- |
| `VITE_ROOMMATES` | Noms des colocs, séparés par une virgule. Ex. `Angelo,Nathalie` |
| `VITE_REFERENCE_NAME` | Nom du point de référence sur la carte |
| `VITE_REFERENCE_LAT`, `VITE_REFERENCE_LNG` | Coordonnées du point vers lequel on calcule les trajets |

Le géocodage est calé sur Lyon, donc garde un point de référence dans la région.

Le stockage se choisit tout seul : l'API maison si `VITE_API_URL` est là (le cas Docker), sinon Supabase si ses clés sont là, sinon le navigateur.

## Extension navigateur

Elle ajoute un bouton sur SeLoger pour importer une annonce d'un clic. SeLoger bloque les requêtes serveur, donc la lecture se fait dans le navigateur. Voir [extension/README.md](extension/README.md).
