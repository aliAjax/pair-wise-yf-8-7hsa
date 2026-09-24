const storageKey = "zfl17-film-strip-desk";

const fallbackThumbs = ["#d49b35", "#347d89", "#b54d48", "#4d7656", "#6d6378"];

const shiftOptions = ["正常", "偏红", "偏青", "偏黄", "褪色"];
const damageOptions = ["完好", "轻微划痕", "齿孔破损", "接片松动", "需跳过"];

const defaultState = {
  reelTitle: "春日试映A卷",
  segments: [
    {
      id: crypto.randomUUID(),
      code: "A-001",
      batch: "P-2401",
      duration: 18,
      shift: "正常",
      damage: "完好",
      note: "开场街景，节奏平稳，适合保留原顺序。",
      thumb: "",
      review: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-006",
      batch: "P-2401",
      duration: 9,
      shift: "偏红",
      damage: "轻微划痕",
      note: "人物近景左侧有划痕，试映时留意是否明显。",
      thumb: "",
      review: null
    },
    {
      id: crypto.randomUUID(),
      code: "A-012",
      batch: "P-2402",
      duration: 14,
      shift: "褪色",
      damage: "接片松动",
      note: "接片位置靠近段尾，放映前建议重新压平。",
      thumb: "",
      review: null
    }
  ]
};

let state = loadState();
let draggedId = null;

const els = {
  reelTitle: document.querySelector("#reelTitle"),
  colorFilter: document.querySelector("#colorFilter"),
  searchInput: document.querySelector("#searchInput"),
  segmentForm: document.querySelector("#segmentForm"),
  codeInput: document.querySelector("#codeInput"),
  batchInput: document.querySelector("#batchInput"),
  durationInput: document.querySelector("#durationInput"),
  shiftInput: document.querySelector("#shiftInput"),
  damageInput: document.querySelector("#damageInput"),
  thumbInput: document.querySelector("#thumbInput"),
  noteInput: document.querySelector("#noteInput"),
  segmentList: document.querySelector("#segmentList"),
  warningList: document.querySelector("#warningList"),
  totalDuration: document.querySelector("#totalDuration"),
  reviewCount: document.querySelector("#reviewCount"),
  damageCount: document.querySelector("#damageCount"),
  segmentCount: document.querySelector("#segmentCount"),
  exportBtn: document.querySelector("#exportBtn")
};

function normalizeSegment(item) {
  return { batch: "", review: null, ...item };
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = { ...structuredClone(defaultState), ...JSON.parse(saved) };
    parsed.segments = (parsed.segments || []).map(normalizeSegment);
    return parsed;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function isProblem(item) {
  return item.shift !== "正常" || item.damage !== "完好";
}

// 有偏色或破损片段的批号集合：同批其余片段都要待复查
function getProblemBatches() {
  const batches = new Set();
  state.segments.forEach((item) => {
    if (item.batch && isProblem(item)) batches.add(item.batch);
  });
  return batches;
}

// none: 无需复查；pending: 待复查；passed/failed: 已有复查结论
function getReviewState(item, problemBatches) {
  if (!item.batch || !problemBatches.has(item.batch) || isProblem(item)) return "none";
  if (item.review && item.review.batch === item.batch) return item.review.result;
  return "pending";
}

function isCountable(reviewState) {
  return reviewState !== "pending" && reviewState !== "failed";
}

function getFilteredSegments() {
  const color = els.colorFilter.value;
  const keyword = els.searchInput.value.trim();
  return state.segments.filter((item) => {
    const matchesColor = color === "all" || item.shift === color;
    const matchesKeyword = !keyword || `${item.code}${item.batch}${item.note}${item.damage}`.includes(keyword);
    return matchesColor && matchesKeyword;
  });
}

function renderStats() {
  const problemBatches = getProblemBatches();
  let playable = 0;
  let pending = 0;
  state.segments.forEach((item) => {
    const reviewState = getReviewState(item, problemBatches);
    if (reviewState === "pending") pending += 1;
    if (isCountable(reviewState)) playable += Number(item.duration);
  });
  const damaged = state.segments.filter((item) => item.damage !== "完好").length;
  els.totalDuration.textContent = formatDuration(playable);
  els.reviewCount.textContent = pending;
  els.damageCount.textContent = damaged;
  els.segmentCount.textContent = state.segments.length;
}

function optionsHtml(options, current) {
  return options.map((option) => `<option value="${option}" ${option === current ? "selected" : ""}>${option}</option>`).join("");
}

function renderReviewBox(item, reviewState) {
  if (reviewState === "none") {
    if (item.batch && isProblem(item)) {
      return `<div class="review-box trigger">本段触发批号 ${escapeHtml(item.batch)} 的同批复查。</div>`;
    }
    return "";
  }
  if (reviewState === "pending") {
    return `
      <div class="review-box pending">
        <strong>待复查</strong>
        <span>同批 ${escapeHtml(item.batch)} 有偏色或破损，本段保留位置但暂不计入可放时长。</span>
        <div class="review-actions">
          <button type="button" data-review-pass="${item.id}">复查合格</button>
          <button type="button" data-review-fail="${item.id}">复查不合格</button>
        </div>
      </div>
    `;
  }
  if (reviewState === "passed") {
    return `
      <div class="review-box passed">
        <strong>已复查合格</strong>
        <span>已恢复计时。</span>
        <div class="review-actions">
          <button type="button" data-review-reset="${item.id}">撤销复查</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="review-box failed">
      <strong>复查不合格</strong>
      <span>不计入可放时长，请登记处理信息。</span>
      <div class="review-fields">
        <label>处理人<input type="text" data-field="handler" data-id="${item.id}" value="${escapeHtml(item.review.handler)}" placeholder="处理人姓名" /></label>
        <label>处理说明<input type="text" data-field="note" data-id="${item.id}" value="${escapeHtml(item.review.note)}" placeholder="修复或淘汰说明" /></label>
      </div>
      <div class="review-actions">
        <button type="button" data-review-pass="${item.id}">改为合格</button>
        <button type="button" data-review-reset="${item.id}">撤销复查</button>
      </div>
    </div>
  `;
}

function renderList() {
  const problemBatches = getProblemBatches();
  const segments = getFilteredSegments();
  els.segmentList.innerHTML =
    segments
      .map((item) => {
        const realIndex = state.segments.findIndex((segment) => segment.id === item.id);
        const hasDamage = item.damage !== "完好";
        const reviewState = getReviewState(item, problemBatches);
        const reviewBadge =
          reviewState === "pending"
            ? `<span class="tag review">待复查</span>`
            : reviewState === "passed"
              ? `<span class="tag ok">复查合格</span>`
              : reviewState === "failed"
                ? `<span class="tag damage">复查不合格</span>`
                : "";
        return `
          <article class="segment-card" draggable="true" data-id="${item.id}">
            <div class="thumb">
              ${
                item.thumb
                  ? `<img src="${item.thumb}" alt="${escapeHtml(item.code)}缩略图" />`
                  : `<div class="film-placeholder" style="background:${fallbackThumbs[realIndex % fallbackThumbs.length]}">${escapeHtml(item.code)}</div>`
              }
            </div>
            <div class="segment-main">
              <div class="segment-title">
                <strong>${realIndex + 1}. ${escapeHtml(item.code)}</strong>
                <span>${formatDuration(item.duration)}${isCountable(reviewState) ? "" : "（不计时）"}</span>
              </div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(item.shift)}</span>
                <span class="tag ${hasDamage ? "damage" : "ok"}">${escapeHtml(item.damage)}</span>
                <span class="tag batch">${item.batch ? `批号 ${escapeHtml(item.batch)}` : "未登记批号"}</span>
                ${reviewBadge}
              </div>
              <p class="segment-note">${escapeHtml(item.note || "没有备注。")}</p>
              <div class="segment-editors">
                <label>洗印批号<input type="text" data-field="batch" data-id="${item.id}" value="${escapeHtml(item.batch)}" placeholder="例：P-2409" /></label>
                <label>颜色偏移<select data-field="shift" data-id="${item.id}">${optionsHtml(shiftOptions, item.shift)}</select></label>
                <label>破损情况<select data-field="damage" data-id="${item.id}">${optionsHtml(damageOptions, item.damage)}</select></label>
              </div>
              ${renderReviewBox(item, reviewState)}
            </div>
            <div class="segment-actions">
              <button type="button" title="上移" data-move-up="${item.id}">↑</button>
              <button type="button" title="下移" data-move-down="${item.id}">↓</button>
              <button type="button" title="删除" data-delete="${item.id}">×</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的片段。</p>`;
}

function renderWarnings() {
  const problemBatches = getProblemBatches();
  const problems = state.segments.filter(isProblem);
  const pendingItems = state.segments.filter((item) => getReviewState(item, problemBatches) === "pending");
  const failedItems = state.segments.filter((item) => getReviewState(item, problemBatches) === "failed");
  const indexOf = (item) => state.segments.findIndex((segment) => segment.id === item.id) + 1;

  const problemHtml = problems.map((item) => {
    const reasons = [item.shift !== "正常" ? item.shift : "", item.damage !== "完好" ? item.damage : ""].filter(Boolean).join(" · ");
    return `
      <div class="warning-item">
        <strong>${indexOf(item)}. ${escapeHtml(item.code)}${item.batch ? `｜批号 ${escapeHtml(item.batch)}` : ""}</strong>
        <span>${escapeHtml(reasons)}${item.note ? `：${escapeHtml(item.note)}` : ""}</span>
      </div>
    `;
  });

  const pendingHtml = pendingItems.map((item) => `
    <div class="warning-item review">
      <strong>${indexOf(item)}. ${escapeHtml(item.code)}｜待复查</strong>
      <span>同批 ${escapeHtml(item.batch)} 有偏色或破损，复查前不计入可放时长。</span>
    </div>
  `);

  const failedHtml = failedItems.map((item) => `
    <div class="warning-item failed">
      <strong>${indexOf(item)}. ${escapeHtml(item.code)}｜复查不合格</strong>
      <span>处理人：${escapeHtml(item.review.handler || "未填")}｜说明：${escapeHtml(item.review.note || "未填")}</span>
    </div>
  `);

  els.warningList.innerHTML =
    [...problemHtml, ...pendingHtml, ...failedHtml].join("") || `<p class="empty">当前清单没有颜色偏移或破损提醒。</p>`;
}

function renderAll() {
  saveState();
  els.reelTitle.value = state.reelTitle;
  renderStats();
  renderList();
  renderWarnings();
}

function formatDuration(seconds) {
  const value = Number(seconds) || 0;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function addSegment(event) {
  event.preventDefault();
  const thumb = await readFileAsDataUrl(els.thumbInput.files[0]);
  state.segments.push({
    id: crypto.randomUUID(),
    code: els.codeInput.value.trim(),
    batch: els.batchInput.value.trim(),
    duration: Number(els.durationInput.value),
    shift: els.shiftInput.value,
    damage: els.damageInput.value,
    note: els.noteInput.value.trim(),
    thumb,
    review: null
  });
  els.segmentForm.reset();
  els.durationInput.value = 12;
  renderAll();
}

function moveSegment(id, direction) {
  const index = state.segments.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= state.segments.length) return;
  const [item] = state.segments.splice(index, 1);
  state.segments.splice(target, 0, item);
  renderAll();
}

function setReview(id, result) {
  const item = state.segments.find((segment) => segment.id === id);
  if (!item) return;
  if (!result) {
    item.review = null;
  } else {
    const prev = item.review || {};
    item.review = {
      result,
      handler: prev.handler || "",
      note: prev.note || "",
      batch: item.batch
    };
  }
  renderAll();
}

function exportList() {
  const problemBatches = getProblemBatches();
  let playable = 0;
  let pending = 0;
  state.segments.forEach((item) => {
    const reviewState = getReviewState(item, problemBatches);
    if (reviewState === "pending") pending += 1;
    if (isCountable(reviewState)) playable += Number(item.duration);
  });

  const statusOf = (item) => {
    const reviewState = getReviewState(item, problemBatches);
    if (reviewState === "pending") return "待复查（不计入可放时长）";
    if (reviewState === "passed") return "复查合格（恢复计时）";
    if (reviewState === "failed") {
      return `复查不合格（不计入可放时长）｜处理人：${item.review.handler || "未填"}｜处理说明：${item.review.note || "未填"}`;
    }
    return isProblem(item) ? "问题段（触发同批复查）" : "计入";
  };

  const lines = [
    `胶片卷：${state.reelTitle || "未命名胶片卷"}`,
    `可放时长：${formatDuration(playable)}`,
    `待复查：${pending} 段`,
    "",
    ...state.segments.map(
      (item, index) =>
        `${index + 1}. ${item.code}｜批号 ${item.batch || "未登记"}｜${formatDuration(item.duration)}｜${item.shift}｜${item.damage}｜${statusOf(item)}｜${item.note || "无备注"}`
    )
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.reelTitle || "film-reel"}-checklist.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.reelTitle.addEventListener("input", () => {
  state.reelTitle = els.reelTitle.value;
  saveState();
});
els.colorFilter.addEventListener("change", renderList);
els.searchInput.addEventListener("input", renderList);
els.segmentForm.addEventListener("submit", addSegment);
els.exportBtn.addEventListener("click", exportList);

els.segmentList.addEventListener("click", (event) => {
  const up = event.target.closest("[data-move-up]");
  const down = event.target.closest("[data-move-down]");
  const remove = event.target.closest("[data-delete]");
  const reviewPass = event.target.closest("[data-review-pass]");
  const reviewFail = event.target.closest("[data-review-fail]");
  const reviewReset = event.target.closest("[data-review-reset]");
  if (up) moveSegment(up.dataset.moveUp, -1);
  if (down) moveSegment(down.dataset.moveDown, 1);
  if (reviewPass) setReview(reviewPass.dataset.reviewPass, "passed");
  if (reviewFail) setReview(reviewFail.dataset.reviewFail, "failed");
  if (reviewReset) setReview(reviewReset.dataset.reviewReset, null);
  if (remove) {
    state.segments = state.segments.filter((item) => item.id !== remove.dataset.delete);
    renderAll();
  }
});

els.segmentList.addEventListener("change", (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  const item = state.segments.find((segment) => segment.id === event.target.dataset.id);
  if (!item) return;
  if (field === "handler" || field === "note") {
    if (item.review) item.review[field] = event.target.value.trim();
    saveState();
    return;
  }
  item[field] = field === "batch" ? event.target.value.trim() : event.target.value;
  // 改批号或破损/颜色情况后重新判定，本段旧复查结论作废
  item.review = null;
  renderAll();
});

els.segmentList.addEventListener("dragstart", (event) => {
  if (event.target.closest("input, select, textarea, button")) return;
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
});

els.segmentList.addEventListener("dragend", (event) => {
  event.target.closest("[data-id]")?.classList.remove("dragging");
  draggedId = null;
});

els.segmentList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || !draggedId || card.dataset.id === draggedId) return;
  event.preventDefault();
  const fromIndex = state.segments.findIndex((item) => item.id === draggedId);
  const toIndex = state.segments.findIndex((item) => item.id === card.dataset.id);
  if (fromIndex < 0 || toIndex < 0) return;
  const [item] = state.segments.splice(fromIndex, 1);
  state.segments.splice(toIndex, 0, item);
  renderAll();
});

renderAll();
