import { cleanHtml } from "./clean-html.js";
import { saveState, loadState } from "./storage.js";
import { createMadaraZip } from "./zip.js";

const $ = id => document.getElementById(id);

const novelName = $("novelName");
const chapterNumber = $("chapterNumber");
const editor = $("chapterEditor");
const chapterNumberSuggestion = $("chapterNumberSuggestion");
const chapterList = $("chapterList");
const chapterCount = $("chapterCount");
const projectStatus = $("projectStatus");
const zipNamePreview = $("zipNamePreview");
const chapterGapWarning = $("chapterGapWarning");
const chapterGapText = $("chapterGapText");
const fillMissingChapterBtn = $("fillMissingChapterBtn");
const projectGapWarning = $("projectGapWarning");
const projectGapText = $("projectGapText");
const editorStatus = $("editorStatus");
const editorStats = $("editorStats");
const storageStatus = $("storageStatus");
const toast = $("toast");
const previewModal = $("previewModal");
const previewContent = $("previewContent");
const previewTitle = $("previewTitle");
const previewStats = $("previewStats");
const previewEditBtn = $("previewEditBtn");
const tabButtons = [$("tabInput"), $("tabChapters"), $("tabProject")];
const tabPanels = {
  input: $("panelInput"),
  chapters: $("panelChapters"),
  project: $("panelProject")
};
const tabChapterCount = $("tabChapterCount");

const state = {
  novelName: "",
  chapterNumber: "",
  draft: "",
  chapters: {},
  selected: null,
  previewed: null,
  lastAddedChapterNumber: null
};

let saveTimer = null;
let editingChapterNumber = null;
const deletionSelection = new Set();
const keyboardToggleBtn = $("keyboardToggleBtn");
const isMobileEditor = window.matchMedia("(max-width: 700px)");
let mobileTypingEnabled = false;

function setMobileTyping(enabled, focusEditor = false) {
  if (!isMobileEditor.matches) return;

  mobileTypingEnabled = Boolean(enabled);

  // Editor isi chapter
  editor.setAttribute(
    "contenteditable",
    mobileTypingEnabled ? "true" : "false"
  );

  // Input nomor chapter
  chapterNumber.readOnly = !mobileTypingEnabled;

  keyboardToggleBtn.textContent = mobileTypingEnabled
    ? "⌨️ Sembunyikan keyboard"
    : "⌨️ Aktifkan ketik";

  keyboardToggleBtn.setAttribute(
    "aria-pressed",
    String(mobileTypingEnabled)
  );

  if (mobileTypingEnabled && focusEditor) {
    editor.focus();
  } else if (!mobileTypingEnabled) {
    if (document.activeElement === editor) editor.blur();
    if (document.activeElement === chapterNumber) chapterNumber.blur();
  }
}

function runEditorCommand(command, value = null) {
  if (isMobileEditor.matches && !mobileTypingEnabled) {
    showToast("Tekan Aktifkan ketik terlebih dahulu untuk memakai toolbar.");
    return;
  }

  editor.focus();
  document.execCommand(command, false, value);
  updateEditorStats();
  updateChapterNumberSuggestion();
  updateBulkEditorStatus();
  scheduleSave();
}

function setActiveTab(name) {
  if (!Object.prototype.hasOwnProperty.call(tabPanels, name)) {
    name = "input";
  }

  tabButtons.forEach(button => {
    const active =
      button.id ===
      `tab${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  for (const [key, panel] of Object.entries(tabPanels)) {
    const active = key === name;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(
    () => toast.classList.remove("show"),
    2600
  );
}

function getPlainText(html) {
  const box = document.createElement("div");
  box.innerHTML = html || "";

  return (box.innerText || box.textContent || "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function countWords(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function updateEditorStats() {
  const text = getPlainText(editor.innerHTML);
  const characters = text.length;
  const words = countWords(text);

  const paragraphs = text
    ? Math.max(
        1,
        editor.querySelectorAll(
          "p, h1, h2, h3, h4, h5, h6, blockquote, li"
        ).length || text.split(/\n+/).filter(Boolean).length
      )
    : 0;

  editorStats.textContent =
    `${characters.toLocaleString("id-ID")} karakter · ` +
    `${words.toLocaleString("id-ID")} kata · ` +
    `${paragraphs.toLocaleString("id-ID")} paragraf`;
}

function getSafeNovelName() {
  return (
    (novelName.value.trim() || "Novel")
      .replace(/[<>:"/\\|?*]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/[. ]+$/g, "") || "Novel"
  );
}

function getZipFileName(
  numbers = Object.keys(state.chapters).map(Number)
) {
  if (!numbers.length) {
    return `${getSafeNovelName()}.zip`;
  }

  const sorted = [...numbers].sort((a, b) => a - b);

  return (
    `${getSafeNovelName()}` +
    `${sorted[0]}-${sorted[sorted.length - 1]}.zip`
  );
}

/* =========================================================
   DETEKSI CHAPTER TERLEWAT (GAP DETECTION)
   ========================================================= */

function findMissingChapters(
  numbers = Object.keys(state.chapters).map(Number)
) {
  const baseIntegers = [
    ...new Set(
      numbers
        .filter(Number.isFinite)
        .map(num => Math.floor(num))
    )
  ].sort((a, b) => a - b);

  if (baseIntegers.length < 2) {
    return { missingNumbers: [], ranges: [], totalMissing: 0 };
  }

  const presentSet = new Set(baseIntegers);
  const min = baseIntegers[0];
  const max = baseIntegers[baseIntegers.length - 1];
  const missingNumbers = [];

  for (let n = min + 1; n < max; n++) {
    if (!presentSet.has(n)) {
      missingNumbers.push(n);
    }
  }

  const ranges = [];
  let i = 0;
  while (i < missingNumbers.length) {
    const start = missingNumbers[i];
    let end = start;
    while (
      i + 1 < missingNumbers.length &&
      missingNumbers[i + 1] === end + 1
    ) {
      i++;
      end = missingNumbers[i];
    }
    ranges.push(start === end ? String(start) : `${start}–${end}`);
    i++;
  }

  return {
    missingNumbers,
    ranges,
    totalMissing: missingNumbers.length
  };
}

function formatMissingRanges(ranges, maxVisible = 8) {
  if (ranges.length <= maxVisible) {
    return ranges.join(", ");
  }
  const visible = ranges.slice(0, maxVisible).join(", ");
  return `${visible}, +${ranges.length - maxVisible} lainnya`;
}

function updateGapWarnings(
  numbers = Object.keys(state.chapters).map(Number)
) {
  const { missingNumbers, ranges, totalMissing } =
    findMissingChapters(numbers);

  if (!totalMissing) {
    if (chapterGapWarning) chapterGapWarning.hidden = true;
    if (projectGapWarning) projectGapWarning.hidden = true;
    return;
  }

  const summaryText = formatMissingRanges(ranges, 8);
  const fullListTitle = `Chapter terlewat: ${ranges.join(", ")}`;

  if (chapterGapWarning && chapterGapText) {
    chapterGapText.textContent =
      `Terlewat ${totalMissing} chapter: Chapter ${summaryText}`;
    chapterGapWarning.title = fullListTitle;
    chapterGapWarning.hidden = false;

    if (fillMissingChapterBtn) {
      const firstMissing = missingNumbers[0];
      fillMissingChapterBtn.dataset.number = String(firstMissing);
      fillMissingChapterBtn.textContent = `Isi Ch. ${firstMissing}`;
    }
  }

  if (projectGapWarning && projectGapText) {
    projectGapText.textContent =
      `Terlewat (${totalMissing}): Ch. ${formatMissingRanges(ranges, 5)}`;
    projectGapWarning.title = fullListTitle;
    projectGapWarning.hidden = false;
  }
}

function updateProjectStatus() {
  const numbers = Object.keys(state.chapters)
    .map(Number)
    .sort((a, b) => a - b);

  const count = numbers.length;

  if (!count) {
    projectStatus.textContent = "Belum ada chapter.";
    zipNamePreview.textContent = "Nama ZIP: —";
    updateGapWarnings(numbers);
    return;
  }

  projectStatus.textContent =
    count === 1
      ? "1 chapter siap di-generate."
      : `${count} chapter · Chapter ${numbers[0]}–${numbers[numbers.length - 1]}`;

  zipNamePreview.textContent =
    `Nama ZIP: ${getZipFileName(numbers)}`;

  updateGapWarnings(numbers);
}

function scheduleSave() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    state.novelName = novelName.value;
    state.chapterNumber = chapterNumber.value;
    state.draft = editor.innerHTML;

    await saveState(state);

    storageStatus.textContent = "● Tersimpan otomatis";
  }, 250);
}

/* =========================================================
   PEMILIHAN DAN PENGHAPUSAN CHAPTER
   ========================================================= */

function updateDeleteSelectionUI() {
  const existingNumbers = new Set(
    Object.keys(state.chapters).map(Number)
  );

  for (const number of deletionSelection) {
    if (!existingNumbers.has(number)) {
      deletionSelection.delete(number);
    }
  }

  const selectedCount = deletionSelection.size;
  const deleteButton = $("deleteChapterBtn");
  const selectedCountLabel = $("selectedChapterCount");
  const selectAllCheckbox = $("selectAllChapters");
  const totalCount = existingNumbers.size;

  deleteButton.disabled = selectedCount === 0;

  selectedCountLabel.textContent =
    `${selectedCount} dipilih`;

  selectAllCheckbox.checked =
    totalCount > 0 && selectedCount === totalCount;

  selectAllCheckbox.indeterminate =
    selectedCount > 0 && selectedCount < totalCount;

  selectAllCheckbox.disabled = totalCount === 0;
}

function renderList() {
  const numbers = Object.keys(state.chapters)
    .map(Number)
    .sort((a, b) => a - b);

  chapterList.innerHTML = "";

  tabChapterCount.textContent = String(numbers.length);

  tabChapterCount.classList.toggle(
    "has-items",
    numbers.length > 0
  );

  chapterCount.textContent = numbers.length
    ? (
        numbers.length === 1
          ? "1 chapter"
          : ` ${numbers.length} chapter · ${numbers[0]}–${numbers[numbers.length - 1]}`
      ).trim()
    : "0 chapter";

  updateProjectStatus();

  if (!numbers.length) {
    chapterList.innerHTML =
      `<div class="empty-list">Belum ada chapter.<br>` +
      `<small>Chapter yang ditambahkan akan muncul di sini.</small></div>`;

    updateDeleteSelectionUI();
    return;
  }

  for (const number of numbers) {
    const row = document.createElement("div");

    row.className =
      `chapter-item` +
      `${state.previewed === number ? " previewing" : ""}` +
      `${deletionSelection.has(number) ? " deletion-selected" : ""}`;

    const checkbox = document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.className = "chapter-select-checkbox";
    checkbox.checked = deletionSelection.has(number);

    checkbox.setAttribute(
      "aria-label",
      `Pilih Chapter ${number} untuk dihapus`
    );

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        deletionSelection.add(number);
      } else {
        deletionSelection.delete(number);
      }

      renderList();
    });

    const previewButton = document.createElement("button");

    previewButton.type = "button";
    previewButton.className = "chapter-preview-button";

    const text = getPlainText(state.chapters[number]);
    const wordCount = countWords(text);

    previewButton.innerHTML = `
      <span class="chapter-item-main">
        <strong>Chapter ${number}</strong>
        <small>${wordCount.toLocaleString("id-ID")} kata</small>
      </span>
      <span class="chapter-item-arrow">›</span>
    `;

    previewButton.addEventListener("click", () => {
      openPreview(number);
    });

    row.append(checkbox, previewButton);
    chapterList.appendChild(row);
  }

  updateDeleteSelectionUI();
}

function openPreview(number) {
  const content = state.chapters[number];

  if (content == null) return;

  state.previewed = number;

  previewTitle.textContent = `Chapter ${number}`;
  previewContent.innerHTML = content;

  const text = getPlainText(content);

  previewStats.textContent =
    `${text.length.toLocaleString("id-ID")} karakter · ` +
    `${countWords(text).toLocaleString("id-ID")} kata`;

  previewEditBtn.dataset.chapter = String(number);

  previewModal.hidden = false;
  previewModal.setAttribute("aria-hidden", "false");

  document.body.classList.add("modal-open");

  renderList();

  requestAnimationFrame(() => {
    $("closePreviewBtn").focus();
  });
}

function closePreview() {
  previewModal.hidden = true;
  previewModal.setAttribute("aria-hidden", "true");

  document.body.classList.remove("modal-open");

  state.previewed = null;

  renderList();
}

function editPreviewedChapter() {
  const number = Number(previewEditBtn.dataset.chapter);

  if (
    !Number.isFinite(number) ||
    state.chapters[number] == null
  ) {
    return;
  }

  state.selected = number;
  editingChapterNumber = number;
  chapterNumber.value = number;
  editor.innerHTML = state.chapters[number];

  updateEditorStats();

  editorStatus.textContent =
    `Chapter ${number} sedang diedit.`;

  closePreview();
  renderList();
  scheduleSave();

  setActiveTab("input");
  editor.focus();
}

/* =========================================================
   DETEKSI DAN SARAN NOMOR CHAPTER
   ========================================================= */

function detectChapter(silent = false) {
  const source = editor.innerHTML || editor.textContent || "";

  const patterns = [
    /<h[1-6][^>]*>(?:\s|<[^>]+>)*?(?:BAB|Chapter|Ch\.?)\s*(\d+(?:[.,]\d+)?)\b/i,
    /^(?:BAB|Chapter|Ch\.?)\s*(\d+(?:[.,]\d+)?)\b/im,
    /\b(?:BAB|Chapter)\s*(\d+(?:[.,]\d+)?)\b/i,
    /\bCh\.?\s*(\d+(?:[.,]\d+)?)\b/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);

    if (match) {
      const detected = match[1].replace(",", ".");
      chapterNumber.value = detected;

      updateChapterNumberSuggestion();
      scheduleSave();

      if (!silent) {
        showToast(`Chapter ${detected} terdeteksi.`);
      }

      return Number(detected);
    }
  }

  updateChapterNumberSuggestion();

  if (!silent) {
    showToast("Nomor chapter tidak ditemukan.");
  }

  return null;
}

function getNumber() {
  const normalized = chapterNumber.value.trim().replace(",", ".");
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function hasRecognizedChapterHeading() {
  const text = getPlainText(editor.innerHTML);

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  const patterns = [
    /^(?:BAB|Chapter|Ch\.?)\s*\d+(?:[.,]\d+)?\b/i,
    /^\d+(?:[.,]\d+)?\s*[:.\-–—]\s*\S+/i,
    /^(?:prolog|prologue|epilog|epilogue)\b/i
  ];

  if (
    lines.some(line =>
      patterns.some(pattern => pattern.test(line))
    )
  ) {
    return true;
  }

  const source = editor.innerHTML || editor.textContent || "";

  return [
    /<h[1-6][^>]*>(?:\s|<[^>]+>)*?(?:BAB|Chapter|Ch\.?)\s*(\d+(?:[.,]\d+)?)\b/i,
    /^(?:BAB|Chapter|Ch\.?)\s*(\d+(?:[.,]\d+)?)\b/im,
    /\b(?:BAB|Chapter)\s*(\d+(?:[.,]\d+)?)\b/i,
    /\bCh\.?\s*(\d+(?:[.,]\d+)?)\b/i
  ].some(pattern => pattern.test(source));
}

function getNextChapterSuggestion() {
  if (
    typeof state.lastAddedChapterNumber === "number" &&
    Number.isFinite(state.lastAddedChapterNumber) &&
    state.lastAddedChapterNumber >= 0
  ) {
    return Math.floor(state.lastAddedChapterNumber) + 1;
  }

  const numbers = Object.keys(state.chapters)
    .map(Number)
    .filter(Number.isFinite);

  return numbers.length
    ? Math.floor(Math.max(...numbers)) + 1
    : 1;
}

function updateChapterNumberSuggestion() {
  if (!chapterNumberSuggestion) return;

  const text = getPlainText(editor.innerHTML);

  if (
    !text ||
    chapterNumber.value.trim() !== "" ||
    hasRecognizedChapterHeading()
  ) {
    chapterNumberSuggestion.hidden = true;
    return;
  }

  const number = getNextChapterSuggestion();

  chapterNumberSuggestion.textContent =
    `↑ ${number} · Gunakan saran`;

  chapterNumberSuggestion.dataset.number = String(number);
  chapterNumberSuggestion.hidden = false;
}

/* =========================================================
   KONTEN CHAPTER & BULK SPLITTER
   ========================================================= */

const CHAPTER_HEADING_PATTERN = /^(?:Chapter|Ch\.?|Bab)\s*\d+(?:[.,]\d+)?(?![0-9])/i;
const BULK_CHAPTER_HEADING_PATTERN = /^(?:BAB|Chapter|Ch\.?)\s*(\d+(?:[.,]\d+)?)(?![0-9])(?:\s*$|[\s:.\-–—,;()[\]]+.*)/i;
const CHAPTER_BREAK_MARKER_TEXT = "--- BATAS CHAPTER ---";

function isChapterBreakBlock(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  if (node.dataset?.chapterBreak === "true") return true;
  const text = (node.textContent || "").replace(/\u00a0/g, " ").trim();
  return text === CHAPTER_BREAK_MARKER_TEXT;
}

function isEmptySpacerElement(node) {
  if (!node) return true;
  if (node.nodeType === Node.TEXT_NODE) {
    return !node.nodeValue.replace(/[\u00a0\s]/g, "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return true;
  if (isChapterBreakBlock(node)) return false;
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return true;
  if (["img", "hr", "table"].includes(tag)) return false;
  return (
    !node.textContent.replace(/[\u00a0\s]/g, "") &&
    !node.querySelector("img, hr, table")
  );
}

function trimEdgeSpacerNodes(container) {
  while (container.firstChild && isEmptySpacerElement(container.firstChild)) {
    container.removeChild(container.firstChild);
  }
  while (container.lastChild && isEmptySpacerElement(container.lastChild)) {
    container.removeChild(container.lastChild);
  }
}

function normalizeOrInsertChapterHeading(content, number) {
  const box = document.createElement("div");
  box.innerHTML = content;

  // Bersihkan pembatas chapter jika masih tersisa di dalam konten
  Array.from(box.querySelectorAll("*")).forEach(el => {
    if (isChapterBreakBlock(el)) el.remove();
  });

  trimEdgeSpacerNodes(box);

  const blocks = Array.from(box.children).filter(el =>
    el.textContent.replace(/\u00a0/g, " ").trim().length > 0
  ).slice(0, 3);

  for (const el of blocks) {
    const line = el.textContent.replace(/\u00a0/g, " ").trim();
    if (CHAPTER_HEADING_PATTERN.test(line)) {
      el.style.textAlign = "center";
      return box.innerHTML.trim();
    }
  }

  const firstNode = box.firstChild;
  if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
    const firstText = firstNode.nodeValue.trim();
    if (CHAPTER_HEADING_PATTERN.test(firstText)) {
      const h2 = document.createElement("h2");
      h2.style.textAlign = "center";
      h2.textContent = firstText;
      box.replaceChild(h2, firstNode);
      return box.innerHTML.trim();
    }
  }

  return (
    `<h2 style="text-align: center;">Chapter ${number}</h2>\n` +
    `<br>\n${box.innerHTML.trim()}`
  );
}

function extractNormalizedBlocks(rootElement) {
  const BLOCK_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "ul", "ol", "table",
    "hr", "figure", "div"
  ]);

  const blocks = [];

  function pushInlineBuffer(buffer) {
    if (!buffer.length) return;
    const p = document.createElement("p");
    buffer.forEach(node => p.appendChild(node.cloneNode(true)));
    if (!isEmptySpacerElement(p)) {
      blocks.push(p);
    }
    buffer.length = 0;
  }

  function walk(node) {
    let inlineBuffer = [];

    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue.trim()) {
          inlineBuffer.push(child);
        }
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      if (isChapterBreakBlock(child)) {
        pushInlineBuffer(inlineBuffer);
        blocks.push(child.cloneNode(true));
        continue;
      }

      const tag = child.tagName.toLowerCase();

      if (tag === "br") {
        pushInlineBuffer(inlineBuffer);
        continue;
      }

      if (!BLOCK_TAGS.has(tag)) {
        inlineBuffer.push(child);
        continue;
      }

      pushInlineBuffer(inlineBuffer);

      // Jika div membungkus elemen blok lain, buka wrapper-nya agar tiap paragraf terpisah
      if (tag === "div" && child.querySelector("p, div, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, table")) {
        walk(child);
        continue;
      }

      // Jika paragraf/div mengandung <br> di dalamnya, pecah per baris agar judul chapter di tengah tidak menyatu
      if ((tag === "p" || tag === "div") && child.querySelector("br")) {
        const parts = child.innerHTML.split(/<br\s*\/?>/i);
        for (const part of parts) {
          const temp = document.createElement("p");
          if (child.getAttribute("style")) {
            temp.setAttribute("style", child.getAttribute("style"));
          }
          temp.innerHTML = part.trim();
          if (!isEmptySpacerElement(temp)) {
            blocks.push(temp);
          }
        }
        continue;
      }

      if (!isEmptySpacerElement(child)) {
        blocks.push(child.cloneNode(true));
      }
    }

    pushInlineBuffer(inlineBuffer);
  }

  walk(rootElement);
  return blocks;
}

function matchBulkHeadingBlock(el) {
  const line = (el.textContent || "")
    .replace(/[\u00a0\u200b-\u200d\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!line || line.length > 150) return null;

  const match = line.match(BULK_CHAPTER_HEADING_PATTERN);
  if (!match) return null;

  const num = Number(match[1].replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function parseChaptersFromHtml(rawHtml) {
  const cleaned = cleanHtml(rawHtml);
  if (!cleaned) return [];

  const root = document.createElement("div");
  root.innerHTML = cleaned;

  const blocks = extractNormalizedBlocks(root);
  const sections = [];
  let current = null;

  for (const block of blocks) {
    // 1. Pemicu pemotongan dari pembatas khusus tombol Paste
    if (isChapterBreakBlock(block)) {
      if (current && (current.number != null || current.blocks.length > 0)) {
        sections.push(current);
      }
      current = {
        number: null,
        blocks: []
      };
      continue;
    }

    // 2. Pemicu pemotongan dari header judul chapter di dalam teks
    const detectedNum = matchBulkHeadingBlock(block);
    if (detectedNum != null) {
      if (current && current.number == null && current.blocks.length === 0) {
        // Bagian baru tepat setelah pembatas Paste yang ternyata punya header chapter sendiri
        current.number = detectedNum;
        current.blocks.push(block);
      } else {
        if (current && (current.number != null || current.blocks.length > 0)) {
          sections.push(current);
        }
        current = {
          number: detectedNum,
          blocks: [block]
        };
      }
    } else {
      if (!current) {
        current = {
          number: null,
          blocks: []
        };
      }
      current.blocks.push(block);
    }
  }

  if (current && (current.number != null || current.blocks.length > 0)) {
    sections.push(current);
  }

  return sections;
}

function getBulkEditorSummary(rawHtml = editor.innerHTML) {
  const sections = parseChaptersFromHtml(rawHtml);
  const count = sections.length;

  if (count <= 1) {
    return {
      isBulk: false,
      count,
      needsManualStart: false,
      first: null,
      last: null,
      rangeLabel: ""
    };
  }

  const manualStart = getNumber();
  const firstNum = sections[0].number != null ? sections[0].number : manualStart;

  if (firstNum == null) {
    return {
      isBulk: true,
      count,
      needsManualStart: true,
      first: null,
      last: null,
      rangeLabel: ""
    };
  }

  const resolvedNumbers = [firstNum];
  let previousNumber = firstNum;

  for (let i = 1; i < count; i++) {
    const nextNum =
      sections[i].number != null
        ? sections[i].number
        : Math.floor(previousNumber) + 1;
    resolvedNumbers.push(nextNum);
    previousNumber = nextNum;
  }

  const first = resolvedNumbers[0];
  const last = resolvedNumbers[resolvedNumbers.length - 1];
  const rangeLabel =
    first === last
      ? `Chapter ${first}`
      : `Chapter ${first}–${last}`;

  return {
    isBulk: true,
    count,
    needsManualStart: false,
    first,
    last,
    rangeLabel
  };
}

function updateBulkEditorStatus(prefix = "") {
  const summary = getBulkEditorSummary();

  if (summary.isBulk) {
    const lead = prefix ? `${prefix}: ` : "";
    if (summary.needsManualStart) {
      editorStatus.textContent =
        `${lead}${summary.count} bagian chapter terdeteksi. Isi Nomor Chapter pertama lalu klik Pecah Chapter.`;
    } else {
      editorStatus.textContent =
        `${lead}Siap pecah: ${summary.rangeLabel} (${summary.count} chapter). Klik Pecah Chapter.`;
    }
    return summary;
  }

  if (
    editingChapterNumber == null &&
    (
      editorStatus.textContent.startsWith("Siap pecah:") ||
      editorStatus.textContent.includes("bagian chapter terdeteksi") ||
      editorStatus.textContent.startsWith("TXT diimpor:")
    )
  ) {
    editorStatus.textContent = "Siap untuk chapter berikutnya.";
  }

  return summary;
}

function splitBulkChapters() {
  const raw = editor.innerHTML.trim();

  if (!raw || !getPlainText(raw)) {
    showToast("Input chapter masih kosong.");
    return;
  }

  const sections = parseChaptersFromHtml(raw);

  if (!sections.length) {
    showToast("Tidak ada konten chapter yang dapat diproses.");
    return;
  }

  const hasAnyHeading = sections.some(sec => sec.number != null);
  const manualStart = getNumber();

  // Syarat wajib: jika chapter pertama tidak punya header chapter,
  // nomor chapter pertama harus diisi secara manual terlebih dahulu.
  if (sections[0].number == null) {
    if (manualStart == null) {
      if (sections.length === 1 && !hasAnyHeading) {
        showToast("Nomor chapter tidak ditemukan. Isi Nomor Chapter terlebih dahulu.");
      } else {
        showToast("Isi nomor chapter pertama di kolom Nomor Chapter terlebih dahulu.");
      }
      chapterNumber.focus();
      return;
    }
    sections[0].number = manualStart;
  }

  // Untuk chapter selanjutnya yang tidak memiliki header chapter,
  // otomatis mengikuti nomor chapter sebelumnya (+1).
  let previousNumber = sections[0].number;
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].number == null) {
      sections[i].number = Math.floor(previousNumber) + 1;
    }
    previousNumber = sections[i].number;
  }

  const preparedChapters = [];
  const internalDuplicates = new Set();
  const seenNumbers = new Set();

  for (const sec of sections) {
    if (sec.number == null) continue;

    if (seenNumbers.has(sec.number)) {
      internalDuplicates.add(sec.number);
    }
    seenNumbers.add(sec.number);

    const container = document.createElement("div");
    sec.blocks.forEach(b => container.appendChild(b.cloneNode(true)));
    trimEdgeSpacerNodes(container);

    const rawSectionHtml = container.innerHTML.trim();
    if (!rawSectionHtml) continue;

    const finalHtml = normalizeOrInsertChapterHeading(rawSectionHtml, sec.number);
    preparedChapters.push({
      number: sec.number,
      content: finalHtml
    });
  }

  if (!preparedChapters.length) {
    showToast("Tidak ada konten chapter yang valid untuk dipecah.");
    return;
  }

  if (internalDuplicates.size > 0) {
    const dupList = [...internalDuplicates]
      .sort((a, b) => a - b)
      .map(n => `Chapter ${n}`)
      .join(", ");

    if (
      !confirm(
        `Ditemukan nomor chapter ganda di dalam editor:\n${dupList}\n\n` +
        `Lanjutkan? (Versi yang paling bawah akan dipakai)`
      )
    ) {
      return;
    }
  }

  const existingConflicts = [...new Set(
    preparedChapters
      .map(ch => ch.number)
      .filter(num => Object.prototype.hasOwnProperty.call(state.chapters, num))
  )].sort((a, b) => a - b);

  if (existingConflicts.length > 0) {
    const conflictLabels = existingConflicts
      .map(n => `Chapter ${n}`)
      .join(", ");

    if (
      !confirm(
        `${existingConflicts.length} chapter sudah tersimpan sebelumnya:\n${conflictLabels}\n\n` +
        `Timpa chapter yang sudah ada?`
      )
    ) {
      return;
    }
  }

  const addedNumbers = [];
  for (const ch of preparedChapters) {
    state.chapters[ch.number] = ch.content;
    addedNumbers.push(ch.number);
  }

  const uniqueSorted = [...new Set(addedNumbers)].sort((a, b) => a - b);
  const maxNumber = uniqueSorted[uniqueSorted.length - 1];
  const minNumber = uniqueSorted[0];

  state.lastAddedChapterNumber = maxNumber;
  state.selected = maxNumber;
  editingChapterNumber = null;
  state.previewed = null;

  chapterNumber.value = "";
  editor.innerHTML = "";

  updateEditorStats();
  updateChapterNumberSuggestion();

  const rangeLabel =
    uniqueSorted.length === 1
      ? `Chapter ${minNumber}`
      : `Chapter ${minNumber}–${maxNumber}`;

  editorStatus.textContent =
    `✓ ${uniqueSorted.length} chapter (${rangeLabel}) berhasil dipecah dan ditambahkan.`;

  renderList();
  scheduleSave();
  showToast(`${uniqueSorted.length} chapter berhasil dipecah (${rangeLabel}).`);
}

function addChapter() {
  const raw = editor.innerHTML.trim();

  if (!raw) {
    showToast("Input chapter masih kosong.");
    return;
  }

  const sections = parseChaptersFromHtml(raw);
  if (sections.length > 1) {
    const summary = updateBulkEditorStatus();
    const info = summary.rangeLabel ? ` (${summary.rangeLabel})` : "";
    showToast(`Terdeteksi ${sections.length} bagian chapter${info}. Klik Pecah Chapter.`);
    return;
  }

  let number = getNumber();

  if (number == null) {
    number = detectChapter(true);
  }

  if (number == null) {
    showToast("Nomor chapter tidak ditemukan.");
    return;
  }

  let content = cleanHtml(raw);

  if (!content) {
    showToast("Tidak ada konten setelah dibersihkan.");
    return;
  }

  content = normalizeOrInsertChapterHeading(content, number);

  state.chapters[number] = content;
  state.lastAddedChapterNumber = number;
  state.selected = number;
  editingChapterNumber = null;
  state.previewed = null;

  chapterNumber.value = "";
  editor.innerHTML = "";

  updateEditorStats();
  updateChapterNumberSuggestion();

  editorStatus.textContent =
    `✓ Chapter ${number} ditambahkan. Input siap untuk chapter berikutnya.`;

  renderList();
  scheduleSave();

  requestAnimationFrame(() => editor.focus());
}

function updateChapter() {
  // Saat mode edit aktif, identitas chapter berasal dari chapter yang dibuka,
  // bukan dari nomor yang mungkin sudah diubah pengguna di kolom input.
  const originalNumber = editingChapterNumber ?? state.selected;
  const targetNumber = getNumber();

  if (
    originalNumber == null ||
    !Object.prototype.hasOwnProperty.call(state.chapters, originalNumber)
  ) {
    showToast("Buka chapter dari daftar lalu tekan Edit Chapter sebelum Update.");
    return;
  }

  if (targetNumber == null) {
    showToast("Isi nomor chapter yang valid terlebih dahulu.");
    return;
  }

  const raw = editor.innerHTML.trim();

  if (!raw) {
    showToast("Input chapter masih kosong.");
    return;
  }

  let content = cleanHtml(raw);

  if (!content) {
    showToast("Tidak ada konten setelah dibersihkan.");
    return;
  }

  // Jangan menimpa chapter lain secara tidak sengaja jika nomor tujuan sudah ada.
  if (
    targetNumber !== originalNumber &&
    Object.prototype.hasOwnProperty.call(state.chapters, targetNumber)
  ) {
    showToast(`Chapter ${targetNumber} sudah ada. Pilih nomor lain atau edit chapter tersebut.`);
    return;
  }

  // Jika nomor chapter diubah, sesuaikan nomor pada heading yang sudah ada
  // sambil mempertahankan judul tambahan (mis. ": The Beginning") dan rata tengah.
  const box = document.createElement("div");
  box.innerHTML = content;

  const blocks = Array.from(box.children).filter(el =>
    el.textContent.replace(/\u00a0/g, " ").trim().length > 0
  ).slice(0, 3);

  for (const el of blocks) {
    const line = el.textContent.replace(/\u00a0/g, " ").trim();
    if (CHAPTER_HEADING_PATTERN.test(line)) {
      el.innerHTML = el.innerHTML.replace(
        /((?:Chapter|Ch\.?|Bab)\s*)\d+(?:[.,]\d+)?/i,
        `$1${targetNumber}`
      );
      el.style.textAlign = "center";
      break;
    }
  }

  content = normalizeOrInsertChapterHeading(box.innerHTML.trim(), targetNumber);

  if (targetNumber !== originalNumber) {
    delete state.chapters[originalNumber];
    deletionSelection.delete(originalNumber);
  }

  state.chapters[targetNumber] = content;
  state.selected = targetNumber;
  editingChapterNumber = targetNumber;
  chapterNumber.value = String(targetNumber);

  updateEditorStats();
  updateChapterNumberSuggestion();

  editorStatus.textContent =
    targetNumber === originalNumber
      ? `✓ Chapter ${targetNumber} diperbarui.`
      : `✓ Chapter ${originalNumber} dipindahkan ke Chapter ${targetNumber} dan diperbarui.`;

  renderList();
  scheduleSave();
  showToast(
    targetNumber === originalNumber
      ? `Chapter ${targetNumber} berhasil diperbarui.`
      : `Chapter berhasil diubah menjadi Chapter ${targetNumber}.`
  );
}

function clearDraft() {
  chapterNumber.value = "";
  editor.innerHTML = "";

  updateEditorStats();
  updateChapterNumberSuggestion();

  state.selected = null;
  editingChapterNumber = null;

  editorStatus.textContent =
    "Input dibersihkan. Siap untuk chapter berikutnya.";

  scheduleSave();
}

/* =========================================================
   HAPUS CHAPTER
   ========================================================= */

async function deleteChapter() {
  const numbers = [...deletionSelection]
    .filter(number =>
      Object.prototype.hasOwnProperty.call(state.chapters, number)
    )
    .sort((a, b) => a - b);

  if (!numbers.length) {
    showToast("Centang chapter yang ingin dihapus terlebih dahulu.");
    return;
  }

  const chapterLabels = numbers
    .map(number => `Chapter ${number}`)
    .join(", ");

  if (
    !confirm(
      `Hapus ${numbers.length} chapter berikut?\n\n${chapterLabels}`
    )
  ) {
    return;
  }

  for (const number of numbers) {
    delete state.chapters[number];
    deletionSelection.delete(number);
  }

  if (
    state.selected != null &&
    numbers.includes(Number(state.selected))
  ) {
    clearDraft();
  }

  if (
    state.previewed != null &&
    numbers.includes(Number(state.previewed))
  ) {
    closePreview();
  }

  renderList();

  await saveState(state);

  showToast(`${numbers.length} chapter berhasil dihapus.`);
}

async function clearAll() {
  if (!Object.keys(state.chapters).length) return;

  if (!confirm("Hapus semua chapter yang tersimpan?")) {
    return;
  }

  state.chapters = {};
  state.selected = null;
  state.previewed = null;
  state.lastAddedChapterNumber = null;

  deletionSelection.clear();

  clearDraft();
  closePreview();
  renderList();

  await saveState(state);

  showToast("Semua chapter dihapus.");
}

/* =========================================================
   SMART PASTE DAN IMPOR
   ========================================================= */

function plainTextToHtmlBlocks(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");

  // Buang baris kosong berlebih di paling atas & paling bawah teks tempelan
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

  if (!lines.length) return "";

  const fragment = document.createDocumentFragment();
  let lastWasBlank = false;

  for (const line of lines) {
    if (!line.trim()) {
      if (!lastWasBlank) {
        const spacer = document.createElement("p");
        spacer.appendChild(document.createElement("br"));
        fragment.appendChild(spacer);
        lastWasBlank = true;
      }
    } else {
      const p = document.createElement("p");
      p.textContent = line;
      fragment.appendChild(p);
      lastWasBlank = false;
    }
  }

  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function createChapterBreakElement() {
  const divider = document.createElement("p");
  divider.dataset.chapterBreak = "true";
  divider.style.textAlign = "center";
  divider.style.color = "#285f9e";
  divider.textContent = CHAPTER_BREAK_MARKER_TEXT;
  return divider;
}

function appendSmartContentToEditor(incomingHtml) {
  if (!incomingHtml || !incomingHtml.trim()) return false;

  const incomingBox = document.createElement("div");
  incomingBox.innerHTML = incomingHtml;
  trimEdgeSpacerNodes(incomingBox);

  if (!incomingBox.childNodes.length) return false;

  const hasExistingContent = getPlainText(editor.innerHTML).length > 0;

  if (!hasExistingContent) {
    editor.innerHTML = "";
  } else {
    // Rapikan akhir konten lama agar tidak menumpuk baris kosong berlebihan
    trimEdgeSpacerNodes(editor);

    // Sisipkan pembatas khusus sebagai pemicu pemotongan antar-chapter
    if (!isChapterBreakBlock(editor.lastElementChild)) {
      editor.appendChild(createChapterBreakElement());
    }
  }

  while (incomingBox.firstChild) {
    editor.appendChild(incomingBox.firstChild);
  }

  // Pindahkan kursor ke paling akhir & scroll otomatis ke bawah
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  editor.scrollTop = editor.scrollHeight;
  return hasExistingContent;
}

async function pasteClipboard() {
  const wasMobile = isMobileEditor.matches;
  const wasTypingEnabled = mobileTypingEnabled;

  // Paste boleh dilakukan walaupun keyboard HP sedang disembunyikan.
  if (wasMobile) {
    editor.setAttribute("contenteditable", "true");
  }

  try {
    let inserted = false;
    let appended = false;
    let isHtmlSource = false;

    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();

      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          const cleaned = cleanHtml(await blob.text());
          if (cleaned) {
            appended = appendSmartContentToEditor(cleaned);
            inserted = true;
            isHtmlSource = true;
            break;
          }
        }
      }
    }

    if (!inserted) {
      const text = await navigator.clipboard.readText();
      const htmlFromText = plainTextToHtmlBlocks(text);
      if (!htmlFromText) {
        showToast("Clipboard kosong.");
        return;
      }
      appended = appendSmartContentToEditor(htmlFromText);
      inserted = true;
    }

    if (inserted) {
      scheduleSave();
      updateEditorStats();
      updateChapterNumberSuggestion();

      const summary = updateBulkEditorStatus();

      if (summary.isBulk) {
        if (summary.needsManualStart) {
          showToast(
            `${appended ? "Ditambahkan dengan pembatas" : "Berhasil ditempel"} (${summary.count} bagian — isi nomor awal).`
          );
        } else {
          showToast(
            `${appended ? "Ditambahkan" : "Berhasil ditempel"}: ${summary.rangeLabel} (${summary.count} chapter).`
          );
        }
      } else {
        showToast(
          isHtmlSource
            ? "HTML berformat berhasil ditempel."
            : "Teks berhasil ditempel."
        );
      }
    }
  } catch (error) {
    console.error(error);
    showToast("Clipboard tidak dapat diakses. Gunakan Ctrl+V atau izinkan akses clipboard.");
  } finally {
    if (wasMobile) {
      setMobileTyping(wasTypingEnabled, false);
    }
  }
}

function importTxt(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const rawText = String(reader.result || "");
    editor.innerHTML = plainTextToHtmlBlocks(rawText);

    updateEditorStats();

    const sections = parseChaptersFromHtml(editor.innerHTML);
    const detectedCount = sections.filter(s => s.number != null).length;

    if (detectedCount > 1) {
      chapterNumber.value = "";
      const summary = updateBulkEditorStatus("TXT diimpor");
      const rangeInfo = summary.rangeLabel ? `${summary.rangeLabel} (${summary.count} chapter)` : `${detectedCount} chapter`;
      showToast(`TXT diimpor: ${rangeInfo}. Klik Pecah Chapter.`);
    } else {
      const numberMatch = file.name.match(
        /(?:chapter|ch|bab)[\s_-]*(\d+(?:[.,]\d+)?)/i
      );

      if (numberMatch) {
        chapterNumber.value = numberMatch[1].replace(",", ".");
      } else {
        detectChapter(true);
      }

      updateBulkEditorStatus();
      showToast("TXT berhasil diimpor.");
    }

    updateChapterNumberSuggestion();
    scheduleSave();
  };

  reader.readAsText(file, "UTF-8");
}

/* =========================================================
   GENERATE ZIP
   ========================================================= */

async function generateZip() {
  const numbers = Object.keys(state.chapters)
    .map(Number)
    .sort((a, b) => a - b);

  if (!numbers.length) {
    showToast("Belum ada chapter.");
    return;
  }

  state.novelName = novelName.value;
  state.chapterNumber = chapterNumber.value;
  state.draft = editor.innerHTML;

  await saveState(state);

  try {
    const chapters = numbers.map(number => ({
      number,
      content: state.chapters[number]
    }));

    const blob = await createMadaraZip(chapters);
    const fileName = getZipFileName(numbers);

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast("ZIP berhasil dibuat.");
  } catch (error) {
    console.error(error);

    showToast(`Gagal membuat ZIP: ${error.message}`);
  }
}

/* =========================================================
   INISIALISASI
   ========================================================= */

async function init() {
  const saved = await loadState();

  if (saved) {
    Object.assign(state, saved);

    novelName.value = state.novelName || "";
    chapterNumber.value = state.chapterNumber || "";
    editor.innerHTML = state.draft || "";
  }

  if (
    typeof state.lastAddedChapterNumber !== "number" ||
    !Number.isFinite(state.lastAddedChapterNumber)
  ) {
    const savedNumbers = Object.keys(state.chapters)
      .map(Number)
      .filter(Number.isFinite);

    state.lastAddedChapterNumber = savedNumbers.length
      ? Math.max(...savedNumbers)
      : null;
  }

  renderList();
  updateEditorStats();
  updateChapterNumberSuggestion();
  updateBulkEditorStatus();

  setActiveTab("input");

  storageStatus.textContent = "● Tersimpan otomatis";
}

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

novelName.addEventListener("input", () => {
  updateProjectStatus();
  scheduleSave();
});

chapterNumber.addEventListener("input", () => {
  updateChapterNumberSuggestion();
  updateBulkEditorStatus();
  scheduleSave();
});

editor.addEventListener("input", () => {
  updateEditorStats();
  updateChapterNumberSuggestion();
  updateBulkEditorStatus();
  scheduleSave();
});

if (chapterNumberSuggestion) {
  chapterNumberSuggestion.addEventListener("click", () => {
    if (chapterNumberSuggestion.hidden) return;

    chapterNumber.value =
      chapterNumberSuggestion.dataset.number || "";

    chapterNumberSuggestion.hidden = true;

    updateBulkEditorStatus();
    scheduleSave();
    chapterNumber.focus();
  });
}

if (fillMissingChapterBtn) {
  fillMissingChapterBtn.addEventListener("click", () => {
    const targetNum = fillMissingChapterBtn.dataset.number;
    if (!targetNum) return;

    if (editingChapterNumber != null) {
      editor.innerHTML = "";
      updateEditorStats();
    }

    state.selected = null;
    editingChapterNumber = null;
    chapterNumber.value = targetNum;
    editorStatus.textContent =
      `Siap mengisi Chapter ${targetNum} yang terlewat.`;

    updateChapterNumberSuggestion();
    scheduleSave();
    setActiveTab("input");
    editor.focus();
  });
}

if (projectGapWarning) {
  projectGapWarning.addEventListener("click", () => {
    setActiveTab("chapters");
  });
}

tabButtons[0].addEventListener("click", () => {
  setActiveTab("input");
});

tabButtons[1].addEventListener("click", () => {
  setActiveTab("chapters");
});

tabButtons[2].addEventListener("click", () => {
  setActiveTab("project");
});

$("goToChaptersBtn").addEventListener("click", () => {
  setActiveTab("chapters");
});

$("pasteBtn").addEventListener("click", pasteClipboard);

// Tombol toolbar menjaga fokus/seleksi editor agar pemformatan diterapkan
// pada teks yang dipilih, bukan kehilangan seleksi ketika tombol diklik.
document.querySelectorAll(".editor-toolbar button").forEach(button => {
  button.addEventListener("mousedown", event => event.preventDefault());
});

document.querySelectorAll(".format-btn").forEach(button => {
  button.addEventListener("click", () => {
    runEditorCommand(button.dataset.command);
  });
});

$("undoBtn").addEventListener("click", () => runEditorCommand("undo"));
$("redoBtn").addEventListener("click", () => runEditorCommand("redo"));

if (keyboardToggleBtn) {
  if (isMobileEditor.matches) {
    keyboardToggleBtn.hidden = false;
    setMobileTyping(false);
  }

  keyboardToggleBtn.addEventListener("click", () => {
    setMobileTyping(!mobileTypingEnabled, !mobileTypingEnabled);
  });

  isMobileEditor.addEventListener("change", event => {
    keyboardToggleBtn.hidden = !event.matches;
    if (event.matches) {
      mobileTypingEnabled = false;
      setMobileTyping(false);
    } else {
      mobileTypingEnabled = true;
      editor.setAttribute("contenteditable", "true");
    }
  });
}

editor.addEventListener("click", () => {
  if (isMobileEditor.matches && !mobileTypingEnabled) {
    showToast("Tekan tombol Aktifkan ketik untuk mulai mengedit.");
  }
});

$("detectChapterBtn").addEventListener("click", () => {
  detectChapter(false);
});

$("addChapterBtn").addEventListener("click", addChapter);

$("updateChapterBtn").addEventListener("click", updateChapter);

$("clearDraftBtn").addEventListener("click", clearDraft);

$("splitChaptersBtn").addEventListener("click", splitBulkChapters);

$("deleteChapterBtn").addEventListener("click", deleteChapter);

/*
 * PERBAIKAN UTAMA:
 * ID yang digunakan harus sama dengan index.html:
 * id="selectAllChapters"
 *
 * Saat dicentang, semua nomor chapter dimasukkan ke Set.
 * Saat dilepas, seluruh pilihan dibersihkan.
 * renderList() kemudian memperbarui checkbox dan penghitung.
 */
$("selectAllChapters").addEventListener("change", event => {
  if (event.target.checked) {
    for (const number of Object.keys(state.chapters).map(Number)) {
      deletionSelection.add(number);
    }
  } else {
    deletionSelection.clear();
  }

  renderList();
});

$("clearAllBtn").addEventListener("click", clearAll);

$("generateZipBtn").addEventListener("click", generateZip);

$("importTxtBtn").addEventListener("click", () => {
  $("txtFileInput").click();
});

$("txtFileInput").addEventListener("change", event => {
  importTxt(event.target.files[0]);
  event.target.value = "";
});

$("closePreviewBtn").addEventListener("click", closePreview);

$("previewCloseActionBtn").addEventListener("click", closePreview);

$("previewEditBtn").addEventListener("click", editPreviewedChapter);

previewModal.addEventListener("click", event => {
  if (event.target.hasAttribute("data-close-preview")) {
    closePreview();
  }
});

document.addEventListener("keydown", event => {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter" &&
    !previewModal.hidden
  ) {
    return;
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter"
  ) {
    event.preventDefault();
    addChapter();
    return;
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "s"
  ) {
    event.preventDefault();
    generateZip();
    return;
  }

  if (event.key === "Escape" && !previewModal.hidden) {
    closePreview();
  }
});

window.addEventListener("beforeunload", () => {
  state.novelName = novelName.value;
  state.chapterNumber = chapterNumber.value;
  state.draft = editor.innerHTML;

  localStorage.setItem(
    "chapter_collector_backup_v2",
    JSON.stringify(state)
  );
});

init();

// Editor height drag-resize (mouse + touch + pen), persisted between visits.
(() => {
  const editorWrap = document.querySelector("#panelInput .editor-wrap");
  const handle = document.getElementById("editorResizeHandle");
  const editorPanel = document.querySelector("#panelInput .editor-panel");
  if (!editorWrap || !handle || !editorPanel) return;

  const STORAGE_KEY = "chapter_collector_editor_height_v1";
  const MIN_HEIGHT = 180;
  const MAX_HEIGHT = 1400;
  const defaultHeight = window.matchMedia("(max-width: 900px)").matches ? 360 : 340;
  let height = defaultHeight;
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= MIN_HEIGHT && saved <= MAX_HEIGHT) height = saved;
  } catch (_) {}

  function applyHeight(nextHeight, save = true) {
    height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(nextHeight)));
    editorWrap.style.setProperty("--chapter-editor-height", `${height}px`);
    editorWrap.style.height = `${height}px`;
    handle.setAttribute("aria-valuemin", String(MIN_HEIGHT));
    handle.setAttribute("aria-valuemax", String(MAX_HEIGHT));
    handle.setAttribute("aria-valuenow", String(height));
    handle.setAttribute("aria-valuetext", `${height} piksel`);
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, String(height)); } catch (_) {}
    }
  }

  applyHeight(height, false);
  let startY = 0;
  let startHeight = height;
  let activePointerId = null;

  handle.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    startY = event.clientY;
    startHeight = height;
    handle.classList.add("is-dragging");
    handle.setPointerCapture?.(event.pointerId);
  });

  handle.addEventListener("pointermove", event => {
    if (activePointerId !== event.pointerId) return;
    event.preventDefault();
    applyHeight(startHeight + event.clientY - startY, false);
  });

  function finishResize(event) {
    if (activePointerId !== event.pointerId) return;
    activePointerId = null;
    handle.classList.remove("is-dragging");
    try { localStorage.setItem(STORAGE_KEY, String(height)); } catch (_) {}
  }
  handle.addEventListener("pointerup", finishResize);
  handle.addEventListener("pointercancel", finishResize);
  handle.addEventListener("lostpointercapture", event => {
    if (activePointerId === event.pointerId) { activePointerId = null; handle.classList.remove("is-dragging"); }
  });

  // Keyboard accessibility: arrow keys adjust height in 24px steps.
  handle.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      applyHeight(height + (event.key === "ArrowDown" ? 24 : -24));
    } else if (event.key === "Home") { event.preventDefault(); applyHeight(MIN_HEIGHT); }
    else if (event.key === "End") { event.preventDefault(); applyHeight(MAX_HEIGHT); }
  });
})();