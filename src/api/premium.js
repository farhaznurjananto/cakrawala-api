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
  // jwt decode
  const token = reqCookie;
  var id;
  jwt.verify(token, process.env.SECRET_STRING, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Failed to authenticate token" });
    }

    // The decoded payload is available in the 'decoded' object
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

// tuku -> generate -> tabel transaksi
// detail transaksi -> semua hasil transaksi dari tabel transaksi

exports.buyPremium = async (req, res) => {
  // check premium status
  if (!premiumCheck(req.user)) {
    const id = jwtDecoded(req.cookies.jwt);
    const premium_id = req.params.id;
    const order_id = crypto.randomInt(10000000);

    // get data premium specific
    const [rows] = await db.promise().query(`SELECT * FROM premiums where id = ?`, premium_id);

    const data = JSON.stringify({
      transaction_details: {
        order_id: order_id,
        gross_amount: rows[0].harga_paket,
      },
    });
    console.log(order_id);
    // forward to endpoint midtrans
    try {
      // redirectPayment = await axios.post(`${process.env.URL_MODEL}/charge`, data, {
      const redirectPayment = await axios.post(`http://127.0.0.1:5003/charge`, data, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      await db.promise().query(`INSERT INTO orders (id, premium_id, transaction_id, url_payment, user_id) VALUES(?, ?, ?, ?, ?)`, [order_id, premium_id, redirectPayment.data.token, redirectPayment.data.redirect_url, id]);

      res.status(200).json({
        status: "Sukses",
        message: "Premium List",
        data: { order_id, ...redirectPayment.data }, // Use bill.data to get the response data
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

  const page = parseInt(req.query.page) || 1; // Default to page 1 if not specified
  const itemsPerPage = parseInt(req.query.itemsPerPage) || 10; // Default to 10 items per page if not specified

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
      data: rows, // Use bill.data to get the response data
    });
  } else {
    res.status(401).json({
      status: "Gagal",
      message: "Belum ada history",
    });
  }
};

// detail stroke
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
      data: rows, // Use bill.data to get the response data
    });
  } else {
    res.status(401).json({
      status: "Gagal",
      message: "Belum ada history",
    });
  }
};

// URL CALLBACK HANDLER {url}/payment-handler
exports.paymentHandler = async (req, res) => {
  // const id = jwtDecoded(req.cookies.jwt);
  // check status trans
  // add data in table order
  try {
    // const bill = await axios.get(`https://api.sandbox.midtrans.com/v2/${order_id}/status`, {
    //   headers: {
    //     Accept: "application/json",
    //     "Content-Type": "application/json",
    //     Authorization: btoa(process.env.SERVER_KEY_MIDTRANS + ":"),
    //   },
    // });

    const bill = req.body;

    const data = bill.data;

    console.log(data);

    const [id] = await db.promise().query(`SELECT * FROM orders INNER JOIN users ON orders.user_id = users.id WHERE orders.id = ?`, req.query.order_id);

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
      [data.transaction_time, data.transaction_status, data.status_message, data.status_code, data.signature_key, data.payment_type, data.merchant_id, data.gross_amount, data.fraud_status, data.currency]
    );

    // update table premium
    const [user_premium] = await db.promise().query(`SELECT * FROM user_premiums WHERE user_id = ?`, [id]);
    if (user_premium) {
      await db.promise().query(`UPDATE user_premiums SET premium_id = ?, premium_at = ? WHERE user_id = ?`, [premium_id, transaction_time, id]);
    } else {
      await db.promise().query(`INSERT INTO user_premiums (user_id, premium_id, premium_at) VALUES(?, ?, ?)`, [id, premium_id, data.transaction_time]);
    }

    // update user premium status
    await db.promise().query(`UPDATE users SET premium = 1 WHERE id = ?`, [id]);

    // update cookies premium value
    try {
      const token = createToken(id, req.user.uname, 1);
      res.cookie("jwt", token, { httpOnly: false, maxAge: maxExpire * 1000 });
    } catch (error) {
      console.log(error);
    }

    res.redirect("/payment-success");

    // res.status(200).json({
    //   status: "Sukses",
    //   message: "Pembayaran berhasil",
    //   data: {
    //     url_payment: tokenPayment.data,
    //     detail: { ...data },
    //   }, // Use bill.data to get the response data
    // });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// yuk yuk mulai dari mana asekkkk!!!
