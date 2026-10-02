import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { LandingPage } from '@/pages/LandingPage';
import { DemoPage } from '@/pages/DemoPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { DashboardPage } from '@/pages/DashboardPage';
import { IncidentsPage } from '@/pages/IncidentsPage';
import { IncidentDetailsPage } from '@/pages/IncidentDetailsPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { EmployeeDetailsPage } from '@/pages/EmployeeDetailsPage';
import { PoliciesPage } from '@/pages/PoliciesPage';
import { DetectionRulesPage } from '@/pages/DetectionRulesPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { ExtensionPage } from '@/pages/ExtensionPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage';

function App() {
return (
<ToastProvider>
<BrowserRouter>
<Routes>
{/* Public */}
<Route path="/" element={<LandingPage />} />
<Route path="/demo" element={<DemoPage />} />
<Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<RegisterPage />} />

      {/* Admin shell */}
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/:id" element={<IncidentDetailsPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/:id" element={<EmployeeDetailsPage />} />
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/detection-rules" element={<DetectionRulesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/audit-log" element={<AuditLogPage />} />
        <Route path="/extension" element={<ExtensionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
</ToastProvider>

);
}

export default App;