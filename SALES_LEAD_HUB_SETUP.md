# FARIS LEAD HUB — Panduan ID Staf & Passcode

Website: https://document-pdf-compiler.vercel.app/staff.html
Repo: sidanarebulan-max/document-pdf-compiler
Backend: Supabase project FarisProton / Edge Function `lead-hub`

## Kaedah login
- **Tidak perlu e-mel dan kata laluan.** Staf gunakan ID + passcode yang admin cipta.
- Admin boleh memilih ID dan passcode sendiri atau biar sistem jana automatik. Passcode pilihan sekurang-kurangnya 10 aksara (gabungan huruf dan nombor).
- Passcode dijana sekali dan dipaparkan sekali sahaja; yang disimpan pada server ialah PBKDF2-SHA256 salted hash.
- Sesi disimpan di telefon sehingga 30 hari atau sehingga akaun dinyahaktif / passcode direset / staf logout.
- Tiada pautan Auth confirmation e-mel atau redirect ke localhost:3000.
- Admin awal telah disediakan secara tertutup pada pangkalan data; **jangan simpan passcode Admin dalam repo**.

## Cara admin menggunakan portal
1. Pergi ke /staff.html dan masuk guna ID admin + passcode pemilik.
2. Bahagian `Cipta ID & Passcode`: letak nama staf, pilihan ID/passcode (boleh dikosongkan untuk auto), klik Cipta.
3. Salin maklumat yang dipaparkan sekali sahaja dan berikan secara selamat kepada staf. Selepas login kali pertama, gunakan `Tukar passcode admin` untuk menggantikan passcode asal.
4. Import senarai pelanggan (Excel, CSV atau tampal), atau tambah manual.
5. Sahkan data nombor boleh dihubungi secara sah. Agihkan lead secara manual atau biarkan staf tekan `Ambil nombor`.
6. Dalam `Pengurusan staf`, nyahaktif akaun atau reset passcode jika perlu.

## Aliran staf
1. Buka website di telefon. Masukkan ID & passcode **sekali**.
2. Klik `Ambil nombor` dan pilih skrip pelanggan.
3. Klik `Buka WhatsApp`. Android membuka WhatsApp yang tersedia atau meminta pemilihan jika lebih daripada satu.
4. Semak dan tekan **Send** dalam aplikasi WhatsApp.
5. Kembali ke website; ubah status pelanggan dan tekan `Simpan status`.
6. Klik `Ambil nombor` untuk mengambil pelanggan seterusnya.

## Keselamatan
- Edge Function `lead-hub` mengesahkan token sesi tersuai di server; tiada service-role/secret key di browser.
- Ketiga-tiga jadual `lead_hub_*` mengaktifkan RLS; akses terus oleh anon/authenticated tidak dibenarkan.
- Sesi token raw tidak disimpan dalam jadual (hanya SHA-256 hash), dan passcode disimpan dengan PBKDF2 salted hash.
- Selepas 5 percubaan salah, ID dikunci 15 minit.
- Hanya admin boleh lihat semua lead / cipta staf. Staf hanya boleh lihat lead yang ditugaskan kepada mereka.
- Menekan pautan WhatsApp bukan bukti mesej berjaya dihantar. Status penghantaran diisi manual.
- WhatsApp direct menggunakan `https://wa.me/<nombor>?text=...`; ia **tidak menghantar mesej secara automatik**.
- Jangan dedahkan fail import lead kepada umum; data pelanggan sebenar hendaklah diproses dengan izin dan kawalan akses.

## Komponen
- `staff.html` — UI ID+passcode + Dashboard.
- `staff-passcode.js` — aplikasi browser.
- `staff.css` — CSS mudah alih.
- `index.html` — pautan ke staff.html, **fungsi PDF/VSO sedia ada tidak diubah**.
- `lead_hub_accounts`, `lead_hub_sessions`, `lead_hub_leads`, RPC `lead_hub_claim_next`.
- Supabase Edge Function dipasang melalui Supabase MCP. Untuk kekalkan versi kod, semak source Edge Function sebelum ubah.

## Nota migrasi
Modul awal `staff.js` dan jadual `sales_*` menggunakan Supabase Auth e-mel. Modul itu tidak dipanggil oleh halaman portal baharu. Jangan alihkan data pelanggan tanpa rancangan migrasi kerana ID lama (auth.users) berbeza dengan ID passcode (lead_hub_accounts).

## Integrasi Urus Dokumen & Buat VSO (2026-10-24)
- Staf log masuk sekali pada `/staff.html` menggunakan ID + passcode.
- Di setiap kad pelanggan, butang **Urus Dokumen** dan **Buat VSO** membuka `/` dengan workspace yang sesuai. Tidak perlu salin nama/nombor.
- Nama dan nombor dipindahkan melalui `sessionStorage` tab semasa, bukan query URL. Data handoff dipadam sebaik digunakan, dan tamat selepas 10 minit.
- Butang **Document Compiler** dan **VSO Generator** di kawasan Ruang Kerja Staf boleh dibuka juga tanpa pelanggan yang dipilih.
- Di laman utama, `staff-handoff.js` mengisi `customerName`, `customerPhone`, `vsoCustomer` dan `vsoPhone`; ada pautan kembali ke Lead Hub.
- Jumlah pinjaman dan warna dalam contoh VSO dikosongkan semasa handoff supaya tidak tersalah guna. Staf mesti lengkapkan IC, alamat, tahun, warna, varian dan nilai pinjaman sebenar.
- Auto-pilih varian hanya apabila nama model menyebut varian tepat yang memang sudah ada dalam VSO_VARIANTS. Jika generik/unsupported (e.MAS 5 tanpa varian, e.MAS 7 EV tanpa varian, Saga dan lain-lain), butang jana VSO dikunci sehingga staf memilih varian; jangan gunakan harga model salah.
- Butang **Hantar ke Compiler** dalam VSO sedia ada kekal digunakan untuk gabung VSO dengan dokumen Hirer / Guarantor / COP Rebate.
- Buat masa ini nama Sales Advisor pada template VSO asal masih bergantung pada template tersedia; **semak nama penasihat jualan sebelum gunakan VSO sebagai dokumen rasmi**.

## Tetapan Mesej WhatsApp (2026-10-26)
- Pada halaman `/staff.html`, selepas login klik `⚙ Tetapan Mesej` pada bahagian atas.
- Pilih Mesej Pengenalan, Follow-up atau Harga/Pinjaman. Edit mesej, lihat pratonton, tekan `Simpan Mesej`.
- Teks menyokong pemboleh ubah `{nama}`, `{staff}`, `{model}`, `{telefon}`. Nilai sebenar diisi apabila pengguna tekan butang WhatsApp untuk sesuatu lead; mesej masih perlu dihantar secara manual oleh staf.
- **Admin:** pilihan `Semua staf` menetapkan mesej rasmi untuk seluruh pasukan. Pilihan `Mesej akaun saya` membuat skrip peribadi admin.
- **Staf:** menyunting `Mesej akaun saya` sahaja. Jika skrip peribadi tiada, skrip rasmi admin digunakan; jika tiada juga, skrip asal sistem.
- `Guna Skrip Asal` membuang override skop semasa dan kembali kepada fallback yang berkenaan.
- Staf tekan `↻ Refresh Nombor` untuk mendapatkan suntingan mesej rasmi terbaru tanpa log keluar.
- Mesej disimpan di `lead_hub_message_templates`. Akses langsung `anon`/ `authenticated` dilarang dan RLS diaktifkan. Edge Function `lead-hub` semak token sesi dan peranan pengguna sebelum baca/simpan/reset.
- Tiada penghantaran mesej secara automatik; penggunaan pautan `wa.me` hanya membuka aplikasi WhatsApp dan pra-isi teks.

## Tetapan ID & Passcode Admin Sendiri (2026-10-26)
- Masuk menggunakan akaun admin dalam `/staff.html` kemudian tekan **🔐 ID Admin** di bahagian atas.
- Bahagian `ID & Passcode Admin Saya` membenarkan admin tukar ID login kepada pilihan sendiri (4–20 aksara, bermula huruf, hanya huruf/nombor/sengkang).
- Masukkan passcode semasa sebagai pengesahan wajib. Jika mahu menukar passcode, masukkan passcode baharu (10–32 aksara, kombinasi huruf dan nombor). Boleh kosongkan passcode baharu jika hanya mahu ubah ID.
- Tekan `Simpan ID / Passcode Admin`. Paparan ID di dashboard terus dikemas kini. Sesi semasa dikekalkan, sesi admin pada peranti lain dibatalkan. Peranan admin dan semua data pelanggan/staf tidak berubah.
- Semasa login seterusnya gunakan ID/passcode baharu. Jangan kongsi passcode admin dengan staf.
- Akaun staf **sudah** boleh diberikan ID dan passcode tersuai oleh admin dalam kotak `Cipta ID & passcode staf`, dan tidak memerlukan e-mel.
- Endpoint `change_my_credentials` hanya boleh dipanggil oleh admin yang memiliki sesi sah dan membuktikan passcode semasa; perubahan disimpan di `lead_hub_accounts`. Ralat konflik ID akan memulangkan kod 409.

## Integrasi Telegram Bot — 26 Oktober 2026

### Sambung bot kali pertama
1. Buka `https://document-pdf-compiler.vercel.app/staff.html` dan login **Admin**.
2. Klik **✈ Telegram Bot** pada menu atas.
3. Buka `@BotFather` dalam Telegram, taip `/newbot`, tetapkan nama dan username bot.
4. Salin token sekali ke ruang **Bot API Token**, klik **Sambung & Aktifkan Bot**. Token disulitkan di server dan disimpan dalam jadual berkawalan RLS, bukan GitHub.
5. Admin/staf masing-masing klik **Jana Kod Pautan**, kemudian buka pautan `t.me/BotName?start=...`. Kod hanya sekali guna dan tamat selepas 10 minit.
6. Untuk pengelasan AI, admin boleh memasukkan **OpenAI API Key** di panel pilihan. Ini memproses kandungan dokumen pelanggan melalui OpenAI, jadi wajib ada kebenaran/pematuhan privasi. Jika tiada API key, bot tetap mengelaskan mengikut nama fail tetapi menandakan dokumen untuk semakan manual.

### Arahan Telegram
- `/menu` : Bantuan.
- `/pelanggan NAMA PENUH` : Buka kes dokumen bagi nama pelanggan; kini bahagian HIRER.
- `/peminjam`, `/penjamin`, `/rebate` : Pilih bahagian untuk fail seterusnya.
- Kongsi PDF/JPG/PNG daripada WhatsApp ke bot Telegram secara **manual**. Bot tidak membaca WhatsApp pelanggan secara automatik.
- `/senarai` : Lihat klasifikasi semua fail dan nombornya.
- `/kategori 2 IC` : Set kategori fail kedua; kategori mesti antara yang dibenarkan dalam PDF Compiler. Fail berkategori tidak pasti wajib diperiksa supaya susunan tidak salah.
- `/siap` : Gabungkan mengikut HIRER VSO→IC→LESEN→PAYSLIP→BANK→OTHER, kemudian GUARANTOR, kemudian REBATE IC_FRONT→IC_BACK→LESEN→SURAT_KERJA→SIJIL_LAHIR→SIJIL_NIKAH→OTHER, dan hantar PDF akhir ke chat Telegram.
- `/padam` : Padam kes belum siap atau kes terakhir yang lengkap bersama fail storan yang berkaitan.
- `/vso` : Mulakan wizard 9 butiran (nama, IC, telefon, varian, tahun, warna, pinjaman, alamat, markup). Draf PDF VSO dihantar ke Telegram, dan turut dimasukkan ke kes aktif jika nama pelanggan sepadan. Data rujukan VSO sesuai untuk semakan, bukan harga pengedar yang disahkan.
- `/daftar Nama | 0123456789 | Proton e.MAS 5 | YA` : Cipta lead menggunakan nombor Malaysia; `YA` ialah pengesahan kebenaran pelanggan untuk dihubungi. Lead staf dipaut kepada staf; admin dapat melihatnya selepas refresh.
- `/baru` : Hantar 5 lead baharu yang ditugaskan, bersama butang pautan WhatsApp dan mesej siap taip berdasarkan template intro/follow/price sedia ada. Admin boleh melihat semua lead baharu.
- `/ambil` : Staf mengambil satu lead belum diagih melalui RPC atomik sedia ada.
- `/skrip intro`, `/skrip follow`, `/skrip price` : Pilih jenis skrip untuk pautan WhatsApp bot.
- `/batal` : Batal wizard VSO semasa.

### Batasan dan keselamatan
- Token Telegram dan OpenAI disulitkan pada server menggunakan AES-GCM berdasarkan secret server; browser hanya menghantar melalui HTTPS. Jangan log atau dedahkan token sebenar.
- Webhook Telegram menggunakan `secret_token` dengan hash, dan tiap update dideduplikasi melalui `update_id`.
- Staf perlu dipautkan secara eksplisit dan akaun FARIS mesti aktif. Telegram hanya menerima private chat; group chat tidak mendapat akses.
- Dokumen terhad PDF/PNG/JPG maksimum **18 MB/fail**, **15 fail/kes**, dan PDF output maksimum 45 MB / 100 halaman. Guna Document Compiler web untuk format lain atau fail besar.
- Fail disimpan pada bucket Supabase Storage **private**. Padam dengan `/padam` apabila tidak lagi diperlukan. Tiada dasar pemadaman automatik dipasang dalam versi awal.
- VSO dalam chat ialah **DRAF** yang dijana programatik, tidak sama persis dengan templat asal VSO di website. Jangan guna sebagai VSO rasmi sebelum semakan dan pengesahan pengedar.
- Tiada penghantaran WhatsApp secara automatik atau semakan `sent=true`. Pautan WhatsApp hanya pra-isi teks, staf masih perlu tekan **Send**.
- Integrasi belum boleh diuji sepenuhnya sehingga admin memasukkan token BotFather dan staf memautkan akaun. Selepas konfigurasi, jalankan ujian menggunakan fail dummy/tiada data peribadi terlebih dahulu.

## Dwi-AI Telegram: OpenAI API + DeepSeek Flash (26 Oktober 2026)

- Buka `FARIS LEAD HUB > ✈ Telegram Bot > AI Scan — OpenAI + DeepSeek`.
- **OpenAI API / CLI Key:** masukkan API key OpenAI untuk penghantaran imej dan PDF melalui Responses API. OpenAI CLI setempat tidak boleh berjalan secara terus di Supabase Edge Function; sistem web menggunakan API key yang sah, bukan proses CLI.
- **DeepSeek Flash:** masukkan DeepSeek API key yang berasingan. Model `deepseek-flash` melalui `https://api.deepseek.com/chat/completions` menyokong imej JPEG/PNG. Ia bukan pembaca input PDF terus dalam integrasi ini.
- Pilihan routing: `Auto` = imej DeepSeek dahulu, PDF OpenAI; `OpenAI dahulu` = OpenAI untuk PDF dan imej, DeepSeek sandaran imej; `DeepSeek dahulu` = DeepSeek untuk imej, OpenAI untuk PDF.
- `Guna AI kedua sebagai sandaran` boleh dihidupkan/dimatikan. Dalam mod sandaran, hanya imej boleh dihantar ke provider kedua selepas provider utama gagal mengelaskan; PDF terus guna OpenAI jika kuncinya disambungkan. Jika tiada key OpenAI dan dokumen PDF masuk, bot guna klasifikasi nama fail dan wajib semakan manual.
- Key disulitkan server-side menggunakan AES-GCM dan disimpan dalam `lead_hub_telegram_settings`; tidak dipulangkan melalui API status, tidak ditulis dalam GitHub atau JavaScript client. Admin sahaja boleh menambah/memadam key dan menetapkan keutamaan.
- `telegram_status` hanya memulangkan boolean `openai_enabled` / `deepseek_enabled`, model dan pilihan routing; tidak memulangkan credential.
- Kategori `OTHER` atau keyakinan kurang daripada 85% memerlukan semakan staf dengan `/kategori` sebelum `/siap`.
- AI memproses kandungan dokumen pelanggan melalui provider pihak ketiga; dapatkan kebenaran dan pastikan pematuhan privasi. Setiap provider boleh melibatkan kos API yang berasingan.
- Pengujian endpoint dan paparan telah dibuat secara statik; belum ada key AI disimpan setakat penerbitan ini dan imbasan sebenar memerlukan key daripada admin.
