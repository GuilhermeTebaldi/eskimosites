
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import PixQRCode from "./components/PixQRCode";
import axios from "axios";
import LinhaProdutosAtalhos from "./LinhaProdutosAtalhos";
import { Link } from "react-router-dom";
import "./Loja.css";

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
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface PaymentConfig {
  provider?: string;
  isActive?: boolean;
  // outros campos que seu backend possa trazer
}

/************************************
 * Constantes & helpers
 ************************************/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_URL: string = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8080/api";

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
// DEBUG FLAG por querystring: ?debug=1
const __DEBUG__ = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

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

// Geolocalização como Promise
const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation)
      return reject(new Error("Geolocalização indisponível"));
    navigator.geolocation.getCurrentPosition(resolve, reject);
  });

/************************************
 * PIX helpers (fora do componente)
 ************************************/

// 👉 Preencha as chaves NUBANK/CAIXA/BB/etc de cada CNPJ aqui (provisório).
//    Na Fase 2 moveremos isso para o backend (ou usaremos o PIX do MP).
const STORE_PIX: Record<string, { CHAVE: string; NOME: string; CIDADE: string }> = {
  efapi:   { CHAVE: "CHAVE_PIX_EFAPI_AQUI",    NOME: "Razão Social Efapi LTDA",    CIDADE: "CHAPECO" },
  palmital:{ CHAVE: "CHAVE_PIX_PALMITAL_AQUI", NOME: "Razão Social Palmital LTDA", CIDADE: "CHAPECO" },
  passo:   { CHAVE: "CHAVE_PIX_PASSO_AQUI",    NOME: "Razão Social Passo LTDA",    CIDADE: "CHAPECO" },
};

// fallback caso a loja ainda não esteja configurada
const getPixConfig = (store?: string | null) => {
  const key = (store ?? "").toLowerCase();
  return STORE_PIX[key] ?? { CHAVE: "CHAVE_PIX_TESTE", NOME: "Eskimo Teste", CIDADE: "CHAPECO" };
};

const pad2 = (n: number) => n.toString().padStart(2, "0");

const crc16 = (str: string): string => {
  let crc = 0xffff;
  for (const c of str) {
    crc ^= c.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

// gera o payload Pix “Copia e Cola” com a configuração da loja
const gerarPayloadPix = (valor: number, cfg: { CHAVE: string; NOME: string; CIDADE: string }): string => {
  const chavePix = cfg.CHAVE;
  const nome = cfg.NOME;
  const cidade = cfg.CIDADE;
  const txid = "tePdSk5zg9"; // você pode gerar um TXID único por pedido depois

  const valorFormatado = valor.toFixed(2);
  const tamanhoValor = valorFormatado.length;

  const merchantAccountInfo = `0014BR.GOV.BCB.PIX01${pad2(chavePix.length)}${chavePix}`;
  const gui = `26${pad2(merchantAccountInfo.length)}${merchantAccountInfo}`;
  const additionalDataField = `62${pad2(4 + txid.length)}050${pad2(txid.length)}${txid}`;

  const payloadSemCRC =
    "000201" +
    gui +
    "52040000" +
    "5303986" +
    `54${pad2(tamanhoValor)}${valorFormatado}` +
    "5802BR" +
    `59${pad2(nome.length)}${nome}` +
    `60${pad2(cidade.length)}${cidade}` +
    additionalDataField +
    "6304";

  return payloadSemCRC + crc16(payloadSemCRC);
};

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
      /* noop */
    }
  }, [keyCart, keyStore]);

  useEffect(() => {
    try {
      localStorage.setItem(keyCart, JSON.stringify(storedCart));
    } catch {
      /* noop */
    }
  }, [keyCart, storedCart]);

  useEffect(() => {
    try {
      if (storedStore) localStorage.setItem(keyStore, storedStore);
    } catch {
      /* noop */
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

/************************************
 * Reducer do fluxo (wizard)
 ************************************/
type Stage = "idle" | "checkout" | "pix"; // confirmação é um diálogo dentro do PIX
interface UIState {
  stage: Stage;
  confirmOpen: boolean;
  placing: boolean;
}

type UIAction =
  | { type: "OPEN_CHECKOUT" }
  | { type: "OPEN_PIX" }
  | { type: "OPEN_CONFIRM" }
  | { type: "CLOSE_CONFIRM" }
  | { type: "START_PLACING" }
  | { type: "STOP_PLACING" }
  | { type: "RESET" };

const uiInitial: UIState = {
  stage: "idle",
  confirmOpen: false,
  placing: false,
};

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "OPEN_CHECKOUT":
      return { stage: "checkout", confirmOpen: false, placing: false };
    case "OPEN_PIX":
      return { stage: "pix", confirmOpen: false, placing: false };
    case "OPEN_CONFIRM":
      return { ...state, confirmOpen: true };
    case "CLOSE_CONFIRM":
      return { ...state, confirmOpen: false };
    case "START_PLACING":
      return { ...state, placing: true };
    case "STOP_PLACING":
      return { ...state, placing: false };
    case "RESET":
      return uiInitial;
    default:
      return state;
  }
}

/************************************
 * Subcomponentes internos simples
 ************************************/

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Toast({
  type,
  message,
  onClose,
}: {
  type: "info" | "success" | "warning" | "error";
  message: string;
  onClose: () => void;
}) {
  const palette: Record<string, string> = {
    success:
      "ring-emerald-200 from-emerald-50/95 to-white/90 text-emerald-900",
    warning: "ring-amber-200 from-amber-50/95 to-white/90 text-amber-900",
    error: "ring-rose-200 from-rose-50/95 to-white/90 text-rose-900",
    info: "ring-slate-200 from-slate-50/95 to-white/90 text-slate-900",
  };
  const icon =
    type === "success"
      ? "✅"
      : type === "warning"
      ? "⚠️"
      : type === "error"
      ? "❌"
      : "ℹ️";
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] w-[min(92vw,520px)] -translate-x-1/2 px-3">
      <div
        role="alert"
        aria-live="polite"
        className={[
          "pointer-events-auto select-none",
          "rounded-2xl shadow-2xl ring-1 backdrop-blur",
          "bg-gradient-to-br",
          palette[type],
          "px-4 py-3",
          "animate-[fade-in_0.18s_ease-out]",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-base shadow">
            {icon}
          </span>
          <div className="flex-1 text-sm font-medium leading-snug">
            {message}
          </div>
          <button
            aria-label="Fechar aviso"
            onClick={onClose}
            className="-mr-1 ml-2 rounded-lg px-2 text-xs opacity-70 outline-none transition hover:opacity-100 focus-visible:ring"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-black/5">
          <div className="h-full w-1/2 rounded-full bg-black/10" />
        </div>
      </div>
    </div>
  );
}

/************************************
 * Componente principal
 ************************************/
export default function Loja() {
  // refs para acessibilidade
  const checkoutFirstInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // reducer do fluxo
  const [ui, dispatch] = useReducer(uiReducer, uiInitial);
  const [placingProgress, setPlacingProgress] = useState(0);

  // estado geral
  const [orderId, setOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showInstruction, setShowInstruction] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { storedCart, setStoredCart, storedStore, setStoredStore } =
    useLocalStorageCart();
  const [cart, setCart] = useState<CartItem[]>(storedCart);
  const [selectedStore, setSelectedStore] = useState<string | null>(
    storedStore,
  );

  const [toast, setToast] = useState<{
    type: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

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
  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const [showError, setShowError] = useState(false);
  const [errorText, setErrorText] = useState<string>(
    "Ocorreu um erro ao enviar seu pedido. Tente novamente.",
  );
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

  const [customerName, setCustomerName] = useState("");
  const [deliveryType, setDeliveryType] = useState("retirar");
  const [address, setAddress] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );
  const [quantityToAdd, setQuantityToAdd] = useState(1);

  const [deliveryRate, setDeliveryRate] = useState<number>(0);

  // 🔹 NOVO: configuração de pagamento por loja (Mercado Pago, etc.)
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(
    null,
  );

  // 🔹 NOVO: para exibir QR Code base64 retornado pelo backend (PIX do MP)
  const [mpPixQr, setMpPixQr] = useState<string | null>(null);

  // lojas (constante)
  const storeLocations = useMemo(
    () => [
      { name: "efapi", lat: -27.112815, lng: -52.670769 },
      { name: "palmital", lat: -27.1152884, lng: -52.6166752 },
      { name: "passo", lat: -27.077056, lng: -52.6122383 },
    ],
    [],
  );

  // hook da taxa de entrega
  const { deliveryFee, recalc } = useDeliveryFee(
    deliveryRate,
    selectedStore,
    storeLocations,
  );

  // persistir carrinho e unidade
  useEffect(() => {
    setStoredCart(cart);
  }, [cart, setStoredCart]);
  useEffect(() => {
    if (selectedStore) setStoredStore(selectedStore);
  }, [selectedStore, setStoredStore]);

  // qtd no carrinho para um produto
  const getQtyInCart = useCallback(
    (productId: number) =>
      cart.find((i) => i.product.id === productId)?.quantity ?? 0,
    [cart],
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
      const maxHeight = UI.HEADER_MAX; // simplificado
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
  const [isStoreSelectorExpanded, setIsStoreSelectorExpanded] = useState(false);

  // bloquear scroll & barra de progresso durante "placing"
  useEffect(() => {
    if (!ui.placing) {
      document.body.classList.remove("overflow-hidden");
      return;
    }
    document.body.classList.add("overflow-hidden");
    setPlacingProgress(0);
    const interval = window.setInterval(
      () => setPlacingProgress((p) => Math.min(p + Math.random() * 7 + 3, 90)),
      300,
    );
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", beforeUnload);
      document.body.classList.remove("overflow-hidden");
    };
  }, [ui.placing]);

  // limpar carrinho quando trocar de loja
  useEffect(() => {
    setCart([]);
  }, [selectedStore]);

  // detectar loja mais próxima
  useEffect(() => {
    (async () => {
      try {
        const pos = await getPosition();
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
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
        setSelectedStore(closest.name);
        setShowInstruction(false);
      } catch (err) {
        console.log("Não foi possível obter a localização:", err);
        setShowInstruction(true);
        setIsStoreSelectorExpanded(true);
      }
    })();
  }, [storeLocations]);

  // buscar deliveryRate
  useEffect(() => {
    axios
      .get<{ deliveryRate: number }>(`${API_URL}/settings`)
      .then((res) => setDeliveryRate(res.data?.deliveryRate ?? 0))
      .catch((err) => console.error("Erro ao buscar deliveryRate:", err));
  }, []);

  // buscar produtos (UNIFICADO)
  useEffect(() => {
    if (!selectedStore) return;
    let isMounted = true;
    setLoading(true);
    (async () => {
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
    })();
    return () => {
      isMounted = false;
    };
  }, [selectedStore]);

  // 🔹 NOVO: buscar config de pagamento da loja (Mercado Pago etc.)
  useEffect(() => {
    const storeName = (selectedStore ?? "").trim();
    if (!storeName) {
      setPaymentConfig(null);
      return;
    }
    fetch(`${API_URL}/paymentconfigs/${encodeURIComponent(storeName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        console.log("PaymentConfig:", data); // 👈 debug
        setPaymentConfig(data);
        if (__DEBUG__) {
          (window as any).__lastPayCfg = data;
          console.log('[DEBUG] paymentConfig:', data);
        }
        
      })
      
      .catch((e) => {
        console.warn("paymentconfigs fetch error", e);
        setPaymentConfig(null);
      });
  }, [selectedStore]);
  
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
      const arr = ordemSubcategorias[c as keyof typeof ordemSubcategorias];
      if (!arr) return 999;
      const i = arr.indexOf(s);
      return i === -1 ? 999 : i;
    };
    return [...filtered].sort((a, b) => {
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
      let valor = e.target.value.replace(/\D/g, "");
      if (!valor.startsWith("55")) valor = "55" + valor;
      if (valor.length <= 13) setPhoneNumber(valor);
    },
    [],
  );

  // Handlers de carrinho
  const addToCart = useCallback(
    (product: Product, quantity: number = 1) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        const currentInCart = existing?.quantity ?? 0;
        const remaining = product.stock - currentInCart;
        if (remaining <= 0) {
          showToast("Estoque máximo já está no seu carrinho.", "warning");
          return prev;
        }
        const toAdd = Math.min(quantity, remaining);
        if (existing)
          return prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + toAdd }
              : i,
          );
        return [...prev, { product, quantity: toAdd }];
      });
      setSelectedProduct(null);
      setQuantityToAdd(1);
    },
    [showToast],
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

  // ESC fecha diálogos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (ui.confirmOpen) dispatch({ type: "CLOSE_CONFIRM" });
        else if (ui.stage === "pix") dispatch({ type: "OPEN_CHECKOUT" });
        else dispatch({ type: "RESET" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.stage, ui.confirmOpen]);

  // finalizar pedido (fluxo PIX local → cria pedido após confirmação)
  const getServerMessage = (err: unknown): string | undefined => {
    if (typeof err === "object" && err !== null) {
      const withResponse = err as {
        response?: { data?: unknown; status?: number };
        message?: unknown;
      };
      const data = withResponse.response?.data;
      if (typeof data === "object" && data !== null) {
        const maybeMsg = (data as { message?: unknown }).message;
        if (typeof maybeMsg === "string") return maybeMsg;
      }
      if (typeof withResponse.message === "string") return withResponse.message;
    }
    return undefined;
  };

  const finalizeOrder = useCallback(async (): Promise<boolean> => {
    if (orderId !== null) return true;
    if (cart.some((i) => i.quantity > i.product.stock)) {
      showToast(
        "Há itens no carrinho acima do estoque disponível. Ajuste as quantidades.",
        "warning",
      );
      return false;
    }
    if (
      !customerName.trim() ||
      (deliveryType === "entregar" && !address.trim())
    ) {
      showToast("Preencha as informações obrigatórias.", "warning");
      return false;
    }
    if (!selectedStore) {
      showToast("Nenhuma unidade selecionada.", "error");
      return false;
    }

    try {
      const realDeliveryFee = deliveryType === "entregar" ? deliveryFee : 0;
      const realTotal = subtotal + realDeliveryFee;

      const payload = {
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
      type OrderResponse = { id: number; message?: string };

      const response = await axios.post<OrderResponse>(
        `${API_URL}/orders`,
        payload,
      );
      const id = response.data?.id;
      if (typeof id === "number" && Number.isFinite(id)) {
        setOrderId(id);
        return true;
      }
      setErrorText("Erro: número do pedido não foi retornado corretamente.");
      return false;
    } catch (err: unknown) {
      console.error("❌ Erro ao enviar pedido:", err);
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409)
        setErrorText(
          "Conflito: outro cliente reservou esse estoque. Atualize o carrinho.",
        );
      else if (status === 422)
        setErrorText("Dados inválidos. Verifique os campos e tente novamente.");
      else setErrorText(getServerMessage(err) ?? "Erro ao enviar pedido.");
      return false;
    }
  }, [
    orderId,
    cart,
    customerName,
    deliveryType,
    address,
    selectedStore,
    deliveryFee,
    subtotal,
    customAddress,
    street,
    number,
    complement,
    phoneNumber,
  ]);

  // total PIX
  const totalPix = useMemo(
    () => subtotal + (deliveryType === "entregar" ? deliveryFee : 0),
    [subtotal, deliveryFee, deliveryType],
  );

  // config PIX da loja selecionada
  const pixCfg = useMemo(() => getPixConfig(selectedStore), [selectedStore]);

  // payload Pix local
  const payloadPix = useMemo(
    () => gerarPayloadPix(totalPix, pixCfg),
    [totalPix, pixCfg],
  );

  // 🔹 Helper de validação antes de pagamento (MP / Pix)
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
    if (deliveryType === "entregar") {
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
      if (!phoneNumber || phoneNumber.replace(/\D/g, "").length < 13) {
        showToast(
          "Informe seu WhatsApp com DDD (ex: 49991234567).",
          "warning",
        );
        return false;
      }
      if (deliveryFee === 0) {
        await recalc();
        showToast(
          "Ative sua localização para calcular a taxa de entrega.",
          "warning",
        );
        return false;
      }
    }
    return true;
  }, [
    cart.length,
    selectedStore,
    customerName,
    deliveryType,
    address,
    customAddress,
    street,
    number,
    phoneNumber,
    deliveryFee,
    recalc,
  ]);

  // 🔹 Fluxo de pagamento com Mercado Pago (cria pedido → inicia cobrança no backend)
  const handleMercadoPagoPayment = useCallback(async () => {
    try {
      const ok = await validateBeforePayment();
      if (!ok) return;

      // 1) cria pedido no backend (sem assumir que finalizeOrder já foi chamado)
      const realDeliveryFee = deliveryType === "entregar" ? deliveryFee : 0;
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

      const orderRes = await fetch(`${API_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      if (!orderRes.ok) {
        showToast("Falha ao criar pedido.", "error");
        return;
      }
      const orderData = await orderRes.json();
      const createdOrderId: number | undefined = orderData?.id;
      if (!createdOrderId || !Number.isFinite(createdOrderId)) {
        showToast("Pedido criado, mas ID inválido retornado.", "error");
        return;
      }
      setOrderId(createdOrderId);

      // 2) pede ao backend para iniciar o pagamento no MP para a LOJA do pedido
      const payRes = await fetch(
        `${API_URL}/payments/mp/checkout?orderId=${createdOrderId}`,
        { method: "POST" },
      );
      if (!payRes.ok) {
        showToast("Falha ao iniciar pagamento (Mercado Pago).", "error");
        return;
      }
      const data = await payRes.json();

      // 3) comportamentos possíveis retornados pelo backend:
      //    { type: "init_point", url: "https://www.mercadopago.com/..." }
      //    { type: "pix", qr_base64: "data:image/png;base64,..." }
      if (data?.type === "init_point" && data?.url) {
        window.location.href = data.url; // redireciona para o checkout do MP
      } else if (data?.type === "pix" && data?.qr_base64) {
        // exibe modal com QR base64 do MP
        setMpPixQr(data.qr_base64);
      } else {
        showToast("Retorno de pagamento inválido.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao processar pagamento com Mercado Pago.", "error");
    }
  }, [
    validateBeforePayment,
    deliveryType,
    deliveryFee,
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
  ]);

  // ---- RENDER ----
  return (
    <div key={componentKey} className="loja-container">
      {__DEBUG__ && (
  <div style={{
    position: 'fixed', left: 10, bottom: 10, zIndex: 10000,
    maxWidth: 380, padding: 10, borderRadius: 12,
    background: 'rgba(15,23,42,0.92)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.15)', fontSize: 12, lineHeight: 1.25
  }}>
    <div style={{fontWeight: 700, marginBottom: 6}}>UI Debug</div>
    <div><strong>ui.stage:</strong> {ui.stage}</div>
    <div><strong>orderId:</strong> {String(orderId)}</div>
    <div><strong>deliveryType:</strong> {deliveryType}</div>
    <div><strong>deliveryFee:</strong> {deliveryFee}</div>
    <div style={{marginTop: 6}}>
      <strong>condição MP:</strong>{" "}
      {paymentConfig?.provider?.toLowerCase?.() === "mercadopago" && paymentConfig?.isActive ? "true ✅" : "false ❌"}
    </div>
    <div style={{marginTop: 8, opacity: 0.9}}>
      <em>Botão de teste (fora do modal):</em>
    </div>
    {(paymentConfig?.provider?.toLowerCase?.() === "mercadopago" && paymentConfig?.isActive) ? (
      <button
        onClick={handleMercadoPagoPayment}
        style={{ marginTop: 6 }}
        className="w-full rounded-full bg-indigo-600 py-2 font-semibold text-white transition hover:bg-indigo-700 active:scale-95"
      >
        💳 Pagar com Mercado Pago (TESTE)
      </button>
    ) : (
      <div style={{marginTop: 6}}>Condição MP = false (sem render)</div>
    )}
    <div style={{marginTop: 8, display: 'flex', gap: 6}}>
      <button
        onClick={() => dispatch({ type: "OPEN_PIX" })}
        className="rounded bg-yellow-500 px-3 py-1 text-white"
      >
        Abrir PIX (forçar)
      </button>
      <button
        onClick={() => { setOrderId(null); dispatch({ type: "OPEN_CHECKOUT" }); }}
        className="rounded bg-gray-300 px-3 py-1 text-gray-900"
      >
        Zerar orderId
      </button>
    </div>
  </div>
)}

      {__DEBUG__ && (
  <div style={{
    position: 'fixed', right: 10, bottom: 10, zIndex: 9999,
    maxWidth: 360, padding: 10, borderRadius: 12,
    background: 'rgba(15,23,42,0.9)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, lineHeight: 1.25
  }}>
    <div style={{fontWeight: 700, marginBottom: 6}}>MP Debug</div>
    <div><strong>selectedStore:</strong> {String(selectedStore)}</div>
    <div><strong>URL:</strong> {API_URL}/paymentconfigs/{selectedStore}</div>
    <div style={{marginTop: 6}}>
      <strong>paymentConfig:</strong>
      <pre style={{whiteSpace:'pre-wrap', margin: 0}}>
        {JSON.stringify(paymentConfig, null, 2)}
      </pre>
    </div>
    <div style={{marginTop: 6}}>
      <strong>Botão visível?</strong>{' '}
      {paymentConfig?.provider?.toLowerCase?.() === 'mercadopago' && paymentConfig?.isActive ? 'SIM ✅' : 'NÃO ❌'}
    </div>
    <div style={{marginTop: 6}}>
      <strong>Motivo (se oculto):</strong>{' '}
      {!paymentConfig ? 'Sem config (404/erro no fetch)' :
        paymentConfig?.provider?.toLowerCase?.() !== 'mercadopago' ? 'provider ≠ mercadopago' :
        paymentConfig?.isActive !== true ? 'isActive ≠ true' : '—'}
    </div>
  </div>
)}

      {/* espaçamento para o header */}
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
          <div className="flex justify-center">
            <div className="mb-3 animate-pulse text-sm text-gray-900">
              👉 Escolha sua unidade para começar
            </div>
          </div>
        )}

        {/* Seleção de unidade */}
        <div className="z-50 flex flex-wrap justify-center gap-4 px-5 py-1">
          {["efapi", "palmital", "passo"].map((store) => (
            <button
              key={store}
              onClick={() => {
                if (selectedStore !== store) setSelectedStore(store);
                else {
                  setSelectedStore(null);
                  setTimeout(() => setSelectedStore(store), 0);
                }
                setCart([]);
                setShowInstruction(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`rounded-full border px-5 py-1 text-sm font-semibold shadow transition-all duration-300 ${
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
        {isStoreSelectorExpanded && (
          <div
            ref={dropdownRef}
            className="mt-2 rounded-xl border border-yellow-500 bg-white px-4 py-2 text-sm text-gray-800 shadow"
          >
            Não conseguimos identificar sua localização. Por favor, selecione
            manualmente sua unidade acima.
          </div>
        )}

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
            className="w-full rounded-xl border border-white/40 bg-white/90 px-4 py-2 text-sm shadow-md backdrop-blur-md transition focus:outline-none focus:ring-2 focus:ring-red-300"
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
                className="w-full appearance-none rounded-xl bg-transparent px-4 py-2 text-sm text-gray-800 focus:outline-none"
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
                className="w-full appearance-none rounded-xl bg-transparent px-4 py-2 text-sm text-gray-800 focus:outline-none"
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
                {(selectedCategory ? getSubcategories(selectedCategory) : []).map(
                  (sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ),
                )}
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
              <div key={product.id} className="product-card">
                <div
                  className="product-image-wrapper"
                  onClick={() => {
                    const remaining = product.stock - getQtyInCart(product.id);
                    if (remaining <= 0) {
                      showToast(
                        "Estoque máximo já está no seu carrinho.",
                        "warning",
                      );
                      return;
                    }
                    setSelectedProduct(product);
                    setQuantityToAdd(1);
                  }}
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
      <footer className="mt-12 border-t border-gray-200 pt-8 pb-6 text-center bg-gradient-to-b from-white to-gray-50">
        <h2 className="text-lg font-bold text-sky-600 tracking-wide">
          Desenvolvido por{" "}
          <a
            href="https://eistalt.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 font-semibold hover:text-sky-500 transition-colors hover:underline decoration-2 underline-offset-4"
          >
            EISTALT
          </a>
        </h2>
      </footer>

      {/* Botões flutuantes */}
      <Link
        onClick={() => {
          /* apenas navega */
        }}
        to="/meus-pedidos"
        className="duração-300 fixed bottom-48 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-blue-500 p-2 text-white shadow-2xl transition-all hover:scale-105 active:scale-95"
      >
        <div className="text-3xl">📜</div>
        <div className="mt-1 text-xs font-bold">Meu</div>
        <div className="mt-1 text-xs font-bold">Pedido</div>
      </Link>

      <button
        onClick={() =>
          dispatch({
            type: ui.stage === "idle" ? "OPEN_CHECKOUT" : "OPEN_CHECKOUT",
          })
        }
        className="animate-pulse-slow duração-300 fixed bottom-20 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-yellow-500 p-3 text-white shadow-2xl transition-all hover:scale-105 active:scale-95"
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

              {deliveryType === "entregar" && (
                <p className="mt-2 text-sm text-gray-700">
                  🚚 Entrega: {toBRL(deliveryFee)}
                </p>
              )}

              {/* Nome */}
              <input
                ref={checkoutFirstInputRef}
                type="text"
                placeholder="Seu nome completo"
                className="mb-3 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />

              {/* Tipo de entrega */}
              <select
                className="mb-3 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value)}
              >
                <option value="retirar">Retirar na Loja</option>
                <option value="entregar">Entrega em Casa</option>
              </select>

              {deliveryType === "entregar" && (
                <div className="flex flex-col gap-3">
                  <select
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
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
                      className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 focus:border-red-400 focus:ring focus:ring-red-200"
                    />
                  )}

                  <input
                    type="text"
                    placeholder="* Rua (obrigatório)"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    required
                    className={`w-full rounded-xl border px-4 py-2 text-sm text-gray-700 ${
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
                    className={`w-full rounded-xl border px-4 py-2 text-sm text-gray-700 ${
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
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700"
                  />
                  <input
                    type="tel"
                    placeholder="* WhatsApp com DDD (ex: 49991234567)"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    className={`w-full rounded-xl border px-4 py-2 text-sm text-gray-700 ${
                      !phoneNumber || phoneNumber.length < 13
                        ? "border-red-400 bg-red-50"
                        : "border-gray-300 bg-gray-50"
                    } focus:border-red-400 focus:ring focus:ring-red-200`}
                  />
                </div>
              )}

              <div className="mt-4">
                <div className="mb-4 space-y-1 text-left text-sm text-gray-800">
                  <p>
                    🧁 Produtos: <strong>{toBRL(subtotal)}</strong>
                  </p>
                  <p>
                    🚚 Entrega aproximada: <strong>{toBRL(deliveryFee)}</strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    (Será cobrada apenas se escolher entrega)
                  </p>
                  <p className="text-base font-bold text-green-700">
                    💰 Total com entrega: {toBRL(subtotal + deliveryFee)}
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
                      if (!ok) return;
                      // Passou nas validações → abre PIX local
                      dispatch({ type: "OPEN_PIX" });
                    }}
                    disabled={deliveryType === "entregar" && deliveryFee === 0}
                    className={`rounded px-10 py-1 font-semibold transition ${
                      deliveryType === "entregar" && deliveryFee === 0
                        ? "cursor-not-allowed bg-gray-300 text-gray-500"
                        : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
                    }`}
                  >
                    Ir para Pagamento
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

      {/* Modal PIX local */}
      {ui.stage === "pix" && orderId === null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          {/* Wrapper NÃO rolável */}
          <div className="relative w-full max-w-sm">
            <button
              onClick={() => dispatch({ type: "OPEN_CHECKOUT" })}
              className="absolute right-4 top-4 z-10 text-2xl text-gray-400 transition hover:text-red-500"
              aria-label="Voltar"
            >
              ✕
            </button>

            {/* Conteúdo rolável */}
            <div className="animate-zoom-fade max-h-[85vh] overflow-y-auto overscroll-contain rounded-3xl bg-white/90 p-6 pt-10 text-center shadow-2xl">
              <h2 className="mb-2 text-xl font-semibold text-green-700">
                Pagamento via PIX
              </h2>
              <h2 className="mb-1 text-sm text-gray-600">
                Loja: <strong>{selectedStore?.toUpperCase()}</strong>
              </h2>
              <p className="mb-3 text-xs text-gray-500">
                Recebedor: <strong>{pixCfg.NOME}</strong>
              </p>

              <p className="mb-3 text-sm text-gray-600">
                Escaneie o QR Code ou copie o código abaixo:
              </p>

              <div className="mb-4 space-y-1 text-left text-sm text-gray-800">
                <p>
                  🧁 Subtotal: <strong>{toBRL(subtotal)}</strong>
                </p>
                <p>
                  🚚 Entrega:{" "}
                  <strong>
                    {toBRL(deliveryType === "entregar" ? deliveryFee : 0)}
                  </strong>
                </p>
                <p className="text-base font-bold text-green-700">
                  💰 Total: {toBRL(totalPix)}
                </p>
              </div>

              <PixQRCode payload={payloadPix} />

              <button
                onClick={() => navigator.clipboard.writeText(payloadPix)}
                className="mt-2 w-full rounded-full bg-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                📋 Copiar código Pix
              </button>

              <div className="mt-6 space-y-2">
                {/* 🔹 Botão Mercado Pago aparece apenas se a loja tiver provider="mercadopago" e ativo */}
                {paymentConfig?.provider?.toLowerCase?.() === "mercadopago" &&
  paymentConfig?.isActive && (
                    <button
                      onClick={handleMercadoPagoPayment}
                      className="w-full rounded-full bg-indigo-600 py-2 font-semibold text-white transition hover:bg-indigo-700 active:scale-95"
                    >
                      💳 Pagar com Mercado Pago
                    </button>
                  )}

                <button
                  onClick={() => dispatch({ type: "OPEN_CONFIRM" })}
                  className="w-full rounded-full bg-green-500 py-2 font-semibold text-white transition hover:bg-green-600 active:scale-95"
                >
                  Confirmar Pagamento
                </button>
                <button
                  onClick={() => dispatch({ type: "OPEN_CHECKOUT" })}
                  className="w-full rounded-full bg-gray-200 py-2 text-gray-600 transition hover:bg-gray-300"
                >
                  Voltar
                </button>
              </div>
            </div>
            {/* fim do conteúdo rolável */}
          </div>
          {/* fim do wrapper não rolável */}
        </div>
      )}
      {/* fim do PIX local */}

      {/* Diálogo de confirmação dentro do PIX (fluxo local) */}
      {ui.stage === "pix" && ui.confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-zoom-fade w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h3 className="mb-3 text-lg font-bold text-gray-800">
              Confirmação
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              Você confirma que <strong>já realizou o pagamento via PIX</strong>?
              <br />
              Esse passo finaliza o seu pedido.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => dispatch({ type: "CLOSE_CONFIRM" })}
                className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
              >
                Voltar
              </button>
              <button
                onClick={async () => {
                  dispatch({ type: "START_PLACING" });
                  dispatch({ type: "CLOSE_CONFIRM" });
                  const ok = await finalizeOrder();
                  setPlacingProgress(100);
                  setTimeout(() => {
                    dispatch({ type: "STOP_PLACING" });
                    if (ok) setShowConfirmation(true);
                    else setShowError(true);
                  }, 350);
                }}
                className="rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
              >
                Sim, Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay enquanto finaliza (fluxo local) */}
      {ui.placing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-yellow-400/30" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
            </div>
            <div className="w-64 overflow-hidden rounded-full bg-white/80 shadow">
              <div
                className="duração-200 h-2 rounded-full bg-yellow-400 transition-all"
                style={{ width: `${placingProgress}%` }}
              />
            </div>
            <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-gray-700 shadow">
              Finalizando seu pedido...
            </div>
            <p className="text-xs text-gray-500">
              Por favor, não feche ou atualize a página.
            </p>
          </div>
        </div>
      )}

      {/* Pedido Confirmado (fluxo local) */}
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
                setDeliveryType("retirar");
                setComponentKey((p) => p + 1);
                if (selectedStore)
                  axios
                    .get<Product[]>(
                      `${API_URL}/products/list?store=${selectedStore}&page=1&pageSize=200`,
                    )
                    .then((res) => {
                      if (Array.isArray(res.data)) setProducts(res.data);
                    });
              }}
              className="rounded-full bg-green-600 px-6 py-2 text-white hover:bg-green-700"
            >
              Voltar para Loja
            </button>
          </div>
        </div>
      )}

      {/* Erro (fluxo local) */}
      {showError && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <span className="mb-4 block text-5xl text-red-600">✖️</span>
            <h2 className="mb-2 text-2xl font-bold text-red-700">
              Não foi possível finalizar
            </h2>
            <p className="mb-4 text-sm text-gray-700">{errorText}</p>
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={() => {
                  setShowError(false);
                  dispatch({ type: "OPEN_PIX" });
                }}
                className="rounded-full bg-yellow-500 px-5 py-2 text-white hover:bg-yellow-600"
              >
                Tentar novamente
              </button>
              <button
                onClick={() => setShowError(false)}
                className="rounded-full bg-gray-200 px-5 py-2 text-gray-700 hover:bg-gray-300"
              >
                Fechar
              </button>
            </div>
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
              className="mb-4 h-48 w-full object-contain"
            />
            <h2 className="mb-1 text-center text-lg font-bold text-gray-800">
              {selectedProduct.name}
            </h2>
            <p className="mb-3 text-center text-base font-bold text-green-700">
              {toBRL(selectedProduct.price)}
            </p>
            <p className="mb-2 text-center text-xs text-gray-500">
              {remainingForSelected > 0
                ? `Disponível: ${remainingForSelected}${
                    selectedProduct &&
                    remainingForSelected < selectedProduct.stock
                      ? ` (de ${selectedProduct.stock})`
                      : ""
                  }`
                : "Produto esgotado no seu carrinho"}
            </p>
            <p className="mb-4 text-center text-sm text-gray-600">
              {selectedProduct.description}
            </p>

            <div className="mb-4 flex items-center justify-center gap-4">
              <button
                aria-label="Diminuir quantidade"
                onClick={() =>
                  setQuantityToAdd((prev) => (prev > 1 ? prev - 1 : 1))
                }
                className="text-2xl"
              >
                ➖
              </button>
              <span className="text-xl" aria-live="polite">
                {quantityToAdd}
              </span>
              <button
                aria-label="Aumentar quantidade"
                onClick={() =>
                  setQuantityToAdd((prev) =>
                    selectedProduct && prev < remainingForSelected
                      ? prev + 1
                      : prev,
                  )
                }
                className="text-2xl"
                disabled={quantityToAdd >= remainingForSelected}
              >
                ➕
              </button>
            </div>

            <button
              onClick={() => {
                const safeQty = Math.min(quantityToAdd, remainingForSelected);
                if (safeQty <= 0) {
                  showToast("Estoque máximo já está no seu carrinho.", "warning");
                  return;
                }
                addToCart(selectedProduct, safeQty);
              }}
              disabled={remainingForSelected <= 0}
              className={`w-full rounded py-2 text-white ${
                remainingForSelected <= 0
                  ? "cursor-not-allowed bg-gray-400"
                  : "bg-red-600 hover:bg-red-500"
              }`}
            >
              {remainingForSelected <= 0
                ? "Máximo no carrinho"
                : "Adicionar ao Carrinho"}
            </button>
          </div>
        </div>
      )}

      {/* 🔔 Toast top */}
      {toast && (
        <div className="fixed left-1/2 top-4 z-[120] -translate-x-1/2">
          <div
            className={[
              "animate-[fade-in_0.2s_ease-out]",
              "rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md",
              toast.type === "success" &&
                "border-green-200 bg-green-50/90 text-green-800",
              toast.type === "warning" &&
                "border-yellow-200 bg-yellow-50/90 text-yellow-800",
              toast.type === "error" &&
                "border-red-200 bg-red-50/90 text-red-800",
              toast.type === "info" &&
                "border-gray-200 bg-white/90 text-gray-800",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">
                {toast.type === "success"
                  ? "✅"
                  : toast.type === "warning"
                  ? "⚠️"
                  : toast.type === "error"
                  ? "❌"
                  : "ℹ️"}
              </span>
              <div className="text-sm  font-medium">{toast.message}</div>
              <button
                onClick={() => setToast(null)}
                className="ml-2 rounded-md px-2 text-xs opacity-70 hover:opacity-100"
                aria-label="Fechar aviso"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔹 Modal de PIX do Mercado Pago (QR em base64 retornado pelo backend) */}
      {mpPixQr && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h3 className="mb-3 text-lg font-bold text-gray-800">
              Pix (Mercado Pago)
            </h3>
            <img
              src={mpPixQr}
              alt="QR Code Pix Mercado Pago"
              className="mx-auto mb-4 max-h-[320px] w-auto rounded-md border object-contain p-2"
            />
            <p className="mb-4 text-sm text-gray-600">
              Escaneie o QR Code para pagar. Assim que o pagamento for
              confirmado, você poderá acompanhar seu pedido em “Meu Pedido”.
            </p>
            <button
              onClick={() => setMpPixQr(null)}
              className="rounded-full bg-gray-200 px-5 py-2 text-gray-700 hover:bg-gray-300"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
