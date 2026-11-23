// Gọi hàm máy chủ theo tên (cùng tên hàm như Apps Script: apiLogin, apiBootstrap, …).
import engine from '@/lib/engine/engine.cjs';
import staffSync from '@/lib/staff-sync.cjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ fn: string }> }) {
  const { fn } = await params;
  let args: unknown[] = [];
  try { const body = await req.json(); args = Array.isArray(body) ? body : []; } catch { args = []; }
  try {
    if (fn === 'apiNextSyncStaff') {
      // Đồng bộ nhân sự ngay (chỉ quản lý): kiểm tra quyền trong engine, rồi gọi Web App / Google.
      await engine.call('apiNextCanSyncStaff', [args[0]]);
      const count = await staffSync.syncNow(engine);
      return Response.json({ result: { count } });
    }
    const result = await engine.call(fn, args);
    return Response.json({ result });
  } catch (e: any) {
    const msg = String(e?.message || e || 'Lỗi máy chủ');
    if (!/^(Mã không hợp lệ|Phiên đăng nhập|Bạn |Chỉ |Không |Chọn |Nhập |Thiếu |Gõ |Ngày |Tiến độ|Mức |Hạn |Link |Mỗi |Cuộc họp|Nhiệm vụ|Tên |Loại |Trạng thái|Dòng )/.test(msg)) console.error('[SMEE rpc lỗi]', fn, msg);
    return Response.json({ error: msg }, { status: 400 });
  }
}
