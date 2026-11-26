// =============================================================
//  문제지메이커 · 공부도구 — 나이스(NEIS) 중계 함수
//  Supabase 대시보드 → Edge Functions → Deploy a new function → Via Editor
//  함수 이름: neis  /  이 파일 내용을 그대로 붙여넣고 Deploy
//  비밀값: Edge Functions → Secrets 에  NEIS_KEY = (나이스 인증키)
// =============================================================

const ENDPOINTS: Record<string, string> = {
  school: 'schoolInfo',          // 학교 찾기
  class: 'classInfo',            // 반 목록
  meal: 'mealServiceDietInfo',   // 급식
  schedule: 'SchoolSchedule',    // 학사일정
  els: 'elsTimetable',           // 초등 시간표
  mis: 'misTimetable',           // 중등 시간표
  his: 'hisTimetable',           // 고등 시간표
};
// 이 값들만 나이스로 넘겨요
const ALLOWED = new Set([
  'SCHUL_NM', 'ATPT_OFCDC_SC_CODE', 'SD_SCHUL_CODE', 'AY', 'SEM', 'GRADE', 'CLASS_NM', 'DDDEP_NM',
  'MLSV_YMD', 'MLSV_FROM_YMD', 'MLSV_TO_YMD', 'AA_FROM_YMD', 'AA_TO_YMD', 'TI_FROM_YMD', 'TI_TO_YMD', 'ALL_TI_YMD',
]);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200, cache = 0) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...(cache ? { 'Cache-Control': `private, max-age=${cache}` } : {}) },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: { code: 'METHOD', message: 'POST만 돼요' } }, 405);
  try {
    const { op, params = {}, page = 1 } = await req.json();
    const ep = ENDPOINTS[op];
    if (!ep) return json({ error: { code: 'BAD_OP', message: '알 수 없는 요청이에요' } }, 400);
    const key = Deno.env.get('NEIS_KEY');
    if (!key) return json({ error: { code: 'NO_KEY', message: '서버에 나이스 인증키(NEIS_KEY)가 아직 없어요' } }, 500);

    const u = new URL('https://open.neis.go.kr/hub/' + ep);
    u.searchParams.set('KEY', key);
    u.searchParams.set('Type', 'json');
    u.searchParams.set('pIndex', String(Math.max(1, Math.min(20, Number(page) || 1))));
    u.searchParams.set('pSize', '1000');
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (ALLOWED.has(k) && v != null && String(v).length <= 60) u.searchParams.set(k, String(v));
    }

    const r = await fetch(u, { headers: { 'User-Agent': 'quizmaker.pro tools' } });
    const j = await r.json().catch(() => null);
    if (!j) return json({ error: { code: 'NEIS_DOWN', message: '나이스 서버가 응답하지 않아요. 잠시 뒤 다시 해 주세요' } }, 502);

    const block = j[ep];
    if (!block) {
      const res = j.RESULT || {};
      if (res.CODE === 'INFO-200') return json({ rows: [], total: 0 }, 200, 600); // 자료 없음
      return json({ error: { code: res.CODE || 'NEIS', message: res.MESSAGE || '나이스 오류' } }, 502);
    }
    const head = block[0]?.head || [];
    const rows = block[1]?.row || [];
    // 학교 찾기는 자주 안 바뀌니 오래, 나머지는 10분 동안 브라우저에 저장
    return json({ rows, total: head[0]?.list_total_count ?? rows.length }, 200, op === 'school' || op === 'class' ? 86400 : 600);
  } catch (e) {
    return json({ error: { code: 'ERR', message: String((e as Error)?.message || e) } }, 500);
  }
});
