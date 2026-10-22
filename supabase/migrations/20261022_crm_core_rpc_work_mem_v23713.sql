-- v23.7.13 | 2026-10-22
-- Local SQL sort budget for two high-cardinality core RPCs.
-- Does not alter users, tasks, routes, RLS, values, or function bodies.
-- Original global work_mem remains unchanged (2184kB).
ALTER FUNCTION public.crm_core_tasks_v236341() SET work_mem='8MB';
ALTER FUNCTION public.crm_core_routes_v236341() SET work_mem='8MB';
