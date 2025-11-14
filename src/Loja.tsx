// Loja.tsx — versão revisada (monolítica) 100% focada em Mercado Pago
// - Remove 100% do antigo PIX local/QRCode (componentes, helpers, modais, confirmações locais)
// - Adota o fluxo Mercado Pago redirecionado (Checkout Pro) para aproveitar o auto_return
// - Corrige estados e efeitos para não haver referências ao PIX antigo
// - Mantém filtros, carrinho, seleção de loja, geolocalização, UI essenciais

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import LinhaProdutosAtalhos from "./LinhaProdutosAtalhos";
import "./Loja.css";
import PromoFlutuante from "./components/PromoFlutuante";

/************************************
 * Tipos
 ************************************/
interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  categoryName: string;
  subcategoryName?: string;
  stock: number;
  sortRank?: number;
  pinnedTop?: boolean;
  style?: Record<string, unknown>;
}

interface CartItem {
  product: Product;
  quantity: number;
}

type PromotionDTO = {
  id: number;
  productId: number;
  previousPrice: number | null;
  currentPrice: number;
  highlightText?: string | null;
  product?: {
    id: number;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    categoryName: string;
    subcategoryName?: string;
    stock: number;
    sortRank?: number;
    pinnedTop?: boolean;
  } | null;
};

type PaymentMethod = "mercado_pago" | "cash";

type FlyAnimation = {
  id: string;
  imageUrl: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type AddToCartOptions = {
  imageUrl?: string;
  originRect?: DOMRect;
  productId?: number;
  onBeforeAnimate?: () => void;
};

type StatusPayload = {
  isOpen: boolean;
  message?: string;
  now?: string;
  nextOpening?: string | null;
};

type OrderStatusResponse = {
  id: number;
  store: string;
  status: string;
  total: number;
  name?: string;
  customerName?: string;
  phoneNumber?: string;
  createdAt?: string;
  paymentMethod?: string;
  deliveryType?: string;
};

interface StoreCustomerProfile {
  id: number;
  email: string;
  fullName: string;
  nickname: string;
  phoneNumber?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  addressLabel?: string | null;
  profileImageBase64?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CustomerOrderSummary {
  id: number;
  status: string;
  store: string;
  total: number;
  createdAt: string;
  deliveryType?: string;
  phoneNumber?: string;
  paymentMethod?: string;
}

/************************************
 * Constantes & helpers
 ************************************/
type ViteEnv = { VITE_API_URL?: string };
const API_URL: string =
  (import.meta as unknown as { env?: ViteEnv }).env?.VITE_API_URL ??
  "http://localhost:8080/api";

const UI = {
  HEADER_MAX: 120,
  HEADER_MIN: 50,
  PRODUCTS_PER_PAGE: 12,
} as const;

const NEIGHBORHOODS = [
  "Alvorada",
  "Bela Vista",
  "Belvedere",
  "Centro",
  "Colônia Cella",
  "Cristo Rei",
  "Desbravador",
  "Dom Gerônimo",
  "Efapi",
  "Eldorado",
  "Engenho Braun",
  "Esplanada",
  "Jardim América",
  "Jardim do Lago",
  "Jardim Europa",
  "Jardim Itália",
  "Jardim Itália II",
  "Jardim Paraíso",
  "Jardim Peperi",
  "Jardim Sul",
  "Líder",
  "Maria Goretti",
  "Monte Castelo",
  "Palmital",
  "Palmital II",
  "Parque das Palmeiras",
  "Parque das Palmeiras II",
  "Paraíso",
  "Paraíso II",
  "Passo dos Ferreira",
  "Passo dos Fortes",
  "Pinheirinho",
  "Presidente Médici",
  "Presidente Vargas",
  "Quedas do Palmital",
  "Quinta da Serra",
  "Residencial Viena",
  "Saic",
  "Santa Maria",
  "Santa Paulina",
  "Santa Terezinha",
  "Santo Antônio",
  "São Carlos",
  "São Cristóvão",
  "São José",
  "São Lucas",
  "São Pedro",
  "Seminário",
  "Trevo",
  "Universitário",
  "Vila Esperança",
  "Vila Mantelli",
  "Vila Real",
  "Vila Rica",
  "Outro",
] as const;

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const clampQty = (qty: number, max: number) => Math.max(0, Math.min(qty, max));

// Normaliza texto (sem acento, minúsculo)
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const findNeighborhoodMatch = (value: string) => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (
    NEIGHBORHOODS.find((item) => item.toLowerCase() === normalized) ?? null
  );
};

// Distância Haversine (km)
function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Geolocalização como Promise (checando permissão antes)
const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocalização indisponível"));
    }

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((perm) => {
          if (perm.state === "denied") {
            reject(new Error("Permissão negada permanentemente"));
          } else {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          }
        })
        .catch(() => navigator.geolocation.getCurrentPosition(resolve, reject));
    } else {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    }
  });

// ===== Confirmação vista (ACK) =====
const ACK_TTL_MS = 1000 * 60 * 60 * 24; // 24h

function ackKey(id: number) {
  return `order_ack_${id}`;
}
function setOrderAck(id: number) {
  try {
    localStorage.setItem(ackKey(id), JSON.stringify({ seenAt: Date.now() }));
  } catch {
    /* empty */
  }
}
function hasOrderAck(id: number) {
  try {
    const raw = localStorage.getItem(ackKey(id));
    if (!raw) return false;
    const { seenAt } = JSON.parse(raw) ?? {};
    if (!seenAt) return false;
    return Date.now() - Number(seenAt) < ACK_TTL_MS;
  } catch {
    return false;
  }
}

// ===== Assinatura imutável do estado do pedido =====
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildOrderSignature(
  cart: CartItem[],
  deliveryFee: number,
  selectedStore: string | null,
  paymentMethod: string,
): string {
  const payload = {
    store: selectedStore ?? "",
    paymentMethod,
    fee: Number(Number(deliveryFee).toFixed(2)),
    items: cart
      .map((i) => ({
        id: i.product.id,
        q: i.quantity,
        p: Number(i.product.price.toFixed(2)),
      }))
      .sort((a, b) => a.id - b.id),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

const SIG_KEY = "last_order_sig";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getLastSig(): string | null {
  try {
    return localStorage.getItem(SIG_KEY);
  } catch {
    return null;
  }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setLastSig(sig: string) {
  try {
    localStorage.setItem(SIG_KEY, sig);
  } catch {
    /* noop */
  }
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function clearLastSig() {
  try {
    localStorage.removeItem(SIG_KEY);
  } catch {
    /* noop */
  }
}

function normalizePaymentTag(method?: string | null): string {
  return (method ?? "").trim().toLowerCase();
}

function isCashPayment(method?: string | null): boolean {
  return normalizePaymentTag(method) === "cash";
}

function describePaymentMethod(method?: string | null): string {
  const normalized = normalizePaymentTag(method);
  if (normalized === "cash") return "Dinheiro na entrega";
  if (normalized === "mercado_pago") return "Mercado Pago (online)";
  return method?.trim() || "Pagamento não informado";
}

function normalizeStatusTag(status?: string | null): string {
  return (status ?? "").toString().trim().toLowerCase();
}

const CUSTOMER_CONFIRMABLE_STATUS = new Set<string>([
  "pago",
  "paid",
  "approved",
  "confirmado",
  "confirmada",
  "pronto",
  "pronta",
  "pronto_para_entrega",
  "pronto para entrega",
  "saiu_para_entrega",
  "saiu para entrega",
  "em rota",
  "a caminho",
  "out_for_delivery",
]);

function canCustomerConfirmDelivery(order?: {
  status?: string | null;
  paymentMethod?: string | null;
  deliveryType?: string | null;
} | null): boolean {
  if (!order) return false;
  const deliveryMode = (order.deliveryType ?? "").trim().toLowerCase();
  if (!deliveryMode || !deliveryMode.startsWith("entreg")) return false;
  if (normalizePaymentTag(order.paymentMethod) === "cash") return false;

  const normalized = normalizeStatusTag(order.status);
  if (!normalized) return false;
  if (
    normalized === "entregue" ||
    normalized === "delivered" ||
    normalized === "cancelado" ||
    normalized === "cancelada" ||
    normalized === "cancelled" ||
    normalized === "rejected" ||
    normalized === "failure"
  ) {
    return false;
  }

  if (CUSTOMER_CONFIRMABLE_STATUS.has(normalized)) return true;
  if (
    normalized.includes("saiu") ||
    normalized.includes("rota") ||
    normalized.includes("caminho")
  ) {
    return true;
  }
  return false;
}

/************************************
 * Hooks utilitários
 ************************************/
function useLocalStorageCart(
  keyCart = "eskimo_cart",
  keyStore = "eskimo_store",
) {
  const [storedCart, setStoredCart] = useState<CartItem[]>([]);
  const [storedStore, setStoredStore] = useState<string | null>(null);

  useEffect(() => {
    try {
      const rawCart = localStorage.getItem(keyCart);
      if (rawCart) setStoredCart(JSON.parse(rawCart));
      const st = localStorage.getItem(keyStore);
      if (st) setStoredStore(st);
    } catch {
      // noop
    }
  }, [keyCart, keyStore]);

  useEffect(() => {
    try {
      localStorage.setItem(keyCart, JSON.stringify(storedCart));
    } catch {
      // noop
    }
  }, [keyCart, storedCart]);

  useEffect(() => {
    try {
      if (storedStore) localStorage.setItem(keyStore, storedStore);
    } catch {
      // noop
    }
  }, [keyStore, storedStore]);

  return { storedCart, setStoredCart, storedStore, setStoredStore } as const;
}

function useDeliveryFee(
  deliveryRate: number,
  selectedStore: string | null,
  storeLocations: { name: string; lat: number; lng: number }[],
) {
  const [deliveryFee, setDeliveryFee] = useState(0);

  const recalc = useCallback(async () => {
    if (!(deliveryRate > 0 && selectedStore)) return;
    const loja = storeLocations.find((s) => s.name === selectedStore);
    if (!loja) return;
    try {
      const pos = await getPosition();
      const d = getDistanceFromLatLonInKm(
        pos.coords.latitude,
        pos.coords.longitude,
        loja.lat,
        loja.lng,
      );
      setDeliveryFee(parseFloat((d * deliveryRate).toFixed(2)));
    } catch (e) {
      console.error("Erro ao obter localização:", e);
    }
  }, [deliveryRate, selectedStore, storeLocations]);

  useEffect(() => {
    recalc();
  }, [recalc]);

  return { deliveryFee, recalc } as const;
}

// ——— Type guards auxiliares ———
type Json = Record<string, unknown>;

// Type guards p/ respostas JSON
function isOrderResponse(x: unknown): x is { id: number } {
  return (
    typeof x === "object" &&
    x !== null &&
    "id" in x &&
    typeof (x as Json).id === "number"
  );
}

/************************************
 * Reducer do fluxo (apenas checkout)
 ************************************/
type Stage = "idle" | "checkout";
interface UIState {
  stage: Stage;
}
type UIAction = { type: "OPEN_CHECKOUT" } | { type: "RESET" };

const uiInitial: UIState = { stage: "idle" };

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "OPEN_CHECKOUT":
      return { stage: "checkout" };
    case "RESET":
      return uiInitial;
    default:
      return state;
  }
}

/************************************
 * Componente principal
 ************************************/

function formatDescription(text: string): string {
  if (!text) return "";
  return text
    .replace(/(\.\s*)([A-ZÁÉÍÓÚÂÊÔÃÕ])/g, ".\n$2")
    .replace(/(Alérgicos)/gi, "\n\n⚠️ $1")
    .replace(/(NÃO CONTÉM GLÚTEN)/gi, "\n$1")
    .replace(/(PESO LÍQ\.)/gi, "\n$1")
    .trim();
}

export default function Loja() {
  // Estados de pagamento Mercado Pago
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentOverlay, setPaymentOverlay] = useState(false);
  const [paymentOverlayProgress, setPaymentOverlayProgress] = useState(0);
  const autoRedirectInProgressRef = useRef(false);
  const noOpenStoreToastRef = useRef(false);

  // refs para acessibilidade
  const checkoutFirstInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // reducer do fluxo
  const [ui, dispatch] = useReducer(uiReducer, uiInitial);

  // estado geral
  const [orderId, setOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("55");
  const [showInstruction, setShowInstruction] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const modalImageRef = useRef<HTMLImageElement | null>(null);
  const cartButtonRef = useRef<HTMLButtonElement | null>(null);
  const cartShakeTimerRef = useRef<number | null>(null);
  const [flyAnimations, setFlyAnimations] = useState<FlyAnimation[]>([]);
  const [cartShake, setCartShake] = useState(false);
  const [showMpInstructionModal, setShowMpInstructionModal] = useState(false);

  const { storedCart, setStoredCart } = useLocalStorageCart();
  const [cart, setCart] = useState<CartItem[]>(storedCart);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("mercado_pago");
  const [selectedStore, setSelectedStore] = useState<string | null>(() => {
    try {
      const value = localStorage.getItem("eskimo_store");
      return value && value.trim() !== "" ? value : null;
    } catch {
      return null;
    }
  });
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [status, setStatus] = useState<StatusPayload | null>(null);
  const isClosed = useMemo(() => status?.isOpen === false, [status]);

  const [customerToken, setCustomerToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem("eskimo_customer_token");
    } catch {
      return null;
    }
  });
  const [storeCustomer, setStoreCustomer] = useState<StoreCustomerProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState<StoreCustomerProfile | null>(null);
  const clearCustomerAuth = useCallback(() => {
    setCustomerToken(null);
    setStoreCustomer(null);
    setProfileDraft(null);
    try {
      localStorage.removeItem("eskimo_customer_token");
    } catch {
      /* noop */
    }
  }, []);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [homePanelOpen, setHomePanelOpen] = useState(false);
  const [homeHasAlert, setHomeHasAlert] = useState(false);
  const [homeActiveTab, setHomeActiveTab] = useState<"orders" | "profile">(
    "orders",
  );
  const [myOrders, setMyOrders] = useState<CustomerOrderSummary[]>([]);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [orderLookupResult, setOrderLookupResult] =
    useState<OrderStatusResponse | null>(null);
  const [pendingDeliveryConfirmation, setPendingDeliveryConfirmation] =
    useState<{
      id: number;
      store?: string | null;
      total?: number;
    } | null>(null);
  const selectedOrderFromList = useMemo(() => {
    if (!orderLookupResult) return null;
    return myOrders.find((order) => order.id === orderLookupResult.id) ?? null;
  }, [orderLookupResult, myOrders]);
  const canConfirmSelectedDelivery = useMemo(() => {
    if (!orderLookupResult) return false;
    return canCustomerConfirmDelivery({
      status: orderLookupResult.status ?? selectedOrderFromList?.status,
      paymentMethod:
        orderLookupResult.paymentMethod ?? selectedOrderFromList?.paymentMethod,
      deliveryType:
        orderLookupResult.deliveryType ?? selectedOrderFromList?.deliveryType,
    });
  }, [orderLookupResult, selectedOrderFromList]);
  const [authForm, setAuthForm] = useState({
    fullName: "",
    nickname: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    try {
      if (selectedStore) {
        localStorage.setItem("eskimo_store", selectedStore);
      } else {
        localStorage.removeItem("eskimo_store");
      }
    } catch {
      /* noop */
    }

    const event = new CustomEvent<string | null>("eskimo:store-change", {
      detail: selectedStore,
    });
    window.dispatchEvent(event);
  }, [selectedStore]);

  const fetchWithStore = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers || {});
      if (selectedStore && selectedStore.trim() !== "") {
        headers.set("X-Store", selectedStore.trim().toLowerCase());
      }
      if (customerToken) {
        headers.set("Authorization", `Bearer ${customerToken}`);
      }
      return fetch(input, { ...init, headers });
    },
    [selectedStore, customerToken],
  );

  const fetchMpSyncedStatus = useCallback(
    async (id: number): Promise<string | null> => {
      if (!id || Number.isNaN(id)) return null;

      const tryParseStatus = (payload: unknown) => {
        try {
          const obj = payload as Record<string, unknown>;
          const raw = String(
            (obj?.status ??
              obj?.Status ??
              obj?.paymentStatus ??
              obj?.providerStatus ??
              "") as string,
          ).toLowerCase();
          return raw || null;
        } catch {
          return null;
        }
      };

      try {
        const res = await fetchWithStore(`${API_URL}/payments/mp/status/${id}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const payload = await res.json();
          const parsed = tryParseStatus(payload);
          if (parsed) return parsed;
        }
      } catch {
        /* ignore e tenta fallback */
      }

      // Fallback: status direto do pedido (garante retorno mesmo se MP search falhar)
      try {
        const res = await fetchWithStore(`${API_URL}/orders/${id}`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const payload = await res.json();
        return tryParseStatus(payload);
      } catch {
        return null;
      }
    },
    [fetchWithStore],
  );

  const updateSelectedStore = useCallback((store: string | null) => {
    autoRedirectInProgressRef.current = false;
    noOpenStoreToastRef.current = false;
    setSelectedStore(store);
  }, []);

  useEffect(() => {
    if (customerToken) {
      axios.defaults.headers.common.Authorization = `Bearer ${customerToken}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }
  }, [customerToken]);


  // Toast simples local
  const [toast, setToast] = useState<{
    type: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [promos, setPromos] = useState<PromotionDTO[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const addButtonPulseTimerRef = useRef<number | null>(null);
  const addButtonPulseRafRef = useRef<number | null>(null);
  const stockFlashTimerRef = useRef<number | null>(null);
  const [stockFlash, setStockFlash] = useState(false);
  const [addButtonPulse, setAddButtonPulse] = useState(false);
  const showToast = useCallback(
    (
      message: string,
      type: "info" | "success" | "warning" | "error" = "info",
      timeoutMs = 2600,
    ) => {
      setToast({ type, message });
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, timeoutMs);
    },
    [],
  );
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (cartShakeTimerRef.current)
        window.clearTimeout(cartShakeTimerRef.current);
      if (addButtonPulseTimerRef.current)
        window.clearTimeout(addButtonPulseTimerRef.current);
      if (addButtonPulseRafRef.current)
        window.cancelAnimationFrame(addButtonPulseRafRef.current);
      if (stockFlashTimerRef.current)
        window.clearTimeout(stockFlashTimerRef.current);
    };
  }, []);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [lastOrderPaymentMethod, setLastOrderPaymentMethod] =
    useState<PaymentMethod | null>(null);

  useEffect(() => {
    if (!storeCustomer) return;
    setCustomerName((prev) =>
      prev && prev.trim().length > 0 ? prev : storeCustomer.fullName ?? prev,
    );
    setAddress((prev) =>
      prev && prev.trim().length > 0
        ? prev
        : storeCustomer.neighborhood ?? prev,
    );
    setStreet((prev) =>
      prev && prev.trim().length > 0 ? prev : storeCustomer.street ?? prev,
    );
    setNumber((prev) =>
      prev && prev.trim().length > 0 ? prev : storeCustomer.number ?? prev,
    );
    setComplement((prev) =>
      prev && prev.trim().length > 0
        ? prev
        : storeCustomer.complement ?? prev,
    );
    setPhoneNumber((prev) =>
      prev && prev.trim().length > 2
        ? prev
        : storeCustomer.phoneNumber ?? prev,
    );
  }, [storeCustomer]);

  const [quickFilterCategory, setQuickFilterCategory] = useState<string | null>(
    null,
  );
  const [quickFilterSubcategory, setQuickFilterSubcategory] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [componentKey, setComponentKey] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [customAddress, setCustomAddress] = useState("");

  // lojas (constante)
  const storeLocations = useMemo(
    () => [
      { name: "efapi", lat: -27.112815, lng: -52.670769 },
      { name: "palmital", lat: -27.1152884, lng: -52.6166752 },
      { name: "passo", lat: -27.077056, lng: -52.6122383 },
    ],
    [],
  );

  const autoSelectNearestOpenStore = useCallback(
    async (currentStore: string) => {
      const ordered = [...storeLocations];
      if (userCoords) {
        ordered.sort(
          (a, b) =>
            getDistanceFromLatLonInKm(
              userCoords.lat,
              userCoords.lng,
              a.lat,
              a.lng,
            ) -
            getDistanceFromLatLonInKm(
              userCoords.lat,
              userCoords.lng,
              b.lat,
              b.lng,
            ),
        );
      }

      for (const store of ordered) {
        if (store.name === currentStore) continue;
        try {
          const res = await fetch(
            `${API_URL}/status/isOpen/${encodeURIComponent(store.name)}`,
          );
          if (!res.ok) continue;
          const candidate = await res.json();
          if (candidate?.isOpen) {
            updateSelectedStore(store.name);
            setStatus(candidate);
            showToast(
              `Direcionamos você para ${store.name.toUpperCase()} (aberta agora).`,
              "info",
            );
            noOpenStoreToastRef.current = false;
            return true;
          }
        } catch {
          // ignora falha isolada e tenta próxima loja
        }
      }
      return false;
    },
    [showToast, storeLocations, updateSelectedStore, userCoords],
  );

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const endpoint = selectedStore
          ? `${API_URL}/status/isOpen/${encodeURIComponent(selectedStore)}`
          : `${API_URL}/status/isOpen`;
        const res = await fetchWithStore(endpoint);
        const data = res.ok ? await res.json() : { isOpen: true };
        if (cancelled) return;
        setStatus(data);

        if (selectedStore && data?.isOpen === false) {
          if (!autoRedirectInProgressRef.current) {
            autoRedirectInProgressRef.current = true;
            autoSelectNearestOpenStore(selectedStore).then((found) => {
              autoRedirectInProgressRef.current = false;
              if (!found && !noOpenStoreToastRef.current) {
                showToast(
                  "Nenhuma unidade está aberta no momento.",
                  "warning",
                );
                noOpenStoreToastRef.current = true;
              }
            });
          }
        } else if (data?.isOpen) {
          autoRedirectInProgressRef.current = false;
          noOpenStoreToastRef.current = false;
        }
      } catch {
        if (!cancelled) {
          setStatus({ isOpen: true });
        }
      }
    };

    fetchStatus();
    const interval = window.setInterval(fetchStatus, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    autoSelectNearestOpenStore,
    fetchWithStore,
    selectedStore,
    showToast,
  ]);

  useEffect(() => {
    if (!selectedStore) {
      setPromos([]);
      return;
    }
    let cancelled = false;

    const loadPromotions = async () => {
      try {
        const res = await fetchWithStore(`${API_URL}/promotions/list`);
        const data = res.ok ? await res.json() : [];
        if (!cancelled) setPromos(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPromos([]);
      }
    };

    loadPromotions();
    const interval = window.setInterval(loadPromotions, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchWithStore, selectedStore]);

  const [customerName, setCustomerName] = useState("");
  const [deliveryType] = useState<"retirar" | "entregar">("entregar");
  const [deliveryRate, setDeliveryRate] = useState<number>(0);

  const [address, setAddress] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );
  const [quantityToAdd, setQuantityToAdd] = useState(1);

  const [minDelivery, setMinDelivery] = useState<number>(0);

  const triggerCartAnimation = useCallback(
    (imageUrl?: string, originRect?: DOMRect, productId?: number) => {
      const cartRect = cartButtonRef.current?.getBoundingClientRect();
      if (!cartRect) return;

      let sourceRect = originRect;
      if (
        !sourceRect &&
        typeof productId === "number" &&
        typeof document !== "undefined"
      ) {
        const card = document.querySelector<HTMLElement>(
          `[data-product-card="${productId}"]`,
        );
        sourceRect = card?.getBoundingClientRect() ?? undefined;
      }

      const cartCenter = {
        x: cartRect.left + cartRect.width / 2,
        y: cartRect.top + cartRect.height / 2,
      };

      const startCenter = sourceRect
        ? {
            x: sourceRect.left + sourceRect.width / 2,
            y: sourceRect.top + sourceRect.height / 2,
          }
        : {
            x: cartCenter.x - 120,
            y: cartCenter.y - 200,
          };

      const hasMovement =
        Math.abs(startCenter.x - cartCenter.x) > 8 ||
        Math.abs(startCenter.y - cartCenter.y) > 8;
      const adjustedStart = hasMovement
        ? startCenter
        : {
            x: cartCenter.x - 140,
            y: cartCenter.y - 160,
          };

      const animId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const flyer: FlyAnimation = {
        id: animId,
        imageUrl:
          imageUrl ??
          "https://eskimo.com.br/wp-content/uploads/2023/08/Seletto-brigadeiro-sem-lupa.png",
        start: adjustedStart,
        end: cartCenter,
      };

      setFlyAnimations((prev) => [...prev, flyer]);

      window.setTimeout(() => {
        setFlyAnimations((prev) => prev.filter((item) => item.id !== animId));
      }, 900);

      if (cartShakeTimerRef.current)
        window.clearTimeout(cartShakeTimerRef.current);
      setCartShake(false);
      window.requestAnimationFrame(() => {
        setCartShake(true);
        cartShakeTimerRef.current = window.setTimeout(() => {
          setCartShake(false);
          cartShakeTimerRef.current = null;
        }, 600);
      });
    },
    [],
  );
  // hook da taxa de entrega
  const { deliveryFee, recalc } = useDeliveryFee(
    deliveryRate,
    selectedStore,
    storeLocations,
  );
  const effectiveDeliveryFee = useMemo(
    () => Math.max(deliveryFee, minDelivery),
    [deliveryFee, minDelivery],
  );
  const phoneDigits = phoneNumber.startsWith("55")
    ? phoneNumber.slice(2)
    : phoneNumber;
  const isPhoneValid =
    phoneNumber.replace(/\D/g, "").length >= 13;

  // persistir carrinho e unidade
  useEffect(() => {
    setStoredCart(cart);
  }, [cart, setStoredCart]);

  // qtd no carrinho para um produto
  const getQtyInCart = useCallback(
    (productId: number) =>
      cart.find((i) => i.product.id === productId)?.quantity ?? 0,
    [cart],
  );

  const openProductDetails = useCallback(
    (product: Product) => {
      const remaining = product.stock - getQtyInCart(product.id);
      if (remaining <= 0) {
        showToast("Estoque máximo já está no seu carrinho.", "warning");
        return;
      }
      setSelectedProduct(product);
      setQuantityToAdd(1);
    },
    [getQtyInCart, showToast],
  );

  // subtotal
  const subtotal = useMemo(
    () =>
      cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0),
    [cart],
  );

  // restante do selecionado
  const remainingForSelected = useMemo(
    () =>
      selectedProduct
        ? Math.max(selectedProduct.stock - getQtyInCart(selectedProduct.id), 0)
        : 0,
    [selectedProduct, getQtyInCart],
  );
  const addButtonPulseActive = addButtonPulse && remainingForSelected > 0;

  // formatação moeda memoizada
  const toBRL = useCallback((v: number) => fmtBRL.format(v), []);

  // header com scroll
  const [headerHeight, setHeaderHeight] = useState<number>(UI.HEADER_MAX);
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const maxHeight = UI.HEADER_MAX;
      if (currentY <= 0) setHeaderHeight(maxHeight);
      else if (currentY > lastScrollYRef.current && currentY > 20)
        setHeaderHeight(UI.HEADER_MIN);
      else if (currentY < lastScrollYRef.current) setHeaderHeight(maxHeight);
      lastScrollYRef.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // clique fora para fechar dropdown de unidade (quando exibido)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setIsStoreSelectorExpanded] = useState(false);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsStoreSelectorExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // leitura de querystring (?paid=1&orderId=XYZ) ou fallback localStorage,
  // mas só abre confirmação se o pedido estiver pago e ainda não tiver ACK
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const paid = qs.get("paid") === "1";
    const idStr = qs.get("orderId");
    const id = idStr ? parseInt(idStr, 10) : NaN;

    async function resolveAndShow(orderId: number) {
      if (!Number.isFinite(orderId)) return;

      // Se já vimos, não reabrir
      if (hasOrderAck(orderId)) return;
      setOrderId(orderId);

      try {
        const status = await fetchMpSyncedStatus(orderId);

        if (status === "pago" || status === "approved" || status === "paid") {
          setOrderId(orderId);
          setShowConfirmation(true);
          setCart([]);
          clearLastSig();
          try {
            localStorage.setItem("last_order_id", String(orderId));
          } catch {
            /* empty */
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (Number.isFinite(id)) {
      // Mesmo sem paid=1, tentamos confirmar com o backend.
      resolveAndShow(id);
      if (paid) return;
    }

    // Fallback: tentar o último pedido salvo
    try {
      const last = localStorage.getItem("last_order_id");
      const lastId = last ? parseInt(last, 10) : NaN;
      if (Number.isFinite(lastId)) resolveAndShow(lastId);
    } catch {
      /* empty */
    }
  }, [fetchMpSyncedStatus]);

  // detectar loja mais próxima (com obrigatoriedade de permissão)
  useEffect(() => {
    (async () => {
      try {
        const pos = await getPosition();
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        setUserCoords({ lat: userLat, lng: userLng });

        // calcula loja mais próxima
        let closest = storeLocations[0];
        let min = getDistanceFromLatLonInKm(
          userLat,
          userLng,
          closest.lat,
          closest.lng,
        );
        for (let i = 1; i < storeLocations.length; i++) {
          const s = storeLocations[i];
          const d = getDistanceFromLatLonInKm(userLat, userLng, s.lat, s.lng);
          if (d < min) {
            min = d;
            closest = s;
          }
        }
        updateSelectedStore(closest.name);
        setShowInstruction(false);
      } catch (err) {
        console.warn("Permissão de localização negada:", err);
        setUserCoords(null);
        updateSelectedStore(null);
        setShowInstruction(true);
        // 🔁 mostra botão de pedir novamente permissão
        showToast("Ative sua localização para calcular entrega.", "warning");
      }
    })();
  }, [storeLocations]);

  // buscar deliveryRate
  useEffect(() => {
    axios
      .get<{ deliveryRate: number; minDelivery: number }>(`${API_URL}/settings`)
      .then((res) => {
        setDeliveryRate(res.data?.deliveryRate ?? 0);
        setMinDelivery(res.data?.minDelivery ?? 0);
      })
      .catch((err) => console.error("Erro ao buscar settings:", err));
  }, []);

  // buscar produtos (UNIFICADO)
  useEffect(() => {
    if (!selectedStore) return;
    let isMounted = true;

    const fetchProducts = async () => {
      try {
        const res = await axios.get<Product[]>(
          `${API_URL}/products/list?store=${selectedStore}&page=1&pageSize=200`,
        );
        if (isMounted) setProducts(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Erro ao buscar produtos:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setLoading(true);
    fetchProducts();

    // 🔁 Atualiza automaticamente a cada 10 s
    const interval = setInterval(fetchProducts, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedStore]);

  const fetchCustomerProfile = useCallback(async () => {
    if (!customerToken) {
      setStoreCustomer(null);
      setProfileDraft(null);
      return null;
    }
    try {
      const res = await fetchWithStore(`${API_URL}/store-customers/me`);
      if (res.status === 401 || res.status === 403) {
        clearCustomerAuth();
        return null;
      }
      if (!res.ok) {
        console.warn("Falha ao carregar perfil do cliente:", res.status, res.statusText);
        return null;
      }
      const data = (await res.json()) as StoreCustomerProfile;
      setStoreCustomer(data);
      setProfileDraft(data);
      return data;
    } catch (err) {
      console.warn("Falha ao carregar perfil do cliente:", err);
      return null;
    }
  }, [customerToken, fetchWithStore, clearCustomerAuth]);

  useEffect(() => {
    void fetchCustomerProfile();
  }, [fetchCustomerProfile]);

  useEffect(() => {
    if (storeCustomer) setProfileDraft(storeCustomer);
  }, [storeCustomer]);

  const clearProductFilters = useCallback(() => {
    setQuickFilterCategory(null);
    setQuickFilterSubcategory(null);
    setSearch("");
    setCurrentPage(1);
    setSelectedCategory(null);
    setSelectedSubcategory(null);
  }, []);

  useEffect(() => {
    setStockFlash(false);
  }, [selectedProduct]);

  useEffect(() => {
    if (!authModalOpen) return;
    setAuthForm((prev) => ({
      ...prev,
      password: "",
      confirmPassword: "",
    }));
  }, [authModalOpen, authMode]);

  const loadMyOrders = useCallback(async () => {
    if (!customerToken) {
      setMyOrders([]);
      return;
    }
    try {
      const res = await fetchWithStore(`${API_URL}/orders/my`);
      if (!res.ok) throw new Error("Não foi possível carregar pedidos.");
      const data = (await res.json()) as CustomerOrderSummary[];
      setMyOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn(err);
      setMyOrders([]);
    }
  }, [customerToken, fetchWithStore]);

  useEffect(() => {
    if (homePanelOpen) {
      void loadMyOrders();
      setHomeHasAlert(false);
    }
  }, [homePanelOpen, loadMyOrders]);

  const handleAuthSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (authLoading) return;
      try {
        setAuthLoading(true);
        const endpoint =
          authMode === "register"
            ? `${API_URL}/store-customers/register`
            : `${API_URL}/store-customers/login`;

        const payload =
          authMode === "register"
            ? {
                email: authForm.email.trim(),
                fullName: authForm.fullName.trim(),
                nickname: authForm.nickname.trim(),
                password: authForm.password,
                confirmPassword: authForm.confirmPassword,
              }
            : {
                email: authForm.email.trim(),
                password: authForm.password,
              };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        let data: { token?: string; customer?: StoreCustomerProfile } | null =
          null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        if (!res.ok) {
          const message =
            (data as { message?: string })?.message ??
            "Falha ao autenticar cliente.";
          showToast(message, "error");
          return;
        }
        if (data?.token) {
          setCustomerToken(data.token);
          try {
            localStorage.setItem("eskimo_customer_token", data.token);
          } catch {
            /* ignore */
          }
        }
        if (data?.customer) {
          setStoreCustomer(data.customer);
          setProfileDraft(data.customer);
        } else {
          void fetchCustomerProfile();
        }
        showToast(
          authMode === "register"
            ? "Conta criada com sucesso!"
            : "Login realizado!",
          "success",
        );
        setAuthModalOpen(false);
        setAuthForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
        setTimeout(() => {
          void loadMyOrders();
        }, 200);
      } catch (err) {
        console.error(err);
        showToast("Erro ao comunicar com o servidor.", "error");
      } finally {
        setAuthLoading(false);
      }
    },
    [
      authForm,
      authLoading,
      authMode,
      fetchCustomerProfile,
      loadMyOrders,
      showToast,
    ],
  );

  const handleOrderCardClick = useCallback(
    (order: CustomerOrderSummary) => {
      setOrderLookupResult({
        id: order.id,
        store: order.store,
        status: String(order.status ?? "").toLowerCase(),
        total: order.total,
        createdAt: order.createdAt,
        phoneNumber: order.phoneNumber,
        paymentMethod: order.paymentMethod,
        deliveryType: order.deliveryType,
      });
    },
    [],
  );

  const copyOrderNumber = useCallback(() => {
    if (!orderLookupResult) return;
    try {
      navigator.clipboard.writeText(orderLookupResult.id.toString());
      showToast(`Pedido #${orderLookupResult.id} copiado!`, "success", 1800);
    } catch {
      showToast("Não conseguimos copiar o número.", "error");
    }
  }, [orderLookupResult, showToast]);

  const requestConfirmDelivery = useCallback(
    (order: {
      id: number;
      store?: string | null;
      total?: number;
      status?: string | null;
      deliveryType?: string | null;
      paymentMethod?: string | null;
    }) => {
      if (!canCustomerConfirmDelivery(order)) return;
      setPendingDeliveryConfirmation({
        id: order.id,
        store: order.store,
        total: order.total,
      });
    },
    [],
  );

  const triggerAddButtonPulse = useCallback(() => {
    if (addButtonPulseTimerRef.current) {
      window.clearTimeout(addButtonPulseTimerRef.current);
      addButtonPulseTimerRef.current = null;
    }
    if (addButtonPulseRafRef.current) {
      window.cancelAnimationFrame(addButtonPulseRafRef.current);
      addButtonPulseRafRef.current = null;
    }
    setAddButtonPulse(false);
    addButtonPulseRafRef.current = window.requestAnimationFrame(() => {
      setAddButtonPulse(true);
      addButtonPulseTimerRef.current = window.setTimeout(() => {
        setAddButtonPulse(false);
        addButtonPulseTimerRef.current = null;
        if (addButtonPulseRafRef.current) {
          window.cancelAnimationFrame(addButtonPulseRafRef.current);
          addButtonPulseRafRef.current = null;
        }
      }, 420);
    });
  }, []);

  const triggerStockFlash = useCallback(() => {
    if (stockFlashTimerRef.current) {
      window.clearTimeout(stockFlashTimerRef.current);
      stockFlashTimerRef.current = null;
    }
    setStockFlash(false);
    requestAnimationFrame(() => {
      setStockFlash(true);
      stockFlashTimerRef.current = window.setTimeout(() => {
        setStockFlash(false);
        stockFlashTimerRef.current = null;
      }, 600);
    });
  }, []);

  const performConfirmDelivery = useCallback(async () => {
    if (!pendingDeliveryConfirmation) return;
    const orderId = pendingDeliveryConfirmation.id;
    try {
      const res = await fetchWithStore(
        `${API_URL}/orders/${orderId}/deliver`,
        { method: "PATCH" },
      );
      if (!res.ok) throw new Error("Fail");

      showToast("Obrigado! Entrega confirmada.", "success");
      setPendingDeliveryConfirmation(null);
      setMyOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status: "entregue" } : order,
        ),
      );
      setOrderLookupResult((prev) =>
        prev && prev.id === orderId ? { ...prev, status: "entregue" } : prev,
      );
      void loadMyOrders();
    } catch (err) {
      console.error(err);
      showToast(
        "Não conseguimos confirmar a entrega agora.",
        "error",
      );
    }
  }, [
    pendingDeliveryConfirmation,
    fetchWithStore,
    showToast,
    loadMyOrders,
  ]);

  const cancelConfirmDelivery = useCallback(() => {
    setPendingDeliveryConfirmation(null);
  }, []);

  const StatusSteps = ({ status }: { status: string }) => {
    const normalized = (status || "").toLowerCase();
    const isPaid =
      normalized === "pago" ||
      normalized === "paid" ||
      normalized === "approved";
    const isPending =
      normalized === "pendente" ||
      normalized === "pending" ||
      normalized === "in_process";
    const isFail =
      normalized === "cancelado" ||
      normalized === "rejected" ||
      normalized === "failure";

    const Row = ({
      ok,
      fail,
      label,
    }: {
      ok?: boolean;
      fail?: boolean;
      label: string;
    }) => {
      const icon = fail ? "❌" : ok ? "✅" : "☐";
      const color = fail
        ? "text-red-600"
        : ok
          ? "text-green-700"
          : "text-gray-500";
      return (
        <div className={`flex items-center gap-2 text-sm ${color}`}>
          <span className="w-5 text-lg leading-none">{icon}</span>
          <span>{label}</span>
        </div>
      );
    };

    return (
      <div className="space-y-1">
        <Row ok={isPending || isPaid} label="Em processo" />
        <Row ok={isPaid} label="Pago" />
        <Row ok={isPaid} label="Confirmado" />
        <Row fail={isFail} label="Não aprovado" />
      </div>
    );
  };

  const handleLogout = useCallback(() => {
    setCustomerToken(null);
    setStoreCustomer(null);
    setProfileDraft(null);
    setMyOrders([]);
    setOrderLookupResult(null);
    setHomePanelOpen(false);
    setHomeActiveTab("orders");
    setHomeHasAlert(false);
    try {
      localStorage.removeItem("eskimo_customer_token");
    } catch {
      /* ignore */
    }
    showToast("Você saiu da sua conta.", "info");
  }, [showToast]);

  const handleProfileSave = useCallback(async () => {
    if (!profileDraft || !customerToken) {
      showToast("Faça login para atualizar o perfil.", "warning");
      return;
    }
    try {
      const res = await fetchWithStore(`${API_URL}/store-customers/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: profileDraft.fullName,
          nickname: profileDraft.nickname,
          phoneNumber: profileDraft.phoneNumber,
          neighborhood: profileDraft.neighborhood,
          street: profileDraft.street,
          number: profileDraft.number,
          complement: profileDraft.complement,
          profileImageBase64: profileDraft.profileImageBase64,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = "Falha ao salvar perfil.";
        try {
          const data = JSON.parse(text);
          message = data?.message ?? message;
        } catch {
          /* ignore */
        }
        showToast(message, "error");
        return;
      }
      const updated = (await res.json()) as StoreCustomerProfile;
      setStoreCustomer(updated);
      setProfileDraft(updated);
      setCustomerName(updated.fullName ?? "");
      setPhoneNumber(updated.phoneNumber ?? "");
      const matchedNeighborhood = findNeighborhoodMatch(updated.neighborhood ?? "");
      if (matchedNeighborhood) {
        setAddress(matchedNeighborhood);
        setCustomAddress("");
      } else if (updated.neighborhood) {
        setAddress("Outro");
        setCustomAddress(updated.neighborhood);
      } else {
        setAddress("");
        setCustomAddress("");
      }
      setStreet(updated.street ?? "");
      setNumber(updated.number ?? "");
      setComplement(updated.complement ?? "");
      showToast("Perfil atualizado!", "success");
    } catch (err) {
      console.error(err);
      showToast("Erro ao salvar perfil.", "error");
    }
  }, [
    customerToken,
    fetchWithStore,
    profileDraft,
    setAddress,
    setComplement,
    setCustomAddress,
    setCustomerName,
    setNumber,
    setPhoneNumber,
    setStreet,
    showToast,
  ]);

  const handleAvatarChange = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast("Imagem deve ter até 2MB.", "warning");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setProfileDraft((prev) =>
          prev ? { ...prev, profileImageBase64: base64 } : prev,
        );
      };
      reader.readAsDataURL(file);
    },
    [showToast],
  );

  const profileNeighborhoodOption = useMemo(() => {
    const raw = profileDraft?.neighborhood ?? "";
    if (!raw) return "";
    return findNeighborhoodMatch(raw) ?? "Outro";
  }, [profileDraft?.neighborhood]);

  // categorias e subcategorias memorizadas
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.categoryName))),
    [products],
  );
  const subcategoriesByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of products) {
      if (!p.subcategoryName) continue;
      if (!map.has(p.categoryName)) map.set(p.categoryName, []);
      const arr = map.get(p.categoryName)!;
      if (!arr.includes(p.subcategoryName)) arr.push(p.subcategoryName);
    }
    return map;
  }, [products]);
  const getSubcategories = useCallback(
    (category: string) => subcategoriesByCategory.get(category) ?? [],
    [subcategoriesByCategory],
  );

  // filtros memorizados
  const filtered = useMemo(() => {
    const searchTerms = normalize(search).split(" ").filter(Boolean);
    return products.filter((p) => {
      const searchableText = normalize(
        `${p.name} ${p.description} ${p.subcategoryName ?? ""}`,
      );
      const matchesSearch = searchTerms.every((term) =>
        searchableText.includes(term),
      );
      const matchesCategory =
        search.trim() === ""
          ? quickFilterCategory
            ? p.categoryName === quickFilterCategory
            : selectedCategory
              ? p.categoryName === selectedCategory
              : true
          : true;
      const matchesSubcategory = quickFilterSubcategory
        ? p.subcategoryName === quickFilterSubcategory
        : selectedSubcategory
          ? p.subcategoryName === selectedSubcategory
          : true;
      return matchesSearch && matchesCategory && matchesSubcategory;
    });
  }, [
    products,
    search,
    quickFilterCategory,
    quickFilterSubcategory,
    selectedCategory,
    selectedSubcategory,
  ]);

  const produtosOrdenados = useMemo(() => {
    const ordemCategorias = [
      "Picolé",
      "Pote de Sorvete",
      "Tortas",
      "Açaí",
      "Sundae",
      "Extras",
      "selleto",
      "Complementos",
    ];
    const ordemSubcategorias: Record<string, string[]> = {
      Picolé: [
        "Frutas",
        "Cremes",
        "Diamond",
        "Ituzinho",
        "Kids",
        "Grego",
        "Sem Subcategoria",
      ],
      "Pote de Sorvete": [
        "2L",
        "1,5L",
        "Best Cup",
        "Grand Nevado",
        "Sem Subcategoria",
      ],
      Tortas: ["Sem Subcategoria"],
      Açaí: ["guaraná", "banana"],
      Sundae: ["Sem Subcategoria"],
      Extras: ["Cobertura", "Cascão"],
      selleto: ["Sem Subcategoria"],
      Complementos: ["Sem Subcategoria"],
    };
    const getCatIdx = (c: string) => {
      const idx = ordemCategorias.indexOf(c);
      return idx === -1 ? 999 : idx;
    };
    const getSubIdx = (c?: string, s?: string) => {
      if (!c || !s) return 999;
      const arr = ordemSubcategorias[c];
      if (!arr) return 999;
      const i = arr.indexOf(s);
      return i === -1 ? 999 : i;
    };
    return [...filtered].sort((a, b) => {
      if ((a.pinnedTop ?? false) !== (b.pinnedTop ?? false)) {
        return (b.pinnedTop ? 1 : 0) - (a.pinnedTop ? 1 : 0);
      }
      if ((a.sortRank ?? 9999) !== (b.sortRank ?? 9999)) {
        return (a.sortRank ?? 9999) - (b.sortRank ?? 9999);
      }
      const cA = getCatIdx(a.categoryName);
      const cB = getCatIdx(b.categoryName);
      if (cA !== cB) return cA - cB;
      const sA = getSubIdx(a.categoryName, a.subcategoryName);
      const sB = getSubIdx(b.categoryName, b.subcategoryName);
      if (sA !== sB) return sA - sB;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  // paginação automática (infinite scroll)
  const paginados = useMemo(
    () => produtosOrdenados.slice(0, currentPage * UI.PRODUCTS_PER_PAGE),
    [produtosOrdenados, currentPage],
  );

  const totalPages = useMemo(
    () => Math.ceil(filtered.length / UI.PRODUCTS_PER_PAGE),
    [filtered.length],
  );

  // sentinela para carregar mais
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setCurrentPage((p) => {
            if (p < totalPages) return p + 1;
            return p;
          });
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) observer.unobserve(loadMoreRef.current);
    };
  }, [totalPages]);

  // máscara e envio limpo do telefone
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let digits = e.target.value.replace(/\D/g, "");
      if (digits.length > 11) digits = digits.slice(0, 11);
      setPhoneNumber(digits ? `55${digits}` : "55");
    },
    [],
  );

  const requireCustomerAuth = useCallback((): boolean => {
    if (storeCustomer) return true;
    showToast("Crie sua conta ou faça login para continuar.", "warning");
    setAuthMode("register");
    setAuthModalOpen(true);
    return false;
  }, [showToast, storeCustomer]);

  // Handlers de carrinho
  const addToCart = useCallback(
    (
      product: Product,
      quantity: number = 1,
      animation?: AddToCartOptions,
    ): void => {
      if (!requireCustomerAuth()) {
        return;
      }
      if (isClosed) {
        showToast(
          status?.message || "Fora do horário de funcionamento.",
          "warning",
        );
        return;
      }
      let addedQuantity = 0;
      setCart((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        const currentInCart = existing?.quantity ?? 0;
        const remaining = product.stock - currentInCart;
        if (remaining <= 0) {
          showToast("Estoque máximo já está no seu carrinho.", "warning");
          return prev;
        }
        const toAdd = Math.min(quantity, remaining);
        addedQuantity = toAdd;
        if (existing)
          return prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + toAdd }
              : i,
          );
        return [...prev, { product, quantity: toAdd }];
      });

      if (addedQuantity > 0) {
        const imageForAnim = animation?.imageUrl ?? product.imageUrl;
        const originForAnim = animation?.originRect;
        const productIdForAnim = animation?.productId ?? product.id;
        animation?.onBeforeAnimate?.();
        requestAnimationFrame(() =>
          triggerCartAnimation(imageForAnim, originForAnim, productIdForAnim),
        );
      }
    },
    [
      isClosed,
      requireCustomerAuth,
      showToast,
      status?.message,
      triggerCartAnimation,
    ],
  );

  const removeFromCart = useCallback(
    (id: number) => setCart((prev) => prev.filter((i) => i.product.id !== id)),
    [],
  );

  const updateQuantity = useCallback((id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== id) return item;
          const max = item.product.stock;
          const next = clampQty(item.quantity + delta, max);
          return next === 0 ? null : { ...item, quantity: next };
        })
        .filter((i): i is CartItem => i !== null),
    );
  }, []);

  // foco no primeiro input ao abrir checkout
  useEffect(() => {
    if (ui.stage === "checkout")
      setTimeout(() => checkoutFirstInputRef.current?.focus(), 0);
  }, [ui.stage]);

  // ESC fecha o checkout
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (ui.stage === "checkout") dispatch({ type: "RESET" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.stage]);

  // Validação antes do pagamento
  const validateBeforePayment = useCallback(async (): Promise<boolean> => {
    if (cart.length === 0) {
      showToast("Seu carrinho está vazio!", "warning");
      return false;
    }
    if (!selectedStore) {
      showToast("Selecione a unidade para continuar.", "warning");
      return false;
    }
    if (!customerName.trim()) {
      showToast("Informe seu nome completo.", "warning");
      return false;
    }

    // Entrega obrigatória no layout atual
    if (!address.trim()) {
      showToast("Escolha seu bairro.", "warning");
      return false;
    }
    if (address === "Outro" && !customAddress.trim()) {
      showToast("Digite seu bairro no campo 'Outro'.", "warning");
      return false;
    }
    if (!street.trim()) {
      showToast("Informe a rua.", "warning");
      return false;
    }
    if (!number.trim()) {
      showToast("Informe o número.", "warning");
      return false;
    }
    if (!isPhoneValid) {
      showToast("Informe seu WhatsApp com DDD (ex: 49991234567).", "warning");
      return false;
    }
    if (deliveryFee === 0 && minDelivery === 0) {
      await recalc();
      showToast(
        "Ative sua localização ou informe endereço. Não foi possível calcular a taxa.",
        "warning",
      );
      return false;
    }

    return true;
  }, [
    cart.length,
    selectedStore,
    customerName,
    address,
    customAddress,
    street,
    number,
    phoneNumber,
    deliveryFee,
    minDelivery,
    recalc,
    isPhoneValid,
  ]);

  const finalizePaidOrder = useCallback(
    (paidOrderId: number) => {
      setPaymentOverlay(false);
      setOrderId(paidOrderId);
      setCart([]);
      clearLastSig();
      try {
        localStorage.setItem("last_order_id", String(paidOrderId));
      } catch {
        /* empty */
      }
      setShowConfirmation(true);
      setLastOrderPaymentMethod("mercado_pago");
      setHomeHasAlert(true);
      void loadMyOrders();
    },
    [
      setPaymentOverlay,
      setOrderId,
      setCart,
      setShowConfirmation,
      loadMyOrders,
      setLastOrderPaymentMethod,
    ],
  );

  // Polling universal: com orderId definido e sem confirmação aberta,
  // verifica status a cada 5s até 10 minutos. Ao "pago", fecha o MP e mostra a confirmação.
  useEffect(() => {
    if (!orderId || showConfirmation) return;

    let tries = 0;
    const maxTries = Math.ceil((10 * 60) / 5); // 10 minutos
    const iv = window.setInterval(async () => {
      tries++;
      try {
        const status = await fetchMpSyncedStatus(orderId);
        if (status === "pago" || status === "approved" || status === "paid") {
          finalizePaidOrder(orderId);
          window.clearInterval(iv);
        }
      } catch {
        /* ignore */
      }
      if (tries >= maxTries) window.clearInterval(iv);
    }, 5000);

    return () => window.clearInterval(iv);
  }, [orderId, showConfirmation, finalizePaidOrder, fetchMpSyncedStatus]);

  const checkPaidOnce = useCallback(
    async (id: number): Promise<boolean> => {
      const raw = await fetchMpSyncedStatus(id);
      return raw === "pago" || raw === "approved" || raw === "paid";
    },
    [fetchMpSyncedStatus],
  );

  useEffect(() => {
    if (!orderId || showConfirmation) return;

    let cancelled = false;
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      if (!orderId || showConfirmation || cancelled) return;
      try {
        const paid = await checkPaidOnce(orderId);
        if (paid) finalizePaidOrder(orderId);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    void handleVisibility();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orderId, showConfirmation, checkPaidOnce, finalizePaidOrder]);

  type CancelAttemptResult = "cancelled" | "already_paid" | "failed";

  const cancelOrderIfUnpaid = useCallback(
    async (id: number | null | undefined): Promise<CancelAttemptResult> => {
      if (typeof id !== "number" || Number.isNaN(id)) return "failed";
      const alreadyPaid = await checkPaidOnce(id);
      if (alreadyPaid) return "already_paid";
      try {
        const resp = await fetchWithStore(`${API_URL}/orders/${id}/cancel`, {
          method: "PATCH",
        });
        return resp.ok ? "cancelled" : "failed";
      } catch {
        return "failed";
      }
    },
    [checkPaidOnce, fetchWithStore],
  );

  // Fluxo de pagamento com Mercado Pago (cria pedido → inicia cobrança no backend)
  const processMercadoPagoPayment = useCallback(async () => {
    if (!requireCustomerAuth()) return;
    if (isClosed) {
      showToast(
        status?.message || "Loja fechada no momento.",
        "warning",
      );
      return;
    }
    if (paymentBusy) return;

    setPaymentBusy(true);
    setPaymentOverlay(true);
    setPaymentOverlayProgress(0);

    const overlayTimer = window.setInterval(() => {
      setPaymentOverlayProgress((p) =>
        Math.min(p + Math.random() * 10 + 5, 92),
      );
    }, 300);

    try {
      const ok = await validateBeforePayment();
      // Se já existe pedido pendente mas a "assinatura" mudou, cancela o antigo
      const currentSig = buildOrderSignature(
        cart,
        effectiveDeliveryFee,
        selectedStore,
        "mercado_pago",
      );

      if (orderId && getLastSig() && getLastSig() !== currentSig) {
        const cancelResult = await cancelOrderIfUnpaid(orderId);
        if (cancelResult === "already_paid") {
          showToast("Seu pedido anterior já foi pago e está em processamento.", "info", 4000);
        } else if (cancelResult === "failed") {
          showToast("Não conseguimos cancelar o pedido anterior. Vamos continuar assim mesmo.", "warning");
        }
        setOrderId(null);
      }

      if (!ok) return;

      // 1) usa pedido existente; senão cria
      let currentOrderId = orderId ?? null;
      if (!currentOrderId) {
        const realDeliveryFee = effectiveDeliveryFee;
        const realTotal = subtotal + realDeliveryFee;

        const orderPayload = {
          customerName: customerName.trim(),
          address: (address === "Outro" ? customAddress : address).trim(),
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim(),
          deliveryType,
          store: selectedStore,
          items: cart.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity,
            imageUrl: item.product.imageUrl,
          })),
          total: realTotal,
          deliveryFee: realDeliveryFee,
          phoneNumber,
          paymentMethod: "mercado_pago",
        };

        const orderRes = await fetchWithStore(`${API_URL}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
        });

        if (!orderRes.ok) {
          showToast("Falha ao criar pedido.", "error");
          return;
        }

        let orderData: unknown = null;
        const orderText = await orderRes.text();
        try {
          orderData = orderText ? JSON.parse(orderText) : null;
        } catch {
          /* empty */
        }
        const createdOrderId = isOrderResponse(orderData)
          ? orderData.id
          : undefined;

        if (!createdOrderId || !Number.isFinite(createdOrderId)) {
          showToast("Pedido criado, mas ID inválido retornado.", "error");
          return;
        }
        currentOrderId = createdOrderId;
        setOrderId(createdOrderId);
        // Guarda a assinatura que originou este pedido
        setLastSig(currentSig);
        setHomeHasAlert(true);
        void loadMyOrders();
      }

      try {
        localStorage.setItem("last_order_id", String(currentOrderId));
      } catch {
        /* empty */
      }
      setLastSig(currentSig);

      // 2) Redireciona para o Checkout Pro; o MP retorna automaticamente via auto_return
      const goUrl = `${API_URL}/payments/mp/go?orderId=${currentOrderId}`;
      setPaymentOverlay(false);
      window.location.assign(goUrl);
      return;
    } catch (e) {
      console.error(e);
      showToast("Erro ao processar pagamento com Mercado Pago.", "error");
    } finally {
      setPaymentBusy(false);
      setPaymentOverlayProgress(100);
      window.setTimeout(() => setPaymentOverlay(false), 350);
      window.clearInterval(overlayTimer);
    }
  }, [
    paymentBusy,
    validateBeforePayment,
    orderId,
    deliveryType,
    effectiveDeliveryFee,
    subtotal,
    customerName,
    address,
    customAddress,
    street,
    number,
    complement,
    selectedStore,
    cart,
    phoneNumber,
    cancelOrderIfUnpaid,
    setPaymentOverlay,
    isClosed,
    showToast,
    status?.message,
    fetchWithStore,
    requireCustomerAuth,
  ]);

  const confirmMpInstructionsAndPay = useCallback(() => {
    setShowMpInstructionModal(false);
    void processMercadoPagoPayment();
  }, [processMercadoPagoPayment]);

  const dismissMpInstructions = useCallback(() => {
    setShowMpInstructionModal(false);
  }, []);

  const handleMercadoPagoPayment = useCallback(() => {
    setShowMpInstructionModal(true);
  }, []);

  const handleCashOrder = useCallback(async () => {
    if (!requireCustomerAuth()) return;
    if (isClosed) {
      showToast(
        status?.message || "Loja fechada no momento.",
        "warning",
      );
      return;
    }
    if (paymentBusy) return;

    setPaymentBusy(true);
    try {
      const ok = await validateBeforePayment();
      const currentSig = buildOrderSignature(
        cart,
        effectiveDeliveryFee,
        selectedStore,
        "cash",
      );

      if (orderId && getLastSig() && getLastSig() !== currentSig) {
        await cancelOrderIfUnpaid(orderId);
        setOrderId(null);
      }

      if (!ok) return;

      const realDeliveryFee = effectiveDeliveryFee;
      const realTotal = subtotal + realDeliveryFee;

      const orderPayload = {
        customerName: customerName.trim(),
        address: (address === "Outro" ? customAddress : address).trim(),
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim(),
        deliveryType,
        store: selectedStore,
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          imageUrl: item.product.imageUrl,
        })),
        total: realTotal,
        deliveryFee: realDeliveryFee,
        phoneNumber,
        paymentMethod: "cash",
      };

      const orderRes = await fetchWithStore(`${API_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });

      if (!orderRes.ok) {
        showToast("Falha ao criar pedido em dinheiro.", "error");
        return;
      }

      let orderData: unknown = null;
      const orderText = await orderRes.text();
      try {
        orderData = orderText ? JSON.parse(orderText) : null;
      } catch {
        /* empty */
      }
      const createdOrderId = isOrderResponse(orderData)
        ? orderData.id
        : undefined;

      if (!createdOrderId || !Number.isFinite(createdOrderId)) {
        showToast("Pedido salvo, mas não recebemos o número.", "error");
        return;
      }

      setOrderId(createdOrderId);
      setLastSig(currentSig);
      setCart([]);
      dispatch({ type: "RESET" });
      setShowConfirmation(true);
      setLastOrderPaymentMethod("cash");
      setHomeHasAlert(true);
      showToast(
        "Pedido enviado! Pague em dinheiro ao motoboy.",
        "success",
      );
      void loadMyOrders();
      try {
        localStorage.setItem("last_order_id", String(createdOrderId));
      } catch {
        /* empty */
      }
    } catch (error) {
      console.error(error);
      showToast("Erro ao enviar pedido em dinheiro.", "error");
    } finally {
      setPaymentBusy(false);
    }
  }, [
    requireCustomerAuth,
    isClosed,
    status?.message,
    paymentBusy,
    validateBeforePayment,
    cart,
    effectiveDeliveryFee,
    selectedStore,
    orderId,
    cancelOrderIfUnpaid,
    fetchWithStore,
    setOrderId,
    subtotal,
    customerName,
    address,
    customAddress,
    street,
    number,
    complement,
    deliveryType,
    phoneNumber,
    setCart,
    dispatch,
    setShowConfirmation,
    setHomeHasAlert,
    loadMyOrders,
    showToast,
    setLastOrderPaymentMethod,
  ]);

  // ---- RENDER ----
  return (
    <div key={componentKey} className="loja-container">
      {storeCustomer?.profileImageBase64 && (
        <button
          onClick={() => {
            setHomePanelOpen(true);
            setHomeActiveTab("profile");
          }}
          className="fixed left-5 top-60 z-[40] h-16 w-16 overflow-hidden rounded-full border-4 border-green-400 bg-white shadow-xl transition hover:scale-105 active:scale-95"
          aria-label="Abrir Minha Área"
        >
          <img
            src={storeCustomer.profileImageBase64}
            alt="Foto do cliente"
            className="h-full w-full object-cover"
          />
        </button>
      )}

      {/* espaçamento para o header */}
      {isClosed && (
        <div className="fixed left-0 right-0 top-0 z-[60] bg-red-600 text-white text-center text-sm font-semibold shadow-lg">
          <div className="px-4 py-2">
            {status?.message || "Loja fechada"}
            {status?.nextOpening
              ? ` · Próxima abertura: ${status.nextOpening}`
              : ""}
          </div>
        </div>
      )}
      <div className="h-[205px]" />

      <LinhaProdutosAtalhos
        onSelectCategorySubcategory={(category, subcategory) => {
          setQuickFilterCategory(category);
          setQuickFilterSubcategory(subcategory || null);
          setSearch("");
          setCurrentPage(1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {/* Cabeçalho */}
      <div
        className="fixed left-0 right-0 top-0 z-50 flex flex-col items-center justify-start bg-gradient-to-b from-white/0 via-white/10 to-white bg-cover bg-center bg-no-repeat shadow-md transition-all duration-300"
        style={{
          backgroundImage:
            "url('https://i.pinimg.com/736x/81/6f/70/816f70cc68d9b3b3a82e9f58e912f9ef.jpg')",
          height: `${headerHeight}px`,
          overflow: "hidden",
        }}
      >
        <div
          className="flex cursor-pointer items-center justify-center py-2 transition hover:scale-105"
          role="button"
          tabIndex={0}
          onClick={() => {
            clearProductFilters();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              clearProductFilters();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/9/96/Logo_eskim%C3%B3_Sorvetes_Vermelha.png"
            alt="Eskimo Logo"
            className="h-10 w-auto object-contain"
          />
        </div>

        {showInstruction && (
          <div className="mb-3 flex flex-col items-center justify-center gap-2">
            <div className="animate-pulse text-sm text-gray-900">
              ⚙️ Precisamos da sua localização para calcular a entrega
            </div>
            <button
              onClick={async () => {
                try {
                  const pos = await getPosition();
                  const userLat = pos.coords.latitude;
                  const userLng = pos.coords.longitude;
                  setUserCoords({ lat: userLat, lng: userLng });

                  let closest = storeLocations[0];
                  let min = getDistanceFromLatLonInKm(
                    userLat,
                    userLng,
                    closest.lat,
                    closest.lng,
                  );
                  for (let i = 1; i < storeLocations.length; i++) {
                    const s = storeLocations[i];
                    const d = getDistanceFromLatLonInKm(
                      userLat,
                      userLng,
                      s.lat,
                      s.lng,
                    );
                    if (d < min) {
                      min = d;
                      closest = s;
                    }
                  }
                  updateSelectedStore(closest.name);
                  setShowInstruction(false);
                  showToast("Localização detectada com sucesso!", "success");
                } catch (err) {
                  const msg =
                    err instanceof Error && err.message.includes("negada")
                      ? "A permissão de localização está bloqueada no navegador. Libere nas configurações e tente novamente."
                      : "Ative a localização e tente novamente.";
                  showToast(msg, "warning");
                }
              }}
              className="rounded-full bg-blue-500 px-4 py-2 text-sm text-white shadow hover:bg-blue-600 active:scale-95"
            >
              📍 Ativar localização
            </button>
          </div>
        )}

        

        {/* Seleção de unidade */}
        <div className="z-50 flex flex-wrap justify-center gap-2 px-3 py-1 md:gap-4 md:px-5">
          {["efapi", "palmital", "passo"].map((store) => (
            <button
              key={store}
              onClick={() => {
                if (selectedStore !== store) updateSelectedStore(store);
                else {
                  setUserCoords(null);
                  updateSelectedStore(null);
                  setTimeout(() => updateSelectedStore(store), 0);
                }
                setCart([]);
                setShowInstruction(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold shadow transition-all duration-300 md:px-5 md:py-2 md:text-sm ${
                selectedStore === store
                  ? "border-yellow-200 bg-yellow-300 text-gray-900 ring-1 ring-yellow-300"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              }`}
              aria-label={`Selecionar unidade ${store}`}
            >
              🍦{" "}
              {store === "efapi"
                ? "Efapi"
                : store === "palmital"
                  ? "Palmital"
                  : "Passo"}
            </button>
          ))}
        </div>

        <div className="mt-1 text-xs text-gray-500">
          {filtered.length} produto(s) encontrado(s)
        </div>
      </div>

      {/* 🔍 Barra de pesquisa + filtros */}
      <div
        className="fixed z-40 w-full transition-all duration-300"
        style={{
          transform: `translateY(${headerHeight + 5}px)`,
          background: "transparent",
        }}
      >
        <div className="mx-auto w-full max-w-md space-y-3 px-4">
          <input
            type="text"
            placeholder="Buscar produto..."
            className="w-full rounded-xl border border-white/40 bg-white/90 px-4 py-2 text-base shadow-md backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-red-300"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
              setSelectedCategory(null);
              setSelectedSubcategory(null);
              setQuickFilterCategory(null);
              setQuickFilterSubcategory(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-label="Buscar produto"
          />

          <div className="flex gap-2">
            <div className="w-1/2 rounded-xl bg-white/90 shadow-md backdrop-blur-md">
              <select
                className="w-full appearance-none rounded-xl bg-transparent px-4 py-2 text-base text-gray-800 focus:outline-none"
                value={selectedCategory || ""}
                onChange={(e) => {
                  setQuickFilterCategory(null);
                  setQuickFilterSubcategory(null);
                  setSelectedCategory(e.target.value || null);
                  setSelectedSubcategory(null);
                  setSearch("");
                  setCurrentPage(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label="Selecionar categoria"
              >
                <option value="">Categoria</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-1/2 rounded-xl bg-white/90 shadow-md backdrop-blur-md">
              <select
                className="w-full appearance-none rounded-xl bg-transparent px-4 py-2 text-base text-gray-800 focus:outline-none"
                value={selectedSubcategory || ""}
                onChange={(e) => {
                  setQuickFilterCategory(null);
                  setQuickFilterSubcategory(null);
                  setSelectedSubcategory(e.target.value || null);
                  setSearch("");
                  setCurrentPage(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label="Selecionar subcategoria"
              >
                <option value="">Tipo</option>
                {(selectedCategory
                  ? getSubcategories(selectedCategory)
                  : []
                ).map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Grade de produtos */}
      <div className="px-6 pb-40">
        {loading ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="h-64 w-full animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </div>
        ) : (
          <div className="produtos-grid">
            {paginados.map((product) => (
              <div
                key={product.id}
                className="product-card"
                data-product-card={product.id}
              >
                <div
                  className="product-image-wrapper"
                  onClick={() => openProductDetails(product)}
                >
                  <img
                    loading="lazy"
                    src={product.imageUrl}
                    alt={product.name}
                    className="product-image"
                  />
                </div>
                <div className="product-info">
                  <h3 className="product-title">{product.name}</h3>
                  <p className="product-price">{toBRL(product.price)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sentinela invisível para carregar mais */}
      {currentPage < totalPages && (
        <div ref={loadMoreRef} className="mb-24 mt-4 h-10 w-full text-center">
          <span className="text-sm text-gray-400">Carregando mais...</span>
        </div>
      )}

      {/* Rodapé */}
      <footer className="mt-12 border-t border-gray-200 bg-gradient-to-b from-white to-gray-50 pb-6 pt-8 text-center"></footer>

      {/* Botões flutuantes */}
      <button
        onClick={() => {
          setHomePanelOpen(true);
          setHomeActiveTab("orders");
        }}
        className={`fixed bottom-48 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-indigo-500 p-3 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 ${
          homeHasAlert ? "animate-pulse" : ""
        }`}
      >
        <div className="relative text-3xl">
          🏠
          {homeHasAlert && (
            <>
              <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 animate-ping rounded-full bg-yellow-300 opacity-75" />
              <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 rounded-full bg-yellow-400" />
            </>
          )}
        </div>
        <div className="mt-1 text-xs font-semibold">Pedidos</div>
      </button>

      <button
        ref={cartButtonRef}
        onClick={() => {
          if (!requireCustomerAuth()) return;
          dispatch({ type: "OPEN_CHECKOUT" });
        }}
        className={`fixed bottom-20 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-yellow-500 p-3 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 ${
          cartShake ? "cart-shake" : ""
        }`}
        aria-label="Abrir carrinho"
      >
        <div className="text-3xl">🛒</div>
        <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-yellow-500 shadow-md">
          {cart.reduce((sum, item) => sum + item.quantity, 0)}
        </div>
      </button>

      {/* Drawer simples de checkout/carrinho */}
      {ui.stage === "checkout" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          {/* Wrapper NÃO rolável */}
          <div className="relative w-full max-w-sm">
            <button
              onClick={() => dispatch({ type: "RESET" })}
              className="absolute right-4 top-4 z-10 text-2xl text-gray-400 transition hover:text-red-500"
              aria-label="Fechar"
            >
              ✕
            </button>

            {/* Conteúdo rolável */}
            <div className="animate-zoom-fade max-h-[85vh] overflow-y-auto overscroll-contain rounded-3xl bg-white/90 p-6 pt-10 shadow-2xl">
              <h2 className="mb-4 text-center text-xl font-semibold text-gray-800">
                Finalizar Pedido
              </h2>

              <p className="mt-2 text-sm text-gray-700">
                🚚 Entrega: {toBRL(effectiveDeliveryFee)}
              </p>

              {/* Nome */}
              <input
                ref={checkoutFirstInputRef}
                type="text"
                placeholder="Seu nome completo"
                className="mb-3 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-base text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              {/* Tipo de entrega fixo visual */}
              <div className="mb-3 w-full rounded-xl border border-gray-300 bg-green-50 px-4 py-2 text-sm text-gray-800">
                🚚 Entrega em Casa
              </div>

              <div className="flex flex-col gap-3">
                <select
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-base text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (e.target.value !== "Outro") setCustomAddress("");
                  }}
                >
                  <option value="">Escolha seu bairro</option>
                  {NEIGHBORHOODS.map((b) => (
                    <option key={b} value={b}>
                      {b === "Outro" ? "Outro..." : b}
                    </option>
                  ))}
                </select>

                {address === "Outro" && (
                  <input
                    type="text"
                    placeholder="Digite seu bairro"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-base text-gray-700 focus:border-red-400 focus:ring focus:ring-red-200"
                  />
                )}

                <input
                  type="text"
                  placeholder="* Rua (obrigatório)"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required
                  className={`w-full rounded-xl border px-4 py-2 text-base text-gray-700 ${
                    !street
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300 bg-gray-50"
                  } focus:border-red-400 focus:ring focus:ring-red-200`}
                />
                <input
                  type="text"
                  placeholder="* Número (obrigatório)"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  className={`w-full rounded-xl border px-4 py-2 text-base text-gray-700 ${
                    !number
                      ? "border-red-400 bg-red-50"
                      : "border-gray-300 bg-gray-50"
                  } focus:border-red-400 focus:ring focus:ring-red-200`}
                />
                <input
                  type="text"
                  placeholder="Complemento (opcional)"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-base text-gray-700"
                />
                <div
                  className={`flex items-center rounded-xl border px-3 py-2 text-base ${
                    isPhoneValid
                      ? "border-gray-300 bg-gray-50"
                      : "border-red-400 bg-red-50"
                  } focus-within:border-red-400 focus-within:ring focus-within:ring-red-200`}
                >
                  <span className="pr-2 text-sm font-semibold text-gray-600">
                    +55
                  </span>
                  <input
                    type="tel"
                    placeholder="* WhatsApp (ex: 9991234567)"
                    value={phoneDigits}
                    onChange={handlePhoneChange}
                    className="w-full border-none bg-transparent text-base text-gray-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-4 space-y-1 text-left text-sm text-gray-800">
                  <p>
                    🧁 Produtos: <strong>{toBRL(subtotal)}</strong>
                  </p>
                  <p>
                    🚚 Entrega aproximada:{" "}
                    <strong>{toBRL(effectiveDeliveryFee)}</strong>
                  </p>
                  <p className="text-base font-bold text-green-700">
                    💰 Total com entrega:{" "}
                    {toBRL(subtotal + effectiveDeliveryFee)}
                  </p>
                </div>
                <div className="mb-4 rounded-2xl border border-gray-200 bg-white/80 p-3 text-sm text-gray-700">
                  <p className="mb-2 text-xs font-semibold text-gray-500">
                    Forma de pagamento
                  </p>
                  <label className={`mb-2 flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition ${
                    paymentMethod === "mercado_pago"
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}>
                    <input
                      type="radio"
                      name="payment-method"
                      value="mercado_pago"
                      checked={paymentMethod === "mercado_pago"}
                      onChange={() => setPaymentMethod("mercado_pago")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        💳 Pagar agora no site
                      </p>
                      <p className="text-xs text-gray-500">
                        Cartão, PIX e boleto via Mercado Pago.
                      </p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition ${
                    paymentMethod === "cash"
                      ? "border-amber-500 bg-amber-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}>
                    <input
                      type="radio"
                      name="payment-method"
                      value="cash"
                      checked={paymentMethod === "cash"}
                      onChange={() => setPaymentMethod("cash")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        💵 Pagar em dinheiro
                      </p>
                      <p className="text-xs text-amber-700">
                        Pagamento confirmado quando o motoboy retornar à loja.
                      </p>
                    </div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => dispatch({ type: "RESET" })}
                    className="rounded bg-gray-100 px-4 py-1 text-gray-700 hover:bg-gray-300"
                  >
                    Continuar Comprando
                  </button>

                  <button
                    onClick={async () => {
                      if (paymentMethod === "cash") {
                        await handleCashOrder();
                        return;
                      }
                      await handleMercadoPagoPayment();
                    }}
                    disabled={paymentBusy || effectiveDeliveryFee === 0}
                    className={`rounded px-10 py-1 font-semibold transition ${
                      paymentBusy
                        ? "cursor-wait bg-indigo-400 text-white"
                        : effectiveDeliveryFee === 0
                          ? "cursor-not-allowed bg-gray-300 text-gray-500"
                          : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
                    }`}
                  >
                    {paymentBusy
                      ? paymentMethod === "cash"
                        ? "Enviando pedido..."
                        : "Iniciando pagamento..."
                      : paymentMethod === "cash"
                        ? "Confirmar em Dinheiro"
                        : "Ir para Pagamento"}
                  </button>
                </div>
              </div>

              {/* Itens do carrinho */}
              <div className="mt-6 max-h-64 space-y-3 overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center gap-3 rounded-lg bg-white/80 p-2 shadow-sm"
                  >
                    <img
                      src={item.product.imageUrl}
                      alt={item.product.name}
                      className="h-12 w-12 flex-shrink-0 rounded-md border object-contain"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {item.product.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {toBRL(item.product.price)} x {item.quantity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          aria-label="Diminuir quantidade"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="text-red-500"
                        >
                          ➖
                        </button>
                        <span className="text-sm">{item.quantity}</span>
                        <button
                          aria-label="Aumentar quantidade"
                          onClick={() => updateQuantity(item.product.id, +1)}
                          className="text-green-600"
                        >
                          ➕
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="ml-2 text-xs text-red-600 hover:underline"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* fim do conteúdo rolável */}
          </div>
          {/* fim do wrapper não rolável */}
        </div>
      )}
      {/* fim do checkout */}

      {/* Overlay “Preparando pagamento...” (Mercado Pago) */}
      {paymentOverlay && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-400/30" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
            <div className="w-64 overflow-hidden rounded-full bg-white/80 shadow">
              <div
                className="h-2 rounded-full bg-indigo-500 transition-all"
                style={{ width: `${paymentOverlayProgress}%` }}
              />
            </div>
            <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-gray-700 shadow">
              Preparando o pagamento…
            </div>
            <p className="text-xs text-gray-500">
              Se a nova aba não abrir, verifique o bloqueio de pop-ups do seu
              navegador.
            </p>
          </div>
        </div>
      )}

      {authModalOpen && (
        <div className="fixed inset-0 z-[215] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-indigo-600">
                {authMode === "register" ? "Crie sua conta" : "Entrar"}
              </h2>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="text-2xl text-gray-400 transition hover:text-red-500"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 flex rounded-full bg-gray-100 p-1">
              <button
                onClick={() => setAuthMode("login")}
                className={`flex-1 rounded-full px-3 py-1 text-sm font-semibold transition ${
                  authMode === "login"
                    ? "bg-white text-indigo-600 shadow"
                    : "text-gray-500"
                }`}
              >
                Já tenho conta
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`flex-1 rounded-full px-3 py-1 text-sm font-semibold transition ${
                  authMode === "register"
                    ? "bg-white text-indigo-600 shadow"
                    : "text-gray-500"
                }`}
              >
                Criar conta
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === "register" && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">
                      Nome completo
                    </label>
                      <input
                        type="text"
                        required
                        value={authForm.fullName}
                        onChange={(e) =>
                          setAuthForm((prev) => ({
                            ...prev,
                            fullName: e.target.value,
                          }))
                        }
                        className="profile-input mt-1 w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">
                        Apelido
                    </label>
                    <input
                        type="text"
                        required
                        value={authForm.nickname}
                        onChange={(e) =>
                          setAuthForm((prev) => ({
                            ...prev,
                            nickname: e.target.value,
                          }))
                        }
                        className="profile-input mt-1 w-full"
                      />
                    </div>
                  </>
                )}

              <div>
                <label className="text-xs font-semibold text-gray-600">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="profile-input mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authForm.password}
                  onChange={(e) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  className="profile-input mt-1 w-full"
                />
              </div>
              {authMode === "register" && (
                <div>
                  <label className="text-xs font-semibold text-gray-600">
                    Repetir senha
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={authForm.confirmPassword}
                    onChange={(e) =>
                      setAuthForm((prev) => ({
                        ...prev,
                        confirmPassword: e.target.value,
                      }))
                    }
                    className="profile-input mt-1 w-full"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 w-full rounded-2xl bg-indigo-600 py-2 text-white font-semibold shadow transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {authLoading
                  ? "Enviando..."
                  : authMode === "register"
                    ? "Criar conta"
                    : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      )}

      {homePanelOpen && (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[95%] max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Minha Área
                </p>
                <h3 className="text-xl font-bold text-indigo-700">
                  {storeCustomer
                    ? storeCustomer.nickname || storeCustomer.fullName
                    : "Visitante"}
                </h3>
              </div>
              <button
                onClick={() => setHomePanelOpen(false)}
                className="text-2xl text-gray-300 transition hover:text-red-500"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 flex rounded-full bg-gray-100 p-1">
              <button
                onClick={() => setHomeActiveTab("orders")}
                className={`flex-1 rounded-full px-3 py-1 text-sm font-semibold transition ${
                  homeActiveTab === "orders"
                    ? "bg-white text-indigo-600 shadow"
                    : "text-gray-500"
                }`}
              >
                Pedidos
              </button>
              <button
                onClick={() => setHomeActiveTab("profile")}
                className={`flex-1 rounded-full px-3 py-1 text-sm font-semibold transition ${
                  homeActiveTab === "profile"
                    ? "bg-white text-indigo-600 shadow"
                    : "text-gray-500"
                }`}
              >
                Perfil
              </button>
            </div>

            {homeActiveTab === "orders" && (
              <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
                    {storeCustomer ? (
                  <>
                    {orderLookupResult && (
                      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-lg">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-xs font-semibold text-gray-500">
                              Pedido #{orderLookupResult.id}
                            </p>
                            {orderLookupResult.createdAt ? (
                              <p className="text-xs text-gray-400">
                                {new Date(orderLookupResult.createdAt).toLocaleString("pt-BR", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </p>
                            ) : null}
                          </div>
                          <StatusChip status={orderLookupResult.status} />
                        </div>
                        <p className="mt-3 text-2xl font-bold text-gray-900">
                          {toBRL(orderLookupResult.total)}
                        </p>
                        <div className="mt-4">
                          <StatusSteps status={orderLookupResult.status} />
                        </div>
                        <div className="mt-4 rounded-2xl bg-gray-50 p-3 text-xs text-gray-700">
                          <p className="font-semibold">
                            Pagamento:{" "}
                            {describePaymentMethod(orderLookupResult.paymentMethod)}
                          </p>
                          {isCashPayment(orderLookupResult.paymentMethod) && (
                            <p className="mt-1 text-[11px] font-semibold text-amber-700">
                              Dinheiro na entrega · confirmamos quando o motoboy retornar.
                            </p>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-600">
                          <span>
                            Loja: {orderLookupResult.store?.toUpperCase()}
                          </span>
                          {orderLookupResult.phoneNumber ? (
                            <span>WhatsApp: {orderLookupResult.phoneNumber}</span>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-sm">
                          <button
                            onClick={copyOrderNumber}
                            className="rounded-full border border-indigo-100 px-4 py-1 font-semibold text-indigo-600 hover:bg-indigo-50"
                          >
                            Copiar número
                          </button>
                          {canConfirmSelectedDelivery && orderLookupResult && (
                            <button
                              onClick={() =>
                                requestConfirmDelivery({
                                  id: orderLookupResult.id,
                                  total: orderLookupResult.total,
                                  store: orderLookupResult.store,
                                  paymentMethod: orderLookupResult.paymentMethod,
                                  deliveryType: orderLookupResult.deliveryType,
                                  status: orderLookupResult.status,
                                })
                              }
                              className="rounded-full border border-green-100 bg-green-50 px-4 py-1 font-semibold text-green-700 hover:bg-green-100"
                            >
                              Confirmar entrega
                            </button>
                          )}
                          <button
                            onClick={() => setOrderLookupResult(null)}
                            className="rounded-full border border-gray-100 px-4 py-1 text-gray-600 hover:bg-gray-50"
                          >
                            Fechar detalhes
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Últimos pedidos
                    </div>

                    {myOrders.length > 0 ? (
                      (showAllOrders ? myOrders : myOrders.slice(0, 1)).map((order) => {
                        const readable = order.createdAt
                          ? new Date(order.createdAt).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "Data indisponível";
                        const paid =
                          order.status === "pago" ||
                          order.status === "approved" ||
                          order.status === "paid";
                        return (
                          <div
                            key={order.id}
                            className="rounded-2xl border border-gray-100 bg-gradient-to-r from-white to-gray-50 p-4 shadow-sm"
                          >
                            <div className="flex items-center justify-between text-sm font-semibold text-gray-700">
                              <span>Pedido #{order.id}</span>
                              <span
                                className={`text-xs ${
                                  paid ? "text-green-600" : "text-orange-500"
                                }`}
                              >
                                {paid ? "Pago" : order.status}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{readable}</p>
                            <p className="mt-2 text-lg font-bold text-gray-900">
                              {toBRL(order.total)}
                            </p>
                            <div className="mt-3 flex justify-between text-xs text-gray-500">
                              <span>{order.store?.toUpperCase()}</span>
                              <span>
                                {order.deliveryType === "entregar"
                                  ? "Entrega"
                                  : "Retirada"}
                              </span>
                            </div>
                            <p
                              className={`mt-2 text-xs ${
                                isCashPayment(order.paymentMethod)
                                  ? "text-amber-700"
                                  : "text-gray-500"
                              }`}
                            >
                              Pagamento: {describePaymentMethod(order.paymentMethod)}
                              {isCashPayment(order.paymentMethod)
                                ? " "
                                : ""}
                            </p>
                            {canCustomerConfirmDelivery(order) && (
                              <button
                                onClick={() => requestConfirmDelivery(order)}
                                className="mt-3 w-full rounded-xl border border-green-100 bg-green-50 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100"
                              >
                                Confirmar entrega
                              </button>
                            )}
                            <button
                              onClick={() => handleOrderCardClick(order)}
                              className="mt-3 w-full rounded-xl bg-indigo-50 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
                            >
                              Ver detalhes
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                          Ainda não encontramos pedidos vinculados a esta conta.
                        </div>
                      </>
                    )}

                    {myOrders.length > 1 && (
                      <button
                        onClick={() => setShowAllOrders((prev) => !prev)}
                        className="w-full rounded-full border border-indigo-100 bg-white py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
                      >
                        {showAllOrders ? "Ocultar anteriores" : "Ver anteriores"}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                    Faça login para ver seus pedidos.
                    <button
                      className="mt-2 text-indigo-600 underline"
                      onClick={() => {
                        setHomePanelOpen(false);
                        setAuthMode("login");
                        setAuthModalOpen(true);
                      }}
                    >
                      Entrar agora
                    </button>
                  </div>
                )}
              </div>
            )}

            {homeActiveTab === "profile" && (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                {profileDraft ? (
                  <>
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-indigo-100">
                        {profileDraft.profileImageBase64 ? (
                          <img
                            src={profileDraft.profileImageBase64}
                            alt="Avatar"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-indigo-50 text-xl">
                            👤
                          </div>
                        )}
                      </div>
                      <label className="cursor-pointer rounded-xl bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600 hover:bg-indigo-100">
                        Trocar foto
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) =>
                            handleAvatarChange(
                              e.target.files && e.target.files[0]
                                ? e.target.files[0]
                                : null,
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="grid gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          Nome completo
                        </label>
                        <input
                          type="text"
                          value={profileDraft.fullName}
                          onChange={(e) => {
                            const value = e.target.value;
                            setCustomerName(value);
                            setProfileDraft((prev) =>
                              prev ? { ...prev, fullName: value } : prev,
                            );
                          }}
                          className="profile-input mt-1 w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          Apelido
                        </label>
                        <input
                          type="text"
                          value={profileDraft.nickname}
                          onChange={(e) =>
                            setProfileDraft((prev) =>
                              prev
                                ? { ...prev, nickname: e.target.value }
                                : prev,
                            )
                          }
                          className="profile-input mt-1 w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          WhatsApp (com DDD)
                        </label>
                        <input
                          type="tel"
                          value={profileDraft.phoneNumber ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPhoneNumber(value);
                            setProfileDraft((prev) =>
                              prev ? { ...prev, phoneNumber: value } : prev,
                            );
                          }}
                          className="profile-input mt-1 w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          Bairro
                        </label>
                        <select
                          value={profileNeighborhoodOption}
                          onChange={(e) => {
                            const selected = e.target.value;
                            if (selected === "") {
                              setProfileDraft((prev) =>
                                prev ? { ...prev, neighborhood: "" } : prev,
                              );
                              setAddress("");
                              setCustomAddress("");
                              return;
                            }
                            if (selected === "Outro") {
                              const currentValue =
                                profileDraft?.neighborhood ?? "";
                              const isKnown =
                                !!findNeighborhoodMatch(currentValue);
                              const fallback = isKnown ? "" : currentValue;
                              setProfileDraft((prev) =>
                                prev
                                  ? { ...prev, neighborhood: fallback }
                                  : prev,
                              );
                              setAddress("Outro");
                              setCustomAddress(fallback);
                              return;
                            }
                            setProfileDraft((prev) =>
                              prev ? { ...prev, neighborhood: selected } : prev,
                            );
                            setAddress(selected);
                            setCustomAddress("");
                          }}
                          className="profile-input mt-1 w-full text-sm"
                        >
                          <option value="">Escolha seu bairro</option>
                          {NEIGHBORHOODS.map((bairro) => (
                            <option key={bairro} value={bairro}>
                              {bairro === "Outro" ? "Outro..." : bairro}
                            </option>
                          ))}
                        </select>
                        {profileNeighborhoodOption === "Outro" && (
                          <input
                            type="text"
                            placeholder="Digite seu bairro"
                            value={profileDraft.neighborhood ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setProfileDraft((prev) =>
                                prev ? { ...prev, neighborhood: value } : prev,
                              );
                              setAddress("Outro");
                              setCustomAddress(value);
                            }}
                            className="profile-input mt-2 w-full text-sm"
                          />
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500">
                          Rua
                        </label>
                        <input
                          type="text"
                          value={profileDraft.street ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setStreet(value);
                            setProfileDraft((prev) =>
                              prev ? { ...prev, street: value } : prev,
                            );
                          }}
                          className="profile-input mt-1 w-full text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-gray-500">
                            Número
                          </label>
                          <input
                            type="text"
                            value={profileDraft.number ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setNumber(value);
                              setProfileDraft((prev) =>
                                prev ? { ...prev, number: value } : prev,
                              );
                            }}
                            className="profile-input mt-1 w-full text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-500">
                            Complemento
                          </label>
                          <input
                            type="text"
                            value={profileDraft.complement ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setComplement(value);
                              setProfileDraft((prev) =>
                                prev ? { ...prev, complement: value } : prev,
                              );
                            }}
                            className="profile-input mt-1 w-full text-sm"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        onClick={handleProfileSave}
                        className="rounded-2xl bg-indigo-600 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                      >
                        Salvar perfil
                      </button>
                      <button
                        onClick={handleLogout}
                        className="rounded-2xl border border-red-100 py-2 text-sm font-semibold text-red-500 hover:bg-red-50"
                      >
                        Sair da conta
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                    Faça login para editar seu perfil.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showMpInstructionModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">
              Antes de continuar com o pagamento
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Ao clicar em &quot;Continuar com Mercado Pago&quot;, abriremos o
              Checkout do Mercado Pago. Depois de copiar o Pix e pagar no seu
              banco,{" "}
              <strong>volte para a loja nesta mesma aba</strong>. Assim que o
              pagamento for confirmado, mostraremos o pedido automaticamente.
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>Copie o Pix ou escaneie o QR Code e finalize no seu banco.</li>
              <li>
                Caso o Mercado Pago não volte sozinho, use o botão
                &quot;Voltar para Eskimo&quot; ou volte manualmente.
              </li>
              <li>
                Ao retornar, você verá um aviso &quot;Confirmando pagamento&quot;
                até liberarmos o pedido.
              </li>
            </ul>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={dismissMpInstructions}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmMpInstructionsAndPay}
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
              >
                Entendi, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeliveryConfirmation && (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">
              Confirmar entrega?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Confirme apenas se você já recebeu o pedido da loja.
            </p>
            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <p className="font-semibold">
                Pedido #{pendingDeliveryConfirmation.id}
              </p>
              {pendingDeliveryConfirmation.total !== undefined && (
                <p>{toBRL(pendingDeliveryConfirmation.total)}</p>
              )}
              {pendingDeliveryConfirmation.store && (
                <p className="text-xs text-gray-500">
                  Loja: {pendingDeliveryConfirmation.store.toUpperCase()}
                </p>
              )}
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={cancelConfirmDelivery}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Ainda não recebi
              </button>
              <button
                onClick={performConfirmDelivery}
                className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-green-700"
              >
                Sim, já recebi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pedido Confirmado */}
      {showConfirmation && orderId !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <span className="mb-6 block text-5xl text-green-600">✔️</span>
            <h2 className="mb-4 text-2xl font-bold text-green-700">
              Pedido Confirmado!
            </h2>
            <p className="mb-2 text-base font-semibold text-gray-800">
              Número do pedido:
            </p>
            <div className="mb-3 flex items-center justify-center gap-2">
              <div className="rounded-lg border border-dashed border-green-500 bg-green-50 px-4 py-2 text-lg font-bold text-green-700 shadow-sm">
                #{orderId}
              </div>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(orderId.toString())
                }
                className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
              >
                Copiar
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Você poderá acompanhar o status do seu pedido clicando em{" "}
              <strong>“Meu Pedido”</strong>.
            </p>
            {isCashPayment(lastOrderPaymentMethod) ? (
              <p className="mb-6 mt-2 text-sm font-semibold text-amber-700">
                Pagamento em dinheiro: entregue o valor ao motoboy. O pagamento será
                confirmado no painel assim que ele retornar à loja.
              </p>
            ) : (
              <p className="mb-6 mt-2 text-sm text-gray-600">
                Um atendente será avisado assim que o pagamento online for confirmado.
              </p>
            )}
            <button
              onClick={() => {
                // ✅ ACK e limpar last_order_id
                if (orderId) setOrderAck(orderId);
                try {
                  localStorage.removeItem("last_order_id");
                } catch {
                  /* empty */
                }

                setShowConfirmation(false);
                setOrderId(null);
                setCart([]);
                dispatch({ type: "RESET" });
                setCustomerName("");
                setStreet("");
                setNumber("");
                setComplement("");
                setPhoneNumber("");
                setAddress("");
                setCustomAddress("");

                // agora sim limpar a querystring
                try {
                  window.history.replaceState({}, "", window.location.pathname);
                } catch {
                  /* empty */
                }
                setComponentKey((p) => p + 1);
                if (selectedStore)
                  axios
                    .get<Product[]>(
                      `${API_URL}/products/list?store=${selectedStore}&page=1&pageSize=200`,
                    )
                    .then((res) => {
                      if (Array.isArray(res.data)) setProducts(res.data);
                    })
                    .catch(() => {});
              }}
              className="rounded-full bg-green-600 px-6 py-2 text-white hover:bg-green-700"
            >
              Voltar para Loja
            </button>
          </div>
        </div>
      )}

      {/* Modal do produto */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className={`relative w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl transition-all duration-300 ${
              addButtonPulseActive
                ? "ring-2 ring-green-200 shadow-[0_0_35px_rgba(34,197,94,0.45)] scale-[1.01]"
                : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute right-3 top-3 text-xl text-red-600"
              aria-label="Fechar"
            >
              ✕
            </button>
            <img
              loading="lazy"
              src={selectedProduct.imageUrl}
              alt={selectedProduct.name}
              ref={modalImageRef}
              className="mb-3 h-60 w-full rounded-lg object-contain"
            />
            <h3 className="mb-1 text-lg font-semibold text-gray-800">
              {selectedProduct.name}
            </h3>
            <div
              className="relative mb-3 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-2 shadow-inner"
              style={{ scrollbarWidth: "thin" }}
            >
              <p
                className="whitespace-pre-line text-sm leading-relaxed text-gray-700"
                style={{
                  whiteSpace: "pre-line",
                  fontSize: "0.9rem",
                  lineHeight: "1.4",
                }}
              >
                {formatDescription(selectedProduct.description)}
              </p>

              {/* Indicador sutil no topo, não sobre o texto */}
              <div className="pointer-events-none absolute left-0 right-0 top-0 h-4 bg-gradient-to-b from-gray-50/90 to-transparent" />
            </div>
            <div className="mb-2 text-base font-bold text-green-700">
              {toBRL(selectedProduct.price)}
            </div>

            {/* Quantidade + Adicionar */}
            <div
              className={`mb-2 flex items-center justify-between rounded-xl px-2 py-2 transition-all ${
                addButtonPulseActive ? "bg-green-50 shadow-inner" : "bg-transparent"
              } ${addButtonPulseActive ? "animate-[pulse-bar_0.45s_ease-out]" : ""}`}
              style={{
                boxShadow:
                  addButtonPulseActive
                    ? "0 0 0.8rem rgba(34,197,94,0.35)"
                    : "none",
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantityToAdd((q) => Math.max(1, q - 1))}
                  className="rounded bg-gray-200 px-3 py-1 text-gray-700"
                >
                  −
                </button>
                <span className="min-w-[2ch] text-center">{quantityToAdd}</span>
                <button
                  onClick={() =>
                    setQuantityToAdd((q) =>
                      Math.min(q + 1, remainingForSelected || 1),
                    )
                  }
                  className="rounded bg-gray-200 px-3 py-1 text-gray-700"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => {
                  if (!selectedProduct) return;
                  const originRect =
                    modalImageRef.current?.getBoundingClientRect() ?? undefined;
                  const productToAdd = selectedProduct;
                  const qty = quantityToAdd || 1;
                  triggerAddButtonPulse();
                  triggerStockFlash();
                  addToCart(productToAdd, qty, {
                    imageUrl: productToAdd.imageUrl,
                    originRect,
                    productId: productToAdd.id,
                    onBeforeAnimate: () => {
                      setSelectedProduct(null);
                      setQuantityToAdd(1);
                    },
                  });
                }}
                disabled={remainingForSelected <= 0}
                className={`relative overflow-hidden rounded px-4 py-1 font-semibold transition-transform ${
                  remainingForSelected <= 0
                    ? "cursor-not-allowed bg-gray-300 text-gray-500"
                    : `bg-green-600 text-white hover:bg-green-700 ${
                        addButtonPulseActive ? "scale-105 shadow-lg" : "scale-100"
                      }`
                }`}
              >
                {addButtonPulseActive && (
                  <span className="pointer-events-none absolute inset-0 animate-ping rounded bg-white/30" />
                )}
                <span className="relative">Adicionar</span>
              </button>
            </div>
            <div
              className={`text-xs font-semibold transition-all ${
                stockFlash
                  ? "text-green-700 scale-105"
                  : "text-gray-500 scale-100"
              }`}
            >
              Em estoque:{" "}
              <span
                className={`inline-block min-w-[1.5rem] text-center transition-all ${
                  stockFlash ? "animate-pulse text-green-600" : ""
                }`}
              >
                {remainingForSelected}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toast simples */}
      {toast && (
        <div
          className="fixed left-1/2 top-4 z-[9999] -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-md"
          style={{
            background:
              toast.type === "success"
                ? "rgba(34,197,94,0.95)"
                : toast.type === "warning"
                  ? "rgba(234,179,8,0.95)"
                  : toast.type === "error"
                    ? "rgba(239,68,68,0.95)"
                    : "rgba(2,132,199,0.95)",
            color: "#fff",
          }}
        >
          {toast.message}
        </div>
      )}
      <PromoFlutuante promos={promos} addToCart={addToCart} openProduct={openProductDetails} />
      <AnimatePresence>
        {flyAnimations.map((anim) => {
          const deltaX = anim.end.x - anim.start.x;
          const deltaY = anim.end.y - anim.start.y;
          const arcHeight = Math.max(80, Math.abs(deltaY) * 0.6);
          const midX = deltaX * 0.6;
          const midY = deltaY - arcHeight;
          return (
            <motion.img
              key={anim.id}
              src={anim.imageUrl}
              initial={{ x: -32, y: -32, opacity: 1, scale: 1, rotate: 0 }}
              animate={{
                x: [-32, midX - 32, deltaX - 32],
                y: [-32, midY - 32, deltaY - 32],
                opacity: [1, 0.85, 0],
                scale: [1, 0.92, 0.55],
                rotate: [0, 10, 0],
              }}
              transition={{ duration: 0.75, ease: "easeInOut" }}
              exit={{ opacity: 0 }}
              onAnimationComplete={() =>
                setFlyAnimations((prev) =>
                  prev.filter((item) => item.id !== anim.id),
                )
              }
              className="pointer-events-none fixed z-[999] h-16 w-16 rounded-full border-2 border-white object-cover shadow-2xl"
              style={{ left: anim.start.x, top: anim.start.y }}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
  const StatusChip = ({ status }: { status: string }) => {
    const normalized = (status || "").toLowerCase();
    const paid =
      normalized === "pago" ||
      normalized === "approved" ||
      normalized === "paid";
    const fail =
      normalized === "rejected" ||
      normalized === "failure" ||
      normalized === "cancelado";
    const chipClass = paid
      ? "bg-green-100 text-green-700"
      : fail
        ? "bg-red-100 text-red-600"
        : "bg-amber-100 text-amber-700";
    const label = paid ? "Pago" : fail ? "Não aprovado" : "Em análise";
    return (
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${chipClass}`}>
        {label}
      </span>
    );
  };
