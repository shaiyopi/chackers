import { GameEngine, PLAYER } from './game.js';
import { CheckersAI } from './ai.js';
import { sound } from './sound.js';

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
