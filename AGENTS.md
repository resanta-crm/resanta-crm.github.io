# CRM Tasks change contract — agreed 16 November 2026

Scope: Tasks and task counters/navigation in Control Center only. Do not change other business sections.
Preserve existing task IDs, text, reports, original evidence and status. Never delete, recreate, auto-close or relabel historical completion as 1C verification during UI migration.
History contains ALL scoped task states across all dates, including missing/archived client cards. Pending, superseded and cancelled records remain discoverable.
Control Center overdue counter and its destination MUST use the same scoped records and overdue predicate. Carry-over cannot disappear on Monday. Do not deduplicate separate obligations only for display.
Approved weekly denominators stay traceable; cancelled tasks are not successful. Historical recorded completion is labelled separately from verified 1C shipments. Shelf checks never complete a shipment.
Create flow: manager → approved route day → prepare whole route → compact editable review → explicit confirmation. Exclude networks, preserve linked identities, no writes from preparation.
Before approval allow SKU search, add, remove, replace, quantities, title and result. Revalidate changed plans server-side against current stock. Keep other client drafts intact.
November–March: prioritize the actual climate/heating assortment when compatible with client evidence. Category metadata is imperfect: inspect canonical product/subgroup. Summer garden/washers require an explicit recorded reason; history alone is insufficient. Do not force heating on an unrelated client.
Test historical visibility, missing client, pagination, role scope, counter/list parity, 25/50 percentage, partial versus complete, SKU changes and seasonal exclusions. Run database fixture checks with rollback; inspect deployed UI. Do not claim hardware/voice tests not performed.
