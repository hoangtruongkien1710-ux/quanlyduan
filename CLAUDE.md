# CLAUDE.md — App "Quản lý dự án và công việc" (SMEE, Next.js)

Đọc file này trước. Bối cảnh, kế hoạch và nhật ký đầy đủ nằm ở `KH.md` (mục 10 = Nhật ký tiến độ). Chỉ đọc phần liên quan đến việc đang làm.

## Kiến trúc (quan trọng)
- Đây là bản chuyển từ app Apps Script sang **Next.js 15 + PostgreSQL 16 (Docker) + Prisma 6**, **giữ nguyên giao diện và logic**:
  - `legacy/Index.html`, `legacy/Styles.html`, `legacy/Scripts.html` = giao diện gốc. `app/route.ts` ghép thành trang chính và chèn lớp thay `google.script.run` → `POST /api/rpc/<hàm>`.
  - `legacy/Code.js` + `legacy/Config.js` = logic máy chủ gốc, chạy **nguyên văn** trong `lib/engine/engine.cjs`. Engine giả lập Google Sheet trong bộ nhớ và lưu các tab đã đổi xuống PostgreSQL sau mỗi lần gọi. Mỗi lần gọi có một ngữ cảnh vm mới; các lần gọi chạy tuần tự.
  - `lib/engine/sheet.cjs` = giả lập Sheet / Range. `lib/engine/overrides.js` = thay các hàm gắn với Google (đăng nhập bằng mã mã hoá, …).
  - `app/api/rpc/[fn]/route.ts` = điểm vào API (chỉ cho hàm `api*`; danh sách hàm đã bỏ nằm ở `REMOVED` trong engine.cjs).
  - `prisma/schema.prisma` **sinh tự động** từ `legacy/Config.js` (`npm run gen:schema`). Mỗi tab APP_* = 1 bảng (cột chữ + `rid`, `pos`), cộng thêm `Staff` và `AppProperty`.
- Nhân sự: **Google Sheet nhân sự là nguồn gốc**, đồng bộ về bảng `Staff` qua Web App Apps Script (`tools/dong-bo-nhan-su.gs`, `lib/staff-sync.cjs`): lúc khởi động (`instrumentation.ts`), 10 phút / lần và nút "Đồng bộ nhân sự". Mã đăng nhập chỉ lưu dạng HMAC (STAFF_HASH_KEY cho nhân sự từ Sheet, APP_SECRET cho tài khoản seed).
- Chỉ nhập Excel (đã bỏ nhập Google Sheet / Drive). Telegram: chưa bật (chờ nhập mã bot trong Thiết lập).

## Sửa ở đâu
- Sửa nghiệp vụ / giao diện: sửa trực tiếp `legacy/Code.js`, `legacy/Scripts.html`, `legacy/Styles.html`. Ở chế độ dev, engine tự biên dịch lại khi file đổi.
  - Các file này rất lớn, viết dồn dòng dài: **tìm bằng grep theo tên hàm / chuỗi đặc trưng rồi chỉ đọc đoạn quanh đó**, đừng đọc cả file.
  - Trong `legacy/Scripts.html` (JS nội tuyến) **không viết `//` thô trong chuỗi / URL**: dùng `'https:'+'\/\/…'` (quy ước cũ của Apps Script).
- Thêm cột mới cho một tab: thêm vào `CFG.FIELDS` trong `legacy/Config.js` → `npm run gen:schema` → `npx prisma migrate dev --name <tên>`.
- Không sửa dự án Apps Script cũ (`D:\WEBSITE SMEE\APPSCRIPT_SMEE\App_quan_ly_du_an_SMEE`): app đó vẫn đang chạy riêng.

## Chạy và kiểm thử
- Máy Windows. PowerShell chặn `npm.ps1`, nên dùng **`npm.cmd`** (hoặc Command Prompt). Cổng app: **3100** (3000 bị WSL chiếm). PostgreSQL: 5432, container `smee_qlda_db`.
- Chạy: `docker compose --env-file .env up -d` → `npm.cmd run dev` → http://localhost:3100.
- `.env` (không commit): DATABASE_URL, APP_SECRET, ADMIN_LOGIN_CODE (seed), STAFF_SYNC_URL / STAFF_SYNC_KEY / STAFF_HASH_KEY. **Không in giá trị bí mật, mã đăng nhập, dữ liệu nhân sự / lương.**
- Test e2e (gọi API thật, tự tạo nhân sự thử `nguon='test'`): `node --env-file=.env tests/e2e-phase2.mjs` (31 bài), `node --env-file=.env tests/e2e-rest.mjs` (35 bài).
  - **Không chạy test vào database thật đang dùng.** Làm như sau: tạo DB `smee_test` trong container, `DATABASE_URL=<…/smee_test> npx prisma migrate deploy`, chạy `next dev -p 3101` với `NEXT_DIST_DIR=.next-test` và `DATABASE_URL` trỏ tới smee_test, đổi `B` trong file test sang cổng 3101. Xong thì xoá DB thử.
  - Giả lập Web App nhân sự: `tests/mock-staff-webapp.mjs` (cổng 3199, dữ liệu giả).
- Nếu cổng 3100 đang bận: kiểm tra trước là ai đang dùng. Thường là app anh/chị đang chạy, **không tắt máy chủ của người dùng**.

## Quy ước làm việc
- Giao diện và thông báo bằng tiếng Việt. Giữ nguyên phân quyền: nhân viên chỉ thấy / sửa dữ liệu của mình; quản lý = Giám đốc, Trợ lý GĐ, Account; máy chủ luôn kiểm tra quyền.
- Mỗi bước xong: commit git (tiếng Việt không dấu), **ghi thêm 1 dòng vào mục "Nhật ký tiến độ" của KH.md**, đánh dấu ô `[x]` tương ứng.
- Báo cáo ngắn gọn; không chụp màn hình nếu đọc chữ là đủ.
- Việc còn mở (xem KH.md mục 9): nơi chạy chính thức (VPS / Docker), Dockerfile + sao lưu DB hằng ngày, bật Telegram, tách dần `legacy/Scripts.html` / `Code.js` theo từng màn.
