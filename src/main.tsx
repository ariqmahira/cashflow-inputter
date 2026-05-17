import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { GoogleAuthProvider } from './auth/GoogleAuthProvider';
import { SettingsProvider } from './features/Settings/SettingsContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <GoogleAuthProvider>
            <App />
          </GoogleAuthProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
