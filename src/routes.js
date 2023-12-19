// DIUBAH

const express = require("express");
const { requireAuthMember } = require("./middlewares");

const { signupPost, login, logout } = require("./api/auth");
const { upload } = require("./api/uploadFile");
const { uploadText } = require("./api/uploadText");
const { getHistory, deleteHistory, specificHistory } = require("./api/history");
const { getPremiumList, buyPremium, premiumHistoryAll, detailPayment, paymentHandler, redirectPaymentHandler } = require("./api/premium");

const routes = express.Router();

routes.post("/register", signupPost);
routes.post("/login", login);
routes.post("/logout", logout);

// Email verification route
// routes.post("/verify-email", sendVerificationEmail);

// Forgot password route
// routes.post("/forgot-password", forgotPassword);

routes.post("/upload", requireAuthMember, upload);
routes.post("/uploadText", requireAuthMember, uploadText);
routes.get("/history", requireAuthMember, getHistory);
routes.get("/history/:id", requireAuthMember, specificHistory);
routes.delete("/history/:id", requireAuthMember, deleteHistory);

routes.get("/premium", requireAuthMember, getPremiumList);
routes.post("/premium/:id", requireAuthMember, buyPremium);
routes.get("/transactions", requireAuthMember, premiumHistoryAll);
routes.post("/transactions/:id", requireAuthMember, detailPayment);
routes.post("/payment-handler", paymentHandler);
routes.get("/payment-handler", redirectPaymentHandler);

module.exports = routes;
