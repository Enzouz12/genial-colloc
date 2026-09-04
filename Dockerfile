# syntax=docker/dockerfile:1

# --- Étape 1 : build du front avec Vite --------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Dépendances d'abord (meilleur cache Docker).
COPY package.json package-lock.json ./
RUN npm ci

# Variables de configuration lues par Vite au build (préfixe VITE_).
# Passées par docker-compose depuis le fichier .env. Voir .env.example.
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ROOMMATES
ARG VITE_REFERENCE_NAME
ARG VITE_REFERENCE_LAT
ARG VITE_REFERENCE_LNG
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_ROOMMATES=$VITE_ROOMMATES \
    VITE_REFERENCE_NAME=$VITE_REFERENCE_NAME \
    VITE_REFERENCE_LAT=$VITE_REFERENCE_LAT \
    VITE_REFERENCE_LNG=$VITE_REFERENCE_LNG

COPY . .
RUN npm run build

# --- Étape 2 : service statique via nginx ------------------------------------
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
