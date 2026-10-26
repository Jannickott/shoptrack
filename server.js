import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = 3001;

const DATA_FILE      = path.join(__dirname, "shoptrack-data.json");
const PHOTOS_DIR     = path.join(__dirname, "photos");
const BACKUPS_DIR    = path.join(__dirname, "backups");
const SETUPSHEETS_DIR = path.join(__dirname, "setupsheets");

if (!fs.existsSync(PHOTOS_DIR))      fs.mkdirSync(PHOTOS_DIR);
if (!fs.existsSync(BACKUPS_DIR))     fs.mkdirSync(BACKUPS_DIR);
if (!fs.existsSync(SETUPSHEETS_DIR)) fs.mkdirSync(SETUPSHEETS_DIR);

// ── Backups: morning (06:00) and evening (16:00) every day ───────────────────
// Filenames include the slot so both are kept: shoptrack-data-2026-09-17-morning.json
const BACKUP_SLOTS = [
  { hh: 6,  label: "morning" },
  { hh: 16, label: "evening" },
];

function runBackup(label) {
  if (!fs.existsSync(DATA_FILE)) return;
  const d     = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const dest  = path.join(BACKUPS_DIR, `shoptrack-data-${stamp}-${label}.json`);

  if (fs.existsSync(dest)) {
    console.log(`  ℹ ${label} backup already exists for today — skipping.`);
    return;
  }

  try {
    const raw  = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    const hasData = (data.jobs && data.jobs.length > 0) ||
                    (data.users && data.users.length > 1) ||
                    (data.machines && data.machines.length > 0);
    if (!hasData) {
      console.log(`  ℹ Data looks empty — skipping ${label} backup to protect previous backup.`);
      return;
    }
    fs.copyFileSync(DATA_FILE, dest);
    console.log(`  ✓ ${label.charAt(0).toUpperCase()+label.slice(1)} backup saved: shoptrack-data-${stamp}-${label}.json`);
    pruneBackups();
    copyBackupElsewhere();
  } catch(e) {
    console.error(`  ✗ ${label} backup failed:`, e.message);
  }
}

function pruneBackups() {
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith("shoptrack-data-") && f.endsWith(".json"))
    .sort();
  // Keep the last 60 files (≈ 30 days × 2 slots)
  if (files.length > 60) {
    files.slice(0, files.length - 60).forEach(f => {
      fs.unlinkSync(path.join(BACKUPS_DIR, f));
    });
  }
}

// ── Second backup location (another disk, OneDrive, network drive, USB) ───────
// Backups next to the data file die with the same disk. If shoptrack-config.json
// has "backupCopyDir", every backup is also copied there, along with any new
// photos. The config file is per server and not in git.
const CONFIG_FILE = path.join(__dirname, "shoptrack-config.json");

function backupCopyDir() {
  // Strip a BOM — Notepad and PowerShell like to add one
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8").replace(/^﻿/, "")).backupCopyDir || null; }
  catch { return null; }
}

// Copy files that are new or changed size — photos never change once written
function mirrorDir(src, dst) {
  let copied = 0;
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copied += mirrorDir(s, d);
    else if (!fs.existsSync(d) || fs.statSync(d).size !== fs.statSync(s).size) { fs.copyFileSync(s, d); copied++; }
  }
  return copied;
}

// Copies the whole backups folder, so a backup missed while the second location
// was unreachable (USB unplugged, network down) is caught up next time
let lastCopy = null; // { at, ok, error } — shown on the admin's server status
function copyBackupElsewhere() {
  const dir = backupCopyDir();
  if (!dir) return;
  lastCopy = { at: Date.now(), ok: false, error: "" };
  try {
    const bdir = path.join(dir, "backups");
    const files = mirrorDir(BACKUPS_DIR, bdir);
    // Keep more history here than locally (≈ 3 months)
    const all = fs.readdirSync(bdir).filter(f => f.startsWith("shoptrack-data-") && f.endsWith(".json")).sort();
    all.slice(0, Math.max(0, all.length - 180)).forEach(f => fs.unlinkSync(path.join(bdir, f)));
    const photos = mirrorDir(PHOTOS_DIR, path.join(dir, "photos"));
    console.log(`  ✓ Copied to ${dir}: ${files} backup file${files === 1 ? "" : "s"}, ${photos} photo file${photos === 1 ? "" : "s"}`);
    lastCopy.ok = true;
  } catch (e) {
    console.error(`  ✗ Could not copy backups to ${dir}:`, e.message);
    lastCopy.error = e.message;
  }
}

console.log(backupCopyDir()
  ? `  ℹ Second backup location: ${backupCopyDir()}`
  : `  ⚠ No second backup location — set "backupCopyDir" in shoptrack-config.json`);

// Check every minute whether a backup slot is due
let lastBackupSlot = "";
function checkBackupSchedule() {
  const now  = new Date();
  const hh   = now.getHours();
  const mm   = now.getMinutes();
  if (mm !== 0) return; // only fire on the hour
  const slot = BACKUP_SLOTS.find(s => s.hh === hh);
  if (!slot) return;
  const key = `${now.toDateString()}-${slot.label}`;
  if (key === lastBackupSlot) return; // already ran this slot today
  lastBackupSlot = key;
  runBackup(slot.label);
}

// Run a startup backup (labelled "startup") so there's always one on server restart
runBackup("startup");
copyBackupElsewhere(); // catch up even if today's startup backup already existed
setInterval(checkBackupSchedule, 60 * 1000);

// Tool types from the old English preset list → the Danish names the app now offers
// (only exact preset names; types someone typed themselves are left alone)
const TOOL_TYPE_DA = { "Endmill": "Endefræser", "Drill": "Bor", "Insert": "Skær", "Turning Tool": "Drejestål",
  "Boring Bar": "Borestang", "Reamer": "Rival", "Tap": "Gevindtap", "Thread Mill": "Gevindfræser",
  "Face Mill": "Planfræser", "Grooving Tool": "Stikstål", "Countersink": "Undersænker", "Center Drill": "Centerbor" };
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    let renamed = 0;
    (data.tools || []).forEach(t => { if (TOOL_TYPE_DA[t.toolType]) { t.toolType = TOOL_TYPE_DA[t.toolType]; renamed++; } });
    if (renamed) {
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, DATA_FILE);
      console.log(`  ✓ Renamed ${renamed} tool type${renamed === 1 ? "" : "s"} to Danish`);
    }
  } catch (e) { console.error("  ✗ Tool type rename failed:", e.message); }
}

// Move any inline photos out of the data file (runs after the startup backup)
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const before = fs.statSync(DATA_FILE).size;
    if (externalizePhotos(data) > 0) {
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, DATA_FILE);
      const after = fs.statSync(DATA_FILE).size;
      console.log(`  ✓ Moved inline photos to photos/inline/ — data file ${(before/1e6).toFixed(1)} MB → ${(after/1e6).toFixed(1)} MB`);
    }
  } catch (e) { console.error("  ✗ Photo cleanup failed:", e.message); }
}

// ── Server-side auto-pause ────────────────────────────────
// Runs every 30 seconds. If any user has an autoPauseTime matching the
// current HH:MM, their active jobs are paused and forcedLogoutAt is set.
// This works even when no browser tab is open.
// Goes through enqueueWrite so it never races with concurrent POST /api/data saves.
function runAutoPause() {
  if (!fs.existsSync(DATA_FILE)) return;
  enqueueWrite(() => {
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
  });
}

// Run every 30 seconds so we never miss a minute
setInterval(runAutoPause, 30 * 1000);

// ── Server-side machine downtime counter ──────────────────
// Runs every 30 seconds. Increments downtimeSec on active machine issues
// only during work hours — keeps running even when all browsers are closed.
// Goes through enqueueWrite so it never races with concurrent POST /api/data saves.
let lastDowntimeTickAt = Date.now();
function runDowntimeTick() {
  if (!fs.existsSync(DATA_FILE)) return;
  const tickStart = Date.now();
  enqueueWrite(() => {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (!data.machineIssues || Object.keys(data.machineIssues).length === 0) {
        lastDowntimeTickAt = tickStart;
        return;
      }

      const now    = new Date();
      const hhmm   = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      const wh     = data.workHours || {};
      const DAYS   = ["sun","mon","tue","wed","thu","fri","sat"];
      const dayKey = DAYS[now.getDay()];
      // Legacy single {start,end} format applies to every day (same as the app)
      const dh     = wh[dayKey] || (wh.start ? { start: wh.start, end: wh.end, enabled: true } : null);
      const inWork = !!(dh && dh.enabled && hhmm >= dh.start && hhmm < dh.end);

      const elapsedSec = Math.round((tickStart - lastDowntimeTickAt) / 1000);
      lastDowntimeTickAt = tickStart;

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
  });
}

setInterval(runDowntimeTick, 30 * 1000);

// The app is served by this server, so it never needs cross-origin access.
// No CORS headers means other websites can't read the data; and changes coming
// from a page on another site (Origin doesn't match) are refused outright —
// otherwise any web page opened on a shop tablet could talk to ShopTrack.
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* bad header */ }
    if (host !== req.headers.host) return res.status(403).json({ error: "Cross-site request refused" });
  }
  next();
});
app.use(express.json({ limit: "25mb" }));

// ── Serve photos ──────────────────────────────────────────
app.use("/photos", express.static(PHOTOS_DIR));

// ── Serve built React app ─────────────────────────────────
app.use(express.static(path.join(__dirname, "dist")));

// ── Write queue — serialises all /api/data POSTs ─────────
// With 8+ devices saving every 3 s, concurrent saves race to read-merge-write.
// A simple async queue ensures each save completes before the next starts.
let writeQueue = Promise.resolve();
const enqueueWrite = (fn) => { writeQueue = writeQueue.then(fn).catch(() => {}); return writeQueue; };

// ── GET  /api/health ─────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now(), version: APP_VERSION }));

// ── App version — tablets compare it to spot an update ───
// dist/index.html points at the content-hashed JS/CSS, so it changes on every
// build that changes the app. Sent as a header on every /api/data response.
const APP_VERSION = (() => {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(__dirname, "dist", "index.html"))).digest("hex").slice(0, 12);
  } catch { return "dev"; }
})();
app.use("/api/data", (_req, res, next) => { res.setHeader("X-App-Version", APP_VERSION); next(); });

// ── GET  /api/data ────────────────────────────────────────
// PINs are kept on disk but stripped from the response so no client can read them.
app.get("/api/data", (_req, res) => {
  if (!fs.existsSync(DATA_FILE)) return res.json(null);
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (Array.isArray(data.users)) {
      data.users = data.users.map(({ pin: _pin, ...rest }) => rest);
    }
    res.json(data);
  } catch { res.json(null); }
});

// ── POST /api/verify-pin ──────────────────────────────────
// A 4-digit PIN has only 10,000 combinations, so limit wrong guesses:
// after 5 wrong PINs for a user from one device, that user is locked there for 1 minute.
const PIN_MAX_FAILS = 5, PIN_LOCK_MS = 60 * 1000;
const pinFails = new Map(); // `${ip}|${userId}` -> { count, lockedUntil }

app.post("/api/verify-pin", (req, res) => {
  try {
    const { userId, pin } = req.body;
    if (!userId || !pin) return res.status(400).json({ ok: false });
    const key = `${req.ip}|${userId}`;
    const f = pinFails.get(key);
    if (f && f.lockedUntil > Date.now()) {
      return res.status(429).json({ ok: false, locked: true, retryInSec: Math.ceil((f.lockedUntil - Date.now()) / 1000) });
    }
    if (!fs.existsSync(DATA_FILE)) return res.json({ ok: false });
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const user = (data.users || []).find(u => u.id === userId);
    const ok = !!(user && user.pin === pin);
    if (ok) {
      pinFails.delete(key);
    } else {
      const count = (f && f.lockedUntil <= Date.now() && f.count >= PIN_MAX_FAILS ? 0 : (f?.count || 0)) + 1;
      pinFails.set(key, { count, lockedUntil: count >= PIN_MAX_FAILS ? Date.now() + PIN_LOCK_MS : 0 });
    }
    res.json({ ok });
  } catch { res.status(500).json({ ok: false }); }
});

// ── POST /api/data — queued safe merge, then atomic write ─
// tools are not in here: the server owns them and they only change through /api/tool-op
const ARRAY_KEYS  = ["users","machines","departments","cabinets","setupSheets","workShifts"];
const OBJECT_KEYS = ["workHours","efficiencyGoals","planSettings"];

// Logs are append-only, so merge by id instead of letting the last tablet to save
// replace the whole list. An edited entry carries updatedAt — newest edit wins.
function unionById(serverArr, incomingArr) {
  const map = new Map();
  (serverArr || []).forEach(e => map.set(e.id, e));
  (incomingArr || []).forEach(e => {
    const ex = map.get(e.id);
    if (!ex || (e.updatedAt || 0) >= (ex.updatedAt || 0)) map.set(e.id, e);
  });
  return Array.from(map.values()).sort((a, b) => (a.id || 0) - (b.id || 0));
}

// Machine issues: merge per machine. The server owns downtimeSec (its 30 s tick),
// and an issue is gone once its resolve entry is in downtimeLog — so a tablet that
// hasn't polled yet can neither bring a resolved issue back nor reset the counter.
function mergeIssues(serverIssues, incomingIssues, downtimeLog) {
  const resolved = new Set((downtimeLog || []).map(d => `${d.machineName}|${d.reportedAt}`));
  const s = serverIssues || {}, inc = incomingIssues || {};
  const out = {};
  new Set([...Object.keys(s), ...Object.keys(inc)]).forEach(k => {
    const a = s[k], b = inc[k];
    let pick;
    if (a && b && a.reportedAt === b.reportedAt) {
      pick = (b.updatedAt || 0) >= (a.updatedAt || 0) ? { ...b, downtimeSec: a.downtimeSec || 0 } : a;
    } else if (a && b) {
      pick = (b.reportedAt || 0) > (a.reportedAt || 0) ? b : a;
    } else {
      pick = a || b;
    }
    if (!resolved.has(`${k}|${pick.reportedAt}`)) out[k] = pick;
  });
  return out;
}

function mergeAndWrite(incoming) {
  if (!incoming || typeof incoming !== "object" ||
      (incoming.jobs !== undefined && !Array.isArray(incoming.jobs))) {
    throw new Error("Invalid payload");
  }

  let server = {};
  if (fs.existsSync(DATA_FILE)) {
    try { server = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
    catch(e) { /* corrupt — treat as empty */ }
  }

  // Merge jobs: newest lastModifiedAt wins; server-only jobs preserved
  const jobMap = new Map();
  (server.jobs || []).forEach(j => jobMap.set(j.id, j));
  (incoming.jobs || []).forEach(j => {
    const ex = jobMap.get(j.id);
    if (!ex || (j.lastModifiedAt || 0) >= (ex.lastModifiedAt || 0)) jobMap.set(j.id, j);
  });

  // _deleteJobIds: explicit list of job IDs to remove (used by admin archival / cleanup)
  if (Array.isArray(incoming._deleteJobIds)) {
    incoming._deleteJobIds.forEach(id => jobMap.delete(id));
  }

  const merged = { ...incoming, jobs: Array.from(jobMap.values()) };
  delete merged._deleteJobIds; // never persist this field

  const serverSV   = server.settingsVersion  || 0;
  const incomingSV = incoming.settingsVersion || 0;

  if (incomingSV < serverSV) {
    console.log(`  ⚠ Rejected stale settings (client v${incomingSV} < server v${serverSV})`);
    ARRAY_KEYS.forEach(k  => { if (server[k] !== undefined) merged[k] = server[k]; });
    OBJECT_KEYS.forEach(k => { if (server[k] !== undefined) merged[k] = server[k]; });
  } else {
    ARRAY_KEYS.forEach(k => {
      const inc = incoming[k];
      if (!Array.isArray(inc) || inc.length === 0) {
        if (server[k] && server[k].length > 0) merged[k] = server[k];
      }
    });
    OBJECT_KEYS.forEach(k => {
      const inc = incoming[k];
      if (!inc || typeof inc !== "object" || Object.keys(inc).length === 0) {
        if (server[k] && Object.keys(server[k]).length > 0) merged[k] = server[k];
      }
    });
  }

  // Tablets' copies of tools are ignored (bootstrap from the first one if the server has none)
  merged.tools = server.tools !== undefined ? server.tools : (incoming.tools || []);

  merged.downtimeLog   = unionById(server.downtimeLog, incoming.downtimeLog);
  merged.toolLog       = unionById(server.toolLog, incoming.toolLog);
  // Planning orders: per order, newest updatedAt wins (deleting sets deleted:true)
  merged.planOrders    = unionById(server.planOrders, incoming.planOrders);
  // Tasks (Opgaver): same rule — per task, newest updatedAt wins (deleting sets deleted:true)
  merged.tasks         = unionById(server.tasks, incoming.tasks);
  // Maintenance (Vedligehold): points per machine + the record of every check — same rule
  merged.maintTasks    = unionById(server.maintTasks, incoming.maintTasks);
  merged.maintLog      = unionById(server.maintLog, incoming.maintLog);
  merged.machineIssues = mergeIssues(server.machineIssues, incoming.machineIssues, merged.downtimeLog);

  merged.settingsVersion = Math.max(serverSV, incomingSV);

  // Clients never receive PINs (stripped in GET), so restore them from server copy
  if (Array.isArray(merged.users) && Array.isArray(server.users)) {
    const serverPins = new Map(server.users.map(u => [u.id, u.pin]));
    merged.users = merged.users.map(u =>
      (!u.pin && serverPins.has(u.id)) ? { ...u, pin: serverPins.get(u.id) } : u
    );
  }

  externalizePhotos(merged);

  const tmpFile = DATA_FILE + ".tmp";
  fs.writeFileSync(tmpFile, JSON.stringify(merged, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

app.post("/api/data", (req, res) => {
  const incoming = req.body;
  enqueueWrite(() => {
    try { mergeAndWrite(incoming); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// ── Weekly report (PDF) ───────────────────────────────────
// Made automatically every Monday 06:05 for last week (saved in reports/ and copied
// to the second backup location), and on request: GET /api/report/week?start=YYYY-MM-DD
const REPORTS_DIR = path.join(__dirname, "reports");
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR);

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function mondayOf(d) { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }
function isoWeek(d) { const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); const w1 = new Date(t.getFullYear(), 0, 4); return 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7); }
// Work seconds between two times (same rules as the app: per-day hours, or the old single start/end)
function workSecBetween(wh, from, to) {
  let total = 0; const cur = new Date(from); cur.setHours(0, 0, 0, 0);
  while (cur < to) {
    const dh = (wh || {})[DAY_KEYS[cur.getDay()]] || (wh && wh.start ? { start: wh.start, end: wh.end, enabled: true } : null);
    if (dh && dh.enabled && dh.start && dh.end) {
      const [sh, sm] = dh.start.split(":").map(Number), [eh, em] = dh.end.split(":").map(Number);
      const s = new Date(cur); s.setHours(sh, sm, 0, 0); const e = new Date(cur); e.setHours(eh, em, 0, 0);
      const a = Math.max(s, from), b = Math.min(e, to); if (b > a) total += (b - a) / 1000;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}
const hm = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}t ${m}m` : `${m}m`; };
const runAll = j => (j.runSec || 0) + (j.runSec2 || 0);
const setupAll = j => (j.setupSec || 0) + (j.setupSec2 || 0);

// The numbers for one week (Monday 00:00 → next Monday)
function weekReportData(data, monday) {
  const start = monday.getTime(), endD = new Date(monday); endD.setDate(endD.getDate() + 7); const end = endD.getTime();
  const hidden = (data.efficiencyGoals && data.efficiencyGoals.hiddenMachines) || [];
  const machines = (data.machines || []).filter(m => m.active && !m.removed && !hidden.includes(m.name));
  // Task jobs (prototypes and small projects, done when there is time) are kept out of the figures
  const jobs = (data.jobs || []).filter(j => !j.deleted && !j.taskId && (j.createdAt || 0) >= start && (j.createdAt || 0) < end);
  const availPerMachine = workSecBetween(data.workHours, new Date(start), new Date(end));
  const downtime = (data.downtimeLog || []).filter(d => (d.resolvedAt || 0) >= start && (d.resolvedAt || 0) < end);
  const perMachine = machines.map(m => {
    const mj = jobs.filter(j => j.machine === m.name);
    const run = mj.reduce((s, j) => s + runAll(j), 0), setup = mj.reduce((s, j) => s + setupAll(j), 0);
    const down = downtime.filter(d => d.machineName === m.name).reduce((s, d) => s + (d.downtimeSec || 0), 0);
    return { name: m.name, department: m.department || "", run, setup, down, jobs: mj.length,
      eff: availPerMachine > 0 ? Math.round(run / availPerMachine * 100) : null };
  });
  const run = perMachine.reduce((s, m) => s + m.run, 0), setup = perMachine.reduce((s, m) => s + m.setup, 0);
  const totalAvail = availPerMachine * Math.max(machines.length, 1);
  const ops = {};
  jobs.filter(j => j.status === "done").forEach(j => {
    const o = ops[j.operatorName || "?"] = ops[j.operatorName || "?"] || { name: j.operatorName || "?", jobs: 0, pieces: 0, run: 0 };
    o.jobs++; o.pieces += Math.max(j.pieces || 0, j.pieces2 || 0); o.run += runAll(j);
  });
  const target = (data.efficiencyGoals && data.efficiencyGoals.week) ?? 75;
  const lowTools = (data.tools || []).filter(t => t.active && !t.returnable && t.quantity <= (t.minQuantity || 0) && !t.ordered);
  return {
    week: isoWeek(monday), year: mondayOf(monday).getFullYear(), start, end, target,
    eff: totalAvail > 0 ? Math.round(run / totalAvail * 100) : null, run, setup,
    downtime: downtime.reduce((s, d) => s + (d.downtimeSec || 0), 0), downtimeList: downtime,
    finished: jobs.filter(j => j.status === "done"), started: jobs.length,
    perMachine, operators: Object.values(ops).sort((a, b) => b.run - a.run), lowTools,
  };
}

// Draw the report into a PDFKit document
function writeWeekReport(doc, r) {
  const W = doc.page.width - 90, AMBER = "#b07d00", DARK = "#1a1a1a", GREY = "#555555", LINE = "#dddddd";
  const dk = t => new Date(t).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  doc.rect(45, 40, W, 58).fill("#1a2233");
  doc.fillColor("#f0a500").fontSize(20).font("Helvetica-Bold").text(`Ugerapport — uge ${r.week} ${r.year}`, 56, 50);
  doc.fillColor("#aaaacc").fontSize(10).font("Helvetica").text(`${dk(r.start)} – ${dk(r.end - 1)}  ·  ShopTrack`, 56, 76);
  let y = 115;
  const section = t => { if (y > 740) { doc.addPage(); y = 50; } doc.moveTo(45, y).lineTo(45 + W, y).strokeColor(LINE).lineWidth(1).stroke(); doc.fillColor(AMBER).fontSize(9).font("Helvetica-Bold").text(t, 45, y + 6, { characterSpacing: 1.5 }); y += 24; };
  const row = (cols, xs, bold) => { if (y > 770) { doc.addPage(); y = 50; } doc.fillColor(bold ? GREY : DARK).fontSize(bold ? 8 : 9.5).font(bold ? "Helvetica-Bold" : "Helvetica"); cols.forEach((c, i) => doc.text(String(c), xs[i], y, { width: (xs[i + 1] || 45 + W) - xs[i] - 6, lineBreak: false, ellipsis: true })); y += bold ? 14 : 15; };

  // Key numbers
  const boxes = [
    [r.eff == null ? "–" : `${r.eff}%`, `Effektivitet (mål ${r.target}%)`, r.eff == null ? GREY : r.eff >= r.target ? "#1e8449" : "#c0392b"],
    [hm(r.run), "Produktion", DARK], [hm(r.setup), "Opstilling", DARK], [hm(r.downtime), "Nedetid", r.downtime ? "#c0392b" : DARK],
    [String(r.finished.length), `Job afsluttet (${r.started} startet)`, DARK],
  ];
  const bw = W / boxes.length;
  boxes.forEach(([v, l, c], i) => {
    doc.rect(45 + i * bw + 2, y, bw - 4, 50).fill("#f4f4f4");
    doc.fillColor(c).fontSize(16).font("Helvetica-Bold").text(v, 45 + i * bw + 8, y + 8, { width: bw - 16 });
    doc.fillColor(GREY).fontSize(7.5).font("Helvetica").text(l, 45 + i * bw + 8, y + 32, { width: bw - 16 });
  });
  y += 66;

  section("MASKINER");
  const mx = [45, 150, 250, 320, 390, 460, 510];
  row(["Maskine", "Afdeling", "Produktion", "Opstilling", "Nedetid", "Job", "Eff."], mx, true);
  r.perMachine.forEach(m => row([m.name, m.department, hm(m.run), hm(m.setup), hm(m.down), m.jobs, m.eff == null ? "–" : m.eff + "%"], mx));
  y += 6;

  section("OPERATØRER");
  const ox = [45, 220, 300, 380];
  row(["Operatør", "Job afsluttet", "Stk.", "Produktion"], ox, true);
  if (!r.operators.length) row(["Ingen afsluttede job denne uge"], ox);
  r.operators.forEach(o => row([o.name, o.jobs, o.pieces, hm(o.run)], ox));
  y += 6;

  section("MASKINFEJL");
  const fx = [45, 130, 330, 420, 480];
  if (!r.downtimeList.length) row(["Ingen fejl løst denne uge"], fx);
  else { row(["Maskine", "Fejl", "Meldt af", "Løst", "Nedetid"], fx, true); r.downtimeList.forEach(d => row([d.machineName, d.reason || (d.status === "down" ? "Maskine nede" : "Reparation"), d.reportedBy || "", dk(d.resolvedAt), hm(d.downtimeSec)], fx)); }
  y += 6;

  section("AFSLUTTEDE JOB");
  const jx = [45, 160, 260, 330, 400, 450, 510];
  if (!r.finished.length) row(["Ingen"], jx);
  else { row(["Kunde", "Tegningsnr.", "Maskine", "Operatør", "Stk.", "Tid", "Eff."], jx, true);
    r.finished.sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0)).forEach(j => { const t = runAll(j) + setupAll(j); row([j.customer || "", j.job || "", j.machine || "", j.operatorName || "", Math.max(j.pieces || 0, j.pieces2 || 0), hm(t), t ? Math.round(runAll(j) / t * 100) + "%" : "–"], jx); }); }
  y += 6;

  if (r.lowTools.length) {
    section("VÆRKTØJ DER SKAL BESTILLES");
    const tx = [45, 300, 380];
    row(["Værktøj", "På lager", "Genbestil under"], tx, true);
    r.lowTools.forEach(t => row([t.name, t.quantity, t.minQuantity || 0], tx));
  }
  // Footer below the normal text area — lift the bottom margin so it doesn't start a new page
  const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0;
  doc.fillColor(GREY).fontSize(7).font("Helvetica").text(`Lavet ${new Date().toLocaleString("da-DK")} · Effektivitet = produktionstid ÷ arbejdstid × maskiner`, 45, doc.page.height - 32, { width: W, align: "center", lineBreak: false });
  doc.page.margins.bottom = bottom;
}

app.get("/api/report/week", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const monday = mondayOf(req.query.start ? new Date(req.query.start + "T12:00:00") : new Date(Date.now() - 7 * 864e5));
    const r = weekReportData(data, monday);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="ShopTrack uge ${r.week} ${r.year}.pdf"`);
    const doc = new PDFDocument({ margin: 45, size: "A4" });
    doc.pipe(res); writeWeekReport(doc, r); doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Every Monday 06:05: last week's report → reports/ (+ second backup location, e.g. OneDrive)
let lastWeeklyKey = "";
function saveWeeklyReport(monday) {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const r = weekReportData(data, monday);
  const name = `ShopTrack uge ${r.week} ${r.year}.pdf`, file = path.join(REPORTS_DIR, name);
  const doc = new PDFDocument({ margin: 45, size: "A4" });
  const out = fs.createWriteStream(file);
  doc.pipe(out); writeWeekReport(doc, r); doc.end();
  out.on("finish", () => {
    console.log(`  ✓ Weekly report saved: ${name}`);
    const dir = backupCopyDir();
    if (dir) { try { fs.mkdirSync(path.join(dir, "reports"), { recursive: true }); fs.copyFileSync(file, path.join(dir, "reports", name)); console.log(`  ✓ Weekly report copied to ${dir}`); } catch (e) { console.error("  ✗ Could not copy weekly report:", e.message); } }
  });
}
setInterval(() => {
  const now = new Date();
  if (now.getDay() !== 1 || now.getHours() !== 6 || now.getMinutes() !== 5) return;
  const key = now.toDateString(); if (key === lastWeeklyKey) return; lastWeeklyKey = key;
  try { saveWeeklyReport(mondayOf(new Date(now.getTime() - 7 * 864e5))); } catch (e) { console.error("  ✗ Weekly report failed:", e.message); }
}, 60 * 1000);

// ── Photos: keep them as files, not inside the data file ──
// Inline base64 photos make every save send megabytes and eventually hit the
// 25 MB request limit. Any inline photo that reaches the server is written to
// photos/inline/ (named by content, so the same photo is stored once) and
// replaced by its URL. Tablets pick up the URL on their next poll.
function externalizePhotos(data) {
  let count = 0;
  const toFile = dataUrl => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image")) return dataUrl;
    const m = dataUrl.match(/^data:image\/(\w+);base64,/);
    const ext = m && m[1] === "png" ? "png" : "jpg";
    const rel = `inline/${crypto.createHash("sha1").update(dataUrl).digest("hex").slice(0, 20)}.${ext}`;
    const filePath = path.join(PHOTOS_DIR, rel);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64"));
    }
    count++;
    return `/photos/${rel}`;
  };
  (data.tools || []).forEach(t => { if (t.photoData) t.photoData = toFile(t.photoData); });
  (data.cabinets || []).forEach(c => { if (c.photoData) c.photoData = toFile(c.photoData); });
  (data.setupSheets || []).forEach(s => (s.photos || []).forEach(p => { if (p.url) p.url = toFile(p.url); }));
  (data.tasks || []).forEach(t => { if (t.photo) t.photo = toFile(t.photo); });
  (data.jobs || []).forEach(j => {
    if (j.photoData)  j.photoData  = toFile(j.photoData);
    if (j.photoData2) j.photoData2 = toFile(j.photoData2);
  });
  return count;
}

// ── POST /api/tool-op — every tool change goes through here ──
// Applied one at a time on the server, so two tablets taking from the same tool
// both count: "take 2" is sent as a change, not as "quantity is now 8".
function applyToolOp(data, op) {
  data.tools   = data.tools   || [];
  data.toolLog = data.toolLog || [];
  const i = data.tools.findIndex(t => String(t.id) === String(op.toolId));
  if (op.type === "add") {
    if (!data.tools.some(t => String(t.id) === String(op.tool.id))) data.tools.push(op.tool);
  } else if (op.type === "delete") {
    if (i >= 0) data.tools.splice(i, 1);
  } else if (op.type === "update") {
    if (i < 0) throw new Error("Tool not found");
    const t = { ...data.tools[i], ...(op.set || {}) };
    Object.entries(op.inc || {}).forEach(([k, v]) => { t[k] = Math.max(0, (t[k] || 0) + v); });
    if (op.checkout) t.checkedOutBy = [...(t.checkedOutBy || []), op.checkout];
    if (op.returnBy !== undefined) {
      const by = t.checkedOutBy || [];
      const idx = by.findIndex(x => x.operatorId === op.returnBy);
      t.checkedOutBy = idx >= 0 ? [...by.slice(0, idx), ...by.slice(idx + 1)] : by.slice(0, -1);
    }
    data.tools[i] = t;
  } else {
    throw new Error("Unknown tool op");
  }
  if (op.log && !data.toolLog.some(e => e.id === op.log.id)) data.toolLog.push(op.log);
}

app.post("/api/tool-op", (req, res) => {
  const op = req.body;
  enqueueWrite(() => {
    try {
      const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) : {};
      applyToolOp(data, op);
      externalizePhotos(data);
      const tmp = DATA_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, DATA_FILE);
      res.json({ ok: true, tools: data.tools });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
});

// ── Serve setup sheet PDFs ────────────────────────────────
app.use("/setupsheets", express.static(SETUPSHEETS_DIR));

// ── POST /api/setupsheet-pdf ──────────────────────────────
// Called automatically whenever a setup sheet is saved.
// Generates a formatted PDF and writes it to setupsheets/.
app.post("/api/setupsheet-pdf", (req, res) => {
  try {
    const { sheet } = req.body;
    if (!sheet) return res.status(400).json({ error: "No sheet data" });

    const safe = s => (s || "").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
    const rc   = pos => (sheet.restartPrefix || "NAT") + String(pos).padStart(sheet.restartPad || 2, "0");
    const filename = `${safe(sheet.partNumber)}_${safe(sheet.machine)}.pdf`;
    const filePath = path.join(SETUPSHEETS_DIR, filename);

    const doc = new PDFDocument({ margin: 45, size: "A4" });
    const out = fs.createWriteStream(filePath);
    doc.pipe(out);

    const W = doc.page.width - 90; // usable width
    const AMBER = "#b07d00";
    const DARK  = "#1a1a1a";
    const GREY  = "#555555";
    const LINE  = "#dddddd";

    // ── Header ─────────────────────────────────────────────
    doc.rect(45, 40, W, 54).fill("#1a2233");
    doc.fillColor("#f0a500").fontSize(20).font("Helvetica-Bold")
       .text(sheet.partNumber || "—", 56, 48, { width: W - 12 });
    const sub = [sheet.customer, sheet.machine, sheet.material,
                 sheet.operation && `Op. ${sheet.operation}`].filter(Boolean).join("  ·  ");
    doc.fillColor("#aaaacc").fontSize(10).font("Helvetica")
       .text(sub, 56, 72, { width: W - 12 });
    doc.fillColor(DARK);

    let y = 112;
    const sectionTitle = (title) => {
      doc.moveTo(45, y).lineTo(45 + W, y).strokeColor(LINE).lineWidth(1).stroke();
      doc.fillColor(AMBER).fontSize(8).font("Helvetica-Bold")
         .text(title, 45, y + 5, { characterSpacing: 1.5 });
      y += 20;
    };
    const field = (label, value) => {
      doc.fillColor(GREY).fontSize(8).font("Helvetica").text(label, 45, y, { width: 110 });
      doc.fillColor(DARK).font("Helvetica-Bold").text(value, 160, y, { width: W - 115 });
      y += 14;
    };

    // ── Program name (prominent) ───────────────────────────
    if (sheet.subProgram) {
      doc.rect(45, y, W, 46).fill("#fffbea").stroke("#b07d00");
      doc.fillColor("#888888").fontSize(7.5).font("Helvetica")
         .text("PROGRAMNAVN", 56, y + 7, { characterSpacing: 1.5 });
      doc.fillColor("#b07d00").fontSize(22).font("Helvetica-Bold")
         .text(sheet.subProgram, 56, y + 18, { width: W - 20, characterSpacing: 2 });
      y += 56;
    }

    // ── Identity ───────────────────────────────────────────
    sectionTitle("IDENTIFIKATION");
    [["Maskine", sheet.machine], ["Kunde", sheet.customer],
     ["Materiale", sheet.material], ["Revision", sheet.revision],
     ["Operation", sheet.operation], ["Planprogram", sheet.planProgram]]
      .filter(([, v]) => v)
      .forEach(([k, v]) => field(k, v));
    y += 6;

    // ── Tool list ──────────────────────────────────────────
    const tools = (sheet.tools || []).filter(t => t.description);
    if (tools.length) {
      sectionTitle("VÆRKTØJSLISTE");
      // header row
      doc.fillColor(GREY).fontSize(7.5).font("Helvetica");
      ["Pos.", "Beskrivelse", "Mærkat", "Genstart"].forEach((h, i) => {
        doc.text(h, [45, 80, 280, 430][i], y, { characterSpacing: 1 });
      });
      y += 14;
      tools.forEach((t, i) => {
        if (i % 2 === 0) doc.rect(45, y - 2, W, 16).fill("#f7f7f7").fillColor(DARK);
        doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold")
           .text(String(t.position), 45, y, { width: 30 });
        doc.font("Helvetica").text(t.description || "", 80, y, { width: 195 });
        doc.fillColor(GREY).text(t.label || "", 280, y, { width: 145 });
        doc.fillColor(AMBER).font("Helvetica-Bold")
           .text(rc(t.position), 430, y, { width: 80 });
        y += 16;
        if (y > doc.page.height - 80) { doc.addPage(); y = 45; }
      });
      y += 6;
    }

    // ── Sub tool list ──────────────────────────────────────
    const tools2 = (sheet.tools2 || []).filter(t => t.description);
    if (tools2.length) {
      sectionTitle("VÆRKTØJSLISTE — UNDER");
      doc.fillColor(GREY).fontSize(7.5).font("Helvetica");
      ["Pos.", "Beskrivelse", "Mærkat", "Genstart"].forEach((h, i) => {
        doc.text(h, [45, 80, 280, 430][i], y, { characterSpacing: 1 });
      });
      y += 14;
      tools2.forEach((t, i) => {
        if (i % 2 === 0) doc.rect(45, y - 2, W, 16).fill("#eaf4ff").fillColor(DARK);
        doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold")
           .text(String(t.position), 45, y, { width: 30 });
        doc.font("Helvetica").text(t.description || "", 80, y, { width: 195 });
        doc.fillColor(GREY).text(t.label || "", 280, y, { width: 145 });
        doc.fillColor("#1a6eb5").font("Helvetica-Bold")
           .text(rc(t.position), 430, y, { width: 80 });
        y += 16;
        if (y > doc.page.height - 80) { doc.addPage(); y = 45; }
      });
      y += 6;
    }

    // ── Third tool list ────────────────────────────────────
    const tools3 = (sheet.tools3 || []).filter(t => t.description);
    if (tools3.length) {
      sectionTitle("VÆRKTØJSLISTE — 3.");
      doc.fillColor(GREY).fontSize(7.5).font("Helvetica");
      ["Pos.", "Beskrivelse", "Mærkat", "Genstart"].forEach((h, i) => {
        doc.text(h, [45, 80, 280, 430][i], y, { characterSpacing: 1 });
      });
      y += 14;
      tools3.forEach((t, i) => {
        if (i % 2 === 0) doc.rect(45, y - 2, W, 16).fill("#eafaf0").fillColor(DARK);
        doc.fillColor(DARK).fontSize(9).font("Helvetica-Bold")
           .text(String(t.position), 45, y, { width: 30 });
        doc.font("Helvetica").text(t.description || "", 80, y, { width: 195 });
        doc.fillColor(GREY).text(t.label || "", 280, y, { width: 145 });
        doc.fillColor("#1a8c55").font("Helvetica-Bold")
           .text(rc(t.position), 430, y, { width: 80 });
        y += 16;
        if (y > doc.page.height - 80) { doc.addPage(); y = 45; }
      });
      y += 6;
    }

    // ── Setup parameters ───────────────────────────────────
    // Support new dynamic params array and old individual fields
    let rawParams = (sheet.params && sheet.params.length)
      ? sheet.params.filter(p => p.value)
      : [["Chuck Name", sheet.chuckName], ["Chuck Overhang", sheet.chuckOverhang],
         ["Clamping Pressure", sheet.clampingPressure],
         ["Zero Point", sheet.zeroPoint], ["Workpiece Stop", sheet.workpieceStop]]
        .filter(([, v]) => v)
        .map(([k, v]) => ({ key: k, value: v }));
    if (rawParams.length) {
      sectionTitle("OPSTILLINGSPARAMETRE");
      const cols = 2;
      const colW = (W - 10) / cols;
      rawParams.forEach((p, i) => {
        const cx = 45 + (i % cols) * (colW + 10);
        const cy = y + Math.floor(i / cols) * 44;
        doc.rect(cx, cy, colW, 40).fill("#f0f4ff").stroke(LINE);
        doc.fillColor(GREY).fontSize(7.5).font("Helvetica").text(p.key.toUpperCase(), cx + 8, cy + 6, { width: colW - 16, characterSpacing: 1 });
        doc.fillColor(DARK).fontSize(16).font("Helvetica-Bold").text(p.value, cx + 8, cy + 18, { width: colW - 16 });
      });
      y += Math.ceil(rawParams.length / cols) * 44 + 10;
    }

    // ── Notes ──────────────────────────────────────────────
    if (sheet.notes) {
      sectionTitle("NOTER");
      doc.fillColor(DARK).fontSize(9).font("Helvetica").text(sheet.notes, 45, y, { width: W, lineGap: 3 });
      y += doc.heightOfString(sheet.notes, { width: W, lineGap: 3 }) + 10;
    }

    // ── Footer ─────────────────────────────────────────────
    const footerY = doc.page.height - 30;
    doc.moveTo(45, footerY - 6).lineTo(45 + W, footerY - 6).strokeColor(LINE).stroke();
    const stamp = new Date().toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" });
    doc.fillColor(GREY).fontSize(7).font("Helvetica")
       .text(`ShopTrack opstillingsark  ·  Lavet ${stamp}  ·  ${sheet.partNumber || ""} / ${sheet.machine || ""}`,
             45, footerY, { width: W, align: "center" });

    doc.end();
    out.on("finish", () => res.json({ ok: true, url: `/setupsheets/${filename}` }));
    out.on("error",  e  => res.status(500).json({ error: e.message }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/photo ───────────────────────────────────────
app.post("/api/photo", (req, res) => {
  try {
    const { filename, data } = req.body;
    const filePath = path.join(PHOTOS_DIR, filename);
    // Prevent path traversal — resolved path must stay inside PHOTOS_DIR
    if (!path.resolve(filePath).startsWith(path.resolve(PHOTOS_DIR) + path.sep)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    const base64 = data.replace(/^data:image\/\w+;base64,/, "");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    res.json({ url: `/photos/${filename}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/file — a PDF drawing for a setup sheet or a task ──
// Stored next to the photos (so it is in the second backup copy too), never in the data file
app.post("/api/file", (req, res) => {
  try {
    const { name, data } = req.body;
    const m = typeof data === "string" && data.match(/^data:application\/pdf;base64,/);
    if (!m) return res.status(400).json({ error: "Kun PDF-filer" });
    const safe = String(name || "tegning.pdf").replace(/\.pdf$/i, "").replace(/[^\wæøåÆØÅ.-]+/g, "_").slice(0, 60) || "tegning";
    const rel = `files/${Date.now()}_${safe}.pdf`;
    const filePath = path.join(PHOTOS_DIR, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(data.slice(m[0].length), "base64"));
    res.json({ url: `/photos/${rel}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/server-status — the admin's "Server" page ──
const STARTED_AT = Date.now();
const newestFile = (dir, test) => {
  try {
    return fs.readdirSync(dir).filter(test)
      // A copied file keeps the original's modified time on Windows — its creation time is when it was made
      .map(f => { const s = fs.statSync(path.join(dir, f)); return { name: f, at: Math.max(s.mtimeMs, s.birthtimeMs || 0) }; })
      .sort((a, b) => b.at - a.at)[0] || null;
  } catch { return null; }
};
app.get("/api/server-status", (_req, res) => {
  const isBackup = f => f.startsWith("shoptrack-data-") && f.endsWith(".json");
  const copyDir = backupCopyDir();
  let disk = null;
  try { const s = fs.statfsSync(__dirname); disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { /* older Node */ }
  let dataFile = null;
  try { const s = fs.statSync(DATA_FILE); dataFile = { size: s.size, savedAt: s.mtimeMs }; } catch { /* no data yet */ }
  res.json({
    version: APP_VERSION, startedAt: STARTED_AT, now: Date.now(),
    lastBackup: newestFile(BACKUPS_DIR, isBackup),
    backupCount: (() => { try { return fs.readdirSync(BACKUPS_DIR).filter(isBackup).length; } catch { return 0; } })(),
    copyDir, lastCopy,
    copyLatest: copyDir ? newestFile(path.join(copyDir, "backups"), isBackup) : null,
    lastReport: newestFile(REPORTS_DIR, f => f.endsWith(".pdf")),
    dataFile, disk,
  });
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
