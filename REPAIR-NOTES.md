# Automatic sync with local saves

Sign in with your existing email and password whenever the POS opens or reloads. Sign-in requires access to Supabase Auth. The open app keeps saving to this device if the shared database is temporarily unreachable.

The POS sends pending changes after each save and checks for shared changes every two seconds while open. It also checks at sign-in, on reconnect, and when you return to the app. The time for another device to show a change depends on the network, server response, and browser scheduling. Connection failures retry automatically. Inventory conflicts still appear under **Sync & backup** for review.

Deploy with the existing Netlify settings. The notes below describe prior versions.

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

## Required database permissions update
The original schema granted inventory access only to anon. Signed-in tokens use the authenticated role, which needs its own permissions and row policies.
Run supabase/authenticated-inventory-access.sql in the existing Supabase project SQL Editor, then select Sync now. This adds shared inventory access for authenticated users without deleting records or removing existing policies. Apply only to this shared POS database.
The application now detects an empty signed-in inventory when records remain visible to anon and reports the permission mismatch before replacing cached data.

## Automatic synchronization
Saved product, stock, sale, customer, and expense changes upload immediately. Changes queued during an existing upload drain in the same pass. The open, signed-in app checks shared data every two seconds and schedules another pass if a change arrives during sync. It also syncs at startup, on reconnect, on focus, and when the page becomes visible. Offline changes remain queued and retry automatically. Browser background throttling and network speed can delay updates; a closed app cannot keep syncing. Permission errors and inventory conflicts remain visible and require correction rather than silently overwriting other edits.

## Connection recovery
Database reads and writes now go through /api/database on the application's own host. Both the Vinext API route and the Netlify function forward the caller's bearer token to the configured Supabase project; no service-role key is used. The relay restricts requests to POS tables, disables caching, preserves database status codes, and bounds upstream requests to 15 seconds. Browser requests have a 20-second timeout. Failed or uncertain writes remain queued. Network failures share a retry cooldown of 5, 10, 20, 40, then 60 seconds; a successful sync or network reconnect resets it. No browser storage or database records are cleared.

## Inventory conflict review
Conflict messages now list affected product names. Independent new products continue uploading. Review pending edits uploads unrelated work first, then uploads each accepted decision before reading the next dependent edit. Cancelling keeps that product's later edits pending too. Review never recreates a missing product automatically and cannot distinguish deletion from rows hidden by database permissions without administrator checks.

## Direct database product saves (current behavior)
Add Product and Edit Product now wait for the database response. The form shows Saving to database and closes only after exactly one matching product row is returned. Failed/offline requests keep the form and show an error; they do not create a locally saved product that merely looks uploaded. Editing compares against the form's opening snapshot and sends only changed fields with an ID filter. Ordinary product edits use the latest explicitly submitted field values instead of stock/price/cost comparison conflicts. Older queued product-form submissions are upgraded on startup and retried automatically; sale/refund stock comparison guards remain intact. Background refresh pauses while a product save is in progress. Local storage is a cache after a successful product save, not the authority.

## Server reachability and offline detection
The app no longer blocks saves, retries, or session renewal solely because navigator.onLine reports false. Actual requests determine success or failure. Connection errors now say Server unavailable rather than claiming the internet is offline. This cannot repair a domain, hosting, or network-route failure that prevents the browser from reaching pagerry.com itself.

## Offline product saves (current behavior)
Products can be added or edited while offline in an already signed-in app. A browser offline hint queues the save immediately; background requests still attempt recovery even if that hint is wrong. Connection failures also create a durable product upload job. Each job includes a complete recovery snapshot and stable product ID; later edits stay behind earlier saves. Reload restores pending products even when the page closed before its inventory cache was updated. Inventory rows show Upload pending until uploaded. A browser reconnect, focus, or periodic automatic retry uploads pending work while the app is open. Supabase still requires a valid login and permissions. Clearing site/application data before upload erases the local queue; a closed app cannot be guaranteed to upload until reopened. Online direct saves retain server confirmation.
