# Spotify Tracker + Daily Recs

Production-ready Next.js app that imports Spotify listening data, tracks analytics over time, shows Wrapped-style insights, and generates daily new-to-you recommendations.

## Stack
- Frontend: Next.js App Router + TypeScript + Tailwind + shadcn-style components
- Backend: Next.js route handlers + TypeScript
- Database: PostgreSQL + Prisma
- Auth: Spotify OAuth (Authorization Code + PKCE)
- Charts: Recharts
- Exports: CSV / JSON / PDF (PDFKit)
- Tests: Vitest
- Deploy: Docker + docker-compose

## Features
- Spotify sign-in with PKCE + state validation
- Secure server-side token storage/refresh
- Import pipeline with progress status and 429 retry/backoff
- Dashboard cards + listening-over-time chart
- Dedicated top pages: songs, artists, albums, genres
- Global time filtering (Today/Week/Month/Year + custom)
- Wrapped page with year selector + share text + PDF export
- Daily Recs (10 songs + 3 albums) filtered by "new to me"
- Export endpoints: `/api/export/csv`, `/api/export/json`, `/api/export/pdf`
- JSON restore endpoint: `/api/import/json`
- Responsive sidebar + mobile bottom nav

## Local setup (without Docker)
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```
4. Start Postgres (local or container) and sync schema:
   ```bash
   npm run prisma:push
   ```
5. Start app:
   ```bash
   npm run dev
   ```

App runs at `http://localhost:3000`.

## Docker setup
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Fill Spotify credentials in `.env`.
3. Start everything:
   ```bash
   docker compose up --build
   ```
4. Open `http://localhost:3000`.

## Spotify OAuth setup
Create a Spotify app in the Spotify Developer Dashboard and set redirect URI to:

`http://localhost:3000/api/auth/spotify/callback`

Required scopes (minimum):
- `user-read-recently-played`
- `user-top-read`
- `user-read-email` (optional but included)

## Prisma schema + migration instructions
Schema is in `prisma/schema.prisma`.

Development migration flow:
```bash
# create SQL migration from schema changes
npx prisma migrate dev --name init

# regenerate client
npm run prisma:generate
```

Production migration flow:
```bash
npm run prisma:migrate
```

For local quick sync (no migration files), use:
```bash
npm run prisma:push
```

## Tests
```bash
npm run test
```

Current coverage includes:
- Unit test: recommendation ranking + new-to-me filter
- API test: CSV export endpoint

## Scripts
- `npm run dev` - start development server
- `npm run build` - production build (webpack)
- `npm run start` - start production server
- `npm run lint` - ESLint
- `npm run test` - Vitest
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:push` - sync schema to DB
- `npm run prisma:migrate` - apply migrations

## Notes
- Refresh token never leaves server-side storage.
- Export JSON includes profile, imports, plays, related metadata, and aggregate summaries.
- Daily recommendations are cached per-user per-day; regenerate is rate-limited.
