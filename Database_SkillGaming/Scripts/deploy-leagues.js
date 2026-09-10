/** Applies only the reviewed league migration; never prints connection secrets. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getPool } = require('./db');
const version = '20260910050000';
async function main() {
 const pool=getPool(), c=await pool.connect();
 try {
  const before=await c.query(`SELECT to_regclass('public.league_players') AS leagues,
    to_regclass('public.game_earnings') AS earnings, to_regclass('public.wallets') AS wallets`);
  console.log('Schema readiness:',before.rows[0]);
  if(!process.argv.includes('--apply')) return;
  const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260910050000_weekly_leagues.sql'),'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  await c.query("BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s'");
  await c.query('CREATE TABLE IF NOT EXISTS public.app_schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  await c.query('ALTER TABLE public.app_schema_migrations ENABLE ROW LEVEL SECURITY');
  const existing=await c.query('SELECT checksum FROM public.app_schema_migrations WHERE version=$1',[version]);
  if(existing.rowCount) {
   if(existing.rows[0].checksum!==checksum) throw Error('Migration checksum differs from deployed version.');
   console.log('League migration already applied.');
  } else {
   if(before.rows[0].leagues) throw Error('Untracked league schema already exists; inspect before proceeding.');
   await c.query(sql.replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, ''));
   await c.query('INSERT INTO public.app_schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
   console.log('League migration applied.');
  }
  await c.query('COMMIT');
  const result=await c.query('SELECT count(*) AS enrolled_players FROM public.league_players');
  console.log(result.rows[0]);
 } catch(e) { await c.query('ROLLBACK').catch(()=>{}); throw e; }
 finally { c.release(); await pool.end(); }
}
main().catch(e=>{ console.error(e.message); process.exitCode=1; });
