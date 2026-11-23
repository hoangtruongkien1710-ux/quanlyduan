'use strict';
// Đồng bộ Google Sheet nhân sự → bảng Staff (chỉ ĐỌC, không ghi gì vào sheet).
// - Dùng service account (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY trong .env), quyền "Người xem".
// - Chỉ đọc hàng tiêu đề (từng hàng một) rồi đọc RIÊNG các cột cần dùng theo tên cột — không đọc cột lương.
// - Mã đăng nhập được mã hoá ngay khi đọc; không lưu / không ghi log mã gốc.
const crypto = require('node:crypto');

const VARIANTS = {
  pass: /^(passappduan|passduan|matkhauappduan|appduanpass|passwordduan)$/,
  name: /^(hovaten|hoten|tennhanvien|nhanvien|ten|hotennhanvien|fullname)$/,
  empId: /^(manhanvien|manv|employeeid|maso)$/,
  role: /^(chucvu|vaitro|chucdanh|vitri|position|role)$/,
  dept: /^(phongban|bophan|nhom|team|department)$/,
  status: /^(trangthai|trangthainhanvien|tinhtrang|tinhtranglamviec|trangthailamviec|tinhtrangcongtac|lamviec|nghiviec|trangthaicongtac)$/,
  email: /^(email|emailcongty|thudientu|mail)$/,
};
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '');
const colA1 = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Khoá service account: lấy từ .env, hoặc từ file google-key.json / google-service-account.json trong thư mục dự án (file này không đưa lên git).
function credentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    return { email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n') };
  for (const name of ['google-key.json', 'google-service-account.json']) {
    try {
      const j = JSON.parse(require('node:fs').readFileSync(require('node:path').join(process.cwd(), name), 'utf8'));
      if (j.client_email && j.private_key) return { email: j.client_email, key: j.private_key };
    } catch (_) {}
  }
  return null;
}
// Cách 1 (đang dùng): Web App Apps Script gắn trên Sheet nhân sự (tools/dong-bo-nhan-su.gs) — trả về mã đăng nhập đã mã hoá bằng HASH_KEY.
function webApp() {
  const url = process.env.STAFF_SYNC_URL, key = process.env.STAFF_SYNC_KEY, hk = process.env.STAFF_HASH_KEY;
  return url && key && hk ? { url, key } : null;
}
function configured() { return !!(webApp() || credentials()); }

async function accessToken() {
  const { email, key } = credentials();
  const now = Math.floor(Date.now() / 1000), b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 });
  const jwt = unsigned + '.' + crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt });
  const j = await r.json();
  if (!j.access_token) throw new Error('Không lấy được quyền truy cập Google (kiểm tra service account).');
  return j.access_token;
}

async function api(token, url) {
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Google Sheets API lỗi ' + r.status + (r.status === 403 ? ' — hãy chia sẻ sheet nhân sự cho email service account (quyền Người xem).' : ''));
  return r.json();
}

/** Đồng bộ qua Web App Apps Script. */
async function syncViaWebApp(engine, w) {
  const r = await fetch(w.url + (w.url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(w.key), { redirect: 'follow' });
  let j; try { j = await r.json(); } catch (_) { throw new Error('Web App nhân sự không trả về dữ liệu hợp lệ (kiểm tra đã Deploy và quyền "Bất kỳ ai").'); }
  if (!j || j.error || !Array.isArray(j.staff)) throw new Error('Web App nhân sự báo lỗi: ' + ((j && j.error) || 'không có danh sách'));
  const out = j.staff.filter(x => x && String(x.hoTen || '').trim()).map((x, i) => ({
    hoTen: String(x.hoTen).trim(), maNV: String(x.maNV || ''), email: String(x.email || ''), chucVu: String(x.chucVu || ''),
    phongBan: String(x.phongBan || ''), tinhTrang: String(x.tinhTrang || ''), codeHash: /^[a-f0-9]{64}$/.test(String(x.codeHash || '')) ? String(x.codeHash) : '',
    pos: Number.isFinite(+x.pos) ? +x.pos : i, nguon: 'sheet' }));
  const prisma = engine.prisma();
  await prisma.$transaction([prisma.staff.deleteMany({ where: { nguon: 'sheet' } }), prisma.staff.createMany({ data: out })]);
  await engine.loadStaff();
  return out.length;
}

/** Đọc sheet nhân sự và ghi đè các dòng nguồn "sheet" trong bảng Staff. Trả về số nhân sự. */
async function syncNow(engine) {
  await engine.ready();
  const w = webApp(); if (w) return syncViaWebApp(engine, w);
  if (!credentials()) throw new Error('Chưa cấu hình đồng bộ nhân sự (STAFF_SYNC_URL / STAFF_SYNC_KEY / STAFF_HASH_KEY trong .env).');
  await engine.ready();
  const CFG = engine.G.CFG, id = CFG.EMPLOYEE_SPREADSHEET_ID, gid = Number(CFG.EMPLOYEE_GID);
  const token = await accessToken();
  const meta = await api(token, id + '?fields=sheets.properties(sheetId,title,gridProperties.rowCount)');
  const sheet = (meta.sheets || []).map(s => s.properties).find(p => p.sheetId === gid);
  if (!sheet) throw new Error('Không tìm thấy tab nhân sự (gid ' + gid + ').');
  const q = s => "'" + String(s).replace(/'/g, "''") + "'";
  // Tìm hàng tiêu đề: đọc TỪNG hàng (tối đa 20), dừng ngay khi thấy cột mã đăng nhập.
  let headerRow = -1, heads = [];
  for (let r = 1; r <= 20 && headerRow < 0; r++) {
    const v = await api(token, id + '/values/' + encodeURIComponent(q(sheet.title) + '!' + r + ':' + r));
    const row = (v.values && v.values[0]) || [];
    if (row.some(c => VARIANTS.pass.test(norm(c)))) { headerRow = r; heads = row.map(norm); }
  }
  if (headerRow < 0) throw new Error('Không thấy cột "Pass App Dự án" trong 20 hàng đầu sheet nhân sự.');
  const col = {}; Object.keys(VARIANTS).forEach(k => { col[k] = heads.findIndex(h => VARIANTS[k].test(h)); });
  if (col.name < 0 || col.status < 0) throw new Error('Sheet nhân sự thiếu cột Họ tên hoặc Tình trạng làm việc.');
  const wanted = Object.keys(col).filter(k => col[k] >= 0);
  const ranges = wanted.map(k => 'ranges=' + encodeURIComponent(q(sheet.title) + '!' + colA1(col[k]) + (headerRow + 1) + ':' + colA1(col[k])));
  const batch = await api(token, id + '/values:batchGet?majorDimension=COLUMNS&' + ranges.join('&'));
  const cols = {}; wanted.forEach((k, i) => { cols[k] = ((batch.valueRanges[i].values || [])[0]) || []; });
  const n = Math.max(...wanted.map(k => cols[k].length), 0), out = [];
  for (let i = 0; i < n; i++) {
    const v = k => String((cols[k] || [])[i] ?? '').trim();
    const hoTen = v('name'); if (!hoTen) continue;
    const code = v('pass');
    out.push({ hoTen, maNV: v('empId'), email: v('email'), chucVu: v('role'), phongBan: v('dept'), tinhTrang: v('status'),
      codeHash: code ? engine.codeHash(code) : '', pos: i, nguon: 'sheet' });
  }
  const prisma = engine.prisma();
  await prisma.$transaction([prisma.staff.deleteMany({ where: { nguon: 'sheet' } }), prisma.staff.createMany({ data: out })]);
  await engine.loadStaff();
  return out.length;
}

let timer = null, noticed = false;
function start(engine) {
  if (!configured()) { if (!noticed) { noticed = true; console.log('[SMEE] Chưa cấu hình đồng bộ nhân sự (STAFF_SYNC_URL…) — app vẫn chạy với tài khoản tạo bằng npm run seed. Xem tools/HUONG_DAN_DONG_BO_NHAN_SU.md'); } return; }
  if (timer) return;
  const run = () => syncNow(engine).then(n => console.log('[SMEE] Đồng bộ nhân sự xong:', n, 'người')).catch(e => console.log('[SMEE] Đồng bộ nhân sự lỗi:', e.message));
  setTimeout(run, 1000);
  timer = setInterval(run, 10 * 60 * 1000);
}

module.exports = { start, syncNow, configured };
