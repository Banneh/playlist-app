/** Minimal ID3v2.3 tag builder (UTF-16 frames — the only encoding rekordbox
 *  accepts in v2.3) and a RIFF helper that embeds the tag as an `id3 ` chunk. */
import * as fs from "fs";

function syncsafe(n: number): Buffer {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

function textFrame(id: string, text: string): Buffer {
  // encoding 0x01 = UTF-16 with BOM; v2.3 frame size is a plain uint32be
  const body = Buffer.concat([
    Buffer.from([0x01, 0xff, 0xfe]),
    Buffer.from(text, "utf16le"),
    Buffer.from([0x00, 0x00]),
  ]);
  const head = Buffer.alloc(10);
  head.write(id, 0, "latin1");
  head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

export function buildId3v23(artist: string, title: string, genre: string): Buffer {
  const frames: Buffer[] = [];
  if (title) frames.push(textFrame("TIT2", title));
  if (artist) frames.push(textFrame("TPE1", artist));
  if (genre) frames.push(textFrame("TCON", genre));
  const body = Buffer.concat(frames);
  return Buffer.concat([
    Buffer.from("ID3", "latin1"),
    Buffer.from([0x03, 0x00, 0x00]),
    syncsafe(body.length),
    body,
  ]);
}

/** Append an `id3 ` chunk to a WAV file and patch the RIFF size. The file must
 *  not already contain one (we only call this on fresh ffmpeg output). */
export function appendId3ToWav(path: string, tag: Buffer): void {
  const fd = fs.openSync(path, "r+");
  try {
    const magic = Buffer.alloc(4);
    fs.readSync(fd, magic, 0, 4, 0);
    if (magic.toString("latin1") !== "RIFF") throw new Error("not a RIFF/WAV file");
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(8);
    head.write("id3 ", 0, "latin1");
    head.writeUInt32LE(tag.length, 4);
    const pad = tag.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
    const chunk = Buffer.concat([head, tag, pad]);
    fs.writeSync(fd, chunk, 0, chunk.length, size);
    const riff = Buffer.alloc(4);
    riff.writeUInt32LE(size + chunk.length - 8, 0);
    fs.writeSync(fd, riff, 0, 4, 4);
  } finally {
    fs.closeSync(fd);
  }
}
