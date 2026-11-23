
/** SMEE · Web app Google Apps Script / Server side */
/** Dùng chung luồng biên dịch mẫu HTML cho doGet và kiểm tra hệ thống.
 * Gắn đủ biến template trước khi gọi evaluate(), tránh lỗi demoMode is not defined.
 */
function renderIndexTemplate_() {
  const page = HtmlService.createTemplateFromFile('Index');
  page.demoMode = !!CFG.DEMO_MODE;
  return page.evaluate();
}
function doGet() {
  try {
    return renderIndexTemplate_()
      .setTitle('SMEE | Quản lý dự án & lịch làm việc')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    console.error('SMEE doGet / template:',error);
    // Không hiển thị dữ liệu nội bộ hoặc stack trace khi template chưa tải được.
    return HtmlService.createHtmlOutput('<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="padding:36px;background:#f5f8fc;font:16px Arial;color:#18365c"><h2>SMEE chưa tải được giao diện</h2><p>Vui lòng kiểm tra đủ các file Index.html, Scripts.html và Styles.html trong Apps Script Editor; chạy setupApp() và triển khai một phiên bản Web App mới.</p></body></html>')
      .setTitle('SMEE | Lỗi tải giao diện');
  }
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/** Chạy một lần BẰNG TÀI KHOẢN CHỦ TRONG EDITOR. RPC từ web app bị từ chối. */
function setupApp() {
  const actor = Session.getActiveUser().getEmail();
  const owner = Session.getEffectiveUser().getEmail();
  if (!actor || !owner || actor.toLowerCase() !== owner.toLowerCase()) {
    throw new Error('Chỉ chủ sở hữu chạy setupApp trong Apps Script Editor.');
  }
  // Chốt tài khoản triển khai cho chế độ chạy thử; không cho Web App tự chọn người dùng thử.
  const props = PropertiesService.getScriptProperties();
  const savedOwner = String(props.getProperty('SMEE_DEMO_OWNER') || '').toLowerCase();
  if (savedOwner && savedOwner !== actor.toLowerCase()) {
    throw new Error('Tài khoản Google này không phải chủ sở hữu đã khởi tạo chế độ thử.');
  }
  if (!savedOwner) props.setProperty('SMEE_DEMO_OWNER', actor.toLowerCase());
  const db = SpreadsheetApp.openById(CFG.DB_SPREADSHEET_ID);
  Object.keys(CFG.TABLES).forEach(key => {
    const name = CFG.TABLES[key];
    let sh = db.getSheetByName(name);
    if (!sh) sh = db.insertSheet(name);
    const fields = CFG.FIELDS[key];
    if (sh.getMaxColumns() < fields.length) sh.insertColumnsAfter(sh.getMaxColumns(), fields.length - sh.getMaxColumns());
    const original = sh.getRange(1, 1, 1, fields.length).getDisplayValues()[0];
    // Cho phép header cũ thiếu các cột mới ở cuối (vd gioDuKien), các cột đã có phải khớp.
    const filled = original.filter(Boolean).length;
    if (filled && original.slice(0, filled).join('|') !== fields.slice(0, filled).join('|')) {
      throw new Error('Sheet ' + name + ' đã có header khác chuẩn, chưa chỉnh sửa để tránh mất dữ liệu.');
    }
    sh.getRange(1, 1, 1, fields.length).setValues([fields]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, fields.length).setBackground('#14346d').setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), fields.length).setNumberFormat('@');
    sh.autoResizeColumns(1, Math.min(fields.length, 9));
  });
  const set = table_('config');
  const keys = set.getRange(2, 1, Math.max(1, set.getLastRow()-1), 1).getDisplayValues().flat();
  if (!keys.includes('statuses')) set.appendRow(['statuses', JSON.stringify(CFG.DEFAULT_STATUSES)]);
  if (!keys.includes('workdayHours')) set.appendRow(['workdayHours', '8']);
  const check = kiemTraNhanSu();
  Logger.log('Đã đối chiếu ' + Object.keys(CFG.TABLES).length + ' bảng; kiểm tra nhân sự: ' + JSON.stringify(check));
  return {ok:true, check};
}
/** Kiểm tra cột nhân sự trong Apps Script Editor, KHÔNG in mật mã. */
function kiemTraNhanSu() {
  const m = employeeMapping_();
  const rows = m.sheet.getLastRow();
  return {sheet:m.sheet.getName(),headerRow:m.headerRow,columns:{
    pass:m.pass+1,name:m.name+1,employeeId:m.empId<0?null:m.empId+1,
    role:m.role<0?null:m.role+1,department:m.dept<0?null:m.dept+1,
    status:m.status<0?null:m.status+1},employeesBelowHeader:Math.max(0,rows-m.headerRow),
    statusReadable:m.status>=0,
    note:m.status<0?'Thiếu cột tình trạng làm việc: hệ thống CHẶN đăng nhập để bảo vệ tài khoản đã nghỉ.':''};
}


/**
 * SMEE BUILD 7.8.3 - SỬA BIÊN DỊCH HTML TRONG HÀM KIỂM TRA (CHỈ CHẠY TRONG APPS SCRIPT EDITOR).
 * Chỉ kiểm tra đọc dữ liệu; KHÔNG hiển thị/ghi log mật khẩu hoặc token đăng nhập.
 * Kết quả trong "Nhật ký thực thi"; không thay đổi các bảng công việc.
 * Hàm có thể kiểm tra giao diện trong mã nguồn, KHÔNG thay thế bước thử Web App /exec.
 */
function kiemTraHeThong() {
  const actor = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const executor = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!actor || !executor || actor !== executor) {
    throw new Error('Chỉ tài khoản chủ sở hữu được chạy kiemTraHeThong trong Apps Script Editor.');
  }
  const results = [];
  const check = function (name, fn, warningOnly) {
    try {
      const detail = fn();
      results.push({name:name, status:'OK', detail:String(detail || 'Đạt')});
    } catch (ex) {
      // Không xuất dữ liệu cột mật khẩu; chỉ hiện mô tả lỗi thiết lập/hệ thống.
      const message = String(ex && ex.message || ex || 'Không rõ lỗi').slice(0,350);
      results.push({name:name, status:warningOnly ? 'CANH_BAO' : 'LOI', detail:message});
    }
  };

  check('Chế độ đăng nhập', function () {
    if (CFG.DEMO_MODE !== false) throw new Error('DEMO_MODE vẫn bật. Chuyển thành false trong Config.gs.');
    if (!CFG.SESSION_SECONDS || CFG.SESSION_SECONDS < 60) throw new Error('SESSION_SECONDS chưa hợp lệ.');
    return 'Yêu cầu mã nhân viên; quyền truy cập được xác minh ở máy chủ.';
  });
  check('Google Sheet lưu dữ liệu', function () {
    const db = SpreadsheetApp.openById(CFG.DB_SPREADSHEET_ID);
    if (!db || !db.getSheets().length) throw new Error('Không mở được Google Sheet lưu dữ liệu.');
    return 'Đã kết nối, có ' + db.getSheets().length + ' tab.';
  });
  Object.keys(CFG.TABLES).forEach(function (key) {
    check('Bảng ' + CFG.TABLES[key], function () {
      const table = table_(key);
      const expected = CFG.FIELDS[key];
      if (table.getMaxColumns() < expected.length) {
        throw new Error('Thiếu cột: cần ' + expected.length + ', đang có ' + table.getMaxColumns() + '.');
      }
      const actual = table.getRange(1, 1, 1, expected.length).getDisplayValues()[0];
      const bad = expected.findIndex(function (field, i) { return field !== String(actual[i] || '').trim(); });
      if (bad !== -1) throw new Error('Cột ' + (bad+1) + ': cần "' + expected[bad] + '", nhận "' + (actual[bad] || '(trống)') + '". Chạy setupApp() sau khi đối chiếu dữ liệu.');
      return 'Đủ ' + expected.length + ' cột; số dòng dữ liệu: ' + Math.max(0,table.getLastRow() - 1) + '.';
    });
  });
  check('Nguồn nhân sự và trạng thái làm việc', function () {
    const mapping = employeeMapping_();
    if (mapping.status < 0) throw new Error('Không tìm thấy cột trạng thái làm việc; hệ thống không cho đăng nhập.');
    return 'Đã xác định cột tên, mã đăng nhập và trạng thái (không đọc ra nhật ký giá trị mật khẩu).';
  });
  check('Mã nhân viên có thể đăng nhập', function () {
    const all = employees_(true,true);
    const active = all.filter(function (e) { return e.active; });
    const inactive = all.length - active.length;
    if (!active.length) throw new Error('Không có nhân viên đang hoạt động kèm mã đăng nhập hợp lệ.');
    const shortCodes = active.filter(function (e) { return e.pass.length < 6 || e.pass.length > 128; }).length;
    const counts = {};
    all.forEach(function (e) { counts[e.pass] = (counts[e.pass] || 0) + 1; });
    const collision = active.filter(function (e) { return counts[e.pass] > 1; }).length;
    if (shortCodes || collision) throw new Error('Có ' + shortCodes + ' mã của nhân viên hoạt động nằm ngoài 6-128 ký tự và ' + collision + ' mã trùng với nhân viên khác. Kiểm tra Sheet nhân sự (không hiển thị mã ở đây).');
    return 'Nhân viên hoạt động có mã: ' + active.length + '; nhân viên không hoạt động có mã: ' + inactive + '; không phát hiện mã trùng.';
  });
  check('Giao dien Web App trong ma nguon', function () {
    // Read original editor files, not only the compiled output. This differentiates
    // a stale Index from a missing server-side template variable.
    const rawIndex = HtmlService.createHtmlOutputFromFile('Index').getContent();
    const rawScripts = HtmlService.createTemplateFromFile('Scripts').getRawContent();
    const rawStyles = HtmlService.createHtmlOutputFromFile('Styles').getContent();
    const html = renderIndexTemplate_().getContent();
    const buildMatch = rawIndex.match(/window\.SMEE_BUILD\s*=\s*['"]([^'"]+)['"]/);
    const indexBuild = buildMatch ? buildMatch[1] : 'KHONG_XAC_DINH';
    const needed = ['id="loginForm"', 'id="passcode"', 'id="togglePassword"',
      'id="application"', 'id="appContent"', 'id="loginError"', 'id="passcodeState"'];
    const missing = needed.filter(function (item) { return rawIndex.indexOf(item) < 0; });
    if (missing.length) throw new Error('Index.html missing UI elements: ' + missing.join(', '));
    const mode = html.match(/window\s*\.\s*SMEE_DEMO_MODE\s*=\s*(true|false)\b/);
    const demoBody = /data-smee-demo\s*=\s*['"]true['"]/i.test(html);
    if (demoBody || (mode && mode[1] === 'true')) {
      throw new Error('Index.html is still in DEMO_MODE=true; editor Index build=' + indexBuild + '. Replace Index.html.');
    }
    if (indexBuild !== '7.8.3') {
      throw new Error('Index.html in Apps Script Editor is outdated (detected build=' + indexBuild + ', required=7.8.3). Re-copy Index_MA_NGUON.txt from Drive into Index.html.');
    }
    if (!mode || mode[1] !== 'false') {
      throw new Error('Index.html must explicitly set window.SMEE_DEMO_MODE = false.');
    }
    // Diagnose rather than assume a stale file: read the exact editor content and marker length.
    const detectedScripts = (rawScripts.match(/SMEE BUILD\s*([0-9.]+)/) || [])[1] || 'KHONG_RO';
    const detectedStyles = (rawStyles.match(/SMEE BUILD\s*([0-9.]+)/) || [])[1] || 'KHONG_RO';
    if (detectedScripts !== '7.8.3' || rawScripts.indexOf('window.SMEE_CLIENT_READY = true') < 0) {
      throw new Error('Scripts.html không đồng bộ: nhận diện BUILD=' + detectedScripts +
        ', ký tự=' + rawScripts.length + ', có dòng kết thúc khởi tạo=' +
        (rawScripts.indexOf('window.SMEE_CLIENT_READY = true') >= 0 ? 'CÓ':'KHÔNG') +
        '. Đối chiếu toàn bộ file trong Apps Script Editor.');
    }
    if (detectedStyles !== '7.8.3' || rawStyles.indexOf('--smee-style-build:7.8.3') < 0) {
      throw new Error('Styles.html không đồng bộ: nhận diện BUILD=' + detectedStyles +
        ', ký tự=' + rawStyles.length + '. Cần cập nhật Styles.html lên BUILD 7.5.');
    }
    const syntax = kiemTraCuPhapScripts_(false);
    const codeMarkers = ['function doLogin(', 'apiBootstrap', 'window.SMEE_CLIENT_READY = true'];
    const missingJs = codeMarkers.filter(function (item) { return rawScripts.indexOf(item) < 0; });
    if (missingJs.length) throw new Error('Scripts.html is missing client login/bootstrap handlers: ' + missingJs.join(', '));
    if (!html.includes('id="loginForm"') || !html.includes('id="appContent"') || !html.includes('function doLogin(')) {
      throw new Error('Compiled Index HTML is missing the JS login handler or app UI; check HtmlService include(Scripts).');
    }
    return 'Index=' + indexBuild + ', mode=LOGIN; Scripts=7.8.3 (tách ' + syntax.blocks + ' khối, cú pháp OK); Styles=7.8.3; HTML template evaluated successfully.';
  });
  check('Tải dữ liệu Tổng quan bằng phiên kiểm tra', function () {
    const available = employees_(true).filter(function (e) { return e.active; });
    if (!available.length) throw new Error('Không có tài khoản hoạt động để kiểm tra dữ liệu Tổng quan.');
    const tempToken = Utilities.getUuid() + Utilities.getUuid();
    const cacheKey = 's_' + digest_(tempToken);
    const cache = CacheService.getScriptCache();
    let data;
    try {
      cache.put(cacheKey, JSON.stringify({key:available[0].key}), 45);
      data = apiBootstrap(tempToken);
    } finally {
      cache.remove(cacheKey);
    }
    if (!data || !data.me || !Array.isArray(data.employees) || !Array.isArray(data.projects) || !Array.isArray(data.tasks) || !Array.isArray(data.time) || !Array.isArray(data.blockers)) {
      throw new Error('apiBootstrap không trả về dữ liệu đúng cấu trúc.');
    }
    return 'API trả về đủ các nhóm dữ liệu: ' + data.projects.length + ' dự án, ' + data.tasks.length + ' công việc, ' + data.time.length + ' phiên giờ, ' + data.blockers.length + ' vướng mắc.';
  });
  check('Bảng nguồn nhập dự án (không bắt buộc khi đăng nhập)', function () {
    const src = byGid_(CFG.SOURCE_IMPORT_SPREADSHEET_ID, CFG.SOURCE_IMPORT_GID);
    const h = src.getRange(1,1,1,15).getDisplayValues()[0];
    if (String(h[0]).trim() !== 'Tên dự án' || String(h[3]).trim() !== 'Công việc chi tiết' || String(h[8]).trim() !== 'Deadline') {
      throw new Error('Tab nhập dự án chưa có tiêu đề A-I đúng mẫu; đăng nhập vẫn có thể hoạt động.');
    }
    return 'Đã xác định được cột dự án/công việc/deadline để nhập dữ liệu.';
  }, true);

  Logger.log('========== SMEE KIEM TRA HE THONG - BUILD 7.8.3 ==========');
  results.forEach(function (row, i) { Logger.log((i+1) + '. [' + row.status + '] ' + row.name + ': ' + row.detail); });
  const failures = results.filter(function (r) { return r.status === 'LOI'; }).length;
  const warnings = results.filter(function (r) { return r.status === 'CANH_BAO'; }).length;
  const ok = failures === 0;
  Logger.log('KET LUAN: ' + (ok ? 'DAT - co the kiem tra Web App' : 'CHUA DAT - can sua cac muc LOI') + '; ' + failures + ' loi; ' + warnings + ' canh bao.');
  Logger.log('Luu y: ham nay KHONG kiem tra duoc ban Web App /exec dang trien khai. Can chon New version -> Deploy va thu dang nhap tren trinh duyet.');
  return {ok:ok, build:'7.8.3', failed:failures, warnings:warnings, checks:results};
}

/* BUILD 7.2 — Tăng tốc: trong MỘT lần gọi máy chủ, file dữ liệu chỉ mở 1 lần, mỗi tab chỉ đọc 1 lần (đọc lại sau khi ghi),
   danh sách nhân sự đọc 1 lần (và lưu đệm 5 phút, không kèm mã đăng nhập). Các API ghi trả kèm "các dòng đã đổi" để trình duyệt
   cập nhật tại chỗ, không phải tải lại toàn bộ dữ liệu. */
const REQ_T0_ = Date.now();
let DB_ = null, PATCH_ = null;
const SH_ = {}, LIST_ = {};
const PATCH_KEYS_ = {bgdRep:1,bgdMeet:1,bgdTask:1,kdAcc:1,kdSale:1,days:1,projects:1,tasks:1,time:1,blockers:1,subtasks:1,products:1,proposals:1,dailyReports:1};
function db_() { return DB_ || (DB_ = SpreadsheetApp.openById(CFG.DB_SPREADSHEET_ID)); }
function patchNote_(key,kind,row){
  delete LIST_[key];
  if(!PATCH_||!PATCH_KEYS_[key])return;
  const box=PATCH_[kind]||(PATCH_[kind]={});(box[key]=box[key]||[]).push(row);
}
/** Như guarded_, nhưng trả {__patch,__ms,value}: trình duyệt tự gỡ lớp bọc (rpc) và cập nhật dữ liệu tại chỗ. */
/** Xoá bộ đệm đọc (sau các thao tác ghi trực tiếp vào Sheet). */
function listReset_(){Object.keys(LIST_).forEach(k=>{delete LIST_[k];});Object.keys(HEAD_).forEach(k=>{delete HEAD_[k];});}
function guardedP_(func) {
  PATCH_={};const t=Date.now();
  try{const value=guarded_(func),ms=Date.now()-REQ_T0_;try{Logger.log('[SMEE perf] ghi %s ms (khoá+ghi %s ms)',ms,Date.now()-t);}catch(_e){}
    return {__patch:PATCH_,__ms:ms,value:value};}
  finally{PATCH_=null;}
}
const ENSURED_ = {};
function table_(key, layout) {
  if (SH_[key]) return SH_[key];
  let sh = db_().getSheetByName(CFG.TABLES[key]);
  if (!sh && (key === 'holidays' || key === 'subtasks' || key === 'products' || key === 'dailyReports' || key === 'proposals' || key === 'days' || key === 'kdAcc' || key === 'kdSale' || /^bgd/.test(key))) {
    sh = db_().insertSheet(CFG.TABLES[key]);
    const f = CFG.FIELDS[key];
    sh.getRange(1, 1, 1, f.length).setValues([f]).setBackground('#14346d').setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);sh.getRange(1, 1, sh.getMaxRows(), f.length).setNumberFormat('@');
  }
  if (!sh) throw new Error('Chưa cài đặt dữ liệu app. Chủ sở hữu hãy chạy setupApp().');
  if (!ENSURED_[key]) {
    if (BY_HEADER_[key]) {
      const columns = ensureNamedColumns_(sh, CFG.FIELDS[key]);
      if (layout) layout.columns = columns;
    } else ensureTrailingColumns_(sh, CFG.FIELDS[key]);
    ENSURED_[key] = true;
  }
  SH_[key] = sh;
  return sh;
}
/** Tự thêm các cột mới ở CUỐI bảng (vd gioDuKien) nếu Sheet cũ còn thiếu; không đụng các cột đã có. */
function ensureTrailingColumns_(sh, fields) {
  if (sh.getMaxColumns() < fields.length) sh.insertColumnsAfter(sh.getMaxColumns(), fields.length - sh.getMaxColumns());
  const head = sh.getRange(1, 1, 1, fields.length).getDisplayValues()[0];
  const filled = head.filter(Boolean).length;
  if (!filled || filled >= fields.length) return;
  if (head.slice(0, filled).join('|') !== fields.slice(0, filled).join('|')) return;
  const add = fields.slice(filled);
  sh.getRange(1, filled + 1, 1, add.length).setValues([add]).setBackground('#14346d').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(1, filled + 1, sh.getMaxRows(), add.length).setNumberFormat('@');
}
// Bảng đọc / ghi theo TÊN cột (không theo vị trí) — chạy đúng cả trước và sau khi dọn cột.
// BUILD 7.2: mọi bảng đọc / ghi theo TÊN cột (không theo vị trí) — xoá / chèn cột không làm lệch dữ liệu.
const BY_HEADER_={projects:true,tasks:true,time:true,blockers:true,audit:true,config:true,holidays:true,subtasks:true,products:true,dailyReports:true,proposals:true,days:true,kdAcc:true,kdSale:true,bgdRep:true,bgdMeet:true,bgdTask:true,bgdHist:true};
// BUILD 7.8.3: nhớ hàng tiêu đề trong MỘT lần gọi (đã đọc khi lấy dữ liệu) — bớt lượt đọc trước mỗi lần ghi.
const HEAD_={};
function headCols_(sh,fields) {
  const nm=sh.getName();let hd=HEAD_[nm];
  if(!hd){const w0=Math.max(sh.getLastColumn(),1);hd=HEAD_[nm]=sh.getRange(1,1,1,w0).getDisplayValues()[0].map(s=>String(s).trim());}
  const w=hd.length,head=hd;
  return {width:w,idx:fields.map(f=>head.indexOf(f))};
}
/** Bảng đọc theo tên cột: thêm ở cuối các cột còn thiếu (không đổi thứ tự / không xoá cột nào). */
function ensureNamedColumns_(sh, fields) {
  const w=Math.max(sh.getLastColumn(),1),head=sh.getRange(1,1,1,w).getDisplayValues()[0].map(s=>String(s).trim());
  if(!head.some(Boolean)){
    sh.getRange(1,1,1,fields.length).setValues([fields]);
    return {width:Math.max(w,fields.length),idx:fields.map((_,i)=>i)};
  }
  const add=fields.filter(f=>!head.includes(f));
  if(!add.length)return {width:w,idx:fields.map(f=>head.indexOf(f))};
  const at=w+1;if(sh.getMaxColumns()<at+add.length-1)sh.insertColumnsAfter(sh.getMaxColumns(),at+add.length-1-sh.getMaxColumns());
  sh.getRange(1,at,1,add.length).setValues([add]).setBackground('#14346d').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(1,at,sh.getMaxRows(),add.length).setNumberFormat('@');
  head.push(...add);delete HEAD_[sh.getName()];
  return {width:head.length,idx:fields.map(f=>head.indexOf(f))};
}
// BUILD 7.2 — Ngày giờ luôn ở dạng chữ "yyyy-MM-ddTHH:mm" (giờ) / "yyyy-MM-dd" (ngày) / "yyyy-MM-ddTHH:mm:ss" (thời điểm lưu).
// Ô bị Google Sheet tự đổi sang kiểu ngày-giờ (hiển thị "2026-11-10 08:00", "10/11/2026 8:00:00"…) được đọc lại từ giá trị gốc rồi chuẩn hoá.
const DT_FIELDS_={han:'d',thoiGianHoanThanh:'m',batDau:'m',ketThuc:'m',batDauCho:'m',duKienTiepTuc:'m',ketThucCho:'m',ngayHoanThanh:'m',
  ngay:'d',ngayGhi:'d',deadline:'d',ngayBatDau:'d',ngayKetThuc:'d',
  createdAt:'s',updatedAt:'s',thoiGian:'s',thoiGianTao:'s',thoiGianCapNhat:'s',guiDuyetLuc:'s',duyetLuc:'s'};
const ISO_OK_=/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
let SS_TZ_=null;function ssTz_(){if(!SS_TZ_){try{SS_TZ_=db_().getSpreadsheetTimeZone()||CFG.TIME_ZONE;}catch(_e){SS_TZ_=CFG.TIME_ZONE;}}return SS_TZ_;}
function normDt_(kind,disp,raw) {
  if(raw instanceof Date&&!isNaN(raw.getTime()))return Utilities.formatDate(raw,ssTz_(),kind==='d'?'yyyy-MM-dd':kind==='s'?"yyyy-MM-dd'T'HH:mm:ss":"yyyy-MM-dd'T'HH:mm");
  const s=String(disp==null?'':disp).trim();if(!s||ISO_OK_.test(s))return s;
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(!m){const v=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);if(v)m=[v[0],v[3],v[2],v[1],v[4],v[5],v[6]];}
  if(!m)return s;
  const p=x=>String(x).padStart(2,'0'),d=m[1]+'-'+p(m[2])+'-'+p(m[3]);if(kind==='d'||m[4]==null)return d+(kind==='d'||m[4]==null?'':'');
  return d+'T'+p(m[4])+':'+m[5]+(kind==='s'?':'+(m[6]?p(m[6]):'00'):'');
}
function fixDates_(sh,objs,fields,colOf) {
  const bad=[];objs.forEach((o,n)=>fields.forEach(f=>{if(DT_FIELDS_[f]&&o[f]&&!ISO_OK_.test(o[f]))bad.push([n,f]);}));
  if(!bad.length)return objs;
  const width=Math.max(...fields.map(colOf).filter(i=>i>=0))+1,raw=sh.getRange(2,1,objs.length?objs[objs.length-1]._row-1:1,width).getValues();
  bad.forEach(([n,f])=>{const o=objs[n],ci=colOf(f);o[f]=normDt_(DT_FIELDS_[f],o[f],raw[o._row-2]?raw[o._row-2][ci]:null);});
  return objs;
}
function list_(key) {
  if (!LIST_[key]) LIST_[key] = readList_(key);
  return LIST_[key].map(o => Object.assign({}, o));
}
function readList_(key) {
  // BUILD 7.8.3: bảng theo tên cột — đọc tiêu đề + dữ liệu trong MỘT lần (trước đây 2–3 lần / tab khi đăng nhập).
  if (BY_HEADER_[key] && !SH_[key]) {
    const sh0 = db_().getSheetByName(CFG.TABLES[key]);
    if (sh0) {
      const fields = CFG.FIELDS[key], last = sh0.getLastRow(), w = Math.max(sh0.getLastColumn(), 1);
      const all = sh0.getRange(1, 1, Math.max(last, 1), w).getDisplayValues(), head = all[0].map(s => String(s).trim());HEAD_[sh0.getName()]=head;
      if (fields.every(f => head.includes(f))) {
        SH_[key] = sh0; ENSURED_[key] = true;
        if (last < 2) return [];
        const idx = fields.map(f => head.indexOf(f));
        const objs = all.slice(1).map((r, n) => { const obj = {_row:n+2}; fields.forEach((f, i) => obj[f] = idx[i] >= 0 ? (r[idx[i]] || '') : ''); return obj; })
          .filter(o => o[fields[0]] !== '');
        return fixDates_(sh0, objs, fields, f => idx[fields.indexOf(f)]);
      }
    }
  }
  const layout = {}, sh = table_(key, layout), fields = CFG.FIELDS[key], last = sh.getLastRow();
  if (last < 2) return [];
  if (BY_HEADER_[key]) {
    const hc=layout.columns||headCols_(sh,fields);
    const objs=sh.getRange(2,1,last-1,hc.width).getDisplayValues().map((r,n)=>{
      const obj={_row:n+2};fields.forEach((f,i)=>obj[f]=hc.idx[i]>=0?(r[hc.idx[i]]||''):'');return obj;
    }).filter(o=>o[fields[0]]!=='');
    return fixDates_(sh,objs,fields,f=>hc.idx[fields.indexOf(f)]);
  }
  const objs=sh.getRange(2, 1, last-1, fields.length).getDisplayValues().map((r, n) => {
    const obj = {_row:n+2}; fields.forEach((f,i) => obj[f] = r[i] || ''); return obj;
  }).filter(o => o[fields[0]] !== '');
  return fixDates_(sh,objs,fields,f=>fields.indexOf(f));
}
function find_(key,id) { return list_(key).find(r => r.id === String(id)); }
function cell_(v) {
  if (v == null) return '';
  const s = String(v).replace(/\u0000/g, '');
  return /^[=+@]/.test(s) ? "'"+s : s;
}
function append_(key,obj,layout={}) {
  const fields = CFG.FIELDS[key],sh=table_(key,layout);patchNote_(key,'up',strip_(obj));
  const put=row=>{const rg=sh.getRange((layout.lastRow??sh.getLastRow())+1,1,1,row.length);rg.setNumberFormat('@');rg.setValues([row]);};
  if (BY_HEADER_[key]) {const hc=layout.columns||headCols_(sh,fields),row=new Array(hc.width).fill('');fields.forEach((f,i)=>{if(hc.idx[i]>=0)row[hc.idx[i]]=cell_(obj[f]);});put(row);return;}
  put(fields.map(f=>cell_(obj[f])));
}
function update_(key,old,obj,layout={}) {
  const fields = CFG.FIELDS[key],sh=table_(key,layout);patchNote_(key,'up',Object.assign(strip_(old),strip_(obj)));
  if (BY_HEADER_[key]) {const hc=layout.columns||headCols_(sh,fields),rg=sh.getRange(old._row,1,1,hc.width),row=layout.saved?.row===old._row?layout.saved.cells.slice():rg.getDisplayValues()[0];fields.forEach((f,i)=>{if(hc.idx[i]>=0)row[hc.idx[i]]=cell_(obj[f]);});rg.setNumberFormat('@');rg.setValues([row]);return;}
  const rg=sh.getRange(old._row, 1, 1, fields.length);rg.setNumberFormat('@');rg.setValues([fields.map(f=>cell_(obj[f]))]);
}
function remove_(key,rec) { table_(key).deleteRow(rec._row);patchNote_(key,'del',rec.id); }
function now_() { return Utilities.formatDate(new Date(), CFG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss"); }
function norm_(s) {
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D')
    .toLowerCase().replace(/[^a-z0-9]+/g,'');
}
function digest_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s).map(b=>('0'+(b&255).toString(16)).slice(-2)).join(''); }
function uuid_() { return Utilities.getUuid(); }
function audit_(actor,verb,kind,id,info) {
  append_('audit',{id:uuid_(),thoiGian:now_(),actor,hanhDong:verb,loai:kind,doiTuongId:id,noiDung:JSON.stringify(info||{}).slice(0,1200)});
}
function guarded_(func) {
  const lock=LockService.getScriptLock();
  lock.waitLock(25000);
  try { return func(); } finally { lock.releaseLock(); }
}
function byGid_(id,gid) {
  const sh = SpreadsheetApp.openById(id).getSheets().find(x=>x.getSheetId()===Number(gid));
  if (!sh) throw new Error('Không tìm thấy tab gid='+gid+' trong file Sheets: '+id);
  return sh;
}
function employeeMapping_() {
  const sh=byGid_(CFG.EMPLOYEE_SPREADSHEET_ID,CFG.EMPLOYEE_GID);
  const n=Math.min(20,sh.getLastRow());
  if (!n) throw new Error('Sheet nhân sự đang trống.');
  const h=sh.getRange(1,1,n,sh.getLastColumn()).getDisplayValues();
  const variants = {
    pass:/^(passappduan|passduan|matkhauappduan|appduanpass|passwordduan)$/,
    name:/^(hovaten|hoten|tennhanvien|nhanvien|ten|hotennhanvien|fullname)$/,
    empId:/^(manhanvien|manv|employeeid|maso)$/,
    role:/^(chucvu|vaitro|chucdanh|vitri|position|role)$/,
    dept:/^(phongban|bophan|nhom|team|department)$/,
    status:/^(trangthai|trangthainhanvien|tinhtrang|tinhtranglamviec|trangthailamviec|tinhtrangcongtac|lamviec|nghiviec|trangthaicongtac)$/,
    email:/^(email|emailcongty|thudientu|mail)$/
  };
  let idx=-1;
  for(let r=0;r<h.length;r++) if(h[r].some(c=>variants.pass.test(norm_(c)))) {idx=r;break;}
  if(idx<0) throw new Error('Không tìm thấy tiêu đề "Pass App Dự án" trong 20 dòng đầu sheet nhân sự.');
  const heads=h[idx].map(norm_);
  const lookup=k=>heads.findIndex(x=>variants[k].test(x));
  const map={sheet:sh,headerRow:idx+1};
  Object.keys(variants).forEach(k=>map[k]=lookup(k));
  if(map.pass<0||map.name<0) throw new Error('Sheet nhân sự thiếu cột mã đăng nhập hoặc Họ tên.');
  return map;
}
function isActive_(raw) {
  const s=norm_(raw);
  if(!s || /nghi|thoiviec|inactive|terminated|khongcon|chamdut|khonglam|dungviec|offboard/.test(s)) return false;
  return /^(hoatdong|danglam|dangcongtac|danghoatdong|chinhthuc|thuviec|active|working|conglam|conlam|dilam|nhanvien|1|yes|true)$/.test(s);
}
function isManagerRole_(role,dept) {
  const s=norm_(role)+' '+norm_(dept);
  return /giamdoc|trolygiamdoc|account|director/.test(s);
}
let EMP_FULL_=null, EMP_LITE_=null;
const EMP_CACHE_KEY_='emp_v5134';
function employees_(all,needPass) {
  let list;
  if(needPass||EMP_FULL_) list=EMP_FULL_||(EMP_FULL_=readEmployees_());
  else if(EMP_LITE_) list=EMP_LITE_;
  else {
    let hit=null;try{const raw=CacheService.getScriptCache().get(EMP_CACHE_KEY_);if(raw)hit=JSON.parse(raw);}catch(_e){}
    list=hit?(EMP_LITE_=hit):(EMP_FULL_=readEmployees_());
  }
  return list.filter(e=>all||e.active).map(e=>Object.assign({},e));
}
/** BUILD 7.8.3 — đăng nhập nhanh: lưu vị trí cột của sheet nhân sự (không có mã) 6 giờ; chỉ đọc CỘT MÃ để so khớp, thông tin người lấy từ bộ đệm 5 phút. */
const EMP_MAP_KEY_='emp_map_v77';
let EMP_SHEET_=null;
const EMP_COLS_=['pass','name','empId','email','role','dept','status'];
function empSheetFast_(){if(EMP_SHEET_)return EMP_SHEET_;let m=null;try{const raw=CacheService.getScriptCache().get(EMP_MAP_KEY_);if(raw)m=JSON.parse(raw);}catch(_e){}
  if(m&&EMP_COLS_.every(k=>typeof m[k]==='number')){const sh=SpreadsheetApp.openById(CFG.EMPLOYEE_SPREADSHEET_ID).getSheetByName(m.sheetName);if(sh&&sh.getSheetId()===Number(CFG.EMPLOYEE_GID))return (EMP_SHEET_={sh:sh,m:m});}
  const full=employeeMapping_();m={sheetName:full.sheet.getName(),headerRow:full.headerRow};EMP_COLS_.forEach(k=>{m[k]=full[k];});
  try{CacheService.getScriptCache().put(EMP_MAP_KEY_,JSON.stringify(m),21600);}catch(_e){}return (EMP_SHEET_={sh:full.sheet,m:m});}
/** Dựng 1 nhân sự từ 1 dòng sheet (cùng quy tắc ở mọi nơi). */
function empFromRow_(m,r,rowNo){const v=k=>m[k]<0?'':String(r[m[k]]||'').trim();const name=v('name'),empId=v('empId'),email=v('email'),role=v('role'),dept=v('dept');
  return {key:'nv_'+digest_(empId?'id:'+empId:(email?'mail:'+email:'name:'+name)).slice(0,18),name,empId,email,role,department:dept,active:isActive_(v('status')),manager:isManagerRole_(role,dept),pass:v('pass'),_row:rowNo};}
function loginLookup_(pass){
  const f=empSheetFast_(),last=f.sh.getLastRow();if(last<=f.m.headerRow)return {found:[],directory:[]};
  const col=f.sh.getRange(f.m.headerRow+1,f.m.pass+1,last-f.m.headerRow,1).getDisplayValues(),rows=[];
  col.forEach((r,n)=>{if(String(r[0]||'').trim()===pass)rows.push(f.m.headerRow+1+n);});
  if(rows.length!==1)return {found:[],directory:[]};
  // BUILD 7.8.3: người đăng nhập dựng từ CHÍNH dòng vừa khớp mã (vai trò, phòng ban, tình trạng luôn mới); danh sách người khác lấy từ bộ đệm.
  const w=Math.max(...EMP_COLS_.map(k=>f.m[k]))+1,me=empFromRow_(f.m,f.sh.getRange(rows[0],1,1,w).getDisplayValues()[0],rows[0]);
  if(me.pass!==pass||!me.name)return {found:[],directory:[]};
  me.pass='*';let directory=employees_(true);if(!directory.some(e=>e.key===me.key))directory=directory.concat([me]);
  return {found:[me],directory:directory};}
function readEmployees_() {
  const list=readEmployeesRaw_();
  try{CacheService.getScriptCache().put(EMP_CACHE_KEY_,JSON.stringify(list.map(e=>Object.assign({},e,{pass:'*'}))),600);}catch(_e){}
  return list;
}
function readEmployeesRaw_() {
  // BUILD 7.8.3: dùng vị trí cột đã lưu đệm (không dò lại tiêu đề, không duyệt mọi tab) và chỉ đọc tới cột cuối cần dùng.
  try{const f=empSheetFast_(),last=f.sh.getLastRow();if(f.m.status<0)throw new Error('no status');
    if(last<=f.m.headerRow)return [];const w=Math.max(...EMP_COLS_.map(k=>f.m[k]))+1;
    return f.sh.getRange(f.m.headerRow+1,1,last-f.m.headerRow,w).getDisplayValues().map((r,n)=>empFromRow_(f.m,r,f.m.headerRow+1+n)).filter(e=>e.name&&e.pass);
  }catch(_e){}
  const m=employeeMapping_();
  if(m.status<0) throw new Error('Chưa xác định được cột tình trạng làm việc trong Sheets nhân sự. Hãy bổ sung cột hoặc báo tên cột để cấu hình; hệ thống đang chặn đăng nhập để không cho nhân sự nghỉ việc truy cập.');
  const rows=m.sheet.getLastRow()>m.headerRow?
    m.sheet.getRange(m.headerRow+1,1,m.sheet.getLastRow()-m.headerRow,m.sheet.getLastColumn()).getDisplayValues():[];
  return rows.map((r,n)=>{
    const v=k=>m[k]<0?'':String(r[m[k]]||'').trim();
    const name=v('name'), pass=v('pass'), role=v('role'),dept=v('dept'), status=v('status');
    const empId=v('empId'),email=v('email');
    return {key:'nv_'+digest_(empId?'id:'+empId:(email?'mail:'+email:'name:'+name)).slice(0,18),name,empId,email,role,department:dept,
      active:isActive_(status),manager:isManagerRole_(role,dept),pass,_row:m.headerRow+1+n};
  }).filter(e=>e.name && e.pass);
}

/** BUILD 7.2 — vai trò báo cáo Account / Sale. Sếp = Giám đốc / Trợ lý GĐ (xem tất cả, nhận xét). */
function isBoss_(e){const s=norm_(e.role)+' '+norm_(e.department);return /giamdoc|trolygiamdoc|director/.test(s);}
function isAccount_(e){const s=norm_(e.role)+' '+norm_(e.department);return /account/.test(s)&&!isBoss_(e);}
function isSale_(e){const s=norm_(e.role)+' '+norm_(e.department);return /sale|kinhdoanh/.test(s)&&!isBoss_(e);}
/** BUILD 7.2 — quyền Ban Giám đốc (giống app Trợ lý GĐ): nhập = Tổng GĐ / GĐ / Trợ lý GĐ; xem & đánh giá = Tổng GĐ / GĐ. */
function bgdRole_(e){const p=norm_(e.role),d=norm_(e.department);
  const entry=['tonggiamdoc','giamdoc','trolygiamdoc','trolytonggiamdoc','trolybangiamdoc'].indexOf(p)>=0||(p==='troly'&&d==='bangiamdoc');
  return {entry:entry,review:['tonggiamdoc','giamdoc'].indexOf(p)>=0};}
function mustBgd_(e,review){const r=bgdRole_(e);if(!(review?r.review:r.entry))throw new Error(review?'Chỉ Tổng Giám đốc / Giám đốc được thực hiện.':'Chỉ Ban Giám đốc / Trợ lý Giám đốc được truy cập mục này.');return r;}
function bgdDepts_(){const s={};employees_(false).forEach(x=>{const d=String(x.department||'').trim();if(d&&norm_(d)!=='bangiamdoc')s[d]=1;});return Object.keys(s).sort((a,b)=>a.localeCompare(b,'vi'));}
/** Telegram: mã bot và chat ID lưu trong Script Properties (không ghi trong code). */
const BGD_TG_DEFAULT_={chat:'-5322172750',review:'-5518082093'};
function bgdTgCfg_(){const p=PropertiesService.getScriptProperties();return {token:p.getProperty('BGD_TG_TOKEN')||'',chat:p.getProperty('BGD_TG_CHAT')||BGD_TG_DEFAULT_.chat,review:p.getProperty('BGD_TG_REVIEW_CHAT')||BGD_TG_DEFAULT_.review};}
function bgdTgSend_(html,chat){const c=bgdTgCfg_();if(!c.token)throw new Error('Chưa cấu hình Telegram');const bare=String(chat).replace(/^-100|^-/,'');const cands=[String(chat),'-'+bare,'-100'+bare].filter((v,i,a)=>a.indexOf(v)===i);let last='';
  for(let i=0;i<cands.length;i++){const res=UrlFetchApp.fetch('https://api.telegram.org/bot'+c.token+'/sendMessage',{method:'post',contentType:'application/json',muteHttpExceptions:true,payload:JSON.stringify({chat_id:cands[i],text:html,parse_mode:'HTML',disable_web_page_preview:true})});
    if(res.getResponseCode()===200)return;last=res.getContentText();if(!/chat not found/i.test(last))break;}
  throw new Error('Telegram: '+String(last).slice(0,200));}
function bgdTgChunks_(header,blocks){const out=[];let cur=header;blocks.forEach(b=>{if((cur+'\n'+b).length>3800&&cur!==header){out.push(cur);cur=header+'(tiếp)\n';}let rest=b;while((cur+'\n'+rest).length>3800){const room=3800-cur.length-1;out.push(cur+'\n'+rest.slice(0,room));rest=rest.slice(room);cur=header+'(tiếp)\n';}cur+='\n'+rest;});out.push(cur);return out;}
function tgEsc_(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/** Nhập báo cáo theo phòng ban: mỗi phòng 1 dòng; gửi 1 tin Telegram gộp. items:[{dept,text}] */
function apiBgdSubmit(token,items) {
  const e=session_(token);mustBgd_(e,false);
  const depts=bgdDepts_(),clean=(Array.isArray(items)?items:[]).map(i=>({dept:trimmed_(i&&i.dept,200),text:trimmed_(i&&i.text,20000)})).filter(i=>i.dept&&i.text);
  if(!clean.length)throw new Error('Chưa có nội dung báo cáo nào.');
  const bad=clean.find(i=>depts.indexOf(i.dept)<0);if(bad)throw new Error('Phòng ban không hợp lệ: '+bad.dept);
  const saved=guardedP_(()=>{const day=now_().slice(0,10),stamp=now_().replace(/[^\d]/g,'').slice(0,14),rows=[];
    clean.forEach((it,i)=>{const r={id:'BC'+stamp+'-'+uuid_().slice(0,6)+'-'+(i+1),ngay:day,nguoiBaoCao:e.name,nguoiBaoCaoKey:e.key,phongBan:it.dept,noiDung:it.text,telegram:'Chưa gửi',danhGia:'',ghiChuGD:'',nguoiDanhGia:'',thoiGianDanhGia:'',createdAt:now_()};append_('bgdRep',r);rows.push(r);});
    audit_(e.name,'Gửi','Báo cáo Giám đốc','',{soPhong:rows.length});return rows;}).value;
  let tg='ok',tgErr='';
  try{const c=bgdTgCfg_();if(!c.token){tg='none';tgErr='Chưa cấu hình Telegram';}
    else{const head='📋 <b>BÁO CÁO GIÁM ĐỐC</b>\n👤 Người báo cáo: <b>'+tgEsc_(e.name)+'</b>\n📅 Ngày: '+saved[0].ngay.split('-').reverse().join('/')+'\n';
      bgdTgChunks_(head,clean.map(it=>'<b>▪ '+tgEsc_(it.dept)+'</b>\n'+tgEsc_(it.text))).forEach(m=>bgdTgSend_(m,c.chat));}}
  catch(err){tg='error';tgErr=String(err.message||err);}
  const st=tg==='ok'?'Đã gửi':tg==='none'?'Chưa cấu hình':'Lỗi gửi';
  const res=guardedP_(()=>{const ids={};saved.forEach(r=>ids[r.id]=1);list_('bgdRep').filter(r=>ids[r.id]).forEach(r=>{const n=strip_(r);n.telegram=st;update_('bgdRep',r,n);});return true;});
  return {__patch:res.__patch,__ms:res.__ms,value:{saved:saved.length,telegram:tg,telegramError:tgErr}};
}
/** BUILD 7.2 — Tổng GĐ / GĐ đánh giá (Tốt / Khá / Trung bình / Kém) + ghi chú hàng loạt; gửi các thay đổi vào nhóm Telegram đánh giá. items:[{id,danhGia,ghiChuGD}] */
const BGD_LEVELS_=['Tốt','Khá','Trung bình','Kém'];
function apiBgdReview(token,items) {
  const e=session_(token);mustBgd_(e,true);items=Array.isArray(items)?items:[];if(!items.length)return {saved:0};
  const changes=[];
  const res=guardedP_(()=>{const all={};list_('bgdRep').forEach(r=>{all[r.id]=r;});let saved=0,missing=0;
    items.forEach(it=>{const lv=String(it&&it.danhGia||'').trim(),note=String(it&&it.ghiChuGD==null?'':it.ghiChuGD).slice(0,5000);
      if(lv&&BGD_LEVELS_.indexOf(lv)<0)throw new Error('Mức đánh giá không hợp lệ.');const r=all[String(it.id)];if(!r){missing++;return;}
      if((r.danhGia||'')===lv&&(r.ghiChuGD||'')===note)return;
      const n=strip_(r);n.danhGia=lv;n.ghiChuGD=note;n.nguoiDanhGia=e.name;n.thoiGianDanhGia=now_();update_('bgdRep',r,n);saved++;
      if(lv||note)changes.push(n);});
    if(saved)audit_(e.name,'Đánh giá','Báo cáo Giám đốc','',{soDong:saved});return {saved:saved,missing:missing};});
  let tg='none',tgErr='';
  if(changes.length){try{const c=bgdTgCfg_();if(!c.token){tgErr='Chưa cấu hình Telegram';}else{
      const head='📝 <b>ĐÁNH GIÁ BÁO CÁO</b>\n👤 '+tgEsc_(e.name)+' ('+tgEsc_(e.role||'')+')\n🕒 '+now_().slice(0,16).replace('T',' ')+'\n',groups={},order=[];
      changes.forEach(c2=>{const k=c2.nguoiBaoCao+'|'+c2.ngay;if(!groups[k]){groups[k]=[];order.push(k);}groups[k].push(c2);});
      const blocks=order.map(k=>{const g=groups[k];return '👥 <b>'+tgEsc_(g[0].nguoiBaoCao)+'</b> - báo cáo ngày '+String(g[0].ngay).split('-').reverse().join('/')+'\n'+g.map(c2=>{const sn=String(c2.noiDung||'');return '▪ <b>'+tgEsc_(c2.phongBan)+'</b>: <i>'+tgEsc_(sn.length>160?sn.slice(0,160)+'…':sn)+'</i>'+(c2.danhGia?'\n   ⭐ Đánh giá: <b>'+tgEsc_(c2.danhGia)+'</b>':'')+(c2.ghiChuGD?'\n   💬 Ghi chú: '+tgEsc_(c2.ghiChuGD):'');}).join('\n');});
      bgdTgChunks_(head,blocks).forEach(m=>bgdTgSend_(m,c.review));tg='ok';}}catch(err){tg='error';tgErr=String(err.message||err);}}
  res.value.telegram=tg;res.value.telegramError=tgErr;return res;
}
/** BUILD 7.2 — Nhiệm vụ sau cuộc họp (giống app Trợ lý GĐ cũ): cuộc họp, nhiệm vụ, lịch sử cập nhật, xóa mềm. */
const BGD_HOP_={TYPES:['Họp giao ban','Họp điều hành','Họp dự án','Họp khách hàng','Khác'],PRIORITIES:['Cao','Trung bình','Thấp'],
  STATUSES:['Chưa bắt đầu','Đang thực hiện','Chờ duyệt','Hoàn thành','Tạm dừng'],MEETING_STATUSES:['Đang theo dõi','Đã kết thúc']};
function hopUrl2_(v){const s=trimmed_(v,1000);if(s&&!/^https?:\/\//i.test(s))throw new Error('Link phải bắt đầu bằng http:// hoặc https://');return s;}
function hopDate2_(v,req,label){const s=String(v||'').trim();if(!s){if(req)throw new Error('Thiếu '+label+'.');return '';}return parseDate_(s);}
function hopMeetClean_(raw){raw=raw||{};const m={ngay:hopDate2_(raw.ngay,true,'ngày họp'),tieuDe:trimmed_(raw.tieuDe,250),loai:trimmed_(raw.loai,80),chuTri:trimmed_(raw.chuTri,120),thanhPhan:trimmed_(raw.thanhPhan,1000),ketLuan:trimmed_(raw.ketLuan,4000),linkBienBan:hopUrl2_(raw.linkBienBan)};
  if(!m.tieuDe)throw new Error('Thiếu tiêu đề buổi họp.');if(BGD_HOP_.TYPES.indexOf(m.loai)<0)throw new Error('Loại cuộc họp không hợp lệ.');return m;}
function hopTaskClean_(raw,meetDate){raw=raw||{};const ps=String(raw.tienDo==null||raw.tienDo===''?'0':raw.tienDo).trim(),p=Number(ps);
  const t={noiDung:trimmed_(raw.noiDung,1500),duAn:trimmed_(raw.duAn,150),phongBan:trimmed_(raw.phongBan,120),nguoiPhuTrach:trimmed_(raw.nguoiPhuTrach,120),nguoiPhoiHop:trimmed_(raw.nguoiPhoiHop,300),han:hopDate2_(raw.han,false,'hạn'),
    uuTien:trimmed_(raw.uuTien||'Trung bình',30),trangThai:trimmed_(raw.trangThai||'Chưa bắt đầu',50),tienDo:p,link:hopUrl2_(raw.link),ghiChu:trimmed_(raw.ghiChu,3000)};
  if(!t.noiDung||!t.nguoiPhuTrach)throw new Error('Mỗi nhiệm vụ phải có nội dung và người phụ trách.');
  if(BGD_HOP_.PRIORITIES.indexOf(t.uuTien)<0)throw new Error('Mức ưu tiên không hợp lệ.');if(BGD_HOP_.STATUSES.indexOf(t.trangThai)<0)throw new Error('Trạng thái không hợp lệ.');
  if(!/^\d+$/.test(ps)||!Number.isInteger(p)||p<0||p>100)throw new Error('Tiến độ phải là số nguyên từ 0 đến 100.');
  if(t.trangThai==='Hoàn thành')t.tienDo=100;if(t.trangThai!=='Hoàn thành'&&t.tienDo===100)throw new Error('Tiến độ 100% phải kèm trạng thái Hoàn thành.');
  if(t.han&&meetDate&&t.han<meetDate)throw new Error('Hạn hoàn thành không được sớm hơn ngày họp.');t.tienDo=String(t.tienDo);return t;}
function hopId2_(p){return p+now_().slice(0,10).replace(/-/g,'')+'-'+uuid_().slice(0,8).toUpperCase();}
function hopHist_(taskId,meetId,user,before,after,note,link,ts){append_('bgdHist',{id:hopId2_('LS-'),nhiemVuId:taskId,cuocHopId:meetId,thoiGian:ts,nguoiCapNhat:user,trangThaiTruoc:before.trangThai||'',trangThaiSau:after.trangThai||'',
  tienDoTruoc:before.tienDo==null?'':String(before.tienDo),tienDoSau:after.tienDo==null?'':String(after.tienDo),noiDung:note||'',link:link||''});}
function hopMeet_(id){const m=find_('bgdMeet',id);if(!m)throw new Error('Không tìm thấy cuộc họp.');if(m.xoaLuc)throw new Error('Cuộc họp đã bị xóa.');return m;}
function hopFresh_(rec,exp,what){if(String(rec.updatedAt||'')!==String(exp||''))throw new Error(what+' đã được người khác cập nhật. Vui lòng tải lại trước khi lưu.');}
function apiBgdMeetCreate(token,payload){const e=session_(token);mustBgd_(e,false);payload=payload||{};const m=hopMeetClean_(payload.meeting);const raws=Array.isArray(payload.tasks)?payload.tasks:[];
  if(raws.length>100)throw new Error('Tối đa 100 nhiệm vụ mỗi lần nhập.');const tasks=raws.map(t=>hopTaskClean_(t,m.ngay));
  return guardedP_(()=>{const ts=now_(),id=hopId2_('HOP-');append_('bgdMeet',Object.assign({id:id},m,{nguoiLap:e.name,trangThai:'Đang theo dõi',createdAt:ts,updatedAt:ts,xoaLuc:'',nguoiXoa:''}));
    tasks.forEach(t=>{const tid=hopId2_('NV-');append_('bgdTask',Object.assign({id:tid,cuocHopId:id},t,{ngayGiao:m.ngay,nguoiGiao:e.name,nguoiCapNhat:e.name,updatedAt:ts,hoanThanhLuc:t.trangThai==='Hoàn thành'?ts:'',xoaLuc:'',nguoiXoa:''}));
      hopHist_(tid,id,e.name,{},t,'Tạo nhiệm vụ từ cuộc họp',t.link,ts);});
    audit_(e.name,'Tạo','Cuộc họp',id,{nhiemVu:tasks.length});return {id:id,totalTasks:tasks.length};});}
function apiBgdMeetUpdate(token,payload){const e=session_(token);mustBgd_(e,false);payload=payload||{};const m=hopMeetClean_(payload);const st=trimmed_(payload.trangThai||'Đang theo dõi',50);
  if(BGD_HOP_.MEETING_STATUSES.indexOf(st)<0)throw new Error('Trạng thái cuộc họp không hợp lệ.');
  return guardedP_(()=>{const old=hopMeet_(trimmed_(payload.id,60));hopFresh_(old,payload.expectedUpdatedAt,'Buổi họp');
    const n=Object.assign(strip_(old),m,{trangThai:st,updatedAt:now_()});update_('bgdMeet',old,n);audit_(e.name,'Sửa','Cuộc họp',old.id,{});return {id:old.id};});}
function apiBgdTaskCreate(token,payload){const e=session_(token);mustBgd_(e,false);payload=payload||{};
  return guardedP_(()=>{const m=hopMeet_(trimmed_(payload.meetingId,60));if(m.trangThai==='Đã kết thúc')throw new Error('Cuộc họp đã kết thúc. Vui lòng mở lại trước khi bổ sung nhiệm vụ.');
    const t=hopTaskClean_(payload.task,m.ngay),ts=now_(),id=hopId2_('NV-');
    append_('bgdTask',Object.assign({id:id,cuocHopId:m.id},t,{ngayGiao:m.ngay,nguoiGiao:e.name,nguoiCapNhat:e.name,updatedAt:ts,hoanThanhLuc:t.trangThai==='Hoàn thành'?ts:'',xoaLuc:'',nguoiXoa:''}));
    hopHist_(id,m.id,e.name,{},t,'Bổ sung nhiệm vụ sau cuộc họp',t.link,ts);audit_(e.name,'Tạo','Nhiệm vụ cuộc họp',id,{});return {id:id};});}
function apiBgdTaskUpdate(token,payload){const e=session_(token);mustBgd_(e,false);payload=payload||{};
  return guardedP_(()=>{const old=find_('bgdTask',trimmed_(payload.id,60));if(!old)throw new Error('Không tìm thấy nhiệm vụ.');if(old.xoaLuc)throw new Error('Nhiệm vụ đã được xóa, không thể chỉnh sửa.');
    hopFresh_(old,payload.expectedUpdatedAt,'Nhiệm vụ');const m=hopMeet_(old.cuocHopId);const t=hopTaskClean_(payload,m.ngay);
    const note=trimmed_(payload.updateMessage,2000);if(!note)throw new Error('Cần nhập nội dung cập nhật để lưu vào lịch sử nhiệm vụ.');const ts=now_();
    let done=old.hoanThanhLuc||'';if(t.trangThai==='Hoàn thành'&&old.trangThai!=='Hoàn thành')done=ts;if(t.trangThai!=='Hoàn thành')done='';
    const n=Object.assign(strip_(old),t,{ghiChu:note,nguoiCapNhat:e.name,updatedAt:ts,hoanThanhLuc:done});update_('bgdTask',old,n);
    hopHist_(old.id,old.cuocHopId,e.name,{trangThai:old.trangThai,tienDo:Number(old.tienDo)||0},t,note,t.link,ts);return {id:old.id,updatedAt:ts};});}
function apiBgdTaskDelete(token,payload){const e=session_(token);mustBgd_(e,false);payload=payload||{};
  return guardedP_(()=>{const old=find_('bgdTask',trimmed_(payload.id,60));if(!old)throw new Error('Không tìm thấy nhiệm vụ.');if(old.xoaLuc)throw new Error('Nhiệm vụ đã được xóa.');
    if(String(old.updatedAt||'')!==String(payload.expectedUpdatedAt||''))throw new Error('Nhiệm vụ vừa được cập nhật. Tải lại trước khi xóa.');const ts=now_();
    update_('bgdTask',old,Object.assign(strip_(old),{xoaLuc:ts,nguoiXoa:e.name}));
    hopHist_(old.id,old.cuocHopId,e.name,{trangThai:old.trangThai,tienDo:Number(old.tienDo)||0},{trangThai:'Đã xóa',tienDo:Number(old.tienDo)||0},'Xóa nhiệm vụ (lưu lịch sử, không xóa vĩnh viễn)',old.link,ts);
    audit_(e.name,'Xóa','Nhiệm vụ cuộc họp',old.id,{});return {id:old.id};});}
function apiBgdMeetDelete(token,payload){const e=session_(token);mustBgd_(e,false);payload=payload||{};
  return guardedP_(()=>{const old=hopMeet_(trimmed_(payload.id,60));if(String(old.updatedAt||'')!==String(payload.expectedUpdatedAt||''))throw new Error('Cuộc họp vừa được cập nhật. Tải lại trước khi xóa.');
    const ts=now_(),tasks=list_('bgdTask').filter(t=>t.cuocHopId===old.id&&!t.xoaLuc);update_('bgdMeet',old,Object.assign(strip_(old),{xoaLuc:ts,nguoiXoa:e.name}));
    tasks.forEach(t=>{update_('bgdTask',t,Object.assign(strip_(t),{xoaLuc:ts,nguoiXoa:e.name}));hopHist_(t.id,old.id,e.name,{trangThai:t.trangThai,tienDo:Number(t.tienDo)||0},{trangThai:'Đã xóa',tienDo:Number(t.tienDo)||0},'Xóa theo cuộc họp (lưu lịch sử, không xóa vĩnh viễn)',t.link,ts);});
    audit_(e.name,'Xóa','Cuộc họp',old.id,{nhiemVu:tasks.length});return {id:old.id,tasks:tasks.length};});}
function apiBgdHistory(token,taskId){const e=session_(token);mustBgd_(e,false);const id=trimmed_(taskId,60);
  return list_('bgdHist').filter(r=>r.nhiemVuId===id).map(strip_).sort((a,b)=>String(b.thoiGian).localeCompare(String(a.thoiGian))).slice(0,100);}

/** Chuyển dữ liệu từ app Trợ lý GĐ cũ — CHỈ ĐỌC Sheet cũ; bỏ qua ID đã có (chạy lại nhiều lần không trùng); giữ nguyên ID và thời gian. */
/** Cấu hình Telegram (chỉ Tổng GĐ / GĐ). Không bao giờ trả mã bot về trình duyệt — chỉ 4 ký tự cuối. */
function apiBgdTgInfo(token){const e=session_(token);mustBgd_(e,true);const c=bgdTgCfg_();return {hasToken:!!c.token,last4:c.token?c.token.slice(-4):'',chat:c.chat,review:c.review};}
function apiBgdTgSave(token,input){const e=session_(token);mustBgd_(e,true);input=input||{};const p=PropertiesService.getScriptProperties();
  const t=String(input.token||'').trim();if(t){if(!/^\d+:[\w-]{20,}$/.test(t))throw new Error('Mã bot không đúng dạng (vd 123456:ABC…).');p.setProperty('BGD_TG_TOKEN',t);}
  if(input.clearToken)p.deleteProperty('BGD_TG_TOKEN');
  const chat=String(input.chat||'').trim(),rv=String(input.review||'').trim();if(chat){if(!/^-?\d+$/.test(chat))throw new Error('Chat ID nhận báo cáo phải là số.');p.setProperty('BGD_TG_CHAT',chat);}
  if(rv){if(!/^-?\d+$/.test(rv))throw new Error('Chat ID nhận đánh giá phải là số.');p.setProperty('BGD_TG_REVIEW_CHAT',rv);}
  audit_(e.name,'Sửa','Cấu hình Telegram BGĐ','',{doiMa:!!t,xoaMa:!!input.clearToken});return apiBgdTgInfo(token);}
function apiBgdTgTest(token){const e=session_(token);mustBgd_(e,true);const c=bgdTgCfg_();if(!c.token)throw new Error('Chưa cấu hình Telegram');const out={};
  [['chat','nhóm nhận báo cáo'],['review','nhóm nhận đánh giá']].forEach(([k,l])=>{try{bgdTgSend_('✅ Gửi thử từ app SMEE ('+tgEsc_(e.name)+') — '+l,c[k]);out[k]='ok';}catch(err){out[k]=String(err.message||err).slice(0,200);}});return out;}
function kdAccess_(e,kind){if(isBoss_(e))return 'all';if(kind==='kdAcc'&&isAccount_(e))return 'own';if(kind==='kdSale'&&isSale_(e))return 'own';return '';}
function publicEmp_(e){const g=bgdRole_(e);return {key:e.key,name:e.name,empId:e.empId,role:e.role,department:e.department,manager:e.manager,kdAcc:kdAccess_(e,'kdAcc'),kdSale:kdAccess_(e,'kdSale'),boss:isBoss_(e),bgdEntry:g.entry,bgdReview:g.review};}
/** Truy cập tạm thời KHÔNG CẦN MẬT KHẨU app, chỉ dành cho Google account đã setupApp.
 * Đây là bảo vệ tối thiểu khi tắt phân quyền nội bộ. Không dùng để mở ra công chúng.
 */
function demoOwner_() {
  const saved = String(PropertiesService.getScriptProperties().getProperty('SMEE_DEMO_OWNER') || '').trim().toLowerCase();
  if (!saved) throw new Error('Chưa khởi tạo chế độ chạy thử. Mở Apps Script Editor và chạy setupApp() một lần bằng tài khoản Google chủ sở hữu.');
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!active || active !== saved) {
    throw new Error('Chế độ thử chỉ dành cho tài khoản Google chủ sở hữu. Hãy mở bằng đúng tài khoản đã chạy setupApp() và triển khai Web App ở mức Chỉ mình tôi.');
  }
  return {key:'smee_demo_owner',name:'Quản trị chạy thử',empId:'',email:active,
    role:'Giám đốc (chạy thử)',department:'Dự án',active:true,manager:true};
}
function session_(token) {
  if (CFG.DEMO_MODE) return demoOwner_();
  if(!token || typeof token!=='string'||token.length<20) throw new Error('Phiên đăng nhập không hợp lệ.');
  const raw=CacheService.getScriptCache().get('s_'+digest_(token));
  if(!raw) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
  const record=JSON.parse(raw), current=employees_(true).find(x=>x.key===record.key && x.active);
  if(!current) throw new Error('Tài khoản không còn quyền truy cập.');
  return current;
}
function mustManage_(emp){if(!emp.manager)throw new Error('Bạn không có quyền quản trị nội dung này.');}
function assigned_(task,emp){return task.nguoiPhuTrachId===emp.key;}
function mustEdit_(task,emp){if(!emp.manager&&!assigned_(task,emp))throw new Error('Chỉ người thực hiện được cập nhật công việc này.');}
function settings_() {
  const rows=list_('config');
  const s=rows.find(x=>x.key==='statuses');
  let statuses=CFG.DEFAULT_STATUSES;
  try {if(s && s.value) statuses=JSON.parse(s.value);} catch(_e){}
  // BUILD 7.2: luôn có trạng thái "Chưa bắt đầu" ở đầu danh sách.
  if(Array.isArray(statuses)&&statuses.indexOf('Chưa bắt đầu')<0)statuses=['Chưa bắt đầu'].concat(statuses);
  return {statuses,dayReportStatuses:CFG.DEFAULT_STATUSES,priorities:CFG.PRIORITIES,blockerCategories:CFG.BLOCKER_CATEGORIES,productTypes:productTypes_(rows),productStatuses:CFG.PRODUCT_STATUSES,
    workdayHours:8, timeApprovalRequired:false, lunch:lunch_(rows), workDays:workDays_(rows), readyPct:readyPct_(rows)};
}
/** Giờ nghỉ trưa {start,end} dạng "HH:mm": APP_CAU_HINH "lunchBreak" nếu hợp lệ, ngược lại CFG. */
function lunch_(rows) {
  const ok=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const row=(rows||list_('config')).find(x=>x.key==='lunchBreak');
  const m=row?String(row.value||'').match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/):null;
  const pad=s=>s.length===4?'0'+s:s;
  if(m&&ok(pad(m[1]))&&ok(pad(m[2]))&&pad(m[1])<pad(m[2]))return {start:pad(m[1]),end:pad(m[2])};
  return {start:CFG.LUNCH_START||'12:00',end:CFG.LUNCH_END||'13:30'};
}
/** Số phút của khoảng [startM,endM) (phút UTC từ timeMinutes_) rơi vào giờ nghỉ trưa, tính cho từng ngày. */
function lunchOverlapMinutes_(startM,endM,lunch) {
  const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
  const ls=toMin(lunch.start),le=toMin(lunch.end);let total=0;
  for(let day=Math.floor(startM/1440)*1440;day<endM;day+=1440){
    total+=Math.max(0,Math.min(endM,day+le)-Math.max(startM,day+ls));
  }
  return total;
}
function apiLogin(code, loadData, retireColumns, sections) {
  if (CFG.DEMO_MODE) throw new Error('Hệ thống đang chạy thử không cần đăng nhập. Hãy tải lại trang.');
  const pass=String(code||'').trim();
  if(pass.length<6||pass.length>128)throw new Error('Mã đăng nhập không đúng.');
  // Không có IP đáng tin trong Apps Script Web App; chặn thử quá nhiều trên toàn hệ thống.
  const cache=CacheService.getScriptCache();
  const attempts=Number(cache.get('login_attempts_global')||'0');
  if(attempts>=150)throw new Error('Hệ thống tạm giới hạn đăng nhập. Hãy thử lại sau 15 phút.');
  const tEmp0=Date.now(),hit=loginLookup_(pass),directory=hit.directory,found=hit.found,tEmp=Date.now()-tEmp0;
  if(found.length!==1 || !found[0].active) {
    cache.put('login_attempts_global',String(attempts+1),900);
    Utilities.sleep(350);
    throw new Error('Mã không hợp lệ hoặc nhân viên đã nghỉ việc.');
  }
  const token=uuid_()+uuid_();
  cache.put('s_'+digest_(token),JSON.stringify({key:found[0].key}),CFG.SESSION_SECONDS);
  const result={token,me:publicEmp_(found[0]),expiresIn:CFG.SESSION_SECONDS};
  if(loadData!==true)return result;
  try {
    const tData0=Date.now(),data=bootstrapData_(found[0],retireColumns,sections,directory),perf={emp:tEmp,data:Date.now()-tData0,total:Date.now()-REQ_T0_,steps:data.perfSteps||{}};
    try{Logger.log('[SMEE perf] đăng nhập: nhân sự %s ms, dữ liệu %s ms, tổng %s ms',perf.emp,perf.data,perf.total);}catch(_e){}
    return {...result,data,perf};
  } catch(err) {
    try { cache.remove('s_'+digest_(token)); } catch(_e) {}
    throw new Error('Đã xác thực tài khoản nhưng không tải được dữ liệu: '+(err.message||String(err)));
  }
}
/** Kiểm tra Web App có nạp đúng server mới, KHÔNG tiết lộ dữ liệu nhân sự. */
function apiKiemTraKetNoi() {
  return {ok:true,build:'7.8.3',loginRequired:CFG.DEMO_MODE === false,serverTime:now_()};
}

/**
 * SMEE BUILD 7.8.3 — chạy CHỈ trong Apps Script Editor, KHÔNG gửi mật khẩu ra trình duyệt.
 * Thử đăng nhập kèm tải dữ liệu, rồi đăng xuất, bằng một mã nhân viên đang hoạt động
 * đọc nội bộ từ Sheet nhân sự. Tuyệt đối không log mã, token hoặc email.
 */
function kiemTraDangNhap() {
  const actor = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const executor = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!actor || actor !== executor) throw new Error('Chỉ tài khoản chủ sở hữu chạy kiemTraDangNhap trong Apps Script Editor.');
  if (CFG.DEMO_MODE !== false) throw new Error('Tắt DEMO_MODE trước khi kiểm tra đăng nhập.');
  const all = employees_(true,true);
  const counts = {};
  all.forEach(function(e){counts[e.pass] = (counts[e.pass] || 0) + 1;});
  const candidate = all.find(function(e){return e.active && e.pass.length >= 6 && e.pass.length <= 128 && counts[e.pass] === 1;});
  if (!candidate) throw new Error('Không có nhân viên hoạt động với mã 6-128 ký tự duy nhất để kiểm thử.');
  let token = '';
  try {
    const login = apiLogin(candidate.pass,true);
    if (!login || !login.token) throw new Error('apiLogin không trả token.');
    token = login.token;
    const result = login.data;
    if (!result || !result.me || result.me.key !== candidate.key || !Array.isArray(result.projects) ||
        !Array.isArray(result.tasks) || !Array.isArray(result.employees) || !Array.isArray(result.time) || !Array.isArray(result.blockers)) {
      throw new Error('apiBootstrap trả dữ liệu không đầy đủ hoặc sai tài khoản.');
    }
    const outcome = {ok:true,build:'7.8.3',projects:result.projects.length,tasks:result.tasks.length,
      timeEntries:result.time.length,blockers:result.blockers.length};
    Logger.log('[OK] SMEE BUILD 7.8.3: đăng nhập, tải dữ liệu và đăng xuất thành công. ' +
      'dự án=' + outcome.projects + ', công việc=' + outcome.tasks + ', lịch giờ=' + outcome.timeEntries +
      ', vướng mắc=' + outcome.blockers + '. Không ghi mật khẩu hoặc token vào nhật ký.');
    return outcome;
  } catch (e) {
    Logger.log('[LOI] SMEE BUILD 7.8.3: Kiểm thử đăng nhập/tải dữ liệu chưa thành công: ' +
      String(e && e.message || e).slice(0,250));
    throw e;
  } finally {
    if (token) apiLogout(token);
  }
}

function apiLogout(token){ if(token)CacheService.getScriptCache().remove('s_'+digest_(String(token)));return true; }
/** BUILD 7.2 — Nhân viên (không phải quản lý) chỉ nhận dữ liệu của chính mình. */
/** BUILD 7.2 — Quy tắc chặt: nhân viên chỉ thấy công việc mà mình là người thực hiện (nguoiPhuTrachId). */
/** BUILD 7.2 — người làm cùng của công việc (mã nhân viên). */
function coworkers_(t){return String(t&&t.nguoiLamCung||'').split(',').map(s=>s.trim()).filter(Boolean);}
/** Người thực hiện chính HOẶC người làm cùng. */
function worksOn_(t,key){return !!t&&t.nguoiPhuTrachId===key;} // BUILD 7.2: bỏ "người làm cùng" — chỉ người thực hiện
function mustWork_(t,emp){if(!emp.manager&&!worksOn_(t,emp.key))throw new Error('Bạn chỉ thao tác trên công việc mình thực hiện hoặc làm cùng.');}
function ownTaskIds_(me){return new Set(list_('tasks').filter(t=>worksOn_(t,me.key)).map(t=>t.id));}
function canSeeTask_(me,taskId){if(me.manager)return true;const t=find_('tasks',taskId);return worksOn_(t,me.key);}
function mineRow_(r,me){return r.employeeKey===me.key||r.createdBy===me.key;}
const BOOTSTRAP_SECTIONS_=['kdAcc','kdSale','bgd','dailyNotes'];
function bootstrapSection_(me,section){
  switch(section){
    case 'kdAcc':
    case 'kdSale': {
      const access=kdAccess_(me,section);
      return access?list_(section).filter(x=>access==='all'||x.employeeKey===me.key).map(strip_):null;
    }
    case 'bgd': {
      const role=bgdRole_(me);
      if(!role.entry)return null;
      return {depts:bgdDepts_(),rep:list_('bgdRep').filter(r=>role.review||r.nguoiBaoCaoKey===me.key).map(strip_),
        meet:list_('bgdMeet').filter(m=>!m.xoaLuc).map(strip_),task:list_('bgdTask').filter(t=>!t.xoaLuc).map(strip_)};
    }
    case 'dailyNotes':return list_('dailyReports').filter(x=>me.manager||x.employeeKey===me.key).map(strip_);
    default:return null;
  }
}
function apiLoadSection(token,section){
  const me=session_(token),data=bootstrapSection_(me,section);
  if(data===null)throw new Error('Bạn không có quyền mở mục này.');
  return {[section]:data,perfMs:Date.now()-REQ_T0_};
}
function apiBootstrap(token,retireColumns,sections){
  return bootstrapData_(session_(token),retireColumns,sections);
}
let PERF_={},PERF_T_=0;function PERF_STEP_(k){const t=Date.now();PERF_[k]=t-(PERF_T_||REQ_T0_);PERF_T_=t;}
function bootstrapData_(me,retireColumns,sections,people=employees_(true)){PERF_T_=Date.now();
  const own=!me.manager;
  if(me.manager&&retireColumns===true)retireHiddenColumns_();
  // BUILD 7.2: giờ của một công việc = chỉ giờ của người thực hiện (dòng ghi sai người bị ẩn; dọn bằng nút trong Thiết lập).
  const tasksAll=list_('tasks'),asg={};tasksAll.forEach(t=>{asg[t.id]=t.nguoiPhuTrachId;});
  const daysAll=list_('days').filter(x=>x.tenViecTrucTiep||!asg[x.congViecId]||asg[x.congViecId]===x.employeeKey);
  const tids=new Set(tasksAll.filter(t=>!own||worksOn_(t,me.key)).map(t=>t.id));
  const tasks=tasksAll.filter(t=>tids.has(t.id)),pids=new Set(tasks.map(t=>t.duAnId));
  // Giờ cũ của nhân viên trên việc không được giao: chỉ gửi tên việc để hiện (chỉ xem) ở Giờ làm hằng ngày.
  // BUILD 7.2: giờ làm theo ngày — nhân viên nhận giờ của mình + giờ trên các việc mình làm (để tính % hoàn thành).
  const myDays=daysAll.filter(x=>!own||x.employeeKey===me.key||tids.has(x.congViecId)),refIds=new Set(own?myDays.filter(x=>x.employeeKey===me.key).map(x=>x.congViecId).filter(id=>!tids.has(id)):[]);
  const refTasks=tasksAll.filter(t=>refIds.has(t.id)).map(t=>({id:t.id,tenCongViec:t.tenCongViec,duAnId:t.duAnId,tenDuAn:t.tenDuAn,hangMuc:t.hangMuc,trangThai:t.trangThai,_ref:true}));
  PERF_STEP_('congViec+gioLam');const products=list_('products'),visibleProducts=own?products.filter(p=>mineRow_(p,me)):products;
  // Chỉ gửi trường dùng để đếm sản phẩm của công việc được giao, kể cả dữ liệu từ người phụ trách cũ.
  const productCounts=own?products.filter(r=>tids.has(r.congViecId)&&!mineRow_(r,me)).map(r=>({
    id:r.id,congViecId:r.congViecId,ngay:r.ngay,createdAt:r.createdAt,loaiSanPham:r.loaiSanPham,
    soLuong:r.soLuong,tienDo:r.tienDo,tinhTrang:r.tinhTrang,sttBaoCao:r.sttBaoCao
  })):[];
  PERF_STEP_('ketQua');const projects=list_('projects'),extras={},loadedSections=[];
  for(const section of BOOTSTRAP_SECTIONS_){
    if(Array.isArray(sections)&&!sections.includes(section))continue;
    const data=bootstrapSection_(me,section);
    if(data!==null){extras[section]=data;loadedSections.push(section);}
    else if(!Array.isArray(sections))extras[section]=section==='bgd'?null:[];
  }
  PERF_STEP_('muc');
  const out={me:publicEmp_(me),employees:people.filter(e=>e.active).map(publicEmp_),...extras,loadedSections,
    // Toàn bộ nhân sự (kể cả đã nghỉ việc) cho màn Nhân sự; publicEmp_ không chứa mã đăng nhập.
    staffAll:own?[]:people.map(e=>Object.assign(publicEmp_(e),{active:e.active})),
    projects:projects.filter(p=>!own||pids.has(p.id)).map(strip_),tasks:tasks.map(strip_),
    wipeLock:bgdRole_(me).review?(PropertiesService.getScriptProperties().getProperty('WIPE_LOCKED')||''):'',
    time:[],days:myDays.map(strip_),refTasks:refTasks,cats:catsCfg_(),projectNames:projects.map(p=>({id:p.id,tenDuAn:p.tenDuAn})),
    blockers:list_('blockers').filter(b=>!own||mineRow_(b,me)||(tids.has(b.taskId)&&!b.employeeKey)).map(strip_), holidays:list_('holidays').map(strip_),
    subtasks:list_('subtasks').filter(s=>!own||tids.has(s.congViecId)).map(strip_), products:visibleProducts.map(strip_), productCounts, proposals:list_('proposals').filter(x=>me.manager||x.nguoiDeXuatId===me.key).map(strip_), settings:settings_(),serverTime:now_(),
    demoMode:!!CFG.DEMO_MODE, perfMs:Date.now()-REQ_T0_};
  PERF_STEP_('conLai');out.perfSteps=PERF_;return out;
}
function strip_(obj){const res={};Object.keys(obj).forEach(k=>{if(k!=='_row')res[k]=obj[k];});return res;}
function verifyUrl_(v){const s=String(v||'').trim();if(!s)return '';if(!/^https?:\/\/[^\s]+$/i.test(s))throw new Error('Đường dẫn sản phẩm phải bắt đầu bằng https:// hoặc http://.');return s;}
function parseDate_(v) {
  const s=String(v||'').trim(); if(!s)return '';
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s.slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw new Error('Ngày không hợp lệ: '+s);
  const d=new Date(iso+'T00:00:00'); if(isNaN(d.getTime())||d.getFullYear()!==+iso.slice(0,4)||d.getMonth()+1!==+iso.slice(5,7)||d.getDate()!==+iso.slice(8,10))throw new Error('Ngày không có thực: '+s);
  return iso;
}
function normalizePriority_(v) {
  const s=norm_(v); if(s==='ratgap'||s==='ratcao'||s==='critical')return 'Rất gấp';
  if(s==='gap')return 'Gấp';
  if(s==='cao'||s==='high')return 'Cao';
  if(s==='thap'||s==='low')return 'Thấp';return 'Trung bình';
}
function pct_(v){let x=Number(String(v||'0').replace('%','').replace(',','.'));if(!isFinite(x))x=0;return String(Math.min(100,Math.max(0,x)));}
function trimmed_(v,len){return String(v||'').trim().slice(0,len||1000);}
function employeeByName_(s,emps){
  const name=norm_(s); if(!name)return '';
  let found=emps.filter(x=>norm_(x.name)===name || (x.empId&&norm_(x.empId)===name));
  if(found.length===1)return found[0].key;
  found=emps.filter(x=>norm_(x.name).endsWith(name));return found.length===1?found[0].key:'';
}
function apiSaveProject(token,input) {
  const emp=session_(token);mustManage_(emp);
  return guardedP_(()=>saveProject_(emp,input));
}
function saveProject_(emp,input) {
  {
    const id=trimmed_(input.id,80),name=trimmed_(input.tenDuAn,250);
    if(!name)throw new Error('Vui lòng nhập tên dự án.');
    if(list_('projects').some(x=>norm_(x.tenDuAn)===norm_(name)&&x.id!==id))throw new Error('Tên dự án đã tồn tại.');
    const existing=id?find_('projects',id):null;
    if(id&&!existing)throw new Error('Không tìm thấy dự án cần sửa.');
    const p={id:existing?existing.id:uuid_(),tenDuAn:name,moTa:trimmed_(input.moTa,2000),
      createdAt:existing?existing.createdAt:now_(),updatedAt:now_(),createdBy:existing?existing.createdBy:emp.name};
    existing?update_('projects',existing,p):append_('projects',p);
    // Đổi tên dự án trên task (không đổi liên kết ID).
    list_('tasks').filter(x=>x.duAnId===p.id && x.tenDuAn!==p.tenDuAn).forEach(x=>{x.tenDuAn=p.tenDuAn;update_('tasks',x,x);});
    audit_(emp.name,existing?'Sửa':'Tạo','Dự án',p.id,{tenDuAn:name});
    return strip_(p);
  }
}
function apiDeleteProject(token,id) {
  const e=session_(token);mustManage_(e);
  return guardedP_(()=>{
    const p=find_('projects',id);if(!p)throw new Error('Không tìm thấy dự án.');
    const tasks=list_('tasks').filter(t=>t.duAnId===p.id);
    const taskSet=new Set(tasks.map(x=>x.id));
    const slots=list_('time').filter(x=>taskSet.has(x.taskId));
    slots.sort((a,b)=>b._row-a._row).forEach(x=>remove_('time',x));
    list_('days').filter(x=>(!x.congViecId&&x.duAnId===p.id)||taskSet.has(x.congViecId)).sort((a,b)=>b._row-a._row).forEach(x=>remove_('days',x));
    const blocks=list_('blockers').filter(x=>taskSet.has(x.taskId));
    blocks.sort((a,b)=>b._row-a._row).forEach(x=>remove_('blockers',x));
    list_('subtasks').filter(x=>taskSet.has(x.congViecId)).sort((a,b)=>b._row-a._row).forEach(x=>remove_('subtasks',x));
    list_('products').filter(x=>taskSet.has(x.congViecId)).sort((a,b)=>b._row-a._row).forEach(x=>remove_('products',x));
    tasks.sort((a,b)=>b._row-a._row).forEach(x=>remove_('tasks',x));
    remove_('projects',p); audit_(e.name,'Xóa','Dự án',id,{name:p.tenDuAn,tasks:tasks.length,timeEntries:slots.length,blockers:blocks.length});
    return true;
  });
}
/** BUILD 7.2 — Chuyển việc của người đã nghỉ việc sang người đang làm. Giữ nguyên trạng thái, giờ làm và kết quả cũ (lịch sử). input:{fromKey,toKey,ids:[]} */
function apiReassignTasks(token,input) {
  const e=session_(token);mustManage_(e);input=input||{};const fromKey=String(input.fromKey||''),toKey=String(input.toKey||'');
  const ids=(Array.isArray(input.ids)?input.ids:[]).map(String);if(!ids.length)throw new Error('Chưa chọn công việc nào.');
  return guardedP_(()=>{const act=employees_(false),to=act.find(x=>x.key===toKey);if(!to)throw new Error('Chọn người nhận việc đang hoạt động.');
    if(act.some(x=>x.key===fromKey))throw new Error('Chỉ chuyển việc của người đã nghỉ việc.');const from=employees_(true).find(x=>x.key===fromKey);
    const want={};ids.forEach(id=>{want[id]=1;});let n=0;
    list_('tasks').filter(t=>want[t.id]&&t.nguoiPhuTrachId===fromKey&&['Hoàn thành','Hủy'].indexOf(t.trangThai)<0).forEach(t=>{
      const nt=Object.assign(strip_(t),{nguoiPhuTrachId:to.key,nguoiPhuTrach:to.name,updatedAt:now_()});update_('tasks',t,nt);n++;
      audit_(e.name,'Chuyển việc','Công việc',t.id,{tu:from?from.name:fromKey,sang:to.name,tenCongViec:t.tenCongViec});});
    if(!n)throw new Error('Không có công việc nào phù hợp để chuyển (có thể đã được chuyển hoặc đã hoàn thành).');
    return {moved:n,to:to.name};});
}
/** BUILD 7.2 — Dữ liệu (chỉ Giám đốc / Tổng GĐ): xoá dữ liệu demo [MOCK…] và làm trắng dữ liệu để triển khai mới.
 *  Không đụng: APP_CAU_HINH (thiết lập, hạng mục), APP_NGAY_NGHI, Script Properties (Telegram), sheet nhân sự. */
const DATA_KEYS_=['projects','tasks','time','days','products','subtasks','blockers','proposals','dailyReports','kdAcc','kdSale','bgdRep','bgdMeet','bgdTask','bgdHist','audit'];
function mustDataAdmin_(e){if(!(e.manager&&bgdRole_(e).review))throw new Error('Chỉ Giám đốc / Tổng Giám đốc được thực hiện.');}
function dataSheet_(k){return db_().getSheetByName(CFG.TABLES[k]);}
function dataDelRows_(sh,idx){const rows=idx.map(i=>i+1).sort((a,b)=>a-b);for(let i=rows.length-1;i>=0;){let end=rows[i],st=end;while(i>0&&rows[i-1]===st-1){i--;st--;}
  if(st===2&&end===sh.getLastRow()&&sh.getMaxRows()<=end)sh.insertRowAfter(end);sh.deleteRows(st,end-st+1);i--;}}
function demoPlan_(){const data={},mark={};
  DATA_KEYS_.forEach(k=>{const sh=dataSheet_(k);mark[k]={};if(!sh||sh.getLastRow()<2)return;const v=sh.getRange(1,1,sh.getLastRow(),Math.max(1,sh.getLastColumn())).getDisplayValues();data[k]={sh:sh,v:v,h:v[0]};
    v.forEach((r,i)=>{if(i&&r.some(x=>/^\s*\[MOCK/.test(String(x))))mark[k][i]=1;});});
  const ids=k=>{const d=data[k],o={};if(!d)return o;const ii=d.h.indexOf('id');if(ii<0)return o;Object.keys(mark[k]).forEach(i=>{const v=d.v[i][ii];if(v)o[v]=1;});return o;};
  for(let pass=0;pass<3;pass++){const R={duAnId:ids('projects'),taskId:ids('tasks'),congViecId:ids('tasks'),viecConId:ids('subtasks'),cuocHopId:ids('bgdMeet'),nhiemVuId:ids('bgdTask')};
    Object.keys(data).forEach(k=>{const d=data[k],cs=Object.keys(R).map(n=>[d.h.indexOf(n),R[n]]).filter(x=>x[0]>=0);if(!cs.length)return;
      d.v.forEach((r,i)=>{if(i&&!mark[k][i]&&cs.some(x=>r[x[0]]&&x[1][r[x[0]]]))mark[k][i]=1;});});}
  return {data:data,mark:mark};}
function apiDemoInfo(token){const e=session_(token);mustDataAdmin_(e);const p=demoPlan_();return DATA_KEYS_.map(k=>({tab:CFG.TABLES[k],n:Object.keys(p.mark[k]).length})).filter(x=>x.n);}
function apiDemoDelete(token){const e=session_(token);mustDataAdmin_(e);
  const out=guarded_(()=>{const p=demoPlan_(),res=[];DATA_KEYS_.forEach(k=>{const idx=Object.keys(p.mark[k]).map(Number);if(!idx.length||!p.data[k])return;dataDelRows_(p.data[k].sh,idx);res.push({tab:CFG.TABLES[k],n:idx.length});});
    listReset_();audit_(e.name,'Xoá dữ liệu demo','Dữ liệu','',{dong:res.map(r=>r.tab+':'+r.n).join(', ')});return res;});listReset_();return out;}
function wipeBackups_(){return db_().getSheets().map(s=>s.getName()).filter(n=>/_BACKUP_/.test(n));}
function apiWipeInfo(token){const e=session_(token);mustDataAdmin_(e);
  return {locked:wipeLock_(),tabs:DATA_KEYS_.map(k=>{const sh=dataSheet_(k);return {tab:CFG.TABLES[k],n:sh?Math.max(0,sh.getLastRow()-1):0};}),backups:wipeBackups_()};}
function wipeLock_(){return PropertiesService.getScriptProperties().getProperty('WIPE_LOCKED')||'';}
function apiWipeAll(token,confirmText,dropBackups){const e=session_(token);mustDataAdmin_(e);if(wipeLock_())throw new Error('Chức năng làm trắng đã khoá sau lần chạy trước. Muốn mở lại phải chạy hàm moKhoaLamTrang trong trình soạn code Apps Script.');if(String(confirmText||'').trim()!=='XOA HET')throw new Error('Gõ đúng "XOA HET" để xác nhận.');
  const out=guarded_(()=>{const name='SMEE_DuLieu_SaoLuu_'+Utilities.formatDate(new Date(),CFG.TIME_ZONE,'yyyy-MM-dd_HHmm');
    const copy=DriveApp.getFileById(CFG.DB_SPREADSHEET_ID).makeCopy(name);const res=[];
    DATA_KEYS_.forEach(k=>{const sh=dataSheet_(k);if(!sh)return;const n=sh.getLastRow()-1;if(n<=0)return;if(sh.getMaxRows()<=sh.getLastRow())sh.insertRowAfter(sh.getLastRow());sh.deleteRows(2,n);res.push({tab:CFG.TABLES[k],n:n});});
    let dropped=0;if(dropBackups){const ss=db_();wipeBackups_().forEach(n=>{const sh=ss.getSheetByName(n);if(sh&&ss.getSheets().length>1){ss.deleteSheet(sh);dropped++;}});}
    PropertiesService.getScriptProperties().setProperty('WIPE_LOCKED',JSON.stringify({at:now_(),by:e.name}));
    listReset_();audit_(e.name,'Làm trắng dữ liệu','Dữ liệu','',{saoLuu:name,dong:res.map(r=>r.tab+':'+r.n).join(', '),xoaTabSaoLuu:dropped});
    return {backupName:name,backupUrl:copy.getUrl(),deleted:res,droppedBackups:dropped};});listReset_();return out;}
function apiSaveTask(token,input) {
  const e=session_(token);
  return guardedP_(()=>saveTask_(e,input));
}
function saveTaskSchedule_(task, input) {
  const cycle = String(input.chuKy || 'once');
  if (!['once','day','week','month'].includes(cycle)) throw new Error('Lịch phân bổ không hợp lệ.');
  task.chuKy = cycle;
  task.chiTieu = '';
  task.donViChiTieu = '';
  task.loaiChiTieu = '';
  task.hanTrongKy = '';
  if (cycle === 'once') return;
  if (!task.ngayBatDau) throw new Error('Nhập ngày bắt đầu áp dụng lịch định kỳ.');
  if (task.deadline && task.deadline < task.ngayBatDau) throw new Error('Ngày kết thúc lịch sớm hơn ngày bắt đầu.');
  const target = Number(input.chiTieu);
  if (!Number.isSafeInteger(target) || target < 1 || target > 100000) throw new Error('Chỉ tiêu phải là số nguyên từ 1 đến 100.000.');
  task.chiTieu = String(target);
  task.donViChiTieu = trimmed_(input.donViChiTieu, 40) || 'lần';
  const type = trimmed_(input.loaiChiTieu, 60);
  if (type && type !== CFG.PRODUCT_OTHER && type !== input._previousTargetType && !productTypes_().includes(type)) throw new Error('Loại kết quả tính chỉ tiêu không hợp lệ.');
  task.loaiChiTieu = type;
  if (cycle !== 'day' && String(input.hanTrongKy || '').trim()) {
    const due = Number(input.hanTrongKy);
    if (!Number.isInteger(due) || due < 1 || due > (cycle === 'week' ? 7 : 31)) throw new Error('Mốc hạn trong kỳ không hợp lệ.');
    task.hanTrongKy = String(due);
  }
}
function saveTask_(e,input) {
  {
    const old=input.id?find_('tasks',input.id):null;
    if(input.id&&!old)throw new Error('Không tìm thấy công việc cần cập nhật.');
    if(!old)mustManage_(e);else mustEdit_(old,e);
    const t=old?strip_(old):{id:uuid_(),createdAt:now_(),createdBy:e.name,nguonImport:'',nguonDong:''};
    if(e.manager){
      const project=find_('projects',input.duAnId);if(!project)throw new Error('Vui lòng chọn dự án.');
      Object.assign(t,{duAnId:project.id,tenDuAn:project.tenDuAn,stt:trimmed_(input.stt,30),
        hangMuc:trimmed_(input.hangMuc,300),tenCongViec:trimmed_(input.tenCongViec,700),
        yeuCau:trimmed_(input.yeuCau,2000),uuTien:normalizePriority_(input.uuTien),
        phongBan:trimmed_(input.phongBan,100),deadline:parseDate_(input.deadline)});
      const current=employees_(false);
      t.nguoiPhuTrachId=trimmed_(input.nguoiPhuTrachId,70);
      if(t.nguoiPhuTrachId){
        const person=current.find(x=>x.key===t.nguoiPhuTrachId);
        // BUILD 7.2: người làm đã nghỉ việc nhưng KHÔNG đổi người → vẫn lưu được (đổi trạng thái, deadline…); chỉ chặn khi chọn MỚI người đã nghỉ.
        if(person)t.nguoiPhuTrach=person.name;else if(old&&old.nguoiPhuTrachId===t.nguoiPhuTrachId)t.nguoiPhuTrach=old.nguoiPhuTrach;else throw new Error('Người thực hiện không còn hoạt động.');
      } else {t.nguoiPhuTrach=trimmed_(input.nguoiPhuTrach,200);}
    }
    t.ngayBatDau=e.manager||!old?parseDate_(input.ngayBatDau):old.ngayBatDau;
    if(e.manager&&input.chuKy!==undefined)saveTaskSchedule_(t,{...input,_previousTargetType:old&&old.loaiChiTieu});
    t.trangThai=trimmed_(input.trangThai,100)||(old?old.trangThai:'Chưa bắt đầu');
    if(!settings_().statuses.includes(t.trangThai))throw new Error('Trạng thái không có trong cấu hình.');
    if(t.chuKy&&t.chuKy!=='once'&&t.trangThai==='Hoàn thành'){
      if(!old||!old.chuKy||old.chuKy==='once')t.trangThai='Đang thực hiện';
      else throw new Error('Ghi kết quả để hoàn thành từng kỳ của công việc định kỳ.');
    }
    if(e.manager&&input.loaiViec!==undefined&&input.loaiViec!==null){t.loaiViec=(input.loaiViec==='Bổ sung'||input.loaiViec==='Phát sinh')?'Bổ sung':'Kế hoạch';
      if(t.loaiViec==='Bổ sung'&&input.ngayGiao!==undefined)t.ngayGiao=parseDate_(input.ngayGiao);}
    // BUILD 7.2: người làm cùng (chỉ quản lý sửa trực tiếp; nhân viên gửi đề xuất).
    if(e.manager&&input.nguoiLamCung!==undefined&&input.nguoiLamCung!==null){const act=employees_(false);
      t.nguoiLamCung=Array.from(new Set(String(Array.isArray(input.nguoiLamCung)?input.nguoiLamCung.join(','):input.nguoiLamCung).split(',').map(s=>s.trim()).filter(k=>k&&k!==t.nguoiPhuTrachId&&act.some(x=>x.key===k)))).join(',');}
    else if(!old)t.nguoiLamCung='';
    // BUILD 7.2: mốc hoàn thành = lúc chuyển sang "Hoàn thành" (dùng tính trễ hạn).
    if(t.trangThai==='Hoàn thành'){if(!old||old.trangThai!=='Hoàn thành')t.thoiGianHoanThanh=now_().slice(0,16);}
    else t.thoiGianHoanThanh='';
    t.tienDo=t.trangThai==='Hoàn thành'?'100':pct_(input.tienDo);
    t.ngayKetThuc=parseDate_(input.ngayKetThuc);
    if(input.linkSanPham!==undefined&&input.linkSanPham!==(old&&old.linkSanPham))t.linkSanPham=verifyLinks_(input.linkSanPham);
    t.ghiChu=trimmed_(input.ghiChu,4000);
    if(!t.tenCongViec)throw new Error('Tên công việc không được bỏ trống.');
    if(t.ngayBatDau&&t.ngayKetThuc&&t.ngayBatDau>t.ngayKetThuc)throw new Error('Ngày hoàn tất sớm hơn ngày bắt đầu.');
    t.updatedAt=now_();t.updatedBy=e.name;
    old?update_('tasks',old,t):append_('tasks',t);
    audit_(e.name,old?'Cập nhật':'Tạo','Công việc',t.id,{ten:t.tenCongViec,status:t.trangThai,progress:t.tienDo});
    return t;
  }
}
/** BUILD 7.2 — Nhiều link (mỗi dòng một link), kiểm tra http(s), bỏ trùng. */
function verifyLinks_(v){const out=[];String(v==null?'':(Array.isArray(v)?v.join('\n'):v)).split(/\s*\n\s*/).map(x=>x.trim()).filter(Boolean).forEach(u=>{const ok=verifyUrl_(u);if(ok&&!out.includes(ok))out.push(ok);});if(out.length>20)throw new Error('Tối đa 20 link cho mỗi công việc.');return out.join('\n');}
function apiDeleteTask(token,id) {
  const e=session_(token);mustManage_(e);
  return guardedP_(()=>{
    const t=find_('tasks',id);if(!t)throw new Error('Không tìm thấy công việc.');
    const logs=list_('time').filter(x=>x.taskId===id);
    logs.sort((a,b)=>b._row-a._row).forEach(x=>remove_('time',x));
    const days=list_('days').filter(x=>x.congViecId===id);
    days.filter(x=>x.tenViecTrucTiep).forEach(x=>update_('days',x,{...strip_(x),duAnId:t.duAnId,congViecId:''}));
    days.filter(x=>!x.tenViecTrucTiep).sort((a,b)=>b._row-a._row).forEach(x=>remove_('days',x));
    const blocks=list_('blockers').filter(x=>x.taskId===id);
    blocks.sort((a,b)=>b._row-a._row).forEach(x=>remove_('blockers',x));
    list_('subtasks').filter(x=>x.congViecId===id).sort((a,b)=>b._row-a._row).forEach(x=>remove_('subtasks',x));
    list_('products').filter(x=>x.congViecId===id).sort((a,b)=>b._row-a._row).forEach(x=>remove_('products',x));
    remove_('tasks',t);
    audit_(e.name,'Xóa','Công việc',id,{ten:t.tenCongViec,timeEntries:logs.length,blockers:blocks.length});return true;
  });
}
function timeMinutes_(iso){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(String(iso)))throw new Error('Thời điểm phải có ngày và giờ (dd/mm/yyyy, HH:mm).');
  const t=String(iso),y=+t.slice(0,4),m=+t.slice(5,7),d=+t.slice(8,10),h=+t.slice(11,13),mi=+t.slice(14,16);
  if(h>23||mi>59)throw new Error('Giờ không hợp lệ.');
  const utc=Date.UTC(y,m-1,d,h,mi),dt=new Date(utc);
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==m||dt.getUTCDate()!==d)throw new Error('Ngày giờ không hợp lệ.');
  return utc/60000;
}
function apiSaveTime(token,input) {
  const e=session_(token);const vm=checkBlk_(input&&input.vuongMac);
  return guardedP_(()=>{
    const old=input.id?find_('time',input.id):null;
    if(input.id&&!old)throw new Error('Không tìm thấy phiên giờ cần sửa.');
    const t=find_('tasks',input.taskId || (old&&old.taskId));
    if(!t)throw new Error('Công việc không tồn tại.');
    // Người thực hiện đầu việc được ghi giờ cho đầu việc của mình dù không phụ trách công việc cha.
    const subLink=input.viecConId?find_('subtasks',input.viecConId):(old&&old.viecConId?find_('subtasks',old.viecConId):null);
    if(!e.manager && !assigned_(t,e) && !(subLink&&subLink.congViecId===t.id&&subLink.nguoiThucHienId===e.key))throw new Error('Bạn chỉ được ghi giờ công việc được giao.');
    if(old&&!e.manager && (old.createdBy!==e.key||old.employeeKey!==e.key))
      throw new Error('Bạn chỉ được sửa giờ do chính mình ghi.');
    // BUILD 7.2: chỉ còn một loại "Giờ làm" (lưu THUC_TE). Được ghi trước các giờ trong hôm nay, không ghi cho ngày sau hôm nay.
    const type='THUC_TE';
    const start=String(input.batDau||'').slice(0,16),end=String(input.ketThuc||'').slice(0,16);
    const mins=timeMinutes_(end)-timeMinutes_(start);
    if(mins<=0||mins>1440)throw new Error('Thời lượng phải lớn hơn 0 và không quá 24 giờ.');
    if(start.slice(0,10)>now_().slice(0,10))throw new Error('Không ghi giờ làm cho các ngày sau hôm nay.');
    let employeeKey=e.manager?String(input.employeeKey||t.nguoiPhuTrachId):e.key;
    if(!employeeKey)throw new Error('Công việc chưa có nhân viên phụ trách.');
    if(!e.manager&&employeeKey!==e.key)throw new Error('Bạn chỉ được ghi giờ cho chính mình.');
    if(!employees_(false).some(x=>x.key===employeeKey))throw new Error('Nhân viên chưa hoạt động.');
    const record={id:old?old.id:uuid_(),taskId:t.id,employeeKey,loai:type,batDau:start,ketThuc:end,
      // Số giờ làm đã trừ phần giao với giờ nghỉ trưa.
      soGio:String(Math.round((mins-lunchOverlapMinutes_(timeMinutes_(start),timeMinutes_(end),lunch_()))/60*100)/100),ghiChu:trimmed_(input.ghiChu,10000),
      duyet:'Không áp dụng', // Tương thích header cũ: không có quy trình phê duyệt.
      viecConId:input.viecConId===undefined&&old?old.viecConId||'':subOf_(t.id,input.viecConId),
      createdAt:old?old.createdAt:now_(),updatedAt:now_(),createdBy:old?old.createdBy:e.key,updatedBy:e.key};
    // BUILD 7.2: không cho trùng giờ với bất kỳ phiên nào khác của cùng nhân viên (chạm mép như 08:00–10:00 và 10:00–12:00 là hợp lệ).
    let extra=null;
    if(!old&&input.phienThem&&input.phienThem.batDau){const s2=String(input.phienThem.batDau).slice(0,16),e2=String(input.phienThem.ketThuc||'').slice(0,16),m2=timeMinutes_(e2)-timeMinutes_(s2);
      if(m2<=0||m2>1440)throw new Error('Phiên thứ hai không hợp lệ.');
      extra=Object.assign({},record,{id:uuid_(),batDau:s2,ketThuc:e2,soGio:String(Math.round((m2-lunchOverlapMinutes_(timeMinutes_(s2),timeMinutes_(e2),lunch_()))/60*100)/100)});}
    const others=list_('time').filter(x=>x.loai!=='KE_HOACH'&&x.employeeKey===record.employeeKey&&(!old||x.id!==old.id));
    [record].concat(extra?[extra]:[]).forEach((r,i,all)=>{const hit=others.concat(all.slice(0,i)).find(x=>String(x.batDau).slice(0,16)<r.ketThuc&&r.batDau<String(x.ketThuc).slice(0,16));
      if(hit){const ht=find_('tasks',hit.taskId);throw new Error('Trùng giờ với phiên '+String(hit.batDau).slice(11,16)+'–'+String(hit.ketThuc).slice(11,16)+(String(hit.batDau).slice(0,10)!==r.batDau.slice(0,10)?' ngày '+String(hit.batDau).slice(8,10)+'/'+String(hit.batDau).slice(5,7):'')+' ('+(ht?ht.tenCongViec:'công việc khác')+').');}});
    old?update_('time',old,record):append_('time',record);
    if(extra)append_('time',extra);
    if(vm){const linked=old?list_('blockers').find(b=>b.gioLamId===record.id):null;
      saveBlocker_(e,{id:linked?linked.id:'',nhomNguyenNhan:vm.nhomNguyenNhan,nguyenNhan:vm.nguyenNhan,dangCho:vm.dangCho,nguoiCanXuLy:vm.nguoiCanXuLy,moTaViecKhac:vm.moTaViecKhac,
        soLuongDuKien:vm.soLuongDuKien,donViDuKien:vm.donViDuKien,batDauCho:linked?linked.batDauCho:record.batDau,trangThai:linked?linked.trangThai:'Đang chờ',ketThucCho:linked?linked.ketThucCho:'',
        taskId:t.id,viecConId:record.viecConId||'',gioLamId:record.id,ghiChu:linked?linked.ghiChu:'Ghi cùng giờ làm '+record.batDau.slice(8,10)+'/'+record.batDau.slice(5,7)+' '+record.batDau.slice(11,16)});}
    audit_(e.name,old?'Sửa':'Ghi','Giờ làm',record.id,{task:t.tenCongViec,type,hours:record.soGio,employeeKey,start,end});
    return record;
  });
}
function apiDeleteTime(token,id) {
  const e=session_(token);
  return guardedP_(()=>{
    const rec=find_('time',id);if(!rec)throw new Error('Không tìm thấy phiên giờ.');
    if(!e.manager&&(rec.createdBy!==e.key||rec.employeeKey!==e.key))
      throw new Error('Bạn chỉ được xóa giờ do chính mình ghi.');
    remove_('time',rec);audit_(e.name,'Xóa','Giờ làm',id,{type:rec.loai,start:rec.batDau});return true;
  });
}
/** BUILD 7.2 — Dọn các dòng giờ KẾ HOẠCH cũ (đã ẩn khỏi app): sao lưu APP_LICH_GIO rồi xoá. */
/** BUILD 7.2 — Xác nhận phiên KẾ HOẠCH thành giờ THỰC TẾ (nhân viên cho chính mình; quản lý sửa giúp khi cần).
 * items: [{id (phiên kế hoạch), batDau, ketThuc}] cùng ngày với phiên kế hoạch. Không tạo trùng, không ghi giờ tương lai. */
function apiConfirmPlans(token,items) {
  const e=session_(token);
  if(!Array.isArray(items)||!items.length)throw new Error('Chưa chọn phiên kế hoạch nào.');if(items.length>50)throw new Error('Tối đa 50 phiên mỗi lần.');
  return guarded_(()=>{
    const all=list_('time'),nowM=timeMinutes_(now_().slice(0,16)),lunch=lunch_();let created=0,skipped=0;
    items.forEach((it,i)=>{
      const n='Phiên '+(i+1)+': ',p=all.find(x=>x.id===String(it&&it.id));
      if(!p||p.loai!=='KE_HOACH')throw new Error(n+'không tìm thấy phiên kế hoạch.');
      if(!e.manager&&p.employeeKey!==e.key)throw new Error(n+'bạn chỉ xác nhận được kế hoạch của chính mình.');
      const day=p.batDau.slice(0,10),a=String(it.batDau||'').slice(0,16),b=String(it.ketThuc||'').slice(0,16);
      if(a.slice(0,10)!==day||b.slice(0,10)!==day)throw new Error(n+'giờ xác nhận phải cùng ngày với kế hoạch.');
      const am=timeMinutes_(a),bm=timeMinutes_(b);if(bm<=am)throw new Error(n+'giờ kết thúc phải sau giờ bắt đầu.');if(bm>nowM+2)throw new Error(n+'không ghi giờ thực tế ở tương lai.');
      if(all.some(y=>y.loai==='THUC_TE'&&y.employeeKey===p.employeeKey&&y.taskId===p.taskId&&y.batDau<b&&y.ketThuc>a)){skipped++;return;}
      const rec={id:uuid_(),taskId:p.taskId,employeeKey:p.employeeKey,loai:'THUC_TE',batDau:a,ketThuc:b,
        soGio:String(Math.round((bm-am-lunchOverlapMinutes_(am,bm,lunch))/60*100)/100),ghiChu:p.ghiChu||'',duyet:'Không áp dụng',viecConId:p.viecConId||'',
        createdAt:now_(),updatedAt:now_(),createdBy:e.key,updatedBy:e.key};
      append_('time',rec);all.push(rec);created++;
      audit_(e.name,'Xác nhận','Giờ làm',rec.id,{keHoach:p.id,start:a,end:b,hours:rec.soGio});
    });
    return {created,skipped};
  });
}
/** Giữ tên hàm cũ để tránh client phiên bản cũ âm thầm thực hiện duyệt giờ. */
function apiApproveTime(token) {
  session_(token);
  throw new Error('Không có chức năng phê duyệt giờ làm. Nhân viên tự ghi và chịu trách nhiệm về giờ của mình.');
}
/** Thời gian chờ là giờ đồng hồ thực (24 giờ = 1 ngày), KHÔNG cộng vào giờ làm. */
function safeMinutes_(v) { return timeMinutes_(String(v||'').slice(0,16)); }
function addMinutesLocal_(s,mins) {
  const dt=new Date((safeMinutes_(s)+mins)*60000);
  return Utilities.formatDate(dt,'UTC',"yyyy-MM-dd'T'HH:mm");
}
function apiSaveBlocker(token,input) {
  const emp=session_(token);
  if(!input||typeof input!=='object')throw new Error('Thông tin vướng mắc không hợp lệ.');
  return guardedP_(()=>saveBlocker_(emp,input));
}
/** BUILD 7.2 — kiểm tra trước vướng mắc đi kèm (Kết quả công việc / Giờ làm) để không ghi dở dang. */
function checkBlk_(vm) {
  if(!vm||typeof vm!=='object')return null;
  // BUILD 7.2: vướng mắc rút gọn — chỉ cần nguyên nhân (thời lượng dự kiến không bắt buộc).
  if(!trimmed_(vm.nguyenNhan,2500))throw new Error('Vướng mắc: cần ghi rõ nguyên nhân chờ.');
  return vm;
}
/** Lưu một vướng mắc (gọi bên trong guarded_). */
function saveBlocker_(emp,input) {
  {
    const old=input.id?find_('blockers',input.id):null;
    if(input.id&&!old)throw new Error('Không tìm thấy vướng mắc cần cập nhật.');
    const task=find_('tasks',old?old.taskId:input.taskId);
    if(!task)throw new Error('Công việc liên quan không tồn tại.');
    const subOwn=input.viecConId?find_('subtasks',input.viecConId):null;
    if(!(subOwn&&subOwn.congViecId===task.id&&subOwn.nguoiThucHienId===emp.key))mustWork_(task,emp);
    // BUILD 7.2: nhóm nguyên nhân không bắt buộc (mặc định "Khác"); nguyên nhân ghi tự do.
    let category=trimmed_(input.nhomNguyenNhan,80);
    if(!CFG.BLOCKER_CATEGORIES.includes(category))category=old&&old.nhomNguyenNhan?old.nhomNguyenNhan:'Khác';
    const reason=trimmed_(input.nguyenNhan,2500);
    if(!reason)throw new Error('Cần ghi rõ nguyên nhân khiến công việc bị chậm/chờ.');
    // BUILD 7.2: form dùng ô văn bản (dangCho, moTaViecKhac); 2 cột id cũ chỉ giữ lại dữ liệu đã có.
    const keepOld=(field)=>input[field]===undefined||input[field]===null;
    const dep=keepOld('phuThuocTaskId')?(old?old.phuThuocTaskId:''):trimmed_(input.phuThuocTaskId,90);
    const depChanged=!old||dep!==old.phuThuocTaskId;
    if(depChanged&&dep===task.id)throw new Error('Công việc không thể phụ thuộc chính nó.');
    if(depChanged&&dep&&!find_('tasks',dep))throw new Error('Không tìm thấy công việc đang phụ thuộc.');
    const start=String(input.batDauCho||'').slice(0,16);
    const startM=safeMinutes_(start);
    if(!(startM>0))throw new Error('Chọn thời điểm bắt đầu chờ.');
    // BUILD 7.2: thời lượng dự kiến không bắt buộc; trạng thái suy ra từ "Tiếp tục lúc" (trống = đang chờ).
    const qRaw=String(input.soLuongDuKien==null?'':input.soLuongDuKien).trim();
    const unit=qRaw?String(input.donViDuKien||'GIO'):'';
    if(unit&&!['GIO','NGAY'].includes(unit))throw new Error('Đơn vị phải là giờ hoặc ngày.');
    const quantity=qRaw?Number(qRaw.replace(',','.')):'';
    if(qRaw&&(!isFinite(quantity)||quantity<=0||quantity>3650))throw new Error('Thời gian chờ dự kiến không hợp lệ.');
    const mins=qRaw?Math.round(quantity*(unit==='NGAY'?1440:60)):0;
    const expected=qRaw?addMinutesLocal_(start,mins):'';
    const endIn=String(input.ketThucCho||'').slice(0,16);
    const status=endIn?'Đã giải quyết':'Đang chờ';
    let end='';
    if(status==='Đã giải quyết'){
      end=String(input.ketThucCho||'').slice(0,16);
      if(safeMinutes_(end)<=startM)throw new Error('Thời điểm tiếp tục phải sau khi bắt đầu chờ.');
      if(safeMinutes_(end)>safeMinutes_(now_().slice(0,16))+2)throw new Error('Không thể kết thúc chờ trong tương lai.');
    }
    // Công việc thực hiện trong thời gian đang chờ: liên kết tác vụ đã tồn tại, không cộng chồng giờ làm.
    const otherId=keepOld('congViecThayTheId')?(old?old.congViecThayTheId:''):trimmed_(input.congViecThayTheId,90);
    const otherChanged=!old||otherId!==old.congViecThayTheId;
    if(otherChanged&&otherId===task.id)throw new Error('Việc làm trong lúc chờ phải khác công việc bị vướng.');
    const otherTask=otherChanged&&otherId?find_('tasks',otherId):null;
    if(otherChanged&&otherId&&!otherTask)throw new Error('Không tìm thấy công việc khác đã chọn.');
    if(otherTask&&!emp.manager&&!assigned_(otherTask,emp))
      throw new Error('Bạn chỉ được liên kết công việc khác đã được giao cho chính mình.');
    const employeeKey=task.nguoiPhuTrachId||emp.key;
    if(otherTask && otherTask.nguoiPhuTrachId && otherTask.nguoiPhuTrachId!==employeeKey)
      throw new Error('Công việc khác phải thuộc cùng người thực hiện.');
    const otherDesc=trimmed_(input.moTaViecKhac,1600);
    const row={id:old?old.id:uuid_(),taskId:task.id,nhomNguyenNhan:category,nguyenNhan:reason,
      dangCho:trimmed_(input.dangCho,1000),phuThuocTaskId:dep,nguoiCanXuLy:trimmed_(input.nguoiCanXuLy,200),
      batDauCho:start,soLuongDuKien:qRaw?String(quantity):'',donViDuKien:unit,duKienTiepTuc:expected,
      ketThucCho:end,trangThai:status,ghiChu:trimmed_(input.ghiChu,2000),
      congViecThayTheId:otherId,moTaViecKhac:otherDesc,employeeKey:employeeKey,
      viecConId:input.viecConId===undefined?(old?old.viecConId||'':''):subOf_(task.id,input.viecConId),
      createdAt:old?old.createdAt:now_(),updatedAt:now_(),createdBy:old?old.createdBy:emp.key,updatedBy:emp.key,
      gioLamId:input.gioLamId===undefined?(old?old.gioLamId||'':''):trimmed_(input.gioLamId,90)};
    old?update_('blockers',old,row):append_('blockers',row);
    audit_(emp.name,old?'Sửa':'Ghi','Vướng mắc',row.id,{taskId:task.id,category:category,
      status:status,expectedResume:expected,actualResume:end,estimatedMinutes:mins,otherTaskId:otherId});
    return strip_(row);
  }
}
/** BUILD 7.2 — "Đã tiếp tục": kết thúc chờ ngay bây giờ. */
function apiResumeBlocker(token,id) {
  const e=session_(token);
  return guardedP_(()=>{const b=find_('blockers',id);if(!b)throw new Error('Không tìm thấy vướng mắc.');const t=find_('tasks',b.taskId);
    if(!e.manager&&!(t&&worksOn_(t,e.key))&&b.employeeKey!==e.key)throw new Error('Bạn không có quyền cập nhật vướng mắc này.');
    if(b.trangThai==='Đã giải quyết')return strip_(b);
    const n=strip_(b);n.ketThucCho=now_().slice(0,16);n.trangThai='Đã giải quyết';n.updatedAt=now_();n.updatedBy=e.key;update_('blockers',b,n);
    audit_(e.name,'Tiếp tục','Vướng mắc',id,{ketThuc:n.ketThucCho});return n;});
}
function apiDeleteBlocker(token,id) {
  const emp=session_(token);
  return guardedP_(()=>{
    const rec=find_('blockers',id);
    if(!rec)throw new Error('Không tìm thấy vướng mắc.');
    const task=find_('tasks',rec.taskId);
    if(!emp.manager && (!task||!assigned_(task,emp)))
      throw new Error('Bạn chỉ được xóa vướng mắc của công việc được giao.');
    remove_('blockers',rec);
    audit_(emp.name,'Xóa','Vướng mắc',id,{taskId:rec.taskId,category:rec.nhomNguyenNhan});
    return true;
  });
}

function apiAddStatus(token,status) {
  const e=session_(token);mustManage_(e);
  return guarded_(()=>{
    const name=trimmed_(status,80),arr=settings_().statuses;
    if(!name||arr.some(x=>norm_(x)===norm_(name)))throw new Error('Trạng thái trống hoặc đã tồn tại.');
    const row=list_('config').find(x=>x.key==='statuses');
    if(!row)throw new Error('Chạy setupApp trước.');
    row.value=JSON.stringify(arr.concat(name));update_('config',row,row);
    audit_(e.name,'Thêm trạng thái','Cấu hình','statuses',{name});return true;
  });
}

/** Import A:O, trong đó A:I do Account quản lý; J:O cập nhật khi tạo mới. */
/** STT theo hạng mục: hạng mục đã có trong dự án dùng lại STT; hạng mục mới = STT số lớn nhất + 1. */
function suggestStt_(tasks,projectId,category) {
  const same=tasks.filter(x=>x.duAnId===projectId),key=norm_(category);
  const hit=key&&same.find(x=>norm_(x.hangMuc)===key&&String(x.stt||'').trim());
  if(hit)return String(hit.stt).trim();
  const nums=same.map(x=>parseInt(String(x.stt||'').trim(),10)).filter(n=>isFinite(n));
  return String(nums.length?Math.max.apply(null,nums)+1:1);
}
/** Lấy ID Google Sheet từ link hoặc ID (không gắn cứng file mẫu: bản sao nào cũng nhập được). */
function sheetIdFrom_(input) {
  const s=String(input||'').trim(),m=s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  const id=m?m[1]:s;
  if(!/^[a-zA-Z0-9_-]{20,}$/.test(id))throw new Error('Link hoặc ID Google Sheet không hợp lệ.');
  return id;
}
function openSheetForImport_(input) {
  const id=sheetIdFrom_(input);
  try { return {id:id,ss:SpreadsheetApp.openById(id)}; }
  catch(e) {
    throw new Error('Không mở được file. Hãy chia sẻ file cho '+Session.getEffectiveUser().getEmail()+
      " với quyền Người xem, hoặc đặt 'Bất kỳ ai có đường liên kết đều xem được', rồi thử lại.");
  }
}
/** Hàng tiêu đề: hàng đầu tiên (trong 5 hàng đầu) có "Tên dự án" và "Công việc chi tiết". */
function headerRowIndex_(rows) {
  for(let i=0;i<Math.min(5,rows.length);i++){
    const h=rows[i].map(norm_);
    if(h.some(s=>['tenduan','duan'].includes(s))&&h.some(s=>['congviecchitiet','dauviec','congviec'].includes(s)))return i;
  }
  return -1;
}
/** Nhập từ Google Sheet — bước 1: liệt kê tab, gợi ý tab đầu tiên có tiêu đề hợp lệ. */
function apiGsheetTabs(token,input) {
  const e=session_(token);mustManage_(e);
  const o=openSheetForImport_(input);
  const tabs=o.ss.getSheets().map(sh=>{
    const top=sh.getLastRow()?sh.getRange(1,1,Math.min(5,sh.getLastRow()),Math.max(1,sh.getLastColumn())).getDisplayValues():[];
    const h=headerRowIndex_(top);
    return {name:sh.getName(),rows:Math.max(0,sh.getLastRow()-(h<0?1:h+1)),valid:h>=0};
  });
  const first=tabs.find(x=>x.valid);
  return {id:o.id,name:o.ss.getName(),tabs:tabs,suggested:first?first.name:''};
}
function gsheetRows_(input,tab) {
  const o=openSheetForImport_(input),sh=o.ss.getSheetByName(String(tab||''));
  if(!sh)throw new Error('Không tìm thấy tab "'+tab+'" trong file.');
  const all=sh.getLastRow()?sh.getDataRange().getDisplayValues():[],h=headerRowIndex_(all);
  return {id:o.id,name:o.ss.getName(),tab:sh.getName(),rows:h>0?all.slice(h):all};
}
/** Bước 2: xem trước 10 dòng, số dòng hợp lệ và cột bắt buộc còn thiếu. */
function apiGsheetPreview(token,input,tab) {
  const e=session_(token);mustManage_(e);
  const g=gsheetRows_(input,tab);
  if(g.rows.length<1)return {header:[],sample:[],valid:0,total:0,missing:['Tên dự án','Hạng mục lớn','Công việc chi tiết']};
  const head=g.rows[0].map(norm_),find=names=>head.findIndex(s=>names.includes(s));
  const need=[['Tên dự án',['tenduan','duan']],['Hạng mục lớn',['hangmuclon','hangmuc','hangmuccongviec']],['Công việc chi tiết',['congviecchitiet','dauviec','congviec']]];
  const missing=need.filter(n=>find(n[1])<0).map(n=>n[0]),jobCol=find(need[2][1]);
  const body=g.rows.slice(1).filter(r=>r.some(c=>String(c).trim()));
  return {header:g.rows[0],sample:body.slice(0,10),valid:jobCol<0?0:body.filter(r=>String(r[jobCol]||'').trim()).length,total:body.length,missing:missing};
}
/** Bước 3: nhập — dùng chung importRows_ (khớp dự án + hạng mục + tên việc ở mọi nguồn, không tạo trùng). */
function apiImportGsheet(token,input,tab) {
  const e=session_(token);mustManage_(e);
  const g=gsheetRows_(input,tab);
  return importRows_(e,g.rows,'gsheet:'+g.id+'#'+g.tab,{requireCategory:true,fileName:g.name+' › '+g.tab});
}
/** Email tài khoản chạy Web App (người cần được chia sẻ quyền xem file). */
function apiImportOwner(token) {
  const e=session_(token);mustManage_(e);
  return Session.getEffectiveUser().getEmail();
}
/** File Google Sheet đã nhập gần đây (đọc từ APP_NHAT_KY). */
function apiImportHistory(token) {
  const e=session_(token);mustManage_(e);
  const seen={},out=[];
  list_('audit').filter(x=>x.hanhDong==='Import'&&String(x.doiTuongId).indexOf('gsheet:')===0)
    .sort((a,b)=>String(b.thoiGian).localeCompare(String(a.thoiGian))).forEach(x=>{
      if(seen[x.doiTuongId]||out.length>=10)return;
      seen[x.doiTuongId]=1;
      let info={};try{info=JSON.parse(x.noiDung||'{}');}catch(_e){}
      const m=String(x.doiTuongId).match(/^gsheet:([^#]+)#(.*)$/);if(!m)return;
      out.push({id:m[1],tab:m[2],name:info.fileName||m[2],actor:x.actor,time:x.thoiGian,created:info.created||0,updated:info.updated||0});
    });
  return out;
}
/** Tạo (hoặc cập nhật nếu đã có) file mẫu import Google Sheet trong thư mục cấu hình, kèm dữ liệu mock để nhập thử.
 * Chạy từ Editor hoặc nút "Tạo file mẫu Google Sheet" trong Thiết lập. */
function taoFileMauImport() {
  const NAME='SMEE - Mẫu import công việc',TAB='Nhập công việc',GUIDE='Hướng dẫn';
  const folder=CFG.IMPORT_TEMPLATE_FOLDER_ID?DriveApp.getFolderById(CFG.IMPORT_TEMPLATE_FOLDER_ID):null;
  // Không tạo trùng: nếu thư mục đã có file mẫu thì ghi đè nội dung file đó.
  const existing=folder?folder.getFilesByName(NAME):null;
  let ss,reused=false;
  if(existing&&existing.hasNext()){ss=SpreadsheetApp.openById(existing.next().getId());reused=true;}
  else{ss=SpreadsheetApp.create(NAME);if(folder)DriveApp.getFileById(ss.getId()).moveTo(folder);}
  let sh=ss.getSheetByName(TAB);
  if(!sh){sh=reused?ss.insertSheet(TAB,0):ss.getSheets()[0];sh.setName(TAB);}
  sh.clear();sh.clearNotes();
  const head=['Tên dự án','STT','Hạng mục lớn','Công việc chi tiết','Yêu cầu công việc'];
  sh.getRange(1,1,1,head.length).setValues([head]).setBackground('#1f4e79').setFontColor('#ffffff')
    .setFontWeight('bold').setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);sh.setRowHeight(1,36);
  [240,60,240,380,320].forEach((w,i)=>sh.setColumnWidth(i+1,w));
  sh.getRange('A1').setNote('BẮT BUỘC. Chỉ ghi ở dòng đầu mỗi dự án; dòng dưới để trống thì kế thừa.');
  sh.getRange('B1').setNote('Không bắt buộc. Để trống thì app tự đánh STT theo hạng mục.');
  sh.getRange('C1').setNote('BẮT BUỘC. Chỉ ghi ở dòng đầu mỗi hạng mục; dòng dưới để trống thì kế thừa.');
  sh.getRange('D1').setNote('BẮT BUỘC. Mỗi dòng là một công việc.');
  // Mock data: 3 dự án mới, trình bày giống Trang tính1 (tên dự án / STT + hạng mục chỉ ở dòng đầu).
  // Dự án thứ 3 để trống STT để kiểm tra app tự đánh số theo hạng mục.
  const mock=[
    ['[MOCK] Website Nhà hàng Hương Quê','1','Khảo sát & cấu trúc website','Phỏng vấn chủ nhà hàng về thực đơn, khách mục tiêu, chức năng đặt bàn','Biên bản khảo sát + danh sách chức năng'],
    ['','','','Lập sitemap và wireframe trang chủ, thực đơn, đặt bàn',''],
    ['','','','Chốt cấu trúc với khách hàng','Khách xác nhận qua email'],
    ['','2','Thiết kế giao diện','Thiết kế UI trang chủ desktop + mobile','Tông màu ấm, ảnh món ăn nổi bật'],
    ['','','','Thiết kế trang thực đơn và trang đặt bàn',''],
    ['','','','Chỉnh sửa giao diện theo góp ý (tối đa 2 vòng)',''],
    ['','3','Chụp ảnh món ăn','Lên shotlist 30 món và bố cục bàn ăn','Shotlist duyệt trước buổi chụp'],
    ['','','','Chụp ảnh tại nhà hàng (1 buổi)',''],
    ['','','','Hậu kỳ, chỉnh màu 30 ảnh','Xuất JPG web ≤ 300KB'],
    ['','4','Lập trình & bàn giao','Dựng website WordPress, tích hợp form đặt bàn',''],
    ['','','','Nhập thực đơn, ảnh và nội dung giới thiệu',''],
    ['','','','Kiểm thử, tối ưu tốc độ, bàn giao tài khoản quản trị','PageSpeed mobile ≥ 80'],
    ['[MOCK] Ra mắt sản phẩm Trà Thái Nguyên','1','Nghiên cứu & định vị','Khảo sát đối thủ trà cao cấp trên sàn TMĐT','So sánh giá, bao bì, thông điệp'],
    ['','','','Xác định chân dung khách hàng và thông điệp chính',''],
    ['','2','Thiết kế bao bì','Thiết kế 3 phương án hộp trà 100g','Có phương án cho quà Tết'],
    ['','','','Hoàn thiện file in, làm mẫu thử',''],
    ['','','','Kiểm tra mẫu in với nhà in','Biên bản duyệt màu'],
    ['','3','Video giới thiệu sản phẩm','Viết kịch bản video 60 giây','Kịch bản + storyboard'],
    ['','','','Quay tại đồi chè Tân Cương (1 ngày)',''],
    ['','','','Dựng phim, chèn nhạc và phụ đề','Bản 16:9 và 9:16'],
    ['','4','Truyền thông ra mắt','Lên lịch đăng bài 4 tuần trên Facebook, TikTok',''],
    ['','','','Thiết kế 12 bài đăng và 4 banner quảng cáo','Theo bộ nhận diện mới'],
    ['[MOCK] Sự kiện khai trương Showroom Nội thất An Phát','','Concept & kế hoạch sự kiện','Đề xuất 2 concept khai trương','Ngân sách dự kiến cho từng concept'],
    ['','','','Lập kịch bản chương trình và timeline ngày sự kiện',''],
    ['','','','Lên danh sách khách mời và gửi thư mời','Thư mời điện tử + bản in'],
    ['','','Thiết kế ấn phẩm','Thiết kế backdrop, standee, banner cổng','Kích thước theo mặt bằng showroom'],
    ['','','','Thiết kế voucher và quà tặng khách mời',''],
    ['','','Hậu cần & thi công','Làm việc với nhà cung cấp âm thanh, ánh sáng',''],
    ['','','','Thi công trang trí showroom trước 1 ngày','Nghiệm thu với chủ showroom'],
    ['','','','Điều phối ngày sự kiện',''],
    ['','','Quay chụp & báo cáo','Chụp ảnh và quay video highlight sự kiện','Video highlight 90 giây'],
    ['','','','Tổng hợp báo cáo sau sự kiện','Số khách, đơn hàng, chi phí thực tế']];
  sh.getRange(2,1,mock.length,head.length).setValues(mock).setWrap(true).setVerticalAlignment('top');
  // Kẻ đường phân cách giữa các dự án cho dễ nhìn.
  mock.forEach((r,i)=>{if(r[0])sh.getRange(i+2,1,1,head.length).setBorder(true,null,null,null,null,null,'#94a3b8',SpreadsheetApp.BorderStyle.SOLID);});
  const owner=Session.getEffectiveUser().getEmail();
  let guide=ss.getSheetByName(GUIDE);
  if(!guide)guide=ss.insertSheet(GUIDE);
  guide.clear();
  const lines=[
    ['HƯỚNG DẪN NHẬP CÔNG VIỆC VÀO APP SMEE'],
    ['1. Nhập ở tab "Nhập công việc", giữ nguyên hàng tiêu đề (có thể đổi tên tab).'],
    ['2. Bắt buộc: Tên dự án, Hạng mục lớn, Công việc chi tiết. Không bắt buộc: STT, Yêu cầu công việc.'],
    ['3. Các dòng cùng dự án / hạng mục để trống cột A–C ở dòng dưới: app tự kế thừa dòng trên.'],
    ['4. File có sẵn dữ liệu mock (dự án bắt đầu bằng "[MOCK]") để nhập thử; xoá các dòng này trước khi dùng thật.'],
    ['5. Trong app: Công việc → Nhập từ Google Sheet → dán link → chọn tab → Xem trước → Nhập.'],
    ['6. Nhập lại nhiều lần không tạo trùng (khớp theo dự án + hạng mục + tên việc); ô trống không ghi đè dữ liệu đã có.'],
    ['7. Sau khi nhập, bổ sung trong app: người thực hiện, deadline, ưu tiên.'],
    [''],
    ['DÙNG CHO NHIỀU NGƯỜI'],
    ['a. Tệp → Tạo bản sao (mỗi người / mỗi dự án một bản).'],
    ['b. Điền công việc vào bản sao.'],
    ['c. Chia sẻ bản sao cho '+owner+' với quyền Người xem (hoặc "Bất kỳ ai có đường liên kết đều xem được").'],
    ['d. Dán link bản sao vào app: Công việc → Nhập từ Google Sheet.'],
    ['e. Nhiều bản sao có cùng dự án / hạng mục / tên việc sẽ được gộp, không tạo trùng.']];
  guide.getRange(1,1,lines.length,1).setValues(lines);
  guide.getRange('A1').setFontWeight('bold').setFontSize(13);
  guide.getRange('A10').setFontWeight('bold');
  guide.setColumnWidth(1,860);
  ss.setActiveSheet(sh);
  Logger.log((reused?'Đã cập nhật file mẫu có sẵn: ':'Đã tạo file mẫu mới: ')+ss.getUrl());
  return {url:ss.getUrl(),id:ss.getId(),reused:reused,rows:mock.length};
}
function apiTaoFileMau(token) {
  const e=session_(token);mustManage_(e);
  const r=taoFileMauImport();
  audit_(e.name,'Tạo','File mẫu import',r.id,{url:r.url});
  return r;
}
/** Dán "Giao việc" (ưu tiên, phòng ban, người thực hiện) cho nhiều công việc; chỉ ghi các giá trị không trống. */
function apiBulkAssign(token,taskIds,input) {
  const e=session_(token);mustManage_(e);
  if(!Array.isArray(taskIds)||!taskIds.length)throw new Error('Chưa chọn công việc nào.');
  if(taskIds.length>500)throw new Error('Tối đa 500 công việc mỗi lần.');
  input=input||{};
  return guardedP_(()=>{
    const prio=String(input.uuTien||'').trim()?normalizePriority_(input.uuTien):'';
    const dept=trimmed_(input.phongBan,100);
    let person=null;const pid=trimmed_(input.nguoiThucHien||input.nguoiPhuTrachId,70);
    if(pid){person=employees_(false).find(x=>x.key===pid);if(!person)throw new Error('Người thực hiện không còn hoạt động.');}
    const deadline=input.deadline?parseDate_(input.deadline):'';
    if(!prio&&!dept&&!person&&!deadline)throw new Error('Không có giá trị nào để dán.');
    const ids=new Set(taskIds.map(String)),changed=[];
    list_('tasks').filter(t=>ids.has(t.id)).forEach(t=>{
      if(prio)t.uuTien=prio;
      if(dept)t.phongBan=dept;
      if(person){t.nguoiPhuTrachId=person.key;t.nguoiPhuTrach=person.name;}
      if(deadline)t.deadline=deadline;
      t.updatedAt=now_();t.updatedBy=e.name;
      update_('tasks',t,t);changed.push(strip_(t));
    });
    audit_(e.name,'Dán giao việc','Công việc',changed.length+' việc',{uuTien:prio,phongBan:dept,nguoiThucHien:person?person.name:'',deadline:deadline,taskIds:changed.map(t=>t.id).slice(0,100)});
    return {updated:changed.length,tasks:changed};
  });
}
/** Nhật ký thao tác liên quan một công việc (APP_NHAT_KY), mới nhất trước. */
function apiTaskHistory(token,taskId) {
  const me=session_(token);const id=String(taskId||'');if(!id)return [];
  if(!me.manager){const sub=find_('subtasks',id);if(!canSeeTask_(me,sub?sub.congViecId:id))throw new Error('Bạn không có quyền xem công việc này.');}
  return list_('audit').filter(x=>x.doiTuongId===id||String(x.noiDung||'').indexOf(id)>=0)
    .sort((a,b)=>String(b.thoiGian).localeCompare(String(a.thoiGian))).slice(0,50).map(x=>{
      let info={};try{info=JSON.parse(x.noiDung||'{}');}catch(_e){}
      const detail=Object.keys(info).filter(k=>['taskIds','link'].indexOf(k)<0&&info[k]!==''&&info[k]!=null).map(k=>k+': '+(typeof info[k]==='object'?JSON.stringify(info[k]):info[k])).join(' · ').slice(0,300);
      return {thoiGian:x.thoiGian,actor:x.actor,hanhDong:x.hanhDong,loai:x.loai,chiTiet:detail};
    });
}
/** Ghi (hoặc tạo) một dòng cấu hình trong APP_CAU_HINH. */
function setConfig_(key,value) {
  const row=list_('config').find(x=>x.key===key);
  if(row){row.value=String(value);update_('config',row,row);}else append_('config',{key:key,value:String(value)});
}
/** Ngày làm việc trong tuần (0=CN … 6=T7), mặc định T2–T7. */
function workDays_(rows) {
  const row=(rows||list_('config')).find(x=>x.key==='workDays');
  const days=String(row&&row.value!=null?row.value:'1,2,3,4,5,6').split(',').map(x=>parseInt(x,10)).filter(n=>n>=0&&n<=6);
  return days.length?days:[1,2,3,4,5,6];
}
/** Một dòng theo ngày và công việc. Giờ phát sinh trong dự án được lưu thành bản ghi riêng. */
function apiSaveDay(token,input) {
  const e=session_(token);input=input||{};
  const items=Array.isArray(input.items)?input.items:[];
  if(!items.length||items.length>40)throw new Error('Nhập từ 1 đến 40 công việc để lưu.');
  return guardedP_(()=>{
    const day=workLogDate_(input.ngay);
    const ek=e.manager?String(input.employeeKey||e.key):e.key;
    const who=employees_(e.manager).find(x=>x.key===ek)||(ek===e.key?e:null);
    if(!who)throw new Error('Nhân viên không hợp lệ.');
    const all=list_('days').filter(x=>x.employeeKey===ek&&x.ngay===day);
    const seen=new Set(),ts=now_();
    let total=all.reduce((s,x)=>s+Number(x.soGio||0),0);
    const changes=items.map((value,i)=>{
      const it=value||{},prefix='Dòng '+(i+1)+': ';
      try{
        const t=find_('tasks',it.congViecId);
        if(!t)throw new Error('Công việc không tồn tại.');
        if(seen.has(t.id))throw new Error('Công việc "'+t.tenCongViec+'" bị chọn hai lần.');
        seen.add(t.id);
        if(!e.manager&&!worksOn_(t,ek))throw new Error('Bạn chỉ ghi giờ cho công việc mình thực hiện.');
        if(t.nguoiPhuTrachId&&t.nguoiPhuTrachId!==ek)throw new Error('Chỉ người thực hiện được ghi giờ cho công việc "'+t.tenCongViec+'".');
        const h=workLogHours_(it.soGio);
        const old=all.find(x=>x.congViecId===t.id&&!x.tenViecTrucTiep);
        total+=h-Number(old?.soGio||0);
        return {it,t,h,old,vm:checkBlk_(it.vuongMac)};
      }catch(err){throw new Error(prefix+err.message);}
    });
    if(total>24)throw new Error('Tổng giờ trong ngày vượt 24 giờ ('+total+' giờ).');
    let saved=0;
    for(const {it,t,h,old,vm} of changes){
      if(!h)continue;
      const rec={...strip_(old||{}),id:old?.id||uuid_(),ngay:day,employeeKey:ek,congViecId:t.id,soGio:String(h),
        noiDung:it.noiDung===undefined?old?.noiDung||'':trimmed_(it.noiDung,10000),ghiChu:it.ghiChu===undefined?old?.ghiChu||'':trimmed_(it.ghiChu,1000),createdAt:old?.createdAt||ts,
        updatedAt:ts,createdBy:old?.createdBy||e.key,updatedBy:e.key};
      old?update_('days',old,rec):append_('days',rec);saved++;
      startTaskFromWorkLog_(e,t,day,ts);
      if(vm)saveBlocker_(e,{nhomNguyenNhan:vm.nhomNguyenNhan,nguyenNhan:vm.nguyenNhan,dangCho:vm.dangCho,nguoiCanXuLy:vm.nguoiCanXuLy,moTaViecKhac:vm.moTaViecKhac,
        soLuongDuKien:vm.soLuongDuKien,donViDuKien:vm.donViDuKien,batDauCho:day===ts.slice(0,10)?ts.slice(0,16):day+'T08:00',trangThai:'Đang chờ',taskId:t.id,employeeKey:ek,
        ghiChu:'Ghi cùng giờ làm ngày '+day.slice(8,10)+'/'+day.slice(5,7)});
      audit_(e.name,old?'Sửa':'Ghi','Giờ làm ngày',rec.id,{ngay:day,task:t.tenCongViec,gio:h,nguoi:who.name});
    }
    changes.filter(c=>!c.h&&c.old).sort((a,b)=>b.old._row-a.old._row).forEach(({old,t})=>{
      remove_('days',old);audit_(e.name,'Xóa','Giờ làm ngày',old.id,{ngay:day,task:t.tenCongViec});
    });
    return {saved,total,employeeKey:ek};
  });
}
function workLogDate_(value){
  const day=parseDate_(value);
  if(!day)throw new Error('Chọn ngày ghi giờ.');
  if(day>now_().slice(0,10))throw new Error('Không ghi giờ làm cho ngày sau hôm nay.');
  return day;
}
function workLogHours_(value){
  const raw=Number(String(value??'').trim().replace(',','.'));
  if(!Number.isFinite(raw)||raw<0||raw>24)throw new Error('Số giờ phải từ 0 đến 24 (bước 0,5).');
  return Math.round(raw*2)/2;
}
function startTaskFromWorkLog_(e,t,day,ts){
  if(t.trangThai!=='Chưa bắt đầu')return;
  update_('tasks',t,{...strip_(t),trangThai:'Đang thực hiện',updatedAt:ts,updatedBy:e.name});
  audit_(e.name,'Tự chuyển trạng thái','Công việc',t.id,{tu:'Chưa bắt đầu',thanh:'Đang thực hiện',lyDo:'Ghi giờ làm ngày '+day});
}
function apiSaveDayReport(token,input){
  const e=session_(token);input=input||{};
  return guardedP_(()=>{
    const row=find_('days',input.id);
    if(!row)throw new Error('Không tìm thấy bản ghi giờ làm.');
    if(!e.manager&&row.employeeKey!==e.key)throw new Error('Bạn chỉ sửa báo cáo của chính mình.');
    const status=input.trangThaiNgay===undefined?row.trangThaiNgay:String(input.trangThaiNgay).trim();
    if(input.trangThaiNgay!==undefined&&!CFG.DEFAULT_STATUSES.includes(status))throw new Error('Trạng thái báo cáo không hợp lệ.');
    const content=input.noiDung===undefined?row.noiDung:trimmed_(input.noiDung,10000);
    const updated={...strip_(row),noiDung:content,trangThaiNgay:status,updatedAt:now_(),updatedBy:e.key};
    update_('days',row,updated);
    audit_(e.name,'Sửa','Báo cáo cuối ngày',row.id,{ngay:row.ngay,trangThaiNgay:status});
    SpreadsheetApp.flush();
    return updated;
  });
}
/** Lượt ghi giờ trực tiếp chỉ cần mã dòng, ngày, nhân viên và giờ để kiểm tra tổng. */
function projectDayHours_(sh,columns,lastRow){
  if(lastRow<2)return [];
  const fields=CFG.FIELDS.days,keys=['id','ngay','employeeKey','soGio'];
  const indices=keys.map(key=>columns.idx[fields.indexOf(key)]);
  const first=Math.min(...indices),last=Math.max(...indices);
  const [id,date,employee,hours]=indices.map(index=>index-first);
  return sh.getRange(2,first+1,lastRow-1,last-first+1).getValues().flatMap((cells,index)=>{
    if(!cells[id])return [];
    const value=cells[date],numeric=Number(String(cells[hours]).replace(',','.'));
    return [{id:String(cells[id]),ngay:normDt_('d',value,value),employeeKey:String(cells[employee]),hours:Number.isFinite(numeric)?numeric:0,_row:index+2}];
  });
}
function projectDaySavedRow_(sh,columns,match){
  const row=match._row,range=sh.getRange(row,1,1,columns.width),cells=range.getDisplayValues()[0],record={_row:row};
  let raw;
  CFG.FIELDS.days.forEach((key,index)=>{
    const col=columns.idx[index],value=cells[col]||'';
    if(key==='ngay')record[key]=match.ngay;
    else if(DT_FIELDS_[key]&&value&&!ISO_OK_.test(value)){
      if(!raw)raw=range.getValues()[0];
      record[key]=normDt_(DT_FIELDS_[key],value,raw[col]);
    }else record[key]=value;
  });
  return {record,cells,row};
}
function apiSaveProjectDay(token,input){
  const e=session_(token);input=input||{};
  return guardedP_(()=>{
    const editing=!!input.id;
    const requestId=String(input.requestId||'');
    if(!editing&&!/^[a-f0-9]{32}$/.test(requestId))throw new Error('Mã yêu cầu ghi giờ không hợp lệ.');
    const id=editing?String(input.id):'project-day-'+requestId;
    const layout={},sh=table_('days',layout);
    layout.columns=layout.columns||headCols_(sh,CFG.FIELDS.days);
    layout.lastRow=sh.getLastRow();
    const hoursRows=projectDayHours_(sh,layout.columns,layout.lastRow);
    const match=hoursRows.find(row=>row.id===id);
    if(match&&!e.manager&&match.employeeKey!==e.key)throw new Error('Bạn không có quyền sửa bản ghi này.');
    if(match)layout.saved=projectDaySavedRow_(sh,layout.columns,match);
    const old=layout.saved?.record;
    if(old&&!old.tenViecTrucTiep)throw new Error('Bạn không có quyền sửa bản ghi này.');
    if(editing&&!old)throw new Error('Không tìm thấy bản ghi giờ dự án.');
    if(!editing&&old){patchNote_('days','up',strip_(old));return strip_(old);}
    const ek=old?.employeeKey||(e.manager?String(input.employeeKey||e.key):e.key);
    const who=ek===e.key?e:employees_(true).find(x=>x.key===ek);
    if(!who||(!old&&who.active===false))throw new Error('Nhân viên không hợp lệ.');
    const pj=find_('projects',old?.congViecId?find_('tasks',old.congViecId)?.duAnId||old.duAnId:input.duAnId);
    if(!pj)throw new Error('Chọn dự án.');
    const name=trimmed_(input.tenViecTrucTiep,700);
    if(!name)throw new Error('Nhập tên việc đã làm.');
    const day=workLogDate_(input.ngay),h=workLogHours_(input.soGio);
    if(!h)throw new Error('Nhập số giờ lớn hơn 0.');
    const total=hoursRows.reduce((sum,row)=>row.id!==id&&row.employeeKey===ek&&row.ngay===day?sum+row.hours:sum,h);
    if(total>24)throw new Error('Tổng giờ trong ngày vượt 24 giờ ('+total+' giờ).');
    const ts=now_(),rec={...strip_(old||{}),id,ngay:day,employeeKey:ek,duAnId:pj.id,congViecId:old?.congViecId||'',
      tenViecTrucTiep:name,soGio:String(h),noiDung:trimmed_(input.noiDung,10000),createdAt:old?.createdAt||ts,updatedAt:ts,createdBy:old?.createdBy||e.key,updatedBy:e.key};
    old?update_('days',old,rec,layout):append_('days',rec,layout);
    audit_(e.name,old?'Sửa':'Ghi','Giờ trực tiếp vào dự án',id,{ngay:day,duAnId:pj.id,ten:name,gio:h});
    SpreadsheetApp.flush();
    return rec;
  });
}
function apiLinkProjectDay(token,input){
  const e=session_(token);mustManage_(e);input=input||{};
  return guardedP_(()=>{
    const row=find_('days',input.id);
    if(!row?.tenViecTrucTiep)throw new Error('Không tìm thấy bản ghi giờ trực tiếp vào dự án.');
    const create=input.create===true,taskId=create?'project-day-task-'+row.id:String(input.congViecId||'');
    if(!taskId)throw new Error('Chọn công việc cần gắn.');
    if(row.congViecId&&row.congViecId!==taskId)throw new Error('Bản ghi đã được gắn vào công việc khác.');
    let task=find_('tasks',taskId);
    if(!task&&create){
      const pj=find_('projects',row.duAnId),who=employees_(true).find(x=>x.key===row.employeeKey);
      if(!pj||!who)throw new Error('Dự án hoặc nhân viên của bản ghi không còn tồn tại.');
      task=createAdhocTask_(e,{tenCongViec:row.tenViecTrucTiep,ngayGiao:row.ngay,deadline:input.deadline||'',hasWorkLog:true},pj,who,taskId);
    }
    if(!task||task.duAnId!==row.duAnId)throw new Error('Chọn công việc thuộc cùng dự án.');
    if(task.nguoiPhuTrachId&&task.nguoiPhuTrachId!==row.employeeKey)throw new Error('Công việc đang giao cho nhân viên khác.');
    if(task.trangThai==='Hủy')throw new Error('Công việc đã hủy.');
    const ts=now_();
    if(!row.congViecId){
      update_('days',row,{...strip_(row),congViecId:task.id,updatedAt:ts,updatedBy:e.key});
      audit_(e.name,'Gắn vào công việc','Giờ trực tiếp vào dự án',row.id,{ngay:row.ngay,congViecId:task.id});
    }
    if(row.congViecId)patchNote_('days','up',strip_(row));
    if(task.trangThai==='Chưa bắt đầu')startTaskFromWorkLog_(e,task,row.ngay,ts);
    else patchNote_('tasks','up',strip_(task));
    SpreadsheetApp.flush();
    return {congViecId:task.id};
  });
}
function apiDeleteDay(token,id) {
  const e=session_(token);
  return guardedP_(()=>{const r=find_('days',id);if(!r)throw new Error('Không tìm thấy dòng giờ làm.');
    if(!e.manager&&r.employeeKey!==e.key)throw new Error('Bạn chỉ xoá giờ làm của chính mình.');
    remove_('days',r);audit_(e.name,'Xóa','Giờ làm ngày',id,{ngay:r.ngay,task:r.congViecId,gio:r.soGio});return true;});
}
/** BUILD 7.2 — Dọn giờ ghi sai người (người ghi ≠ người thực hiện công việc). Dòng [MOCK…]: sao lưu rồi xoá; dòng thật: chỉ liệt kê. */
/** BUILD 7.2 — Đặt "Chưa bắt đầu" cho việc đang "Đang thực hiện" mà chưa có giờ làm nào (không đụng việc Hoàn thành / chờ duyệt). Có sao lưu tab công việc. */
/** BUILD 7.2 — Tạo việc bổ sung: nhân viên tự tạo (giao cho chính mình), quản lý tạo cho bất kỳ ai. Không cần duyệt. */
/** BUILD 7.2 — Lưu báo cáo Account / Sale (chỉ dòng của chính mình). */
function apiSaveKd(token,kind,input) {
  const e=session_(token);if(kind!=='kdAcc'&&kind!=='kdSale')throw new Error('Loại báo cáo không hợp lệ.');
  if(!kdAccess_(e,kind))throw new Error('Bạn không có quyền với báo cáo này.');input=input||{};
  return guardedP_(()=>{
    const old=input.id?find_(kind,input.id):null;if(input.id&&!old)throw new Error('Không tìm thấy dòng báo cáo.');
    if(old&&old.employeeKey!==e.key)throw new Error('Bạn chỉ sửa được báo cáo của chính mình.');
    const day=parseDate_(input.ngay)||now_().slice(0,10);if(day>now_().slice(0,10))throw new Error('Không báo cáo cho ngày sau hôm nay.');
    const nd=trimmed_(input.noiDung,8000);if(!nd)throw new Error('Nhập nội dung công việc.');let rec;
    if(kind==='kdAcc'){const pj=input.duAnId?find_('projects',input.duAnId):null;const pr=String(input.tienDo==null?'':input.tienDo).trim();let pct='';
      if(pr!==''){const n=Math.round(Number(pr));if(!isFinite(n)||n<0||n>100)throw new Error('Tiến độ phải từ 0 đến 100%.');pct=String(n);}
      rec={duAnId:pj?pj.id:'',khachHang:trimmed_(input.khachHang,300)||(pj?pj.tenDuAn:''),noiDung:nd,ketQua:trimmed_(input.ketQua,4000),tienDo:pct,ghiChu:trimmed_(input.ghiChu,2000)};}
    else rec={noiDung:nd,ghiChu:trimmed_(input.ghiChu,2000)};
    Object.assign(rec,{id:old?old.id:uuid_(),ngay:day,employeeKey:e.key,createdAt:old?old.createdAt:now_(),updatedAt:now_(),nhanXet:old?old.nhanXet||'':'',nguoiNhanXet:old?old.nguoiNhanXet||'':''});
    old?update_(kind,old,rec):append_(kind,rec);audit_(e.name,old?'Sửa':'Ghi',kind==='kdAcc'?'Báo cáo Account':'Báo cáo Sale',rec.id,{ngay:day});return rec;
  });
}
function apiDeleteKd(token,kind,id) {
  const e=session_(token);if(!kdAccess_(e,kind))throw new Error('Bạn không có quyền với báo cáo này.');
  return guardedP_(()=>{const r=find_(kind,id);if(!r)throw new Error('Không tìm thấy dòng báo cáo.');if(r.employeeKey!==e.key&&!isBoss_(e))throw new Error('Bạn chỉ xoá được báo cáo của chính mình.');
    remove_(kind,r);audit_(e.name,'Xóa',kind==='kdAcc'?'Báo cáo Account':'Báo cáo Sale',id,{ngay:r.ngay});return true;});
}
/** Nhận xét của Giám đốc / Trợ lý GĐ trên một dòng báo cáo. */
function apiKdComment(token,kind,id,text) {
  const e=session_(token);if(!isBoss_(e))throw new Error('Chỉ Giám đốc / Trợ lý GĐ được nhận xét.');if(kind!=='kdAcc'&&kind!=='kdSale')throw new Error('Loại báo cáo không hợp lệ.');
  return guardedP_(()=>{const r=find_(kind,id);if(!r)throw new Error('Không tìm thấy dòng báo cáo.');const n=strip_(r);n.nhanXet=trimmed_(text,1000);n.nguoiNhanXet=n.nhanXet?e.name:'';n.updatedAt=now_();update_(kind,r,n);
    audit_(e.name,'Nhận xét',kind==='kdAcc'?'Báo cáo Account':'Báo cáo Sale',id,{nhanXet:n.nhanXet});return n;});
}
/** BUILD 7.2 — Dọn cột thừa: cột có tiêu đề không còn trong danh sách cột của app (vd nguoiLamCung, gioLamId). Sao lưu tab trước, chỉ xoá đúng các cột đó.
 * Không đụng sheet nhân sự (không thuộc CFG.TABLES). */
function apiCleanColumns(token,apply) {
  const e=session_(token);mustManage_(e);
  return guarded_(()=>{
    const ss=db_(),plan=[];
    Object.keys(CFG.TABLES).forEach(k=>{const sh=ss.getSheetByName(CFG.TABLES[k]);if(!sh||sh.getLastColumn()<1)return;
      const head=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(x=>String(x).trim()),F=CFG.FIELDS[k]||[];
      const cols=[];head.forEach((h,i)=>{if(h&&F.indexOf(h)<0)cols.push({name:h,col:i+1});});
      if(cols.length)plan.push({key:k,tab:CFG.TABLES[k],cols:cols});});
    if(!apply)return plan.map(p=>({tab:p.tab,cols:p.cols.map(c=>c.name)}));
    if(!plan.length)return 'Không có cột thừa nào.';
    const stamp=Utilities.formatDate(new Date(),CFG.TIME_ZONE,'yyyyMMdd'),out=[];
    plan.forEach(p=>{const sh=ss.getSheetByName(p.tab);let bn=p.tab+'_BACKUP_COT_'+stamp,n=2;while(ss.getSheetByName(bn))bn=p.tab+'_BACKUP_COT_'+stamp+'_'+(n++);
      sh.copyTo(ss).setName(bn);p.cols.slice().sort((a,b)=>b.col-a.col).forEach(c=>(delete HEAD_[sh.getName()],sh).deleteColumn(c.col));out.push(p.tab+': '+p.cols.map(c=>c.name).join(', ')+' (sao lưu: '+bn+')');});
    listReset_();audit_(e.name,'Dọn dữ liệu','Dọn cột thừa','',{plan:plan.map(p=>({tab:p.tab,cols:p.cols.map(c=>c.name)}))});
    return 'Đã xoá cột thừa — '+out.join(' · ');
  });
}
/** Chỉ dọn các cột cũ đã được ẩn trong hai bảng, sau khi bản mới bắt đầu phục vụ. */
function retireHiddenColumns_() {
  const key='SMEE_RETIRED_COLUMNS_75_1',props=PropertiesService.getScriptProperties();
  try {
    if(props.getProperty(key))return;
    guarded_(()=>{
      if(props.getProperty(key))return;
      const ss=db_(),retired={tasks:['gioDuKien','nguoiGiao','lyDoPhatSinh','tinhPhiKH'],proposals:['gioDuKienMoi']};
      const plan=Object.keys(retired).flatMap(tableKey=>{
        const sh=ss.getSheetByName(CFG.TABLES[tableKey]),width=sh&&sh.getLastColumn();
        if(!width)return [];
        const active=CFG.FIELDS[tableKey],allowed=retired[tableKey];
        const cols=sh.getRange(1,1,1,width).getDisplayValues()[0].flatMap((name,i)=>{
          const column=i+1;
          return allowed.includes(name)&&!active.includes(name)&&sh.isColumnHiddenByUser(column)?[column]:[];
        });
        return cols.length?[{sh,cols}]:[];
      });
      const stamp=Utilities.formatDate(new Date(),CFG.TIME_ZONE,'yyyyMMdd');
      for(const {sh} of plan){
        const base=sh.getName()+'_BACKUP_COT_'+stamp;
        let name=base,n=2;
        while(ss.getSheetByName(name))name=base+'_'+n++;
        sh.copyTo(ss).setName(name).hideSheet();
      }
      for(const {sh,cols} of plan){
        cols.sort((a,b)=>b-a).forEach(column=>(delete HEAD_[sh.getName()],sh).deleteColumn(column));
      }
      props.setProperty(key,now_());
    });
  } catch(err) {
    console.error('SMEE: dọn cột lưu trữ sẽ thử lại trong phiên quản lý sau',err);
  }
}
function apiCreateAdhoc(token,input) {
  const e=session_(token);input=input||{};
  return guardedP_(()=>{
    const pj=find_('projects',input.duAnId);if(!pj)throw new Error('Chọn dự án.');
    const who=e.manager?(employees_(false).find(x=>x.key===String(input.nguoiPhuTrachId||e.key))||e):e;
    return createAdhocTask_(e,{...input,hasWorkLog:false},pj,who);
  });
}
function createAdhocTask_(e,input,pj,who,id=uuid_()){
  const name=trimmed_(input.tenCongViec,700);if(!name)throw new Error('Nhập tên việc bổ sung.');
  const ts=now_(),giao=parseDate_(input.ngayGiao)||ts.slice(0,10);
  const dl=parseDate_(input.deadline)||(input.hasWorkLog?'':ts.slice(0,10));
  const hm=trimmed_(input.hangMuc,300);if(hm)addCat_(pj.id,hm);
  const t={id,duAnId:pj.id,tenDuAn:pj.tenDuAn,stt:'',hangMuc:hm,tenCongViec:name,yeuCau:trimmed_(input.yeuCau,2000),uuTien:normalizePriority_(input.uuTien||'Trung bình'),
    phongBan:who.department||'',nguoiPhuTrach:who.name,nguoiPhuTrachId:who.key,deadline:dl,ngayBatDau:dl&&dl<giao?dl:giao,ngayKetThuc:'',
    trangThai:input.hasWorkLog?'Đang thực hiện':'Chưa bắt đầu',tienDo:'0',linkSanPham:'',ghiChu:'',nguonImport:'',nguonDong:'',
    createdAt:ts,updatedAt:ts,createdBy:e.name,updatedBy:e.name,trangThaiDuyet:'Chưa gửi',loaiViec:'Bổ sung',ngayGiao:giao};
  append_('tasks',t);audit_(e.name,'Tạo','Việc bổ sung',t.id,{ten:name,duAn:pj.tenDuAn,nguoi:who.name});return t;
}
/** BUILD 7.2 — Hạng mục đã duyệt theo dự án (APP_CAU_HINH "categories" = JSON {duAnId:[hạng mục…]}). */
function catsCfg_(rows){const r=(rows||list_('config')).find(x=>x.key==='categories');try{const o=r?JSON.parse(r.value):{};return o&&typeof o==='object'?o:{};}catch(_e){return {};}}
function addCat_(duAnId,name){const n=trimmed_(name,300);if(!duAnId||!n)return;const o=catsCfg_();const l=o[duAnId]||(o[duAnId]=[]);if(l.map(norm_).indexOf(norm_(n))<0){l.push(n);setConfig_('categories',JSON.stringify(o));}}
const PROP_TYPES_={DU_AN_CONG_VIEC:'Dự án & công việc',DU_AN_MOI:'Dự án mới',HANG_MUC_MOI:'Hạng mục mới',CONG_VIEC_MOI:'Công việc mới',NGUOI_LAM_CUNG:'Người làm cùng'};
/** BUILD 7.2 — Nhân viên đề xuất (dự án / hạng mục / công việc / người làm cùng); chưa thành dữ liệu thật cho tới khi được duyệt. */
function apiPropose(token,loai,payload,lyDo) {
  const e=session_(token);loai=String(loai||'');if(!PROP_TYPES_[loai])throw new Error('Loại đề xuất không hợp lệ.');
  const p=payload&&typeof payload==='object'?payload:{};const why=trimmed_(lyDo,2000);
  return guardedP_(()=>{
    const clean={};let taskId='';
    // BUILD 7.2: chỉ quản lý được tạo dự án mới (nhân viên phải chọn dự án có sẵn).
    if(!e.manager&&(loai==='DU_AN_MOI'||(loai==='DU_AN_CONG_VIEC'&&p.duAnMoi&&typeof p.duAnMoi==='object'&&String(p.duAnMoi.tenDuAn||'').trim())))throw new Error('Chỉ Account, Trợ lý GĐ, Giám đốc được tạo dự án mới.');
    if(loai==='DU_AN_MOI'){clean.tenDuAn=trimmed_(p.tenDuAn,250);clean.moTa=trimmed_(p.moTa,2000);if(!clean.tenDuAn)throw new Error('Nhập tên dự án.');
      if(list_('projects').some(x=>norm_(x.tenDuAn)===norm_(clean.tenDuAn)))throw new Error('Tên dự án đã tồn tại.');}
    else if(loai==='HANG_MUC_MOI'){const pj=find_('projects',p.duAnId);if(!pj)throw new Error('Chọn dự án.');clean.duAnId=pj.id;clean.tenDuAn=pj.tenDuAn;clean.hangMuc=trimmed_(p.hangMuc,300);if(!clean.hangMuc)throw new Error('Nhập tên hạng mục.');}
    else if(loai==='CONG_VIEC_MOI'){const pj=find_('projects',p.duAnId);if(!pj)throw new Error('Chọn dự án.');
      Object.assign(clean,{duAnId:pj.id,tenDuAn:pj.tenDuAn,hangMuc:trimmed_(p.hangMuc,300),tenCongViec:trimmed_(p.tenCongViec,700),yeuCau:trimmed_(p.yeuCau,2000),
        deadline:parseDate_(p.deadline),ngayBatDau:parseDate_(p.ngayBatDau),uuTien:normalizePriority_(p.uuTien),nguoiPhuTrachId:trimmed_(p.nguoiPhuTrachId,70)||e.key});
      if(!clean.tenCongViec)throw new Error('Nhập tên công việc.');
      if(!employees_(false).some(x=>x.key===clean.nguoiPhuTrachId))throw new Error('Người thực hiện không hợp lệ.');
      clean.hangMucMoi=!!clean.hangMuc&&!list_('tasks').some(t=>t.duAnId===pj.id&&norm_(t.hangMuc)===norm_(clean.hangMuc))&&!(catsCfg_()[pj.id]||[]).some(c=>norm_(c)===norm_(clean.hangMuc));}
    else if(loai==='DU_AN_CONG_VIEC'){
      // BUILD 7.2: một đề xuất gồm dự án (có sẵn hoặc mới) + nhiều công việc; người đề xuất là người thực hiện mặc định.
      if(p.duAnMoi&&typeof p.duAnMoi==='object'&&String(p.duAnMoi.tenDuAn||'').trim()){clean.duAnMoi={tenDuAn:trimmed_(p.duAnMoi.tenDuAn,250),moTa:trimmed_(p.duAnMoi.moTa,2000)};
        if(list_('projects').some(x=>norm_(x.tenDuAn)===norm_(clean.duAnMoi.tenDuAn)))throw new Error('Tên dự án đã tồn tại — hãy chọn dự án có sẵn.');clean.tenDuAn=clean.duAnMoi.tenDuAn;}
      else{const pj=find_('projects',p.duAnId);if(!pj)throw new Error('Chọn dự án hoặc nhập dự án mới.');clean.duAnId=pj.id;clean.tenDuAn=pj.tenDuAn;}
      const tl=Array.isArray(p.tasks)?p.tasks:[];if(!tl.length)throw new Error('Thêm ít nhất một công việc.');if(tl.length>30)throw new Error('Tối đa 30 công việc mỗi đề xuất.');
      clean.tasks=tl.map((x,i)=>{x=x||{};const o={hangMuc:trimmed_(x.hangMuc,300),tenCongViec:trimmed_(x.tenCongViec,700),yeuCau:trimmed_(x.yeuCau,2000),ngayBatDau:parseDate_(x.ngayBatDau),deadline:parseDate_(x.deadline)};
        if(!o.tenCongViec)throw new Error('Công việc '+(i+1)+': nhập tên công việc.');if(o.ngayBatDau&&o.deadline&&o.ngayBatDau>o.deadline)throw new Error('Công việc '+(i+1)+': deadline phải sau ngày bắt đầu.');
        return o;});}
    else if(loai==='NGUOI_LAM_CUNG'){const t=find_('tasks',p.congViecId);if(!t)throw new Error('Không tìm thấy công việc.');mustWork_(t,e);taskId=t.id;
      const act=employees_(false),cur=coworkers_(t);clean.keys=Array.from(new Set((Array.isArray(p.keys)?p.keys:String(p.keys||'').split(',')).map(s=>String(s).trim()).filter(k=>k&&k!==t.nguoiPhuTrachId&&cur.indexOf(k)<0&&act.some(x=>x.key===k))));
      if(!clean.keys.length)throw new Error('Chọn ít nhất một người làm cùng (chưa có trong công việc).');clean.names=clean.keys.map(k=>act.find(x=>x.key===k).name);clean.tenCongViec=t.tenCongViec;}
    const rec={id:uuid_(),congViecId:taskId,nguoiDeXuat:e.name,nguoiDeXuatId:e.key,batDauCu:'',hanCu:'',batDauMoi:'',hanMoi:'',lyDo:why,trangThai:'Chờ duyệt',nguoiDuyet:'',ghiChuDuyet:'',
      thoiGianTao:now_(),thoiGianDuyet:'',loai:loai,payload:JSON.stringify(clean)};
    append_('proposals',rec);audit_(e.name,'Đề xuất',PROP_TYPES_[loai],rec.id,clean);return rec;
  });
}
/** Áp dụng một đề xuất loại mới khi được duyệt (quản lý có thể chỉnh trường trước khi duyệt — overrides). */
function applyProposal_(e,p,ov) {
  const d=Object.assign({},JSON.parse(p.payload||'{}'),ov&&typeof ov==='object'?ov:{});
  if(p.loai==='DU_AN_MOI')return saveProject_(e,{tenDuAn:d.tenDuAn,moTa:d.moTa});
  if(p.loai==='DU_AN_CONG_VIEC'){let pid=d.duAnId;
    if(d.duAnMoi&&String(d.duAnMoi.tenDuAn||'').trim())pid=saveProject_(e,{tenDuAn:d.duAnMoi.tenDuAn,moTa:d.duAnMoi.moTa}).id;
    if(!find_('projects',pid))throw new Error('Dự án không còn tồn tại.');const act=employees_(false),made=[];
    (d.tasks||[]).forEach(x=>{if(x.hangMuc)addCat_(pid,x.hangMuc);const who=act.some(a=>a.key===x.nguoiPhuTrachId)?x.nguoiPhuTrachId:(act.some(a=>a.key===p.nguoiDeXuatId)?p.nguoiDeXuatId:'');
      made.push(saveTask_(e,{duAnId:pid,hangMuc:x.hangMuc,tenCongViec:x.tenCongViec,yeuCau:x.yeuCau,deadline:x.deadline,ngayBatDau:x.ngayBatDau,uuTien:x.uuTien||'Trung bình',nguoiPhuTrachId:who,
        trangThai:'Chưa bắt đầu',tienDo:0,stt:'',phongBan:'',ghiChu:'Tạo từ đề xuất của '+p.nguoiDeXuat}));});
    return {id:made[0]?made[0].id:'',duAnId:pid,soCongViec:made.length};}
  if(p.loai==='HANG_MUC_MOI'){if(!find_('projects',d.duAnId))throw new Error('Dự án không còn tồn tại.');addCat_(d.duAnId,d.hangMuc);return d;}
  if(p.loai==='CONG_VIEC_MOI'){if(d.hangMuc)addCat_(d.duAnId,d.hangMuc);
    return saveTask_(e,{duAnId:d.duAnId,hangMuc:d.hangMuc,tenCongViec:d.tenCongViec,yeuCau:d.yeuCau,deadline:d.deadline,ngayBatDau:d.ngayBatDau,uuTien:d.uuTien||'Trung bình',
      nguoiPhuTrachId:d.nguoiPhuTrachId,trangThai:'Chưa bắt đầu',tienDo:0,stt:'',phongBan:'',ghiChu:'Tạo từ đề xuất của '+p.nguoiDeXuat,nguoiLamCung:d.nguoiLamCung||''});}
  if(p.loai==='NGUOI_LAM_CUNG'){const t=find_('tasks',p.congViecId);if(!t)throw new Error('Công việc không còn tồn tại.');
    const keys=Array.isArray(d.keys)?d.keys:String(d.keys||'').split(',');const n=strip_(t);n.nguoiLamCung=Array.from(new Set(coworkers_(t).concat(keys.map(s=>String(s).trim()).filter(k=>k&&k!==t.nguoiPhuTrachId)))).join(',');
    n.updatedAt=now_();n.updatedBy=e.name;update_('tasks',t,n);return n;}
  throw new Error('Loại đề xuất không hợp lệ.');
}
/** BUILD 7.2 — Chuyển dữ liệu sang BUILD 7.2 (chạy từ Thiết lập, chỉ quản lý; chạy lại an toàn).
 * 1) sao lưu APP_LICH_GIO; 2) tạo APP_GIO_LAM_NGAY = cộng giờ THỰC TẾ theo (nhân viên, ngày, công việc), nối nội dung; 3) thêm cột mới; 4) vướng mắc gắn phiên giờ → gắn công việc + ngày. */
/** BUILD 7.2 — Ngưỡng % hoàn thành để coi là "sẵn sàng nhận việc mới" (chỉ để nhắc, KHÔNG chặn giao việc). Mặc định 80. */
function readyPct_(rows){const r=(rows||list_('config')).find(x=>x.key==='readyPct');const n=r?parseInt(r.value,10):NaN;return n>=1&&n<=100?n:80;}
function apiSaveReadyPct(token,v){
  const e=session_(token);mustManage_(e);const n=Number(v);
  if(!Number.isInteger(n)||n<1||n>100)throw new Error('Ngưỡng phải là số nguyên từ 1 đến 100.');
  return guarded_(()=>{setConfig_('readyPct',String(n));audit_(e.name,'Sửa','Cấu hình','readyPct',{value:n});return n;});
}
function apiSaveWorkDays(token,days) {
  const e=session_(token);mustManage_(e);
  const list=(Array.isArray(days)?days:[]).map(x=>parseInt(x,10)).filter(n=>n>=0&&n<=6);
  if(!list.length)throw new Error('Phải chọn ít nhất một ngày làm việc trong tuần.');
  return guarded_(()=>{setConfig_('workDays',Array.from(new Set(list)).sort().join(','));audit_(e.name,'Sửa','Lịch làm việc','workDays',{days:list});return true;});
}
const HOLIDAY_TYPES_=['Lễ tết','Du lịch công ty','Nghỉ công ty khác','Ngày làm bù'];
/** Thêm / sửa ngày nghỉ. Thêm theo khoảng: mỗi ngày một dòng (tối đa 60 ngày), bỏ qua ngày đã có. */
function apiSaveHoliday(token,input) {
  const e=session_(token);mustManage_(e);input=input||{};
  const name=trimmed_(input.tenNgayNghi,200);if(!name)throw new Error('Nhập tên ngày nghỉ.');
  const type=HOLIDAY_TYPES_.indexOf(input.loai)>=0?input.loai:'Nghỉ công ty khác',note=trimmed_(input.ghiChu,500);
  return guarded_(()=>{
    const all=list_('holidays');
    if(input.id){const old=all.find(x=>x.id===input.id);if(!old)throw new Error('Không tìm thấy ngày nghỉ.');
      const day=parseDate_(input.tuNgay||old.ngay);if(all.some(x=>x.ngay===day&&x.id!==old.id))throw new Error('Ngày '+day+' đã có trong danh sách.');
      Object.assign(old,{ngay:day,tenNgayNghi:name,loai:type,ghiChu:note});update_('holidays',old,old);audit_(e.name,'Sửa','Ngày nghỉ',old.id,{ngay:day,ten:name});return {added:0,updated:1};}
    const from=parseDate_(input.tuNgay),to=input.denNgay?parseDate_(input.denNgay):from;if(!from)throw new Error('Chọn ngày.');
    if(to<from)throw new Error('Ngày kết thúc phải sau ngày bắt đầu.');
    const have=new Set(all.map(x=>x.ngay));let added=0,n=0;
    for(let d=new Date(from+'T00:00:00Z');d<=new Date(to+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1)){
      if(++n>60)throw new Error('Tối đa 60 ngày mỗi lần.');
      const day=d.toISOString().slice(0,10);if(have.has(day))continue;
      append_('holidays',{id:uuid_(),ngay:day,tenNgayNghi:name,loai:type,ghiChu:note,nguoiTao:e.name,thoiGianTao:now_()});added++;
    }
    audit_(e.name,'Thêm','Ngày nghỉ',from+(to!==from?'→'+to:''),{ten:name,loai:type,added:added});return {added:added,updated:0};
  });
}
function apiDeleteHoliday(token,id) {
  const e=session_(token);mustManage_(e);
  return guarded_(()=>{const rec=find_('holidays',id);if(!rec)throw new Error('Không tìm thấy ngày nghỉ.');remove_('holidays',rec);audit_(e.name,'Xóa','Ngày nghỉ',id,{ngay:rec.ngay,ten:rec.tenNgayNghi});return true;});
}
/** Ngày nghỉ lễ Việt Nam theo Bộ luật Lao động 2019 (Điều 112). Âm lịch đã quy đổi; Tết lấy 5 ngày từ 30 tháng Chạp đến mùng 4.
 * Nhà nước công bố lịch nghỉ chính thức (kể cả nghỉ bù, hoán đổi) hằng năm nên phải kiểm tra lại. */
function vnHolidays_(year) {
  const LUNAR={2026:{tet:'2026-02-17',hung:'2026-04-26'},2027:{tet:'2027-02-06',hung:'2027-04-16'},2028:{tet:'2028-01-26',hung:'2028-04-04'}};
  const l=LUNAR[year];if(!l)throw new Error('Chưa có dữ liệu âm lịch cho năm '+year+' (hỗ trợ 2026–2028).');
  const add=(iso,n)=>{const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const out=[[year+'-01-01','Tết Dương lịch']];
  for(let i=-1;i<=3;i++)out.push([add(l.tet,i),i<0?'Tết Nguyên Đán (30 tháng Chạp)':'Tết Nguyên Đán (mùng '+(i+1)+')']);
  out.push([l.hung,'Giỗ Tổ Hùng Vương (10/3 âm lịch)']);
  out.push([year+'-04-30','Ngày Chiến thắng 30/4'],[year+'-05-01','Quốc tế Lao động 1/5'],[year+'-09-01','Quốc khánh (ngày liền kề 2/9)'],[year+'-09-02','Quốc khánh 2/9']);
  return out;
}
function apiAddVnHolidays(token,year) {
  const e=session_(token);mustManage_(e);year=parseInt(year,10);
  const list=vnHolidays_(year);
  return guarded_(()=>{
    const have=new Set(list_('holidays').map(x=>x.ngay)),added=[];
    list.forEach(([day,name])=>{if(have.has(day))return;append_('holidays',{id:uuid_(),ngay:day,tenNgayNghi:name,loai:'Lễ tết',ghiChu:'Theo lịch nhà nước – kiểm tra lại khi có thông báo chính thức',nguoiTao:e.name,thoiGianTao:now_()});added.push(day+' '+name);});
    audit_(e.name,'Thêm','Ngày nghỉ lễ VN',String(year),{added:added.length});
    return {added:added,skipped:list.length-added.length};
  });
}
/** BUILD 7.2 — Đầu việc của một công việc (nhân sự tự chia nhỏ đầu việc trong hợp đồng). */
const SUB_STATUSES_=['Chưa làm','Đang làm','Hoàn thành','Tạm hoãn','Hủy'];
function subLinks_(v) {
  return String(v||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,20).map(verifyUrl_).join('\n');
}
function subFinishIso_(sub) {
  let last='';list_('time').forEach(x=>{if(x.viecConId===sub.id&&x.loai==='THUC_TE'&&x.ketThuc>last)last=x.ketThuc;});
  if(last)return last.slice(0,16);
  const d=String(sub.ngayHoanThanh||'');return d.length>=16?d.slice(0,16):(d?d.slice(0,10)+'T18:00':'');
}
/** BUILD 7.2 — Thêm / sửa đầu việc (rút gọn): Tên, Mô tả, Ghi chú + số giờ đã làm theo từng ngày.
 * Mỗi ngày lưu thành một phiên THỰC TẾ trong APP_LICH_GIO (viecConId = id đầu việc): bắt đầu 08:00,
 * kết thúc = 08:00 + số giờ (cộng thêm giờ nghỉ trưa nếu đi qua 12:00) để số giờ tính ra đúng bằng số đã nhập.
 * Quyền: người phụ trách công việc cha và quản trị sửa mọi thứ; người thực hiện đầu việc (dữ liệu cũ) chỉ sửa giờ của mình. */
function subDayEnd_(day,hours,lunch) {
  const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5)),start=8*60;
  let end=start+Math.round(hours*60);
  if(end>toMin(lunch.start))end+=Math.max(0,toMin(lunch.end)-Math.max(start,toMin(lunch.start)));
  if(end>23*60+59)throw new Error('Ngày '+day+': số giờ quá lớn (tối đa khoảng 14 giờ / ngày).');
  return day+'T'+String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
}
function apiSaveSubTask(token,input) {
  const emp=session_(token);input=input||{};
  return guardedP_(()=>{
    const old=input.id?find_('subtasks',input.id):null;
    if(input.id&&!old)throw new Error('Không tìm thấy đầu việc.');
    const task=find_('tasks',old?old.congViecId:input.congViecId);if(!task)throw new Error('Không tìm thấy công việc cha.');
    const owner=emp.manager||task.nguoiPhuTrachId===emp.key;
    if(!owner)throw new Error('Chỉ người phụ trách công việc hoặc quản trị được cập nhật đầu việc.');
    const s=old?strip_(old):{id:uuid_(),congViecId:task.id,nguoiTao:emp.name,thoiGianTao:now_()};
    if(owner){
      const name=trimmed_(input.tenViecCon,500);if(!name)throw new Error('Nhập tên đầu việc.');
      s.tenViecCon=name;s.moTa=trimmed_(input.moTa,3000);s.ghiChu=trimmed_(input.ghiChu,2000);
      if(!old)s.stt=String(list_('subtasks').filter(x=>x.congViecId===task.id).length+1);
    }
    s.nguoiCapNhat=emp.name;s.thoiGianCapNhat=now_();
    old?update_('subtasks',old,s):append_('subtasks',s);
    // Giờ theo ngày (chỉ khi client gửi danh sách days).
    let changed=0;
    if(Array.isArray(input.days)){
      if(input.days.length>400)throw new Error('Tối đa 400 dòng giờ cho một đầu việc.');
      const lunch=lunch_(),todayStr=now_().slice(0,10),active=employees_(false);
      const mine=list_('time').filter(x=>x.viecConId===s.id&&x.loai==='THUC_TE');
      const canTouch=x=>emp.manager||owner||(x.createdBy===emp.key&&x.employeeKey===emp.key);
      const keep={};
      input.days.forEach((d,i)=>{
        const day=parseDate_(d&&d.ngay);if(!day)throw new Error('Dòng '+(i+1)+': chọn ngày.');
        if(day>todayStr)throw new Error('Dòng '+(i+1)+': không ghi giờ cho ngày tương lai.');
        const h=Math.round(Number(String(d.gio==null?'':d.gio).replace(',','.'))*100)/100;
        if(!isFinite(h)||h<=0||h>14)throw new Error('Dòng '+(i+1)+': số giờ phải lớn hơn 0 và không quá 14.');
        const note=trimmed_(d.ghiChu,500);
        const prev=d.id?mine.find(x=>x.id===String(d.id)):null;
        if(prev){keep[prev.id]=1;
          if(prev.batDau.slice(0,10)===day&&Math.abs(Number(prev.soGio)-h)<0.01&&String(prev.ghiChu||'')===note)return; // không đổi: giữ nguyên khung giờ cũ
          if(!canTouch(prev))throw new Error('Dòng '+(i+1)+': bạn chỉ được sửa giờ do chính mình ghi.');
          const rec=Object.assign(strip_(prev),{batDau:day+'T08:00',ketThuc:subDayEnd_(day,h,lunch),soGio:String(h),ghiChu:note,updatedAt:now_(),updatedBy:emp.key});
          update_('time',prev,rec);changed++;return;}
        let ek=owner?(emp.manager?(task.nguoiPhuTrachId||emp.key):emp.key):emp.key;
        if(!active.some(x=>x.key===ek))ek=emp.key;
        append_('time',{id:uuid_(),taskId:task.id,employeeKey:ek,loai:'THUC_TE',batDau:day+'T08:00',ketThuc:subDayEnd_(day,h,lunch),soGio:String(h),ghiChu:note,
          duyet:'Không áp dụng',createdAt:now_(),updatedAt:now_(),createdBy:emp.key,updatedBy:emp.key,viecConId:s.id});changed++;
      });
      mine.filter(x=>!keep[x.id]).sort((a,b)=>b._row-a._row).forEach(x=>{
        if(!canTouch(x))throw new Error('Bạn chỉ được xóa giờ do chính mình ghi.');
        // _row có thể đã lệch nếu có dòng mới thêm phía sau — tìm lại trước khi xóa.
        const cur=find_('time',x.id);if(cur){remove_('time',cur);changed++;}
      });
    }
    audit_(emp.name,old?'Sửa':'Tạo','Đầu việc',s.id,{congViec:task.tenCongViec,viecCon:s.tenViecCon,taskId:task.id,gioThayDoi:changed});
    return strip_(s);
  });
}
function apiDeleteSubTask(token,id) {
  const emp=session_(token);
  return guardedP_(()=>{
    const s=find_('subtasks',id);if(!s)throw new Error('Không tìm thấy đầu việc.');
    const task=find_('tasks',s.congViecId);
    if(!emp.manager&&!(task&&task.nguoiPhuTrachId===emp.key))throw new Error('Chỉ người phụ trách công việc hoặc quản trị được xóa đầu việc.');
    // Giữ phiên giờ / vướng mắc đã ghi, chỉ bỏ liên kết tới đầu việc.
    list_('time').filter(x=>x.viecConId===id).forEach(x=>{x.viecConId='';update_('time',x,x);});
    list_('blockers').filter(x=>x.viecConId===id).forEach(x=>{x.viecConId='';update_('blockers',x,x);});
    remove_('subtasks',s);audit_(emp.name,'Xóa','Đầu việc',id,{viecCon:s.tenViecCon,taskId:s.congViecId});return true;
  });
}
/** BUILD 7.2 — Sản phẩm hằng ngày (thay tab "Sanpham" cũ, không có phần AI). */
function productTypes_(rows) {
  const row=(rows||list_('config')).find(x=>x.key==='loaiSanPham');
  try{const a=row&&row.value?JSON.parse(row.value):null;if(Array.isArray(a)&&a.length)return a.map(String);}catch(_e){}
  return CFG.DEFAULT_PRODUCT_TYPES.slice();
}
// "Công việc khác" là loại cố định (không lưu trong danh sách cấu hình).
function apiSaveProductTypes(token,list) {
  const e=session_(token);mustManage_(e);
  const arr=[];(Array.isArray(list)?list:[]).forEach(x=>{const s=trimmed_(x,60);if(s&&norm_(s)!==norm_(CFG.PRODUCT_OTHER)&&!arr.some(y=>norm_(y)===norm_(s)))arr.push(s);});
  if(!arr.length)throw new Error('Cần ít nhất một loại sản phẩm.');
  return guardedP_(()=>{
    setConfig_('loaiSanPham',JSON.stringify(arr));
    PATCH_.settings={productTypes:arr};
    audit_(e.name,'Sửa','Loại sản phẩm','loaiSanPham',{list:arr});
    return arr;
  });
}
function apiAddProductTypes(token,names) {
  const e=session_(token);mustManage_(e);
  if(!Array.isArray(names)||!names.length||names.length>30)throw new Error('Nhập từ 1 đến 30 loại sản phẩm.');
  return guardedP_(()=>{
    const list=productTypes_(), seen=new Set(list.map(norm_)), added=[];
    for(const value of names){
      const name=String(value||'').trim(), key=norm_(name);
      if(!key||name.length>60)throw new Error('Tên loại sản phẩm phải có từ 1 đến 60 ký tự.');
      if(key===norm_(CFG.PRODUCT_OTHER))throw new Error('"Công việc khác" đã có sẵn trong hệ thống.');
      if(!seen.has(key)){seen.add(key);added.push(name);}
    }
    if(!added.length)throw new Error('Loại sản phẩm đã có trong danh sách.');
    const types=list.concat(added);
    setConfig_('loaiSanPham',JSON.stringify(types));
    PATCH_.settings={productTypes:types};
    audit_(e.name,'Thêm','Loại sản phẩm','loaiSanPham',{added});
    return added;
  });
}
/** Mã lương SP giống app cũ: yyyyMM + mã NV (vd 202611NV013). */
function productPayCode_(day,emp){return day.slice(0,4)+day.slice(5,7)+String(emp&&emp.empId||'').toUpperCase().replace(/\s+/g,'');}
const PRODUCT_REPORT_SEQUENCE_KEY_ = 'SMEE_PRODUCT_REPORT_SEQUENCE';
function reserveProductReportNumbers_(products, count) {
  const props = PropertiesService.getScriptProperties();
  const stored = Number(props.getProperty(PRODUCT_REPORT_SEQUENCE_KEY_));
  const largest = products.reduce((max, row) => {
    const stt = Number(row.sttBaoCao);
    return Number.isSafeInteger(stt) ? Math.max(max, stt) : max;
  }, Number.isSafeInteger(stored) ? Math.max(0, stored) : 0);
  const last = largest + count;
  if (!Number.isSafeInteger(last)) throw new Error('Dãy STT báo cáo đã vượt giới hạn số.');
  props.setProperty(PRODUCT_REPORT_SEQUENCE_KEY_, String(last));
  return largest + 1;
}

/** Cấp số cho kết quả cũ hoặc nhập trực tiếp. Dòng chưa có mã nhóm được xem là một lần báo cáo riêng. */
/* BUILD 7.8.3: bỏ tự bổ sung STT khi tải dữ liệu — STT hiển thị được tính trên trình duyệt theo tháng. */

function appendProductReport_(records) {
  const sh = table_('products'), fields = CFG.FIELDS.products, hc = headCols_(sh, fields);
  const first = sh.getLastRow() + 1, required = first + records.length - 1;
  if (required > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), required - sh.getMaxRows());
  const cells = records.map(record => {
    const row = new Array(hc.width).fill('');
    fields.forEach((field, i) => { if (hc.idx[i] >= 0) row[hc.idx[i]] = cell_(record[field]); });
    return row;
  });
  sh.getRange(first, 1, records.length, hc.width).setNumberFormat('@').setValues(cells);
  records.forEach(record => patchNote_('products', 'up', record));
}

function reportProgress_(value, message) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(message + 'tiến độ phải từ 0 đến 100%.');
  return String(Math.round(n));
}
function sameProductReport_(a,b) {
  return a.congViecId===b.congViecId && a.employeeKey===b.employeeKey &&
    (a.sttBaoCao ? a.sttBaoCao===b.sttBaoCao : a.id===b.id);
}
function performedProductDate_(r) {
  return String(r.ngay||r.createdAt||'').slice(0,10);
}
function retimeProduct_(row,day,who,actor,ts) {
  if(day===performedProductDate_(row))return row;
  const code=String(row.maLuongSP||'');
  const month=day.slice(0,7).replace('-','');
  const empCode=who.empId?productPayCode_(day,who):'';
  return {...row,ngay:day,ngayGhi:row.ngayGhi||String(row.createdAt||'').slice(0,10)||performedProductDate_(row)||ts.slice(0,10),
    maLuongSP:empCode||(/^\d{6}/.test(code)?month+code.slice(6):code),updatedAt:ts,updatedBy:actor};
}
function writeProductEdits_(edits) {
  const ordered=edits.slice().sort((a,b)=>a[0]._row-b[0]._row), first=ordered[0][0]._row;
  if(ordered.length===1||!first||!ordered.every(([row],i)=>row._row===first+i)){
    edits.forEach(([old,value])=>update_('products',old,value));
    return;
  }
  const sh=table_('products'),fields=CFG.FIELDS.products,hc=headCols_(sh,fields);
  const range=sh.getRange(first,1,ordered.length,hc.width);
  const rows=range.getDisplayValues(),formulas=range.getFormulas();
  for(let i=0;i<rows.length;i++){
    const row=rows[i],value=ordered[i][1];
    for(let c=0;c<row.length;c++)row[c]=formulas[i][c]||cell_(row[c]);
    fields.forEach((field,c)=>{if(hc.idx[c]>=0)row[hc.idx[c]]=cell_(value[field]);});
  }
  range.setNumberFormat('@').setValues(rows);
  ordered.forEach(([,value])=>patchNote_('products','up',strip_(value)));
}
function latestProductProgress_(rows) {
  if(!rows.length)return null;
  const compare=(a,b)=>performedProductDate_(a).localeCompare(performedProductDate_(b))||
    String(a.createdAt||'').localeCompare(String(b.createdAt||''))||Number(a.sttBaoCao||0)-Number(b.sttBaoCao||0)||
    String(a.id).localeCompare(String(b.id));
  const latest=rows.reduce((a,b)=>compare(a,b)<0?b:a);
  const report=rows.filter(row=>sameProductReport_(latest,row));
  const overall=report.find(r=>r.tienDoBaoCao!==''&&r.tienDoBaoCao!=null);
  return {row:latest,pct:overall?String(overall.tienDoBaoCao):String(Math.max(...report.map(r=>Number(r.tienDo)||0)))};
}

/** Mỗi lần ghi kết quả có một STT, một công việc, một người và một ngày thực hiện. */
function apiSaveProducts(token, rows, vuongMac, taskPct, performedOn, reportKey) {
  const e = session_(token);
  vuongMac = checkBlk_(vuongMac);
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) throw new Error('Nhập từ 1 đến 50 dòng kết quả.');
  return guardedP_(() => {
    const input = rows[0] || {}, editId = String(input.id || '');
    const key = editId ? '' : trimmed_(reportKey, 80);
    if (key && !/^[a-f0-9]{32}$/.test(key)) throw new Error('Mã yêu cầu lưu không hợp lệ.');
    let productRows;
    const existingProducts = () => productRows || (productRows = list_('products'));
    if (key) {
      const previous = existingProducts().filter(r => r.createdBy === e.key && r.id.startsWith(key + '-') && r.sttBaoCao);
      if (previous.length) {
        previous.forEach(r => patchNote_('products', 'up', strip_(r)));
        return previous.map(strip_);
      }
    }
    const old = editId ? existingProducts().find(r => r.id === editId) : null;
    if (editId && (!old || rows.length !== 1)) throw new Error('Không tìm thấy dòng kết quả cần sửa.');
    if (old && !e.manager && old.employeeKey !== e.key) throw new Error('Bạn chỉ được sửa kết quả của chính mình.');
    const task = find_('tasks', old ? old.congViecId : input.congViecId);
    if (!task) throw new Error('Chọn công việc.');
    if (!old) mustWork_(task, e);
    if (old && vuongMac) throw new Error('Chỉ thêm vướng mắc cùng báo cáo mới.');
    const ek = old ? old.employeeKey : (e.manager ? String(input.employeeKey || task.nguoiPhuTrachId || e.key) : e.key);
    const who = employees_(false).find(x => x.key === ek) || (old ? {key: ek, name: old.nguoiThucHien} : null);
    if (!who) throw new Error('Nhân viên chưa hoạt động.');

    const ts = now_(), todayStr = ts.slice(0, 10);
    const priorDay=old?performedProductDate_(old):'';
    const day=parseDate_(performedOn||(!old?input.ngay:''))||priorDay||todayStr;
    if (day > todayStr) throw new Error('Ngày thực hiện không được sau hôm nay.');
    const recurring = task.chuKy && task.chuKy !== 'once';
    if (!old && recurring && ((task.ngayBatDau && day < task.ngayBatDau) || (task.deadline && day > task.deadline))) {
      throw new Error('Ngày thực hiện nằm ngoài thời gian áp dụng lịch công việc.');
    }
    const types = productTypes_();
    const overall = recurring ? '' : String(taskPct == null ? (old?.tienDoBaoCao || '') : taskPct).trim();
    const progress = overall === '' ? '' : reportProgress_(overall, '');
    const records = rows.map((row, i) => {
      const msg = 'Dòng ' + (i + 1) + ': ';
      if (!row || (!old && row.id) || (row.congViecId && row.congViecId !== task.id) || (!old && e.manager && row.employeeKey && row.employeeKey !== ek)) {
        throw new Error(msg + 'mỗi báo cáo chỉ gồm một công việc và một người thực hiện.');
      }
      const type = trimmed_(row.loaiSanPham, 60), other = type === CFG.PRODUCT_OTHER;
      if (!other && !types.includes(type) && old?.loaiSanPham !== type) throw new Error(msg + 'loại không hợp lệ.');
      const description = other ? trimmed_(row.moTaCongViec, 10000) : '';
      if (other && !description) throw new Error(msg + 'nhập mô tả công việc đã làm.');
      const name = trimmed_(row.tenSanPham, 300) || (other ? CFG.PRODUCT_OTHER : '');
      if (!name) throw new Error(msg + 'nhập tên sản phẩm.');
      const qty = other ? '' : Number(row.soLuong);
      if (!other && (!Number.isInteger(qty) || qty < 1 || qty > 100000)) throw new Error(msg + 'số lượng phải là số nguyên từ 1 đến 100.000.');
      const raw = String(row.tienDo == null ? '' : row.tienDo).trim();
      const fallback = row.tinhTrang === 'Hoàn thành' ? '100' : row.tinhTrang === 'Đang thực hiện' ? '50' : (old?.tienDo || '0');
      const pct = reportProgress_(raw === '' ? fallback : raw, msg);
      return {id: old ? old.id : key ? key + '-' + (i + 1) : uuid_(), ngay: day, employeeKey: ek, nguoiThucHien: who.name,
        duAnId: task.duAnId || '', congViecId: task.id, tenSanPham: name, loaiSanPham: type, soLuong: String(qty),
        donViTinh:other?'':trimmed_(row.donViTinh===undefined?old?.donViTinh:row.donViTinh,40),
        moTaCongViec: description, links: subLinks_(row.links), tinhTrang: pct === '100' ? 'Hoàn thành' : 'Đang thực hiện',
        tienDo: pct, tienDoBaoCao: progress, ghiChu: trimmed_(row.ghiChu, 1000),
        maLuongSP: old ? retimeProduct_(old,day,who,e.key,ts).maLuongSP : productPayCode_(day,who), ngayGhi: old ? (old.ngayGhi || String(old.createdAt || '').slice(0, 10) || priorDay || todayStr) : todayStr,
        createdAt: old ? old.createdAt : ts, updatedAt: ts, createdBy: old ? old.createdBy : e.key, updatedBy: e.key};
    });
    const reportedProgress = progress !== '' || rows.some(r => String(r.tienDo ?? '').trim() !== '' || r.tinhTrang);
    const stt = String(old?.sttBaoCao || '').trim() ? old.sttBaoCao : String(reserveProductReportNumbers_(existingProducts(), 1));
    records.forEach(rec => { rec.sttBaoCao = stt; });
    const siblings=old&&old.sttBaoCao?existingProducts().filter(r=>r.id!==old.id&&sameProductReport_(old,r)):[];
    const updatedSiblings=siblings.map(row=>{
      const retimed=retimeProduct_(row,day,who,e.key,ts);
      return taskPct!=null&&row.tienDoBaoCao!==progress?{...retimed,tienDoBaoCao:progress,updatedAt:ts,updatedBy:e.key}:retimed;
    });
    const changes=siblings.map((row,i)=>[row,updatedSiblings[i]]).filter(([before,after])=>before!==after);
    let syncPct=null;
    if(reportedProgress&&!recurring&&task.trangThai!=='Hoàn thành'&&worksOn_(task,ek)){
      const before=existingProducts().filter(r=>r.congViecId===task.id&&r.employeeKey===ek);
      const previous=latestProductProgress_(before);
      const remaining=old?before.filter(r=>!sameProductReport_(old,r)):before;
      const latest=latestProductProgress_(remaining.concat(records,updatedSiblings));
      if(sameProductReport_(latest.row,records[0])||(old&&previous&&sameProductReport_(old,previous.row)&&String(task.tienDo)===previous.pct))syncPct=latest.pct;
    }
    if (old) {
      writeProductEdits_([[old,records[0]],...changes]);
    }
    else appendProductReport_(records);

    if (vuongMac) {
      saveBlocker_(e, {
        taskId: task.id, nhomNguyenNhan: vuongMac.nhomNguyenNhan, nguyenNhan: vuongMac.nguyenNhan,
        dangCho: vuongMac.dangCho, nguoiCanXuLy: vuongMac.nguoiCanXuLy, moTaViecKhac: vuongMac.moTaViecKhac,
        soLuongDuKien: vuongMac.soLuongDuKien, donViDuKien: vuongMac.donViDuKien,
        batDauCho: day === todayStr ? ts.slice(0, 16) : day + 'T08:00',
        trangThai: 'Đang chờ', ghiChu: 'Ghi cùng kết quả công việc ngày ' + day
      });
    }
    if(syncPct!==null&&syncPct!==String(task.tienDo))update_('tasks',task,{...task,tienDo:syncPct,updatedAt:ts,updatedBy:e.name});
    audit_(e.name, old ? 'Sửa báo cáo' : 'Ghi báo cáo', 'Sản phẩm', records[0].id,
      {sttBaoCao: stt, congViec: task.tenCongViec, ngayCu:priorDay||undefined, ngayThucHien: day, soDong: records.length+changes.length});
    return records;
  });
}
function apiDeleteProduct(token,id) {
  const e=session_(token);
  return guardedP_(()=>{
    const r=find_('products',id);if(!r)throw new Error('Không tìm thấy sản phẩm.');
    if(!e.manager&&r.employeeKey!==e.key)throw new Error('Bạn chỉ được xóa kết quả công việc của chính mình.');
    remove_('products',r);audit_(e.name,'Xóa','Sản phẩm',id,{ten:r.tenSanPham,loai:r.loaiSanPham,soLuong:r.soLuong,ngay:r.ngay});return true;
  });
}
/** [MOCK] Tạo / xoá dữ liệu mẫu sản phẩm (chỉ quản trị). */
/** BUILD 7.2 — Ghi chú / kế hoạch ngày mai trên Báo cáo công việc hằng ngày (mỗi người mỗi ngày một dòng). */
function apiSaveDailyNote(token,input) {
  const e=session_(token);input=input||{};
  const key=e.manager?String(input.employeeKey||e.key):e.key;if(!e.manager&&input.employeeKey&&input.employeeKey!==e.key)throw new Error('Bạn chỉ ghi chú cho báo cáo của chính mình.');
  const day=parseDate_(input.ngay);if(!day)throw new Error('Thiếu ngày báo cáo.');
  const note=trimmed_(input.ghiChu,2000),text=trimmed_(input.noiDungBaoCao,20000);
  return guardedP_(()=>{
    const old=list_('dailyReports').find(x=>x.employeeKey===key&&x.ngay===day);
    const rec={id:old?old.id:uuid_(),ngay:day,employeeKey:key,ghiChu:note,noiDungBaoCao:text,createdAt:old?old.createdAt:now_(),updatedAt:now_()};
    old?update_('dailyReports',old,rec):append_('dailyReports',rec);
    audit_(e.name,old?'Sửa':'Ghi','Báo cáo ngày',rec.id,{ngay:day,nguoi:key});return rec;
  });
}
/** [MOCK] Tạo / xoá dữ liệu mẫu 09/11–20/11 (chỉ quản trị). */
/** BUILD 7.2 — Dọn cấu trúc Google Sheet: bỏ cột viecConId ở APP_SAN_PHAM, cột thừa ở APP_VIEC_CON. Không xoá dòng. apply=false chỉ trả về kế hoạch. */
/** BUILD 7.2 — Sửa phiên trùng giờ: chỉ dời / xoá phiên dữ liệu mẫu ([MOCK…]); dữ liệu thật chỉ liệt kê. Có sao lưu trước khi đổi. */
/** BUILD 7.2 — Xoá link sản phẩm cũ ở công việc (cột linkSanPham của APP_CONG_VIEC). Sao lưu sang tab APP_CONG_VIEC_LINK_BACKUP_<ngày> trước khi xoá ô. Không xoá dòng, không đổi trạng thái duyệt. */
/** BUILD 7.2 — Đề xuất sửa kế hoạch (nhân viên gửi, quản lý duyệt). */
function apiSaveProposal(token,input) {
  const e=session_(token);input=input||{};
  return guardedP_(()=>{
    const t=find_('tasks',input.congViecId);if(!t)throw new Error('Không tìm thấy công việc.');
    if(!e.manager&&t.nguoiPhuTrachId!==e.key)throw new Error('Bạn chỉ đề xuất sửa công việc được giao cho mình.');
    const a=parseDate_(input.batDauMoi),b=parseDate_(input.hanMoi),why=trimmed_(input.lyDo,2000);
    if(!a||!b)throw new Error('Chọn ngày bắt đầu và deadline đề xuất.');if(a>b)throw new Error('Deadline đề xuất phải sau ngày bắt đầu.');if(!why)throw new Error('Nhập lý do đề xuất.');
    if(a===t.ngayBatDau&&b===t.deadline)throw new Error('Đề xuất chưa thay đổi gì so với kế hoạch hiện tại.');
    if(list_('proposals').some(x=>x.congViecId===t.id&&x.nguoiDeXuatId===e.key&&x.trangThai==='Chờ duyệt'))throw new Error('Bạn đã có một đề xuất đang chờ duyệt cho công việc này.');
    const rec={id:uuid_(),congViecId:t.id,nguoiDeXuat:e.name,nguoiDeXuatId:e.key,batDauCu:t.ngayBatDau||'',hanCu:t.deadline||'',batDauMoi:a,hanMoi:b,lyDo:why,trangThai:'Chờ duyệt',nguoiDuyet:'',ghiChuDuyet:'',thoiGianTao:now_(),thoiGianDuyet:''};
    append_('proposals',rec);audit_(e.name,'Đề xuất sửa','Kế hoạch',t.id,{batDau:a,deadline:b,lyDo:why});return rec;
  });
}
function apiReviewProposal(token,id,approve,note,overrides) {
  const e=session_(token);mustManage_(e);
  return guardedP_(()=>{
    const p=find_('proposals',id);if(!p)throw new Error('Không tìm thấy đề xuất.');if(p.trangThai!=='Chờ duyệt')throw new Error('Đề xuất đã được xử lý.');
    const msg=trimmed_(note,1000);if(!approve&&!msg)throw new Error('Cần ghi lý do từ chối.');
    if(p.loai&&p.loai!=='SUA_KE_HOACH'){
      let made=null;if(approve)made=applyProposal_(e,p,overrides);
      audit_(e.name,approve?'Duyệt đề xuất':'Từ chối đề xuất',PROP_TYPES_[p.loai]||p.loai,p.id,{nguoiDeXuat:p.nguoiDeXuat,lyDo:msg||undefined,taoMoi:made&&made.id||undefined});
      const r=Object.assign(strip_(p),{trangThai:approve?'Đã duyệt':'Từ chối',nguoiDuyet:e.name,ghiChuDuyet:msg,thoiGianDuyet:now_(),congViecId:p.congViecId||(p.loai==='CONG_VIEC_MOI'&&made?made.id:'')});
      if(approve&&overrides&&typeof overrides==='object')r.payload=JSON.stringify(Object.assign(JSON.parse(p.payload||'{}'),overrides));
      update_('proposals',p,r);return r;}
    if(approve){const t=find_('tasks',p.congViecId);if(!t)throw new Error('Công việc không còn tồn tại.');
      const n=strip_(t);n.ngayBatDau=p.batDauMoi;n.deadline=p.hanMoi;n.updatedAt=now_();n.updatedBy=e.name;update_('tasks',t,n);
      audit_(e.name,'Duyệt đề xuất','Kế hoạch',t.id,{tu:(p.batDauCu||'')+' → '+(p.hanCu||''),thanh:p.batDauMoi+' → '+p.hanMoi,nguoiDeXuat:p.nguoiDeXuat});}
    else audit_(e.name,'Từ chối đề xuất','Kế hoạch',p.congViecId,{lyDo:msg,nguoiDeXuat:p.nguoiDeXuat});
    const r=Object.assign(strip_(p),{trangThai:approve?'Đã duyệt':'Từ chối',nguoiDuyet:e.name,ghiChuDuyet:msg,thoiGianDuyet:now_()});update_('proposals',p,r);return r;
  });
}
/** Kiểm tra đầu việc thuộc đúng công việc (dùng khi ghi giờ / vướng mắc). */
function subOf_(taskId,subId) {
  const id=trimmed_(subId,90);if(!id)return '';
  const s=find_('subtasks',id);if(!s||s.congViecId!==taskId)throw new Error('Đầu việc không thuộc công việc đã chọn.');return s.id;
}
/** Tạo các tab / cột còn thiếu (APP_VIEC_CON, APP_NGAY_NGHI, cột viecConId, gioDuKien…). Chạy từ Apps Script Editor. */
function taoBangDuLieu() {
  const actor=String(Session.getActiveUser().getEmail()||'').toLowerCase(),owner=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(!actor||actor!==owner)throw new Error('Chỉ chủ sở hữu chạy taoBangDuLieu trong Apps Script Editor.');
  const out=ensureTables_();Logger.log(out.join('\n'));return out;
}
/** [MOCK] Tạo / xoá dữ liệu mẫu đầu việc (chỉ quản trị). */
/** Dọn cột đầu việc không dùng (chỉ quản trị). */
/** Chỉ cho chạy từ Apps Script Editor bởi chủ sở hữu (hàm công khai có thể bị gọi qua google.script.run). */
function editorOwnerOnly_(fn) {
  const actor=String(Session.getActiveUser().getEmail()||'').toLowerCase(),owner=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(!actor||actor!==owner)throw new Error('Chỉ chủ sở hữu chạy '+fn+' trong Apps Script Editor.');
}
/** Tạo tab / cột còn thiếu (dùng nội bộ, không kiểm tra người chạy). */
function ensureTables_() {
  const out=[];
  Object.keys(CFG.TABLES).forEach(k=>{
    const name=CFG.TABLES[k],f=CFG.FIELDS[k];let sh=db_().getSheetByName(name);
    if(!sh){sh=db_().insertSheet(name);sh.getRange(1,1,1,f.length).setValues([f]).setBackground('#14346d').setFontColor('#ffffff').setFontWeight('bold');sh.setFrozenRows(1);sh.getRange(1,1,sh.getMaxRows(),f.length).setNumberFormat('@');out.push('Tạo tab '+name);}
    else{if(BY_HEADER_[k])ensureNamedColumns_(sh,f);else ensureTrailingColumns_(sh,f);out.push('Kiểm tra '+name+': '+f.length+' cột');}
  });
  return out;
}
function apiImportFromSource(token) {
  const e=session_(token);mustManage_(e);
  const sheet=byGid_(CFG.SOURCE_IMPORT_SPREADSHEET_ID,CFG.SOURCE_IMPORT_GID);
  const data=sheet.getDataRange().getDisplayValues();
  return importRows_(e,data,`google:${CFG.SOURCE_IMPORT_SPREADSHEET_ID}:${CFG.SOURCE_IMPORT_GID}`);
}
function apiImportRows(token,rows,fileName) {
  const e=session_(token);mustManage_(e);
  if(!Array.isArray(rows)||!rows.length)throw new Error('File không có dữ liệu.');
  if(rows.length>5000)throw new Error('Tối đa 5.000 dòng/lượt; hãy chia file thành các phần.');
  return importRows_(e,rows,'file:'+trimmed_(fileName,180));
}
function importRows_(emp,raw,sourceKey,opts) {
  opts=opts||{};
  return guarded_(()=>{
    if(raw.length<2)throw new Error('Thiếu dòng dữ liệu trong file.');
    const head=raw[0].map(norm_);
    // Chỉ đọc cột có tiêu đề khớp; cột không có trong file được coi là trống, không đoán theo vị trí.
    // Tiêu đề nhận diện linh hoạt (đã bỏ dấu, khoảng trắng) và một số tên đồng nghĩa.
    const defs=[['Tên dự án',['tenduan','duan']],['STT',['stt','sothutu']],['Hạng mục lớn',['hangmuclon','hangmuc','hangmuccongviec']],['Công việc chi tiết',['congviecchitiet','dauviec','congviec']],
      ['Yêu cầu công việc',['yeucaucongviec','yeucaucauviec','chitietcongviec','mota','motacongviec']],['Mức độ ưu tiên',['mucdouutien']],['Phòng ban',['phongban']],
      ['Người thực hiện',['nguoithuchien']],['Deadline',['deadline']],['Ngày bắt đầu',['ngaybatdau']],['Ngày kết thúc',['ngayketthuc']],
      ['Trạng thái',['trangthai']],['Tiến độ',['tiendo']],['Link sản phẩm',['linksanpham']],['Ghi chú',['ghichu']]];
    const cols=defs.map(d=>head.findIndex(s=>d[1].includes(s)));
    if(cols[0]<0||cols[3]<0||(opts.requireCategory&&cols[2]<0))throw new Error('Dòng đầu tiên phải là tiêu đề, tối thiểu có "Tên dự án"'+(opts.requireCategory?', "Hạng mục lớn"':'')+' và "Công việc chi tiết".');
    const missing=defs.filter((d,i)=>cols[i]<0).map(d=>d[0]);
    let projects=list_('projects'), tasks=list_('tasks');
    const emps=employees_(false),stats=settings_().statuses;
    let carryProject='',carryStt='',carryCategory='';let created=0,updated=0,skipped=0,blank=0;
    const consumed=new Set();
    for(let n=1;n<raw.length;n++) {
      const r=raw[n]||[],v=i=>cols[i]<0||r[cols[i]]==null?'':String(r[cols[i]]).trim();
      if(!r.some(c=>String(c==null?'':c).trim())){blank++;continue;}
      if(v(0)){if(norm_(carryProject)!==norm_(v(0))){carryStt='';carryCategory='';}carryProject=v(0);}
      if(v(2)&&norm_(v(2))!==norm_(carryCategory)&&!v(1))carryStt='';
      if(v(1))carryStt=v(1);
      if(v(2))carryCategory=v(2);
      if(!v(3)){skipped++;continue;}
      if(!carryProject)throw new Error('Dòng Excel '+(n+1)+' chưa có Tên dự án để kế thừa.');
      let p=projects.find(x=>norm_(x.tenDuAn)===norm_(carryProject));
      if(!p){p={id:uuid_(),tenDuAn:carryProject,moTa:'',createdAt:now_(),updatedAt:now_(),createdBy:emp.name};
        append_('projects',p);projects.push(p);}
      // STT trống: dùng STT của hạng mục đã có trong dự án, hạng mục mới = STT lớn nhất + 1.
      if(!carryStt)carryStt=suggestStt_(tasks,p.id,carryCategory);
      const srcLine=String(n+1);
      // Khớp theo dự án + hạng mục + tên việc ở MỌI nguồn (file Excel hoặc Sheet) để không tạo trùng;
      // ưu tiên đúng nguồn và đúng dòng khi có nhiều việc cùng tên.
      const candidates=tasks.filter(x=>!consumed.has(x.id)&&
        norm_(x.tenDuAn)===norm_(carryProject)&&norm_(x.hangMuc)===norm_(carryCategory)&&
        norm_(x.tenCongViec)===norm_(v(3)));
      const sameSource=candidates.filter(x=>x.nguonImport===sourceKey);
      const old=sameSource.find(x=>x.nguonDong===srcLine)||sameSource[0]||candidates[0]||null;
      if(old)consumed.add(old.id);
      const t=old?strip_(old):{id:uuid_(),createdAt:now_(),createdBy:emp.name,uuTien:'Trung bình',
        yeuCau:'',phongBan:'',nguoiPhuTrach:'',nguoiPhuTrachId:'',deadline:'',
        trangThai:'Chưa bắt đầu',tienDo:'0',ngayBatDau:'',ngayKetThuc:'',linkSanPham:'',ghiChu:''};
      Object.assign(t,{duAnId:p.id,tenDuAn:p.tenDuAn,stt:carryStt,hangMuc:carryCategory,tenCongViec:v(3),
        nguonImport:sourceKey,nguonDong:srcLine,updatedAt:now_(),updatedBy:emp.name});
      // Ô trống hoặc cột không có trong file: giữ giá trị đang có.
      if(v(4))t.yeuCau=v(4);
      if(v(5))t.uuTien=normalizePriority_(v(5));
      if(v(6))t.phongBan=v(6);
      if(v(7)){t.nguoiPhuTrach=v(7);t.nguoiPhuTrachId=employeeByName_(v(7),emps);}
      if(v(8))t.deadline=parseDate_(v(8));
      if(!old){
        t.ngayBatDau=parseDate_(v(9));t.ngayKetThuc=parseDate_(v(10));
        t.trangThai=stats.includes(v(11))?v(11):'Đang thực hiện';
        t.tienDo=pct_(v(12));t.linkSanPham=v(13)?verifyUrl_(v(13)):'';t.ghiChu=v(14);
      }
      if(old){update_('tasks',old,t);updated++;}else {append_('tasks',t);tasks.push(t);created++;}
    }
    audit_(emp.name,'Import',opts.fileName?'Google Sheet':'Excel',sourceKey,{created,updated,skipped,blank,missing,totalRows:raw.length-1,fileName:opts.fileName||''});
    return {created,updated,skipped,blank,missing,total:raw.length-1,source:sourceKey};
  });
}

/**
 * SMEE BUILD 7.8.3 - Kiểm tra CÚ PHÁP TỪNG KHỐI JavaScript ngay trong Apps Script Editor.
 * Phần mã không được thực thi; chỉ biên dịch cú pháp bằng V8, không đọc thông tin nhân sự.
 * Độc lập với kiemTraHeThong() để chẩn đoán khi trình duyệt báo SyntaxError.
 */
function kiemTraCuPhapScripts() {
  // Chỉ chạy từ Editor bằng tài khoản đang sở hữu quyền triển khai.
  const actor = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const executor = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!actor || !executor || actor !== executor) throw new Error('Chỉ chủ sở hữu được chạy kiemTraCuPhapScripts trong Apps Script Editor.');
  const result = kiemTraCuPhapScripts_(true);
  Logger.log('[OK] SMEE BUILD 7.8.3: ' + result.blocks + ' khối JavaScript đã qua kiểm tra cú pháp V8.');
  return result;
}
function kiemTraCuPhapScripts_(verbose) {
  const raw = HtmlService.createTemplateFromFile('Scripts').getRawContent();
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match, blocks = 0, total = 0;
  while ((match = re.exec(raw)) !== null) {
    // External SheetJS CDN script không chứa JavaScript nội tuyến nên không cần biên dịch.
    if (/\bsrc\s*=/.test(match[1])) continue;
    const code = match[2];
    if (!code.trim()) continue;
    blocks++;
    total += code.length;
    // HtmlService tự cắt chú thích "//" trong script nội tuyến khi phục vụ /exec và có thể cắt nhầm
    // chuỗi chứa "//" (vd 'placeholder="https://..."'), gây SyntaxError chỉ trên trình duyệt.
    // Trong chuỗi JS phải viết "https:\/\/".
    const risky = code.split('\n').map(function (line, i) { return {line:line, n:i+1}; })
      .filter(function (x) { return /['"`][^'"`]*\/\/[^'"`]*['"`]/.test(x.line.replace(/^\s*\/\/.*$/, '')); });
    if (risky.length) {
      const label = 'Khối JavaScript ' + blocks + ' có chuỗi chứa "//" ở dòng ' + risky.map(function (x) { return x.n; }).join(', ') +
        '; HtmlService sẽ cắt nhầm. Đổi thành "\\/\\/".';
      Logger.log('[LOI] ' + label);
      throw new Error(label);
    }
    try {
      // Compile only, never execute. No database or password reads.
      new Function(code);
      if (verbose) Logger.log('[OK] Khối JavaScript ' + blocks + ': hợp lệ, ' + code.length + ' ký tự.');
    } catch (e) {
      const message = String(e && e.message || e || 'Lỗi cú pháp không rõ');
      const label = 'Khối JavaScript ' + blocks + ' sai cú pháp: ' + message;
      Logger.log('[LOI] ' + label);
      throw new Error(label);
    }
  }
  if (blocks < 1) throw new Error('Không tìm thấy khối JavaScript nội tuyến trong Scripts.html.');
  if (raw.indexOf('window.SMEE_CLIENT_READY = true') < 0) throw new Error('Scripts.html thiếu dòng khởi tạo hoàn tất.');
  if (verbose) Logger.log('SMEE Scripts: ' + blocks + ' khối, ' + total + ' ký tự JavaScript nội tuyến.');
  return {ok:true, blocks:blocks, characters:total};
}

/** Chạy 1 lần trong trình soạn thảo Apps Script để cấp quyền "kết nối dịch vụ bên ngoài" (gửi Telegram). Không đọc/ghi dữ liệu. */
/** Mở khoá nút "Làm trắng toàn bộ dữ liệu" — chỉ chủ sở hữu chạy trong trình soạn code Apps Script. */
function moKhoaLamTrang() {
  editorOwnerOnly_('moKhoaLamTrang');
  PropertiesService.getScriptProperties().deleteProperty('WIPE_LOCKED');
  Logger.log('Đã mở khoá chức năng Làm trắng toàn bộ dữ liệu.');
}
function capQuyenTelegram() {
  const code = UrlFetchApp.fetch('https://api.telegram.org', { muteHttpExceptions: true }).getResponseCode();
  Logger.log('Đã cấp quyền kết nối Telegram (mã phản hồi %s).', code);
}
