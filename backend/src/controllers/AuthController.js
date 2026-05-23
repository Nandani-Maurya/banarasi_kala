const AuthService = require("../services/AuthService");
const { config } = require("../config/env");

class AuthController {
  async register(req, res) {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      res.json(result);
    } catch (error) {
      const status = error.code === "PHONE_NOT_VERIFIED" ? 403 : 401;
      res.status(status).json({ message: error.message, code: error.code, phone: error.phone });
    }
  }

  async loginWithPhone(req, res) {
    try {
      const { phone } = req.body || {};
      const result = await AuthService.loginWithPhone(phone);
      res.json(result);
    } catch (error) {
      res.status(401).json({ message: error.message });
    }
  }

  async adminLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.adminLogin(email, password);
      res.json(result);
    } catch (error) {
      res.status(401).json({ message: error.message });
    }
  }

  async refreshToken(req, res) {
    try {
      const { token } = req.body;
      const result = await AuthService.refreshToken(token);
      res.json(result);
    } catch (error) {
      res.status(401).json({ message: error.message });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email, role } = req.body;
      const result = await AuthService.forgotPassword(email, role);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async verifyOTP(req, res) {
    try {
      const { email, otp, role } = req.body;
      const result = await AuthService.verifyOTP(email, otp, role);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async resetPassword(req, res) {
    try {
      const { email, otp, newPassword, role } = req.body;
      const result = await AuthService.resetPassword(email, otp, newPassword, role);
      res.json(result);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async logout(req, res) {
    try {
      await AuthService.logout(req.customer.id);
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }

  async verifyMsg91AccessToken(req, res) {
    try {
      const { accessToken } = req.body || {};
      if (!accessToken) {
        return res.status(400).json({ message: "accessToken is required" });
      }
      if (!config.msg91AuthKey) {
        return res.status(500).json({ message: "MSG91 auth key is not configured" });
      }

      const response = await fetch(
        "https://control.msg91.com/api/v5/widget/verifyAccessToken",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            authkey: config.msg91AuthKey,
            "access-token": accessToken,
          }),
        }
      );

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error) {
      return res.status(500).json({ message: error.message || "MSG91 verification failed" });
    }
  }
}

module.exports = new AuthController();
