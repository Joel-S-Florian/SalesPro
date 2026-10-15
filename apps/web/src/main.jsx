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
import { useAuthStore } from './stores/authStore';
import { useConfigStore } from './stores/configStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Aislamiento entre empresas en el navegador: al cerrar sesión o entrar con otra empresa se borra todo lo que quedó en memoria
// (datos en caché y configuración), para que nunca se vea un instante lo de la empresa anterior.
let currentCompany = useAuthStore.getState().user?.companyId ?? null;
useAuthStore.subscribe(state => {
  const company = state.user?.companyId ?? null;
  if (company === currentCompany) return;
  currentCompany = company;
  queryClient.clear();
  useConfigStore.getState().reset();
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