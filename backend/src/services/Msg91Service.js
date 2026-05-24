const { config } = require("../config/env");

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits.replace(/^0+/, "");
};

const findValueDeep = (input, keys) => {
  if (!input || typeof input !== "object") return "";
  for (const [key, value] of Object.entries(input)) {
    if (keys.includes(key.toLowerCase()) && value !== undefined && value !== null) {
      return String(value);
    }
    if (typeof value === "object") {
      const nested = findValueDeep(value, keys);
      if (nested) return nested;
    }
  }
  return "";
};

class Msg91Service {
  normalizePhone(value) {
    return normalizePhone(value);
  }

  isVerifiedResponse(data) {
    const type = String(data?.type || data?.status || data?.message || "").toLowerCase();
    return Boolean(
      data?.success === true ||
        data?.verified === true ||
        data?.data?.success === true ||
        data?.data?.verified === true ||
        type.includes("success") ||
        type.includes("verified"),
    );
  }

  async verifyAccessToken({ accessToken, phone }) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length !== 10) {
      throw new Error("Please enter a valid 10 digit mobile number.");
    }

    if (!config.requireMsg91Otp && !accessToken) {
      return { verified: true, phone: normalizedPhone, mode: "dev" };
    }

    if (!accessToken) {
      throw new Error("Phone OTP verification is required.");
    }

    if (!config.msg91AuthKey) {
      throw new Error("OTP service is not configured. Please contact support.");
    }

    const response = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        authkey: config.msg91AuthKey,
        "access-token": accessToken,
      }),
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok || !this.isVerifiedResponse(data)) {
      const rawMessage = String(data?.message || data?.error || "").toLowerCase();
      if (rawMessage.includes("block") || rawMessage.includes("throttle") || rawMessage.includes("limit")) {
        const err = new Error("OTP attempts exceeded. Please try again after 24 hours or contact support.");
        err.code = "OTP_RATE_LIMITED";
        throw err;
      }
      throw new Error("Phone OTP verification failed. Please try again.");
    }

    const verifiedIdentifier = findValueDeep(data, [
      "identifier",
      "mobile",
      "phone",
      "phonenumber",
      "phone_number",
    ]);
    const verifiedPhone = normalizePhone(verifiedIdentifier);

    if (verifiedPhone && verifiedPhone !== normalizedPhone) {
      throw new Error("Verified phone number does not match.");
    }

    return { verified: true, phone: normalizedPhone, data };
  }
}

module.exports = new Msg91Service();
