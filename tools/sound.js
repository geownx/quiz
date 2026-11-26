/* 문제지메이커 소리 — 뽀모도로 알람 · 백색소음 (파일 없이 브라우저에서 바로 만들어요)
   QTSND.alarm()            설정한 알람을 울려요 (진동 · 알림 포함)
   QTSND.test(kind)         알람 미리 듣기
   QTSND.noise.play(kind)   백색소음 켜기 / QTSND.noise.stop() 끄기 */
(() => {
  'use strict';
  const LSK = 'qt_snd';
  const read = () => { try { return Object.assign({ alarm: 'bell', avol: 0.8, noise: null, nvol: 0.5 }, JSON.parse(localStorage.getItem(LSK) || '{}')); } catch (e) { return { alarm: 'bell', avol: 0.8, noise: null, nvol: 0.5 }; } };
  const S = read();
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify(S)); } catch (e) {} };

  let A = null;
  function ctx() {
    if (!A) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      // 아이폰: 무음 스위치가 켜져 있어도 소리가 나게 (iOS 16.4+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      A = new C();
    }
    if (A.state === 'suspended') A.resume().catch(() => {});
    return A;
  }
  // 아이폰은 화면을 한 번 눌러야 소리를 낼 수 있어요 → 처음 누를 때 미리 준비
  const unlock = () => { const a = ctx(); if (!a) return; try { const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource(); s.buffer = b; s.connect(a.destination); s.start(0); } catch (e) {} };
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));

  /* ---------- 알람 ---------- */
  const ALARMS = [['bell', '🔔 종소리'], ['marimba', '🎵 마림바'], ['digital', '⏰ 디지털'], ['off', '🔕 끔']];
  function tone(a, out, f, t, dur, type = 'sine', vol = 1) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f; o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  let alarmOut = null;
  function play(kind, vol) {
    const a = ctx(); if (!a || kind === 'off') return 0;
    if (alarmOut) { try { alarmOut.disconnect(); } catch (e) {} }
    const out = alarmOut = a.createGain(); out.gain.value = Math.max(0.05, vol); out.connect(a.destination);
    let t = a.currentTime + 0.05, end = t;
    if (kind === 'bell') {
      // 맑은 종: 기본음 + 배음, 길게 울림 × 3번
      for (let r = 0; r < 3; r++) [[1318.5, 0], [1046.5, 0.45], [1568, 0.9]].forEach(([f, d]) => {
        const s = t + r * 1.9 + d; tone(a, out, f, s, 1.6, 'sine', 0.5); tone(a, out, f * 2.76, s, 0.6, 'sine', 0.12); tone(a, out, f * 5.4, s, 0.25, 'sine', 0.05); end = s + 1.6;
      });
    } else if (kind === 'marimba') {
      for (let r = 0; r < 3; r++) [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const s = t + r * 1.3 + i * 0.14; tone(a, out, f, s, 0.5, 'sine', 0.6); tone(a, out, f * 4, s, 0.08, 'sine', 0.15); end = s + 0.5; });
    } else {
      for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) { const s = t + r * 1 + i * 0.12; tone(a, out, 2093, s, 0.08, 'square', 0.25); end = s + 0.1; }
    }
    return end - a.currentTime;
  }
  async function notify(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const opt = { body, icon: '/tools/icons/icon-192.png', badge: '/tools/icons/icon-192.png', tag: 'qm-pomo', renotify: true, vibrate: [300, 150, 300, 150, 300] };
      if (reg && reg.showNotification) await reg.showNotification(title, opt); else new Notification(title, opt);
    } catch (e) {}
  }
  function alarm(title, body) {
    // 알람이 울리는 동안 백색소음은 잠깐 작게
    const sec = play(S.alarm, S.avol);
    if (sec && N.gain && A) { const now = A.currentTime; N.gain.gain.cancelScheduledValues(now); N.gain.gain.setTargetAtTime(S.nvol * 0.15, now, 0.1); N.gain.gain.setTargetAtTime(S.nvol, now + sec, 0.4); }
    try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    if (title) notify(title, body || '');
  }
  const canNotify = () => 'Notification' in window && Notification.permission !== 'denied';
  async function askNotify() { try { if (!('Notification' in window)) return 'unsupported'; return await Notification.requestPermission(); } catch (e) { return 'denied'; } }

  /* ---------- 백색소음 ---------- */
  const NOISES = [['rain', '🌧 빗소리'], ['wave', '🌊 파도'], ['fire', '🔥 모닥불'], ['white', '📻 백색소음'], ['brown', '🌫 웅웅']];
  const BUF = {};
  function makeBuf(kind) {
    const a = ctx(), sr = a.sampleRate, len = Math.floor(sr * 9), fade = Math.floor(sr * 0.6), N2 = len + fade;
    const buf = a.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const raw = new Float32Array(N2);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, drop = 0, crack = 0;
      for (let i = 0; i < N2; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        br = (br + 0.02 * w) / 1.02; const brown = br * 3.5;
        let v;
        if (kind === 'white') v = w * 0.25;
        else if (kind === 'brown') v = brown * 0.9;
        else if (kind === 'wave') v = brown * 0.8 + pink * 0.25;
        else if (kind === 'rain') { if (Math.random() < 0.0009) drop = 0.25 + Math.random() * 0.5; drop *= 0.9965; v = pink * 0.55 + w * drop * 0.6; }
        else { if (Math.random() < 0.00012) crack = 0.4 + Math.random() * 0.6; crack *= 0.985; v = brown * 0.75 + w * crack * 0.7 * (Math.random() < 0.5 ? 1 : 0.3); }
        raw[i] = v;
      }
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = raw[i];
      for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = raw[i] * k + raw[len + i] * (1 - k); } // 이음새 없이 반복
    }
    return buf;
  }
  const N = { src: null, gain: null, nodes: [], kind: null };
  function stopNodes(fadeSec = 0.4) {
    if (!N.src || !A) return;
    const { src, gain, nodes } = N, now = A.currentTime;
    gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(0.0001, now, fadeSec / 3);
    setTimeout(() => { try { src.stop(); } catch (e) {} [src, gain, ...nodes].forEach(x => { try { x.disconnect(); } catch (e) {} }); nodes.forEach(x => { try { x.stop && x.stop(); } catch (e) {} }); }, fadeSec * 1000 + 100);
    N.src = null; N.gain = null; N.nodes = [];
  }
  function noisePlay(kind) {
    const a = ctx(); if (!a) return false;
    stopNodes(0.25);
    const src = a.createBufferSource(); src.buffer = BUF[kind] || (BUF[kind] = makeBuf(kind)); src.loop = true;
    const gain = a.createGain(); gain.gain.value = 0.0001;
    const nodes = []; let last = src;
    const filt = (type, f, q) => { const b = a.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; last.connect(b); last = b; nodes.push(b); };
    if (kind === 'rain') { filt('highpass', 350); filt('lowpass', 9000); }
    if (kind === 'brown') filt('lowpass', 700);
    if (kind === 'fire') filt('lowpass', 3500);
    if (kind === 'wave') {
      filt('lowpass', 1100);
      // 밀려왔다 빠지는 느낌: 아주 느린 두 개의 물결로 소리 크기를 흔들어요
      const swell = a.createGain(); swell.gain.value = 0.55; last.connect(swell); last = swell; nodes.push(swell);
      [[0.09, 0.32], [0.053, 0.13]].forEach(([hz, depth]) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(swell.gain); o.start(); nodes.push(o, g); });
    }
    last.connect(gain); gain.connect(a.destination);
    src.start();
    gain.gain.setTargetAtTime(S.nvol, a.currentTime, 0.35);
    Object.assign(N, { src, gain, nodes, kind });
    S.noise = kind; save();
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = new MediaMetadata({ title: (NOISES.find(x => x[0] === kind) || [, ''])[1].replace(/^\S+\s/, ''), artist: '문제지메이커 공부 타이머' }); } catch (e) {} }
    return true;
  }
  function noiseStop() { stopNodes(); N.kind = null; S.noise = null; save(); }
  function noiseVol(v) { S.nvol = v; save(); if (N.gain && A) N.gain.gain.setTargetAtTime(v, A.currentTime, 0.1); }

  window.QTSND = {
    ALARMS, NOISES, S, save, unlock, alarm, canNotify, askNotify,
    test: kind => play(kind || S.alarm, S.avol),
    setAlarm: k => { S.alarm = k; save(); }, setAlarmVol: v => { S.avol = v; save(); },
    noise: { play: noisePlay, stop: noiseStop, vol: noiseVol, get kind() { return N.kind; } },
  };
})();
