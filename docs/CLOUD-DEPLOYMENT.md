# Iya deployment: Vercel + Render

Target frontend: `https://iyawarin.com` on Vercel (team `jojo-7133`, project `iyawarin`).
Target backend: Render web service `iyawarin-api`, Singapore, 1 CPU / 2 GB RAM,
one instance with a 1 GB persistent disk at `/app/data`.
Estimated Render base cost: $25 compute + $0.25 disk per month, before taxes and overages.
This configuration retains SQLite; no Supabase subscription or PostgreSQL migration is required.

## First deployment

- Build the repository's Dockerfile; it includes Chromium, Thai fonts and FFmpeg.
- Start with `node scripts/cloud-start.mjs`, `CLOUD_MIGRATION_PENDING=1`, and
  `REQUIRE_EXISTING_DATABASE=1`. Health checks return migration mode; other routes
  return 503. This mode does not open SQLite or start the LINE worker.
- Set `APP_ORIGIN=https://iyawarin.com`, `DATABASE_PATH=/app/data/hiewly.sqlite`,
  `HOST=0.0.0.0`, `NODE_ENV=production` and `TRUST_PROXY=1` behind Render's proxy.
- Copy the **existing** `SETTINGS_ENCRYPTION_KEY` to Render's secret environment.
  Generating a replacement would make the stored integration secrets unreadable.
- Set the existing Google web client credentials as server-only `GOOGLE_CLIENT_ID`
  and `GOOGLE_CLIENT_SECRET`, or use a Render secret file and `GOOGLE_CREDENTIALS_FILE`.
  Never publish credentials, the SQLite database, private uploads, or `.env` to Git/Vercel static files.
- Disable automatic deployment during migration. `render.yaml` documents the intended configuration;
  do not import it a second time if the service was created manually.

## Data transfer and cutover

1. Keep the cloud application in migration mode. Verify the image starts and disk permissions allow the node user to write.
2. Pause source writes and the source LINE worker for the final snapshot. Record the source Git revision.
3. Run `npm run backup` using SQLite's online backup API. Do not copy a live SQLite file without its WAL.
4. Run `node scripts/verify-db-snapshot.mjs <snapshot>` and retain its aggregate manifest privately.
5. Transfer the snapshot over verified SSH/SFTP to the Render persistent disk. Upload to a temporary filename,
   verify file SHA-256 and the database manifest, then rename to `hiewly.sqlite` while the app remains stopped.
   Images, QR assets and review media are stored as SQLite BLOBs and travel with this snapshot.
6. Configure Vercel's `/api/:path*` rewrite to the verified Render HTTPS origin before its SPA fallback.
   Keep the API on the frontend's origin for cookies and CSRF. Do not redirect authenticated API requests across origins.
7. Register `https://iyawarin.com/api/auth/google/callback` in Google Cloud and
   `https://iyawarin.com/api/auth/line/callback` in LINE Login. Preserve existing callbacks until testing finishes.
   Set the Messaging API webhook to `https://iyawarin.com/api/line/webhook` at cutover.
8. Set `CLOUD_MIGRATION_PENDING=0` and restart the cloud service only after source writes/worker are paused.
   Smoke test the catalog, assets, account login, authorization and wallet history. Test payments with isolated fixtures;
   do not credit real customer wallets merely to verify deployment.
9. Assign the Vercel custom domain only after the backend and same-origin proxy work. Verify HTTPS and OAuth on the final domain.
10. Remove the temporary migration SSH public key after verification. Keep the source snapshot and original encryption key securely.

## Operations and rollback

SQLite requires one service instance. Disk-backed Render deploys can briefly interrupt service.
Monitor disk usage: review videos, uploads and backups share the initial 1 GB volume.
Use `npm run backup` for application-consistent SQLite backups; Render disk snapshots alone are not a database backup strategy.
Copy backups to separate secure storage regularly, test restore and define retention before accepting production transactions.
Do not run `npm run setup` against the restored database for this migration.

Before any new cloud transactions, rollback can return traffic/webhooks to the unchanged source.
After cloud transactions occur, freeze writes and reconcile/restore the newest cloud database before rollback;
never resume a stale source database or run two independent wallets and LINE workers.

## Status

This document is a runbook, not a claim that the service, data migration, domain or provider callbacks are live.
Record actual deployment IDs and verification results when those steps complete.
