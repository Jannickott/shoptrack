import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = 3001;

const DATA_FILE   = path.join(__dirname, "shoptrack-data.json");
const PHOTOS_DIR  = path.join(__dirname, "photos");
const BACKUPS_DIR = path.join(__dirname, "backups");

if (!fs.existsSync(PHOTOS_DIR))  fs.mkdirSync(PHOTOS_DIR);
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);

// ── Daily backup ──────────────────────────────────────────
function runBackup() {
  if (!fs.existsSync(DATA_FILE)) return;
  const d     = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const dest  = path.join(BACKUPS_DIR, `shoptrack-data-${stamp}.json`);

  // ✦ Never overwrite an existing backup for the same day
  if (fs.existsSync(dest)) {
    console.log(`  ℹ Backup already exists for today — skipping.`);
    return;
  }

  // ✦ Only back up if the file has real data (jobs or users beyond default)
  try {
    const raw  = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    const hasData = (data.jobs && data.jobs.length > 0) ||
                    (data.users && data.users.length > 1) ||
                    (data.machines && data.machines.length > 0);
    if (!hasData) {
      console.log(`  ℹ Data file looks empty — skipping backup to protect previous backup.`);
      return;
    }
    fs.copyFileSync(DATA_FILE, dest);
    console.log(`  ✓ Backup saved: backups/shoptrack-data-${stamp}.json`);
    pruneBackups();
  } catch(e) {
    console.error("  ✗ Backup failed:", e.message);
  }
}

function pruneBackups() {
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith("shoptrack-data-") && f.endsWith(".json"))
    .sort();
  if (files.length > 30) {
    files.slice(0, files.length - 30).forEach(f => {
      fs.unlinkSync(path.join(BACKUPS_DIR, f));
    });
  }
}

function scheduleBackup() {
  runBackup();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  setInterval(runBackup, MS_PER_DAY);
}

scheduleBackup();

// ── Server-side auto-pause ────────────────────────────────
// Runs every 30 seconds. If any user has an autoPauseTime matching the
// current HH:MM, their active jobs are paused and forcedLogoutAt is set.
// This works even when no browser tab is open.
function runAutoPause() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const now  = new Date();
    const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    let changed = false;

    (data.users || []).forEach(u => {
      if (!u.autoPauseTime || u.autoPauseTime !== hhmm) return;
      // Avoid firing twice in the same minute
      if (u.lastAutoPausedAt) {
        const last = new Date(u.lastAutoPausedAt);
        const lastHhmm = `${String(last.getHours()).padStart(2,"0")}:${String(last.getMinutes()).padStart(2,"0")}`;
        if (lastHhmm === hhmm && last.toDateString() === now.toDateString()) return;
      }

      const nowMs = Date.now();
      console.log(`  ⏱  Auto-pause: pausing jobs for ${u.name} at ${hhmm}`);

      // Pause all active jobs belonging to this operator
      data.jobs = (data.jobs || []).map(j => {
        if (j.operatorId !== u.id || j.status === "done" || j.logoutPaused) return j;
        // Activate night mode countdown if armed
        if (j.nightMode && j.nightModeDuration && !j.nightModeEndsAt)
          return { ...j, nightModeEndsAt: nowMs + j.nightModeDuration * 1000, lastModifiedAt: nowMs };
        // Freeze the timer
        const setupSec  = (j.setupSec  || 0) + (j.status === "setup"       && j.phaseStartedAt ? Math.floor((nowMs - j.phaseStartedAt) / 1000) : 0);
        const runSec    = (j.runSec    || 0) + (j.status === "run"          && j.phaseStartedAt ? Math.floor((nowMs - j.phaseStartedAt) / 1000) : 0);
        const setupSec2 = (j.setupSec2 || 0) + (j.status === "side2_setup" && j.phaseStartedAt ? Math.floor((nowMs - j.phaseStartedAt) / 1000) : 0);
        const runSec2   = (j.runSec2   || 0) + (j.status === "side2_run"   && j.phaseStartedAt ? Math.floor((nowMs - j.phaseStartedAt) / 1000) : 0);
        return { ...j, logoutPaused: true, setupSec, runSec, setupSec2, runSec2, phaseStartedAt: null, lastModifiedAt: nowMs };
      });

      // Mark user as force-logged-out so browsers detect it on next poll
      data.users = data.users.map(x =>
        x.id === u.id ? { ...x, forcedLogoutAt: nowMs, lastAutoPausedAt: nowMs } : x
      );

      changed = true;
    });

    if (changed) {
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, DATA_FILE);
      console.log(`  ✓ Auto-pause complete — data saved.`);
    }
  } catch (e) {
    console.error("  ✗ Auto-pause error:", e.message);
  }
}

// Run every 30 seconds so we never miss a minute
setInterval(runAutoPause, 30 * 1000);

// ── Server-side machine downtime counter ──────────────────
// Runs every 30 seconds. Increments downtimeSec on active machine issues
// only during work hours — keeps running even when all browsers are closed.
let lastDowntimeTickAt = Date.now();
function runDowntimeTick() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!data.machineIssues || Object.keys(data.machineIssues).length === 0) {
      lastDowntimeTickAt = Date.now();
      return;
    }

    const now    = new Date();
    const hhmm   = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const wh     = data.workHours || {};
    const DAYS   = ["sun","mon","tue","wed","thu","fri","sat"];
    const dayKey = DAYS[now.getDay()];
    const dh     = wh[dayKey] || null;
    const inWork = !!(dh && dh.enabled && hhmm >= dh.start && hhmm < dh.end);

    const elapsedSec = Math.round((Date.now() - lastDowntimeTickAt) / 1000);
    lastDowntimeTickAt = Date.now();

    if (!inWork) return; // outside work hours — don't count

    let changed = false;
    Object.keys(data.machineIssues).forEach(k => {
      data.machineIssues[k] = {
        ...data.machineIssues[k],
        downtimeSec: (data.machineIssues[k].downtimeSec || 0) + elapsedSec,
        counting: true,
      };
      changed = true;
    });

    if (changed) {
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, DATA_FILE);
    }
  } catch (e) {
    console.error("  ✗ Downtime tick error:", e.message);
  }
}

setInterval(runDowntimeTick, 30 * 1000);

app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ── Serve photos ──────────────────────────────────────────
app.use("/photos", express.static(PHOTOS_DIR));

// ── Serve built React app ─────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));

// ── GET  /api/data ────────────────────────────────────────
app.get("/api/data", (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json(null);
  try { res.json(JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); }
  catch { res.json(null); }
});

// ── POST /api/data — merge jobs, then atomic write ────────
// Multi-device fix: instead of blindly overwriting, we merge the jobs list.
// Each job has a lastModifiedAt timestamp — whichever device has the newer
// version of a job wins. Jobs unknown to this device (created on another
// device between its last poll) are always preserved.
// Settings (users, machines, workHours etc.) come from the incoming request
// as before — they are only changed by admin, so the last admin save wins.
app.post("/api/data", (req, res) => {
  try {
    const incoming = req.body;

    // Read the current server state so we can merge jobs
    let serverJobs = [];
    if (fs.existsSync(DATA_FILE)) {
      try {
        const current = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
        serverJobs = current.jobs || [];
      } catch(e) { /* corrupt file — start fresh merge from incoming */ }
    }

    // Build a map of server jobs by ID
    const jobMap = new Map();
    serverJobs.forEach(j => jobMap.set(j.id, j));

    // Merge incoming jobs: newer lastModifiedAt wins; missing jobs are added
    (incoming.jobs || []).forEach(j => {
      const existing = jobMap.get(j.id);
      if (!existing || (j.lastModifiedAt || 0) >= (existing.lastModifiedAt || 0)) {
        jobMap.set(j.id, j);
      }
    });

    const merged  = { ...incoming, jobs: Array.from(jobMap.values()) };
    const json    = JSON.stringify(merged, null, 2);
    const tmpFile = DATA_FILE + ".tmp";
    fs.writeFileSync(tmpFile, json);
    fs.renameSync(tmpFile, DATA_FILE);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/photo ───────────────────────────────────────
app.post("/api/photo", (req, res) => {
  try {
    const { filename, data } = req.body;
    const base64 = data.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(path.join(PHOTOS_DIR, filename), Buffer.from(base64, "base64"));
    res.json({ url: `/photos/${filename}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Fallback to React app ─────────────────────────────────
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ⚙  ShopTrack server running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  const nets = Object.values(os.networkInterfaces()).flat();
  nets.filter(n => n.family === "IPv4" && !n.internal)
      .forEach(n => console.log(`  Network: http://${n.address}:${PORT}`));
  console.log();
});
