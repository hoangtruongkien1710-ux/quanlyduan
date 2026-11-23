'use strict';
// Lớp tương thích Apps Script cho Code.js chạy trên Node.
// - Dữ liệu các tab APP_* nằm trong bộ nhớ (nạp từ PostgreSQL lúc khởi động), mỗi lần gọi xong thì lưu các tab đã đổi.
// - Mỗi lần gọi API dùng một "ngữ cảnh" mới (giống mỗi lần chạy Apps Script): biến toàn cục của Code.js không dính giữa các lần gọi.
// - Các lần gọi chạy tuần tự (thay cho LockService).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Sheet, Spreadsheet } = require('./sheet.cjs');

const ROOT = process.cwd();
const LEGACY = path.join(ROOT, 'legacy');
const TZ = 'Asia/Ho_Chi_Minh';
const G = globalThis.__SMEE_ENGINE__ || (globalThis.__SMEE_ENGINE__ = { ready: null, queue: Promise.resolve() });

function prisma() {
  if (!G.prisma) { const { PrismaClient } = require('@prisma/client'); G.prisma = new PrismaClient(); }
  return G.prisma;
}
const modelOf = key => 'T_' + key;
const delegate = key => prisma()[modelOf(key).charAt(0).toLowerCase() + modelOf(key).slice(1)];

/* ---------- mã đăng nhập ---------- */
function codeHash(code) {
  const secret = process.env.APP_SECRET || '';
  if (!secret) throw new Error('Thiếu APP_SECRET trong .env');
  return crypto.createHmac('sha256', secret).update(String(code).trim().normalize('NFC')).digest('hex');
}

/* ---------- Utilities.formatDate ---------- */
function formatDate(date, tz, fmt) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return String(fmt).replace(/'([^']*)'|yyyy|yy|MM|dd|HH|mm|ss|SSS/g, (m, lit) => {
    if (lit !== undefined) return lit;
    return { yyyy: parts.year, yy: parts.year.slice(2), MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second, SSS: ms }[m];
  });
}

/* ---------- biên dịch Code.js / Config.js / overrides.js (tự biên dịch lại khi file đổi) ---------- */
const SRC = () => [path.join(LEGACY, 'Config.js'), path.join(LEGACY, 'Code.js'), path.join(ROOT, 'lib', 'engine', 'overrides.js')];
function compileScripts() {
  const [cfg, code, ov] = SRC();
  G.scripts = {
    config: new vm.Script(fs.readFileSync(cfg, 'utf8').replace('const CFG', 'var CFG'), { filename: 'Config.js' }),
    code: new vm.Script(fs.readFileSync(code, 'utf8').replace(/^const /gm, 'var ').replace(/^let /gm, 'var '), { filename: 'Code.js' }),
    overrides: new vm.Script(fs.readFileSync(ov, 'utf8'), { filename: 'overrides.js' }),
  };
  G.scriptsStamp = SRC().map(f => fs.statSync(f).mtimeMs).join('|');
}
function freshScripts() {
  if (process.env.NODE_ENV === 'production') return;
  const stamp = SRC().map(f => fs.statSync(f).mtimeMs).join('|');
  if (stamp !== G.scriptsStamp) compileScripts();
}

/* ---------- trạng thái dùng chung ---------- */
async function init() {
  const cfgCtx = {}; vm.createContext(cfgCtx);
  const cfgSrc = fs.readFileSync(path.join(LEGACY, 'Config.js'), 'utf8').replace('const CFG', 'var CFG');
  vm.runInContext(cfgSrc, cfgCtx);
  const CFG = cfgCtx.CFG;
  G.CFG = CFG;
  compileScripts();
  // Dữ liệu: một "file Google Sheet" trong bộ nhớ.
  const ss = new Spreadsheet(CFG.DB_SPREADSHEET_ID, 'SMEE DATA');
  G.tableOfSheet = new Map();
  for (const key of Object.keys(CFG.TABLES)) {
    const fields = CFG.FIELDS[key] || [];
    const rows = await delegate(key).findMany({ orderBy: [{ pos: 'asc' }, { rid: 'asc' }] });
    const sh = new Sheet(CFG.TABLES[key], [fields].concat(rows.map(r => fields.map(f => r[f] ?? ''))));
    ss._add(sh);
    G.tableOfSheet.set(sh, key);
  }
  G.ss = ss;
  // Script Properties
  G.props = new Map((await prisma().appProperty.findMany()).map(p => [p.key, p.value]));
  G.propsDirty = new Set();
  G.cache = new Map();
  await loadStaff();
  try { require('../staff-sync.cjs').start(module.exports); } catch (e) { console.log('[SMEE] Không khởi động được đồng bộ nhân sự:', e.message); }
  console.log('[SMEE] Đã nạp dữ liệu:', Object.keys(CFG.TABLES).map(k => CFG.TABLES[k] + '=' + (ss.getSheetByName(CFG.TABLES[k]).getLastRow() - 1)).join(', '));
}
async function loadStaff() {
  const list = await prisma().staff.findMany({ orderBy: [{ pos: 'asc' }, { hoTen: 'asc' }] });
  const sig = list.map(s => [s.id, s.hoTen, s.chucVu, s.phongBan, s.tinhTrang, s.maNV, s.email, s.codeHash].join('|')).join('\n');
  // Danh sách nhân sự đổi → bỏ bộ đệm nhân sự của Code.js (danh sách, vị trí cột).
  if (G.cache && G.staffSig !== sig) for (const k of [...G.cache.keys()]) if (/^emp_/.test(k)) G.cache.delete(k);
  G.staffSig = sig;
  G.staff = list;
  G.staffAt = Date.now();
}
function ready() { return G.ready || (G.ready = init().catch(e => { G.ready = null; throw e; })); }

/* ---------- sheet nhân sự giả lập từ bảng Staff (không có mã đăng nhập) ---------- */
function staffSpreadsheet() {
  const CFG = G.CFG;
  const head = ['Họ và tên', 'Pass App Dự án', 'Chức vụ', 'Phòng ban', 'Trạng thái', 'Mã nhân viên', 'Email'];
  const rows = [head].concat(G.staff.map(s => [s.hoTen, s.codeHash ? '*' : '', s.chucVu, s.phongBan, s.tinhTrang, s.maNV, s.email]));
  const ss = new Spreadsheet(CFG.EMPLOYEE_SPREADSHEET_ID, 'Nhân sự');
  ss._add(new Sheet('NhanVien', rows, { id: Number(CFG.EMPLOYEE_GID) }));
  return ss;
}
/** Dòng (1-based, trên sheet nhân sự giả lập) của nhân viên có mã đăng nhập này; -1 nếu không có hoặc trùng. */
function staffRowByCode(code) {
  let h; try { h = codeHash(code); } catch (_) { return -1; }
  const idx = G.staff.map((s, i) => (s.codeHash && s.codeHash === h ? i : -1)).filter(i => i >= 0);
  return idx.length === 1 ? idx[0] + 2 : -1;
}

/* ---------- dịch vụ Apps Script cho một lần gọi ---------- */
function makeContext() {
  const CFG = G.CFG;
  const staffSS = staffSpreadsheet();
  const props = {
    getProperty: k => (G.props.has(k) ? G.props.get(k) : null),
    setProperty: (k, v) => { G.props.set(k, String(v)); G.propsDirty.add(k); return props; },
    deleteProperty: k => { G.props.delete(k); G.propsDirty.add(k); return props; },
    getProperties: () => Object.fromEntries(G.props),
  };
  const cache = {
    get: k => { const e = G.cache.get(k); if (!e) return null; if (e.exp < Date.now()) { G.cache.delete(k); return null; } return e.v; },
    put: (k, v, sec) => { G.cache.set(k, { v: String(v), exp: Date.now() + 1000 * Math.min(Number(sec) || 600, 21600) }); },
    remove: k => { G.cache.delete(k); },
    removeAll: ks => ks.forEach(k => G.cache.delete(k)),
  };
  const unsupported = what => () => { throw new Error(what + ' dùng Google Drive / Google Sheets — chưa hỗ trợ ở bản chạy trên máy chủ riêng.'); };
  const ctx = {
    console, JSON, Math, Date, Intl, Promise, Set, Map, Array, Object, String, Number, Boolean, RegExp, Error, TypeError, Symbol, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    Logger: { log: (...a) => { if (process.env.SMEE_LOG === '1') console.log('[Logger]', ...a); } },
    Session: { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => TZ },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } }) },
    CacheService: { getScriptCache: () => cache, getUserCache: () => cache },
    PropertiesService: { getScriptProperties: () => props },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      sleep: () => {},
      formatDate,
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5', SHA_1: 'sha1' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...crypto.createHash(typeof alg === 'string' ? alg : 'sha256').update(String(s), 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
      base64Encode: s => Buffer.from(Array.isArray(s) ? s.map(b => b & 255) : String(s)).toString('base64'),
    },
    SpreadsheetApp: {
      openById: id => {
        if (id === CFG.DB_SPREADSHEET_ID) return G.ss;
        if (id === CFG.EMPLOYEE_SPREADSHEET_ID) return staffSS;
        throw new Error('Không mở được Google Sheet bên ngoài ở bản chạy trên máy chủ riêng.');
      },
      flush: () => {},
      create: unsupported('Tạo file Google Sheet'),
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM' },
    },
    DriveApp: {
      getFileById: id => ({
        makeCopy: name => {
          // Sao lưu = bản chụp JSON toàn bộ dữ liệu, lưu trong Script Properties (bảng AppProperty).
          const snap = {}; G.ss.getSheets().forEach(s => { if (G.tableOfSheet.has(s)) snap[s.name] = s.rows; });
          props.setProperty('BACKUP:' + name, JSON.stringify(snap));
          return { getUrl: () => '#sao-luu:' + name, getId: () => 'BACKUP:' + name, moveTo() {} };
        },
        moveTo() {},
      }),
      getFolderById: unsupported('Thư mục Google Drive'),
    },
    UrlFetchApp: { fetch: (url, opts) => syncFetch(url, opts) },
    HtmlService: { createTemplateFromFile: unsupported('HtmlService'), createHtmlOutputFromFile: unsupported('HtmlService'), createHtmlOutput: unsupported('HtmlService') },
    __staffRowByCode: staffRowByCode,
  };
  vm.createContext(ctx);
  G.scripts.config.runInContext(ctx);
  G.scripts.code.runInContext(ctx);
  G.scripts.overrides.runInContext(ctx);
  return ctx;
}

/* ---------- UrlFetchApp.fetch đồng bộ (Telegram) ---------- */
function syncFetch(url, opts = {}) {
  const job = JSON.stringify({ url, method: (opts.method || 'get').toUpperCase(), headers: Object.assign({}, opts.headers || {}, opts.contentType ? { 'Content-Type': opts.contentType } : {}), body: opts.payload == null ? undefined : String(opts.payload) });
  const script = `let d='';process.stdin.on('data',c=>d+=c).on('end',async()=>{const j=JSON.parse(d);try{const r=await fetch(j.url,{method:j.method,headers:j.headers,body:j.method==='GET'?undefined:j.body});process.stdout.write(JSON.stringify({code:r.status,text:await r.text()}));}catch(e){process.stdout.write(JSON.stringify({error:String(e.message||e)}));}});`;
  const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { input: job, timeout: 30000, encoding: 'utf8' }));
  if (out.error) { if (opts.muteHttpExceptions) return { getResponseCode: () => 0, getContentText: () => out.error }; throw new Error('Lỗi kết nối: ' + out.error); }
  if (out.code >= 400 && !opts.muteHttpExceptions) throw new Error('Yêu cầu thất bại, mã ' + out.code);
  return { getResponseCode: () => out.code, getContentText: () => out.text };
}

/* ---------- lưu các tab đã đổi ---------- */
async function persist() {
  const CFG = G.CFG, ops = [], touched = [];
  for (const sh of G.ss.getSheets()) {
    if (!sh.dirty) continue;
    sh.dirty = false;
    const key = G.tableOfSheet.get(sh) || Object.keys(CFG.TABLES).find(k => CFG.TABLES[k] === sh.name);
    if (!key) continue; // tab phụ (sao lưu…) chỉ nằm trong bộ nhớ
    G.tableOfSheet.set(sh, key);
    const fields = CFG.FIELDS[key] || [];
    const head = (sh.rows[0] || []).map(s => String(s).trim());
    const idx = fields.map(f => head.indexOf(f));
    const data = [];
    for (let i = 1; i < sh.rows.length; i++) {
      const r = sh.rows[i] || [];
      if (!r.some(x => x !== '' && x != null)) continue;
      const o = { pos: i };
      fields.forEach((f, j) => { o[f] = idx[j] >= 0 ? String(r[idx[j]] ?? '') : ''; });
      data.push(o);
    }
    ops.push(delegate(key).deleteMany({}));
    if (data.length) ops.push(delegate(key).createMany({ data }));
    touched.push(sh.name);
  }
  for (const k of G.propsDirty) {
    ops.push(G.props.has(k) ? prisma().appProperty.upsert({ where: { key: k }, create: { key: k, value: G.props.get(k) }, update: { value: G.props.get(k) } })
      : prisma().appProperty.deleteMany({ where: { key: k } }));
  }
  G.propsDirty = new Set();
  if (ops.length) await prisma().$transaction(ops);
  return touched;
}

/* ---------- gọi hàm API ---------- */
const NAME_OK = /^api[A-Za-z0-9]+$/;
function call(name, args) {
  const run = async () => {
    await ready();
    if (!NAME_OK.test(name)) throw new Error('Không có hàm ' + name);
    if (name === 'apiLogin' || Date.now() - G.staffAt > 60000) await loadStaff();
    const t0 = Date.now();
    freshScripts();
    const ctx = makeContext();
    if (typeof ctx[name] !== 'function') throw new Error('Không có hàm ' + name);
    let value, error = null;
    try { value = ctx[name](...(Array.isArray(args) ? args : [])); }
    catch (e) { error = e; }
    // Lưu cả khi lỗi giữa chừng? Không: Apps Script ghi từng ô ngay, nên giữ đúng như vậy — lưu những gì đã ghi.
    const touched = await persist();
    if (process.env.SMEE_LOG === '1') console.log('[SMEE rpc]', name, (Date.now() - t0) + 'ms', touched.length ? 'lưu: ' + touched.join(',') : '');
    if (error) throw error;
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  };
  const p = G.queue.then(run, run);
  G.queue = p.catch(() => {});
  return p;
}

module.exports = { call, ready, codeHash, loadStaff, prisma, G };
