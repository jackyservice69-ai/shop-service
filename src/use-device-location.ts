import { useEffect, useRef, useState } from "react";
export function useDeviceLocation(
  onLocate: (point: { latitude: number; longitude: number }) => void,
) {
  const [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0),
    callback = useRef(onLocate);
  callback.current = onLocate;
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  const cancel = () => {
    sequence.current++;
    setLocating(false);
    setError("");
  };
  const locate = () => {
    setError("");
    if (!navigator.geolocation || !window.isSecureContext) {
      setError("อุปกรณ์นี้เข้าถึงตำแหน่งไม่ได้ กรุณาปักหมุดหรือกรอกพิกัดเอง");
      return;
    }
    const request = ++sequence.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (request !== sequence.current) return;
        setLocating(false);
        callback.current({
          latitude: +p.coords.latitude.toFixed(6),
          longitude: +p.coords.longitude.toFixed(6),
        });
      },
      (e) => {
        if (request !== sequence.current) return;
        setLocating(false);
        setError(
          e.code === 1
            ? "ไม่อนุญาตให้ใช้ตำแหน่ง คุณยังคลิกแผนที่เพื่อปักหมุดเองได้"
            : e.code === 3
              ? "ค้นหาตำแหน่งนานเกินไป กรุณาลองใหม่หรือปักหมุดเอง"
              : "ไม่พบตำแหน่ง กรุณาลองใหม่หรือปักหมุดเอง",
        );
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true },
    );
  };
  return { locating, error, locate, cancel };
}
