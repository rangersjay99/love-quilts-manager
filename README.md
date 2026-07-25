# Love Quilts Manager

Current release: **Update 7.8.24 — Sync Over-Distribution Hotfix — July 24, 2026**

## Update 7.8.24

- Fixes the red Sync Now status that could remain after Quantity Distributed was greater than Quilts Needed.
- Firebase normalization now retains the complete distributed quantity rather than reducing it to the original request.
- If 7.8.23 already clipped a synchronized record, the linked automatic inventory-out amount is used to safely recover the full distributed quantity.
- Any pending save left by 7.8.23 is refreshed from the current local app data before it uploads.
- Pressing Sync Now rewrites charity-need records so the repaired full quantity is stored in Firestore and shared with the other device.
- No Firestore Rules, Firebase paths, sign-ins, or database recreation are required.
- All 7.8.23 entry-review screens and earlier Calendar, reporting, inventory, and distribution safeguards remain.

Upload all files inside this folder to the root of the GitHub Pages repository, replacing matching files. Do not upload the outer folder as a subfolder.
