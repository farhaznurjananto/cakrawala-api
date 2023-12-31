const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../database");
const moment = require("moment");
require("dotenv").config();

//* Create Token
const maxExpire = 3 * 24 * 60 * 60;
const createToken = (id, username, isPremium) =>
  jwt.sign({ id, username, isPremium }, process.env.SECRET_STRING, {
    expiresIn: maxExpire,
  });

//* Register
exports.signupPost = async (req, res) => {
  const { username, email, password } = req.body;

  if (!email || !password) {
    const response = res.send({
      status: "Gagal",
      message: "Semua ketentuan wajib diisi!",
    });
    response.status(400);
    return response;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(req.body.email)) {
    return res.status(400).json({ error: "Alamat email tidak valid" });
  }

  if (password.length < 6) {
    const response = res.send({
      status: "Gagal",
      message: "Panjang password harus 6 karakter atau lebih!",
    });
    response.status(400);
    return response;
  }

  const [rows] = await db.promise().query(`SELECT * FROM users WHERE email = ?`, [req.body.email]);
  if (rows.length !== 0) {
    return res.status(500).json({ message: "User with that email is already exist" });
  }

  const salt = await bcrypt.genSalt();
  const hashedPassword = await bcrypt.hash(password, salt);

  await db.promise().query(`INSERT INTO users (username, email, password) VALUES(?, ?, ?)`, [username, email, hashedPassword]);

  const response = res.send({
    status: "Sukses",
    message: "User baru berhasil ditambahkan.",
  });
  response.status(201);
  return response;
};

//* Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    const response = res.send({
      status: "Gagal",
      message: "Semua ketentuan wajib diisi!",
    });
    response.status(400);
    return response;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(req.body.email)) {
    return res.status(400).json({ error: "Alamat email tidak valid" });
  }

  if (password.length < 6) {
    const response = res.send({
      status: "Gagal",
      message: "Panjang password harus 6 karakter atau lebih!",
    });
    response.status(400);
    return response;
  }

  const [rows] = await db.promise().query(`SELECT * FROM users WHERE email = ?`, [req.body.email]);
  if (rows.length !== 0) {
    if (rows[0].premium == 1) {
      const [data] = await db.promise().query(`SELECT user_premiums.premium_at, premiums.durasi FROM user_premiums JOIN premiums WHERE user_id = ?`, [rows[0].id]);
      const timestampAwal = moment(data[0].premium_at);
      const timestampAkhir = timestampAwal.add(data[0].durasi, "days");

      if (moment().isAfter(timestampAkhir)) {
        rows[0].premium = 0;
        await db.promise().query(`UPDATE users SET premium = ? WHERE email = ?`, [rows[0].premium, req.body.email]);
      }
    }
    const password = req.body.password; // Assuming you have req.body.password defined
    const auth = await bcrypt.compare(password, rows[0].password);
    if (auth) {
      const token = createToken(rows[0].id, rows[0].username, rows[0].premium);
      res.cookie("jwt", token, { httpOnly: false, maxAge: maxExpire * 1000 });
      const response = res.status(200).json({
        message: "Logged in!",
        user_id: rows[0].id,
        data: {
          user_id: rows[0].id,
          username: rows[0].username,
          premium: rows[0].premium,
          token: token,
        },
      });
      return response;
    }
  }
  const response = res.status(404).json({ message: "Password salah!" });
  return response;
};

//* Logout
exports.logout = (req, res) => {
  res.cookie("jwt", "", { maxAge: 1 });
  const response = res.status(200).json({ message: "Logout sukses!" });
  return response;
};
