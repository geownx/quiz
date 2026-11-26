-- =====================================================================
--  문제지메이커 · 성적 · 과제 · 배지 · 공지 (3단계)
--  supabase_all.sql 과 supabase_logs.sql 을 실행한 뒤에, 이 파일을 통째로 붙여넣고 Run 하세요.
--  바꿀 곳 없어요. 여러 번 실행해도 괜찮아요.
-- =====================================================================

-- 1) 성적 (고교학점제 · 중학교)
create table if not exists public.tools_grades (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year       smallint not null check (year between 1 and 3),           -- 학년
  term       smallint not null check (term between 1 and 2),           -- 학기
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  grp        text check (char_length(grp) <= 20),                      -- 교과(군): 국어 · 수학 · 영어 · 사회 · 과학 · 한국사 · 기타
  kind       text not null default 'rank' check (kind in ('rank', 'ae', 'abc', 'p')),
                                                                        -- rank: 성취도+석차등급 / ae: 성취도 A~E만 / abc: A·B·C / p: 이수(P)
  credits    numeric(3,1) check (credits between 0 and 10),            -- 학점
  parts      jsonb not null default '[]'::jsonb,                       -- [{"n":"중간","w":30,"s":85,"m":100}]
  raw        numeric(6,2),  -- 원점수(100점 환산)
  avg        numeric(6,2),  -- 과목 평균
  students   int check (students between 1 and 2000),                  -- 수강자 수
  rank       int check (rank between 1 and 2000),                      -- 석차
  ties       int check (ties between 1 and 2000),                      -- 동석차 인원
  grade      smallint check (grade between 1 and 5),                   -- 석차등급 (성적표에 적힌 값)
  ach        text,                                                      -- 성취도 (성적표에 적힌 값: A~E · I 미이수 · P)
  target     text check (char_length(target) <= 4),                    -- 목표 (A · 2 같은)
  memo       text check (char_length(memo) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tools_grades drop constraint if exists tools_grades_ach_check;
alter table public.tools_grades add constraint tools_grades_ach_check check (ach in ('A', 'B', 'C', 'D', 'E', 'I', 'P'));
create index if not exists tools_grades_user on public.tools_grades (user_id, year, term);
alter table public.tools_grades enable row level security;
drop policy if exists "grades: own" on public.tools_grades;
create policy "grades: own" on public.tools_grades for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.tools_grades to authenticated;

-- 2) 과제 (수행평가 · 보고서 · 숙제 · 발표 …)
create table if not exists public.tools_assignments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null default '수행평가' check (char_length(kind) between 1 and 10),
  subject_id uuid references public.tools_subjects(id) on delete set null,
  subject    text check (char_length(subject) <= 20),
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  due        date,
  points     numeric(6,1),   -- 배점
  weight     numeric(5,1),   -- 반영 비율 (%)
  prep       text check (char_length(prep) <= 300),   -- 준비물
  memo       text check (char_length(memo) <= 2000),
  done       boolean not null default false,          -- 제출
  done_at    timestamptz,
  score      numeric(6,1),   -- 받은 점수
  files      jsonb not null default '[]'::jsonb,      -- [{"path","name","type","size","tag":"안내문|자료"}]
  item_id    text,           -- 이 자료로 만든 문제지 학습
  item_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tools_assignments_user_due on public.tools_assignments (user_id, due);
alter table public.tools_assignments enable row level security;
drop policy if exists "assignments: own" on public.tools_assignments;
create policy "assignments: own" on public.tools_assignments for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.tools_assignments to authenticated;

-- 3) 과제 사진함 (Storage · 비공개 · 내 폴더만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tools-files', 'tools-files', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tools-files: read own" on storage.objects;
create policy "tools-files: read own" on storage.objects for select to authenticated
  using (bucket_id = 'tools-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "tools-files: add own" on storage.objects;
create policy "tools-files: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'tools-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "tools-files: change own" on storage.objects;
create policy "tools-files: change own" on storage.objects for update to authenticated
  using (bucket_id = 'tools-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "tools-files: delete own" on storage.objects;
create policy "tools-files: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'tools-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 4) 공지 배너 (관리자가 쓰고, 모두가 봐요)
create table if not exists public.qm_notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(btrim(title)) between 1 and 80),
  body       text check (char_length(body) <= 500),
  level      text not null default 'info' check (level in ('info', 'important')),
  link       text check (char_length(link) <= 300),
  link_label text check (char_length(link_label) <= 20),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.qm_notices enable row level security;
drop policy if exists "notices: read live" on public.qm_notices;
create policy "notices: read live" on public.qm_notices for select to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()));
drop policy if exists "notices: admin all" on public.qm_notices;
create policy "notices: admin all" on public.qm_notices for all to authenticated
  using ((select public.qm_is_log_admin())) with check ((select public.qm_is_log_admin()));
grant select on public.qm_notices to anon, authenticated;
grant insert, update, delete on public.qm_notices to authenticated;

-- 5) 배지 · 레벨 계산용 내 기록 요약 (내 것만)
create or replace function public.qm_my_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with s as (select * from public.tools_sessions where user_id = (select auth.uid())),
       t as (select * from public.tools_tasks where user_id = (select auth.uid())),
       a as (select * from public.tools_assignments where user_id = (select auth.uid()))
  select jsonb_build_object(
    'sec',        coalesce((select sum(seconds) from s), 0),
    'pomo',       (select count(*) from s where mode = 'pomodoro'),
    'days',       coalesce((select jsonb_agg(d order by d) from (select day as d from s union select day from t where done) x), '[]'::jsonb),
    'tasks_done', (select count(*) from t where done),
    'perfect',    (select count(*) from (select day from t group by day having count(*) >= 3 and bool_and(done)) p),
    'hw_done',    (select count(*) from a where done),
    'hw_total',   (select count(*) from a),
    'dawn',       (select count(*) from s where extract(hour from started_at at time zone 'Asia/Seoul') between 4 and 5),
    'midnight',   (select count(*) from s where (started_at at time zone 'Asia/Seoul')::date < (ended_at at time zone 'Asia/Seoul')::date),
    'weekend',    (select count(distinct day) from s where extract(isodow from day) in (6, 7))
  );
$$;
grant execute on function public.qm_my_stats() to authenticated;

-- 6) 관리자 회원 화면에 성적 · 과제도 보이게 (supabase_admin_view.sql 의 함수를 넓혀요)
create or replace function public.qm_admin_tools(p_user uuid, p_days int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not public.qm_is_log_admin() then null else jsonb_build_object(
    'from', (current_date - greatest(1, least(p_days, 3650))),
    'subjects', (select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' order by s.sort, s.created_at), '[]'::jsonb)
                 from public.tools_subjects s where s.user_id = p_user),
    'tasks',    (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' order by t.day desc, t.created_at), '[]'::jsonb)
                 from public.tools_tasks t where t.user_id = p_user and t.day >= current_date - greatest(1, least(p_days, 3650))),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.started_at desc), '[]'::jsonb)
                 from public.tools_sessions x where x.user_id = p_user and x.day >= current_date - greatest(1, least(p_days, 3650))),
    'profile',  (select to_jsonb(p) - 'user_id' from public.tools_profile p where p.user_id = p_user),
    'ddays',    (select coalesce(jsonb_agg(to_jsonb(d) - 'user_id' order by d.day), '[]'::jsonb)
                 from public.tools_ddays d where d.user_id = p_user),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' - 'files' || jsonb_build_object('nfiles', jsonb_array_length(a.files)) order by a.due desc nulls last), '[]'::jsonb)
                 from public.tools_assignments a where a.user_id = p_user),
    'grades',   (select coalesce(jsonb_agg(to_jsonb(g) - 'user_id' order by g.year, g.term, g.created_at), '[]'::jsonb)
                 from public.tools_grades g where g.user_id = p_user)
  ) end;
$$;
revoke all on function public.qm_admin_tools(uuid, int) from public, anon;
grant execute on function public.qm_admin_tools(uuid, int) to authenticated;


notify pgrst, 'reload schema';

-- 확인: 아래 4줄이 모두 나오면 성공이에요
select tablename as "만들어진 테이블" from pg_tables where schemaname = 'public' and tablename in ('tools_grades', 'tools_assignments', 'qm_notices')
union all select 'storage: ' || id from storage.buckets where id = 'tools-files';
