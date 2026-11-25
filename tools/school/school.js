/* 학교생활 데이터: 내 학교 설정 · D-day (Supabase) + 급식 · 시간표 · 학사일정 (나이스, neis 함수로 중계) */
'use strict';
(function () {
  const { sb, LS, todayKey, shiftKey, parseKey } = QT;
  const FN = new URL(QT.CONFIG.SUPABASE_URL).origin + '/functions/v1/neis';
  const ALLERGY = ['', '난류', '우유', '메밀', '땅콩', '대두', '밀', '고등어', '게', '새우', '돼지고기', '복숭아', '토마토', '아황산류', '호두', '닭고기', '쇠고기', '오징어', '조개류', '잣'];
  const must = ({ data, error }) => { if (error) throw new Error(errMsg(error)); return data; };
  function errMsg(e) {
    const m = String((e && e.message) || e || '');
    if (/relation .* does not exist|Could not find the table|schema cache/i.test(m)) return '서버에 학교생활 테이블이 아직 없어요. (Supabase SQL 실행 필요)';
    if (/NO_KEY|NEIS_KEY/.test(m)) return '서버에 나이스 인증키가 아직 없어요.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '인터넷 연결을 확인해 주세요.';
    if (/404|not found|Requested function/i.test(m)) return '서버에 나이스 함수(neis)가 아직 없어요.';
    return m || '잠시 후 다시 시도해 주세요.';
  }
  const ymd = k => k.replace(/-/g, '');
  const fromYmd = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  /* 학년도는 3월부터, 2학기는 8월부터 (방학 중엔 다음 학기 기준) */
  const AY = k => { const d = parseKey(k); return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear(); };
  const SEM = k => { const m = parseKey(k).getMonth() + 1; return m >= 3 && m <= 7 ? 1 : 2; };
  const KIND_OP = { '초등학교': 'els', '중학교': 'mis', '고등학교': 'his' };
  const maxGrade = kind => kind === '초등학교' ? 6 : 3;

  let UID = null;
  const cache = {
    get(k, ttl) { const v = LS.get(`qt_sc_${UID}_${k}`, null); return v && (!ttl || Date.now() - v.at < ttl) ? v.d : null; },
    set(k, d) { LS.set(`qt_sc_${UID}_${k}`, { at: Date.now(), d }); },
  };

  async function call(op, params, page) {
    const s = await QT.sb().auth.getSession(), tok = s && s.data && s.data.session && s.data.session.access_token;
    let res;
    try { res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: QT.CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + (tok || QT.CONFIG.SUPABASE_KEY) }, body: JSON.stringify({ op, params, page }) }); }
    catch (e) { throw new Error('Failed to fetch'); }
    let j = null; try { j = await res.json(); } catch (e) {}
    if (res.status === 404) throw new Error('404');
    if (!res.ok || !j || j.error) throw new Error((j && j.error && (j.error.code === 'NO_KEY' ? 'NO_KEY' : j.error.message)) || `서버 오류 (${res.status})`);
    return j.rows || [];
  }

  /* 급식 메뉴 한 줄: "닭갈비 (5.6.13.15.)" → { name, al:[5,6,13,15] } */
  function dish(s) {
    s = String(s).trim();
    const m = s.match(/\(?\s*((?:\d{1,2}\.)+\d{0,2})\s*\)?\s*$/);
    const al = m ? m[1].split('.').map(Number).filter(n => n >= 1 && n <= 19) : [];
    const name = (m ? s.slice(0, m.index) : s).replace(/[*#]+$/, '').trim();
    return { name: name || s, al: [...new Set(al)] };
  }

  const SC = {
    ALLERGY, errMsg, AY, SEM, maxGrade,
    init(uid) { UID = uid; },
    cache,
    /* ----- 내 학교 설정 ----- */
    async profile() {
      const rows = must(await sb().from('tools_profile').select('*').limit(1));
      const p = rows[0] || null; cache.set('profile', p); return p;
    },
    async saveProfile(p) {
      const row = { user_id: UID, edu_code: p.edu_code, school_code: p.school_code, school_name: p.school_name, school_kind: p.school_kind, grade: p.grade, class_nm: p.class_nm, allergies: p.allergies || [], updated_at: new Date().toISOString() };
      const r = must(await sb().from('tools_profile').upsert(row, { onConflict: 'user_id' }).select('*').single());
      cache.set('profile', r); ['meal', 'tt', 'sch'].forEach(k => Object.keys(localStorage).filter(x => x.startsWith(`qt_sc_${UID}_${k}`)).forEach(x => localStorage.removeItem(x)));
      return r;
    },
    /* ----- D-day ----- */
    async ddays() { const r = must(await sb().from('tools_ddays').select('id,title,day').gte('day', shiftKey(todayKey(), -1)).order('day')); cache.set('ddays', r); return r; },
    async addDday(title, day) { return must(await sb().from('tools_ddays').insert({ title: String(title).trim().slice(0, 30), day }).select('id,title,day').single()); },
    async deleteDday(id) { must(await sb().from('tools_ddays').delete().eq('id', id)); },

    /* ----- 나이스 ----- */
    async searchSchools(name) {
      const rows = await call('school', { SCHUL_NM: name.trim() });
      return rows.filter(r => KIND_OP[r.SCHUL_KND_SC_NM]).slice(0, 40).map(r => ({ edu_code: r.ATPT_OFCDC_SC_CODE, edu_name: r.ATPT_OFCDC_SC_NM, school_code: r.SD_SCHUL_CODE, school_name: r.SCHUL_NM, school_kind: r.SCHUL_KND_SC_NM, addr: r.ORG_RDNMA || '' }));
    },
    async classes(p, grade) {
      const k = todayKey(), key = `cls_${p.school_code}_${AY(k)}_${grade}`, c = cache.get(key, 7 * 86400e3); if (c) return c;
      const rows = await call('class', { ATPT_OFCDC_SC_CODE: p.edu_code, SD_SCHUL_CODE: p.school_code, AY: AY(k), GRADE: grade });
      const list = [...new Set(rows.map(r => String(r.CLASS_NM)))].sort((a, b) => (+a || 999) - (+b || 999) || a.localeCompare(b, 'ko'));
      cache.set(key, list); return list;
    },
    /* 하루~여러 날 급식: { 'YYYY-MM-DD': [{ type:'중식', dishes:[{name,al}], cal }] } */
    async meals(p, from, to) {
      const key = `meal_${p.school_code}_${from}_${to}`, c = cache.get(key, 3 * 3600e3); if (c) return c;
      const rows = await call('meal', { ATPT_OFCDC_SC_CODE: p.edu_code, SD_SCHUL_CODE: p.school_code, MLSV_FROM_YMD: ymd(from), MLSV_TO_YMD: ymd(to) });
      const by = {};
      rows.forEach(r => { const d = fromYmd(String(r.MLSV_YMD)); (by[d] || (by[d] = [])).push({ type: r.MMEAL_SC_NM || '급식', dishes: String(r.DDISH_NM || '').split(/<br\s*\/?>/i).map(dish).filter(x => x.name), cal: r.CAL_INFO || '' }); });
      const order = { '조식': 0, '중식': 1, '석식': 2 };
      Object.values(by).forEach(a => a.sort((x, y) => (order[x.type] ?? 9) - (order[y.type] ?? 9)));
      cache.set(key, by); return by;
    },
    /* 시간표: { 'YYYY-MM-DD': [{ p:1, s:'국어' }] } */
    async timetable(p, from, to) {
      const op = KIND_OP[p.school_kind]; if (!op || !p.grade || !p.class_nm) return {};
      const key = `tt_${p.school_code}_${p.grade}_${p.class_nm}_${from}_${to}`, c = cache.get(key, 6 * 3600e3); if (c) return c;
      const rows = await call(op, { ATPT_OFCDC_SC_CODE: p.edu_code, SD_SCHUL_CODE: p.school_code, AY: AY(from), SEM: SEM(from), GRADE: p.grade, CLASS_NM: p.class_nm, TI_FROM_YMD: ymd(from), TI_TO_YMD: ymd(to) });
      const by = {};
      rows.forEach(r => { const d = fromYmd(String(r.ALL_TI_YMD)), s = String(r.ITRT_CNTNT || '').replace(/^-\s*/, '').trim(); if (!s) return; (by[d] || (by[d] = [])).push({ p: +r.PERIO, s }); });
      Object.values(by).forEach(a => { a.sort((x, y) => x.p - y.p); for (let i = a.length - 1; i > 0; i--) if (a[i].p === a[i - 1].p) a.splice(i, 1); });
      cache.set(key, by); return by;
    },
    /* 학사일정: [{ day, name, off }] */
    async schedule(p, from, to) {
      const key = `sch_${p.school_code}_${from}_${to}`, c = cache.get(key, 12 * 3600e3); if (c) return c;
      const rows = await call('schedule', { ATPT_OFCDC_SC_CODE: p.edu_code, SD_SCHUL_CODE: p.school_code, AA_FROM_YMD: ymd(from), AA_TO_YMD: ymd(to) });
      const seen = new Set(), list = [];
      rows.forEach(r => { const name = String(r.EVENT_NM || '').trim(), day = fromYmd(String(r.AA_YMD)); if (!name || name === '토요휴업일' || seen.has(day + name)) return; seen.add(day + name);
        list.push({ day, name, off: /휴업|공휴일|방학|휴일/.test(String(r.SBTR_DD_SC_NM || '') + name) && !/개학/.test(name) }); });
      list.sort((a, b) => a.day < b.day ? -1 : a.day > b.day ? 1 : 0);
      cache.set(key, list); return list;
    },
    /* 학사일정에서 시험만 골라 D-day로 (여러 날이면 첫날) */
    exams(list) {
      const out = [];
      list.filter(e => /고사|시험|평가|학력|수능/.test(e.name) && !/수행/.test(e.name)).forEach(e => {
        const base = e.name.replace(/\s*\(?\d+일차\)?|\s*\d+\s*일차/g, '').trim();
        const prev = out[out.length - 1];
        if (prev && prev.title === base && (parseKey(e.day) - parseKey(prev.last)) / 86400e3 <= 4) { prev.last = e.day; return; }
        out.push({ title: base, day: e.day, last: e.day, auto: true });
      });
      return out;
    },
    dLabel(day) { const n = Math.round((parseKey(day) - parseKey(todayKey())) / 86400e3); return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`; },
    weekRange(k) { const d = parseKey(k), w = (d.getDay() + 6) % 7; const mon = shiftKey(k, -w); return { mon, fri: shiftKey(mon, 4), days: [0, 1, 2, 3, 4].map(i => shiftKey(mon, i)) }; },
  };
  QT.SC = SC;
})();
