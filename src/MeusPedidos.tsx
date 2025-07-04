import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL;

interface OrderAPIResponse {
  id: number;
  store: string;
  status: string;
  total: number;
  name?: string;
  customerName?: string;
  phoneNumber: string;
}

interface Order {
  id: number;
  store: string;
  status: string;
  total: number;
  name: string;
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
      .get<OrderAPIResponse[]>(`${API_URL}/orders`)
      .then((res) => {
        const encontrado = res.data.find((p) => p.id === Number(orderId));
        if (encontrado) {
          const orderFormatado: Order = {
            id: encontrado.id,
            store: encontrado.store,
            status: encontrado.status,
            total: encontrado.total,
            phoneNumber: encontrado.phoneNumber,
            name: encontrado.name || encontrado.customerName || "Cliente",
          };
          setOrder(orderFormatado);
        } else {
          setError("Pedido não encontrado.");
        }
      })
      .catch(() => {
        setError("Erro ao buscar pedidos.");
      })
      .then(() => {
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
    <div className="min-h-screen w-full bg-white font-sans text-gray-800">
      <header className="w-full bg-gradient-to-r from-blue-800 to-indigo-700 py-8 shadow-2xl">
        <div className="flex flex-col items-center justify-center">
          <motion.img
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            src="https://upload.wikimedia.org/wikipedia/commons/9/96/Logo_eskim%C3%B3_Sorvetes_Vermelha.png"
            alt="Eskimo Logo"
            className="h-16 w-auto object-contain drop-shadow-2xl"
          />
          <motion.h1
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="mt-4 text-center text-4xl font-extrabold tracking-widest text-gray-50 drop-shadow-lg"
          >
            🧾 Meus Pedidos
          </motion.h1>
        </div>
      </header>

      <div className="flex w-full flex-col items-center justify-center px-6 py-4">
        <motion.a
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          href="/"
          className="mb-6 inline-block rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-8 py-3 text-base font-bold text-white shadow-lg transition hover:scale-105 hover:brightness-110 active:scale-95"
        >
          ⬅️ Voltar para Loja
        </motion.a>

        <div className="mb-12 flex flex-col items-center gap-5">
          <motion.input
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            type="number"
            placeholder="Digite o número do seu pedido"
            className="w-full rounded-xl border border-gray-300 bg-white px-5 py-4 text-lg text-gray-800 placeholder-gray-400 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={buscarPedidoPorId}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 text-lg font-bold text-white shadow-xl"
          >
            🔍 Buscar Pedido
          </motion.button>
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm font-semibold text-red-500"
            >
              {error}
            </motion.p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="h-12 w-12 rounded-full border-4 border-indigo-400 border-t-transparent"
            ></motion.div>
          </div>
        ) : order ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl bg-gray-50 p-8 shadow-2xl hover:shadow-indigo-500/50"
          >
            <div className="mb-4 text-2xl font-extrabold text-indigo-800">
              📦 Pedido #{order.id}
            </div>
            <div className="mb-2 text-lg">
              <strong>Cliente:</strong> {order.name}
            </div>
            <div className="mb-2 text-lg">
              <strong>Unidade:</strong> {order.store}
            </div>
            <div className="mb-4 text-lg">
              <strong>Status:</strong>{" "}
              {order.status === "pendente" ? (
                <span className="text-yellow-500">🕐 Em processo</span>
              ) : order.status === "pago" ? (
                <span className="text-green-600">✅ Confirmado</span>
              ) : (
                <span className="text-gray-500">{order.status}</span>
              )}
            </div>

            <div className="flex flex-col items-end gap-4">
              <div className="text-xl font-bold text-indigo-600">
                Total: R$ {order.total.toFixed(2)}
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={buscarPedidoPorId}
                className="rounded-full bg-yellow-400 px-6 py-2 text-sm font-semibold text-gray-900 shadow-md"
              >
                🔄 Atualizar Status
              </motion.button>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={copiarPedidoParaAreaTransferencia}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-3 text-base font-bold text-white shadow-lg"
            >
              📋 Copiar Número do Pedido
            </motion.button>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
