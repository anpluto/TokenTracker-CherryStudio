"use strict";
// Read the real provider database; write only an isolated scratch usage queue.
// The report contains aggregate numbers, never titles, ids or message content.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const serverIndex = process.argv.indexOf("--server-root");
const serverRoot = serverIndex >= 0 ? path.resolve(process.argv[serverIndex + 1]) : path.resolve(__dirname, "..");
const { resolveCherryStudioDbPath, parseCherryStudioIncremental, scanCherryStudioSessions } = require(path.join(serverRoot, "src/lib/cherrystudio"));
const tokenFields = ["input_tokens", "output_tokens", "cached_input_tokens", "cache_creation_input_tokens", "reasoning_output_tokens", "total_tokens"];
const readQueue = (file) => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";

(async () => {
  const dbPath = resolveCherryStudioDbPath();
  const database = new DatabaseSync(dbPath, { readOnly: true });
  const expected = database.prepare(`SELECT COUNT(*) AS requests,
    SUM(input_tokens) AS inclusive_input, SUM(output_tokens) AS output,
    SUM(no_cache_tokens) AS non_cached_input, SUM(cache_read_tokens) AS cache_read,
    SUM(COALESCE(cache_write_tokens,0)) AS cache_write, SUM(reasoning_tokens) AS reasoning,
    SUM(total_tokens) AS total_tokens FROM ai_usage_record WHERE record_kind='invocation'`).get();
  database.close();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tt-cherry-verify-"));
  try {
    const queuePath = path.join(scratch, "queue.jsonl");
    const cursors = {};
    const first = await parseCherryStudioIncremental({ dbPath, queuePath, cursors });
    const before = readQueue(queuePath);
    const second = await parseCherryStudioIncremental({ dbPath, queuePath, cursors: JSON.parse(JSON.stringify(cursors)) });
    assert.equal(second.bucketsQueued, 0, "Repeated sync changed the queue (or provider was writing concurrently; retry verification)");
    assert.equal(readQueue(queuePath), before);
    const totals = Object.values(cursors.cherrystudio.buckets).reduce((sum, row) => {
      for (const field of tokenFields) sum[field] += row[field] || 0;
      return sum;
    }, Object.fromEntries(tokenFields.map((field) => [field, 0])));
    assert.equal(totals.total_tokens, Number(expected.total_tokens), "Provider changed during verification or token totals differ");
    assert.equal(totals.input_tokens, Number(expected.non_cached_input));
    assert.equal(totals.output_tokens, Number(expected.output));
    assert.equal(totals.cached_input_tokens, Number(expected.cache_read));
    assert.equal(totals.cache_creation_input_tokens, Number(expected.cache_write));
    assert.equal(first.eventsAggregated, Number(expected.requests));
    const sessions = await scanCherryStudioSessions(dbPath);
    assert.equal(sessions.reduce((sum, row) => sum + row.total_tokens, 0), totals.total_tokens);
    const kinds = {};
    for (const row of sessions) {
      const bucket = kinds[row.session_kind] ||= { sessions: 0, tokens: 0, requests: 0 };
      bucket.sessions += 1; bucket.tokens += row.total_tokens; bucket.requests += row.usage_events;
    }
    console.log(JSON.stringify({ verified: true, requests: expected.requests, totals, sessionKinds: kinds,
      partialCostSessions: sessions.filter((row) => row.cost_is_partial).length, repeatSyncBuckets: second.bucketsQueued }, null, 2));
  } finally {
    if (!path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unsafe scratch cleanup path");
    fs.rmSync(scratch, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
