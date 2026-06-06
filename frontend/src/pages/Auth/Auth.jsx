import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import headerBackground from "../../assets/header_backgroung.png";
import { API_ENDPOINTS } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { getApiErrorMessage } from "../../utils/error";
import { numberEnv } from "../../utils/env";
import "./Auth.css";

const strengthLabels = ["Weak", "Moderate", "Strong", "Very Strong"];
const SUPPORT_MESSAGE = "Something went wrong. Please contact support or try again later.";
const OTP_SEND_LIMIT = 3;
const EMAIL_OTP_DIGIT_COUNT = numberEnv("VITE_EMAIL_OTP_LENGTH");

const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits.replace(/^0+/, "");
};

const getFriendlyError = (error, fallback = SUPPORT_MESSAGE) => {
  const message = getApiErrorMessage(error, fallback);
  const lower = message.toLowerCase();
  if (lower.includes("already registered")) return message;
  if (lower.includes("invalid email or password")) return "Email/phone or password is incorrect.";
  if (lower.includes("no account found")) return message;
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
  rightAction,
  leftAddon,
  maxLength,
  inputMode,
  error,
}) => (
  <div className="auth-field">
    <span className="auth-label">{label}</span>
    <span className={`auth-input-wrap${leftAddon ? " has-left-addon" : ""}${error ? " has-error" : ""}`}>
      {leftAddon || <Icon icon={icon} />}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={name}
      />
      {rightAction}
    </span>
    {error && <span className="auth-field-error">{error}</span>}
  </div>
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
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          value={digit}
          disabled={disabled}
          maxLength={1}
          onChange={(e) => updateDigit(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          aria-label={`OTP digit ${index + 1}`}
        />
      ))}
    </div>
  );
};

const Auth = () => {
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSendAttempts, setOtpSendAttempts] = useState({});
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetOtpToken, setResetOtpToken] = useState("");
  const [signupOtpToken, setSignupOtpToken] = useState("");
  const [emailOtpSessionToken, setEmailOtpSessionToken] = useState("");
  const [signupVerifiedEmail, setSignupVerifiedEmail] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

  // Per-field validation errors
  const [loginErrors, setLoginErrors] = useState({});
  const [signupErrors, setSignupErrors] = useState({});
  const [forgotErrors, setForgotErrors] = useState({});
  const [resetErrors, setResetErrors] = useState({});

  const { login, signup, user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginData, setLoginData] = useState({ identifier: "", password: "", keepLoggedIn: false });
  const [signupData, setSignupData] = useState({ name: "", phone: "", email: "", password: "", referral_code: "" });
  const [forgotPasswordData, setForgotPasswordData] = useState({ email: "", newPassword: "", confirmPassword: "" });

  const alertRef = useRef(null);
  const activeOtpDigitCount = EMAIL_OTP_DIGIT_COUNT;

  useEffect(() => {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }, [activeTab]);

  useEffect(() => {
    if (!apiError) return;
    window.requestAnimationFrame(() => alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [apiError]);

  useEffect(() => {
    if (user) {
      const mode = new URLSearchParams(location.search).get("mode");
      if (mode === "forgot" || activeTab === "forgotPassword" || activeTab === "resetPassword") return;
      navigate(location.state?.from?.pathname || "/", { replace: true });
    }
  }, [user, navigate, location, activeTab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "signup") { switchMode("signup"); return; }
    if (params.get("mode") === "forgot") {
      switchMode("forgotPassword");
      const email = params.get("email");
      if (email) setForgotPasswordData((prev) => ({ ...prev, email }));
      return;
    }
    if (params.has("refresh")) switchMode("login");
  }, [location.search]);

  useEffect(() => {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref) setSignupData((prev) => ({ ...prev, referral_code: ref }));
  }, [location.search]);

  useEffect(() => {
    const handler = () => switchMode("login");
    window.addEventListener("auth:refresh", handler);
    return () => window.removeEventListener("auth:refresh", handler);
  }, []);

  const authCopy = useMemo(() => {
    if (activeTab === "signup") return { title: "Create Account", subtitle: "Add your details and verify your email once." };
    if (activeTab === "forgotPassword") return { title: "Reset Password", subtitle: "Enter your registered email to verify ownership." };
    if (activeTab === "resetPassword") return { title: "Create New Password", subtitle: "Your email is verified. Set a secure new password." };
    return { title: "Welcome Back", subtitle: "Please enter your details" };
  }, [activeTab]);

  function switchMode(mode) {
    setActiveTab(mode);
    setApiError("");
    setSuccess("");
    setOtpStep(null);
    setOtpCode("");
    setOtpError("");
    setOtpLoading(false);
    setLoginErrors({});
    setSignupErrors({});
    setForgotErrors({});
    setResetErrors({});
    setAnimationKey((k) => k + 1);
  }

  const updateStrength = (value) => {
    let s = 0;
    if (value.length >= 6) s++;
    if (/[A-Z]/.test(value)) s++;
    if (/[0-9]/.test(value)) s++;
    if (/[^A-Za-z0-9]/.test(value)) s++;
    setPasswordStrength(s);
  };

  const handleLoginChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (loginErrors[name]) setLoginErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSignupChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === "phone" ? normalizePhone(value) : value;
    setSignupData((prev) => ({ ...prev, [name]: nextValue }));
    if (signupErrors[name]) setSignupErrors((prev) => ({ ...prev, [name]: "" }));
    if (name === "email" && String(nextValue || "").trim().toLowerCase() !== signupVerifiedEmail) {
      setSignupOtpToken("");
      setSignupVerifiedEmail("");
    }
    if (name === "password") updateStrength(value);
  };

  // ── Validation helpers ──────────────────────────────────────
  const validateLogin = () => {
    const errors = {};
    if (!loginData.identifier.trim()) errors.identifier = "Please enter your email or mobile number.";
    if (!loginData.password) errors.password = "Please enter your password.";
    return errors;
  };

  const validateSignupFields = () => {
    const errors = {};
    if (!signupData.name.trim()) errors.name = "Please enter your full name.";
    if (!signupData.email.trim()) {
      errors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupData.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
    const phone = normalizePhone(signupData.phone);
    if (!phone) {
      errors.phone = "Please enter your mobile number.";
    } else if (!/^[6-9]\d{9}$/.test(phone)) {
      errors.phone = "Please enter a valid 10-digit mobile number (starting with 6–9).";
    }
    if (!signupData.password) {
      errors.password = "Please enter a password.";
    } else if (signupData.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }
    if (!consentChecked) {
      errors.consent = "Please accept the Terms & Conditions to continue.";
    }
    return errors;
  };

  const validateForgot = () => {
    const errors = {};
    const email = String(forgotPasswordData.email || "").trim();
    if (!email) errors.email = "Please enter your email address.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Please enter a valid email address.";
    return errors;
  };

  const validateReset = () => {
    const errors = {};
    if (!forgotPasswordData.newPassword) errors.newPassword = "Please enter a new password.";
    else if (forgotPasswordData.newPassword.length < 6) errors.newPassword = "Password must be at least 6 characters.";
    if (!forgotPasswordData.confirmPassword) errors.confirmPassword = "Please confirm your password.";
    else if (forgotPasswordData.newPassword !== forgotPasswordData.confirmPassword) errors.confirmPassword = "Passwords do not match.";
    return errors;
  };

  // ── OTP ────────────────────────────────────────────────────
  const getOtpAttemptKey = (action, email) => `${action}:${String(email || "").trim().toLowerCase()}`;
  const getOtpAttemptsLeft = (action, email) => Math.max(OTP_SEND_LIMIT - (otpSendAttempts[getOtpAttemptKey(action, email)] || 0), 0);

  const startEmailOtp = async (action, email, name = "") => {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const attemptKey = getOtpAttemptKey(action, cleanEmail);
    setApiError(""); setSuccess(""); setOtpError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setApiError("Please enter a valid email."); return; }
    if (getOtpAttemptsLeft(action, cleanEmail) <= 0) { setApiError("OTP attempts exceeded. Please try again after 24 hours or contact support."); return; }
    setOtpLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/send-email-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, purpose: action === "signup" ? "signup" : "forgot_password", name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send OTP");
      setEmailOtpSessionToken(data.token);
      setOtpSendAttempts((prev) => ({ ...prev, [attemptKey]: (prev[attemptKey] || 0) + 1 }));
      setOtpStep({ action, email: cleanEmail });
      setSuccess("OTP sent to your email.");
    } catch (err) {
      const message = getFriendlyError(err, "We could not send the OTP right now. Please try again.");
      if (otpStep) setOtpError(message); else setApiError(message);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtpCode = async (e) => {
    e.preventDefault();
    const code = String(otpCode || "").replace(/\D/g, "");
    setApiError(""); setSuccess(""); setOtpError("");
    if (!otpStep) return;
    if (code.length !== activeOtpDigitCount) { setOtpError("Please enter the complete OTP."); return; }
    try {
      setOtpLoading(true);
      const res = await fetch(`${API_ENDPOINTS.auth}/verify-email-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: emailOtpSessionToken, otp: code, purpose: otpStep.action === "signup" ? "signup" : "forgot_password" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "OTP verify failed");
      if (otpStep.action === "signup") { setSignupOtpToken(emailOtpSessionToken); setSignupVerifiedEmail(String(signupData.email || "").trim().toLowerCase()); }
      if (otpStep.action === "reset") { setResetOtpToken(emailOtpSessionToken); switchMode("resetPassword"); }
      setOtpStep(null); setOtpCode(""); setSuccess("Email OTP verified.");
    } catch (err) {
      setOtpError(getFriendlyError(err, "The OTP is incorrect or expired. Please try again."));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = () => {
    if (!otpStep || otpLoading) return;
    setOtpCode(""); setOtpError("");
    startEmailOtp(otpStep.action, otpStep.email, signupData.name);
  };

  // ── Handlers ───────────────────────────────────────────────
  const onLogin = async (e) => {
    e.preventDefault();
    const errors = validateLogin();
    if (Object.keys(errors).length) { setLoginErrors(errors); return; }
    setApiError(""); setLoading(true);
    try {
      await login(loginData.identifier, loginData.password, loginData.keepLoggedIn);
      showNotification("Login successfully", "success");
    } catch (err) {
      setApiError(getFriendlyError(err, "Unable to login right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (e) => {
    e.preventDefault();
    const errors = validateSignupFields();
    if (Object.keys(errors).length) { setSignupErrors(errors); return; }
    if (!signupOtpToken || signupVerifiedEmail !== signupData.email.trim().toLowerCase()) {
      setSignupErrors((prev) => ({ ...prev, email: "Please verify your email before signing up." }));
      return;
    }
    setApiError(""); setLoading(true);
    try {
      await signup({ ...signupData, phone: normalizePhone(signupData.phone), email: signupData.email.trim().toLowerCase(), email_otp_token: signupOtpToken });
      showNotification("Account created successfully", "success");
      setSuccess("Account created successfully.");
    } catch (err) {
      setApiError(getFriendlyError(err, "Unable to create account right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const errors = validateForgot();
    if (Object.keys(errors).length) { setForgotErrors(errors); return; }
    const email = String(forgotPasswordData.email || "").trim().toLowerCase();
    setApiError(""); setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Request failed");
      setSuccess(data.message || "Account found. Verify email OTP to continue.");
      await startEmailOtp("reset", email);
    } catch (err) {
      setApiError(getFriendlyError(err, "Unable to start password reset. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    const errors = validateReset();
    if (Object.keys(errors).length) { setResetErrors(errors); return; }
    setApiError(""); setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(forgotPasswordData.email || "").trim().toLowerCase(), email_otp_token: resetOtpToken, newPassword: forgotPasswordData.newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Reset failed");
      setForgotPasswordData({ email: "", newPassword: "", confirmPassword: "" });
      setResetOtpToken("");
      switchMode("login");
      setSuccess("Password reset successfully. You can login now.");
    } catch (err) {
      setApiError(getFriendlyError(err, "Unable to reset password right now. Please contact support or try again later."));
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

        {apiError && <div ref={alertRef} className="auth-alert auth-alert-error">{apiError}</div>}
        {!apiError && success && <div className="auth-alert auth-alert-success">{success}</div>}

        {/* ── Login ── */}
        {activeTab === "login" && (
          <form className="auth-form" onSubmit={onLogin} noValidate>
            <AuthField
              icon="lucide:user-round"
              label="Email or mobile number"
              name="identifier"
              value={loginData.identifier}
              placeholder="Enter email or mobile number"
              onChange={handleLoginChange}
              error={loginErrors.identifier}
            />
            <AuthField
              icon="lucide:lock"
              label="Password"
              name="password"
              type={showLoginPassword ? "text" : "password"}
              value={loginData.password}
              placeholder="Enter your password"
              onChange={handleLoginChange}
              error={loginErrors.password}
              rightAction={
                <button type="button" className="auth-eye" onClick={() => setShowLoginPassword((v) => !v)}>
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

        {/* ── Sign Up ── */}
        {activeTab === "signup" && (
          <form className="auth-form auth-form-compact" onSubmit={onSignup} noValidate>
            <AuthField
              icon="lucide:user"
              label="Full Name"
              name="name"
              value={signupData.name}
              placeholder="Enter your full name"
              onChange={handleSignupChange}
              error={signupErrors.name}
            />
            <div className="auth-verify-field">
              <AuthField
                icon="lucide:mail"
                label="Email Address"
                name="email"
                type="email"
                value={signupData.email}
                placeholder="Enter your email"
                onChange={handleSignupChange}
                error={signupErrors.email}
              />
              <button
                type="button"
                className={signupVerifiedEmail === signupData.email.trim().toLowerCase() ? "auth-verify-link is-verified" : "auth-verify-link"}
                onClick={() => startEmailOtp("signup", signupData.email, signupData.name)}
                disabled={otpLoading || signupVerifiedEmail === signupData.email.trim().toLowerCase()}
              >
                <Icon icon={signupVerifiedEmail === signupData.email.trim().toLowerCase() ? "lucide:badge-check" : "lucide:shield-check"} />
                {signupVerifiedEmail === signupData.email.trim().toLowerCase() ? "Email verified" : "Verify email"}
              </button>
            </div>
            <div className="auth-phone-verify">
              <AuthField
                icon="lucide:phone"
                label="Phone Number"
                name="phone"
                value={signupData.phone}
                placeholder="Enter 10 digit mobile number"
                onChange={handleSignupChange}
                inputMode="tel"
                maxLength={10}
                leftAddon={<span className="auth-country-code"><span className="auth-flag-india" aria-hidden="true" />+91</span>}
                error={signupErrors.phone}
              />
            </div>
            <div className="auth-referral-field">
              <AuthField
                icon="lucide:gift"
                label="Referral Code (optional)"
                name="referral_code"
                value={signupData.referral_code}
                placeholder="Have a referral code?"
                onChange={handleSignupChange}
              />
            </div>
            <AuthField
              icon="lucide:lock"
              label="Password"
              name="password"
              type={showSignupPassword ? "text" : "password"}
              value={signupData.password}
              placeholder="Create a password"
              onChange={handleSignupChange}
              error={signupErrors.password}
              rightAction={
                <button type="button" className="auth-eye" onClick={() => setShowSignupPassword((v) => !v)}>
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
            <div className="auth-consent-wrap">
              <label className="auth-consent">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => {
                    setConsentChecked(e.target.checked);
                    if (signupErrors.consent) setSignupErrors((prev) => ({ ...prev, consent: "" }));
                  }}
                />
                <span className="auth-consent-box">
                  <Icon icon="lucide:check" />
                  <span className="auth-consent-text">
                    I agree to the <Link to="/terms-conditions">Terms &amp; Conditions</Link> and <Link to="/privacy-policy">Privacy Policy</Link>
                  </span>
                </span>
              </label>
              {signupErrors.consent && <span className="auth-field-error">{signupErrors.consent}</span>}
            </div>
            <button type="submit" disabled={loading || otpLoading} className="auth-primary">
              {loading ? "Signing up..." : "Sign Up"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>Back to Login</button>
          </form>
        )}

        {/* ── Forgot Password ── */}
        {activeTab === "forgotPassword" && (
          <form className="auth-form" onSubmit={handleForgotPassword} noValidate>
            <AuthField
              icon="lucide:mail"
              label="Registered Email"
              name="email"
              value={forgotPasswordData.email}
              placeholder="Enter your registered email"
              onChange={(e) => {
                setForgotPasswordData((prev) => ({ ...prev, email: e.target.value }));
                if (forgotErrors.email) setForgotErrors((prev) => ({ ...prev, email: "" }));
              }}
              error={forgotErrors.email}
            />
            <button type="submit" disabled={loading || otpLoading} className="auth-primary">
              {loading || otpLoading ? "Verifying..." : "Verify Email OTP"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>Back to Login</button>
          </form>
        )}

        {/* ── Reset Password ── */}
        {activeTab === "resetPassword" && (
          <form className="auth-form" onSubmit={handleResetPassword} noValidate>
            <AuthField
              icon="lucide:lock"
              label="New Password"
              name="newPassword"
              type={showResetPassword ? "text" : "password"}
              value={forgotPasswordData.newPassword}
              placeholder="Enter new password"
              onChange={(e) => {
                setForgotPasswordData((prev) => ({ ...prev, newPassword: e.target.value }));
                if (resetErrors.newPassword) setResetErrors((prev) => ({ ...prev, newPassword: "" }));
              }}
              error={resetErrors.newPassword}
              rightAction={
                <button type="button" className="auth-eye" onClick={() => setShowResetPassword((v) => !v)}>
                  <Icon icon={showResetPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />
            <AuthField
              icon="lucide:lock-keyhole"
              label="Confirm Password"
              name="confirmPassword"
              type={showResetPassword ? "text" : "password"}
              value={forgotPasswordData.confirmPassword}
              placeholder="Confirm new password"
              onChange={(e) => {
                setForgotPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }));
                if (resetErrors.confirmPassword) setResetErrors((prev) => ({ ...prev, confirmPassword: "" }));
              }}
              error={resetErrors.confirmPassword}
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {/* ── OTP Modal ── */}
        {otpStep && (
          <div className="auth-otp-modal" role="dialog" aria-modal="true" aria-label="Verify OTP">
            <form className="auth-otp-sheet" onSubmit={handleVerifyOtpCode}>
              <button
                type="button"
                className="auth-otp-close"
                onClick={() => { setOtpStep(null); setOtpCode(""); setOtpError(""); setOtpLoading(false); }}
                aria-label="Close OTP"
              >
                <Icon icon="lucide:x" />
              </button>
              <div className="auth-otp-card">
                <strong>Verify Email OTP</strong>
                <span className="auth-otp-phone">{otpStep.email}</span>
                <OtpBoxes
                  value={otpCode}
                  length={activeOtpDigitCount}
                  disabled={loading || otpLoading}
                  onChange={(v) => setOtpCode(v.replace(/\D/g, "").slice(0, activeOtpDigitCount))}
                />
                <p>{getOtpAttemptsLeft(otpStep.action, otpStep.email)} resend attempt(s) left. OTP expires in 15 minutes.</p>
                {otpError && <div className="auth-alert auth-alert-error auth-otp-alert">{otpError}</div>}
              </div>
              <button type="submit" disabled={loading || otpLoading} className="auth-primary">
                {loading || otpLoading ? "Verifying..." : "Verify OTP"}
              </button>
              <div className="auth-otp-actions">
                <button type="button" onClick={handleResendOtp} disabled={otpLoading || getOtpAttemptsLeft(otpStep.action, otpStep.email) <= 0}>
                  Resend OTP
                </button>
                <button type="button" onClick={() => { setOtpStep(null); setOtpCode(""); setOtpError(""); }}>
                  Change email
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
