// Chạy một lần khi máy chủ Next.js khởi động: nạp dữ liệu + bắt đầu đồng bộ nhân sự ngay (không đợi lượt truy cập đầu tiên).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const mod: any = await import('./lib/engine/engine.cjs');
  const engine = mod.default || mod;
  engine.ready().catch((e: any) => console.log('[SMEE] Khởi động lỗi:', e?.message || e));
}
