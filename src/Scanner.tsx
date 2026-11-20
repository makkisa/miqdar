import { useEffect, useRef, useState } from "react";
import { ScanLine, CameraOff } from "lucide-react";
type Props = { onCode: (code: string) => void; ar: boolean };
export default function Scanner({ onCode, ar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const found = useRef(false);
  const accept = (code: string) => {
    if (!found.current) {
      found.current = true;
      onCode(code);
    }
  };
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let controls: { stop: () => void } | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      stopped = true;
      clearTimeout(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    async function start() {
      try {
        performance.mark("camera-start");
        const Native = (window as any).BarcodeDetector;
        const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];
        if (Native && (await Native.getSupportedFormats()).includes("ean_13")) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          video.current!.srcObject = stream;
          await video.current!.play();
          performance.measure("camera-open", "camera-start");
          const detector = new Native({
            formats: formats.filter((f) => f !== "qr_code"),
          });
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext("2d")!;
          const tick = async () => {
            if (stopped || found.current) return;
            try {
              if (video.current?.readyState === 4) {
                ctx.drawImage(video.current, 0, 0, 640, 360);
                const codes = await detector.detect(canvas);
                if (codes[0]) {
                  performance.measure("barcode-recognized", "camera-start");
                  accept(codes[0].rawValue);
                  stop();
                  return;
                }
              }
            } catch {
              /* next frame */
            }
            if (!stopped) timer = setTimeout(tick, 100);
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (stopped) return;
          const reader = new BrowserMultiFormatReader(undefined, {
            delayBetweenScanAttempts: 100,
            delayBetweenScanSuccess: 1000,
          });
          controls = await reader.decodeFromConstraints(
            {
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            video.current!,
            (result) => {
              if (result && !stopped) {
                accept(result.getText());
                stop();
              }
            },
          );
          if (stopped) controls.stop();
          else performance.measure("camera-open", "camera-start");
        }
      } catch {
        if (!stopped)
          setError(
            ar
              ? "تعذر فتح الكاميرا. تحقق من الصلاحية أو أدخل الرقم."
              : "Camera unavailable. Check permission or enter the code.",
          );
      }
    }
    void start();
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <section className="panel">
      <h2>{ar ? "مسح الباركود" : "Scan barcode"}</h2>
      <div className="viewfinder">
        <video ref={video} muted playsInline autoPlay />
        <ScanLine size={100} />
      </div>
      <p>
        {ar ? "وجّه الكاميرا إلى الباركود" : "Point the camera at a barcode"}
      </p>
      {error && (
        <p role="alert">
          <CameraOff />
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          accept(manual);
        }}
      >
        <label>
          {ar ? "رقم الباركود" : "Barcode"}
          <input
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            required
            pattern="[0-9]{8,14}"
          />
        </label>
        <button className="primary">{ar ? "بحث" : "Look up"}</button>
      </form>
      <label className="file-button">
        {ar ? "قراءة باركود من صورة" : "Read barcode image"}
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            try {
              const { BrowserMultiFormatReader } =
                await import("@zxing/browser");
              const result =
                await new BrowserMultiFormatReader().decodeFromImageUrl(url);
              accept(result.getText());
            } catch {
              setError(ar ? "لم يُقرأ الباركود" : "Barcode not detected");
            } finally {
              URL.revokeObjectURL(url);
            }
          }}
        />
      </label>
    </section>
  );
}
