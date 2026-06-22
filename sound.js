// sound.js — synthesized SFX via Web Audio API (no external files needed).
// Lazy-initialized on first user gesture to respect browser autoplay policies.

(function () {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let enabled = true;
  let musicEnabled = false;
  let musicLoop = null;
  let currentTheme = 'normal';

  // ============================================================
  // Theme palettes — per-theme tweaks to wave shape, pitch, filter.
  // pitchMul scales every frequency; waveMap remaps wave types.
  // ============================================================
  const THEMES = {
    normal: {
      pitchMul: 1.0,
      waveMap: { sine: 'sine', triangle: 'triangle', square: 'square', sawtooth: 'sawtooth' },
      noiseFilterMul: 1.0,
      reverb: 0.0,
      musicScale: [262, 311, 392, 466, 262, 311, 392, 466, 247, 294, 370, 440, 247, 294, 370, 440],
      musicWave: 'sine',
    },
    jungle: {
      // warm + organic — favour triangles/sines, drop pitch a touch, mellow filter
      pitchMul: 0.92,
      waveMap: { sine: 'sine', triangle: 'triangle', square: 'triangle', sawtooth: 'triangle' },
      noiseFilterMul: 0.7,
      reverb: 0.15,
      musicScale: [220, 277, 330, 415, 220, 277, 330, 415, 196, 247, 294, 370, 196, 247, 294, 370],
      musicWave: 'triangle',
    },
    ocean: {
      // wet + soft — heavy lowpass on noise, slower transients, pure sines
      pitchMul: 0.85,
      waveMap: { sine: 'sine', triangle: 'sine', square: 'sine', sawtooth: 'triangle' },
      noiseFilterMul: 0.5,
      reverb: 0.3,
      musicScale: [196, 233, 294, 349, 196, 233, 294, 349, 175, 220, 262, 311, 175, 220, 262, 311],
      musicWave: 'sine',
    },
    desert: {
      // dry + bright — sharper waves, higher filter, slight pitch up
      pitchMul: 1.08,
      waveMap: { sine: 'triangle', triangle: 'triangle', square: 'square', sawtooth: 'sawtooth' },
      noiseFilterMul: 1.4,
      reverb: 0.02,
      musicScale: [294, 349, 440, 523, 294, 349, 440, 523, 277, 330, 415, 494, 277, 330, 415, 494],
      musicWave: 'triangle',
    },
    lava: {
      // aggressive — heavy sawtooths, distorted noise, lower pitch
      pitchMul: 0.78,
      waveMap: { sine: 'sawtooth', triangle: 'sawtooth', square: 'square', sawtooth: 'sawtooth' },
      noiseFilterMul: 1.8,
      reverb: 0.05,
      musicScale: [110, 139, 165, 208, 110, 139, 165, 208, 98, 117, 147, 175, 98, 117, 147, 175],
      musicWave: 'sawtooth',
    },
  };

  function theme() { return THEMES[currentTheme] || THEMES.normal; }
  function p(freq) { return Math.max(20, freq * theme().pitchMul); }
  function w(type) { return theme().waveMap[type] || type; }

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.08;
      musicGain.connect(masterGain);
    } catch (e) {
      console.warn('Web Audio not available', e);
      return null;
    }
    return ctx;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(opts) {
    if (!enabled) return;
    if (!ensureCtx()) return;
    const {
      freq = 440, type = 'sine', dur = 0.2, gain = 0.3,
      slideTo = null, slideTime = null, attack = 0.005, release = 0.1,
      detune = 0,
    } = opts;
    const osc = ctx.createOscillator();
    osc.type = w(type);
    osc.frequency.setValueAtTime(p(freq), now());
    osc.detune.value = detune;
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, p(slideTo)), now() + (slideTime || dur));
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(gain, now() + attack);
    g.gain.exponentialRampToValueAtTime(0.001, now() + dur);
    g.gain.linearRampToValueAtTime(0, now() + dur + release);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now());
    osc.stop(now() + dur + release + 0.01);
  }

  function noise(opts = {}) {
    if (!enabled) return;
    if (!ensureCtx()) return;
    const { dur = 0.15, gain = 0.2, filter = 'lowpass', freq = 1000, q = 1 } = opts;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = Math.max(80, freq * theme().noiseFilterMul);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(gain, now() + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now() + dur);
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start(now());
    src.stop(now() + dur + 0.02);
  }

  // ============================================================
  // SFX catalogue
  // ============================================================
  const SFX = {
    hover()  { tone({ freq: 1200, type: 'sine', dur: 0.04, gain: 0.06 }); },
    click()  { tone({ freq: 700, type: 'square', dur: 0.05, gain: 0.12 }); noise({ dur: 0.04, gain: 0.04, filter: 'highpass', freq: 3000 }); },
    place()  {
      tone({ freq: 200, type: 'sine', dur: 0.25, gain: 0.4, slideTo: 80, slideTime: 0.25 });
      noise({ dur: 0.18, gain: 0.15, filter: 'lowpass', freq: 600 });
    },
    move(stepIdx = 0) {
      const base = 440 + stepIdx * 90;
      tone({ freq: base, type: 'triangle', dur: 0.1, gain: 0.18 });
      tone({ freq: base * 2, type: 'sine', dur: 0.07, gain: 0.08 });
    },
    pick() {
      tone({ freq: 350, type: 'sawtooth', dur: 0.18, gain: 0.22, slideTo: 110, slideTime: 0.18 });
      noise({ dur: 0.1, gain: 0.1, filter: 'bandpass', freq: 1200, q: 5 });
    },
    revive() {
      const notes = [523, 659, 784, 1047]; // C E G C
      notes.forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'sine', dur: 0.4, gain: 0.16, attack: 0.01, release: 0.3 }), i * 70));
      setTimeout(() => tone({ freq: 1568, type: 'triangle', dur: 0.5, gain: 0.1, release: 0.4 }), 280);
    },
    build() {
      tone({ freq: 330, type: 'triangle', dur: 0.18, gain: 0.18 });
      setTimeout(() => tone({ freq: 440, type: 'triangle', dur: 0.18, gain: 0.18 }), 90);
      setTimeout(() => tone({ freq: 550, type: 'triangle', dur: 0.3, gain: 0.18 }), 180);
    },
    kill() {
      tone({ freq: 110, type: 'sawtooth', dur: 0.4, gain: 0.35, slideTo: 40, slideTime: 0.4 });
      noise({ dur: 0.25, gain: 0.22, filter: 'lowpass', freq: 400 });
      tone({ freq: 65, type: 'sine', dur: 0.5, gain: 0.25, slideTo: 30 });
    },
    win() {
      const arp = [523, 659, 784, 1047, 1319, 1568, 2093];
      arp.forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.2 }), i * 90));
      setTimeout(() => {
        tone({ freq: 1047, type: 'sine', dur: 0.8, gain: 0.18, release: 0.5 });
        tone({ freq: 1319, type: 'sine', dur: 0.8, gain: 0.15, release: 0.5 });
        tone({ freq: 1568, type: 'sine', dur: 0.8, gain: 0.12, release: 0.5 });
      }, arp.length * 90);
    },
    lose() {
      const desc = [523, 466, 392, 311, 233];
      desc.forEach((f, i) => setTimeout(() => tone({ freq: f, type: 'sawtooth', dur: 0.3, gain: 0.18 }), i * 130));
    },
    draw() {
      tone({ freq: 440, type: 'sine', dur: 0.4, gain: 0.18 });
      tone({ freq: 466, type: 'sine', dur: 0.4, gain: 0.18 });
    },
    start() {
      [392, 523, 659, 784].forEach((f, i) =>
        setTimeout(() => tone({ freq: f, type: 'triangle', dur: 0.12, gain: 0.18 }), i * 70));
    },
    error() {
      tone({ freq: 200, type: 'sawtooth', dur: 0.1, gain: 0.15 });
      tone({ freq: 180, type: 'sawtooth', dur: 0.1, gain: 0.15 });
    },
  };

  // ============================================================
  // Ambient music — simple arpeggio loop in C minor
  // ============================================================
  function startMusic() {
    if (!ensureCtx()) return;
    if (musicLoop) return;
    musicEnabled = true;
    let idx = 0;
    const playNote = () => {
      if (!musicEnabled) return;
      const th = theme();
      const pattern = th.musicScale;
      const f = pattern[idx % pattern.length];
      const osc = ctx.createOscillator();
      osc.type = th.musicWave;
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now());
      g.gain.linearRampToValueAtTime(0.4, now() + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now() + 0.35);
      osc.connect(g); g.connect(musicGain);
      osc.start(now()); osc.stop(now() + 0.4);
      if (idx % 4 === 0) {
        const b = ctx.createOscillator();
        b.type = 'triangle';
        b.frequency.value = f / 4;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0, now());
        bg.gain.linearRampToValueAtTime(0.6, now() + 0.02);
        bg.gain.exponentialRampToValueAtTime(0.001, now() + 0.6);
        b.connect(bg); bg.connect(musicGain);
        b.start(now()); b.stop(now() + 0.65);
      }
      idx++;
    };
    musicLoop = setInterval(playNote, 320);
  }
  function stopMusic() {
    musicEnabled = false;
    if (musicLoop) clearInterval(musicLoop);
    musicLoop = null;
  }

  function setEnabled(v) {
    enabled = v;
    if (!v && masterGain) masterGain.gain.value = 0;
    else if (masterGain) masterGain.gain.value = 0.6;
  }
  function setMusicEnabled(v) {
    if (v) startMusic();
    else stopMusic();
  }
  function setVolume(v) {
    if (masterGain) masterGain.gain.value = enabled ? Math.max(0, Math.min(1, v)) : 0;
  }

  function setTheme(name) {
    if (THEMES[name]) currentTheme = name;
  }

  window.SFX = { ...SFX, setEnabled, setMusicEnabled, setVolume, setTheme, get enabled() { return enabled; }, get musicEnabled() { return musicEnabled; }, get theme() { return currentTheme; } };
})();
