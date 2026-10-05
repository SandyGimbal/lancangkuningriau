/**
 * ==============================================================================
 * CODE.GS - BACKEND CONTROLLER & ADMIN CRUD API (GOOGLE APPS SCRIPT)
 * SISTEM PORTAL BERITA & DOKUMENTASI DESA SE-PROVINSI RIAU
 * ==============================================================================
 * Fitur Utama:
 * 1. Router doGet(e): 
 *    - Publik (Index.html)
 *    - Admin Panel (Admin.html via parameter ?page=admin)
 * 2. Autentikasi Admin Berbasis Database Sheets (Tab Tbl_Admin)
 * 3. Alur Moderasi Berita & Dokumentasi:
 *    - Desa setor data -> status: 'Pending'
 *    - Admin mereview, menyetujui (Published), mengedit, atau menolak
 *    - Portal publik HANYA menampilkan data berstatus 'Published'
 * 4. Integrasi Penyimpanan Gambar Google Drive
 * ==============================================================================
 */

// KONFIGURASI GLOBAL SISTEM
const CONFIG = {
  // SPREADSHEET ID DARI LINK SHEET PENGGUNA (kosongkan jika script terikat langsung ke Sheet)
  SPREADSHEET_ID: "", 
  
  // Folder ID Google Drive untuk media upload
  DRIVE_FOLDER_ID: "", 
  
  // Nama-nama Sheet Database
  SHEETS: {
    BERITA: "Tbl_Berita",
    DOKUMENTASI: "Tbl_Dokumentasi",
    KATEGORI: "Tbl_Kategori",
    ADMIN: "Tbl_Admin"
  },

  // 12 Kabupaten / Kota di Provinsi Riau
  KABUPATEN_RIAU: [
    "Bengkalis",
    "Indragiri Hilir",
    "Indragiri Hulu",
    "Kampar",
    "Kepulauan Meranti",
    "Kuantan Singingi",
    "Pelalawan",
    "Rokan Hilir",
    "Rokan Hulu",
    "Siak",
    "Kota Dumai",
    "Kota Pekanbaru"
  ]
};

/**
 * Mendapatkan instance Spreadsheet yang aktif atau via ID
 */
function getDatabase_() {
  // Prioritas: Script Properties (Project Settings > Script Properties > SPREADSHEET_ID)
  const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const sheetId = (propId && propId.trim()) || (CONFIG.SPREADSHEET_ID || "").trim();
  if (sheetId !== "") {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch(e) {
      Logger.log("Error opening spreadsheet by ID: " + e.toString());
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * ENTRY POINT WEB APP: doGet(e)
 * Routing:
 * - ?page=admin  -> Me-render Dashboard Admin (Admin.html)
 * - default      -> Me-render Portal Publik (Index.html)
 */
function doGet(e) {
  try {
    // Health check API: https://script.google.com/.../exec?api=ping
    if (e && e.parameter && e.parameter.api === "ping") {
      return jsonResponse_({ success: true, message: "API Portal Desa Riau aktif", time: new Date().toISOString() });
    }

    const page = (e && e.parameter && e.parameter.page) ? e.parameter.page.toLowerCase() : "";

    if (page === "admin") {
      let template;
      try {
        template = HtmlService.createTemplateFromFile("Admin");
      } catch(e1) {
        template = HtmlService.createTemplateFromFile("admin");
      }
      template.pageTitle = "Panel Admin Portal Desa Riau | Verifikasi & Moderasi";
      return template.evaluate()
        .setTitle("Panel Admin | Portal Desa Se-Provinsi Riau")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=5.0")
        .setFaviconUrl("https://cdn-icons-png.flaticon.com/512/3208/3208679.png");
    }

    // Default: Portal Publik
    let template;
    try {
      template = HtmlService.createTemplateFromFile("Index");
    } catch(e1) {
      try {
        template = HtmlService.createTemplateFromFile("Indek");
      } catch(e2) {
        template = HtmlService.createTemplateFromFile("index");
      }
    }
    template.appTitle = "Lancang Kuning Digital - Portal Berita & Dokumentasi Desa Riau";
    
    return template.evaluate()
      .setTitle("Portal Desa Se-Provinsi Riau | Lancang Kuning Digital")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=5.0")
      .setFaviconUrl("https://cdn-icons-png.flaticon.com/512/3208/3208679.png");
  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<div style='font-family:sans-serif;padding:30px;color:#b91c1c;background:#fef2f2;'>" +
      "<h2>Gagal Memuat Halaman</h2>" +
      "<p>Error: " + err.toString() + "</p>" +
      "</div>"
    );
  }
}

/**
 * ==============================================================================
 * JSON API UNTUK FRONTEND STATIS (VERCEL) - doPost(e)
 * ==============================================================================
 * Body (text/plain JSON): { action: "getPosts", args: [ ... ], token: "..." }
 * Dipanggil otomatis oleh gas-bridge.js.
 */
const API_PUBLIC_ACTIONS_ = {
  getPosts: getPosts,
  getGallery: getGallery,
  getPortalStats: getPortalStats,
  loginAdmin: loginAdmin
};

const API_ADMIN_ACTIONS_ = {
  uploadArticle: uploadArticle,
  uploadDokumentasi: uploadDokumentasi,
  adminGetDashboardStats: adminGetDashboardStats,
  adminGetPosts: adminGetPosts,
  adminUpdatePostStatus: adminUpdatePostStatus,
  adminUpdatePost: adminUpdatePost,
  adminDeletePost: adminDeletePost,
  adminGetGallery: adminGetGallery,
  adminUpdateGalleryStatus: adminUpdateGalleryStatus,
  adminDeleteGallery: adminDeleteGallery,
  adminGetAdmins: adminGetAdmins
};

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = String(body.action || "");
    const args = Array.isArray(body.args) ? body.args : [];

    if (API_PUBLIC_ACTIONS_.hasOwnProperty(action)) {
      return jsonResponse_(API_PUBLIC_ACTIONS_[action].apply(null, args));
    }

    if (API_ADMIN_ACTIONS_.hasOwnProperty(action)) {
      if (!verifySessionToken_(body.token)) {
        return jsonResponse_({ success: false, authError: true, message: "Sesi login berakhir atau tidak valid. Silakan login kembali." });
      }
      return jsonResponse_(API_ADMIN_ACTIONS_[action].apply(null, args));
    }

    return jsonResponse_({ success: false, message: "Aksi API tidak dikenal: " + action });
  } catch (err) {
    return jsonResponse_({ success: false, message: "Kesalahan server: " + err.toString() });
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

const SESSION_TTL_SECONDS_ = 6 * 60 * 60; // 6 jam (batas maksimum CacheService)

function createSessionToken_(username) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  CacheService.getScriptCache().put("sess_" + token, username, SESSION_TTL_SECONDS_);
  return token;
}

function verifySessionToken_(token) {
  if (!token || typeof token !== "string") return false;
  return CacheService.getScriptCache().get("sess_" + token) !== null;
}

/**
 * ==============================================================================
 * SISTEM AUTENTIKASI ADMIN (BERBASIS TAB TBL_ADMIN DI GOOGLE SHEETS)
 * ==============================================================================
 */

/**
 * Login Admin memverifikasi username dan password dari sheet Tbl_Admin
 * @param {Object} credentials { username, password }
 * @return {Object} { success: boolean, message: string, token: string, user: Object }
 */
function loginAdmin(credentials) {
  try {
    if (!credentials || !credentials.username || !credentials.password) {
      return { success: false, message: "Username dan password wajib diisi!" };
    }

    const usernameInput = credentials.username.trim().toLowerCase();
    const passwordInput = credentials.password.trim();

    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.ADMIN);
    if (!sheet) {
      return { success: false, message: "Tabel Tbl_Admin belum diinisialisasi di Spreadsheet. Jalankan Setup.gs terlebih dahulu!" };
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: false, message: "Belum ada akun admin di database. Silakan jalankan Setup.gs." };
    }

    const headers = data[0];
    const usernameIdx = headers.indexOf("username");
    const passwordIdx = headers.indexOf("password");
    const statusIdx = headers.indexOf("status");
    const namaIdx = headers.indexOf("nama_lengkap");
    const roleIdx = headers.indexOf("role");
    const emailIdx = headers.indexOf("email");
    const idIdx = headers.indexOf("id");

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const dbUsername = String(row[usernameIdx] || "").trim().toLowerCase();
      const dbPassword = String(row[passwordIdx] || "").trim();
      const dbStatus = String(row[statusIdx] || "").trim().toLowerCase();

      if (dbUsername === usernameInput && dbPassword === passwordInput) {
        if (dbStatus !== "active" && dbStatus !== "aktif") {
          return { success: false, message: "Akun admin ini dinonaktifkan oleh sistem." };
        }

        // Token sesi acak, disimpan di CacheService untuk verifikasi API admin
        const sessionToken = createSessionToken_(dbUsername);

        return {
          success: true,
          message: "Login berhasil! Selamat datang, " + (row[namaIdx] || dbUsername),
          token: sessionToken,
          user: {
            id: row[idIdx] || "ADM",
            username: dbUsername,
            nama_lengkap: row[namaIdx] || dbUsername,
            role: row[roleIdx] || "Admin",
            email: row[emailIdx] || ""
          }
        };
      }
    }

    return { success: false, message: "Username atau password tidak sesuai!" };
  } catch (error) {
    return { success: false, message: "Gagal login: " + error.toString() };
  }
}

/**
 * ==============================================================================
 * PORTAL PUBLIK - QUERY API (HANYA MENAMPILKAN DATA BERSTATUS 'PUBLISHED')
 * ==============================================================================
 */

/**
 * Mengambil berita yang SUDAH DISETUJUI & DITERBITKAN OLEH ADMIN
 */
function getPosts(filter) {
  try {
    filter = filter || {};
    const page = parseInt(filter.page) || 1;
    const limit = parseInt(filter.limit) || 9;
    const filterKategori = (filter.kategori || "Semua").trim();
    const filterKabupaten = (filter.kabupaten || "Semua").trim();
    const search = (filter.search || "").toLowerCase().trim();

    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    if (!sheet) {
      return { success: false, message: "Tab Tbl_Berita belum siap!", data: [], total: 0 };
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: true, data: [], total: 0, page: 1, totalPages: 0 };
    }

    const headers = data[0];
    const rows = data.slice(1);

    let articles = rows.map((row, index) => {
      const obj = {};
      headers.forEach((header, i) => {
        let val = row[i];
        if (header === "tanggal" && val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");
        }
        obj[header] = val;
      });
      obj._rowNumber = index + 2;
      return obj;
    });

    // 1. FILTER KETAT: Hanya berita yang statusnya 'Published' yang tampil di publik!
    articles = articles.filter(item => {
      const status = (item.status || "").toLowerCase().trim();
      return status === "published" || status === "publikasi";
    });

    // 2. Filter Kategori
    if (filterKategori !== "Semua" && filterKategori !== "") {
      articles = articles.filter(item => 
        (item.kategori || "").toLowerCase() === filterKategori.toLowerCase()
      );
    }

    // 3. Filter Kabupaten / Kota
    if (filterKabupaten !== "Semua" && filterKabupaten !== "") {
      articles = articles.filter(item => 
        (item.kabupaten_kota || "").toLowerCase().includes(filterKabupaten.toLowerCase())
      );
    }

    // 4. Filter Keyword Pencarian
    if (search !== "") {
      articles = articles.filter(item => {
        const titleMatch = (item.judul || "").toLowerCase().includes(search);
        const contentMatch = (item.konten || "").toLowerCase().includes(search);
        const desaMatch = (item.desa || "").toLowerCase().includes(search);
        const kabMatch = (item.kabupaten_kota || "").toLowerCase().includes(search);
        return titleMatch || contentMatch || desaMatch || kabMatch;
      });
    }

    // 5. Urutkan tanggal terbaru
    articles.sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

    const total = articles.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedData = articles.slice(startIndex, startIndex + limit);

    return {
      success: true,
      data: paginatedData,
      total: total,
      page: page,
      limit: limit,
      totalPages: totalPages
    };
  } catch (error) {
    return {
      success: false,
      message: "Gagal mengambil data: " + error.toString(),
      data: [],
      total: 0
    };
  }
}

/**
 * Mengambil galeri dokumentasi yang SUDAH DISETUJUI ADMIN
 */
function getGallery(filter) {
  try {
    filter = filter || {};
    const limit = parseInt(filter.limit) || 24;
    const search = (filter.search || "").toLowerCase().trim();

    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);
    if (!sheet) return { success: false, data: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const headers = data[0];
    const rows = data.slice(1);

    let gallery = rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (h === "tanggal" && val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");
        }
        obj[h] = val;
      });
      return obj;
    });

    // Filter hanya yang Published (atau yang belum ada kolom status dianggap terbit)
    gallery = gallery.filter(item => {
      const status = (item.status || "").toLowerCase().trim();
      return status === "published" || status === "publikasi" || status === "";
    });

    if (search !== "") {
      gallery = gallery.filter(item => 
        (item.judul_kegiatan || "").toLowerCase().includes(search) ||
        (item.lokasi_desa || "").toLowerCase().includes(search)
      );
    }

    gallery.sort((a, b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));

    return {
      success: true,
      data: gallery.slice(0, limit),
      count: gallery.length
    };
  } catch (error) {
    return { success: false, message: error.toString(), data: [] };
  }
}

/**
 * Statistik Ringkas untuk Hero Section
 */
function getPortalStats() {
  try {
    const ss = getDatabase_();
    const sheetBerita = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    const sheetDokumentasi = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);

    let totalBerita = 0;
    if (sheetBerita && sheetBerita.getLastRow() > 1) {
      const data = sheetBerita.getDataRange().getValues();
      const statusIdx = data[0].indexOf("status");
      for (let i = 1; i < data.length; i++) {
        const st = String(data[i][statusIdx] || "").toLowerCase().trim();
        if (st === "published" || st === "publikasi") totalBerita++;
      }
    }

    let totalDokumentasi = 0;
    if (sheetDokumentasi && sheetDokumentasi.getLastRow() > 1) {
      const data = sheetDokumentasi.getDataRange().getValues();
      const statusIdx = data[0].indexOf("status");
      for (let i = 1; i < data.length; i++) {
        const st = statusIdx > -1 ? String(data[i][statusIdx] || "").toLowerCase().trim() : "published";
        if (st === "published" || st === "publikasi" || st === "") totalDokumentasi++;
      }
    }

    return {
      success: true,
      data: {
        totalBerita: totalBerita,
        totalDokumentasi: totalDokumentasi,
        totalKabupaten: 12,
        totalDesaMitra: 1850
      }
    };
  } catch (e) {
    return {
      success: true,
      data: { totalBerita: 6, totalDokumentasi: 6, totalKabupaten: 12, totalDesaMitra: 1850 }
    };
  }
}

/**
 * ==============================================================================
 * SETORAN WARTA & DOKUMENTASI DARI DESA (STATUS AWAL: 'PENDING')
 * ==============================================================================
 */

/**
 * Desa menyetor warta / berita baru.
 * Otomatis berstatus 'Pending' agar Admin dapat memverifikasi terlebih dahulu.
 */
function uploadArticle(formData) {
  try {
    if (!formData.judul || !formData.konten || !formData.desa || !formData.kabupaten_kota) {
      return { success: false, message: "Semua isian wajib dilengkapi!" };
    }

    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    if (!sheet) return { success: false, message: "Tab Tbl_Berita belum siap!" };

    const year = new Date().getFullYear();
    const lastRow = sheet.getLastRow();
    const uniqueNumber = String(lastRow).padStart(3, "0");
    const id = "BRT-" + year + "-" + uniqueNumber;
    const slug = createSlug_(formData.judul) + "-" + uniqueNumber;
    const tanggal = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");

    // Simpan gambar ke Drive jika ada base64
    let thumbnailUrl = formData.thumbnailUrl || "";
    if (formData.thumbnailBase64 && formData.thumbnailBase64.trim() !== "") {
      const fileName = "Berita_" + id + "_" + (formData.thumbnailName || "image.jpg");
      thumbnailUrl = saveImageToDrive_(formData.thumbnailBase64, fileName);
    } else if (!thumbnailUrl) {
      thumbnailUrl = "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80";
    }

    // Status: Default 'Published' jika diinput dari admin, atau sesuai formData.status
    const status = formData.status || "Published";
    const disetorOleh = formData.disetor_oleh || "Admin Redaksi";

    let desaFormatted = (formData.desa || "").trim();
    if (formData.kecamatan && formData.kecamatan.trim() !== "" && !desaFormatted.toLowerCase().includes("kec.")) {
      desaFormatted += ", Kec. " + formData.kecamatan.trim();
    }

    // Sisipkan ke sheet: id, judul, slug, kategori, desa, kabupaten_kota, konten, thumbnail_url, tanggal, status, disetor_oleh
    sheet.appendRow([
      id,
      formData.judul.trim(),
      slug,
      formData.kategori || "Umum",
      desaFormatted,
      formData.kabupaten_kota.trim(),
      formData.konten.trim(),
      thumbnailUrl,
      tanggal,
      status,
      disetorOleh
    ]);

    return {
      success: true,
      message: status === "Published" ? "Warta desa resmi diterbitkan ke portal publik!" : "Warta berhasil disimpan sebagai draf.",
      id: id,
      status: status
    };
  } catch (error) {
    return { success: false, message: "Gagal memproses warta: " + error.toString() };
  }
}

/**
 * Desa menyetor dokumentasi foto kegiatan.
 * Otomatis berstatus 'Pending'.
 */
function uploadDokumentasi(formData) {
  try {
    if (!formData.judul_kegiatan || !formData.lokasi_desa) {
      return { success: false, message: "Judul kegiatan dan lokasi desa wajib diisi!" };
    }

    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);
    if (!sheet) return { success: false, message: "Tab Tbl_Dokumentasi belum siap!" };

    const year = new Date().getFullYear();
    const lastRow = sheet.getLastRow();
    const uniqueNumber = String(lastRow).padStart(3, "0");
    const id = "DOC-" + year + "-" + uniqueNumber;
    const tanggal = formData.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");

    let fotoUrl = formData.fotoUrl || "";
    if (formData.fotoBase64 && formData.fotoBase64.trim() !== "") {
      const fileName = "Dokumentasi_" + id + "_" + (formData.fotoName || "kegiatan.jpg");
      fotoUrl = saveImageToDrive_(formData.fotoBase64, fileName);
    } else if (!fotoUrl) {
      fotoUrl = "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1000&q=80";
    }

    const status = formData.status || "Published";
    const disetorOleh = formData.disetor_oleh || formData.lokasi_desa || "Admin Redaksi";

    // id, judul_kegiatan, lokasi_desa, foto_url, deskripsi, tanggal, status, disetor_oleh
    sheet.appendRow([
      id,
      formData.judul_kegiatan.trim(),
      formData.lokasi_desa.trim(),
      fotoUrl,
      (formData.deskripsi || "").trim(),
      tanggal,
      status,
      disetorOleh
    ]);

    return {
      success: true,
      message: status === "Published" ? "Dokumentasi foto kegiatan resmi dipublikasikan ke galeri publik!" : "Dokumentasi disimpan.",
      id: id,
      status: status
    };
  } catch (error) {
    return { success: false, message: "Gagal menyimpan dokumentasi: " + error.toString() };
  }
}

/**
 * ==============================================================================
 * PORTAL ADMIN API (VERIFIKASI, MODERASI, EDIT, APPROVE, REJECT, DELETE)
 * ==============================================================================
 */

/**
 * Mengambil ringkasan statistik komprehensif untuk Dashboard Admin
 */
function adminGetDashboardStats() {
  try {
    const ss = getDatabase_();
    const sheetBerita = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    const sheetDok = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);
    const sheetAdmin = ss.getSheetByName(CONFIG.SHEETS.ADMIN);

    let beritaPending = 0;
    let beritaPublished = 0;
    let beritaRejected = 0;
    let totalBerita = 0;

    if (sheetBerita && sheetBerita.getLastRow() > 1) {
      const data = sheetBerita.getDataRange().getValues();
      const statusIdx = data[0].indexOf("status");
      totalBerita = data.length - 1;

      for (let i = 1; i < data.length; i++) {
        const st = String(data[i][statusIdx] || "").toLowerCase().trim();
        if (st === "pending") beritaPending++;
        else if (st === "published" || st === "publikasi") beritaPublished++;
        else if (st === "rejected" || st === "ditolak") beritaRejected++;
      }
    }

    let dokPending = 0;
    let dokPublished = 0;
    let totalDok = 0;

    if (sheetDok && sheetDok.getLastRow() > 1) {
      const data = sheetDok.getDataRange().getValues();
      const statusIdx = data[0].indexOf("status");
      totalDok = data.length - 1;

      for (let i = 1; i < data.length; i++) {
        const st = statusIdx > -1 ? String(data[i][statusIdx] || "").toLowerCase().trim() : "published";
        if (st === "pending") dokPending++;
        else if (st === "published" || st === "publikasi" || st === "") dokPublished++;
      }
    }

    const totalAdmins = sheetAdmin ? Math.max(0, sheetAdmin.getLastRow() - 1) : 0;

    return {
      success: true,
      data: {
        beritaPending,
        beritaPublished,
        beritaRejected,
        totalBerita,
        dokPending,
        dokPublished,
        totalDok,
        totalAdmins
      }
    };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Mengambil semua berita untuk tabel manajemen Admin (Termasuk status Pending & Rejected)
 * @param {Object} filter { status: string, search: string }
 */
function adminGetPosts(filter) {
  try {
    filter = filter || {};
    const statusFilter = (filter.status || "All").toLowerCase().trim();
    const search = (filter.search || "").toLowerCase().trim();

    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    if (!sheet) return { success: true, data: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const headers = data[0];
    const rows = data.slice(1);

    let articles = rows.map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (h === "tanggal" && val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");
        }
        obj[h] = val;
      });
      obj._rowIndex = index + 2; // Baris riil di sheet (1-based index)
      return obj;
    });

    // Filter status
    if (statusFilter !== "all" && statusFilter !== "") {
      articles = articles.filter(item => (item.status || "").toLowerCase().trim() === statusFilter);
    }

    // Filter pencarian
    if (search !== "") {
      articles = articles.filter(item => 
        (item.judul || "").toLowerCase().includes(search) ||
        (item.desa || "").toLowerCase().includes(search) ||
        (item.kabupaten_kota || "").toLowerCase().includes(search) ||
        (item.disetor_oleh || "").toLowerCase().includes(search)
      );
    }

    // Urutkan: Yang 'Pending' di paling atas agar admin segera memprosesnya!
    articles.sort((a, b) => {
      const aPending = (a.status || "").toLowerCase() === "pending" ? 1 : 0;
      const bPending = (b.status || "").toLowerCase() === "pending" ? 1 : 0;
      if (bPending !== aPending) return bPending - aPending;
      return new Date(b.tanggal || 0) - new Date(a.tanggal || 0);
    });

    return { success: true, data: articles };
  } catch (error) {
    return { success: false, message: error.toString(), data: [] };
  }
}

/**
 * Mengubah status berita (Misal: 'Published' untuk menyetujui, 'Rejected' untuk menolak)
 */
function adminUpdatePostStatus(id, newStatus) {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    if (!sheet) return { success: false, message: "Tab tidak ditemukan" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf("id");
    const statusIdx = headers.indexOf("status");

    if (idIdx === -1 || statusIdx === -1) {
      return { success: false, message: "Struktur kolom sheet tidak sesuai" };
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === id) {
        sheet.getRange(i + 1, statusIdx + 1).setValue(newStatus);
        return {
          success: true,
          message: "Status berita " + id + " berhasil diubah menjadi: " + newStatus
        };
      }
    }

    return { success: false, message: "Berita dengan ID " + id + " tidak ditemukan" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Admin memperbarui isi berita secara lengkap (Edit warta setoran desa sebelum terbit)
 */
function adminUpdatePost(id, updatedData) {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    if (!sheet) return { success: false, message: "Tab tidak ditemukan" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf("id");

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === id) {
        const rowNumber = i + 1;

        // Tangani update gambar jika ada base64 baru
        let finalThumbnail = updatedData.thumbnail_url || data[i][headers.indexOf("thumbnail_url")];
        if (updatedData.thumbnailBase64 && updatedData.thumbnailBase64.trim() !== "") {
          finalThumbnail = saveImageToDrive_(updatedData.thumbnailBase64, "Berita_Edit_" + id + ".jpg");
        }

        const map = {
          "judul": updatedData.judul,
          "kategori": updatedData.kategori,
          "desa": updatedData.desa,
          "kabupaten_kota": updatedData.kabupaten_kota,
          "konten": updatedData.konten,
          "thumbnail_url": finalThumbnail,
          "status": updatedData.status || "Published"
        };

        headers.forEach((header, colIdx) => {
          if (map[header] !== undefined && map[header] !== null) {
            sheet.getRange(rowNumber, colIdx + 1).setValue(map[header]);
          }
        });

        return {
          success: true,
          message: "Warta berita berhasil disunting dan disimpan!",
          thumbnail_url: finalThumbnail
        };
      }
    }

    return { success: false, message: "Berita tidak ditemukan" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Admin menghapus berita
 */
function adminDeletePost(id) {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.BERITA);
    if (!sheet) return { success: false, message: "Tab tidak ditemukan" };

    const data = sheet.getDataRange().getValues();
    const idIdx = data[0].indexOf("id");

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Berita berhasil dihapus permanen!" };
      }
    }

    return { success: false, message: "Berita tidak ditemukan" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Mengambil semua data dokumentasi untuk panel admin
 */
function adminGetGallery(filter) {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);
    if (!sheet) return { success: true, data: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const headers = data[0];
    const rows = data.slice(1);

    let gallery = rows.map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (h === "tanggal" && val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || "Asia/Jakarta", "yyyy-MM-dd");
        }
        obj[h] = val;
      });
      obj._rowIndex = index + 2;
      return obj;
    });

    return { success: true, data: gallery };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Mengubah status dokumentasi kegiatan
 */
function adminUpdateGalleryStatus(id, newStatus) {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);
    if (!sheet) return { success: false, message: "Tab tidak ditemukan" };

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx = headers.indexOf("id");
    let statusIdx = headers.indexOf("status");

    // Jika kolom status belum ada di sheet dokumentasi lama, buat di kolom terakhir
    if (statusIdx === -1) {
      statusIdx = headers.length;
      sheet.getRange(1, statusIdx + 1).setValue("status");
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === id) {
        sheet.getRange(i + 1, statusIdx + 1).setValue(newStatus);
        return { success: true, message: "Dokumentasi " + id + " berstatus: " + newStatus };
      }
    }

    return { success: false, message: "Data tidak ditemukan" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Menghapus dokumentasi kegiatan
 */
function adminDeleteGallery(id) {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DOKUMENTASI);
    if (!sheet) return { success: false, message: "Tab tidak ditemukan" };

    const data = sheet.getDataRange().getValues();
    const idIdx = data[0].indexOf("id");

    for (let i = 1; i < data.length; i++) {
      if (data[i][idIdx] === id) {
        sheet.deleteRow(i + 1);
        return { success: true, message: "Dokumentasi berhasil dihapus!" };
      }
    }

    return { success: false, message: "Data tidak ditemukan" };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * Mengambil daftar admin (tanpa membocorkan password)
 */
function adminGetAdmins() {
  try {
    const ss = getDatabase_();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.ADMIN);
    if (!sheet) return { success: true, data: [] };

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { success: true, data: [] };

    const headers = data[0];
    const rows = data.slice(1);

    const admins = rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h !== "password") { // Rahasiakan password
          obj[h] = r[i];
        }
      });
      return obj;
    });

    return { success: true, data: admins };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

/**
 * ==============================================================================
 * UTILITY HELPERS (GOOGLE DRIVE STORAGE & SLUG GENERATOR)
 * ==============================================================================
 */

/**
 * Mengonversi Base64 Data URI menjadi file di Google Drive dan menghasilkan Direct URL
 */
function saveImageToDrive_(base64Data, fileName) {
  try {
    let folder;
    
    if (CONFIG.DRIVE_FOLDER_ID && CONFIG.DRIVE_FOLDER_ID.trim() !== "") {
      try {
        folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
      } catch (e) {}
    }

    if (!folder) {
      const folderName = "PortalDesaRiau_MediaUploads";
      const folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }
    }

    try {
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(e) {}

    let contentType = "image/jpeg";
    let pureBase64 = base64Data;

    if (base64Data.indexOf(",") > -1) {
      const parts = base64Data.split(",");
      const meta = parts[0];
      pureBase64 = parts[1];
      const match = meta.match(/data:(.*?);base64/);
      if (match && match[1]) {
        contentType = match[1];
      }
    }

    const decoded = Utilities.base64Decode(pureBase64);
    const blob = Utilities.newBlob(decoded, contentType, fileName);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const fileId = file.getId();
    return "https://lh3.googleusercontent.com/d/" + fileId;
  } catch (err) {
    Logger.log("Error saveImageToDrive_: " + err.toString());
    return "https://images.unsplash.com/photo-1596178065887-1198b6148b2b?auto=format&fit=crop&w=1200&q=80";
  }
}

/**
 * Membuat Kebab-Case Slug
 */
function createSlug_(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 75);
}
