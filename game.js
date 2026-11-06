/**
 * Constants & Types for the Game
 */
export const PLAYER = {
  NONE: 0,
  RED: 1,    // Player 1 (Starts at rows 0,1,2 - moving down towards row 7)
  BLACK: 2   // Player 2 (Starts at rows 5,6,7 - moving up towards row 0)
};

export const DIRECTIONS = [
  { r: -1, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 1 }
];

export class Piece {
  constructor(player, isKing = false, id = null) {
    this.player = player;
    this.isKing = isKing;
    this.id = id || `p_${player}_${Math.random().toString(36).substring(2, 9)}`;
  }

  clone() {
    return new Piece(this.player, this.isKing, this.id);
  }
}

export class GameEngine {
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
