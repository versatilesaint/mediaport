// Minimal ZIP writer (no dependencies). Media is stored as is (already compressed); text is deflated.
// Paths use forward slashes and UTF-8 names (flag bit 11), which Windows Explorer, macOS and FreeShow all read.
import { deflateRawSync, crc32 } from 'node:zlib';

const STORE = /\.(webm|png|jpg|jpeg|zip|fstemplate|fsoverlay|woff2)$/i;

/** entries: [path, Buffer|string][] → Buffer */
export function zip(entries) {
  const local = [], central = [];
  let offset = 0;
  const t = new Date(), dosTime = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1), dosDate = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  for (const [path, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const name = Buffer.from(path, 'utf8');
    const store = STORE.test(path) || data.length < 64;
    const body = store ? data : deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(store ? 0 : 8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

/** Reads a ZIP written by zip() (or any stored/deflated ZIP without data descriptors): Map path → Buffer. For tests. */
export async function unzip(buf) {
  const { inflateRawSync } = await import('node:zlib');
  const out = new Map();
  let e = buf.length - 22;
  while (buf.readUInt32LE(e) !== 0x06054b50) e--;
  let p = buf.readUInt32LE(e + 16);
  const n = buf.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28);
    const raw = buf.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + size);
    out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nl + xl + cl;
  }
  return out;
}
