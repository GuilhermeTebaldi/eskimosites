import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface PixQRCodeProps {
  payload: string;
}

export default function PixQRCode({ payload }: PixQRCodeProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(payload).then(setQrCodeUrl);
  }, [payload]);

  if (!qrCodeUrl) return <p>Gerando QR Code...</p>;

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4">
      <img src={qrCodeUrl} alt="QR Code Pix" className="h-64 w-64" />
      <p className="break-all text-center text-sm">{payload}</p>
    </div>
  );
}
