import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";   // ADD
import AIChatPage from "./pages/AIChatPage";
import RecurringPage from "./pages/RecurringPage";
import GoalsPage from "./pages/GoalsPage";

// function App() {
//   return (
//     <div className="min-h-screen bg-gray-950 text-white">
//       <Navbar />
//     </div>
//   )
// }


export default function App() {
  return (
    <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />  {/* ADD */}
          <Route path="/recurring" element={<ProtectedRoute><RecurringPage /></ProtectedRoute>} />
          <Route path="/goals" element={<ProtectedRoute><GoalsPage /></ProtectedRoute>} />
          <Route path="/ai" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
    </BrowserRouter>
  );
}
// export default App