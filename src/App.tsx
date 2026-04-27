import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import PurchaseOrders from './pages/PurchaseOrders';
import Approvals from './pages/Approvals';
import PaymentQueue from './pages/PaymentQueue';
import CashReceipts from './pages/CashReceipts';
import LoanLedger from './pages/LoanLedger';
import WHTReport from './pages/WHTReport';
import VATReport from './pages/VATReport';
import CEOAlerts from './pages/CEOAlerts';
import CashFlowPlanner from './pages/CashFlowPlanner';
import CostVariance from './pages/CostVariance';
import MonthlyAnalyzerPaid from './pages/MonthlyAnalyzerPaid';
import MonthlyAnalyzerBalanceInvoiced from './pages/MonthlyAnalyzerBalanceInvoiced';
import MonthlyAnalyzerYetToInvoice from './pages/MonthlyAnalyzerYetToInvoice';

function AppRoutes() {

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
      <Route path="/projects" element={<AppLayout><Projects /></AppLayout>} />
      <Route path="/projects/:id" element={<AppLayout><ProjectDetail /></AppLayout>} />
      <Route path="/purchase-orders" element={<AppLayout><PurchaseOrders /></AppLayout>} />
      <Route path="/approvals" element={<AppLayout><Approvals /></AppLayout>} />
      <Route path="/payment-queue" element={<AppLayout><PaymentQueue /></AppLayout>} />
      <Route path="/cash-receipts" element={<AppLayout><CashReceipts /></AppLayout>} />
      <Route path="/loan-ledger" element={<AppLayout><LoanLedger /></AppLayout>} />
      <Route path="/wht-report" element={<AppLayout><WHTReport /></AppLayout>} />
      <Route path="/vat-report" element={<AppLayout><VATReport /></AppLayout>} />
      <Route path="/ceo-alerts" element={<AppLayout><CEOAlerts /></AppLayout>} />
      <Route path="/cash-flow-planner" element={<AppLayout><CashFlowPlanner /></AppLayout>} />
      <Route path="/variance" element={<AppLayout><CostVariance /></AppLayout>} />
      <Route path="/monthly-analyzer/paid" element={<AppLayout><MonthlyAnalyzerPaid /></AppLayout>} />
      <Route path="/monthly-analyzer/balance-invoiced" element={<AppLayout><MonthlyAnalyzerBalanceInvoiced /></AppLayout>} />
      <Route path="/monthly-analyzer/yet-to-invoice" element={<AppLayout><MonthlyAnalyzerYetToInvoice /></AppLayout>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
