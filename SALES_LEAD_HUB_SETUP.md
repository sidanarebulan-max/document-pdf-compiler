# FARIS LEAD HUB — Panduan ID Staf & Passcode

## Sejarah claim / agihan pasukan (26 Oktober 2026)

- Tab **Sejarah** staf memaparkan rekod claim dan agihan semua staf, termasuk apabila akaun sendiri mempunyai 0 lead. Nama pelanggan, nombor, model, nama serta ID staf penerima dipaparkan secara baca sahaja. Nama/ID staf juga boleh dicari.
- **Belum PM / Dah PM** dan tindakan simpan/buka WhatsApp kekal mengikut pemilik tugasan. Nota peribadi dan aktiviti PM staf lain tidak dikongsi melalui sejarah pasukan.
- `lead_hub_assignment_history` menyimpan snapshot nama/ID staf; trigger `lead_hub_assignment_audit` meliputi tambah lead, agihan website, claim atomik dan Telegram. Sejarah lama kekal selepas pertukaran/pembatalan agihan. Rekod asal lead yang dipadam masih mengikut dasar cascade sedia ada.
- Agihan sedia ada dimasukkan sebagai `legacy_assignment` dengan masa claim tidak diketahui. Jangan gunakan `updated_at` sebagai masa claim lama.
- Skema sumber: `supabase/assignment-history.sql`. RLS aktif, tiada akses terus anon/authenticated; Edge Function `lead-hub` mengesahkan sesi sebelum mengembalikan sejarah pasukan.
- Pengesahan: 5 ujian `node --test tests/staff-history.test.cjs` lulus. Ujian trigger insert → claim → tukar pemilik → status → nyahagih lulus dalam transaksi rollback. Permintaan HTTP `list` sebenar sebagai SAZ0001 mengembalikan 0 tugasan sendiri + sejarah Ridwhan/AIMAN01 tanpa nota peribadi. Sesi pengesahan sementara sudah dibuang.
- Skrip paparan telefon/desktop: `node tests/staff-history.browser.cjs` (memerlukan Playwright + Chromium). Ujian pelayar belum dijalankan kerana muat turun Chromium gagal; jangan wakilkan ia sebagai ujian telefon sebenar yang lulus.

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

## Telegram: arahan ringkas & pengumpulan banyak fail (26 Oktober 2026)
- Satu kes pelanggan dimulakan dengan `/pelanggan NAMA` dan diberikan ID kes kekal dalam `lead_hub_telegram_cases`.
- Pilih peminjam `/peminjam`, penjamin `/penjamin`, atau rebate `/rebate`. Menukar bahagian mengosongkan kategori supaya staf perlu memilih kategori seterusnya.
- Pilih kategori sekali melalui `/ic`, `/bank`, `/gaji`, `/lesen`, `/sijil`, `/kerja`, `/vso`, `/lain`. Kategori pilihan akan kekal sehingga pengguna memilih kategori lain; semua PDF/JPG/PNG yang dihantar berturut-turut akan dikaitkan dengan ID kes sama.
- **Penting:** `/vso` kini bermaksud *kumpul fail VSO*; `/buatvso` bermaksud *jana VSO DRAF melalui 9 soalan*. `/vso buat` juga diterima untuk jana DRAF.
- `/sijil` secara automatik menandakan subjenis `SIJIL_LAHIR` atau `SIJIL_NIKAH` jika nama fail/caption mengandungi jenis sijil, selebihnya `SIJIL` umum. `/ic` dalam bahagian REBATE menggunakan `IC_FRONT` / `IC_BACK` jika nama fail jelas, selainnya `IC`. Ini tidak bermakna kandungan fail disahkan betul; staf perlu semak sebelum menyerah dokumen.
- Jika kategori dipilih secara jelas, sistem menggunakan pilihan staf tanpa panggilan AI; ini mengurangkan kos/risiko dan membolehkan banyak fail dikumpul dengan cepat. Jika kategori **tidak** dipilih, fallback AI/filename masih digunakan dan fail yang tidak pasti wajib disahkan menggunakan `/kategori NO KATEGORI` sebelum `/siap`.
- Susunan akhir HIRER→GUARANTOR→REBATE, dalam setiap bahagian ikut urutan kategori. Dalam kategori sama, fail disusun berdasarkan ID mesej Telegram. Sistem menyekat mesej Telegram pendua bagi kes yang sama.
- Had dikemas kini kepada maksimum 50 fail/kes (setiap fail maksimum 18 MB, PDF gabungan maksimum 100 halaman dan 45 MB). Had ini mengelakkan beban berlebihan; fail yang lebih besar perlu guna PDF Compiler di website.
- Bot memberi notis ringkas dan kemas (✅ diterima, 📌 kategori aktif, 📎 jumlah fail kategori/kes, ⚠️ perlu semak, 📋 senarai, ✅ PDF selesai).
- Menu slash command Telegram boleh disegerakkan oleh admin dalam web melalui `✈ Telegram Bot > ↻ Kemaskini Menu Bot`. Arahan Telegram yang didaftarkan termasuk /pelanggan, /ic, /bank, /gaji, /lesen, /sijil, /kerja, /vso, /lain, /senarai, /siap, /buatvso dan lain-lain.
- Ujian live masih perlu dilakukan menggunakan Telegram yang telah dipaut, dengan dokumen contoh/tanpa PII.

## Pengesahan ChatGPT CLI berbanding OpenAI API Telegram (26 Oktober 2026)

- `Codex CLI` pada komputer boleh log masuk menggunakan akaun ChatGPT. Cara Windows: `npm install -g @openai/codex`, kemudian `codex`, pilih `Sign in with ChatGPT`. Ini guna kelayakan penggunaan Codex/ChatGPT yang disokong. Ia **tidak** memberikan API key/kuota ChatGPT secara automatik kepada bot Telegram yang dihoskan pada Supabase.
- FARIS Telegram menggunakan `OpenAI API Key` tersulit dalam panel admin. Penggunaan ini ditolak daripada baki prabayar OpenAI API untuk organisasi/projek pemilik key, **berasingan daripada langganan ChatGPT dan kredit Codex**. Admin boleh melihat baki di `https://platform.openai.com/settings/organization/billing/overview` dan menyemak tetapan auto-recharge. Baki mungkin lewat dikemas kini; jangan anggap ia had kos keras masa nyata.
- `Sign in with ChatGPT` untuk membawa kuota pelan ke aplikasi lain memang wujud bagi integrasi yang layak. Untuk aplikasi FARIS yang dihoskan secara dalam talian, akses komersial/peribadi memerlukan kelayakan atau kelulusan integrasi OpenAI. Rujukan: `https://developers.openai.com/siwc/quickstart`, `https://developers.openai.com/siwc/request-client-id`.
- Jangan cuba menyalin token sesi CLI, cookies ChatGPT, fail auth Codex, atau refresh token dari komputer ke browser/Supabase. Jangan tambahkan butang 'Connected ChatGPT' sebelum OAuth rasmi diluluskan dan diuji.
- Panel `Telegram Bot > AI Scan` telah dikemas kini untuk membezakan laluan **OpenAI API Prabayar Telegram** dan **Codex CLI ChatGPT (lokal sahaja)**, dengan pautan rasmi dan arahan ringkas.

## FARIS Telegram Conversational AI — Tanpa Slash (26 Oktober 2026)

**Matlamat:** Staf boleh bercakap dengan bot menggunakan ayat biasa dalam Bahasa Melayu. Arahan asal yang bermula `/` kekal sebagai cara alternatif.

- Ayat tindakan lazim diproses oleh `natural.mjs` (tanpa kos model): `buka folder nama Haris`, `ini IC`, `aku nak masuk slip gaji`, `berapa fail dah masuk?`, `senarai`, `siapkan PDF`, `ada no baru?`, `ambil nombor baru`, `buat VSO`, `guna mesej harga` dan sebagainya.
- Pertanyaan terbuka menggunakan **DeepSeek Flash (non-thinking mode)** jika DeepSeek API key disambungkan; menggunakan OpenAI API sebagai sandaran jika ia juga dikonfigurasi. **Codex Worker Luna masih bertugas untuk mengimbas/mengelaskankan kandungan dokumen**, bukan menjana perbualan Telegram masa nyata melalui PC. Jawapan AI dibatasi kepada maklumat kes aktif, konteks kerja, dan peranan akaun. Jangan mereka harga kereta, pelanggan atau status penghantaran.
- Sejarah ringkas sehingga 4 mesej disimpan secara peribadi dalam `lead_hub_telegram_chat_memory` (RLS; akses server sahaja) dan dianggap luput selepas 24 jam. Sebelum dihantar ke penyedia AI, corak nombor telefon dan IC ditapis secara asas. Jangan hantar data kewangan atau IC penuh sebagai teks sembang jika tidak perlu.
- Tindakan daripada AI dihadkan kepada menu/bantuan, status kes, senarai, lead yang ditugaskan, pilih kategori dan bahagian, atau mulakan panduan VSO. AI **tidak** boleh memadam fail, menghantar WhatsApp atau mendaftarkan nombor sendiri.
- Permintaan seperti `no 1 sampai tiga buang` membuat senarai fail ikut nombor pada `senarai` dan **meminta pengesahan khusus**: `ya buang` dalam 3 minit, atau `batal buang`. Baris file yang dipilih ditetapkan melalui UUID, bukan meneka nombor selepas perubahan senarai. Padam seluruh kes juga perlu disahkan, termasuk arahan lama `/padam`.
- Semasa wizard VSO aktif, jawapan bebas dihantar sebagai jawapan kepada langkah wizard (tidak diubah menjadi arahan lain); `batal vso` membatalkan.
- Keselamatan: akaun Telegram mesti sudah dipaut kepada akaun FARIS yang masih aktif. Sesi lain tidak boleh mengakses kes/lead pekerja lain. Model AI hanya boleh meminta **senarai tindakan selamat yang disemak server**.
- Web `/staff.html` bahagian Telegram mengandungi contoh ayat bebas. Untuk menguji: tulis `menu`, `status`, `no 1 sampai tiga buang` pada kes ujian, kemudian `batal buang`. Jangan uji padam menggunakan dokumen pelanggan sebenar.
- Pengujian dilakukan pada penghala bahasa (unit tests) dan penerbitan Edge Function. Ujian mesej sebenar dalam Telegram dan capaian DeepSeek perlu dibuat selepas penerbitan menggunakan kes dummy; tidak ada mesej ujian dihantar secara automatik bagi mengelakkan gangguan kepada chat sebenar.

## AI Router V4: Codex Utama + DeepSeek Fallback + Konteks Berkongsi (26 Oktober 2026)

### Laluan fungsi
1. **Arahan mudah** seperti "siapkan baki nya jadi satu file", "fail 1 IC", "no 1 sampai 3 buang", "senarai" dan "ambil nombor baru" diproses secara deterministik. Kos model sifar dan operasi sebenar tetap menggunakan akses akaun FARIS yang disahkan.
2. **Soalan/perbualan bebas** apabila `lead_hub_codex_devices.supports_chat=true` dan heartbeat 90 saat terakhir diterima: masukkan satu tugasan ke `lead_hub_codex_chat_jobs`. Worker V4 PC menggunakan `codex exec --model gpt-6-luna -c model_reasoning_effort="low"`. Hasilnya dihantar melalui `lead-hub-codex` ke chat Telegram.
3. Jika PC tiada/tidak menyokong V4: server mengguna **DeepSeek Flash** untuk perbualan, dengan OpenAI API sebagai sandaran jika key disediakan.
4. Jika Codex CLI gagal / kuota ChatGPT habis, worker memanggil `complete_chat` dengan `failed=true`. Server menggunakan DeepSeek Flash sebagai fallback untuk menyiapkan jawapan. **DeepSeek menggunakan kredit API berasingan**. Kuota Codex akaun ChatGPT **bukan** baki OpenAI API prabayar.

### Memori & kawalan data
- `lead_hub_telegram_chat_memory` menyimpan sejarah perbualan terhad per ID pengguna, dikongsi kepada Codex dan DeepSeek untuk kesinambungan konteks.
- Konteks kes sah dipulangkan daripada pangkalan data sebenar: folder pelanggan, bahagian, kategori aktif, kiraan kategori dokumen dan bilangan fail memerlukan semakan.
- Memori perbualan dibersihkan apabila fail pelanggan baharu dibuka supaya konteks pelanggan A tidak bercampur dengan pelanggan B.
- Pembetulan manual /kategori dicatat dalam `lead_hub_telegram_classification_feedback` sebagai pasangan kategori asal→sah, **tanpa nama dan nombor IC**. Data ini membantu penyemakan dan penambahbaikan terkawal; ia **bukan** latihan automatik model atau perubahan kod tanpa semakan admin.
- Model tidak diberikan kuasa memadam tanpa pengesahan. Arahan buang daripada senarai bernombor meminta 'ya buang'; daftar lead/WhatsApp tertakluk peranan.
- Worker menyekat akses fail luar, menjalankan Codex dalam sandbox read-only dan tidak berkongsi token ChatGPT dengan Supabase. Respons model dianggap teks, bukan perintah sistem.
- Jika worker terhenti semasa mengambil tugasan, sesetengah jawapan mungkin perlu dihantar semula. `lease` chat selama 4 minit; fail lama tidak boleh meniru kemampuan V4 kerana heartbeat melaporkan `supports_chat`.

### Kemas kini PC V3→V4
- ZIP: `FARIS_CHATGPT_CODEX_DEEPSEEK_V4_UPDATE.zip` — Extract All → `AKTIFKAN_FARIS_CHAT_V4.cmd` → restart `04_START_WORKER.cmd` lama.
- Login ChatGPT, pairing dan token Windows **dikekalkan**. Pemasang menyimpan backup `worker.mjs` dan menguji sintaks Node sebelum mengganti.
- Website FARIS → Telegram Bot → Semak Worker akan membezakan `CHAT V4 + DOKUMEN` berbanding `DOKUMEN SAHAJA`.

### Ujian
- Versi Edge Function `lead-hub-codex` v4 dan `lead-hub-telegram` v14 diterbitkan.
- Contoh khusus dari gambar: "siapkan baki nya jadi satu file" → `/siap`; teks menyenaraikan 1,2,3,4 untuk dibuang → senarai fail khusus + permintaan pengesahan; "fail 1 IC" → `/kategori 1 IC`.
- Semakan sebenar Codex Chat V4 pada komputer pengguna masih belum dilaksanakan sehingga pemasang V4 dipasang. Uji dengan kes dummy dahulu.

## Telegram V17 — Bahasa biasa, konteks tindakan, pembelajaran selamat (26 Oktober 2026)

**Masalah sebenar:** pengguna menaip `senarai document yang ada sekarang` selepas memadam dokumen; penghala lama menganggapnya perbualan bebas lalu memberikan jawapan umum dan bukan menyemak database.

**Perubahan yang diterbitkan:**
- `natural.mjs`: padanan makna baca-sahaja (senarai dan status) yang lebih fleksibel, termasuk `document(s)`, `dokumen`, `files`, `fail`, `pdf`, `baki`, `masih ada` dan `sekarang`. Kata kerja senarai/list/tunjuk/papar serta soalan inventori dikendalikan sebelum AI bebas. Arahan padam tidak tersalah masuk laluan ini.
- `lead_hub_telegram_action_context`: memori tindakan sebelumnya mengikut Telegram user, FARIS account, private chat dan tarikh (maksimum 24 jam), membolehkan pertanyaan ringkas seperti `apa yang tinggal?` selepas padam dokumen.
- `lead_hub_telegram_intent_aliases`: hanya cache padanan `list`/`status`/`help` yang diberikan keyakinan AI tinggi (>=0.93). Disimpan sebagai fingerprint SHA-256 bersalut rahsia server, **bukan teks asal**; digunakan semula sebagai tindakan baca-sahaja sahaja, dan tidak pernah meluluskan pemadaman atau penghantaran mesej.
- Setelah penghapusan dokumen disahkan, konteks diberi nilai `delete_files`. Jika `senarai` dipanggil dengan folder kosong, bot menjawab jumlah **0 fail** secara jelas, bukannya mesej bantuan umum. Pembukaan folder baharu mengosongkan konteks tindakan pelanggan lama.
- Pertanyaan biasa terus ditangani oleh penghala deterministik tanpa melibatkan model (respons pantas dan kos rendah). Soalan umum yang tidak jelas masih menggunakan AI tersambung. Kod **tidak** melatih semula model AI secara autonomi; ia meningkatkan kefahaman melalui penambahan pola dan maklum balas terkawal.
- Jadual baharu dilindungi RLS dan hanya service_role boleh baca/tulis. Jangan simpan perbualan mentah atau PII dalam jadual alias.
- Unit tests: 17 variasi termasuk `senarai document yang ada sekarang`, `list semua file sekarang`, `yang tinggal apa` selepas padam, `berapa fail dah masuk`, `no 1 sampai 4 buang`, `ya padam terus`, `siapkan baki ni jadi satu file`: semua lulus.
- Edge function `lead-hub-telegram` v17 diterbitkan dan ACTIVE. Ujian chat Telegram sebenar belum dilaksanakan melalui tool ini; guna kes dummy untuk pengesahan. Tiada dokumen pelanggan dipadam semasa ujian.

## Telegram AI Understanding V18 (kod GitHub — penerbitan belum disahkan)

Tujuan: sentiasa cuba memahami arahan dalam bahasa Melayu santai, bahasa campur, ejaan pelik, soalan umum, sambil mengelakkan salah pelaksanaan.

- `natural.mjs`: laluan deterministik paling cepat dan tanpa kos model. Tambahan membaiki `no 1 smpi tiga buang` supaya tidak disalah baca sebagai hanya fail #1. Kes ambigu meminta penjelasan.
- `intent-policy.mjs`: penapis hasil AI. Hanya `help`, `list`, `status`, `lead_new` dibenarkan pada keyakinan >=0.75. Perubahan kategori, bahagian, VSO dan ambil lead memerlukan keyakinan >=0.94 + senarai nilai yang sah. `merge_request`, `delete_request`, `send_message`, `register_lead` **tidak** dilaksanakan berdasarkan arahan model; bot minta arahan jelas/pengesahan daripada pengguna.
- `index.ts`: bila parser tidak kenal ayat, AI kecil DeepSeek Flash (atau OpenAI API, jika disambung) mentafsir niat dengan respons JSON; hanya selepas penapis keselamatan, ia mencetuskan fungsi FARIS yang sudah mempunyai semakan akses. Jika ia hanya soalan bebas, Codex V4 yang online menjawab; kalau offline/sibuk, jawapan DeepSeek digunakan. Bererti sedikit kredit DeepSeek mungkin digunakan walaupun Codex online kerana ia merupakan laluan pentafsiran awal.
- Model tidak belajar semula secara automatik. `lead_hub_telegram_intent_aliases` menyimpan cap jari pola baca-sahaja yang difahami AI pada confidence >=0.93. Admin boleh memberi pola yang telah disahkan melalui `ajar bot: ayat susah = senarai`, atau `= status` / `= bantuan`. Tiada teks asal disimpan dalam jadual alias. Permintaan padam, akses lead dan status pelanggan tidak boleh dilatih menerusi arahan ini.
- Memori perbualan per pengguna mengikut keizinan akaun; data pangkalan data tetap sumber kebenaran untuk senarai dokumen, dan tidak diganti dengan jawapan imaginasi model.
- DeepSeek Flash model ID `deepseek-flash` merujuk kepada API model rasmi (semak dokumentasi DeepSeek).
- Unit tests `intent-policy.mjs`: 13/13 lulus; regresi variasi `smpi` / `siapkn`: 8/8 lulus.

**Status:** fail di GitHub sudah dikemas kini, tetapi percubaan menerbitkan Edge Function ke Supabase terhalang oleh pemeriksaan keselamatan alat. Semakan `get_edge_function` masih memaparkan versi **v17** tanpa `intent-policy.mjs`. Oleh itu ciri V18 belum tersedia pada Telegram live sehingga deploy yang dibenarkan diselesaikan. Jangan wakilkan ia sudah live.

## Telegram Single Case Card — senyapkan spam apabila banyak fail dihantar (26 Oktober 2026)

**Punca:** `handleDoc` menghantar satu mesej "✅ DOKUMEN DITERIMA" untuk **setiap fail**, dan `lead-hub-codex` menghantar lagi satu "🤖 CHATGPT CODEX — SEMAKAN SIAP" bagi setiap keputusan AI. Apabila staf menghantar 20 fail, chat menerima puluhan balasan bot.

**Pembaikan aktif pada server:**
- `lead-hub-telegram` v18 dan `lead-hub-codex` v5 menggunakan modul `case-card.mjs` yang sama. Untuk setiap kes pelanggan, mesej status Telegram pertama dihantar **sekali**, kemudian bot memanggil `editMessageText` pada `message_id` yang sama apabila fail diterima/diproses/ditukar kategori/dibuang. Bot tidak menghantar mesej ACK individu untuk fail yang berjaya.
- Kad memaparkan nama pelanggan, ID kes, jumlah fail, bilangan ✅ siap/⏳ menunggu AI/⚠️ perlu semak, bilangan mengikut kategori, serta senarai bernombor dengan nama fail. Panjang dijaga di bawah Telegram 4096 aksara; paparan senarai ringkas akan menunjukkan baki item jika terlalu panjang. Semak penuh dengan mesej `senarai`.
- PostgreSQL `lead_hub_telegram_case_cards` menyimpan `message_id` tunggal per `case_id`, revision, synced revision dan lease; fungsi atomik `lead_hub_case_card_touch/claim/finish` mengelakkan penghantaran kad berganda oleh beberapa webhook yang berlumba.
- Fungsi `EdgeRuntime.waitUntil` membolehkan penggabungan update hampir serentak (1.7 saat) dan proses edit tanpa menunggu webhook memproses semua fail secara berurutan. Gagal mengedit: status dibiarkan `dirty` dan boleh cuba semula selepas kemas kini seterusnya. Jika kad asal dipadam atau tidak lagi boleh diedit oleh Telegram, bot akan mencipta satu kad pengganti.
- Setiap keputusan Codex menukar status item ⏳ kepada ✅/⚠️ di kad yang sama. Notifikasi per-fail Codex telah dihentikan. Pembetulan kategori dan pemadaman fail separa juga mengemas kini kad.
- Perintah eksplisit `senarai`, `status`, hasil PDF `siap` dan mesej ralat kritikal masih dibalas secara berasingan apabila diminta kerana pengguna perlu menerima hasil tindakan; fail asal yang dihantar oleh staf kekal kelihatan seperti biasa dalam Telegram.
- Tiada mesej lama dipadam, tiada fail pelanggan diubah semasa pembangunan. Kes lama yang masih aktif akan menerima kad tunggal baharu pada **muat naik fail selepas penerbitan**.
- Ujian modul: 50 fail → 3605 aksara (bawah 3900), status ✅/⏳/⚠️ betul, kad terhad pada satu ID kes. Ujian RPC PostgreSQL `touch → claim → finish` lulus dalam transaksi yang di-rollback, tanpa data ujian tertinggal. Kedua-dua Edge Functions dilaporkan ACTIVE dan telah disemak mengandungi mod kemas kini kad.
- Ujian penghantaran fail baharu dalam Telegram pengguna belum dibuat; gunakan fail dummy dan semak hanya satu kad status dihantar serta dikemas kini selepas keputusan AI.

## Telegram Customer Menu — New / Resume (26 October 2026)

**Active** on Supabase Edge Function `lead-hub-telegram` v25.

**Access:** Staff sends `/start` or `/menu` (typing `menu` also works). Once linked, the bot returns inline buttons **🆕 New Customer** and **📂 Resume Customer**. Buttons use `callback_query` which is already enabled in the current webhook.

- **New:** starts existing guided new-customer-name input. Old active case and its files remain. After name entry, the new case is selected in `lead_hub_telegram_dialog.active_case_id`. Bot also offers Resume and Menu buttons after creation.
- **Resume:** lists up to seven `state=collecting` customer cases per page, newest first, each with existing file count. Previous/Next pagination is supported without adding a separate bot message on each click.
- **Select existing case:** uses exact UUID callback with strict Telegram user-to-FARIS account linking, `account_id`, `chat_id`, and `state=collecting` checks. Sets focus and clears previous conversational memory so customer cases do not leak context between customers.
- **Navigation safety:** menu navigation cancels an unfinished name prompt; text `resume` is handled *before* trying to interpret it as the new customer's name. The existing deletion confirmation flow remains unchanged.
- **Limitations:** only unfinished `collecting` cases appear; completed case records are not silently reopened. Telegram cannot automatically render a menu just from opening the app without user interaction—use `/start` or `menu`.
- `navigation.mjs` contains pure button formatting/parsing; tests covered 12 validation scenarios and the final deployed Edge Function includes module and account-scoping checks. No live Telegram clicks or customer data were modified during verification.

If the native Telegram slash-command list still shows older actions, an admin can use **Telegram Bot → Kemas Kini Menu Bot** to sync the `/new`, `/resume`, and `/menu` shortcuts.

## Telegram v26 — PDF Separa, arahan natural dan pengesahan (26 Okt 2026)

**Punca masalah gambar:** Bot memahami `siapkan pdf` tetapi penggabungan 7 fail gagal kerana 3 slip gaji PDF mempunyai sekatan atau kata laluan. Mesej `okay susun file yang boleh sahaja` tidak diberikan laluan khas, menyebabkan bot mengulangi proses gabung semua fail atau memberikan nasihat umum. Satu kes juga mempunyai nama pelanggan yang sebenarnya ayat soalan kerana aliran nama baharu terlalu longgar.

**Pembaikan aktif (Edge `lead-hub-telegram` v26):**
- Laluan jelas untuk `susun file yang boleh sahaja`, `gabung tanpa PDF berkunci`, `skip file yang rosak dan buat PDF`. Parser ringkas dalam `pdf-intents.mjs` berfungsi ketika AI offline / DeepSeek kredit tidak cukup.
- Arahan `buang dulu kata laluan` kini memberi penerangan tepat: PDF berkunci perlukan akses/kata laluan yang sah; bot tidak boleh menghapus perlindungan tanpa kredensial. Pengguna disaran membuka/mengeksport semula dengan perisian dan kelulusan yang sesuai. **Jangan hantar kata laluan melalui Telegram**.
- Untuk PDF separa, bot memeriksa semua fail dan memaparkan jumlah fail yang boleh dibaca serta yang dikecualikan, kemudian butang **Teruskan PDF separa** / **Batal**. Tanpa pengesahan tersebut, tiada PDF separa dihantar.
- Pengesahan disimpan di `lead_hub_telegram_partial_merges` dengan RLS, skop `telegram_user_id`, `account_id`, `chat_id`, `case_id`, tag rawak, masa luput 10 minit dan ID semua fail (snapshot). Klik berulang diproses sekali melalui `state` atomik. Pemprosesan memeriksa semula keanggotaan fail dan senarai gagal sebelum menghantar PDF.
- PDF separa dinamakan `_DOKUMEN_SEPARA.pdf` dengan **amaran tidak lengkap** dalam kapsyen. Dokumen asal **tidak dibuang**, dan `lead_hub_telegram_cases.state` kekal `collecting` (tidak ditandakan siap).
- Arahan `/siap` untuk PDF lengkap masih memerlukan semua fail dibaca dan sekarang menawarkan butang **Susun fail yang boleh** apabila berdepan fail gagal. Penutup kategori (cover) tidak disisip untuk dokumen yang gagal disertakan.
- Aliran New Customer kini mengesahkan input menyerupai nama sebenar, bukan soalan/perintah. Ini mencegah pendaftaran baharu menggunakan ayat perbualan sebagai nama; rekod lama yang tersalah nama **tidak diubah automatik**.

**Pengesahan:** Edge Function v26 ACTIVE dan mengandungi modul `pdf-intents.mjs`. SQL menyemak jadual partial merge RLS aktif, tiada permintaan separa sintetik ditinggalkan, serta kes ujian asal masih mempunyai 7 fail dan status collecting. Ujian parser beberapa ayat pengguna lulus. Belum dilakukan ujian sebenar dengan muat naik PDF terkunci dan klik dalam Telegram; cuba pada kes dummy atau kes yang dibenarkan dan semak output sebelum urusan rasmi.

## Telegram v28 — navigasi ikut halaman dan WhatsApp (26 Oktober 2026)

**Menu utama:** dua butang sebaris **📁 Dokumen** dan **📲 WhatsApp**. Bahagian Dokumen membuka submenu New Customer / Resume Customer, bersama pilihan Peminjam, Add Guarantor dan Cop Rebate untuk kes yang aktif. Halaman WhatsApp menunjukkan **➕ Tambah No Baru** dan **📇 No Tersedia** bersebelahan, dengan butang kembali ke Menu Utama.

**Tambah No Baru:** borang Telegram berperingkat: (1) nama, (2) no. telefon bimbit Malaysia, (3) model kereta (boleh langkau), (4) pengesahan pelanggan telah mengizinkan nombornya digunakan untuk urusan jualan. Data hanya ditulis ke `lead_hub_leads` selepas staf membalas `YA` pada pengesahan tersebut. Unik pada `phone_e164` dan tidak menimpa lead lama. Staf ditugaskan pada lead yang mereka daftarkan; lead Admin tidak diagih secara automatik. Borang boleh dibatalkan dan luput dalam 20 minit.

**No Tersedia:** senarai tersusun mengikut tarikh, 7 nombor setiap halaman, butang seterusnya / kembali / refresh. Admin melihat lead keseluruhan; staf hanya lead `assigned_id` milik akaun sendiri. Nombor belum diagih tidak dipaparkan kepada staf lain; butang **Ambil No Belum Diagih** menggunakan RPC agihan atomik yang sedia ada. Klik lead yang dibenarkan untuk paparan terperinci serta butang `wa.me` yang membuka WhatsApp telefon dengan teks daripada templat intro/follow/price FARIS. Mengklik tidak bermaksud WhatsApp benar-benar dihantar; status contacted tidak diubah secara automatik.

**Keselamatan & status:** `lead_hub_telegram_wa_drafts` ialah jadual sementara dengan RLS aktif dan hanya service role boleh akses; pergerakan keluar halaman membatalkan draf agar nama/nombor tidak bocor masuk ke borang kes dokumen. Fungsi `lead-hub-telegram` v28 ACTIVE. 19 ujian logik kod lulus dan fungsi live disemak. Belum ada ujian hujung-ke-hujung menggunakan klik butang sebenar dalam Telegram. Tiada lead pelanggan ditulis/WhatsApp dihantar semasa pembangunan.
