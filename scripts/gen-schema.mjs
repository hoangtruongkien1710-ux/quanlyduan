// Sinh prisma/schema.prisma từ legacy/Config.js (CFG.TABLES + CFG.FIELDS).
// Mỗi tab APP_* thành một bảng; mọi cột là chữ (giống Google Sheet); thêm rid (khoá) và pos (thứ tự dòng).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'legacy', 'Config.js'), 'utf8').replace('const CFG', 'var CFG'), ctx);
const { TABLES, FIELDS } = ctx.CFG;

export const modelName = key => 'T_' + key;

let out = `// TỰ SINH bởi scripts/gen-schema.mjs — không sửa tay. Chạy: npm run gen:schema
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// Nhân sự — bản đồng bộ từ Google Sheet nhân sự (mã đăng nhập chỉ lưu dạng mã hoá).
model Staff {
  id        String   @id @default(cuid())
  maNV      String   @default("")
  hoTen     String
  email     String   @default("")
  chucVu    String   @default("")
  phongBan  String   @default("")
  tinhTrang String   @default("")
  codeHash  String   @default("")
  pos       Int      @default(0)
  nguon     String   @default("sheet") // sheet | seed
  updatedAt DateTime @updatedAt
  @@index([codeHash])
}

/// Thay cho Script Properties của Apps Script (Telegram, khoá làm trắng…).
model AppProperty {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
`;
for (const key of Object.keys(TABLES)) {
  const fields = FIELDS[key] || [];
  out += `\n/// Tab ${TABLES[key]}\nmodel ${modelName(key)} {\n  rid Int @id @default(autoincrement())\n  pos Int @default(0)\n`;
  for (const f of fields) out += `  ${f} String @default("")\n`;
  out += `  @@index([pos])\n  @@map("${TABLES[key].toLowerCase()}")\n}\n`;
}
fs.mkdirSync(path.join(root, 'prisma'), { recursive: true });
fs.writeFileSync(path.join(root, 'prisma', 'schema.prisma'), out);
console.log('Đã sinh prisma/schema.prisma:', Object.keys(TABLES).length, 'bảng + Staff + AppProperty');
