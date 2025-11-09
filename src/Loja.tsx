// Loja.tsx — versão revisada (monolítica) 100% focada em Mercado Pago
// - Remove 100% do antigo PIX local/QRCode (componentes, helpers, modais, confirmações locais)
// - Mantém e aprimora o fluxo Mercado Pago (Wallet Brick) com overlay de preparação e polling
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
import { Link } from "react-router-dom";
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

interface PaymentConfig {
  provider?: string;
  isActive?: boolean;
  mpPublicKey?: string; // camelCase
  MpPublicKey?: string; // PascalCase (compat backend)
}

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
): string {
  const payload = {
    store: selectedStore ?? "",
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

// ——— Tipos auxiliares (Mercado Pago Wallet + guards) ———
type Json = Record<string, unknown>;

type WalletController = { unmount?: () => void };
type WalletOptions = {
  initialization: { preferenceId: string };
  customization?: { texts?: { valueProp?: string } };
  callbacks?: {
    onReady?: () => void;
    onError?: (error: unknown) => void;
  };
};
type Bricks = {
  create: (
    name: "wallet",
    containerId: string,
    options: WalletOptions,
  ) => Promise<WalletController>;
};
interface MercadoPagoCtor {
  new (publicKey: string, opts?: { locale?: string }): { bricks: () => Bricks };
}
declare global {
  interface Window {
    MercadoPago?: MercadoPagoCtor;
  }
}

// Type guards p/ respostas JSON
function isOrderResponse(x: unknown): x is { id: number } {
  return (
    typeof x === "object" &&
    x !== null &&
    "id" in x &&
    typeof (x as Json).id === "number"
  );
}
function isCheckoutResponse(x: unknown): x is { preferenceId: string } {
  return (
    typeof x === "object" &&
    x !== null &&
    "preferenceId" in x &&
    typeof (x as Json).preferenceId === "string"
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
  const [walletOpen, setWalletOpen] = useState(false);
  const walletCtrlRef = useRef<WalletController | null>(null);
  const pollRef = useRef<number | null>(null);
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

  const { storedCart, setStoredCart } = useLocalStorageCart();
  const [cart, setCart] = useState<CartItem[]>(storedCart);
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
      return fetch(input, { ...init, headers });
    },
    [selectedStore],
  );

  const updateSelectedStore = useCallback((store: string | null) => {
    autoRedirectInProgressRef.current = false;
    noOpenStoreToastRef.current = false;
    setSelectedStore(store);
  }, []);

  // Toast simples local
  const [toast, setToast] = useState<{
    type: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [promos, setPromos] = useState<PromotionDTO[]>([]);
  const toastTimerRef = useRef<number | null>(null);
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
    };
  }, []);

  const [showConfirmation, setShowConfirmation] = useState(false);

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

  // Config de pagamento por loja (Mercado Pago)
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(
    null,
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

      try {
        type OrderDTO = {
          paymentStatus: string | undefined;
          status?: string;
          Status?: string;
        };
        const res = await axios.get<OrderDTO>(`${API_URL}/orders/${orderId}`);
        const d = res.data ?? {};
        const status = String(
          d.status ?? d.Status ?? d.paymentStatus ?? "",
        ).toLowerCase();

        if (status === "pago" || status === "approved" || status === "paid") {
          setOrderId(orderId);
          setShowConfirmation(true);
          setCart([]);
          setOrderAck(orderId);
          clearLastSig();
          try {
            localStorage.setItem("last_order_id", String(orderId));
          } catch {
            /* empty */
          }
        }
      } catch {
        // silencioso: se não achou o pedido, não abre
      }
    }

    if (paid && Number.isFinite(id)) {
      // Mesmo com paid=1, só mostra se backend confirmar como pago
      resolveAndShow(id);
      return;
    }

    // Fallback: tentar o último pedido salvo
    try {
      const last = localStorage.getItem("last_order_id");
      const lastId = last ? parseInt(last, 10) : NaN;
      if (Number.isFinite(lastId)) resolveAndShow(lastId);
    } catch {
      /* empty */
    }
  }, []);

  // Polling universal: com orderId definido e sem confirmação aberta,
  // verifica status a cada 5s até 10 minutos. Ao "pago", abre confirmação.
  useEffect(() => {
    if (!orderId || showConfirmation) return;

    let tries = 0;
    const maxTries = Math.ceil((10 * 60) / 5); // 10 minutos
    const iv = window.setInterval(async () => {
      tries++;
      try {
        type OrderDTO = { status?: string; Status?: string };
        const res = await axios.get<OrderDTO>(`${API_URL}/orders/${orderId}`);
        const d = res.data ?? {};
        const status = String(d.status ?? d.Status ?? "").toLowerCase();
        if (status === "pago") {
          setShowConfirmation(true);
          setCart([]);
          if (orderId) setOrderAck(orderId);
          clearLastSig();
          try {
            localStorage.setItem("last_order_id", String(orderId));
          } catch {
            /* empty */
          }
          window.clearInterval(iv);
        }
      } catch {
        /* ignore */
      }
      if (tries >= maxTries) window.clearInterval(iv);
    }, 5000);

    return () => window.clearInterval(iv);
  }, [orderId, showConfirmation]);

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

  // buscar config de pagamento da loja
  useEffect(() => {
    const storeName = (selectedStore ?? "").trim();
    if (!storeName) {
      setPaymentConfig(null);
      return;
    }
    fetchWithStore(`${API_URL}/paymentconfigs/${encodeURIComponent(storeName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PaymentConfig | null) => {
        setPaymentConfig(data);
      })
      .catch((e) => {
        console.warn("paymentconfigs fetch error", e);
        setPaymentConfig(null);
      });
  }, [fetchWithStore, selectedStore]);

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

  // Handlers de carrinho
  const addToCart = useCallback(
    (
      product: Product,
      quantity: number = 1,
      animation?: AddToCartOptions,
    ): void => {
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
    [isClosed, showToast, status?.message, triggerCartAnimation],
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

  // SDK do Mercado Pago
  const loadMPSDK = useCallback(async (): Promise<MercadoPagoCtor> => {
    if (window.MercadoPago) return window.MercadoPago;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://sdk.mercadopago.com/js/v2";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () =>
        reject(new Error("Falha ao carregar SDK do Mercado Pago"));
      document.head.appendChild(s);
    });
    if (!window.MercadoPago) {
      throw new Error(
        "SDK do Mercado Pago não disponível após carregar script.",
      );
    }
    return window.MercadoPago;
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const checkPaidOnce = useCallback(async (id: number): Promise<boolean> => {
    try {
      const r = await fetchWithStore(`${API_URL}/orders/${id}`);
      if (!r.ok) return false;
      const o = await r.json();
      const raw = String(
        (o?.status ?? o?.Status ?? o?.paymentStatus ?? "") as string,
      ).toLowerCase();
      return raw === "pago" || raw === "approved" || raw === "paid";
    } catch {
      return false;
    }
  }, [fetchWithStore]);

  // Abre o Wallet Brick
  const openWalletBrick = useCallback(
    async (preferenceId: string, currentOrderId: number) => {
      try {
        const MP = await loadMPSDK();

        const publicKey =
          paymentConfig?.mpPublicKey ?? paymentConfig?.MpPublicKey;
        if (!publicKey) {
          showToast(
            "Public Key do Mercado Pago não configurada para esta loja.",
            "error",
          );
          return;
        }

        const mp = new MP(publicKey, { locale: "pt-BR" });
        const bricks = mp.bricks();

        setWalletOpen(true);

        const ctrl = await bricks.create("wallet", "mp-wallet-container", {
          initialization: {
            preferenceId,
            // Keep checkout inside the Loja so PIX never leaves the site.
            redirectMode: "modal",
          } as unknown as { preferenceId: string },
          customization: { texts: { valueProp: "security_details" } },
          callbacks: {
            onReady: () => {
              setPaymentOverlay(false);
            },
            onError: (err: unknown) => {
              console.error("Wallet error:", err);
              showToast("Erro no pagamento (Mercado Pago).", "error");
              setWalletOpen(false);
            },
          },
        });

        walletCtrlRef.current = ctrl;

        // Polling do pedido até ficar pago
        let tries = 0;
        stopPolling();
        pollRef.current = window.setInterval(async () => {
          tries++;
          const paid = await checkPaidOnce(currentOrderId);
          if (paid) {
            stopPolling();
            try {
              walletCtrlRef.current?.unmount?.();
            } catch {
              /* empty */
            }
            setWalletOpen(false);
            setOrderId(currentOrderId);
            setCart([]);
            setOrderAck(currentOrderId);
            clearLastSig();

            // ✅ Redireciona automaticamente para a tela de pedidos confirmados
            window.location.href = `/meus-pedidos?orderId=${currentOrderId}&paid=1`;
          }

          if (tries > 180) {
            // ~12min
            stopPolling();
          }
        }, 4000);
      } catch (e) {
        console.error(e);
        showToast("Não foi possível abrir o pagamento no site.", "error");
        setWalletOpen(false);
      }
    },
    [
      loadMPSDK,
      paymentConfig,
      showToast,
      checkPaidOnce,
      stopPolling,
      setPaymentOverlay,
    ],
  );

  // Fluxo de pagamento com Mercado Pago (cria pedido → inicia cobrança no backend)
  const handleMercadoPagoPayment = useCallback(async () => {
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
      );

      if (orderId && getLastSig() && getLastSig() !== currentSig) {
        try {
          await fetchWithStore(`${API_URL}/orders/${orderId}/cancel`, {
            method: "PATCH",
          });
        } catch {
          /* não bloqueia o fluxo */
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
      }

      try {
        localStorage.setItem("last_order_id", String(currentOrderId));
      } catch {
        /* empty */
      }
      setLastSig(currentSig);

      // 2) Cria a preference e abre o Wallet (modal no mesmo tab)
      const payRes = await fetchWithStore(
        `${API_URL}/payments/mp/checkout?orderId=${currentOrderId}`,
        { method: "POST" },
      );
      if (!payRes.ok) {
        showToast("Falha ao iniciar pagamento (Mercado Pago).", "error");
        return;
      }

      let data: unknown = null;
      const text = await payRes.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        /* empty */
      }
      const prefId = isCheckoutResponse(data) ? data.preferenceId : undefined;

      if (!prefId) {
        showToast("Preferência inválida do Mercado Pago.", "error");
        return;
      }

      await openWalletBrick(prefId, currentOrderId!);
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
    openWalletBrick,
    setPaymentOverlay,
    isClosed,
    showToast,
    status?.message,
    fetchWithStore,
  ]);

  // ---- RENDER ----
  return (
    <div key={componentKey} className="loja-container">
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
        <div className="flex items-center justify-center py-2">
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
      <Link
        onClick={() => {
          /* apenas navega */
        }}
        to="/meus-pedidos"
        className="fixed bottom-48 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-blue-500 p-2 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
      >
        <div className="text-3xl">📜</div>
        <div className="mt-1 text-xs font-bold">Meu</div>
        <div className="mt-1 text-xs font-bold">Pedido</div>
      </Link>

      <button
        ref={cartButtonRef}
        onClick={() =>
          dispatch({
            type: "OPEN_CHECKOUT",
          })
        }
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
                  {[
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
                  ].map((b) => (
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

                <div className="flex items-center justify-between">
                  <button
                    onClick={() => dispatch({ type: "RESET" })}
                    className="rounded bg-gray-100 px-4 py-1 text-gray-700 hover:bg-gray-300"
                  >
                    Continuar Comprando
                  </button>

                  <button
                    onClick={async () => {
                      const ok = await validateBeforePayment();
                      // Se já existe pedido pendente mas a "assinatura" mudou, cancela o antigo
                      const currentSig = buildOrderSignature(
                        cart,
                        effectiveDeliveryFee,
                        selectedStore,
                      );

                      if (
                        orderId &&
                        getLastSig() &&
                        getLastSig() !== currentSig
                      ) {
                        try {
                        await fetchWithStore(`${API_URL}/orders/${orderId}/cancel`, {
                          method: "PATCH",
                        });
                        } catch {
                          /* não bloqueia o fluxo */
                        }
                        setOrderId(null);
                      }

                      if (!ok) return;
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
                      ? "Iniciando pagamento..."
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

      {/* Wallet Brick do Mercado Pago */}
      {walletOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[95%] max-w-md rounded-2xl bg-white p-3 shadow-2xl">
            <div id="mp-wallet-container" />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={async () => {
                  try {
                    walletCtrlRef.current?.unmount?.();
                  } catch {
                    /* empty */
                  }
                  setWalletOpen(false);
                  stopPolling();
                  if (orderId) {
                    try {
                    await fetchWithStore(`${API_URL}/orders/${orderId}/cancel`, {
                      method: "PATCH",
                    });
                    } catch {
                      /* empty */
                    }
                    clearLastSig();
                    setOrderId(null);
                  }
                }}
                className="rounded bg-gray-200 px-3 py-1 text-gray-700 hover:bg-gray-300"
              >
                Cancelar
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
            <p className="mb-6 text-sm text-gray-600">
              Você poderá acompanhar o status do seu pedido clicando em{" "}
              <strong>“Meu Pedido”</strong>.
            </p>
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
            className="relative w-full max-w-sm rounded-xl bg-white p-4"
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
            <div className="mb-2 flex items-center justify-between">
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
                className={`rounded px-4 py-1 font-semibold transition ${
                  remainingForSelected <= 0
                    ? "cursor-not-allowed bg-gray-300 text-gray-500"
                    : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                Adicionar
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Em estoque: {remainingForSelected}
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
