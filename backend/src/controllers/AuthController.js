const AuthService = require("../services/AuthService");

class AuthController {
  async register(req, res) {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      console.error("[AuthController:register]", error.message, error.code || "");
      res.status(error.code === "OTP_RATE_LIMITED" ? 429 : 400).json({ message: error.message, code: error.code });
    }
  }

  async login(req, res) {
    try {
      const { identifier, email, password } = req.body;
      const result = await AuthService.login(identifier || email, password);
      res.json(result);
    } catch (error) {
      console.error("[AuthController:login]", error.message, error.code || "");
      res.status(401).json({ message: error.message, code: error.code });
    }
  }

  async adminLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.adminLogin(email, password);
      res.json(result);
    } catch (error) {
      console.error("[AuthController:adminLogin]", error.message);
      res.status(401).json({ message: error.message });
    }
  }

  async refreshToken(req, res) {
    try {
      const { token } = req.body;
      const result = await AuthService.refreshToken(token);
      res.json(result);
    } catch (error) {
      console.error("[AuthController:refreshToken]", error.message);
      res.status(401).json({ message: error.message });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { phone } = req.body;
      const result = await AuthService.startPasswordReset(phone);
      res.json(result);
    } catch (error) {
      console.error("[AuthController:forgotPassword]", error.message, error.code || "");
      res.status(error.code === "OTP_RATE_LIMITED" ? 429 : 400).json({ message: error.message, code: error.code });
    }
  }

  async verifyOTP(req, res) {
    try {
      const { phone, msg91_access_token } = req.body;
      const result = await AuthService.verifyResetPhone(phone, msg91_access_token);
      res.json(result);
    } catch (error) {
      console.error("[AuthController:verifyOTP]", error.message, error.code || "");
      res.status(error.code === "OTP_RATE_LIMITED" ? 429 : 400).json({ message: error.message, code: error.code });
    }
  }

  async resetPassword(req, res) {
    try {
      const { phone, msg91_access_token, newPassword } = req.body;
      const result = await AuthService.resetPasswordWithMsg91(phone, msg91_access_token, newPassword);
      res.json(result);
    } catch (error) {
      console.error("[AuthController:resetPassword]", error.message, error.code || "");
      res.status(400).json({ message: error.message });
    }
  }

  async logout(req, res) {
    try {
      await AuthService.logout(req.customer.id);
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("[AuthController:logout]", error.message);
      res.status(500).json({ message: error.message });
    }
  }
}

module.exports = new AuthController();
