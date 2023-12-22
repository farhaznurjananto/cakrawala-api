const jwt = require("jsonwebtoken");
const db = require("../database");
const axios = require("axios");
const crypto = require("crypto");
const { json, response } = require("express");
const cookie = require("cookie");

//* Create Token
const maxExpire = 3 * 24 * 60 * 60;
const createToken = (id, username, isPremium) =>
  jwt.sign({ id, username, isPremium }, process.env.SECRET_STRING, {
    expiresIn: maxExpire,
  });

function jwtDecoded(reqCookie) {
  const token = reqCookie;
  var id;
  jwt.verify(token, process.env.SECRET_STRING, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Failed to authenticate token" });
    }

    id = decoded.id;
  });
  return id;
}

function premiumCheck(premium) {
  if (premium.isPremium == 1) {
    return 1;
  }
  return 0;
}

exports.getPremiumList = async (req, res) => {
  const [rows] = await db.promise().query(`SELECT * FROM premiums`);
  res.status(200).json({
    status: "Sukses",
    message: "Premium List",
    data: rows,
  });
};

exports.buyPremium = async (req, res) => {
  if (!premiumCheck(req.user)) {
    const id = jwtDecoded(req.cookies.jwt);
    const premium_id = req.params.id;
    const order_id = crypto.randomInt(10000000);

    const [rows] = await db.promise().query(`SELECT * FROM premiums where id = ?`, premium_id);

    const data = JSON.stringify({
      transaction_details: {
        order_id: order_id,
        gross_amount: rows[0].harga_paket,
      },
    });
    console.log(order_id);
    try {
      redirectPayment = await axios.post(`${process.env.URL_MODEL}/charge`, data, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      await db.promise().query(`INSERT INTO orders (id, premium_id, transaction_id, url_payment, user_id) VALUES(?, ?, ?, ?, ?)`, [order_id, premium_id, redirectPayment.data.token, redirectPayment.data.redirect_url, id]);

      res.status(200).json({
        status: "Sukses",
        message: "Premium List",
        data: { order_id, ...redirectPayment.data },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(401).json({
      status: "Gagal",
      message: "Anda sudah premium",
    });
  }
};

exports.premiumHistoryAll = async (req, res) => {
  const id = jwtDecoded(req.cookies.jwt);

  const page = parseInt(req.query.page) || 1;
  const itemsPerPage = parseInt(req.query.itemsPerPage) || 10;

  const offset = (page - 1) * itemsPerPage;

  const [rows] = await db.promise().query(
    `
    SELECT * FROM orders
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `,
    [id, itemsPerPage, offset]
  );

  if (rows) {
    res.status(200).json({
      status: "Sukses",
      message: "History List",
      data: rows,
    });
  } else {
    res.status(401).json({
      status: "Gagal",
      message: "Belum ada history",
    });
  }
};

exports.detailPayment = async (req, res) => {
  const order_id = req.params.id;

  const [rows] = await db.promise().query(
    `
    SELECT * FROM orders
    WHERE id = ?
  `,
    [order_id]
  );

  if (rows) {
    res.status(200).json({
      status: "Sukses",
      message: "History List",
      data: rows,
    });
  } else {
    res.status(401).json({
      status: "Gagal",
      message: "Belum ada history",
    });
  }
};

exports.redirectPaymentHandler = async (req, res) => {
  if (req.query.transaction_status == "settlement") {
    try {
      const [rows] = await db.promise().query(`SELECT * FROM orders INNER JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, [req.query.order_id]);

      const token = createToken(rows[0].user_id, rows[0].username, 1);
      console.log(token);
      res.cookie("jwt", token, { httpOnly: false, maxAge: maxExpire * 1000 });
      res.redirect("/payment-success?jwt=" + token);
    } catch (error) {
      console.log(error);
      res.status(400).json({
        message: "Transaction Invalid",
      });
    }
  } else {
    res.status(400).json({
      message: "Transaction Invalid",
    });
  }
};

exports.paymentHandler = async (req, res) => {
  try {
    const data = req.body;

    const [rows] = await db.promise().query(`SELECT * FROM orders INNER JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, [data.order_id]);

    await db.promise().query(
      `UPDATE orders SET transaction_time = ?,
      transaction_status = ?,
      status_message = ?,
      status_code = ?,
      signature_key = ?,
      payment_type = ?,
      merchant_id = ?,
      gross_amount = ?,
      fraud_status = ?,
      currency = ? WHERE id = ?`,
      [data.transaction_time, data.transaction_status, data.status_message, data.status_code, data.signature_key, data.payment_type, data.merchant_id, data.gross_amount, data.fraud_status, data.currency, data.order_id]
    );

    const [userPremiumRows] = await db.promise().query(`SELECT * FROM user_premiums WHERE user_id = ?`, [rows[0].user_id]);

    if (userPremiumRows.length === 0) {
      await db.promise().query(`INSERT INTO user_premiums (user_id, premium_id, premium_at) VALUES (?, ?, ?)`, [rows[0].user_id, rows[0].premium_id, data.transaction_time]);
    } else {
      // Update existing record
      await db.promise().query(`UPDATE user_premiums SET premium_id = ?, premium_at = ? WHERE user_id = ?`, [rows[0].premium_id, data.transaction_time, rows[0].user_id]);
    }

    await db.promise().query(`UPDATE users SET premium = 1 WHERE id = ?`, [rows[0].user_id]);

    res.status(200).json({
      status: "Sukses",
      message: "Pembayaran berhasil",
      data: {
        url_payment: rows[0].url_payment,
        detail: { ...data },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.paymentSuccess = async (req, res) => {
  res.status(200).json({
    status: "Sukses",
    message: "Pembayaran berhasil",
  });
};
