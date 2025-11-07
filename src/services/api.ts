//Eskimo/src/services/api.ts
import axios from "axios";

// Altere a URL conforme necessário (produção/local)
const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  try {
    const store = localStorage.getItem("eskimo_store");
    if (store && store.trim() !== "") {
      config.headers = config.headers ?? {};
      config.headers["X-Store"] = store.trim().toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return config;
});

export default api;
export type StatusResponse = {
  isOpen: boolean;
  message?: string;
  now?: string;
  nextOpening?: string;
};

export const StatusAPI = {
  async isOpen(store?: string): Promise<StatusResponse> {
    const endpoint = store
      ? `/status/isOpen/${encodeURIComponent(store)}`
      : "/status/isOpen";
    const response = await api.get<StatusResponse>(endpoint);
    return response.data;
  },
};
