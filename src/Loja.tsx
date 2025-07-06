// Loja.tsx
import { useEffect, useState } from "react";
import axios from "axios";
import LinhaProdutosAtalhos from "./LinhaProdutosAtalhos";
import { Link } from "react-router-dom";
// @ts-expect-error: JS component without types
import PenguinBlink from "./components/PenguinBlink";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  categoryName: string;
  subcategoryName?: string;
}
const API_URL = import.meta.env.VITE_API_URL;

export default function Loja() {
  const [orderId, setOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showInstruction, setShowInstruction] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>(
    [],
  );

  const [quickFilterCategory, setQuickFilterCategory] = useState<string | null>(
    null,
  );
  const [quickFilterSubcategory, setQuickFilterSubcategory] = useState<
    string | null
  >(null);
  const [animateButtons, setAnimateButtons] = useState(true);
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
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [quantityToAdd, setQuantityToAdd] = useState(1);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [clickedProductId, setClickedProductId] = useState<number | null>(null);
  const [deliveryRate, setDeliveryRate] = useState<number>(0);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);

  const productsPerPage = 12;
  const subtotal = cart.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0,
  );
  const total = subtotal + deliveryFee;

  const categories = Array.from(new Set(products.map((p) => p.categoryName)));
  const subcategories = (category: string) =>
    Array.from(
      new Set(
        products
          .filter((p) => p.categoryName === category && p.subcategoryName)
          .map((p) => p.subcategoryName!),
      ),
    );

  const storeLocations = [
    { name: "efapi", lat: -27.112815, lng: -52.670769 },
    { name: "palmital", lat: -27.1152884, lng: -52.6166752 },
    { name: "passo", lat: -27.077056, lng: -52.6122383 },
  ];

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
  // 1️⃣ Obtém localização e define unidade mais próxima
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;

          let closestStore = storeLocations[0];
          let closestDistance = getDistanceFromLatLonInKm(
            userLat,
            userLng,
            storeLocations[0].lat,
            storeLocations[0].lng,
          );

          for (let i = 1; i < storeLocations.length; i++) {
            const store = storeLocations[i];
            const distance = getDistanceFromLatLonInKm(
              userLat,
              userLng,
              store.lat,
              store.lng,
            );

            if (distance < closestDistance) {
              closestDistance = distance;
              closestStore = store;
            }
          }

          setSelectedStore(closestStore.name);
          setShowInstruction(false);
        },
        (error) => {
          console.log("Não foi possível obter a localização:", error);
          setShowInstruction(true);
          setIsStoreSelectorExpanded(true);
        },
      );
    }
  }, []);
  const tentarRecalcularEntrega = async () => {
    if (
      deliveryType === "entregar" &&
      deliveryRate > 0 &&
      navigator.geolocation &&
      selectedStore
    ) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject),
        );

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const loja = storeLocations.find((s) => s.name === selectedStore);
        if (!loja) return;

        const distancia = getDistanceFromLatLonInKm(
          userLat,
          userLng,
          loja.lat,
          loja.lng,
        );
        const taxa = distancia * deliveryRate;
        setDeliveryFee(parseFloat(taxa.toFixed(2)));
      } catch (error) {
        console.error("❌ Falha ao obter localização:", error);
      }
    }
  };

  // ✅ Cálculo consolidado da taxa de entrega com segurança e sincronia
  useEffect(() => {
    const calcularTaxa = async () => {
      if (
        deliveryRate > 0 &&
        navigator.geolocation &&
        selectedStore &&
        storeLocations.length > 0
      ) {
        try {
          const pos = await new Promise<GeolocationPosition>(
            (resolve, reject) =>
              navigator.geolocation.getCurrentPosition(resolve, reject),
          );

          const userLat = pos.coords.latitude;
          const userLng = pos.coords.longitude;
          const loja = storeLocations.find((s) => s.name === selectedStore);
          if (!loja) return;

          const distancia = getDistanceFromLatLonInKm(
            userLat,
            userLng,
            loja.lat,
            loja.lng,
          );
          const taxa = distancia * deliveryRate;
          setDeliveryFee(parseFloat(taxa.toFixed(2)));
        } catch (error) {
          console.error("Erro ao calcular taxa de entrega:", error);
        }
      }
    };

    calcularTaxa();
  }, [deliveryRate, selectedStore]);

  useEffect(() => {
    axios
      .get<{ deliveryRate: number }>(`${API_URL}/settings`)
      .then((res) => {
        const rate = res.data?.deliveryRate ?? 0;
        setDeliveryRate(rate);
        //setDeliveryFee(0); // 👈 FORÇA TAXA ZERADA PRA TESTAR
      })
      .catch((err) => {
        console.error("Erro ao buscar deliveryRate:", err);
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
          if (Array.isArray(res.data)) {
            setProducts(res.data);
          } else {
            console.warn("Resposta inesperada da API:", res.data);
            setProducts([]);
          }
        })
        .catch((err) => {
          console.error("Erro ao buscar produtos:", err);
          setLoading(false); // ✅ também aqui
        });
    }
  }, [selectedStore]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let valor = e.target.value.replace(/\D/g, "");
    if (!valor.startsWith("55")) {
      valor = "55" + valor;
    }
    if (valor.length <= 13) {
      setPhoneNumber(valor);
    }
  };

  useEffect(() => {
    if (products.length > 0) {
      const categoriasSubcategorias: Record<string, Set<string>> = {};

      products.forEach((product) => {
        const categoria = product.categoryName || "Sem Categoria";
        const subcategoria = product.subcategoryName || "Sem Subcategoria";

        if (!categoriasSubcategorias[categoria]) {
          categoriasSubcategorias[categoria] = new Set();
        }
        categoriasSubcategorias[categoria].add(subcategoria);
      });

      console.log("📝 Categorias e Subcategorias:");
      Object.keys(categoriasSubcategorias).forEach((categoria) => {
        console.log(`Categoria: ${categoria}`);
        categoriasSubcategorias[categoria].forEach((sub) => {
          console.log(`  - Subcategoria: ${sub}`);
        });
      });
    }
  }, [products]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimateButtons(false);
    }, 2000); // 2 segundos = duração da animação

    return () => clearTimeout(timer);
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
    const matchesCategory = quickFilterCategory
      ? p.categoryName === quickFilterCategory
      : selectedCategory
        ? p.categoryName === selectedCategory
        : true;
    const matchesSubcategory = quickFilterSubcategory
      ? p.subcategoryName === quickFilterSubcategory
      : selectedSubcategory
        ? p.subcategoryName === selectedSubcategory
        : true;
    return matchesSearch && matchesCategory && matchesSubcategory;
  });

  const totalPages = Math.ceil(filtered.length / productsPerPage);

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
      const payload = {
        customerName,
        address,
        street,
        number,
        complement,
        deliveryType,
        store: selectedStore,
        items: cart.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          price: item.product.price,
          quantity: item.quantity,
          imageUrl: item.product.imageUrl,
        })),
        total: total,
        deliveryFee,
        phoneNumber,
      };

      console.log("📝 Payload do pedido:", payload); // 👈 LOG AQUI

      const response = await axios.post<{ id: number; message: string }>(
        `${API_URL}/orders`,
        payload,
      );

      console.log("📦 Resposta da API:", response.data);

      const { id } = response.data;

      if (typeof id === "number" && !isNaN(id)) {
        setOrderId(id);
        console.log("✅ ID do pedido salvo:", id);
      } else {
        alert("Erro: número do pedido não foi retornado corretamente.");
        console.error("❌ ID inválido:", id);
        return;
      }

      setCart([]);
      setShowPayment(false);
      setShowConfirmation(true);
      setCustomerName("");
      setAddress("");
      setDeliveryType("retirar");
    } catch (err) {
      console.error("❌ Erro ao enviar pedido:", err);
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
      {/* carrocel de produtos na pasta LinhaProdutosAtalhos.tsx */}
      <div className="h-[280px]" />
      <LinhaProdutosAtalhos
        onSelectCategorySubcategory={(category, subcategory) => {
          setQuickFilterCategory(category);
          setQuickFilterSubcategory(subcategory || null);
          setSearch(""); // <-- limpar a busca!!
          setCurrentPage(1);
        }}
      />

      {/* Cabeçalho */}
      <div
        className="fixed left-0 right-0 top-0 z-50 bg-gradient-to-b from-white/0 via-white/10 to-white bg-cover bg-center bg-no-repeat shadow-md"
        style={{
          backgroundImage:
            "url('https://i.pinimg.com/736x/81/6f/70/816f70cc68d9b3b3a82e9f58e912f9ef.jpg')",
        }}
      >
        {/* Área da logo */}
        <div className="flex items-center justify-center py-2">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/9/96/Logo_eskim%C3%B3_Sorvetes_Vermelha.png"
            alt="Eskimo Logo"
            className="h-10 w-auto object-contain"
          />
        </div>

        {/* Nome da unidade selecionada */}
        {selectedStore && (
          <div className="flex justify-center py-1">
            <div className="text-sm font-semibold text-gray-700">
              🏠 {selectedStore}
            </div>
          </div>
        )}

        {/* Mensagem de Escolha (só aparece antes de clicar) */}
        {showInstruction && (
          <div className="flex justify-center">
            <div className="mb-3 animate-pulse text-sm text-gray-900">
              👉 Escolha sua unidade para começar
            </div>
          </div>
        )}
        {/* Botões de Seleção de Unidade */}
        <div className="relative z-50 flex justify-center gap-4 py-2">
          {isStoreSelectorExpanded ? (
            <>
              <button
                onClick={() => {
                  setSelectedStore("efapi");
                  setShowInstruction(false);
                  setIsStoreSelectorExpanded(false);
                }}
                className={`${animateButtons ? "energy-animate" : ""} w-38 rounded-md border px-4 py-2 text-sm shadow-sm transition-all duration-300 ${
                  selectedStore === "efapi"
                    ? "border-yellow-700 bg-yellow-300 text-gray-800"
                    : "border-yellow-700 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                🍦 Efapi
              </button>

              <button
                onClick={() => {
                  setSelectedStore("palmital");
                  setShowInstruction(false);
                  setIsStoreSelectorExpanded(false);
                }}
                className={`${animateButtons ? "energy-animate" : ""} w-38 rounded-md border px-4 py-2 text-sm shadow-sm transition-all duration-300 ${
                  selectedStore === "palmital"
                    ? "border-yellow-700 bg-yellow-300 text-gray-800"
                    : "border-yellow-700 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                🍦 Palmital
              </button>

              <button
                onClick={() => {
                  setSelectedStore("passo");
                  setShowInstruction(false);
                  setIsStoreSelectorExpanded(false);
                }}
                className={`${animateButtons ? "energy-animate" : ""} w-38 rounded-md border px-4 py-2 text-sm shadow-sm transition-all duration-300 ${
                  selectedStore === "passo"
                    ? "border-yellow-700 bg-yellow-300 text-gray-800"
                    : "border-yellow-700 bg-white text-gray-700 hover:bg-gray-100"
                }`}
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
              setQuickFilterCategory(null); // 🔥 limpa o atalho
              setQuickFilterSubcategory(null); // 🔥 limpa o atalho
              setSelectedCategory(e.target.value || null);
              setSelectedSubcategory(null);
              setShowSubcategories(true);
              setSearch(""); // <-- limpar a busca!!
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
                  setQuickFilterCategory(null); // 🔥 limpa o atalho
                  setQuickFilterSubcategory(null); // 🔥 limpa o atalho
                  setSelectedSubcategory(e.target.value || null);
                  setSearch(""); // <-- limpar a busca!!
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

      {/* Produtos organizados por Categoria/Subcategoria */}
      <div className="px-6 pb-40">
        {loading ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="h-64 w-full animate-pulse rounded-xl bg-gray-100"
              ></div>
            ))}
          </div>
        ) : (
          (() => {
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

            const produtosOrdenados = [...filtered].sort((a, b) => {
              const catA =
                ordemCategorias.indexOf(a.categoryName) !== -1
                  ? ordemCategorias.indexOf(a.categoryName)
                  : 999;
              const catB =
                ordemCategorias.indexOf(b.categoryName) !== -1
                  ? ordemCategorias.indexOf(b.categoryName)
                  : 999;

              if (catA !== catB) return catA - catB;

              const subcatA =
                typeof a.categoryName === "string" &&
                typeof a.subcategoryName === "string" &&
                ordemSubcategorias[
                  a.categoryName as keyof typeof ordemSubcategorias
                ]
                  ? ordemSubcategorias[
                      a.categoryName as keyof typeof ordemSubcategorias
                    ].indexOf(a.subcategoryName)
                  : 999;

              const subcatB =
                typeof b.categoryName === "string" &&
                typeof b.subcategoryName === "string" &&
                ordemSubcategorias[
                  b.categoryName as keyof typeof ordemSubcategorias
                ]
                  ? ordemSubcategorias[
                      b.categoryName as keyof typeof ordemSubcategorias
                    ].indexOf(b.subcategoryName)
                  : 999;

              if (subcatA !== subcatB) return subcatA - subcatB;

              return a.name.localeCompare(b.name);
            });

            // Paginação: 12 produtos por página
            const inicio = (currentPage - 1) * productsPerPage;
            const fim = inicio + productsPerPage;
            const paginados = produtosOrdenados.slice(inicio, fim);

            return (
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                {paginados.map((product) => (
                  <div
                    key={product.id}
                    className={`flex flex-col items-center transition-all duration-300 sm:rounded-xl sm:bg-white sm:p-4 sm:shadow ${
                      clickedProductId === product.id
                        ? "scale-110"
                        : "hover:scale-105"
                    }`}
                  >
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="mb-2 h-48 w-full cursor-pointer object-contain"
                      onClick={() => setSelectedProduct(product)}
                    />
                    <h3
                      className="cursor-pointer text-center text-sm font-semibold text-gray-800 transition-all duration-300 hover:text-red-600"
                      onClick={() => {
                        if (clickedProductId === product.id) {
                          setSelectedProduct(product);
                          setClickedProductId(null);
                        } else {
                          setClickedProductId(product.id);
                        }
                      }}
                    >
                      {product.name}
                    </h3>
                    {/* PREÇO embaixo do nome */}
                    <p className="text-black-900 mt-1 text-center text-xs font-bold">
                      R$ {product.price.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>

      {/* Paginação */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white py-2 shadow-inner">
        <div className="mx-auto flex max-w-[360px] items-center justify-center gap-1 overflow-x-auto px-4">
          {/* Botão Anterior */}
          {currentPage > 1 && (
            <button
              onClick={() => {
                setCurrentPage(currentPage - 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-600 transition hover:bg-gray-200"
            >
              ‹
            </button>
          )}

          {/* Primeira página */}
          {currentPage > 3 && (
            <>
              <button
                onClick={() => {
                  setCurrentPage(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
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
                onClick={() => {
                  setCurrentPage(page);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
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
                onClick={() => {
                  setCurrentPage(totalPages);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-600 transition hover:bg-gray-200"
              >
                {totalPages}
              </button>
            </>
          )}

          {/* Botão Próximo */}
          {currentPage < totalPages && (
            <button
              onClick={() => {
                setCurrentPage(currentPage + 1);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="h-8 w-8 rounded border bg-gray-100 text-sm text-gray-900 transition hover:bg-gray-200"
            >
              ›
            </button>
          )}
        </div>
      </div>
      {/* Botão "Meus Pedidos" */}
      <Link
        onClick={() => setShowCart(!showCart)}
        to="/meus-pedidos"
        className="fixed bottom-48 right-6 z-50 flex flex-col items-center justify-center rounded-2xl bg-blue-500 p-2 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
      >
        <div className="text-3xl">📜</div>
        <div className="mt-1 text-xs font-bold">Meu</div>
        <div className="mt-1 text-xs font-bold">Pedido</div>
      </Link>

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

      {/* Botão de Total Gasto */}
      {cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0) >
        0 && (
        <button className="animate-pulse-slow fixed bottom-96 left-1 z-0 flex flex-col items-center justify-center rounded-xl bg-green-700 px-4 py-2 text-white shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95">
          <div className="mt-0 flex h-4 w-16 items-center justify-center rounded bg-white text-sm font-bold text-green-700 shadow-md">
            R$
            {cart
              .reduce(
                (acc, item) => acc + item.product.price * item.quantity,
                0,
              )
              .toFixed(2)}
          </div>
        </button>
      )}

      {/* Modais */}
      {showCart && (
        <div className="fixed right-0 top-0 z-50 h-full w-80 bg-white p-6 shadow-lg">
          <h2 className="mb-4 text-xl font-bold">meu Carrinho</h2>
          {/* 🐧 Pinguim piscando */}
          <PenguinBlink />
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
            {/* Exibe Subtotal, Frete e Total */}
            {(() => {
              const subtotal = cart.reduce(
                (sum, item) => sum + item.product.price * item.quantity,
                0,
              );
              const totalWithDelivery = subtotal + deliveryFee;
              return (
                <div className="mb-4 space-y-1 text-left text-sm text-gray-800">
                  <p>
                    🧁 Produtos: <strong>R$ {subtotal.toFixed(2)}</strong>
                  </p>
                  <p>
                    🚚 Entrega aproximada:{" "}
                    <strong>R$ {deliveryFee.toFixed(2)}</strong>
                  </p>
                  <p className="text-base font-bold text-green-700">
                    💰 Total: R$ {totalWithDelivery.toFixed(2)}
                  </p>
                </div>
              );
            })()}

            <button
              onClick={openCheckout}
              className="mt-2 w-full rounded bg-red-500 py-2 text-gray-50 hover:bg-red-700"
            >
              Finalizar Compra
            </button>
            <button
              onClick={() => setShowCart(false)}
              className="mt-2 w-full rounded bg-gray-100 py-2 text-gray-700 hover:bg-gray-300"
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
            {deliveryType === "entregar" && (
              <p className="mt-2 text-sm text-gray-700">
                🚚 Entrega: R$ {deliveryFee.toFixed(2)}
              </p>
            )}

            {/* Nome */}
            <input
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

            {/* Campos para entrega */}
            {deliveryType === "entregar" && (
              <div className="flex flex-col gap-3">
                <select
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition focus:border-red-400 focus:ring focus:ring-red-200"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                >
                  <option value="Alvorada">Alvorada</option>
                  <option value="Bela Vista">Bela Vista</option>
                  <option value="Belvedere">Belvedere</option>
                  <option value="Centro">Centro</option>
                  <option value="Colônia Cella">Colônia Cella</option>
                  <option value="Cristo Rei">Cristo Rei</option>
                  <option value="Dom Gerônimo">Dom Gerônimo</option>
                  <option value="Efapi">Efapi</option>
                  <option value="Eldorado">Eldorado</option>
                  <option value="Engenho Braun">Engenho Braun</option>
                  <option value="Esplanada">Esplanada</option>
                  <option value="Jardim América">Jardim América</option>
                  <option value="Jardim do Lago">Jardim do Lago</option>
                  <option value="Jardim Europa">Jardim Europa</option>
                  <option value="Jardim Itália">Jardim Itália</option>
                  <option value="Jardim Paraíso">Jardim Paraíso</option>
                  <option value="Jardim Peperi">Jardim Peperi</option>
                  <option value="Líder">Líder</option>
                  <option value="Maria Goretti">Maria Goretti</option>
                  <option value="Monte Castelo">Monte Castelo</option>
                  <option value="Palmital">Palmital</option>
                  <option value="Parque das Palmeiras">
                    Parque das Palmeiras
                  </option>
                  <option value="Paraíso">Paraíso</option>
                  <option value="Passo dos Fortes">Passo dos Fortes</option>
                  <option value="Presidente Médici">Presidente Médici</option>
                  <option value="Quedas do Palmital">Quedas do Palmital</option>
                  <option value="Residencial Viena">Residencial Viena</option>
                  <option value="Saic">Saic</option>
                  <option value="Santa Maria">Santa Maria</option>
                  <option value="Santa Paulina">Santa Paulina</option>
                  <option value="Santa Terezinha">Santa Terezinha</option>
                  <option value="Santo Antônio">Santo Antônio</option>
                  <option value="São Carlos">São Carlos</option>
                  <option value="São Cristóvão">São Cristóvão</option>
                  <option value="São Lucas">São Lucas</option>
                  <option value="São Pedro">São Pedro</option>
                  <option value="Seminário">Seminário</option>
                  <option value="Trevo">Trevo</option>
                  <option value="Universitário">Universitário</option>
                  <option value="Vila Real">Vila Real</option>
                </select>

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

                {/* Mensagem indicativa abaixo do campo */}
                <p className="mt-1 text-xs text-gray-600">
                  ⚠️ Este número será usado para você consultar seu pedido
                  depois.
                </p>
              </div>
            )}

            {/* Botão confirmar */}
            <button
              onClick={async () => {
                if (deliveryType === "entregar" && deliveryFee === 0) {
                  await tentarRecalcularEntrega();
                  return;
                }
                confirmOrder();
              }}
              disabled={deliveryType === "entregar" && deliveryFee === 0}
              className={`mt-6 w-full rounded-full py-2 font-semibold transition ${
                deliveryType === "entregar" && deliveryFee === 0
                  ? "cursor-not-allowed bg-gray-300 text-gray-500"
                  : "bg-red-500 text-white hover:bg-red-600 active:scale-95"
              }`}
            >
              Ir para Pagamento
            </button>

            {/* Aviso sobre GPS obrigatório + botão de tentar de novo */}
            {deliveryType === "entregar" && deliveryFee === 0 && (
              <>
                <p className="mt-2 text-center text-sm text-red-600">
                  ⚠️ Ative sua localização para calcular a taxa de entrega.
                </p>
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={tentarRecalcularEntrega}
                    className="animate-pulse-slow rounded-full bg-yellow-500 px-4 py-1 text-sm text-white shadow hover:bg-yellow-600 active:scale-95"
                  >
                    🔄 Tentar Localizar de Novo
                  </button>
                </div>
              </>
            )}
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

            <div className="mb-4 space-y-1 text-left text-sm text-gray-800">
              <p>
                🧁 Subtotal: <strong>R$ {subtotal.toFixed(2)}</strong>
              </p>
              <p>
                🚚 Entrega: <strong>R$ {deliveryFee.toFixed(2)}</strong>
              </p>
              <p className="text-base font-bold text-green-700">
                💰 Total: R$ {total.toFixed(2)}
              </p>
            </div>

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

            {orderId !== null && (
              <>
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
                  Você poderá acompanhar o status do seu pedido clicando no
                  botão <strong>“Meu Pedido”</strong> no canto inferior direito
                  da tela.
                </p>
              </>
            )}

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
            <h2 className="mb-1 text-center text-lg font-bold text-gray-800">
              {selectedProduct.name}
            </h2>

            {/* PREÇO AQUI */}
            <p className="mb-3 text-center text-base font-bold text-green-700">
              R$ {selectedProduct.price.toFixed(2)}
            </p>

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
              className="w-full rounded bg-red-600 py-2 text-white hover:bg-red-500"
            >
              Adicionar ao Carrinho
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
