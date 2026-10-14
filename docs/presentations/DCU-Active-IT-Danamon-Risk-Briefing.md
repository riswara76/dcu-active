# DCU Active
## Arsitektur Sistem, Keamanan, Risiko & Mitigasi
Presentasi kepada IT Bank Danamon · Oktober 2026
Product Owner: Ronny Iswara (DCU)

---
# Tujuan Sesi
- Menjelaskan bagaimana sistem booking fasilitas DCU Active dibangun dan diatur
- Memaparkan risiko teknis, keamanan, dan privasi beserta mitigasinya
- Menyampaikan hasil pengujian sejauh ini (staging aktif sejak 14 Oktober 2026)
- Meminta dukungan dan persetujuan IT Danamon untuk beberapa hal sebelum go-live

---
# Apa itu DCU Active?
- Web app / PWA untuk booking fasilitas olahraga dan rekreasi DCU dari HP atau laptop
- Pengguna: karyawan Danamon, Adira, dan Home Credit (domain @danamon.co.id, @adira.co.id, @homecredit.co.id)
- 6 fasilitas: Tennis Court, Basketball/Futsal Court, Table Tennis, Football Field, Air Hockey, Foosball
- Durasi 30/60/90 menit (Tennis, Court, Football) atau 30 menit; booking langsung terkonfirmasi tanpa approval
- Aturan fair-use: maks. 2 booking aktif, 1 booking per fasilitas per hari, batal paling lambat 30 menit sebelum mulai, check-in wajib atau otomatis no-show
- Admin: kelola fasilitas, blokir jadwal, user, domain email, dan pengaturan (semua tercatat di audit log)

---
# Arsitektur Sistem
- **Browser / PWA (React + TypeScript)** — tidak dipercaya; hanya membawa kunci publik
- **Cloudflare (static hosting)** — hanya file statis + security headers; tidak ada kode server
- **Supabase (managed, region Singapura)**
  - Auth: login email + password, verifikasi email, hook pembatasan domain
  - Data API: hanya fungsi di schema `api` yang terekspos; tabel tidak bisa diakses langsung
  - PostgreSQL: semua aturan bisnis, Row Level Security, audit log
  - Realtime: sinyal privat "jadwal berubah" tanpa data pribadi
- **Email**: pengirim DCU@danamon.co.id melalui SMTP (metode menunggu keputusan IT Danamon)
- Kode sumber di GitHub; CI otomatis menjalankan lint, test, dan secret scan di setiap perubahan

---
# Prinsip Keamanan Desain
1. **Browser tidak dipercaya** — setiap input divalidasi ulang di database seolah datang dari penyerang
2. **Aturan bisnis di database** — tidak bisa dilewati walau API dipanggil langsung
3. **Least privilege** — tabel tidak terekspos; user hanya bisa memanggil fungsi yang diizinkan
4. **Tidak ada secret di browser** — hanya publishable key; secret key & password DB tidak pernah keluar dari dashboard
5. **Cek status secara live** — nonaktifkan user, ubah role, atau hapus domain berlaku seketika
6. **Semua tindakan admin tercatat** — dengan alasan wajib dan log yang tidak bisa diubah

---
# Identitas & Kontrol Akses
- Pendaftaran hanya untuk domain yang diizinkan, dicek di server (Before-User-Created hook), tanpa subdomain
- Verifikasi email wajib sebelum bisa booking
- Password minimal 8 karakter dengan huruf besar, kecil, angka, dan simbol; rate limit login/daftar
- Dua peran: USER dan ADMIN; admin harus berdomain yang diizinkan
- Admin pertama diangkat lewat skrip terkontrol yang tercatat di audit log; admin tidak bisa menaikkan/menonaktifkan dirinya sendiri
- Selalu ada minimal 1 admin aktif dan minimal 1 domain aktif
- Otorisasi tidak bergantung pada klaim token — selalu dicek ke data terkini di database

---
# Perlindungan Data & Privasi (UU PDP No. 27/2022)
- **Data minimal**: nama, email kantor, booking, notifikasi. Tidak ada nomor HP, foto, lokasi, atau device fingerprint
- **Tujuan terbatas**: booking fasilitas dan administrasi fair-use
- **Kerahasiaan**: user hanya melihat datanya sendiri; jadwal publik tidak menampilkan siapa yang booking
- **Lokasi data**: Supabase region Singapura (disetujui PO); enkripsi in-transit (TLS/HSTS) dan at-rest oleh provider
- **Retensi**: booking & audit ≥ 2 tahun (menunggu konfirmasi Legal); notifikasi 90 hari dihapus otomatis
- **Privacy notice**: tautan di halaman daftar & profil; teks menunggu persetujuan Legal

---
# Integritas Booking (Anti Double-Booking)
- **Lapis 1**: penguncian baris saat booking (profil → fasilitas → booking)
- **Lapis 2**: constraint database (exclusion constraint) — dua booking yang tumpang tindih mustahil tersimpan, bahkan lewat insert langsung
- **Idempotency key**: klik ganda / jaringan putus tidak membuat booking ganda
- Semua waktu dihitung di server dalam WIB, tidak tergantung jam/zona waktu HP
- Pengecekan integritas harian otomatis + job status tiap menit (no-show, selesai)
- Hasil uji beban bersamaan: 30 user × 10 ronde, 20 request paralel × 50 iterasi → **0 tumpang tindih**

---
# Keamanan Aplikasi Web
- Content Security Policy ketat: tidak ada script inline atau script pihak ketiga
- HSTS, X-Frame-Options DENY (anti clickjacking), nosniff, Referrer-Policy, Permissions-Policy (kamera, mikrofon, lokasi dimatikan)
- Proteksi open redirect setelah login / reset password
- Link email aman dari email scanner (harus klik konfirmasi; ada alternatif kode 6 digit)
- Service worker hanya menyimpan file statis — data API, login, dan realtime tidak pernah di-cache
- Scan otomatis setiap build: memastikan tidak ada secret/service key di bundle

---
# Audit, Monitoring & Respons Insiden
- **Audit log append-only**: siapa, kapan, apa, sebelum/sesudah, alasan — tidak bisa diubah atau dihapus, bahkan oleh admin
- Mencakup semua tindakan admin dan siklus booking user
- **Monitoring**: health check job, integrity check harian, Supabase Security & Performance Advisor
- **Respons insiden**:
  1. Deteksi (alert, integrity check, laporan user)
  2. Kontain (nonaktifkan akun, hapus domain, rotasi kunci, blokir fasilitas)
  3. Investigasi (audit log, log Supabase)
  4. Pemulihan (restore backup)
  5. Notifikasi sesuai UU PDP melalui DPO/Legal
  6. Review pasca-insiden

---
# Hasil Pengujian (per 14 Oktober 2026)
- **Database (pgTAP)**: privilege per peran, RLS, aturan bisnis, audit — lulus
- **Konkurensi**: 8/8 skenario lulus, 0 double-booking
- **End-to-end**: 41/41 lulus di Android Chrome, iPhone Safari (WebKit), dan desktop, termasuk cek aksesibilitas
- **OWASP ZAP baseline**: 0 FAIL, 62 PASS, 5 peringatan rendah/informasional
- **npm audit**: 0 kerentanan
- **Supabase Advisor (staging)**: 0 ERROR
- **Lighthouse mobile**: Performance 91, Accessibility 100, Best Practices 100
- **UAT berjalan**: 2 temuan tampilan dari uji HP Product Owner sudah diperbaiki di hari yang sama

---
# Matriks Risiko & Mitigasi
| Risiko | Kemungkinan / Dampak | Mitigasi |
|---|---|---|
| Double booking akibat bug | Rendah / Tinggi | 2 lapis pengaman di database, uji konkurensi, integrity check harian |
| Email verifikasi diblokir filter email perusahaan | Sedang / Tinggi | SMTP resmi DCU@danamon.co.id + SPF/DKIM/DMARC, allow-list di 3 perusahaan, kode 6 digit |
| Pendaftaran oleh non-karyawan | Rendah / Tinggi | Pembatasan domain di server + verifikasi email; admin bisa nonaktifkan seketika |
| Akses data user lain lewat API | Rendah / Tinggi | Tabel tidak terekspos, RLS, fungsi terkontrol; diuji per peran |
| Penyalahgunaan hak admin | Rendah / Sedang | Alasan wajib, audit log permanen, rentang pengaturan dibatasi |
| Kebocoran secret key | Rendah / Tinggi | Secret hanya di dashboard; scan bundle & repo otomatis |
| Layanan berhenti / data hilang | Sedang / Tinggi | Paket berbayar + backup untuk produksi; status job dimonitor |
| Data pribadi karyawan (UU PDP) | Sedang / Sedang | Data minimal, retensi, privacy notice, review Legal |
| Kesalahan zona waktu di HP | Sedang / Sedang | Semua perhitungan WIB di server; diuji |

---
# Risiko Residual & Keterbatasan yang Diakui
- **Ketergantungan vendor cloud** (Supabase, Cloudflare) — perlu penilaian vendor/cloud oleh IT & Risk Danamon
- **Staging memakai paket gratis** — produksi wajib paket berbayar dengan backup terjadwal
- **Email belum produksi** — SMTP menunggu keputusan IT Danamon; saat ini akun uji dibuat manual oleh admin
- **Style inline diizinkan di CSP** (dibutuhkan komponen UI) — script tetap ketat; risiko rendah
- **Data di luar negeri (Singapura)** — disetujui PO; dokumentasi transfer lintas negara oleh Legal
- Go-live hanya jika **tidak ada temuan Critical/High yang terbuka**

---
# Dukungan yang Dibutuhkan dari IT Danamon
1. **SMTP / relay** untuk pengirim DCU@danamon.co.id, termasuk SPF, DKIM, dan DMARC yang selaras
2. **Allow-list email** di filter email Danamon, Adira, dan Home Credit
3. **Penilaian vendor & cloud** (Supabase, Cloudflare) sesuai kebijakan bank
4. **Domain resmi** (mis. subdomain DCU) dan pengaturan DNS
5. **Review keamanan / penetration test** independen sebelum go-live
6. Kesepakatan **kriteria go-live** dan kontak eskalasi insiden

---
# Langkah Selanjutnya
- **Sekarang**: UAT di staging oleh pengguna dan admin, uji di perangkat nyata
- **Fase 5**: deployment produksi (paket berbayar, backup, domain resmi, SMTP)
- **Fase 6**: serah terima — panduan operasional, admin, dan prosedur insiden
- Gate go-live: hasil uji lengkap, tidak ada temuan Critical/High, persetujuan IT Danamon & Product Owner

---
# Terima Kasih
Diskusi & tanya jawab
Kontak: DCU@danamon.co.id
