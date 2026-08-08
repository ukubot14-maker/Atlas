# Atlas Launch Checklist

This file is the reality check for taking Atlas from a serious prototype to a launchable private beta.

## What Atlas can do today

- Create accounts and sign in
- Store persistent community messages and direct messages
- Browse public communities and discovery tags
- Run owner moderation actions and announcements
- Rotate the crown/admin unlock secret from inside the app

## Good enough for a private friend beta

- Run the backend on a stable public host
- Run the frontend on a stable public host
- Set `APP_ORIGIN` to the public frontend URL
- Set Google OAuth redirect URLs to the public backend callback URL
- Change all seed account passwords in local or production env config
- Rotate the admin unlock password from the owner panel after first boot
- Back up the database file daily
- Restart the backend cleanly and verify `/health`
- Test register, login, DM send, server message send, announce, and ban on the public URL

## Not ready for a true public launch yet

- No email verification
- No password reset flow
- No real file upload pipeline
- No websocket-based real-time messaging
- No audit-safe moderation model beyond current owner tools
- SQLite is still fine for local and tiny beta use, but not the long-term production database
- No legal pages, privacy policy, or terms yet
- No monitoring, uptime alerting, or automated backups

## Highest priority next steps

1. Move the backend to PostgreSQL.
2. Add websocket real-time messaging for channels and DMs.
3. Add password reset and email verification.
4. Add avatars and profile settings.
5. Add production deployment config for frontend and backend.
6. Add automated backups and basic monitoring.

## Tomorrow launch recommendation

Launch Atlas only as a private beta for friends, not as a full public social platform.

That is realistic if:

- you deploy frontend and backend cleanly
- you change all local bootstrap secrets
- you test the full auth and messaging flow once on the public URLs
- you accept that this is an early access build, not a finished product
