# Product persistence repair

Changes:
- Database requests now authenticate with the signed-in user's access token and renew expired sessions before retrying.
- Restored inventory is available immediately to background sync after reload.
- Failed uploads retain their detailed error when background downloads succeed.
- Pending uploads without a login or internet connection explicitly show that data is saved only on this device.

Deployment:
Use Node.js 22.13 or later. Install with npm ci and deploy using the existing project's hosting configuration (npm run build:netlify for Netlify).
Sign in, add a product, and select Sync & backup > Sync now. Confirm Changes synced or Synced with shared database before clearing application data. After clearing data, sign in again to download the shared inventory.
If Needs attention remains, open Sync & backup to read the exact database error. Database permissions/schema and hosting environment configuration must be checked in the deployed environment; no live database was modified by this repair.

Previously erased browser-only products cannot be recovered by this code change. Restore an exported backup if those products never uploaded.
