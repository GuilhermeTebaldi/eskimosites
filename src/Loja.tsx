import { useEffect, useState } from "react";
import axios from "axios";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  categoryName: string;
  subcategoryName?: string;
}

const API_URL = "https://backend-eskimo.onrender.com/api";

export default function Loja() {
  const [loading, setLoading] = useState(true);

  const [showInstruction, setShowInstruction] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [isStoreSelectorExpanded, setIsStoreSelectorExpanded] = useState(true);

  const [currentPage, setCurrentPage] = useState(1);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [deliveryType, setDeliveryType] = useState("retirar");
  const [address, setAddress] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [quantityToAdd, setQuantityToAdd] = useState(1);
  const [selectedStore, setSelectedStore] = useState<string | null>(null); // AQUI!!

  const productsPerPage = 12;
  const total = cart
    .reduce((acc, item) => acc + item.product.price * item.quantity, 0)
    .toFixed(2);

  const categories = Array.from(new Set(products.map((p) => p.categoryName)));
  const subcategories = (category: string) =>
    Array.from(
      new Set(
        products
          .filter((p) => p.categoryName === category && p.subcategoryName)
          .map((p) => p.subcategoryName!),
      ),
    );
  useEffect(() => {
    setLoading(true);
    axios
      .get<Product[]>(`${API_URL}/products/list?page=1&pageSize=200`)
      .then((res) => {
        setProducts(res.data || []);
      })
      .catch((err) => {
        console.error("Erro ao buscar produtos:", err);
      })
      .then(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedStore) {
      setLoading(true);
      axios
        .get<Product[]>(
          `${API_URL}/products/list?store=${selectedStore}&page=1&pageSize=200`,
        )
        .then((res) => {
          setProducts(res.data || []);
        })
        .catch((err) => {
          console.error("Erro ao buscar produtos da unidade:", err);
        })
        .then(() => {
          setLoading(false);
        });
    }
  }, [selectedStore]);

  const filtered = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory
      ? p.categoryName === selectedCategory
      : true;
    const matchesSubcategory = selectedSubcategory
      ? p.subcategoryName === selectedSubcategory
      : true;
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const totalPages = Math.ceil(filtered.length / productsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * productsPerPage,
    currentPage * productsPerPage,
  );

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...prev, { product, quantity }];
    });
    setSelectedProduct(null);
    setQuantityToAdd(1);
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== id));
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === id
            ? { ...item, quantity: Math.max(1, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const openCheckout = () => {
    if (cart.length === 0) {
      alert("Seu carrinho está vazio!");
      return;
    }
    setShowCheckout(true);
  };

  const confirmOrder = () => {
    if (
      !customerName.trim() ||
      (deliveryType === "entregar" && !address.trim())
    ) {
      alert("Por favor, preencha todas as informações obrigatórias.");
      return;
    }
    setShowCheckout(false);
    setShowPayment(true);
  };

  const finalizeOrder = async () => {
    try {
      await axios.post(`${API_URL}/orders`, {
        customerName,
        address,
        deliveryType,
        store: selectedStore, // salvar também a loja escolhida
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
        })),
        total: parseFloat(total),
      });
      setCart([]);
      setShowPayment(false);
      setShowConfirmation(true);
      setCustomerName("");
      setAddress("");
      setDeliveryType("retirar");
    } catch (err) {
      alert("Erro ao enviar pedido.");
    }
  };

  return (
    <div className="relative min-h-screen bg-white font-sans text-gray-800">
      <div className="fixed left-4 top-20 z-50">
        <button
          onClick={() => setSelectedStore(null)}
          className="rounded-full bg-blue-500 px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-600"
        >
          🔙 Voltar para Unidades
        </button>
      </div>

      {/* Cabeçalho */}
      <div className="fixed left-0 right-0 top-0 z-50 bg-white shadow-md">
        <h1 className="py-2 text-center text-2xl font-bold text-red-600">
          🍦 Eskimó
        </h1>

        {/* Nome da unidade selecionada */}
        {selectedStore && (
          <h2 className="pb-2 text-center text-sm font-semibold text-gray-700">
            🏠 Unidade: {selectedStore}
          </h2>
        )}
        {/* Mensagem de Escolha (só aparece antes de clicar) */}
        {showInstruction && (
          <div className="flex justify-center">
            <div className="mb-2 animate-pulse text-sm text-gray-900">
              👉 Escolha sua unidade para começar
            </div>
          </div>
        )}

        {/* Botões de Seleção de Unidade */}
        <div className="flex justify-center gap-4 py-2">
          {isStoreSelectorExpanded ? (
            <>
              <button
                onClick={() => {
                  setSelectedStore("Efapi");
                  setShowInstruction(false);
                  setIsStoreSelectorExpanded(false);
                }}
                className="w-38 rounded-md border border-yellow-700 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-100"
              >
                🍦 Efapi
              </button>

              <button
                onClick={() => {
                  setSelectedStore("Palmital");
                  setShowInstruction(false);
                  setIsStoreSelectorExpanded(false);
                }}
                className="w-38 rounded-md border border-yellow-700 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-100"
              >
                🍦 Palmital
              </button>

              <button
                onClick={() => {
                  setSelectedStore("Passo dos Fortes");
                  setShowInstruction(false);
                  setIsStoreSelectorExpanded(false);
                }}
                className="w-38 rounded-md border border-yellow-700 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-100"
              >
                🍦 Passo dos Fortes
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsStoreSelectorExpanded(true)}
              className="rounded-full bg-yellow-500 px-6 py-1 text-xs text-gray-100 shadow transition-all duration-300 hover:bg-gray-400"
            >
              🏪 Trocar Unidade
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 px-4 pb-3">
          <input
            type="text"
            placeholder="Buscar produto..."
            className="w-full max-w-md rounded border px-4 py-2 shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="w-full max-w-md rounded border px-4 py-2 shadow-sm"
            value={selectedCategory || ""}
            onChange={(e) => {
              setSelectedCategory(e.target.value || null);
              setSelectedSubcategory(null);
              setShowSubcategories(true);
              setCurrentPage(1);
            }}
          >
            <option value="">Menu de Sabores</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {selectedCategory &&
            showSubcategories &&
            subcategories(selectedCategory).length > 0 && (
              <select
                className="w-full max-w-md rounded border px-4 py-2 shadow-sm"
                value={selectedSubcategory || ""}
                onChange={(e) => {
                  setSelectedSubcategory(e.target.value || null);
                  setCurrentPage(1);
                }}
              >
                <option value="">Escolha seu tipo</option>
                {subcategories(selectedCategory).map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            )}
          <div className="text-xs text-gray-500">
            {filtered.length} produto(s) encontrado(s)
          </div>
        </div>
      </div>

      <div className="h-[300px]" />

      {/* Produtos */}
      <div className="grid grid-cols-2 gap-6 px-6 pb-40 sm:grid-cols-3 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="h-64 w-full animate-pulse rounded-xl bg-gray-100"
              ></div>
            ))
          : paginated.map((product) => (
              <div
                key={product.id}
                className="flex flex-col items-center transition-all duration-300 hover:scale-105
          sm:rounded-xl sm:bg-white sm:p-4 sm:shadow"
              >
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="mb-2 h-48 w-full cursor-pointer object-contain"
                  onClick={() => setSelectedProduct(product)}
                />
                <h3 className="text-center text-sm font-semibold text-gray-800">
                  {product.name}
                </h3>
                <button
                  onClick={() => setSelectedProduct(product)}
                  className="mt-2 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-600 hover:shadow"
                >
                  Ver Mais
                </button>
              </div>
            ))}
      </div>

      {/* Paginação */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white py-2 shadow-inner">
        <div className="mx-auto flex max-w-[360px] items-center justify-center gap-1 overflow-x-auto px-4">
          {/* Botão Anterior */}
          {currentPage > 1 && (
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-600 transition hover:bg-gray-200"
            >
              ‹
            </button>
          )}

          {/* Primeira página */}
          {currentPage > 3 && (
            <>
              <button
                onClick={() => setCurrentPage(1)}
                className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-600 transition hover:bg-gray-200"
              >
                1
              </button>
              <span className="px-1 text-gray-400">...</span>
            </>
          )}

          {/* Páginas principais */}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              if (currentPage <= 3) return page <= 5;
              if (currentPage >= totalPages - 2) return page >= totalPages - 4;
              return Math.abs(page - currentPage) <= 2;
            })
            .map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 rounded border text-sm font-semibold transition-all ${
                  page === currentPage
                    ? "bg-red-600 text-white shadow"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {page}
              </button>
            ))}

          {/* Última página */}
          {currentPage < totalPages - 2 && (
            <>
              <span className="px-1 text-gray-400">...</span>
              <button
                onClick={() => setCurrentPage(totalPages)}
                className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-600 transition hover:bg-gray-200"
              >
                {totalPages}
              </button>
            </>
          )}

          {/* Botão Próximo */}
          {currentPage < totalPages && (
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-900 transition hover:bg-gray-200"
            >
              ›
            </button>
          )}
        </div>
      </div>

      {/* Botão Carrinho Quadrado Premium com Movimento */}
      <button
        onClick={() => setShowCart(!showCart)}
        className="animate-pulse-slow fixed bottom-20 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-yellow-500 p-3 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
      >
        <div className="text-3xl">🛒</div>
        <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-yellow-500 shadow-md">
          {cart.reduce((sum, item) => sum + item.quantity, 0)}
        </div>
      </button>

      {/* Modais */}
      {showCart && (
        <div className="fixed right-0 top-0 z-50 h-full w-80 bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-bold">Seu Carrinho</h2>
          <ul className="flex-1 space-y-4 overflow-y-auto">
            {cart.map((item) => (
              <li
                key={item.product.id}
                className="flex items-center justify-between"
              >
                <div>
                  <span>
                    {item.product.name} x{item.quantity}
                  </span>
                  <div>
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="text-red-500"
                    >
                      ➖
                    </button>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="text-green-600"
                    >
                      ➕
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => removeFromCart(item.product.id)}
                  className="text-red-600 hover:underline"
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t pt-4">
            <p className="mb-2 font-bold">Total: R$ {total}</p>
            <button
              onClick={openCheckout}
              className="mt-2 w-full rounded bg-red-300 py-2 text-gray-50 hover:bg-red-700"
            >
              Finalizar Compra
            </button>
            <button
              onClick={() => setShowCart(false)}
              className="mt-2 w-full rounded bg-gray-300 py-2 text-gray-700 hover:bg-gray-400"
            >
              Continuar Comprando
            </button>
          </div>
        </div>
      )}

      {/* Modal de Finalizar Pedido */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 backdrop-blur-sm transition-all duration-500">
          <div className="animate-zoom-fade relative w-full max-w-sm rounded-3xl bg-white/90 p-6 shadow-2xl">
            <button
              onClick={() => setShowCheckout(false)}
              className="absolute right-4 top-4 text-2xl text-gray-400 transition hover:text-red-500"
            >
              ✕
            </button>
            <h2 className="mb-4 text-center text-xl font-semibold text-gray-800">
              Finalizar Pedido
            </h2>
            <input
              type="text"
              placeholder="Seu nome completo"
              className="mb-3 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <select
              className="mb-3 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
            >
              <option value="retirar">Retirar na Loja</option>
              <option value="entregar">Entrega em Casa</option>
            </select>
            {deliveryType === "entregar" && (
              <input
                type="text"
                placeholder="Seu endereço completo"
                className="mb-6 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            )}
            <button
              onClick={confirmOrder}
              className="w-full rounded-full bg-red-500 py-2 font-semibold text-white transition hover:bg-red-600 active:scale-95"
            >
              Ir para Pagamento
            </button>
          </div>
        </div>
      )}

      {/* Modal de Pagamento via PIX */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 backdrop-blur-sm transition-all duration-500">
          <div className="animate-zoom-fade relative w-full max-w-sm rounded-3xl bg-white/90 p-6 text-center shadow-2xl">
            <h2 className="mb-4 text-xl font-semibold text-green-700">
              Pagamento via PIX
            </h2>
            <p className="mb-2 text-sm text-gray-600">
              Escaneie o QR Code ou copie a chave:
            </p>
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/6/6b/QR_code_example.png"
              alt="QR Code PIX"
              className="mx-auto mb-4 h-28 w-28 rounded-lg shadow"
            />
            <p className="mb-6 select-all font-mono text-xs text-gray-500">
              chavepix@email.com
            </p>
            <button
              onClick={finalizeOrder}
              className="mb-2 w-full rounded-full bg-green-500 py-2 font-semibold text-white transition hover:bg-green-600 active:scale-95"
            >
              Confirmar Pagamento
            </button>
            <button
              onClick={() => setShowPayment(false)}
              className="w-full rounded-full bg-gray-200 py-2 text-gray-600 transition hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal Confirmação */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
            <span className="mb-6 block text-5xl text-green-600">✔️</span>
            <h2 className="mb-4 text-2xl font-bold text-green-700">
              Pedido Confirmado!
            </h2>
            <button
              onClick={() => setShowConfirmation(false)}
              className="rounded-full bg-green-600 px-6 py-2 text-white hover:bg-green-700"
            >
              Voltar para Loja
            </button>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedProduct(null)}
              className="absolute right-3 top-3 text-xl text-red-600"
            >
              ✕
            </button>
            <img
              src={selectedProduct.imageUrl}
              alt={selectedProduct.name}
              className="mb-4 h-48 w-full object-contain"
            />
            <h2 className="mb-2 text-center text-lg font-bold">
              {selectedProduct.name}
            </h2>
            <p className="mb-4 text-center text-sm text-gray-600">
              {selectedProduct.description}
            </p>
            <div className="mb-4 flex items-center justify-center gap-4">
              <button
                onClick={() => setQuantityToAdd(quantityToAdd - 1)}
                className="text-2xl"
              >
                ➖
              </button>
              <span className="text-xl">{quantityToAdd}</span>
              <button
                onClick={() => setQuantityToAdd(quantityToAdd + 1)}
                className="text-2xl"
              >
                ➕
              </button>
            </div>
            <button
              onClick={() => addToCart(selectedProduct, quantityToAdd)}
              className="w-full rounded bg-red-600 py-2 text-white hover:bg-red-700"
            >
              Adicionar ao Carrinho
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
