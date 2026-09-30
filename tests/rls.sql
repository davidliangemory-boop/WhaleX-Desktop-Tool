set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$ declare r jsonb; begin
 r:=public.whalex_apply_record('test-note','note','{"title":"A","content":"private"}',false,null,'00000000-0000-4000-8000-000000000101');
 if r->>'status'<>'applied' or (r->'record'->>'version')::int<>1 then raise exception 'insert failed'; end if;
 r:=public.whalex_apply_record('test-note','note','{"title":"A","content":"updated"}',false,1,'00000000-0000-4000-8000-000000000102');
 if (r->'record'->>'version')::int<>2 then raise exception 'version not incremented'; end if;
 r:=public.whalex_apply_record('test-note','note','{"title":"A","content":"updated"}',false,1,'00000000-0000-4000-8000-000000000102');
 if (r->'record'->>'version')::int<>2 or r->>'status'<>'applied' then raise exception 'retry not idempotent'; end if;
 r:=public.whalex_apply_record('test-note','note','{"title":"A","content":"stale"}',false,1,'00000000-0000-4000-8000-000000000103');
 if r->>'status'<>'conflict' or r->'record'->'payload'->>'content'<>'updated' then raise exception 'conflict lost data'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$ declare total int; begin
 select count(*) into total from public.whalex_records;
 if total<>0 then raise exception 'B can read A records'; end if;
 begin
  insert into public.whalex_records(user_id,id,kind,payload,mutation_id) values('00000000-0000-4000-8000-000000000001','intrusion','note','{}','00000000-0000-4000-8000-000000000104');
  raise exception 'B can write A records';
 exception when insufficient_privilege then null;
 end;
 perform public.whalex_apply_record('test-note','note','{"title":"B","content":"own"}',false,null,'00000000-0000-4000-8000-000000000105');
 select count(*) into total from public.whalex_records;
 if total<>1 then raise exception 'per-user IDs not isolated'; end if;
end $$;
reset role;
set role anon;
do $$ begin
 begin
  perform count(*) from public.whalex_records;
  raise exception 'anon read should fail';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.whalex_apply_record('x','note','{}',false,null,'00000000-0000-4000-8000-000000000106');
  raise exception 'anon RPC should fail';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'RLS isolation, versions, conflicts and idempotency passed' as result;
