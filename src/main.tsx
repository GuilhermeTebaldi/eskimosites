import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Loja from "./Loja";
import MeusPedidos from "./MeusPedidos";
import { StatusAPI } from "./services/api";

import "./index.css";

type StatusPayload = {
  isOpen: boolean;
  message?: string;
  now?: string;
  nextOpening?: string;
};

// gg eslint-disable-next-line react-refresh/only-export-components
function AppGate({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Consulta inicial + revalidação periódica
  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        setError(null);
        const data = await StatusAPI.isOpen();
        if (cancelled) return;
        const normalized: StatusPayload = {
          isOpen: Boolean(data?.isOpen),
          message: data?.message,
          now: data?.now,
          nextOpening: data?.nextOpening,
        };
        setStatus(normalized);
      } catch {
        if (cancelled) return;
        setError("Não foi possível verificar o horário de funcionamento.");
        // Em erro de backend, por padrão não bloqueia. Ajuste para true se quiser bloquear em falha.
        setStatus({ isOpen: true });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchStatus();

    const interval = setInterval(() => {
      void fetchStatus();
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isClosed = useMemo(() => status?.isOpen === false, [status]);

  return (
    <>
      <div className={isClosed ? "site-locked" : ""}>
        {children}
      </div>

      {/* Overlay fora do horário */}
      {isClosed && (
        <div id="hours-overlay" role="alert" aria-live="assertive">
          <div className="card">
            <h1>Fora do horário de funcionamento</h1>
            <p>
              {status?.message ??
                "No momento não estamos atendendo. Tente novamente mais tarde."}
            </p>
            {status?.nextOpening ? (
              <p style={{ marginTop: "0.5rem", opacity: 0.85 }}>
                Próxima abertura: {status.nextOpening}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Mensagem de erro sem bloquear o site */}
      {!loading && error && !isClosed ? (
        <div
          style={{
            position: "fixed",
            bottom: 12,
            right: 12,
            background: "rgba(0,0,0,0.8)",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 8,
            fontSize: 12,
            zIndex: 9999,
          }}
        >
          {error}
        </div>
      ) : null}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppGate>
        <Routes>
          <Route path="/" element={<Loja />} />
          <Route path="/meus-pedidos" element={<MeusPedidos />} />
        </Routes>
      </AppGate>
    </BrowserRouter>
  </React.StrictMode>
);
