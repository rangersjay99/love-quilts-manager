# Love Quilts Manager

Current release: **Update 7.8.21 — Weekend Test Build — July 24, 2026**

## Update 7.8.21

This build completes the remaining phone-session items intended for weekend testing:

- Adds a **Change Log** in Settings with the current version and newest-first release notes.
- Moves the Calendar color/status key to the **bottom of both Calendars**.
- Adds direct actions when a Calendar request is tapped:
  - **Edit Need**
  - **Distribute Quilts**
  - **View Details**
- Direct Calendar distribution prefills the selected charity, size, and month and uses the existing distribution safeguards.
- Adds **On Hold / Storage** for quilts that leave active inventory but are not yet distributed:
  - Move quilts from active inventory to a hold location/reason.
  - Return some or all held quilts to active inventory.
  - Distribute some or all held quilts without deducting active inventory a second time.
  - Hold activity remains visible in History and Reports.
- Adds a Home shortcut and count for **On Hold / Storage**.
- Retains the direct **+ Add Quilts** button on the Available in Storage summary card.
- Adds a dedicated **Print 12-Month Calendar** button with a landscape, one-page 3×4 layout.
- Improves **Print Summary** on iPhone so the summary is prepared before the print dialog and remains compact enough for one-page printing.
- Retains the verified Calendar colors from 7.8.20:
  - Past met: light green.
  - Past unmet: light red.
  - Future open: light yellow.
  - Future covered early: light green.
  - Current month: bold plum border.
  - Charity met/short sections: green/red.
- Retains Sync Now, Set Current Count, yearly statistics, alternating report shading, zero-balance handling, and distribution safeguards.
- Syncs On Hold / Storage records and protected hold links through the existing Firebase paths; no Firestore Rules change is required.

See `WEEKEND_TEST_CHECKLIST.txt` for the recommended live-device checks.

Copyright © 2026 Jay. Love Quilts Manager. All rights reserved.
Personal and authorized guild use only. See LICENSE.txt.
