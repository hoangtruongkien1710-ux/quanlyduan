# Hướng dẫn: nối Google Sheet nhân sự với app Quản lý dự án và công việc

App mới lấy danh sách nhân sự (họ tên, mã NV, email, chức vụ, phòng ban, tình trạng, mã đăng nhập) từ file **Chấm công_lương_SMEE** qua một Web App Apps Script nhỏ.
- Web App **chỉ đọc**, không sửa gì trong Sheet.
- **Không** gửi cột lương, Password, Số điện thoại, Hình ảnh, Cơ sở tính lương.
- Mã đăng nhập ("Pass App Dự án") được **mã hoá** ngay trong Google rồi mới gửi đi.

> Làm trong một **dự án Apps Script mới, độc lập**. **Không** dán vào project đang gắn với Sheet nhân sự (có file Mã.gs nhắc Telegram), để không ảnh hưởng chức năng đang chạy.

## Bước 1 — Tạo dự án Apps Script mới
1. Vào **https://script.google.com** bằng tài khoản Google có quyền mở file Chấm công_lương_SMEE.
2. Bấm **Dự án mới**. Đặt tên dự án: **SMEE - Dong bo nhan su**.
3. Xoá hết nội dung có sẵn trong file `Mã.gs` **của dự án mới này**, rồi dán toàn bộ nội dung file `tools/dong-bo-nhan-su.gs` vào. Bấm **Lưu** (biểu tượng đĩa mềm).

## Bước 2 — Tạo khoá (chạy 1 lần)
1. Ở thanh trên, chọn hàm **caiDat** → bấm **Chạy**.
2. Google hỏi cấp quyền: chọn tài khoản → **Nâng cao** → **Truy cập (không an toàn)** → **Cho phép**. Đây là dự án của chính anh/chị.
3. Xong, vào **Cài đặt dự án** (biểu tượng bánh răng bên trái) → kéo xuống **Thuộc tính tập lệnh**. Sẽ thấy 2 khoá: **SYNC_KEY** và **HASH_KEY**.

## Bước 3 — Triển khai Web App
1. Bấm **Triển khai** → **Tùy chọn triển khai mới**.
2. Bấm bánh răng cạnh "Chọn loại" → **Ứng dụng web**.
3. **Thực thi dưới dạng: Tôi**. **Người có quyền truy cập: Bất kỳ ai**.
4. Bấm **Triển khai**, rồi sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).

(Không ai đọc được dữ liệu nếu không có SYNC_KEY.)

## Bước 4 — Điền vào file .env của app
Mở file `.env` trong thư mục `D:\WEBSITE SMEE\WEB NỘI BỘ\Quản lý dự án và công việc` bằng Notepad, điền 3 dòng:
```
STAFF_SYNC_URL="<URL /exec vừa sao chép>"
STAFF_SYNC_KEY="<giá trị SYNC_KEY>"
STAFF_HASH_KEY="<giá trị HASH_KEY>"
```
Lưu file. **Chỉ dán các khoá vào file .env — không gửi qua chat, email hay Zalo.**

## Bước 5 — Chạy lại app
Trong cửa sổ đang chạy app, bấm **Ctrl+C** để tắt, rồi chạy lại:
```
npm.cmd run dev
```
App tự đồng bộ nhân sự khi khởi động và khoảng 10 phút / lần. Muốn cập nhật ngay: vào **Thiết lập** → **Đồng bộ nhân sự**.

Nhân viên đăng nhập bằng đúng mã ở cột **Pass App Dự án** như app cũ.

## Khi thay đổi
- Thêm / sửa / cho nghỉ nhân viên: làm trên Sheet như bình thường; app cập nhật sau tối đa khoảng 10 phút (hoặc bấm Đồng bộ nhân sự).
- Nếu sửa code Apps Script: **Triển khai → Quản lý các bản triển khai → Sửa → Phiên bản mới** (giữ nguyên URL).
- Nếu lộ khoá: trong Thuộc tính tập lệnh xoá SYNC_KEY / HASH_KEY, chạy lại **caiDat**, rồi cập nhật 2 khoá mới vào `.env`.
