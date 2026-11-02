import { PLAYER, DIRECTIONS } from './game.js';
import { CheckersAI } from './ai.js';

export function runTests(GameEngine) {
  const results = [];
  function assert(condition, name) {
    if (condition) {
      results.push(`✅ PASS: ${name}`);
    } else {
      results.push(`❌ FAIL: ${name}`);
      console.error(`Test failed: ${name}`);
    }
  }

  // Test 1: Board Setup
  const g1 = new GameEngine();
  let redCount = 0;
  let blackCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = g1.getPiece(r, c);
      if (p) {
        if (p.player === PLAYER.RED) redCount++;
        if (p.player === PLAYER.BLACK) blackCount++;
      }
    }
  }
  assert(redCount === 12 && blackCount === 12, '12 pieces for each player on setup');

  // Test 2: Backward jump for regular piece
  const g2 = new GameEngine();
  g2.board = Array(8).fill(null).map(() => Array(8).fill(null));
  g2.board[4][4] = { player: PLAYER.RED, isKing: false };
  g2.board[3][3] = { player: PLAYER.BLACK, isKing: false };
  g2.currentPlayer = PLAYER.RED;

  const caps = g2.getCapturesForPiece(4, 4);
  const backwardJump = caps.find(c => c.to.r === 2 && c.to.c === 2);
  assert(backwardJump !== undefined, 'Regular piece can capture BACKWARD diagonally');

  // Test 3: Flying King Movement & Capture across distance
  const g3 = new GameEngine();
  g3.board = Array(8).fill(null).map(() => Array(8).fill(null));
  g3.board[1][1] = { player: PLAYER.RED, isKing: true };
  g3.board[4][4] = { player: PLAYER.BLACK, isKing: false };
  g3.currentPlayer = PLAYER.RED;

  const kingCaps = g3.getCapturesForPiece(1, 1);
  const landsOn55 = kingCaps.some(c => c.to.r === 5 && c.to.c === 5);
  const landsOn66 = kingCaps.some(c => c.to.r === 6 && c.to.c === 6);
  const landsOn77 = kingCaps.some(c => c.to.r === 7 && c.to.c === 7);
  assert(landsOn55 && landsOn66 && landsOn77, 'Flying King can jump across diagonal and land on any vacant square beyond');

  // Test 4: Mandatory Capture & Huffing trigger
  const g4 = new GameEngine();
  g4.board = Array(8).fill(null).map(() => Array(8).fill(null));
  g4.board[2][2] = { player: PLAYER.RED, isKing: false };
  g4.board[3][3] = { player: PLAYER.BLACK, isKing: false };
  g4.board[2][0] = { player: PLAYER.RED, isKing: false };
  g4.currentPlayer = PLAYER.RED;

  const moveRes = g4.makeMove({ r: 2, c: 0 }, { r: 3, c: 1 });
  assert(moveRes.success && moveRes.huffTriggered, 'Huffing triggered when ignoring mandatory jump');
  assert(g4.pendingHuffAction !== null, 'pendingHuffAction correctly populated');

  // Test 4a: Huff Burn
  const burnRes = g4.resolveHuffByBurning();
  assert(burnRes.success && g4.board[3][1] === null, 'Burning piece removes the offending piece from board');

  // Test 5: Insist on Jump
  const g5 = new GameEngine();
  g5.board = Array(8).fill(null).map(() => Array(8).fill(null));
  g5.board[2][2] = { player: PLAYER.RED, isKing: false };
  g5.board[3][3] = { player: PLAYER.BLACK, isKing: false };
  g5.board[2][0] = { player: PLAYER.RED, isKing: false };
  g5.currentPlayer = PLAYER.RED;

  g5.makeMove({ r: 2, c: 0 }, { r: 3, c: 1 });
  const insistRes = g5.resolveHuffByInsisting();
  assert(insistRes.success && g5.board[2][0] !== null && g5.board[3][1] === null, 'Insist rolls back the regular move');

  // Test 6: Mandatory Multi-Jump & Maximum Capture Sequence
  const g6 = new GameEngine();
  g6.board = Array(8).fill(null).map(() => Array(8).fill(null));
  // Piece A can capture 1 piece: at (2, 2) jumps over (3, 3) to (4, 4)
  // Piece B at (2, 0) can jump over (3, 1) to (4, 2) and then jump over (5, 3) to (6, 4) [Multi-jump of 2 pieces!]
  g6.board[2][2] = { player: PLAYER.RED, isKing: false };
  g6.board[3][3] = { player: PLAYER.BLACK, isKing: false };

  g6.board[2][0] = { player: PLAYER.RED, isKing: false };
  g6.board[3][1] = { player: PLAYER.BLACK, isKing: false };
  g6.board[5][3] = { player: PLAYER.BLACK, isKing: false };
  g6.currentPlayer = PLAYER.RED;

  const maxSeqs = g6.getMaxCaptureSequencesForPlayer(PLAYER.RED);
  assert(maxSeqs.length > 0 && maxSeqs[0].totalCaptures === 2, 'Max-captures rule enforces 2-piece multi-jump over 1-piece jump');
  assert(maxSeqs[0].steps[0].from.r === 2 && maxSeqs[0].steps[0].from.c === 0, 'Origin square corresponds to the maximum capture sequence');

  // Test 7: Flying King Multi-Directional Capture Chain
  const g7 = new GameEngine();
  g7.board = Array(8).fill(null).map(() => Array(8).fill(null));
  // Flying King at (7, 1) jumps over (4, 4) to land at (3, 5), then turns and jumps over (4, 6) to land at (5, 7)
  g7.board[7][1] = { player: PLAYER.BLACK, isKing: true };
  g7.board[4][4] = { player: PLAYER.RED, isKing: false };
  g7.board[4][6] = { player: PLAYER.RED, isKing: false };
  g7.currentPlayer = PLAYER.BLACK;

  const kingSeqs = g7.findCaptureSequences(7, 1);
  const multiKingChain = kingSeqs.find(s => s.totalCaptures === 2);
  assert(multiKingChain !== undefined, 'Flying King can turn corners across diagonals in a multi-directional capture chain');

  // Test 8: Master AI Choosing Max Capture Chain
  const ai = new CheckersAI(PLAYER.BLACK, 8);
  const bestActionMove = ai.getBestMove(g7);
  assert(bestActionMove !== null && bestActionMove.isJump === true, 'Master AI selects flying king multi-jump initiation');

  console.log('Automated Tests Summary:\n' + results.join('\n'));
  return results;
}
