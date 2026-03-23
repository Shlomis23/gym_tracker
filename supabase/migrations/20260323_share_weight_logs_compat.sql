-- Compatibility RPC for share-mode weight logs when legacy schemas don't support measured_at ordering.

create or replace function public.share_get_weight_logs_compat(p_share_token text)
returns setof public.body_weight_logs
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_has_measured_at boolean;
  v_has_measured_date boolean;
  v_has_date boolean;
  v_order_expr text;
  v_sql text;
begin
  v_owner_id := public.resolve_share_owner_id(p_share_token);
  if v_owner_id is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'body_weight_logs'
      and column_name = 'measured_at'
  ) into v_has_measured_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'body_weight_logs'
      and column_name = 'measured_date'
  ) into v_has_measured_date;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'body_weight_logs'
      and column_name = 'date'
  ) into v_has_date;

  if v_has_measured_at then
    v_order_expr := 'bwl.measured_at';
  elsif v_has_measured_date then
    v_order_expr := '(bwl.measured_date::text || ''T09:00:00Z'')::timestamptz';
  elsif v_has_date then
    v_order_expr := 'bwl.date';
  else
    v_order_expr := 'bwl.id::text';
  end if;

  v_sql := format(
    'select bwl.* from public.body_weight_logs bwl where bwl.user_id = $1 order by %s asc nulls last',
    v_order_expr
  );

  return query execute v_sql using v_owner_id;
end;
$$;

grant execute on function public.share_get_weight_logs_compat(text) to anon, authenticated;
