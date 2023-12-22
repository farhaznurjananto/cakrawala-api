const { response } = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database");

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

exports.getHistory = async (req, res) => {
  const id = jwtDecoded(req.cookies.jwt);
  const page = parseInt(req.query.page) || 1;
  const itemsPerPage = parseInt(req.query.itemsPerPage) || 10;

  const offset = (page - 1) * itemsPerPage;

  const sqlQuery = `
      SELECT uploads.*, results.*
      FROM uploads
      JOIN results ON uploads.id = results.upload_id
      WHERE uploads.user_id = ?
      ORDER BY uploads.id DESC
      LIMIT ? OFFSET ?
    `;

  const [rows] = await db.promise().query(sqlQuery, [id, itemsPerPage, offset]);

  if (rows.length) {
    const response = res.status(200).send({
      status: "Sukses",
      message: "History found",
      data: rows,
      pagination: {
        page: page,
        itemsPerPage: itemsPerPage,
      },
    });

    return response;
  } else {
    const response = res.status(200).send({
      status: "Sukses",
      message: "Belum ada history yang ditemukan!",
    });

    return response;
  }
};

exports.deleteHistory = async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.promise().query(`SELECT * FROM uploads WHERE id = ?`, [id]);

    if (rows.length) {
      const bucketName = process.env.BUCKET_NAME;

      const raw_filename = `uploads/${rows[0].raw_filename}`;
      const processed_filename = `results/${rows[0].processed_filename}`;

      const { Storage } = require("@google-cloud/storage");

      const storage = new Storage();

      await storage.bucket(bucketName).file(raw_filename).delete();

      await storage.bucket(bucketName).file(processed_filename).delete();

      await db.promise().query(`DELETE FROM results WHERE upload_id = ?`, [rows[0].id]);
      await db.promise().query(`DELETE FROM uploads WHERE id = ?`, [rows[0].id]);

      const response = res.status(201).send({
        status: "Sukses",
        message: "Files deleted successfully",
      });

      return response;
    } else {
      const response = res.status(404).send({
        status: "Gagal",
        message: "No history found with the given ID",
      });

      return response;
    }
  } catch (error) {
    console.error(error);
    const response = res.status(500).send({
      status: "Gagal",
      message: "Internal Server Error",
    });

    return response;
  }
};

exports.specificHistory = async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.promise().query(`SELECT * FROM uploads WHERE id = ?`, [id]);

    if (rows.length) {
      const response = res.status(201).send({
        status: "Sukses",
        message: "History found",
        data: rows,
      });

      return response;
    } else {
      const response = res.status(404).send({
        status: "Gagal",
        message: "No history found with the given ID",
      });

      return response;
    }
  } catch (error) {
    console.error(error);
    const response = res.status(500).send({
      status: "Gagal",
      message: "Internal Server Error",
    });

    return response;
  }
};
