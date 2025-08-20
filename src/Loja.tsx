// Loja_refatorada.tsx — versão refatorada em um ÚNICO ARQUIVO
// Mantém as dependências externas existentes (PixQRCode, LinhaProdutosAtalhos, PenguinBlink, Loja.css)
// Implementa: organização por subcomponentes internos, hooks/utilitários locais,
// useReducer para o fluxo (checkout → pix → confirmar), memos, callbacks estáveis,
// unifica efeitos duplicados, acessibilidade, persistência em localStorage,
// formatação de moeda, imagens lazy, clamp de quantidade e melhorias diversas.

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

/************************************
 * Constantes & helpers
 ************************************/
const API_URL: string | undefined = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error("VITE_API_URL não definido");

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
const PIX = {
  CHAVE: "guilhermemagiccloseup@gmail.com",
  NOME: "Guilherme Tebaldi",
  CIDADE: "SAO PAULO",
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

const gerarPayloadPix = (valor: number): string => {
  const chavePix = PIX.CHAVE;
  const nome = PIX.NOME;
  const cidade = PIX.CIDADE;
  const txid = "tePdSk5zg9"; // poderia ser único por pedido

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
function Toast({
  type,
  message,
  onClose,
}: {
  type: "info" | "success" | "warning" | "error";
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed left-1/2 top-4 z-[120] -translate-x-1/2">
      <div
        className={[
          "animate-[fade-in_0.2s_ease-out]",
          "rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md",
          type === "success" &&
            "border-green-200 bg-green-50/90 text-green-800",
          type === "warning" &&
            "border-yellow-200 bg-yellow-50/90 text-yellow-800",
          type === "error" && "border-red-200 bg-red-50/90 text-red-800",
          type === "info" && "border-gray-200 bg-white/90 text-gray-800",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex items-start gap-3">
          <span className="text-xl">
            {type === "success"
              ? "✅"
              : type === "warning"
                ? "⚠️"
                : type === "error"
                  ? "❌"
                  : "ℹ️"}
          </span>
          <div className="text-sm font-medium">{message}</div>
          <button
            aria-label="Fechar aviso"
            onClick={onClose}
            className="ml-2 rounded-md px-2 text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
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

  // formatação moeda memoizada (para uso inline sem recomputar options)
  const toBRL = useCallback((v: number) => fmtBRL.format(v), []);

  // header com scroll (usa ref para evitar re-render em cada scroll)
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

  // clique fora para fechar dropdown de unidade
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

  // buscar produtos (UNIFICADO, sem duplicação)
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

  const paginados = useMemo(
    () => produtosOrdenados.slice(0, currentPage * UI.PRODUCTS_PER_PAGE),
    [produtosOrdenados, currentPage],
  );
  const totalPages = useMemo(
    () => Math.ceil(filtered.length / UI.PRODUCTS_PER_PAGE),
    [filtered.length],
  );

  // máscara e envio limpo do telefone
  const handlePhoneChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let valor = e.target.value.replace(/\D/g, "");
      if (!valor.startsWith("55")) valor = "55" + valor;
      if (valor.length <= 13) setPhoneNumber(valor);
    },
    [],
  );

  // Handlers de carrinho estáveis
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

  // abrir checkout — removido (usamos dispatch direto nos botões)

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

  // finalizar pedido
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

  // total PIX & payload memorizados
  const totalPix = useMemo(
    () => subtotal + (deliveryType === "entregar" ? deliveryFee : 0),
    [subtotal, deliveryFee, deliveryType],
  );
  const payloadPix = useMemo(() => gerarPayloadPix(totalPix), [totalPix]);

  // ---- RENDER ----
  return (
    <div key={componentKey} className="loja-container">
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
              className={`rounded-full border px-5 py-1 text-sm font-semibold shadow transition-all duration-300 ${selectedStore === store ? "border-yellow-200 bg-yellow-300 text-gray-900 ring-1 ring-yellow-300" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"}`}
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

      {currentPage < totalPages && (
        <div className="mb-24 mt-4 text-center">
          <button
            onClick={() => setCurrentPage((p) => p + 1)}
            className="inline-flex items-center gap-2 rounded-full bg-yellow-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-yellow-600 hover:shadow-xl active:scale-95"
          >
            <span className="animate-bounce text-xl">↓</span>
            Carregar mais
          </button>
        </div>
      )}

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
        onClick={() =>
          dispatch({
            type: ui.stage === "idle" ? "OPEN_CHECKOUT" : "OPEN_CHECKOUT",
          })
        }
        className="animate-pulse-slow fixed bottom-20 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-yellow-500 p-3 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
        aria-label="Abrir carrinho"
      >
        <div className="text-3xl">🛒</div>
        <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-yellow-500 shadow-md">
          {cart.reduce((sum, item) => sum + item.quantity, 0)}
        </div>
      </button>

      {/* Drawer simples de carrinho (versão leve) */}
      {ui.stage === "checkout" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-zoom-fade relative w-full max-w-sm rounded-3xl bg-white/90 p-6 shadow-2xl">
            <button
              onClick={() => dispatch({ type: "RESET" })}
              className="absolute right-4 top-4 text-2xl text-gray-400 transition hover:text-red-500"
              aria-label="Fechar"
            >
              ✕
            </button>
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
                  {/* (lista original mantida) */}
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
                  className={`w-full rounded-xl border px-4 py-2 text-sm text-gray-700 ${!street ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50"} focus:border-red-400 focus:ring focus:ring-red-200`}
                />
                <input
                  type="text"
                  placeholder="* Número (obrigatório)"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  className={`w-full rounded-xl border px-4 py-2 text-sm text-gray-700 ${!number ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50"} focus:border-red-400 focus:ring focus:ring-red-200`}
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
                  className={`w-full rounded-xl border px-4 py-2 text-sm text-gray-700 ${!phoneNumber || phoneNumber.length < 13 ? "border-red-400 bg-red-50" : "border-gray-300 bg-gray-50"} focus:border-red-400 focus:ring focus:ring-red-200`}
                />
                <p className="mt-1 text-xs text-gray-600">
                  ⚠️ Este número será usado para você consultar seu pedido
                  depois.
                </p>
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
                  className="rounded bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-300"
                >
                  Continuar Comprando
                </button>
                <button
                  onClick={async () => {
                    if (deliveryType === "entregar" && deliveryFee === 0) {
                      await recalc();
                      showToast(
                        "Ative sua localização para calcular a taxa.",
                        "warning",
                      );
                      return;
                    }
                    dispatch({ type: "OPEN_PIX" });
                  }}
                  disabled={deliveryType === "entregar" && deliveryFee === 0}
                  className={`rounded px-4 py-2 font-semibold transition ${deliveryType === "entregar" && deliveryFee === 0 ? "cursor-not-allowed bg-gray-300 text-gray-500" : "bg-red-500 text-white hover:bg-red-600 active:scale-95"}`}
                >
                  Ir para Pagamento
                </button>
              </div>
            </div>

            {/* Itens do carrinho (resumo enxuto) */}
            <div className="mt-6 max-h-48 space-y-3 overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="font-medium">{item.product.name}</div>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="Diminuir quantidade"
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="text-red-500"
                    >
                      ➖
                    </button>
                    <span className="w-6 text-center">{item.quantity}</span>
                    <button
                      aria-label="Aumentar quantidade"
                      onClick={() =>
                        item.quantity < item.product.stock &&
                        updateQuantity(item.product.id, 1)
                      }
                      className={`text-green-600 ${item.quantity >= item.product.stock ? "cursor-not-allowed opacity-50" : ""}`}
                      disabled={item.quantity >= item.product.stock}
                    >
                      ➕
                    </button>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="ml-2 text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal PIX */}
      {ui.stage === "pix" && orderId === null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-zoom-fade relative w-full max-w-sm rounded-3xl bg-white/90 p-6 text-center shadow-2xl">
            <button
              onClick={() => dispatch({ type: "OPEN_CHECKOUT" })}
              className="absolute right-4 top-4 text-2xl text-gray-400 transition hover:text-red-500"
              aria-label="Voltar"
            >
              ✕
            </button>
            <h2 className="mb-2 text-xl font-semibold text-green-700">
              Pagamento via PIX
            </h2>
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
        </div>
      )}

      {/* Diálogo de confirmação dentro do PIX */}
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
              Você confirma que <strong>já realizou o pagamento via PIX</strong>
              ?<br />
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

      {/* Overlay enquanto finaliza */}
      {ui.placing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-yellow-400/30" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
            </div>
            <div className="w-64 overflow-hidden rounded-full bg-white/80 shadow">
              <div
                className="h-2 rounded-full bg-yellow-400 transition-all duration-200"
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
                    .get<
                      Product[]
                    >(`${API_URL}/products/list?store=${selectedStore}&page=1&pageSize=200`)
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

      {/* Erro */}
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
                ? `Disponível: ${remainingForSelected}${selectedProduct && remainingForSelected < selectedProduct.stock ? ` (de ${selectedProduct.stock})` : ""}`
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
                  showToast(
                    "Estoque máximo já está no seu carrinho.",
                    "warning",
                  );
                  {
                    toast && (
                      <Toast
                        type={toast.type}
                        message={toast.message}
                        onClose={() => setToast(null)}
                      />
                    );
                  }

                  return;
                }
                addToCart(selectedProduct, safeQty);
              }}
              disabled={remainingForSelected <= 0}
              className={`w-full rounded py-2 text-white ${remainingForSelected <= 0 ? "cursor-not-allowed bg-gray-400" : "bg-red-600 hover:bg-red-500"}`}
            >
              {remainingForSelected <= 0
                ? "Máximo no carrinho"
                : "Adicionar ao Carrinho"}
            </button>
          </div>
        </div>
      )}

      {/* 🔔 Toast */}
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
              <div className="text-sm font-medium">{toast.message}</div>
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
    </div>
  );
}
