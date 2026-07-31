\set ON_ERROR_STOP on

do $$
declare
  required_table text;
  required_function text;
begin
  if to_regnamespace('auto_repair') is null then
    raise exception 'BASELINE_MISMATCH: auto_repair schema is missing';
  end if;

  foreach required_table in array array[
    'autoshop_shops',
    'autoshop_services',
    'autoshop_jobs',
    'autoshop_status_history',
    'autoshop_messages',
    'autoshop_email_deliveries',
    'autoshop_tracker_attempts',
    'autoshop_api_attempts'
  ]
  loop
    if to_regclass(format('auto_repair.%I', required_table)) is null then
      raise exception 'BASELINE_MISMATCH: %.% is missing',
        'auto_repair',
        required_table;
    end if;
  end loop;

  foreach required_function in array array[
    'auto_repair.set_active_autoshop(text)',
    'auto_repair.lookup_autoshop_job(uuid,text,text)',
    'auto_repair.reserve_autoshop_email_delivery(uuid,uuid,uuid,text,text,text,integer)',
    'auto_repair.complete_autoshop_email_delivery(uuid,text,text,text)',
    'auto_repair.create_autoshop_booking(uuid,text,text,text,text,text,uuid,text,text,text,text,text)',
    'auto_repair.transition_autoshop_job(uuid,uuid,text,text,text,text,text,integer)'
  ]
  loop
    if to_regprocedure(required_function) is null then
      raise exception 'BASELINE_MISMATCH: function % is missing',
        required_function;
    end if;
  end loop;
end;
$$;

select 'BASELINE_OK' as result;
