
/**
 * SMEE Project Manager · cấu hình kết nối
 * Google Sheets nguồn/dữ liệu vẫn thuộc quyền kiểm soát của chủ sở hữu.
 * KHÔNG chia sẻ bảng nhân sự chứa mật mã với người dùng phổ thông.
 */
const CFG = Object.freeze({
  DB_SPREADSHEET_ID: '1NArZmkDNCVws1dlI4DxpGF7Rk6_mASzoo0Ct7r0O7E8',
  SOURCE_IMPORT_SPREADSHEET_ID: '1NArZmkDNCVws1dlI4DxpGF7Rk6_mASzoo0Ct7r0O7E8',
  SOURCE_IMPORT_GID: 0,
  EMPLOYEE_SPREADSHEET_ID: '1Sb9vG-eOHxYFZEJ_j3L7H2CRwJVnQw7DttypyN3zsXk',
  EMPLOYEE_GID: 1202461375,
  TIME_ZONE: 'Asia/Ho_Chi_Minh',
  SESSION_SECONDS: 6 * 60 * 60,
  // BUILD 2.1: ĐĂNG NHẬP BẮT BUỘC.
  // Mã xác thực từ cột "Pass App Dự án" trong Google Sheet nhân sự.
  // Kiểm tra quyền máy chủ và trạng thái còn làm việc sau mỗi yêu cầu.
  // Không bật DEMO_MODE khi triển khai sử dụng thật.
  DEMO_MODE: false,
  // Giờ nghỉ trưa không tính là giờ làm (có thể ghi đè bằng APP_CAU_HINH key "lunchBreak", vd "12:00-13:30").
  // Thư mục Drive chứa file mẫu import Google Sheet (taoFileMauImport).
  IMPORT_TEMPLATE_FOLDER_ID: '1GhlN_2sOWYaMLrFxWM-ko0dKBk5p9dXh',
  LUNCH_START: '12:00',
  LUNCH_END: '13:30',

  TABLES: {
    projects: 'APP_DU_AN', tasks: 'APP_CONG_VIEC', time: 'APP_LICH_GIO',
    blockers: 'APP_VUONG_MAC', audit: 'APP_NHAT_KY', config: 'APP_CAU_HINH',
    holidays: 'APP_NGAY_NGHI', subtasks: 'APP_VIEC_CON', products: 'APP_SAN_PHAM', dailyReports: 'APP_BAO_CAO_NGAY', proposals: 'APP_DE_XUAT',
    // BUILD 6.0: giờ làm theo NGÀY (mỗi người × ngày × công việc một dòng, chỉ số giờ — không còn giờ bắt đầu / kết thúc).
    days: 'APP_GIO_LAM_NGAY',
    // BUILD 6.6: báo cáo công việc ngoài dự án của Account / Sale.
    kdAcc: 'APP_BC_ACCOUNT', kdSale: 'APP_BC_SALE',
    // BUILD 6.8: Ban Giám đốc / Trợ lý GĐ (chuyển từ app Trợ lý Giám đốc).
    bgdRep: 'APP_BC_GIAM_DOC', bgdMeet: 'APP_CUOC_HOP', bgdTask: 'APP_NHIEM_VU_HOP', bgdHist: 'APP_LS_NHIEM_VU_HOP'
  },
  DEFAULT_STATUSES: ['Chưa bắt đầu', 'Đang thực hiện', 'Hoàn thành', 'Tạm hoãn', 'Hủy'],
  DEFAULT_PRODUCT_TYPES: ['Ảnh', 'Video', 'GIF'],
  PRODUCT_OTHER: 'Công việc khác',
  PRODUCT_STATUSES: ['Hoàn thành', 'Đang thực hiện', 'Tạm dừng'],
  PRIORITIES: ['Rất gấp', 'Gấp', 'Cao', 'Trung bình', 'Thấp'],
  BLOCKER_CATEGORIES: ['Chờ khách hàng', 'Chờ duyệt / phản hồi', 'Chờ tài liệu / đầu vào',
    'Phụ thuộc công việc khác', 'Chờ nhân sự / phối hợp', 'Phát sinh công việc khác',
    'Vấn đề kỹ thuật', 'Thay đổi yêu cầu', 'Khác'],
  FIELDS: {
    projects: ['id','tenDuAn','moTa','createdAt','updatedAt','createdBy'],
    tasks: ['id','duAnId','tenDuAn','stt','hangMuc','tenCongViec','yeuCau','uuTien','phongBan',
      'nguoiPhuTrach','nguoiPhuTrachId','deadline','ngayBatDau','ngayKetThuc','trangThai','tienDo',
      'linkSanPham','ghiChu','nguonImport','nguonDong','createdAt','updatedAt','createdBy','updatedBy',
      'trangThaiDuyet','lanGuiDuyet','guiDuyetLuc','guiDuyetBoi','nguoiDuyetId','nguoiDuyet','duyetLuc','nhanXetDuyet',
      // BUILD 6.0: người làm cùng (mã nhân viên, cách nhau dấu phẩy) và thời điểm chuyển sang "Hoàn thành".
      'thoiGianHoanThanh',
      // BUILD 6.5: việc bổ sung (ngoài kế hoạch / hợp đồng). Trống = "Kế hoạch".
      'loaiViec','ngayGiao',
      'chuKy','chiTieu','donViChiTieu','loaiChiTieu','hanTrongKy'],
    time: ['id','taskId','employeeKey','loai','batDau','ketThuc','soGio','ghiChu','duyet',
      'createdAt','updatedAt','createdBy','updatedBy',
      // BUILD 5.0: phiên giờ có thể gắn với một việc con.
      'viecConId'],
    blockers: ['id','taskId','nhomNguyenNhan','nguyenNhan','dangCho','phuThuocTaskId','nguoiCanXuLy',
      'batDauCho','soLuongDuKien','donViDuKien','duKienTiepTuc','ketThucCho','trangThai',
      'ghiChu','createdAt','updatedAt','createdBy','updatedBy','congViecThayTheId','moTaViecKhac','employeeKey',
      'viecConId'],
    audit: ['id','thoiGian','actor','hanhDong','loai','doiTuongId','noiDung'],
    config: ['key','value'],
    // BUILD 4.9: ngày nghỉ (lễ tết, du lịch công ty…) và ngày làm bù.
    holidays: ['id','ngay','tenNgayNghi','loai','ghiChu','nguoiTao','thoiGianTao'],
    // BUILD 5.0: việc con do nhân sự tự chia nhỏ từ đầu việc trong hợp đồng.
    // BUILD 5.2.1: việc con rút gọn — đọc / ghi theo TÊN cột.
    subtasks: ['id','congViecId','stt','tenViecCon','moTa','ghiChu','nguoiTao','thoiGianTao','nguoiCapNhat','thoiGianCapNhat'],
    // BUILD 5.3: sản phẩm hằng ngày — đọc / ghi theo TÊN cột.
    // BUILD 5.7: ghi chú báo cáo công việc hằng ngày.
    // BUILD 5.11: đề xuất sửa kế hoạch.
    proposals: ['id','congViecId','nguoiDeXuat','nguoiDeXuatId','batDauCu','hanCu','batDauMoi','hanMoi','lyDo','trangThai','nguoiDuyet','ghiChuDuyet','thoiGianTao','thoiGianDuyet',
      // BUILD 6.0: loại đề xuất (SUA_KE_HOACH, DU_AN_MOI, HANG_MUC_MOI, CONG_VIEC_MOI, NGUOI_LAM_CUNG) + nội dung (JSON).
      'loai','payload'],
    days: ['id','ngay','employeeKey','congViecId','soGio','noiDung','ghiChu','createdAt','updatedAt','createdBy','updatedBy','duAnId','tenViecTrucTiep','tienDoNgay','trangThaiNgay'],
    kdAcc: ['id','ngay','employeeKey','duAnId','khachHang','noiDung','ketQua','tienDo','ghiChu','createdAt','updatedAt','nhanXet','nguoiNhanXet'],
    kdSale: ['id','ngay','employeeKey','noiDung','ghiChu','createdAt','updatedAt','nhanXet','nguoiNhanXet'],
    bgdRep: ['id','ngay','nguoiBaoCao','nguoiBaoCaoKey','phongBan','noiDung','telegram','danhGia','ghiChuGD','nguoiDanhGia','thoiGianDanhGia','createdAt'],
    bgdMeet: ['id','ngay','tieuDe','loai','chuTri','thanhPhan','ketLuan','nguoiLap','trangThai','linkBienBan','createdAt','updatedAt','xoaLuc','nguoiXoa'],
    bgdTask: ['id','cuocHopId','noiDung','duAn','phongBan','nguoiPhuTrach','nguoiPhoiHop','ngayGiao','han','uuTien','trangThai','tienDo','link','ghiChu','nguoiGiao','nguoiCapNhat','updatedAt','hoanThanhLuc','xoaLuc','nguoiXoa'],
    bgdHist: ['id','nhiemVuId','cuocHopId','thoiGian','nguoiCapNhat','trangThaiTruoc','trangThaiSau','tienDoTruoc','tienDoSau','noiDung','link'],
    dailyReports: ['id','ngay','employeeKey','ghiChu','createdAt','updatedAt','noiDungBaoCao'],
    products: ['id','ngay','employeeKey','nguoiThucHien','duAnId','congViecId','tenSanPham','loaiSanPham','soLuong','links','tinhTrang','ghiChu','maLuongSP','createdAt','updatedAt','createdBy','updatedBy','moTaCongViec',
      // BUILD 6.2: tiến độ % (0–100) nhân viên tự điền thay cho "Tình trạng"; cột tinhTrang vẫn ghi để tương thích (100% = Hoàn thành).
      'tienDo','tienDoBaoCao','sttBaoCao','ngayGhi','donViTinh']
  }
});
