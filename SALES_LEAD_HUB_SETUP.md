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
