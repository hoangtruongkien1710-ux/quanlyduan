# KẾ HOẠCH CHUYỂN APP QUẢN LÝ DỰ ÁN SMEE SANG NEXT.JS + POSTGRESQL

## 1. Mục tiêu
- Giữ nguyên **giao diện** và **tính năng** của app Apps Script hiện tại (BUILD 7.8.3): menu, màn hình, popup, phân quyền, báo cáo, Excel, Telegram.
- Nhanh hơn rõ rệt: đăng nhập, lưu, mở báo cáo dưới khoảng 1 giây.
- Dữ liệu công việc lưu ở PostgreSQL, không còn phụ thuộc Google Sheets. Riêng **danh sách nhân sự vẫn lấy từ Google Sheet nhân sự hiện có** (nguồn gốc), đồng bộ về app.
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
   - Nhân sự: app đồng bộ từ Google Sheet nhân sự về bảng **Staff** (xem mục 5a). Đăng nhập dùng bản trong database nên nhanh.
3. Nhờ vậy, mọi quy tắc nghiệp vụ và phân quyền giữ đúng như bản đang chạy. Sau này có thể viết lại từng phần sang Prisma thuần nếu cần.

## 4. Cấu trúc thư mục
Thư mục dự án: `D:\WEBSITE SMEE\WEB NỘI BỘ\Quản lý dự án và công việc`
```
Quản lý dự án và công việc/
  docker-compose.yml        # postgres:16
  .env.example              # DATABASE_URL, ADMIN_LOGIN_CODE, khóa service account Google (không có giá trị thật)
  prisma/schema.prisma      # sinh tự động từ CFG.FIELDS + bảng Staff, AppProperty
  legacy/                   # bản sao Code.js, Config.js, Index/Styles/Scripts.html (nguồn từ Apps Script)
  lib/engine/               # lớp tương thích Apps Script (sheet trong bộ nhớ, cache, lock, properties…)
  app/route.ts              # trả trang HTML (Index + Styles + Scripts + shim)
  app/api/rpc/[fn]/route.ts # gọi hàm máy chủ theo tên
  scripts/gen-schema.mjs    # sinh schema.prisma từ Config.js
  scripts/seed.mjs          # tạo tài khoản quản trị từ biến môi trường
  lib/staff-sync.ts         # đồng bộ Google Sheet nhân sự → bảng Staff
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
| — | Google Sheet nhân sự (giữ làm nguồn gốc) | **Staff** — bản đồng bộ / bộ đệm (họ tên, mã NV, email, chức vụ, phòng ban, tình trạng, mã đăng nhập đã mã hóa) | — |
| — | Script Properties | **AppProperty** (Telegram, khóa làm trắng…) | — |

Kế hoạch định kỳ nằm trong các cột của CongViec, như bản hiện tại.

### 5a. Nhân sự — đồng bộ từ Google Sheet (đã chốt)
- **Nguồn gốc giữ nguyên**: Google Sheet nhân sự hiện tại (tab nhân viên). Thêm / sửa / cho nghỉ nhân viên vẫn làm trên Sheet đó như bây giờ.
- **Cách lấy**: app gọi Google Sheets API bằng một **tài khoản dịch vụ (service account)** của Google Cloud. Anh/chị chia sẻ sheet nhân sự cho email của tài khoản này với quyền **Người xem**. Khóa của tài khoản đặt trong file `.env`, không đưa lên git.
- **Khi nào đồng bộ**: lúc máy chủ khởi động, tự động khoảng **10 phút / lần**, và khi bấm nút **"Đồng bộ nhân sự"** (màn Nhân sự / Thiết lập). Nhân viên mới thêm trên Sheet sẽ đăng nhập được sau lần đồng bộ kế tiếp.
- **Chỉ đọc các cột app dùng, tìm theo tên cột**: họ tên, mã NV, email, chức vụ, phòng ban, tình trạng làm việc, cột mã đăng nhập ("Pass App Dự án"). **Không bao giờ đọc hay lưu các cột lương.**
- **Mã đăng nhập** được mã hóa (scrypt) ngay khi đồng bộ. Mã gốc không lưu vào database, không ghi ra log, không gửi về trình duyệt.
- App **chỉ đọc**, không ghi gì vào sheet nhân sự.

## 6. Phân quyền (giữ nguyên)
- **Quản lý**: Giám đốc, Trợ lý GĐ, Account, admin. Xem và sửa toàn bộ.
- **Nhân viên**: chỉ thấy và sửa dữ liệu của mình. Máy chủ kiểm tra ở từng hàm.
- **Ban Giám đốc** (Báo cáo Giám đốc): Tổng GĐ / GĐ / Trợ lý GĐ được nhập; Tổng GĐ / GĐ được đánh giá.
- **Báo cáo Account / Sale**: theo vai trò, như hiện tại.
- Mã đăng nhập không bao giờ gửi về trình duyệt và không ghi ra log.

## 7. Các giai đoạn (69 hàm máy chủ)
### Giai đoạn 1 — Nền tảng, đăng nhập, menu
- [x] Docker PostgreSQL 16, Prisma schema, migrate
- [x] Lớp tương thích Apps Script (sheet trong bộ nhớ ↔ PostgreSQL, cache, lock, properties)
- [x] Trang HTML giữ nguyên giao diện + shim google.script.run → /api/rpc
- [x] Bảng Staff + seed tài khoản quản trị (mã lấy từ biến môi trường) để chạy thử khi chưa nối Google Sheet nhân sự
- [ ] Hướng dẫn anh/chị tạo service account Google Cloud + chia sẻ sheet nhân sự (quyền Người xem)
- [x] Đồng bộ nhân sự (đang chạy thật qua Web App Apps Script): Google Sheets API → bảng Staff (khi khởi động, 10 phút / lần, nút "Đồng bộ nhân sự"), mã hóa mã đăng nhập
- [x] apiKiemTraKetNoi, apiLogin, apiLogout, apiBootstrap, apiLoadSection
- [x] Hiện màn đăng nhập → vào app thấy menu và Tổng quan

### Giai đoạn 2 — Dự án, Công việc, Việc bổ sung, Giờ làm, Vướng mắc
- [x] apiSaveProject, apiDeleteProject
- [x] apiSaveTask, apiDeleteTask, apiBulkAssign, apiTaskHistory, apiAddStatus, apiReassignTasks, apiCreateAdhoc
- [x] apiSaveSubTask, apiDeleteSubTask
- [x] apiSaveTime, apiDeleteTime, apiConfirmPlans, apiApproveTime
- [x] apiSaveDay, apiSaveDayReport, apiSaveProjectDay, apiLinkProjectDay, apiDeleteDay, apiSaveDailyNote
- [x] apiSaveBlocker, apiResumeBlocker, apiDeleteBlocker

### Giai đoạn 3 — Kết quả công việc
- [x] apiSaveProducts, apiDeleteProduct, apiSaveProductTypes, apiAddProductTypes

### Giai đoạn 4 — Kế hoạch dự án, Phân tích chậm trễ, Báo cáo
- [x] Kiểm tra các màn chỉ đọc dữ liệu (Kế hoạch dự án, Phân tích chậm trễ, Báo cáo dự án, Báo cáo ngày)

### Giai đoạn 5 — Báo cáo Account / Sale, Báo cáo Giám đốc, Telegram
- [x] apiSaveKd, apiDeleteKd, apiKdComment
- [x] apiBgdSubmit, apiBgdReview, apiBgdMeetCreate, apiBgdMeetUpdate, apiBgdTaskCreate, apiBgdTaskUpdate, apiBgdTaskDelete, apiBgdMeetDelete, apiBgdHistory
- [x] apiBgdTgInfo, apiBgdTgSave, apiBgdTgTest (Telegram qua UrlFetchApp tương thích) — chờ nhập mã bot để gửi thử thật

### Giai đoạn 6 — Đề xuất, Nhân sự, Thiết lập, Nhập / xuất Excel
- [x] apiPropose, apiSaveProposal, apiReviewProposal
- [x] apiSaveReadyPct, apiSaveWorkDays, apiSaveHoliday, apiDeleteHoliday, apiAddVnHolidays
- [x] apiDemoInfo, apiDemoDelete, apiWipeInfo, apiWipeAll (sao lưu = bản chụp JSON trong database), apiCleanColumns (không cần, bỏ)
- [x] **Chỉ nhập Excel** (đã chốt): apiImportRows chạy được; nút "Tải file mẫu Excel" tạo file .xlsx ngay trên trình duyệt. Đã bỏ khỏi giao diện và chặn ở máy chủ: nhập từ Google Sheet (apiGsheetTabs, apiGsheetPreview, apiImportGsheet, apiImportHistory, apiImportOwner), đồng bộ Google Sheet nguồn (apiImportFromSource), file mẫu trên Drive (apiTaoFileMau), dọn cột thừa (apiCleanColumns).

### Giai đoạn 7 — Kiểm thử, triển khai
- [x] Test từng vai trò (Giám đốc, Trợ lý GĐ, Account, Sale, nhân viên) — tests/e2e-phase2.mjs, tests/e2e-rest.mjs
- [x] Đo tốc độ (trên máy: đăng nhập ~50 ms, lưu ~20 ms, tải dữ liệu ~10 ms)
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
- **Service account Google Cloud** (cần anh/chị làm, tôi sẽ hướng dẫn từng bước ở Giai đoạn 1): tạo dự án Google Cloud, bật Google Sheets API, tạo service account và tải khóa JSON, chia sẻ sheet nhân sự cho email service account với quyền Người xem.
- **Nhân sự** (đã chốt): giữ Google Sheet nhân sự làm nguồn gốc, đồng bộ về bảng Staff (mục 5a). Nhân viên mới hoặc thay đổi trên Sheet có hiệu lực sau tối đa khoảng 10 phút, hoặc ngay khi bấm "Đồng bộ nhân sự".
- **Các tính năng gắn với Google** (đã chốt): chỉ nhập Excel; file mẫu Excel tạo trên trình duyệt; sao lưu khi làm trắng là bản chụp trong database.
- **Telegram**: mã bot nhập lại trong Thiết lập, không chép từ code cũ.

## 9a. Cách làm việc tiết kiệm (token)
- Mỗi việc lớn mở **cuộc trò chuyện mới**, bắt đầu bằng: "Đọc CLAUDE.md và KH.md (Nhật ký cuối) rồi làm …".
- Gom nhiều yêu cầu nhỏ vào **một tin nhắn**; nêu rõ màn hình / nút / kết quả mong muốn.
- Gửi **chữ** (đoạn lỗi, tên nút) thay vì ảnh khi có thể.
- Việc đơn giản (đổi chữ, nhãn, màu) dùng model nhỏ hơn; việc phức tạp mới cần model lớn.
- Thay đổi nhỏ chỉ chạy test liên quan; sau mỗi thay đổi ghi 1 dòng Nhật ký để phiên sau không phải dò lại.

## 9b. Quy trình (local → GitHub → VPS)
- Kho code: https://github.com/hoangtruongkien1710-ux/quanlyduan.git (nhánh main). App chính thức đang chạy trên **VPS** của anh/chị.
- Sửa và kiểm tra ở **local** trước: `npm.cmd run dev` → http://localhost:3100 (database local riêng, không đụng dữ liệu VPS).
- Xong thì commit ở local. **Anh/chị tự push** lên GitHub và tự cập nhật VPS (Claude không push, không đụng VPS nếu chưa được yêu cầu).
- Trên VPS: kéo code mới, `npm install` (khi đổi thư viện), **`npx prisma migrate deploy`** (khi có migration mới), build và khởi động lại app.
- VPS có file **.env riêng**: không bao giờ commit .env (local hay VPS).

## 9c. Kế hoạch: Link cho khách xem Kết quả công việc (CHỜ DUYỆT)
Mục tiêu: thay file Google Sheet chung. Khách mở 1 link, xem và lọc kết quả công việc của dự án mình, không sửa được, không cần đăng nhập.

Cách làm đề xuất:
1. Quản lý (Account / Trợ lý GĐ / Giám đốc) mở Dự án → bấm "🔗 Link cho khách" → app tạo link riêng cho dự án đó, ví dụ https://<tên miền>/khach/<mã ngẫu nhiên 32+ ký tự>.
   - Có các nút: Sao chép link, Tạo link mới (link cũ hết hiệu lực), Tắt link. Tuỳ chọn ngày hết hạn.
2. Trang khách là trang riêng, chỉ đọc (không tải app nội bộ). Máy chủ chỉ trả dữ liệu của đúng dự án đó.
   - Khách thấy: STT, Ngày thực hiện, Hạng mục, Công việc, Tên sản phẩm / mô tả, Loại, Số lượng, Link sản phẩm, Tiến độ.
   - Khách lọc được: năm/tháng (12 nút tháng có số lượng), hạng mục, công việc, loại, ô tìm kiếm. Có thể tải Excel.
   - Không lộ: mã đăng nhập, giờ làm, vướng mắc, ghi chú nội bộ, đề xuất, dữ liệu dự án khác. Tên người làm: tuỳ chọn ẩn/hiện.
3. Bảo mật: mã link không đoán được (lưu dạng băm), tắt / đổi link bất cứ lúc nào, chặn gọi dồn dập, không cho Google tìm thấy (noindex), ghi lại lần xem gần nhất. Bắt buộc HTTPS (VPS cần tên miền + chứng chỉ, ví dụ qua nginx / Caddy).
4. Kỹ thuật: thêm bảng ShareLink (migration mới → trên VPS ./capnhat.sh tự chạy prisma migrate deploy), route /khach/[token] + API chỉ đọc. Ước lượng: 1 phiên làm.

Cần anh/chị chốt:
- Hiện tên người làm cho khách không?
- 1 link / dự án là đủ, hay cần link theo từng hạng mục?
- Link có hạn dùng không (vd 6 tháng) hay dùng mãi đến khi tắt?
- VPS đã có tên miền + HTTPS chưa (để gửi link cho khách)?

## 10. Nhật ký tiến độ
- 23/11/2026: Kiểm tra môi trường: Docker 29.8, Compose 5.5, Node 26, npm 11. Tạo thư mục SMEE_NEXT, cài Next.js 15.5.4, Prisma 6.16.2. Viết KH.md.
- 23/11/2026: Theo yêu cầu, chuyển thư mục vào `D:\WEBSITE SMEE\WEB NỘI BỘ` và đổi tên thành **Quản lý dự án và công việc** (giữ lịch sử git). Đang chờ duyệt kế hoạch trước khi làm Giai đoạn 1.
- 23/11/2026: Cổng 3000 trên máy đã bị chương trình khác dùng → app chạy ở **cổng 3100** (http://localhost:3100). PostgreSQL dùng cổng 5432 (đang trống).
- 23/11/2026: Ghi nhận: nhân sự đang lấy từ Google Sheet nhân sự riêng → thêm 2 phương án (đọc trực tiếp / đồng bộ về bảng Staff) ở mục 9, chờ chốt.
- 23/11/2026: **Chốt**: giữ Google Sheet nhân sự làm nguồn gốc; app đồng bộ về bảng Staff qua Google Sheets API (service account, quyền Người xem), lúc khởi động, 10 phút / lần và nút "Đồng bộ nhân sự". Chỉ đọc các cột cần dùng, không đọc cột lương, mã đăng nhập mã hóa. Bỏ việc "màn quản lý nhân sự mới"; thêm việc tạo service account vào Giai đoạn 1.
- 23/11/2026: **Xong Giai đoạn 1.** PostgreSQL 16 chạy bằng Docker (container smee_qlda_db, cổng 5432). Prisma: 18 bảng APP_* + Staff + AppProperty, sinh tự động từ Config.js. Lớp tương thích Apps Script chạy nguyên Code.js (mỗi lần gọi một ngữ cảnh mới; dữ liệu trong bộ nhớ, lưu các tab đã đổi xuống PostgreSQL). Trang chính giữ nguyên giao diện, thêm lớp thay google.script.run. Đăng nhập bằng mã mã hoá (HMAC-SHA256 với APP_SECRET) trong bảng Staff. Đã thử: màn đăng nhập → vào app thấy menu + Tổng quan, không lỗi JS. Đo trên máy: đăng nhập 52 ms, lưu dự án / công việc 21 ms, tải dữ liệu 10 ms. Đồng bộ nhân sự đã viết, chờ service account.
- 23/11/2026: **Giai đoạn 2** — test e2e (tests/e2e-phase2.mjs) 31/31 đạt: dự án, công việc, phân quyền nhân viên (chỉ thấy / sửa việc của mình), việc bổ sung, đầu việc, giờ làm theo ngày, giờ trực tiếp vào dự án, báo cáo ngày, vướng mắc, đăng xuất. Engine tự thêm cấu hình mặc định (phần cần của setupApp). Dữ liệu nạp lại đúng sau khi khởi động lại máy chủ.
- 23/11/2026: **Giai đoạn 3–6** — test e2e (tests/e2e-rest.mjs) 35/35 đạt: kết quả công việc (chống lưu trùng, chặn sai người), giờ làm trực tiếp vào dự án + gắn việc, Báo cáo Account / Sale (phân quyền, nhận xét), Báo cáo Giám đốc (gửi, đánh giá, cuộc họp, nhiệm vụ + lịch sử, Telegram), đề xuất (chặn nhân viên tạo dự án), thiết lập, ngày nghỉ, mục Dữ liệu. **Giai đoạn 4**: mở cả 14 màn với dữ liệu thật, không lỗi JS. Nhập Excel chạy được. Các chức năng gắn với Google (nhập từ Google Sheet, file mẫu trên Drive) báo lỗi rõ ràng, chờ quyết định bỏ / thay.
- 23/11/2026: Đã xoá sạch dữ liệu thử trong database local (giữ cấu trúc bảng). Tài khoản quản trị dùng mã tạm lúc test — anh/chị cần đặt ADMIN_LOGIN_CODE trong .env rồi chạy npm run seed để đặt mã của mình. **Còn lại:** (1) service account Google để đồng bộ nhân sự + nút "Đồng bộ nhân sự" trên giao diện; (2) quyết định bỏ / thay các chức năng gắn với Google; (3) nhập mã bot Telegram và gửi thử thật; (4) Giai đoạn 7: Dockerfile cho app, sao lưu database hằng ngày, triển khai (chờ chốt hosting).
- 23/11/2026: **Chốt "Chỉ nhập Excel".** Bỏ các nút / form nhập từ Google Sheet, đồng bộ Google Sheet nguồn, file mẫu Drive, mục "Dọn cột thừa trong Google Sheet" (scripts/patch-excel-only.cjs áp lên legacy/Scripts.html). Máy chủ chặn các hàm tương ứng. Thêm nút "Tải file mẫu Excel" (.xlsx, 2 sheet Nhập công việc + Hướng dẫn). Chạy lại test: 31/31 và 35/35 đạt; màn Thiết lập / Công việc không còn chữ Google, không lỗi JS. Đã xoá dữ liệu thử.
- 23/11/2026: **Đổi cách lấy nhân sự (theo yêu cầu): Web App Apps Script** thay cho service account. tools/dong-bo-nhan-su.gs — dự án Apps Script MỚI, độc lập (không đụng project đang gắn với Sheet có Mã.gs), mở Sheet nhân sự theo ID, chỉ đọc các cột cần dùng, mã đăng nhập mã hoá HMAC-SHA256 (HASH_KEY) ngay trong Google, khoá SYNC_KEY so sánh thời gian hằng định; hàm caiDat() tạo 2 khoá. App: STAFF_SYNC_URL / STAFF_SYNC_KEY / STAFF_HASH_KEY trong .env; đồng bộ khi khởi động, 10 phút / lần và nút "Đồng bộ nhân sự" (Thiết lập, chỉ quản lý). Đăng nhập nhận cả mã từ Sheet (HASH_KEY) và tài khoản seed (APP_SECRET). Service account vẫn dùng được làm dự phòng. Đã test bằng Web App giả lập + database thử riêng: đồng bộ 3 người, đăng nhập đúng vai trò, chặn người nghỉ việc / sai mã, nhân viên không bấm được đồng bộ. Hướng dẫn: tools/HUONG_DAN_DONG_BO_NHAN_SU.md.
- 23/11/2026: **Đồng bộ nhân sự chạy thật.** Anh/chị đã thêm file dongbonhansu.gs vào dự án Apps Script của Sheet nhân sự (giữ nguyên Mã.gs), triển khai Web App, điền URL + 2 khoá vào .env. Kết quả: 27 nhân sự (20 đang làm, 7 nghỉ việc), 10 phòng ban, cả 27 có mã đăng nhập (đã mã hoá). Thêm instrumentation.ts để nạp dữ liệu + đồng bộ ngay khi máy chủ khởi động.
- 25/11/2026: Thêm **CLAUDE.md** (kiến trúc, nơi sửa, cách chạy / test, quy ước) để các phiên làm việc sau đọc nhanh, tiết kiệm token. Cách dùng: mở cuộc trò chuyện mới → "Đọc CLAUDE.md và KH.md rồi làm …".
- 25/11/2026: Anh/chị đã đẩy code lên GitHub (hoangtruongkien1710-ux/quanlyduan) và chạy được trên VPS. Từ giờ sửa / kiểm tra ở local trước rồi mới đẩy lên. Kiểm tra lịch sử git: .env, khoá Google, node_modules, .next không có trong git; không có chuỗi bí mật. Thêm mục Quy trình (CLAUDE.md, KH.md 9b).
- 2026-11-25: Sua loi 'node:child_process is not handled' khi chay dev: instrumentation.ts dat import ben trong if (NEXT_RUNTIME==='nodejs') de webpack bo khoi ban edge. Kiem tra: dev 3101 + DB thu (31/31 test dat), next build dat.
- 2026-11-25: Man Cong viec: loc 1 du an thi ten du an hien to ngang chu Cong viec; bang nhom Du an -> Hang muc (gap/mo duoc, Chua co hang muc o cuoi); bo cot Thao tac, nut thao tac hang ngang duoi ten viec (dien thoai tu xuong dong); Link san pham >1 link: hien link dau + Xem them (N) mo popup tab Ket qua cong viec; cac bang khac: nut cot thao tac xep hang ngang (CSS). Kiem tra 3101 + DB thu, build dat.
- 2026-11-25: Bang Cong viec: bo dong hang muc va 'N san pham · thang' duoi ten viec (da co nhom hang muc).
- 2026-11-25: Dien thoai: nut thao tac duoi ten viec luon 1 hang (nut nho 26px).
- 2026-11-25: Cong viec: gop nut thao tac thanh 1 nut but truoc ten viec, bam mo menu (Sua, Ghi gio lam, Ghi ket qua, Bao vuong mac, Sao chep giao viec, Xoa); dong khi bam ra ngoai/Esc/cuon/chon. Thu 3101 desktop + 390px.
- 2026-11-25: Tong quan: bo nut Tao cong viec. Du an: them nut Nhap Excel (quan ly) mo cung popup nhap Excel. Thu 3101 + DB thu, build dat.
- 2026-11-25: Them capnhat.sh (cap nhat VPS 1 lenh: sao luu DB ~/backups giu 14 ban, git pull --ff-only, npm install/migrate khi can, build, pm2 restart; lan dau tat app chay tay cong 3200 va dang ky pm2; kiem tra HTTP 200; --dry-run) + tools/HUONG_DAN_CAP_NHAT_VPS.md.
- 2026-11-25: docker-compose cong DB doc tu DB_PORT (mac dinh 5432, VPS 5440, chi 127.0.0.1); nang Next.js 15.5.4 -> 15.5.29 cho khop VPS. Build dat.
- 2026-11-25: capnhat.sh in san cach xu ly khi VPS co file sua tay (compose/package); huong dan them buoc 1 lan dua ban sua tay ve code chung; script khong chay docker compose (DB khong bi tao lai).
- 2026-11-26: Bo loc gon (moi man danh sach): hang nhanh luon hien (nut Bo loc (so loc dang bat), tim kiem, Danh sach/Kanban, Viec hom nay, Vuong mac); cac bo loc con lai trong khu mo/dong; nho trang thai localStorage (smee_tools_open); man nho (<=760px hoac <=1366x820) mac dinh dong; dien thoai luoi 2 cot; Ket qua cong viec: lich thang dua vao khu bo loc. Thu 3101 + DB thu: 1366x768, 390px.
- 2026-11-26: Cong viec: nut loc canh ten cot (Cong viec/hang muc: du an, hang muc, dau viec; Nguoi thuc hien: Phong ban -> Nhan vien; Uu tien (loc moi); Trang thai; Ket qua thoi han; Cho/vuong). Cot dang loc doi mau; dien thoai hien dang bang duoi day man. So loc tinh ca loc o cot; nut 'Xoa loc' o hang nhanh. Sua 'Bo loc (1)' sai o Ket qua cong viec. Cac man khac chua lam loc theo cot.
- 2026-11-26: Hang nut dau man (moi man co >=3 nut): man nho (<=900px hoac <=1366x820) chi hien nut chinh (xanh) + '⋯ Thao tac' mo menu cac nut phu; man lon hien du (nut chinh xep truoc).
- 2026-11-26: Nut '⋯ Thao tac' dau man ap dung moi kich co man hinh (theo yeu cau nguoi dung).
- 2026-11-26: Loc o cot: moi o loc (khi cot dang loc) co nut 'Bo loc cot nay' chi xoa loc cua cot do (Nguoi thuc hien: bo ca Phong ban + Nhan vien); van giu nut Xoa loc tong.
- 2026-11-26: Ket qua loai 'Cong viec khac': moi ket qua tinh 1 san pham (truoc tinh 0) — prQty; hien so luong 1 o bang, bao cao ngay, Excel. Thu 3101: 2 ket qua -> Tong 2 san pham, Thang 11 = 2.
- 2026-11-26: Lap ke hoach Link cho khach xem Ket qua cong viec (KH.md muc 9c) — cho duyet.
