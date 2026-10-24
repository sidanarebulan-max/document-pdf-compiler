# FARIS LEAD HUB — Setup & Operating Guide

Website: https://document-pdf-compiler.vercel.app/staff.html
Repository: sidanarebulan-max/document-pdf-compiler
Supabase project: FarisProton (qagsczjxzshjxmmxvkbq)

## Apa yang sudah dipasang
- Portal staf berasingan daripada Document PDF Compiler, VSO dan COP Rebate.
- Login/pendaftaran e-mel menggunakan Supabase Auth.
- RLS: admin sahaja boleh import dan melihat semua lead; staf hanya melihat lead yang diagihkan/dia ambil.
- Import manual / tampal nombor / Excel / CSV. Normalisasi nombor Malaysia dan buang duplikasi.
- Tuntutan lead satu demi satu secara atomik (FOR UPDATE SKIP LOCKED).
- Mesej WhatsApp siap isian; pautan wa.me membuka WhatsApp yang dipilih oleh telefon/browser, **tidak menghantar mesej automatik**.
- Status lead dan tarikh susulan dikemas kini oleh staf. Menekan pautan WhatsApp hanya merekod masa ia dibuka, **bukan** bukti mesej dihantar.
- Panel admin: lulus staf berdaftar dan tugaskan semula lead.

## Setup pertama: wajib ada seorang admin
Pada masa pemasangan awal, project Supabase belum ada pengguna Auth, maka tiada akaun admin yang boleh mengimport nombor.

1. Buka halaman /staff.html, klik Daftar dan daftar dengan e-mel admin (atau cipta pengguna di Supabase Dashboard > Authentication > Users).
2. Sahkan e-mel jika diperlukan. Jangan anggap akaun baharu automatik admin.
3. Dari Supabase SQL Editor pada project FarisProton, **gantikan** EMEL_ADMIN_SEBENAR, lalu jalankan:

```sql
insert into public.sales_staff_profiles (user_id,display_name,role,is_active)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(email,'@',1)),
       'admin', true
from auth.users
where lower(email)=lower('EMEL_ADMIN_SEBENAR')
on conflict(user_id) do update
set role='admin',is_active=true;
```

4. Log masuk semula. Selepas itu admin boleh menggunakan borang `Luluskan akaun staf` untuk staf yang sudah mendaftar.
5. Admin perlu sahkan kebenaran menghubungi pelanggan sebelum mengimport data.

## Cara staf guna
1. Log masuk menggunakan e-mel dan kata laluan sendiri.
2. Klik Ambil lead seterusnya. Hanya lead belum diambil akan diagihkan; perlu selesaikan status lead yang masih `Sudah diambil` sebelum mengambil yang baharu.
3. Pada kad pelanggan, pilih jenis mesej (Pengenalan, Follow-up atau Harga/Loan) di bahagian penapis.
4. Klik Buka WhatsApp. Telefon biasanya akan membukanya dalam WhatsApp yang dipasang; jika ada WhatsApp biasa dan Business, pilihan aplikasi bergantung pada tetapan telefon.
5. Hantar mesej secara manual, kemudian pilih status Dihubungi/Berminat/Follow-up/Booking dan tekan Simpan status.

## Keselamatan
- Jangan sekali-kali masukkan service_role atau secret key Supabase ke fail JS, CSS atau HTML awam.
- RLS melindungi nombor pelanggan. Staff dihadkan kepada lead assigned; ia tidak melihat keseluruhan pool.
- Pengesahan nombor boleh dihubungi ialah tanggungjawab admin; jangan import nombor diperoleh tanpa kebenaran/kepentingan sah.
- Tiada hubungan automatik yang mengesahkan WhatsApp `sent` melalui pautan `wa.me`; semua metrik penghantaran mesti diisi staf.
- Sekiranya perlu audit penuh atau penghantaran automatik, gunakan integrasi WhatsApp Business Platform yang dibenarkan.

## Semakan teknikal
- Supabase: `sales_staff_profiles`, `sales_leads` + RLS + RPC `sales_claim_next_lead`, `sales_manage_staff`, `sales_assign_lead`.
- Fail UI: `staff.html`, `staff.css`, `staff.js`. Halaman utama `index.html` dipautkan ke /staff.html.
- Selepas perubahan di GitHub main, Vercel akan deploy semula.
