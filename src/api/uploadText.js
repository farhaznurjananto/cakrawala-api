const db = require("../database");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const bucket = storage.bucket(process.env.BUCKET_NAME);
const { format } = require("util");
const { response } = require("express");
const axios = require("axios");
const crypto = require("crypto");

function jwtDecoded(reqCookie) {
  const token = reqCookie;
  let id;
  jwt.verify(token, process.env.SECRET_STRING, (err, decoded) => {
    if (err) {
      console.error("Failed to authenticate token", err);
      return;
    }

    id = decoded.id;
  });
  return id;
}

function generateUniqueFileName() {
  const timestamp = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, "");
  const uniqueName = `${timestamp}`;
  return uniqueName;
}

function premiumCheck(premium) {
  if (premium.isPremium == 1) {
    return 1;
  }
  return 0;
}

exports.uploadText = async (req, res) => {
  try {
    var { text } = req.body;
    var resCharLength;
    if (!premiumCheck(req.user)) {
      const MAX_CHAR = 2000;
      if (text.length > MAX_CHAR) {
        text = text.slice(0, MAX_CHAR);
        resCharLength = "Jumlah melebihi 2000 karakter, hanya mengambil 2000 karakter pertama";
      }
    } else {
      resCharLength = "user premium";
    }

    if (!text) {
      return res.status(400).json({
        status: "Gagal",
        message: "Semua ketentuan wajib diisi!",
      });
    }

    const fileName = `${generateUniqueFileName()}.txt`;

    const folderUpload = "uploads";
    const folderOutput = "results";
    const destinationUpload = `${folderUpload}/${fileName}`;
    const destinationOutput = `${folderOutput}/${fileName}`;
    const publicUrl = format(`https://storage.googleapis.com/${destinationUpload}`);
    const textPublicUrl = format(`https://storage.googleapis.com/${destinationOutput}`);

    fs.writeFileSync(fileName, text);

    try {
      await bucket.upload(`${fileName}`, {
        destination: destinationUpload,
      });

      await bucket.file(destinationUpload).copy(destinationOutput);

      fs.unlinkSync(fileName);
    } catch (error) {
      console.error("Error during file upload or deletion:", error);
      return res.status(500).json({
        status: "Error",
        message: "Internal server error during file upload or deletion.",
      });
    }

    var prediction;
    try {
      const response = await axios.post(`${process.env.URL_MODEL}/predict`, { data: text });
      prediction = response.data.prediction;
      console.log(prediction);
    } catch (error) {
      res.json({ error: error.message });
    }

    id = jwtDecoded(req.cookies.jwt);

    const resultId = crypto.randomInt(10000000);
    const uploadId = crypto.randomInt(10000000);

    await db.promise().query(`INSERT INTO uploads (id, raw_file, raw_filename, processed_file, processed_filename, user_id) VALUES(?, ?, ?, ?, ?, ?)`, [uploadId, publicUrl, fileName, fileName, fileName, id]);

    list_ai_sentences = JSON.stringify(prediction.list_ai_sentences);

    await db
      .promise()
      .query(`INSERT INTO results (id, result_generated, ai_percentage, human_percentage, list_ai_sentences, upload_id) VALUES(?, ?, ?, ?, ?, ?)`, [
        resultId,
        prediction.result,
        prediction.ai_precentage,
        prediction.human_precentage,
        list_ai_sentences,
        uploadId,
      ]);

    return res.status(200).send({
      message: "Uploaded the file and extracted text successfully: " + fileName,
      status: "Sukses",
      data: {
        rawUrl: publicUrl,
        processedUrl: textPublicUrl,
        extractedText: text,
        resCharLength: resCharLength,
        result: prediction,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      status: "Error",
      message: "Internal server error.",
    });
  }
};
