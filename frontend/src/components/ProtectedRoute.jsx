import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { pendingInvite } from "../utils/pendingInvite";

export default function ProtectedRoute({ children }) {
  const { token } = useAuth();
  const { pathname } = useLocation();
  if (!token) return <Navigate to="/login" replace />;
  // someone opened an invite link before signing in: take them back to it
  const invite = pendingInvite.get();
  if (invite && pathname !== "/join") return <Navigate to={`/join?token=${invite}`} replace />;
  return children;
}