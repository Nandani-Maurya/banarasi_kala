const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Customer = require("../models/Customer");
const Admin = require("../models/Admin");
const { Op } = require("sequelize");
const WalletService = require("./WalletService");
const { config } = require("../config/env");
const Msg91Service = require("./Msg91Service");

const generateReferralCode = () =>
  `VNS${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizePhone = (value) => Msg91Service.normalizePhone(value);
const possiblePhoneValues = (phone) => {
  const normalized = normalizePhone(phone);
  return [...new Set([normalized, `0${normalized}`, `91${normalized}`, `+91${normalized}`].filter(Boolean))];
};

class AuthService {
  async register(userData) {
    const { name, phone, email, password, referral_code, msg91_access_token } = userData;
    const cleanName = String(name || "").trim();
    const cleanEmail = normalizeEmail(email);
    const cleanPhone = normalizePhone(phone);

    if (!cleanName) throw new Error("Name is required.");
    if (!cleanEmail) throw new Error("Email is required for registration.");
    if (!cleanPhone || cleanPhone.length !== 10) throw new Error("Please enter a valid 10 digit mobile number.");
    if (!password || String(password).length < 6) throw new Error("Password must be at least 6 characters.");

    await Msg91Service.verifyAccessToken({ accessToken: msg91_access_token, phone: cleanPhone });

    const existingPhone = await Customer.findOne({ where: { phone: { [Op.in]: possiblePhoneValues(cleanPhone) } } });
    if (existingPhone) {
      throw new Error("Phone number already registered");
    }

    const existingEmail = await Customer.findOne({ where: { email: cleanEmail } });
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
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
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
    const identifier = String(email || "").trim();
    const normalizedPhone = normalizePhone(identifier);
    const where = identifier.includes("@")
      ? { email: normalizeEmail(identifier) }
      : { phone: { [Op.in]: possiblePhoneValues(normalizedPhone) } };
    const customer = await Customer.findOne({ where });
    if (!customer) {
      throw new Error("Invalid email or password");
    }

    const isMatch = await bcrypt.compare(password, customer.password);
    if (!isMatch) {
      throw new Error("Invalid email or password");
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

  async startPasswordReset(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length !== 10) throw new Error("Please enter a valid 10 digit mobile number.");
    const user = await Customer.findOne({ where: { phone: { [Op.in]: possiblePhoneValues(cleanPhone) } } });
    if (!user) throw new Error("No account found with this phone number.");
    return {
      message: "Account found. Please verify phone OTP to reset password.",
      phone: cleanPhone,
      maskedPhone: `******${cleanPhone.slice(-4)}`,
    };
  }

  async verifyResetPhone(phone, msg91AccessToken) {
    const cleanPhone = normalizePhone(phone);
    const user = await Customer.findOne({ where: { phone: { [Op.in]: possiblePhoneValues(cleanPhone) } } });
    if (!user) throw new Error("No account found with this phone number.");
    await Msg91Service.verifyAccessToken({ accessToken: msg91AccessToken, phone: cleanPhone });
    return { message: "Phone verified. You can set a new password." };
  }

  async resetPasswordWithMsg91(phone, msg91AccessToken, newPassword) {
    const cleanPhone = normalizePhone(phone);
    const user = await Customer.findOne({ where: { phone: { [Op.in]: possiblePhoneValues(cleanPhone) } } });
    if (!user) throw new Error("No account found with this phone number.");
    if (!newPassword || String(newPassword).length < 6) throw new Error("Password must be at least 6 characters.");
    await Msg91Service.verifyAccessToken({ accessToken: msg91AccessToken, phone: cleanPhone });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
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
