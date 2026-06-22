// bot.js — minimax + alpha-beta para Joker Hop
// O jogo tem informação perfeita; só há "azar" na geração inicial e no tipo da carta criada
// pelo build (que assumimos 'normal' deterministicamente em game.js).

(function () {
  const JH = window.JokerHop;

  // Avaliação heurística do estado, do ponto de vista de `maxPlayer`.
  // Componentes:
  //  - vitória/derrota/empate => grandes constantes
  //  - mobilidade: quantos passos consigo dar a partir da posição actual (até 3) — proxy "ainda consigo andar"
  //  - número de cartas face-up acessíveis a partir do meu joker
  //  - cartas mortais perto do adversário são boas; cartas de revive perto de mim são boas
  function evaluate(state, maxPlayer) {
    if (state.phase === JH.PHASES.GAME_OVER) {
      if (state.winner === 'draw') return 0;
      return state.winner === maxPlayer ? 1e9 : -1e9;
    }
    const minPlayer = maxPlayer === 1 ? 2 : 1;

    const myCanMove = JH.canMoveAtAll(state, maxPlayer);
    const oppCanMove = JH.canMoveAtAll(state, minPlayer);
    if (!myCanMove && !oppCanMove) return 0;
    if (!myCanMove) return -1e9;
    if (!oppCanMove) return 1e9;

    // contagem de células face-up acessíveis (flood fill ortogonal a partir do joker)
    const myReach = floodFillReach(state, maxPlayer);
    const oppReach = floodFillReach(state, minPlayer);

    // mobilidade local (vizinhos imediatos)
    const myNbrs = countLegalNeighbors(state, maxPlayer);
    const oppNbrs = countLegalNeighbors(state, minPlayer);

    // separação: se estou "encurralado" próximo do adversário com poucas cartas, mau
    return (myReach - oppReach) * 2 + (myNbrs - oppNbrs) * 5;
  }

  function floodFillReach(state, player) {
    const j = state.jokers[player];
    if (!j) return 0;
    const opp = player === 1 ? 2 : 1;
    const oppJ = state.jokers[opp];
    const visited = new Set();
    const stack = [{ x: j.x, y: j.y }];
    visited.add(JH.key(j.x, j.y));
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
    let count = 0;
    while (stack.length) {
      const { x, y } = stack.pop();
      count++;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        const k = JH.key(nx, ny);
        if (visited.has(k)) continue;
        const c = JH.cellAt(state, nx, ny);
        if (!c || !c.faceUp) continue;
        if (oppJ && oppJ.x === nx && oppJ.y === ny) continue;
        visited.add(k);
        stack.push({ x: nx, y: ny });
      }
    }
    return count;
  }

  function countLegalNeighbors(state, player) {
    const j = state.jokers[player];
    if (!j) return 0;
    const opp = player === 1 ? 2 : 1;
    const oppJ = state.jokers[opp];
    let n = 0;
    const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of DIRS) {
      const nx = j.x + dx, ny = j.y + dy;
      const c = JH.cellAt(state, nx, ny);
      if (!c || !c.faceUp) continue;
      if (oppJ && oppJ.x === nx && oppJ.y === ny) continue;
      n++;
    }
    return n;
  }

  // Minimax — `state.currentPlayer` decide se é nó max ou min relativo a maxPlayer.
  // Note: o jogo tem ações sequenciais do mesmo jogador (3 moves + pick + efeito),
  // então o minimax aprofunda por AÇÃO, não por turno. Isto está OK desde que a profundidade
  // seja suficiente para chegar ao próximo turno de cada um.
  function minimax(state, depth, alpha, beta, maxPlayer) {
    if (depth === 0 || state.phase === JH.PHASES.GAME_OVER) {
      return { score: evaluate(state, maxPlayer), action: null };
    }
    const actions = JH.legalActions(state);
    if (actions.length === 0) {
      return { score: evaluate(state, maxPlayer), action: null };
    }

    const isMax = state.currentPlayer === maxPlayer;
    let bestAction = actions[0];
    let bestScore = isMax ? -Infinity : Infinity;

    // Pequena heurística de ordenação: ações que mexem em cartas especiais primeiro
    const ordered = actions.slice().sort((a, b) => priority(state, b) - priority(state, a));

    for (const act of ordered) {
      const next = JH.cloneState(state);
      JH.applyAction(next, act);
      const { score } = minimax(next, depth - 1, alpha, beta, maxPlayer);

      if (isMax) {
        if (score > bestScore) { bestScore = score; bestAction = act; }
        if (bestScore > alpha) alpha = bestScore;
      } else {
        if (score < bestScore) { bestScore = score; bestAction = act; }
        if (bestScore < beta) beta = bestScore;
      }
      if (beta <= alpha) break;
    }
    return { score: bestScore, action: bestAction };
  }

  function priority(state, action) {
    // heurística simples: cartas perigosas primeiro
    if (action.kind === 'pick' || action.kind === 'kill' || action.kind === 'revive') {
      const c = JH.cellAt(state, action.x, action.y);
      if (c) {
        if (c.type === 'kill') return 4;
        if (c.type === 'build') return 3;
        if (c.type === 'revive') return 2;
      }
    }
    return 1;
  }

  // Limite de tempo para o bot — se a profundidade for alta, podemos cortar.
  function chooseAction(state, depth = 3, timeLimitMs = 4000) {
    const maxPlayer = state.currentPlayer;
    const start = performance.now();

    let best = { score: -Infinity, action: null };
    // Iterative deepening leve até atingir depth ou timeout
    for (let d = 1; d <= depth; d++) {
      const r = minimax(state, d, -Infinity, Infinity, maxPlayer);
      if (r.action) best = r;
      if (performance.now() - start > timeLimitMs) break;
    }
    // Fallback: se ainda assim nada, primeira ação legal
    if (!best.action) {
      const acts = JH.legalActions(state);
      if (acts.length) best = { action: acts[0], score: 0 };
    }
    return best.action;
  }

  window.JokerBot = { chooseAction, evaluate };
})();
