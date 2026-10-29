# RESANTA CONNECT 360° — этап №126 (Витебск)

STATUS: DEVELOPMENT PREVIEW / NOT PRODUCTION READY.
No deployment to main and no production database changes were made as part of this branch.

## Scope
- Pilot for Vitebsk staff only; Gomel is deferred.
- Reuse CRM Supabase Auth and public.users; no second production login.
- Direct and group rooms, official channels created by boss, invitations, text messages, member-only server RLS, optional live inserts.
- Voice messages, attachments, Android push, video, recording and Lera are later stages and NOT implemented here.
- No changes to existing CRM, AI360, GPS, 21vek or №125.

## Files
- schema-pilot.sql: isolated Postgres/Supabase chat tables, RPC functions and RLS. NOT executed anywhere.
- index.html + app.js: development-only UI.
- config.example.js: copy locally as config.js with separate dev Supabase project credentials.
- .gitignore: prevents config.js being committed.
- Preview explicitly rejects the current production project ID.

## Start a SAFE test
1. Provision a separate explicitly approved Supabase dev project; never clone production customer data by default.
2. Create a minimal dev public.users table with id/name/email/role plus RLS for dev accounts, matching the CRM employee identity model.
3. Add only synthetic development auth users and matching public.users rows; do not duplicate real passwords.
4. Apply schema-pilot.sql in the dev project ONLY.
5. Copy config.example.js to config.js with dev publishable key. Never use service_role in a browser.
6. Serve preview from localhost or non-production host.
7. Test under at least two dev accounts and only then open to a five-person pilot.

## Security acceptance tests to run with dev accounts
- A creates a direct room with B; repeated creation returns same room.
- A creates group with B and C; each sees its messages in a separate session.
- A room's non-member cannot read messages or member identities via SQL REST or subscribe to inserts.
- A member cannot spoof another sender_id, insert into another room or directly write room membership.
- Manager cannot create official channel; boss can.
- Only owner can invite members; no one can add users to a direct room.
- Deactivated non-roster user blocked even with valid Supabase Auth session.
- Anonymous room/message read, RPC call and inserts denied.
- Concurrent direct creation gives one room; HTML/script content always rendered as text.
- Existing CRM continues working if CONNECT is offline; no main deployment before separate approval.

## Known limitations
- MVP shows latest 100 messages only. Search, unread counters, pagination, edits, files, alerts and voice are future work.
- Postgres Changes is suitable for early testing but a private Broadcast scheme may be needed for wider scale.
- Integration into existing CRM navigation is NOT part of this isolated first branch.
- Video, recording and Lera are NOT yet implemented.
- After staging tests, run security advisors and a separate review before any prod migration.

## Future phases
- №126: private text chats first; files, notifications and Android tests after proof of access.
- №127: audio/video, screen sharing and consentful recording using LiveKit.
- №128: Lera controls and meeting summaries; action creation needs confirmation.
- №129: expand beyond five staff; Gomel onboarding only when ready.

All decisions must preserve current CRM permissions and release-by-approval discipline.
