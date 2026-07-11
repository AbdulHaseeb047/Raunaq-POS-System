import { AuthProvider } from '@/lib/auth';

import { AppRoutes } from './routes';

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
