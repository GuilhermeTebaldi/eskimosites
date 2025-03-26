import { motion } from "framer-motion";
import {
  FaMagic,
  FaRegStar,
  FaRobot,
  FaInstagram,
  FaWhatsapp,
} from "react-icons/fa";

export default function Home() {
  return (
    <div className="relative font-sans text-white">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://i.pinimg.com/474x/45/0c/24/450c2404d2cbde52ef3c1d94653acaa4.jpg"
          alt="Background"
          className="h-full w-full object-cover opacity-100"
        />
      </div>

      <div className="z-80 relative bg-gradient-to-br from-[#0f0c29]/80 via-[#302b63]/80 to-[#24243e]/80">
        {/* HERO */}
        <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-40 text-center">
          <motion.div
            initial={{ opacity: 0, y: -90 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="z-10"
          >
            <h1 className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-5xl font-extrabold text-transparent md:text-6xl">
              LICE LIMPEZAS
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-xl text-gray-200">
              Limpeza que transcende o espaço. Casa, prédio ou futuro: nós
              revitalizamos ambientes.
            </p>
            <motion.button
              whileHover={{ scale: 1.1 }}
              className="mt-8 rounded-full bg-white px-8 py-3 font-bold text-gray-900 shadow-xl backdrop-blur-md hover:bg-blue-100"
            >
              Agendar Agora
            </motion.button>
          </motion.div>
          <div className="absolute -left-40 top-0 h-[500px] w-[500px] animate-pulse rounded-full bg-purple-600 opacity-30 blur-3xl"></div>
          <div className="absolute bottom-0 right-0 h-[300px] w-[300px] animate-pulse rounded-full bg-cyan-500 opacity-20 blur-2xl"></div>
        </section>

        {/* RESTANTE DO SITE */}
        {/* BENEFÍCIOS COM ESTILO GLASS */}
        <section className="px-6 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-3">
            {[
              {
                icon: <FaMagic className="text-4xl text-cyan-400" />,
                title: "Tecnologia de Higienização",
                desc: "Usamos soluções e processos inteligentes que elevam o padrão de limpeza.",
              },
              {
                icon: <FaRegStar className="text-4xl text-yellow-400" />,
                title: "Ambientes Restaurados",
                desc: "Sua casa ou prédio ganha nova vida com nosso toque profissional.",
              },
              {
                icon: <FaRobot className="text-4xl text-pink-400" />,
                title: "Serviço Automatizado",
                desc: "Controle total via app, agendamentos inteligentes e notificações em tempo real.",
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                whileInView={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.5 + i * 0.2 }}
                className="rounded-2xl bg-white/10 p-8 text-center shadow-xl backdrop-blur-md hover:shadow-2xl"
              >
                <div className="mb-4">{item.icon}</div>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-300">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* DEPOIMENTOS FUTURISTAS */}
        <section className="bg-black/20 px-6 py-20">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="mb-10 text-3xl font-bold md:text-4xl">
              Eles já experimentaram o novo padrão
            </h2>
            <div className="grid gap-8 md:grid-cols-2">
              {[
                {
                  name: "Cristiane",
                  quote:
                    "Nunca imaginei que limpeza pudesse ser tão tecnológica. Meu lar ficou com outra energia!",
                },
                {
                  name: "Guilherme",
                  quote:
                    "Contratei para o prédio todo. Atendimento com inteligência e resultado de outro nível.",
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  whileInView={{ opacity: 1, scale: 1 }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.6 + i * 0.2 }}
                  className="rounded-2xl bg-white/10 p-6 shadow-lg backdrop-blur-lg"
                >
                  <p className="italic text-gray-200">"{item.quote}"</p>
                  <p className="mt-4 font-semibold text-cyan-300">
                    – {item.name}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA FINAL IMPACTANTE */}
        <section className="bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-24 text-center text-white">
          <motion.h2
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7 }}
            className="mb-4 text-4xl font-bold"
          >
            Pronto para viver em um espaço revitalizado?
          </motion.h2>
          <p className="mb-8 text-lg">
            A LICE TEBALDIANA redefine limpeza com inteligência e estética.
          </p>
          <button className="rounded-full bg-white px-8 py-3 font-semibold text-gray-900 hover:bg-gray-100">
            Agende sua limpeza futurista
          </button>
        </section>

        {/* RODAPÉ NEON */}
        <footer className="border-t border-gray-800 bg-black py-6 text-center text-white">
          <div className="mb-4 flex justify-center gap-4">
            <a href="#" className="hover:text-cyan-400">
              <FaInstagram size={24} />
            </a>
            <a href="#" className="hover:text-green-400">
              <FaWhatsapp size={24} />
            </a>
          </div>
          <p className="text-sm text-gray-500">
            &copy; 2025 LICE TEBALDIANA – Powered by Inteligência e Estilo
          </p>
        </footer>
      </div>
    </div>
  );
}
