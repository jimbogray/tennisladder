import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth.js";
import { RequireAdmin } from "./components/RequireAdmin.js";
import { Layout } from "./components/Layout.js";
import { LandingPage } from "./pages/LandingPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { RegisterPage } from "./pages/RegisterPage.js";
import { CompleteProfilePage } from "./pages/CompleteProfilePage.js";
import { LadderPage } from "./pages/LadderPage.js";
import { MatchesPage } from "./pages/MatchesPage.js";
import { NewMatchPage } from "./pages/NewMatchPage.js";
import { MatchDetailPage } from "./pages/MatchDetailPage.js";
import { NegotiationsPage } from "./pages/NegotiationsPage.js";
import { AdminNegotiationsPage } from "./pages/AdminNegotiationsPage.js";
import { LocationsPage } from "./pages/LocationsPage.js";
import { AdminPlayersPage } from "./pages/AdminPlayersPage.js";
import { AdminInvitesPage } from "./pages/AdminInvitesPage.js";
import { AdminTeamPage } from "./pages/AdminTeamPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.js";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.js";
import { VerifyEmailPage } from "./pages/VerifyEmailPage.js";
import { ResultConfirmPage } from "./pages/ResultConfirmPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
      <Route path="/results/confirm/:token" element={<ResultConfirmPage />} />

      <Route
        path="/complete-profile"
        element={
          <RequireAuth allowIncompleteProfile>
            <CompleteProfilePage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/ladder" element={<LadderPage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/matches/new" element={<NewMatchPage />} />
        <Route path="/matches/:id" element={<MatchDetailPage />} />
        <Route path="/negotiations" element={<NegotiationsPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/admin/negotiations"
          element={
            <RequireAdmin>
              <AdminNegotiationsPage />
            </RequireAdmin>
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
          path="/admin/team"
          element={
            <RequireAdmin>
              <AdminTeamPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/invites"
          element={
            <RequireAdmin>
              <AdminInvitesPage />
            </RequireAdmin>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
