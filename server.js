import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import cors from "cors";
import PDFDocument from "pdfkit";

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
                 sheet.operation && `Op ${sheet.operation}`].filter(Boolean).join("  ·  ");
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
         .text("PROGRAM NAME", 56, y + 7, { characterSpacing: 1.5 });
      doc.fillColor("#b07d00").fontSize(22).font("Helvetica-Bold")
         .text(sheet.subProgram, 56, y + 18, { width: W - 20, characterSpacing: 2 });
      y += 56;
    }

    // ── Identity ───────────────────────────────────────────
    sectionTitle("IDENTITY");
    [["Machine", sheet.machine], ["Customer", sheet.customer],
     ["Material", sheet.material], ["Revision", sheet.revision],
     ["Operation", sheet.operation], ["Plan Program", sheet.planProgram]]
      .filter(([, v]) => v)
      .forEach(([k, v]) => field(k, v));
    y += 6;

    // ── Tool list ──────────────────────────────────────────
    const tools = (sheet.tools || []).filter(t => t.description);
    if (tools.length) {
      sectionTitle("TOOL LIST");
      // header row
      doc.fillColor(GREY).fontSize(7.5).font("Helvetica");
      ["Pos", "Description", "Label", "Restart"].forEach((h, i) => {
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

    // ── Operations sequence ────────────────────────────────
    const ops = (sheet.opsMain || []).filter(o => o.operation);
    if (ops.length) {
      sectionTitle("OPERATIONS SEQUENCE — MAIN SPINDLE");
      doc.fillColor(GREY).fontSize(7.5).font("Helvetica");
      ["#", "Tool", "Operation", "Restart"].forEach((h, i) => {
        doc.text(h, [45, 75, 115, 430][i], y, { characterSpacing: 1 });
      });
      y += 14;
      ops.forEach((o, i) => {
        if (i % 2 === 0) doc.rect(45, y - 2, W, 16).fill("#f7f7f7");
        doc.fillColor(GREY).fontSize(9).font("Helvetica").text(String(i + 1), 45, y, { width: 26 });
        doc.fillColor(DARK).font("Helvetica-Bold")
           .text(`T${String(o.toolPosition || 0).padStart(2, "0")}`, 75, y, { width: 36 });
        doc.font("Helvetica").text(o.operation || "", 115, y, { width: 310 });
        doc.fillColor(AMBER).font("Helvetica-Bold")
           .text(o.toolPosition ? rc(o.toolPosition) : "", 430, y, { width: 80 });
        y += 16;
        if (y > doc.page.height - 80) { doc.addPage(); y = 45; }
      });
      y += 6;
    }

    // ── Setup parameters ───────────────────────────────────
    const params = [["Chuck Name", sheet.chuckName], ["Chuck Overhang", sheet.chuckOverhang],
                    ["Clamping Pressure", sheet.clampingPressure],
                    ["Zero Point", sheet.zeroPoint], ["Workpiece Stop", sheet.workpieceStop]]
                   .filter(([, v]) => v);
    if (params.length) {
      sectionTitle("SETUP PARAMETERS");
      const cols = 2;
      const colW = (W - 10) / cols;
      params.forEach(([k, v], i) => {
        const cx = 45 + (i % cols) * (colW + 10);
        const cy = y + Math.floor(i / cols) * 44;
        doc.rect(cx, cy, colW, 40).fill("#f0f4ff").stroke(LINE);
        doc.fillColor(GREY).fontSize(7.5).font("Helvetica").text(k.toUpperCase(), cx + 8, cy + 6, { width: colW - 16, characterSpacing: 1 });
        doc.fillColor(DARK).fontSize(16).font("Helvetica-Bold").text(v, cx + 8, cy + 18, { width: colW - 16 });
      });
      y += Math.ceil(params.length / cols) * 44 + 10;
    }

    // ── Notes ──────────────────────────────────────────────
    if (sheet.notes) {
      sectionTitle("NOTES");
      doc.fillColor(DARK).fontSize(9).font("Helvetica").text(sheet.notes, 45, y, { width: W, lineGap: 3 });
      y += doc.heightOfString(sheet.notes, { width: W, lineGap: 3 }) + 10;
    }

    // ── Footer ─────────────────────────────────────────────
    const footerY = doc.page.height - 30;
    doc.moveTo(45, footerY - 6).lineTo(45 + W, footerY - 6).strokeColor(LINE).stroke();
    const stamp = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    doc.fillColor(GREY).fontSize(7).font("Helvetica")
       .text(`ShopTrack Setup Sheet  ·  Generated ${stamp}  ·  ${sheet.partNumber || ""} / ${sheet.machine || ""}`,
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
    const base64 = data.replace(/^data:image\/\w+;base64,/, "");
    const filePath = path.join(PHOTOS_DIR, filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
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
