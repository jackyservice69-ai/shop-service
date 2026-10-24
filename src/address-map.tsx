import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Modal, ErrorBox } from "./ui";
import type { Point } from "./address-book";

export default function MapDialog({
  value,
  onSave,
  onClose,
}: {
  value: Point;
  onSave: (p: Point) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    mapRef = useRef<L.Map | null>(null),
    [point, setPoint] = useState<Point>(value),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const initial: L.LatLngTuple =
      value.latitude != null && value.longitude != null
        ? [value.latitude, value.longitude]
        : [13.7563, 100.5018];
    const map = L.map(ref.current, {
      scrollWheelZoom: false,
      zoomControl: false,
    }).setView(initial, value.latitude == null ? 11 : 16);
    L.control
      .zoom({ zoomInTitle: "ซูมเข้า", zoomOutTitle: "ซูมออก" })
      .addTo(map);
    mapRef.current = map;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    })
      .on("tileerror", () => setTileError(true))
      .addTo(map);
    const icon = L.divIcon({
      className: "address-map-pin",
      html: '<span aria-hidden="true"></span>',
      iconSize: [28, 36],
      iconAnchor: [14, 36],
    });
    let marker: L.Marker | null = null;
    const choose = (latlng: L.LatLng) => {
      const p = {
        latitude: +Math.max(-90, Math.min(90, latlng.lat)).toFixed(6),
        longitude: +latlng.wrap().lng.toFixed(6),
      };
      setPoint(p);
      if (!marker) {
        marker = L.marker([p.latitude, p.longitude], {
          icon,
          draggable: true,
          autoPan: true,
          title: "หมุดที่อยู่จัดส่ง",
          alt: "หมุดที่อยู่จัดส่ง",
        }).addTo(map);
        marker.on("dragend", () => choose(marker!.getLatLng()));
      } else marker.setLatLng([p.latitude, p.longitude]);
    };
    map.on("click", (e) => choose(e.latlng));
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.target === ref.current) {
        e.preventDefault();
        choose(map.getCenter());
      }
    };
    const node = ref.current;
    node.setAttribute(
      "aria-label",
      "แผนที่ที่อยู่ ใช้ลูกศรเลื่อน แล้วกด Enter เพื่อปักหมุดตรงกลาง",
    );
    node.addEventListener("keydown", keyboard);
    if (value.latitude != null && value.longitude != null)
      choose(L.latLng(initial));
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("keydown", keyboard);
      map.remove();
      mapRef.current = null;
    };
  }, []);
  return (
    <Modal title="ปักหมุดที่อยู่จัดส่ง" wide onClose={onClose}>
      <p>
        คลิกแผนที่เพื่อปักหมุด หรือลากหมุดไปยังตำแหน่งที่ต้องการ
        ใช้แป้นลูกศรเลื่อนแผนที่และกด Enter เพื่อเลือกจุดกึ่งกลาง
      </p>
      <div ref={ref} className="address-map" role="region" />
      {tileError && (
        <ErrorBox
          error="โหลดแผนที่บางส่วนไม่สำเร็จ คุณยังกรอกพิกัดเองได้"
          retry={() => {
            setTileError(false);
            mapRef.current?.eachLayer((layer) => {
              if (layer instanceof L.TileLayer) layer.redraw();
            });
          }}
        />
      )}
      <p role="status">
        {point.latitude != null
          ? `พิกัดที่เลือก ${point.latitude}, ${point.longitude}`
          : "ยังไม่ได้เลือกหมุด"}
      </p>
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="button primary"
          disabled={point.latitude == null || point.longitude == null}
          onClick={() => onSave(point)}
        >
          ใช้หมุดนี้
        </button>
      </div>
    </Modal>
  );
}
