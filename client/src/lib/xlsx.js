/**
 * Minimal Excel (.xlsx) reader for imports — no dependencies.
 *
 * An .xlsx file is a zip archive of XML parts. This unzips it with the
 * browser's DecompressionStream and reads the shared strings, styles (to tell
 * dates from plain numbers) and each worksheet's cells.
 *
 * readWorkbook(arrayBuffer) → [{ name, hidden, rows }]
 *   rows[r][c] = { text, kind, formula } or undefined for an empty cell
 *     text     the cell's value as text; dates are YYYY-MM-DD
 *     kind     'text' | 'number' | 'date' | 'bool'
 *     formula  true when the cell is calculated (the cached result is used)
 */

// ---- zip ----------------------------------------------------------------------

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipDirectory(buf) {
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('This workbook appears to be damaged.');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, { method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readEntry(buf, entry) {
  const view = new DataView(buf);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = new Uint8Array(buf, start, entry.compSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new Error('This workbook uses an unsupported compression method.');
}

// ---- xml helpers -----------------------------------------------------------------

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const els = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const child = (node, name) => Array.from(node.childNodes).find((n) => n.localName === name);

/** Text of a string item (<si> or <is>), ignoring phonetic runs. */
function stringItem(node) {
  return els(node, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('');
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormat(code) {
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dmyhs]/i.test(stripped) && !/^general$/i.test(stripped.trim());
}

function serialToISO(serial, date1904) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0)) * 86400000) + Date.UTC(1899, 11, 30);
  return new Date(ms).toISOString().slice(0, 10);
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Format a number for display without float noise (e.g. 0.30000000000000004). */
const numberText = (n) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12))));

// ---- workbook ------------------------------------------------------------------

export async function readWorkbook(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read Excel files. Save the sheet as CSV and import that instead.');
  const entries = readZipDirectory(buf);
  const text = async (name) => {
    const e = entries.get(name);
    return e ? new TextDecoder().decode(await readEntry(buf, e)) : null;
  };

  const workbookXml = await text('xl/workbook.xml');
  if (!workbookXml) throw new Error('This file is not an Excel workbook (.xlsx).');
  const workbook = parseXml(workbookXml);
  const date1904 = els(workbook, 'workbookPr').some((n) => ['1', 'true'].includes(n.getAttribute('date1904')));

  const rels = new Map();
  const relsXml = await text('xl/_rels/workbook.xml.rels');
  if (relsXml) for (const r of els(parseXml(relsXml), 'Relationship')) rels.set(r.getAttribute('Id'), r.getAttribute('Target'));

  const shared = [];
  const sstXml = await text('xl/sharedStrings.xml');
  if (sstXml) for (const si of els(parseXml(sstXml), 'si')) shared.push(stringItem(si));

  // Style index → is this a date format?
  const dateStyles = [];
  const stylesXml = await text('xl/styles.xml');
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map(els(styles, 'numFmt').map((f) => [Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') || '']));
    const cellXfs = els(styles, 'cellXfs')[0];
    if (cellXfs) {
      for (const xf of Array.from(cellXfs.childNodes).filter((n) => n.localName === 'xf')) {
        const id = Number(xf.getAttribute('numFmtId') || 0);
        dateStyles.push(BUILTIN_DATE_FORMATS.has(id) || (custom.has(id) && isDateFormat(custom.get(id))));
      }
    }
  }

  const sheets = [];
  for (const s of els(workbook, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    let target = rels.get(rid);
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = await text(target);
    if (!xml) continue;
    sheets.push({
      name: s.getAttribute('name'),
      hidden: Boolean(s.getAttribute('state') && s.getAttribute('state') !== 'visible'),
      rows: readSheet(parseXml(xml), { shared, dateStyles, date1904 }),
    });
  }
  if (!sheets.length) throw new Error('No worksheets were found in this workbook.');
  return sheets;
}

function readSheet(doc, { shared, dateStyles, date1904 }) {
  const rows = [];
  let nextRow = 0;
  for (const row of els(doc, 'row')) {
    const r = row.getAttribute('r') ? Number(row.getAttribute('r')) - 1 : nextRow;
    nextRow = r + 1;
    const cells = [];
    let nextCol = 0;
    for (const c of Array.from(row.childNodes).filter((n) => n.localName === 'c')) {
      const ref = c.getAttribute('r');
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      const type = c.getAttribute('t') || 'n';
      const formula = Boolean(child(c, 'f'));
      const v = child(c, 'v')?.textContent ?? '';
      let cell = null;
      if (type === 's') cell = { text: shared[Number(v)] ?? '', kind: 'text' };
      else if (type === 'inlineStr') cell = { text: child(c, 'is') ? stringItem(child(c, 'is')) : '', kind: 'text' };
      else if (type === 'str') cell = { text: v, kind: 'text' };
      else if (type === 'b') cell = { text: v === '1' ? 'TRUE' : 'FALSE', kind: 'bool' };
      else if (type === 'e') cell = { text: '', kind: 'text' };
      else if (type === 'd') cell = { text: v.slice(0, 10), kind: 'date' };
      else if (v !== '') {
        const n = Number(v);
        const isDate = dateStyles[Number(c.getAttribute('s') || 0)];
        cell = isDate && Number.isFinite(n) ? { text: serialToISO(n, date1904), kind: 'date' } : { text: numberText(n), kind: 'number' };
      }
      if (!cell && formula) cell = { text: '', kind: 'text' }; // formula with no saved result
      if (cell && (cell.text !== '' || formula)) cells[col] = { ...cell, text: cell.text.trim(), formula };
    }
    if (cells.length) rows[r] = cells;
  }
  return Array.from(rows, (r) => r || []);
}
