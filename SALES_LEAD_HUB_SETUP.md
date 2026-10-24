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
3. Salin maklumat yang dipaparkan sekali sahaja dan berikan secara selamat kepada staf.
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
