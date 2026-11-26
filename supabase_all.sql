-- =============================================================
--  문제지메이커 공부도구 전체 테이블 (체크리스트 + 학교생활 + 공부 기록)
--  이 파일 하나만 SQL Editor 에서 Run 하면 돼요. 여러 번 실행해도 안전해요.
--  메인 사이트와 같은 Supabase 프로젝트(acpeizbniyvbohkgaazz)에서 실행해 주세요
-- =============================================================

-- =============================================================
--  문제지메이커 · 공부도구 (체크리스트) 테이블
--  Supabase 대시보드 → SQL Editor → New query 에 전부 붙여넣고 Run
--  여러 번 실행해도 안전해요 (이미 있으면 건너뜀)
-- =============================================================

-- 1) 과목 (계정마다 따로)
create table if not exists public.tools_subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 20),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- 2) 할 일 (날짜별)
create table if not exists public.tools_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  title       text not null check (char_length(btrim(title)) between 1 and 100),
  subject_id  uuid references public.tools_subjects(id) on delete set null,
  minutes     int  check (minutes between 0 and 600),
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists tools_tasks_user_day on public.tools_tasks (user_id, day);
create index if not exists tools_subjects_user on public.tools_subjects (user_id, sort);

-- 3) 보안: 로그인한 본인 것만 보고 쓰고 지울 수 있게 (RLS)
alter table public.tools_subjects enable row level security;
alter table public.tools_tasks    enable row level security;

drop policy if exists "own subjects" on public.tools_subjects;
create policy "own subjects" on public.tools_subjects
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own tasks" on public.tools_tasks;
create policy "own tasks" on public.tools_tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (
      select 1 from public.tools_subjects s
      where s.id = subject_id and s.user_id = (select auth.uid())
    ))
  );

-- 4) 로그인 안 한 방문자(anon)는 접근 못 하게, 로그인한 회원만 사용
revoke all on public.tools_subjects, public.tools_tasks from anon;
grant select, insert, update, delete on public.tools_subjects, public.tools_tasks to authenticated;

-- 확인용: 아래가 둘 다 true 로 나오면 끝

-- =============================================================
--  문제지메이커 · 공부도구 1단계 (학교생활) 테이블
--  Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run
--  여러 번 실행해도 안전해요
-- =============================================================

-- 1) 내 학교 설정 (계정마다 한 줄)
create table if not exists public.tools_profile (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  edu_code     text,          -- 시도교육청 코드 (예: B10)
  school_code  text,          -- 학교 코드
  school_name  text,
  school_kind  text,          -- 초등학교 / 중학교 / 고등학교
  grade        int check (grade between 1 and 6),
  class_nm     text,
  allergies    int[] not null default '{}',   -- 피해야 할 알레르기 번호 (1~19)
  updated_at   timestamptz not null default now()
);

-- 2) 내가 직접 추가한 D-day (수능, 모의고사, 수행평가 등)
create table if not exists public.tools_ddays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 30),
  day         date not null,
  created_at  timestamptz not null default now()
);
create index if not exists tools_ddays_user_day on public.tools_ddays (user_id, day);

-- 3) 보안: 본인 것만
alter table public.tools_profile enable row level security;
alter table public.tools_ddays   enable row level security;

drop policy if exists "own profile" on public.tools_profile;
create policy "own profile" on public.tools_profile
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own ddays" on public.tools_ddays;
create policy "own ddays" on public.tools_ddays
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.tools_profile, public.tools_ddays from anon;
grant select, insert, update, delete on public.tools_profile, public.tools_ddays to authenticated;

-- =============================================================
--  문제지메이커 · 공부도구 2단계 (공부 타이머 · 기록) 테이블
--  Supabase 대시보드 → SQL Editor → New query 에 붙여넣고 Run
--  (1단계 supabase_tools.sql 을 먼저 실행해 둔 상태여야 해요)
-- =============================================================

create table if not exists public.tools_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,                                    -- 공부를 시작한 날 (기기 시간)
  subject_id  uuid references public.tools_subjects(id) on delete set null,
  task_id     uuid references public.tools_tasks(id) on delete set null,
  mode        text not null default 'stopwatch' check (mode in ('stopwatch', 'pomodoro')),
  seconds     int  not null check (seconds between 1 and 43200), -- 한 번에 최대 12시간
  started_at  timestamptz not null,
  ended_at    timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists tools_sessions_user_day on public.tools_sessions (user_id, day);

alter table public.tools_sessions enable row level security;
drop policy if exists "own sessions" on public.tools_sessions;
create policy "own sessions" on public.tools_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (subject_id is null or exists (select 1 from public.tools_subjects s where s.id = subject_id and s.user_id = (select auth.uid())))
    and (task_id is null or exists (select 1 from public.tools_tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  );

revoke all on public.tools_sessions from anon;
grant select, insert, update, delete on public.tools_sessions to authenticated;

-- =============================================================
--  3) 문제지메이커 연결 (문제 푼 시간 · 할 일 ↔ 학습)
-- =============================================================
-- 사이트에서 문제를 푼 시간도 공부 기록에 (mode = 'solve', 푼 문제 수 · 맞은 수 함께)
alter table public.tools_sessions add column if not exists q_total   int;
alter table public.tools_sessions add column if not exists q_correct numeric;
alter table public.tools_sessions add column if not exists ref       text;   -- 문제지 id
alter table public.tools_sessions add column if not exists ref_title text;   -- 문제지 이름
alter table public.tools_sessions drop constraint if exists tools_sessions_mode_check;
alter table public.tools_sessions add constraint tools_sessions_mode_check check (mode in ('stopwatch', 'pomodoro', 'solve'));

-- 체크리스트 할 일에 문제지메이커 학습 연결
alter table public.tools_tasks add column if not exists link_item  text;
alter table public.tools_tasks add column if not exists link_title text;

-- Data API 가 새 테이블을 바로 알아보게
notify pgrst, 'reload schema';

-- 확인: 5줄이 나오고 두 칸 모두 true 면 성공
select c.relname as table_name, c.relrowsecurity as rls_on,
       has_table_privilege('authenticated', c.oid, 'select') as login_user_can_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('tools_subjects','tools_tasks','tools_profile','tools_ddays','tools_sessions')
order by 1;
