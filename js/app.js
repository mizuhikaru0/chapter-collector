import { cleanHtml } from "./clean-html.js";
import { saveState, loadState } from "./storage.js";
import { createMadaraZip } from "./zip.js";

const $ = id => document.getElementById(id);

const novelName = $("novelName");
const chapterNumber = $("chapterNumber");
const editor = $("chapterEditor");
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

const state = {
  novelName: "",
  chapterNumber: "",
  draft: "",
  chapters: {},
  selected: null,
  previewed: null
};

let saveTimer = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function getPlainText(html) {
  const box = document.createElement("div");
  box.innerHTML = html || "";
  return (box.innerText || box.textContent || "").replace(/\u00a0/g, " ").trim();
}

function countWords(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function updateEditorStats() {
  const text = getPlainText(editor.innerHTML);
  const characters = text.length;
  const words = countWords(text);
  const paragraphs = text
    ? Math.max(1, editor.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li").length || text.split(/\n+/).filter(Boolean).length)
    : 0;
  editorStats.textContent = `${characters.toLocaleString("id-ID")} karakter · ${words.toLocaleString("id-ID")} kata · ${paragraphs.toLocaleString("id-ID")} paragraf`;
}

function getSafeNovelName() {
  return (novelName.value.trim() || "Novel")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[. ]+$/g, "") || "Novel";
}

function getZipFileName(numbers = Object.keys(state.chapters).map(Number)) {
  if (!numbers.length) return `${getSafeNovelName()}.zip`;
  const sorted = [...numbers].sort((a, b) => a - b);
  return `${getSafeNovelName()}${sorted[0]}-${sorted[sorted.length - 1]}.zip`;
}

function updateProjectStatus() {
  const numbers = Object.keys(state.chapters).map(Number).sort((a, b) => a - b);
  const count = numbers.length;

  if (!count) {
    projectStatus.textContent = "Belum ada chapter.";
    zipNamePreview.textContent = "Nama ZIP: —";
    return;
  }

  projectStatus.textContent = count === 1
    ? "1 chapter siap di-generate."
    : `${count} chapter · Chapter ${numbers[0]}–${numbers[numbers.length - 1]}`;
  zipNamePreview.textContent = `Nama ZIP: ${getZipFileName(numbers)}`;
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

function renderList() {
  const numbers = Object.keys(state.chapters).map(Number).sort((a, b) => a - b);
  chapterList.innerHTML = "";
  chapterCount.textContent = numbers.length
    ? (numbers.length === 1 ? "1 chapter" : `${numbers.length} chapter · ${numbers[0]}–${numbers[numbers.length - 1]}`)
    : "0 chapter";
  updateProjectStatus();

  if (!numbers.length) {
    chapterList.innerHTML = `<div class="empty-list">Belum ada chapter.<br><small>Chapter yang ditambahkan akan muncul di sini.</small></div>`;
    return;
  }

  for (const number of numbers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chapter-item${state.previewed === number ? " previewing" : ""}`;

    const text = getPlainText(state.chapters[number]);
    const wordCount = countWords(text);
    button.innerHTML = `
      <span class="chapter-item-main">
        <strong>Chapter ${number}</strong>
        <small>${wordCount.toLocaleString("id-ID")} kata</small>
      </span>
      <span class="chapter-item-arrow">›</span>
    `;
    button.addEventListener("click", () => openPreview(number));
    chapterList.appendChild(button);
  }
}

function openPreview(number) {
  const content = state.chapters[number];
  if (content == null) return;

  state.previewed = number;
  previewTitle.textContent = `Chapter ${number}`;
  previewContent.innerHTML = content;

  const text = getPlainText(content);
  previewStats.textContent = `${text.length.toLocaleString("id-ID")} karakter · ${countWords(text).toLocaleString("id-ID")} kata`;
  previewEditBtn.dataset.chapter = String(number);

  previewModal.hidden = false;
  previewModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  renderList();

  requestAnimationFrame(() => $("closePreviewBtn").focus());
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
  if (!Number.isFinite(number) || state.chapters[number] == null) return;

  state.selected = number;
  chapterNumber.value = number;
  editor.innerHTML = state.chapters[number];
  updateEditorStats();
  editorStatus.textContent = `Chapter ${number} sedang diedit.`;
  closePreview();
  renderList();
  scheduleSave();
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
  editor.focus();
}

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
      scheduleSave();
      if (!silent) showToast(`Chapter ${match[1]} terdeteksi.`);
      return Number(match[1]);
    }
  }

  if (!silent) showToast("Nomor chapter tidak ditemukan.");
  return null;
}

function getNumber() {
  const match = chapterNumber.value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

// Pastikan setiap chapter yang disimpan memiliki judul Chapter di paling atas.
// Jika cleanHtml() sudah menemukan judul Chapter/Bab/Ch., judul tersebut
// dipertahankan agar judul asli tidak digandakan. Jika tidak ada, buat
// heading otomatis berdasarkan nomor chapter yang dipilih user.
function ensureChapterHeading(content, number) {
  const hasChapterHeading = /<h[1-6]\b[^>]*>\s*(?:Chapter|Ch\.?|Bab)\s+\d+\b/i.test(content);

  if (hasChapterHeading) return content;

  return `<h2 style="text-align: center;">Chapter ${number}</h2>\n${content}`;
}

function addChapter() {
  let number = getNumber();
  if (number == null) number = detectChapter(true);

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
  state.selected = number;
  state.previewed = null;
  chapterNumber.value = "";
  editor.innerHTML = "";
  updateEditorStats();
  editorStatus.textContent = `✓ Chapter ${number} ditambahkan. Input siap untuk chapter berikutnya.`;
  renderList();
  scheduleSave();
  requestAnimationFrame(() => editor.focus());
}

function updateChapter() {
  const number = getNumber();
  if (number == null || !Object.prototype.hasOwnProperty.call(state.chapters, number)) {
    showToast("Pilih chapter yang ingin diperbarui.");
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
  state.selected = number;
  updateEditorStats();
  editorStatus.textContent = `✓ Chapter ${number} diperbarui.`;
  renderList();
  scheduleSave();
}

function clearDraft() {
  chapterNumber.value = "";
  editor.innerHTML = "";
  updateEditorStats();
  state.selected = null;
  editorStatus.textContent = "Input dibersihkan. Siap untuk chapter berikutnya.";
  scheduleSave();
}

async function deleteChapter() {
  const number = state.selected ?? state.previewed ?? getNumber();
  if (number == null || !Object.prototype.hasOwnProperty.call(state.chapters, number)) {
    showToast("Pilih chapter yang ingin dihapus.");
    return;
  }

  if (!confirm(`Hapus Chapter ${number}?`)) return;
  delete state.chapters[number];
  state.selected = null;
  state.previewed = null;
  clearDraft();
  closePreview();
  renderList();
  await saveState(state);
  showToast(`Chapter ${number} dihapus.`);
}

async function clearAll() {
  if (!Object.keys(state.chapters).length) return;
  if (!confirm("Hapus semua chapter yang tersimpan?")) return;

  state.chapters = {};
  state.selected = null;
  state.previewed = null;
  clearDraft();
  closePreview();
  renderList();
  await saveState(state);
  showToast("Semua chapter dihapus.");
}

async function pasteClipboard() {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          editor.focus();
          document.execCommand("insertHTML", false, await blob.text());
          scheduleSave();
          updateEditorStats();
          showToast("HTML berformat berhasil ditempel.");
          return;
        }
      }
    }

    const text = await navigator.clipboard.readText();
    editor.focus();
    document.execCommand("insertText", false, text);
    scheduleSave();
    updateEditorStats();
    showToast("Teks berhasil ditempel.");
  } catch (error) {
    console.error(error);
    showToast("Clipboard tidak dapat diakses. Gunakan Ctrl+V sebagai alternatif.");
  }
}

function importTxt(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    editor.innerHTML = String(reader.result || "");
    updateEditorStats();
    const numberMatch = file.name.match(/(?:chapter|ch)[\s_-]*(\d+)/i);
    if (numberMatch) chapterNumber.value = numberMatch[1];
    else detectChapter(true);
    scheduleSave();
    showToast("TXT berhasil diimpor.");
  };
  reader.readAsText(file, "UTF-8");
}

async function generateZip() {
  const numbers = Object.keys(state.chapters).map(Number).sort((a, b) => a - b);
  if (!numbers.length) {
    showToast("Belum ada chapter.");
    return;
  }

  state.novelName = novelName.value;
  state.chapterNumber = chapterNumber.value;
  state.draft = editor.innerHTML;
  await saveState(state);

  try {
    const chapters = numbers.map(number => ({ number, content: state.chapters[number] }));
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

async function init() {
  const saved = await loadState();

  if (saved) {
    Object.assign(state, saved);
    novelName.value = state.novelName || "";
    chapterNumber.value = state.chapterNumber || "";
    editor.innerHTML = state.draft || "";
  }

  renderList();
  updateEditorStats();
  storageStatus.textContent = "● Tersimpan otomatis";
}

novelName.addEventListener("input", () => {
  updateProjectStatus();
  scheduleSave();
});
chapterNumber.addEventListener("input", scheduleSave);
editor.addEventListener("input", () => {
  updateEditorStats();
  scheduleSave();
});

$("pasteBtn").addEventListener("click", pasteClipboard);
$("detectChapterBtn").addEventListener("click", () => detectChapter(false));
$("addChapterBtn").addEventListener("click", addChapter);
$("updateChapterBtn").addEventListener("click", updateChapter);
$("clearDraftBtn").addEventListener("click", clearDraft);
$("deleteChapterBtn").addEventListener("click", deleteChapter);
$("clearAllBtn").addEventListener("click", clearAll);
$("generateZipBtn").addEventListener("click", generateZip);
$("importTxtBtn").addEventListener("click", () => $("txtFileInput").click());
$("txtFileInput").addEventListener("change", event => importTxt(event.target.files[0]));
$("closePreviewBtn").addEventListener("click", closePreview);
$("previewCloseActionBtn").addEventListener("click", closePreview);
$("previewEditBtn").addEventListener("click", editPreviewedChapter);
previewModal.addEventListener("click", event => {
  if (event.target.hasAttribute("data-close-preview")) closePreview();
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !previewModal.hidden) return;
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    addChapter();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    generateZip();
    return;
  }
  if (event.key === "Escape" && !previewModal.hidden) closePreview();
});

window.addEventListener("beforeunload", () => {
  state.novelName = novelName.value;
  state.chapterNumber = chapterNumber.value;
  state.draft = editor.innerHTML;
  localStorage.setItem("chapter_collector_backup_v2", JSON.stringify(state));
});

init();
