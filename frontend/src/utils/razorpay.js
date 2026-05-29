const getIndianMobile = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  const mobile = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(mobile) ? mobile : "";
};

export const buildRazorpayPrefill = ({ name, email, phone }) => {
  const prefill = {};
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();
  const cleanPhone = getIndianMobile(phone);

  if (cleanName) prefill.name = cleanName;
  if (cleanEmail) prefill.email = cleanEmail;
  if (cleanPhone) prefill.contact = cleanPhone;

  return prefill;
};
