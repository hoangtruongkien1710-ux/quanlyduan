// Một lần: bỏ các chức năng nhập gắn với Google khỏi legacy/Scripts.html (bản Next.js chỉ nhập Excel).
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', 'legacy', 'Scripts.html');
let s = fs.readFileSync(f, 'utf8'); const nl = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const LOG = [];
const rep = (o, n) => { if (!s.includes(o)) throw 'miss: ' + o.slice(0, 80); s = s.replace(o, () => n); LOG.push('rep: ' + o.slice(0, 50)); };
function skipStr(k, q) { for (k++; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === q || s[k] === '\n') return k; } return k; }
function skipTpl(k) { for (k++; k < s.length; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === '`') return k; if (s[k] === '$' && s[k + 1] === '{') k = scanEnd(k + 1) - 1; } return k; }
function scanEnd(j) { let d = 0; for (let k = j; k < s.length; k++) { const c = s[k]; if (c === '/' && s[k + 1] === '/') { k = s.indexOf('\n', k); continue; } if (c === "'" || c === '"') { k = skipStr(k, c); continue; } if (c === '`') { k = skipTpl(k); continue; } if (c === '{') d++; else if (c === '}') { d--; if (!d) return k + 1; } } throw 'unbalanced'; }
function rmFunc(name) { const re = new RegExp('\\n  (?:async )?function ' + name + '\\('); const m = re.exec(s); if (!m) throw 'nofunc ' + name; const b = s.indexOf('{', s.indexOf(')', m.index)); const e = scanEnd(b); s = s.slice(0, m.index) + s.slice(e); LOG.push('rm func ' + name); }
function caseEnd(i) { let d = 0, k = s.indexOf(':', i) + 1; for (; k < s.length; k++) { const c = s[k]; if (c === "'" || c === '"') { k = skipStr(k, c); continue; } if (c === '`') { k = skipTpl(k); continue; } if ('({['.includes(c)) d++; else if (')}]'.includes(c)) { if (d === 0) return k; d--; } else if (d === 0 && (s.startsWith("case '", k) || s.startsWith('default:', k))) return k; } return k; }
function rmCase(name) { const key = "case '" + name + "':"; const i = s.indexOf(key); if (i < 0) throw 'nocase ' + name; s = s.slice(0, i) + s.slice(caseEnd(i)); LOG.push('rm case ' + name); }
function rmRow(action) { const k = s.indexOf(",'" + action + "','btn btn-sm')"); if (k < 0) throw 'norow ' + action; const st = s.lastIndexOf('<div class="settings-row">', k); const be = s.indexOf(')}', k) + 2; const en = s.indexOf('</div>', be) + 6; LOG.push('rm row ' + action); s = s.slice(0, st) + s.slice(en); }

// 1) Nút trên màn Công việc
rep("+button('⇩ Nhập từ Google Sheet','gsImport','btn')", '');
// 2) Thiết lập → Nhập dữ liệu: bỏ Google Sheet bất kỳ / Google Sheet nguồn; file mẫu → Excel tạo trên trình duyệt
rmRow('gsImport'); rmRow('syncSource');
rep("button('Tạo file mẫu Google Sheet','makeTemplate','btn btn-sm')", "button('Tải file mẫu Excel','xlsxTemplate','btn btn-sm')");
{ const k = s.indexOf("'xlsxTemplate'"); const st = s.lastIndexOf('<div class="settings-row">', k); const seg = s.slice(st, k); const nseg = seg.replace(/<b>[^<]*<\/b><p>[^<]*<\/p>/, '<b>File mẫu Excel</b><p>Tải file .xlsx có sẵn các cột: Tên dự án, STT, Hạng mục lớn, Công việc chi tiết, Yêu cầu công việc — điền rồi dùng "Nhập Excel".</p>'); s = s.slice(0, st) + nseg + s.slice(k); LOG.push('reword template row'); }
// 3) Bỏ mục Bảo trì "Dọn cột thừa trong Google Sheet" (dữ liệu đã ở PostgreSQL)
{ const a = s.indexOf('return `<section class="panel"><div class="panel-head"><h3>Bảo trì</h3>'); if (a < 0) throw 'baotri'; const e = s.indexOf('</section>`+', a); s = s.slice(0, a) + 'return ' + s.slice(e + '</section>`+'.length); LOG.push('rm Bảo trì section'); }
rmCase('cleanColumns');
// 4) Bỏ các thao tác + hàm nhập Google
['gsImport', 'makeTemplate', 'syncSource'].forEach(rmCase);
['gsImportForm', 'makeTemplate'].forEach(n => { try { rmFunc(n); } catch (e) { LOG.push('skip ' + e); } });
// 5) File mẫu Excel tạo trên trình duyệt
rep("case 'import':", "case 'xlsxTemplate':return xlsxTemplate();case 'import':");
rep('  function bgdTgSettings(){', `  // Bản Next.js: file mẫu nhập công việc tạo ngay trên trình duyệt (.xlsx), thay cho file mẫu trên Google Drive.
  function xlsxTemplate(){if(!window.XLSX){window.smeeXlsxThen(()=>xlsxTemplate(),notify);return;}
    const head=['Tên dự án','STT','Hạng mục lớn','Công việc chi tiết','Yêu cầu công việc'];
    const rows=[head,['Website Nhà hàng Hương Quê','1','Khảo sát & cấu trúc website','Phỏng vấn chủ nhà hàng về thực đơn, khách mục tiêu','Biên bản khảo sát'],['','','','Lập sitemap và wireframe trang chủ',''],['','2','Thiết kế giao diện','Thiết kế trang chủ (desktop + mobile)','2 phương án màu']];
    const guide=[['Hướng dẫn nhập công việc'],[''],['Tên dự án: BẮT BUỘC, chỉ ghi ở dòng đầu mỗi dự án; dòng dưới để trống thì kế thừa.'],['STT: không bắt buộc; để trống thì app tự đánh số theo hạng mục.'],['Hạng mục lớn: BẮT BUỘC, chỉ ghi ở dòng đầu mỗi hạng mục; dòng dưới để trống thì kế thừa.'],['Công việc chi tiết: BẮT BUỘC, mỗi dòng là một công việc.'],['Yêu cầu công việc: không bắt buộc.'],[''],['Xoá các dòng ví dụ trước khi nhập. Dùng nút "Nhập Excel" để nhập file.']];
    const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:32},{wch:6},{wch:30},{wch:48},{wch:36}];XLSX.utils.book_append_sheet(wb,ws,'Nhập công việc');
    const wg=XLSX.utils.aoa_to_sheet(guide);wg['!cols']=[{wch:100}];XLSX.utils.book_append_sheet(wb,wg,'Hướng dẫn');XLSX.writeFile(wb,'SMEE_mau_nhap_cong_viec.xlsx');notify('Đã tải file mẫu Excel.');}
  function bgdTgSettings(){`);
// 6) Lời nhắc khi không tải được thư viện Excel
s = s.split('hãy dùng bản CSV hoặc nhập từ Google Sheets.').join('hãy dùng bản CSV.');
fs.writeFileSync(f, nl ? s.replace(/\n/g, '\r\n') : s);
console.log(LOG.join('\n'));
