import { useState } from "react";
import axios from "axios";

const API_URL = "https://backend-eskimo.onrender.com/api";

interface Order {
  id: number;
  store: string;
  status: string;
  total: number;
  phoneNumber: string;
}

export default function MeusPedidos(): JSX.Element {
  const [phone, setPhone] = useState<string>("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const buscarPedidos = () => {
    if (!phone) {
      alert("Digite seu número de WhatsApp com DDD!");
      return;
    }

    setLoading(true);

    axios
      .get(`${API_URL}/orders`)
      .then((res) => {
        const data = res.data as Order[];
        const pedidos = data.filter((p) => p.phoneNumber === phone);
        setOrders(pedidos);
      })
      .catch(() => alert("Erro ao buscar pedidos."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="min-h-screen w-full bg-white text-gray-800">
      {/* Barra Superior */}
      {/* Área da logo */}
      <header className="w-full bg-blue-600 py-4 shadow-md">
        <div className="flex items-center justify-center py-2">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/9/96/Logo_eskim%C3%B3_Sorvetes_Vermelha.png"
            alt="Eskimo Logo"
            className="h-10 w-auto object-contain"
          />
        </div>
        <h1 className="text-center text-2xl font-bold text-white">
          🧾 Consultar Meus Pedidos
        </h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <a
            href="/"
            className="inline-block rounded-full border border-blue-500 bg-transparent px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 hover:shadow"
          >
            ⬅️ Voltar para Loja
          </a>
        </div>

        <div className="mb-10 flex flex-col items-center gap-4">
          <input
            type="tel"
            placeholder="Digite seu WhatsApp com DDD"
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            onClick={buscarPedidos}
            className="w-full max-w-md rounded-lg bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-lg transition hover:bg-blue-700"
          >
            🔍 Buscar Meus Pedidos
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : orders.length === 0 ? (
          <p className="text-center text-lg text-gray-500">
            Nenhum pedido encontrado.
          </p>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-md transition hover:shadow-lg"
              >
                <div className="mb-2 text-lg font-bold text-gray-800">
                  📦 Pedido #{order.id}
                </div>
                <div className="mb-1 text-sm text-gray-600">
                  <strong>Unidade:</strong> {order.store}
                </div>
                <div className="mb-1 text-sm">
                  <strong>Status:</strong>{" "}
                  {order.status === "pendente" ? (
                    <span className="text-yellow-600">🕐 Em processo</span>
                  ) : order.status === "pago" ? (
                    <span className="text-green-600">✅ Confirmado</span>
                  ) : (
                    <span className="text-gray-500">{order.status}</span>
                  )}
                </div>
                <div className="mt-4 text-right text-lg font-bold text-blue-700">
                  Total: R$ {order.total.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
