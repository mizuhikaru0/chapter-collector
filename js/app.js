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
  editor.setAttribute("contenteditable", mobileTypingEnabled ? "true" : "false");
  keyboardToggleBtn.textContent = mobileTypingEnabled
    ? "⌨️ Sembunyikan keyboard"
    : "⌨️ Aktifkan ketik";
  keyboardToggleBtn.setAttribute("aria-pressed", String(mobileTypingEnabled));

  if (mobileTypingEnabled && focusEditor) {
    editor.focus();
  } else if (!mobileTypingEnabled && document.activeElement === editor) {
    editor.blur();
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
    2200
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

function updateProjectStatus() {
  const numbers = Object.keys(state.chapters)
    .map(Number)
    .sort((a, b) => a - b);

  const count = numbers.length;

  if (!count) {
    projectStatus.textContent = "Belum ada chapter.";
    zipNamePreview.textContent = "Nama ZIP: —";
    return;
  }

  projectStatus.textContent =
    count === 1
      ? "1 chapter siap di-generate."
      : `${count} chapter · Chapter ${numbers[0]}–${numbers[numbers.length - 1]}`;

  zipNamePreview.textContent =
    `Nama ZIP: ${getZipFileName(numbers)}`;
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

  // PERBAIKAN: ID harus sama dengan yang ada di index.html.
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
    /<h[1-6][^>]*>\s*(?:BAB|Chapter|Ch\.)\s+(\d+)\b/i,
    /^(?:BAB|Chapter|Ch\.)\s+(\d+)\b/im,
    /\b(?:BAB|Chapter)\s+(\d+)\b/i,
    /\bCh\.\s*(\d+)\b/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);

    if (match) {
      chapterNumber.value = match[1];

      updateChapterNumberSuggestion();
      scheduleSave();

      if (!silent) {
        showToast(`Chapter ${match[1]} terdeteksi.`);
      }

      return Number(match[1]);
    }
  }

  updateChapterNumberSuggestion();

  if (!silent) {
    showToast("Nomor chapter tidak ditemukan.");
  }

  return null;
}

function getNumber() {
  const match = chapterNumber.value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function hasRecognizedChapterHeading() {
  const text = getPlainText(editor.innerHTML);

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  const patterns = [
    /^(?:BAB|Chapter|Ch\.?)\s*\d+\b/i,
    /^\d+\s*[:.\-–—]\s*\S+/i,
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
    /<h[1-6][^>]*>\s*(?:BAB|Chapter|Ch\.)\s+(\d+)\b/i,
    /^(?:BAB|Chapter|Ch\.)\s+(\d+)\b/im,
    /\b(?:BAB|Chapter)\s+(\d+)\b/i,
    /\bCh\.\s*(\d+)\b/i
  ].some(pattern => pattern.test(source));
}

function getNextChapterSuggestion() {
  if (
    Number.isInteger(state.lastAddedChapterNumber) &&
    state.lastAddedChapterNumber >= 0
  ) {
    return state.lastAddedChapterNumber + 1;
  }

  const numbers = Object.keys(state.chapters)
    .map(Number)
    .filter(Number.isFinite);

  return numbers.length
    ? Math.max(...numbers) + 1
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
   KONTEN CHAPTER
   ========================================================= */

function ensureChapterHeading(content, number) {
  const hasChapterHeading =
    /<h[1-6]\b[^>]*>\s*(?:Chapter|Ch\.?|Bab)\s+\d+\b/i.test(content);

  if (hasChapterHeading) return content;

  return (
    `<h2 style="text-align: center;">Chapter ${number}</h2>\n` +
    `<br>\n${content}`
  );
}

function addChapter() {
  let number = getNumber();

  if (number == null) {
    number = detectChapter(true);
  }

  if (number == null) {
    showToast("Nomor chapter tidak ditemukan.");
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

  content = ensureChapterHeading(content, number);

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

  // Jika nomor chapter diubah, sesuaikan nomor pada heading yang sudah ada.
  // Judul tambahan setelah nomor (mis. ": The Beginning") tetap dipertahankan.
  content = content.replace(
    /(<h[1-6]\b[^>]*>\s*(?:Chapter|Ch\.?|Bab)\s*)\d+(\b[^<]*<\/h[1-6]>)/i,
    `$1${targetNumber}$2`
  );
  content = ensureChapterHeading(content, targetNumber);

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
   TEMPEL DAN IMPOR
   ========================================================= */

async function pasteClipboard() {
  const wasMobile = isMobileEditor.matches;
  const wasTypingEnabled = mobileTypingEnabled;

  // Paste boleh dilakukan walaupun keyboard HP sedang disembunyikan.
  if (wasMobile) {
    editor.setAttribute("contenteditable", "true");
  }

  try {
    editor.focus();

    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();

      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          document.execCommand("insertHTML", false, await blob.text());
          scheduleSave();
          updateEditorStats();
          updateChapterNumberSuggestion();
          showToast("HTML berformat berhasil ditempel.");
          return;
        }
      }
    }

    const text = await navigator.clipboard.readText();
    document.execCommand("insertText", false, text);
    scheduleSave();
    updateEditorStats();
    updateChapterNumberSuggestion();
    showToast("Teks berhasil ditempel.");
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
    editor.innerHTML = String(reader.result || "");

    updateEditorStats();

    const numberMatch = file.name.match(
      /(?:chapter|ch)[\s_-]*(\d+)/i
    );

    if (numberMatch) {
      chapterNumber.value = numberMatch[1];
    } else {
      detectChapter(true);
    }

    updateChapterNumberSuggestion();
    scheduleSave();

    showToast("TXT berhasil diimpor.");
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

  if (!Number.isInteger(state.lastAddedChapterNumber)) {
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
  scheduleSave();
});

editor.addEventListener("input", () => {
  updateEditorStats();
  updateChapterNumberSuggestion();
  scheduleSave();
});

if (chapterNumberSuggestion) {
  chapterNumberSuggestion.addEventListener("click", () => {
    if (chapterNumberSuggestion.hidden) return;

    chapterNumber.value =
      chapterNumberSuggestion.dataset.number || "";

    chapterNumberSuggestion.hidden = true;

    scheduleSave();
    chapterNumber.focus();
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
