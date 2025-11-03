import axios from "axios";

// Altere a URL conforme necessário (produção/local)
const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;
// Status - horário de funcionamento
export const StatusAPI = {
  async isOpen(signal?: AbortSignal): Promise<{
    isOpen: boolean;
    message?: string;
    now?: string;
    nextOpening?: string;
  }> {
    const r = await api.get("/status/isOpen", { signal });
    return r.data;
  },
};

// Settings - caso queira ler as janelas configuradas
export const SettingsAPI = {
  async get(signal?: AbortSignal): Promise<any> {
    const r = await api.get("/settings", { signal });
    return r.data;
  },
};
