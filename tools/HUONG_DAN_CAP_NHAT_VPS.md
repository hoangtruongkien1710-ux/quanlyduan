# Cập nhật app trên VPS

App nằm ở `~/quanlyduan` trên VPS, chạy ở cổng **3200**. Database là container Docker `smee_qlda_db`.

## Mỗi lần cập nhật

1. Trên máy tính, đẩy code lên GitHub: `git push origin main`
2. Trên VPS, chạy:
   ```
   cd ~/quanlyduan && ./capnhat.sh
   ```
   Script tự làm 7 bước:
   - sao lưu database vào `~/backups` (giữ 14 bản gần nhất);
   - `git pull`;
   - `npm install` nếu đổi thư viện;
   - `npx prisma migrate deploy` nếu có migration mới (chỉ thêm bảng / cột, không xoá dữ liệu);
   - build;
   - khởi động lại bằng pm2;
   - kiểm tra app trả lời.

   Cuối cùng in ra "Cập nhật xong — bản …".
3. Mở app và bấm Ctrl+F5.

Nếu build lỗi, script dừng ngay, app cũ **vẫn chạy**. Muốn xem trước các bước mà không làm gì thì chạy `./capnhat.sh --dry-run`.

## Lần đầu tiên (chỉ làm 1 lần)

1. Lấy script về:
   ```
   cd ~/quanlyduan && git pull
   ```
   Nếu báo "Permission denied" khi chạy thì cấp quyền chạy: `chmod +x capnhat.sh`
2. Chạy `./capnhat.sh`. Lần đầu, script tắt app đang chạy tay (nohup) trên cổng 3200 rồi đăng ký app với pm2 dưới tên `quanlyduan`.
3. Kiểm tra lại:
   - `pm2 list` phải có dòng `quanlyduan` ở trạng thái online;
   - `ss -ltnp | grep 3200` chỉ còn 1 tiến trình.
4. Cho app tự bật khi VPS khởi động lại:
   - Chạy `pm2 startup`. Lệnh này in ra **một dòng bắt đầu bằng `sudo …`**: chép nguyên dòng đó, chạy một lần, rồi chạy `pm2 save`.
   - Nếu tài khoản không có quyền sudo, dùng crontab thay thế: chạy `crontab -e`, thêm dòng `@reboot cd ~/quanlyduan && pm2 resurrect`

## Các lệnh hay dùng

- Xem trạng thái: `pm2 list`
- Xem log: `pm2 logs quanlyduan --lines 50`
- Khởi động lại: `pm2 restart quanlyduan`

## Quay lại bản trước (khi bản mới lỗi)

Lấy mã bản trước trong dòng "Bản trước: xxxxxxx" mà script đã in, rồi chạy:
```
git checkout <mã bản trước> && npm run build && pm2 restart quanlyduan
```
Khi đã sửa xong trên GitHub, đưa thư mục về nhánh chính: `git checkout main`, rồi chạy `./capnhat.sh` như thường lệ.

## Khôi phục dữ liệu từ bản sao lưu

⚠ Thao tác này **GHI ĐÈ toàn bộ dữ liệu hiện tại** bằng dữ liệu trong bản sao lưu. Chỉ làm khi thật cần, và nên hỏi người hỗ trợ trước.
```
pm2 stop quanlyduan
docker exec smee_qlda_db psql -U smee smee -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker exec -i smee_qlda_db psql -U smee smee < ~/backups/<tên file>.sql
pm2 start quanlyduan
```

## Không được làm

- `docker compose down -v`: xoá luôn ổ dữ liệu database.
- `npx prisma migrate reset` / `prisma db push --force-reset`: xoá dữ liệu.
- Bấm "Làm trắng dữ liệu" trong app khi không định xoá hết.
- Sửa code trực tiếp trên VPS: sửa ở máy tính, push lên GitHub rồi chạy `./capnhat.sh`.
- Đụng vào các app khác trên VPS (các cổng 3000, 3100, 3180, 3210, 7500, …).
