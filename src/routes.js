const express = require("express");
const { requireAuthMember } = require("./middlewares");

const { signupPost, login, logout, sendVerificationEmail, forgotPassword } = require("./api/auth");
const { upload } = require("./api/uploadFile");
const { uploadText } = require("./api/uploadText");
const { getHistory, deleteHistory } = require("./api/history");

const routes = express.Router();

routes.post("/register", signupPost);
routes.post("/login", login);
routes.post("/logout", logout);

// Email verification route
routes.post('/verify-email', sendVerificationEmail);

// Forgot password route
routes.post('/forgot-password', forgotPassword);

routes.post("/upload", requireAuthMember, upload);
routes.post("/uploadText", requireAuthMember, uploadText);
routes.get("/history", requireAuthMember, getHistory);
routes.delete("/history/:id", requireAuthMember, deleteHistory);
// test
// Example route handler
// routes.get("/some-protected-route", requireAuthMember, (req, res) => {
//     const user = req.user;

  
//     // Your logic here using userId and isPremium
//     res.json({ user, message: "This is a protected route" });
//   });

module.exports = routes;
