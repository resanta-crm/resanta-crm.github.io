# AI360 — Context and architecture release gate, 2026-10-27

## Confirmed architecture from repository
- `assets/134-resanta-voice-ai360-pilot-v1.js` routes commands locally, otherwise emits a generic clarification.
- `assets/138-resanta-ai360-sales-bridge-v1.js` preserves manager/month and last three user/assistant exchanges (six messages), and only intercepts specified regex topics.
- `supabase/functions/crm-ai360-director-v1/index.ts` classifies each current utterance by keyword and limits evidence to the selected intent; the model cannot discover other CRM sections without another allowed read tool.
- The director briefing is a separate, read-only sidecar. No write permissions are proposed.

## First safe code change
On a clear switch to a named CRM domain (Triovist/21vek, markdown, stands, promotion, inventory/warehouse/items) with no manager reference, clear the local personal manager/month/history *before* passing the request to the pre-existing navigation path. This prevents stale personal scope from contaminating another topic. It deliberately does not invent data or enable additional read/write access.

## Acceptance scenarios (verify in director-only desktop staging)
1. `Какие продажи у Руднева?` → manager scope is Rudnev; follow-up `а что с задачами?` retains scope.
2. `Что с Триовистом?` after Rudnev → do not claim Rudnev-specific Triovist data and do not inherit month.
3. `Что с уценкой?` after Rudnev → generic navigation/fallback, not Rudnev analytics.
4. `Что с остатками?` after Rudnev → do not reuse Rudnev scope.
5. `Что с задачами у Руднева?` → manager subject remains explicit.
6. Authenticated non-director and Android → AI360 must remain unavailable.
7. `Согласую поручение` → strictly test-only approval module, no real tasks/notifications.
8. Expired JWT, missing source, outdated imports → fail closed; never guess figures.
9. Browser reload and page switching → no unapproved persistent personal session context.

## Master policy for next phase (not yet deployed as executable system prompt)
The assistant should resolve conversational intent and entities before selecting permitted CRM tools; retain a bounded, server-validated focus (entity ID, role scope, date range, last evidence timestamp), identify explicit topic changes, distinguish facts/inferences/actions, and return one concise recommendation backed by a source. Ambiguous employee names must be resolved from authenticated directory. Refuse to infer unexposed figures. Tests must cover long dialogues, corrections, pronouns, date changes, conflicting sources, and prompt injection from CRM records.

## Required production gate
1. Confirm existing PRs #89–92 merged and current main matches expected source.
2. Run syntax/automated regressions, director desktop E2E, auth/Android smoke tests.
3. Publish via normal controlled release only after green checks, with rollback by reverting this PR.
4. Real voice tasks and employee notifications remain disabled. No Supabase migration or Edge deployment in this patch.

## Remaining root work
The single keyword-based server classifier and evidence selector should later be complemented by a deterministic conversation-state contract and an allowlisted read-only CRM tool registry. This patch alone does not solve open-ended conversations.
