const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/AuthController");

// Public customer auth
router.post("/register", AuthController.register);
router.post("/login", AuthController.login);

// Public admin auth entrypoint
router.post("/admin-login", AuthController.adminLogin);

// Public token/password helpers
router.post("/refresh-token", AuthController.refreshToken);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/verify-otp", AuthController.verifyOTP);
router.post("/reset-password", AuthController.resetPassword);

module.exports = router;
