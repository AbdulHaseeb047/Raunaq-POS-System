import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';

import { AppRoutes } from './routes';

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
