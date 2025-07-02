import React, { useEffect, useState } from "react";

const PenguinBlink = () => {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200); // tempo da piscada
    }, 5000); // intervalo entre piscadas

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "80px",
        left: "10px", // 🔴 alterado de right para left
        width: "80px",
        height: "80px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <img
        src={
          isBlinking
            ? "https://i.pinimg.com/736x/0e/71/63/0e716360f7b7beabaa5dd9d47bc457bd.jpg"
            : "https://i.pinimg.com/736x/1d/9d/80/1d9d80d502c64fc76e665a1706274c3e.jpg"
        }
        alt="Penguin"
        style={{ width: "60%", height: "60%" }}
      />
    </div>
  );
};

export default PenguinBlink;
