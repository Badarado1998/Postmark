import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IndexerProvider } from "./chain/IndexerProvider";
import { ToastProvider } from "./components/Toasts";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/Shell";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

const Explore = lazy(() => import("./pages/Explore"));
const BountyDetail = lazy(() => import("./pages/BountyDetail"));
const Create = lazy(() => import("./pages/Create"));
const Me = lazy(() => import("./pages/Me"));
const Signer = lazy(() => import("./pages/Signer"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false } },
});

const B = ({ children }: { children: React.ReactNode }) => (
  <ErrorBoundary><Suspense fallback={null}>{children}</Suspense></ErrorBoundary>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <IndexerProvider>
          <Shell>
            <Routes>
              <Route path="/" element={<B><Landing /></B>} />
              <Route path="/explore" element={<B><Explore /></B>} />
              <Route path="/bounty/:id" element={<B><BountyDetail /></B>} />
              <Route path="/create" element={<B><Create /></B>} />
              <Route path="/me" element={<B><Me /></B>} />
              <Route path="/signer" element={<B><Signer /></B>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Shell>
        </IndexerProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
