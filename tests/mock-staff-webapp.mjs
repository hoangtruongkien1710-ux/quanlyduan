// Web App nhân sự GIẢ LẬP (dữ liệu giả) để kiểm thử đồng bộ — không đụng Google Sheet thật.
// Chạy: node tests/mock-staff-webapp.mjs  (cổng 3199; khoá thử: MOCK_SYNC_KEY / MOCK_HASH_KEY từ biến môi trường)
import http from 'node:http';
import crypto from 'node:crypto';

const KEY = process.env.MOCK_SYNC_KEY || 'mock-sync-key', HK = process.env.MOCK_HASH_KEY || 'mock-hash-key';
const h = c => crypto.createHmac('sha256', HK).update(String(c).trim().normalize('NFC')).digest('hex');
const staff = [
  { hoTen: 'Nguyễn Văn A (giả)', maNV: 'GIA01', email: '', chucVu: 'Giám đốc', phongBan: 'Ban giám đốc', tinhTrang: 'Hoạt động', codeHash: h('ma-gia-giamdoc'), pos: 0 },
  { hoTen: 'Trần Thị B (giả)', maNV: 'GIA02', email: '', chucVu: 'Designer', phongBan: 'Digital', tinhTrang: 'Hoạt động', codeHash: h('ma-gia-nhanvien'), pos: 1 },
  { hoTen: 'Lê Văn C (giả)', maNV: 'GIA03', email: '', chucVu: 'Quay phim', phongBan: 'Film', tinhTrang: 'Nghỉ việc', codeHash: h('ma-gia-nghiviec'), pos: 2 },
];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.searchParams.get('key') !== KEY) return res.end(JSON.stringify({ error: 'unauthorized' }));
  res.end(JSON.stringify({ ok: true, count: staff.length, staff }));
}).listen(3199, () => console.log('mock staff web app :3199'));
