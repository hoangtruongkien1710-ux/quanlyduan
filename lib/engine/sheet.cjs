'use strict';
// Giả lập Google Sheet trong bộ nhớ: đủ các hàm mà Code.js dùng.
// Mỗi Sheet giữ mảng 2 chiều chuỗi (hàng 1 = tiêu đề). Ghi vào sheet đánh dấu "dirty" để lưu xuống PostgreSQL.

let NEXT_ID = 1000;
const str = v => (v == null ? '' : v instanceof Date ? v.toISOString() : String(v));

function a1(ref) {
  const m = String(ref).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
  if (!m) throw new Error('Ô không hợp lệ: ' + ref);
  const col = s => s.toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  const r1 = +m[2], c1 = col(m[1]);
  const r2 = m[4] ? +m[4] : r1, c2 = m[3] ? col(m[3]) : c1;
  return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
}

class Range {
  constructor(sheet, r, c, n, w) { this.sh = sheet; this.r = r; this.c = c; this.n = Math.max(0, n); this.w = Math.max(0, w); }
  getDisplayValues() {
    const out = [];
    for (let i = 0; i < this.n; i++) {
      const row = this.sh.rows[this.r - 1 + i] || [];
      const o = new Array(this.w);
      for (let j = 0; j < this.w; j++) o[j] = str(row[this.c - 1 + j]);
      out.push(o);
    }
    return out;
  }
  getValues() { return this.getDisplayValues(); }
  getDisplayValue() { return this.getDisplayValues()[0]?.[0] ?? ''; }
  getValue() { return this.getDisplayValue(); }
  getFormulas() { return this.getDisplayValues().map(r => r.map(() => '')); }
  setValues(v) {
    v.forEach((row, i) => {
      const ri = this.r - 1 + i;
      while (this.sh.rows.length <= ri) this.sh.rows.push([]);
      const t = this.sh.rows[ri];
      row.forEach((x, j) => { t[this.c - 1 + j] = str(x); });
    });
    this.sh.width = Math.max(this.sh.width, this.c - 1 + this.w);
    this.sh.touch();
    return this;
  }
  setValue(x) { return this.setValues([[x]]); }
  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.n; }
  getNumColumns() { return this.w; }
  getA1Notation() { return 'R' + this.r + 'C' + this.c; }
}
// Các hàm định dạng: không có tác dụng ở bản local, trả lại chính range để gọi nối tiếp.
['setNumberFormat', 'setBackground', 'setFontColor', 'setFontWeight', 'setWrap', 'setVerticalAlignment', 'setHorizontalAlignment',
  'setBorder', 'setDataValidation', 'setFontSize', 'setNote', 'clearFormat', 'setFormula'].forEach(k => { Range.prototype[k] = function () { return this; }; });

class Sheet {
  constructor(name, rows, opts = {}) {
    this.name = name;
    this.rows = (rows || []).map(r => r.map(str));
    this.width = Math.max(1, ...this.rows.map(r => r.length));
    this.id = opts.id ?? NEXT_ID++;
    this.dirty = false;
    this.hidden = false;
    this.onTouch = opts.onTouch || null;
  }
  touch() { this.dirty = true; if (this.onTouch) this.onTouch(this); }
  getName() { return this.name; }
  setName(n) { this.name = n; this.touch(); return this; }
  getSheetId() { return this.id; }
  getLastRow() { let n = this.rows.length; while (n > 0 && (this.rows[n - 1] || []).every(x => x === '' || x == null)) n--; return n; }
  getLastColumn() { let m = 0; this.rows.forEach(r => r.forEach((x, i) => { if (x !== '' && x != null) m = Math.max(m, i + 1); })); return m; }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  getMaxColumns() { return Math.max(26, this.width); }
  getRange(r, c, n = 1, w = 1) { if (typeof r === 'string') [r, c, n, w] = a1(r); return new Range(this, r, c, n, w); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  appendRow(row) { this.rows.splice(this.getLastRow(), 0, row.map(str)); this.width = Math.max(this.width, row.length); this.touch(); return this; }
  deleteRow(i) { this.rows.splice(i - 1, 1); this.touch(); }
  deleteRows(i, n) { this.rows.splice(i - 1, n); this.touch(); }
  insertRowAfter(i) { this.rows.splice(i, 0, []); this.touch(); }
  insertRowsAfter(i, n) { this.rows.splice(i, 0, ...Array.from({ length: n }, () => [])); this.touch(); }
  insertRowBefore(i) { this.rows.splice(i - 1, 0, []); this.touch(); }
  insertColumnsAfter(c, n) { this.width = Math.max(this.width, c + n); }
  deleteColumn(c) { this.rows.forEach(r => r.splice(c - 1, 1)); this.width = Math.max(1, this.width - 1); this.touch(); }
  deleteColumns(c, n) { this.rows.forEach(r => r.splice(c - 1, n)); this.width = Math.max(1, this.width - n); this.touch(); }
  clear() { this.rows = []; this.touch(); return this; }
  clearContents() { return this.clear(); }
  isColumnHiddenByUser() { return false; }
  hideSheet() { this.hidden = true; return this; }
  showSheet() { this.hidden = false; return this; }
  copyTo(ss) { const s = new Sheet('Bản sao của ' + this.name, this.rows); ss._add(s); return s; }
  // Không có tác dụng ở bản local:
  setFrozenRows() { return this; } setColumnWidth() { return this; } setColumnWidths() { return this; } autoResizeColumns() { return this; }
  setTabColor() { return this; } activate() { return this; }
}

class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name || id; this.sheets = []; }
  _add(s) { this.sheets.push(s); return s; }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return '#' + this.id; }
  getSpreadsheetTimeZone() { return 'Asia/Ho_Chi_Minh'; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { if (this.getSheetByName(n)) throw new Error('Tab đã tồn tại: ' + n); return this._add(new Sheet(n, [])); }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  getActiveSheet() { return this.sheets[0] || null; }
}

module.exports = { Sheet, Spreadsheet, Range };
