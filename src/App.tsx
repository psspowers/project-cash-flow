import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import Suppliers from './pages/Suppliers';
import Approvals from './pages/Approvals';
import PaymentQueue from './pages/PaymentQueue';
import CashReceipts from './pages/CashReceipts';
import WHTReport from './pages/WHTReport';
import VATReport from './pages/VATReport';
import CEOAlerts from './pages/CEOAlerts';
import CashFlowPlanner from './pages/CashFlowPlanner';
import CostVariance from './pages/CostVariance';
import MonthlyAnalyzer from './pages/MonthlyAnalyzer';
import CheckManagement from './pages/CheckManagement';
import WorkflowEfficiency from './pages/WorkflowEfficiency';
import TreasuryDashboard from './pages/treasury/TreasuryDashboard';
import Notifications from './pages/Notifications';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
      <Route path="/projects" element={<AppLayout><Projects /></AppLayout>} />
      <Route path="/projects/:id" element={<AppLayout><ProjectDetail /></AppLayout>} />
      <Route path="/purchase-orders" element={<AppLayout><PurchaseOrders /></AppLayout>} />
      <Route path="/suppliers" element={<AppLayout><Suppliers /></AppLayout>} />
      <Route path="/approvals" element={<AppLayout><Approvals /></AppLayout>} />
      <Route path="/payment-queue" element={<AppLayout><PaymentQueue /></AppLayout>} />
      <Route path="/cash-receipts" element={<AppLayout><CashReceipts /></AppLayout>} />
      <Route path="/loan-ledger" element={<Navigate to="/treasury" replace />} />
      <Route path="/treasury" element={<AppLayout><TreasuryDashboard /></AppLayout>} />
      <Route path="/wht-report" element={<AppLayout><WHTReport /></AppLayout>} />
      <Route path="/vat-report" element={<AppLayout><VATReport /></AppLayout>} />
      <Route path="/ceo-alerts" element={<AppLayout><CEOAlerts /></AppLayout>} />
      <Route path="/cash-flow-planner" element={<AppLayout><CashFlowPlanner /></AppLayout>} />
      <Route path="/variance" element={<AppLayout><CostVariance /></AppLayout>} />
      <Route path="/monthly-analyzer" element={<AppLayout><MonthlyAnalyzer /></AppLayout>} />
      <Route path="/checks" element={<AppLayout><CheckManagement /></AppLayout>} />
      <Route path="/workflow" element={<AppLayout><WorkflowEfficiency /></AppLayout>} />
      <Route path="/notifications" element={<AppLayout title="Notifications"><Notifications /></AppLayout>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function SplashScreen({ onDone }: { onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const finish = () => {
      setFading(true);
      setTimeout(onDone, 600);
    };

    video.addEventListener('ended', finish);
    // Fallback: dismiss after 4s in case video fails to load or is slow
    const fallback = setTimeout(finish, 4000);

    return () => {
      video.removeEventListener('ended', finish);
      clearTimeout(fallback);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center transition-opacity duration-600"
      style={{ opacity: fading ? 0 : 1 }}
    >
      <video
        ref={videoRef}
        src="/PssO_Startup.mp4"
        autoPlay
        muted
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </>
  );
}
