import { useState } from "react";
import axios from "axios";

const API_URL = "https://backend-eskimo.onrender.com/api";

interface Order {
  id: number;
  store: string;
  status: string;
  total: number;
  name: string; // <- será retornado como alias de CustomerName
  phoneNumber: string;
}

export default function MeusPedidos(): JSX.Element {
  const [orderId, setOrderId] = useState<string>("");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const buscarPedidoPorId = () => {
    if (!orderId) {
      alert("Digite o número do pedido!");
      return;
    }

    setLoading(true);
    setError("");
    setOrder(null);

    axios
      .get<Order[]>(`${API_URL}/orders`)
      .then((res) => {
        const encontrado = res.data.find((p) => p.id === Number(orderId));
        if (encontrado) {
          setOrder(encontrado);
        } else {
          setError("Pedido não encontrado.");
        }
      })
      .catch(() => {
        setError("Erro ao buscar pedidos.");
      })
      .then(() => {
        // ✅ Coloque o `setLoading(false)` aqui em vez de `.finally`
        setLoading(false);
      });
  };

  const copiarPedidoParaAreaTransferencia = () => {
    if (order) {
      navigator.clipboard.writeText(order.id.toString());
      alert(`Número do pedido #${order.id} copiado!`);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white text-gray-800">
      <header className="w-full bg-blue-600 py-4 shadow-md">
        <div className="flex items-center justify-center py-2">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/9/96/Logo_eskim%C3%B3_Sorvetes_Vermelha.png"
            alt="Eskimo Logo"
            className="h-10 w-auto object-contain"
          />
        </div>
        <h1 className="text-center text-2xl font-bold text-white">
          🧾 Consultar Pedido por Número
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

        <div className="mb-10 flex flex-col items-center gap-2">
          <input
            type="number"
            placeholder="Digite o número do seu pedido"
            className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-3 text-base shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <button
            onClick={buscarPedidoPorId}
            className="w-full max-w-md rounded-lg bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-lg transition hover:bg-blue-700"
          >
            🔍 Buscar Pedido
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {loading ? (
          <div className="flex justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        ) : order ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-md transition hover:shadow-lg">
            <div className="mb-2 text-lg font-bold text-gray-800">
              📦 Pedido #{order.id}
            </div>
            <div className="mb-1 text-sm text-gray-600">
              <strong>Cliente:</strong> {order.name}
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
            <div className="mt-4 flex flex-col items-end gap-2">
              <div className="text-lg font-bold text-blue-700">
                Total: R$ {order.total.toFixed(2)}
              </div>
              <button
                onClick={buscarPedidoPorId}
                className="rounded-full bg-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-yellow-600"
              >
                🔄 Atualizar Status
              </button>
            </div>

            <button
              onClick={copiarPedidoParaAreaTransferencia}
              className="mt-4 rounded-full bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
            >
              📋 Copiar Número do Pedido
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
