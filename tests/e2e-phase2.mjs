// Kiểm thử Giai đoạn 2 qua HTTP (app đang chạy ở :3100). Chạy: node --env-file=.env tests/e2e-phase2.mjs
// Tạo nhân sự thử (nguon='test') với mã ngẫu nhiên — chỉ dùng trong database local; không in mã.
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const B = 'http://localhost:3100/api/rpc/';
const prisma = new PrismaClient();
const hash = c => crypto.createHmac('sha256', process.env.APP_SECRET).update(c).digest('hex');
const mk = () => crypto.randomBytes(9).toString('base64url');
const people = {
  gd: { hoTen: 'GĐ Thử', chucVu: 'Giám đốc', phongBan: 'Ban giám đốc' },
  tl: { hoTen: 'Trợ lý Thử', chucVu: 'Trợ lý giám đốc', phongBan: 'Ban giám đốc' },
  acc: { hoTen: 'Account Thử', chucVu: 'Account', phongBan: 'Account' },
  nv: { hoTen: 'Nhân viên Thử', chucVu: 'Designer', phongBan: 'Digital' },
  nv2: { hoTen: 'Nhân viên Hai', chucVu: 'Quay phim', phongBan: 'Film' },
};
await prisma.staff.deleteMany({ where: { nguon: 'test' } });
const codes = {};
let i = 10;
for (const [k, p] of Object.entries(people)) { codes[k] = mk(); await prisma.staff.create({ data: { ...p, maNV: 'T' + k.toUpperCase(), tinhTrang: 'Đang làm', codeHash: hash(codes[k]), nguon: 'test', pos: i++ } }); }

let pass = 0, fail = 0;
const results = [];
async function rpc(n, ...a) {
  const r = await fetch(B + n, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result && j.result.__patch ? j.result.value : j.result;
}
async function t(label, fn, expectErr) {
  try { const v = await fn(); if (expectErr) { fail++; results.push('✗ ' + label + ' — lẽ ra phải bị chặn'); } else { pass++; results.push('✓ ' + label); } return v; }
  catch (e) { if (expectErr && expectErr.test(e.message)) { pass++; results.push('✓ ' + label + ' (chặn đúng: ' + e.message.slice(0, 60) + ')'); } else { fail++; results.push('✗ ' + label + ' — ' + e.message.slice(0, 160)); } }
}
const login = async k => { const r = await rpc('apiLogin', codes[k], true, true, []); return { tk: r.token, me: r.me, data: r.data }; };
const S = {};
for (const k of Object.keys(people)) S[k] = await t('Đăng nhập ' + people[k].hoTen, () => login(k));
const gd = S.gd.tk, nv = S.nv.tk, nvKey = S.nv.me.key, nv2Key = S.nv2.me.key;
const RUN = Date.now().toString(36);
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

// Dự án
const pj = await t('Tạo dự án (GĐ)', () => rpc('apiSaveProject', gd, { tenDuAn: 'DA Giai đoạn 2 ' + RUN, moTa: 'test' }));
await t('Nhân viên tạo dự án → bị chặn', () => rpc('apiSaveProject', nv, { tenDuAn: 'X' }), /quyền/);
const pjDel = await t('Tạo dự án để xoá', () => rpc('apiSaveProject', gd, { tenDuAn: 'DA xoá ' + RUN }));
await t('Xoá dự án', () => rpc('apiDeleteProject', gd, pjDel.id));
// Công việc
const task = await t('Tạo công việc giao cho nhân viên', () => rpc('apiSaveTask', gd, { duAnId: pj.id, tenCongViec: 'Việc NV', hangMuc: 'HM', uuTien: 'Trung bình', deadline: today, trangThai: 'Chưa bắt đầu', nguoiPhuTrachId: nvKey }));
const task2 = await t('Tạo công việc 2', () => rpc('apiSaveTask', gd, { duAnId: pj.id, tenCongViec: 'Việc 2', hangMuc: 'HM', uuTien: 'Cao', deadline: today, trangThai: 'Đang thực hiện', nguoiPhuTrachId: nv2Key }));
await t('Nhân viên chỉ thấy việc của mình', async () => { const b = await rpc('apiBootstrap', nv, true, []); const others = b.tasks.filter(x => x.nguoiPhuTrachId !== nvKey); if (others.length || !b.tasks.some(x => x.id === task.id)) throw new Error('thấy ' + others.length + ' việc của người khác'); });
await t('Nhân viên sửa việc người khác → bị chặn', () => rpc('apiSaveTask', nv, { id: task2.id, trangThai: 'Tạm hoãn' }), /quyền|chỉ|Chỉ/);
await t('Nhân viên đổi trạng thái việc mình', () => rpc('apiSaveTask', nv, { id: task.id, trangThai: 'Đang thực hiện' }));
await t('Thêm trạng thái', () => rpc('apiAddStatus', gd, 'Chờ khách ' + RUN));
await t('Giao hàng loạt', () => rpc('apiBulkAssign', gd, [task2.id], { uuTien: 'Gấp' }));
await t('Lịch sử công việc', () => rpc('apiTaskHistory', gd, task.id));
const adhoc = await t('Việc bổ sung (nhân viên tự tạo)', () => rpc('apiCreateAdhoc', nv, { duAnId: pj.id, tenCongViec: 'Việc đột xuất', deadline: today, ngayGiao: today }));
// Đầu việc
const sub = await t('Thêm đầu việc', () => rpc('apiSaveSubTask', nv, { id: '', congViecId: task.id, tenViecCon: 'Ý 1', moTa: '', ghiChu: '' }));
if (sub) await t('Xoá đầu việc', () => rpc('apiDeleteSubTask', nv, sub.id || sub));
// Giờ làm theo ngày
await t('Ghi giờ (nhân viên)', () => rpc('apiSaveDay', nv, { ngay: today, employeeKey: nvKey, items: [{ congViecId: task.id, soGio: 2, noiDung: 'Làm phần 1' }] }));
await t('Ghi giờ việc người khác → bị chặn', () => rpc('apiSaveDay', nv, { ngay: today, employeeKey: nvKey, items: [{ congViecId: task2.id, soGio: 1, noiDung: 'x' }] }), /./);
const pdReq = crypto.randomBytes(16).toString('hex');
const pdy = await t('Ghi giờ trực tiếp vào dự án', () => rpc('apiSaveProjectDay', nv, { ngay: today, duAnId: pj.id, tenViecTrucTiep: 'Họp khách', soGio: 1, noiDung: 'Họp', requestId: pdReq, employeeKey: nvKey }));
await t('Báo cáo ngày (ghi chú)', () => rpc('apiSaveDailyNote', nv, { employeeKey: nvKey, ngay: today, ghiChu: 'ok', noiDungBaoCao: 'Hôm nay làm…' }));
// Vướng mắc
const bl = await t('Báo vướng mắc', () => rpc('apiSaveBlocker', nv, { taskId: task.id, id: '', nguyenNhan: 'Chờ khách duyệt', nhomNguyenNhan: 'Chờ khách hàng', batDauCho: today + 'T09:00' }));
if (bl) { const id = bl.id || (Array.isArray(bl) ? bl[0]?.id : bl); await t('Đã tiếp tục', () => rpc('apiResumeBlocker', nv, id)); await t('Xoá vướng mắc', () => rpc('apiDeleteBlocker', nv, id)); }
await t('Bootstrap quản lý sau các thao tác', async () => { const b = await rpc('apiBootstrap', gd, true, []); return b.tasks.length; });
await t('Xoá công việc 2', () => rpc('apiDeleteTask', gd, task2.id));
await t('Đăng xuất', () => rpc('apiLogout', nv));
await t('Dùng phiên đã đăng xuất → bị chặn', () => rpc('apiBootstrap', nv, true, []), /Phiên|đăng nhập/);

console.log(results.join('\n'));
console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
const db = {}; for (const k of ['projects', 'tasks', 'days', 'subtasks', 'blockers', 'dailyReports', 'audit']) db[k] = await prisma['t_' + k].count();
console.log('Dòng trong PostgreSQL:', JSON.stringify(db));
await prisma.$disconnect();
