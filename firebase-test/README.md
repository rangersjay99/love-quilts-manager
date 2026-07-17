# Love Quilts Manager — Firebase Sync Test 7.6.0

This is a separate Firebase synchronization test for Faithful Circle Quilters. It is intended only for fake test entries while the regular Love Quilts Manager remains in use.

## Safety separation

- Separate URL under `/firebase-test/`
- Separate service-worker scope
- Separate local-storage keys
- Separate Firestore test organization path
- No automatic import of the regular app's local numbers

## Firebase services

- Email/password Authentication
- Cloud Firestore real-time listeners
- Firestore documents split into settings, transactions, and planned needs

The final production migration must begin with a verified backup from the device holding the correct real data.

Copyright © 2026 Jay. All rights reserved. Personal and authorized guild use only.
