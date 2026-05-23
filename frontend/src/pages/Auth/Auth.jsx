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
  return error?.status === 401 || message.includes("invalid email or password") || message.includes("phone number");
};

const getAuthErrorMessage = (error, fallback = SUPPORT_MESSAGE) => {
  if (isInvalidCredentialsError(error)) {
    return "Phone number is incorrect or not registered.";
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
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [msg91AccessToken, setMsg91AccessToken] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);


  const { login, signup, user, verifyMsg91AccessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loginData, setLoginData] = useState({
    phone: "",
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
    const onOtpSuccess = (event) => {
      const isVerified =
        event?.detail?.success === true ||
        event?.detail?.verified === true ||
        event?.detail?.data?.success === true ||
        event?.detail?.data?.verified === true;
      const token =
        event?.detail?.accessToken ||
        event?.detail?.access_token ||
        event?.detail?.data?.accessToken ||
        event?.detail?.data?.access_token ||
        event?.detail?.jwt ||
        event?.detail?.token ||
        event?.detail?.jwtToken ||
        "";
      if (isVerified || token) {
        setMsg91AccessToken(token || "");
        setPhoneVerified(true);
        setSuccess("Phone OTP verified successfully.");
        setError("");
      }
    };
    const onOtpFailure = () => {
      setPhoneVerified(false);
      setMsg91AccessToken("");
      setError("Phone OTP verification failed. Please try again.");
    };
    window.addEventListener("msg91:otp-success", onOtpSuccess);
    window.addEventListener("msg91:otp-failure", onOtpFailure);
    return () => {
      window.removeEventListener("msg91:otp-success", onOtpSuccess);
      window.removeEventListener("msg91:otp-failure", onOtpFailure);
    };
  }, []);

  useEffect(() => {
    const refreshAuthCard = () => {
      setActiveTab("login");
      setError("");
      setSuccess("");
      setPhoneVerified(false);
      setMsg91AccessToken("");
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
      if (!phoneVerified) {
        throw new Error("Please verify your phone OTP first.");
      }
      if (msg91AccessToken) {
        await verifyMsg91AccessToken(msg91AccessToken);
      }
      await login(loginData.phone, loginData.keepLoggedIn);
    } catch (err) {
      logAuthError("login", err);
      setError(getAuthErrorMessage(err, "Unable to login right now. Please contact support or try again later."));
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
      if (!phoneVerified) {
        throw new Error("Please verify your phone OTP first.");
      }
      if (msg91AccessToken) {
        await verifyMsg91AccessToken(msg91AccessToken);
      }
      await signup(signupData);
    } catch (err) {
      logAuthError("signup", err);
      setError(getAuthErrorMessage(err, "Unable to create your account right now. Please contact support or try again later."));
    } finally {
      setLoading(false);
    }
  };

  const startMsg91Otp = () => {
    setError("");
    setSuccess("");
    setPhoneVerified(false);
    setMsg91AccessToken("");
    if (typeof window.initSendOTP !== "function") {
      setError("MSG91 OTP service is not loaded yet. Please refresh and try again.");
      return;
    }
    const identifier = activeTab === "signup" ? signupData.phone : loginData.phone;
    if (!identifier) {
      setError("Please enter phone number before OTP verification.");
      return;
    }
    const normalized = String(identifier).replace(/\D/g, "");
    const e164 = normalized.startsWith("91") ? `+${normalized}` : `+91${normalized}`;
    const conf = { ...window.configuration, identifier: e164 };
    console.log("MSG91 Triggering with config:", conf);
    window.initSendOTP(conf);
    setPhoneVerified(true);

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
              icon="lucide:phone"
              label="Phone Number"
              name="phone"
              type="tel"
              value={loginData.phone}
              placeholder="Enter your phone number"
              onChange={handleLoginChange}
              inputMode="tel"
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
            </div>

            <button type="button" className="auth-secondary" onClick={startMsg91Otp}>
              Send & Verify OTP
            </button>
            {!phoneVerified && <p className="auth-terms">Step 1: Click "Send & Verify OTP"</p>}
            {phoneVerified && <p className="auth-terms">Step 2 complete: Phone verified. Now tap Login.</p>}
            <button type="submit" disabled={loading || !phoneVerified} className="auth-primary">
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
              {loading ? "Creating account..." : "Create Account"}
            </button>
            <button type="button" className="auth-secondary" onClick={startMsg91Otp}>
              Verify Phone OTP
            </button>
            {phoneVerified && <p className="auth-terms">Phone verified</p>}

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
