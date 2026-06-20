<div align="center">

# 📡 PureRSS

**Agrégateur RSS self-hosted — moderne, sécurisé, multi-thèmes**

[![Version](https://img.shields.io/badge/version-1.2.0-blue?style=flat-square)](https://github.com/Heiphaistos/PureRSS-AppWeb/releases/tag/v1.2.0)
[![Stack](https://img.shields.io/badge/stack-Hono.js%20%2B%20Vue%203-green?style=flat-square)](#-stack-technique)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)

> Suivez vos sources RSS, YouTube, réseaux sociaux et sites web depuis une interface unique — hébergé chez vous, données vous appartenant.

</div>

---

## 📋 Table des matières

- [Aperçu](#-aperçu)
- [Fonctionnalités](#-fonctionnalités)
- [Architecture](#-architecture)
- [Stack technique](#-stack-technique)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [API Endpoints](#-api-endpoints)
- [Types de flux](#-types-de-flux-supportés)
- [Thèmes](#-thèmes-disponibles)
- [Sécurité](#-sécurité)
- [Déploiement VPS](#-déploiement-vps)
- [Commandes utiles](#-commandes-utiles)

---

## 🌟 Aperçu

PureRSS est un agrégateur RSS **self-hosted** conçu pour être simple à déployer et riche en fonctionnalités. Il supporte les flux RSS classiques, YouTube, les réseaux sociaux et le scraping de sites web via sélecteurs CSS.

| Capacité | Détail |
|----------|--------|
| 🔗 Flux RSS/Atom | Agrégation standard RSS 2.0 / Atom |
| 📺 YouTube | Flux vidéos via API RSS native YouTube |
| 🌐 Scraping web | Extraction par sélecteurs CSS personnalisés |
| 🔔 Discord | Notifications webhook par flux |
| 🔐 Auth multi-utilisateurs | JWT + bcrypt, comptes distincts |
| 🎨 8 thèmes | Personnalisation visuelle complète |
| 📦 Export/Import | Sauvegarde des flux en JSON |
| 🔄 Refresh auto | Intervalle configurable par flux |

---

## ✨ Fonctionnalités

### Gestion des flux
- ➕ Ajout, édition, suppression de flux RSS
- ▶️ Activation / désactivation par flux
- ⚡ Refresh manuel ou automatique (intervalle configurable)
- 🗂️ Classement automatique en groupes (YouTube / RSS / Réseaux sociaux / Sites web)
- 🔗 Intégration directe vers [RSSDI](https://rssdi.heiphaistos.org) (deep-link pré-rempli)

### Authentification (v1.2.0)
- 🔑 Login / inscription email + mot de passe
- 🏆 Premier compte = admin automatiquement (transaction atomique)
- 🔄 Reset de mot de passe par email (nodemailer)
- 🚪 Logout avec révocation immédiate du token (`token_version`)
- 👤 Isolation des flux par utilisateur (`owner_id`)

### Interface
- 📱 Sidebar avec groupes pliables
- 🖥️ Lecture des articles inline
- 🎨 8 thèmes CSS en un clic (persistés dans localStorage)
- ⚙️ Page Paramètres complète (6 sections)
- 📊 Compteur d'articles par flux

---

## 🏗️ Architecture

```
Internet
   │
   ▼
┌─────────────────────────────────┐
│   Nginx externe (VPS)           │
│   purerss.heiphaistos.org:443   │
│   SSL/TLS via Certbot           │
└────────────┬────────────────────┘
             │ proxy_pass → 127.0.0.1:8081
             ▼
┌──────────────────────────────────────────────────────┐
│               Docker Network : purerss-network        │
│                                                       │
│  ┌───────────────────┐    ┌───────────────────────┐  │
│  │   purerss_nginx   │    │   purerss_frontend    │  │
│  │  (reverse proxy)  │───▶│   Vue 3 build static  │  │
│  │   port : 8081     │    │   nginx:alpine         │  │
│  └─────────┬─────────┘    └───────────────────────┘  │
│            │ /api/*                                   │
│            ▼                                          │
│  ┌──────────────────────────────────────────────┐    │
│  │            purerss_backend                   │    │
│  │            Hono.js (Node.js) — port 3002     │    │
│  │                                              │    │
│  │   /api/auth/*      → Auth JWT                │    │
│  │   /api/feeds/*     → CRUD feeds              │    │
│  │   /feed/:id        → RSS 2.0 XML public      │    │
│  │   /health          → Healthcheck             │    │
│  └──────────────────────┬───────────────────────┘    │
│                         ▼                             │
│  ┌──────────────────────────────────────────────┐    │
│  │   SQLite  /opt/purerss/data/purerss.db       │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Flux d'authentification

```
Client                    Backend                       DB
  │                          │                           │
  ├─ POST /api/auth/login ──▶│                           │
  │                          ├─ SELECT user WHERE email ▶│
  │                          │◀─ UserRow ────────────────┤
  │                          ├─ bcrypt.compare()         │
  │                          ├─ signJwt({ sub,           │
  │                          │   tokenVersion })         │
  │◀─ { token, user } ───────┤                           │
  │                          │                           │
  ├─ GET /api/feeds ─────────▶│                           │
  │  Authorization: Bearer   ├─ verifyJwt() ─────────────┤
  │                          ├─ getTokenVersion(sub) ────▶│
  │                          │◀─ version ────────────────┤
  │◀─ [ feeds ] ─────────────┤  (compare → 401 si ≠)    │
  │                          │                           │
  ├─ POST /api/auth/logout ──▶│                           │
  │                          ├─ incrementTokenVersion() ─▶│
  │◀─ { ok: true } ──────────┤  (invalide tous les JWT)  │
```

---

## 🛠️ Stack technique

| Couche | Technologie | Version | Rôle |
|--------|------------|---------|------|
| **Runtime** | Node.js | 20 LTS | Environnement backend |
| **Framework** | Hono.js | 4.x | Routing HTTP ultra-léger |
| **Base de données** | better-sqlite3 | 9.x | SQLite synchrone hautes perfs |
| **Auth — JWT** | jose | 5.x | JWT HS256 (sign / verify) |
| **Auth — Passwords** | bcryptjs | 2.x | Hachage bcrypt round 12 |
| **Email** | nodemailer | 6.x | Reset mot de passe via SMTP |
| **Frontend** | Vue 3 + Vite | 3.4 / 5.x | SPA réactive |
| **Reverse proxy** | nginx:alpine | — | Proxy + rate limiting + headers sécu |
| **Conteneurisation** | Docker Compose | v2 | Orchestration 3 containers |
| **Parser HTML** | node-html-parser | 6.x | Scraping DOM (extracteur generic) |

---

## 🚀 Installation

### Prérequis

```bash
docker --version        # ≥ 24.0
docker compose version  # ≥ 2.0
openssl version         # Pour générer JWT_SECRET
```

### Cloner et configurer

```bash
git clone https://github.com/Heiphaistos/PureRSS-AppWeb.git
cd PureRSS-AppWeb
```

### Créer `.env`

```env
# Obligatoire
JWT_SECRET=<résultat de : openssl rand -hex 32>
APP_URL=https://votre-domaine.com

# Optionnel — reset MDP par email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@email.com
SMTP_PASS=votre_app_password
SMTP_FROM=PureRSS <votre@email.com>
```

> ⚠️ `JWT_SECRET` doit faire au moins 32 caractères. Le backend refuse de démarrer sans lui.

### Lancer

```bash
docker compose up -d
# Application disponible sur http://localhost:8081
```

### Premier démarrage

1. Ouvrez `http://localhost:8081`
2. Onglet **Créer un compte** → email / username / mot de passe
3. ✅ Le premier compte créé est automatiquement **admin**
4. Ajoutez vos premiers flux

---

## ⚙️ Configuration

### Variables d'environnement

| Variable | Requis | Défaut | Description |
|----------|--------|--------|-------------|
| `JWT_SECRET` | ✅ | — | Secret JWT ≥ 32 chars. Crash au démarrage si absent. |
| `APP_URL` | ✅ | — | URL publique (liens reset email) |
| `SMTP_HOST` | ❌ | — | Serveur SMTP |
| `SMTP_PORT` | ❌ | `587` | Port SMTP |
| `SMTP_USER` | ❌ | — | Identifiant SMTP |
| `SMTP_PASS` | ❌ | — | Mot de passe SMTP |
| `SMTP_FROM` | ❌ | — | Expéditeur affiché |
| `DB_PATH` | ❌ | `/app/data/purerss.db` | Chemin base SQLite |

### Schéma base de données

```
┌──────────────────────────────────────────────────────┐
│                       users                          │
├──────────────┬───────────────────────────────────────┤
│ id           │ TEXT PRIMARY KEY   (UUID v4)           │
│ email        │ TEXT UNIQUE NOT NULL                   │
│ username     │ TEXT UNIQUE NOT NULL                   │
│ password_hash│ TEXT NOT NULL      (bcrypt r12)        │
│ role         │ TEXT NOT NULL      ('admin' | 'user')  │
│ created_at   │ TEXT NOT NULL      (ISO 8601)          │
│ last_login   │ TEXT               (nullable)          │
│ token_version│ INTEGER DEFAULT 0  (révocation JWT)   │
└──────────────┴───────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                       feeds                          │
├──────────────────┬───────────────────────────────────┤
│ id               │ TEXT PRIMARY KEY  (UUID v4)        │
│ name             │ TEXT NOT NULL                      │
│ source_url       │ TEXT NOT NULL                      │
│ feed_type        │ TEXT NOT NULL                      │
│ selector_title   │ TEXT  (generic uniquement)         │
│ selector_link    │ TEXT  (generic uniquement)         │
│ selector_desc    │ TEXT  (generic uniquement)         │
│ selector_date    │ TEXT  (generic uniquement)         │
│ refresh_interval │ INTEGER DEFAULT 30  (minutes)      │
│ enabled          │ INTEGER DEFAULT 1   (0 | 1)        │
│ discord_webhook  │ TEXT  (nullable)                   │
│ item_count       │ INTEGER DEFAULT 0                  │
│ last_fetched     │ TEXT  (ISO 8601, nullable)         │
│ owner_id         │ TEXT  → users.id                   │
│ created_at       │ TEXT NOT NULL                      │
└──────────────────┴───────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                    reset_tokens                      │
├──────────────┬───────────────────────────────────────┤
│ token        │ TEXT PRIMARY KEY  (32 bytes hex)       │
│ user_id      │ TEXT → users.id   (CASCADE DELETE)     │
│ expires_at   │ TEXT NOT NULL     (TTL 1 heure)        │
│ used         │ INTEGER DEFAULT 0 (consommation atom.) │
└──────────────┴───────────────────────────────────────┘
```

---

## 📡 API Endpoints

### Auth — `/api/auth`

| Méthode | Endpoint | Auth | Body | Description |
|---------|----------|------|------|-------------|
| POST | `/register` | ❌ | `{email, username, password}` | Créer un compte |
| POST | `/login` | ❌ | `{email, password}` | Connexion → JWT |
| GET | `/me` | ✅ JWT | — | Profil utilisateur courant |
| POST | `/logout` | ✅ JWT | — | Révocation immédiate du token |
| POST | `/forgot-password` | ❌ | `{email}` | Demander reset par email |
| POST | `/reset-password` | ❌ | `{token, password}` | Reset avec token email |
| PATCH | `/change-password` | ✅ JWT | `{currentPassword, newPassword}` | Changer le mot de passe |
| PATCH | `/change-email` | ✅ JWT | `{email, password}` | Changer l'email |

### Feeds — `/api/feeds`

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/` | ✅ JWT | Lister ses flux |
| POST | `/` | ✅ JWT | Ajouter un flux |
| GET | `/:id/items` | ✅ JWT | Articles d'un flux |
| PATCH | `/:id` | ✅ JWT | Modifier un flux |
| DELETE | `/:id` | ✅ JWT | Supprimer un flux |
| PATCH | `/:id/toggle` | ✅ JWT | Activer / désactiver |
| POST | `/:id/refresh` | ✅ JWT | Refresh manuel |
| PATCH | `/:id/webhook` | ✅ JWT | Configurer webhook Discord |
| POST | `/:id/test-webhook` | ✅ JWT | Tester le webhook Discord |

### Public

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/feed/:id` | Flux RSS 2.0 XML (partage externe, sans auth) |
| GET | `/health` | Healthcheck (réseau interne uniquement) |

### Exemples cURL

```bash
# Inscription
curl -X POST http://localhost:8081/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","username":"user","password":"MonMdp1!"}'

# Login — récupérer le token
TOKEN=$(curl -s -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"MonMdp1!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Ajouter un flux RSS
curl -X POST http://localhost:8081/api/feeds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"LeMonde","source_url":"https://lemonde.fr/rss/une.xml","feed_type":"rss","refresh_interval":30}'

# Lister ses flux
curl http://localhost:8081/api/feeds \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📰 Types de flux supportés

| feed_type | Extracteur | CSS requis | Groupe sidebar | Exemple |
|-----------|-----------|-----------|----------------|---------|
| `rss` | RSS/Atom natif | ❌ | RSS & Podcast | `lemonde.fr/rss/une.xml` |
| `podcast` | RSS natif | ❌ | RSS & Podcast | Flux podcast standard |
| `reddit` | RSS natif | ❌ | RSS & Podcast | `reddit.com/r/linux/.rss` |
| `youtube` | API RSS YouTube | ❌ | YouTube | URL chaîne YouTube |
| `instagram` | Scraping | ❌ | Réseaux sociaux | Page Instagram |
| `facebook` | OG tags | ❌ | Réseaux sociaux | Page Facebook |
| `tiktok` | Scraping | ❌ | Réseaux sociaux | Profil TikTok |
| `twitter` | Scraping | ❌ | Réseaux sociaux | Profil X/Twitter |
| `social` | Scraping générique | ❌ | Réseaux sociaux | — |
| `generic` | Scraping CSS | ✅ Obligatoire | Sites web | N'importe quel site HTML |
| `twitch` | Scraping | ❌ | Sites web | `twitch.tv/channel` |

> **Type `generic`** : renseignez les sélecteurs CSS `title`, `link`, `description`, `date` pour extraire le contenu de n'importe quelle page HTML.

---

## 🎨 Thèmes disponibles

| # | Thème | Emoji | Style |
|---|-------|-------|-------|
| 1 | GitHub Dark | 🐙 | Fond sombre inspiré GitHub |
| 2 | Light | ☀️ | Fond blanc minimaliste |
| 3 | Dracula | 🧛 | Violet / rose sur fond très sombre |
| 4 | Catppuccin | 🐱 | Pastel doux — Mocha variant |
| 5 | Nord | 🧊 | Bleus arctiques froids |
| 6 | Gruvbox | 🎨 | Tons chauds rétro (ocre / vert) |
| 7 | Tokyo Night | 🌃 | Bleus nuit profond / violet |
| 8 | Solarized | 🌅 | Palette Solarized classique |

Sélection persistée dans `localStorage`. Appliquée via 17 CSS custom properties sur `:root`.

---

## 🛡️ Sécurité

### Mesures implémentées

| Catégorie | Mesure | Implémentation |
|-----------|--------|----------------|
| **JWT** | HS256 / expiry 7j | `jose` — secret ≥ 32 chars obligatoire |
| **JWT** | Révocation immédiate | `token_version` en DB — vérifié à chaque requête |
| **Passwords** | bcrypt round 12 | Max 128 chars (protection DoS CPU) |
| **Inscription** | Premier admin atomique | Transaction SQLite — pas de race condition |
| **Rate limit** | Login | 5 req / 15 min (nginx `limit_req` + applicatif) |
| **Rate limit** | Register | 3 req / heure |
| **Rate limit** | Forgot password | 3 req / heure |
| **SSRF** | Validation URL | RFC1918, IPv6, `.local`, `.internal` bloqués |
| **SSRF** | Redirections | `redirect: "manual"` — Location validée avant suivi |
| **XSS** | Liens RSS | `safeHref()` — rejette tout schéma non `http/https` |
| **XSS** | Templates Vue | `{{ }}` partout — aucun `v-html` sur données externes |
| **IDOR** | Feeds | `owner_id` sur tous les CRUD — isolation complète |
| **Injection** | Discord Markdown | `escapeMd()` sur les noms de flux |
| **Headers HTTP** | nginx | X-Frame-Options, HSTS, CSP, X-Content-Type-Options |
| **Logs** | Tokens sensibles | Format nginx sans query string |
| **Config** | Secrets | Crash explicite au démarrage si `JWT_SECRET` absent |

### Résumé rate limits

```
Endpoint                        Limite           Fenêtre
────────────────────────────────────────────────────────
POST /api/auth/login            5 tentatives     15 minutes
POST /api/auth/register         3 inscriptions   1 heure
POST /api/auth/forgot-password  3 demandes       1 heure
Toutes routes (global)          120 requêtes     1 minute
```

---

## 🖥️ Déploiement VPS

### Structure des fichiers

```
/opt/purerss/
├── docker-compose.yaml          Orchestration 3 containers
├── nginx-proxy.conf             Proxy interne + headers + rate limits
├── .env                         Secrets (jamais commité)
├── data/
│   └── purerss.db               Base SQLite (volume persisté)
├── worker/                      Backend Node.js
│   ├── Dockerfile
│   └── src/
│       ├── index.ts             App Hono + middlewares
│       ├── routes/
│       │   ├── auth.ts          8 endpoints auth
│       │   └── feeds.ts         CRUD flux + webhooks Discord
│       ├── db/
│       │   ├── schema.ts        Schema SQLite + migrations auto
│       │   └── users.ts         CRUD users + bcrypt + token_version
│       ├── middleware/
│       │   └── jwt.ts           sign / verify / requireAuth
│       ├── extractors/          generic, rss, youtube, social
│       ├── rss/
│       │   └── builder.ts       Génération RSS 2.0 XML
│       └── utils/
│           ├── ssrf.ts          Guard SSRF (assertPublicUrl)
│           ├── email.ts         Nodemailer + fallback dev
│           └── discord.ts       Webhooks + escapeMd
└── frontend/                    Frontend Vue 3
    ├── Dockerfile
    └── src/
        ├── App.vue              Composant racine + guard auth
        ├── api.ts               Client HTTP (Bearer JWT)
        ├── composables/
        │   ├── useAuth.ts       État auth global (singleton)
        │   └── useTheme.ts      8 thèmes CSS + persistance
        └── views/
            ├── LoginView.vue           Login / register / forgot
            ├── ResetPasswordView.vue   Reset via ?token=
            └── SettingsView.vue        Paramètres 6 sections
```

### Configuration nginx externe

```nginx
server {
    listen 443 ssl;
    server_name purerss.votre-domaine.com;

    ssl_certificate     /etc/letsencrypt/live/votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/votre-domaine.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:8081;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name purerss.votre-domaine.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 🔧 Commandes utiles

```bash
# Logs en direct
docker compose logs -f backend
docker compose logs -f nginx

# Rebuild complet
docker compose build && docker compose up -d --force-recreate

# Rebuild frontend uniquement
docker compose build frontend && docker compose up -d --force-recreate frontend nginx

# Accès base de données
sqlite3 /opt/purerss/data/purerss.db

# Requêtes utiles
sqlite3 /opt/purerss/data/purerss.db "SELECT name, feed_type, enabled FROM feeds;"
sqlite3 /opt/purerss/data/purerss.db "SELECT email, role FROM users;"

# Récupérer les données après crash (checkpoint WAL)
sqlite3 /opt/purerss/data/purerss.db "PRAGMA wal_checkpoint(FULL);"

# Santé de l'application
curl http://127.0.0.1:8081/health
```

> ⚠️ **Après tout rebuild du backend**, exécuter `docker compose restart nginx` pour forcer la re-résolution DNS Docker (sinon 502 potentiel).

---

## 📄 Changelog

| Version | Date | Changements |
|---------|------|-------------|
| **1.2.0** | 2026-06-20 | Auth JWT complète, logout révocable, 8 thèmes, page Paramètres 6 sections, audit sécurité 25 failles |
| **1.1.x** | 2026-06-09 | Webhooks Discord, édition flux, classification sidebar, intégration RSSDI |
| **1.0.0** | 2026-06-02 | Version initiale — CRUD flux, extracteurs, RSS builder, Docker |

---

<div align="center">

**PureRSS** · Self-hosted RSS Aggregator · v1.2.0

[purerss.heiphaistos.org](https://purerss.heiphaistos.org) · [Releases](https://github.com/Heiphaistos/PureRSS-AppWeb/releases)

</div>
