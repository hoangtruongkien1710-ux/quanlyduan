/**
 * SMEE — Web App cung cấp danh sách nhân sự cho app "Quản lý dự án và công việc".
 * Dán toàn bộ file này vào một DỰ ÁN APPS SCRIPT MỚI, độc lập (script.google.com → Dự án mới),
 * KHÔNG dán vào project đang gắn với Sheet nhân sự (để không đụng Mã.gs / doGet sẵn có).
 * Script mở Sheet nhân sự theo ID và chỉ ĐỌC.
 *
 * An toàn:
 *  - Chỉ trả về: họ tên, mã NV, email, chức vụ, phòng ban, tình trạng làm việc.
 *  - KHÔNG trả về cột lương hay bất kỳ cột nào khác.
 *  - Mã đăng nhập ("Pass App Dự án") được MÃ HOÁ (HMAC-SHA256 với HASH_KEY) ngay tại đây — không gửi mã gốc.
 *  - Phải gửi đúng SYNC_KEY (?key=...) mới đọc được; sai khoá thì không trả dữ liệu nào.
 *
 * Lần đầu: chọn hàm caiDat → bấm Chạy (cấp quyền) — hàm tạo SYNC_KEY và HASH_KEY trong
 * Cài đặt dự án (bánh răng) → Thuộc tính tập lệnh. Chép 2 khoá đó vào file .env của app.
 */
var STAFF_SHEET_ID = '1Sb9vG-eOHxYFZEJ_j3L7H2CRwJVnQw7DttypyN3zsXk'; // file Chấm công_lương_SMEE
var STAFF_SHEET_GID = 1202461375; // tab nhân viên (NhanVien)

/** Chạy 1 lần: tạo khoá ngẫu nhiên (không ghi đè nếu đã có). */
function caiDat() {
  var p = PropertiesService.getScriptProperties();
  var rnd = function () { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); };
  if (!p.getProperty('SYNC_KEY')) p.setProperty('SYNC_KEY', rnd());
  if (!p.getProperty('HASH_KEY')) p.setProperty('HASH_KEY', rnd());
  Logger.log('Đã có SYNC_KEY và HASH_KEY. Xem tại: Cài đặt dự án (biểu tượng bánh răng) → Thuộc tính tập lệnh. Chép vào file .env của app: STAFF_SYNC_KEY và STAFF_HASH_KEY.');
}

function doGet(e) {
  var p = PropertiesService.getScriptProperties();
  var key = p.getProperty('SYNC_KEY'), hashKey = p.getProperty('HASH_KEY');
  if (!key || !hashKey) return json_({ error: 'Chưa chạy caiDat().' });
  var given = e && e.parameter ? String(e.parameter.key || '') : '';
  if (!sameText_(given, key)) return json_({ error: 'unauthorized' });

  var sh = SpreadsheetApp.openById(STAFF_SHEET_ID).getSheets().filter(function (s) { return s.getSheetId() === STAFF_SHEET_GID; })[0];
  if (!sh) return json_({ error: 'Không tìm thấy tab nhân viên (gid ' + STAFF_SHEET_GID + ').' });

  // Tên cột: giống app hiện tại (Code.js — employeeMapping_).
  var V = {
    pass: /^(passappduan|passduan|matkhauappduan|appduanpass|passwordduan)$/,
    name: /^(hovaten|hoten|tennhanvien|nhanvien|ten|hotennhanvien|fullname)$/,
    empId: /^(manhanvien|manv|employeeid|maso)$/,
    role: /^(chucvu|vaitro|chucdanh|vitri|position|role)$/,
    dept: /^(phongban|bophan|nhom|team|department)$/,
    status: /^(trangthai|trangthainhanvien|tinhtrang|tinhtranglamviec|trangthailamviec|tinhtrangcongtac|lamviec|nghiviec|trangthaicongtac)$/,
    email: /^(email|emailcongty|thudientu|mail)$/
  };
  var width = Math.max(sh.getLastColumn(), 1), last = sh.getLastRow();
  var headerRow = -1, heads = [];
  for (var r = 1; r <= Math.min(20, last); r++) { // đọc từng hàng tiêu đề, tối đa 20
    var row = sh.getRange(r, 1, 1, width).getDisplayValues()[0];
    if (row.some(function (c) { return V.pass.test(norm_(c)); })) { headerRow = r; heads = row.map(norm_); break; }
  }
  if (headerRow < 0) return json_({ error: 'Không thấy cột "Pass App Dự án" trong 20 hàng đầu.' });
  var col = {};
  Object.keys(V).forEach(function (k) { col[k] = heads.findIndex(function (h) { return V[k].test(h); }); });
  if (col.name < 0 || col.status < 0) return json_({ error: 'Thiếu cột Họ tên hoặc Tình trạng làm việc.' });

  var n = Math.max(0, last - headerRow), cols = {};
  Object.keys(col).forEach(function (k) { // chỉ đọc RIÊNG các cột cần dùng
    cols[k] = col[k] >= 0 && n > 0 ? sh.getRange(headerRow + 1, col[k] + 1, n, 1).getDisplayValues().map(function (x) { return String(x[0] || '').trim(); }) : [];
  });
  var staff = [];
  for (var i = 0; i < n; i++) {
    var hoTen = cols.name[i]; if (!hoTen) continue; // bỏ dòng trống (không có Họ và tên)
    var code = String(cols.pass[i] || '').trim().normalize('NFC');
    staff.push({ hoTen: hoTen, maNV: cols.empId[i] || '', email: cols.email[i] || '', chucVu: cols.role[i] || '',
      phongBan: cols.dept[i] || '', tinhTrang: cols.status[i] || '', codeHash: code ? hmacHex_(code, hashKey) : '', pos: i });
  }
  return json_({ ok: true, count: staff.length, staff: staff, at: new Date().toISOString() });
}

function hmacHex_(value, secret) {
  return Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
/** So sánh thời gian hằng định (chống đoán khoá). */
function sameText_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length, n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function norm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
