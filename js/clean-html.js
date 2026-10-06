export function cleanHtml(raw) {
    if (!raw || !raw.trim()) return "";

    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");

    // Buang elemen antarmuka, iklan, skrip, dan sampah layout web sumber.
    doc.querySelectorAll(
        "script, style, button, svg, path, form, textarea, input, select, iframe, nav, footer, header, noscript"
    ).forEach(el => el.remove());

    // Hanya hapus node komentar. Teks di kiri/kanannya tetap utuh,
    // termasuk titik, koma, tanda seru, dan tanda baca lainnya.
    const walker = document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_COMMENT
    );
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(comment => comment.remove());

    // Ubah pembatas blok dan <br> menjadi newline penanda.
    let html = doc.body.innerHTML;
    html = html.replace(/<\s*br\s*\/?>/gi, "\n");
    html = html.replace(
        /<\/?(?:div|p|h[1-6]|li|tr|section|article|blockquote)[^>]*>/gi,
        "\n"
    );

    // Pertahankan tag format esensial.
    html = html.replace(/<(\/?[a-zA-Z0-9]+)([^>]*)>/g, (match, tag, attrs) => {
        const normalizedTag = tag.toLowerCase().replace("/", "");

        if (["b", "strong", "i", "em", "u", "s"].includes(normalizedTag)) {
            return `<${tag.toLowerCase()}>`;
        }

        if (normalizedTag === "a") {
            const hrefMatch = attrs.match(/href=(["'][^"']*["'])/i);
            return hrefMatch
                ? `<${tag.toLowerCase()} href=${hrefMatch[1]} target="_blank" rel="noopener noreferrer">`
                : "";
        }

        return "";
    });

    html = html.replace(/&nbsp;/gi, " ");

    const lines = html
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.replace(/<[^>]+>/g, "").trim().length > 0);

    const chapterRegex = /^(?:bab|chapter|ch\.?)\s*(\d+)(?:\s*[:\-–—]?\s*(.*))?$/i;
    const specialTitleRegex = /^(?:prolog|prologue|epilog|epilogue)\b/i;

    return lines.map((line, index) => {
        const plainText = line.replace(/<[^>]+>/g, "").trim();

        if (index <= 1) {
            const match = plainText.match(chapterRegex);
            if (match) {
                const chapterNum = match[1];
                const chapterTitle = match[2] ? match[2].trim() : "";

                const formattedHeading = chapterTitle.length > 0
                    ? `Chapter ${chapterNum}: ${chapterTitle}`
                    : `Chapter ${chapterNum}`;

                return `<h2 style="text-align: center;">${formattedHeading}</h2>`;
            }

            if (specialTitleRegex.test(plainText)) {
                return `<h2 style="text-align: center;">${line}</h2>`;
            }
        }

        return `<p style="text-align: justify; text-indent: 2em;">${line}</p>`;
    }).join("\n");
}
