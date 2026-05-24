import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import headerBackground from "../../assets/header_backgroung.png";
import { API_ENDPOINTS } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import "./Auth.css";

const strengthLabels = ["Weak", "Moderate", "Strong", "Very Strong"];
const SUPPORT_MESSAGE = "Something went wrong. Please contact support or try again later.";
const OTP_SEND_LIMIT = 3;
const OTP_DIGIT_COUNT = Number(import.meta.env.VITE_MSG91_OTP_LENGTH || 4);

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits.replace(/^0+/, "");
};

const findMsg91ValueDeep = (input, keys) => {
  if (!input) return "";
  if (typeof input === "string") {
    const trimmed = input.trim();
    return /^[A-Za-z0-9_.-]{16,}$/.test(trimmed) ? trimmed : "";
  }
  if (typeof input !== "object") return "";
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, "");
    if (keys.includes(normalizedKey) && value !== undefined && value !== null) {
      return String(value).trim();
    }
    const nested = findMsg91ValueDeep(value, keys);
    if (nested) return nested;
  }
  return "";
};

const getAccessTokenFromMsg91 = (detail) =>
  findMsg91ValueDeep(detail, ["accesstoken", "jwt", "token", "jwttoken"]);

const getRequestIdFromMsg91 = (detail) =>
  findMsg91ValueDeep(detail, ["reqid", "requestid", "request", "otprequestid", "messageid"]);

const getMsg91Text = (detail) =>
  detail?.message ||
  detail?.error ||
  detail?.data?.message ||
  detail?.data?.error ||
  detail?.response?.message ||
  "";

const getFriendlyError = (error, fallback = SUPPORT_MESSAGE) => {
  const message = String(error?.message || error || "");
  const lower = message.toLowerCase();
  if (lower.includes("already registered")) return message;
  if (lower.includes("otp token was not returned")) return "Phone verification could not be completed. Please try again or contact support.";
  if (lower.includes("phone otp verification is required")) return "Phone verification could not be completed. Please try again or contact support.";
  if (lower.includes("phone otp verification failed")) return "Phone OTP verification failed. Please retry OTP or contact support.";
  if (lower.includes("invalid email or password")) return "Email/phone or password is incorrect.";
  if (lower.includes("no account found")) return "No account found with this phone number.";
  if (lower.includes("valid 10 digit")) return "Please enter a valid 10 digit mobile number.";
  if (lower.includes("exceeded") || lower.includes("blocked") || lower.includes("throttle")) {
    return "OTP attempts exceeded. Please try again after 24 hours or contact support.";
  }
  return fallback;
};

const AuthField = ({
  icon,
  label,
  name,
  type = "text",
  value,
  placeholder,
  onChange,
  required = true,
  rightAction,
  leftAddon,
  maxLength,
  inputMode,
}) => (
  <label className="auth-field">
    <span className="auth-label">{label}</span>
    <span className={leftAddon ? "auth-input-wrap has-left-addon" : "auth-input-wrap"}>
      {leftAddon || <Icon icon={icon} />}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
      />
      {rightAction}
    </span>
  </label>
);

const OtpBoxes = ({ value, length, onChange, disabled }) => {
  const inputRefs = useRef([]);
  const digits = Array.from({ length }, (_, index) => value[index] || "");

  const updateDigit = (index, rawValue) => {
    const nextDigit = rawValue.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[index] = nextDigit;
    onChange(next.join(""));
    if (nextDigit && index < length - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="auth-otp-boxes" style={{ "--otp-digits": length }} onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={`otp-${index}`}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          value={digit}
          disabled={disabled}
          maxLength={1}
          onChange={(event) => updateDigit(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          aria-label={`OTP digit ${index + 1}`}
        />
      ))}
    </div>
  );
};

const Auth = () => {
  const appMode = (import.meta.env.VITE_APP_MODE || "dev").toLowerCase();
  const canBypassOtp = appMode !== "prod";
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [pendingOtpAction, setPendingOtpAction] = useState(null);
  const [otpStep, setOtpStep] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSendAttempts, setOtpSendAttempts] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetOtpToken, setResetOtpToken] = useState("");
  const [signupOtpToken, setSignupOtpToken] = useState("");
  const [signupVerifiedPhone, setSignupVerifiedPhone] = useState("");

  const { login, signup, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginData, setLoginData] = useState({
    identifier: "",
    password: "",
    keepLoggedIn: false,
  });
  const [signupData, setSignupData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    referral_code: "",
  });
  const [forgotPasswordData, setForgotPasswordData] = useState({
    phone: "",
    newPassword: "",
    confirmPassword: "",
  });
  const alertRef = useRef(null);

  const showError = (message) => {
    setSuccess("");
    setError(message);
  };

  useEffect(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [activeTab]);

  useEffect(() => {
    if (!error) return;
    window.requestAnimationFrame(() => {
      alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [error]);

  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || "/";
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "signup") {
      switchMode("signup");
      return;
    }
    if (params.get("mode") === "forgot") {
      switchMode("forgotPassword");
      return;
    }
    if (params.has("refresh")) switchMode("login");
  }, [location.search]);

  useEffect(() => {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref) setSignupData((prev) => ({ ...prev, referral_code: ref }));
  }, [location.search]);

  useEffect(() => {
    const refreshAuthCard = () => switchMode("login");
    window.addEventListener("auth:refresh", refreshAuthCard);
    return () => window.removeEventListener("auth:refresh", refreshAuthCard);
  }, []);

  useEffect(() => {
    const onOtpSuccess = (event) => {
      const token = getAccessTokenFromMsg91(event.detail);
      if (!pendingOtpAction || otpStep) return;
      if (!token) {
        setOtpLoading(false);
        setPendingOtpAction(null);
        showError("Phone verification could not be completed. Please contact support or try again later.");
        console.warn("[Auth] MSG91 success did not include access token:", event.detail);
        return;
      }
      finishOtpAction(pendingOtpAction, token);
    };

    const onOtpFailure = (event) => {
      setOtpLoading(false);
      setPendingOtpAction(null);
      showError(getFriendlyError(event.detail, "Phone OTP verification failed. Please try again."));
    };

    window.addEventListener("msg91:otp-success", onOtpSuccess);
    window.addEventListener("msg91:otp-failure", onOtpFailure);
    return () => {
      window.removeEventListener("msg91:otp-success", onOtpSuccess);
      window.removeEventListener("msg91:otp-failure", onOtpFailure);
    };
  }, [pendingOtpAction, otpStep, signupData, forgotPasswordData]);

  const authCopy = useMemo(() => {
    if (activeTab === "signup") {
      return {
        title: "Create Account",
        subtitle: "Add your details and verify your phone once.",
      };
    }
    if (activeTab === "forgotPassword") {
      return {
        title: "Reset Password",
        subtitle: "Enter your registered mobile number to verify ownership.",
      };
    }
    if (activeTab === "resetPassword") {
      return {
        title: "Create New Password",
        subtitle: "Your phone is verified. Set a secure new password.",
      };
    }
    return {
      title: "Welcome Back",
       subtitle: "Please entre your details",
    };
  }, [activeTab]);

  function switchMode(mode) {
    setActiveTab(mode);
    setError("");
    setSuccess("");
    setPendingOtpAction(null);
    setOtpStep(null);
    setOtpCode("");
    setOtpLoading(false);
    setAnimationKey((key) => key + 1);
  }

  const updateStrength = (value) => {
    let strength = 0;
    if (value.length >= 6) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;
    setPasswordStrength(strength);
  };

  const handleLoginChange = (event) => {
    const { name, value, type, checked } = event.target;
    setLoginData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSignupChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === "phone" ? normalizePhone(value) : value;
    setSignupData((prev) => ({ ...prev, [name]: nextValue }));
    if (name === "phone" && nextValue !== signupVerifiedPhone) {
      setSignupOtpToken("");
      setSignupVerifiedPhone("");
    }
    if (name === "password") updateStrength(value);
  };

  const validateSignup = () => {
    if (!signupData.name.trim()) return "Please enter your full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.email.trim())) return "Please enter a valid email address.";
    if (!/^[6-9]\d{9}$/.test(normalizePhone(signupData.phone))) return "Please enter a valid 10 digit mobile number.";
    if (signupData.password.length < 6) return "Password must be at least 6 characters.";
    return "";
  };

  const getOtpAttemptKey = (action, phone) => `${action}:${normalizePhone(phone)}`;

  const getOtpAttemptsLeft = (action, phone) => {
    const used = otpSendAttempts[getOtpAttemptKey(action, phone)] || 0;
    return Math.max(OTP_SEND_LIMIT - used, 0);
  };

  const waitForMsg91Method = (methodName) =>
    new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (typeof window[methodName] === "function") {
          resolve(window[methodName]);
          return;
        }
        if (Date.now() - startedAt > 800) {
          resolve(null);
          return;
        }
        window.setTimeout(check, 50);
      };
      check();
    });

  const startMsg91Otp = async (action, phone) => {
    const cleanPhone = normalizePhone(phone);
    const attemptKey = getOtpAttemptKey(action, cleanPhone);
    const attemptsLeft = getOtpAttemptsLeft(action, cleanPhone);
    setError("");
    setSuccess("");
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setError("Please enter a valid 10 digit mobile number.");
      return;
    }
    if (attemptsLeft <= 0) {
      setError("OTP attempts exceeded. Please try again after 24 hours or contact support.");
      return;
    }

    setOtpLoading(true);
    setPendingOtpAction(action);
    setOtpSendAttempts((prev) => ({ ...prev, [attemptKey]: (prev[attemptKey] || 0) + 1 }));

    if (typeof window.initSendOTP !== "function") {
      if (canBypassOtp) {
        await finishOtpAction(action, "");
        return;
      }
      setOtpLoading(false);
      setPendingOtpAction(null);
      setError("OTP service is not available right now. Please contact support.");
      return;
    }

    const configuration = {
      ...(window.configuration || {}),
      identifier: `91${cleanPhone}`,
      exposeMethods: true,
    };
    window.initSendOTP(configuration);

    const sendOtp = await waitForMsg91Method("sendOtp");
    if (sendOtp) {
      sendOtp(
        `91${cleanPhone}`,
        (data) => {
          const requestId = getRequestIdFromMsg91(data);
          setOtpLoading(false);
          if (!requestId) {
            setPendingOtpAction(null);
            showError("OTP request could not be completed. Please try again or contact support.");
            console.warn("[Auth] MSG91 sendOtp did not include reqId:", data);
            return;
          }
          setOtpStep({ action, phone: cleanPhone, requestId });
          setSuccess(`OTP sent successfully. ${getOtpAttemptsLeft(action, cleanPhone) - 1} resend attempt(s) left.`);
        },
        (err) => {
          setOtpLoading(false);
          setPendingOtpAction(null);
          setError(getFriendlyError(getMsg91Text(err) || err, "Unable to send OTP. Please try again or contact support."));
        },
      );
      return;
    }

    setOtpLoading(false);
    setPendingOtpAction(null);
    setError("OTP service is not available right now. Please contact support.");
  };

  const handleVerifyOtpCode = async (event) => {
    event.preventDefault();
    const code = String(otpCode || "").replace(/\D/g, "");
    setError("");
    setSuccess("");
    if (!otpStep) return;
    if (code.length !== OTP_DIGIT_COUNT) {
      setError("Please enter a valid OTP.");
      return;
    }
    if (!otpStep.requestId) {
      setOtpStep(null);
      setOtpCode("");
      setPendingOtpAction(null);
      setError("OTP request expired. Please send OTP again.");
      return;
    }

    setOtpLoading(true);
    const verifyOtp = await waitForMsg91Method("verifyOtp");
    if (!verifyOtp) {
      setOtpLoading(false);
      if (canBypassOtp) {
        await finishOtpAction(otpStep.action, "");
        return;
      }
      setError("OTP service is not available right now. Please contact support.");
      return;
    }

    verifyOtp(
      code,
      async (data) => {
        const token = getAccessTokenFromMsg91(data);
        if (!token) {
          setOtpLoading(false);
          setOtpStep(null);
          setOtpCode("");
          setPendingOtpAction(null);
          setError("Phone verification could not be completed. Please contact support or try again later.");
          console.warn("[Auth] MSG91 verify did not include access token:", data);
          return;
        }
        await finishOtpAction(otpStep.action, token);
      },
      (err) => {
        setOtpLoading(false);
        setOtpStep(null);
        setOtpCode("");
        setPendingOtpAction(null);
        setError(getFriendlyError(getMsg91Text(err) || err, "Invalid OTP. Please try again."));
      },
      otpStep.requestId,
    );
  };

  const handleResendOtp = () => {
    if (!otpStep || otpLoading) return;
    setOtpCode("");
    startMsg91Otp(otpStep.action, otpStep.phone);
  };

  const finishOtpAction = async (action, accessToken) => {
    setLoading(true);
    setOtpLoading(false);
    try {
      if (action === "signup") {
        setSignupOtpToken(accessToken);
        setSignupVerifiedPhone(normalizePhone(signupData.phone));
        setSuccess("Phone verified successfully. You can sign up now.");
        return;
      }

      if (action === "reset") {
        setResetOtpToken(accessToken);
        switchMode("resetPassword");
        setSuccess("Phone verified. Set your new password.");
      }
    } catch (err) {
      console.error("[Auth] OTP action failed:", err);
      setError(getFriendlyError(err, err?.message || SUPPORT_MESSAGE));
    } finally {
      setPendingOtpAction(null);
      setOtpStep(null);
      setOtpCode("");
      setLoading(false);
    }
  };

  const onLogin = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(loginData.identifier, loginData.password, loginData.keepLoggedIn);
    } catch (err) {
      console.error("[Auth] login failed:", err);
      setError(getFriendlyError(err, "Unable to login right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (event) => {
    event.preventDefault();
    const validationError = validateSignup();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!signupOtpToken || signupVerifiedPhone !== normalizePhone(signupData.phone)) {
      setError("Please verify your phone number before signing up.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await signup({
        ...signupData,
        phone: normalizePhone(signupData.phone),
        email: signupData.email.trim().toLowerCase(),
        msg91_access_token: signupOtpToken,
      });
      setSuccess("Account created successfully.");
    } catch (err) {
      console.error("[Auth] signup failed:", err);
      setError(getFriendlyError(err, "Unable to create account right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setError("");
    const phone = normalizePhone(forgotPasswordData.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Please enter a valid 10 digit mobile number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed");
      setSuccess(data.message || "Account found. Verify phone OTP to continue.");
      await startMsg91Otp("reset", phone);
    } catch (err) {
      console.error("[Auth] forgot password failed:", err);
      setError(getFriendlyError(err, "Unable to start password reset. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setError("");
    if (forgotPasswordData.newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (forgotPasswordData.newPassword !== forgotPasswordData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizePhone(forgotPasswordData.phone),
          msg91_access_token: resetOtpToken,
          newPassword: forgotPasswordData.newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Reset failed");
      setForgotPasswordData({ phone: "", newPassword: "", confirmPassword: "" });
      setResetOtpToken("");
      switchMode("login");
      setSuccess("Password reset successfully. You can login now.");
    } catch (err) {
      console.error("[Auth] password reset failed:", err);
      setError(getFriendlyError(err, "Unable to reset password right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page" style={{ "--auth-bg": `url(${headerBackground})` }}>
      <section className="auth-panel" key={animationKey}>
        <header className="auth-heading">
          <h1>{authCopy.title}</h1>
          <p>{authCopy.subtitle}</p>
        </header>

        {error ? (
          <div ref={alertRef} className="auth-alert auth-alert-error">{error}</div>
        ) : success ? (
          <div className="auth-alert auth-alert-success">{success}</div>
        ) : null}

        {activeTab === "login" && (
          <form className="auth-form" onSubmit={onLogin}>
            <AuthField
              icon="lucide:user-round"
              label="Email or mobile number"
              name="identifier"
              value={loginData.identifier}
              placeholder="Enter email or mobile number"
              onChange={handleLoginChange}
            />
            <AuthField
              icon="lucide:lock"
              label="Password"
              name="password"
              type={showLoginPassword ? "text" : "password"}
              value={loginData.password}
              placeholder="Enter your password"
              onChange={handleLoginChange}
              rightAction={
                <button type="button" className="auth-eye" onClick={() => setShowLoginPassword((value) => !value)}>
                  <Icon icon={showLoginPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />
            <div className="auth-row">
              <label className="auth-remember auth-remember-pill">
                <input type="checkbox" name="keepLoggedIn" checked={loginData.keepLoggedIn} onChange={handleLoginChange} />
                <span><Icon icon="lucide:check" /> Keep me logged in</span>
              </label>
              <button type="button" onClick={() => switchMode("forgotPassword")}>Forgot Password?</button>
            </div>
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Please wait..." : "Login"}
            </button>
            <div className="auth-divider"><span /><em>or</em><span /></div>
            <button type="button" className="auth-secondary" onClick={() => switchMode("signup")}>
              <Icon icon="lucide:user-plus" />
              Create New Account
            </button>
          </form>
        )}

        {activeTab === "signup" && (
          <form className="auth-form auth-form-compact" onSubmit={onSignup}>
            <AuthField icon="lucide:user" label="Full Name" name="name" value={signupData.name} placeholder="Enter your full name" onChange={handleSignupChange} />
            <AuthField icon="lucide:mail" label="Email Address" name="email" type="email" value={signupData.email} placeholder="Enter your email" onChange={handleSignupChange} />
            <div className="auth-phone-verify">
              <AuthField
                icon="lucide:phone"
                label="Phone Number"
                name="phone"
                value={signupData.phone}
                placeholder="Enter 10 digit mobile number"
                onChange={handleSignupChange}
                inputMode="tel"
                maxLength={11}
                leftAddon={<span className="auth-country-code"><span className="auth-flag-india" aria-hidden="true" />+91</span>}
              />
              <button
                type="button"
                className={signupVerifiedPhone === normalizePhone(signupData.phone) ? "auth-verify-link is-verified" : "auth-verify-link"}
                onClick={() => startMsg91Otp("signup", signupData.phone)}
                disabled={otpLoading || signupVerifiedPhone === normalizePhone(signupData.phone)}
              >
                <Icon icon={signupVerifiedPhone === normalizePhone(signupData.phone) ? "lucide:badge-check" : "lucide:shield-check"} />
                {signupVerifiedPhone === normalizePhone(signupData.phone) ? "Phone verified" : "Verify phone"}
              </button>
            </div>
            <div className="auth-referral-field">
              <AuthField icon="lucide:gift" label="Referral Code (optional)" name="referral_code" value={signupData.referral_code} placeholder="Have a referral code?" onChange={handleSignupChange} required={false} />
            </div>
            <AuthField
              icon="lucide:lock"
              label="Password"
              name="password"
              type={showSignupPassword ? "text" : "password"}
              value={signupData.password}
              placeholder="Create a password"
              onChange={handleSignupChange}
              rightAction={
                <button type="button" className="auth-eye" onClick={() => setShowSignupPassword((value) => !value)}>
                  <Icon icon={showSignupPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />
            <div className="auth-strength" aria-label="Password strength">
              {[1, 2, 3, 4].map((level) => (
                <span key={level} className={level <= passwordStrength ? `is-level-${passwordStrength}` : ""} />
              ))}
              <strong>{passwordStrength ? strengthLabels[passwordStrength - 1] : "Enter Password"}</strong>
            </div>
            <label className="auth-consent">
              <input type="checkbox" required />
              <span className="auth-consent-box">
                <Icon icon="lucide:check" />
                <span className="auth-consent-text">
                  I agree to the <Link to="/terms-conditions">Terms &amp; Conditions</Link> and <Link to="/privacy-policy">Privacy Policy</Link>
                </span>
              </span>
            </label>
            <button type="submit" disabled={loading || otpLoading} className="auth-primary">
              {loading ? "Signing up..." : "Sign Up"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>Back to Login</button>
          </form>
        )}

        {activeTab === "forgotPassword" && (
          <form className="auth-form" onSubmit={handleForgotPassword}>
            <AuthField
              icon="lucide:phone"
              label="Registered Mobile Number"
              value={forgotPasswordData.phone}
              placeholder="Enter 10 digit mobile number"
              onChange={(event) => setForgotPasswordData((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))}
              inputMode="tel"
              maxLength={11}
              leftAddon={<span className="auth-country-code"><span className="auth-flag-india" aria-hidden="true" />+91</span>}
            />
            <button type="submit" disabled={loading || otpLoading} className="auth-primary">
              {loading || otpLoading ? "Verifying..." : "Verify Phone OTP"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>Back to Login</button>
          </form>
        )}

        {activeTab === "resetPassword" && (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <AuthField
              icon="lucide:lock"
              label="New Password"
              type={showResetPassword ? "text" : "password"}
              value={forgotPasswordData.newPassword}
              placeholder="Enter new password"
              onChange={(event) => setForgotPasswordData((prev) => ({ ...prev, newPassword: event.target.value }))}
              rightAction={
                <button type="button" className="auth-eye" onClick={() => setShowResetPassword((value) => !value)}>
                  <Icon icon={showResetPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />
            <AuthField
              icon="lucide:lock-keyhole"
              label="Confirm Password"
              type={showResetPassword ? "text" : "password"}
              value={forgotPasswordData.confirmPassword}
              placeholder="Confirm new password"
              onChange={(event) => setForgotPasswordData((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {otpStep && (
          <div className="auth-otp-modal" role="dialog" aria-modal="true" aria-label="Verify OTP">
            <form className="auth-otp-sheet" onSubmit={handleVerifyOtpCode}>
              <button
                type="button"
                className="auth-otp-close"
                onClick={() => {
                  setOtpStep(null);
                  setOtpCode("");
                  setOtpLoading(false);
                  setPendingOtpAction(null);
                }}
                aria-label="Close OTP"
              >
                <Icon icon="lucide:x" />
              </button>
              <div className="auth-otp-card">
                <strong>Verify Phone OTP</strong>
                <span className="auth-otp-phone">+91 {otpStep.phone}</span>
                <OtpBoxes
                  value={otpCode}
                  length={OTP_DIGIT_COUNT}
                  disabled={loading || otpLoading}
                  onChange={(value) => setOtpCode(value.replace(/\D/g, "").slice(0, OTP_DIGIT_COUNT))}
                />
                <p>
                  {getOtpAttemptsLeft(otpStep.action, otpStep.phone)} resend attempt(s) left. OTP expires in 15 minutes.
                </p>
              </div>
              <button type="submit" disabled={loading || otpLoading} className="auth-primary">
                {loading || otpLoading ? "Verifying..." : "Verify OTP"}
              </button>
              <div className="auth-otp-actions">
                <button type="button" onClick={handleResendOtp} disabled={otpLoading || getOtpAttemptsLeft(otpStep.action, otpStep.phone) <= 0}>
                  Resend OTP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep(null);
                    setOtpCode("");
                    setPendingOtpAction(null);
                  }}
                >
                  Change number
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
};

export default Auth;
