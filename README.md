# Atlas

Atlas is a community-first platform prototype inspired by the familiar server-and-channel experience people already know, with a stronger focus on discovery, customization, and free core functionality.

## What is in the project

- `web`: React + TypeScript frontend connected to the Atlas API
- `server`: Node HTTP API backed by a local SQLite database
- `server/data/atlas.db`: persistent local platform data

## Getting started

1. Install dependencies:

   ```powershell
   cd D:\Atlas\server
   npm install
   ```

   ```powershell
   cd D:\Atlas\web
   npm install
   ```

2. Create your local secret config:

   Copy `D:\Atlas\server\config.local.example.json` to `D:\Atlas\server\config.local.json`

   Put your bootstrap admin unlock password and any seed account passwords there. That local file is ignored by git.
   After Atlas is running, the owner can rotate the admin unlock password from inside the app, and Atlas will keep only the hashed version in the database.

3. Start Atlas the easy way:

   Double-click `D:\Atlas\Start-Atlas.bat`

   Or from the project root:

   ```powershell
   cd D:\Atlas
   npm run dev
   ```

   This opens two PowerShell windows automatically:

   - one for the API server
   - one for the web app

4. Manual start, if you ever want it:

   ```powershell
   cd D:\Atlas\server
   npm run dev
   ```

   ```powershell
   cd D:\Atlas\web
   npm run dev
   ```

5. Open the local URL shown by Vite, usually `http://localhost:5173`

## What is real now

- Account creation and sign-in with persistent sessions
- Server, channel, and message counts come from the database
- Messages persist locally in `server/data/atlas.db`
- Discovery results are driven by stored servers and tags
- Announcements and admin logs are stored by the backend
- Quest completion updates the viewer's Atlas Coins in storage

## Accounts

- Create a new account from the Atlas homepage
- Your browser stores the session token in local storage
- Google sign-in is supported when OAuth environment variables are configured
- Seed account passwords are configured locally in `D:\Atlas\server\config.local.json`
- The crown/admin unlock password is bootstrapped from local config once, then can be rotated in the owner admin panel and stored as a hash in the database

## Google OAuth setup

Set these before starting the server:

```powershell
$env:GOOGLE_CLIENT_ID="your-google-client-id"
$env:GOOGLE_CLIENT_SECRET="your-google-client-secret"
$env:GOOGLE_REDIRECT_URI="http://localhost:3001/api/auth/google/callback"
$env:APP_ORIGIN="http://localhost:5173"
```

In Google Cloud, add this redirect URI:

- `http://localhost:3001/api/auth/google/callback`

## Next build steps

- Add PostgreSQL for production deployment
- Replace polling with real WebSocket presence and messaging
- Add file uploads, direct messages, voice, and the visual bot builder

## Launch planning

- Launch guidance and the realistic beta checklist live in `D:\Atlas\LAUNCH_CHECKLIST.md`
- Deployment notes live in `D:\Atlas\DEPLOYMENT.md`
