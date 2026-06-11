"use strict";

const CFG = window.HAGAG_CONFIG || { UPLOAD_ENDPOINT: "" };
const API = (CFG.UPLOAD_ENDPOINT || "").replace(/\/$/, "");
const $ = (sel) => document.querySelector(sel);

document.getElementById("year").textContent = "2026";

/* =========================================================
   TEXT REVIEWS  (localStorage; POST to server when configured)
   ========================================================= */
const STORE_KEY = "hagag_reviews_v1";
const reviewList = $("#reviewList");
const starInput = $("#starInput");
const ratingField = $("#rating");

function loadReviews() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}
function saveReviews(arr) {
  localStorage.setItem(STORE_KEY, JSON.stringify(arr));
}

function seedIfEmpty() {
  let arr = loadReviews();
  if (arr.length) return arr;
  arr = [
    { name: "מיכל ל.", rating: 5, text: "שירות יוצא מן הכלל, ליווי אישי מההתחלה ועד הסוף. ממליצה בחום!", date: "2026-05-02" },
    { name: "דניאל ק.", rating: 5, text: "מקצועיות ברמה אחרת. הרגשתי בידיים טובות לכל אורך הדרך.", date: "2026-05-18" },
    { name: "נועה ברנע", rating: 4, text: "חוויה נהדרת, צוות קשוב ואדיב. בהחלט אחזור.", date: "2026-06-01" }
  ];
  saveReviews(arr);
  return arr;
}

function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return d; }
}

function renderReviews() {
  const arr = loadReviews().slice().reverse();
  if (!arr.length) {
    reviewList.innerHTML = '<p class="empty">עדיין אין ביקורות — היו הראשונים! ✨</p>';
    updateStats([]);
    return;
  }
  reviewList.innerHTML = arr.map((r) => {
    const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
    const initial = (r.name || "?").trim().charAt(0);
    return `
      <article class="review">
        <div class="top">
          <div class="who">
            <div class="avatar">${escapeHtml(initial)}</div>
            <span class="name">${escapeHtml(r.name)}</span>
          </div>
          <span class="rate" aria-label="${r.rating} מתוך 5">${stars}</span>
        </div>
        <p class="body">${escapeHtml(r.text)}</p>
        <p class="date">${fmtDate(r.date)}</p>
      </article>`;
  }).join("");
  updateStats(loadReviews());
}

function updateStats(arr) {
  $("#statCount").textContent = arr.length;
  if (arr.length) {
    const avg = arr.reduce((s, r) => s + Number(r.rating), 0) / arr.length;
    $("#statAvg").textContent = avg.toFixed(1) + " ★";
  } else {
    $("#statAvg").textContent = "—";
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* star picker */
let currentRating = 0;
starInput.querySelectorAll(".star").forEach((btn) => {
  const v = Number(btn.dataset.v);
  btn.addEventListener("mouseenter", () => paintStars(v));
  btn.addEventListener("mouseleave", () => paintStars(currentRating));
  btn.addEventListener("click", () => { currentRating = v; ratingField.value = v; paintStars(v); });
});
function paintStars(v) {
  starInput.querySelectorAll(".star").forEach((b) => {
    b.classList.toggle("on", Number(b.dataset.v) <= v);
  });
}

$("#reviewForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#name").value.trim();
  const text = $("#text").value.trim();
  const rating = Number(ratingField.value);
  if (!name || !text || rating < 1) {
    alert("נא למלא שם, דירוג וביקורת.");
    return;
  }
  const review = { name, text, rating, date: new Date().toISOString() };

  // persist locally so it shows immediately
  const arr = loadReviews();
  arr.push(review);
  saveReviews(arr);
  renderReviews();

  // also send to server if configured
  if (API) {
    try {
      await fetch(API + "/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review)
      });
    } catch (err) { console.warn("server unreachable, kept locally", err); }
  }

  e.target.reset();
  currentRating = 0; ratingField.value = 0; paintStars(0);
  $("#reviews").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

renderReviews.boot = () => { seedIfEmpty(); renderReviews(); };
renderReviews.boot();

/* =========================================================
   VIDEO TESTIMONIAL  (fully consent-based)
   - camera only after explicit checkbox + button
   - live mirror preview so the user SEES the recording
   - upload only on explicit "send" click
   ========================================================= */
const consentChk = $("#consentChk");
const enableCam = $("#enableCam");
const consentBox = $("#consentBox");
const stage = $("#stage");
const preview = $("#preview");
const startBtn = $("#startBtn");
const stopBtn = $("#stopBtn");
const retakeBtn = $("#retakeBtn");
const sendBtn = $("#sendBtn");
const downloadBtn = $("#downloadBtn");
const recDot = $("#recDot");
const recTime = $("#recTime");
const vidStatus = $("#vidStatus");

let stream = null;
let recorder = null;
let chunks = [];
let recordedBlob = null;
let timer = null;
let seconds = 0;

consentChk.addEventListener("change", () => { enableCam.disabled = !consentChk.checked; });

enableCam.addEventListener("click", async () => {
  if (!consentChk.checked) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
    preview.srcObject = stream;
    preview.muted = true; // avoid echo of live mic
    consentBox.classList.add("hidden");
    stage.classList.remove("hidden");
    setStatus("המצלמה פעילה. לחצו ‘התחל הקלטה’ כשתהיו מוכנים.");
  } catch (err) {
    setStatus("⚠ לא ניתן לגשת למצלמה: " + (err && err.message ? err.message : err));
  }
});

function pickMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
}

startBtn.addEventListener("click", () => {
  if (!stream) return;
  chunks = [];
  recordedBlob = null;
  const mime = pickMime();
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (err) {
    setStatus("⚠ הקלטה לא נתמכת בדפדפן זה: " + err.message);
    return;
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecordingStop;
  recorder.start();

  startBtn.classList.add("hidden");
  stopBtn.classList.remove("hidden");
  retakeBtn.classList.add("hidden");
  sendBtn.classList.add("hidden");
  downloadBtn.classList.add("hidden");
  recDot.classList.remove("hidden");
  recTime.classList.remove("hidden");
  startTimer();
  setStatus("מקליט… דברו אל המצלמה. לחצו ‘עצור’ לסיום.");
});

stopBtn.addEventListener("click", () => {
  if (recorder && recorder.state !== "inactive") recorder.stop();
});

function onRecordingStop() {
  stopTimer();
  recDot.classList.add("hidden");
  recordedBlob = new Blob(chunks, { type: chunks[0] ? chunks[0].type : "video/webm" });

  // play back what was recorded
  preview.srcObject = null;
  preview.src = URL.createObjectURL(recordedBlob);
  preview.muted = false;
  preview.controls = true;
  preview.play().catch(() => {});

  stopBtn.classList.add("hidden");
  retakeBtn.classList.remove("hidden");
  sendBtn.classList.remove("hidden");
  downloadBtn.classList.remove("hidden");
  const kb = Math.round(recordedBlob.size / 1024);
  setStatus(`ההקלטה מוכנה (${kb} KB). צפו, ואז שלחו או הקליטו מחדש.`);
}

retakeBtn.addEventListener("click", async () => {
  preview.controls = false;
  preview.src = "";
  // re-attach live stream
  if (!stream || !stream.active) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true }); }
    catch (err) { setStatus("⚠ " + err.message); return; }
  }
  preview.srcObject = stream;
  preview.muted = true;
  preview.play().catch(() => {});
  recTime.classList.add("hidden");
  retakeBtn.classList.add("hidden");
  sendBtn.classList.add("hidden");
  downloadBtn.classList.add("hidden");
  startBtn.classList.remove("hidden");
  setStatus("מוכן להקלטה חדשה.");
});

downloadBtn.addEventListener("click", () => {
  if (!recordedBlob) return;
  const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(recordedBlob);
  a.download = `hagag-testimonial.${ext}`;
  a.click();
});

sendBtn.addEventListener("click", async () => {
  if (!recordedBlob) return;

  if (!API) {
    setStatus("ℹ אין שרת מוגדר (מצב מקומי). הסרטון יישמר כקובץ אצלכם במקום שליחה.");
    downloadBtn.click();
    return;
  }

  sendBtn.disabled = true;
  setStatus("שולח לקבוצת חגג…");
  try {
    const fd = new FormData();
    const ext = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
    fd.append("video", recordedBlob, `testimonial.${ext}`);
    fd.append("submittedAt", new Date().toISOString());
    const res = await fetch(API + "/api/testimonials", { method: "POST", body: fd });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setStatus("✅ תודה! ההמלצה נשלחה בהצלחה לקבוצת חגג.");
    sendBtn.classList.add("hidden");
  } catch (err) {
    setStatus("⚠ שליחה נכשלה: " + err.message + " — אפשר להוריד עותק במקום.");
  } finally {
    sendBtn.disabled = false;
  }
});

function startTimer() {
  seconds = 0; recTime.textContent = "00:00";
  timer = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    recTime.textContent = `${m}:${s}`;
  }, 1000);
}
function stopTimer() { if (timer) clearInterval(timer); timer = null; }
function setStatus(msg) { vidStatus.textContent = msg; }

// stop camera when leaving the page (privacy)
window.addEventListener("pagehide", () => {
  if (stream) stream.getTracks().forEach((t) => t.stop());
});
