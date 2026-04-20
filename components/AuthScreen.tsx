
import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import { LogIn, UserPlus, Mail, Lock, User, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

interface Props {
  employees: UserProfile[];
  onLogin: (user: UserProfile) => void;
  onRegister: (newUser: UserProfile) => void;
}

export const AuthScreen: React.FC<Props> = ({ employees, onLogin, onRegister }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('saved_email');
    const savedPass = localStorage.getItem('saved_pass');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
      if (savedPass) setPassword(savedPass);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (isLoginMode) {
      // LOGIN LOGIC
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (error) throw error;

        // Save Credentials if Remember Me is checked
        if (rememberMe) {
          localStorage.setItem('saved_email', email);
          localStorage.setItem('saved_pass', password);
        } else {
          localStorage.removeItem('saved_email');
          localStorage.removeItem('saved_pass');
        }

        // Login success - App.tsx will handle session state change
      } catch (err: any) {
        setError(err.message || 'Đăng nhập thất bại.');
      }
    } else {
      // REGISTER LOGIC
      if (!email || !password || !name) {
        setError('Vui lòng điền đầy đủ thông tin.');
        return;
      }

      // Basic Email Regex for stricter check (optional but requested "real email")
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Vui lòng nhập định dạng Email hợp lệ.');
        return;
      }

      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name,
              avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
              status: 'PENDING' // Force Pending Status
            }
          }
        });

        if (error) throw error;

        // Check if session is null -> Means Email Confirmation is REQUIRED
        if (data.user && !data.session) {
          setIsLoginMode(true);
          setSuccessMsg('Đăng ký thành công! Vui lòng MỞ EMAIL để xác thực tài khoản trước khi đăng nhập.');
          setPassword('');
          setName('');
        } else {
          // Auto login (if email confirmation is OFF)
          setIsLoginMode(true);
          setSuccessMsg('Đăng ký thành công! Đang đăng nhập...');
          // onAuthStateChange in App.tsx will handle the redirect
        }

      } catch (err: any) {
        setError(err.message || 'Đăng ký thất bại.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Header Graphic */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-8 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          <h1 className="text-3xl font-bold mb-2 relative z-10">Phần mềm chấm công P&D</h1>
          <p className="text-brand-100 text-sm relative z-10">Hệ thống chấm công & tính lương 4.0</p>
        </div>

        <div className="p-8">
          <div className="flex gap-4 mb-8 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => { setIsLoginMode(true); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${isLoginMode ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Đăng nhập
            </button>
            <button
              onClick={() => { setIsLoginMode(false); setError(''); setSuccessMsg(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!isLoginMode ? 'bg-white shadow-sm text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Đăng ký
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 text-green-600 text-xs font-bold p-3 rounded-xl flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"></div>
                <span>{successMsg}</span>
              </div>
            )}

            {!isLoginMode && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Họ và tên</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 font-medium"
                    placeholder="Nguyễn Văn A"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 font-medium"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-slate-900 font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>


            {isLoginMode && (
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500 focus:ring-2"
                />
                <label htmlFor="remember-me" className="ml-2 text-sm font-medium text-gray-900">Ghi nhớ tài khoản</label>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-200 active:scale-95 transition-all mt-4 flex items-center justify-center gap-2"
            >
              {isLoginMode ? <LogIn size={20} /> : <UserPlus size={20} />}
              {isLoginMode ? 'Đăng nhập ngay' : 'Đăng ký tài khoản'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-400">
            &copy; 2025 Phần mềm chấm công P&D - made by Phạm Hồng Phúc
          </div>
        </div>
      </div>
    </div>
  );
};
