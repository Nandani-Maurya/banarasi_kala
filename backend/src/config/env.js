const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(__dirname, "../../.env"),
});

const normalize = (value, fallback = "") => String(value || fallback).trim();

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const rawAppMode = normalize(process.env.APP_MODE, "dev").toLowerCase();
const appMode = rawAppMode === "prod" ? "prod" : "dev";
const nodeEnv = appMode === "prod" ? "production" : "development";
const databaseUrl = normalize(process.env.DATABASE_URL);

process.env.NODE_ENV = nodeEnv;

const config = {
  nodeEnv,
  appMode,
  isDevelopment: appMode === "dev",
  isProduction: appMode === "prod",
  requirePhoneOtp: appMode === "prod",
  port: Number(process.env.PORT || 5003),
  databaseUrl,
  dbSchema: normalize(process.env.DB_SCHEMA, "vns_saree"),
  // Purani line ko hata kar yeh likhein:
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(url => url.trim())
    : ["https://banarasi-kala.vercel.app", "http://localhost:3000", "http://localhost:5173"],
  welcomeBonus: Number(process.env.WELCOME_BONUS || 50),
  referralSignupBonus: Number(process.env.REFERRAL_SIGNUP_BONUS || 100),
  referralOrderBonus: Number(process.env.REFERRAL_ORDER_BONUS || 50),
  referralOrderDelayDays: Number(process.env.REFERRAL_ORDER_DELAY_DAYS || 7),
  referralMilestoneCount: Number(process.env.REFERRAL_MILESTONE_COUNT || 3),
  referralMilestoneBonus: Number(process.env.REFERRAL_MILESTONE_BONUS || 1000),
  firebaseProjectId: normalize(process.env.FIREBASE_PROJECT_ID),
  firebaseClientEmail: normalize(process.env.FIREBASE_CLIENT_EMAIL),
  firebasePrivateKey: normalize(process.env.FIREBASE_PRIVATE_KEY),
};

module.exports = { config, parseBoolean };
