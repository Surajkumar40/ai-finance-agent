import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";   // ADD
import AIChatPage from "./pages/AIChatPage";
import Navbar from './components/Navbar'

// function App() {
//   return (
//     <div className="min-h-screen bg-gray-950 text-white">
//       <Navbar />
//     </div>
//   )
// }


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/transactions" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />  {/* ADD */}
          <Route path="*" element={<Navigate to="/login" replace />} />
          <Route path="/ai" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
// export default App