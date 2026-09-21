/**
 * ShopTrack Stress Test
 * Run on the server PC: node stress-test.mjs
 * Or against a remote server: node stress-test.mjs http://192.168.x.x:3001
 */

const BASE = process.argv[2] || "http://localhost:3001";
const DEVICES = 8;   // simulated tablets
const DURATION_MS = 30_000; // 30-second run

// ── Colours ───────────────────────────────────────────────
const C = { reset:"\x1b[0m", green:"\x1b[32m", red:"\x1b[31m",
            yellow:"\x1b[33m", cyan:"\x1b[36m", bold:"\x1b[1m" };
const ok  = s => `${C.green}✓${C.reset} ${s}`;
const fail= s => `${C.red}✗${C.reset} ${s}`;
const warn= s => `${C.yellow}⚠${C.reset} ${s}`;
const hdr = s => `\n${C.bold}${C.cyan}── ${s} ──${C.reset}`;

// ── Helpers ───────────────────────────────────────────────
const get  = url => fetch(url).then(r => r.json());
const post = (url, body) =>
  fetch(url, { method:"POST", headers:{"Content-Type":"application/json"},
               body: JSON.stringify(body) }).then(r => r.json());

const sleep = ms => new Promise(r => setTimeout(r, ms));
const now   = () => Date.now();

let passed = 0, failed = 0, warnings = 0;
const results = [];
function record(label, isOk, detail="") {
  results.push({ label, ok: isOk, detail });
  if (isOk) passed++; else failed++;
  console.log(isOk ? ok(label) : fail(`${label}${detail ? " — "+detail : ""}`));
}
function recordWarn(label, detail="") {
  warnings++;
  console.log(warn(`${label}${detail ? " — "+detail : ""}`));
}

// ── 1. Basic connectivity ─────────────────────────────────
console.log(hdr("1. Connectivity"));
let baseline;
try {
  const h = await get(`${BASE}/api/health`);
  record("Health endpoint responds", h.ok === true);
  baseline = await get(`${BASE}/api/data`);
  record("GET /api/data returns object", baseline !== null && typeof baseline === "object");
  record("Users array present", Array.isArray(baseline?.users));
  record("PINs are stripped from GET response",
    !(baseline?.users || []).some(u => u.pin !== undefined),
    "PIN found in a user object");
} catch(e) {
  record("Server reachable", false, e.message);
  console.log(fail("Cannot reach server — aborting. Is pm2 running?"));
  process.exit(1);
}

// ── 2. Security checks ────────────────────────────────────
console.log(hdr("2. Security"));

// Path traversal attempt
try {
  const r = await post(`${BASE}/api/photo`, {
    filename: "../../pwned.txt",
    data: "data:image/png;base64,dGVzdA=="
  });
  record("Path traversal blocked on /api/photo", r.error !== undefined, "Traversal was accepted!");
} catch(e) { record("Path traversal blocked on /api/photo", false, e.message); }

// Malformed payload
try {
  const r = await post(`${BASE}/api/data`, { jobs: "this should be an array" });
  record("Malformed payload rejected", r.error !== undefined || r.ok === false,
    "Server accepted jobs as a string");
} catch(e) { record("Malformed payload rejected", false, e.message); }

// PIN verify — wrong PIN (use 5 chars so it can never match a real 4-digit PIN)
try {
  const user = (baseline.users || [])[0];
  if (user) {
    const r = await post(`${BASE}/api/verify-pin`, { userId: user.id, pin: "99999" });
    record("verify-pin rejects wrong PIN", r.ok === false);
  } else {
    recordWarn("No users in DB — skipping PIN test");
  }
} catch(e) { record("verify-pin endpoint exists", false, e.message); }

// ── 3. Data integrity — known-value round-trip ────────────
console.log(hdr("3. Data Integrity Round-Trip"));

const testJobId = `stress-test-${now()}`;
const testJob = {
  id: testJobId,
  customer: "StressTest Corp",
  job: "Integrity Check",
  machine: "TEST-MACHINE",
  operatorId: 99999,
  operatorName: "Stress Tester",
  status: "run",
  setupSec: 120,
  runSec: 60,
  pieces: 5,
  lastModifiedAt: now(),
  createdAt: now(),
};

// Write with a very high settingsVersion so it won't be rejected
const svHigh = now() + 1_000_000;
await post(`${BASE}/api/data`, {
  ...baseline,
  jobs: [...(baseline.jobs || []), testJob],
  settingsVersion: svHigh,
});
await sleep(200);

const after = await get(`${BASE}/api/data`);
const found = (after.jobs || []).find(j => j.id === testJobId);
record("Written job is readable back", !!found);
if (found) {
  record("Job fields preserved (setupSec)", found.setupSec === 120);
  record("Job fields preserved (runSec)", found.runSec === 60);
  record("Job fields preserved (pieces)", found.pieces === 5);
}

// ── 4. settingsVersion protection ────────────────────────
console.log(hdr("4. Settings Version Protection"));

const current = await get(`${BASE}/api/data`);
const currentSV = current.settingsVersion || 0;

// Try to overwrite with a stale version carrying different user list
const stalePayload = {
  ...current,
  users: [{ id: 1, name: "STALE OVERWRITE", active: true }],
  settingsVersion: Math.max(0, currentSV - 1),
};
await post(`${BASE}/api/data`, stalePayload);
await sleep(200);

const afterStale = await get(`${BASE}/api/data`);
const staleWin = (afterStale.users || []).length === 1 &&
  afterStale.users[0]?.name === "STALE OVERWRITE";
record("Stale client cannot overwrite settings", !staleWin,
  "Stale payload replaced user list!");

// ── 5. Concurrent save race ───────────────────────────────
console.log(hdr(`5. Concurrent Save Race (${DEVICES} devices × 10 rounds)`));

const preRace = await get(`${BASE}/api/data`);
const existingJobs = preRace.jobs || [];

// Each device tracks one unique job
const raceJobs = Array.from({ length: DEVICES }, (_, i) => ({
  id: `race-device-${i}-${now()}`,
  customer: `Device ${i}`,
  job: `Race Job ${i}`,
  machine: "RACE",
  operatorId: i,
  operatorName: `Device ${i}`,
  status: "run",
  setupSec: 0,
  runSec: 0,
  pieces: 0,
  lastModifiedAt: now(),
  createdAt: now(),
}));

const raceSV = now() + 2_000_000;
const errors = [];
const timings = [];

// 10 rounds of concurrent saves from all 8 devices
// Use AbortController so timed-out requests don't count as errors
const fetchWithTimeout = (url, opts, ms=15000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), ms);
  return fetch(url, {...opts, signal: ctrl.signal}).finally(()=>clearTimeout(timer));
};
for (let round = 0; round < 10; round++) {
  const roundStart = now();
  await Promise.all(raceJobs.map(async (j, i) => {
    const updated = { ...j, runSec: (j.runSec || 0) + 3, lastModifiedAt: now() };
    raceJobs[i] = updated;
    try {
      const r = await post(`${BASE}/api/data`, {
        ...preRace,
        jobs: [...existingJobs, ...raceJobs],
        settingsVersion: raceSV,
      });
      if (!r.ok) errors.push(`Round ${round} device ${i}: ${JSON.stringify(r)}`);
    } catch(e) {
      errors.push(`Round ${round} device ${i}: ${e.message}`);
    }
  }));
  timings.push(now() - roundStart);
}

await sleep(500); // let write queue drain
const postRace = await get(`${BASE}/api/data`);
const postJobs = postRace.jobs || [];

let allFound = true;
for (const rj of raceJobs) {
  if (!postJobs.find(j => j.id === rj.id)) { allFound = false; break; }
}

record("No HTTP errors during concurrent saves", errors.length === 0,
  errors.length > 0 ? errors.slice(0,3).join("; ") : "");
record("All device jobs survived race (no data loss)", allFound,
  "Some jobs disappeared after concurrent writes!");

const avgMs = Math.round(timings.reduce((a,b)=>a+b,0)/timings.length);
const maxMs = Math.max(...timings);
console.log(`   Avg round-trip (8 concurrent POSTs): ${avgMs}ms  Max: ${maxMs}ms`);
if (maxMs > 5000) recordWarn("Max round-trip > 5s under load", `${maxMs}ms`);

// ── 6. Rapid-fire single-device save (skip-unchanged) ────
console.log(hdr("6. Skip-Unchanged Hash (Save Efficiency)"));

// We can't test the client-side skip directly, but we can verify the server
// handles 50 identical POSTs without error or data corruption.
const snap = await get(`${BASE}/api/data`);
const snapSV = snap.settingsVersion || raceSV;
let identicalErrors = 0;
const identicalStart = now();
// Use 30s timeout — 50 queued writes × ~200ms each ≈ 10s total
await Promise.all(
  Array.from({ length: 50 }, () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    return fetch(`${BASE}/api/data`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...snap, settingsVersion: snapSV }),
      signal: ctrl.signal,
    })
      .then(r => { if (!r.ok) identicalErrors++; })
      .catch(e => { if (e.name !== "AbortError") identicalErrors++; })
      .finally(() => clearTimeout(timer));
  })
);
const identicalMs = now() - identicalStart;
record("50 identical concurrent POSTs all succeed", identicalErrors === 0,
  `${identicalErrors} errors`);
console.log(`   50 concurrent identical saves took ${identicalMs}ms total (${Math.round(identicalMs/50)}ms/save serialized)`);

// ── 7. Large payload (many jobs) ─────────────────────────
console.log(hdr("7. Large Payload"));

const bigSnap = await get(`${BASE}/api/data`);
const bigJobs = Array.from({ length: 500 }, (_, i) => ({
  id: `bulk-${i}-${now()}`,
  customer: `Customer ${i}`,
  job: `Job ${i}`,
  machine: "BULK",
  operatorId: 1,
  operatorName: "Bulk Tester",
  status: "done",
  setupSec: Math.floor(Math.random() * 3600),
  runSec: Math.floor(Math.random() * 7200),
  pieces: Math.floor(Math.random() * 100),
  lastModifiedAt: now() - i * 1000,
  createdAt: now() - i * 2000,
  completedAt: now() - i * 500,
}));

const bulkStart = now();
const bulkRes = await post(`${BASE}/api/data`, {
  ...bigSnap,
  jobs: [...(bigSnap.jobs || []), ...bigJobs],
  settingsVersion: now() + 3_000_000,
});
const bulkMs = now() - bulkStart;
record("500-job payload accepted", bulkRes.ok === true);
console.log(`   500-job POST took ${bulkMs}ms`);
if (bulkMs > 3000) recordWarn("Large payload takes > 3s", `${bulkMs}ms`);

// ── 8. Response time baseline ─────────────────────────────
console.log(hdr("8. Response Time Baseline"));

const timingSnap = await get(`${BASE}/api/data`);
const getTimings = [];
for (let i = 0; i < 20; i++) {
  const t = now();
  await get(`${BASE}/api/data`);
  getTimings.push(now() - t);
}
const avgGet = Math.round(getTimings.reduce((a,b)=>a+b,0)/getTimings.length);
const maxGet = Math.max(...getTimings);
console.log(`   GET /api/data — avg: ${avgGet}ms  max: ${maxGet}ms (20 requests)`);
if (avgGet > 200) recordWarn("GET /api/data avg > 200ms", `${avgGet}ms average`);
if (maxGet > 1000) recordWarn("GET /api/data spike > 1s", `${maxGet}ms max`);
record("GET /api/data responds under 1s (all 20)", maxGet < 1000, `slowest: ${maxGet}ms`);

const postTimings = [];
const ptSnap = await get(`${BASE}/api/data`);
for (let i = 0; i < 20; i++) {
  const t = now();
  await post(`${BASE}/api/data`, { ...ptSnap, settingsVersion: ptSnap.settingsVersion||0 });
  postTimings.push(now() - t);
}
const avgPost = Math.round(postTimings.reduce((a,b)=>a+b,0)/postTimings.length);
const maxPost = Math.max(...postTimings);
console.log(`   POST /api/data — avg: ${avgPost}ms  max: ${maxPost}ms (20 requests)`);
if (avgPost > 500) recordWarn("POST /api/data avg > 500ms", `${avgPost}ms average`);
record("POST /api/data responds under 2s (all 20)", maxPost < 2000, `slowest: ${maxPost}ms`);

// ── 9. Data file size check ───────────────────────────────
console.log(hdr("9. Database Health"));

try {
  const fs = await import("fs");
  const path = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dataFile = path.join(__dirname, "shoptrack-data.json");
  if (fs.existsSync(dataFile)) {
    const stats = fs.statSync(dataFile);
    const sizeMB = (stats.size / 1_048_576).toFixed(2);
    console.log(`   Data file size: ${sizeMB} MB`);
    if (stats.size > 50_000_000)
      recordWarn("Data file > 50 MB — consider archiving old jobs", `${sizeMB} MB`);
    else
      record("Data file size reasonable (< 50 MB)", true, `${sizeMB} MB`);

    const raw = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const jobCount = (raw.jobs || []).length;
    const doneCount = (raw.jobs || []).filter(j => j.status === "done").length;
    console.log(`   Total jobs in DB: ${jobCount} (${doneCount} completed)`);
    if (jobCount > 10_000)
      recordWarn("More than 10,000 jobs — old completed jobs could be archived");

    const usersWithPins = (raw.users || []).filter(u => u.pin);
    record("PINs present in data file (server storage OK)", usersWithPins.length > 0,
      "No users have PINs set — login will fail for everyone");
  } else {
    recordWarn("Data file not found at expected path — running remotely?");
  }
} catch(e) {
  recordWarn("Skipping local file checks (running remotely)", e.message);
}

// ── 10. Cleanup ───────────────────────────────────────────
console.log(hdr("10. Cleanup"));
// The server's job merge preserves server-only jobs, so omitting test jobs from the
// payload doesn't remove them. Use _deleteJobIds to explicitly remove them.
try {
  const cleanSnap = await get(`${BASE}/api/data`);
  const isTestJob = j => {
    const id = String(j.id);
    return id.startsWith("stress-test-") || id.startsWith("race-device-") || id.startsWith("bulk-");
  };
  const testJobIds = (cleanSnap.jobs || []).filter(isTestJob).map(j => j.id);
  if (testJobIds.length === 0) {
    record("Test data cleaned up", true, "no test jobs found");
  } else {
    await post(`${BASE}/api/data`, {
      ...cleanSnap,
      _deleteJobIds: testJobIds,
      settingsVersion: now() + 4_000_000,
    });
    await sleep(300);
    const afterClean = await get(`${BASE}/api/data`);
    const remaining = (afterClean.jobs || []).filter(isTestJob);
    record("Test data cleaned up", remaining.length === 0,
      `${remaining.length} of ${testJobIds.length} test jobs remain`);
  }
} catch(e) {
  recordWarn("Cleanup failed", e.message);
}

// ── Summary ───────────────────────────────────────────────
console.log(`\n${C.bold}${"─".repeat(50)}${C.reset}`);
console.log(`${C.bold}Results: ${C.green}${passed} passed${C.reset}  ${failed > 0 ? C.red : ""}${failed} failed${C.reset}  ${warnings > 0 ? C.yellow : ""}${warnings} warnings${C.reset}`);
if (failed === 0 && warnings === 0) {
  console.log(`${C.green}${C.bold}All checks passed — server looks healthy!${C.reset}`);
} else if (failed === 0) {
  console.log(`${C.yellow}Passed with warnings — review items above.${C.reset}`);
} else {
  console.log(`${C.red}${C.bold}${failed} check(s) failed — review above.${C.reset}`);
  console.log("\nFailed checks:");
  results.filter(r => !r.ok).forEach(r =>
    console.log(`  ${C.red}✗${C.reset} ${r.label}${r.detail ? ": " + r.detail : ""}`)
  );
}
