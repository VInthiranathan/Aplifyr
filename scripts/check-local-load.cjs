// Finite loopback smoke load; never calls JobTech, Auth or an AI provider.
const assert = require('node:assert/strict');
const target = new URL(process.env.APLIFYR_LOAD_BASE_URL ?? 'http://127.0.0.1:5102');
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.protocol !== 'http:' || target.pathname !== '/' || target.username || target.password || target.search || target.hash) {
  throw new Error('Load checks require an HTTP loopback origin on a separate test instance.');
}
const base = target.origin;
const counts = {}, durations = [];
(async () => {
  const health = await fetch(base, { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200, 'fresh isolated instance must be healthy');
  assert.equal((await health.json()).service, 'Aplifyr.Api');
  const privateRead = await fetch(base + '/api/cvs/synthetic-load-job', { signal: AbortSignal.timeout(5000) });
  assert.ok([401, 503].includes(privateRead.status), 'private reads must fail closed without test authentication');
  let started = 0;
  const run = async () => {
    while (started < 180) {
      started++;
      const before = performance.now();
      const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
      await response.arrayBuffer();
      durations.push(performance.now() - before);
      counts[response.status] = (counts[response.status] ?? 0) + 1;
      assert.ok([200, 429].includes(response.status), 'unexpected public health status');
      if (response.status === 429) assert.ok(response.headers.get('retry-after'), 'rate rejection needs retry metadata');
    }
  };
  await Promise.all(Array.from({ length: 8 }, run));
  assert.ok(counts[200] > 0 && counts[429] > 0, 'verify success and admission rejection under load');
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  assert.ok(p95 < 1000, 'loopback health p95 exceeded the 1000 ms smoke threshold');
  console.log(JSON.stringify({ scope: 'isolated loopback health only; no external integrations', requests: durations.length, concurrency: 8, statuses: counts, p50Ms: +durations[Math.ceil(durations.length * 0.5) - 1].toFixed(2), p95Ms: +p95.toFixed(2), maxMs: +durations.at(-1).toFixed(2), privateStatus: privateRead.status }, null, 2));
})().catch(error => { console.error('Local load check failed:', error.message); process.exitCode = 1; });
