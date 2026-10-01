-- Who Owes Who? V2 — Supabase schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'You',
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null check (amount > 0 and amount <= 1000000000),
  expense_date date not null default current_date,
  payer_person_id uuid not null references people(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists expense_members (
  expense_id uuid not null references expenses(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (expense_id,person_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_person_id uuid not null references people(id),
  to_person_id uuid not null references people(id),
  amount numeric(14,2) not null check (amount > 0 and amount <= 1000000000),
  payment_date date not null default current_date,
  note text,
  status text not null default 'confirmed' check (status in ('pending','confirmed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table people enable row level security;
alter table expenses enable row level security;
alter table expense_members enable row level security;
alter table payments enable row level security;

create or replace function is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from group_members gm where gm.group_id=gid and gm.user_id=auth.uid());
$$;

drop policy if exists "profile self" on profiles;
create policy "profile self" on profiles for all using (id=auth.uid()) with check (id=auth.uid());

drop policy if exists "groups visible to members" on groups;
create policy "groups visible to members" on groups for select using (is_group_member(id));
drop policy if exists "authenticated can create groups" on groups;
create policy "authenticated can create groups" on groups for insert to authenticated with check (created_by=auth.uid());
drop policy if exists "owners update groups" on groups;
create policy "owners update groups" on groups for update using (
  exists(select 1 from group_members gm where gm.group_id=id and gm.user_id=auth.uid() and gm.role='owner')
);

drop policy if exists "members visible" on group_members;
create policy "members visible" on group_members for select using (is_group_member(group_id));
drop policy if exists "self join" on group_members;
create policy "self join" on group_members for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "members update self" on group_members;
create policy "members update self" on group_members for update using (user_id=auth.uid());

drop policy if exists "people group access" on people;
create policy "people group access" on people for all using (is_group_member(group_id)) with check (is_group_member(group_id));

drop policy if exists "expenses group access" on expenses;
create policy "expenses group access" on expenses for all using (is_group_member(group_id)) with check (is_group_member(group_id));

drop policy if exists "expense members access" on expense_members;
create policy "expense members access" on expense_members for all using (
  exists(select 1 from expenses e where e.id=expense_id and is_group_member(e.group_id))
) with check (
  exists(select 1 from expenses e where e.id=expense_id and is_group_member(e.group_id))
);

drop policy if exists "payments group access" on payments;
create policy "payments group access" on payments for all using (is_group_member(group_id)) with check (is_group_member(group_id));

create or replace function create_group_with_me(group_name text, my_name text)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare gid uuid; pid uuid;
begin
  insert into groups(name,created_by) values(group_name,auth.uid()) returning id into gid;
  insert into group_members(group_id,user_id,display_name,role) values(gid,auth.uid(),my_name,'owner');
  insert into people(group_id,linked_user_id,name) values(gid,auth.uid(),my_name) returning id into pid;
  return gid;
end $$;

create or replace function join_group_by_code(code text, my_name text)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare gid uuid;
begin
  select id into gid from groups where invite_code=upper(trim(code));
  if gid is null then raise exception 'Invalid invite code'; end if;
  insert into group_members(group_id,user_id,display_name,role)
  values(gid,auth.uid(),my_name,'member') on conflict(group_id,user_id) do nothing;
  if not exists(select 1 from people where group_id=gid and linked_user_id=auth.uid()) then
    insert into people(group_id,linked_user_id,name) values(gid,auth.uid(),my_name);
  end if;
  return gid;
end $$;
