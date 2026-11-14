/**
 * Membersihkan HTML hasil paste tanpa menghilangkan struktur dan tipografi novel.
 * Output tetap berupa HTML aman yang disimpan di chapter-content.txt untuk importer Madara.
 */
export function cleanHtml(raw) {
  if (!raw || !raw.trim()) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "text/html");

  // Elemen aktif/berbahaya dan elemen antarmuka yang bukan bagian dari isi novel.
  const DROP_WITH_CONTENT = new Set([
    "script", "style", "noscript", "iframe", "object", "embed",
    "form", "input", "textarea", "select", "button", "nav",
    "footer", "header", "svg", "canvas", "video", "audio"
  ]);

  // Struktur dan format yang lazim dipakai pada konten novel.
  const ALLOWED_TAGS = new Set([
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "div", "span",
    "strong", "b", "em", "i", "u", "s", "del", "ins",
    "sup", "sub", "small", "mark", "abbr",
    "blockquote", "pre", "code",
    "ul", "ol", "li",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td"
  ]);

  // Hanya properti tipografi/tata letak teks yang aman dan relevan untuk novel.
  const ALLOWED_STYLES = new Set([
    "text-align",
    "text-indent",
    "line-height",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-decoration",
    "text-decoration-line",
    "text-decoration-style",
    "vertical-align",
    "white-space",
    "letter-spacing",
    "word-spacing",
    "color",
    "background-color",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding-left",
    "padding-right"
  ]);

  const SAFE_URL = /^(?:(?:https?:|mailto:)|\/|\.{1,2}\/|#)/i;

  function cleanStyle(styleText) {
    if (!styleText) return "";

    const declarations = [];
    for (const declaration of styleText.split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 1) continue;

      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim();

      if (!ALLOWED_STYLES.has(property) || !value) continue;
      // Mencegah CSS injection, URL externe, dan ekspresi CSS.
      if (/url\s*\(|expression\s*\(|javascript:|@import|[<>]/i.test(value)) continue;

      declarations.push(`${property}: ${value}`);
    }

    return declarations.join("; ");
  }

  function cleanUrl(value) {
    const url = (value || "").trim();
    if (!url || !SAFE_URL.test(url)) return "";
    if (/^(?:javascript|data|vbscript):/i.test(url)) return "";
    return url;
  }

  function copySafeAttributes(source, target, tagName) {
    const style = cleanStyle(source.getAttribute("style") || "");
    if (style) target.setAttribute("style", style);

    if (tagName === "a") {
      const href = cleanUrl(source.getAttribute("href"));
      if (href) target.setAttribute("href", href);
      target.setAttribute("target", "_blank");
      target.setAttribute("rel", "noopener noreferrer");
      const title = source.getAttribute("title");
      if (title) target.setAttribute("title", title.slice(0, 300));
    }

    if (tagName === "img") {
      const src = cleanUrl(source.getAttribute("src"));
      if (src) target.setAttribute("src", src);
      const alt = source.getAttribute("alt");
      if (alt) target.setAttribute("alt", alt.slice(0, 500));
      const title = source.getAttribute("title");
      if (title) target.setAttribute("title", title.slice(0, 300));

      // Dimensi numerik saja; buang atribut layout/handler dari situs sumber.
      for (const dimension of ["width", "height"]) {
        const value = source.getAttribute(dimension);
        if (value && /^\d{1,4}$/.test(value)) {
          target.setAttribute(dimension, value);
        }
      }
      target.setAttribute("loading", "lazy");
    }

    if (tagName === "ol") {
      const start = source.getAttribute("start");
      if (start && /^\d{1,6}$/.test(start)) target.setAttribute("start", start);
      const type = source.getAttribute("type");
      if (type && /^[1aAiI]$/.test(type)) target.setAttribute("type", type);
    }

    if (tagName === "td" || tagName === "th") {
      for (const attr of ["colspan", "rowspan"]) {
        const value = source.getAttribute(attr);
        if (value && /^\d{1,3}$/.test(value)) target.setAttribute(attr, value);
      }
    }
  }

  function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return doc.createTextNode(node.nodeValue || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tagName = node.tagName.toLowerCase();

    // Buang elemen beserta seluruh isinya jika memang tidak boleh ada di chapter.
    if (DROP_WITH_CONTENT.has(tagName)) return null;

    const children = Array.from(node.childNodes)
      .map(sanitizeNode)
      .filter(Boolean);

    // Tag yang tidak dikenal di-unwarp: teks dan format aman di dalamnya tetap ada.
    if (!ALLOWED_TAGS.has(tagName)) {
      const fragment = doc.createDocumentFragment();
      children.forEach(child => fragment.appendChild(child));
      return fragment;
    }

    // Jangan keluarkan tautan/gambar tanpa URL yang valid.
    if (tagName === "a") {
      const href = cleanUrl(node.getAttribute("href"));
      if (!href) {
        const fragment = doc.createDocumentFragment();
        children.forEach(child => fragment.appendChild(child));
        return fragment;
      }
    }

    if (tagName === "img") {
      const src = cleanUrl(node.getAttribute("src"));
      if (!src) return null;
      const image = doc.createElement("img");
      copySafeAttributes(node, image, tagName);
      return image;
    }

    const cleanElement = doc.createElement(tagName);
    copySafeAttributes(node, cleanElement, tagName);
    children.forEach(child => cleanElement.appendChild(child));

    // Hapus elemen kosong yang tidak punya fungsi struktural.
    if (
      !["br", "hr", "img"].includes(tagName) &&
      !cleanElement.textContent.trim() &&
      !cleanElement.querySelector("img, br, hr")
    ) {
      return null;
    }

    return cleanElement;
  }

  const output = doc.createElement("div");
  Array.from(doc.body.childNodes).forEach(node => {
    const cleanNode = sanitizeNode(node);
    if (cleanNode) output.appendChild(cleanNode);
  });

  // Rapikan whitespace antarelemen tanpa mengubah spasi di dalam teks.
  return output.innerHTML
    .replace(/&nbsp;/gi, "&#160;")
    .replace(/>\s+</g, "><")
    .trim();
}
