/* An AIFF file as a WAV byte stream, for the in-app preview: the <audio> element of the app
   (Chromium) has no AIFF reader, but it plays WAV. Nothing is written to disk and the file is
   not changed: the samples are read from the AIFF and their bytes are put in WAV order on the
   way out, behind a 44-byte WAV header, so any byte range can be served (seeking works). */
import * as fs from "fs";
import { Readable } from "stream";

export interface AifView { size: number; stream(start: number, end: number): Readable }

const HEAD = 44;

/** the 80-bit number AIFF keeps its sample rate in */
function ext80(b: Buffer, o: number): number {
  const exp = ((b[o] & 0x7f) << 8 | b[o + 1]) - 16383;
  return b.readUInt32BE(o + 2) * Math.pow(2, exp - 31) + b.readUInt32BE(o + 6) * Math.pow(2, exp - 63);
}

/** The file as WAV, or null when it is not an AIFF this can serve (compressed audio, a broken
 *  file): the caller then sends the file as it is. */
export function aifAsWav(p: string): AifView | null {
  let fd = -1;
  try {
    fd = fs.openSync(p, "r");
    const fileSize = fs.fstatSync(fd).size;
    const h = Buffer.alloc(12);
    if (fs.readSync(fd, h, 0, 12, 0) < 12 || h.toString("latin1", 0, 4) !== "FORM") return null;
    const form = h.toString("latin1", 8, 12);
    if (form !== "AIFF" && form !== "AIFC") return null;
    let ch = 0, frames = 0, bits = 0, rate = 0, comp = "NONE", dataAt = -1, dataMax = 0;
    for (let at = 12; at + 8 <= fileSize && (dataAt < 0 || !ch);) {
      const c = Buffer.alloc(8);
      if (fs.readSync(fd, c, 0, 8, at) < 8) break;
      const id = c.toString("latin1", 0, 4), len = c.readUInt32BE(4);
      if (id === "COMM") {
        const b = Buffer.alloc(Math.min(len, 22));
        if (fs.readSync(fd, b, 0, b.length, at + 8) < 18) return null;
        ch = b.readUInt16BE(0); frames = b.readUInt32BE(2); bits = b.readUInt16BE(6); rate = Math.round(ext80(b, 8));
        if (form === "AIFC" && b.length >= 22) comp = b.toString("latin1", 18, 22);
      } else if (id === "SSND") {
        const b = Buffer.alloc(8);
        if (fs.readSync(fd, b, 0, 8, at + 8) < 8) return null;
        dataAt = at + 16 + b.readUInt32BE(0);
        dataMax = Math.min(at + 8 + len, fileSize) - dataAt;
      }
      at += 8 + len + (len & 1);
    }
    const c = comp.toLowerCase();
    const float = c === "fl32" || c === "fl64";
    if (!(c === "none" || c === "sowt" || c === "twos" || float)) return null;
    const bytes = Math.ceil(bits / 8);
    if (!ch || !rate || dataAt < 0 || bytes < 1 || bytes > 8 || (float && bytes !== 4 && bytes !== 8)) return null;
    const block = ch * bytes;
    let dataLen = Math.min(frames * block, Math.max(0, dataMax));
    dataLen -= dataLen % block;
    if (dataLen <= 0 || dataLen > 0xffffffff - HEAD) return null;
    const swap = c !== "sowt" && bytes > 1;

    const head = Buffer.alloc(HEAD);
    head.write("RIFF", 0, "latin1"); head.writeUInt32LE(36 + dataLen, 4); head.write("WAVEfmt ", 8, "latin1");
    head.writeUInt32LE(16, 16); head.writeUInt16LE(float ? 3 : 1, 20); head.writeUInt16LE(ch, 22);
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * block, 28); head.writeUInt16LE(block, 32);
    head.writeUInt16LE(bytes * 8, 34); head.write("data", 36, "latin1"); head.writeUInt32LE(dataLen, 40);

    interface Handle { fd: number; busy: boolean }
    const read = (h: Handle, b: Buffer, len: number, pos: number) => new Promise<number>((res, rej) => {
      h.busy = true;
      fs.read(h.fd, b, 0, len, pos, (e, n) => { h.busy = false; e ? rej(e) : res(n); });
    });
    async function* parts(h: Handle, start: number, end: number) {
      if (start < HEAD) yield head.subarray(start, Math.min(HEAD, end + 1));
      let from = Math.max(0, start - HEAD);
      const to = end - HEAD;               // last data byte wanted
      while (from <= to) {
        const a = from - from % bytes;     // whole samples, so their bytes can be turned round
        const want = Math.min(to + 1, a + (1 << 18));
        const b = Buffer.alloc(Math.ceil((want - a) / bytes) * bytes);
        const n = await read(h, b, Math.min(b.length, dataLen - a), dataAt + a);
        if (n <= 0) return;
        if (swap) for (let i = 0; i + bytes <= n; i += bytes) b.subarray(i, i + bytes).reverse();
        const out = b.subarray(from - a, Math.min(n, to + 1 - a));
        if (!out.length) return;
        yield out;
        from += out.length;
      }
    }
    /** the stream owns its file handle and closes it when it ends or is dropped half way
     *  (after a read still under way has come back) */
    const stream = (start: number, end: number) => {
      const h: Handle = { fd: fs.openSync(p, "r"), busy: false };
      const r = Readable.from(parts(h, start, end), { objectMode: false });
      const close = () => { if (h.busy) return void setImmediate(close); try { fs.closeSync(h.fd); } catch {} };
      r.once("close", close);
      return r;
    };
    return { size: HEAD + dataLen, stream };
  } catch { return null; }
  finally { if (fd >= 0) try { fs.closeSync(fd); } catch {} }
}
