// game.js — regras puras do Joker Hop, sem DOM
// Estado é serializável (clonável) para o bot fazer minimax.

const CELL_TYPES = ['normal', 'revive', 'build', 'kill'];
const DECK_COUNTS = { normal: 40, revive: 4, build: 4, kill: 4 }; // total 52
const MOVE_STEPS = 3;

const PHASES = {
  PLACE: 'place',           // primeiro jogador coloca, depois o segundo
  MOVE: 'move',             // jogador anda 3 passos
  PICK: 'pick',             // jogador escolhe uma carta para virar
  REVIVE: 'revive_select',  // tem que virar uma carta down para up
  BUILD_1: 'build_select_1',// primeira carta para adicionar
  BUILD_2: 'build_select_2',// segunda carta para adicionar
  KILL_2: 'kill_select_2',  // segunda carta para virar para baixo
  GAME_OVER: 'game_over',
};

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck() {
  const deck = [];
  for (const t of CELL_TYPES) {
    for (let i = 0; i < DECK_COUNTS[t]; i++) deck.push(t);
  }
  return deck;
}

function key(x, y) { return `${x},${y}`; }
function parseKey(k) { const [x, y] = k.split(',').map(Number); return { x, y }; }

function createInitialState(seed = Date.now()) {
  let s = seed >>> 0;
  const rng = () => {
    // mulberry32
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const deck = shuffle(buildDeck(), rng);
  // 4x4 inicial; precisamos 16 cartas, restantes ficam de fora.
  const board = {};
  let idx = 0;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      board[key(x, y)] = { type: deck[idx++], faceUp: true };
    }
  }

  const firstPlayer = rng() < 0.5 ? 1 : 2;

  return {
    board,                                      // {key: {type, faceUp}}
    jokers: { 1: null, 2: null },               // {x,y} ou null
    firstPlayer,                                // 1 ou 2 (quem começa cada ciclo)
    currentPlayer: firstPlayer,                 // de quem é a vez
    phase: PHASES.PLACE,                        // estado atual
    placed: { 1: false, 2: false },             // colocaram já o joker?
    moveStepsRemaining: 0,                      // passos restantes do move
    moveStartPos: null,                         // onde começou o move (para undo lógico se preciso)
    pendingEffect: null,                        // 'revive' | 'build' | 'kill' a resolver
    buildFirstPlaced: null,                     // posição do 1º build
    cycleMover: firstPlayer,                    // quem começa o ciclo move/pick deste round
    winner: null,                               // null, 1, 2, ou 'draw'
    turn: 0,
  };
}

function cloneState(state) {
  // deep clone leve, sem JSON.parse para mais performance
  const newBoard = {};
  for (const k in state.board) {
    const c = state.board[k];
    newBoard[k] = { type: c.type, faceUp: c.faceUp };
  }
  return {
    board: newBoard,
    jokers: { 1: state.jokers[1] ? { ...state.jokers[1] } : null,
              2: state.jokers[2] ? { ...state.jokers[2] } : null },
    firstPlayer: state.firstPlayer,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
    placed: { ...state.placed },
    moveStepsRemaining: state.moveStepsRemaining,
    moveStartPos: state.moveStartPos ? { ...state.moveStartPos } : null,
    pendingEffect: state.pendingEffect,
    buildFirstPlaced: state.buildFirstPlaced ? { ...state.buildFirstPlaced } : null,
    cycleMover: state.cycleMover,
    winner: state.winner,
    turn: state.turn,
  };
}

function getBoardBounds(state) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k in state.board) {
    const { x, y } = parseKey(k);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function cellAt(state, x, y) {
  return state.board[key(x, y)] || null;
}

function jokerAt(state, x, y) {
  if (state.jokers[1] && state.jokers[1].x === x && state.jokers[1].y === y) return 1;
  if (state.jokers[2] && state.jokers[2].x === x && state.jokers[2].y === y) return 2;
  return 0;
}

// ------------------------------------------------------------
// PLACE
// ------------------------------------------------------------
function legalPlacements(state) {
  // Qualquer carta face-up sem joker; o segundo player não pode colocar onde o primeiro está.
  if (state.phase !== PHASES.PLACE) return [];
  const out = [];
  for (const k in state.board) {
    const c = state.board[k];
    if (!c.faceUp) continue;
    const { x, y } = parseKey(k);
    if (jokerAt(state, x, y) !== 0) continue;
    out.push({ x, y });
  }
  return out;
}

function applyPlacement(state, x, y) {
  const p = state.currentPlayer;
  state.jokers[p] = { x, y };
  state.placed[p] = true;

  if (state.placed[1] && state.placed[2]) {
    // ambos colocaram, começa fase 2 com o firstPlayer
    state.phase = PHASES.MOVE;
    state.currentPlayer = state.firstPlayer;
    state.cycleMover = state.firstPlayer;
    state.moveStepsRemaining = MOVE_STEPS;
    state.moveStartPos = { ...state.jokers[state.currentPlayer] };
  } else {
    // passa ao outro player para colocar
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  }
  return state;
}

// ------------------------------------------------------------
// MOVE
// ------------------------------------------------------------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function legalSingleSteps(state, fromX, fromY) {
  // Um passo: vizinho ortogonal, célula existe, face-up, sem o outro joker.
  const out = [];
  const opp = state.currentPlayer === 1 ? 2 : 1;
  const oppJ = state.jokers[opp];
  for (const [dx, dy] of DIRS) {
    const nx = fromX + dx, ny = fromY + dy;
    const c = cellAt(state, nx, ny);
    if (!c) continue;
    if (!c.faceUp) continue;
    if (oppJ && oppJ.x === nx && oppJ.y === ny) continue;
    out.push({ x: nx, y: ny });
  }
  return out;
}

function canMoveAtAll(state, player) {
  // Existe pelo menos UM caminho de exatamente 3 passos a partir da posição do joker?
  // O joker pode revisitar células (mas não atravessar o adversário nem cartas viradas).
  const start = state.jokers[player];
  if (!start) return true; // ainda não colocou
  const opp = player === 1 ? 2 : 1;
  const oppJ = state.jokers[opp];
  // BFS limitada a 3 passos
  // Como pode revisitar, basta verificar se há algum vizinho disponível ao longo da cadeia.
  // De facto, se em qualquer step não houver vizinho, falha; mas podemos "voltar para trás",
  // o que significa que basta haver UM vizinho livre em algum ponto para manter a chain.
  // Mais simples: DFS de profundidade 3.
  const tmpState = state; // só leitura
  function dfs(x, y, steps) {
    if (steps === 0) return true;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const c = cellAt(tmpState, nx, ny);
      if (!c || !c.faceUp) continue;
      if (oppJ && oppJ.x === nx && oppJ.y === ny) continue;
      // temporariamente "mover" o joker do player não afeta vizinhança (não bloqueia a si próprio)
      if (dfs(nx, ny, steps - 1)) return true;
    }
    return false;
  }
  return dfs(start.x, start.y, MOVE_STEPS);
}

function legalMoveTargets(state) {
  // Durante a fase MOVE, retorna os próximos steps válidos a partir da posição atual.
  if (state.phase !== PHASES.MOVE) return [];
  const j = state.jokers[state.currentPlayer];
  return legalSingleSteps(state, j.x, j.y);
}

function applyMoveStep(state, x, y) {
  const p = state.currentPlayer;
  state.jokers[p] = { x, y };
  state.moveStepsRemaining--;
  if (state.moveStepsRemaining === 0) {
    state.phase = PHASES.PICK;
  }
  return state;
}

// ------------------------------------------------------------
// PICK / EFFECTS
// ------------------------------------------------------------
function legalPicks(state) {
  // Pode virar qualquer carta face-up que não tenha um joker em cima — exceto:
  // se o jogador atual está em cima de uma carta especial, é obrigado a virar a carta em que está.
  // Reinterpretação: "se tiver em cima de uma carta especial tem que..." — a sua ação resolve o efeito.
  // Vou assumir: o jogador escolhe livremente uma carta face-up sem joker; se a carta sob o seu
  // próprio joker é especial, o efeito da carta sob ele ativa o efeito (não a removida) — mas
  // isso é ambíguo. Lendo de novo:
  //   "remove à sua escolha uma peça do tabuleiro (vira para baixo) se tiver em cima de uma carta
  //    especial tem que [ressuscitar/construir/matar]"
  // Interpretação: o efeito ATIVA com base na carta sob o seu joker. A "remoção" continua à escolha.
  // Mas "matar — em vez de virar 1 para baixo vira duas" sugere que o efeito modifica o ato de virar.
  // Decisão final: efeito é determinado pela carta sob o JOKER do jogador atual no momento do pick.
  if (state.phase !== PHASES.PICK) return [];
  const out = [];
  for (const k in state.board) {
    const c = state.board[k];
    if (!c.faceUp) continue;
    const { x, y } = parseKey(k);
    if (jokerAt(state, x, y) !== 0) continue;
    out.push({ x, y });
  }
  return out;
}

function getEffectUnderJoker(state) {
  const j = state.jokers[state.currentPlayer];
  const c = cellAt(state, j.x, j.y);
  if (!c) return null;
  if (c.type === 'revive' || c.type === 'build' || c.type === 'kill') return c.type;
  return null;
}

function applyPick(state, x, y) {
  // Vira essa carta para baixo
  const c = cellAt(state, x, y);
  c.faceUp = false;

  const effect = getEffectUnderJoker(state);
  if (effect === 'revive') {
    // tem que escolher uma carta down para virar para cima
    const targets = legalReviveTargets(state);
    if (targets.length === 0) {
      // não há cartas para ressuscitar — efeito perde-se
      endPickPhase(state);
    } else {
      state.phase = PHASES.REVIVE;
      state.pendingEffect = 'revive';
    }
  } else if (effect === 'build') {
    state.phase = PHASES.BUILD_1;
    state.pendingEffect = 'build';
    state.buildFirstPlaced = null;
  } else if (effect === 'kill') {
    // tem que virar mais uma
    const targets = legalKillTargets(state);
    if (targets.length === 0) {
      endPickPhase(state);
    } else {
      state.phase = PHASES.KILL_2;
      state.pendingEffect = 'kill';
    }
  } else {
    endPickPhase(state);
  }
  return state;
}

function legalReviveTargets(state) {
  const out = [];
  for (const k in state.board) {
    const c = state.board[k];
    if (c.faceUp) continue;
    const { x, y } = parseKey(k);
    out.push({ x, y });
  }
  return out;
}

function applyRevive(state, x, y) {
  const c = cellAt(state, x, y);
  c.faceUp = true;
  state.pendingEffect = null;
  endPickPhase(state);
  return state;
}

function legalBuildTargets(state) {
  // Pode colocar uma carta adjacente (cima/baixo/esq/dir) a qualquer célula EXISTENTE do tabuleiro,
  // onde ainda não há célula. (Estendendo o tabuleiro.)
  const seen = new Set();
  const out = [];
  for (const k in state.board) {
    const { x, y } = parseKey(k);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const nk = key(nx, ny);
      if (state.board[nk]) continue;
      if (seen.has(nk)) continue;
      seen.add(nk);
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function pickRandomNewCardType(state) {
  // Para manter info perfeita, o tipo das cartas adicionadas é determinístico:
  // segue a proporção do baralho restante (cartas ainda no tabuleiro face-up).
  // Decisão simples: sempre 'normal' (resto do baralho já foi distribuído).
  // Como o baralho tem 52 cartas e o tabuleiro começa com 16, ainda há 36 cartas
  // "reserva" para as builds — mas para o minimax preferimos determinismo total.
  // Usamos: 'normal'. (Pode-se ajustar depois.)
  return 'normal';
}

function applyBuildPlace(state, x, y) {
  const k = key(x, y);
  state.board[k] = { type: pickRandomNewCardType(state), faceUp: true };
  if (state.phase === PHASES.BUILD_1) {
    state.buildFirstPlaced = { x, y };
    state.phase = PHASES.BUILD_2;
  } else {
    // BUILD_2
    state.buildFirstPlaced = null;
    state.pendingEffect = null;
    endPickPhase(state);
  }
  return state;
}

function legalKillTargets(state) {
  // Outra carta face-up sem joker em cima.
  const out = [];
  for (const k in state.board) {
    const c = state.board[k];
    if (!c.faceUp) continue;
    const { x, y } = parseKey(k);
    if (jokerAt(state, x, y) !== 0) continue;
    out.push({ x, y });
  }
  return out;
}

function applyKillSecond(state, x, y) {
  const c = cellAt(state, x, y);
  c.faceUp = false;
  state.pendingEffect = null;
  endPickPhase(state);
  return state;
}

// ------------------------------------------------------------
// END OF TURN — verifica vitória, troca jogador
// ------------------------------------------------------------
function endPickPhase(state) {
  state.turn++;
  // Próximo a jogar é o OUTRO player. O ciclo continua até alguém não conseguir andar.
  const next = state.currentPlayer === 1 ? 2 : 1;

  // Antes do próximo move, verificar: ambos os players ainda conseguem andar?
  const p1Can = canMoveAtAll(state, 1);
  const p2Can = canMoveAtAll(state, 2);

  if (!p1Can && !p2Can) {
    state.phase = PHASES.GAME_OVER;
    state.winner = 'draw';
    return;
  }
  if (!p1Can) { state.phase = PHASES.GAME_OVER; state.winner = 2; return; }
  if (!p2Can) { state.phase = PHASES.GAME_OVER; state.winner = 1; return; }

  state.currentPlayer = next;
  state.phase = PHASES.MOVE;
  state.moveStepsRemaining = MOVE_STEPS;
  state.moveStartPos = { ...state.jokers[next] };
}

// ------------------------------------------------------------
// API de "actions" para o bot: enumera todas as ações legais no estado atual
// Cada ação é {kind, x, y} ou para sequências (move, build) cada step é uma ação atómica.
// ------------------------------------------------------------
function legalActions(state) {
  switch (state.phase) {
    case PHASES.PLACE:
      return legalPlacements(state).map(p => ({ kind: 'place', ...p }));
    case PHASES.MOVE:
      return legalMoveTargets(state).map(p => ({ kind: 'move', ...p }));
    case PHASES.PICK:
      return legalPicks(state).map(p => ({ kind: 'pick', ...p }));
    case PHASES.REVIVE:
      return legalReviveTargets(state).map(p => ({ kind: 'revive', ...p }));
    case PHASES.BUILD_1:
      return legalBuildTargets(state).map(p => ({ kind: 'build', ...p }));
    case PHASES.BUILD_2:
      return legalBuildTargets(state).map(p => ({ kind: 'build', ...p }));
    case PHASES.KILL_2:
      return legalKillTargets(state).map(p => ({ kind: 'kill', ...p }));
    default:
      return [];
  }
}

function applyAction(state, action) {
  switch (action.kind) {
    case 'place':  return applyPlacement(state, action.x, action.y);
    case 'move':   return applyMoveStep(state, action.x, action.y);
    case 'pick':   return applyPick(state, action.x, action.y);
    case 'revive': return applyRevive(state, action.x, action.y);
    case 'build':  return applyBuildPlace(state, action.x, action.y);
    case 'kill':   return applyKillSecond(state, action.x, action.y);
  }
  return state;
}

// Exporta para outros scripts (browser global)
window.JokerHop = {
  PHASES, MOVE_STEPS, CELL_TYPES,
  createInitialState, cloneState,
  cellAt, jokerAt, key, parseKey, getBoardBounds,
  legalActions, applyAction,
  legalPlacements, legalMoveTargets, legalPicks,
  legalReviveTargets, legalBuildTargets, legalKillTargets,
  canMoveAtAll, getEffectUnderJoker,
};
