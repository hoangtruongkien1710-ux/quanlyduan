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

## Quy trình (local → GitHub → VPS)
- Kho code: https://github.com/hoangtruongkien1710-ux/quanlyduan.git (nhánh main). App chính thức đang chạy trên **VPS** của anh/chị.
- Sửa và kiểm tra ở **local** trước: `npm.cmd run dev` → http://localhost:3100 (database local riêng, không đụng dữ liệu VPS).
- Xong thì commit ở local. **Anh/chị tự push** lên GitHub và tự cập nhật VPS (Claude không push, không đụng VPS nếu chưa được yêu cầu).
- Trên VPS: kéo code mới, `npm install` (khi đổi thư viện), **`npx prisma migrate deploy`** (khi có migration mới), build và khởi động lại app.
- VPS có file **.env riêng**: không bao giờ commit .env (local hay VPS).

## Lưu ý kỹ thuật kế thừa từ bản Apps Script
- Bảng luôn đọc / ghi **theo tên cột** (`list_`, `append_`, `update_` với `BY_HEADER_`), không theo vị trí cột.
- Ngày giờ được chuẩn hoá thành chữ `yyyy-MM-dd` / `yyyy-MM-ddTHH:mm` (`normDt_`, `DT_FIELDS_` trong Code.js). Giữ đúng định dạng này khi ghi.
- Với thay đổi nhỏ: chỉ chạy bài test liên quan (hoặc gọi đúng API đó), không chạy lại toàn bộ.

## Đồng bộ nhân sự (Apps Script)
- File `dongbonhansu.gs` (nội dung = `tools/dong-bo-nhan-su.gs`) nằm trong dự án Apps Script của Sheet nhân sự, cạnh `Mã.gs` (nhắc chấm công Telegram). **Không đụng Mã.gs.** Sửa .gs thì phải Triển khai → Quản lý bản triển khai → Phiên bản mới.
- `.env` cần STAFF_SYNC_URL / STAFF_SYNC_KEY / STAFF_HASH_KEY. **Không đọc giá trị Sheet nhân sự** ngoài các cột app dùng.

## Quyết định đã chốt
- Chỉ nhập Excel (có "Tải file mẫu Excel"); không nhập từ Google Sheet / Drive.
- Telegram để sau (chưa cấu hình mã bot).
- Tên gọi giao diện: "Đầu việc", "Việc bổ sung", menu "Báo cáo Account" (không phải "BC Account & Sale"); bộ lọc Phòng ban → Nhân viên.
- Phân quyền: nhân viên chỉ thấy việc mình phụ trách; chỉ Account / Trợ lý GĐ / Giám đốc được tạo dự án mới; Báo cáo Giám đốc: nhập = Tổng GĐ / GĐ / Trợ lý GĐ, đánh giá = Tổng GĐ / GĐ.

## Bảo mật
- Không in / commit: `.env`, khoá Google (`google-key.json`, `google-service-account.json`), SYNC_KEY / HASH_KEY, mã đăng nhập, cột lương / Password / số điện thoại của Sheet nhân sự.
- Hỏi trước khi làm thao tác không hoàn tác được: Làm trắng dữ liệu, xoá dữ liệu demo, xoá database, tắt máy chủ người dùng đang chạy.
- Không triển khai / đẩy code ra ngoài (server, GitHub) khi chưa được yêu cầu.

## Quy ước làm việc
- Đầu phiên: đọc CLAUDE.md + mục Nhật ký tiến độ cuối của KH.md. Trả lời bằng tiếng Việt.
- Giao diện và thông báo bằng tiếng Việt. Giữ nguyên phân quyền: nhân viên chỉ thấy / sửa dữ liệu của mình; quản lý = Giám đốc, Trợ lý GĐ, Account; máy chủ luôn kiểm tra quyền.
- Mỗi bước xong: commit git (tiếng Việt không dấu), **ghi thêm 1 dòng vào mục "Nhật ký tiến độ" của KH.md**, đánh dấu ô `[x]` tương ứng.
- Báo cáo ngắn gọn; không chụp màn hình nếu đọc chữ là đủ.
- Việc còn mở (xem KH.md mục 9): nơi chạy chính thức (VPS / Docker), Dockerfile + sao lưu DB hằng ngày, bật Telegram, tách dần `legacy/Scripts.html` / `Code.js` theo từng màn.
