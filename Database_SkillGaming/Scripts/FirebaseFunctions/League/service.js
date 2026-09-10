/** Leagues use the trusted earning trigger, never client-submitted crowns. */
const { GameError } = require('../Bet/service');
const RANKED = `SELECT p.firebase_uid, p.tier, p.crowns, u.display_name, u.photo_url,
 row_number() OVER (ORDER BY p.crowns DESC,p.reached_at,p.firebase_uid) AS rank
 FROM league_players p JOIN users u USING(firebase_uid) WHERE p.tier=$1`;

function prizeAmounts(pool, shares, eligible) {
  const selected = shares.slice(0, eligible);
  const total = selected.reduce((a, b) => a + b, 0);
  if (!total) return [];
  const amounts = selected.map(weight => Math.floor(pool * weight / total));
  amounts[0] += pool - amounts.reduce((a, b) => a + b, 0);
  return amounts;
}

function createLeagueService(db) {
  async function rollover() {
    return db.transaction(async client => (await client.query('SELECT rollover_leagues() AS id')).rows[0].id);
  }

  async function deliverPayouts(limit = 100) {
    const pending = await db.query('SELECT id FROM league_payouts WHERE paid_at IS NULL ORDER BY id LIMIT $1', [limit]);
    let paid = 0;
    for (const item of pending.rows) {
      paid += await db.transaction(async client => {
        const row = (await client.query('SELECT * FROM league_payouts WHERE id=$1 FOR UPDATE', [item.id])).rows[0];
        if (row.paid_at) return 0;
        await client.query('INSERT INTO wallets(firebase_uid) VALUES($1) ON CONFLICT DO NOTHING', [row.firebase_uid]);
        const wallet = (await client.query('SELECT balance_cents FROM wallets WHERE firebase_uid=$1 FOR UPDATE', [row.firebase_uid])).rows[0];
        const balance = BigInt(wallet.balance_cents) + BigInt(row.amount_cents);
        await client.query(`INSERT INTO wallet_entries(firebase_uid,kind,idempotency_key,amount_cents,balance_after_cents)
          VALUES($1,'league_payout',$2,$3,$4)`, [row.firebase_uid, `league:${row.id}`, row.amount_cents, balance.toString()]);
        await client.query('UPDATE wallets SET balance_cents=$2,updated_at=now() WHERE firebase_uid=$1', [row.firebase_uid, balance.toString()]);
        await client.query('UPDATE league_payouts SET paid_at=clock_timestamp() WHERE id=$1', [row.id]);
        return 1;
      });
    }
    return { paid };
  }

  async function getMyLeague(uid) {
    return db.transaction(async client => {
      const pid = (await client.query('SELECT rollover_leagues() AS id')).rows[0].id;
      const player = (await client.query('SELECT * FROM league_players WHERE firebase_uid=$1', [uid])).rows[0];
      if (!player) throw new GameError('failed-precondition', 'Sign in to create your league profile.');
      const period = (await client.query('SELECT * FROM league_periods WHERE id=$1', [pid])).rows[0];
      const config = period.tiers[player.tier];
      const eligible = Number((await client.query('SELECT count(*) FROM league_players WHERE tier=$1 AND crowns>0', [player.tier])).rows[0].count);
      const amounts = prizeAmounts(config.pool_cents, config.shares, Math.min(eligible, config.shares.length));
      const normalAmounts = prizeAmounts(config.pool_cents, config.shares, config.shares.length);
      const rows = (await client.query(`WITH ranked AS (${RANKED}) SELECT * FROM ranked WHERE rank<=20 OR firebase_uid=$2 ORDER BY rank`, [player.tier, uid])).rows;
      const present = row => ({
        id: row.firebase_uid, name: row.display_name || 'Player', photoUrl: row.photo_url,
        rank: Number(row.rank), crowns: Number(row.crowns), isMe: row.firebase_uid === uid,
        prizeCents: Number(row.crowns)>0 ? (amounts[Number(row.rank)-1] || 0) : 0,
      });
      const me = present(rows.find(row => row.firebase_uid === uid));
      const previous = (await client.query('SELECT * FROM league_observations WHERE firebase_uid=$1', [uid])).rows[0];
      if (previous && String(previous.period_id) === String(pid) && previous.tier === player.tier && me.rank < previous.rank) {
        await client.query(`INSERT INTO league_events(firebase_uid,period_id,from_tier,to_tier,reason,previous_rank,current_rank)
          VALUES($1,$2,$3,$3,'position',$4,$5)`, [uid, pid, player.tier, previous.rank, me.rank]);
      }
      await client.query(`INSERT INTO league_observations(firebase_uid,period_id,tier,rank) VALUES($1,$2,$3,$4)
        ON CONFLICT(firebase_uid) DO UPDATE SET period_id=$2,tier=$3,rank=$4`, [uid, pid, player.tier, me.rank]);
      const events = (await client.query(`SELECT * FROM league_events WHERE firebase_uid=$1 AND seen_at IS NULL ORDER BY id LIMIT 30`, [uid])).rows;
      const payouts = (await client.query(`SELECT r.*,p.ends_at FROM league_payouts r JOIN league_periods p ON p.id=r.period_id
        WHERE r.firebase_uid=$1 ORDER BY r.id DESC LIMIT 50`, [uid])).rows;
      return {
        periodId: String(pid), endsAt: period.ends_at.toISOString(), serverTime: new Date().toISOString(),
        tier: player.tier, crowns: Number(player.crowns), remainderCents: Number(player.earned_cents)%100,
        tiers: period.tiers.map(t => ({ tier: t.tier, name: t.name, poolCents: t.pool_cents, threshold: t.threshold, winners: t.shares.length })),
        top: rows.filter(row => Number(row.rank)<=20).map(present), me,
        prizes: normalAmounts, eligibleWinners: amounts.length,
        events: events.map(e => ({ id: String(e.id), tier: e.to_tier, fromTier: e.from_tier, reason: e.reason,
          previousRank: e.previous_rank, rank: e.current_rank })),
        payouts: payouts.map(p => ({ id: String(p.id), tier: p.tier, rank: p.rank, amountCents: Number(p.amount_cents),
          endsAt: p.ends_at.toISOString(), paidAt: p.paid_at?.toISOString() || null })),
      };
    });
  }

  async function acknowledgeLeagueEvent(uid, data) {
    if (typeof data.eventId !== 'string' || !/^\d{1,19}$/.test(data.eventId)) throw new GameError('invalid-argument', 'Invalid league event.');
    await db.query('UPDATE league_events SET seen_at=COALESCE(seen_at,now()) WHERE id=$1 AND firebase_uid=$2', [data.eventId, uid]);
    return { ok: true };
  }
  return { getMyLeague, acknowledgeLeagueEvent, rollover, deliverPayouts };
}
module.exports = { createLeagueService, prizeAmounts };
