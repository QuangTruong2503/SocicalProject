import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase/migrations/20261014153530_memory_game_v2.sql', import.meta.url), 'utf8');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const document = { version: 2, history: [], records: {}, active: null, sound: false, updatedAt: 0 };

test('SQL migration, isolation, optimistic concurrency and server-owned daily scoring', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key);
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.is_active_user() returns boolean language sql stable as
      $$ select auth.uid() is not null and current_setting('test.suspended', true) is distinct from 'yes' $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid(), public.is_active_user() to authenticated;
  `);
  await db.exec(sql);
  await db.exec(sql); // Advertised safe to re-run.
  const asUser = async (id, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const rpc = async (query, params = []) => (await db.query(query, params)).rows[0].result;
  const expectCode = async (operation, code) => assert.rejects(operation, (error) => error.code === code);

  await t.test('anonymous users cannot execute wrappers or private functions', async () => {
    await asUser('', 'anon');
    await expectCode(() => rpc('select public.memory_game_load() as result'), '42501');
    await expectCode(() => rpc('select memory_game_private.start_daily() as result'), '42501');
  });

  await t.test('account state is isolated; stale saves fail instead of overwriting', async () => {
    await asUser(USER_A);
    assert.equal((await rpc('select public.memory_game_load() as result')).version, 0);
    assert.equal((await rpc('select public.memory_game_save($1::jsonb, 0) as result', [JSON.stringify(document)])).version, 1);
    await expectCode(() => rpc('select public.memory_game_save($1::jsonb, 0) as result', [JSON.stringify(document)]), '40001');
    assert.equal((await rpc('select public.memory_game_save($1::jsonb, 1) as result', [JSON.stringify(document)])).version, 2);
    await expectCode(() => rpc('select public.memory_game_save($1::jsonb, 1) as result', [JSON.stringify(document)]), '40001');
    await expectCode(() => db.query('select * from memory_game_private.account_state'), '42501');
    await expectCode(() => rpc('select public.memory_game_save($1::jsonb, 2) as result', [JSON.stringify({ ...document, active: [] })]), '22023');
    await asUser(USER_B);
    assert.equal((await rpc('select public.memory_game_load() as result')).version, 0);
  });

  let session;
  let board;
  await t.test('daily start is idempotent and never returns hidden identities', async () => {
    await asUser(USER_A);
    session = await rpc('select public.memory_game_daily_start() as result');
    assert.equal(session.status, 'ready');
    assert.deepEqual(session.revealed, []);
    assert.equal(session.board, undefined);
    assert.equal((await rpc('select public.memory_game_daily_start() as result')).id, session.id);
    await db.exec('reset role');
    board = (await db.query('select board from memory_game_private.daily_sessions where id = $1', [session.id])).rows[0].board;
    assert.equal(new Set(board).size, 6);
    await asUser(USER_B);
    await expectCode(() => rpc('select public.memory_game_daily_reveal($1, 0) as result', [session.id]), '42501');
    const other = await rpc('select public.memory_game_daily_start() as result');
    assert.notEqual(other.id, session.id);
    await db.exec('reset role');
    const otherBoard = (await db.query('select board from memory_game_private.daily_sessions where id = $1', [other.id])).rows[0].board;
    assert.deepEqual(otherBoard, board);
    await db.exec(sql);
    await asUser(USER_A);
    assert.equal((await rpc('select public.memory_game_daily_start() as result')).id, session.id);
  });

  // Remove only timing delays in the test database, without bypassing RPC rules.
  const ageFlip = async () => {
    await db.exec('reset role');
    await db.query("update memory_game_private.daily_sessions set last_revealed_at = now() - interval '1 second', lock_until = null where id = $1", [session.id]);
    await asUser(USER_A);
  };
  await t.test('repeated cards, forged indices and third flips are rejected; server counts mismatches', async () => {
    await asUser(USER_A);
    await expectCode(() => rpc('select public.memory_game_daily_reveal($1, 12) as result', [session.id]), '22023');
    let result = await rpc('select public.memory_game_daily_reveal($1, 0) as result', [session.id]);
    assert.equal(result.turns, 0);
    assert.equal(result.revealed.length, 1);
    await ageFlip();
    await expectCode(() => rpc('select public.memory_game_daily_reveal($1, 0) as result', [session.id]), '22023');
    const mismatch = board.findIndex((symbol) => symbol !== board[0]);
    result = await rpc('select public.memory_game_daily_reveal($1, $2) as result', [session.id, mismatch]);
    assert.equal(result.turns, 1);
    assert.equal(result.outcome, 'mismatch');
    assert.equal(result.revealed.length, 2);
    assert.ok(result.lock_ms > 0);
    await expectCode(() => rpc('select public.memory_game_daily_reveal($1, 2) as result', [session.id]), '55000');
  });

  await t.test('only completing the server board qualifies for the ranking', async () => {
    await ageFlip();
    assert.deepEqual(await rpc('select public.memory_game_leaderboard(null) as result'), []);
    for (const symbol of new Set(board)) {
      const pair = board.flatMap((value, index) => value === symbol ? [index] : []);
      for (const index of pair) {
        await ageFlip();
        session = await rpc('select public.memory_game_daily_reveal($1, $2) as result', [session.id, index]);
      }
    }
    assert.equal(session.status, 'won');
    assert.equal(session.turns, 7);
    assert.equal(session.matched.length, 12);
    assert.ok(session.elapsed_ms >= 0);
    const ranking = await rpc('select public.memory_game_leaderboard(null) as result');
    assert.equal(ranking.length, 1);
    assert.equal(ranking[0].turns, 7);
    assert.equal(ranking[0].is_mine, true);
    assert.equal(ranking[0].user_id, undefined);
    assert.equal((await rpc('select public.memory_game_daily_start() as result')).id, session.id);
    // Private, client-reported history cannot create a leaderboard entry.
    await asUser(USER_B);
    await rpc('select public.memory_game_save($1::jsonb, 0) as result', [JSON.stringify({ ...document, history: [{ turns: 1, verified: true }] })]);
    assert.equal((await rpc('select public.memory_game_leaderboard(null) as result')).length, 1);
  });

  await t.test('suspended accounts cannot read, save or start competitive sessions', async () => {
    await db.exec('reset role');
    await db.exec("select set_config('test.suspended', 'yes', false)");
    await asUser(USER_A);
    for (const query of ['select public.memory_game_load() as result', 'select public.memory_game_daily_start() as result', 'select public.memory_game_leaderboard(null) as result']) {
      await expectCode(() => rpc(query), '42501');
    }
  });
});
