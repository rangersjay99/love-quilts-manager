# Love Quilts Manager

Current release: **Update 7.8.41 — Shared Wording Sync Fix — July 26, 2026**

## Update 7.8.41

- Fixes the Future Modules message not updating on every approved device.
- Fixes the same Firebase comparison issue for customized bottom navigation labels.
- Automatically publishes an existing customized message or tab label when the older shared settings document does not contain those fields yet.
- Compares saves against the actual Firebase settings document instead of a locally filled fallback copy.
- Keeps the splash and Home message, tab layout, icons, colors, order, and destinations unchanged.
- Does not change inventory, request, distribution, report, or yearly-statistics calculations.

## Install

Upload all included files to the existing GitHub repository, replacing the older files. Keep the `icons` folder. After deployment, open the app and confirm Update 7.8.41 appears on the splash screen or About section. Change the Future Modules message on one device and confirm the updated wording appears on the other approved devices after sync completes.
