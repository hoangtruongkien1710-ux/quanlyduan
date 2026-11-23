// Kiểm thử Giai đoạn 3–6 qua HTTP (app đang chạy ở :3100). Chạy: node --env-file=.env tests/e2e-rest.mjs
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const B = 'http://localhost:3100/api/rpc/';
const prisma = new PrismaClient();
const hash = c => crypto.createHmac('sha256', process.env.APP_SECRET).update(c).digest('hex');
const mk = () => crypto.randomBytes(9).toString('base64url');
const RUN = Date.now().toString(36);
const people = {
  gd: { hoTen: 'GĐ Thử', chucVu: 'Giám đốc', phongBan: 'Ban giám đốc' },
  tl: { hoTen: 'Trợ lý Thử', chucVu: 'Trợ lý giám đốc', phongBan: 'Ban giám đốc' },
  acc: { hoTen: 'Account Thử', chucVu: 'Account', phongBan: 'Account' },
  sale: { hoTen: 'Sale Thử', chucVu: 'Sale', phongBan: 'Kinh doanh' },
  nv: { hoTen: 'Nhân viên Thử', chucVu: 'Designer', phongBan: 'Digital' },
};
await prisma.staff.deleteMany({ where: { nguon: 'test' } });
const codes = {}; let i = 10;
for (const [k, p] of Object.entries(people)) { codes[k] = mk(); await prisma.staff.create({ data: { ...p, maNV: 'T' + k.toUpperCase(), tinhTrang: 'Đang làm', codeHash: hash(codes[k]), nguon: 'test', pos: i++ } }); }

let pass = 0, fail = 0; const out = [];
async function rpc(n, ...a) {
  const r = await fetch(B + n, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  const j = await r.json(); if (j.error) throw new Error(j.error);
  return j.result && j.result.__patch ? j.result.value : j.result;
}
async function t(label, fn, expectErr) {
  try { const v = await fn(); if (expectErr) { fail++; out.push('✗ ' + label + ' — lẽ ra phải bị chặn'); } else { pass++; out.push('✓ ' + label); } return v; }
  catch (e) { if (expectErr && expectErr.test(e.message)) { pass++; out.push('✓ ' + label + ' (chặn: ' + e.message.slice(0, 50) + ')'); } else { fail++; out.push('✗ ' + label + ' — ' + e.message.slice(0, 160)); } }
}
const S = {};
for (const k of Object.keys(people)) { const r = await rpc('apiLogin', codes[k], true, true, []); S[k] = { tk: r.token, me: r.me }; }
const gd = S.gd.tk, tl = S.tl.tk, acc = S.acc.tk, sale = S.sale.tk, nv = S.nv.tk, nvKey = S.nv.me.key;
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const pj = await rpc('apiSaveProject', gd, { tenDuAn: 'DA GĐ3 ' + RUN });
const task = await rpc('apiSaveTask', gd, { duAnId: pj.id, tenCongViec: 'Viết bài ' + RUN, hangMuc: 'Nội dung', uuTien: 'Trung bình', deadline: today, trangThai: 'Chưa bắt đầu', nguoiPhuTrachId: nvKey });

// ---- Giai đoạn 3: Kết quả công việc
const boot = await rpc('apiBootstrap', gd, true, []);
const type = (boot.settings.productTypes || ['Ảnh'])[0];
await t('Thêm loại sản phẩm', () => rpc('apiAddProductTypes', gd, ['Bài viết ' + RUN]));
const key = crypto.randomBytes(16).toString('hex');
const saved = await t('Ghi kết quả (nhân viên)', () => rpc('apiSaveProducts', nv, [{ tenSanPham: 'Bài 1', loaiSanPham: type, soLuong: '1', links: 'https://example.com/1', tienDo: '50', congViecId: task.id }], null, '50', today, key));
await t('Ghi lại cùng mã yêu cầu → không tạo trùng', async () => { const again = await rpc('apiSaveProducts', nv, [{ tenSanPham: 'Bài 1', loaiSanPham: type, soLuong: '1', links: 'https://example.com/1', tienDo: '50', congViecId: task.id }], null, '50', today, key); if (again[0].id !== saved[0].id) throw new Error('tạo dòng mới'); });
await t('Nhân viên khác không ghi kết quả việc này', () => rpc('apiSaveProducts', acc === nv ? nv : sale, [{ tenSanPham: 'x', loaiSanPham: type, soLuong: '1', congViecId: task.id }], null, '', today, crypto.randomBytes(16).toString('hex')), /./);
await rpc('apiSaveDay', nv, { ngay: today, employeeKey: nvKey, items: [{ congViecId: task.id, soGio: 1, noiDung: 'Làm' }] });
const tAfter = (await rpc('apiBootstrap', gd, true, [])).tasks.find(x => x.id === task.id);
await t('Tự chuyển "Chưa bắt đầu" → đang làm khi ghi giờ', async () => { if (tAfter.trangThai === 'Chưa bắt đầu') throw new Error('vẫn Chưa bắt đầu'); });
if (saved) await t('Xoá kết quả', () => rpc('apiDeleteProduct', nv, saved[0].id));

// ---- Giờ làm: báo cáo ngày, gắn bản ghi dự án, xoá
const pd = await t('Ghi giờ trực tiếp vào dự án', () => rpc('apiSaveProjectDay', nv, { ngay: today, duAnId: pj.id, tenViecTrucTiep: 'Họp ' + RUN, soGio: 1, noiDung: 'Họp nội bộ', requestId: crypto.randomBytes(16).toString('hex'), employeeKey: nvKey }));
const pdRow = pd && (pd.row || pd.record || pd);
const days = (await rpc('apiBootstrap', gd, true, [])).days.filter(d => d.tenViecTrucTiep === 'Họp ' + RUN);
if (days[0]) {
  await t('Sửa nội dung / trạng thái trong Việc hôm nay', () => rpc('apiSaveDayReport', nv, { id: days[0].id, noiDung: 'Họp xong', trangThaiNgay: 'Hoàn thành' }));
  await t('Quản lý gắn bản ghi vào công việc', () => rpc('apiLinkProjectDay', gd, { id: days[0].id, create: false, congViecId: task.id }));
  await t('Xoá bản ghi giờ', () => rpc('apiDeleteDay', nv, days[0].id));
}

// ---- Giai đoạn 5: Báo cáo Account / Sale
const ka = await t('Báo cáo Account (Account ghi)', () => rpc('apiSaveKd', acc, 'kdAcc', { id: '', ngay: today, noiDung: 'Gặp khách ' + RUN, tienDo: '40', ghiChu: '' }));
await t('Nhân viên không ghi được Báo cáo Account', () => rpc('apiSaveKd', nv, 'kdAcc', { id: '', ngay: today, noiDung: 'x' }), /quyền/);
const ks = await t('Báo cáo Sale (Sale ghi)', () => rpc('apiSaveKd', sale, 'kdSale', { id: '', ngay: today, noiDung: 'Gọi khách ' + RUN, ghiChu: '' }));
if (ka) await t('GĐ nhận xét Báo cáo Account', () => rpc('apiKdComment', gd, 'kdAcc', ka.id, 'Tốt'));
if (ks) await t('Xoá Báo cáo Sale', () => rpc('apiDeleteKd', sale, 'kdSale', ks.id));
await t('Tải mục Báo cáo Account', () => rpc('apiLoadSection', gd, 'kdAcc'));
// Báo cáo Giám đốc
const boot2 = await rpc('apiLoadSection', tl, 'bgd');
const dept = (boot2.bgd && boot2.bgd.depts && boot2.bgd.depts[0]) || 'Digital';
const sub = await t('Trợ lý GĐ gửi báo cáo phòng ban (chưa có Telegram)', () => rpc('apiBgdSubmit', tl, [{ dept, text: 'Báo cáo ' + RUN }]));
await t('Nhân viên không gửi được', () => rpc('apiBgdSubmit', nv, [{ dept, text: 'x' }]), /Chỉ/);
const rep = (await rpc('apiLoadSection', gd, 'bgd')).bgd.rep.find(r => r.noiDung === 'Báo cáo ' + RUN);
if (rep) await t('GĐ đánh giá', () => rpc('apiBgdReview', gd, [{ id: rep.id, danhGia: 'Tốt', ghiChuGD: 'OK' }]));
await t('Trợ lý GĐ không đánh giá được', () => rpc('apiBgdReview', tl, [{ id: 'x', danhGia: 'Tốt' }]), /Chỉ/);
const meet = await t('Tạo cuộc họp + nhiệm vụ', () => rpc('apiBgdMeetCreate', tl, { meeting: { ngay: today, loai: 'Họp giao ban', tieuDe: 'Giao ban ' + RUN }, tasks: [{ noiDung: 'Chốt kế hoạch', nguoiPhuTrach: 'Nhân viên Thử' }] }));
const bt = (await rpc('apiLoadSection', tl, 'bgd')).bgd.task.find(x => x.cuocHopId === (meet && meet.id));
if (bt) {
  await t('Cập nhật nhiệm vụ (bắt buộc ghi nội dung)', () => rpc('apiBgdTaskUpdate', tl, { ...bt, tienDo: '50', trangThai: 'Đang thực hiện', expectedUpdatedAt: bt.updatedAt, updateMessage: 'Đã làm một nửa' }));
  await t('Lịch sử nhiệm vụ', async () => { const h = await rpc('apiBgdHistory', tl, bt.id); if (h.length < 2) throw new Error('lịch sử ' + h.length); });
}
await t('Thông tin Telegram (GĐ)', () => rpc('apiBgdTgInfo', gd));
await t('Lưu mã bot sai định dạng → bị chặn', () => rpc('apiBgdTgSave', gd, { token: 'abc' }), /./);

// ---- Giai đoạn 6: Đề xuất, Thiết lập
const prop = await t('Nhân viên đề xuất công việc mới', () => rpc('apiPropose', nv, 'DU_AN_CONG_VIEC', { duAnId: pj.id, tasks: [{ tenCongViec: 'Đề xuất ' + RUN }] }, 'Cần thêm'));
await t('Nhân viên đề xuất dự án mới → bị chặn', () => rpc('apiPropose', nv, 'DU_AN_MOI', { tenDuAn: 'X ' + RUN }, ''), /Chỉ Account/);
const props = (await rpc('apiBootstrap', gd, true, [])).proposals.filter(p => p.trangThai === 'Chờ duyệt');
if (props[0]) await t('GĐ duyệt đề xuất', () => rpc('apiReviewProposal', gd, props[0].id, true, '', null));
await t('Ngưỡng % hoàn thành', () => rpc('apiSaveReadyPct', gd, 80));
await t('Ngày làm việc trong tuần', () => rpc('apiSaveWorkDays', gd, [1, 2, 3, 4, 5, 6]));
const hol = await t('Thêm ngày nghỉ', () => rpc('apiSaveHoliday', gd, { id: '', tuNgay: '2026-12-31', denNgay: '2026-12-31', tenNgayNghi: 'Nghỉ thử ' + RUN, loai: 'Nghỉ' }));
await t('Thêm ngày lễ Việt Nam 2027', () => rpc('apiAddVnHolidays', gd, 2027));
await t('Thông tin dữ liệu demo (GĐ)', () => rpc('apiDemoInfo', gd));
await t('Thông tin làm trắng (GĐ)', () => rpc('apiWipeInfo', gd));
await t('Nhân viên không xem được mục Dữ liệu', () => rpc('apiWipeInfo', nv), /Chỉ/);

console.log(out.join('\n'));
console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
await prisma.$disconnect();
