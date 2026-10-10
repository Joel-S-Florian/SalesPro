import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import ToastHost from './components/ToastHost.jsx';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'; // Comentado para ocultar
import App from './App.jsx';
import './index.css';
import CustomerDisplay from './pages/CustomerDisplay.jsx';
import { isCustomerDisplayMode } from './utils/customerDisplay';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// La pantalla del cliente corre en su propia ventana, sin sesión ni llamadas al API
const root = createRoot(document.getElementById('root'));
if (isCustomerDisplayMode()) {
  root.render(
    <StrictMode>
      <CustomerDisplay />
    </StrictMode>,
  );
} else root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <App />
        <ToastHost />
      </MotionConfig>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */} {/* Comentado */}
    </QueryClientProvider>
  </StrictMode>,
);