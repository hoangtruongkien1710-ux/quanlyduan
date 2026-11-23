// Trang chính: ghép Index.html + Styles.html + Scripts.html (giữ nguyên giao diện Apps Script)
// và thêm lớp nhỏ thay google.script.run → POST /api/rpc/<tên hàm>.
import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHIM = `<script>
/* SMEE (Next.js): thay google.script.run của Apps Script bằng lời gọi /api/rpc/<hàm>. */
(function(){
  function runner(ok, fail){
    return new Proxy({}, { get: function(_, name){
      if (name === 'withSuccessHandler') return function(f){ return runner(f, fail); };
      if (name === 'withFailureHandler') return function(f){ return runner(ok, f); };
      if (name === 'withUserObject') return function(){ return runner(ok, fail); };
      return function(){
        var args = Array.prototype.slice.call(arguments);
        fetch('/api/rpc/' + encodeURIComponent(String(name)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args), credentials: 'same-origin' })
          .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
          .then(function(x){
            if (x.ok && x.j && !x.j.error) { if (ok) ok(x.j.result); }
            else { var e = new Error((x.j && x.j.error) || 'Lỗi máy chủ'); if (fail) fail(e); else console.error(e); }
          })
          .catch(function(e){ var er = new Error('Không kết nối được máy chủ: ' + (e && e.message || e)); if (fail) fail(er); else console.error(er); });
      };
    }});
  }
  window.google = window.google || {};
  window.google.script = { run: runner(null, null), host: { close: function(){}, setHeight: function(){}, setWidth: function(){} } };
})();
</script>`;

let cached: string | null = null;
function page(): string {
  if (cached && process.env.NODE_ENV === 'production') return cached;
  const dir = path.join(process.cwd(), 'legacy');
  const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
  let html = read('Index.html');
  html = html.replace(/<\?!=\s*include\('Styles'\);?\s*\?>/, () => read('Styles.html'));
  html = html.replace(/<\?!=\s*include\('Scripts'\);?\s*\?>/, () => SHIM + read('Scripts.html'));
  if (!/<meta[^>]+viewport/i.test(html)) html = html.replace(/<head>/i, '<head><meta name="viewport" content="width=device-width, initial-scale=1">');
  cached = html;
  return html;
}

export async function GET() {
  return new Response(page(), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
