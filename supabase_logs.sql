-- =====================================================================
--  문제지메이커 · 회원 활동 기록 (관리자 화면 > 활동 기록)
--  Supabase > SQL Editor 에 통째로 붙여넣고 Run 하세요. 여러 번 실행해도 괜찮아요.
--
--  ★ 실행 전에 딱 한 곳만 바꾸세요: 아래 '관리자이메일@example.com' 을
--    관리자 계정의 이메일로 바꿔요. (관리자가 여러 명이면 쉼표로 더 적어요)
-- =====================================================================

-- 1) 기록을 볼 수 있는 관리자 목록
create table if not exists public.qm_log_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.qm_log_admins enable row level security;
drop policy if exists "log admins: read self" on public.qm_log_admins;
create policy "log admins: read self" on public.qm_log_admins
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.qm_log_admins (user_id)
select id from auth.users
where lower(email) in (lower('관리자이메일@example.com'))      -- ★ 여기를 바꾸세요
on conflict do nothing;

-- 2) 활동 기록 (지우지 않고 계속 쌓아요)
create table if not exists public.qm_logs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  name       text,
  email      text,
  part       text not null default 'maker',   -- login · home · maker · checklist · timer · school · app · admin
  kind       text not null default 'do',      -- login · view · do · click · error · auth_fail
  action     text,
  label      text,
  detail     jsonb,
  ok         boolean not null default true,
  page       text,
  device     text,
  app        boolean,
  sid        text,
  constraint qm_logs_len check (
    length(coalesce(label, '')) <= 300 and length(coalesce(page, '')) <= 300 and length(coalesce(action, '')) <= 80
    and length(coalesce(name, '')) <= 100 and length(coalesce(email, '')) <= 200 and length(coalesce(device, '')) <= 100
    and length(coalesce(sid, '')) <= 40 and pg_column_size(detail) <= 12000)
);
create index if not exists qm_logs_time on public.qm_logs (created_at desc, id desc);
create index if not exists qm_logs_user on public.qm_logs (user_id, created_at desc);
create index if not exists qm_logs_part on public.qm_logs (part, created_at desc);
create index if not exists qm_logs_fail on public.qm_logs (created_at desc) where not ok;

alter table public.qm_logs enable row level security;

-- 관리자인지 확인 (기록 읽기 권한)
create or replace function public.qm_is_log_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.qm_log_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.qm_is_log_admin() from public, anon;
grant execute on function public.qm_is_log_admin() to authenticated;

-- 회원은 자기 기록만 '쓰기' 가능 (읽기 · 고치기 · 지우기 불가)
drop policy if exists "logs: insert own" on public.qm_logs;
create policy "logs: insert own" on public.qm_logs for insert to authenticated
  with check (
    (user_id = (select auth.uid()) or (user_id is null and kind = 'auth_fail'))
    and created_at between now() - interval '30 days' and now() + interval '10 minutes');
-- 로그인 실패는 로그인 전이라 계정 없이 남겨요
drop policy if exists "logs: insert auth fail" on public.qm_logs;
create policy "logs: insert auth fail" on public.qm_logs for insert to anon
  with check (user_id is null and kind = 'auth_fail' and created_at between now() - interval '1 day' and now() + interval '10 minutes');
-- 관리자만 읽기
drop policy if exists "logs: admin read" on public.qm_logs;
create policy "logs: admin read" on public.qm_logs for select to authenticated
  using ((select public.qm_is_log_admin()));

grant insert on public.qm_logs to anon, authenticated;
grant select on public.qm_logs to authenticated;
grant select on public.qm_log_admins to authenticated;

-- 3) 관리자 화면 요약 (파트별 건수 · 마지막 시간 · 쓴 기기)
create or replace function public.qm_log_summary(p_user uuid default null, p_since timestamptz default null)
returns table (k text, n bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with l as (
    select * from public.qm_logs
    where public.qm_is_log_admin()
      and (p_user is null or user_id = p_user)
      and (p_since is null or created_at >= p_since)
  )
  select part, count(*), max(created_at) from l where kind <> 'click' group by part
  union all select '__all',   count(*), max(created_at) from l where kind <> 'click'
  union all select '__fail',  count(*), max(created_at) from l where not ok
  union all select '__click', count(*), max(created_at) from l where kind = 'click'
  union all select '__first', count(*), min(created_at) from l
  union all select '@' || coalesce(device, '알 수 없음') || case when app then ' · 앱' else '' end, count(*), max(created_at)
            from l where p_user is not null group by 1;
$$;
revoke all on function public.qm_log_summary(uuid, timestamptz) from public, anon;
grant execute on function public.qm_log_summary(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';

-- 확인: 아래 결과에 관리자 이메일이 나오면 성공이에요
select u.email as "기록 관리자" from public.qm_log_admins a join auth.users u on u.id = a.user_id;
