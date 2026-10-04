import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/layout/AppShell";
import { AuthPage } from "./pages/Auth";
import { OnboardingPage } from "./pages/Onboarding";
import { DashboardPage } from "./pages/Dashboard";
import { TodayPage } from "./pages/Today";
import { SyllabusPage } from "./pages/Syllabus";
import { MockDetailPage, MocksPage } from "./pages/Mocks";
import { PerformancePage } from "./pages/Performance";
import { CalendarPage } from "./pages/Calendar";
import { WellnessPage } from "./pages/Wellness";
import { RehabPage } from "./pages/Rehab";
import { HistoryPage } from "./pages/History";
import { ReviewPage } from "./pages/Review";
import { SettingsPage } from "./pages/Settings";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="syllabus" element={<SyllabusPage />} />
            <Route path="mocks" element={<MocksPage />} />
            <Route path="mocks/:id" element={<MockDetailPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="wellness" element={<WellnessPage />} />
            <Route path="rehab" element={<RehabPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
