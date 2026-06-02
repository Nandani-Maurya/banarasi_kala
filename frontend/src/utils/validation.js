// Input Validation Utilities

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  const re = /^(?:\+91|0)?[6-9]\d{9}$/;
  return re.test(phone);
};

export const validatePincode = (pincode) => {
  // Indian pincode validation (6 digits)
  const re = /^[1-9][0-9]{5}$/;
  return re.test(pincode);
};

export const validateRequired = (value) => {
  return value && value.trim().length > 0;
};

export const validateCheckoutForm = (formData) => {
  const errors = {};

  if (!validateRequired(formData.fullName)) {
    errors.fullName = 'Full name is required';
  }

  if (!validateRequired(formData.email)) {
    errors.email = 'Email is required';
  } else if (!validateEmail(formData.email)) {
    errors.email = 'Please enter a valid email';
  }

  if (!validateRequired(formData.phone)) {
    errors.phone = 'Phone number is required';
  } else if (!validatePhone(formData.phone)) {
    errors.phone = 'Please enter a valid phone number';
  }

  if (!validateRequired(formData.address)) {
    errors.address = 'Address is required';
  }

  if (!validateRequired(formData.city)) {
    errors.city = 'City is required';
  }

  if (!validateRequired(formData.pincode)) {
    errors.pincode = 'Pincode is required';
  } else if (!validatePincode(formData.pincode)) {
    errors.pincode = 'Please enter a valid 6-digit pincode';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export default {
  validateEmail,
  validatePhone,
  validatePincode,
  validateRequired,
  validateCheckoutForm
};
