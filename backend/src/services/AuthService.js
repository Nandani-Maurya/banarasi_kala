const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Admin = require("../models/Admin");
const EmailService = require("./EmailService");
const { Op } = require("sequelize");
const WalletService = require("./WalletService");
const { config } = require("../config/env");

const generateReferralCode = () =>
  `VNS${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

class AuthService {
  async register(userData) {
    const { name, phone, email, password, referral_code } = userData;

    const existingPhone = await Customer.findOne({ where: { phone } });
    if (existingPhone) {
      throw new Error("Phone number already registered");
    }

    if (!email) {
      throw new Error("Email is required for registration");
    }

    const existingEmail = await Customer.findOne({ where: { email } });
    if (existingEmail) {
      throw new Error("Email already registered");
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    let customer = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        customer = await Customer.create({
          name,
          phone,
          email,
          password: hashedPassword,
          referral_code: generateReferralCode(),
          phone_verified: true,
        });
        break;
      } catch (err) {
        // Retry only on referral_code collisions (rare).
        if (err?.name === "SequelizeUniqueConstraintError") continue;
        throw err;
      }
    }
    if (!customer) {
      throw new Error("Failed to generate referral code. Please try again.");
    }

    // Welcome bonus for every first-time signup.
    await WalletService.creditNow({
      customerId: customer.id,
      amount: config.welcomeBonus,
      type: "WELCOME_BONUS",
      dedupeKey: `welcome:${customer.id}`,
      meta: null,
    });

    // Optional referral flow:
    // - If referral_code is valid, credit ₹100 to the new user's wallet immediately.
    // - Referrer earns ₹50 only after referred user's delivered order + 7 days (handled elsewhere).
    if (referral_code) {
      const referrer = await Customer.findOne({ where: { referral_code } });
      if (referrer && referrer.id !== customer.id) {
        await customer.update({ referred_by_id: referrer.id });
        await WalletService.creditNow({
          customerId: customer.id,
          amount: config.referralSignupBonus,
          type: "REFERRAL_SIGNUP_BONUS",
          dedupeKey: `ref_signup:${customer.id}`,
          meta: { referrer_id: referrer.id },
        });
      }
    }

    return this.generateTokens(customer);
  }

  async login(email, password) {
    const customer = await Customer.findOne({ where: { email } });
    if (!customer) {
      throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, customer.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }

    return this.generateTokens(customer, "customer");
  }

  async loginWithPhone(phone) {
    if (!phone) {
      throw new Error("Phone number is required");
    }
    const customer = await Customer.findOne({ where: { phone } });
    if (!customer) {
      throw new Error("No account found with this phone number");
    }
    return this.generateTokens(customer, "customer");
  }

  async adminLogin(email, password) {
    const admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
    }

    return this.generateTokens(admin, "admin");
  }

  async refreshToken(token) {
    if (!token) throw new Error("No token provided");

    try {
      const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      
      let user = await Customer.findByPk(decoded.id);
      let role = "customer";
      
      if (!user) {
        user = await Admin.findByPk(decoded.id);
        role = "admin";
      }

      if (!user || user.refresh_token !== token) {
        throw new Error("Invalid refresh token");
      }

      return this.generateTokens(user, role);
    } catch (err) {
      throw new Error("Invalid refresh token");
    }
  }

  async generateTokens(user, role = "customer") {
    const accessToken = jwt.sign(
      { id: user.id, role: role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user.id, role: role },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d" }
    );

    user.refresh_token = refreshToken;
    await user.save();

    const userPayload = {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: role,
      avatar_url: user.avatar_url || null,
      wallet_balance: user.wallet_balance ?? null,
      referral_code: user.referral_code || null,
    };

    return {
      customer: role === "customer" ? userPayload : null,
      admin: role === "admin" ? userPayload : null,
      user: userPayload,
      accessToken,
      refreshToken,
    };
  }

  async forgotPassword(email, role = "customer") {
    const Model = role === "admin" ? Admin : Customer;
    const user = await Model.findOne({ where: { email } });

    if (!user) {
      throw new Error("No user found with this email");
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.reset_otp = otp;
    user.reset_otp_expiry = expiry;
    await user.save();

    await EmailService.sendOTP(email, otp, user.name);
    return { message: "OTP sent to your email" };
  }

  async verifyOTP(email, otp, role = "customer") {
    const Model = role === "admin" ? Admin : Customer;
    const user = await Model.findOne({
      where: {
        email,
        reset_otp: otp,
        reset_otp_expiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw new Error("Invalid or expired OTP");
    }

    return { message: "OTP verified successfully" };
  }

  async resetPassword(email, otp, newPassword, role = "customer") {
    const Model = role === "admin" ? Admin : Customer;
    const user = await Model.findOne({
      where: {
        email,
        reset_otp: otp,
        reset_otp_expiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw new Error("Invalid or expired OTP");
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.reset_otp = null;
    user.reset_otp_expiry = null;
    await user.save();

    return { message: "Password reset successfully" };
  }

  async logout(customerId) {
    const customer = await Customer.findByPk(customerId);
    if (customer) {
      customer.refresh_token = null;
      await customer.save();
    }
  }
}

module.exports = new AuthService();
