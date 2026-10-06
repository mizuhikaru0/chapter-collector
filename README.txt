CHAPTER COLLECTOR — MODULAR

Fitur:
- Rich text editor berbasis contenteditable.
- Tombol Paste berada di pojok kanan atas di dalam kotak input.
- Paste HTML diprioritaskan; plain text menjadi fallback.
- Deteksi nomor Chapter otomatis.
- Tambah, buka, update, hapus, dan hapus semua chapter.
- Statistik karakter, kata, dan paragraf pada editor.
- Autosave draft menggunakan IndexedDB dengan backup localStorage.
- cleanHtml mengembalikan <p>, <br>, heading, formatting inline, justify, dan text-indent.
- Komentar HTML <!----> dihapus tanpa menghilangkan tanda baca di sekitarnya.
- Generate ZIP dengan struktur Chapter N/chapter-content.txt dan format ZIP kompatibel dengan Madara.

STRUKTUR:
chapter-collector/
├── index.html
├── README.txt
├── css/
│   └── style.css
└── js/
    ├── app.js
    ├── clean-html.js
    ├── storage.js
    └── zip.js

Cara menjalankan:
Buka index.html melalui browser modern. Jika browser membatasi ES Modules pada file://, jalankan folder melalui server lokal sederhana, misalnya:
python -m http.server
