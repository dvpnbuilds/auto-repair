begin;

set local search_path = auto_repair, public;

do $$
declare
  target_shop autoshop_shops%rowtype;
  invalid_rejected boolean := false;
begin
  select * into target_shop
    from autoshop_shops
    where is_active = true
    limit 1;
  if target_shop.id is null then raise exception 'TEST_SETUP_FAILED'; end if;
  if nullif(trim(target_shop.tagline), '') is null
    or nullif(trim(target_shop.phone), '') is null
    or nullif(trim(target_shop.hours), '') is null then
    raise exception 'SHOP_BRAND_BACKFILL_FAILED';
  end if;

  begin
    update autoshop_shops
      set tagline = ''
      where id = target_shop.id;
  exception when check_violation then
    invalid_rejected := true;
  end;
  if not invalid_rejected then
    raise exception 'SHOP_BRAND_VALIDATION_FAILED';
  end if;

  if not has_table_privilege(
    'anon', 'auto_repair.autoshop_shops', 'select'
  ) then raise exception 'SHOP_BRAND_PUBLIC_READ_FAILED'; end if;
end;
$$;

rollback;

select 'PHASE14_DATABASE_BEHAVIOR_OK' as result;
