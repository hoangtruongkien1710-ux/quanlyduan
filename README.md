# Quản lý dự án và công việc — SMEE (Next.js + PostgreSQL)

Bản chạy trên máy chủ riêng của app Quản lý dự án SMEE. Giao diện và tính năng giữ nguyên như bản Apps Script; dữ liệu lưu ở PostgreSQL. Kế hoạch chi tiết: xem `KH.md`.

## Yêu cầu
- Docker Desktop đang chạy
- Node.js 20 trở lên

## Chạy trên máy (lần đầu)
1. Tạo file cấu hình: sao chép `.env.example` thành `.env` (nếu chưa có) và điền:
   - `POSTGRES_PASSWORD`, `DATABASE_URL` (cùng mật khẩu), `APP_SECRET` (chuỗi ngẫu nhiên dài)
   - **`ADMIN_LOGIN_CODE`**: mã đăng nhập cho tài khoản quản trị đầu tiên (ít nhất 6 ký tự, không dấu)
2. Bật database:
   ```
   docker compose --env-file .env up -d
   ```
3. Cài thư viện và tạo bảng:
   ```
   npm install
   npx prisma migrate dev
   ```
4. Tạo tài khoản quản trị (dùng `ADMIN_LOGIN_CODE` trong `.env`):
   ```
   npm run seed
   ```
   Nếu `ADMIN_LOGIN_CODE` còn trống, lệnh sẽ báo và dừng.
5. Chạy app:
   ```
   npm run dev
   ```
   Mở **http://localhost:3100** và đăng nhập bằng mã đã đặt.

## Các lần sau
```
docker compose --env-file .env up -d
npm run dev
```

## Nhân sự
- Nguồn gốc vẫn là **Google Sheet nhân sự** hiện tại. App đồng bộ về bảng `Staff` lúc khởi động và khoảng 10 phút / lần.
- Cần service account Google: điền `GOOGLE_SERVICE_ACCOUNT_EMAIL` và `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` vào `.env`, rồi chia sẻ sheet nhân sự cho email đó với quyền **Người xem**.
- Chưa cấu hình thì app vẫn chạy với tài khoản tạo bằng `npm run seed` (console in một dòng nhắc).
- App chỉ đọc các cột cần dùng, không đọc cột lương; mã đăng nhập chỉ lưu dạng mã hoá.

## Cấu trúc
- `legacy/` — giao diện + logic lấy nguyên từ app Apps Script (nguồn: xem `legacy/NGUON.txt`)
- `lib/engine/` — lớp tương thích Apps Script (Google Sheet trong bộ nhớ ↔ PostgreSQL, cache, properties, Telegram)
- `app/route.ts` — trang chính; `app/api/rpc/[fn]/route.ts` — gọi hàm máy chủ theo tên
- `prisma/schema.prisma` — sinh bằng `npm run gen:schema` từ `legacy/Config.js`
- Ghi log từng lần gọi: chạy với `SMEE_LOG=1`
