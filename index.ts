// =====================================================================
// 문제지메이커 v3.3 : 서버 함수 (Supabase Edge Function, 이름: api)
// Supabase 대시보드 → Edge Functions → api → Code 에 이 파일 내용을 전부 붙여넣고 Deploy.
// (함수 설정에서 Verify JWT 는 꺼 두세요. 로그인 확인은 이 코드가 직접 해요)
//
// 필요한 Secrets (Edge Functions → Secrets):
//   GEMINI_API_KEY : Google Cloud(Agent Platform) API 키. AI Studio 키도 자동으로 알아봐요
//   ADMIN_EMAIL    : 관리자 이메일 (이 이메일로 로그인하면 관리자)
//   GEMINI_MODEL   : (선택) 쓸 모델 이름
//   QM_PARALLEL    : (선택) 동시에 만드는 묶음 수, 기본 4
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

function serverKey() {
  const manual = Deno.env.get('QM_SECRET_KEY'); if (manual) return manual.trim();
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
  try { const j = JSON.parse(raw); if (typeof j === 'string') return j; if (j && typeof j === 'object') return j.default || Object.values(j)[0] as string; } catch { /* plain */ }
  return raw;
}
const SB = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const geminiKey = () => (Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '').trim();
const adminEmail = () => (Deno.env.get('ADMIN_EMAIL') || '').trim().toLowerCase() || null;
const PARALLEL = () => Math.max(1, Math.min(8, Number(Deno.env.get('QM_PARALLEL')) || 4));
const BUCKET = 'materials';
const VBASE = 'https://aiplatform.googleapis.com/v1/publishers/google/models';
const GBASE = 'https://generativelanguage.googleapis.com';
// 좋은 모델 (자료 분석 · 어려운 유형 · 노트). 2.5 Flash는 2026-10-20, 3.6 Flash는 2026-11-19 종료라 뺐어요
const FLASH_MODELS = () => [Deno.env.get('GEMINI_MODEL') || '', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash']
  .filter((v, i, a) => v && a.indexOf(v) === i);
// 빠른 모델 (O/X · 객관식 · 단답 · 빈칸 · 플래시카드 · 마인드맵, 그리고 한도가 찼을 때)
const LITE_MODELS = [Deno.env.get('GEMINI_FAST_MODEL') || '', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'].filter(Boolean);
const missingModels = new Set<string>();

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
class QmError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
const STATUS: Record<string, number> = { QM_AUTH: 401, QM_PENDING: 403, QM_BLOCKED: 403, QM_FORBIDDEN: 403, QM_LIMIT: 429, QM_NOTFOUND: 404, QM_NO_BALANCE: 402, QM_BUSY: 409, QM_DUP: 409 };

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await SB.rpc(fn, args);
  if (error) {
    const m = /(QM_[A-Z_]+)\|(.+)/s.exec(error.message || '');
    if (m) throw new QmError(m[1], m[2].trim(), STATUS[m[1]] || 400);
    console.error('rpc error', fn, error);
    throw new QmError('QM_SERVER', '서버 데이터베이스 오류예요. 잠시 후 다시 해주세요.', 500);
  }
  return data;
}
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const isId = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v);
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
function clientIp(req: Request) {
  const xf = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || xf || '').slice(0, 64);
}

// ---------- 로그인 확인 (Supabase Auth 토큰) ----------
type Who = { id: string; email: string | null; name: string; provider: string };
const authCache = new Map<string, { who: Who; until: number }>();
async function whoAmI(req: Request): Promise<Who> {
  const h = req.headers.get('authorization') || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token || token.split('.').length !== 3) throw new QmError('QM_AUTH', '로그인이 필요해요.', 401);
  const c = authCache.get(token);
  if (c && c.until > Date.now()) return c.who;
  const { data, error } = await SB.auth.getUser(token);
  const u = data?.user;
  if (error || !u) throw new QmError('QM_AUTH', '로그인이 끝났어요. 다시 로그인해 주세요.', 401);
  const md = u.user_metadata || {};
  const who: Who = { id: u.id, email: u.email || md.email || null, name: str(md.name || md.full_name || md.nickname || md.preferred_username || '', 30),
    provider: str(u.app_metadata?.provider || 'email', 20) };
  if (authCache.size > 500) authCache.clear();
  authCache.set(token, { who, until: Date.now() + 60_000 });
  return who;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(await selfCheck());
  const ip = clientIp(req);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return json({ error: { code: 'QM_INPUT', message: '잘못된 요청이에요.' } }, 400); }
  try {
    // 로그인 없이 되는 요청
    switch (b.action) {
      case 'publicConfig': return json(await rpc('qm_public_config', {}));
      case 'jobStep': {
        const id = str(b.jobId, 40), step = str(b.step, 100);
        if (!isId(id) || !/^[0-9a-f]{48}$/.test(step)) return json({ ok: false }, 400);
        later(runWorker(id, step).catch((e) => console.error('worker', e)));
        return json({ ok: true });
      }
      case 'jobTick': {
        const list = await rpc('qm_job_stale', {});
        for (const x of Array.isArray(list) ? list : []) await fireWorkers(x.id, x.step, Math.min(PARALLEL(), Number(x.n) || 1));
        return json({ ok: true, kicked: Array.isArray(list) ? list.length : 0 });
      }
    }
    const who = await whoAmI(req);
    const U = { p_uid: who.id, p_ip: ip };
    switch (b.action) {
      // ----- 회원 -----
      case 'sync':
        return json(await rpc('qm_profile_sync', { ...U, p_email: who.email, p_name: str(b.name, 30) || who.name, p_provider: who.provider, p_admin_email: adminEmail() }));
      case 'me': return json(await rpc('qm_me', U));
      case 'ledger': return json(await rpc('qm_ledger_list', U));
      case 'setName': return json(await rpc('qm_set_name', { ...U, p_name: str(b.name, 30) }));
      case 'reportsSeen': return json(await rpc('qm_reports_seen', U));
      case 'setSolveMode': return json(await rpc('qm_set_solve_mode', { ...U, p_mode: str(b.mode, 10) }));

      // ----- 학습 목록 -----
      case 'items': return json(await rpc('qm_items_list', U));
      case 'itemCreate': return json(await rpc('qm_item_create', { ...U, p_title: str(b.title, 100), p_memo: str(b.memo, 2000) }));
      case 'itemGet': return json(await rpc('qm_item_get', { ...U, p_item: b.itemId }));
      case 'itemUpdate': return json(await rpc('qm_item_update', { ...U, p_item: b.itemId, p_title: b.title == null ? null : str(b.title, 100), p_memo: b.memo == null ? null : str(b.memo, 2000) }));
      case 'itemDelete': return json(await rpc('qm_item_delete', { ...U, p_item: b.itemId }));
      case 'review': return json(await rpc('qm_item_review', { ...U, p_item: b.itemId }));

      // ----- 자료 올리기 -----
      case 'uploadUrls': {
        if (!isId(b.itemId)) throw new QmError('QM_INPUT', '잘못된 요청이에요.');
        const files = Array.isArray(b.files) ? b.files.slice(0, 20) : [];
        const out = [];
        for (const f of files) {
          const mime = str(f.mime, 100), size = Number(f.size) || 0;
          if (!/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(mime)) throw new QmError('QM_INPUT', `"${str(f.name, 60)}"는 올릴 수 없는 파일이에요. PDF나 사진만 올려 주세요.`);
          if (size > MAX_FILE) throw new QmError('QM_INPUT', `"${str(f.name, 60)}"가 너무 커요. 파일 하나는 ${MAX_FILE / 1048576}MB까지예요.`);
          const path = `${who.id}/${b.itemId}/${crypto.randomUUID()}`;
          const m = await rpc('qm_material_add', { ...U, p_item: b.itemId, p_name: str(f.name, 200), p_mime: mime, p_size: size, p_path: path });
          const { data, error } = await SB.storage.from(BUCKET).createSignedUploadUrl(path);
          if (error) { console.error('signed upload', error); throw new QmError('QM_SERVER', '업로드 준비에 실패했어요. (보관함 materials 설정 확인)', 500); }
          out.push({ id: m.id, path, token: data.token, signedUrl: data.signedUrl });
        }
        return json({ files: out });
      }
      case 'uploadDirect': {
        // 브라우저에서 보관함으로 바로 못 올릴 때의 대체 경로 (작은 파일용)
        const path = str(b.path, 300), mime = str(b.mime, 100);
        if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(path) || !path.startsWith(who.id + '/')) throw new QmError('QM_FORBIDDEN', '권한이 없어요.', 403);
        if (!/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(mime)) throw new QmError('QM_INPUT', '올릴 수 없는 파일이에요.');
        const b64 = str(b.b64, 9_000_000), bin = atob(b64), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const { error } = await SB.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
        if (error) { console.error('direct upload', error); throw new QmError('QM_SERVER', '자료 저장에 실패했어요.', 500); }
        return json({ ok: true });
      }
      case 'materialDelete': {
        const r = await rpc('qm_material_delete', { ...U, p_material: b.materialId });
        if (r?.path) await SB.storage.from(BUCKET).remove([r.path]).catch(() => {});
        return json({ ok: true });
      }

      // ----- 만든 것 -----
      case 'outputGet': return json(await rpc('qm_output_get', { ...U, p_output: b.outputId }));
      case 'outputSave':
        return json(await rpc('qm_output_save', { ...U, p_output: b.outputId, p_data: b.data ?? null, p_progress: b.progress ?? null,
          p_title: b.title == null ? null : str(b.title, 200), p_settings: b.settings && typeof b.settings === 'object' ? b.settings : null }));
      case 'outputDelete': return json(await rpc('qm_output_delete', { ...U, p_output: b.outputId }));
      case 'regen': return await regenOne(b, who, U);
      case 'report': return await reportQuestion(b, who, U);
      case 'attemptSave':
        return json(await rpc('qm_attempt_save', { ...U, p_output: b.outputId, p_answers: b.answers || {}, p_results: Array.isArray(b.results) ? b.results.slice(0, 200) : [],
          p_per_part: b.perPart || {}, p_total: Math.trunc(Number(b.total) || 0), p_correct: Number(b.correct) || 0 }));
      case 'exportUrl': {
        const m = await rpc('qm_export_add', { ...U, p_output: b.outputId });
        const { data, error } = await SB.storage.from(BUCKET).createSignedUploadUrl(m.path);
        if (error) throw new QmError('QM_SERVER', '업로드 준비에 실패했어요.', 500);
        return json({ id: m.id, path: m.path, token: data.token, signedUrl: data.signedUrl });
      }
      case 'exportDone': return json(await rpc('qm_export_done', { ...U, p_export: b.id, p_pages: Number(b.pages) || null, p_size: Number(b.size) || null }));

      // ----- 백그라운드 만들기 -----
      case 'analyze': {
        needKey();
        const r = await rpc('qm_job_start', { ...U, p_item: b.itemId, p_kind: 'analyze', p_out_kind: null, p_title: null, p_settings: {}, p_tasks: [{ kind: 'analyze' }], p_total: 1, p_parent: null });
        await fireWorkers(r.id, r.step_token, 1);
        return json(r);
      }
      case 'create': return await createJob(b, U);
      case 'jobGet': {
        const j = await rpc('qm_job_get', { ...U, p_job: b.jobId });
        if (j?.stale) await kick(U, j.id);
        return json(j);
      }
      case 'jobsRunning': {
        const list = await rpc('qm_jobs_running', U);
        for (const j of Array.isArray(list) ? list : []) if (j.stale) await kick(U, j.id);
        return json(list);
      }
      case 'jobCancel': return json(await rpc('qm_job_cancel', { ...U, p_job: b.jobId }));

      // ----- 관리자 -----
      case 'adminUsers': return json(await rpc('qm_admin_users', { ...U, p_q: str(b.q, 100) }));
      case 'adminUserUpdate':
        return json(await rpc('qm_admin_user_update', { ...U, p_target: b.userId, p_status: b.status ? str(b.status, 20) : null,
          p_coins: Math.trunc(Number(b.coins) || 0), p_memo: str(b.memo, 200), p_sub_days: Math.trunc(Number(b.subDays) || 0),
          p_solve_mode: b.solveMode == null ? null : str(b.solveMode, 10) || 'ask' }));
      case 'adminItems': return json(await rpc('qm_admin_items', { ...U, p_q: str(b.q, 100) }));
      case 'adminItem': {
        const d = await rpc('qm_admin_item', { ...U, p_item: b.itemId });
        const paths = [...(d.materials || []), ...(d.exports || [])].map((m: any) => m.path);
        if (paths.length) {
          const { data } = await SB.storage.from(BUCKET).createSignedUrls(paths, 3600);
          const map = new Map((data || []).map((x: any) => [x.path, x.signedUrl]));
          d.materials = (d.materials || []).map((m: any) => ({ ...m, url: map.get(m.path) || null }));
          d.exports = (d.exports || []).map((m: any) => ({ ...m, url: map.get(m.path) || null }));
        }
        return json(d);
      }
      case 'adminConfigGet': return json(await rpc('qm_admin_config_get', U));
      case 'adminConfigSet': return json(await rpc('qm_admin_config_set', { ...U, p_data: b.data || {} }));
      case 'adminReports': return json(await rpc('qm_admin_reports', U));
      case 'adminReportDecide': return await adminReportDecide(b, who, U);
      case 'adminStats': return json(await rpc('qm_admin_stats', { ...U, p_days: Number(b.days) || 30 }));
      default:
        return json({ error: { code: 'QM_INPUT', message: '알 수 없는 요청이에요.' } }, 400);
    }
  } catch (e) {
    if (e instanceof QmError) return json({ error: { code: e.code, message: e.message } }, e.status);
    console.error('unhandled', e);
    return json({ error: { code: 'QM_SERVER', message: '서버 오류가 났어요. 잠시 후 다시 해주세요.' } }, 500);
  }
});
const needKey = () => { if (!geminiKey()) throw new QmError('QM_CONFIG', '서버 설정이 아직 끝나지 않았어요. 관리자에게 문의해 주세요.', 500); };

// ---------------------------------------------------------------------
async function selfCheck() {
  const key = geminiKey();
  const out: Record<string, string> = { service: 'quizmaker v3' };
  out.gemini_key = !key ? '없음 ✗ (Secrets에 GEMINI_API_KEY 추가)' : `있음 ✓ (${key.slice(0, 4)}…, ${key.length}자)`;
  out.admin_email = adminEmail() ? '있음 ✓' : '없음 ✗ (Secrets에 ADMIN_EMAIL 추가)';
  try { const { error } = await SB.rpc('qm_public_config', {}); out.database = !error ? '정상 ✓' : `오류 ✗ (${error.message.slice(0, 120)}) → schema.sql 다시 실행`; }
  catch (e) { out.database = `오류 ✗ (${String(e).slice(0, 120)})`; }
  try { const { error } = await SB.storage.from(BUCKET).list('', { limit: 1 }); out.storage = error ? `오류 ✗ (${error.message.slice(0, 120)}) → Storage에 materials 보관함 확인` : '정상 ✓'; }
  catch (e) { out.storage = `오류 ✗ (${String(e).slice(0, 120)})`; }
  if (key) {
    const body = { contents: [{ role: 'user', parts: [{ text: '1+1=? 숫자만' }] }], generationConfig: { maxOutputTokens: 20 } };
    const g = await callModel(body, { lite: true, signal: AbortSignal.timeout(30_000) }).catch((e) => ({ res: new Response(String(e), { status: 599 }), model: '', dayOut: false }));
    const t = await g.res.text();
    out.model_connect = g.res.ok ? `정상 ✓ (${provider === 'vertex' ? 'Google Cloud' : 'AI Studio'} · ${g.model})` : `오류 ✗ (${g.res.status}: ${t.slice(0, 200)}) → 키를 다시 확인`;
  }
  out.ok = Object.values(out).some((v) => v.includes('✗')) ? '설정 확인 필요' : '모두 정상';
  return out;
}

// ---------------------------------------------------------------------
// 문제 유형 · 출제 설정
const QTYPES = ['mc', 'neg', 'multi', 'combo', 'ox', 'short', 'blank', 'match', 'order', 'calc', 'case', 'error', 'essay'];
const LITE_TYPES = ['ox', 'mc', 'short', 'blank'];      // 사용량이 다 찬 날에도 만들 수 있는 유형
const SIMPLE_TYPES = ['ox', 'mc', 'neg', 'short', 'blank', 'match']; // 생각을 짧게 해도 되는 유형 (더 빠름)
const TYPE_AI: Record<string, { label: string; ai: string }> = {
  mc: { label: '객관식', ai: '일반 객관식. choices에 보기 {N}개. 정답은 1개. answer는 정답 보기 번호 숫자만(예: "3").' },
  neg: { label: '부정형 객관식', ai: '"~로 옳지 않은 것은?" 형태 객관식. choices {N}개 중 틀린 것 1개. answer는 번호 숫자만.' },
  multi: { label: '복수 정답', ai: '정답이 2개 이상인 객관식. 문제 끝에 "(정답 2개)"처럼 정답 개수를 밝힐 것. choices {N}개. answer는 번호들(예: "1, 4").' },
  combo: { label: '합답형 <보기>', ai: 'statements에 ㄱ,ㄴ,ㄷ(필요시 ㄹ)로 표시될 진술 3~4개(기호 없이 내용만). question은 "<보기>에서 옳은 것만을 있는 대로 고른 것은?" 형태. choices는 "ㄱ", "ㄴ", "ㄱ, ㄴ", "ㄴ, ㄷ", "ㄱ, ㄴ, ㄷ" 같은 조합 {N}개. answer는 번호 숫자만.' },
  ox: { label: 'O / X', ai: 'question은 참/거짓을 판단할 진술문 1개(문장 끝에 O/X 표시하지 말 것). answer는 "O" 또는 "X". X이면 explanation에 바른 내용.' },
  short: { label: '단답형', ai: '한 단어~짧은 구로 답하는 문제. answer는 정답(허용 답이 여럿이면 " / "로 병기). 여러 항목을 나열해야 하면 question 안에 1., 2., (1) 같은 번호 목록을 쓰지 말고, 각 항목을 statements에 넣는다(화면에 ㄱ, ㄴ, ㄷ으로 표시됨). 항목마다 답을 쓰게 하면 answer는 "ㄱ: 답, ㄴ: 답, ㄷ: 답" 형식. explanation에서도 항목을 ㄱ, ㄴ, ㄷ으로 부른다.' },
  blank: { label: '빈칸 채우기', ai: 'question 안의 빈칸을 "( ㉠ )", "( ㉡ )" 형태로 1~3개 표시. answer는 "㉠ 용어, ㉡ 용어" 형식.' },
  match: { label: '연결하기', ai: 'statements에 왼쪽 항목 3~5개, rightItems에 오른쪽 항목을 같은 개수로 순서를 섞어서(기호 없이). 화면에는 왼쪽 1),2),3)… 오른쪽 ⓐ,ⓑ,ⓒ… 로 표시됨. answer는 "1-ⓑ, 2-ⓐ, 3-ⓒ" 형식.' },
  order: { label: '순서 배열', ai: 'statements에 (가),(나),(다),(라)로 표시될 단계/사건 3~5개를 섞인 순서로(기호 없이). choices에 "(가)-(다)-(나)-(라)" 같은 배열 {N}개. answer는 번호 숫자만.' },
  calc: { label: '계산·풀이형', ai: '수치 계산이나 단계적 추론이 필요한 문제(자료에 수치/공식이 없으면 개념 적용 추론 문제). answer는 최종 답, explanation에 풀이 과정을 단계별로.' },
  case: { label: '자료·사례 분석', ai: 'passage에 자료(사례, 짧은 제시문, 실험 결과 등. 표는 한 줄에 "칸 | 칸 | 칸" 형식)를 새로 구성해 넣고 그것을 해석·적용하는 객관식. choices {N}개. answer는 번호 숫자만.' },
  error: { label: '틀린 곳 고치기', ai: 'passage에 1~2군데 틀린 내용이 섞인 짧은 설명문. question은 틀린 부분을 찾아 바르게 고치라는 요구. answer는 "틀린 부분 → 바른 내용" 형식.' },
  essay: { label: '서술형', ai: '2~5문장으로 서술하는 문제. answer는 모범 답안, explanation에 채점 기준(꼭 들어가야 할 핵심 키워드).' },
};
const STYLES: Record<string, string> = {
  school: '학교 내신 시험 (교과서 개념 중심, 정확한 개념 이해 확인)',
  suneung: '수능·모의고사 스타일 (자료 해석, 개념 적용, 사고력 중심)',
  cert: '자격증·공무원 시험 스타일 (정확한 지식·암기 확인, 함정 보기)',
  univ: '대학 전공 시험 (개념 간 연결, 깊이 있는 이해)',
  basic: '기초 개념 확인 (처음 배우는 사람용, 핵심만 쉽게)',
};
const TOTALS = [10, 20, 30, 50, 100];
const CHUNK = 5;
const MAX_FILE = 14 * 1048576;     // 파일 하나
const MAX_INLINE = 14 * 1048576;   // 한 번에 보내는 자료 합계 (Google Cloud는 요청 하나에 20MB까지)
type Settings = { total: number; types: string[]; typeMode: string; typeCounts: Record<string, number>; difficulty: string; style: string;
  choiceN: number; explain: string; extra: string; layout: string; parts: string[] | null };
type Part = { id: string; title: string; summary?: string; concepts?: string[]; weight?: number; source?: string; count?: number };
const SAFE_SETTINGS = (s: any): Settings => {
  s = s && typeof s === 'object' ? s : {};
  const types = (Array.isArray(s.types) ? s.types : []).filter((t: string) => TYPE_AI[t]);
  const tc: Record<string, number> = {};
  if (s.typeCounts && typeof s.typeCounts === 'object') for (const k of Object.keys(TYPE_AI)) if (s.typeCounts[k] != null) tc[k] = Math.max(0, Math.min(100, Math.trunc(Number(s.typeCounts[k]) || 0)));
  return { total: TOTALS.includes(Number(s.total)) ? Number(s.total) : 20, types: types.length ? types : ['mc', 'ox', 'short'],
    typeMode: s.typeMode === 'manual' ? 'manual' : 'auto', typeCounts: tc,
    difficulty: ['easy', 'normal', 'hard', 'mixed'].includes(s.difficulty) ? s.difficulty : 'mixed', style: STYLES[s.style] ? s.style : 'school',
    choiceN: Number(s.choiceN) === 4 ? 4 : 5, explain: s.explain === 'brief' ? 'brief' : 'detail', extra: str(s.extra, 1000),
    layout: s.layout === '1' ? '1' : '2', parts: Array.isArray(s.parts) ? s.parts.filter((x: unknown) => typeof x === 'string').slice(0, 30) : null };
};
function distribute(parts: Part[], total: number) {
  if (!parts.length) return;
  const W = parts.reduce((a, p) => a + (p.weight || 5), 0);
  const raw = parts.map((p) => total * (p.weight || 5) / W);
  parts.forEach((p, i) => p.count = Math.floor(raw[i]));
  let left = total - parts.reduce((a, p) => a + (p.count || 0), 0);
  parts.map((p, i) => [i, raw[i] - Math.floor(raw[i])] as [number, number]).sort((a, b) => b[1] - a[1]).forEach(([i]) => { if (left > 0) { parts[i].count = (parts[i].count || 0) + 1; left--; } });
  if (total >= parts.length) for (const p of parts) if (!p.count) { const mx = parts.reduce((a, b) => (b.count || 0) > (a.count || 0) ? b : a); mx.count = (mx.count || 0) - 1; p.count = 1; }
}
function typeAlloc(st: Settings, total: number) {
  const sel = st.types.filter((t) => TYPE_AI[t]); const out: Record<string, number> = {};
  if (!sel.length) return out;
  if (st.typeMode === 'manual') {
    sel.forEach((t) => out[t] = Math.max(0, Number(st.typeCounts?.[t]) || 0));
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    if (sum === total) return out;
  }
  const base = Math.floor(total / sel.length); let left = total - base * sel.length;
  sel.forEach((t) => { out[t] = base + (left > 0 ? 1 : 0); left--; });
  return out;
}
function buildPlan(parts: Part[], st: Settings) {
  const total = parts.reduce((a, p) => a + (p.count || 0), 0);
  const al = typeAlloc(st, total), ids = Object.keys(al).filter((t) => al[t] > 0), seq: string[] = [];
  const used: Record<string, number> = Object.fromEntries(ids.map((t) => [t, 0]));
  const N = ids.reduce((a, t) => a + al[t], 0);
  for (let k = 0; k < N; k++) {
    let best = '', bs = -1;
    for (const t of ids) { if (used[t] >= al[t]) continue; const s = (al[t] - used[t]) / al[t]; if (s > bs) { bs = s; best = t; } }
    seq.push(best); used[best]++;
  }
  const plan: Record<string, string[]> = {}; let pos = 0;
  for (const p of parts) { plan[p.id] = []; for (let k = 0; k < (p.count || 0); k++) plan[p.id].push(seq[pos++] || ids[0] || 'mc'); }
  return plan;
}
const countsOf = (list: string[]) => { const c: Record<string, number> = {}; list.forEach((t) => c[t] = (c[t] || 0) + 1); return c; };
const sumOf = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
// 할 일: 파트마다 CHUNK개씩. 같은 파트의 묶음끼리 겹치지 않게 핵심 개념을 나눠 맡김
function makeTasks(parts: Part[], st: Settings) {
  const plan = buildPlan(parts, st), tasks: any[] = [];
  for (const p of parts) {
    const list = plan[p.id] || [], groups: string[][] = [];
    for (const g of [list.filter((t) => LITE_TYPES.includes(t)), list.filter((t) => !LITE_TYPES.includes(t))]) for (let i = 0; i < g.length; i += CHUNK) groups.push(g.slice(i, i + CHUNK));
    const cs = (p.concepts || []).filter(Boolean);
    groups.forEach((g, k) => {
      const focus = groups.length > 1 && cs.length ? cs.filter((_, ci) => ci % groups.length === k % Math.max(1, Math.min(groups.length, cs.length))) : [];
      tasks.push({ part: p.id, count: g.length, counts: countsOf(g), tries: 0, slot: k + 1, slots: groups.length, focus: focus.slice(0, 6) });
    });
  }
  // 파트별로 번갈아 실행 (여러 파트가 동시에 채워지게)
  const byPart = new Map<string, any[]>(); tasks.forEach((t) => { if (!byPart.has(t.part)) byPart.set(t.part, []); byPart.get(t.part)!.push(t); });
  const out: any[] = []; const lists = [...byPart.values()];
  for (let r = 0; out.length < tasks.length; r++) for (const l of lists) if (l[r]) out.push(l[r]);
  return out;
}

// ---------- 만들기 시작 ----------
async function createJob(b: any, U: Record<string, unknown>) {
  needKey();
  const kind = str(b.kind, 20);
  if (!['pdf', 'solve', 'similar', 'flash', 'note', 'mindmap'].includes(kind)) throw new QmError('QM_INPUT', '잘못된 요청이에요.');
  const it = await rpc('qm_item_get', { ...U, p_item: b.itemId });
  if (it.foreign) throw new QmError('QM_FORBIDDEN', '내 학습에서만 만들 수 있어요.', 403);
  const item = it.item, allParts: Part[] = Array.isArray(item.analysis?.parts) ? item.analysis.parts : [];
  if (item.status !== 'ready' || !allParts.length) throw new QmError('QM_INPUT', '자료 분석이 끝난 뒤에 만들 수 있어요.');
  const pick = (ids: unknown) => { const want = Array.isArray(ids) ? ids : null; const ps = allParts.filter((p) => !want || want.includes(p.id)); return ps.length ? ps : allParts; };
  let tasks: any[] = [], total = 1, settings: Record<string, unknown> = {}, title = str(b.title, 200), outKind = kind, parent: string | null = null;
  if (kind === 'pdf' || kind === 'solve') {
    const st = SAFE_SETTINGS(b.settings);
    const parts = pick(st.parts).map((p) => ({ ...p }));
    distribute(parts, st.total);
    tasks = makeTasks(parts.filter((p) => (p.count || 0) > 0), st);
    total = st.total;
    settings = { ...st, plan: parts.map((p) => ({ id: p.id, title: p.title, count: p.count })) };
    title = title || `${item.title} ${kind === 'pdf' ? '문제지' : '풀기'} ${total}문제`;
  } else if (kind === 'similar') {
    // 오답 노트: 틀린 문제마다 1~3개
    const list = (Array.isArray(b.wrong) ? b.wrong : []).slice(0, 40).map((w: any) => ({ q: cleanSrcQ(w.q), n: Math.max(1, Math.min(3, Math.trunc(Number(w.n) || 1))) }))
      .filter((w: any) => w.q.question);
    if (!list.length) throw new QmError('QM_INPUT', '비슷한 문제를 만들 오답을 골라 주세요.');
    tasks = list.map((w: any) => ({ part: w.q.partId || 'etc', count: w.n, counts: { [w.q.type]: w.n }, tries: 0, src: w.q }));
    total = list.reduce((a: number, w: any) => a + w.n, 0);
    const st = SAFE_SETTINGS({ ...(b.settings || {}), total: 10 });
    const plan = allParts.map((p) => ({ id: p.id, title: p.title }));
    // 다시 분석해서 없어진 파트의 오답도 파트 이름이 보이게
    for (const w of list) if (w.q.partId && !plan.find((p) => p.id === w.q.partId)) plan.push({ id: w.q.partId, title: w.q.partTitle || '이전 파트' });
    settings = { choiceN: st.choiceN, explain: st.explain, style: st.style, difficulty: 'mixed', plan };
    title = title || `오답 복습 ${total}문제`;
    parent = isId(b.parentId) ? b.parentId : null;
  } else {
    const parts = pick(b.settings?.parts);
    const n = kind === 'flash' ? ([10, 20, 30].includes(Number(b.settings?.count)) ? Number(b.settings.count) : 30) : 1;
    settings = { parts: parts.map((p) => p.id), count: n, detail: b.settings?.detail === 'brief' ? 'brief' : 'detail',
      plan: parts.map((p) => ({ id: p.id, title: p.title })) };
    // 나눠서 동시에 만들기: 플래시카드는 10장씩, 노트·마인드맵은 파트 묶음(최대 4개)씩
    const groups = (k: number) => { const g: Part[][] = Array.from({ length: k }, () => []); parts.forEach((p, i) => g[Math.floor(i * k / parts.length)].push(p)); return g; };
    if (kind === 'flash') {
      const k = Math.ceil(n / 10);
      tasks = Array.from({ length: k }, (_, i) => {
        const ps = parts.length >= k ? groups(k)[i] : parts;
        return { kind, parts: ps.map((p) => p.id), count: Math.min(10, n - i * 10), order: i, slot: i + 1, slots: k, overlap: parts.length < k };
      });
      total = n;
    } else {
      const k = Math.min(4, parts.length);
      tasks = groups(k).map((ps, i) => ({ kind, parts: ps.map((p) => p.id), count: 1, order: i }));
      if (kind === 'note') tasks.push({ kind, part: 'summary', parts: parts.map((p) => p.id), count: 1, order: 99 });
      total = tasks.length;
    }
    title = title || `${item.title} ${({ flash: '플래시카드', note: '요약 노트', mindmap: '마인드맵' } as Record<string, string>)[kind]}`;
  }
  // 같은 이름이 이미 있으면 번호를 붙여요 (요약 노트 2, 3 …)
  if (!str(b.title, 200)) {
    const same = (it.outputs || []).filter((o: any) => o.title === title || String(o.title || '').startsWith(title + ' ')).length;
    if (same) title = `${title} ${same + 1}`;
  }
  if (!tasks.length) throw new QmError('QM_INPUT', '만들 내용이 없어요.');
  const r = await rpc('qm_job_start', { ...U, p_item: item.id, p_kind: ['pdf', 'solve', 'similar'].includes(kind) ? 'questions' : kind, p_out_kind: outKind, p_title: title,
    p_settings: settings, p_tasks: tasks, p_total: total, p_parent: parent });
  await fireWorkers(r.id, r.step_token, Math.min(PARALLEL(), tasks.length));
  return json(r);
}
function cleanSrcQ(q: any) {
  q = q && typeof q === 'object' ? q : {};
  const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 10).map((x) => str(x, 400)) : []);
  return { id: str(q.id, 40), partId: str(q.partId, 40), partTitle: str(q.partTitle, 200), type: QTYPES.includes(q.type) ? q.type : 'short', question: str(q.question, 2000), passage: str(q.passage, 3000),
    statements: arr(q.statements), rightItems: arr(q.rightItems), choices: arr(q.choices), answer: str(q.answer, 500), explanation: str(q.explanation, 2000),
    concept: str(q.concept, 200), mine: str(q.mine, 500) };
}

// ---------- 일꾼: 할 일을 하나씩 가져와 처리. 끝나면 다음 일꾼을 부름 ----------
const SELF_URL = () => (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '') + '/functions/v1/api';
function later(p: Promise<unknown>) {
  // @ts-ignore EdgeRuntime 은 Supabase 환경에만 있음
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(p); else p.catch(() => {});
}
async function fireWorkers(id: string, step: string, n: number) {
  await Promise.all(Array.from({ length: Math.max(1, n) }, (_, k) => sleep(k * 250).then(() => fireStep(id, step))));
}
async function fireStep(id: string, step: string) {
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') || '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (/^eyJ/.test(anon)) { headers.Authorization = 'Bearer ' + anon; headers.apikey = anon; }
  for (let k = 0; k < 2; k++) {
    try {
      const r = await fetch(SELF_URL(), { method: 'POST', headers, body: JSON.stringify({ action: 'jobStep', jobId: id, step }) });
      await r.text();
      if (r.ok) return;
      console.error('fire step', r.status);
    } catch (e) { console.error('fire step', e); }
    await sleep(1500);
  }
}
async function kick(U: Record<string, unknown>, id: string) {
  try { const k = await rpc('qm_job_kick', { ...U, p_job: id }); if (k?.step) await fireWorkers(id, k.step, Math.min(PARALLEL(), Number(k.n) || 1)); } catch (e) { console.error('kick', e); }
}
async function runWorker(id: string, step: string) {
  let c = await rpc('qm_task_claim', { p_job: id, p_step: step });
  // 잠깐 쉬었다가 다시 할 일이 있으면 기다렸다가 처리
  if (c?.stop && Number(c.wait) > 0 && Number(c.wait) <= 20) { await sleep(Number(c.wait) * 1000 + 300); c = await rpc('qm_task_claim', { p_job: id, p_step: step }); }
  if (!c || c.stop) return;
  let r: any = null;
  try { r = await runTask(id, step, c); } catch (e) { console.error('task', e); }
  if (r && r.status === 'running') {
    if (r.topup) await fireWorkers(id, step, Math.min(PARALLEL(), Number(r.pending) || 1)); else await fireStep(id, step);
  }
}

// ---------- 모델 부르기 ----------
let provider: 'vertex' | 'studio' = (Deno.env.get('QM_PROVIDER') === 'studio' ? 'studio' : 'vertex');
let providerFixed = !!Deno.env.get('QM_PROVIDER');
const dayOutModels = new Map<string, number>();
const noThinkCfg = new Set<string>();
function modelUrl(model: string) {
  return provider === 'vertex' ? `${VBASE}/${model}:streamGenerateContent?alt=sse` : `${GBASE}/v1beta/models/${model}:streamGenerateContent?alt=sse`;
}
function withThinking(body: any, model: string, think: 'low' | 'default') {
  if (think === 'default' || noThinkCfg.has(model)) return body;
  const tc = /2\.5/.test(model) ? { thinkingBudget: /lite/.test(model) ? 0 : 512 } : { thinkingLevel: 'low' };
  return { ...body, generationConfig: { ...(body.generationConfig || {}), thinkingConfig: tc } };
}
const authFail = (status: number, t: string) => status === 401 || status === 403 || (status === 400 && /API key|API_KEY|credential|express mode|SERVICE_DISABLED/i.test(t));
async function callModel(body: any, o: { lite?: boolean; fast?: boolean; signal?: AbortSignal; skipFlash?: boolean; think?: 'low' | 'default' } = {}): Promise<{ res: Response; model: string; dayOut: boolean }> {
  let last: Response | null = null, lastModel = '', flashDay = 0, flashTried = 0, switched = false;
  const tryList = async (list: string[], isFlash: boolean): Promise<{ res: Response; model: string } | null> => {
    for (const model of list) {
      if (missingModels.has(provider + model)) continue;
      if ((dayOutModels.get(model) || 0) > Date.now()) { if (isFlash) { flashTried++; flashDay++; } continue; }
      let payload = JSON.stringify(withThinking(body, model, o.think || 'default'));
      let res = await fetch(modelUrl(model), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() }, body: payload, signal: o.signal });
      if (res.ok) return { res, model };
      let t = await res.text();
      // 생각 설정을 모르는 모델이면 설정 없이 다시
      if (res.status === 400 && /thinking/i.test(t) && !noThinkCfg.has(model)) {
        noThinkCfg.add(model); payload = JSON.stringify(body);
        res = await fetch(modelUrl(model), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey() }, body: payload, signal: o.signal });
        if (res.ok) return { res, model };
        t = await res.text();
      }
      // 키 종류 자동 판별: Google Cloud 키가 아니면 AI Studio 주소로 (반대도)
      if (!providerFixed && !switched && authFail(res.status, t)) {
        switched = true; provider = provider === 'vertex' ? 'studio' : 'vertex';
        console.warn('provider switch →', provider);
        const r2 = await tryList(list, isFlash);
        if (r2) { providerFixed = true; return r2; }
        provider = provider === 'vertex' ? 'studio' : 'vertex';
        return null;
      }
      if (res.status === 404) { missingModels.add(provider + model); continue; }
      if (isFlash) flashTried++;
      if ([429, 500, 503].includes(res.status)) {
        if (res.status === 429 && /PerDay|per day|daily/i.test(t)) { dayOutModels.set(model, nextPacificMidnight().getTime()); if (isFlash) flashDay++; }
        last = new Response(t, { status: res.status }); lastModel = model;
        console.warn('model fallback', model, res.status);
        continue;
      }
      return { res: new Response(t, { status: res.status }), model };
    }
    return null;
  };
  // 쉬운 일은 빠른 모델 먼저 (안 되면 좋은 모델로)
  if (o.fast) { const q = await tryList(LITE_MODELS, false); if (q) return { ...q, dayOut: false }; }
  const f = o.skipFlash ? null : await tryList(FLASH_MODELS(), true);
  if (f) return { ...f, dayOut: false };
  const dayOut = !!o.skipFlash || (flashTried > 0 && flashDay === flashTried);
  if (dayOut && !o.skipFlash) rpc('qm_set_flash_until', { p_until: nextPacificMidnight().toISOString() }).catch(() => {});
  if (o.lite) { const l = await tryList(LITE_MODELS, false); if (l) return { ...l, dayOut: false }; }
  return { res: last || new Response('{"error":{"message":"사용 가능한 모델이 없어요"}}', { status: 500 }), model: lastModel, dayOut };
}
async function askModel(body: any, o: { lite: boolean; fast?: boolean; timeoutMs: number; skipFlash?: boolean; think?: 'low' | 'default' }) {
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), o.timeoutMs);
  const t0 = Date.now();
  try {
    let g = await callModel(body, { lite: o.lite, fast: o.fast, signal: ac.signal, skipFlash: o.skipFlash, think: o.think });
    if (!g.res.ok && [500, 503].includes(g.res.status) && !g.dayOut) {
      await g.res.text(); await sleep(3000);
      g = await callModel(body, { lite: o.lite, fast: o.fast, signal: ac.signal, skipFlash: o.skipFlash, think: o.think });
    }
    if (!g.res.ok) { const t = await g.res.text(); return { ok: false, status: g.res.status, text: t, model: g.model, dayOut: g.dayOut, timeout: false, ms: Date.now() - t0 }; }
    const text = await collectSSE(g.res.body!);
    return { ok: true, status: 200, text, model: g.model, dayOut: false, timeout: false, ms: Date.now() - t0 };
  } catch (e) {
    const timeout = (e as Error)?.name === 'AbortError' || (e as Error)?.name === 'TimeoutError';
    return { ok: false, status: 0, text: timeout ? 'timeout' : String((e as Error)?.message || e), model: null as string | null, dayOut: false, timeout, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}
function nextPacificMidnight() {
  const now = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const passed = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000;
  return new Date(now.getTime() - passed + 24 * 3600e3 + 60e3);
}
const flashBlocked = (until: unknown) => typeof until === 'string' && new Date(until).getTime() > Date.now();
const LITE_MSG = '오늘은 고급 문제 유형을 만들 수 있는 서버 사용량이 다 찼어요. O/X·객관식·단답형·빈칸 채우기는 지금도 만들 수 있고, 다른 유형은 한도가 다시 채워진 뒤에 만들 수 있어요.';
const DAY_MSG = '오늘 서버 사용량이 다 찼어요. 한도가 다시 채워진 뒤에 시도해 주세요.';
function modelErr(status: number, t: string) {
  let m = ''; try { m = JSON.parse(t)?.error?.message || ''; } catch { /* */ }
  if (status === 429) return '서버 사용량이 많아요. 잠시 후 다시 시도해 주세요.';
  if (status >= 500) return '서버가 붐벼요. 잠시 후 다시 시도해 주세요.';
  if (status === 401 || status === 403) return '서버 키 설정을 확인해야 해요. 관리자에게 문의해 주세요.';
  return `서버 오류 (${status})${m ? ': ' + m.slice(0, 160) : ''}`;
}

// ---------- 자료 첨부 ----------
const b64Cache = new Map<string, string>(); let b64Size = 0;
async function materialParts(list: any[]) {
  const parts: any[] = []; let i = 0, sum = 0;
  for (const m of list || []) {
    i++; parts.push({ text: `[자료 ${i}: ${m.name}]` });
    if (provider === 'studio') { parts.push(await studioPart(m)); continue; }
    const d = await inlineData(m); sum += d.length * 0.75;
    if (sum > MAX_INLINE) throw new QmError('QM_FILE', `자료가 너무 많아요. 한 학습의 자료는 합쳐서 ${MAX_INLINE / 1048576}MB까지 쓸 수 있어요. 나눠서 다른 학습으로 올려 주세요.`);
    parts.push({ inlineData: { mimeType: m.mime, data: d } });
  }
  return parts;
}
async function download(m: any) {
  const { data: blob, error } = await SB.storage.from(BUCKET).download(m.path);
  if (error || !blob) throw new QmError('QM_FILE', `자료 "${m.name}"가 서버에 없어요. 다시 올려 주세요.`, 400);
  return new Uint8Array(await blob.arrayBuffer());
}
async function inlineData(m: any) {
  const hit = b64Cache.get(m.path); if (hit) return hit;
  const b64 = bytesToB64(await download(m));
  if (b64Size + b64.length > 80e6) { b64Cache.clear(); b64Size = 0; }
  b64Cache.set(m.path, b64); b64Size += b64.length;
  return b64;
}
async function studioPart(m: any) {
  if (m.gemini_uri && m.gemini_expires && new Date(m.gemini_expires).getTime() > Date.now() + 3600e3) return { fileData: { mimeType: m.gemini_mime || m.mime, fileUri: m.gemini_uri } };
  const bytes = await download(m);
  try {
    const up = await uploadToStudio(bytes, m.mime, m.name);
    await rpc('qm_material_set_gemini', { p_material: m.id, p_uri: up.uri, p_mime: up.mime, p_expires: new Date(Date.now() + 46 * 3600e3).toISOString() });
    return { fileData: { mimeType: up.mime, fileUri: up.uri } };
  } catch (e) {
    console.warn('file upload failed, inline', e);
    return { inlineData: { mimeType: m.mime, data: bytesToB64(bytes) } };
  }
}
async function uploadToStudio(bytes: Uint8Array, mime: string, name: string) {
  const r1 = await fetch(`${GBASE}/upload/v1beta/files`, { method: 'POST', headers: { 'x-goog-api-key': geminiKey(), 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': String(bytes.length), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { display_name: String(name).slice(0, 100) } }) });
  const url = r1.headers.get('x-goog-upload-url');
  if (!r1.ok || !url) throw new Error('upload start ' + r1.status);
  const r2 = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' }, body: bytes });
  if (!r2.ok) throw new Error('upload ' + r2.status);
  let file = (await r2.json()).file;
  for (let k = 0; file && file.state === 'PROCESSING' && k < 40; k++) {
    await sleep(1500);
    const r3 = await fetch(`${GBASE}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': geminiKey() } });
    if (r3.ok) file = await r3.json();
  }
  if (!file?.uri || file.state === 'FAILED') throw new Error('upload state ' + file?.state);
  return { uri: file.uri as string, mime: (file.mimeType as string) || mime };
}
async function collectSSE(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(), dec = new TextDecoder();
  let buf = '', text = '';
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    try { const d = JSON.parse(line.slice(5).trim()); for (const p of d?.candidates?.[0]?.content?.parts || []) if (p.text && !p.thought) text += p.text; } catch { /* */ }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let k; while ((k = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, k).replace(/\r$/, '')); buf = buf.slice(k + 1); }
  }
  handle(buf.trim());
  return text;
}
function bytesToB64(bytes: Uint8Array) {
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// ---------- 응답 형식 ----------
const SYS = '너는 숙련된 한국의 시험 출제 위원이자 교육 전문가다. 사용자가 올린 학습 자료(사진·PDF)를 꼼꼼히 정확하게 읽고, 자료 내용에 충실한 고품질 결과물을 만든다. 반드시 지정된 JSON 형식으로만 답한다.';
const PARTS_SCHEMA = { type: 'OBJECT', properties: {
  subject: { type: 'STRING' }, overview: { type: 'STRING' },
  parts: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, concepts: { type: 'ARRAY', items: { type: 'STRING' } },
    weight: { type: 'INTEGER' }, source: { type: 'STRING' } }, required: ['title', 'summary', 'concepts', 'weight'] } },
  warnings: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['subject', 'overview', 'parts'] };
const Q_ITEM = { type: 'OBJECT', properties: {
  type: { type: 'STRING', enum: QTYPES }, question: { type: 'STRING' }, passage: { type: 'STRING' },
  statements: { type: 'ARRAY', items: { type: 'STRING' } }, rightItems: { type: 'ARRAY', items: { type: 'STRING' } },
  choices: { type: 'ARRAY', items: { type: 'STRING' } }, answer: { type: 'STRING' }, explanation: { type: 'STRING' },
  concept: { type: 'STRING' }, difficulty: { type: 'STRING', enum: ['쉬움', '보통', '어려움'] } }, required: ['type', 'question', 'answer', 'explanation', 'difficulty'] };
const qSchema = (n: number) => ({ type: 'OBJECT', properties: { questions: { type: 'ARRAY', items: Q_ITEM, minItems: n, maxItems: n } }, required: ['questions'] });
const FLASH_SCHEMA = (n: number) => ({ type: 'OBJECT', properties: { cards: { type: 'ARRAY', minItems: Math.max(1, n - 1), maxItems: n, items: { type: 'OBJECT',
  properties: { front: { type: 'STRING' }, back: { type: 'STRING' }, part: { type: 'STRING' } }, required: ['front', 'back', 'part'] } } }, required: ['cards'] });
const NOTE_SUM_SCHEMA = { type: 'OBJECT', properties: { title: { type: 'STRING' }, overview: { type: 'STRING' }, checklist: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['title', 'overview', 'checklist'] };
const NOTE_SCHEMA = { type: 'OBJECT', properties: {
  sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    title: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } },
    terms: { type: 'ARRAY', items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, desc: { type: 'STRING' } }, required: ['term', 'desc'] } },
    tip: { type: 'STRING' } }, required: ['title', 'points'] } } }, required: ['sections'] };
const LEAF = { type: 'OBJECT', properties: { label: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['label'] };
const MIND_SCHEMA = { type: 'OBJECT', properties: { children: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  label: { type: 'STRING' }, note: { type: 'STRING' }, children: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    label: { type: 'STRING' }, note: { type: 'STRING' }, children: { type: 'ARRAY', items: LEAF } }, required: ['label'] } } }, required: ['label'] } } }, required: ['children'] };

const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
function parseJson(text: string) { try { return JSON.parse(text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '')); } catch { return null; } }
function parseQuestions(text: string, part: string, extra: Record<string, unknown> = {}) {
  const j = parseJson(text);
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
  const arr = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12).map((x) => s(x, 1000)) : []);
  return (Array.isArray(j?.questions) ? j.questions : []).filter((q: any) => q && typeof q.question === 'string' && q.question.trim()).map((q: any) => ({
    id: rid(), partId: part, raw: true, type: QTYPES.includes(q.type) ? q.type : 'short',
    question: s(q.question, 4000), passage: s(q.passage, 6000), statements: arr(q.statements), rightItems: arr(q.rightItems), choices: arr(q.choices),
    answer: s(q.answer, 1000), explanation: s(q.explanation, 6000), concept: s(q.concept, 200), difficulty: s(q.difficulty, 10), ...extra,
  }));
}

// ---------- 프롬프트 ----------
const DIFF: Record<string, string> = { easy: '모두 쉬움(기본 개념 확인)', normal: '대부분 보통', hard: '대부분 어려움(응용·추론)', mixed: '쉬움 30%, 보통 50%, 어려움 20% 정도로 섞기' };
const RULES = `[규칙]
1. 반드시 첨부 자료의 내용에 근거해 출제한다. 자료에 없는 사실을 지어내지 않는다(자료·사례형 제시문은 자료 개념을 적용한 새 상황으로 만들어도 됨).
2. 정답이 명확하게 하나로 정해지도록(복수 정답형 제외) 만들고, 오답 보기는 그럴듯하게 만든다.
3. choices, statements, rightItems의 각 항목 앞에 번호나 기호(①, 1., ㄱ., (가), ⓐ 등)를 붙이지 않는다.
4. 객관식 정답 번호가 한쪽에 몰리지 않게 고르게 분포시킨다. 해설에서 보기를 가리킬 때는 ①②③ 같은 번호를 쓴다.
5. 수식·기호는 LaTeX로 $...$ 안에 쓴다(예: $x^2+1$). 수식이 아닌 곳에는 $를 쓰지 않는다.
6. 모든 내용은 자연스러운 한국어로 쓴다. 문제 앞에 문항 번호를 붙이지 않는다.`;
function typeLines(counts: Record<string, number>, N: number) {
  return Object.entries(counts).map(([t, c]) => `- ${TYPE_AI[t].label} (type="${t}") ${c}문항: ${TYPE_AI[t].ai.replace(/\{N\}/g, String(N))}`).join('\n');
}
function analyzePrompt(memo: string) {
  return `첨부한 학습 자료를 처음부터 끝까지 꼼꼼히 읽고, 문제를 낼 수 있도록 내용을 '파트(단원)'로 나눠줘.
- subject: 과목·주제 이름 (짧게, 예: "생명과학 Ⅰ 세포 분열")
- overview: 자료 전체 내용 요약 2~3문장
- parts: 3~12개. 자료의 흐름 순서대로.
  · title: 파트 제목 (짧게)
  · summary: 이 파트에서 다루는 내용 2~3문장
  · concepts: 문제로 낼 만한 핵심 개념·용어 4~10개 (짧게)
  · weight: 분량·중요도 1~10
  · source: 자료 위치 (예: "자료 1, 3~5쪽")
- warnings: 글씨가 흐리거나 잘린 부분 등 읽기 어려웠던 점 (없으면 빈 배열)
${memo.trim() ? `\n[사용자 메모] ${memo.trim()}\n` : ''}모든 내용은 한국어로 쓴다.`;
}
function genPrompt(st: Settings, a: any, parts: Part[], memo: string, part: Part, t: any, avoid: string[]) {
  const N = st.choiceN || 5, n = t.count;
  return `[출제 정보]
- 과목/자료: ${a.subject || ''}
- 자료 개요: ${a.overview || ''}
- 출제 스타일: ${STYLES[st.style] || STYLES.school}
- 이번에 출제할 파트: "${part.title}"
  · 내용: ${part.summary || '(제목 참고)'}
  · 핵심 개념: ${(part.concepts || []).join(', ') || '(자료에서 판단)'}
  · 자료 위치: ${part.source || '-'}
- 전체 파트 구성(참고용, 이번 파트 외 내용은 출제하지 말 것): ${parts.map((p, i) => `${i + 1}.${p.title}`).join(' / ')}
${t.slots > 1 ? `- 이 요청은 이 파트를 ${t.slots}번에 나눠 출제하는 것 중 ${t.slot}번째다.${t.focus?.length ? ` 이번에는 주로 다음 개념을 다룬다: ${t.focus.join(', ')}` : ' 다른 묶음과 겹치지 않도록 파트의 다른 측면을 다룬다.'}\n` : ''}${memo.trim() ? `- 사용자 메모: ${memo.trim()}\n` : ''}
[출제 요청] 아래 유형과 개수를 정확히 지켜 총 ${n}문항을 만들어라. questions 배열에는 정확히 ${n}개가 들어가야 한다.
${typeLines(t.counts, N)}
- 난이도: ${DIFF[st.difficulty] || DIFF.mixed}
- 해설: ${st.explain === 'detail' ? '자세히. 정답 근거를 자료 내용으로 설명하고, 객관식은 주요 오답이 왜 틀렸는지도 설명.' : '핵심만 1~2문장.'}
- concept: 각 문제가 확인하는 핵심 개념 (짧게)
${avoid.length ? `\n[이미 출제된 문제 — 같은 내용·같은 질문 반복 금지]\n${avoid.slice(-40).map((s) => '- ' + s).join('\n')}\n` : ''}${st.extra.trim() ? `\n[사용자 추가 요청]\n${st.extra.trim()}\n` : ''}${t.tries > 0 ? `\n[중요] 앞서 만든 문제와 겹치지 않는 새 문제로, 정확히 ${n}문항을 만들어라.\n` : ''}
${RULES}
7. 지정한 유형이 이 파트 내용과 도저히 맞지 않을 때만 다른 유형으로 바꾼다.`;
}
function similarPrompt(st: any, a: any, q: any, n: number, avoid: string[]) {
  const N = st.choiceN || 5;
  const items = (l: string[], mk: (i: number) => string) => l.map((x, i) => `  ${mk(i)} ${x}`).join('\n');
  return `[오답 복습] 학생이 아래 문제를 틀렸다. 같은 개념을 다시 확인할 수 있는 '비슷한 새 문제'를 정확히 ${n}개 만들어라.
- 과목/자료: ${a.subject || ''}
[틀린 문제]
- 유형: ${TYPE_AI[q.type]?.label || q.type}
${q.passage ? `- 제시문: ${q.passage}\n` : ''}- 문제: ${q.question}
${q.statements?.length ? `- 진술/항목:\n${items(q.statements, (i) => 'ㄱㄴㄷㄹㅁㅂ'[i] + '.')}\n` : ''}${q.choices?.length ? `- 보기:\n${items(q.choices, (i) => '①②③④⑤⑥'[i])}\n` : ''}- 정답: ${q.answer}
- 해설: ${q.explanation}
${q.mine ? `- 학생이 쓴 답: ${q.mine}\n` : ''}- 핵심 개념: ${q.concept || '(문제에서 판단)'}

[만들 문제]
${typeLines({ [q.type]: n }, N)}
- 같은 핵심 개념을 묻되 숫자·상황·표현·보기를 바꿔서, 원래 문제를 그대로 베끼지 않는다.
- 학생이 헷갈렸을 지점을 다시 확인할 수 있게 만든다. ${n > 1 ? '여러 개면 서로 다른 각도에서 묻는다.' : ''}
- 해설: ${st.explain === 'brief' ? '핵심만 1~2문장.' : '자세히. 왜 그 답인지, 원래 문제에서 헷갈렸을 부분을 짚어서.'}
${avoid.length ? `\n[이미 만든 문제 — 반복 금지]\n${avoid.slice(-20).map((s) => '- ' + s).join('\n')}\n` : ''}
${RULES}`;
}
function partsText(parts: Part[]) {
  return parts.map((p, i) => `${i + 1}. ${p.title}\n   내용: ${p.summary || ''}\n   핵심 개념: ${(p.concepts || []).join(', ')}\n   자료 위치: ${p.source || '-'}`).join('\n');
}
function flashPrompt(a: any, parts: Part[], n: number) {
  return `첨부 자료로 암기·복습용 플래시카드를 정확히 ${n}장 만들어라.
- 과목/자료: ${a.subject || ''}
- 다룰 파트:
${partsText(parts)}
[규칙]
- 파트 분량에 맞게 고르게 나눈다. part에는 위 파트 제목을 그대로 쓴다.
- front: 질문이나 용어 (짧게, 한 줄). 예: "세포 주기에서 DNA가 복제되는 시기는?" / "삼투"
- back: 답과 짧은 설명 (1~3문장). 핵심어가 먼저 오게.
- 자료에 있는 내용만. 같은 내용을 반복하지 않는다. 수식은 $...$ LaTeX.
- 모든 내용은 한국어로.`;
}
function notePrompt(a: any, parts: Part[], detail: string) {
  return `첨부 자료의 내용 중 아래 파트를 '요약 노트'로 정리해라. 시험 전에 이것만 보면 되도록 꼭 필요한 것만 남긴다.
- 과목/자료: ${a.subject || ''}
- 정리할 파트(순서대로 section 하나씩, title은 파트 제목 그대로):
${partsText(parts)}
[규칙]
- sections: 위 파트마다 하나. points는 ${detail === 'brief' ? '3~5개' : '5~9개'}의 핵심 문장(짧게, 중요한 단어는 **굵게**). terms에는 꼭 외울 용어와 뜻${detail === 'brief' ? '(3개 이내)' : ''}. tip에는 자주 헷갈리는 점이나 시험 포인트 1문장.
- 이 파트 외의 내용은 쓰지 않는다. 자료에 있는 내용만, 같은 내용 반복 없이. 수식은 $...$ LaTeX. 모든 내용은 한국어로.`;
}
function noteSumPrompt(a: any, parts: Part[]) {
  return `첨부 자료 전체로 만드는 '요약 노트'의 머리말과 마무리를 써라.
- 과목/자료: ${a.subject || ''}
- 파트 구성:
${partsText(parts)}
[규칙]
- title: 노트 제목 (짧게)
- overview: 자료 전체 흐름 2~3문장
- checklist: 시험 직전 스스로 확인할 질문 5~8개 (여러 파트에 고르게)
- 자료에 있는 내용만. 모든 내용은 한국어로.`;
}
function mindPrompt(a: any, parts: Part[]) {
  return `첨부 자료의 내용 중 아래 파트를 마인드맵 가지로 정리해라.
- 과목/자료: ${a.subject || ''}
- 파트:
${partsText(parts)}
[규칙]
- children: 위 파트마다 하나(label은 파트 제목). 그 아래 children에 하위 개념 2~6개, 그 아래에 세부 내용 0~5개.
- label은 짧게(15자 안팎). 필요하면 note에 한 줄 설명.
- 자료에 있는 내용만. 모든 내용은 한국어로.`;
}

// ---------- 할 일 처리 ----------
const STEP_TIMEOUT_MS = Number(Deno.env.get('QM_STEP_TIMEOUT_MS')) || 110_000;
async function runTask(id: string, step: string, c: any) {
  const t = c.task, p = t.payload || {}, job = c.job, item = c.item || {}, a = item.analysis || {};
  const allParts: Part[] = Array.isArray(a.parts) ? a.parts : [];
  let prompt = '', notice: string | null = null;
  const done = (out: unknown, error: string | null, fatal: boolean, more: unknown[] | null, response: string | null, model: string | null, ms = 0) =>
    rpc('qm_task_done', { p_job: id, p_step: step, p_task: t.id, p_out: out || {}, p_error: error, p_fatal: fatal, p_more: more || [],
      p_notice: notice, p_prompt: prompt, p_response: response, p_model: model, p_ms: ms });
  if (t.tries > 4) return done({}, '여러 번 시도했지만 만들지 못했어요.', false, null, null, null);
  const fb = flashBlocked(c.flash_until);
  let mats: any[];
  // 노트 머리말(전체 요약)은 분석 결과만으로 충분해서 자료를 다시 보내지 않아요 (비용 절약)
  try { mats = job.kind === 'note' && p.part === 'summary' ? [] : await materialParts(c.materials); }
  catch (e) { return done({}, e instanceof QmError ? e.message : '자료를 읽지 못했어요. 다시 올려 주세요.', true, null, null, null); }
  const call = (schema: unknown, temperature: number, lite: boolean, think: 'low' | 'default', skipFlash = false, fast = false) => askModel({
    systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: 'user', parts: [...mats, { text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: 32768, responseMimeType: 'application/json', responseSchema: schema } }, { lite, fast, timeoutMs: STEP_TIMEOUT_MS, skipFlash, think });
  // 일시적인 오류(붐빔 등)는 잠깐 뒤 다시
  const retryLater = (r: any, msg: string) => (t.tries < 4 ? done({}, msg, false, [{ ...p, delay: 6 + t.tries * 6 }], r.text?.slice(0, 1500), r.model, r.ms) : done({}, msg, false, null, r.text?.slice(0, 1500), r.model, r.ms));

  if (job.kind === 'analyze') {
    prompt = analyzePrompt(str(item.memo, 2000));
    const r = await call(PARTS_SCHEMA, 0.3, true, 'low', fb);
    if (!r.ok && !r.dayOut && (r.timeout || r.status === 429 || r.status >= 500 || r.status === 0) && t.tries < 3) return retryLater(r, r.timeout ? '시간 초과 · 다시' : modelErr(r.status, r.text));
    if (!r.ok) return done({}, r.dayOut ? DAY_MSG : r.timeout ? '자료 분석이 너무 오래 걸렸어요. 자료를 나눠서 올려 주세요.' : modelErr(r.status, r.text), false, null, r.text.slice(0, 1500), r.model, r.ms);
    const j = parseJson(r.text);
    if (!j || !Array.isArray(j.parts) || !j.parts.length) return done({}, '자료에서 내용을 찾지 못했어요. 더 선명한 사진이나 다른 자료로 해 주세요.', false, null, r.text, r.model, r.ms);
    const old: Part[] = allParts;
    const parts: Part[] = j.parts.slice(0, 12).map((x: any) => {
      const title = str(x.title, 200) || '파트';
      return { id: old.find((o) => o.title === title)?.id || rid(), title, summary: str(x.summary, 1000),
        concepts: (Array.isArray(x.concepts) ? x.concepts : []).slice(0, 12).map((v: unknown) => str(v, 100)).filter(Boolean),
        weight: Math.max(1, Math.min(10, Math.trunc(Number(x.weight) || 5))), source: str(x.source, 200) };
    });
    const analysis = { subject: str(j.subject, 200), overview: str(j.overview, 2000), parts,
      warnings: (Array.isArray(j.warnings) ? j.warnings : []).slice(0, 20).map((x: unknown) => str(x, 500)), at: new Date().toISOString() };
    return done({ analysis }, null, false, null, r.text, r.model, r.ms);
  }

  if (job.kind === 'questions') {
    const o = c.output || {}, isSim = o.kind === 'similar';
    const st = SAFE_SETTINGS({ ...(o.settings || {}), total: 10 });
    const counts: Record<string, number> = p.counts && sumOf(p.counts) === p.count ? p.counts : { mc: p.count };
    const avoid = (c.avoid || []).filter((x: unknown) => typeof x === 'string' && x);
    const part = allParts.find((x) => x.id === p.part) || { id: p.part, title: '파트' };
    prompt = isSim ? similarPrompt(o.settings || {}, a, p.src || {}, p.count, avoid) : genPrompt(st, a, allParts, str(item.memo, 2000), part, { ...p, counts }, avoid);
    const liteOk = Object.keys(counts).every((x) => LITE_TYPES.includes(x));
    if (fb && !liteOk) return done({}, LITE_MSG, false, null, null, null);
    const simple = Object.keys(counts).every((x) => SIMPLE_TYPES.includes(x));
    const r = await call(qSchema(p.count), isSim ? 0.9 : 0.8, liteOk, simple ? 'low' : 'default', fb && liteOk, liteOk);
    if (r.model && /lite/.test(r.model)) notice = 'lite';
    if (!r.ok) {
      if (r.dayOut) return done({}, liteOk ? DAY_MSG : LITE_MSG, false, null, r.text.slice(0, 1500), r.model, r.ms);
      if (r.timeout && p.count > 1) {
        const list: string[] = []; Object.entries(counts).forEach(([k, n]) => { for (let i = 0; i < n; i++) list.push(k); });
        const h = Math.ceil(list.length / 2);
        return done({}, '시간 초과 · 나눠서 다시', false, [list.slice(0, h), list.slice(h)].map((x) => ({ ...p, count: x.length, counts: countsOf(x) })), 'timeout', r.model, r.ms);
      }
      if (r.status === 429 || r.status >= 500 || r.status === 0) return retryLater(r, modelErr(r.status, r.text));
      return done({}, modelErr(r.status, r.text), false, (p.tries || 0) < 2 ? [{ ...p, tries: (p.tries || 0) + 1 }] : null, r.text.slice(0, 1500), r.model, r.ms);
    }
    const extra = isSim ? { from: str(p.src?.id, 40) } : {};
    const qs = parseQuestions(r.text, p.part, extra).slice(0, p.count);
    const miss = p.count - qs.length;
    if (miss > 0 && (p.tries || 0) < 3) {
      const got = countsOf(qs.map((q: any) => q.type)), need: Record<string, number> = {};
      for (const [k, n] of Object.entries(counts)) { const m = Math.max(0, n - (got[k] || 0)); if (m) need[k] = m; }
      let ns = sumOf(need);
      while (ns > miss) { const k = Object.keys(need).find((x) => need[x] > 0)!; need[k]--; if (!need[k]) delete need[k]; ns--; }
      if (ns < miss) need[Object.keys(counts)[0]] = (need[Object.keys(counts)[0]] || 0) + (miss - ns);
      return done({ questions: qs }, null, false, [{ ...p, count: miss, counts: need, tries: (p.tries || 0) + 1 }], r.text, r.model, r.ms);
    }
    return done({ questions: qs }, qs.length ? (miss > 0 ? `${miss}문항을 만들지 못했어요.` : null) : '문제가 만들어지지 않았어요.', false, null, r.text, r.model, r.ms);
  }

  // 플래시카드 · 요약 노트 · 마인드맵 (나눠서 만든 한 조각)
  const want: string[] = Array.isArray(p.parts) ? p.parts : [];
  const parts = allParts.filter((x) => !want.length || want.includes(x.id));
  const kind = job.kind, order = Number(p.order) || 0;
  const n = Math.max(1, Math.min(30, Number(p.count) || 10));
  const isSum = kind === 'note' && p.part === 'summary';
  const detail = str(c.output?.settings?.detail, 10);
  if (kind === 'flash') prompt = flashPrompt(a, parts, n) + (p.slots > 1 ? `\n- 이 요청은 카드 묶음 ${p.slots}개 중 ${p.slot}번째다.${p.overlap ? ' 다른 묶음과 같은 카드를 만들지 않도록, 파트의 핵심 개념을 앞에서부터 나눠 맡는다고 생각하고 ' + p.slot + '번째 몫을 만든다.' : ''}` : '');
  else if (kind === 'note') prompt = isSum ? noteSumPrompt(a, parts) : notePrompt(a, parts, detail);
  else prompt = mindPrompt(a, parts);
  const schema = kind === 'flash' ? FLASH_SCHEMA(n) : kind === 'note' ? (isSum ? NOTE_SUM_SCHEMA : NOTE_SCHEMA) : MIND_SCHEMA;
  const fast = kind !== 'note';
  const r = await call(schema, 0.4, true, kind === 'note' && !isSum ? 'default' : 'low', fb, fast);
  if (r.model && /lite/.test(r.model) && !fast) notice = 'lite';
  if (!r.ok) {
    if (r.dayOut) return done({}, DAY_MSG, false, null, r.text.slice(0, 1500), r.model, r.ms);
    if ((r.status === 429 || r.status >= 500 || r.status === 0 || r.timeout) && t.tries < 3) return retryLater(r, r.timeout ? '시간 초과 · 다시' : modelErr(r.status, r.text));
    return done({}, r.timeout ? '시간이 너무 오래 걸렸어요. 다시 시도해 주세요.' : modelErr(r.status, r.text), false, null, r.text.slice(0, 1500), r.model, r.ms);
  }
  const j = parseJson(r.text);
  const s = (v: unknown, k: number) => str(v, k);
  let data: any = null, count = 1;
  if (kind === 'flash' && Array.isArray(j?.cards)) {
    const byTitle = new Map(parts.map((x) => [x.title, x.id]));
    const cards = j.cards.filter((x: any) => x && x.front && x.back).slice(0, n).map((x: any) => ({ id: rid(), front: s(x.front, 500), back: s(x.back, 1500), part: byTitle.get(s(x.part, 200)) || '', partTitle: s(x.part, 200) }));
    if (cards.length) { data = { cards }; count = cards.length; }
  } else if (kind === 'note' && isSum && j && (j.title || j.overview)) {
    data = { title: s(j.title, 200), overview: s(j.overview, 2000), checklist: (Array.isArray(j.checklist) ? j.checklist : []).slice(0, 12).map((x: unknown) => s(x, 300)) };
  } else if (kind === 'note' && Array.isArray(j?.sections)) {
    data = { sections: j.sections.slice(0, 20).map((x: any, i: number) => ({ o: order * 100 + i, title: s(x.title, 200), tip: s(x.tip, 500), points: (Array.isArray(x.points) ? x.points : []).slice(0, 14).map((v: unknown) => s(v, 600)),
        terms: (Array.isArray(x.terms) ? x.terms : []).slice(0, 14).map((v: any) => ({ term: s(v?.term, 100), desc: s(v?.desc, 400) })).filter((v: any) => v.term) })) };
  } else if (kind === 'mindmap' && Array.isArray(j?.children)) {
    const node = (x: any, d: number): any => ({ label: s(x?.label, 60) || '·', note: s(x?.note, 200), children: d < 3 && Array.isArray(x?.children) ? x.children.slice(0, 10).map((y: any) => node(y, d + 1)) : [] });
    data = { root: a.subject ? s(a.subject, 60) : s(j.root, 60) || '주제', children: j.children.slice(0, 14).map((x: any, i: number) => ({ ...node(x, 1), o: order * 100 + i })) };
  }
  if (!data) return done({}, '만들지 못했어요. 다시 시도해 주세요.', false, t.tries < 2 ? [{ ...p }] : null, r.text, r.model, r.ms);
  if (kind !== 'flash') count = 1;
  return done({ data, count }, null, false, null, r.text, r.model, r.ms);
}

// ---------- 문제 하나 새로 만들기 (다시 만들기 · 오류 신고 공용) ----------
async function makeReplacement(o: { id: string; item_id: string; settings: any; data?: any; analysis: any }, old: any, uid: string, ip: unknown, hint: string, kind = 'regen') {
  const a = o.analysis || {}, parts: Part[] = a.parts || [];
  const part = parts.find((p) => p.id === old.partId) || { id: old.partId, title: old.partTitle || '파트' };
  const st = SAFE_SETTINGS({ ...(o.settings || {}), total: 10 });
  const qb = o.data?.qByPart || {};
  const others: string[] = []; for (const k of Object.keys(qb)) for (const q of qb[k] || []) if (q.id !== old.id) others.push(str(q.question, 70));
  const type = QTYPES.includes(old.type) ? old.type : 'short';
  const prompt = genPrompt(st, a, parts, '', part, { count: 1, counts: { [type]: 1 }, tries: 1 }, [...others.slice(-30), str(old.question, 70)]) +
    (hint ? `\n\n[이번 문제 요청] ${hint}` : '');
  const mats = await materialParts(await rpc('qm_material_paths', { p_uid: uid, p_item: o.item_id }));
  const fb = flashBlocked((await rpc('qm_public_config', {}))?.flash_until);
  const lite = LITE_TYPES.includes(type);
  if (fb && !lite) throw new QmError('QM_DAYOUT', LITE_MSG, 429);
  const r = await askModel({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: 'user', parts: [...mats, { text: prompt }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 16384, responseMimeType: 'application/json', responseSchema: qSchema(1) } },
    { lite, fast: lite, timeoutMs: 100_000, skipFlash: fb, think: SIMPLE_TYPES.includes(type) ? 'low' : 'default' });
  await rpc('qm_log', { p_uid: uid, p_item: o.item_id, p_output: o.id, p_kind: kind, p_prompt: prompt, p_response: r.text.slice(0, 20000), p_ok: r.ok, p_error: r.ok ? null : r.text.slice(0, 500), p_model: r.model, p_ip: ip, p_ms: r.ms }).catch(() => {});
  if (!r.ok) throw new QmError('QM_GEN', r.dayOut ? DAY_MSG : r.timeout ? '시간이 너무 오래 걸렸어요. 다시 시도해 주세요.' : modelErr(r.status, r.text), 502);
  const q = parseQuestions(r.text, old.partId)[0];
  if (!q) throw new QmError('QM_GEN', '문제가 만들어지지 않았어요. 다시 시도해 주세요.', 502);
  q.id = old.id; delete (q as any).raw;
  return q;
}

// ---------- 문제 1개 다시 만들기 (바로 응답) ----------
async function regenOne(b: any, who: Who, U: Record<string, unknown>) {
  needKey();
  const o = await rpc('qm_output_get', { ...U, p_output: b.outputId });
  if (o.foreign || !['pdf', 'solve', 'similar'].includes(o.kind)) throw new QmError('QM_INPUT', '다시 만들 수 없어요.');
  if (o.status === 'running') throw new QmError('QM_BUSY', '아직 만드는 중이에요.', 409);
  const qb = o.data?.qByPart || {};
  let old: any = null; for (const k of Object.keys(qb)) for (const q of qb[k] || []) if (q.id === b.qid) old = q;
  if (!old) throw new QmError('QM_NOTFOUND', '문제를 찾을 수 없어요.', 404);
  const ch = await rpc('qm_regen_charge', { ...U, p_output: o.id });
  try {
    const q = await makeReplacement({ id: o.id, item_id: o.item_id, settings: o.settings, data: o.data, analysis: o.item?.analysis }, old, who.id, U.p_ip, str(b.hint, 300));
    return json({ question: q, charged: ch?.charged || 0 });
  } catch (e) {
    if (ch?.charged) await rpc('qm_regen_refund', { p_uid: who.id, p_output: o.id }).catch(() => {});
    throw e;
  }
}

// ---------- 오류 신고: 서버가 먼저 판단, 아니면 관리자에게 ----------
const JUDGE_SCHEMA = { type: 'OBJECT', properties: { valid: { type: 'BOOLEAN' }, confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] }, reason: { type: 'STRING' } }, required: ['valid', 'confidence', 'reason'] };
function qText(q: any) {
  const L = (l: string[], mk: (i: number) => string) => (l || []).map((x, i) => `  ${mk(i)} ${x}`).join('\n');
  return `- 유형: ${TYPE_AI[q.type]?.label || q.type}
${q.passage ? `- 제시문: ${q.passage}\n` : ''}- 문제: ${q.question}
${q.statements?.length ? `- 항목:\n${L(q.statements, (i) => 'ㄱㄴㄷㄹㅁㅂ'[i] + '.')}\n` : ''}${q.rightItems?.length ? `- 오른쪽 항목:\n${L(q.rightItems, (i) => 'ⓐⓑⓒⓓⓔⓕ'[i])}\n` : ''}${q.choices?.length ? `- 보기:\n${L(q.choices, (i) => '①②③④⑤⑥'[i])}\n` : ''}- 정답: ${q.answer}
- 해설: ${q.explanation}`;
}
async function reportQuestion(b: any, who: Who, U: Record<string, unknown>) {
  needKey();
  const r = await rpc('qm_report_create', { ...U, p_output: b.outputId, p_qid: str(b.qid, 40), p_reason: str(b.reason, 50), p_detail: str(b.detail, 1000) });
  const q = r.q || {}, a = r.item?.analysis || {};
  let verdict: any = null, model: string | null = null;
  const prompt = `학생이 아래 시험 문제에 오류가 있다고 신고했다. 첨부 자료와 일반적인 지식으로 꼼꼼히 확인해서, 문제에 실제로 오류가 있는지 판단하라.
[과목] ${a.subject || ''}
[문제]
${qText(q)}

[학생의 신고]
- 종류: ${str(b.reason, 50)}
- 내용: ${str(b.detail, 1000)}

[판단 기준]
- 오류로 본다(valid=true): 정답이 틀림, 정답이 둘 이상이거나 없음, 문제·보기가 모호해서 답을 정할 수 없음, 자료 내용과 어긋남, 해설이 정답과 맞지 않음, 보기·항목이 깨져 있음.
- 오류가 아니다(valid=false): 학생이 개념을 잘못 이해한 경우, 문제는 맞는데 어렵다는 불만, 취향 차이.
- confidence: 확실하면 high, 애매하면 medium, 판단하기 어려우면 low.
- reason: 판단 이유를 학생에게 보여 줄 한국어 1~2문장 (존댓말, ~해요체).`;
  try {
    const mats = await materialParts(await rpc('qm_material_paths', { p_uid: who.id, p_item: r.item_id }));
    const res = await askModel({ systemInstruction: { parts: [{ text: '너는 공정하고 꼼꼼한 시험 검토 위원이다. 지정된 JSON으로만 답한다.' }] },
      contents: [{ role: 'user', parts: [...mats, { text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: JUDGE_SCHEMA } },
      { lite: true, timeoutMs: 90_000, think: 'low' });
    model = res.model;
    await rpc('qm_log', { p_uid: who.id, p_item: r.item_id, p_output: r.output_id, p_kind: 'report', p_prompt: prompt, p_response: res.text.slice(0, 20000), p_ok: res.ok, p_error: res.ok ? null : res.text.slice(0, 500), p_model: res.model, p_ip: U.p_ip, p_ms: res.ms }).catch(() => {});
    if (res.ok) verdict = parseJson(res.text);
  } catch (e) { console.error('judge', e); }
  const reason = str(verdict?.reason, 500);
  if (verdict?.valid === true && verdict.confidence !== 'low') {
    let nq: any = null;
    try { nq = await makeReplacement({ id: r.output_id, item_id: r.item_id, settings: r.settings, analysis: a }, q, who.id, U.p_ip, `앞 문제는 이런 오류로 신고됐다: ${reason}. 같은 개념을 묻되 이 오류가 없게 새로 만든다.`, 'report'); }
    catch (e) { console.error('report regen', e); }
    const d = await rpc('qm_report_decide', { p_report: r.id, p_status: 'accepted', p_ai_reason: reason, p_new_q: nq, p_by: 'server:' + (model || '') });
    return json({ status: d.status, reason, question: d.status === 'accepted' ? nq : null, accepted_count: d.accepted_count, rewarded: d.rewarded });
  }
  await rpc('qm_report_decide', { p_report: r.id, p_status: 'admin', p_ai_reason: reason || '서버가 판단하지 못했어요.', p_new_q: null, p_by: 'server:' + (model || '') });
  return json({ status: 'admin', reason });
}
async function adminReportDecide(b: any, who: Who, U: Record<string, unknown>) {
  const r = await rpc('qm_report_get', { ...U, p_report: b.reportId });
  if (!b.accept) return json(await rpc('qm_report_decide', { p_report: r.id, p_status: 'rejected', p_ai_reason: null, p_new_q: null, p_by: 'admin' }));
  needKey();
  const nq = await makeReplacement({ id: r.output_id, item_id: r.item_id, settings: r.settings, analysis: r.item?.analysis }, r.q || {}, who.id, U.p_ip,
    `앞 문제는 이런 오류로 신고됐다: ${str(r.detail, 300)}. 같은 개념을 묻되 이 오류가 없게 새로 만든다.`, 'report');
  return json(await rpc('qm_report_decide', { p_report: r.id, p_status: 'accepted', p_ai_reason: null, p_new_q: nq, p_by: 'admin' }));
}
