// Auto-generated stand-alone bundle

/**
 * Constants & Types for the Game
 */
const PLAYER = {
  NONE: 0,
  RED: 1,    // Player 1 (Starts at rows 0,1,2 - moving down towards row 7)
  BLACK: 2   // Player 2 (Starts at rows 5,6,7 - moving up towards row 0)
};

const DIRECTIONS = [
  { r: -1, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 1 }
];

class Piece {
  constructor(player, isKing = false, id = null) {
    this.player = player;
    this.isKing = isKing;
    this.id = id || `p_${player}_${Math.random().toString(36).substring(2, 9)}`;
  }

  clone() {
    return new Piece(this.player, this.isKing, this.id);
  }
}

class GameEngine {
  constructor() {
    this.board = []; // 8x8 array
    this.currentPlayer = PLAYER.RED;
    this.activePiecePos = null; // Used during mandatory multi-jump chaining {r, c}
    this.capturedByPlayer1 = 0; // Black pieces taken
    this.capturedByPlayer2 = 0; // Red pieces taken
    this.graveyardP1 = [];
    this.graveyardP2 = [];
    this.history = []; // Snapshot stack for undo / insisted rollbacks
    this.pendingHuffAction = null; // Holds info when an illegal normal move is staged
    this.gameOver = false;
    this.winner = null;
    this.initBoard();
  }

  initBoard() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        // Pieces only sit on dark squares: (r + c) % 2 === 1
        if ((r + c) % 2 === 1) {
          if (r < 3) {
            this.board[r][c] = new Piece(PLAYER.RED);
          } else if (r > 4) {
            this.board[r][c] = new Piece(PLAYER.BLACK);
          }
        }
      }
    }
    this.currentPlayer = PLAYER.RED;
    this.activePiecePos = null;
    this.capturedByPlayer1 = 0;
    this.capturedByPlayer2 = 0;
    this.graveyardP1 = [];
    this.graveyardP2 = [];
    this.pendingHuffAction = null;
    this.gameOver = false;
    this.winner = null;
    this.history = [];
  }

  cloneBoardState() {
    const newBoard = Array(8).fill(null).map((_, r) => 
      Array(8).fill(null).map((_, c) => {
        const piece = this.board[r][c];
        return piece ? (piece.clone ? piece.clone() : new Piece(piece.player, piece.isKing, piece.id)) : null;
      })
    );
    return {
      board: newBoard,
      currentPlayer: this.currentPlayer,
      activePiecePos: this.activePiecePos ? { ...this.activePiecePos } : null,
      capturedByPlayer1: this.capturedByPlayer1,
      capturedByPlayer2: this.capturedByPlayer2,
      graveyardP1: [...this.graveyardP1],
      graveyardP2: [...this.graveyardP2],
      gameOver: this.gameOver,
      winner: this.winner
    };
  }

  restoreState(state) {
    this.board = state.board.map(row => row.map(p => p ? (p.clone ? p.clone() : new Piece(p.player, p.isKing, p.id)) : null));
    this.currentPlayer = state.currentPlayer;
    this.activePiecePos = state.activePiecePos ? { ...state.activePiecePos } : null;
    this.capturedByPlayer1 = state.capturedByPlayer1;
    this.capturedByPlayer2 = state.capturedByPlayer2;
    this.graveyardP1 = [...state.graveyardP1];
    this.graveyardP2 = [...state.graveyardP2];
    this.gameOver = state.gameOver;
    this.winner = state.winner;
    this.pendingHuffAction = null;
  }

  pushHistory() {
    this.history.push(this.cloneBoardState());
  }

  isInside(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  getPiece(r, c) {
    if (!this.isInside(r, c)) return null;
    return this.board[r][c];
  }

  /**
   * Returns all available immediate captures for a specific piece at (r, c)
   */
  getCapturesForPiece(r, c) {
    const piece = this.getPiece(r, c);
    if (!piece) return [];
    const captures = [];

    if (!piece.isKing) {
      // Regular Piece: Can capture in ALL 4 diagonal directions forward & backward!
      // Step 1: Adjacent enemy piece
      // Step 2: Empty space immediately beyond
      for (const dir of DIRECTIONS) {
        const enemyR = r + dir.r;
        const enemyC = c + dir.c;
        const landingR = r + dir.r * 2;
        const landingC = c + dir.c * 2;

        if (this.isInside(landingR, landingC)) {
          const enemyPiece = this.getPiece(enemyR, enemyC);
          const landingPiece = this.getPiece(landingR, landingC);

          if (enemyPiece && enemyPiece.player !== piece.player && !landingPiece) {
            captures.push({
              from: { r, c },
              to: { r: landingR, c: landingC },
              captured: { r: enemyR, c: enemyC, piece: enemyPiece.clone ? enemyPiece.clone() : { ...enemyPiece } },
              isJump: true
            });
          }
        }
      }
    } else {
      // Flying King:
      // Can fly any number of empty squares, jump 1 enemy piece, and land on ANY empty square beyond along that diagonal!
      for (const dir of DIRECTIONS) {
        let step = 1;
        let enemyFound = null;

        while (true) {
          const currR = r + dir.r * step;
          const currC = c + dir.c * step;
          if (!this.isInside(currR, currC)) break;

          const currPiece = this.getPiece(currR, currC);

          if (!enemyFound) {
            if (currPiece) {
              if (currPiece.player === piece.player) {
                // Blocked by friendly piece
                break;
              } else {
                // Found potential enemy piece to jump
                enemyFound = { r: currR, c: currC, piece: currPiece.clone ? currPiece.clone() : { ...currPiece } };
              }
            }
          } else {
            // Already found 1 enemy along this diagonal
            if (currPiece) {
              // Blocked by another piece (friendly or 2nd enemy in a row)
              break;
            } else {
              // Valid landing square beyond the jumped enemy piece!
              captures.push({
                from: { r, c },
                to: { r: currR, c: currC },
                captured: { ...enemyFound },
                isJump: true
              });
            }
          }
          step++;
        }
      }
    }

    return captures;
  }

  /**
   * Recursively finds all multi-jump sequences originating from (r, c).
   * Returns an array of paths: [ { steps: [move1, move2, ...], totalCaptures: N } ]
   */
  findCaptureSequences(r, c) {
    const sequences = [];

    const recurse = (currentR, currentC, currentSteps) => {
      const immediateCaptures = this.getCapturesForPiece(currentR, currentC);

      if (immediateCaptures.length === 0) {
        if (currentSteps.length > 0) {
          sequences.push({
            steps: [...currentSteps],
            totalCaptures: currentSteps.length,
            finalPos: { r: currentR, c: currentC }
          });
        }
        return;
      }

      for (const cap of immediateCaptures) {
        // Temporarily apply capture
        const movingPiece = this.board[currentR][currentC];
        const capturedPiece = this.board[cap.captured.r][cap.captured.c];

        this.board[cap.to.r][cap.to.c] = movingPiece;
        this.board[currentR][currentC] = null;
        this.board[cap.captured.r][cap.captured.c] = null;

        let wasKing = movingPiece.isKing;
        let becameKing = false;
        if (!wasKing) {
          if ((movingPiece.player === PLAYER.RED && cap.to.r === 7) ||
              (movingPiece.player === PLAYER.BLACK && cap.to.r === 0)) {
            movingPiece.isKing = true;
            becameKing = true;
          }
        }

        // Rule: If a piece reaches the king row during a capture and promotes, its turn ends immediately.
        // It cannot continue jumping as a king in the same turn.
        if (becameKing) {
          sequences.push({
            steps: [...currentSteps, cap],
            totalCaptures: currentSteps.length + 1,
            finalPos: { r: cap.to.r, c: cap.to.c }
          });
        } else {
          recurse(cap.to.r, cap.to.c, [...currentSteps, cap]);
        }

        // Roll back board state
        movingPiece.isKing = wasKing;
        this.board[currentR][currentC] = movingPiece;
        this.board[cap.to.r][cap.to.c] = null;
        this.board[cap.captured.r][cap.captured.c] = capturedPiece;
      }
    };

    recurse(r, c, []);
    return sequences;
  }

  /**
   * Returns the maximum capture sequences available for a player,
   * enforcing the rule requiring maximum capture depth (רוב אכילות חובה).
   */
  getMaxCaptureSequencesForPlayer(player = this.currentPlayer) {
    let maxCount = 0;
    const allSequences = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.getPiece(r, c);
        if (piece && piece.player === player) {
          const seqs = this.findCaptureSequences(r, c);
          for (const s of seqs) {
            if (s.totalCaptures > maxCount) {
              maxCount = s.totalCaptures;
            }
            allSequences.push(s);
          }
        }
      }
    }

    if (maxCount === 0) return [];
    return allSequences.filter(s => s.totalCaptures === maxCount);
  }

  /**
   * Returns regular (non-capturing) moves for a specific piece at (r, c)
   */
  getRegularMovesForPiece(r, c) {
    const piece = this.getPiece(r, c);
    if (!piece) return [];
    const moves = [];

    if (!piece.isKing) {
      // Regular Piece: Moves FORWARD only
      const forwardRowDelta = piece.player === PLAYER.RED ? 1 : -1;
      const colDeltas = [-1, 1];

      for (const dc of colDeltas) {
        const nextR = r + forwardRowDelta;
        const nextC = c + dc;
        if (this.isInside(nextR, nextC) && !this.getPiece(nextR, nextC)) {
          moves.push({
            from: { r, c },
            to: { r: nextR, c: nextC },
            isJump: false
          });
        }
      }
    } else {
      // Flying King: Moves any number of empty squares in all 4 diagonal directions
      for (const dir of DIRECTIONS) {
        let step = 1;
        while (true) {
          const nextR = r + dir.r * step;
          const nextC = c + dir.c * step;
          if (!this.isInside(nextR, nextC)) break;
          if (this.getPiece(nextR, nextC)) break; // Blocked

          moves.push({
            from: { r, c },
            to: { r: nextR, c: nextC },
            isJump: false
          });
          step++;
        }
      }
    }

    return moves;
  }

  /**
   * Returns all available captures across the entire board for the specified player
   */
  getAllCapturesForPlayer(player = this.currentPlayer) {
    const captures = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.getPiece(r, c);
        if (piece && piece.player === player) {
          captures.push(...this.getCapturesForPiece(r, c));
        }
      }
    }
    return captures;
  }

  /**
   * Returns the squares that can initiate a capture for the current player
   */
  getPiecesWithCaptures(player = this.currentPlayer) {
    const list = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.getPiece(r, c);
        if (piece && piece.player === player) {
          if (this.getCapturesForPiece(r, c).length > 0) {
            list.push({ r, c });
          }
        }
      }
    }
    return list;
  }

  /**
   * Returns all valid moves for the piece at (r, c).
   */
  getValidMovesForPiece(r, c, strictCaptures = true) {
    const piece = this.getPiece(r, c);
    if (!piece || piece.player !== this.currentPlayer) return [];

    // If in the middle of a mandatory multi-jump chain, ONLY this piece can jump!
    if (this.activePiecePos) {
      if (this.activePiecePos.r !== r || this.activePiecePos.c !== c) {
        return [];
      }
      return this.getCapturesForPiece(r, c);
    }

    const pieceCaptures = this.getCapturesForPiece(r, c);
    const pieceRegular = this.getRegularMovesForPiece(r, c);

    if (strictCaptures) {
      const allBoardCaptures = this.getAllCapturesForPlayer(this.currentPlayer);
      if (allBoardCaptures.length > 0) {
        // Enforce maximum capture sequence rule if applicable
        const maxSequences = this.getMaxCaptureSequencesForPlayer(this.currentPlayer);
        const validFirstSteps = maxSequences
          .filter(s => s.steps[0].from.r === r && s.steps[0].from.c === c)
          .map(s => s.steps[0]);

        if (validFirstSteps.length > 0) {
          // Unique first steps that lead to max captures
          const unique = [];
          for (const s of validFirstSteps) {
            if (!unique.some(u => u.to.r === s.to.r && u.to.c === s.to.c)) {
              unique.push(s);
            }
          }
          return unique;
        }
        return pieceCaptures;
      }
      return pieceRegular;
    } else {
      return [...pieceCaptures, ...pieceRegular];
    }
  }

  /**
   * Execute or stage a move
   */
  makeMove(from, to, options = { allowHuffDetection: true }) {
    const piece = this.getPiece(from.r, from.c);
    if (!piece || piece.player !== this.currentPlayer) {
      return { success: false, reason: 'Not your piece or not your turn.' };
    }

    // If in the middle of a multi-jump, you MUST move the active piece and MUST capture!
    if (this.activePiecePos) {
      if (from.r !== this.activePiecePos.r || from.c !== this.activePiecePos.c) {
        return { success: false, reason: 'Must continue jump with the active capturing piece!' };
      }
    }

    const allBoardCaptures = this.getAllCapturesForPlayer(this.currentPlayer);
    const pieceCaptures = this.getCapturesForPiece(from.r, from.c);
    const isAttemptingJump = pieceCaptures.some(m => m.to.r === to.r && m.to.c === to.c);

    // Rule 5: Check if player is attempting a normal move while ANY piece could capture
    if (!isAttemptingJump && allBoardCaptures.length > 0) {
      if (options.allowHuffDetection) {
        const preState = this.cloneBoardState();
        
        this.board[to.r][to.c] = piece;
        this.board[from.r][from.c] = null;
        
        let promoted = false;
        if ((piece.player === PLAYER.RED && to.r === 7) || (piece.player === PLAYER.BLACK && to.r === 0)) {
          if (!piece.isKing) {
            piece.isKing = true;
            promoted = true;
          }
        }

        this.pendingHuffAction = {
          preState,
          offendingPiecePos: { r: to.r, c: to.c },
          originalFrom: { ...from },
          player: this.currentPlayer,
          availableCaptures: allBoardCaptures
        };

        return {
          success: true,
          huffTriggered: true,
          promoted,
          from,
          to,
          message: 'Mandatory capture was missed! Opponent must choose: Huff (Burn) piece or Insist on Jump.'
        };
      } else {
        return { success: false, reason: 'A capture is mandatory!' };
      }
    }

    // Save state for undo
    this.pushHistory();

    if (isAttemptingJump) {
      const move = pieceCaptures.find(m => m.to.r === to.r && m.to.c === to.c);
      
      // Move piece
      this.board[to.r][to.c] = piece;
      this.board[from.r][from.c] = null;

      // Remove captured piece
      const captured = move.captured;
      this.board[captured.r][captured.c] = null;

      if (this.currentPlayer === PLAYER.RED) {
        this.capturedByPlayer1++;
        this.graveyardP1.push(captured.piece);
      } else {
        this.capturedByPlayer2++;
        this.graveyardP2.push(captured.piece);
      }

      // Check king promotion
      let promoted = false;
      if (!piece.isKing) {
        if ((piece.player === PLAYER.RED && to.r === 7) || (piece.player === PLAYER.BLACK && to.r === 0)) {
          piece.isKing = true;
          promoted = true;
        }
      }

      // Rule: If a piece reached the king row and promoted to a King, its turn ends immediately!
      // It cannot continue jumping as a king in the same turn.
      if (promoted) {
        this.activePiecePos = null;
        this.switchTurn();
        this.checkGameOver();
        return {
          success: true,
          isJump: true,
          multiJumpAvailable: false,
          promoted: true,
          from,
          to,
          captured
        };
      }

      // MANDATORY MULTI-JUMP: Check for continuation from the new square
      const nextCaptures = this.getCapturesForPiece(to.r, to.c);
      if (nextCaptures.length > 0) {
        // Player MUST continue capturing in the same turn!
        this.activePiecePos = { r: to.r, c: to.c };
        return {
          success: true,
          isJump: true,
          multiJumpAvailable: true,
          promoted,
          from,
          to,
          captured
        };
      } else {
        // Multi-jump completed or single jump ended
        this.activePiecePos = null;
        this.switchTurn();
        this.checkGameOver();
        return {
          success: true,
          isJump: true,
          multiJumpAvailable: false,
          promoted,
          from,
          to,
          captured
        };
      }
    } else {
      // Normal regular move
      const regularMoves = this.getRegularMovesForPiece(from.r, from.c);
      const isValidRegular = regularMoves.some(m => m.to.r === to.r && m.to.c === to.c);

      if (!isValidRegular) {
        return { success: false, reason: 'Invalid move destination.' };
      }

      this.board[to.r][to.c] = piece;
      this.board[from.r][from.c] = null;

      let promoted = false;
      if (!piece.isKing) {
        if ((piece.player === PLAYER.RED && to.r === 7) || (piece.player === PLAYER.BLACK && to.r === 0)) {
          piece.isKing = true;
          promoted = true;
        }
      }

      this.switchTurn();
      this.checkGameOver();

      return {
        success: true,
        isJump: false,
        promoted,
        from,
        to
      };
    }
  }

  /**
   * Huffing Resolution: Option A - Burn the piece
   */
  resolveHuffByBurning() {
    if (!this.pendingHuffAction) return null;
    const { offendingPiecePos, player } = this.pendingHuffAction;
    
    this.pushHistory();

    const burnedPiece = this.board[offendingPiecePos.r][offendingPiecePos.c];
    this.board[offendingPiecePos.r][offendingPiecePos.c] = null;

    if (player === PLAYER.RED) {
      this.capturedByPlayer2++;
      if (burnedPiece) this.graveyardP2.push(burnedPiece);
    } else {
      this.capturedByPlayer1++;
      if (burnedPiece) this.graveyardP1.push(burnedPiece);
    }

    this.pendingHuffAction = null;
    this.activePiecePos = null;
    this.switchTurn();
    this.checkGameOver();

    return {
      success: true,
      burnedPos: offendingPiecePos,
      burnedPiece
    };
  }

  /**
   * Huffing Resolution: Option B - Opponent insists that the player perform the jump!
   */
  resolveHuffByInsisting() {
    if (!this.pendingHuffAction) return null;
    const { preState } = this.pendingHuffAction;

    this.restoreState(preState);
    this.pendingHuffAction = null;

    return {
      success: true,
      message: 'Regular move canceled. You must make your mandatory capture!'
    };
  }

  switchTurn() {
    this.currentPlayer = this.currentPlayer === PLAYER.RED ? PLAYER.BLACK : PLAYER.RED;
    this.activePiecePos = null;
  }

  checkGameOver() {
    let hasPieces = false;
    let hasMoves = false;

    const allCaptures = this.getAllCapturesForPlayer(this.currentPlayer);
    if (allCaptures.length > 0) {
      hasPieces = true;
      hasMoves = true;
    } else {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = this.getPiece(r, c);
          if (piece && piece.player === this.currentPlayer) {
            hasPieces = true;
            if (this.getRegularMovesForPiece(r, c).length > 0) {
              hasMoves = true;
              break;
            }
          }
        }
        if (hasMoves) break;
      }
    }

    if (!hasPieces || !hasMoves) {
      this.gameOver = true;
      this.winner = this.currentPlayer === PLAYER.RED ? PLAYER.BLACK : PLAYER.RED;
      return true;
    }

    return false;
  }

  undo() {
    if (this.history.length === 0) return false;
    const prev = this.history.pop();
    this.restoreState(prev);
    return true;
  }
}


// Audio synthesizer using Web Audio API for responsive native sound effects
class SoundController {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playMove() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(140, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playCapture() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(540, this.ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playKing() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [440, 554, 659, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.07);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.07 + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + idx * 0.07);
      osc.stop(this.ctx.currentTime + idx * 0.07 + 0.15);
    });
  }

  playBurn() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    // White noise style burn burst
    const bufferSize = this.ctx.sampleRate * 0.25;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start();
    whiteNoise.stop(this.ctx.currentTime + 0.25);
  }

  playVictory() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.12);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + idx * 0.12);
      osc.stop(this.ctx.currentTime + idx * 0.12 + 0.35);
    });
  }
}

const sound = new SoundController();




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
class CheckersAI {
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






class CheckersApp {
  constructor() {
    this.game = new GameEngine();
    this.ai = new CheckersAI(PLAYER.BLACK, 8);

    // Game Mode State
    this.gameMode = 'pvp'; // 'pvp' | 'ai'
    this.humanColor = PLAYER.RED; // PLAYER.RED | PLAYER.BLACK
    this.aiColor = PLAYER.BLACK;
    this.aiThinking = false;

    this.selectedSquare = null; // { r, c }
    this.validMoves = []; // Array of destination moves for selected piece
    this.mustCaptureSquares = []; // Squares with pieces that must jump
    this.lastAIMove = null; // { from: {r, c}, to: {r, c} } highlight squares for AI move
    
    this.dom = {
      board: document.getElementById('checkers-board'),
      turnBanner: document.getElementById('turn-banner'),
      turnDot: document.getElementById('turn-dot'),
      turnText: document.getElementById('turn-text'),
      mustJumpTag: document.getElementById('must-jump-tag'),
      panelP1: document.getElementById('panel-player1'),
      panelP2: document.getElementById('panel-player2'),
      p1CapturedCount: document.getElementById('p1-captured-count'),
      p2CapturedCount: document.getElementById('p2-captured-count'),
      p1KingsCount: document.getElementById('p1-kings-count'),
      p2KingsCount: document.getElementById('p2-kings-count'),
      p1Graveyard: document.getElementById('p1-graveyard'),
      p2Graveyard: document.getElementById('p2-graveyard'),
      huffDecisionCard: document.getElementById('huff-decision-card'),
      huffTitle: document.getElementById('huff-title'),
      huffDesc: document.getElementById('huff-desc'),
      btnBurnPiece: document.getElementById('btn-burn-piece'),
      btnForceJump: document.getElementById('btn-force-jump'),
      latestLogText: document.getElementById('latest-log-text'),
      soundToggle: document.getElementById('sound-toggle'),
      undoBtn: document.getElementById('undo-btn'),
      resetBtn: document.getElementById('reset-btn'),
      rulesBtn: document.getElementById('rules-btn'),
      closeRulesBtn: document.getElementById('close-rules-btn'),
      rulesModal: document.getElementById('rules-modal'),
      gameoverModal: document.getElementById('gameover-modal'),
      winnerTitle: document.getElementById('winner-title'),
      winnerDesc: document.getElementById('winner-desc'),
      gameoverRestartBtn: document.getElementById('gameover-restart-btn'),
      // Mode Modal elements
      gameModeBtn: document.getElementById('game-mode-btn'),
      modeLabel: document.getElementById('mode-label'),
      modeModal: document.getElementById('mode-modal'),
      closeModeBtn: document.getElementById('close-mode-btn'),
      applyModeBtn: document.getElementById('apply-mode-btn'),
      aiConfigPanel: document.getElementById('ai-config-panel'),
      aiDifficultySelect: document.getElementById('ai-difficulty')
    };

    this.initEvents();
    this.render();
  }

  initEvents() {
    // Board square delegation
    this.dom.board.addEventListener('click', (e) => {
      // Ignore clicks if AI is thinking or game is over or huff is pending
      if (this.aiThinking || this.game.gameOver || this.game.pendingHuffAction) return;

      // In AI mode, prevent human from clicking when it's AI's turn
      if (this.gameMode === 'ai' && this.game.currentPlayer === this.aiColor) return;

      const squareEl = e.target.closest('.square');
      if (!squareEl) return;
      const r = parseInt(squareEl.dataset.row, 10);
      const c = parseInt(squareEl.dataset.col, 10);
      this.handleSquareClick(r, c);
    });

    // Huff action buttons
    this.dom.btnBurnPiece.addEventListener('click', () => {
      this.handleHuffBurn();
    });

    this.dom.btnForceJump.addEventListener('click', () => {
      this.handleHuffInsist();
    });

    // Sound toggle
    this.dom.soundToggle.addEventListener('change', (e) => {
      sound.enabled = e.target.checked;
    });

    // Undo button
    this.dom.undoBtn.addEventListener('click', () => {
      if (this.aiThinking) return;
      if (this.gameMode === 'ai') {
        // In AI mode, if human is playing and has history:
        // If human is currently in the middle of a multi-jump, undo single jump
        if (this.game.activePiecePos) {
          this.game.undo();
        } else {
          // Revert AI move, then revert human move (2 plies)
          const undone1 = this.game.undo();
          if (undone1 && this.game.currentPlayer !== this.humanColor) {
            this.game.undo();
          }
        }
      } else {
        this.game.undo();
      }
      this.selectedSquare = null;
      this.validMoves = [];
      this.lastAIMove = null;
      this.log('Move undone.');
      this.render();
    });

    // Reset button
    this.dom.resetBtn.addEventListener('click', () => {
      if (confirm('Start a new game? Current board state will be reset.')) {
        this.restartGame();
      }
    });

    this.dom.gameoverRestartBtn.addEventListener('click', () => {
      this.dom.gameoverModal.classList.add('hidden');
      this.restartGame();
    });

    // Rules modal
    this.dom.rulesBtn.addEventListener('click', () => {
      this.dom.rulesModal.classList.remove('hidden');
    });

    this.dom.closeRulesBtn.addEventListener('click', () => {
      this.dom.rulesModal.classList.add('hidden');
    });

    this.dom.rulesModal.addEventListener('click', (e) => {
      if (e.target === this.dom.rulesModal) {
        this.dom.rulesModal.classList.add('hidden');
      }
    });

    // Mode Selector Modal
    this.dom.gameModeBtn.addEventListener('click', () => {
      this.dom.modeModal.classList.remove('hidden');
    });

    this.dom.closeModeBtn.addEventListener('click', () => {
      this.dom.modeModal.classList.add('hidden');
    });

    this.dom.modeModal.addEventListener('click', (e) => {
      if (e.target === this.dom.modeModal) {
        this.dom.modeModal.classList.add('hidden');
      }
    });

    // Radio toggle between PvP and AI in modal
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value === 'ai') {
          this.dom.aiConfigPanel.classList.remove('hidden');
        } else {
          this.dom.aiConfigPanel.classList.add('hidden');
        }
      });
    });

    // Apply Mode button
    this.dom.applyModeBtn.addEventListener('click', () => {
      const selectedMode = document.querySelector('input[name="game-mode"]:checked').value;
      this.gameMode = selectedMode;

      if (selectedMode === 'ai') {
        const colorRadio = document.querySelector('input[name="player-color"]:checked').value;
        const depth = parseInt(this.dom.aiDifficultySelect.value, 10) || 8;
        
        if (colorRadio === 'red') {
          this.humanColor = PLAYER.RED;
          this.aiColor = PLAYER.BLACK;
        } else {
          this.humanColor = PLAYER.BLACK;
          this.aiColor = PLAYER.RED;
        }

        this.ai.setAIPlayer(this.aiColor, depth);
        this.dom.modeLabel.textContent = `vs AI (${colorRadio === 'red' ? 'You: Red' : 'You: Black'})`;
      } else {
        this.dom.modeLabel.textContent = 'PvP';
      }

      this.dom.modeModal.classList.add('hidden');
      this.restartGame();
    });
  }

  restartGame() {
    this.game.initBoard();
    this.selectedSquare = null;
    this.validMoves = [];
    this.lastAIMove = null;
    this.aiThinking = false;
    this.log(`New match started. ${this.gameMode === 'ai' ? 'Player vs AI' : 'Local PvP'}.`);
    this.render();

    // If in AI mode and AI plays as RED (moves first)
    if (this.gameMode === 'ai' && this.aiColor === PLAYER.RED) {
      setTimeout(() => this.triggerAIMove(), 600);
    }
  }

  log(msg) {
    this.dom.latestLogText.textContent = msg;
  }

  handleSquareClick(r, c) {
    const clickedPiece = this.game.getPiece(r, c);

    // If a piece is already selected and we click on a valid move target
    if (this.selectedSquare) {
      const targetMove = this.validMoves.find(m => m.to.r === r && m.to.c === c);

      if (targetMove) {
        this.executeMove(this.selectedSquare, { r, c });
        return;
      }

      // If clicked on the same selected square, deselect it (unless trapped in multi-jump)
      if (this.selectedSquare.r === r && this.selectedSquare.c === c) {
        if (!this.game.activePiecePos) {
          this.selectedSquare = null;
          this.validMoves = [];
          this.render();
        }
        return;
      }
    }

    // If trapped in a multi-jump chain, cannot switch pieces!
    if (this.game.activePiecePos) {
      if (this.game.activePiecePos.r !== r || this.game.activePiecePos.c !== c) {
        this.log('Must complete multi-jump with the active capturing piece!');
        return;
      }
    }

    // Select piece of current player
    if (clickedPiece && clickedPiece.player === this.game.currentPlayer) {
      this.selectedSquare = { r, c };
      // Allow regular moves alongside captures so player can choose, triggering huffing if missed
      this.validMoves = this.game.getValidMovesForPiece(r, c, false);
      this.render();
    } else {
      if (!this.game.activePiecePos) {
        this.selectedSquare = null;
        this.validMoves = [];
        this.render();
      }
    }
  }

  executeMove(from, to) {
    const res = this.game.makeMove(from, to, { allowHuffDetection: true });

    if (!res.success) {
      this.log(`⚠️ ${res.reason}`);
      return;
    }

    if (res.huffTriggered) {
      // Human missed mandatory capture!
      sound.playBurn();
      this.selectedSquare = null;
      this.validMoves = [];

      if (this.gameMode === 'ai' && this.game.currentPlayer === this.humanColor) {
        // AI is the opponent! AI strategically burns the piece
        this.log(`🔥 AI detected missed jump and huffs (burns) your piece!`);
        setTimeout(() => {
          this.handleHuffBurn();
        }, 800);
      } else {
        const opponentName = this.game.currentPlayer === PLAYER.RED ? 'Player 2 (Black)' : 'Player 1 (Red)';
        const playerName = this.game.currentPlayer === PLAYER.RED ? 'Player 1 (Red)' : 'Player 2 (Black)';

        this.log(`🔥 Huff alert! ${playerName} missed a mandatory jump!`);
        this.dom.huffTitle.textContent = `Missed Capture! (שריפת חייל)`;
        this.dom.huffDesc.textContent = `${playerName} made a regular move while a capture was possible. ${opponentName}, choose action:`;
        this.dom.huffDecisionCard.classList.remove('hidden');
      }

      this.render();
      return;
    }

    if (res.isJump) {
      sound.playCapture();
      if (res.promoted) {
        setTimeout(() => sound.playKing(), 150);
        this.log(`Piece crowned KING 👑 after capture!`);
      } else {
        this.log(`Captured enemy piece!`);
      }

      if (res.multiJumpAvailable) {
        this.selectedSquare = { ...to };
        this.validMoves = this.game.getCapturesForPiece(to.r, to.c);
        this.log(`Multi-jump in progress! Continue capturing.`);
        this.render();
        return;
      } else {
        this.selectedSquare = null;
        this.validMoves = [];
      }
    } else {
      sound.playMove();
      if (res.promoted) {
        sound.playKing();
        this.log(`Piece crowned KING 👑!`);
      } else {
        this.log(`Moved piece.`);
      }
      this.selectedSquare = null;
      this.validMoves = [];
    }

    this.render();
    this.checkWinner();

    // If playing against AI and now it's AI's turn
    if (!this.game.gameOver && this.gameMode === 'ai' && this.game.currentPlayer === this.aiColor) {
      this.triggerAIMove();
    }
  }

  triggerAIMove() {
    this.aiThinking = true;
    this.dom.turnText.textContent = `🤖 Computer is thinking...`;
    this.render();

    setTimeout(() => {
      if (this.game.gameOver) {
        this.aiThinking = false;
        return;
      }

      const bestMove = this.ai.getBestMove(this.game);
      if (!bestMove) {
        this.aiThinking = false;
        this.game.checkGameOver();
        this.checkWinner();
        return;
      }

      // Execute AI move
      this.lastAIMove = { from: { ...bestMove.from }, to: { ...bestMove.to } };
      const res = this.game.makeMove(bestMove.from, bestMove.to, { allowHuffDetection: false });
      
      if (res.isJump) {
        sound.playCapture();
        if (res.promoted) {
          setTimeout(() => sound.playKing(), 150);
          this.log(`🤖 AI captured piece and crowned KING 👑!`);
        } else {
          this.log(`🤖 AI captured piece!`);
        }

        // Handle AI multi-jump chain
        if (res.multiJumpAvailable) {
          this.render();
          setTimeout(() => {
            this.handleAIMultiJump(res.to);
          }, 450);
          return;
        }
      } else {
        sound.playMove();
        if (res.promoted) {
          sound.playKing();
          this.log(`🤖 AI moved and crowned KING 👑!`);
        } else {
          this.log(`🤖 AI moved piece.`);
        }
      }

      this.aiThinking = false;
      this.render();
      this.checkWinner();
    }, 450);
  }

  handleAIMultiJump(pos) {
    const furtherCaptures = this.game.getCapturesForPiece(pos.r, pos.c);
    if (furtherCaptures.length > 0) {
      const nextJump = furtherCaptures[0];
      if (this.lastAIMove) {
        this.lastAIMove.to = { ...nextJump.to };
      }
      const res = this.game.makeMove(pos, nextJump.to, { allowHuffDetection: false });
      sound.playCapture();

      if (res.multiJumpAvailable) {
        this.render();
        setTimeout(() => this.handleAIMultiJump(res.to), 450);
      } else {
        this.aiThinking = false;
        this.render();
        this.checkWinner();
      }
    } else {
      this.game.activePiecePos = null;
      this.game.switchTurn();
      this.aiThinking = false;
      this.render();
      this.checkWinner();
    }
  }

  handleHuffBurn() {
    const res = this.game.resolveHuffByBurning();
    if (res && res.success) {
      sound.playBurn();
      const burnedBy = this.game.currentPlayer === PLAYER.RED ? 'Player 1' : 'Player 2';
      this.log(`🔥 Piece burned and removed from board! Turn transferred.`);
      this.dom.huffDecisionCard.classList.add('hidden');
      this.render();
      this.checkWinner();

      // Check if turn now belongs to AI
      if (!this.game.gameOver && this.gameMode === 'ai' && this.game.currentPlayer === this.aiColor) {
        this.triggerAIMove();
      }
    }
  }

  handleHuffInsist() {
    const res = this.game.resolveHuffByInsisting();
    if (res && res.success) {
      sound.playMove();
      this.log(`⚡ Opponent insisted on the mandatory jump! Move reverted.`);
      this.dom.huffDecisionCard.classList.add('hidden');
      this.render();
    }
  }

  checkWinner() {
    if (this.game.gameOver && this.game.winner) {
      sound.playVictory();
      let winnerName = '';
      if (this.gameMode === 'ai') {
        winnerName = this.game.winner === this.humanColor ? '🏆 You Win!' : '🤖 Computer Wins!';
      } else {
        winnerName = this.game.winner === PLAYER.RED ? 'Player 1 (Red / White) Wins!' : 'Player 2 (Black) Wins!';
      }
      this.dom.winnerTitle.textContent = winnerName;
      this.dom.winnerDesc.textContent = `All opposing pieces were eliminated or blocked from moving.`;
      this.dom.gameoverModal.classList.remove('hidden');
    }
  }

  render() {
    // 1. Render Status Banner & Active Player
    const isRed = this.game.currentPlayer === PLAYER.RED;
    this.dom.turnDot.className = `turn-indicator-dot ${isRed ? '' : 'black-turn'}`;

    if (this.aiThinking) {
      this.dom.turnText.textContent = `🤖 Computer is thinking...`;
    } else if (this.gameMode === 'ai') {
      const isHumanTurn = this.game.currentPlayer === this.humanColor;
      this.dom.turnText.textContent = isHumanTurn ? `Your Turn (${this.humanColor === PLAYER.RED ? 'Red' : 'Black'})` : `Computer's Turn`;
    } else {
      this.dom.turnText.textContent = isRed ? "Player 1's Turn (Red / White)" : "Player 2's Turn (Black)";
    }

    if (isRed) {
      this.dom.panelP1.classList.add('active-turn');
      this.dom.panelP2.classList.remove('active-turn');
    } else {
      this.dom.panelP2.classList.add('active-turn');
      this.dom.panelP1.classList.remove('active-turn');
    }

    // Update panel labels if AI mode
    const p1Tag = this.dom.panelP1.querySelector('.player-tag');
    const p2Tag = this.dom.panelP2.querySelector('.player-tag');
    if (this.gameMode === 'ai') {
      p1Tag.textContent = this.humanColor === PLAYER.RED ? 'You (Human)' : 'AI (Computer)';
      p2Tag.textContent = this.humanColor === PLAYER.BLACK ? 'You (Human)' : 'AI (Computer)';
    } else {
      p1Tag.textContent = 'Player 1';
      p2Tag.textContent = 'Player 2';
    }

    // 2. Mandatory Jump detection
    const boardCaptures = this.game.getAllCapturesForPlayer(this.game.currentPlayer);
    this.mustCaptureSquares = this.game.getPiecesWithCaptures(this.game.currentPlayer);

    if (boardCaptures.length > 0 && !this.game.pendingHuffAction && !this.aiThinking) {
      this.dom.mustJumpTag.classList.remove('hidden');
    } else {
      this.dom.mustJumpTag.classList.add('hidden');
    }

    // 3. Stats & Kings counting
    let p1Kings = 0;
    let p2Kings = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.game.getPiece(r, c);
        if (p) {
          if (p.isKing) {
            if (p.player === PLAYER.RED) p1Kings++;
            else p2Kings++;
          }
        }
      }
    }

    this.dom.p1CapturedCount.textContent = this.game.capturedByPlayer1;
    this.dom.p2CapturedCount.textContent = this.game.capturedByPlayer2;
    this.dom.p1KingsCount.textContent = p1Kings;
    this.dom.p2KingsCount.textContent = p2Kings;

    // 4. Render Graveyards
    this.renderGraveyard(this.dom.p1Graveyard, this.game.graveyardP1);
    this.renderGraveyard(this.dom.p2Graveyard, this.game.graveyardP2);

    // 5. Render 8x8 Board
    this.renderBoard();

    // 6. Undo button state
    this.dom.undoBtn.disabled = this.game.history.length === 0 || !!this.game.pendingHuffAction || this.aiThinking;
  }

  renderGraveyard(container, pieces) {
    container.innerHTML = '';
    pieces.forEach(p => {
      const div = document.createElement('div');
      div.className = `grave-piece ${p.player === PLAYER.RED ? 'red' : 'black'}`;
      if (p.isKing) {
        div.textContent = '👑';
        div.style.fontSize = '12px';
        div.style.textAlign = 'center';
        div.style.lineHeight = '22px';
      }
      container.appendChild(div);
    });
  }

  renderBoard() {
    this.dom.board.innerHTML = '';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 1;
        const squareDiv = document.createElement('div');
        squareDiv.className = `square ${isDark ? 'dark' : 'light'}`;
        squareDiv.dataset.row = r;
        squareDiv.dataset.col = c;

        if (this.selectedSquare && this.selectedSquare.r === r && this.selectedSquare.c === c) {
          squareDiv.classList.add('selected');
        }

        if (this.lastAIMove) {
          if (this.lastAIMove.from.r === r && this.lastAIMove.from.c === c) {
            squareDiv.classList.add('last-move-from');
          }
          if (this.lastAIMove.to.r === r && this.lastAIMove.to.c === c) {
            squareDiv.classList.add('last-move-to');
          }
        }

        const isCaptureOrigin = this.mustCaptureSquares.some(pos => pos.r === r && pos.c === c);
        if (isCaptureOrigin && !this.selectedSquare) {
          squareDiv.classList.add('must-capture-origin');
        }

        const moveTarget = this.validMoves.find(m => m.to.r === r && m.to.c === c);
        if (moveTarget) {
          if (moveTarget.isJump) {
            squareDiv.classList.add('valid-jump');
          } else {
            squareDiv.classList.add('valid-move');
          }
        }

        const piece = this.game.getPiece(r, c);
        if (piece) {
          const pieceDiv = document.createElement('div');
          pieceDiv.className = `piece ${piece.player === PLAYER.RED ? 'red' : 'black'}`;
          if (piece.isKing) {
            pieceDiv.classList.add('king');
          }

          if (this.game.pendingHuffAction &&
              this.game.pendingHuffAction.offendingPiecePos.r === r &&
              this.game.pendingHuffAction.offendingPiecePos.c === c) {
            pieceDiv.style.outline = '3px dashed #ea580c';
            pieceDiv.style.filter = 'drop-shadow(0 0 10px #ea580c)';
          }

          squareDiv.appendChild(pieceDiv);
        }

        this.dom.board.appendChild(squareDiv);
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.checkersApp = new CheckersApp();
});
