// Chạy SAU Code.js trong mỗi ngữ cảnh: thay những chỗ gắn với Google cho bản chạy trên máy chủ riêng.

// Đăng nhập: mã đăng nhập không còn nằm trong sheet — so bằng mã đã mã hoá trong bảng Staff (__staffRowByCode).
function loginLookup_(pass) {
  var row = __staffRowByCode(pass);
  if (row < 0) return { found: [], directory: [] };
  var f = empSheetFast_();
  var w = Math.max.apply(null, EMP_COLS_.map(function (k) { return f.m[k]; })) + 1;
  var me = empFromRow_(f.m, f.sh.getRange(row, 1, 1, w).getDisplayValues()[0], row);
  if (!me.name) return { found: [], directory: [] };
  me.pass = '*';
  var directory = employees_(true);
  if (!directory.some(function (e) { return e.key === me.key; })) directory = directory.concat([me]);
  return { found: [me], directory: directory };
}

// Kiểm tra kết nối: báo bản đang chạy là máy chủ riêng.
var __apiKiemTraKetNoi = apiKiemTraKetNoi;
apiKiemTraKetNoi = function () { var r = __apiKiemTraKetNoi(); r.server = 'next'; return r; };
