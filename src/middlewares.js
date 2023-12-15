const jwt = require("jsonwebtoken");
require("dotenv").config();

const requireAuthMember = (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    return res.status(400).json({ message: "Token tidak terdeteksi, harap login terlebih dahulu!" });
  }

  // Check JWT exist & is verified
  jwt.verify(token, process.env.SECRET_STRING, (err, decodedToken) => {
    if (err) {
      return res.status(400).json({ message: "Anda tidak memiliki hak untuk mengakses request ini!" });
    }

    // Attach id and isPremium to the req object
    req.user = {id: decodedToken.id, isPremium: decodedToken.isPremium};

    return next();
  });
};

const requireAuthAdmin = (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    return res.status(400).json({ message: "Token tidak terdeteksi, harap login terlebih dahulu!" });
  }

  // Check JWT exist & is verified
  jwt.verify(token, process.env.SECRET_STRING_ADMIN, (err) => {
    if (err) {
      return res.status(400).json({ message: "Request ini hanya bisa diakses oleh admin!" });
    }

    return next();
  });
};

module.exports = { requireAuthMember, requireAuthAdmin };