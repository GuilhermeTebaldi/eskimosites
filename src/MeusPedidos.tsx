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

  const buscarPedidos = (): void => {
    if (!phone) {
      alert("Digite seu número de WhatsApp com DDD!");
      return;
    }

    setLoading(true);

    axios
      .get<Order[]>(`${API_URL}/orders`)
      .then((res) => {
        const pedidos = res.data.filter((p: Order) => p.phoneNumber === phone);
        setOrders(pedidos);
        setLoading(false); // 👈 movido para dentro do .then
      })
      .catch(() => {
        alert("Erro ao buscar pedidos.");
        setLoading(false); // 👈 movido para dentro do .catch
      });
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-center text-2xl font-bold text-red-600">
        📦 Consultar Meus Pedidos
      </h1>

      <div className="mb-6 flex flex-col items-center gap-3">
        <input
          type="tel"
          placeholder="Digite seu WhatsApp com DDD"
          className="w-full max-w-md rounded border border-gray-300 px-4 py-2 text-sm shadow"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          onClick={buscarPedidos}
          className="rounded bg-red-600 px-6 py-2 font-bold text-white hover:bg-red-700"
        >
          Buscar Meus Pedidos
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-600">🔄 Carregando...</p>
      ) : orders.length === 0 ? (
        <p className="text-center text-gray-500">Nenhum pedido encontrado.</p>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border p-4 shadow hover:shadow-md"
            >
              <p className="text-sm font-bold text-gray-800">
                Pedido #{order.id}
              </p>
              <p className="text-sm text-gray-600">Unidade: {order.store}</p>
              <p className="text-sm">
                Status:{" "}
                {order.status === "pendente" ? (
                  <span className="text-yellow-600">🕐 Em processo</span>
                ) : order.status === "pago" ? (
                  <span className="text-green-600">✅ Confirmado</span>
                ) : (
                  <span className="text-gray-500">{order.status}</span>
                )}
              </p>
              <p className="mt-2 text-right font-bold text-red-700">
                Total: R$ {order.total.toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
