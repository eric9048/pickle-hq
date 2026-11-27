/* ─────────────────────────────────────────────────────────────
   합동 비서실 · app.js
   Firebase Realtime Database 실시간 대시보드
   ───────────────────────────────────────────────────────────── */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, push, set, update, remove, off
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ── 1. 설정 ─────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: "AIzaSyAfAAPLfFfI7s_1J-UnLTqUiIMH1ynyZ-Q",
  authDomain: "pickle-hq.firebaseapp.com",
  databaseURL: "https://pickle-hq-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pickle-hq",
  storageBucket: "pickle-hq.firebasestorage.app",
  messagingSenderId: "430667099797",
  appId: "1:430667099797:web:814e36b14ee997e354359c"
};

/* 접속 PIN — 바꾸려면 아래 문자열만 수정하면 됩니다. */
const PIN = "1028";
const AUTH_KEY = "hq.auth.v1";
const THEME_KEY = "hq.theme.v1";

const ROOT = "hq";

const OWNER = {
  robin: "로빈",
  jessi: "제시",
  jerry: "제리",
  boss: "사장님"
};
const STATUS = { doing: "진행 중", waiting: "대기 중", done: "완료" };
const BLOG_STATUS = { published: "발행 완료", draft: "임시저장", hidden: "비공개" };
const THREAD_STATUS = { posted: "게시 완료", drafting: "작성 중", hold: "보류" };
const CAMP_STATUS = { pending: "미제출", doing: "진행 중", submitted: "제출 완료" };

/* 합동 회의실 참여자 */
const PEOPLE = {
  boss: { name: "사장님", emoji: "👑", role: "사장님" },
  robin: { name: "로빈", emoji: "🦉", role: "비서" },
  jessi: { name: "제시", emoji: "✨", role: "비서" },
  jerry: { name: "제리", emoji: "🍀", role: "비서" }
};
const PEOPLE_ORDER = ["boss", "robin", "jessi", "jerry"];
const SAY_KEY = "hq.meet.say.v1";
const savedSay = localStorage.getItem(SAY_KEY);

/* ── 2. 상태 ─────────────────────────────────────────────── */

const state = {
  data: null,
  ownerFilter: "all",
  blogFilter: "all",
  say: PEOPLE[savedSay] ? savedSay : "boss",
  ready: false
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function won(n) {
  const v = Number(n) || 0;
  return "₩" + v.toLocaleString("ko-KR");
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - Number(ts)) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = new Date(Number(ts));
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayDiff(due) {
  if (!due) return null;
  const [y, m, d] = String(due).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

/* ── 3. 잠금 화면 ───────────────────────────────────────── */

const gate = $("#gate");
const appEl = $("#app");

function unlock() {
  gate.hidden = true;
  appEl.hidden = false;
  startBoard();
}

function lock() {
  localStorage.removeItem(AUTH_KEY);
  location.reload();
}

$("#gateForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#pinInput").value.trim();
  if (v === PIN) {
    localStorage.setItem(AUTH_KEY, "1");
    unlock();
  } else {
    $("#gateError").hidden = false;
    $("#pinInput").value = "";
    $("#pinInput").focus();
  }
});

$("#logoutBtn").addEventListener("click", lock);

/* 테마 */
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

function paintThemeBtn() {
  $("#themeBtn").textContent = document.documentElement.dataset.theme === "light" ? "☀️" : "🌙";
}
paintThemeBtn();

$("#themeBtn").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  paintThemeBtn();
});

/* ── 4. Firebase ─────────────────────────────────────────── */

let db = null;

function startBoard() {
  if (state.ready) return;
  state.ready = true;

  try {
    const fb = initializeApp(firebaseConfig);
    db = getDatabase(fb);
  } catch (err) {
    $("#syncState").textContent = "Firebase 초기화 실패";
    console.error(err);
    return;
  }

  onValue(ref(db, ROOT), snap => {
    state.data = snap.val() || {};
    $("#syncState").textContent = "실시간 연결됨 · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    renderAll();
  }, err => {
    $("#syncState").textContent = "연결 오류: " + err.code;
    console.error(err);
  });
}

/* ── 5. 렌더 ─────────────────────────────────────────────── */

function renderAll() {
  renderHome();
  renderMeeting();
  renderTasks();
  renderBlog();
  renderThreads();
  renderCampaigns();
  renderMoney();
  renderFeed();

  const meta = state.data?.meta || {};
  $("#footStamp").textContent = meta.updatedAt
    ? "최근 갱신 " + new Date(Number(meta.updatedAt)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "초기 데이터 없음";
}

/* 5-1. 업무 보드 */
function tasksArr() {
  const t = state.data?.tasks || {};
  return Object.entries(t)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (Number(b.updatedAt || b.createdAt || 0)) - (Number(a.updatedAt || a.createdAt || 0)));
}

function renderTasks() {
  const all = tasksArr();
  const list = state.ownerFilter === "all" ? all : all.filter(t => t.owner === state.ownerFilter);

  const counts = { doing: 0, waiting: 0, done: 0 };
  all.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const fcounts = { doing: 0, waiting: 0, done: 0 };
  list.forEach(t => { fcounts[t.status] = (fcounts[t.status] || 0) + 1; });

  $$("[data-count]").forEach(el => { el.textContent = fcounts[el.dataset.count] || 0; });
  $$("[data-tabcount]").forEach(el => {
    const k = el.dataset.tabcount;
    el.textContent = k === "all" ? all.length : (counts[k] || 0);
  });

  $("#taskSummary").textContent =
    `${list.length}건` + (state.ownerFilter === "all" ? "" : ` · ${OWNER[state.ownerFilter]}`);

  ["doing", "waiting", "done"].forEach(st => {
    const items = list.filter(t => t.status === st);
    const html = items.length
      ? items.map(t => taskCard(t)).join("")
      : `<div class="empty">비어 있음</div>`;
    const box = $(`[data-list="${st}"]`);
    if (box) box.innerHTML = html;
    const pane = $(`[data-status-list="${st}"]`);
    if (pane) pane.innerHTML = html;
  });
}

function taskDetail(t) {
  return String(t.detail ?? t.description ?? t.notes ?? "");
}

function taskCard(t) {
  const opts = Object.entries(OWNER).map(([k, v]) =>
    `<option value="${k}"${t.owner === k ? " selected" : ""}>${v}</option>`).join("");
  const move = ["doing", "waiting", "done"].map(s =>
    s === t.status ? "" :
      `<button class="mini-btn" data-act="status" data-id="${t.id}" data-status="${s}" type="button">→ ${STATUS[s]}</button>`
  ).join("");
  const detail = taskDetail(t).trim();
  const desc = detail
    ? `<div class="task-desc">${esc(trunc(detail, 110))}</div>`
    : `<div class="task-desc is-empty">상세 내용을 적어 두세요</div>`;

  return `
    <div class="task" data-owner="${esc(t.owner)}" data-status="${esc(t.status)}" data-id="${t.id}" title="눌러서 상세 내용 보기">
      <div class="task-title">${esc(t.title)}</div>
      ${desc}
      <div class="task-meta">
        <select data-act="owner" data-id="${t.id}" aria-label="담당자 변경">${opts}</select>
        <span class="hint">${timeAgo(t.updatedAt || t.createdAt)}</span>
        <div class="task-actions">
          ${move}
          <button class="mini-btn danger" data-act="del" data-id="${t.id}" type="button">삭제</button>
        </div>
      </div>
    </div>`;
}

$("#ownerFilters").addEventListener("click", e => {
  const btn = e.target.closest("[data-owner]");
  if (!btn) return;
  state.ownerFilter = btn.dataset.owner;
  $$("#ownerFilters .chip").forEach(c => c.classList.toggle("is-on", c === btn));
  renderTasks();
});

$("#taskForm").addEventListener("submit", e => {
  e.preventDefault();
  const title = $("#taskTitle").value.trim();
  if (!title || !db) return;
  const now = Date.now();
  push(ref(db, `${ROOT}/tasks`), {
    title,
    detail: $("#taskDetail").value.replace(/[ \t]+$/gm, "").trim(),
    owner: $("#taskOwner").value,
    status: $("#taskStatus").value,
    createdAt: now,
    updatedAt: now
  });
  $("#taskTitle").value = "";
  $("#taskDetail").value = "";
  $("#taskTitle").focus();
});

$("#tasksView").addEventListener("click", e => {
  if (e.target.closest("select, input, textarea, label")) return;
  const actEl = e.target.closest("[data-act]");
  const act = actEl ? actEl.dataset.act : null;

  if (act === "status" || act === "del") {
    if (!db) return;
    const id = actEl.dataset.id;
    const item = ref(db, `${ROOT}/tasks/${id}`);
    if (act === "status") update(item, { status: actEl.dataset.status, updatedAt: Date.now() });
    else if (confirm("이 업무를 삭제할까요?")) remove(item);
    return;
  }

  const card = e.target.closest(".task");
  if (card) openTaskSheet(card.dataset.id);
});

$("#tasksView").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="owner"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/tasks/${sel.dataset.id}`), { owner: sel.value, updatedAt: Date.now() });
});

/* 5-2. 블로그 */
function blogArr() {
  const b = state.data?.content?.blog || {};
  return Object.entries(b)
    .map(([k, v]) => ({ key: k, ...v, no: Number(v.no ?? k.replace(/\D/g, "")) }))
    .sort((a, b2) => a.no - b2.no);
}

function renderBlog() {
  const all = blogArr();
  const pub = all.filter(b => b.status === "published").length;
  const draft = all.filter(b => b.status === "draft").length;
  $("#blogSummary").textContent = `${all.length}편 · 발행 ${pub} · 임시저장 ${draft}`;
  const cnt = $("#blogCount");
  if (cnt) cnt.textContent = all.length;

  const list = state.blogFilter === "all" ? all : all.filter(b => b.status === state.blogFilter);
  const box = $("#blogList");

  if (!list.length) {
    box.innerHTML = `<div class="empty">표시할 글이 없습니다</div>`;
    return;
  }

  box.innerHTML = list.map(b => {
    const cls = b.status === "draft" ? "is-draft" : (b.status === "hidden" ? "is-hidden" : "");
    const opts = Object.entries(BLOG_STATUS).map(([k, v]) =>
      `<option value="${k}"${b.status === k ? " selected" : ""}>${v}</option>`).join("");
    const date = b.date ? String(b.date).slice(5).replace("-", "/") : "";
    return `
      <div class="blog-row ${cls}" data-key="${esc(b.key)}">
        <span class="blog-no">${b.no}</span>
        <span class="blog-title" data-act="edit-title" data-key="${esc(b.key)}" title="클릭해서 제목 수정">${esc(b.title)}</span>
        <span class="blog-date">${esc(date)}</span>
        <select data-act="blog-status" data-key="${esc(b.key)}" aria-label="${b.no}호 상태">${opts}</select>
      </div>`;
  }).join("");
}

$("#blogFilters").addEventListener("click", e => {
  const btn = e.target.closest("[data-blog]");
  if (!btn) return;
  state.blogFilter = btn.dataset.blog;
  $$("#blogFilters .chip").forEach(c => c.classList.toggle("is-on", c === btn));
  renderBlog();
});

$("#blogList").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="blog-status"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/content/blog/${sel.dataset.key}`), { status: sel.value, updatedAt: Date.now() });
});

$("#blogList").addEventListener("click", e => {
  if (e.target.closest("select, input") || e.target.closest('[data-act="edit-title"]')) return;
  const row = e.target.closest(".blog-row");
  if (row) openBlogSheet(row.dataset.key);
});

$("#blogList").addEventListener("click", e => {
  const span = e.target.closest('[data-act="edit-title"]');
  if (!span || !db) return;
  if (span.dataset.editing) return;
  const key = span.dataset.key;
  const original = span.textContent;
  span.dataset.editing = "1";
  span.innerHTML = `<input type="text" value="${esc(original)}" style="width:100%" aria-label="제목 수정">`;
  const input = span.querySelector("input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const finish = (save) => {
    const v = input.value.trim();
    span.dataset.editing = "";
    if (save && v && v !== original) {
      update(ref(db, `${ROOT}/content/blog/${key}`), { title: v, updatedAt: Date.now() });
    } else {
      renderBlog();
    }
  };

  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
    if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
});

/* 5-3. 스레드 */
function renderThreads() {
  const t = state.data?.content?.threads || {};
  const arr = Object.entries(t).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.order || 0) - (a.order || 0));

  const box = $("#threadList");
  const cnt = $("#threadCount");
  if (cnt) cnt.textContent = arr.length;
  if (!arr.length) { box.innerHTML = `<div class="empty">등록된 스레드가 없습니다</div>`; return; }

  box.innerHTML = arr.map(s => {
    const opts = Object.entries(THREAD_STATUS).map(([k, v]) =>
      `<option value="${k}"${s.status === k ? " selected" : ""}>${v}</option>`).join("");
    const link = s.url ? `<a class="mini-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">게시물 열기 ↗</a>` : "";
    return `
      <div class="mini-item" data-id="${s.id}">
        <div class="mini-top">
          <span class="mini-title">${esc(s.title)}</span>
          <select data-act="thread-status" data-id="${s.id}" aria-label="스레드 상태">${opts}</select>
        </div>
        <div class="mini-sub">
          <span>${esc(s.date || "")}</span>
          ${s.chars ? `<span>${esc(s.chars)}자</span>` : ""}
          ${link}
        </div>
      </div>`;
  }).join("");
}

$("#threadList").addEventListener("click", e => {
  if (e.target.closest("select, a")) return;
  const item = e.target.closest(".mini-item");
  if (item) openThreadSheet(item.dataset.id);
});

$("#threadList").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="thread-status"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/content/threads/${sel.dataset.id}`), { status: sel.value, updatedAt: Date.now() });
});

/* 5-4. 캠페인 */
function renderCampaigns() {
  const c = state.data?.content?.campaigns || {};
  const arr = Object.entries(c).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => String(a.due || "").localeCompare(String(b.due || "")));

  const box = $("#campaignList");
  const cnt = $("#campaignCount");
  if (cnt) cnt.textContent = arr.length;
  if (!arr.length) { box.innerHTML = `<div class="empty">등록된 캠페인이 없습니다</div>`; return; }

  box.innerHTML = arr.map(k => {
    const opts = Object.entries(CAMP_STATUS).map(([v, label]) =>
      `<option value="${v}"${k.status === v ? " selected" : ""}>${label}</option>`).join("");
    const d = dayDiff(k.due);
    const cls = d === null ? "" : (d < 0 ? "past" : (d <= 2 ? "urgent" : ""));
    const label = d === null ? "" : (d === 0 ? "D-DAY" : (d > 0 ? `D-${d}` : `마감 ${Math.abs(d)}일 지남`));
    const due = k.due ? String(k.due).slice(5).replace("-", "/") : "";
    return `
      <div class="mini-item" data-id="${k.id}">
        <div class="mini-top">
          <span class="mini-title">${esc(k.name)}</span>
          ${label ? `<span class="dday ${cls}">${label}</span>` : ""}
        </div>
        <div class="mini-sub">
          <span>${esc(k.channel || "")}</span>
          <span>마감 ${esc(due)}</span>
          <select data-act="camp-status" data-id="${k.id}" aria-label="캠페인 상태">${opts}</select>
        </div>
      </div>`;
  }).join("");
}

$("#campaignList").addEventListener("click", e => {
  if (e.target.closest("select")) return;
  const item = e.target.closest(".mini-item");
  if (item) openCampaignSheet(item.dataset.id);
});

$("#campaignList").addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="camp-status"]');
  if (!sel || !db) return;
  update(ref(db, `${ROOT}/content/campaigns/${sel.dataset.id}`), { status: sel.value, updatedAt: Date.now() });
});

/* 5-5. 수익 · 장부 */
function renderMoney() {
  const f = state.data?.finance || {};
  const aff = f.affiliate || {};
  const det = f.detailing || {};
  const box = $("#moneyGrid");

  const cards = [];

  if (aff.total) {
    cards.push(`
      <div class="money accent">
        <h4>11월 제휴 매출 합계</h4>
        <div class="big">${won(aff.total.revenue)} <small>${aff.total.orders || 0}건</small></div>
        <div class="lines">
          <span>순이익 <b>${won(aff.total.profit)}</b></span>
          <span>${esc(aff.note || "조회 시점 기준")}</span>
        </div>
      </div>`);
  }

  if (aff.coupang) {
    cards.push(`
      <div class="money clickable" data-go="coupang">
        <h4>쿠팡 파트너스</h4>
        <div class="big">${won(aff.coupang.revenue)} <small>${aff.coupang.orders || 0}건</small></div>
        <div class="lines">
          <span>순이익 <b>${won(aff.coupang.profit)}</b></span>
          <span>${esc(aff.coupang.note || "")}</span>
        </div>
      </div>`);
  }

  if (aff.shopconnect) {
    cards.push(`
      <div class="money clickable" data-go="shopconnect">
        <h4>네이버 쇼핑커넥트</h4>
        <div class="big">${won(aff.shopconnect.revenue)} <small>${aff.shopconnect.orders || 0}건</small></div>
        <div class="lines">
          <span>세전 수수료 <b>${won(aff.shopconnect.profit)}</b></span>
          <span>${esc(aff.shopconnect.note || "")}</span>
        </div>
      </div>`);
  }

  if (det.jobs !== undefined) {
    cards.push(`
      <div class="money green clickable" data-go="detailing">
        <h4>세차 · 디테일링 부업 (11월 누계)</h4>
        <div class="big">${Number(det.jobs).toLocaleString("ko-KR")}회 <small>예상 급여 ${won(det.netPay)}</small></div>
        <div class="lines">
          <span>예상 청구합 <b>${won(det.billed)}</b> · 외부 지급 60% ${won(det.partnerShare)}</span>
          <span>${esc(det.note || "")}</span>
        </div>
      </div>`);
  }

  box.innerHTML = cards.join("") + (f.updatedLabel
    ? `<div class="money"><h4>갱신 기준</h4><div class="lines"><span>${esc(f.updatedLabel)}</span></div></div>`
    : "");

  renderRevenueDetail();
}

/* 5-6. 피드 */
function renderFeed() {
  const f = state.data?.feed || {};
  const arr = Object.entries(f).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
    .slice(0, 60);

  const box = $("#feedList");
  if (!arr.length) { box.innerHTML = `<div class="empty">아직 메모가 없습니다. 첫 메모를 남겨 보세요.</div>`; return; }

  box.innerHTML = arr.map(m => `
    <div class="msg">
      <div class="msg-top">
        <span class="who ${esc(m.from)}">${esc(OWNER[m.from] || m.from)}</span>
        <span class="msg-time">${timeAgo(m.ts)}</span>
        <button class="mini-btn danger" data-act="del-feed" data-id="${m.id}" type="button" title="삭제">✕</button>
      </div>
      <div class="msg-text">${esc(m.text)}</div>
    </div>`).join("");
}

$("#feedForm").addEventListener("submit", e => {
  e.preventDefault();
  sendFeed();
});

$("#feedText").addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    sendFeed();
  }
});

function sendFeed() {
  const ta = $("#feedText");
  const text = ta.value.trim();
  if (!text || !db) return;
  push(ref(db, `${ROOT}/feed`), {
    from: $("#feedFrom").value,
    text,
    ts: Date.now()
  });
  ta.value = "";
  ta.focus();
}

$("#feedList").addEventListener("click", e => {
  const btn = e.target.closest('[data-act="del-feed"]');
  if (!btn || !db) return;
  if (confirm("이 메모를 삭제할까요?")) remove(ref(db, `${ROOT}/feed/${btn.dataset.id}`));
});

/* 5-7. 합동 회의실 */
let meetSig = "";
let meetLastId = null;
let meetForceScroll = false;

function clock(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function meetMessages() {
  const m = state.data?.meeting?.messages || {};
  return Object.entries(m)
    .map(([id, v]) => ({
      id,
      from: v && v.from ? String(v.from) : "robin",
      text: v && v.text != null ? String(v.text) : "",
      ts: Number(v && v.ts) || 0
    }))
    .filter(v => v.text.trim())
    .sort((a, b) => a.ts - b.ts || String(a.id).localeCompare(String(b.id)));
}

function renderMeeting() {
  const arr = meetMessages();
  renderMeetingPeople(arr);
  renderMeetingTopic();
  $("#meetSummary").textContent = arr.length
    ? `${arr.length}개 메시지 · 참여자 4명`
    : "참여자 4명";
  const mc = $("#meetMsgCount");
  if (mc) mc.textContent = arr.length;

  const room = $("#meetRoom");
  const sig = arr.map(m => `${m.id}:${m.ts}:${m.from}:${m.text}`).join("\u0001");
  if (sig === meetSig) return;

  const nearBottom = room.scrollHeight - room.scrollTop - room.clientHeight < 90;
  const prevLast = meetLastId;
  meetSig = sig;
  meetLastId = arr.length ? arr[arr.length - 1].id : null;

  if (!arr.length) {
    room.innerHTML = `<div class="empty">아직 대화가 없습니다. 첫 메시지를 남겨 보세요.</div>`;
    return;
  }

  room.innerHTML = arr.map(m => {
    const p = PEOPLE[m.from] || { name: m.from, emoji: "👤" };
    const mine = m.from === "boss";
    return `
      <div class="bubble ${esc(m.from)}${mine ? " is-mine" : ""}" data-id="${esc(m.id)}">
        <span class="avatar" aria-hidden="true">${p.emoji}</span>
        <div class="bubble-body">
          <div class="bubble-top">
            <b>${esc(p.name)}</b>
            <span>${clock(m.ts)}</span>
            <button class="bubble-del" data-act="del-meet" data-id="${esc(m.id)}" type="button" title="메시지 삭제" aria-label="메시지 삭제">✕</button>
          </div>
          <div class="bubble-text">${esc(m.text)}</div>
        </div>
      </div>`;
  }).join("");

  if (meetForceScroll || prevLast === null || nearBottom) {
    meetForceScroll = false;
    room.scrollTop = room.scrollHeight;
  }
}

/* 비서별 사용량 (hq/usage/{robin|jessi|jerry}) */
function usageToneOf(pct) {
  if (pct == null) return "none";
  if (pct >= 85) return "danger";
  if (pct >= 60) return "warn";
  return "ok";
}

function usageLabelOf(pct) {
  if (pct == null) return "미입력";
  if (pct >= 85) return "한도 경고";
  if (pct >= 60) return "한도 주의";
  return "여유";
}

function usageData(k) {
  const u = state.data?.usage?.[k];
  const raw = u && u.usedPct;
  const num = raw == null || raw === "" ? NaN : Number(raw);
  const pct = Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : null;
  let label = u && u.label != null && String(u.label).trim()
    ? String(u.label).trim()
    : "";
  if (!label) label = usageLabelOf(pct);
  /* 숫자가 있는데 라벨이 "미입력"으로 남아 있으면 단계 라벨로 보여 줍니다. */
  if (pct != null && label === "미입력") label = usageLabelOf(pct);
  return {
    pct,
    tone: usageToneOf(pct),
    label,
    note: u && u.note != null ? String(u.note) : "",
    updatedAt: Number(u && u.updatedAt) || 0
  };
}

function donutSvg(pct, tone) {
  const C = 2 * Math.PI * 18;
  const off = pct == null ? C : C * (1 - pct / 100);
  return `
    <span class="donut${pct == null ? " is-empty" : ""}" aria-hidden="true">
      <svg viewBox="0 0 44 44">
        <circle class="donut-track" cx="22" cy="22" r="18"></circle>
        <circle class="donut-bar" cx="22" cy="22" r="18" transform="rotate(-90 22 22)"
                stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      </svg>
      <span class="donut-pct">${pct == null ? "--" : pct + "%"}</span>
    </span>`;
}

function renderMeetingPeople(arr) {
  const lastBy = {};
  arr.forEach(m => { lastBy[m.from] = m.ts; });

  $("#meetPeople").innerHTML = PEOPLE_ORDER.map(k => {
    const p = PEOPLE[k];
    const ts = lastBy[k];
    const status = k === "boss" ? "접속 중" : "참여 중";

    if (k === "boss") {
      const sub = status + (ts ? ` · ${clock(ts)}` : "");
      return `
      <div class="person boss" title="${esc(p.name)} · ${esc(sub)}">
        <span class="avatar" aria-hidden="true">${p.emoji}</span>
        <span class="person-text">
          <b>${esc(p.name)} <span class="live" aria-hidden="true"></span></b>
          <small>${esc(sub)}</small>
        </span>
      </div>`;
    }

    const u = usageData(k);
    const when = u.updatedAt ? timeAgo(u.updatedAt) : "갱신 전";
    const pctTxt = u.pct == null ? "미입력" : `사용 ${u.pct}%`;
    const title = `${p.name} · ${pctTxt} · ${u.label} · ${when} — 눌러서 수정`;
    return `
      <button class="person ${k} has-usage" type="button" data-usage="${k}" data-tone="${u.tone}"
              title="${esc(title)}"
              aria-label="${esc(`${p.name} 사용량 ${pctTxt}, ${u.label}, ${when}. 눌러서 수정`)}">
        <span class="avatar" aria-hidden="true">${p.emoji}</span>
        <span class="person-text">
          <b>${esc(p.name)} <span class="live" aria-hidden="true"></span></b>
          <small class="u-label"><span class="u-use">${u.pct == null ? "" : `사용 ${u.pct}% · `}</span>${esc(u.label)}</small>
          <small class="u-time"><span class="u-ago">${esc(when)}</span> <span class="u-suffix">갱신</span></small>
        </span>
        ${donutSvg(u.pct, u.tone)}
      </button>`;
  }).join("");
}

$("#meetPeople").addEventListener("click", e => {
  const btn = e.target.closest("[data-usage]");
  if (!btn) return;
  openUsageSheet(btn.dataset.usage);
});

function meetTopic() {
  const t = state.data?.meeting?.topic;
  if (typeof t === "string") return { text: t, by: "" };
  return { text: t && t.text != null ? String(t.text) : "", by: t && t.by ? String(t.by) : "" };
}

function renderMeetingTopic() {
  const el = $("#meetTopicText");
  if (el.dataset.editing) return;
  const { text, by } = meetTopic();
  el.textContent = text || "안건을 정해 주세요";
  el.classList.toggle("is-empty", !text);
  $("#meetTopicWho").textContent = by && PEOPLE[by] ? `· ${PEOPLE[by].name}` : "";
}

$("#meetTopicEdit").addEventListener("click", () => {
  const el = $("#meetTopicText");
  if (el.dataset.editing || !db) return;
  const { text } = meetTopic();
  el.dataset.editing = "1";
  el.innerHTML = `<input type="text" maxlength="140" value="${esc(text)}" placeholder="오늘 회의 안건" aria-label="안건 수정">`;
  const input = el.querySelector("input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    delete el.dataset.editing;
    if (save) {
      const topic = { text: v, by: state.say, updatedAt: Date.now() };
      if (state.data) {
        state.data.meeting = state.data.meeting || {};
        state.data.meeting.topic = topic;
      }
      set(ref(db, `${ROOT}/meeting/topic`), topic);
    }
    renderMeetingTopic();
  };

  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
    if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
});

function paintSay() {
  $$("#meetSay .chip").forEach(c => c.classList.toggle("is-on", c.dataset.say === state.say));
  $("#meetText").placeholder =
    `${PEOPLE[state.say].name}으로 말하기 (Enter 전송 · Shift+Enter 줄바꿈)`;
}

$("#meetSay").addEventListener("click", e => {
  const btn = e.target.closest("[data-say]");
  if (!btn) return;
  state.say = btn.dataset.say;
  localStorage.setItem(SAY_KEY, state.say);
  paintSay();
  $("#meetText").focus();
});

function autoGrow(ta) {
  ta.style.height = "auto";
  const need = ta.scrollHeight + 2; // border 1px × 2
  ta.style.height = Math.min(need, 140) + "px";
  ta.style.overflowY = need > 140 ? "auto" : "hidden";
}

function sendMeet() {
  const ta = $("#meetText");
  if (!db) return;
  const text = ta.value.trim();
  if (!text) return;
  meetForceScroll = true;
  push(ref(db, `${ROOT}/meeting/messages`), {
    from: state.say,
    text,
    ts: Date.now()
  });
  ta.value = "";
  autoGrow(ta);
  ta.focus();
}

$("#meetForm").addEventListener("submit", e => {
  e.preventDefault();
  sendMeet();
});

$("#meetText").addEventListener("input", e => autoGrow(e.target));

$("#meetText").addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  sendMeet();
});

$("#meetRoom").addEventListener("click", e => {
  const btn = e.target.closest('[data-act="del-meet"]');
  if (!btn || !db) return;
  if (confirm("이 메시지를 삭제할까요?")) {
    remove(ref(db, `${ROOT}/meeting/messages/${btn.dataset.id}`));
  }
});

paintSay();


/* ── 6. 홈 · 상세 시트 · 라우팅 ─────────────────────────────── */

const ROUTE_KEY = "hq.route.v1";
const VIEW_IDS = ["home", "meeting", "tasks", "content", "revenue"];
const DEFAULT_PANE = { home: "", meeting: "room", tasks: "all", content: "blog", revenue: "all" };

function trunc(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function tsFull(ts) {
  if (!ts) return "-";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* 6-1. 홈 요약 */
function renderHome() {
  const msgs = meetMessages();
  const last = msgs[msgs.length - 1];
  const topic = meetTopic().text;
  const tasks = tasksArr();
  const doing = tasks.filter(t => t.status === "doing").length;
  const waiting = tasks.filter(t => t.status === "waiting").length;
  const done = tasks.filter(t => t.status === "done").length;
  const blog = blogArr();
  const pub = blog.filter(b => b.status === "published").length;
  const draft = blog.filter(b => b.status === "draft").length;
  const threads = Object.values(state.data?.content?.threads || {});
  const camps = Object.values(state.data?.content?.campaigns || {});
  const campsOpen = camps.filter(c => c.status !== "submitted").length;
  const f = state.data?.finance || {};
  const aff = f.affiliate || {};
  const det = f.detailing || {};

  $("#homeGrid").innerHTML = `
    <button class="home-card meet" data-go="meeting" type="button">
      <span class="hc-top">💬 합동 회의실</span>
      <span class="hc-big">${msgs.length}개 메시지</span>
      <span class="hc-sub">${last
        ? `${esc(PEOPLE[last.from]?.name || last.from)} · ${clock(last.ts)} — ${esc(trunc(last.text, 34))}`
        : "아직 대화가 없습니다. 첫 메시지를 남겨 보세요."}</span>
      <span class="hc-sub">${topic ? `안건 · ${esc(trunc(topic, 30))}` : "안건 미정"}</span>
      <span class="hc-go">회의실 들어가기 →</span>
    </button>

    <button class="home-card tasks" data-go="tasks" type="button">
      <span class="hc-top">📋 업무 보드</span>
      <span class="hc-big">${doing + waiting}건 남음</span>
      <span class="hc-sub">진행 중 ${doing} · 대기 중 ${waiting} · 완료 ${done} · 전체 ${tasks.length}건</span>
      <span class="hc-sub">카드를 누르면 상세 내용을 바로 보고 고칠 수 있습니다</span>
      <span class="hc-go">업무 보드 열기 →</span>
    </button>

    <button class="home-card content" data-go="content" type="button">
      <span class="hc-top">📝 콘텐츠 현황</span>
      <span class="hc-big">${blog.length}편</span>
      <span class="hc-sub">발행 ${pub} · 임시저장 ${draft}</span>
      <span class="hc-sub">스레드 ${threads.length}건 · 캠페인 미제출 ${campsOpen}</span>
      <span class="hc-go">콘텐츠 보기 →</span>
    </button>

    <button class="home-card revenue" data-go="revenue" type="button">
      <span class="hc-top">💰 수익 · 장부</span>
      <span class="hc-big">${won(aff.total?.revenue || 0)}</span>
      <span class="hc-sub">제휴 순이익 ${won(aff.total?.profit || 0)}</span>
      <span class="hc-sub">세차·디테일링 예상 급여 ${won(det.netPay || 0)}</span>
      <span class="hc-go">수익·장부 열기 →</span>
    </button>
  `;

  $("#homeStamp").textContent = new Date().toLocaleDateString("ko-KR", {
    month: "long", day: "numeric", weekday: "short"
  });
}

/* 6-2. 수익 상세 */
function kvRow(k, v) {
  return `<div class="kv-row"><span class="k">${k}</span><b>${v}</b></div>`;
}

function avgWon(total, count) {
  const c = Number(count) || 0;
  return c ? won(Math.round((Number(total) || 0) / c)) : "-";
}

function renderRevenueDetail() {
  const f = state.data?.finance || {};
  const aff = f.affiliate || {};
  const c = aff.coupang || {};
  const s = aff.shopconnect || {};
  const det = f.detailing || {};

  $("#revCoupang").innerHTML = Object.keys(c).length ? `
    <div class="sheet-row"><span class="k">수익원</span><span class="v"><b>쿠팡 파트너스</b></span></div>
    <div class="detail-num">${won(c.revenue)} <small>${c.orders || 0}건</small></div>
    <div class="kv">
      ${kvRow("순이익", won(c.profit))}
      ${kvRow("건당 평균 매출", avgWon(c.revenue, c.orders))}
      ${kvRow("비고", esc(c.note || "-"))}
      ${kvRow("데이터 경로", "hq/finance/affiliate/coupang")}
    </div>
    <div class="kv-note">값은 DB의 finance 노드에서 갱신됩니다. 12:00 제시 보고 → 13:00 로빈 취합.</div>`
    : `<div class="empty">쿠팡 파트너스 데이터가 없습니다</div>`;

  $("#revShopconnect").innerHTML = Object.keys(s).length ? `
    <div class="sheet-row"><span class="k">수익원</span><span class="v"><b>네이버 쇼핑커넥트</b></span></div>
    <div class="detail-num">${won(s.revenue)} <small>${s.orders || 0}건</small></div>
    <div class="kv">
      ${kvRow("세전 수수료", won(s.profit))}
      ${kvRow("건당 평균 매출", avgWon(s.revenue, s.orders))}
      ${kvRow("비고", esc(s.note || "-"))}
      ${kvRow("데이터 경로", "hq/finance/affiliate/shopconnect")}
    </div>
    <div class="kv-note">값은 DB의 finance 노드에서 갱신됩니다. 12:00 제리 보고 → 13:00 로빈 취합.</div>`
    : `<div class="empty">쇼핑커넥트 데이터가 없습니다</div>`;

  const billed = Number(det.billed) || 0;
  const share = Number(det.partnerShare) || 0;
  $("#revDetailing").innerHTML = det.jobs !== undefined ? `
    <div class="sheet-row"><span class="k">수익원</span><span class="v"><b>세차 · 디테일링 부업</b> <span class="hint">11월 누계</span></span></div>
    <div class="detail-num">${Number(det.jobs).toLocaleString("ko-KR")}회 <small>예상 급여 ${won(det.netPay)}</small></div>
    <div class="kv">
      ${kvRow("예상 청구합", won(billed))}
      ${kvRow("외부 지급 60%", won(share))}
      ${kvRow("내 몫 40%", won(billed - share))}
      ${kvRow("건당 평균 청구", avgWon(billed, det.jobs))}
      ${kvRow("정산 구조", "60/40 정산 · 급여에서 3.3% 공제 추정")}
      ${kvRow("비고", esc(det.note || "-"))}
      ${kvRow("데이터 경로", "hq/finance/detailing")}
    </div>`
    : `<div class="empty">세차·디테일링 장부가 아직 없습니다</div>`;
}

/* 6-3. 상세 시트 */
const sheetEl = $("#sheet");
let sheetOpen = false;

function openSheet(title, html) {
  $("#sheetTitle").textContent = title;
  $("#sheetBody").innerHTML = html;
  sheetEl.hidden = false;
  sheetOpen = true;
  document.documentElement.style.overflow = "hidden";
}

function closeSheet() {
  if (!sheetOpen) return;
  sheetEl.hidden = true;
  $("#sheetBody").innerHTML = "";
  sheetOpen = false;
  document.documentElement.style.overflow = "";
}

function statusChips(list, cur, act, extra) {
  return list.map(([k, label]) =>
    `<button class="chip${k === cur ? " is-on" : ""}" data-act="${act}" ${extra} data-status="${k}" type="button">${label}</button>`
  ).join("");
}

/* 상세 내용 자동 높이 */
function autosize(ta, min = 150, max = 2400) {
  ta.style.height = "auto";
  const need = ta.scrollHeight + 2;
  ta.style.height = Math.max(min, Math.min(need, max)) + "px";
  ta.style.overflowY = need > max ? "auto" : "hidden";
}

/* 상세 시트에 편집 중인 제목·내용 읽기 */
function taskEditValues() {
  const titleEl = sheetEl.querySelector("#taskEditTitle");
  const detailEl = sheetEl.querySelector("#taskEditDetail");
  if (!titleEl && !detailEl) return null;
  return {
    title: titleEl ? titleEl.value.trim() : "",
    detail: detailEl
      ? detailEl.value.replace(/[ \t]+$/gm, "").replace(/\n{4,}/g, "\n\n\n").trim()
      : ""
  };
}

/* 공통 메모 블록 (블로그 · 스레드 · 캠페인) */
function memoBlock(path, value, label) {
  return `
    <div class="sheet-sep"></div>
    <div class="sheet-field">
      <span class="sheet-label">${esc(label || "메모")}</span>
      <textarea class="sheet-memo" data-memo-path="${esc(path)}" rows="3" placeholder="진행 상황·다음 할 일을 적어 두세요" aria-label="${esc(label || "메모")}">${esc(value || "")}</textarea>
      <div class="sheet-save">
        <button class="mini-btn" data-act="save-memo" data-path="${esc(path)}" type="button">메모 저장</button>
      </div>
    </div>`;
}

function openTaskSheet(id, savedAt) {
  const t = tasksArr().find(x => x.id === id);
  if (!t) return;
  const ownerOpts = Object.entries(OWNER).map(([k, v]) =>
    `<option value="${k}"${t.owner === k ? " selected" : ""}>${v}</option>`).join("");
  const detail = taskDetail(t);
  const stamp = tsFull(t.updatedAt || t.createdAt);

  openSheet("업무 상세", `
    <div class="sheet-field">
      <span class="sheet-label">업무 제목</span>
      <input id="taskEditTitle" type="text" maxlength="200" value="${esc(t.title)}" aria-label="업무 제목 수정">
    </div>
    <div class="sheet-row">
      <span class="k">담당자</span>
      <select data-act="task-owner" data-id="${t.id}" aria-label="담당자 변경">${ownerOpts}</select>
    </div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${STATUS[t.status] || t.status}</span></div>
    <div class="sheet-row"><span class="k">최근 갱신</span><span class="v">${stamp}</span></div>
    <div class="sheet-row"><span class="k">등록</span><span class="v">${tsFull(t.createdAt)}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(STATUS), t.status, "task-status", `data-id="${t.id}"`)}
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-field">
      <span class="sheet-label">상세 내용 · 메모</span>
      <textarea id="taskEditDetail" rows="8" placeholder="진행 상황, 다음 할 일, 체크리스트, 관련 링크를 적어 두세요." aria-label="업무 상세 내용">${esc(detail)}</textarea>
      <span class="sheet-hint">줄바꿈·목록이 그대로 저장됩니다. Ctrl(⌘)+Enter로 저장.</span>
    </div>
    <div class="sheet-save">
      ${savedAt ? `<span class="saved-flag">저장했습니다 · ${clock(savedAt)}</span>` : ""}
      <button class="btn primary" data-act="task-save" data-id="${t.id}" type="button">저장</button>
    </div>
    <div class="sheet-sep"></div>
    <div class="sheet-actions" style="justify-content:flex-end">
      <button class="mini-btn danger" data-act="task-del" data-id="${t.id}" type="button">업무 삭제</button>
    </div>
  `);

  const ta = $("#taskEditDetail");
  if (ta) {
    autosize(ta);
    ta.addEventListener("input", () => autosize(ta));
    ta.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const save = sheetEl.querySelector('[data-act="task-save"]');
        if (save) save.click();
      }
    });
  }
}

function openBlogSheet(key) {
  const b = blogArr().find(x => x.key === key);
  if (!b) return;
  openSheet(`${b.no}호 상세`, `
    <div class="sheet-row"><span class="k">제목</span><span class="v"><b>${esc(b.title)}</b></span></div>
    <div class="sheet-row"><span class="k">발행일</span><span class="v">${esc(b.date || "-")}</span></div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${BLOG_STATUS[b.status] || b.status}</span></div>
    <div class="sheet-row"><span class="k">최근 갱신</span><span class="v">${tsFull(b.updatedAt)}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(BLOG_STATUS), b.status, "blog-status", `data-key="${esc(b.key)}"`)}
    </div>
    ${memoBlock(`${ROOT}/content/blog/${b.key}`, b.note, "메모 · 집필 내역")}
    <div class="kv-note">발행은 사장님이 직접 결정합니다. 카드의 제목을 누르면 바로 수정할 수 있습니다.</div>
  `);
}

function openThreadSheet(id) {
  const arr = Object.entries(state.data?.content?.threads || {}).map(([k, v]) => ({ id: k, ...v }));
  const s = arr.find(x => x.id === id);
  if (!s) return;
  const link = s.url
    ? `<div class="sheet-row"><span class="k">게시물</span><span class="v"><a class="mini-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">열어 보기 ↗</a></span></div>`
    : `<div class="sheet-row"><span class="k">게시물</span><span class="v">링크 없음</span></div>`;
  openSheet("스레드 상세", `
    <div class="sheet-row"><span class="k">제목</span><span class="v"><b>${esc(s.title)}</b></span></div>
    ${link}
    <div class="sheet-row"><span class="k">작성일</span><span class="v">${esc(s.date || "-")}</span></div>
    <div class="sheet-row"><span class="k">분량</span><span class="v">${s.chars ? esc(s.chars) + "자" : "-"}</span></div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${THREAD_STATUS[s.status] || s.status || "-"}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(THREAD_STATUS), s.status, "thread-status", `data-id="${s.id}"`)}
    </div>
    ${memoBlock(`${ROOT}/content/threads/${s.id}`, s.note, "메모 · 진행 상황")}
  `);
}

function openCampaignSheet(id) {
  const arr = Object.entries(state.data?.content?.campaigns || {}).map(([k, v]) => ({ id: k, ...v }));
  const c = arr.find(x => x.id === id);
  if (!c) return;
  const d = dayDiff(c.due);
  const dLabel = d === null ? "-" : (d === 0 ? "D-DAY" : (d > 0 ? `D-${d}` : `마감 ${Math.abs(d)}일 지남`));
  openSheet("캠페인 상세", `
    <div class="sheet-row"><span class="k">캠페인</span><span class="v"><b>${esc(c.name)}</b></span></div>
    <div class="sheet-row"><span class="k">채널</span><span class="v">${esc(c.channel || "-")}</span></div>
    <div class="sheet-row"><span class="k">마감</span><span class="v">${esc(c.due || "-")} · <b>${dLabel}</b></span></div>
    <div class="sheet-row"><span class="k">현재 상태</span><span class="v">${CAMP_STATUS[c.status] || c.status || "-"}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-label">상태 바꾸기</div>
    <div class="sheet-actions">
      ${statusChips(Object.entries(CAMP_STATUS), c.status, "camp-status", `data-id="${c.id}"`)}
    </div>
    ${memoBlock(`${ROOT}/content/campaigns/${c.id}`, c.note, "메모 · 제출 준비")}
  `);
}

/* 6-2b. 비서별 사용량 수정 시트 */
function usagePreviewHtml(pct) {
  const tone = usageToneOf(pct);
  const label = pct == null ? "미입력" : esc(usageLabelOf(pct));
  return `<b>${pct == null ? "--" : pct + "%"}</b> · ${label}`;
}

function openUsageSheet(k) {
  const p = PEOPLE[k];
  if (!p) return;
  const u = usageData(k);
  openSheet(`${p.emoji} ${p.name} 사용량`, `
    <div class="usage-guide">
      <b>📌 입력 방법</b>
      <span>각 비서 앱 → <b>'내 피클'</b> 탭에서 확인한 사용량을 직접 입력해 주세요. 비서는 자기 사용량을 조회할 수 없어 자동으로 채워지지 않습니다.</span>
    </div>
    <div class="sheet-row"><span class="k">현재</span><span class="v">${u.pct == null ? "미입력" : `<b>${u.pct}%</b> · ${esc(u.label)}`}</span></div>
    <div class="sheet-row"><span class="k">마지막 갱신</span><span class="v">${u.updatedAt ? tsFull(u.updatedAt) : "-"}</span></div>
    <div class="sheet-row"><span class="k">메모</span><span class="v">${u.note ? esc(u.note) : "-"}</span></div>
    <div class="sheet-sep"></div>
    <div class="sheet-field">
      <span class="sheet-label">사용률 (%) — 비우면 미입력</span>
      <div class="usage-edit">
        <input id="usagePct" type="number" min="0" max="100" step="1" inputmode="numeric"
               value="${u.pct == null ? "" : u.pct}" placeholder="--" aria-label="사용률 퍼센트">
        <input id="usageRange" type="range" min="0" max="100" step="1" value="${u.pct == null ? 0 : u.pct}" aria-label="사용률 슬라이더">
      </div>
      <div class="usage-preview" id="usagePreview" data-tone="${u.tone}">${usagePreviewHtml(u.pct)}</div>
      <div class="sheet-hint">0~59% 여유 · 60~84% 한도 주의 · 85% 이상 한도 경고. 원형 그래프 색이 단계에 맞춰 바뀝니다.</div>
    </div>
    <div class="sheet-field">
      <span class="sheet-label">상태 라벨</span>
      <input id="usageLabel" type="text" maxlength="16" value="${esc(u.label)}" placeholder="여유 / 한도 주의 / 미입력" aria-label="상태 라벨">
    </div>
    <div class="sheet-field">
      <span class="sheet-label">메모 · 한도 현황</span>
      <textarea id="usageNote" class="sheet-memo" rows="3" placeholder="예: 주간 한도 40% 사용 · 오늘 글 3건 남음" aria-label="한도 메모">${esc(u.note)}</textarea>
    </div>
    <div class="sheet-save">
      <button class="mini-btn" data-act="usage-clear" data-key="${k}" type="button">미입력으로 지우기</button>
      <button class="btn primary" data-act="usage-save" data-key="${k}" type="button">저장</button>
    </div>
    <p class="saved-flag" id="usageSaved" hidden>저장했습니다 ✓ 모든 기기에 즉시 반영됩니다</p>
  `);
}

function readUsageForm() {
  const pctEl = $("#usagePct");
  const raw = pctEl ? String(pctEl.value).trim() : "";
  let pct = raw === "" ? null : Math.round(Number(raw));
  if (pct != null && !Number.isFinite(pct)) pct = null;
  if (pct != null) pct = Math.max(0, Math.min(100, pct));
  const labelEl = $("#usageLabel");
  const noteEl = $("#usageNote");
  return {
    pct,
    label: labelEl ? labelEl.value.trim() : "",
    note: noteEl ? noteEl.value.replace(/[ \t]+$/gm, "").trim() : ""
  };
}

function saveUsage(k, clear) {
  if (!db || !PEOPLE[k]) return;
  const v = readUsageForm();
  const pct = clear ? null : v.pct;
  const label = clear
    ? "미입력"
    : (pct == null
      ? (v.label && !["여유", "한도 주의", "한도 경고"].includes(v.label) ? v.label : "미입력")
      : (!v.label || v.label === "미입력" ? usageLabelOf(pct) : v.label));
  const payload = { usedPct: pct, label, note: v.note, updatedAt: Date.now() };
  if (state.data) {
    state.data.usage = state.data.usage || {};
    state.data.usage[k] = payload;
  }
  set(ref(db, `${ROOT}/usage/${k}`), payload);
  renderMeeting();
  openUsageSheet(k);
  const flag = $("#usageSaved");
  if (flag) flag.hidden = false;
}

sheetEl.addEventListener("input", e => {
  const el = e.target;
  if (!el || (el.id !== "usagePct" && el.id !== "usageRange")) return;
  const pctEl = $("#usagePct");
  const rangeEl = $("#usageRange");
  if (!pctEl || !rangeEl) return;

  if (el.id === "usageRange") {
    pctEl.value = el.value;
  } else if (String(pctEl.value).trim() === "") {
    rangeEl.value = "0";
  } else {
    const n = Math.max(0, Math.min(100, Math.round(Number(pctEl.value) || 0)));
    rangeEl.value = String(n);
  }

  const raw = String(pctEl.value).trim();
  const pct = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
  const prev = $("#usagePreview");
  if (prev) {
    prev.dataset.tone = usageToneOf(pct);
    prev.innerHTML = usagePreviewHtml(pct);
  }
});

sheetEl.addEventListener("click", e => {
  if (e.target.closest("[data-sheet-close]")) { closeSheet(); return; }
  const btn = e.target.closest("button[data-act]");
  if (!btn || !db) return;
  const id = btn.dataset.id;
  const st = btn.dataset.status;

  if (btn.dataset.act === "usage-save") {
    saveUsage(btn.dataset.key, false);
    return;
  }
  if (btn.dataset.act === "usage-clear") {
    saveUsage(btn.dataset.key, true);
    return;
  }

  if (btn.dataset.act === "task-save") {
    const v = taskEditValues();
    if (!v) return;
    if (!v.title) {
      const titleEl = sheetEl.querySelector("#taskEditTitle");
      if (titleEl) { titleEl.focus(); titleEl.select(); }
      return;
    }
    const now = Date.now();
    if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], { ...v, updatedAt: now });
    update(ref(db, `${ROOT}/tasks/${id}`), { ...v, updatedAt: now });
    renderTasks();
    openTaskSheet(id, now);
  } else if (btn.dataset.act === "save-memo") {
    const path = btn.dataset.path;
    const field = [...sheetEl.querySelectorAll("textarea[data-memo-path]")]
      .find(el => el.dataset.memoPath === path);
    if (!field) return;
    const note = field.value.replace(/[ \t]+$/gm, "").trim();
    update(ref(db, path), { note, updatedAt: Date.now() });
    btn.textContent = "저장했습니다 ✓";
    setTimeout(() => { btn.textContent = "메모 저장"; }, 1800);
  } else if (btn.dataset.act === "task-status") {
    const v = taskEditValues();
    const patch = { status: st, updatedAt: Date.now() };
    if (v && v.title) { patch.title = v.title; patch.detail = v.detail; }
    if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], patch);
    update(ref(db, `${ROOT}/tasks/${id}`), patch);
    openTaskSheet(id);
  } else if (btn.dataset.act === "task-del") {
    if (confirm("이 업무를 삭제할까요?")) { remove(ref(db, `${ROOT}/tasks/${id}`)); closeSheet(); }
  } else if (btn.dataset.act === "thread-status") {
    if (state.data?.content?.threads?.[id]) Object.assign(state.data.content.threads[id], { status: st, updatedAt: Date.now() });
    update(ref(db, `${ROOT}/content/threads/${id}`), { status: st, updatedAt: Date.now() });
    openThreadSheet(id);
  } else if (btn.dataset.act === "camp-status") {
    if (state.data?.content?.campaigns?.[id]) Object.assign(state.data.content.campaigns[id], { status: st, updatedAt: Date.now() });
    update(ref(db, `${ROOT}/content/campaigns/${id}`), { status: st, updatedAt: Date.now() });
    openCampaignSheet(id);
  } else if (btn.dataset.act === "blog-status") {
    const key = btn.dataset.key;
    if (state.data?.content?.blog?.[key]) Object.assign(state.data.content.blog[key], { status: st, updatedAt: Date.now() });
    update(ref(db, `${ROOT}/content/blog/${key}`), { status: st, updatedAt: Date.now() });
    openBlogSheet(key);
  }
});

sheetEl.addEventListener("change", e => {
  const sel = e.target.closest('select[data-act="task-owner"]');
  if (!sel || !db) return;
  const id = sel.dataset.id;
  if (state.data?.tasks?.[id]) Object.assign(state.data.tasks[id], { owner: sel.value, updatedAt: Date.now() });
  update(ref(db, `${ROOT}/tasks/${id}`), { owner: sel.value, updatedAt: Date.now() });
});

/* 6-4. 라우팅 */
function normalizeRoute(raw) {
  const s = String(raw || "").replace(/^#\/?/, "").trim();
  const [v0, p0] = s.split("/");
  const view = VIEW_IDS.includes(v0) ? v0 : "home";
  const panes = $$(`.view[data-view="${view}"] .subnav .sub-btn`).map(b => b.dataset.pane);
  const pane = panes.includes(p0) ? p0 : (DEFAULT_PANE[view] || "");
  return { view, pane };
}

function applyRoute() {
  const { view, pane } = normalizeRoute(location.hash);

  $$(".view").forEach(sec => { sec.hidden = sec.dataset.view !== view; });
  $$("#mainNav .nav-btn").forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  const sec = $(`.view[data-view="${view}"]`);
  if (sec) {
    $$(".pane", sec).forEach(p => { p.hidden = p.dataset.pane !== pane; });
    $$(".subnav .sub-btn", sec).forEach(b => b.classList.toggle("is-on", b.dataset.pane === pane));
  }

  localStorage.setItem(ROUTE_KEY, `#${view}${pane ? "/" + pane : ""}`);
  window.scrollTo(0, 0);

  if (view === "meeting") {
    const room = $("#meetRoom");
    if (room && pane === "room") room.scrollTop = room.scrollHeight;
  }
}

function go(view, pane) {
  const target = `#${view}${pane ? "/" + pane : ""}`;
  if (location.hash === target) applyRoute();
  else location.hash = target;
}

$("#mainNav").addEventListener("click", e => {
  const b = e.target.closest(".nav-btn");
  if (!b) return;
  go(b.dataset.view, DEFAULT_PANE[b.dataset.view]);
});

document.addEventListener("click", e => {
  const b = e.target.closest(".subnav .sub-btn");
  if (!b) return;
  const sec = b.closest(".view");
  if (sec) go(sec.dataset.view, b.dataset.pane);
});

$("#homeGrid").addEventListener("click", e => {
  const c = e.target.closest("[data-go]");
  if (c) go(c.dataset.go, DEFAULT_PANE[c.dataset.go]);
});

$("#moneyGrid").addEventListener("click", e => {
  const c = e.target.closest("[data-go]");
  if (c) go("revenue", c.dataset.go);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sheetOpen) closeSheet();
});

window.addEventListener("hashchange", applyRoute);

/* ── 7. 시작 ─────────────────────────────────────────────── */

if (!location.hash && localStorage.getItem(ROUTE_KEY)) {
  location.hash = localStorage.getItem(ROUTE_KEY);
}
applyRoute();

if (localStorage.getItem(AUTH_KEY) === "1") {
  unlock();
} else {
  $("#pinInput").focus();
}
