import React, { useState, useEffect } from "react";

export default function LinhaProdutosAtalhos({
  onSelectCategorySubcategory,
}: {
  onSelectCategorySubcategory: (category: string, subcategory?: string) => void;
}) {
  const imagens = [
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
  ];

  const [index, setIndex] = useState<number>(0);

  const nextImage = () =>
    setIndex((prev: number) => (prev + 1) % imagens.length);
  const prevImage = () =>
    setIndex((prev: number) => (prev - 1 + imagens.length) % imagens.length);

  useEffect(() => {
    const interval = setInterval(() => nextImage(), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative -mt-4 flex w-full flex-col items-center">
      {/* Container do carrossel */}
      <div className="relative flex w-full max-w-md items-center justify-center rounded-lg bg-white/90 py-2 shadow">
        {/* Botão esquerda */}
        <button
          onClick={prevImage}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-3xl text-gray-500 hover:text-red-600"
        >
          ‹
        </button>

        {/* Imagem central */}
        <img
          src={imagens[index].src}
          alt="Linha Eskimo"
          className="h-28 w-auto cursor-pointer object-contain transition-transform duration-300 hover:scale-105"
          onClick={() =>
            onSelectCategorySubcategory(
              imagens[index].category,
              imagens[index].subcategory,
            )
          }
        />

        {/* Botão direita */}
        <button
          onClick={nextImage}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-3xl text-gray-500 hover:text-red-600"
        >
          ›
        </button>
      </div>

      {/* Indicadores */}
      <div className="mt-1 flex items-center gap-1">
        {imagens.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-4 rounded-full transition-all ${
              i === index ? "bg-red-500" : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
