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

const db = require("../database");
require("dotenv").config();

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

function generateUniqueFileName(originalname) {
  const timestamp = new Date().toISOString().replace(/[^a-zA-Z0-9]/g, "");
  const uniqueName = `${timestamp}_${originalname}`;
  return uniqueName;
}

function jwtDecoded(reqCookie) {
  // jwt decode
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

function splitParagraf(paragraf) {
  paragraf = paragraf.replace(/\n/g, " ");

  var kalimatArray = paragraf.split(/[.!?]/);

  kalimatArray = kalimatArray.filter(function (kalimat) {
    return kalimat.trim() !== "";
  });

  return kalimatArray;
}

exports.upload = async (req, res) => {
  try {
    await processFileMiddleware(req, res);

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
        if (!fs.existsSync(folderUpload)) {
          fs.mkdirSync(folderUpload);
        }

        fs.writeFileSync(imagePath, req.file.buffer);

        const [result] = await client.textDetection(imagePath);

        const textAnnotations = result.textAnnotations;
        extractedText = textAnnotations[0] ? textAnnotations[0].description : "No text found in the image.";

        extractedText = extractedText.replace(/\n/g, " ");

        if (extractedText.length > MAX_CHAR) {
          extractedText = extractedText.slice(0, MAX_CHAR);
          resCharLength = "Jumlah melebihi 2000 karakter, hanya mengambil 2000 karakter pertama";
        }

        const splitedText = splitParagraf(extractedText);

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
          const response = await axios.post(`${process.env.URL_MODEL}/predict`, { data: extractedText });
          prediction = response.data.prediction;
        } catch (error) {
          res.json({ error: error.message });
        }

        const resultId = crypto.randomInt(10000000);
        const uploadId = crypto.randomInt(10000000);

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

        textBlobStream.end(extractedText);
      } else if (req.file.mimetype.includes("pdf")) {
        var outputFileName = `${fileName}_text`;
        var countPage = 0;

        const publicUrl = `gs://${bucket.name}/${folderUpload}/${fileName}`;
        var textPublicUrl = `gs://${bucket.name}/${outputPrefix}/${outputFileName}`;

        const httpPublicUrl = `http://storage.googleapis.com/${bucket.name}/${folderUpload}/${fileName}`;

        const inputConfig = {
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

        fileDownload = `${outputPrefix}/${outputFileName}`;

        const [files] = await bucket.getFiles({ prefix: "results" });

        const testFiles = files.filter((file) => file.name.includes(outputFileName));

        var jsonFile = [];
        for (const file of testFiles) {
          const fileDownload = `${outputPrefix}/${file.name}`;
          [jsonFile] = await bucket.file(file.name).download();
        }

        const jsonData = JSON.parse(jsonFile.toString());

        jsonData.responses.forEach((response, index) => {
          countPage = index + 1;
        });

        const httpTextPublicUrl = `http://storage.googleapis.com/${bucket.name}/${outputPrefix}/${outputFileName}output-1-to-${countPage}.json`;
        textPublicUrl = `gs://${bucket.name}/${outputPrefix}/${outputFileName}output-1-to-${countPage}.json`;
        outputFileName = `${fileName}_textoutput-1-to-${countPage}.json`;

        extractedText = jsonData.responses[0].fullTextAnnotation.text;

        try {
          await storage.bucket(process.env.BUCKET_NAME).file(`${folderUpload}/${fileName}`).makePublic();
        } catch (error) {
          console.error(error);
        }

        extractedText = extractedText.replace(/\n/g, " ");

        if (extractedText.length > MAX_CHAR) {
          extractedText = extractedText.slice(0, MAX_CHAR);
          resCharLength = "Jumlah melebihi 2000 karakter, hanya mengambil 2000 karakter pertama";
        }

        var prediction;
        try {
          const response = await axios.post(`${process.env.URL_MODEL}/predict`, { data: extractedText });
          prediction = response.data.prediction;
        } catch (error) {
          res.json({ error: error.message });
        }

        const resultId = crypto.randomInt(10000000);
        const uploadId = crypto.randomInt(10000000);

        await db.promise().query(`INSERT INTO uploads (id, raw_file, raw_filename, processed_file, processed_filename, user_id) VALUES(?, ?, ?, ?, ?, ?)`, [uploadId, httpPublicUrl, fileName, httpTextPublicUrl, outputFileName, id]);

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
