import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the saved login has expired (or the account is gone), send the visitor back to sign in
// instead of leaving every page showing errors.
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const message = String(err.response?.data?.message || "");
    if ((status === 401 || status === 403) && /^(Access denied|Invalid or expired token)/.test(message)) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!PUBLIC_PATHS.includes(window.location.pathname)) window.location.assign("/login");
    }
    return Promise.reject(err);
  }
);

export default api;