// app.js — UI / render / orquestração entre humanos e bot
(function () {
  const JH = window.JokerHop;
  const Bot = window.JokerBot;

  const $board = document.getElementById('board');
  const $status = document.getElementById('status');
  const $log = document.getElementById('log');
  const $newGame = document.getElementById('new-game');
  const $p1Type = document.getElementById('p1-type');
  const $p2Type = document.getElementById('p2-type');
  const $botDepth = document.getElementById('bot-depth');

  let state = null;
  let playerTypes = { 1: 'human', 2: 'bot' };
  let botBusy = false;

  function log(msg) {
    const li = document.createElement('li');
    li.textContent = msg;
    $log.insertBefore(li, $log.firstChild);
  }

  function newGame() {
    state = JH.createInitialState();
    playerTypes = { 1: $p1Type.value, 2: $p2Type.value };
    $log.innerHTML = '';
    log(`Novo jogo. Começa P${state.firstPlayer}.`);
    render();
    maybeBotMove();
  }

  function describePhase() {
    const p = state.currentPlayer;
    switch (state.phase) {
      case JH.PHASES.PLACE: return `P${p} — coloca o teu joker (clica numa carta).`;
      case JH.PHASES.MOVE:  return `P${p} — anda ${state.moveStepsRemaining} passo(s).`;
      case JH.PHASES.PICK:  return `P${p} — escolhe uma carta para virar para baixo.`;
      case JH.PHASES.REVIVE: return `P${p} — efeito RESSUSCITAR: escolhe uma carta virada para voltar a virar.`;
      case JH.PHASES.BUILD_1: return `P${p} — efeito CONSTRUIR: coloca a 1ª carta nova.`;
      case JH.PHASES.BUILD_2: return `P${p} — efeito CONSTRUIR: coloca a 2ª carta nova.`;
      case JH.PHASES.KILL_2: return `P${p} — efeito MORTAL: vira uma segunda carta para baixo.`;
      case JH.PHASES.GAME_OVER:
        if (state.winner === 'draw') return `Empate!`;
        return `🏆 P${state.winner} venceu!`;
    }
  }

  function render() {
    const { minX, minY, maxX, maxY } = JH.getBoardBounds(state);
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;
    $board.style.gridTemplateColumns = `repeat(${cols}, 70px)`;
    $board.style.gridTemplateRows = `repeat(${rows}, 70px)`;
    $board.innerHTML = '';

    // Para BUILD, também precisamos mostrar células "vazias" adjacentes ao tabuleiro como placeable
    const buildTargets = (state.phase === JH.PHASES.BUILD_1 || state.phase === JH.PHASES.BUILD_2)
      ? JH.legalBuildTargets(state) : [];
    const buildSet = new Set(buildTargets.map(p => JH.key(p.x, p.y)));

    // Expandir bounds se houver buildTargets fora
    let bMinX = minX, bMinY = minY, bMaxX = maxX, bMaxY = maxY;
    for (const t of buildTargets) {
      if (t.x < bMinX) bMinX = t.x;
      if (t.y < bMinY) bMinY = t.y;
      if (t.x > bMaxX) bMaxX = t.x;
      if (t.y > bMaxY) bMaxY = t.y;
    }
    const finalCols = bMaxX - bMinX + 1;
    const finalRows = bMaxY - bMinY + 1;
    $board.style.gridTemplateColumns = `repeat(${finalCols}, 70px)`;

    const legal = JH.legalActions(state);
    const legalSet = new Set(legal.map(a => `${a.kind}:${a.x},${a.y}`));

    for (let y = bMinY; y <= bMaxY; y++) {
      for (let x = bMinX; x <= bMaxX; x++) {
        const cell = JH.cellAt(state, x, y);
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.x = x;
        div.dataset.y = y;

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
          const j1 = state.jokers[1];
          const j2 = state.jokers[2];
          if (j1 && j1.x === x && j1.y === y) {
            const j = document.createElement('div');
            j.className = 'joker p1';
            j.textContent = playerTypes[1] === 'bot' ? '🤖' : '🙂';
            j.title = 'P1';
            div.appendChild(j);
          }
          if (j2 && j2.x === x && j2.y === y) {
            const j = document.createElement('div');
            j.className = 'joker p2';
            j.textContent = playerTypes[2] === 'bot' ? '🤖' : '😎';
            j.title = 'P2';
            div.appendChild(j);
          }

          // realçar legais
          const isHumanTurn = playerTypes[state.currentPlayer] === 'human';
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

    $status.textContent = describePhase();
  }

  function handleClick(x, y) {
    if (state.phase === JH.PHASES.GAME_OVER) return;
    if (playerTypes[state.currentPlayer] !== 'human') return;
    if (botBusy) return;

    const actions = JH.legalActions(state);
    const a = actions.find(act => act.x === x && act.y === y);
    if (!a) return;
    performAction(a);
  }

  function performAction(action) {
    const beforePlayer = state.currentPlayer;
    const beforePhase = state.phase;
    JH.applyAction(state, action);
    log(`P${beforePlayer} [${beforePhase}] -> ${action.kind} @ (${action.x},${action.y})`);
    render();

    if (state.phase === JH.PHASES.GAME_OVER) {
      const msg = state.winner === 'draw' ? 'Empate!' : `P${state.winner} venceu!`;
      log(`🏁 ${msg}`);
      return;
    }
    setTimeout(maybeBotMove, 100);
  }

  async function maybeBotMove() {
    if (!state || state.phase === JH.PHASES.GAME_OVER) return;
    if (playerTypes[state.currentPlayer] !== 'bot') return;
    if (botBusy) return;
    botBusy = true;
    try {
      const depth = Math.max(1, Math.min(6, parseInt($botDepth.value) || 3));
      // Cede o thread para o browser renderizar antes de bloquear
      await new Promise(r => setTimeout(r, 50));
      const action = Bot.chooseAction(state, depth, 4000);
      botBusy = false;
      if (action) performAction(action);
    } catch (e) {
      botBusy = false;
      console.error(e);
      log(`Bot erro: ${e.message}`);
    }
  }

  $newGame.addEventListener('click', newGame);
  newGame();
})();
