/** PostgreSQL lifecycle. Bucket locks serialize matching; wallet rows serialize money. */
const LEASE_SECONDS = 120;
const MATCH_WAIT_SECONDS = 15 * 60;
const MAX_SCORE = 1000000000;
const MAX_AMOUNT_CENTS = 100000000000;
const MIN_BET_CENTS = 100;
const MAX_BET_CENTS = 2000;
const MAX_DEMO_CREDIT_CENTS = 99999900;
const SUPPORTED_GAME_IDS = new Set(['jungleSwing']);

class GameError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireGameId(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new GameError('invalid-argument', 'gameId must be 1-120 characters.');
  }
  return value.trim();
}
function requireId(value) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(value)) || BigInt(value) > 9223372036854775807n) {
    throw new GameError('invalid-argument', 'A valid betId is required.');
  }
  return String(value);
}
function requireRequestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new GameError('invalid-argument', 'A unique requestId (16-128 letters, numbers, hyphens or underscores) is required.');
  }
  return value;
}
function requireScore(value, optional = true) {
  if (value == null && optional) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SCORE) {
    throw new GameError('invalid-argument', `score must be an integer from 0 to ${MAX_SCORE}.`);
  }
  return value;
}
const nullableNumber = (value) => value == null ? null : Number(value);
const toWallet = (row) => ({ balanceCents: Number(row.balance_cents), currency: 'USD', mode: 'demo' });
function toBet(row) {
  return {
    id: String(row.id), gameId: row.game_id, amountCents: Number(row.amount_cents),
    status: row.status, playStatus: row.play_status, score: nullableNumber(row.score),
    resultId: row.result_id == null ? null : String(row.result_id),
    startedAt: row.started_at, finishedAt: row.finished_at, leaseExpiresAt: row.lease_expires_at,
    finishReason: row.finish_reason, createdAt: row.created_at, updatedAt: row.updated_at, matchedAt: row.matched_at,
  };
}
const OWN_RESULT_SQL = `SELECT b.*, r.status AS result_status, r.settled_at,
    r.gross_pool_cents, r.match_fee_cents AS total_match_fee_cents,
    opponent.score AS opponent_score, opponent.play_status AS opponent_play_status,
    e.outcome AS earning_outcome, e.gross_amount_cents, e.created_at AS earning_created_at,
    e.match_fee_cents AS own_match_fee_cents, e.net_amount_cents,
    (SELECT amount_cents FROM wallet_entries w WHERE w.bet_id = b.id AND w.kind IN ('payout', 'refund')) AS wallet_credit_cents
  FROM bets b LEFT JOIN results r ON r.id = b.result_id
  LEFT JOIN bets opponent ON r.status = 'settled' AND opponent.id = CASE
    WHEN r.user1_bet_id = b.id THEN r.user2_bet_id
    WHEN r.user2_bet_id = b.id THEN r.user1_bet_id
    ELSE NULL END
  LEFT JOIN game_earnings e ON e.bet_id = b.id`;
function toOwnResult(row) {
  const matchStatus = row.status === 'cancelled' ? 'cancelled' : row.result_status || 'unmatched';
  const unmatchedClosure = matchStatus === 'cancelled' && row.result_id == null;
  let outcome = row.earning_outcome;
  if (!outcome) {
    if (matchStatus === 'cancelled') outcome = 'cancelled';
    else if (row.play_status === 'forfeited') outcome = 'forfeited';
    else if (row.play_status === 'playing') outcome = 'playing';
    else outcome = matchStatus === 'unmatched' ? 'waiting_for_match' : 'waiting_for_opponent';
  }
  return {
    betId: String(row.id), matchId: row.result_id == null ? null : String(row.result_id),
    gameId: row.game_id, amountCents: Number(row.amount_cents), score: nullableNumber(row.score),
    opponentScore: matchStatus === 'settled' ? nullableNumber(row.opponent_score) : null,
    opponentPlayStatus: matchStatus === 'settled' && ['completed', 'forfeited'].includes(row.opponent_play_status)
      ? row.opponent_play_status : null,
    playStatus: row.play_status, finishReason: row.finish_reason, matchStatus, outcome,
    grossAmountCents: Number(row.gross_amount_cents || 0), matchFeeCents: Number(row.own_match_fee_cents || 0),
    netAmountCents: Number(row.net_amount_cents || 0),
    walletCreditCents: Number(row.wallet_credit_cents || 0), isLegacy: row.request_id == null,
    totalPoolCents: unmatchedClosure ? 0 : Number(row.gross_pool_cents || Number(row.amount_cents) * 2),
    totalMatchFeeCents: Number(row.total_match_fee_cents || 0), matchFeePercent: unmatchedClosure ? 0 : 10,
    createdAt: row.created_at, settledAt: row.settled_at || row.earning_created_at || null,
  };
}

/** Integer-only fee on combined pool; ties and double forfeits refund each stake. */
function calculateSettlement(first, second) {
  const stake = BigInt(first.amount_cents);
  if (stake !== BigInt(second.amount_cents)) throw new Error('Matched stakes differ.');
  const a = first.play_status === 'completed';
  const b = second.play_status === 'completed';
  const refund = (!a && !b) || (a && b && BigInt(first.score) === BigInt(second.score));
  const pool = stake * 2n;
  if (refund) {
    const kind = a ? 'tie' : 'double_forfeit';
    return { kind, pool: Number(pool), fee: 0, winnerBetId: null,
      earnings: [first, second].map((bet) => ({ bet, outcome: a ? 'tie' : 'refunded',
        gross: Number(stake), fee: 0, net: Number(stake) })) };
  }
  const firstWins = a && (!b || BigInt(first.score) > BigInt(second.score));
  const fee = (pool + 5n) / 10n;
  return { kind: 'win', pool: Number(pool), fee: Number(fee),
    winnerBetId: String(firstWins ? first.id : second.id),
    earnings: [first, second].map((bet, index) => {
      const won = firstWins === (index === 0);
      return { bet, outcome: won ? 'won' : 'lost', gross: won ? Number(pool) : 0,
        fee: won ? Number(fee) : 0, net: won ? Number(pool - fee) : 0 };
    }) };
}

function createGameService(db) {
  const lockBucket = (client, gameId, amount) => client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 1))', [JSON.stringify([gameId, String(amount)])]);
  const lockUser = (client, uid) => client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 2))', [uid]);

  async function ensureUser(client, uid) {
    const user = await client.query('SELECT 1 FROM users WHERE firebase_uid = $1', [uid]);
    if (!user.rowCount) throw new GameError('failed-precondition', 'User profile is missing. Call onUserLogin first.');
  }
  async function lockWallet(client, uid) {
    await client.query('INSERT INTO wallets (firebase_uid) VALUES ($1) ON CONFLICT DO NOTHING', [uid]);
    return (await client.query('SELECT * FROM wallets WHERE firebase_uid = $1 FOR UPDATE', [uid])).rows[0];
  }
  async function changeWallet(client, uid, amount, kind, key, betId = null, matchId = null) {
    const wallet = await lockWallet(client, uid);
    const next = BigInt(wallet.balance_cents) + BigInt(amount);
    if (next < 0n) throw new GameError('failed-precondition', 'Insufficient demo balance. Add demo credits before playing.');
    if (next > BigInt(Number.MAX_SAFE_INTEGER)) throw new GameError('resource-exhausted', 'Wallet balance limit reached.');
    await client.query(`INSERT INTO wallet_entries
        (firebase_uid, kind, idempotency_key, amount_cents, balance_after_cents, bet_id, match_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [uid, kind, key, amount, String(next), betId, matchId]);
    const updated = await client.query('UPDATE wallets SET balance_cents = $2, updated_at = now() WHERE firebase_uid = $1 RETURNING *', [uid, String(next)]);
    return toWallet(updated.rows[0]);
  }
  async function ownResult(client, betId, uid) {
    const found = await client.query(`${OWN_RESULT_SQL} WHERE b.id = $1 AND b.firebase_uid = $2`, [betId, uid]);
    if (!found.rowCount) throw new GameError('not-found', 'Game attempt not found.');
    return { bet: toBet(found.rows[0]), result: toOwnResult(found.rows[0]) };
  }
  // Caller holds the matching bucket and bet row locks. The deadline is checked
  // against the database clock after those locks, never a client timestamp.
  async function closeUnmatchedBet(client, bet) {
    if (bet.status !== 'pending' || bet.result_id != null || !bet.match_expired) return false;
    await client.query(`UPDATE bets SET status = 'cancelled', updated_at = clock_timestamp(),
        play_status = CASE WHEN play_status = 'playing' THEN 'forfeited' ELSE play_status END,
        finish_reason = CASE WHEN play_status = 'playing' THEN 'match_timeout' ELSE finish_reason END,
        finished_at = CASE WHEN play_status = 'playing' THEN clock_timestamp() ELSE finished_at END,
        lease_expires_at = NULL WHERE id = $1`, [bet.id]);
    // Legacy attempts without a server debit must not create wallet money.
    const refund = Number(bet.wallet_debited_cents);
    if (refund > 0) {
      await client.query(`INSERT INTO game_earnings
          (match_id, bet_id, firebase_uid, outcome, gross_amount_cents, match_fee_cents, net_amount_cents)
        VALUES (NULL, $1, $2, 'refunded', $3, 0, $3)`, [bet.id, bet.firebase_uid, refund]);
      await changeWallet(client, bet.firebase_uid, refund, 'refund', `unmatched-refund:${bet.id}`, bet.id);
    }
    return true;
  }
  async function finalizeUnmatchedGames(uid = null, limit = 100) {
    const candidates = await db.query(`SELECT id, game_id, amount_cents FROM bets
        WHERE status = 'pending' AND result_id IS NULL
          AND created_at <= now() - $2 * interval '1 second'
          AND ($1::text IS NULL OR firebase_uid = $1)
        ORDER BY created_at, id LIMIT $3`, [uid, MATCH_WAIT_SECONDS, limit]);
    let closedCount = 0;
    for (const candidate of candidates.rows) {
      const closed = await db.transaction(async (client) => {
        await lockBucket(client, candidate.game_id, candidate.amount_cents);
        const found = await client.query(`SELECT *,
            created_at <= clock_timestamp() - $2 * interval '1 second' AS match_expired
          FROM bets WHERE id = $1 FOR UPDATE`, [candidate.id, MATCH_WAIT_SECONDS]);
        return found.rowCount ? closeUnmatchedBet(client, found.rows[0]) : false;
      });
      if (closed) closedCount++;
    }
    return closedCount;
  }
  async function settle(client, resultId) {
    if (!resultId) return;
    const result = await client.query('SELECT * FROM results WHERE id = $1 FOR UPDATE', [resultId]);
    if (!result.rowCount || result.rows[0].status !== 'matched') return;
    const match = result.rows[0];
    const bets = await client.query('SELECT * FROM bets WHERE id IN ($1, $2) ORDER BY id FOR UPDATE', [match.user1_bet_id, match.user2_bet_id]);
    if (bets.rowCount !== 2 || bets.rows.some((bet) => bet.play_status === 'playing')) return;
    const first = bets.rows.find((bet) => String(bet.id) === String(match.user1_bet_id));
    const second = bets.rows.find((bet) => String(bet.id) === String(match.user2_bet_id));
    const decision = calculateSettlement(first, second);
    // Global wallet lock order prevents different matches settling the same users deadlocking.
    for (const uid of [first.firebase_uid, second.firebase_uid].sort()) await lockWallet(client, uid);
    for (const earning of decision.earnings) {
      await client.query(`INSERT INTO game_earnings
          (match_id, bet_id, firebase_uid, outcome, gross_amount_cents, match_fee_cents, net_amount_cents)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [resultId, earning.bet.id, earning.bet.firebase_uid, earning.outcome, earning.gross, earning.fee, earning.net]);
      // Legacy attempts had no trusted entry debit and must never mint wallet money.
      if (earning.net > 0 && Number(earning.bet.wallet_debited_cents) > 0) {
        await changeWallet(client, earning.bet.firebase_uid, earning.net,
          earning.outcome === 'won' ? 'payout' : 'refund', `settlement:${earning.bet.id}`,
          earning.bet.id, resultId);
      }
    }
    await client.query(`UPDATE results SET status = 'settled', settled_at = now(), updated_at = now(),
        gross_pool_cents = $2, match_fee_cents = $3, settlement_kind = $4, winner_bet_id = $5,
        user1_win_amount_cents = $6, user2_win_amount_cents = $7 WHERE id = $1`,
    [resultId, decision.pool, decision.fee, decision.kind, decision.winnerBetId,
      decision.earnings[0].net, decision.earnings[1].net]);
  }

  async function getMyWallet(uid) {
    await finalizeUnmatchedGames(uid);
    return db.transaction(async (client) => { await ensureUser(client, uid); return toWallet(await lockWallet(client, uid)); });
  }
  async function addDemoMoney(uid, data = {}) {
    const requestId = requireRequestId(data.requestId);
    const amount = data.amountCents;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_DEMO_CREDIT_CENTS) {
      throw new GameError('invalid-argument', `Demo credit must be 1-${MAX_DEMO_CREDIT_CENTS} cents.`);
    }
    return db.transaction(async (client) => {
      await lockUser(client, uid);
      await ensureUser(client, uid);
      const wallet = await lockWallet(client, uid);
      const previous = await client.query('SELECT amount_cents FROM wallet_entries WHERE firebase_uid = $1 AND idempotency_key = $2', [uid, `demo:${requestId}`]);
      if (previous.rowCount) {
        if (Number(previous.rows[0].amount_cents) !== amount) throw new GameError('already-exists', 'requestId has already been used for a different credit.');
        return toWallet(wallet);
      }
      if (BigInt(wallet.balance_cents) + BigInt(amount) > BigInt(MAX_DEMO_CREDIT_CENTS)) {
        throw new GameError('failed-precondition', 'Demo top-ups cannot increase your balance above $999,999.');
      }
      return changeWallet(client, uid, amount, 'demo_credit', `demo:${requestId}`);
    });
  }
  async function withdrawMoney(uid, data = {}) {
    const requestId = requireRequestId(data.requestId);
    const amount = data.amountCents;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new GameError('invalid-argument', 'Withdrawal amount must be a positive whole number of cents (at least $0.01).');
    }
    return db.transaction(async (client) => {
      await lockUser(client, uid);
      await ensureUser(client, uid);
      const wallet = await lockWallet(client, uid);
      const previous = await client.query('SELECT amount_cents FROM wallet_entries WHERE firebase_uid = $1 AND idempotency_key = $2', [uid, `withdrawal:${requestId}`]);
      // Recover a confirmed debit before checking funds: a lost-response retry may
      // now exceed the remaining balance, but must still return its receipt.
      if (previous.rowCount) {
        if (Number(previous.rows[0].amount_cents) !== -amount) throw new GameError('already-exists', 'requestId has already been used for a different withdrawal.');
        return toWallet(wallet);
      }
      if (BigInt(wallet.balance_cents) < BigInt(amount)) {
        throw new GameError('failed-precondition', 'Insufficient demo balance for this withdrawal.');
      }
      // Demo credits are removed from the server wallet. No cash payout is made.
      return changeWallet(client, uid, -amount, 'demo_withdrawal', `withdrawal:${requestId}`);
    });
  }
  async function placeBet(uid, data = {}) {
    const gameId = requireGameId(data.gameId);
    if (!SUPPORTED_GAME_IDS.has(gameId)) throw new GameError('invalid-argument', 'This game is not available for new matches.');
    const amount = data.amountCents;
    const requestId = requireRequestId(data.requestId);
    if (!Number.isSafeInteger(amount) || amount < MIN_BET_CENTS || amount > MAX_BET_CENTS || amount % 100 !== 0) {
      throw new GameError('invalid-argument', 'Bet amount must be a whole dollar between $1 and $20.');
    }
    // Refund the caller's old entries before reserving funds for a new attempt.
    // Each closure commits separately to preserve bucket -> bet -> wallet lock order.
    await finalizeUnmatchedGames(uid);
    return db.transaction(async (client) => {
      await lockUser(client, uid);
      const previous = await client.query('SELECT * FROM bets WHERE firebase_uid = $1 AND request_id = $2', [uid, requestId]);
      if (previous.rowCount) {
        const old = previous.rows[0];
        if (old.game_id !== gameId || Number(old.amount_cents) !== amount) throw new GameError('already-exists', 'requestId has already been used for a different bet.');
        // A retry may recover the receipt, never permission to launch the consumed attempt.
        return { canStart: false, ...(await ownResult(client, old.id, uid)), wallet: toWallet(await lockWallet(client, uid)) };
      }
      const cancelled = await client.query('SELECT 1 FROM cancelled_game_requests WHERE firebase_uid = $1 AND request_id = $2', [uid, requestId]);
      if (cancelled.rowCount) throw new GameError('failed-precondition', 'This reservation was cancelled during recovery and cannot be started.');
      await ensureUser(client, uid);
      const active = await client.query("SELECT id FROM bets WHERE firebase_uid = $1 AND play_status = 'playing'", [uid]);
      if (active.rowCount) throw new GameError('failed-precondition', 'Your previous game is still active. It cannot be replayed.');
      await lockBucket(client, gameId, amount);
      const inserted = await client.query(`INSERT INTO bets
          (firebase_uid, game_id, amount_cents, request_id, play_status, started_at, lease_expires_at, wallet_debited_cents)
        VALUES ($1, $2, $3, $4, 'playing', now(), now() + interval '120 seconds', $3) RETURNING *`, [uid, gameId, amount, requestId]);
      const bet = inserted.rows[0];
      const wallet = await changeWallet(client, uid, -amount, 'entry', `entry:${bet.id}`, bet.id);
      const opponent = await client.query(`SELECT * FROM bets
          WHERE game_id = $1 AND amount_cents = $2 AND status = 'pending'
            AND firebase_uid <> $3 AND request_id IS NOT NULL
            AND result_id IS NULL AND created_at > clock_timestamp() - $4 * interval '1 second'
          ORDER BY created_at, id LIMIT 1 FOR UPDATE`, [gameId, amount, uid, MATCH_WAIT_SECONDS]);
      if (opponent.rowCount) {
        const other = opponent.rows[0];
        const result = await client.query(`INSERT INTO results
            (game_id, bet_amount_cents, user1_firebase_uid, user2_firebase_uid, user1_bet_id, user2_bet_id, gross_pool_cents)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [gameId, amount, other.firebase_uid, uid, other.id, bet.id, amount * 2]);
        await client.query(`UPDATE bets SET status = 'matched', result_id = $1,
            matched_at = now(), updated_at = now() WHERE id IN ($2, $3)`, [result.rows[0].id, other.id, bet.id]);
      }
      return { canStart: true, ...(await ownResult(client, bet.id, uid)), wallet };
    });
  }
  async function recoverGameReservation(uid, data = {}) {
    const gameId = requireGameId(data.gameId);
    const requestId = requireRequestId(data.requestId);
    const amount = data.amountCents;
    // Recovery must still resolve entries created before the whole-dollar $1–$20 rule.
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT_CENTS) {
      throw new GameError('invalid-argument', 'amountCents must be a positive integer within the allowed limit.');
    }
    return db.transaction(async (client) => {
      await lockUser(client, uid);
      await ensureUser(client, uid);
      const previous = await client.query('SELECT * FROM bets WHERE firebase_uid = $1 AND request_id = $2', [uid, requestId]);
      if (previous.rowCount) {
        const bet = previous.rows[0];
        if (bet.game_id !== gameId || Number(bet.amount_cents) !== amount) {
          throw new GameError('already-exists', 'requestId has already been used for a different bet.');
        }
        return { bet: toBet(bet) };
      }
      await client.query(`INSERT INTO cancelled_game_requests (firebase_uid, request_id, game_id, amount_cents)
        VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [uid, requestId, gameId, amount]);
      return { bet: null };
    });
  }
  async function updateAttempt(uid, data = {}, finish = false) {
    const betId = requireId(data.betId);
    const score = requireScore(data.score);
    if (finish && !['completed', 'forfeited'].includes(data.reason)) throw new GameError('invalid-argument', 'reason must be completed or forfeited.');
    return db.transaction(async (client) => {
      const initial = await client.query('SELECT game_id, amount_cents FROM bets WHERE id = $1 AND firebase_uid = $2', [betId, uid]);
      if (!initial.rowCount) throw new GameError('not-found', 'Game attempt not found.');
      await lockBucket(client, initial.rows[0].game_id, initial.rows[0].amount_cents);
      const found = await client.query(`SELECT *, lease_expires_at <= clock_timestamp() AS expired,
          created_at <= clock_timestamp() - $2 * interval '1 second' AS match_expired
        FROM bets WHERE id = $1 FOR UPDATE`, [betId, MATCH_WAIT_SECONDS]);
      const bet = found.rows[0];
      if (await closeUnmatchedBet(client, bet)) {
        return { ...(await ownResult(client, betId, uid)), canContinue: false };
      }
      if (bet.play_status === 'playing') {
        const reason = bet.expired ? 'timeout' : finish ? data.reason : null;
        if (reason === 'completed' && score == null && bet.score == null) throw new GameError('failed-precondition', 'Complete the game with a score.');
        if (reason) {
          await client.query(`UPDATE bets SET play_status = $2, finish_reason = $3,
              score = CASE WHEN $3 = 'timeout' THEN score ELSE GREATEST(score, $4::bigint) END,
              finished_at = now(), lease_expires_at = NULL, updated_at = now() WHERE id = $1`,
          [betId, reason === 'completed' ? 'completed' : 'forfeited', reason, score]);
        } else {
          await client.query(`UPDATE bets SET score = GREATEST(score, $2::bigint),
              lease_expires_at = clock_timestamp() + interval '120 seconds', updated_at = now() WHERE id = $1`, [betId, score]);
        }
      }
      await settle(client, bet.result_id);
      const response = await ownResult(client, betId, uid);
      return { ...response, canContinue: response.bet.playStatus === 'playing' };
    });
  }
  async function finalizeExpired(uid = null, limit = 100) {
    const expired = await db.query(`SELECT id, firebase_uid FROM bets WHERE play_status = 'playing'
        AND lease_expires_at <= now() AND ($1::text IS NULL OR firebase_uid = $1)
        ORDER BY lease_expires_at LIMIT $2`, [uid, limit]);
    // Rechecks expiry after lock acquisition: an intervening heartbeat may have won.
    for (const bet of expired.rows) await updateAttempt(bet.firebase_uid, { betId: String(bet.id) });
    return expired.rowCount;
  }
  async function finalizeStaleGames() {
    const unmatchedClosed = await finalizeUnmatchedGames();
    const expired = await finalizeExpired();
    const ready = await db.query(`SELECT r.id, r.game_id, r.bet_amount_cents FROM results r
        JOIN bets a ON a.id = r.user1_bet_id JOIN bets b ON b.id = r.user2_bet_id
        WHERE r.status = 'matched' AND a.play_status <> 'playing' AND b.play_status <> 'playing'
        ORDER BY r.id LIMIT 100`);
    for (const result of ready.rows) await db.transaction(async (client) => {
      await lockBucket(client, result.game_id, result.bet_amount_cents); await settle(client, result.id);
    });
    return { unmatchedClosed, expired, settledCandidates: ready.rowCount };
  }
  async function getMyResults(uid, data = {}) {
    await finalizeUnmatchedGames(uid);
    await finalizeExpired(uid);
    const limit = Math.min(Math.max(Number.isInteger(data.limit) ? data.limit : 50, 1), 100);
    const rows = await db.query(`${OWN_RESULT_SQL} WHERE b.firebase_uid = $1 ORDER BY b.created_at DESC, b.id DESC LIMIT $2`, [uid, limit]);
    return { results: rows.rows.map(toOwnResult) };
  }
  async function getMyBets(uid, data = {}) {
    await finalizeUnmatchedGames(uid);
    await finalizeExpired(uid);
    const limit = Math.min(Math.max(Number.isInteger(data.limit) ? data.limit : 50, 1), 100);
    const rows = await db.query('SELECT * FROM bets WHERE firebase_uid = $1 ORDER BY created_at DESC, id DESC LIMIT $2', [uid, limit]);
    return { bets: rows.rows.map(toBet) };
  }
  async function getPendingBetsForGame(uid, data = {}) {
    const gameId = requireGameId(data.gameId);
    await finalizeUnmatchedGames(uid);
    const rows = await db.query("SELECT * FROM bets WHERE firebase_uid = $1 AND game_id = $2 AND status = 'pending' ORDER BY created_at LIMIT 100", [uid, gameId]);
    return { bets: rows.rows.map(toBet) };
  }
  async function getMyLeaderboard(uid, data = {}) {
    const gameId = requireGameId(data.gameId);
    const betId = data.betId == null ? null : requireId(data.betId);
    const rows = await db.query(`WITH best AS (
        SELECT firebase_uid, MAX(score) AS score FROM bets WHERE game_id = $1 AND play_status = 'completed' GROUP BY firebase_uid
      ), current_attempt AS (
        SELECT score, play_status FROM bets WHERE id = $3 AND firebase_uid = $2 AND game_id = $1
      ), own AS (
        SELECT (SELECT score FROM best WHERE firebase_uid = $2) AS best_score,
          CASE WHEN $3::bigint IS NULL THEN (SELECT score FROM best WHERE firebase_uid = $2)
               ELSE (SELECT score FROM current_attempt) END AS current_score,
          CASE WHEN $3::bigint IS NULL THEN true
               ELSE COALESCE((SELECT play_status = 'completed' FROM current_attempt), false) END AS eligible
      ) SELECT own.*, (SELECT count(*) FROM best) AS total_players,
        CASE WHEN own.eligible AND own.current_score IS NOT NULL THEN
          1 + (SELECT count(*) FROM best WHERE firebase_uid <> $2 AND score > own.current_score) END AS rank,
        CASE WHEN own.eligible AND own.current_score IS NOT NULL THEN
          (SELECT count(*) FROM best WHERE firebase_uid <> $2 AND score < own.current_score) ELSE 0 END AS players_below,
        ($3::bigint IS NULL OR EXISTS (SELECT 1 FROM current_attempt)) AS found FROM own`, [gameId, uid, betId]);
    const row = rows.rows[0];
    if (!row.found) throw new GameError('not-found', 'Game attempt not found.');
    return { gameId, score: nullableNumber(row.current_score), bestScore: nullableNumber(row.best_score),
      rank: nullableNumber(row.rank), totalPlayers: Number(row.total_players), playersBelow: Number(row.players_below),
      isPersonalBest: row.eligible && row.current_score != null && Number(row.current_score) >= Number(row.best_score) };
  }
  return { placeBet, recoverGameReservation, checkpointGame: (uid, data) => updateAttempt(uid, data),
    finishGame: (uid, data) => updateAttempt(uid, data, true), getMyResults, getMyBets,
    getPendingBetsForGame, getMyLeaderboard, finalizeStaleGames, finalizeUnmatchedGames,
    getMyWallet, addDemoMoney, withdrawMoney };
}
module.exports = { createGameService, calculateSettlement, GameError, LEASE_SECONDS, MATCH_WAIT_SECONDS,
  requireScore, requireId, requireGameId, toOwnResult };
