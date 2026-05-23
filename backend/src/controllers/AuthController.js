const AuthService = require("../services/AuthService");

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

  async verifyPhone(req, res) {
    try {
      const { firebase_id_token } = req.body || {};
      const result = await AuthService.verifyPhoneForCustomer({
        customerId: req.customer.id,
        firebaseIdToken: firebase_id_token,
      });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message, code: error.code });
    }
  }

  async verifyPhoneAndLogin(req, res) {
    try {
      const { email, password, firebase_id_token } = req.body || {};
      const result = await AuthService.verifyPhoneAndLogin({
        email,
        password,
        firebaseIdToken: firebase_id_token,
      });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message, code: error.code });
    }
  }
}

module.exports = new AuthController();
