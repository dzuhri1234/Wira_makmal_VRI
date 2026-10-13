# Wira Makmal VRI · versi Cloudflare

Game 3D makmal VRI Ipoh yang boleh dimain ramai-ramai melalui satu link awam (`*.workers.dev`).
Sesiapa yang ada link boleh main, tak perlu akaun Claude.

## Isi folder

| Fail | Fungsi |
|---|---|
| `public/index.html` | Game penuh (sama dengan versi Claude) |
| `public/radio/` | Lagu MP3 untuk stesen Wira FM |
| `src/worker.js` | Server main bersama: bilik WebSocket + papan markah (SQLite) |
| `wrangler.jsonc` | Tetapan Cloudflare (nama link, Durable Object) |
| `package.json` | Senarai alat (wrangler) |

## Deploy guna telefon sahaja (GitHub + Cloudflare)

1. Log masuk https://dash.cloudflare.com → **Workers & Pages** → **Create application**.
2. Di **Import a repository**, tekan **Get started**, sambungkan akaun GitHub dan pilih repo ini.
3. Pastikan nama projek ialah `wira-makmal-vri` (mesti sama dengan `"name"` dalam `wrangler.jsonc`).
4. Tekan **Save and Deploy**. Link `*.workers.dev` keluar bila siap.

Setiap kali repo ini dikemas kini, Cloudflare deploy semula secara automatik.

## Deploy guna komputer (lebih kurang 10 minit)

1. Pasang **Node.js** versi LTS dari https://nodejs.org (tekan Next sampai habis).
2. Daftar akaun **Cloudflare** percuma di https://dash.cloudflare.com kalau belum ada.
3. Extract zip ini. Buka terminal dalam folder `wira-makmal-vri-cloudflare`
   (Windows: klik kanan dalam folder → *Open in Terminal*).
4. Jalankan satu per satu:

   ```
   npm install
   npx wrangler login
   npx wrangler deploy
   ```

   - `wrangler login` akan buka pelayar. Log masuk Cloudflare dan tekan **Allow**.
   - Kalau `deploy` minta anda pilih nama subdomain *workers.dev*, taip satu nama (contoh `ayie-vri`).
5. Siap. Terminal akan tunjuk link macam `https://wira-makmal-vri.ayie-vri.workers.dev`.
   Kongsi link itu dengan rakan sekerja.

Nak tukar nama link? Ubah `"name"` dalam `wrangler.jsonc` sebelum `npx wrangler deploy`.

## Cuba di komputer sendiri dulu (pilihan)

```
npx wrangler dev
```

Buka http://localhost:8787 dalam **dua tab**. Setiap tab dikira sebagai seorang pemain.
Kalau nak lihat kedua-dua avatar, beri nama berbeza di *Kedai & avatar → Avatar*.

## Kemas kini game

Ganti `public/index.html` dengan versi baharu, kemudian jalankan `npx wrangler deploy` semula.
Pemain yang sedang main akan terputus sekejap dan game sambung semula sendiri.

## Tambah lagu Wira FM

1. Letak fail MP3 dalam folder `public/radio/` (nama fail huruf kecil, guna sengkang, contoh `lagu-baru.mp3`).
2. Dalam `public/index.html`, cari `const TRACKS=[` dan tambah satu baris seperti
   `{t:'Tajuk Lagu',f:'radio/lagu-baru.mp3',d:'3:15'}` (t = tajuk, f = lokasi fail, d = tempoh).
3. Simpan ke GitHub. Cloudflare akan deploy sendiri.

Guna hanya lagu yang anda ada hak untuk kongsi.

## Urus papan markah (pilihan)

Tetapkan kata laluan admin sekali sahaja:

```
npx wrangler secret put ADMIN_KEY
```

Lepas itu buka dalam pelayar (gantikan `LINK` dan `KATALALUAN`):

- Senarai pemain & markah: `https://LINK/api/admin?key=KATALALUAN`
- Padam satu pemain: `https://LINK/api/admin?key=KATALALUAN&padam=ID_PEMAIN`
- Kosongkan papan: `https://LINK/api/admin?key=KATALALUAN&padam=semua`

## Perlu tahu

- **Nama pemain ditaip sendiri.** Sesiapa boleh guna apa-apa nama. Baris markah setiap pemain dilindungi
  kunci rahsia dalam pelayarnya, jadi orang lain tak boleh tulis ganti markah anda. Tapi mereka masih boleh
  masuk sebagai pemain baharu, jadi guna admin di atas untuk buang markah palsu.
- **Had:** 60 pemain serentak dalam satu bilik. Markah seminggu melebihi 5,000 tidak diterima.
- **Simpanan** (duit gaji, barang kedai, kerjaya) disimpan dalam pelayar setiap pemain. Tukar telefon = mula semula.
- **Pelan percuma Cloudflare** cukup untuk satu jabatan: 100,000 request sehari. Seorang pemain guna lebih kurang
  250 request bagi setiap minggu game (10 minit).
- Game ini sama dengan versi dalam Claude. Ia guna server ini secara automatik bila dibuka di link Cloudflare.
