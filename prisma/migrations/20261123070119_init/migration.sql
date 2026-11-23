-- CreateTable
CREATE TABLE "public"."Staff" (
    "id" TEXT NOT NULL,
    "maNV" TEXT NOT NULL DEFAULT '',
    "hoTen" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "chucVu" TEXT NOT NULL DEFAULT '',
    "phongBan" TEXT NOT NULL DEFAULT '',
    "tinhTrang" TEXT NOT NULL DEFAULT '',
    "codeHash" TEXT NOT NULL DEFAULT '',
    "pos" INTEGER NOT NULL DEFAULT 0,
    "nguon" TEXT NOT NULL DEFAULT 'sheet',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppProperty" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppProperty_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."app_du_an" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "tenDuAn" TEXT NOT NULL DEFAULT '',
    "moTa" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_du_an_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_cong_viec" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "duAnId" TEXT NOT NULL DEFAULT '',
    "tenDuAn" TEXT NOT NULL DEFAULT '',
    "stt" TEXT NOT NULL DEFAULT '',
    "hangMuc" TEXT NOT NULL DEFAULT '',
    "tenCongViec" TEXT NOT NULL DEFAULT '',
    "yeuCau" TEXT NOT NULL DEFAULT '',
    "uuTien" TEXT NOT NULL DEFAULT '',
    "phongBan" TEXT NOT NULL DEFAULT '',
    "nguoiPhuTrach" TEXT NOT NULL DEFAULT '',
    "nguoiPhuTrachId" TEXT NOT NULL DEFAULT '',
    "deadline" TEXT NOT NULL DEFAULT '',
    "ngayBatDau" TEXT NOT NULL DEFAULT '',
    "ngayKetThuc" TEXT NOT NULL DEFAULT '',
    "trangThai" TEXT NOT NULL DEFAULT '',
    "tienDo" TEXT NOT NULL DEFAULT '',
    "linkSanPham" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "nguonImport" TEXT NOT NULL DEFAULT '',
    "nguonDong" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "trangThaiDuyet" TEXT NOT NULL DEFAULT '',
    "lanGuiDuyet" TEXT NOT NULL DEFAULT '',
    "guiDuyetLuc" TEXT NOT NULL DEFAULT '',
    "guiDuyetBoi" TEXT NOT NULL DEFAULT '',
    "nguoiDuyetId" TEXT NOT NULL DEFAULT '',
    "nguoiDuyet" TEXT NOT NULL DEFAULT '',
    "duyetLuc" TEXT NOT NULL DEFAULT '',
    "nhanXetDuyet" TEXT NOT NULL DEFAULT '',
    "thoiGianHoanThanh" TEXT NOT NULL DEFAULT '',
    "loaiViec" TEXT NOT NULL DEFAULT '',
    "ngayGiao" TEXT NOT NULL DEFAULT '',
    "chuKy" TEXT NOT NULL DEFAULT '',
    "chiTieu" TEXT NOT NULL DEFAULT '',
    "donViChiTieu" TEXT NOT NULL DEFAULT '',
    "loaiChiTieu" TEXT NOT NULL DEFAULT '',
    "hanTrongKy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_cong_viec_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_lich_gio" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "taskId" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "loai" TEXT NOT NULL DEFAULT '',
    "batDau" TEXT NOT NULL DEFAULT '',
    "ketThuc" TEXT NOT NULL DEFAULT '',
    "soGio" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "duyet" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "viecConId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_lich_gio_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_vuong_mac" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "taskId" TEXT NOT NULL DEFAULT '',
    "nhomNguyenNhan" TEXT NOT NULL DEFAULT '',
    "nguyenNhan" TEXT NOT NULL DEFAULT '',
    "dangCho" TEXT NOT NULL DEFAULT '',
    "phuThuocTaskId" TEXT NOT NULL DEFAULT '',
    "nguoiCanXuLy" TEXT NOT NULL DEFAULT '',
    "batDauCho" TEXT NOT NULL DEFAULT '',
    "soLuongDuKien" TEXT NOT NULL DEFAULT '',
    "donViDuKien" TEXT NOT NULL DEFAULT '',
    "duKienTiepTuc" TEXT NOT NULL DEFAULT '',
    "ketThucCho" TEXT NOT NULL DEFAULT '',
    "trangThai" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "congViecThayTheId" TEXT NOT NULL DEFAULT '',
    "moTaViecKhac" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "viecConId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_vuong_mac_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_nhat_ky" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "thoiGian" TEXT NOT NULL DEFAULT '',
    "actor" TEXT NOT NULL DEFAULT '',
    "hanhDong" TEXT NOT NULL DEFAULT '',
    "loai" TEXT NOT NULL DEFAULT '',
    "doiTuongId" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_nhat_ky_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_cau_hinh" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "key" TEXT NOT NULL DEFAULT '',
    "value" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_cau_hinh_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_ngay_nghi" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "tenNgayNghi" TEXT NOT NULL DEFAULT '',
    "loai" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "nguoiTao" TEXT NOT NULL DEFAULT '',
    "thoiGianTao" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_ngay_nghi_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_viec_con" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "congViecId" TEXT NOT NULL DEFAULT '',
    "stt" TEXT NOT NULL DEFAULT '',
    "tenViecCon" TEXT NOT NULL DEFAULT '',
    "moTa" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "nguoiTao" TEXT NOT NULL DEFAULT '',
    "thoiGianTao" TEXT NOT NULL DEFAULT '',
    "nguoiCapNhat" TEXT NOT NULL DEFAULT '',
    "thoiGianCapNhat" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_viec_con_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_san_pham" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "nguoiThucHien" TEXT NOT NULL DEFAULT '',
    "duAnId" TEXT NOT NULL DEFAULT '',
    "congViecId" TEXT NOT NULL DEFAULT '',
    "tenSanPham" TEXT NOT NULL DEFAULT '',
    "loaiSanPham" TEXT NOT NULL DEFAULT '',
    "soLuong" TEXT NOT NULL DEFAULT '',
    "links" TEXT NOT NULL DEFAULT '',
    "tinhTrang" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "maLuongSP" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "moTaCongViec" TEXT NOT NULL DEFAULT '',
    "tienDo" TEXT NOT NULL DEFAULT '',
    "tienDoBaoCao" TEXT NOT NULL DEFAULT '',
    "sttBaoCao" TEXT NOT NULL DEFAULT '',
    "ngayGhi" TEXT NOT NULL DEFAULT '',
    "donViTinh" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_san_pham_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_bao_cao_ngay" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "noiDungBaoCao" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_bao_cao_ngay_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_de_xuat" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "congViecId" TEXT NOT NULL DEFAULT '',
    "nguoiDeXuat" TEXT NOT NULL DEFAULT '',
    "nguoiDeXuatId" TEXT NOT NULL DEFAULT '',
    "batDauCu" TEXT NOT NULL DEFAULT '',
    "hanCu" TEXT NOT NULL DEFAULT '',
    "batDauMoi" TEXT NOT NULL DEFAULT '',
    "hanMoi" TEXT NOT NULL DEFAULT '',
    "lyDo" TEXT NOT NULL DEFAULT '',
    "trangThai" TEXT NOT NULL DEFAULT '',
    "nguoiDuyet" TEXT NOT NULL DEFAULT '',
    "ghiChuDuyet" TEXT NOT NULL DEFAULT '',
    "thoiGianTao" TEXT NOT NULL DEFAULT '',
    "thoiGianDuyet" TEXT NOT NULL DEFAULT '',
    "loai" TEXT NOT NULL DEFAULT '',
    "payload" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_de_xuat_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_gio_lam_ngay" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "congViecId" TEXT NOT NULL DEFAULT '',
    "soGio" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "updatedBy" TEXT NOT NULL DEFAULT '',
    "duAnId" TEXT NOT NULL DEFAULT '',
    "tenViecTrucTiep" TEXT NOT NULL DEFAULT '',
    "tienDoNgay" TEXT NOT NULL DEFAULT '',
    "trangThaiNgay" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_gio_lam_ngay_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_bc_account" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "duAnId" TEXT NOT NULL DEFAULT '',
    "khachHang" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',
    "ketQua" TEXT NOT NULL DEFAULT '',
    "tienDo" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "nhanXet" TEXT NOT NULL DEFAULT '',
    "nguoiNhanXet" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_bc_account_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_bc_sale" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "employeeKey" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "nhanXet" TEXT NOT NULL DEFAULT '',
    "nguoiNhanXet" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_bc_sale_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_bc_giam_doc" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "nguoiBaoCao" TEXT NOT NULL DEFAULT '',
    "nguoiBaoCaoKey" TEXT NOT NULL DEFAULT '',
    "phongBan" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',
    "telegram" TEXT NOT NULL DEFAULT '',
    "danhGia" TEXT NOT NULL DEFAULT '',
    "ghiChuGD" TEXT NOT NULL DEFAULT '',
    "nguoiDanhGia" TEXT NOT NULL DEFAULT '',
    "thoiGianDanhGia" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_bc_giam_doc_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_cuoc_hop" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "ngay" TEXT NOT NULL DEFAULT '',
    "tieuDe" TEXT NOT NULL DEFAULT '',
    "loai" TEXT NOT NULL DEFAULT '',
    "chuTri" TEXT NOT NULL DEFAULT '',
    "thanhPhan" TEXT NOT NULL DEFAULT '',
    "ketLuan" TEXT NOT NULL DEFAULT '',
    "nguoiLap" TEXT NOT NULL DEFAULT '',
    "trangThai" TEXT NOT NULL DEFAULT '',
    "linkBienBan" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "xoaLuc" TEXT NOT NULL DEFAULT '',
    "nguoiXoa" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_cuoc_hop_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_nhiem_vu_hop" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "cuocHopId" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',
    "duAn" TEXT NOT NULL DEFAULT '',
    "phongBan" TEXT NOT NULL DEFAULT '',
    "nguoiPhuTrach" TEXT NOT NULL DEFAULT '',
    "nguoiPhoiHop" TEXT NOT NULL DEFAULT '',
    "ngayGiao" TEXT NOT NULL DEFAULT '',
    "han" TEXT NOT NULL DEFAULT '',
    "uuTien" TEXT NOT NULL DEFAULT '',
    "trangThai" TEXT NOT NULL DEFAULT '',
    "tienDo" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "ghiChu" TEXT NOT NULL DEFAULT '',
    "nguoiGiao" TEXT NOT NULL DEFAULT '',
    "nguoiCapNhat" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT '',
    "hoanThanhLuc" TEXT NOT NULL DEFAULT '',
    "xoaLuc" TEXT NOT NULL DEFAULT '',
    "nguoiXoa" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_nhiem_vu_hop_pkey" PRIMARY KEY ("rid")
);

-- CreateTable
CREATE TABLE "public"."app_ls_nhiem_vu_hop" (
    "rid" SERIAL NOT NULL,
    "pos" INTEGER NOT NULL DEFAULT 0,
    "id" TEXT NOT NULL DEFAULT '',
    "nhiemVuId" TEXT NOT NULL DEFAULT '',
    "cuocHopId" TEXT NOT NULL DEFAULT '',
    "thoiGian" TEXT NOT NULL DEFAULT '',
    "nguoiCapNhat" TEXT NOT NULL DEFAULT '',
    "trangThaiTruoc" TEXT NOT NULL DEFAULT '',
    "trangThaiSau" TEXT NOT NULL DEFAULT '',
    "tienDoTruoc" TEXT NOT NULL DEFAULT '',
    "tienDoSau" TEXT NOT NULL DEFAULT '',
    "noiDung" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "app_ls_nhiem_vu_hop_pkey" PRIMARY KEY ("rid")
);

-- CreateIndex
CREATE INDEX "Staff_codeHash_idx" ON "public"."Staff"("codeHash");

-- CreateIndex
CREATE INDEX "app_du_an_pos_idx" ON "public"."app_du_an"("pos");

-- CreateIndex
CREATE INDEX "app_cong_viec_pos_idx" ON "public"."app_cong_viec"("pos");

-- CreateIndex
CREATE INDEX "app_lich_gio_pos_idx" ON "public"."app_lich_gio"("pos");

-- CreateIndex
CREATE INDEX "app_vuong_mac_pos_idx" ON "public"."app_vuong_mac"("pos");

-- CreateIndex
CREATE INDEX "app_nhat_ky_pos_idx" ON "public"."app_nhat_ky"("pos");

-- CreateIndex
CREATE INDEX "app_cau_hinh_pos_idx" ON "public"."app_cau_hinh"("pos");

-- CreateIndex
CREATE INDEX "app_ngay_nghi_pos_idx" ON "public"."app_ngay_nghi"("pos");

-- CreateIndex
CREATE INDEX "app_viec_con_pos_idx" ON "public"."app_viec_con"("pos");

-- CreateIndex
CREATE INDEX "app_san_pham_pos_idx" ON "public"."app_san_pham"("pos");

-- CreateIndex
CREATE INDEX "app_bao_cao_ngay_pos_idx" ON "public"."app_bao_cao_ngay"("pos");

-- CreateIndex
CREATE INDEX "app_de_xuat_pos_idx" ON "public"."app_de_xuat"("pos");

-- CreateIndex
CREATE INDEX "app_gio_lam_ngay_pos_idx" ON "public"."app_gio_lam_ngay"("pos");

-- CreateIndex
CREATE INDEX "app_bc_account_pos_idx" ON "public"."app_bc_account"("pos");

-- CreateIndex
CREATE INDEX "app_bc_sale_pos_idx" ON "public"."app_bc_sale"("pos");

-- CreateIndex
CREATE INDEX "app_bc_giam_doc_pos_idx" ON "public"."app_bc_giam_doc"("pos");

-- CreateIndex
CREATE INDEX "app_cuoc_hop_pos_idx" ON "public"."app_cuoc_hop"("pos");

-- CreateIndex
CREATE INDEX "app_nhiem_vu_hop_pos_idx" ON "public"."app_nhiem_vu_hop"("pos");

-- CreateIndex
CREATE INDEX "app_ls_nhiem_vu_hop_pos_idx" ON "public"."app_ls_nhiem_vu_hop"("pos");
