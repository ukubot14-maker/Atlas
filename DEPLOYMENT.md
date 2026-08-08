# Atlas Deployment

Atlas can be deployed as a small private beta with one static frontend and one Node backend.

## Render blueprint

The repo includes `D:\Atlas\render.yaml` with:

- `atlas-api` as a Node web service
- `atlas-web` as a static frontend

## Required production environment variables

Backend:

- `APP_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

Frontend:

- `VITE_API_BASE_URL`

## WebSocket note

Atlas now opens a WebSocket connection from the frontend to `/ws` so channel messages, DMs, and admin activity can refresh live.

## PostgreSQL migration

Atlas still runs on SQLite today, but the PostgreSQL migration tooling is now included:

- schema: `D:\Atlas\server\postgres\schema.sql`
- migration script: `D:\Atlas\server\scripts\migrate-to-postgres.js`

To migrate a local SQLite database into PostgreSQL:

```powershell
cd D:\Atlas\server
$env:DATABASE_URL="your-postgres-connection-string"
npm run migrate:postgres
```

## Honest status

This is enough for a private beta launch path, not a full-scale public launch.

The next backend step after migration is swapping the runtime data layer from SQLite queries to PostgreSQL queries directly.
