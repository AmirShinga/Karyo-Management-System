import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Permissions from './pages/Permissions';
import Rooms from './pages/Rooms';
import Bookings from './pages/Bookings';
import MenuManagement from './pages/MenuManagement';
import Categories from './pages/Categories';
import POS from './pages/POS';
import Orders from './pages/Orders';
import Income from './pages/Income';
import Expenses from './pages/Expenses';
import Outstanding from './pages/Outstanding';
import Complaints from './pages/Complaints';
import Staff from './pages/Staff';
import Reports from './pages/Reports';
import Maintenance from './pages/Maintenance';
import Inventory from './pages/Inventory';
import Security from './pages/Security';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />

        <Route
          path="/rooms"
          element={
            <ProtectedRoute perm="rooms.view">
              <Rooms />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute perm="bookings.view">
              <Bookings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/menu"
          element={
            <ProtectedRoute perm="menu.view">
              <MenuManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/categories"
          element={
            <ProtectedRoute perm="categories.view">
              <Categories />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pos"
          element={
            <ProtectedRoute perm="orders.create">
              <POS />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute perm="orders.view">
              <Orders />
            </ProtectedRoute>
          }
        />

        <Route
          path="/income"
          element={
            <ProtectedRoute perm="income.view">
              <Income />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute perm="expenses.view">
              <Expenses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/outstanding"
          element={
            <ProtectedRoute perm="outstanding.view">
              <Outstanding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/complaints"
          element={
            <ProtectedRoute perm="complaints.view">
              <Complaints />
            </ProtectedRoute>
          }
        />
        <Route
          path="/maintenance"
          element={
            <ProtectedRoute perm="maintenance.view">
              <Maintenance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute perm="inventory.view">
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route path="/security" element={<Security />} />
        <Route
          path="/staff"
          element={
            <ProtectedRoute perm="staff.view">
              <Staff />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute perm="reports.view">
              <Reports />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute perm="users.view">
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/permissions"
          element={
            <ProtectedRoute roles={['admin']}>
              <Permissions />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
