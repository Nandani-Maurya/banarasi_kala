#!/usr/bin/env node

const fs = require("fs");

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b(?:[a-fA-F0-9]{1,4}:){2,7}[a-fA-F0-9]{1,4}\b/g;

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
};

const directIp = getArg("--ip");
const emailFile = getArg("--email-file");
const tokenName = getArg("--token-name") || "token";

let sourceText = args.join(" ");
if (emailFile) {
  try {
    sourceText += `\n${fs.readFileSync(emailFile, "utf8")}`;
  } catch (error) {
    console.error(`Could not read email file: ${error.message}`);
    process.exit(1);
  }
}

const matches = [
  directIp,
  ...(sourceText.match(IPV4) || []),
  ...(sourceText.match(IPV6) || []),
].filter(Boolean);

const uniqueIps = [...new Set(matches)];

if (!uniqueIps.length) {
  console.log("No IP found.");
  console.log("Usage:");
  console.log("  node backend/scripts/msg91-unblock-ip-helper.js --ip 2405:201:6022:e04a:92a7:8c6e:33e0:9fee");
  console.log("  node backend/scripts/msg91-unblock-ip-helper.js --email-file ./msg91-email.txt");
  process.exit(0);
}

console.log("\nMSG91 OTP Widget IP Unblock Helper");
console.log("==================================");
console.log(`Token name: ${tokenName}`);
console.log(`Blocked IP(s): ${uniqueIps.join(", ")}`);
console.log("\nImportant:");
console.log("- MSG91 does not document a public API for unblocking OTP Widget token-throttle IPs.");
console.log("- Unblock/whitelist is done from MSG91 dashboard > OTP > Tokens > token settings > IPs tab.");
console.log("\nManual steps:");
console.log("1. Login to MSG91 dashboard.");
console.log("2. Go to OTP > Tokens.");
console.log(`3. Open settings for token: ${tokenName}.`);
console.log("4. Open the IPs tab.");
console.log("5. Search/copy the blocked IP above.");
console.log("6. Change it from Temporary Block to Whitelisted, or remove the block if MSG91 shows that action.");
console.log("7. If MSG91 does not show an unblock action, wait for the configured block duration, usually 86400 seconds.");
console.log("\nFor testing:");
console.log("- Lower throttle temporarily only in a test widget/token.");
console.log("- Keep production token throttle conservative and avoid repeated resend clicks.");
