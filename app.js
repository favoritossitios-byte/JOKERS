// app.js — UI orchestrator with setup screen, emoji picker, and rich animations
(function () {
  const JH = window.JokerHop;
  const Bot = window.JokerBot;

  // ============================================================
  // EMOJI ROSTER — wide pool the user cycles through with arrows
  // ============================================================
  const EMOJIS = [
    '🙂','😎','🤠','🥸','🤓','😈','👻','🤖','👽','👹','👺','🤡',
    '🧙','🧛','🧞','🧜','🧚','🦸','🦹','🥷','👑','💀','🤺','🧝',
    '🐱','🐶','🦊','🦁','🐯','🐸','🐼','🐵','🦄','🐲','🦖','🐙',
  ];
  const BOT_EMOJI_IDX = EMOJIS.indexOf('🤖');

  // Pick a random emoji index, avoiding the bot one (so humans get a face/animal/etc.)
  // and avoiding `exclude` (so P1 and P2 don't share the same emoji).
  function randomHumanEmojiIdx(exclude = -1) {
    const candidates = EMOJIS.map((_, i) => i)
      .filter(i => i !== BOT_EMOJI_IDX && i !== exclude);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Initial emoji per player follows its starting type: bots get 🤖, humans get a
  // random non-bot emoji (and the two random picks never collide).
  const initialP1Idx = randomHumanEmojiIdx();
  const initialP2Idx = BOT_EMOJI_IDX; // P2 starts as bot

  // ============================================================
  // State
  // ============================================================
  const ui = {
    p1: { emojiIdx: initialP1Idx, type: 'human', customEmoji: false },
    p2: { emojiIdx: initialP2Idx, type: 'bot',   customEmoji: false },
    mode: 1,
    theme: 'normal',
    botDepth: 3,
  };
  let state = null;
  let botBusy = false;
  let logEntries = 0;

  // ============================================================
  // DOM refs
  // ============================================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const screens = {
    setup: $('#setup-screen'),
    game: $('#game-screen'),
  };
  const $board = $('#board');
  const $status = $('#status');
  const $log = $('#log');
  const $logPanel = $('#log-panel');
  const $fx = $('#fx-layer');
  const $overlay = $('#gameover-overlay');
  const $screenFlash = $('#screen-flash');
  const $combo = $('#combo-counter');

  // ============================================================
  // Sound integration
  // ============================================================
  const SFX = window.SFX || {};
  function safeSfx(fn, ...args) { try { fn && fn(...args); } catch (e) { /* noop */ } }

  function updateSfxButtonsUI() {
    const sfxOn = SFX.enabled;
    const mOn = SFX.musicEnabled;
    const $b1 = $('#sfx-toggle');
    const $b2 = $('#music-toggle');
    const $b3 = $('#sfx-toggle-game');
    if ($b1) $b1.classList.toggle('active', sfxOn);
    if ($b2) $b2.classList.toggle('active', mOn);
    if ($b3) $b3.textContent = sfxOn ? '🔊' : '🔇';
  }

  // hover sounds on interactive elements (delegated)
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('button, .cell.legal, .cell.placeable, .cell.removable, .cell.revive-target, .cell.kill-target, .cell.build-target');
    if (!t) return;
    safeSfx(SFX.hover);
  }, true);

  // ============================================================
  // Setup screen
  // ============================================================
  function paintEmojis() {
    $$('.emoji-display').forEach(el => {
      const p = el.dataset.player;
      el.textContent = EMOJIS[ui[`p${p}`].emojiIdx];
    });
  }

  function cycleEmoji(playerKey, dir) {
    const p = ui[playerKey];
    p.emojiIdx = (p.emojiIdx + dir + EMOJIS.length) % EMOJIS.length;
    p.customEmoji = true;             // user has now manually chosen — stop auto-syncing with type toggle
    const el = $(`.emoji-display[data-player="${playerKey.slice(1)}"]`);
    el.textContent = EMOJIS[p.emojiIdx];
    el.classList.remove('swap-left', 'swap-right');
    void el.offsetWidth;
    el.classList.add(dir > 0 ? 'swap-right' : 'swap-left');
  }

  $$('.arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      safeSfx(SFX.click);
      const dir = parseInt(btn.dataset.dir);
      const p = btn.dataset.player;
      cycleEmoji(`p${p}`, dir);
    });
  });

  $$('.type-toggle').forEach(toggle => {
    const p = toggle.dataset.player;
    toggle.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        safeSfx(SFX.click);
        toggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newType = btn.dataset.type;
        const slot = ui[`p${p}`];
        slot.type = newType;
        // Auto-pick a sensible default emoji while the user hasn't picked one manually.
        // Switching to bot → 🤖; switching to human → fresh random emoji different
        // from the other player's current choice.
        if (!slot.customEmoji) {
          if (newType === 'bot') {
            slot.emojiIdx = BOT_EMOJI_IDX;
          } else {
            const otherKey = p === '1' ? 'p2' : 'p1';
            slot.emojiIdx = randomHumanEmojiIdx(ui[otherKey].emojiIdx);
          }
          const el = $(`.emoji-display[data-player="${p}"]`);
          el.textContent = EMOJIS[slot.emojiIdx];
          el.classList.remove('swap-left', 'swap-right');
          void el.offsetWidth;
          el.classList.add(newType === 'bot' ? 'swap-right' : 'swap-left');
        }
      });
    });
  });

  $$('.mode-btn').forEach(btn => {
    if (btn.classList.contains('locked')) return;
    btn.addEventListener('click', () => {
      safeSfx(SFX.click);
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ui.mode = parseInt(btn.dataset.mode);
    });
  });

  $$('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.theme;
      applyTheme(name);
      safeSfx(SFX.click);
    });
  });

  function applyTheme(name) {
    ui.theme = name;
    document.body.classList.remove('theme-normal', 'theme-jungle', 'theme-ocean', 'theme-desert', 'theme-lava');
    if (name !== 'normal') document.body.classList.add('theme-' + name);
    document.body.dataset.theme = name;
    $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === name));
    if (SFX.setTheme) SFX.setTheme(name);
  }

  $('#start-btn').addEventListener('click', () => {
    safeSfx(SFX.start);
    switchScreen('game');
    newGame();
  });

  $('#back-btn').addEventListener('click', () => {
    safeSfx(SFX.click);
    switchScreen('setup');
  });

  $('#log-toggle').addEventListener('click', () => {
    safeSfx(SFX.click);
    $logPanel.classList.toggle('hidden');
  });

  $('#sfx-toggle').addEventListener('click', () => {
    SFX.setEnabled && SFX.setEnabled(!SFX.enabled);
    safeSfx(SFX.click);
    updateSfxButtonsUI();
  });

  $('#music-toggle').addEventListener('click', () => {
    SFX.setMusicEnabled && SFX.setMusicEnabled(!SFX.musicEnabled);
    safeSfx(SFX.click);
    updateSfxButtonsUI();
  });

  $('#sfx-toggle-game').addEventListener('click', () => {
    SFX.setEnabled && SFX.setEnabled(!SFX.enabled);
    updateSfxButtonsUI();
  });

  $('#play-again').addEventListener('click', () => {
    safeSfx(SFX.start);
    $overlay.classList.add('hidden');
    newGame();
  });

  $('#to-menu').addEventListener('click', () => {
    safeSfx(SFX.click);
    $overlay.classList.add('hidden');
    switchScreen('setup');
  });

  function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    document.body.classList.toggle('in-game', name === 'game');
    // when entering the game screen, render after the layout has settled so
    // boardArea.clientWidth/Height reflect the real viewport
    if (name === 'game' && state) requestAnimationFrame(() => render());
  }

  paintEmojis();
  updateSfxButtonsUI();
  applyTheme(ui.theme);

  // Re-render on resize/orientation change so the board fits the new viewport
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!state) return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render(), 80);
  });
  window.addEventListener('orientationchange', () => {
    if (state) setTimeout(() => render(), 200);
  });

  // ============================================================
  // Game flow
  // ============================================================
  function getEmoji(player) {
    return EMOJIS[ui[`p${player}`].emojiIdx];
  }
  function getType(player) {
    return ui[`p${player}`].type;
  }

  function newGame() {
    state = JH.createInitialState();
    logEntries = 0;
    $log.innerHTML = '';
    $overlay.classList.add('hidden');
    addLog(`Novo jogo • começa o Jogador ${state.firstPlayer}`);
    render();
    setTimeout(maybeBotMove, 400);
  }

  function describePhase() {
    const p = state.currentPlayer;
    const pill = `<span class="pill p${p}">P${p}</span>`;
    switch (state.phase) {
      case JH.PHASES.PLACE: return `${pill} escolhe onde colocar`;
      case JH.PHASES.MOVE: return `${pill} anda ${state.moveStepsRemaining} passo${state.moveStepsRemaining === 1 ? '' : 's'}`;
      case JH.PHASES.PICK: return `${pill} vira uma carta`;
      case JH.PHASES.REVIVE: return `${pill} 💖 ressuscitar — escolhe uma carta virada`;
      case JH.PHASES.BUILD_1: return `${pill} 🌱 construir — coloca a 1ª carta`;
      case JH.PHASES.BUILD_2: return `${pill} 🌱 construir — coloca a 2ª carta`;
      case JH.PHASES.KILL_2: return `${pill} 💀 mortal — vira uma segunda carta`;
      case JH.PHASES.GAME_OVER:
        if (state.winner === 'draw') return `Empate!`;
        return `🏆 Jogador ${state.winner} venceu!`;
    }
    return '';
  }

  function addLog(text) {
    const li = document.createElement('li');
    li.textContent = text;
    $log.insertBefore(li, $log.firstChild);
    logEntries++;
    while ($log.children.length > 50) $log.removeChild($log.lastChild);
  }

  // ============================================================
  // Render board
  // ============================================================
  function render(opts = {}) {
    const animations = opts.animations || {}; // { 'x,y': 'just-flipped' | 'just-revived' | 'just-built' }

    const { minX, minY, maxX, maxY } = JH.getBoardBounds(state);
    let bMinX = minX, bMinY = minY, bMaxX = maxX, bMaxY = maxY;

    const buildTargets = (state.phase === JH.PHASES.BUILD_1 || state.phase === JH.PHASES.BUILD_2)
      ? JH.legalBuildTargets(state) : [];
    const buildSet = new Set(buildTargets.map(p => JH.key(p.x, p.y)));
    for (const t of buildTargets) {
      if (t.x < bMinX) bMinX = t.x;
      if (t.y < bMinY) bMinY = t.y;
      if (t.x > bMaxX) bMaxX = t.x;
      if (t.y > bMaxY) bMaxY = t.y;
    }
    const cols = bMaxX - bMinX + 1;
    const rows = bMaxY - bMinY + 1;

    // Dynamically pick a cell size so the board always fits the viewport.
    // The CSS sets a default --cell-size via media queries; we tighten it
    // further whenever the board is wider/taller than the available space.
    const boardArea = document.querySelector('.board-area');
    if (boardArea) {
      const padX = 32; // horizontal padding+margin allowance
      const padY = 48;
      const availW = boardArea.clientWidth - padX;
      const availH = boardArea.clientHeight - padY;
      const gap = 6;
      // CSS default cell size — keep as upper bound
      const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--cell-size').trim();
      const cssDefault = parseFloat(cssVar) || 78;
      const maxByW = Math.floor((availW - gap * (cols - 1)) / cols);
      const maxByH = Math.floor((availH - gap * (rows - 1)) / rows);
      const size = Math.max(28, Math.min(cssDefault, maxByW, maxByH));
      $board.style.setProperty('--cell-size', size + 'px');
    }
    $board.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    $board.innerHTML = '';

    const legal = JH.legalActions(state);
    const legalSet = new Set(legal.map(a => `${a.kind}:${a.x},${a.y}`));
    const isHumanTurn = state.phase !== JH.PHASES.GAME_OVER && getType(state.currentPlayer) === 'human';

    for (let y = bMinY; y <= bMaxY; y++) {
      for (let x = bMinX; x <= bMaxX; x++) {
        const cell = JH.cellAt(state, x, y);
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.x = x;
        div.dataset.y = y;
        const animKey = `${x},${y}`;
        if (animations[animKey]) div.classList.add(animations[animKey]);

        if (!cell) {
          div.classList.add('empty');
          if (buildSet.has(JH.key(x, y))) {
            div.classList.add('build-target');
            div.onclick = () => handleClick(x, y);
          }
        } else {
          if (!cell.faceUp) {
            div.classList.add('flipped');
          } else {
            div.classList.add(cell.type);
          }

          // jokers
          for (const player of [1, 2]) {
            const j = state.jokers[player];
            if (j && j.x === x && j.y === y) {
              const jEl = document.createElement('div');
              jEl.className = `joker p${player}`;
              if (player === state.currentPlayer && state.phase !== JH.PHASES.GAME_OVER) {
                jEl.classList.add('current');
                div.classList.add('has-current-joker');
                div.style.setProperty('--aura-color',
                  player === 1 ? 'var(--accent-p1)' : 'var(--accent-p2)');
              }
              jEl.textContent = getEmoji(player);
              div.appendChild(jEl);
            }
          }

          if (isHumanTurn) {
            switch (state.phase) {
              case JH.PHASES.PLACE:
                if (legalSet.has(`place:${x},${y}`)) {
                  div.classList.add('placeable');
                  div.onclick = () => handleClick(x, y);
                }
                break;
              case JH.PHASES.MOVE:
                if (legalSet.has(`move:${x},${y}`)) {
                  div.classList.add('legal');
                  div.onclick = () => handleClick(x, y);
                }
                break;
              case JH.PHASES.PICK:
                if (legalSet.has(`pick:${x},${y}`)) {
                  div.classList.add('removable');
                  div.onclick = () => handleClick(x, y);
                }
                break;
              case JH.PHASES.REVIVE:
                if (legalSet.has(`revive:${x},${y}`)) {
                  div.classList.add('revive-target');
                  div.onclick = () => handleClick(x, y);
                }
                break;
              case JH.PHASES.KILL_2:
                if (legalSet.has(`kill:${x},${y}`)) {
                  div.classList.add('kill-target');
                  div.onclick = () => handleClick(x, y);
                }
                break;
            }
          }
        }
        $board.appendChild(div);
      }
    }

    $status.innerHTML = describePhase();

    if (state.phase === JH.PHASES.GAME_OVER) showGameOver();
  }

  // ============================================================
  // FX — particles, bursts, floating text
  // ============================================================
  function cellRect(x, y) {
    const el = $board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (!el) return null;
    return el.getBoundingClientRect();
  }

  function burst(x, y, color) {
    const r = cellRect(x, y);
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const b = document.createElement('div');
    b.className = 'fx-burst';
    b.style.left = (cx - 50) + 'px';
    b.style.top = (cy - 50) + 'px';
    b.style.background = `radial-gradient(circle, ${color}, transparent 60%)`;
    $fx.appendChild(b);
    setTimeout(() => b.remove(), 700);

    // particles
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle = (i / 14) * Math.PI * 2;
      const dist = 60 + Math.random() * 40;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = color;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      $fx.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
  }

  function floatText(x, y, text, color) {
    const r = cellRect(x, y);
    if (!r) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const t = document.createElement('div');
    t.className = 'fx-text';
    t.textContent = text;
    t.style.left = cx + 'px';
    t.style.top = cy + 'px';
    t.style.color = color;
    $fx.appendChild(t);
    setTimeout(() => t.remove(), 1300);
  }

  function confettiBurst() {
    const colors = ['#ffd60a', '#00f5d4', '#ff6fa1', '#2ecc71', '#ff4757', '#3a86ff'];
    const shapes = ['', 'sq', 'tri'];
    for (let i = 0; i < 120; i++) {
      const c = document.createElement('div');
      const shape = shapes[i % shapes.length];
      c.className = 'confetti' + (shape ? ' ' + shape : '');
      c.style.left = Math.random() * 100 + 'vw';
      const color = colors[i % colors.length];
      if (shape === 'tri') c.style.color = color;
      else c.style.background = color;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      c.style.setProperty('--dur', (2.5 + Math.random() * 2.5) + 's');
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      $fx.appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
  }

  // ============================================================
  // Extra FX: screen flash, board shake, trails, combo
  // ============================================================
  function screenFlash(color, duration = 500) {
    $screenFlash.style.background = `radial-gradient(circle at center, ${color}, transparent 70%)`;
    $screenFlash.classList.remove('flash');
    void $screenFlash.offsetWidth;
    $screenFlash.classList.add('flash');
    setTimeout(() => $screenFlash.classList.remove('flash'), duration);
  }

  function boardShake() {
    $board.classList.remove('shake');
    void $board.offsetWidth;
    $board.classList.add('shake');
    setTimeout(() => $board.classList.remove('shake'), 500);
  }

  function trail(fromX, fromY, toX, toY, color) {
    const r1 = cellRect(fromX, fromY);
    const r2 = cellRect(toX, toY);
    if (!r1 || !r2) return;
    const x1 = r1.left + r1.width / 2;
    const y1 = r1.top + r1.height / 2;
    const x2 = r2.left + r2.width / 2;
    const y2 = r2.top + r2.height / 2;
    const N = 8;
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const dot = document.createElement('div');
      dot.className = 'trail-dot';
      dot.style.left = (x1 + (x2 - x1) * t - 7) + 'px';
      dot.style.top = (y1 + (y2 - y1) * t - 7) + 'px';
      dot.style.background = color;
      dot.style.animationDelay = (i * 30) + 'ms';
      $fx.appendChild(dot);
      setTimeout(() => dot.remove(), 1000);
    }
  }

  // Combo: count rapid successive actions for the same player
  let comboCount = 0;
  let comboTimer = null;
  let comboLastPlayer = null;
  function bumpCombo(player) {
    if (player !== comboLastPlayer) { comboCount = 0; }
    comboLastPlayer = player;
    comboCount++;
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { comboCount = 0; comboLastPlayer = null; }, 1800);
    if (comboCount >= 3) {
      const labels = ['', '', '', '🔥 COMBO ×3', '⚡ COMBO ×4', '💥 COMBO ×5', '🌟 INSANE ×6', '🚀 LEGENDARY ×7'];
      const label = labels[Math.min(comboCount, labels.length - 1)];
      $combo.textContent = label;
      $combo.classList.remove('show');
      void $combo.offsetWidth;
      $combo.classList.add('show');
    }
  }

  function rippleCell(x, y) {
    const el = $board.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
    if (!el) return;
    el.classList.remove('ripple');
    void el.offsetWidth;
    el.classList.add('ripple');
    setTimeout(() => el.classList.remove('ripple'), 500);
  }

  // ============================================================
  // Action dispatch (with animations)
  // ============================================================
  function handleClick(x, y) {
    if (state.phase === JH.PHASES.GAME_OVER) return;
    if (getType(state.currentPlayer) !== 'human') return;
    if (botBusy) return;
    const actions = JH.legalActions(state);
    const a = actions.find(act => act.x === x && act.y === y);
    if (!a) return;
    performAction(a);
  }

  function performAction(action) {
    const playerBefore = state.currentPlayer;
    const phaseBefore = state.phase;
    const cellBefore = JH.cellAt(state, action.x, action.y);
    const cellTypeBefore = cellBefore ? cellBefore.type : null;
    const jokerBefore = state.jokers[playerBefore] ? { ...state.jokers[playerBefore] } : null;

    // count move steps so the SFX pitch ascends across the 3 hops
    const moveStepIdx = (action.kind === 'move') ? (JH.MOVE_STEPS - state.moveStepsRemaining) : 0;

    // Pre-effect FX
    const animations = {};
    if (action.kind === 'pick') {
      animations[`${action.x},${action.y}`] = 'just-flipped';
    } else if (action.kind === 'revive') {
      animations[`${action.x},${action.y}`] = 'just-revived';
    } else if (action.kind === 'kill') {
      animations[`${action.x},${action.y}`] = 'just-flipped';
    } else if (action.kind === 'build') {
      animations[`${action.x},${action.y}`] = 'just-built';
    }

    JH.applyAction(state, action);

    // Re-render with anim markers
    render({ animations });

    // FX bursts and sound (after render so cellRect works)
    requestAnimationFrame(() => {
      rippleCell(action.x, action.y);
      const playerColor = getEmojiColor(playerBefore);

      if (action.kind === 'place') {
        safeSfx(SFX.place);
        burst(action.x, action.y, playerColor);
        screenFlash(playerBefore === 1 ? 'rgba(255, 214, 10, 0.4)' : 'rgba(0, 245, 212, 0.4)', 400);
      } else if (action.kind === 'move' && jokerBefore) {
        safeSfx(SFX.move, moveStepIdx);
        const j = $board.querySelector(`.cell[data-x="${action.x}"][data-y="${action.y}"] .joker.p${playerBefore}`);
        if (j) { j.classList.add('moving'); setTimeout(() => j.classList.remove('moving'), 400); }
        trail(jokerBefore.x, jokerBefore.y, action.x, action.y, playerColor);
        burst(jokerBefore.x, jokerBefore.y, 'rgba(255, 255, 255, 0.4)');
        bumpCombo(playerBefore);
      } else if (action.kind === 'pick') {
        safeSfx(SFX.pick);
        if (cellTypeBefore === 'revive') burst(action.x, action.y, 'var(--accent-pink)');
        else if (cellTypeBefore === 'build') burst(action.x, action.y, 'var(--accent-green)');
        else if (cellTypeBefore === 'kill') burst(action.x, action.y, 'var(--accent-red)');
        else burst(action.x, action.y, 'rgba(255, 255, 255, 0.3)');

        // Detect activated effect (under joker AFTER move/pick)
        const j = state.jokers[playerBefore];
        const under = JH.cellAt(state, j.x, j.y);
        if (under && under.faceUp) {
          if (under.type === 'revive') {
            floatText(j.x, j.y, '💖 REVIVE', '#ff6fa1');
            safeSfx(SFX.revive);
            screenFlash('rgba(255, 111, 161, 0.35)', 600);
          } else if (under.type === 'build') {
            floatText(j.x, j.y, '🌱 BUILD', '#2ecc71');
            safeSfx(SFX.build);
            screenFlash('rgba(46, 204, 113, 0.3)', 600);
          } else if (under.type === 'kill') {
            floatText(j.x, j.y, '💀 KILL', '#ff4757');
            safeSfx(SFX.kill);
            screenFlash('rgba(255, 71, 87, 0.45)', 700);
            boardShake();
          }
        }
      } else if (action.kind === 'revive') {
        safeSfx(SFX.revive);
        burst(action.x, action.y, '#ff6fa1');
        floatText(action.x, action.y, '✨', '#ff6fa1');
      } else if (action.kind === 'kill') {
        safeSfx(SFX.kill);
        burst(action.x, action.y, '#ff4757');
        floatText(action.x, action.y, '☠', '#ff4757');
        boardShake();
      } else if (action.kind === 'build') {
        safeSfx(SFX.build);
        burst(action.x, action.y, '#2ecc71');
      }
    });

    addLog(formatLog(playerBefore, phaseBefore, action, cellTypeBefore));

    if (state.phase === JH.PHASES.GAME_OVER) {
      addLog(state.winner === 'draw' ? '🤝 Empate!' : `🏆 Jogador ${state.winner} venceu!`);
      return;
    }

    setTimeout(maybeBotMove, action.kind === 'move' ? 300 : 500);
  }

  function getEmojiColor(player) {
    return player === 1 ? 'var(--accent-p1)' : 'var(--accent-p2)';
  }

  function formatLog(player, phase, action, cellTypeBefore) {
    const e = getEmoji(player);
    const a = `(${action.x},${action.y})`;
    switch (action.kind) {
      case 'place': return `${e} P${player} coloca em ${a}`;
      case 'move':  return `${e} P${player} → ${a}`;
      case 'pick':  return `${e} P${player} vira ${cellTypeBefore} em ${a}`;
      case 'revive': return `${e} P${player} ressuscitou ${a}`;
      case 'kill':   return `${e} P${player} matou ${a}`;
      case 'build':  return `${e} P${player} construiu ${a}`;
    }
    return action.kind;
  }

  async function maybeBotMove() {
    if (!state || state.phase === JH.PHASES.GAME_OVER) return;
    if (getType(state.currentPlayer) !== 'bot') return;
    if (botBusy) return;
    botBusy = true;
    try {
      await new Promise(r => setTimeout(r, 200));
      $status.innerHTML = `<span class="pill p${state.currentPlayer}">P${state.currentPlayer}</span> 🤖 a pensar…`;
      const action = await Bot.chooseAction(state, 4, 2500);
      botBusy = false;
      if (action) performAction(action);
    } catch (e) {
      botBusy = false;
      console.error(e);
      addLog(`⚠️ Bot erro: ${e.message}`);
    }
  }

  function showGameOver() {
    const emojiEl = $('#gameover-emoji');
    const titleEl = $('#gameover-title');
    const subEl = $('#gameover-sub');
    if (state.winner === 'draw') {
      emojiEl.textContent = '🤝';
      titleEl.textContent = 'Empate!';
      subEl.textContent = 'Nenhum dos jogadores consegue andar.';
      safeSfx(SFX.draw);
    } else {
      emojiEl.textContent = getEmoji(state.winner);
      titleEl.textContent = `Jogador ${state.winner} venceu!`;
      subEl.textContent = `O adversário ficou sem espaço para andar.`;
      // Did the human win? Play win, else lose
      const winnerType = getType(state.winner);
      const loserType = getType(state.winner === 1 ? 2 : 1);
      if (winnerType === 'human' || (winnerType === 'bot' && loserType === 'bot')) {
        safeSfx(SFX.win);
      } else {
        safeSfx(SFX.lose);
      }
      confettiBurst();
      screenFlash(state.winner === 1 ? 'rgba(255, 214, 10, 0.5)' : 'rgba(0, 245, 212, 0.5)', 800);
    }
    setTimeout(() => $overlay.classList.remove('hidden'), 800);
  }
})();
