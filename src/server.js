// DIUBAH

const express = require("express");
const routes = require("./routes");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");

const app = express();
const PORT = 8080;

app.use(cookieParser());
app.use(bodyParser.json());

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

// Routes
app.use(routes);

app.listen(PORT, () => {
  console.log(`Server running on port: http://localhost:${PORT}/`);
});

// Tugas kita selanjutnya:
// jika string biasa langsung store string ke sql (done)
// sql tetep jadi nambah table upload -> id, user id, text, bucket link, result (done)
// upload file udah done, tinggal bikin api buat proses file ke cloud vision (done)
// store string ke sql dijadiin txt aja (done)
// store nama asli file ke DB (done)
// Buat API fitur history (done)
// nambahin response tiap error
// nambahin ketentuan (maksimal karakter, maksimal size) -> yang pdf klo size aja gapapa? kalo yang pdf ini kan udah ada maksimal size, kalo udah lolos maksimal size, itu kan masuk cek jumlah karakter, itu langsung ditolak apa scan sesuai jumlah maksimal karakter yang kita tentuin Semua input kalo melebihi 2000 karakter, cuman d ambil 2000 karakter pertama aja (done)
// Buat API fitur premium (Masih text doang, yang file belum)
// Nambah tabel buat paket premium dan durasi
// Urusan PDF (nama file gabisa di custom, masih belom  bisa akses json) (done)
// yang delete history yang pdf masih salah karna filenamenya masih belum ada solusi (done)
// Mengganti tipe data menjadi bentuk teks langsung 
// Delete History error - bagian hapus pdf karena simpan link pakai gs ganti ke https (done)
