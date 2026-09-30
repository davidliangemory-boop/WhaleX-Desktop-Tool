-- Run once in your own Supabase SQL Editor. No secrets belong in this file.
-- Existing data is not dropped. Requires Supabase Auth and PostgreSQL.
begin;
create table if not exists public.whalex_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,120}$'),
  kind text not null check (kind in ('note','library')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2097152),
  deleted boolean not null default false,
  version bigint not null default 1 check (version > 0),
  mutation_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.whalex_records enable row level security;
revoke all on public.whalex_records from anon, authenticated;
grant select, insert, update on public.whalex_records to authenticated;
drop policy if exists whalex_owner_select on public.whalex_records;
drop policy if exists whalex_owner_insert on public.whalex_records;
drop policy if exists whalex_owner_update on public.whalex_records;
create policy whalex_owner_select on public.whalex_records for select to authenticated using ((select auth.uid()) = user_id);
create policy whalex_owner_insert on public.whalex_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy whalex_owner_update on public.whalex_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.whalex_apply_record(
  p_id text, p_kind text, p_payload jsonb, p_deleted boolean, p_base bigint, p_mutation uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r public.whalex_records; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_base is null then
    insert into public.whalex_records(user_id,id,kind,payload,deleted,version,mutation_id)
      values(uid,p_id,p_kind,p_payload,p_deleted,1,p_mutation)
      on conflict (user_id,id) do nothing returning * into r;
    if found then return jsonb_build_object('status','applied','record',to_jsonb(r)); end if;
  end if;
  -- Lock the row so version comparison and update are atomic.
  select * into r from public.whalex_records where user_id=uid and id=p_id for update;
  if not found then raise exception 'Record missing; restore from local backup'; end if;
  -- Idempotent retry after a timeout; server-assigned versions avoid clock skew.
  if r.mutation_id = p_mutation or
     (p_base is null and r.kind=p_kind and r.payload=p_payload and r.deleted=p_deleted) then
    return jsonb_build_object('status','applied','record',to_jsonb(r));
  end if;
  if p_base is distinct from r.version then
    return jsonb_build_object('status','conflict','record',to_jsonb(r));
  end if;
  update public.whalex_records set kind=p_kind,payload=p_payload,deleted=p_deleted,
    version=version+1,mutation_id=p_mutation,updated_at=now()
    where user_id=uid and id=p_id returning * into r;
  return jsonb_build_object('status','applied','record',to_jsonb(r));
end; $$;
revoke all on function public.whalex_apply_record(text,text,jsonb,boolean,bigint,uuid) from public, anon;
grant execute on function public.whalex_apply_record(text,text,jsonb,boolean,bigint,uuid) to authenticated;
commit;
