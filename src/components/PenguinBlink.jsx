import React, { useEffect, useState } from "react";

const PenguinBlinkWave = () => {
  const [isBlinking, setIsBlinking] = useState(false);
  const [waveStep, setWaveStep] = useState(0);

  useEffect(() => {
    // Intervalo de piscada
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 200); // tempo piscando
    }, 3000); // a cada 5s

    // Intervalo de aceno (4 vezes seguidas)
    const waveInterval = setInterval(() => {
      let count = 0;

      const waveSequence = setInterval(() => {
        setWaveStep((prev) => (prev === 1 ? 2 : 1));
        count++;
        if (count >= 8) {
          // 🔴 4 acenos completos (2 steps por aceno)
          clearInterval(waveSequence);
          setWaveStep(0); // volta para normal após aceno
        }
      }, 300); // troca braço a cada 300ms
    }, 8000); // a cada 8s

    return () => {
      clearInterval(blinkInterval);
      clearInterval(waveInterval);
    };
  }, []);

  // Define imagem atual
  let penguinImage = "";

  if (isBlinking) {
    penguinImage =
      "https://i.pinimg.com/736x/0e/71/63/0e716360f7b7beabaa5dd9d47bc457bd.jpg"; // piscando
  } else if (waveStep === 1) {
    penguinImage =
      "https://i.pinimg.com/736x/f5/2e/67/f52e672715f070aeb090348c94a833e2.jpg"; // braço posição 1
  } else if (waveStep === 2) {
    penguinImage =
      "https://i.pinimg.com/736x/3d/0e/76/3d0e76c4810221cc387c707d63efeb28.jpg"; // braço posição 2
  } else {
    penguinImage =
      "https://i.pinimg.com/736x/1d/9d/80/1d9d80d502c64fc76e665a1706274c3e.jpg"; // normal olho aberto
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "10px",
        right: "50px",
        width: "80px",
        height: "80px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <img
        src={penguinImage}
        alt="Penguin blinking and waving"
        style={{ width: "80%", height: "80%" }}
      />
    </div>
  );
};

export default PenguinBlinkWave;
