import { motion, AnimatePresence } from "framer-motion";
import { FaWhatsapp, FaInstagram, FaMapMarkerAlt } from "react-icons/fa";

const mainPhoto =
  "https://i.pinimg.com/736x/81/78/5c/81785c9f65298577426cd988b5cb7409.jpg";
const galleryPhotos = [
  {
    name: "Vestido Elegante",
    whatsapp: "https://wa.me/5511999999991",
    main: "https://i.pinimg.com/736x/66/69/43/6669439b27a25fc7508c96e94a70f7d6.jpg",
    thumbs: [
      "https://source.unsplash.com/random/800x1200?fashion,dress1-1",
      "https://source.unsplash.com/random/800x1200?fashion,dress1-2",
      "https://source.unsplash.com/random/800x1200?fashion,dress1-3",
    ],
  },
  {
    name: "Casaco Casual",
    whatsapp: "https://wa.me/5511999999992",
    main: "https://i.pinimg.com/736x/10/3e/3b/103e3b50cda0d63606dd73669b789b3b.jpg",
    thumbs: [
      "https://source.unsplash.com/random/800x1200?fashion,coat1-1",
      "https://source.unsplash.com/random/800x1200?fashion,coat1-2",
      "https://source.unsplash.com/random/800x1200?fashion,coat1-3",
    ],
  },
  {
    name: "Conjunto Esportivo",
    whatsapp: "https://wa.me/5511999999993",
    main: "https://i.pinimg.com/736x/42/ed/d5/42edd58fbfb4f2b3c30ea9360457bd96.jpg",
    thumbs: [
      "https://source.unsplash.com/random/800x1200?fashion,sport1-1",
      "https://source.unsplash.com/random/800x1200?fashion,sport1-2",
      "https://source.unsplash.com/random/800x1200?fashion,sport1-3",
    ],
  },
  {
    name: "Jeans Moderno",
    whatsapp: "https://wa.me/5511999999994",
    main: "https://i.pinimg.com/736x/9a/2e/56/9a2e569167264cda2dc88e8acba617b9.jpg",
    thumbs: [
      "https://source.unsplash.com/random/800x1200?fashion,jeans1-1",
      "https://source.unsplash.com/random/800x1200?fashion,jeans1-2",
      "https://source.unsplash.com/random/800x1200?fashion,jeans1-3",
    ],
  },
];

export default function IndispensavelLayout() {
  type Photo = {
    name: string;
    whatsapp: string;
    main: string;
    thumbs: string[];
  };

  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const closePhoto = () => setSelectedPhoto(null);

  return (
    <>
      <div className="fixed left-4 top-1/3 z-50 flex flex-col gap-4">
        <a
          href="https://wa.me/5547997102677"
          target="_blank"
          className="rounded-full bg-[#25d366] p-2 text-3xl text-white shadow-lg hover:text-green-400"
        >
          <FaWhatsapp />
        </a>
        <a
          href="https://instagram.com"
          target="_blank"
          className="rounded-full bg-[#E1306C] p-2 text-3xl text-white shadow-lg hover:text-pink-400"
        >
          <FaInstagram />
        </a>
        <a
          href="https://facebook.com"
          target="_blank"
          className="rounded-full bg-[#3b5998] p-2 text-3xl text-white shadow-lg hover:text-blue-400"
        >
          <i className="fab fa-facebook" />
        </a>
        <a
          href="https://www.google.com/maps/place/Av.+Itajuba,+1372+-+Itajubá,+Barra+Velha+-+SC,+88390-000"
          target="_blank"
          className="rounded-full bg-[#EA4335] p-2 text-3xl text-white shadow-lg hover:text-yellow-300"
        >
          <FaMapMarkerAlt />
        </a>
      </div>

      <div className="relative flex min-h-screen flex-col bg-[#f5f5ee] font-sans">
        <header className="sticky top-0 z-30 flex w-full justify-center bg-gradient-to-r from-[#f5f5ee] via-[#b39964] to-[#f5f5ee] py-4 shadow-sm">
          <h2 className="bg-gradient-to-r from-[#8ecae6] via-[#219ebc] to-[#023047] bg-clip-text text-3xl font-extrabold uppercase text-transparent md:text-5xl">
            𝔅𝔯𝔢𝔠𝔥ó 𝔖𝔥𝔬𝔭
          </h2>
        </header>

        <section className="flex flex-col md:flex-row">
          <div className="w-full md:w-1/2">
            <img
              src={mainPhoto}
              alt="Look Indispensável"
              className="h-[400px] w-full object-cover md:h-screen"
            />
          </div>
          <div className="flex w-full flex-col justify-center p-6 md:w-1/2">
            <h1 className="text-5xl font-bold uppercase leading-none text-gray-800 md:text-7xl">
              IN
              <br />
              DIS
              <br />
              PEN
              <br />
              SÁ
              <br />
              VEL
            </h1>
            <p className="mt-4 text-base text-gray-600 md:text-lg">
              Seja para um look casual ou para um visual mais elegante,
            </p>
          </div>
        </section>

        <section className="flex flex-col items-center gap-6 bg-[#b39964] px-6 py-10 md:flex-row md:justify-between md:px-16">
          <div className="text-center md:text-left">
            <h3 className="text-2xl font-bold text-white">Quem Somos</h3>
            <p className="mt-2 text-white">
              Moda sustentável e de qualidade, valorizando o estilo e o meio
              ambiente.
            </p>
          </div>
          <img
            src="https://i.pinimg.com/736x/74/a6/17/74a617c89ccc087d5b7fdb467f94e122.jpg"
            alt="Quem Somos"
            className="w-full max-w-2xl rounded-lg object-cover md:h-auto md:w-[400px]"
          />
        </section>

        <section className="my-8 flex flex-wrap justify-center gap-4 px-4">
          {galleryPhotos.map((item, index) => (
            <motion.img
              key={index}
              src={item.main}
              alt={item.name}
              className="h-28 w-28 cursor-pointer rounded-lg object-cover shadow-md transition-all hover:scale-105"
              whileHover={{ scale: 1.05 }}
              onClick={() => setSelectedPhoto(item)}
            />
          ))}
        </section>

        <section
          className="h-50 w-full bg-cover bg-[position:0_-140px] bg-center"
          style={{
            backgroundImage:
              "url(https://i.pinimg.com/736x/26/12/e3/2612e344302449d9dfaff2b3fd036f82.jpg)",
          }}
        ></section>

        <footer className="bg-[#023047] py-6 text-center text-sm text-white">
          WhatsApp ‪+55 47 99710‑2677‬ | Endereço: Junção com a - Cirino Antônio
          Cabral, Av. Itajuba, 1372 - Itajubá, Barra Velha - SC, 88390-000
        </footer>

        <AnimatePresence>
          {selectedPhoto && (
            <motion.div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-70 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePhoto}
            >
              <motion.div
                className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="absolute right-2 top-2 text-2xl text-gray-500"
                  onClick={closePhoto}
                >
                  &times;
                </button>
                <img
                  src={selectedPhoto.main}
                  alt={selectedPhoto.name}
                  className="w-full rounded-lg"
                />
                <h3 className="mt-4 text-center text-xl font-semibold">
                  {selectedPhoto.name}
                </h3>
                <a
                  href={selectedPhoto.whatsapp}
                  target="_blank"
                  className="mt-2 block text-center text-green-600 underline"
                >
                  Contato WhatsApp
                </a>
                <div className="mt-4 flex justify-center gap-2">
                  {selectedPhoto.thumbs.map((thumb: string, idx: number) => (
                    <img
                      key={idx}
                      src={thumb}
                      className="h-14 w-14 cursor-pointer rounded object-cover"
                      onClick={() =>
                        setSelectedPhoto({ ...selectedPhoto, main: thumb })
                      }
                    />
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
