// Tạo / cập nhật tài khoản quản trị đầu tiên từ biến môi trường (.env):
//   ADMIN_LOGIN_CODE  — mã đăng nhập (>= 6 ký tự), chỉ lưu dạng mã hoá
//   ADMIN_NAME        — tên hiển thị
// Chạy: npm run seed
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const code = String(process.env.ADMIN_LOGIN_CODE || '').trim().normalize('NFC');
const secret = process.env.APP_SECRET || '';
if (!secret) { console.error('Thiếu APP_SECRET trong file .env.'); process.exit(1); }
if (code.length < 6) {
  console.error('Chưa đặt ADMIN_LOGIN_CODE trong file .env (ít nhất 6 ký tự). Mở file .env, điền mã đăng nhập cho tài khoản quản trị rồi chạy lại: npm run seed');
  process.exit(1);
}
const prisma = new PrismaClient();
const codeHash = crypto.createHmac('sha256', secret).update(code).digest('hex');
const data = { hoTen: process.env.ADMIN_NAME || 'Quản trị SMEE', maNV: 'ADMIN', email: '', chucVu: 'Giám đốc', phongBan: 'Ban giám đốc', tinhTrang: 'Đang làm', codeHash, nguon: 'seed', pos: 0 };
const old = await prisma.staff.findFirst({ where: { nguon: 'seed', maNV: 'ADMIN' } });
if (old) await prisma.staff.update({ where: { id: old.id }, data });
else await prisma.staff.create({ data });
console.log((old ? 'Đã cập nhật' : 'Đã tạo') + ' tài khoản quản trị "' + data.hoTen + '" (Giám đốc). Đăng nhập bằng mã đã đặt trong .env.');
await prisma.$disconnect();
