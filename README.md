# Love Quilts Manager

Current release: Update 7.8.68 — November 14, 2026

## Update 7.8.65 — polished reports, easier sharing, and sync recovery

- Adds a prominent **Share This Report** button directly inside Inventory & Quilts Requested, Yearly Quilt Summary, and Distributed & Adjustments.
- Creates a separate polished PDF for each of those report sections.
- Keeps the exact most recently created PDF at the top of Reports with **Share Again** and **Open Again**, including after the app is reopened when device storage allows.
- Gives the complete report a cleaner plum-branded header, summary cards, section bands, readable tables, totals, and page footers.
- Reorganizes Report Downloads around the two common choices: share immediately or open the PDF.
- Clearly separates sync states: syncing, saved on this device, offline and waiting, synced, and error.
- Recovers from a delayed Firebase confirmation after the server has already acknowledged the save, preventing a stale “Syncing…” display.
- Automatically checks shared data again when the internet connection returns.
- Does not change inventory totals, needs logic, operational records, or Firebase paths.

Update 7.8.64 Home quick-access reporting and daily charity totals remain in place.

Copyright © 2026 Jay. Love Quilts Manager. All rights reserved.
Personal and authorized guild use only. See LICENSE.txt.

## Update 7.8.66

The sign-in screen includes Forgot password? Enter the approved account email and tap it to receive a Firebase password reset link.

## Update 7.8.67 — custom report totals by size

When a Custom Report hides Charity and shows Quilt size and Quantity, current inventory is now grouped by size and the quantities across charities are added together. If Charity is shown, the report keeps the separate charity-size rows. Existing inventory, needs, Firebase paths, and saved data are unchanged.

## Update 7.8.68

Choose Total made or In inventory in Reports > Quilts by size to see counts for every size across all charities.
