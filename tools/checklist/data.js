/* 체크리스트 데이터 (Supabase tools_subjects · tools_tasks) — 허브 화면과 체크리스트가 같이 써요 */
'use strict';
(function () {
  const { sb, LS, todayKey, shiftKey } = QT;
  /* 과목 색 (밝은 화면 · 어두운 화면 모두 잘 보이는 색) */
  const PALETTE = ['#e2683c', '#2a78d6', '#2f8f5b', '#8a5bd6', '#d9a21b', '#c8402f', '#1aa3a3', '#b0569a', '#5b6b8c', '#6f9a1f'];
  const DEFAULTS = ['국어', '수학', '영어', '과학', '사회', '한국사'];
  let UID = null;
  const ck = k => `qt_cl_${UID}_${k}`;
  const must = ({ data, error }) => { if (error) throw new Error(errMsg(error)); return data; };
  function errMsg(e) {
    const m = String((e && e.message) || e || '');
    if (/^\[.*\]$|서버|인터넷|권한|로그인|테이블|이미 있는/.test(m)) return m;
    return QT.dbErr(e, '체크리스트');
  }

  const nextColor = list => {
    const used = new Set(list.map(s => s.color.toLowerCase()));
    return PALETTE.find(c => !used.has(c)) || PALETTE[list.length % PALETTE.length];
  };

  const CL = {
    COLS: 'id,day,title,subject_id,minutes,done,created_at,link_item,link_title',
    PALETTE, errMsg,
    init(uid) { UID = uid; },
    cache: { get: (k, d) => LS.get(ck(k), d), set: (k, v) => LS.set(ck(k), v) },

    /* ----- 과목 ----- */
    async subjects() {
      let list = must(await sb().from('tools_subjects').select('id,name,color,sort').order('sort').order('created_at'));
      if (!list.length) {
        // 처음 쓰는 계정(할 일도 과목도 없음)이면 기본 과목을 만들어 줘요
        const any = must(await sb().from('tools_tasks').select('id').limit(1));
        if (!any.length) list = must(await sb().from('tools_subjects').insert(DEFAULTS.map((name, i) => ({ name, color: PALETTE[i], sort: i }))).select('id,name,color,sort'));
      }
      CL.cache.set('subjects', list);
      return list;
    },
    async addSubject(name, list) {
      name = String(name || '').trim().slice(0, 20);
      if (!name) throw new Error('과목 이름을 써 주세요.');
      if (list.some(s => s.name === name)) throw new Error('이미 있는 과목 이름이에요.');
      const sort = list.reduce((m, s) => Math.max(m, s.sort || 0), -1) + 1;
      return must(await sb().from('tools_subjects').insert({ name, color: nextColor(list), sort }).select('id,name,color,sort').single());
    },
    async updateSubject(id, patch) {
      if (patch.name != null) { patch.name = String(patch.name).trim().slice(0, 20); if (!patch.name) throw new Error('과목 이름을 써 주세요.'); }
      return must(await sb().from('tools_subjects').update(patch).eq('id', id).select('id,name,color,sort').single());
    },
    async deleteSubject(id) { must(await sb().from('tools_subjects').delete().eq('id', id)); },
    async moveSubject(list, id, dir) {
      const i = list.findIndex(s => s.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const a = list.slice(); [a[i], a[j]] = [a[j], a[i]];
      await Promise.all(a.map((s, k) => s.sort === k ? null : sb().from('tools_subjects').update({ sort: k }).eq('id', s.id)).filter(Boolean));
      a.forEach((s, k) => s.sort = k);
      return a;
    },

    /* ----- 할 일 ----- */
    async tasks(day) {
      let r = await sb().from('tools_tasks').select(CL.COLS).eq('day', day).order('created_at');
      if (r.error && /column/i.test(r.error.message || '')) { CL.COLS = 'id,day,title,subject_id,minutes,done,created_at'; r = await sb().from('tools_tasks').select(CL.COLS).eq('day', day).order('created_at'); }
      const list = must(r);
      CL.cache.set('day_' + day, list);
      return list;
    },
    async addTask(t) {
      const row = { day: t.day, title: String(t.title).trim().slice(0, 100), subject_id: t.subject_id || null, minutes: t.minutes || null };
      if (t.link_item) Object.assign(row, { link_item: t.link_item, link_title: String(t.link_title || '').slice(0, 100) });
      return must(await sb().from('tools_tasks').insert(row).select(CL.COLS).single());
    },
    async tasksRange(from, to) { return must(await sb().from('tools_tasks').select('day,done').gte('day', from).lte('day', to).limit(5000)); },
    async addTasks(rows) {
      if (!rows.length) return [];
      return must(await sb().from('tools_tasks').insert(rows).select(CL.COLS));
    },
    async setDone(id, done) { must(await sb().from('tools_tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id)); },
    async updateTask(id, patch) { return must(await sb().from('tools_tasks').update(patch).eq('id', id).select(CL.COLS).single()); },
    async deleteTask(id) { must(await sb().from('tools_tasks').delete().eq('id', id)); },
    async deleteDone(day) { must(await sb().from('tools_tasks').delete().eq('day', day).eq('done', true)); },

    /* ----- 연속 달성: 할 일이 있고 전부 끝낸 날이 며칠 이어졌는지 ----- */
    async streak() {
      const from = shiftKey(todayKey(), -400);
      const rows = must(await sb().from('tools_tasks').select('day,done').gte('day', from).lte('day', todayKey()).limit(10000));
      const by = {}; rows.forEach(r => { const d = by[r.day] || (by[r.day] = { n: 0, c: 0 }); d.n++; if (r.done) d.c++; });
      const full = k => by[k] && by[k].n > 0 && by[k].c === by[k].n;
      let k = todayKey(); if (!full(k)) k = shiftKey(k, -1);
      let n = 0; while (full(k)) { n++; k = shiftKey(k, -1); }
      CL.cache.set('streak', n);
      return n;
    },

    /* ----- 예전(기기에만 저장하던) 체크리스트 기록 옮기기 ----- */
    legacy() { const d = LS.get('qm-checklist-v1', null); return d && typeof d === 'object' && Object.values(d).some(a => Array.isArray(a) && a.length) ? d : null; },
    async importLegacy(subs) {
      const old = CL.legacy(); if (!old) return 0;
      let list = subs.slice();
      const names = [...new Set(Object.values(old).flat().map(t => String((t && t.subject) || '').trim()).filter(Boolean))];
      for (const nm of names) if (!list.some(s => s.name === nm.slice(0, 20))) list.push(await CL.addSubject(nm, list));
      const rows = [];
      Object.entries(old).forEach(([day, arr]) => {
        if (!QT.isKey(day) || !Array.isArray(arr)) return;
        arr.forEach(t => { if (!t || !String(t.title || '').trim()) return; const s = list.find(x => x.name === String(t.subject || '').trim().slice(0, 20));
          rows.push({ day, title: String(t.title).trim().slice(0, 100), subject_id: s ? s.id : null, minutes: Math.max(0, Math.min(600, +t.min || 0)) || null, done: !!t.done, done_at: t.done ? new Date().toISOString() : null }); });
      });
      for (let i = 0; i < rows.length; i += 200) await CL.addTasks(rows.slice(i, i + 200));
      LS.set('qm-checklist-v1-backup', old); LS.del('qm-checklist-v1');
      return rows.length;
    },
  };
  QT.CL = CL;
})();
