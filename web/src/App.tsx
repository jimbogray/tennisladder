import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequireAdmin } from "./components/RequireAdmin.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { CompleteProfilePage } from "./pages/CompleteProfilePage.js";
import { LadderPage } from "./pages/LadderPage.js";
import { MatchesPage } from "./pages/MatchesPage.js";
import { NewMatchPage } from "./pages/NewMatchPage.js";
import { MatchDetailPage } from "./pages/MatchDetailPage.js";
import { NegotiationsPage } from "./pages/NegotiationsPage.js";
import { AdminNegotiationsPage } from "./pages/AdminNegotiationsPage.js";
import { LocationsPage } from "./pages/LocationsPage.js";
import { AdminPlayersPage } from "./pages/AdminPlayersPage.js";
import { AdminRegistrationCodesPage } from "./pages/AdminRegistrationCodesPage.js";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.js";
import { VerifyEmailPage } from "./pages/VerifyEmailPage.js";
import { ResultConfirmPage } from "./pages/ResultConfirmPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/ladder" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
      <Route path="/results/confirm/:token" element={<ResultConfirmPage />} />

      <Route
        path="/complete-profile"
        element={
          <RequireAuth>
            <CompleteProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/ladder"
        element={
          <RequireAuth>
            <LadderPage />
          </RequireAuth>
        }
      />
      <Route
        path="/matches"
        element={
          <RequireAuth>
            <MatchesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/matches/new"
        element={
          <RequireAuth>
            <NewMatchPage />
          </RequireAuth>
        }
      />
      <Route
        path="/matches/:id"
        element={
          <RequireAuth>
            <MatchDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/negotiations"
        element={
          <RequireAuth>
            <NegotiationsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/negotiations"
        element={
          <RequireAdmin>
            <AdminNegotiationsPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/locations"
        element={
          <RequireAuth>
            <LocationsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/players"
        element={
          <RequireAdmin>
            <AdminPlayersPage />
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/registration-codes"
        element={
          <RequireAdmin>
            <AdminRegistrationCodesPage />
          </RequireAdmin>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
