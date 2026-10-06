-- RESANTA CRM v23.6.231
-- Force monthly Triovist subgroup planning to use the canonical server-side candidate engine.
-- Legacy client candidates are accepted for API compatibility but never used for business logic.

CREATE OR REPLACE FUNCTION public.triovist_tasks_generate_subgroup_v227319(p_manager_email text, p_target_count integer, p_month_end date, p_rows jsonb, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
    _manager text := lower(trim(coalesce(p_manager_email,'')));
    _target integer := coalesce(p_target_count,10);
    _month_end date := p_month_end;
    _month_start date;
    _active text[] := array['pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'];

    _server_pack jsonb := '{}'::jsonb;
    _source_rows jsonb := '[]'::jsonb;
    _client_received integer := 0;
    _row jsonb;
    _ctx jsonb;
    _key text;
    _sku text;
    _group text;
    _constraint text;
    _insert_result jsonb;
    _task_id text;

    _deleted integer := 0;
    _archived_rules integer := 0;
    _locked integer := 0;
    _need integer := 0;
    _created integer := 0;
    _processed integer := 0;
    _skip_dup integer := 0;
    _skip_rules integer := 0;
    _received integer := 0;

    _keys text[] := array[]::text[];
    _task_keys text[] := array[]::text[];
    _created_ids jsonb := '[]'::jsonb;
begin
    if _manager not in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
        raise exception 'v23.6.231 STOP: unsupported manager %', _manager;
    end if;
    if _target not in (8,10,12,15) then
        raise exception 'v23.6.231 STOP: target must be 8, 10, 12 or 15';
    end if;
    if _month_end is null
       or _month_end <> (date_trunc('month',_month_end)::date + interval '1 month - 1 day')::date
    then
        raise exception 'v23.6.231 STOP: p_month_end must be the last day of a month';
    end if;
    if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
        raise exception 'v23.6.231 STOP: p_rows must be a JSON array';
    end if;

    _month_start := date_trunc('month',_month_end)::date;
    _client_received := jsonb_array_length(coalesce(p_rows,'[]'::jsonb));

    -- v23.6.231: client-side candidate lists are ignored on purpose.
    -- The server recalculates the canonical monthly candidate pack so a stale
    -- browser cache can never restore the legacy v22.7.31.9 business logic.
    _server_pack := public.triovist_tasks_month_candidates_v236210(_manager,_target);
    _source_rows := coalesce(_server_pack->'candidates','[]'::jsonb);
    if jsonb_typeof(_source_rows) <> 'array' then
      raise exception 'v23.6.231 STOP: server candidates are invalid';
    end if;
    _received := jsonb_array_length(_source_rows);

    -- Historical rule-CRM tasks which are still awaiting approval are archived,
    -- not deleted. They are replaced by the subgroup commercial plan.
    update public.triovist_ai_tasks t
       set status='cancelled'
     where lower(coalesce(t.manager_email,'')) = _manager
       and t.status='pending_approval'
       and t.created_at >= _month_start::timestamptz
       and t.created_at < (_month_start + interval '1 month')
       and coalesce(t.ai_state,'')='rule';
    get diagnostics _archived_rules = row_count;

    -- Replace only UNSAPPROVED generated plans for the same manager/month.
    -- Old SKU plan v22.7.31.8 is intentionally removed here when still pending.
    delete from public.triovist_ai_tasks t
     where lower(coalesce(t.manager_email,'')) = _manager
       and t.status='pending_approval'
       and t.created_at >= _month_start::timestamptz
       and t.created_at < (_month_start + interval '1 month')
       and (
           coalesce(t.candidate_key,'') like 'v227313|%'
           or coalesce(t.candidate_key,'') like 'v227318|%'
           or coalesce(t.candidate_key,'') like 'v227319|%'
       );
    get diagnostics _deleted = row_count;

    -- Only already-approved subgroup-plan tasks count toward the subgroup target.
    -- Approved legacy SKU tasks remain untouched, but do not reduce the number
    -- of subgroup objectives. Their SKU are excluded by the client engine.
    select count(*)::integer
      into _locked
      from public.triovist_ai_tasks t
     where lower(coalesce(t.manager_email,'')) = _manager
       and t.status = any(array['new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue']::text[])
       and t.created_at >= _month_start::timestamptz
       and t.created_at < (_month_start + interval '1 month')
       and coalesce(t.candidate_key,'') like 'v227319|%';

    _need := greatest(0,_target-_locked);

    -- One snapshot of active task keys. UNIQUE collisions are also handled
    -- below, so a legacy row can never abort the whole plan generation.
    select
        coalesce(array_agg(distinct nullif(t.candidate_key,'')) filter (where nullif(t.candidate_key,'') is not null),array[]::text[]),
        coalesce(array_agg(distinct nullif(t.task_key,'')) filter (where nullif(t.task_key,'') is not null),array[]::text[])
      into _keys,_task_keys
      from public.triovist_ai_tasks t
     where lower(coalesce(t.manager_email,'')) = _manager
       and t.status = any(_active);

    if _need <= 0 then
        return jsonb_build_object(
            'version','v23.6.231',
            'manager_email',_manager,
            'target_count',_target,
            'month_end',_month_end,
            'deleted_pending',_deleted,
            'archived_rule_tasks',_archived_rules,
            'locked_subgroup_tasks',_locked,
            'created',0,
            'created_task_ids','[]'::jsonb,
            'received_candidates',_received,
        'client_candidates_ignored',_client_received,
        'server_candidate_source','triovist_tasks_month_candidates_v236210',
            'processed_candidates',0,
            'skipped_duplicates',0,
            'skipped_rules',0,
            'runtime_insert_check',true
        );
    end if;

    -- Client sends target subgroups first and up to five reserve subgroups.
    for _row in
        select x.value
          from jsonb_array_elements(_source_rows) with ordinality as x(value,ord)
         order by x.ord
         limit 20
    loop
        exit when _created >= _need;
        _processed := _processed + 1;

        if lower(trim(coalesce(_row->>'manager_email',''))) <> _manager then
            _skip_rules := _skip_rules + 1;
            continue;
        end if;

        _key := trim(coalesce(_row->>'candidate_key',''));
        _sku := trim(coalesce(_row->>'sku',''));
        _group := trim(coalesce(_row->>'group_name',''));
        _ctx := coalesce(_row->'commercial_context','{}'::jsonb);

        if _key=''
           or _key not like 'v227319|%'
           or _sku=''
           or _group=''
           or _sku ~* '^900(/|$)'
           or _group ~* '(^|[^0-9])900[[:space:]]*(группа|гр\.?)'
           or coalesce(_ctx->>'task_scope','') <> 'subgroup'
           or coalesce(
                case when coalesce(_ctx->>'selected_sku_count','') ~ '^[0-9]+$'
                     then (_ctx->>'selected_sku_count')::integer else 0 end,
                0
              ) <= 0
           or (
                coalesce(
                  case when coalesce(_ctx->>'own_qty','') ~ '^-?[0-9]+([.][0-9]+)?$'
                       then (_ctx->>'own_qty')::numeric else 0 end,
                  0
                ) <= 0
                and not (
                  coalesce((_ctx->>'partner_stock_available')::boolean,false)
                  and coalesce(
                    case when coalesce(_ctx->>'partner_total','') ~ '^-?[0-9]+([.][0-9]+)?$'
                         then (_ctx->>'partner_total')::numeric else 0 end,
                    0
                  ) > 0
                )
              )
        then
            _skip_rules := _skip_rules + 1;
            continue;
        end if;

        if _key = any(_keys) or _key = any(_task_keys) then
            _skip_dup := _skip_dup + 1;
            continue;
        end if;

        _ctx := _ctx || jsonb_build_object(
            'task_scope','subgroup',
            'plan_month',to_char(_month_end,'YYYY-MM'),
            'plan_due_date',_month_end,
            'plan_target',_target,
            'generation_meta',coalesce(_server_pack-'candidates','{}'::jsonb) || jsonb_build_object(
              'server_source','triovist_tasks_month_candidates_v236210',
              'server_forced',true,
              'client_candidates_ignored',_client_received
            )
        );

        _row := jsonb_set(_row,'{commercial_context}',_ctx,true);
        _row := jsonb_set(_row,'{due_date}',to_jsonb(_month_end),true);
        _row := jsonb_set(_row,'{generator_version}',to_jsonb('v23.6.231'::text),true);
        _row := jsonb_set(_row,'{task_key}',to_jsonb(_key),true);
        _row := _row - 'priority_label' - 'ai_state' - 'source' - 'source_type';

        begin
            _insert_result := public.triovist_task_insert_adaptive_v227313(_row,false);
        exception
            when unique_violation then
                get stacked diagnostics _constraint = constraint_name;
                if _constraint='triovist_ai_tasks_one_active_key_idx' then
                    _skip_dup := _skip_dup + 1;
                    continue;
                end if;
                raise;
        end;

        if coalesce((_insert_result->>'inserted')::boolean,false) then
            _task_id := nullif(_insert_result->>'task_id','');
            if _task_id is null then
                raise exception 'v23.6.231 STOP: insert succeeded without task id for %',_key;
            end if;
            _created := _created + 1;
            _created_ids := _created_ids || jsonb_build_array(_task_id);
            _keys := array_append(_keys,_key);
            _task_keys := array_append(_task_keys,_key);
        end if;
    end loop;

    return jsonb_build_object(
        'version','v23.6.231',
        'manager_email',_manager,
        'target_count',_target,
        'month_end',_month_end,
        'deleted_pending',_deleted,
        'archived_rule_tasks',_archived_rules,
        'locked_subgroup_tasks',_locked,
        'needed_new_tasks',_need,
        'created',_created,
        'created_task_ids',_created_ids,
        'received_candidates',_received,
        'processed_candidates',_processed,
        'skipped_duplicates',_skip_dup,
        'skipped_rules',_skip_rules,
        'runtime_insert_check',true
    );
end
$function$
