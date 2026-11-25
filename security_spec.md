# DopTube Firestore Security Specification (Phase 0)

## Data Invariants
1. **Master Gate & PII Isolation**: `users/{userId}/private/info` contains email PII and is strictly readable/writable only by `userId == request.auth.uid` or verified admin. Public profiles live separately at `users/{userId}/public/profile`.
2. **Identity Integrity**: Every document write enforces `incoming().uid == request.auth.uid` and `isValidId(userId)`.
3. **Immutable Ownership & Temporal Integrity**: `createdAt` and `uid` cannot be altered after creation; `createdAt` and `updatedAt` must equal `request.time`.
4. **No Self-Assigned Roles**: Users cannot write to `/admins/{adminId}` or inject `role`/`isAdmin` shadow keys into profile documents.
5. **Verified Google Users Only**: All writes require `request.auth.token.email_verified == true`.
6. **Bounded Arrays & String Lengths**: Every string enforces `.size()` bounds; `selectedInterests` is capped at `<= 15` items with first-element type checks when non-empty.

## Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. Unauthenticated read/write to `/users/u1/private/info`.
2. Reading another user's `/users/u2/private/info` while signed in as `u1`.
3. Spoofed email without `email_verified == true`.
4. Shadow update adding `isAdmin: true` or `role: "admin"` to `/users/u1/public/profile`.
5. Identity spoofing writing `uid: "u2"` inside `/user_preferences/u1`.
6. Modifying immutable `createdAt` during an update to `/users/u1/private/info`.
7. Client-forged timestamp (`updatedAt: "2020-01-01T00:00:00Z"`) instead of server timestamp.
8. Oversized ID path poisoning (`1500`-char `{userId}` segment).
9. Oversized `displayName` (`> 100` chars) to exhaust storage.
10. Unbounded `selectedInterests` array (`> 15` items) or non-string array element `[123]`.
11. Self-promotion write to `/admins/u1` by a non-admin user.
12. Blanket `list` scraping of `/user_preferences` without `resource.data.uid == request.auth.uid`.
