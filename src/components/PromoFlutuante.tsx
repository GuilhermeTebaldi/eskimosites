import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

  // produto de exemplo (poderá vir da seção /promoções futuramente)
  const promoProduto: PromoProduct = {
    id: 9999,
    name: "Sorvete Brigadeiro",
    description: "Promoção especial de lançamento 🍫",
    price: 3.99,
    imageUrl:
      "https://eskimo.com.br/wp-content/uploads/2023/08/Seletto-brigadeiro-sem-lupa.png",
    categoryName: "Promoções",
    stock: 50,
  };

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
              {/* Card de produto */}
              <div className="rounded-xl border p-3 transition hover:shadow-md">
                <img
                  ref={productImageRef}
                  src={promoProduto.imageUrl}
                  alt={promoProduto.name}
                  className="mb-2 rounded-lg"
                />
                <p className="font-semibold">{promoProduto.name}</p>
                <p className="text-sm text-gray-500 line-through">R$ 5,50</p>
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
                  className="mt-2 w-full rounded-md bg-green-600 py-1 text-sm text-white hover:bg-green-700"
                >
                  Adicionar ao Carrinho
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
