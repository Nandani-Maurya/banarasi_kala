import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import headerBackground from "../../assets/header_backgroung.png";
import { API_ENDPOINTS } from "../../config/api";
import { useAuth } from "../../context/AuthContext";
import "./Auth.css";

const strengthLabels = ["Weak", "Moderate", "Strong", "Very Strong"];
const SUPPORT_MESSAGE = "Something went wrong. Please contact support or try again later.";

const logAuthError = (action, error) => {
  console.error(`[Auth] ${action} failed:`, error);
};

const isInvalidCredentialsError = (error) => {
  const message = String(error?.message || error || "").toLowerCase();
  return error?.status === 401 || message.includes("invalid email or password");
};

const getAuthErrorMessage = (error, fallback = SUPPORT_MESSAGE) => {
  if (isInvalidCredentialsError(error)) {
    return "Email or password is incorrect.";
  }

  if (error?.code === "PHONE_NOT_VERIFIED") {
    return "Please verify your phone number to continue.";
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
  maxLength,
  inputMode,
}) => (
  <label className="auth-field">
    <span className="auth-label">{label}</span>
    <span className="auth-input-wrap">
      <Icon icon={icon}></Icon>
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

const Auth = () => {
  const appMode = (import.meta.env.VITE_APP_MODE || "dev").toLowerCase();
  const shouldBypassPhoneOtp = appMode !== "prod";
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [phoneOtpSession, setPhoneOtpSession] = useState(null);
  const [phoneOtp, setPhoneOtp] = useState("");

  const { login, signup, user, sendPhoneOtp, verifyPhoneOtpAndGetIdToken, verifyPhoneAndLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginData, setLoginData] = useState({
    email: "",
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
    email: "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || "/";
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "signup") {
      setActiveTab("signup");
      setError("");
      setSuccess("");
      setAnimationKey((key) => key + 1);
      return;
    }

    if (params.get("mode") === "forgot") {
      setActiveTab("forgotPassword");
      const email = params.get("email") || "";
      setForgotPasswordData((prev) => ({ ...prev, email }));
      setError("");
      setSuccess("");
      setAnimationKey((key) => key + 1);
      return;
    }

    if (params.has("refresh")) {
      setActiveTab("login");
      setError("");
      setSuccess("");
      setAnimationKey((key) => key + 1);
    }
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (ref) {
      setSignupData((prev) => ({ ...prev, referral_code: ref }));
    }
  }, [location.search]);

  useEffect(() => {
    const refreshAuthCard = () => {
      setActiveTab("login");
      setError("");
      setSuccess("");
      setAnimationKey((key) => key + 1);
    };

    window.addEventListener("auth:refresh", refreshAuthCard);
    return () => window.removeEventListener("auth:refresh", refreshAuthCard);
  }, []);

  const authCopy = useMemo(() => {
    if (activeTab === "signup") {
      return {
        title: "Create New Account",
        subtitle: "Join us and discover the finest Banarasi sarees.",
      };
    }

    if (activeTab === "forgotPassword") {
      return {
        title: "Forgot Password",
        subtitle: "Enter your registered email to receive an OTP.",
      };
    }

    if (activeTab === "verifyOTP") {
      return {
        title: "Verify OTP",
        subtitle: "Enter the OTP sent to your email address.",
      };
    }

    if (activeTab === "resetPassword") {
      return {
        title: "Reset Password",
        subtitle: "Create a new password for your account.",
      };
    }

    return {
      title: "Welcome Back",
      subtitle: "Login to continue shopping",
    };
  }, [activeTab]);

  const switchMode = (mode) => {
    setActiveTab(mode);
    setError("");
    setSuccess("");
    setAnimationKey((key) => key + 1);
  };

  const handleLoginChange = (e) => {
    const { name, value, type, checked } = e.target;
    setLoginData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSignupChange = (e) => {
    const { name, value } = e.target;
    setSignupData((prev) => ({ ...prev, [name]: value }));
    if (name === "password") updateStrength(value);
  };

  const updateStrength = (val) => {
    if (!val) {
      setPasswordStrength(0);
      return;
    }

    let strength = 0;
    if (val.length >= 6) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[0-9]/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;
    setPasswordStrength(strength);
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(loginData.email, loginData.password, loginData.keepLoggedIn);
    } catch (err) {
      if (err?.code === "PHONE_NOT_VERIFIED" && err?.phone) {
        try {
          if (shouldBypassPhoneOtp) {
            await verifyPhoneAndLogin({
              email: loginData.email,
              password: loginData.password,
              keepLoggedIn: loginData.keepLoggedIn,
            });
            return;
          }

          const phoneE164 = err.phone?.startsWith("+") ? err.phone : `+91${err.phone}`;
          const confirmation = await sendPhoneOtp(phoneE164);
          setPhoneOtpSession(confirmation);
          setSuccess("OTP sent to your phone number.");
          switchMode("verifyLoginPhone");
        } catch (sendErr) {
          logAuthError("phone login verification", sendErr);
          setError("Unable to continue login right now. Please contact support or try again later.");
        }
      } else {
        logAuthError("login", err);
        setError(getAuthErrorMessage(err, "Unable to login right now. Please contact support or try again later."));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtpForLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const firebaseIdToken = await verifyPhoneOtpAndGetIdToken({
        confirmation: phoneOtpSession,
        otp: phoneOtp,
      });
      await verifyPhoneAndLogin({
        email: loginData.email,
        password: loginData.password,
        keepLoggedIn: loginData.keepLoggedIn,
        firebaseIdToken,
      });
    } catch (err) {
      logAuthError("login phone verification", err);
      setError("Phone verification failed. Please check the OTP or try again.");
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (!signupData.name || !signupData.phone || !signupData.email || !signupData.password) {
      setError("Please fill all required fields");
      return;
    }

    // Step 1: send OTP to phone
    setLoading(true);
    try {
      if (shouldBypassPhoneOtp) {
        await signup(signupData);
        return;
      }

      const phoneE164 = signupData.phone?.startsWith("+") ? signupData.phone : `+91${signupData.phone}`;
      const confirmation = await sendPhoneOtp(phoneE164);
      setPhoneOtpSession(confirmation);
      setSuccess("OTP sent to your phone number.");
      switchMode("verifyPhone");
    } catch (err) {
      logAuthError("signup", err);
      setError(getAuthErrorMessage(err, "Unable to create your account right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtpForSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const firebaseIdToken = await verifyPhoneOtpAndGetIdToken({
        confirmation: phoneOtpSession,
        otp: phoneOtp,
      });
      await signup({ ...signupData, firebase_id_token: firebaseIdToken });
    } catch (err) {
      logAuthError("signup phone verification", err);
      setError("Phone verification failed. Please check the OTP or try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotPasswordData.email, role: "customer" }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server error. Please try again later.");
      }
      if (!res.ok) throw new Error(data.message || "Request failed");
      setSuccess("OTP sent to your email.");
      switchMode("verifyOTP");
    } catch (err) {
      logAuthError("forgot password", err);
      setError("Unable to send reset OTP right now. Please contact support or try again later.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          otp: forgotPasswordData.otp,
          role: "customer",
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server error. Please try again later.");
      }
      if (!res.ok) throw new Error(data.message || "Verification failed");
      setSuccess("OTP verified. Set your new password.");
      switchMode("resetPassword");
    } catch (err) {
      logAuthError("email OTP verification", err);
      setError("OTP verification failed. Please check the OTP or try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");
    if (forgotPasswordData.newPassword !== forgotPasswordData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotPasswordData.email,
          otp: forgotPasswordData.otp,
          newPassword: forgotPasswordData.newPassword,
          role: "customer",
        }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Server error. Please try again later.");
      }
      if (!res.ok) throw new Error(data.message || "Reset failed");
      setSuccess("Password reset successfully. You can now login.");
      switchMode("login");
    } catch (err) {
      logAuthError("password reset", err);
      setError("Unable to reset password right now. Please contact support or try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="auth-page"
      style={{ "--auth-bg": `url(${headerBackground})` }}
    >
      <div id="firebase-recaptcha" />
      <section className="auth-panel" key={animationKey}>
        <header className="auth-heading">
          <h1>{authCopy.title}</h1>
          <p>{authCopy.subtitle}</p>
        </header>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {success && <div className="auth-alert auth-alert-success">{success}</div>}

        {activeTab === "login" && (
          <form className="auth-form" onSubmit={onLogin}>
            <AuthField
              icon="lucide:mail"
              label="Email Address"
              name="email"
              type="email"
              value={loginData.email}
              placeholder="Enter your email"
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
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowLoginPassword((visible) => !visible)}
                >
                  <Icon icon={showLoginPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />

            <div className="auth-row">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  name="keepLoggedIn"
                  checked={loginData.keepLoggedIn}
                  onChange={handleLoginChange}
                />
                <span>Keep me logged in</span>
              </label>
              <button type="button" onClick={() => switchMode("forgotPassword")}>
                Forgot Password?
              </button>
            </div>

            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Please wait..." : "Login"}
            </button>

            <div className="auth-divider">
              <span />
              <em>or</em>
              <span />
            </div>

            <button
              type="button"
              className="auth-secondary"
              onClick={() => switchMode("signup")}
            >
              <Icon icon="lucide:user-plus" />
              Create New Account
            </button>

            <p className="auth-terms">
              By continuing, you agree to our{" "}
              <Link to="/terms-conditions">Terms &amp; Conditions</Link>
            </p>
          </form>
        )}

        {activeTab === "signup" && (
          <form className="auth-form auth-form-compact" onSubmit={onSignup}>
            <AuthField
              icon="lucide:user"
              label="Full Name"
              name="name"
              value={signupData.name}
              placeholder="Enter your full name"
              onChange={handleSignupChange}
            />

            <AuthField
              icon="lucide:mail"
              label="Email Address"
              name="email"
              type="email"
              value={signupData.email}
              placeholder="Enter your email"
              onChange={handleSignupChange}
            />

            <AuthField
              icon="lucide:phone"
              label="Phone Number"
              name="phone"
              value={signupData.phone}
              placeholder="Enter your phone number"
              onChange={handleSignupChange}
              inputMode="tel"
            />

            <AuthField
              icon="lucide:gift"
              label="Referral Code (optional)"
              name="referral_code"
              value={signupData.referral_code}
              placeholder="Enter referral code"
              onChange={handleSignupChange}
              required={false}
            />

            <AuthField
              icon="lucide:lock"
              label="Password"
              name="password"
              type={showSignupPassword ? "text" : "password"}
              value={signupData.password}
              placeholder="Create a password"
              onChange={handleSignupChange}
              rightAction={
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showSignupPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowSignupPassword((visible) => !visible)}
                >
                  <Icon icon={showSignupPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />

            <div className="auth-strength" aria-label="Password strength">
              {[1, 2, 3, 4].map((level) => (
                <span
                  key={level}
                  className={level <= passwordStrength ? `is-level-${passwordStrength}` : ""}
                />
              ))}
              <strong>
                {passwordStrength ? strengthLabels[passwordStrength - 1] : "Enter Password"}
              </strong>
            </div>

            <label className="auth-consent">
              <input type="checkbox" required />
              <span>
                I agree to the <Link to="/terms-conditions">Terms &amp; Conditions</Link>
                {" "}and <Link to="/privacy-policy">Privacy Policy</Link>
              </span>
            </label>

            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Sending OTP..." : "Verify Phone & Sign Up"}
            </button>

            <div className="auth-divider">
              <span />
              <em>or</em>
              <span />
            </div>

            <button
              type="button"
              className="auth-secondary"
              onClick={() => switchMode("login")}
            >
              <Icon icon="lucide:user" />
              Login To Your Account
            </button>

            <p className="auth-terms">
              Already have an account?{" "}
              <button type="button" onClick={() => switchMode("login")}>
                Login
              </button>
            </p>
          </form>
        )}

        {activeTab === "verifyPhone" && (
          <form className="auth-form" onSubmit={handleVerifyPhoneOtpForSignup}>
            <AuthField
              icon="lucide:key-round"
              label="OTP"
              name="otp"
              value={phoneOtp}
              placeholder="Enter OTP"
              onChange={(e) => setPhoneOtp(e.target.value)}
              maxLength={6}
              inputMode="numeric"
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Verifying..." : "Verify & Create Account"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("signup")}>
              Back
            </button>
          </form>
        )}

        {activeTab === "verifyLoginPhone" && (
          <form className="auth-form" onSubmit={handleVerifyPhoneOtpForLogin}>
            <AuthField
              icon="lucide:key-round"
              label="OTP"
              name="otp"
              value={phoneOtp}
              placeholder="Enter OTP"
              onChange={(e) => setPhoneOtp(e.target.value)}
              maxLength={6}
              inputMode="numeric"
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Verifying..." : "Verify Phone"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>
              Back to Login
            </button>
          </form>
        )}

        {activeTab === "forgotPassword" && (
          <form className="auth-form" onSubmit={handleForgotPassword}>
            <AuthField
              icon="lucide:mail"
              label="Registered Email"
              type="email"
              value={forgotPasswordData.email}
              placeholder="Enter your email"
              onChange={(e) =>
                setForgotPasswordData((prev) => ({ ...prev, email: e.target.value }))
              }
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Sending..." : "Send Reset OTP"}
            </button>
            <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>
              Back to Login
            </button>
          </form>
        )}

        {activeTab === "verifyOTP" && (
          <form className="auth-form" onSubmit={handleVerifyOTP}>
            <AuthField
              icon="lucide:key-round"
              label="Enter OTP"
              value={forgotPasswordData.otp}
              placeholder="Enter 6 digit OTP"
              onChange={(e) =>
                setForgotPasswordData((prev) => ({ ...prev, otp: e.target.value }))
              }
              maxLength="6"
              inputMode="numeric"
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
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
              onChange={(e) =>
                setForgotPasswordData((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
              rightAction={
                <button
                  type="button"
                  className="auth-eye"
                  aria-label={showResetPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowResetPassword((visible) => !visible)}
                >
                  <Icon icon={showResetPassword ? "lucide:eye-off" : "lucide:eye"} />
                </button>
              }
            />
            <AuthField
              icon="lucide:lock"
              label="Confirm Password"
              type={showResetPassword ? "text" : "password"}
              value={forgotPasswordData.confirmPassword}
              placeholder="Confirm new password"
              onChange={(e) =>
                setForgotPasswordData((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
            />
            <button type="submit" disabled={loading} className="auth-primary">
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};

export default Auth;
