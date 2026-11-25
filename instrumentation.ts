// Chạy một lần khi máy chủ Next.js khởi động: nạp dữ liệu + bắt đầu đồng bộ nhân sự ngay (không đợi lượt truy cập đầu tiên).
// Lưu ý: phải đặt import BÊN TRONG `if (NEXT_RUNTIME === 'nodejs')` (không dùng `return` sớm),
// để webpack loại bỏ đoạn này khi biên dịch cho edge — nếu không sẽ lỗi "node:child_process is not handled".
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const mod: any = await import('./lib/engine/engine.cjs');
    const engine = mod.default || mod;
    engine.ready().catch((e: any) => console.log('[SMEE] Khởi động lỗi:', e?.message || e));
  }
}
