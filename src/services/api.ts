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

export default api;
export type StatusResponse = {
  isOpen: boolean;
  message?: string;
  now?: string;
  nextOpening?: string;
};

export const StatusAPI = {
  async isOpen(signal?: AbortSignal): Promise<StatusResponse> {
    const response = await api.get<StatusResponse>("/status/isOpen", { signal });
    return response.data;
  },
};
