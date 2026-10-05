/**
 * ==============================================================================
 * SETUP.GS - INISIALISASI & SEED DATABASE GOOGLE SHEETS
 * SISTEM PORTAL BERITA & DOKUMENTASI DESA SE-PROVINSI RIAU
 * ==============================================================================
 * Fitur Database:
 * 1. Tbl_Admin: Database akun admin (Username & Password terverifikasi dari Sheet)
 * 2. Tbl_Berita: Database berita desa (dengan status 'Pending', 'Published', 'Rejected')
 * 3. Tbl_Dokumentasi: Database dokumentasi desa (dengan status 'Pending' & 'Published')
 * 4. Tbl_Kategori: Daftar kategori berita desa
 * 5. Integrasi Google Drive Folder khusus upload media
 * ==============================================================================
 */

// SPREADSHEET ID DARI LINK SHEET PENGGUNA (kosongkan jika script terikat langsung ke Sheet)
const TARGET_SPREADSHEET_ID = "";

/**
 * Jalankan fungsi ini satu kali di Script Editor Google Apps Script untuk inisialisasi awal.
 */
function initialSetupDatabase() {
  let ss;
  try {
    if (TARGET_SPREADSHEET_ID && TARGET_SPREADSHEET_ID.trim() !== "") {
      ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
  } catch (e) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  const ui = SpreadsheetApp.getUi ? SpreadsheetApp.getUi() : null;
  
  try {
    // 1. Setup Tab Admin (HANYA ADMIN DI TAB INI YANG BISA LOGIN)
    setupTblAdmin(ss);

    // 2. Setup Tab Kategori
    setupTblKategori(ss);

    // 3. Setup Tab Berita (Dengan status moderasi: Published / Pending)
    setupTblBerita(ss);

    // 4. Setup Tab Dokumentasi
    setupTblDokumentasi(ss);

    // 5. Setup Folder Google Drive untuk media
    const folderInfo = setupDriveFolder();

    const successMessage = 
      "✅ Inisialisasi Database Berhasil Diselaraskan!\n\n" +
      "Database Sheet ID: " + ss.getId() + "\n\n" +
      "Tab Database:\n" +
      "1. Tbl_Admin (Daftar akun admin portal desa)\n" +
      "   - Akun 1: admin_riau | Pass: RiauMaju2026! (Super Admin)\n" +
      "   - Akun 2: admin_desa | Pass: DesaRiau2026! (Admin Verifikator)\n" +
      "2. Tbl_Berita (Kolom status: Published / Pending / Rejected)\n" +
      "3. Tbl_Dokumentasi (Kolom status: Published / Pending)\n" +
      "4. Tbl_Kategori (Kategori warta desa)\n\n" +
      "Folder Media Drive: " + folderInfo.name + "\n" +
      "Folder ID: " + folderInfo.id + "\n\n" +
      "Salin Folder ID di atas ke Code.gs jika diperlukan!";
      
    Logger.log(successMessage);
    if (ui) {
      ui.alert("Inisialisasi Berhasil", successMessage, ui.ButtonSet.OK);
    }
    
    return { success: true, folderId: folderInfo.id, spreadsheetId: ss.getId() };
  } catch (error) {
    Logger.log("Terjadi kesalahan setup: " + error.toString());
    if (ui) {
      ui.alert("Kesalahan Setup", error.toString(), ui.ButtonSet.OK);
    }
    return { success: false, error: error.toString() };
  }
}

/**
 * Inisialisasi Tab Tbl_Admin
 * Kolom: id, username, password, nama_lengkap, role, email, status, created_at
 */
function setupTblAdmin(ss) {
  let sheet = ss.getSheetByName("Tbl_Admin");
  if (!sheet) {
    sheet = ss.insertSheet("Tbl_Admin");
  } else {
    sheet.clear();
  }

  const headers = [
    "id", 
    "username", 
    "password", 
    "nama_lengkap", 
    "role", 
    "email", 
    "status", 
    "created_at"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length);

  // Akun Admin Default Awal
  const adminData = [
    [
      "ADM-001",
      "admin_riau",
      "RiauMaju2026!",
      "Administrator Utama Provinsi Riau",
      "Super Admin",
      "admin@portaldesariau.id",
      "Active",
      "2026-10-01"
    ],
    [
      "ADM-002",
      "admin_desa",
      "DesaRiau2026!",
      "Tim Verifikator Setoran Desa",
      "Verifikator",
      "verifikator@portaldesariau.id",
      "Active",
      "2026-10-01"
    ]
  ];

  adminData.forEach(row => sheet.appendRow(row));
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Inisialisasi Tab Tbl_Kategori
 */
function setupTblKategori(ss) {
  let sheet = ss.getSheetByName("Tbl_Kategori");
  if (!sheet) {
    sheet = ss.insertSheet("Tbl_Kategori");
  } else {
    sheet.clear();
  }

  const headers = ["id", "nama_kategori", "slug", "deskripsi", "icon"];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length);

  const kategoriData = [
    ["KAT-001", "Pemberdayaan Ekonomi", "pemberdayaan-ekonomi", "UMKM desa, BUMDes, inovasi pasar tani dan kerajinan lokal", "fas fa-coins"],
    ["KAT-002", "Pariwisata & Budaya", "pariwisata-budaya", "Ekowisata, situs sejarah Melayu, tradisi dan festival desa", "fas fa-landmark"],
    ["KAT-003", "Infrastruktur & Digital", "infrastruktur-digital", "Pembangunan fisik desa, internet desa, dan smart village", "fas fa-network-wired"],
    ["KAT-004", "Pertanian & Perkebunan", "pertanian-perkebunan", "Komoditas sawit rakyat, kelapa, karet, pangan mandiri", "fas fa-seedling"],
    ["KAT-005", "Sosial & Tradisi", "sosial-tradisi", "Gotong royong, adat istiadat, keagamaan dan kepemudaan", "fas fa-users"],
    ["KAT-006", "Kesehatan & Lingkungan", "kesehatan-lingkungan", "Posyandu, restorasi gambut, pencegahan karhutla desa", "fas fa-heartbeat"]
  ];

  kategoriData.forEach(row => sheet.appendRow(row));
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Inisialisasi Tab Tbl_Berita
 * Kolom: id, judul, slug, kategori, desa, kabupaten_kota, konten, thumbnail_url, tanggal, status, disetor_oleh
 */
function setupTblBerita(ss) {
  let sheet = ss.getSheetByName("Tbl_Berita");
  if (!sheet) {
    sheet = ss.insertSheet("Tbl_Berita");
  } else {
    sheet.clear();
  }

  const headers = [
    "id", 
    "judul", 
    "slug", 
    "kategori", 
    "desa", 
    "kabupaten_kota", 
    "konten", 
    "thumbnail_url", 
    "tanggal", 
    "status",
    "disetor_oleh"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length);

  // Seed Data Berita Desa Se-Riau
  const beritaData = [
    [
      "BRT-2026-001",
      "Transformasi Digital Desa Muara Takus: BUMDes Pasarkan Keripik Nanas Hingga Mancanegara",
      "transformasi-digital-desa-muara-takus-bumdes",
      "Pemberdayaan Ekonomi",
      "Desa Muara Takus",
      "Kampar",
      "Desa Muara Takus di Kecamatan XIII Koto Kampar mencatatkan sejarah baru. Melalui digitalisasi koperasi BUMDes Mandiri dan integrasi lokapasar nasional, produk olahan nanas khas Muara Takus kini menembus pasar ritel modern dan ekspor regional. Kepala Desa menyampaikan bahwa pendapatan pemuda desa meningkat 45% berkat pelatihan pemasaran digital berbasis website desa.",
      "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80",
      "2026-10-01",
      "Published",
      "Admin Utama"
    ],
    [
      "BRT-2026-002",
      "Ekowisata Hutan Mangrove Desa Siak Kecil Raih Penghargaan Desa Berkelanjutan Nasional",
      "ekowisata-hutan-mangrove-desa-siak-kecil",
      "Pariwisata & Budaya",
      "Desa Tanjung Belit",
      "Bengkalis",
      "Masyarakat Desa Tanjung Belit, Kecamatan Siak Kecil, berhasil membuktikan komitmen menjaga pesisir Riau. Konservasi mangrove seluas 120 hektare yang dikelola secara swadaya kini menjadi destinasi edukasi internasional. Penghargaan diserahkan langsung atas keberhasilan memadukan perlindungan ekosistem gambut pesisir dengan ekowisata berbasis komunitas.",
      "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80",
      "2026-10-02",
      "Published",
      "Admin Utama"
    ],
    [
      "BRT-2026-003",
      "Semarak Festival Gelombang Bono di Teluk Meranti: Pesta Adat dan Selancar Sungai Kelas Dunia",
      "semarak-festival-gelombang-bono-teluk-meranti",
      "Pariwisata & Budaya",
      "Desa Teluk Meranti",
      "Pelalawan",
      "Fenomena ombak pasang sungai terkenal dunia 'Gelombang Bono' di Sungai Kampar kembali menyedot ribuan peselancar lokal dan mancanegara. Pemerintah Desa Teluk Meranti menggelar parade perahu hias Melayu dan pasar kuliner sagu yang melibatkan 60 pelaku UMKM lokal, memperkuat perekonomian berbasis kebudayaan sungai.",
      "https://images.unsplash.com/photo-1502680390469-be75c86b636f?auto=format&fit=crop&w=1200&q=80",
      "2026-10-03",
      "Published",
      "Admin Utama"
    ],
    [
      "BRT-2026-004",
      "Inovasi Hilirisasi Kelapa Rakyat Desa Sungai Guntung Tembus Industri Farmasi & Kosmetik",
      "inovasi-hilirisasi-kelapa-rakyat-sungai-guntung",
      "Pertanian & Perkebunan",
      "Desa Sungai Guntung",
      "Indragiri Hilir",
      "Indragiri Hilir yang tersohor sebagai 'Negeri Hamparan Kelapa Dunia' menunjukkan terobosan di Desa Sungai Guntung. Petani kelapa tidak lagi sekadar menjual kopra mentah, melainkan memproduksi Virgin Coconut Oil (VCO) kualitas farmasi dan serat sabut ramah lingkungan yang diekspor ke Eropa.",
      "https://images.unsplash.com/photo-1621451537084-482c73073a0f?auto=format&fit=crop&w=1200&q=80",
      "2026-10-04",
      "Published",
      "Admin Utama"
    ],
    [
      "BRT-2026-005",
      "Pembangunan Jembatan Gantung Desa Rambah Utama Hubungkan Sentra Pangan Kering Rokan Hulu",
      "pembangunan-jembatan-gantung-desa-rambah-utama",
      "Infrastruktur & Digital",
      "Desa Rambah Utama",
      "Rokan Hulu",
      "Akses perekonomian masyarakat Desa Rambah Utama kini semakin terbuka lebar setelah selesainya pembangunan jembatan gantung antar-dusun. Sebelumnya, warga harus memutar sejauh 18 kilometer melintasi jalur perkebunan bergelombang untuk menjual hasil bumi ke pasar induk Pasir Pengaraian.",
      "https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=1200&q=80",
      "2026-10-04",
      "Published",
      "Admin Utama"
    ],
    [
      "BRT-2026-006",
      "Melestarikan Tradisi Pacu Jalur: Semangat Gotong Royong Warga Kenegerian Kari Kuansing",
      "melestarikan-tradisi-pacu-jalur-kenegerian-kari",
      "Sosial & Tradisi",
      "Desa Pintu Gobang Kari",
      "Kuantan Singingi",
      "Ratusan warga Desa Pintu Gobang Kari tumpah ruah menggelar prosesi 'Maelo Jalur' dari dalam rimba larangan. Tradisi gotong royong menarik kayu perahu pacu berukuran 30 meter ini mencerminkan kekompakan dan keluhuran falsafah hidup masyarakat Melayu Kuantan Singingi yang tetap abadi di era modern.",
      "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80",
      "2026-10-05",
      "Published",
      "Admin Utama"
    ],
    // Contoh 1 Berita Setoran Desa yang statusnya Pending (Menunggu Verifikasi Admin)
    [
      "BRT-2026-007",
      "Usulan Pembukaan Jalur Sepeda Ekowisata Tepian Rawa Gambut Desa Dayun",
      "usulan-pembukaan-jalur-sepeda-ekowisata-desa-dayun",
      "Pariwisata & Budaya",
      "Desa Dayun",
      "Siak",
      "Aparatur Desa Dayun mengajukan rute wisata edukasi sepeda melintasi kawasan hijau konservasi gambut dan embung air desa yang dibangun tanpa merusak keanekaragaman flora lokal.",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
      "2026-10-05",
      "Pending",
      "Perangkat Desa Dayun"
    ]
  ];

  beritaData.forEach(row => sheet.appendRow(row));
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Inisialisasi Tab Tbl_Dokumentasi
 * Kolom: id, judul_kegiatan, lokasi_desa, foto_url, deskripsi, tanggal, status, disetor_oleh
 */
function setupTblDokumentasi(ss) {
  let sheet = ss.getSheetByName("Tbl_Dokumentasi");
  if (!sheet) {
    sheet = ss.insertSheet("Tbl_Dokumentasi");
  } else {
    sheet.clear();
  }

  const headers = [
    "id", 
    "judul_kegiatan", 
    "lokasi_desa", 
    "foto_url", 
    "deskripsi", 
    "tanggal",
    "status",
    "disetor_oleh"
  ];
  sheet.appendRow(headers);
  formatHeaderRow(sheet, headers.length);

  // Seed Data Dokumentasi Kegiatan Desa
  const dokumentasiData = [
    [
      "DOC-2026-001",
      "Pelatihan Tata Kelola Keuangan BUMDes Berbasis Cloud",
      "Desa Dayun, Siak",
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1000&q=80",
      "Kegiatan workshop akuntansi desa digital yang diikuti oleh seluruh pengurus BUMDes se-Kecamatan Dayun guna meningkatkan transparansi kas desa.",
      "2026-10-01",
      "Published",
      "Admin Utama"
    ],
    [
      "DOC-2026-002",
      "Gotong Royong Perapihan Taman Tepian Sungai Siak",
      "Desa Mempura, Siak",
      "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=1000&q=80",
      "Aksi bersih desa dan penanaman pohon ketapang kencana di sepanjang bibir Sungai Siak dalam rangka menyambut Bulan Bhakti Gotong Royong.",
      "2026-10-02",
      "Published",
      "Admin Utama"
    ],
    [
      "DOC-2026-003",
      "Pemeriksaan Kesehatan Gratis & Cegah Stunting Balita",
      "Desa Kuok, Kampar",
      "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1000&q=80",
      "Penyuluhan gizi seimbang serta pembagian paket nutrisi kacang hijau dan susu untuk 120 balita dan ibu hamil di Posyandu Melati Indah.",
      "2026-10-03",
      "Published",
      "Admin Utama"
    ],
    [
      "DOC-2026-004",
      "Gelar Budaya Zapin Desa Pesisir Bengkalis",
      "Desa Meskom, Bengkalis",
      "https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=1000&q=80",
      "Pementasan tarian Zapin tradisi Melayu oleh sanggar tari muda-mudi desa untuk menjaga warisan leluhur pesisir Selat Melaka.",
      "2026-10-03",
      "Published",
      "Admin Utama"
    ],
    [
      "DOC-2026-005",
      "Panen Raya Padi Organik Pasang Surut",
      "Desa Kuala Enok, Indragiri Hilir",
      "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1000&q=80",
      "Syukuran panen raya padi organik di lahan pasang surut seluas 85 hektare dengan hasil panen mencapai 6,2 ton per hektare.",
      "2026-10-04",
      "Published",
      "Admin Utama"
    ],
    [
      "DOC-2026-006",
      "Simulasi Tanggap Bencana Karhutla & Patroli Drone Desa",
      "Desa Rimbo Panjang, Kampar",
      "https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1000&q=80",
      "Pelatihan Masyarakat Peduli Api (MPA) desa dalam mengoperasikan sensor drone pemantau suhu gambut untuk deteksi dini hotspot.",
      "2026-10-05",
      "Published",
      "Admin Utama"
    ],
    // Contoh 1 Dokumentasi Setoran Desa status Pending
    [
      "DOC-2026-007",
      "Gotong Royong Perbaikan Saluran Air Irigasi Sawah",
      "Desa Kuantan Sako, Kuansing",
      "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=1000&q=80",
      "Warga dusun bahu-membahu memperbaiki tanggul irigasi sawah seluas 30 hektare menjelang musim tanam padi.",
      "2026-10-05",
      "Pending",
      "Warga Kuantan Sako"
    ]
  ];

  dokumentasiData.forEach(row => sheet.appendRow(row));
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Styling Header Row: Nuansa Mewah Emerald Green (#064E3B) & Gold Text (#FEF08A)
 */
function formatHeaderRow(sheet, numColumns) {
  const range = sheet.getRange(1, 1, 1, numColumns);
  range.setBackground("#064E3B"); // Deep Emerald Green
  range.setFontColor("#FEF08A");  // Royal Gold Accent
  range.setFontWeight("bold");
  range.setFontFamily("Plus Jakarta Sans");
  range.setHorizontalAlignment("center");
  range.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);
}

/**
 * Helper untuk membuat Folder Google Drive khusus jika belum ada
 */
function setupDriveFolder() {
  const folderName = "PortalDesaRiau_MediaUploads";
  const folders = DriveApp.getFoldersByName(folderName);
  let folder;
  
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  
  return {
    name: folder.getName(),
    id: folder.getId()
  };
}
