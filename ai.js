import { PLAYER, DIRECTIONS, Piece } from './game.js';

/**
 * Master-Level Checkers AI:
 * - Search Depth: 8-10 ply with adaptive endgame expansion
 * - Full Multi-Jump Branch Exploration (evaluates entire capture chains, not just single steps)
 * - Move Ordering: Max-captures, King captures, promotions, center control
 * - Quiescence Search: Resolves tactical capture cascades and prevents the Horizon Effect
 * - Advanced Heuristic Evaluation for Custom Rules:
 *   - Material: Regular Piece = 100, Flying King = 1000
 *   - Long Diagonals (Main Great Diagonals A1-H8 / H1-A8)
 *   - Flying King Board Dominance & Interception
 *   - Penalty for Leaving Pieces Vulnerable to Opponent Multi-Jumps
 *   - Mandatory capture depth bonus (rewarding multi-captures)
 */
export class CheckersAI {
  constructor(player = PLAYER.BLACK, maxDepth = 8) {
    this.aiPlayer = player;
    this.humanPlayer = player === PLAYER.RED ? PLAYER.BLACK : PLAYER.RED;
    this.maxDepth = maxDepth;
    this.nodesEvaluated = 0;
    this.quiescenceMaxDepth = 8;
  }

  setAIPlayer(player, depth = 8) {
    this.aiPlayer = player;
    this.humanPlayer = player === PLAYER.RED ? PLAYER.BLACK : PLAYER.RED;
    this.maxDepth = depth;
  }

  /**
   * Evaluates the current board state from the perspective of the AI player.
   */
  evaluate(game) {
    if (game.gameOver) {
      if (game.winner === this.aiPlayer) return 10000000;
      if (game.winner === this.humanPlayer) return -10000000;
      return 0;
    }

    let score = 0;
    let aiPieces = 0;
    let humanPieces = 0;
    let aiKings = 0;
    let humanKings = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = game.getPiece(r, c);
        if (!piece) continue;

        const isAI = piece.player === this.aiPlayer;
        const multiplier = isAI ? 1 : -1;

        if (isAI) {
          aiPieces++;
          if (piece.isKing) aiKings++;
        } else {
          humanPieces++;
          if (piece.isKing) humanKings++;
        }

        // 1. MATERIAL EVALUATION: Flying Kings are game-deciding (1000 pts vs 100 pts)
        const baseMaterial = piece.isKing ? 1000 : 100;
        score += multiplier * baseMaterial;

        // 2. POSITION & ADVANCEMENT
        if (!piece.isKing) {
          const rank = piece.player === PLAYER.RED ? r : (7 - r);
          // Exponential ramp towards king promotion row
          const rankBonus = [0, 8, 20, 40, 75, 130, 240, 600][rank] || (rank * 15);
          score += multiplier * rankBonus;

          // Home row protection: keeping back-row pieces defends against promotion
          const isHomeRow = (piece.player === PLAYER.RED && r === 0) || (piece.player === PLAYER.BLACK && r === 7);
          if (isHomeRow) {
            score += multiplier * 35;
          }

          // Edge safety for regular pieces (cannot be jumped from the outside)
          if (c === 0 || c === 7) {
            score += multiplier * 20;
          }

          // Mutual protection / Phalanx formation
          const backRowDelta = piece.player === PLAYER.RED ? -1 : 1;
          const leftSup = game.getPiece(r + backRowDelta, c - 1);
          const rightSup = game.getPiece(r + backRowDelta, c + 1);
          if ((leftSup && leftSup.player === piece.player) || (rightSup && rightSup.player === piece.player)) {
            score += multiplier * 25;
          }
        } else {
          // FLYING KING EVALUATION:
          // Center & diagonal span: A flying king in the center rays attacks across all 4 directions
          const centerDist = Math.abs(r - 3.5) + Math.abs(c - 3.5);
          score += multiplier * ((7 - centerDist) * 30);

          // Control of Great Diagonals (A1-H8 / H1-A8)
          if (r === c || (r + c) === 7) {
            score += multiplier * 60;
          }

          // Flying King blocking opponent's back-rank
          const oppBackRow = piece.player === PLAYER.RED ? 7 : 0;
          if (Math.abs(r - oppBackRow) <= 1) {
            score += multiplier * 50;
          }
        }
      }
    }

    // 3. MULTI-JUMP THREATS & MANDATORY JUMP PENALTIES
    // If the opponent has capture sequences available, calculate maximum damage
    const oppSequences = game.findCaptureSequences ? [] : [];
    const oppCaptures = game.getAllCapturesForPlayer(this.humanPlayer);
    if (oppCaptures.length > 0) {
      // Find longest sequence opponent can perform
      let maxOppCaptures = 1;
      if (typeof game.getMaxCaptureSequencesForPlayer === 'function') {
        const oppMaxSeq = game.getMaxCaptureSequencesForPlayer(this.humanPlayer);
        if (oppMaxSeq.length > 0) {
          maxOppCaptures = oppMaxSeq[0].totalCaptures;
        }
      }
      // Massive penalty if opponent can chain-capture multiple pieces
      score -= (maxOppCaptures * 220);

      for (const cap of oppCaptures) {
        if (cap.captured && cap.captured.piece && cap.captured.piece.isKing) {
          score -= 900; // Critical danger: Opponent captures AI's King!
        }
      }
    }

    // AI's own capture potential
    const aiCaptures = game.getAllCapturesForPlayer(this.aiPlayer);
    if (aiCaptures.length > 0) {
      let maxAICaptures = 1;
      if (typeof game.getMaxCaptureSequencesForPlayer === 'function') {
        const aiMaxSeq = game.getMaxCaptureSequencesForPlayer(this.aiPlayer);
        if (aiMaxSeq.length > 0) {
          maxAICaptures = aiMaxSeq[0].totalCaptures;
        }
      }
      score += (maxAICaptures * 220);

      for (const cap of aiCaptures) {
        if (cap.captured && cap.captured.piece && cap.captured.piece.isKing) {
          score += 900; // Major reward: AI captures opponent's King!
        }
      }
    }

    // 4. Material Advantage Multiplication in Endgames
    if (aiPieces > humanPieces) {
      score += (aiPieces - humanPieces) * 80;
    }

    return score;
  }

  /**
   * Generates all complete legal turn actions for a player.
   * If captures exist, returns all complete multi-jump sequences!
   */
  getCompleteLegalActions(game, player) {
    if (typeof game.getMaxCaptureSequencesForPlayer === 'function') {
      const maxSeqs = game.getMaxCaptureSequencesForPlayer(player);
      if (maxSeqs.length > 0) {
        // Enforce maximum capture depth sequences!
        return maxSeqs.map(seq => ({
          isJumpChain: true,
          steps: seq.steps,
          totalCaptures: seq.totalCaptures,
          from: seq.steps[0].from,
          to: seq.steps[seq.steps.length - 1].to,
          firstStep: seq.steps[0]
        }));
      }
    }

    // Fallback if no capture sequence found: Check regular moves
    const regularMoves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = game.getPiece(r, c);
        if (piece && piece.player === player) {
          const moves = game.getRegularMovesForPiece(r, c);
          for (const m of moves) {
            regularMoves.push({
              isJumpChain: false,
              steps: [m],
              totalCaptures: 0,
              from: m.from,
              to: m.to,
              firstStep: m
            });
          }
        }
      }
    }
    return regularMoves;
  }

  /**
   * Simulates a full legal action (including complete multi-jump chains) on a cloned engine.
   */
  simulateAction(game, action) {
    const simGame = new (game.constructor)();
    simGame.restoreState(game.cloneBoardState());

    for (const step of action.steps) {
      simGame.makeMove(step.from, step.to, { allowHuffDetection: false });
    }

    // If any trailing captures remain on the active piece, greedily consume them
    while (simGame.activePiecePos) {
      const more = simGame.getCapturesForPiece(simGame.activePiecePos.r, simGame.activePiecePos.c);
      if (more.length > 0) {
        simGame.makeMove(simGame.activePiecePos, more[0].to, { allowHuffDetection: false });
      } else {
        simGame.activePiecePos = null;
        simGame.switchTurn();
        simGame.checkGameOver();
        break;
      }
    }

    return simGame;
  }

  /**
   * Move ordering to maximize Alpha-Beta cutoffs
   */
  orderActions(actions, game, player) {
    return actions.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      if (a.isJumpChain) {
        scoreA += 5000 + (a.totalCaptures * 1000);
        for (const step of a.steps) {
          if (step.captured && step.captured.piece && step.captured.piece.isKing) {
            scoreA += 1500;
          }
        }
      }

      if (b.isJumpChain) {
        scoreB += 5000 + (b.totalCaptures * 1000);
        for (const step of b.steps) {
          if (step.captured && step.captured.piece && step.captured.piece.isKing) {
            scoreB += 1500;
          }
        }
      }

      // Check king promotions
      const pieceA = game.getPiece(a.from.r, a.from.c);
      if (pieceA && !pieceA.isKing) {
        if ((player === PLAYER.RED && a.to.r === 7) || (player === PLAYER.BLACK && a.to.r === 0)) {
          scoreA += 2000;
        }
      }

      const pieceB = game.getPiece(b.from.r, b.from.c);
      if (pieceB && !pieceB.isKing) {
        if ((player === PLAYER.RED && b.to.r === 7) || (player === PLAYER.BLACK && b.to.r === 0)) {
          scoreB += 2000;
        }
      }

      // Center proximity
      scoreA += (3.5 - Math.abs(a.to.c - 3.5)) * 10;
      scoreB += (3.5 - Math.abs(b.to.c - 3.5)) * 10;

      return scoreB - scoreA;
    });
  }

  /**
   * Quiescence Search:
   * Continues searching capturing sequences at leaf nodes until the board is "quiet",
   * completely resolving the Horizon Effect across multi-jump chains.
   */
  quiescence(game, alpha, beta, isMaximizing, qDepth = 0) {
    this.nodesEvaluated++;
    const standPat = this.evaluate(game);

    if (qDepth >= this.quiescenceMaxDepth || game.gameOver) {
      return standPat;
    }

    if (isMaximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;

      const actions = this.getCompleteLegalActions(game, this.aiPlayer).filter(a => a.isJumpChain);
      if (actions.length === 0) return standPat;

      const orderedActions = this.orderActions(actions, game, this.aiPlayer);
      for (const action of orderedActions) {
        const simGame = this.simulateAction(game, action);
        const score = this.quiescence(simGame, alpha, beta, false, qDepth + 1);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;

      const actions = this.getCompleteLegalActions(game, this.humanPlayer).filter(a => a.isJumpChain);
      if (actions.length === 0) return standPat;

      const orderedActions = this.orderActions(actions, game, this.humanPlayer);
      for (const action of orderedActions) {
        const simGame = this.simulateAction(game, action);
        const score = this.quiescence(simGame, alpha, beta, true, qDepth + 1);

        if (score <= alpha) return alpha;
        if (score < beta) beta = score;
      }
      return beta;
    }
  }

  /**
   * Minimax with Alpha-Beta Pruning, Move Ordering, and Quiescence Search.
   */
  minimax(game, depth, alpha, beta, isMaximizing) {
    this.nodesEvaluated++;

    if (game.gameOver) {
      return { score: this.evaluate(game) };
    }

    if (depth <= 0) {
      return { score: this.quiescence(game, alpha, beta, isMaximizing, 0) };
    }

    const currentPlayer = isMaximizing ? this.aiPlayer : this.humanPlayer;
    let actions = this.getCompleteLegalActions(game, currentPlayer);

    if (actions.length === 0) {
      return { score: isMaximizing ? -10000000 + (this.maxDepth - depth) : 10000000 - (this.maxDepth - depth) };
    }

    actions = this.orderActions(actions, game, currentPlayer);

    if (isMaximizing) {
      let maxScore = -Infinity;
      let bestAction = actions[0];

      for (const action of actions) {
        const simGame = this.simulateAction(game, action);
        const result = this.minimax(simGame, depth - 1, alpha, beta, false);

        if (result.score > maxScore) {
          maxScore = result.score;
          bestAction = action;
        }
        alpha = Math.max(alpha, maxScore);
        if (beta <= alpha) {
          break; // Beta cutoff
        }
      }
      return { score: maxScore, action: bestAction };
    } else {
      let minScore = Infinity;
      let bestAction = actions[0];

      for (const action of actions) {
        const simGame = this.simulateAction(game, action);
        const result = this.minimax(simGame, depth - 1, alpha, beta, true);

        if (result.score < minScore) {
          minScore = result.score;
          bestAction = action;
        }
        beta = Math.min(beta, minScore);
        if (beta <= alpha) {
          break; // Alpha cutoff
        }
      }
      return { score: minScore, action: bestAction };
    }
  }

  /**
   * Gets the best move/first-step for the AI to execute.
   */
  getBestMove(game) {
    this.nodesEvaluated = 0;
    const actions = this.getCompleteLegalActions(game, this.aiPlayer);
    if (actions.length === 0) return null;
    if (actions.length === 1) return actions[0].firstStep;

    // Count active pieces to adjust search depth dynamically
    let totalPieces = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (game.getPiece(r, c)) totalPieces++;
      }
    }

    let searchDepth = this.maxDepth;
    if (totalPieces <= 8) {
      searchDepth = Math.max(searchDepth, 10);
    } else if (totalPieces <= 14) {
      searchDepth = Math.max(searchDepth, 9);
    } else if (searchDepth > 8) {
      searchDepth = 8;
    }

    const result = this.minimax(game, searchDepth, -Infinity, Infinity, true);
    return (result.action ? result.action.firstStep : actions[0].firstStep);
  }
}
