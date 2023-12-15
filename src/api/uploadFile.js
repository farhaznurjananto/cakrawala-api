const { Storage } = require("@google-cloud/storage");
const util = require("util");
const { format } = require("util");
const Multer = require("multer");
const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf");
const storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const bucket = storage.bucket(process.env.BUCKET_NAME);
const vision = require("@google-cloud/vision").v1;
const client = new vision.ImageAnnotatorClient();
const axios = require("axios");
const crypto = require("crypto");
// db

const db = require("../database");
require("dotenv").config();

// jwt
const jwt = require("jsonwebtoken");

const maxSize = 2 * 1024 * 1024;

const multerInstance = Multer({
  storage: Multer.memoryStorage(),
  limits: { fileSize: maxSize },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["text/plain", "image/jpeg", "image/png", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error("Tipe file yang diperbolehkan hanya document dan image!"));
    }

    cb(null, true);
  },
});

const processFile = multerInstance.single("file");
const processFileMiddleware = util.promisify(processFile);

// Function to generate a unique filename
function generateUniqueFileName(originalname) {
  const timestamp = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, "");
  const uniqueName = `${timestamp}_${originalname}`;
  return uniqueName;
}

// function decoded
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

function splitParagraf(paragraf) {
  // Mengganti semua \n dengan spasi
  paragraf = paragraf.replace(/\n/g, " ");

  // Membagi paragraf menjadi kalimat-kalimat menggunakan regex
  var kalimatArray = paragraf.split(/[.!?]/);

  // Membersihkan array dari elemen yang kosong
  kalimatArray = kalimatArray.filter(function (kalimat) {
    return kalimat.trim() !== "";
  });

  return kalimatArray;
}

exports.upload = async (req, res) => {
  try {
    await processFileMiddleware(req, res);

    // jwt
    id = jwtDecoded(req.cookies.jwt);

    if (!req.file) {
      return res.status(400).send({ message: "Please upload a file!" });
    }

    const fileName = generateUniqueFileName(req.file.originalname);
    const folderUpload = "uploads";
    const outputPrefix = "results";
    const blob = bucket.file(`${folderUpload}/${fileName}`);
    const imagePath = path.join(folderUpload, fileName);

    const blobStream = blob.createWriteStream({
      resumable: false,
    });

    blobStream.on("error", (err) => {
      res.status(500).send({ message: err.message });
    });

    blobStream.on("finish", async () => {
      const MAX_CHAR = 2000;
      var resCharLength;

      if (req.file.mimetype.includes("image")) {
        // Membuat folder "uploads" jika belum ada
        if (!fs.existsSync(folderUpload)) {
          fs.mkdirSync(folderUpload);
        }

        // Save the uploaded image to a local folder
        fs.writeFileSync(imagePath, req.file.buffer);

        // Extract Text
        const [result] = await client.textDetection(imagePath);

        const textAnnotations = result.textAnnotations;
        extractedText = textAnnotations[0] ? textAnnotations[0].description : "No text found in the image.";

        // Filter file included text under 2000 char
        extractedText = extractedText.replace(/\n/g, " ");

        if (extractedText.length > MAX_CHAR) {
          extractedText = extractedText.slice(0, MAX_CHAR);
          resCharLength = "Jumlah melebihi 2000 karakter, hanya mengambil 2000 karakter pertama";
        }

        const splitedText = splitParagraf(extractedText);

        // Upload the extracted text to Google Cloud Storage
        const textFileName = `${fileName}_text.txt`;
        const textBlob = bucket.file(`${outputPrefix}/${textFileName}`);
        const textBlobStream = textBlob.createWriteStream({
          resumable: false,
        });

        const publicUrl = format(`https://storage.googleapis.com/${bucket.name}/${blob.name}`);
        const textPublicUrl = format(`https://storage.googleapis.com/${bucket.name}/${textBlob.name}`);

        textBlobStream.on("error", (err) => {
          res.status(500).send({ message: err.message });
        });

        var prediction;
        try {
          const response = await axios.post("http://127.0.0.1:5003/predict", { data: extractedText });
          prediction = response.data.prediction;
          // console.log(prediction);
          // res.json({ prediction });
        } catch (error) {
          // console.log(error.message);
          res.json({ error: error.message });
        }

        const resultId = crypto.randomInt(10000000);
        const uploadId = crypto.randomInt(10000000);
        // Database
        await db.promise().query(`INSERT INTO uploads (id, raw_file, raw_filename, processed_file, processed_filename, user_id) VALUES(?, ?, ?, ?, ?, ?)`, [uploadId, publicUrl, fileName, textPublicUrl, textFileName, id]);

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

        textBlobStream.on("finish", async () => {
          // Hapus folder "uploads" dan file lokal setelah pemrosesan selesai
          rimraf.sync(folderUpload);

          res.status(200).send({
            message: "Uploaded the file and extracted text successfully: " + req.file.originalname,
            status: "Sukses",
            data: {
              imageUrl: publicUrl,
              textUrl: textPublicUrl,
              extractedText: extractedText,
              splitedText: splitedText,
              resCharLength: resCharLength,
              result: prediction,
            },
          });
        });

        // await db.promise().query(`INSERT INTO uploads (raw_file, raw_filename, processed_file, processed_filename, result_file, user_id) VALUES(?, ?, ?, ?, 'generated by ai', ?)`, [publicUrl, fileName, textPublicUrl, textFileName, id]);

        textBlobStream.end(extractedText);
      } else if (req.file.mimetype.includes("pdf")) {
        var outputFileName = `${fileName}_text`;
        var countPage = 0;

        const publicUrl = `gs://${bucket.name}/${folderUpload}/${fileName}`;
        var textPublicUrl = `gs://${bucket.name}/${outputPrefix}/${outputFileName}`;

        // HTTP URLs for display purposes
        const httpPublicUrl = `http://storage.googleapis.com/${bucket.name}/${folderUpload}/${fileName}`;
        // ini aku tambahin output-1-to-1.json
        // const httpTextPublicUrl = `http://storage.googleapis.com/${bucket.name}/${outputPrefix}/${outputFileName}output-1-to-1.json`;
        //

        const inputConfig = {
          // Supported mime_types are: 'application/pdf' and 'image/tiff'
          mimeType: "application/pdf",
          gcsSource: {
            uri: publicUrl,
          },
        };

        const outputConfig = {
          mimeType: "text/plain",
          gcsDestination: {
            uri: textPublicUrl,
          },
        };

        const features = [{ type: "DOCUMENT_TEXT_DETECTION" }];

        const request = {
          requests: [
            {
              inputConfig: inputConfig,
              features: features,
              outputConfig: outputConfig,
            },
          ],
        };

        const [operation] = await client.asyncBatchAnnotateFiles(request);
        const [filesResponse] = await operation.promise();

        // Try to download file
        fileDownload = `${outputPrefix}/${outputFileName}`;
        // List all files in the bucket
        const [files] = await bucket.getFiles({ prefix: "results" });

        // Filter files based on filename containing "test"
        const testFiles = files.filter((file) => file.name.includes(outputFileName));

        // Download each file
        var jsonFile = [];
        for (const file of testFiles) {
          const fileDownload = `${outputPrefix}/${file.name}`;
          [jsonFile] = await bucket.file(file.name).download();

          // Process the downloaded file (jsonFile) as needed
          // console.log(`Downloaded file: ${fileDownload}`);
        }
        // const [jsonFile] = await bucket.file(fileDownload).download();

        // Parse the JSON content
        const jsonData = JSON.parse(jsonFile.toString());
        // try to count page

        jsonData.responses.forEach((response, index) => {
          // Do something with each response
          countPage = index + 1;
          // console.log(`Processing response ${index + 1}:`, response);
        });

        const httpTextPublicUrl = `http://storage.googleapis.com/${bucket.name}/${outputPrefix}/${outputFileName}output-1-to-${countPage}.json`;
        textPublicUrl = `gs://${bucket.name}/${outputPrefix}/${outputFileName}output-1-to-${countPage}.json`;
        outputFileName = `${fileName}_text-output-1-to-${countPage}.json`;

        // ectracted text mau gimana soalnya udah bisa 2 halaman
        extractedText = jsonData.responses[0].fullTextAnnotation.text;

        // Filter file included text under 2000 char
        extractedText = extractedText.replace(/\n/g, " ");

        if (extractedText.length > MAX_CHAR) {
          extractedText = extractedText.slice(0, MAX_CHAR);
          resCharLength = "Jumlah melebihi 2000 karakter, hanya mengambil 2000 karakter pertama";
        }

        // const destinationUri = filesResponse.responses[0].outputConfig.gcsDestination.uri;

        // Predict
        var prediction;
        try {
          const response = await axios.post("http://127.0.0.1:5003/predict", { data: extractedText });
          prediction = response.data.prediction;
          console.log(prediction);
          // res.json({ prediction });
        } catch (error) {
          // console.log(error.message);
          res.json({ error: error.message });
        }

        // ini masih belum bisa outputfilenamenya sementara gitu aja dulu
        // await db.promise().query(`INSERT INTO uploads (raw_file, raw_filename, processed_file, processed_filename, result_file, user_id) VALUES (?, ?, ?, ?, 'generated by ai', ?)`, [publicUrl, fileName, textPublicUrl, outputFileName, id]);
        const resultId = crypto.randomInt(10000000);
        const uploadId = crypto.randomInt(10000000);
        // Database
        await db.promise().query(`INSERT INTO uploads (id, raw_file, raw_filename, processed_file, processed_filename, user_id) VALUES(?, ?, ?, ?, ?, ?)`, [uploadId, publicUrl, fileName, textPublicUrl, outputFileName, id]);

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
          message: "Uploaded the file and extracted text successfully: " + req.file.originalname,
          status: "Sukses",
          data: {
            sourceUrl: httpPublicUrl,
            destinationUrl: httpTextPublicUrl,
            extractedText: extractedText,
            resCharLength: resCharLength,
            result: prediction,
          },
        });
      }
    });

    blobStream.end(req.file.buffer);
  } catch (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(500).send({
        message: "File size cannot be larger than 2MB!",
      });
    }

    const fileName = req.file ? req.file.originalname : "Unknown File";
    res.status(500).send({
      message: `Could not upload the file: ${fileName}. ${err}`,
    });
  }
};
