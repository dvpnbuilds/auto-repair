begin;

set local search_path = auto_repair, public;

alter table autoshop_shops
  add column if not exists tagline text,
  add column if not exists phone text,
  add column if not exists hours text;

update autoshop_shops
  set tagline = 'Straight answers for the road ahead.',
      phone = '(512) 555-0108',
      hours = 'Mon–Fri, 7:30 AM–6:00 PM · Sat, 8:00 AM–2:00 PM'
  where shop_key = 'us';

update autoshop_shops
  set tagline = 'Clear car care, from first check to final update.',
      phone = '+63 2 8555 0148',
      hours = 'Mon–Sat, 8:00 AM–6:00 PM'
  where shop_key = 'ph';

do $$
begin
  if exists (
    select 1
    from autoshop_shops
    where nullif(trim(tagline), '') is null
      or nullif(trim(phone), '') is null
      or nullif(trim(hours), '') is null
  ) then
    raise exception 'BRAND_CONFIG_REQUIRED';
  end if;
end;
$$;

alter table autoshop_shops
  alter column tagline set not null,
  alter column phone set not null,
  alter column hours set not null;

alter table autoshop_shops
  add constraint autoshop_shops_tagline_length
    check (char_length(trim(tagline)) between 1 and 160),
  add constraint autoshop_shops_phone_length
    check (char_length(trim(phone)) between 1 and 40),
  add constraint autoshop_shops_hours_length
    check (char_length(trim(hours)) between 1 and 160);

notify pgrst, 'reload schema';

commit;
