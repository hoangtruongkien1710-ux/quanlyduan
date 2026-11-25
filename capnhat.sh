#!/usr/bin/env bash
# Cập nhật app "Quản lý dự án và công việc" trên VPS bằng 1 lệnh:
#     cd ~/quanlyduan && ./capnhat.sh            (chạy thật)
#     ./capnhat.sh --dry-run                     (chỉ in các bước, không làm gì)
# Các bước: sao lưu DB → git pull → npm install (khi đổi thư viện) → prisma migrate deploy (khi có migration mới)
#           → build (lỗi thì dừng, app cũ vẫn chạy) → khởi động lại bằng pm2 → kiểm tra app trả lời.
# Đổi được bằng biến môi trường: PORT (3200), DB_CONTAINER (smee_qlda_db), DB_USER / DB_NAME (smee), BK_DIR (~/backups).
# Chỉ đụng tới app này (cổng $PORT, pm2 tên quanlyduan) — không đụng các app khác trên VPS.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
DIR=$(pwd)

APP=quanlyduan
PORT="${PORT:-3200}"
DB_CONTAINER="${DB_CONTAINER:-smee_qlda_db}"
DB_USER="${DB_USER:-smee}"
DB_NAME="${DB_NAME:-smee}"
BK_DIR="${BK_DIR:-$HOME/backups}"
KEEP=14
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

step() { echo; echo "== $*"; }
run()  { if [ "$DRY" = 1 ]; then echo "   [thử] $*"; else eval "$@"; fi; }
die()  { echo "!! $*"; exit 1; }

[ "$DRY" = 1 ] && echo "CHẾ ĐỘ THỬ (--dry-run): chỉ in các bước, không thay đổi gì."
OLD=$(git rev-parse --short HEAD)

step "1/7 Sao lưu database ($DB_CONTAINER)"
BK="$BK_DIR/qlda_$(date +%F_%H%M).sql"
run "mkdir -p '$BK_DIR'"
run "docker exec '$DB_CONTAINER' pg_dump -U '$DB_USER' '$DB_NAME' > '$BK'"
if [ "$DRY" = 0 ]; then
  [ -s "$BK" ] || die "Bản sao lưu bị rỗng — dừng lại, chưa cập nhật gì."
  echo "   Đã lưu: $BK ($(du -h "$BK" | cut -f1))"
  ls -1t "$BK_DIR"/qlda_*.sql 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --
fi

step "2/7 Lấy code mới (git pull)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  die "Thư mục trên VPS có file bị sửa tay — không pull để tránh mất. Gửi danh sách trên cho người hỗ trợ."
fi
if [ "$DRY" = 1 ]; then
  git fetch -q origin
  echo "   [thử] git pull --ff-only  (sẽ nhận: $(git rev-list --count HEAD..@{u}) commit mới)"
  CHANGED=$(git diff --name-only HEAD @{u})
else
  git pull --ff-only || die "Không pull được (code trên VPS lệch với GitHub). Chưa thay đổi gì, app cũ vẫn chạy."
  CHANGED=$(git diff --name-only "$OLD" HEAD)
fi
NEW=$(git rev-parse --short HEAD)
echo "   Bản trước: $OLD  →  bản hiện tại: $NEW"

step "3/7 Thư viện"
if echo "$CHANGED" | grep -qE '^package(-lock)?\.json$'; then run "npm install"; else echo "   Thư viện không đổi — bỏ qua."; fi

step "4/7 Cấu trúc database"
if echo "$CHANGED" | grep -q '^prisma/migrations/'; then
  echo "   Có migration mới — chỉ THÊM bảng/cột, không xoá dữ liệu."
  run "npx prisma migrate deploy"
else echo "   Không có migration mới — bỏ qua."; fi

step "5/7 Build"
run "npm run build" || die "Build lỗi — app cũ VẪN ĐANG CHẠY. Quay lại bản trước: git checkout $OLD"

step "6/7 Khởi động lại app"
if pm2 describe "$APP" >/dev/null 2>&1; then
  run "pm2 restart '$APP' --update-env"
else
  echo "   Lần đầu dùng pm2: tắt app chạy tay trên cổng $PORT rồi đăng ký pm2."
  PIDS=$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep 'next-server' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
  if [ -n "$PIDS" ]; then
    run "kill $PIDS"
    if [ "$DRY" = 0 ]; then
      for _ in $(seq 1 15); do ss -ltn "sport = :$PORT" | grep -q LISTEN || break; sleep 1; done
      if ss -ltn "sport = :$PORT" | grep -q LISTEN; then
        PIDS=$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep 'next-server' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
        [ -n "$PIDS" ] && kill -9 $PIDS; sleep 2
      fi
    fi
  fi
  if [ "$DRY" = 0 ] && ss -ltn "sport = :$PORT" | grep -q LISTEN; then
    die "Cổng $PORT vẫn bận bởi chương trình khác — kiểm tra: ss -ltnp | grep $PORT"
  fi
  run "pm2 start 'npx next start -p $PORT -H 0.0.0.0' --name '$APP' --cwd '$DIR'"
  run "pm2 save"
  echo "   Để app tự bật khi VPS khởi động lại: xem tools/HUONG_DAN_CAP_NHAT_VPS.md (pm2 startup)."
fi

step "7/7 Kiểm tra app"
if [ "$DRY" = 1 ]; then echo "   [thử] chờ http://127.0.0.1:$PORT/ trả về 200"; echo; echo "Xong chế độ thử."; exit 0; fi
CODE=000
for _ in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  [ "$CODE" = 200 ] && break; sleep 1
done
if [ "$CODE" = 200 ]; then
  echo; echo "Cập nhật xong — bản $NEW đang chạy ở cổng $PORT. Mở app và bấm Ctrl+F5."
else
  echo "!! App chưa trả lời (mã $CODE). 20 dòng log cuối:"
  pm2 logs "$APP" --lines 20 --nostream || true
  echo
  echo "Quay lại bản trước:   git checkout $OLD && npm run build && pm2 restart $APP"
  echo "Bản sao lưu dữ liệu vừa tạo: $BK  (cách khôi phục: xem tools/HUONG_DAN_CAP_NHAT_VPS.md — GHI ĐÈ dữ liệu, chỉ làm khi thật cần)"
  exit 1
fi
