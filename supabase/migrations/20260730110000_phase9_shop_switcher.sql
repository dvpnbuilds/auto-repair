begin;

set local search_path = auto_repair, public;

create or replace function set_active_autoshop(p_shop_key text)
returns jsonb
language plpgsql
security definer
set search_path = auto_repair, public
as $$
declare
  target_shop autoshop_shops%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('autoshop-active-shop', 0));

  select *
    into target_shop
    from autoshop_shops
    where shop_key = p_shop_key
    for update;

  if not found then
    raise exception 'Shop not found';
  end if;

  update autoshop_shops
    set is_active = false
    where is_active = true;

  update autoshop_shops
    set is_active = true
    where id = target_shop.id
    returning * into target_shop;

  return to_jsonb(target_shop);
end;
$$;

revoke all on function set_active_autoshop(text)
  from public, anon, authenticated;
grant execute on function set_active_autoshop(text)
  to service_role;

commit;

notify pgrst, 'reload schema';
