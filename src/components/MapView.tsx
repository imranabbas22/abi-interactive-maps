"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapData } from "@/types/map";

interface MapViewProps {
  mapData: MapData;
  activeCategories: Set<string>;
  focusMarkerId?: string | null;
  onFocusDone?: () => void;
  editMode?: boolean;
  polygonMode?: boolean;
  onMapClick?: (x: number, y: number) => void;
  onPolygonPoint?: (x: number, y: number) => void;
  polygonPoints?: [number, number][];
  currentLevel?: string;
  onMarkerEdit?: (markerId: string) => void;
  onMarkerMove?: (markerId: string, newX: number, newY: number) => void;
}

export default function MapView({
  mapData, activeCategories, focusMarkerId, onFocusDone,
  editMode, polygonMode, onMapClick, onPolygonPoint, polygonPoints,
  currentLevel, onMarkerEdit, onMarkerMove,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const editLayerRef = useRef<L.LayerGroup | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const bottomLeft = mapData.mapBounds[0];
    const topRight = mapData.mapBounds[1];
    const bounds = L.latLngBounds(
      L.latLng(bottomLeft[1], bottomLeft[0]),
      L.latLng(topRight[1], topRight[0])
    );

    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      zoomControl: true,
      attributionControl: false,
      minZoom: -4,
      maxZoom: 6,
    });

    const imageUrl = `/maps/${mapData.mapImage}`;
    L.imageOverlay(imageUrl, bounds).addTo(map);
    map.fitBounds(bounds, { padding: [20, 20] });

    const eLayer = L.layerGroup().addTo(map);
    editLayerRef.current = eLayer;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      editLayerRef.current = null;
    };
  }, [mapData]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const layerMap = layersRef.current;
    const markerMap = markersMapRef.current;

    // Remove layers for inactive categories
    layerMap.forEach((layer, catId) => {
      if (!activeCategories.has(catId)) {
        map.removeLayer(layer);
        layerMap.delete(catId);
      }
    });

    markerMap.forEach((_m, markerId) => {
      const marker = mapData.markers.find((m) => m.id === markerId);
      if (marker && !activeCategories.has(marker.categoryId)) {
        markerMap.delete(markerId);
      }
    });

    // Filter markers by current level
    const levelMarkers = currentLevel
      ? mapData.markers.filter((m) => !m.level || m.level === currentLevel)
      : mapData.markers;

    const categoryMap = new Map(mapData.categories.map((c) => [c.id, c]));
    const markersByCategory = new Map<string, typeof levelMarkers>();

    levelMarkers.forEach((marker) => {
      const existing = markersByCategory.get(marker.categoryId) || [];
      existing.push(marker);
      markersByCategory.set(marker.categoryId, existing);
    });

    markersByCategory.forEach((markers, catId) => {
      if (!activeCategories.has(catId)) return;
      if (layerMap.has(catId)) return;

      const category = categoryMap.get(catId);
      if (!category) return;

      const layerGroup = L.layerGroup();
      const iconFile = category.icon.replace("File:", "");
      const hasIcon = iconFile && category.icon.startsWith("File:");

      const makeIcon = (isDrag: boolean) => hasIcon
        ? L.icon({ iconUrl: `/icons/${iconFile}`, iconSize: isDrag ? [32, 32] : [28, 28], iconAnchor: [16, 16], popupAnchor: [0, -16] })
        : L.divIcon({
            html: `<div style="background:${category.color};color:${category.symbolColor||'#fff'};width:${isDrag?26:22}px;height:${isDrag?26:22}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${isDrag?16:14}px;font-weight:bold;border:2px solid rgba(255,255,255,0.3)">${category.symbol}</div>`,
            iconSize: [isDrag ? 26 : 22, isDrag ? 26 : 22],
            iconAnchor: [isDrag ? 13 : 11, isDrag ? 13 : 11],
            popupAnchor: [0, isDrag ? -13 : -11],
            className: "",
          });

      markers.forEach((marker) => {
        const [x, y] = marker.position;
        const isDraggable = !!(editMode && onMarkerMove);
        const leafletMarker = L.marker(L.latLng(y, x), {
          icon: makeIcon(!!isDraggable),
          draggable: isDraggable,
        });

        // Popup
        if (marker.popup?.title) {
          const editBtnHtml = editMode
            ? `<button class="edit-marker-btn" style="margin-top:6px;font-size:11px;padding:2px 8px;background:#3b82f6;border:none;border-radius:4px;color:white;cursor:pointer">Edit</button>`
            : "";
          leafletMarker.bindPopup(
            `<div style="font-family:sans-serif;min-width:140px">
              <strong style="color:#f1f5f9">${marker.popup.title}</strong>
              ${marker.level ? `<span style="display:inline-block;margin-left:6px;font-size:10px;padding:1px 5px;background:#374151;border-radius:3px;color:#9ca3af">${marker.level}</span>` : ""}
              ${marker.popup.description ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8">${marker.popup.description}</p>` : ""}
              ${editBtnHtml}
            </div>`,
            { closeButton: true, className: editMode ? "marker-popup-edit" : "" }
          );

          // Wire edit button via popupopen event (no inline onclick — avoids XSS)
          if (editMode && onMarkerEdit) {
            leafletMarker.on("popupopen", () => {
              const popupEl = leafletMarker.getPopup()?.getElement();
              const btn: HTMLElement | null | undefined = popupEl?.querySelector(".edit-marker-btn");
              if (btn && !btn.dataset.listenerAttached) {
                btn.dataset.listenerAttached = "true";
                btn.addEventListener("click", (e) => {
                  e.stopPropagation();
                  onMarkerEdit(marker.id);
                });
              }
            });
          }
        }

        // Drag events
        leafletMarker.on("dragend", () => {
          const pos = leafletMarker.getLatLng();
          const newX = pos.lng;
          const newY = pos.lat;
          onMarkerMove?.(marker.id, newX, newY);
        });

        // Click in edit mode (use mousedown to intercept before popup)
        if (editMode && onMarkerEdit) {
          leafletMarker.on("click", () => {
            onMarkerEdit(marker.id);
          });
        }

        layerGroup.addLayer(leafletMarker);
        markerMap.set(marker.id, leafletMarker);
      });

      layerGroup.addTo(map);
      layerMap.set(catId, layerGroup);
    });
  }, [mapData, activeCategories, editMode, currentLevel, onMarkerEdit, onMarkerMove]);

  // Focus marker
  useEffect(() => {
    if (!focusMarkerId || !mapRef.current) return;
    const map = mapRef.current;
    const leafletMarker = markersMapRef.current.get(focusMarkerId);
    if (!leafletMarker) { onFocusDone?.(); return; }

    const latlng = leafletMarker.getLatLng();
    map.flyTo(latlng, Math.max(map.getZoom(), 2), { duration: 0.5 });
    setTimeout(() => { leafletMarker.openPopup(); onFocusDone?.(); }, 600);
  }, [focusMarkerId, onFocusDone]);

  // Handle edit mode clicks on map canvas
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (!editMode) return;

      // Check if we clicked on a marker (Leaflet handles this, don't double-fire)
      const x = e.latlng.lng;
      const y = e.latlng.lat;

      if (polygonMode && onPolygonPoint) {
        onPolygonPoint(x, y);
      } else if (onMapClick && !e.originalEvent.defaultPrevented) {
        // Check if we're near an existing marker — if so, skip
        const markerMap = markersMapRef.current;
        let nearMarker = false;
        markerMap.forEach((leafletM) => {
          const pos = leafletM.getLatLng();
          const dist = map.distance(pos, e.latlng);
          if (dist < 20) nearMarker = true;
        });
        if (!nearMarker) {
          onMapClick(x, y);
        }
      }
    };

    if (editMode) {
      map.on("click", handleClick);
      map.getContainer().style.cursor = polygonMode ? "crosshair" : "pointer";
    } else {
      map.off("click", handleClick);
      map.getContainer().style.cursor = "";
    }

    return () => { map.off("click", handleClick); };
  }, [editMode, polygonMode, onMapClick, onPolygonPoint]);

  // Show polygon preview
  useEffect(() => {
    const layer = editLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!editMode || !polygonPoints || polygonPoints.length === 0) return;

    const latlngs = polygonPoints.map(([x, y]) => L.latLng(y, x));

    const polyline = L.polyline(latlngs, { color: "#3b82f6", weight: 2, dashArray: "5, 5" });
    layer.addLayer(polyline);

    polygonPoints.forEach(([x, y], i) => {
      const circle = L.circleMarker(L.latLng(y, x), {
        radius: 5, color: "#3b82f6", fillColor: "#fff", fillOpacity: 1, weight: 2,
      });
      circle.bindTooltip(`${i + 1}`, { permanent: true, direction: "top", offset: [0, -8] });
      layer.addLayer(circle);
    });

    if (polygonPoints.length >= 3) {
      const poly = L.polygon(latlngs, {
        color: "#3b82f6", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.15,
      });
      layer.addLayer(poly);
    }
  }, [editMode, polygonPoints]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "calc(100vh - 64px)" }}
    />
  );
}
