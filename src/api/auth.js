// const { nanoid } = require('nanoid');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../database");
const nodemailer = require("nodemailer");
require("dotenv").config();

// DIUBAH

//* Create Token
const maxExpire = 3 * 24 * 60 * 60;
const createToken = (id, username, isPremium) =>
  jwt.sign({ id, username, isPremium }, process.env.SECRET_STRING, {
    expiresIn: maxExpire,
  });

//* Register
exports.signupPost = async (req, res) => {
  const { username, email, password } = req.body;

  // const id = nanoid(16);

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
    const auth = bcrypt.compare(password, rows[0].password);
    if (auth) {
      const token = createToken(rows[0].id, rows[0].username, rows[0].premium);
      res.cookie("jwt", token, { httpOnly: false, maxAge: maxExpire * 1000 });
      const response = res.status(200).json({
        message: "Logged in!",
        user_id: rows[0].id,
        data: {
          user_id: rows[0].id,
          username: rows[0].username,
          token: token,
        },
      });
      return response;
    }
    const response = res.status(404).json({ message: "Password salah!" });
    return response;
  }
  const response = res.status(404).json({ message: "Email tidak ditemukan!" });
  return response;
};

//* Logout
exports.logout = (req, res) => {
  res.cookie("jwt", "", { maxAge: 1 });
  const response = res.status(200).json({ message: "Logout sukses!" });
  return response;
};

// Forgot Password
exports.sendVerificationEmail = (req, res) => {
  // Logic for sending verification email
  const { email } = req.body;

  // Create a nodemailer transporter using your email service credentials
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "yagura098@gmail.com", // Your email address
      pass: "wbjs xqyj qxza yzcz", // Your email password
    },
  });

  // Use localhost URL for testing
  const localhostUrl = "http://localhost:8080"; // Replace with your actual localhost URL and port

  // Email options
  const mailOptions = {
    from: "yagura098@gmail.com", // Sender email address
    to: email,
    subject: "Email Verification",
    text: `Please click on the following link to verify your email: ${localhostUrl}/verify?token=verificationToken`,
    // You would generate the verification token and include it in the link
  };

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to send verification email" });
    } else {
      console.log("Email sent: " + info.response);
      res.json({ message: "Verification email sent successfully" });
    }
  });
};

exports.forgotPassword = (req, res) => {
  // Logic for handling forgot password
  const { email } = req.body;

  // Create a nodemailer transporter using your email service credentials
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "yagura098@gmail.com", // Your email address
      pass: "wbjs xqyj qxza yzcz", // Your email password
    },
  });

  // Use localhost URL for testing
  const localhostUrl = "http://localhost:8080"; // Replace with your actual localhost URL and port

  // Email options
  const mailOptions = {
    from: "yagura098@gmail.com", // Sender email address
    to: email,
    subject: "Password Reset",
    text: `Please click on the following link to reset your password: ${localhostUrl}/reset?token=resetToken`,
    // You would generate the reset token and include it in the link
  };

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to send password reset instructions" });
    } else {
      console.log("Email sent: " + info.response);
      res.json({ message: "Password reset instructions sent to your email" });
    }
  });
};
