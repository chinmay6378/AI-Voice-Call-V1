import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index.tsx";
import Campaigns from "./pages/Campaigns.tsx";
import CreateCampaign from "./pages/CreateCampaign.tsx";
import LiveCalls from "./pages/LiveCalls.tsx";
import CallResults from "./pages/CallResults.tsx";
import Analytics from "./pages/Analytics.tsx";
import Calls from "./pages/Calls.tsx";
import CallDetails from "./pages/CallDetails.tsx";
import Health from "./pages/Health.tsx";
import Settings from "./pages/Settings.tsx";
import Inbound from "./pages/Inbound.tsx";
import Login from "./pages/Login.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<AppLayout />}>
              <Route path="/"               element={<Index />} />
              <Route path="/campaigns"      element={<Campaigns />} />
              <Route path="/campaigns/new"  element={<CreateCampaign />} />
              <Route path="/live"           element={<LiveCalls />} />
              <Route path="/results"        element={<CallResults />} />
              <Route path="/analytics"      element={<Analytics />} />
              {/* Legacy routes — kept for backward compat */}
              <Route path="/call-list"      element={<Calls />} />
              <Route path="/call-details/:id" element={<CallDetails />} />
              <Route path="/inbound"        element={<Inbound />} />
              <Route path="/system-health"  element={<Health />} />
              <Route path="/settings"       element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
