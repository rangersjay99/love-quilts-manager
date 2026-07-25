# Love Quilts Manager

Current release: **Update 7.8.26 — Two-Device Sync Verification Hotfix — July 24, 2026**

## Update 7.8.26

- Fixes the case where the sync banner turned green even though the other device had not received the corrected numbers.
- Green now appears only after Firebase returns a server-confirmed copy that matches the device.
- **Sync Now chooses the safe direction:** the device containing the proven full distribution repairs Firebase; a stale second device receives the latest shared copy instead of uploading its older copy.
- A repair sync rewrites both the linked inventory transactions and charity-need records.
- Record comparison ignores harmless transaction/need ordering differences between devices.
- Retains the complete distributed quantity above the original request and all 7.8.23 review screens.
- No Firestore Rules, Firebase paths, sign-ins, or database recreation are required.

Upload all files inside this folder to the root of the GitHub Pages repository, replacing matching files. Do not upload the outer folder as a subfolder.
