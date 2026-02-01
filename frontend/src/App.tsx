import React, { useState } from "react";
import Header from "./components/Header";
import Sidebar, { PageKey } from "./components/Sidebar";
import Overview from "./pages/Overview";
import NegotiationPerformance from "./pages/NegotiationPerformance";
import CallLog from "./pages/CallLog";
import SentimentAnalysis from "./pages/SentimentAnalysis";
import CarrierInsights from "./pages/CarrierInsights";

type Mode = "demo" | "live";

export default function App() {
  const [mode, setMode] = useState<Mode>("demo");
  const [page, setPage] = useState<PageKey>("overview");

  return (
    <div className="flex h-screen w-screen flex-col">
      <Header mode={mode} onToggle={setMode} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar current={page} onNavigate={setPage} />
        <main className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6">
          {page === "overview" ? <Overview mode={mode} /> : null}
          {page === "negotiations" ? (
            <NegotiationPerformance mode={mode} />
          ) : null}
          {page === "calls" ? <CallLog mode={mode} /> : null}
          {page === "sentiment" ? (
            <SentimentAnalysis mode={mode} />
          ) : null}
          {page === "insights" ? <CarrierInsights mode={mode} /> : null}
        </main>
      </div>
    </div>
  );
}
