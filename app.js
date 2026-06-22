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
    '🍕','🍔','🌮','🍩','🍦','🌶️','🥑','🍄','🦴','💎','⚡','🔥',
  ];

  // ============================================================
  // State
  // ============================================================
  const ui = {
    p1: { emojiIdx: 0, type: 'human' },
    p2: { emojiIdx: 1, type: 'bot' },
    mode: 1,
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
    const el = $(`.emoji-display[data-player="${playerKey.slice(1)}"]`);
    el.textContent = EMOJIS[p.emojiIdx];
    el.classList.remove('swap-left', 'swap-right');
    void el.offsetWidth; // restart animation
    el.classList.add(dir > 0 ? 'swap-right' : 'swap-left');
  }

  $$('.arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = parseInt(btn.dataset.dir);
      const p = btn.dataset.player;
      cycleEmoji(`p${p}`, dir);
    });
  });

  $$('.type-toggle').forEach(toggle => {
    const p = toggle.dataset.player;
    toggle.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ui[`p${p}`].type = btn.dataset.type;
      });
    });
  });

  $$('.mode-btn').forEach(btn => {
    if (btn.classList.contains('locked')) return;
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ui.mode = parseInt(btn.dataset.mode);
    });
  });

  $('#start-btn').addEventListener('click', () => {
    switchScreen('game');
    newGame();
  });

  $('#back-btn').addEventListener('click', () => {
    switchScreen('setup');
  });

  $('#log-toggle').addEventListener('click', () => {
    $logPanel.classList.toggle('hidden');
  });

  $('#play-again').addEventListener('click', () => {
    $overlay.classList.add('hidden');
    newGame();
  });

  $('#to-menu').addEventListener('click', () => {
    $overlay.classList.add('hidden');
    switchScreen('setup');
  });

  function switchScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  paintEmojis();

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
    for (let i = 0; i < 80; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      c.style.setProperty('--dur', (2.5 + Math.random() * 2) + 's');
      $fx.appendChild(c);
      setTimeout(() => c.remove(), 5000);
    }
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

    // FX bursts (after render so cellRect works)
    requestAnimationFrame(() => {
      if (action.kind === 'place') {
        burst(action.x, action.y, getEmojiColor(playerBefore));
      } else if (action.kind === 'move' && jokerBefore) {
        // hop trail
        const j = $board.querySelector(`.cell[data-x="${action.x}"][data-y="${action.y}"] .joker.p${playerBefore}`);
        if (j) { j.classList.add('moving'); setTimeout(() => j.classList.remove('moving'), 400); }
        burst(jokerBefore.x, jokerBefore.y, 'rgba(255, 255, 255, 0.4)');
      } else if (action.kind === 'pick') {
        if (cellTypeBefore === 'revive') { burst(action.x, action.y, 'var(--accent-pink)'); floatText(action.x, action.y, 'NORMAL', '#fff'); }
        else if (cellTypeBefore === 'build') { burst(action.x, action.y, 'var(--accent-green)'); }
        else if (cellTypeBefore === 'kill') { burst(action.x, action.y, 'var(--accent-red)'); }
        else { burst(action.x, action.y, 'rgba(255, 255, 255, 0.3)'); }

        // Detect activated effect (under joker)
        const j = state.jokers[playerBefore];
        const under = JH.cellAt(state, j.x, j.y);
        if (under && under.faceUp) {
          if (under.type === 'revive') floatText(j.x, j.y, '💖 REVIVE', '#ff6fa1');
          else if (under.type === 'build') floatText(j.x, j.y, '🌱 BUILD', '#2ecc71');
          else if (under.type === 'kill') floatText(j.x, j.y, '💀 KILL', '#ff4757');
        }
      } else if (action.kind === 'revive') {
        burst(action.x, action.y, '#ff6fa1');
        floatText(action.x, action.y, '✨', '#ff6fa1');
      } else if (action.kind === 'kill') {
        burst(action.x, action.y, '#ff4757');
        floatText(action.x, action.y, '☠', '#ff4757');
      } else if (action.kind === 'build') {
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
      const action = Bot.chooseAction(state, ui.botDepth, 4000);
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
    } else {
      emojiEl.textContent = getEmoji(state.winner);
      titleEl.textContent = `Jogador ${state.winner} venceu!`;
      subEl.textContent = `O adversário ficou sem espaço para andar.`;
      confettiBurst();
    }
    setTimeout(() => $overlay.classList.remove('hidden'), 800);
  }
})();
