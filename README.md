# 🃏 Joker Hop

Um jogo de tabuleiro 4×4 (expansível) para 2 jogadores — humano vs humano, humano vs bot, ou bot vs bot. O bot usa **minimax com alpha-beta pruning**.

## 🎮 Joga online

**→ https://favoritossitios-byte.github.io/JOKERS/**

(Deploy automático via GitHub Actions a cada push para `main`. Para ativar pela primeira vez: vai a Settings → Pages → Source → "GitHub Actions".)

## Como jogar localmente

Abre `index.html` no browser. Não precisa de servidor.

```bash
# opcional: servir localmente
python -m http.server 8080
# depois abre http://localhost:8080
```

## Regras

- Tabuleiro inicial **4×4** com 16 cartas tiradas de um baralho de 52:
  - **Normal** (azul) — 40/52
  - **Ressuscitar** (rosa) — 4/52 — vira uma carta virada para baixo de volta para cima
  - **Construir** (verde) — 4/52 — adiciona 2 cartas adjacentes ao tabuleiro
  - **Mortal** (vermelho) — 4/52 — em vez de virar 1 carta para baixo, vira 2

### Fases

1. **Colocar** — Um jogador aleatório coloca o seu joker numa carta. Depois o outro coloca.
2. **Andar** — O primeiro a colocar anda **exatamente 3 passos** (cima/baixo/esq/dir, sem diagonal). Pode voltar para trás. Não pode passar por cima do adversário nem por cartas viradas para baixo.
3. **Virar** — Escolhe uma carta face-up (sem joker) para virar. Se o seu joker está em cima de uma carta especial, o efeito ativa:
   - Ressuscitar — escolhe uma carta virada para virar de volta
   - Construir — coloca 2 cartas adjacentes ao tabuleiro existente
   - Mortal — vira uma segunda carta para baixo

Depois é a vez do outro jogador. Loop até alguém não conseguir dar 3 passos. Se só um não consegue, perde. Se ambos não conseguem, empate.

## Bot

`bot.js` implementa minimax com:
- Alpha-beta pruning
- Iterative deepening até `depth` (configurável na UI, default 3)
- Heurística: mobilidade (vizinhos imediatos + flood-fill de células acessíveis) e detecção rápida de vitória/derrota

Como o jogo tem informação perfeita (assumindo cartas adicionadas pelo `build` como `normal` deterministicamente), o minimax é apropriado. Profundidades altas (5+) podem ser lentas porque cada turno são ~5 ações (1 place + 3 moves + 1 pick + possivelmente efeitos).

## Ficheiros

- `index.html` — markup + controlos
- `style.css` — estilos
- `game.js` — regras puras (sem DOM), API: `createInitialState`, `legalActions`, `applyAction`, `cloneState`
- `bot.js` — `JokerBot.chooseAction(state, depth, timeLimitMs)`
- `app.js` — UI, integra os dois

## Ajustar

- Mudar tamanho do tabuleiro: alterar o duplo loop em `createInitialState` em `game.js`.
- Mudar tipo das cartas adicionadas pelo build: `pickRandomNewCardType` em `game.js`.
- Mudar heurística do bot: `evaluate` em `bot.js`.
