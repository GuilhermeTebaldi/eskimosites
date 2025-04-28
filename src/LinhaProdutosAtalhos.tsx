import { useEffect, useState } from "react";

export default function LinhaProdutosAtalhos({
  onSelectCategorySubcategory,
}: {
  onSelectCategorySubcategory: (category: string, subcategory?: string) => void;
}) {
  const imagensEsquerda = [
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/04/Linha-Kids.png",
      category: "Picolé",
      subcategory: "Kids",
    },
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/09/best-cup.png",
      category: "Pote de Sorvete",
      subcategory: "Best Cup",
    },
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/05/Acai-900g-sem-lupa.png",
      category: "Açaí",
    },
  ];

  const imagensDireita = [
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/04/Pote-2-Litros-1.png",
      category: "Pote de Sorvete",
      subcategory: "2L",
    },
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/04/Linha-Grand-Nevado-1.png",
      category: "Pote de Sorvete",
      subcategory: "Grand Nevado",
    },
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/04/Linha-Fruta.png",
      category: "Picolé",
      subcategory: "Frutas",
    },
    {
      src: "https://eskimo.com.br/wp-content/uploads/2023/04/Linha-Creme.png",
      category: "Picolé",
      subcategory: "Cremes",
    },
  ];

  const [indexEsquerda, setIndexEsquerda] = useState(0);
  const [indexDireita, setIndexDireita] = useState(0);
  const [fadeEsquerda, setFadeEsquerda] = useState(true);
  const [fadeDireita, setFadeDireita] = useState(true);

  useEffect(() => {
    const intervalEsquerda = setInterval(() => {
      setFadeEsquerda(false);
      setTimeout(() => {
        setIndexEsquerda((prev) => (prev + 1) % imagensEsquerda.length);
        setFadeEsquerda(true);
      }, 400);
    }, 3000);

    const intervalDireita = setInterval(() => {
      setFadeDireita(false);
      setTimeout(() => {
        setIndexDireita((prev) => (prev + 1) % imagensDireita.length);
        setFadeDireita(true);
      }, 400);
    }, 4000);

    return () => {
      clearInterval(intervalEsquerda);
      clearInterval(intervalDireita);
    };
  }, []);

  const imagemEsquerda = imagensEsquerda[indexEsquerda];
  const imagemDireita = imagensDireita[indexDireita];

  return (
    <div className="flex w-full justify-center gap-8 py-6">
      <img
        src={imagemEsquerda.src}
        alt="Linha Eskimo"
        className={`h-20 w-auto cursor-pointer object-contain transition-all duration-700 ease-in-out hover:scale-110 ${
          fadeEsquerda ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
        onClick={() =>
          onSelectCategorySubcategory(
            imagemEsquerda.category,
            imagemEsquerda.subcategory,
          )
        }
      />
      <img
        src={imagemDireita.src}
        alt="Linha Eskimo"
        className={`h-20 w-auto cursor-pointer object-contain transition-all duration-700 ease-in-out hover:scale-110 ${
          fadeDireita ? "scale-100 opacity-100" : "scale-90 opacity-0"
        }`}
        onClick={() =>
          onSelectCategorySubcategory(
            imagemDireita.category,
            imagemDireita.subcategory,
          )
        }
      />
    </div>
  );
}
