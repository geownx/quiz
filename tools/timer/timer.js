/* 공부 타이머 데이터: 진행 중 타이머(기기에 저장) + 공부 기록(Supabase tools_sessions)
   체크리스트 · 허브 · 타이머 화면이 같이 써요 */
'use strict';
(function () {
  const { sb, LS } = QT;
  const RUN = 'qt_tm_run', QUEUE = 'qt_tm_queue';
  let UID = null;
  const must = ({ data, error }) => { if (error) throw new Error(errMsg(error)); return data; };
  function errMsg(e) {
    const m = String((e && e.message) || e || '');
    if (/^\[.*\]$|서버|인터넷|권한|로그인|테이블|이미 있는/.test(m)) return m;
    return QT.dbErr(e, '공부 기록');
  }

  const dayOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const hms = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
  const ms2 = s => { s = Math.max(0, Math.ceil(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const dur = s => { const m = Math.round(s / 60); if (m < 1) return s > 0 ? '1분 미만' : '0분'; return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ' ' + m % 60 + '분' : ''}` : `${m}분`; };

  const TM = {
    errMsg, hms, ms2, dur, dayOf,
    init(uid) { UID = uid; TM.flush(); },

    /* ---------- 진행 중 타이머 (이 기기) ---------- */
    run() { const r = LS.get(RUN, null); return r && r.uid === UID ? r : null; },
    setRun(r) { if (r) LS.set(RUN, Object.assign(r, { uid: UID })); else LS.del(RUN); document.dispatchEvent(new Event('qt-timer')); },
    elapsed(r, now = Date.now()) { return r ? (r.acc + (r.seg ? now - r.seg : 0)) / 1000 : 0; },

    /* ---------- 공부 기록 ---------- */
    async save(s) {
      const row = { day: s.day || dayOf(s.started_at), subject_id: s.subject_id || null, task_id: s.task_id || null, mode: s.mode || 'stopwatch',
        seconds: Math.max(1, Math.min(43200, Math.round(s.seconds))), started_at: new Date(s.started_at).toISOString(), ended_at: new Date(s.ended_at).toISOString() };
      try { return must(await sb().from('tools_sessions').insert(row).select('id,day,subject_id,task_id,mode,seconds,started_at').single()); }
      catch (e) {
        // 인터넷이 끊겼으면 기기에 모아 뒀다가 나중에 올려요
        if (/인터넷/.test(e.message)) { const q = LS.get(QUEUE, []); q.push({ uid: UID, row }); LS.set(QUEUE, q); return Object.assign({ id: 'local' + Date.now(), queued: true }, row); }
        throw e;
      }
    },
    async flush() {
      const q = LS.get(QUEUE, []); if (!q.length || !UID) return;
      const mine = q.filter(x => x.uid === UID), rest = q.filter(x => x.uid !== UID);
      try { if (mine.length) must(await sb().from('tools_sessions').insert(mine.map(x => x.row))); LS.set(QUEUE, rest); } catch (e) {}
    },
    async sessions(from, to) {
      const q = cols => sb().from('tools_sessions').select(cols).gte('day', from).lte('day', to).order('started_at').limit(5000);
      let r = await q('id,day,subject_id,task_id,mode,seconds,started_at,q_total,q_correct,ref_title');
      if (r.error && /column/i.test(r.error.message || '')) r = await q('id,day,subject_id,task_id,mode,seconds,started_at');
      return must(r);
    },
    async remove(id) { must(await sb().from('tools_sessions').delete().eq('id', id)); },
    sum: list => list.reduce((a, s) => a + (+s.seconds || 0), 0),
    by(list, key) { const o = {}; list.forEach(s => { const k = s[key] || 'none'; o[k] = (o[k] || 0) + (+s.seconds || 0); }); return o; },
  };
  QT.TM = TM;

  /* 다른 화면 위쪽에 '공부 중' 띠 (체크리스트 · 허브) */
  QT.timerBanner = function (el) {
    if (!el) return;
    let t = null;
    const draw = () => {
      const r = TM.run(); clearInterval(t);
      if (!r) { el.innerHTML = ''; return; }
      const tick = () => {
        const p = r.mode === 'pomodoro' && r.pomo ? r.pomo : null;
        const txt = p ? `${p.phase === 'focus' ? '🍅 집중' : '☕ 휴식'} ${ms2(p.len - TM.elapsed(r))}` : `⏱ ${hms(TM.elapsed(r))}`;
        el.innerHTML = `<a class="runbar ${r.seg ? '' : 'paused'}" href="/tools/timer/"><span class="dot"></span><b>${QT.esc(r.label || '공부')} ${r.seg ? '공부 중' : '멈춤'}</b><span class="tm">${txt}</span><span class="go">열기 →</span></a>`;
      };
      tick(); if (r.seg) t = setInterval(tick, 1000);
    };
    draw(); document.addEventListener('qt-timer', draw); window.addEventListener('storage', e => { if (e.key === RUN) draw(); });
  };
})();
