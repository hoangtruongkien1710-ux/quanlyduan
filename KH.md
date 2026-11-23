# KẾ HOẠCH CHUYỂN APP QUẢN LÝ DỰ ÁN SMEE SANG NEXT.JS + POSTGRESQL

## 1. Mục tiêu
- Giữ nguyên **giao diện** và **tính năng** của app Apps Script hiện tại (BUILD 7.8.3): menu, màn hình, popup, phân quyền, báo cáo, Excel, Telegram.
- Nhanh hơn rõ rệt: đăng nhập, lưu, mở báo cáo dưới khoảng 1 giây.
- Dữ liệu lưu ở PostgreSQL, không còn phụ thuộc Google Sheets.
- Không chuyển dữ liệu cũ, vì Sheet đã xóa trắng. App mới bắt đầu với dữ liệu trống.
- Làm trên máy local với Docker trước, chưa triển khai lên mạng.

## 2. Công nghệ
| Thành phần | Lựa chọn |
|---|---|
| Web + API | Next.js 15 (App Router, TypeScript), chạy Node.js |
| Database | PostgreSQL 16 (Docker, volume riêng) |
| Truy cập dữ liệu | Prisma 6 |
| Giao diện | Giữ Index.html / Styles.html / Scripts.html hiện có |
| Đăng nhập | Mã đăng nhập mã hóa (scrypt) trong bảng Staff, phiên đăng nhập phía máy chủ |

## 3. Cách giữ nguyên giao diện và tính năng
1. **Giao diện**: dùng lại nguyên 3 file Index / Styles / Scripts. Trình duyệt gọi `google.script.run.apiXxx(...)` như cũ. Một lớp nhỏ trong trình duyệt chuyển lời gọi này thành `POST /api/rpc/apiXxx`.
2. **Máy chủ**: dùng lại nguyên logic Code.js / Config.js, chạy trên Node qua một lớp tương thích Apps Script:
   - `SpreadsheetApp`: các "tab" là bảng dữ liệu trong bộ nhớ, nạp từ PostgreSQL khi máy chủ khởi động.
   - Sau mỗi lần gọi có ghi dữ liệu, các bảng đã đổi được lưu xuống PostgreSQL qua Prisma, trong một transaction.
   - `CacheService`, `LockService` (hàng đợi tuần tự), `PropertiesService` (bảng AppProperty), `Utilities`, `UrlFetchApp` (Telegram).
   - Sheet nhân sự được thay bằng bảng **Staff**.
3. Nhờ vậy, mọi quy tắc nghiệp vụ và phân quyền giữ đúng như bản đang chạy. Sau này có thể viết lại từng phần sang Prisma thuần nếu cần.

## 4. Cấu trúc thư mục
Thư mục dự án: `D:\WEBSITE SMEE\WEB NỘI BỘ\Quản lý dự án và công việc`
```
Quản lý dự án và công việc/
  docker-compose.yml        # postgres:16
  .env.example              # DATABASE_URL, ADMIN_LOGIN_CODE (không có giá trị thật)
  prisma/schema.prisma      # sinh tự động từ CFG.FIELDS + bảng Staff, AppProperty
  legacy/                   # bản sao Code.js, Config.js, Index/Styles/Scripts.html (nguồn từ Apps Script)
  lib/engine/               # lớp tương thích Apps Script (sheet trong bộ nhớ, cache, lock, properties…)
  app/route.ts              # trả trang HTML (Index + Styles + Scripts + shim)
  app/api/rpc/[fn]/route.ts # gọi hàm máy chủ theo tên
  scripts/gen-schema.mjs    # sinh schema.prisma từ Config.js
  scripts/seed.mjs          # tạo tài khoản quản trị từ biến môi trường
  KH.md, README.md
```

## 5. Bảng dữ liệu (Prisma)
Mỗi tab APP_* là một bảng. Mọi cột đều kiểu chữ, giống Sheet. Mỗi bảng có thêm `pos` để giữ thứ tự dòng.

| Khóa | Tab cũ | Bảng Prisma | Số cột |
|---|---|---|---|
| projects | APP_DU_AN | DuAn | 6 |
| tasks | APP_CONG_VIEC | CongViec | 40 |
| time | APP_LICH_GIO | LichGio | 14 |
| blockers | APP_VUONG_MAC | VuongMac | 22 |
| audit | APP_NHAT_KY | NhatKy | 7 |
| config | APP_CAU_HINH | CauHinh | 2 |
| holidays | APP_NGAY_NGHI | NgayNghi | 7 |
| subtasks | APP_VIEC_CON | ViecCon (đầu việc) | 10 |
| products | APP_SAN_PHAM | SanPham (kết quả công việc) | 23 |
| dailyReports | APP_BAO_CAO_NGAY | BaoCaoNgay | 7 |
| proposals | APP_DE_XUAT | DeXuat | 16 |
| days | APP_GIO_LAM_NGAY | GioLamNgay | 15 |
| kdAcc | APP_BC_ACCOUNT | BcAccount | 13 |
| kdSale | APP_BC_SALE | BcSale | 9 |
| bgdRep | APP_BC_GIAM_DOC | BcGiamDoc | 12 |
| bgdMeet | APP_CUOC_HOP | CuocHop | 14 |
| bgdTask | APP_NHIEM_VU_HOP | NhiemVuHop | 20 |
| bgdHist | APP_LS_NHIEM_VU_HOP | LsNhiemVuHop | 11 |
| — | Sheet nhân sự | **Staff** (họ tên, mã NV, email, chức vụ, phòng ban, tình trạng, mã đăng nhập đã mã hóa) | — |
| — | Script Properties | **AppProperty** (Telegram, khóa làm trắng…) | — |

Kế hoạch định kỳ nằm trong các cột của CongViec, như bản hiện tại.

## 6. Phân quyền (giữ nguyên)
- **Quản lý**: Giám đốc, Trợ lý GĐ, Account, admin. Xem và sửa toàn bộ.
- **Nhân viên**: chỉ thấy và sửa dữ liệu của mình. Máy chủ kiểm tra ở từng hàm.
- **Ban Giám đốc** (Báo cáo Giám đốc): Tổng GĐ / GĐ / Trợ lý GĐ được nhập; Tổng GĐ / GĐ được đánh giá.
- **Báo cáo Account / Sale**: theo vai trò, như hiện tại.
- Mã đăng nhập không bao giờ gửi về trình duyệt và không ghi ra log.

## 7. Các giai đoạn (69 hàm máy chủ)
### Giai đoạn 1 — Nền tảng, đăng nhập, menu
- [ ] Docker PostgreSQL 16, Prisma schema, migrate
- [ ] Lớp tương thích Apps Script (sheet trong bộ nhớ ↔ PostgreSQL, cache, lock, properties)
- [ ] Trang HTML giữ nguyên giao diện + shim google.script.run → /api/rpc
- [ ] Bảng Staff + seed tài khoản quản trị (mã lấy từ biến môi trường)
- [ ] apiKiemTraKetNoi, apiLogin, apiLogout, apiBootstrap, apiLoadSection
- [ ] Hiện màn đăng nhập → vào app thấy menu và Tổng quan

### Giai đoạn 2 — Dự án, Công việc, Việc bổ sung, Giờ làm, Vướng mắc
- [ ] apiSaveProject, apiDeleteProject
- [ ] apiSaveTask, apiDeleteTask, apiBulkAssign, apiTaskHistory, apiAddStatus, apiReassignTasks, apiCreateAdhoc
- [ ] apiSaveSubTask, apiDeleteSubTask
- [ ] apiSaveTime, apiDeleteTime, apiConfirmPlans, apiApproveTime
- [ ] apiSaveDay, apiSaveDayReport, apiSaveProjectDay, apiLinkProjectDay, apiDeleteDay, apiSaveDailyNote
- [ ] apiSaveBlocker, apiResumeBlocker, apiDeleteBlocker

### Giai đoạn 3 — Kết quả công việc
- [ ] apiSaveProducts, apiDeleteProduct, apiSaveProductTypes, apiAddProductTypes

### Giai đoạn 4 — Kế hoạch dự án, Phân tích chậm trễ, Báo cáo
- [ ] Kiểm tra các màn chỉ đọc dữ liệu (Kế hoạch dự án, Phân tích chậm trễ, Báo cáo dự án, Báo cáo ngày)

### Giai đoạn 5 — Báo cáo Account / Sale, Báo cáo Giám đốc, Telegram
- [ ] apiSaveKd, apiDeleteKd, apiKdComment
- [ ] apiBgdSubmit, apiBgdReview, apiBgdMeetCreate, apiBgdMeetUpdate, apiBgdTaskCreate, apiBgdTaskUpdate, apiBgdTaskDelete, apiBgdMeetDelete, apiBgdHistory
- [ ] apiBgdTgInfo, apiBgdTgSave, apiBgdTgTest (Telegram qua UrlFetchApp tương thích)

### Giai đoạn 6 — Đề xuất, Nhân sự, Thiết lập, Nhập / xuất Excel
- [ ] apiPropose, apiSaveProposal, apiReviewProposal
- [ ] apiSaveReadyPct, apiSaveWorkDays, apiSaveHoliday, apiDeleteHoliday, apiAddVnHolidays
- [ ] apiDemoInfo, apiDemoDelete, apiWipeInfo, apiWipeAll (sao lưu = bản chụp JSON trong database), apiCleanColumns (không cần, bỏ)
- [ ] apiImportRows (Excel); apiGsheetTabs, apiGsheetPreview, apiImportGsheet, apiImportOwner, apiImportHistory, apiImportFromSource, apiTaoFileMau (phụ thuộc Google, cần quyết định: bỏ hoặc thay)
- [ ] Màn quản lý nhân sự mới (thêm / sửa nhân sự, đặt mã đăng nhập), vì không còn sheet nhân sự

### Giai đoạn 7 — Kiểm thử, triển khai
- [ ] Test từng vai trò (Giám đốc, Trợ lý GĐ, Account, Sale, nhân viên)
- [ ] Đo tốc độ
- [ ] Dockerfile cho app, sao lưu database hằng ngày
- [ ] Triển khai (sau khi chốt hosting)

## 8. Chạy trên máy local
```
docker compose up -d
npm install
npx prisma migrate dev
npm run seed      # cần đặt ADMIN_LOGIN_CODE trong .env
npm run dev       # mở http://localhost:3100
```

## 9. Rủi ro và quyết định còn mở
- **Hosting**: Vercel + Neon/Supabase, hay máy chủ / VPS riêng chạy Docker? Lớp tương thích giữ dữ liệu trong bộ nhớ, nên hợp với **một máy chủ chạy liên tục** (VPS / Docker). Nếu dùng Vercel (serverless) sẽ cần đổi cách làm.
- **Tên miền** (ví dụ app.smee.vn) và HTTPS.
- **Nhân sự**: quản lý trong app mới (bảng Staff), không đọc sheet lương nữa.
- **Các tính năng gắn với Google** (nhập từ Google Sheet, tạo file mẫu trên Drive, sao lưu sang Drive): bỏ hoặc thay bằng nhập Excel / sao lưu trong database.
- **Telegram**: mã bot nhập lại trong Thiết lập, không chép từ code cũ.

## 10. Nhật ký tiến độ
- 23/11/2026: Kiểm tra môi trường: Docker 29.8, Compose 5.5, Node 26, npm 11. Tạo thư mục SMEE_NEXT, cài Next.js 15.5.4, Prisma 6.16.2. Viết KH.md.
- 23/11/2026: Theo yêu cầu, chuyển thư mục vào `D:\WEBSITE SMEE\WEB NỘI BỘ` và đổi tên thành **Quản lý dự án và công việc** (giữ lịch sử git). Đang chờ duyệt kế hoạch trước khi làm Giai đoạn 1.
- 23/11/2026: Cổng 3000 trên máy đã bị chương trình khác dùng → app chạy ở **cổng 3100** (http://localhost:3100). PostgreSQL dùng cổng 5432 (đang trống).
