import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
// The sign-in and sign-up pages load with the app. Every other page is fetched the first time it is opened,
// so the first screen is small and fast (important on phones).
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const AIChatPage = lazy(() => import("./pages/AIChatPage"));
const RecurringPage = lazy(() => import("./pages/RecurringPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const BudgetsPage = lazy(() => import("./pages/BudgetsPage"));
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SimulatorPage = lazy(() => import("./pages/SimulatorPage"));
const SharedPage = lazy(() => import("./pages/SharedPage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0f0f17]" role="status" aria-live="polite">
      <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-white/20 border-t-brand-500 animate-spin" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
          <Route path="/budgets" element={<ProtectedRoute><BudgetsPage /></ProtectedRoute>} />
          <Route path="/forecast" element={<ProtectedRoute><ForecastPage /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
          <Route path="/simulator" element={<ProtectedRoute><SimulatorPage /></ProtectedRoute>} />
          <Route path="/shared" element={<ProtectedRoute><SharedPage /></ProtectedRoute>} />
          <Route path="/recurring" element={<ProtectedRoute><RecurringPage /></ProtectedRoute>} />
          <Route path="/goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}