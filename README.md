# Love Quilts Manager

Current release: Update 7.8.15 — July 23, 2026

## Update 7.8.15 — Completed-distribution inventory repair

- Fixes a case where a charity request was already marked distributed but the matching quilts were never removed from inventory.
- Inventory removal now compares the distributed quantity with the quantity actually recorded out, rather than the earlier distributed high-water mark.
- Reopen the affected request, choose Mark Distributed, leave the removal box checked, and save. The missing quantity will be removed once and the remaining balance will be confirmed.
- Prevents the same automatic inventory removal from being applied twice.
- Existing inventory, requests, reports, settings, and Firebase synchronization are retained.

Copyright © 2026 Jay. Love Quilts Manager. All rights reserved.
Personal and authorized guild use only. See LICENSE.txt.
