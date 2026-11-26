-- =====================================================================
--  문제지메이커 · 관리자가 회원의 공부도구 내용 보기 (읽기 전용)
--  supabase_logs.sql 을 먼저 실행한 뒤, 이 파일을 그대로 붙여넣고 Run 하세요.
--  바꿀 곳 없어요. 여러 번 실행해도 괜찮아요.
--
--  회원 테이블의 보안 규칙(RLS)은 그대로 두고, 기록 관리자만 부를 수 있는
--  함수 하나로 그 회원의 체크리스트 · 공부 시간 · 과목 · 학교 · D-day 를 읽어요.
-- =====================================================================

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
                 from public.tools_ddays d where d.user_id = p_user)
  ) end;
$$;
revoke all on function public.qm_admin_tools(uuid, int) from public, anon;
grant execute on function public.qm_admin_tools(uuid, int) to authenticated;

-- 활동 기록 숫자: 화면 이동 · 누른 버튼(예전 버전에서 남은 것)은 세지 않아요
create or replace function public.qm_log_summary(p_user uuid default null, p_since timestamptz default null)
returns table (k text, n bigint, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with l as (
    select * from public.qm_logs
    where public.qm_is_log_admin()
      and (p_user is null or user_id = p_user)
      and (p_since is null or created_at >= p_since)
      and kind not in ('click', 'view')
  )
  select part, count(*), max(created_at) from l group by part
  union all select '__all',   count(*), max(created_at) from l
  union all select '__fail',  count(*), max(created_at) from l where not ok
  union all select '__first', count(*), min(created_at) from l
  union all select '@' || coalesce(device, '알 수 없음') || case when app then ' · 앱' else '' end, count(*), max(created_at)
            from l where p_user is not null group by 1;
$$;
revoke all on function public.qm_log_summary(uuid, timestamptz) from public, anon;
grant execute on function public.qm_log_summary(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
