import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../services/api";

type PromoProduct = {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  categoryName: string;
  stock: number;
  subcategoryName?: string;
  sortRank?: number;
  pinnedTop?: boolean;
  style?: Record<string, unknown>;
};

type PromotionResponse = {
  id: number;
  productId: number;
  previousPrice?: number;
  currentPrice?: number;
  highlightText?: string;
  updatedAt?: string;
  product?: {
    id: number;
    name: string;
    description?: string | null;
    price: number;
    imageUrl?: string | null;
    categoryName?: string | null;
    subcategoryName?: string | null;
    stock?: number | null;
  };
};

interface PromoFlutuanteProps {
  addToCart: (
    product: PromoProduct,
    quantity?: number,
    options?: {
      imageUrl?: string;
      originRect?: DOMRect;
      productId?: number;
      onBeforeAnimate?: () => void;
    },
  ) => void;
}

export default function PromoFlutuante({ addToCart }: PromoFlutuanteProps) {
  const [open, setOpen] = useState(false);
  const [slideOffset, setSlideOffset] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(min-width: 640px)").matches ? 384 : 320;
    }
    return 320;
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const productImageRef = useRef<HTMLImageElement | null>(null);
  const [promotion, setPromotion] = useState<PromotionResponse | null>(null);
  const [promotionLoading, setPromotionLoading] = useState(true);
  const [promotionSupported, setPromotionSupported] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateOffset = () => {
      const wide = window.matchMedia("(min-width: 640px)").matches;
      setSlideOffset(wide ? 384 : 320);
    };

    updateOffset();
    window.addEventListener("resize", updateOffset);
    return () => window.removeEventListener("resize", updateOffset);
  }, []);
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);
  const promoProduto = useMemo<PromoProduct | null>(() => {
    if (!promotion?.product) return null;
    const product = promotion.product;
    return {
      id: product.id,
      name: product.name,
      description:
        promotion.highlightText && promotion.highlightText.trim().length > 0
          ? promotion.highlightText
          : product.description ?? "Aproveite esta oferta exclusiva!",
      price: promotion.currentPrice ?? product.price,
      imageUrl: product.imageUrl ?? "https://via.placeholder.com/160?text=Eskim%C3%B3",
      categoryName: product.categoryName ?? "Promoções",
      stock: product.stock ?? 0,
      subcategoryName: product.subcategoryName ?? undefined,
    };
  }, [promotion]);

  const previousPrice = promotion?.previousPrice ?? promotion?.product?.price;

  useEffect(() => {
    if (!promotionSupported) {
      setPromotion(null);
      setPromotionLoading(false);
      return;
    }

    let isMounted = true;

    const fetchPromotion = async () => {
      try {
        const { data } = await api.get<PromotionResponse | null>("/promotions/active");
        if (!isMounted) return;
        setPromotion(data);
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          if (isMounted) {
            setPromotion(null);
            setPromotionSupported(false);
          }
        } else {
          console.error("Erro ao carregar promoção flutuante:", error);
          if (isMounted) setPromotion(null);
        }
      } finally {
        if (isMounted) setPromotionLoading(false);
      }
    };

    fetchPromotion();
    const interval = window.setInterval(fetchPromotion, 120000);
    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [promotionSupported]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-40 left-0 z-40 flex items-center"
    >
      {/* Botão lateral */}
      <motion.div
        className="cursor-pointer rounded-r-xl bg-red-600 px-3 py-2 text-white shadow-lg"
        initial={{ x: 0 }}
        animate={{ x: open ? slideOffset : 0 }}
        onClick={() => setOpen((prev) => !prev)}
        whileHover={{ scale: 1.05 }}
      >
        🎁 Promoções
      </motion.div>

      {/* Painel expandido */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="painel"
            className="fixed bottom-0 left-0 h-[80vh] w-80 overflow-y-auto rounded-tr-2xl border-r border-gray-200 bg-white shadow-2xl sm:w-96"
            initial={{ x: -slideOffset }}
            animate={{ x: 0 }}
            exit={{ x: -slideOffset }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
          >
            <div className="flex items-center justify-between bg-red-600 p-4 text-white">
              <h2 className="text-lg font-bold">Promoções</h2>
              <button
                className="text-white/80 transition-colors hover:text-white"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-4">
              {promotionLoading ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                  Carregando promoção...
                </div>
              ) : promoProduto ? (
                <div className="rounded-xl border p-3 transition hover:shadow-md">
                  <img
                    ref={productImageRef}
                    src={promoProduto.imageUrl}
                    alt={promoProduto.name}
                    className="mb-2 rounded-lg"
                    onError={(e) => {
                      e.currentTarget.src = "https://via.placeholder.com/160?text=Eskim%C3%B3";
                    }}
                  />
                  <p className="text-xs uppercase text-gray-500">
                    {promoProduto.categoryName}
                  </p>
                  <p className="font-semibold text-gray-800">{promoProduto.name}</p>
                  <p className="text-sm text-gray-600">{promoProduto.description}</p>
                  {typeof previousPrice === "number" && previousPrice > promoProduto.price && (
                    <p className="mt-2 text-sm text-gray-500 line-through">
                      R$ {previousPrice.toFixed(2)}
                    </p>
                  )}
                  <p className="font-bold text-red-600">
                    R$ {promoProduto.price.toFixed(2)}
                  </p>
                  <button
                    onClick={() => {
                      const originRect =
                        productImageRef.current?.getBoundingClientRect();
                      addToCart(promoProduto, 1, {
                        imageUrl: promoProduto.imageUrl,
                        originRect: originRect ?? undefined,
                        productId: promoProduto.id,
                        onBeforeAnimate: () => setOpen(false),
                      });
                    }}
                    className="mt-3 w-full rounded-md bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    Adicionar ao Carrinho
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                  Nenhuma promoção ativa no momento. Volte em instantes! ❄️
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
