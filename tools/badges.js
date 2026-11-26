/* 공부 배지 · 레벨 — 내 기록(qm_my_stats)으로 계산해요. 서버에 따로 저장하지 않아요.
   QTBADGE.load(client)        → { stats, xp, level, badges }
   QTBADGE.render(box, data)    → 내 계정 화면의 레벨 카드 + 배지 진열장
   QTBADGE.check(client)        → 새로 받은 배지가 있으면 축하 팝업 */
(() => {
  const TIER = [['동', '#c98a55'], ['은', '#9aa4b5'], ['금', '#e2b33c'], ['다이아', '#55c2e8']];
  const B = [
    { id: 'streak', ic: '🔥', n: '연속 공부', d: '하루도 빠짐없이 공부한 날 (최고 기록)', u: '일', t: [3, 7, 30, 100], v: s => s.best },
    { id: 'hours', ic: '⏳', n: '누적 공부 시간', d: '타이머로 기록한 모든 공부 시간', u: '시간', t: [10, 50, 100, 300], v: s => Math.floor(s.sec / 3600) },
    { id: 'pomo', ic: '🍅', n: '뽀모도로', d: '끝까지 마친 뽀모도로 집중', u: '번', t: [10, 50, 200, 500], v: s => s.pomo },
    { id: 'tasks', ic: '✅', n: '할 일 완료', d: '체크리스트에서 완료한 할 일', u: '개', t: [10, 100, 500, 1000], v: s => s.tasks_done },
    { id: 'perfect', ic: '💯', n: '완벽한 하루', d: '할 일 3개 이상을 하루에 전부 완료', u: '일', t: [1, 7, 30, 100], v: s => s.perfect },
    { id: 'hw', ic: '📝', n: '과제 제출', d: '학교생활 › 과제에서 제출 체크', u: '개', t: [1, 10, 30, 100], v: s => s.hw_done },
    { id: 'dawn', ic: '🌅', n: '새벽형 인간', d: '새벽 4~6시에 시작한 공부', u: '번', t: [1, 5, 20, 50], v: s => s.dawn },
    { id: 'owl', ic: '🦉', n: '자정 넘기기', d: '공부하다 자정을 넘긴 날', u: '번', t: [1, 5, 20, 50], v: s => s.midnight },
    { id: 'weekend', ic: '🏖️', n: '주말 전사', d: '토 · 일요일에 공부한 날', u: '일', t: [4, 12, 30, 60], v: s => s.weekend },
    { id: 'colors', ic: '🎨', n: '컬러 수집가', d: '매일 바뀌는 16가지 오늘의 색 구경하기', u: '색', t: [4, 8, 12, 16], v: s => s.colors },
  ];
  const TITLES = [[1, '새싹'], [5, '꾸준이'], [10, '공부러'], [20, '집중러'], [30, '공부 장인'], [50, '전설의 수험생']];
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  // 오늘의 색을 본 기록 (이 기기 기준)
  function colorsSeen() { const k = 'qt_colors_seen', s = ls.get(k, []); const i = window.QTTHEME && QTTHEME.index; if (i != null && !s.includes(i)) { s.push(i); ls.set(k, s); } return s.length; }
  const key = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  function streaks(days) {
    const set = new Set(days), sorted = [...set].sort();
    let best = 0, run = 0, prev = null;
    sorted.forEach(k => { const t = Date.parse(k + 'T00:00:00'); run = prev != null && t - prev <= 864e5 + 3600e3 ? run + 1 : 1; prev = t; best = Math.max(best, run); });
    let cur = 0; const d = new Date(); if (!set.has(key(d))) d.setDate(d.getDate() - 1);
    while (set.has(key(d))) { cur++; d.setDate(d.getDate() - 1); }
    return { best, cur };
  }
  function compute(raw) {
    const s = Object.assign({ sec: 0, pomo: 0, days: [], tasks_done: 0, perfect: 0, hw_done: 0, dawn: 0, midnight: 0, weekend: 0 }, raw || {});
    Object.keys(s).forEach(k => { if (k !== 'days') s[k] = +s[k] || 0; });
    const st = streaks(s.days || []); s.best = st.best; s.cur = st.cur; s.colors = colorsSeen();
    const badges = B.map(b => { const v = b.v(s), tier = b.t.filter(x => v >= x).length, next = b.t[tier]; return Object.assign({}, b, { val: v, tier, next, pct: next ? Math.min(100, v / next * 100) : 100 }); });
    const tiers = badges.reduce((a, b) => a + b.tier, 0);
    const xp = Math.floor(s.sec / 60) + s.tasks_done * 10 + s.hw_done * 30 + s.perfect * 20 + tiers * 50;
    let level = 1, need = 100, left = xp;
    while (left >= need) { left -= need; level++; need = 100 + (level - 1) * 50; }
    const title = TITLES.filter(t => level >= t[0]).pop()[1];
    return { stats: s, badges, tiers, xp, level, title, into: left, need };
  }
  async function load(client) {
    const { data, error } = await client.rpc('qm_my_stats');
    if (error) throw error;
    return compute(data);
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}시간 ${m}분` : `${m}분`; };
  function render(box, D) {
    const s = D.stats, got = D.badges.filter(b => b.tier);
    box.innerHTML = `<div class="lvc"><div class="lvt"><div class="lvn"><small>Lv.</small>${D.level}</div><div><b>${esc(D.title)}</b><span>다음 레벨까지 ${D.need - D.into} XP</span></div></div>
        <div class="lvbar"><i style="width:${D.into / D.need * 100}%"></i></div>
        <div class="lvs"><div><b>${hm(s.sec)}</b><span>누적 공부</span></div><div><b>${s.cur}일</b><span>지금 연속</span></div><div><b>${s.tasks_done}</b><span>완료한 할 일</span></div><div><b>${got.length}/${D.badges.length}</b><span>모은 배지</span></div></div></div>
      <div class="bdg">${D.badges.map(b => `<button class="bd ${b.tier ? 't' + b.tier : 'lock'}" data-b="${b.id}" style="--tc:${b.tier ? TIER[b.tier - 1][1] : '#c5c9d4'}">
          <span class="bi">${b.ic}</span><b>${esc(b.n)}</b><em>${b.tier ? TIER[b.tier - 1][0] : '잠김'}</em>
          <span class="bp"><i style="width:${b.pct}%"></i></span><small>${b.next ? `${b.val} / ${b.next}${b.u}` : '모두 모음 ✨'}</small></button>`).join('')}</div>
      <p class="bnote">XP = 공부 1분 1점 · 할 일 완료 10점 · 과제 제출 30점 · 완벽한 하루 20점 · 배지 단계마다 50점</p>`;
    box.querySelectorAll('.bd').forEach(el => el.onclick = () => detail(D.badges.find(b => b.id === el.dataset.b)));
  }
  function popup(html, cls) {
    const m = document.createElement('div'); m.className = 'modal bdm ' + (cls || '');
    m.innerHTML = `<div class="box">${html}<button class="btn acc" data-close style="width:100%;margin-top:16px">좋아요</button></div>`;
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); };
    document.body.append(m); return m;
  }
  function detail(b) {
    popup(`<div class="bdd"><span class="bi">${b.ic}</span><h3>${esc(b.n)}</h3><p>${esc(b.d)}</p>
      <div class="bdt">${b.t.map((x, i) => `<div class="${b.tier > i ? 'on' : ''}" style="--tc:${TIER[i][1]}"><b>${TIER[i][0]}</b><span>${x}${b.u}</span></div>`).join('')}</div>
      <p class="sub">지금 ${b.val}${b.u}${b.next ? ` · 다음 단계까지 ${b.next - b.val}${b.u}` : ' · 최고 단계예요!'}</p></div>`);
  }
  function celebrate(list) {
    const conf = Array.from({ length: 28 }, (_, i) => `<i style="left:${Math.random() * 100}%;animation-delay:${Math.random() * .6}s;background:${['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'][i % 5]}"></i>`).join('');
    popup(`<div class="cf">${conf}</div><div class="bdd"><div class="bnew">새 배지를 받았어요!</div>
      ${list.map(b => `<div class="bgot" style="--tc:${TIER[b.tier - 1][1]}"><span class="bi">${b.ic}</span><div><b>${esc(b.n)} · ${TIER[b.tier - 1][0]}</b><small>${b.t[b.tier - 1]}${b.u} 달성</small></div></div>`).join('')}
      <a class="link" href="/#/me">내 계정에서 배지 보기 →</a></div>`, 'party');
  }
  /* 새로 받은 배지 확인 (처음 한 번은 조용히 지금 상태만 기억) */
  async function check(client, uid, D) {
    try {
      D = D || await load(client);
      const k = 'qt_badges_' + (uid || 'me'), seen = ls.get(k, null), now = {};
      D.badges.forEach(b => now[b.id] = b.tier);
      if (seen) { const fresh = D.badges.filter(b => b.tier > (seen[b.id] || 0)); if (fresh.length) celebrate(fresh); }
      ls.set(k, now);
      return D;
    } catch (e) { return null; }
  }
  window.QTBADGE = { load, render, check, compute, LIST: B };
})();
