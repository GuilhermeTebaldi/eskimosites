import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Loja from "./Loja";
import MeusPedidos from "./MeusPedidos";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Loja />} />
        <Route path="/meus-pedidos" element={<MeusPedidos />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
