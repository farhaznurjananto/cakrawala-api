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

// BERUBAH

// function decoded
function jwtDecoded(reqCookie) {
  // jwt decode
  const token = reqCookie;
  let id;
  jwt.verify(token, process.env.SECRET_STRING, (err, decoded) => {
    if (err) {
      // Use return res.status(401).json(...) if you have 'res' available here
      // Otherwise, handle the error accordingly
      console.error("Failed to authenticate token", err);
      return;
    }

    // The decoded payload is available in the 'decoded' object
    id = decoded.id;
  });
  return id;
}

// Function to generate a unique filename
function generateUniqueFileName() {
  const timestamp = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, "");
  const uniqueName = `${timestamp}`;
  return uniqueName;
}

// Function premium checking
function premiumCheck(premium) {
  if (premium.isPremium == 1) {
    return 1;
  }
  return 0;
}

exports.uploadText = async (req, res) => {
  try {
      var { text } = req.body;
      // console.log(text);
      // const user = req.user;
      // logic premium
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

      // Generate unique name
      const fileName = `${generateUniqueFileName()}.txt`;

      const folderUpload = "uploads";
      const folderOutput = "results";
      const destinationUpload = `${folderUpload}/${fileName}`;
      const destinationOutput = `${folderOutput}/${fileName}`;
      const publicUrl = format(`https://storage.googleapis.com/${destinationUpload}`);
      const textPublicUrl = format(`https://storage.googleapis.com/${destinationOutput}`);

      // Write to txt file
      fs.writeFileSync(fileName, text);

      // Upload file to Google Cloud Storage
      try {
          // Upload file to Google Cloud Storage
          await bucket.upload(`${fileName}`, {
              destination: destinationUpload,
          });

          // Copy file uploaded before to folder results
          await bucket.file(destinationUpload).copy(destinationOutput);

          // Delete local file
          fs.unlinkSync(fileName);
      } catch (error) {
          // Handle the error here
          console.error("Error during file upload or deletion:", error);
          return res.status(500).json({
              status: "Error",
              message: "Internal server error during file upload or deletion.",
          });
      }

      // Predict
      var prediction;
      try {
          const response = await axios.post("https://cakrawala-model-slorogthxq-et.a.run.app/predict", { data: text });
          prediction = response.data.prediction;
          console.log(prediction);
          // res.json({ prediction });
      } catch (error) {
          // console.log(error.message);
          res.json({ error: error.message });
      }

      // jwt
      id = jwtDecoded(req.cookies.jwt);

      const resultId = crypto.randomInt(10000000);
      const uploadId = crypto.randomInt(10000000);
      // Database
      await db.promise().query(`INSERT INTO uploads (id, raw_file, raw_filename, processed_file, processed_filename, user_id) VALUES(?, ?, ?, ?, ?, ?)`, [uploadId, publicUrl, fileName, fileName, fileName, id]);

      // console.log(await db.promise().query("SELECT LAST_INSERT_ID()"));
      // last_id = await db.promise().query("SELECT LAST_INSERT_ID()");
      // last_id = last_id[0][0]["LAST_INSERT_ID()"];
      // isIdExist = await db.promise().query("SELECT id from uploads where id = ?", [resultId])
      // // console.log(last_id[0][0]["LAST_INSERT_ID()"]);
      // if (isIdExist){
      //   const resultId = crypto.randomUUID()
      // }

      list_ai_sentences = JSON.stringify(prediction.list_ai_sentences);
      // console.log(list_ai_sentences);

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
