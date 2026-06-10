import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';

export default function Login() {
  if (localStorage.getItem('accessToken')) return <Navigate to="/dashboard" replace />;

  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState('login'); // 'login', 'forgot', 'verify', 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_ENDPOINTS.auth}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.setItem('admin_user', JSON.stringify(data.admin || data.user));
        navigate('/dashboard');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/admin-forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setOtpToken(data.token);
      setSuccess("OTP sent to your email.");
      setActiveMode("verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/verify-email-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: otpToken, otp, purpose: "forgot_password" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess("OTP verified. Set new password.");
      setActiveMode("reset");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_ENDPOINTS.auth}/admin-reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, email_otp_token: otpToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess("Password reset successful. Please login.");
      setOtpToken('');
      setOtp('');
      setActiveMode("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-transparent">
      {/* Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#D4AF37]/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[#800020]/10 rounded-full blur-3xl"></div>

      <div className="glass-card w-full max-w-md p-8 md:p-10 rounded-3xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-700 bg-white/80 backdrop-blur-xl border border-white/50">
        <div className="text-center mb-8">
          <h1 className="brand-font text-4xl font-bold text-[#800020] mb-2 tracking-tight">Banaras Kala</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-[#D4AF37]">Admin Console</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600 text-xs font-bold animate-shake">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-xl flex items-center gap-3 text-green-600 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4" /> {success}
          </div>
        )}

        {activeMode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest pl-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#FAF8F6] border border-[#D4AF37]/20 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none text-[#4A3F35] transition-all shadow-sm"
                  placeholder="admin@banaraskala.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center pr-1">
                <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest pl-1">Password</label>
                <button
                  type="button"
                  onClick={() => setActiveMode('forgot')}
                  className="text-[10px] font-bold text-[#800020] hover:underline uppercase tracking-widest"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#FAF8F6] border border-[#D4AF37]/20 rounded-xl py-3 pl-10 pr-4 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none text-[#4A3F35] transition-all shadow-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-[#800020] text-white py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 ${loading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#6b001a]'}`}
            >
              {loading ? 'Authenticating...' : 'Secure Login'}
            </button>
          </form>
        )}

        {activeMode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest pl-1">Admin Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#FAF8F6] border border-[#D4AF37]/20 rounded-xl py-3 px-4 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all shadow-sm"
                placeholder="Enter your registered email"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#800020] text-white py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest"
            >
              {loading ? 'Sending...' : 'Send Reset OTP'}
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('login')}
              className="w-full text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest"
            >
              Back to Login
            </button>
          </form>
        )}

        {activeMode === 'verify' && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest pl-1">Enter OTP</label>
              <input
                type="text"
                maxLength="6"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full bg-[#FAF8F6] border border-[#D4AF37]/20 rounded-xl py-3 px-4 text-center text-lg font-bold tracking-[0.5em] focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all shadow-sm"
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#800020] text-white py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </form>
        )}

        {activeMode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest pl-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-[#FAF8F6] border border-[#D4AF37]/20 rounded-xl py-3 px-4 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all shadow-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest pl-1">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#FAF8F6] border border-[#D4AF37]/20 rounded-xl py-3 px-4 text-sm focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#800020] text-white py-3.5 rounded-xl text-xs font-bold uppercase tracking-widest"
            >
              {loading ? 'Resetting...' : 'Update Password'}
            </button>
          </form>
        )}

        <div className="mt-8 text-center border-t border-[#D4AF37]/10 pt-6">
          <p className="text-[10px] text-gray-400 font-medium tracking-wider">© {new Date().getFullYear()} Banaras Kala. Secure Admin Portal.</p>
        </div>
      </div>
    </div>
  );
}
