# syntax=docker/dockerfile:1

# Backend maison (API REST + SSE + médias) sur Node.
FROM node:22-alpine
WORKDIR /app

# Dépendances d'abord (meilleur cache Docker).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Répertoire des médias (monté en volume par docker-compose).
ENV MEDIA_DIR=/data/media
EXPOSE 3000
CMD ["node", "src/index.js"]
