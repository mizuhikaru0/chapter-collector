function dosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
function u32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== "function") throw new Error("Browser tidak mendukung CompressionStream.");
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

function localHeader(nameBytes, compressedSize, uncompressedSize, crc, time, date) {
  // Version 2.0, UTF-8, data descriptor flag 0x0808, DEFLATE.
  return concat(
    new Uint8Array([0x50,0x4b,0x03,0x04]),
    u16(20), u16(0x0808), u16(8), u16(time), u16(date),
    u32(crc), u32(compressedSize), u32(uncompressedSize),
    u16(nameBytes.length), u16(0), nameBytes
  );
}

function descriptor(crc, compressedSize, uncompressedSize) {
  return concat(new Uint8Array([0x50,0x4b,0x07,0x08]), u32(crc), u32(compressedSize), u32(uncompressedSize));
}

function centralHeader(nameBytes, compressedSize, uncompressedSize, crc, time, date, offset, directory) {
  const externalAttr = directory ? 0x00000010 : 0x00000020;
  return concat(
    new Uint8Array([0x50,0x4b,0x01,0x02]),
    u16(20), u16(20), u16(0x0808), u16(8), u16(time), u16(date),
    u32(crc), u32(compressedSize), u32(uncompressedSize),
    u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(externalAttr), u32(offset), nameBytes
  );
}

function endRecord(count, centralSize, centralOffset) {
  return concat(new Uint8Array([0x50,0x4b,0x05,0x06]), u16(0),u16(0),u16(count),u16(count),u32(centralSize),u32(centralOffset),u16(0));
}

export async function createMadaraZip(chapters) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = dosTimeDate();

  const sorted = [...chapters].sort((a,b) => a.number - b.number);

  for (const chapter of sorted) {
    const folder = `Chapter ${chapter.number}/`;
    const file = `${folder}chapter-content.txt`;

    for (const [name, data, isDir] of [
      [folder, new Uint8Array(0), true],
      [file, encoder.encode(chapter.content), false]
    ]) {
      const nameBytes = encoder.encode(name);
      const raw = data;
      const crc = crc32(raw);
      const compressed = isDir ? raw : await deflateRaw(raw);
      const method = isDir ? 0 : 8;
      const header = concat(
        new Uint8Array([0x50,0x4b,0x03,0x04]),
        u16(20), u16(0x0808), u16(method), u16(now.time), u16(now.date),
        u32(crc), u32(compressed.length), u32(raw.length), u16(nameBytes.length), u16(0), nameBytes
      );
      const desc = descriptor(crc, compressed.length, raw.length);
      parts.push(header, compressed, desc);
      central.push(centralHeader(nameBytes, compressed.length, raw.length, crc, now.time, now.date, offset, isDir));
      offset += header.length + compressed.length + desc.length;
    }
  }

  const centralOffset = offset;
  const centralData = concat(...central);
  const end = endRecord(central.length, centralData.length, centralOffset);
  const blob = new Blob([...parts, centralData, end], { type: "application/zip" });
  return blob;
}
