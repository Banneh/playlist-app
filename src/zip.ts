/** Minimal zip reader (no dependencies): lists the central directory and extracts
 *  single entries (stored or deflated). Enough for the album zips Bandcamp and
 *  similar shops hand out. Encrypted entries and zip64 archives are rejected. */
import * as fs from "fs";
import * as zlib from "zlib";

export interface ZipEntry {
  name: string;          // path inside the archive, "/" separated
  method: number;        // 0 = stored, 8 = deflate
  size: number;          // uncompressed bytes
  compSize: number;
  offset: number;        // local file header offset
  encrypted: boolean;
  isDir: boolean;
}

const SIG_EOCD = 0x06054b50, SIG_CD = 0x02014b50, SIG_LOCAL = 0x04034b50;

function readAt(fd: number, pos: number, len: number): Buffer {
  const b = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = fs.readSync(fd, b, got, len - got, pos + got);
    if (n <= 0) break;
    got += n;
  }
  return got === len ? b : b.subarray(0, got);
}

/** Entries of the archive, in central-directory order. */
export function listEntries(zipPath: string): ZipEntry[] {
  const fd = fs.openSync(zipPath, "r");
  try {
    const size = fs.fstatSync(fd).size;
    // end of central directory: last 22 bytes, plus up to 64 KiB of comment
    const tailLen = Math.min(size, 22 + 65535);
    const tail = readAt(fd, size - tailLen, tailLen);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === SIG_EOCD) { e = i; break; }
    if (e < 0) throw new Error("not a zip file");
    const total = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    if (total === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new Error("zip64 archives aren't supported");
    const cd = readAt(fd, cdOff, cdSize);
    const out: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < total && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== SIG_CD) throw new Error("corrupt zip (central directory)");
      const flags = cd.readUInt16LE(p + 8), method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20), uncompSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const offset = cd.readUInt32LE(p + 42);
      if (compSize === 0xffffffff || uncompSize === 0xffffffff || offset === 0xffffffff) throw new Error("zip64 archives aren't supported");
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString("utf8");
      out.push({ name, method, size: uncompSize, compSize, offset, encrypted: !!(flags & 1), isDir: name.endsWith("/") });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** Extract one entry to outPath; the result is checked against the recorded size. */
export function extractEntry(zipPath: string, entry: ZipEntry, outPath: string): void {
  if (entry.encrypted) throw new Error(`${entry.name}: encrypted zip entries aren't supported`);
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`${entry.name}: unsupported zip compression (method ${entry.method})`);
  const fd = fs.openSync(zipPath, "r");
  let data: Buffer;
  try {
    const head = readAt(fd, entry.offset, 30);
    if (head.length < 30 || head.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`${entry.name}: corrupt zip (local header)`);
    const start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    data = readAt(fd, start, entry.compSize);
  } finally {
    fs.closeSync(fd);
  }
  if (data.length !== entry.compSize) throw new Error(`${entry.name}: zip is truncated`);
  const out = entry.method === 8 ? zlib.inflateRawSync(data) : data;
  if (out.length !== entry.size) throw new Error(`${entry.name}: zip entry size mismatch`);
  fs.writeFileSync(outPath, out);
}
