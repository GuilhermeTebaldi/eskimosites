import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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
};

type PromotionDTO = {
  id: number;
  productId: number;
  previousPrice: number | null;
  currentPrice: number;
  highlightText?: string | null;
  product?: PromoProduct | null;
};

interface PromoFlutuanteProps {
  promos: PromotionDTO[];
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
  openProduct?: (product: PromoProduct) => void;
}

export default function PromoFlutuante({ promos, addToCart, openProduct }: PromoFlutuanteProps) {
  const [open, setOpen] = useState(false);
  const [slideOffset, setSlideOffset] = useState(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia("(min-width: 640px)").matches ? 384 : 320;
    }
    return 320;
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRefs = useRef<Record<number, HTMLImageElement | null>>({});

  const promoList = useMemo(
    () => (Array.isArray(promos) ? promos.filter((p) => p?.product) : []),
    [promos],
  );
  const hasPromos = promoList.length > 0;

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

  const handleAddToCart = (promoId: number, prod: PromoProduct) => {
    const originRect = imageRefs.current[promoId]?.getBoundingClientRect();
    addToCart(prod, 1, {
      imageUrl: prod.imageUrl,
      originRect: originRect ?? undefined,
      productId: prod.id,
      onBeforeAnimate: () => setOpen(false),
    });
  };
  const handleOpenProduct = (prod: PromoProduct) => {
    if (!openProduct) return;
    openProduct(prod);
  };

  if (!hasPromos) return null;

  return (
    <div ref={containerRef} className="fixed bottom-40 left-0 z-40 flex items-center">
      <motion.div
        className="cursor-pointer rounded-r-xl bg-red-600 px-3 py-2 text-white shadow-lg"
        initial={{ x: 0 }}
        animate={{ x: open ? slideOffset : 0 }}
        onClick={() => setOpen((prev) => !prev)}
        whileHover={{ scale: 1.05 }}
      >
      Promoções 🎁
      </motion.div>

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
            <div className="flex items-center justify-between bg-red-600 p-3 text-white">
              <h2 className="text-base font-semibold">Promoções</h2>
              <button
                className="text-white/80 transition-colors hover:text-white"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 p-3">
              {promoList.map((pr) => {
                const prod = pr.product!;
                const isOut = (prod.stock ?? 0) <= 0;
                return (
                  <div
                    key={pr.id}
                    className="flex items-center gap-3 overflow-hidden rounded-xl border border-gray-200 p-2 transition hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenProduct(prod)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <div className="shrink-0">
                        <img
                          ref={(el) => {
                            imageRefs.current[pr.id] = el;
                          }}
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="h-14 w-14 rounded-lg border bg-white object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://via.placeholder.com/80?text=Eskim%C3%B3";
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {prod.name}
                        </p>
                        <p
                          className="text-[11px] text-gray-500 leading-snug break-words"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {pr.highlightText ?? prod.description}
                        </p>
                        <div className="text-xs text-gray-500">
                          {pr.previousPrice != null && pr.previousPrice > 0 && (
                            <span className="mr-1 line-through">
                              {fmtBRL.format(Number(pr.previousPrice))}
                            </span>
                          )}
                          <span className="font-bold text-red-600">
                            {fmtBRL.format(Number(pr.currentPrice))}
                          </span>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleAddToCart(pr.id, prod)}
                      disabled={isOut}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        isOut
                          ? "cursor-not-allowed bg-gray-200 text-gray-500"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                    >
                      {isOut ? "S/ estoque" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
