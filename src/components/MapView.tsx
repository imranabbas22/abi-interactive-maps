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
  selectMode?: boolean;
  polygonMode?: boolean;
  onMapClick?: (x: number, y: number) => void;
  onPolygonPoint?: (x: number, y: number) => void;
  polygonPoints?: [number, number][];
  currentLevel?: string;
  onMarkerEdit?: (markerId: string) => void;
  onMarkerMove?: (markerId: string, newX: number, newY: number) => void;
  selectedMarkerIds?: Set<string>;
  onToggleSelectMarker?: (markerId: string) => void;
  onSelectMarkersInRect?: (ids: string[]) => void;
}

export default function MapView({
  mapData, activeCategories, focusMarkerId, onFocusDone,
  editMode, selectMode, polygonMode, onMapClick, onPolygonPoint, polygonPoints,
  currentLevel, onMarkerEdit, onMarkerMove,
  selectedMarkerIds, onToggleSelectMarker, onSelectMarkersInRect,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<Map<string, L.LayerGroup>>(new Map());
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map());
  const editLayerRef = useRef<L.LayerGroup | null>(null);
  const selectLayerRef = useRef<L.LayerGroup | null>(null);
  const selectionRect = useRef<L.Rectangle | null>(null);
  const dragStartRef = useRef<L.LatLng | null>(null);
  const dragRectLayerRef = useRef<L.LayerGroup | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const imageUrlRef = useRef('');

  // Init map — only once, capture initial mapData via ref
  const initBoundsRef = useRef(mapData.mapBounds);
  const initImageRef = useRef(mapData.mapImage);

  // Uniform zoom bump applied to all maps
  const zoomBump = 0.3;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const bottomLeft = initBoundsRef.current[0];
    const topRight = initBoundsRef.current[1];
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
      wheelPxPerZoomLevel: 90,
    });

    const imageUrl = `/maps/${initImageRef.current}`;
    imageUrlRef.current = imageUrl;
    const overlay = L.imageOverlay(imageUrl, bounds).addTo(map);
    imageOverlayRef.current = overlay;
    map.fitBounds(bounds, { padding: [5, 5] });
    // Zoom in slightly so larger maps fill the screen better
    setTimeout(() => {
      map.setZoom(map.getZoom() + zoomBump);
      map.invalidateSize();
    }, 150);

    const eLayer = L.layerGroup().addTo(map);
    editLayerRef.current = eLayer;

    const sLayer = L.layerGroup().addTo(map);
    selectLayerRef.current = sLayer;

    const dLayer = L.layerGroup().addTo(map);
    dragRectLayerRef.current = dLayer;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      editLayerRef.current = null;
      selectLayerRef.current = null;
      dragRectLayerRef.current = null;
      layersRef.current = new Map();
      markersMapRef.current = new Map();
    };
  }, []);

  // Swap image overlay when floor/mapImage changes
  useEffect(() => {
    const map = mapRef.current;
    const overlay = imageOverlayRef.current;
    if (!map || !overlay) return;

    const newUrl = `/maps/${mapData.mapImage}`;
    if (imageUrlRef.current !== newUrl) {
      // Use the current mapData bounds for the overlay
      const bl = mapData.mapBounds[0];
      const tr = mapData.mapBounds[1];
      const bounds = L.latLngBounds(
        L.latLng(bl[1], bl[0]),
        L.latLng(tr[1], tr[0])
      );

      map.removeLayer(overlay);
      const newOverlay = L.imageOverlay(newUrl, bounds).addTo(map);
      imageOverlayRef.current = newOverlay;
      imageUrlRef.current = newUrl;
      map.fitBounds(bounds, { padding: [5, 5] });
      map.setZoom(map.getZoom() + zoomBump);
    }
  }, [mapData.mapImage, mapData.mapBounds]);

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

    // Remove markers that no longer exist in the data (deleted)
    const removedIds: string[] = [];
    markerMap.forEach((leafletMarker, markerId) => {
      if (!mapData.markers.find((m) => m.id === markerId)) {
        removedIds.push(markerId);
      }
    });
    removedIds.forEach((id) => {
      const m = markerMap.get(id);
      if (m) {
        const layer = m as any;
        if (layer._map) map.removeLayer(layer);
        markerMap.delete(id);
      }
    });

    // Filter markers by current level
    const levelMarkers = currentLevel
      ? mapData.markers.filter((m) => m.level === currentLevel)
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
            ? `<button class="edit-marker-btn">Edit</button>`
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

          // Hover tooltip — small label showing marker name
          leafletMarker.bindTooltip(marker.popup.title, {
            direction: "top",
            offset: L.point(0, -8),
            className: "marker-tooltip",
            sticky: true,
          });

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

        // Selection styling
        if (selectMode && selectedMarkerIds?.has(marker.id)) {
          leafletMarker.setIcon(hasIcon
            ? L.icon({ iconUrl: `/icons/${iconFile}`, iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -19],
                className: "marker-selected" })
            : L.divIcon({
                html: `<div class="marker-selected-box"><div style="background:${category.color};color:${category.symbolColor||'#fff'};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold">${category.symbol}</div></div>`,
                iconSize: [48, 48], iconAnchor: [24, 24], popupAnchor: [0, -24], className: "",
              }));
        } else if (selectMode && !selectedMarkerIds?.has(marker.id)) {
          // Reset to default icon when not selected
          leafletMarker.setIcon(makeIcon(false));
        }

        // Drag events
        leafletMarker.on("dragstart", () => {
          if (selectMode && selectedMarkerIds?.has(marker.id)) {
            // Store all selected markers' positions for delta calculation
            (leafletMarker as any)._dragGroup = true;
          }
        });

        leafletMarker.on("dragend", () => {
          const pos = leafletMarker.getLatLng();
          const newX = pos.lng;
          const newY = pos.lat;

          if (selectMode && selectedMarkerIds && selectedMarkerIds.size > 1 && selectedMarkerIds.has(marker.id)) {
            // Move all selected markers by the same delta
            const oldPos = marker.position;
            const dx = newX - oldPos[0];
            const dy = newY - oldPos[1];
            selectedMarkerIds.forEach((id) => {
              if (id === marker.id) {
                onMarkerMove?.(id, newX, newY);
              } else {
                const m = mapData.markers.find((mm) => mm.id === id);
                if (m) {
                  onMarkerMove?.(id, m.position[0] + dx, m.position[1] + dy);
                }
              }
            });
          } else {
            onMarkerMove?.(marker.id, newX, newY);
          }
        });

        // Click to select in select mode
        if (editMode && selectMode && onToggleSelectMarker) {
          leafletMarker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onToggleSelectMarker(marker.id);
          });
        } else if (editMode && onMarkerEdit) {
          leafletMarker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onMarkerEdit(marker.id);
          });
        }

        layerGroup.addLayer(leafletMarker);
        markerMap.set(marker.id, leafletMarker);
      });

      layerGroup.addTo(map);
      layerMap.set(catId, layerGroup);
    });
  }, [mapData, activeCategories, editMode, selectMode, selectedMarkerIds, currentLevel, onMarkerEdit, onMarkerMove, onToggleSelectMarker]);

  // Update marker draggability + selection icons when edit/select mode changes
  useEffect(() => {
    const markerMap = markersMapRef.current;
    if (markerMap.size === 0 || !mapData) return;

    const shouldDrag = !!(editMode && onMarkerMove);
    const categoryMap = new Map(mapData.categories.map((c) => [c.id, c]));

    markerMap.forEach((leafletMarker, markerId) => {
      // Update dragging
      if (shouldDrag) {
        leafletMarker.dragging?.enable();
      } else {
        leafletMarker.dragging?.disable();
      }

      // Update selection icon
      const marker = mapData.markers.find((m) => m.id === markerId);
      if (!marker) return;
      const category = categoryMap.get(marker.categoryId);
      if (!category) return;
      const iconFile = category.icon?.replace("File:", "");
      const hasIcon = iconFile && category.icon?.startsWith("File:");

      if (selectMode && selectedMarkerIds?.has(markerId)) {
        leafletMarker.setIcon(hasIcon
          ? L.icon({ iconUrl: `/icons/${iconFile}`, iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -19], className: "marker-selected" })
          : L.divIcon({
              html: `<div class="marker-selected-box"><div style="background:${category.color};color:${category.symbolColor||'#fff'};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold">${category.symbol}</div></div>`,
              iconSize: [48, 48], iconAnchor: [24, 24], popupAnchor: [0, -24], className: "",
            }));
      } else if (selectMode && !selectedMarkerIds?.has(markerId)) {
        // Reset to default when not selected
        leafletMarker.setIcon(hasIcon
          ? L.icon({ iconUrl: `/icons/${iconFile}`, iconSize: [28, 28], iconAnchor: [16, 16], popupAnchor: [0, -16] })
          : L.divIcon({
              html: `<div style="background:${category.color};color:${category.symbolColor||'#fff'};width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;border:2px solid rgba(255,255,255,0.3)">${category.symbol}</div>`,
              iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -11], className: "",
            }));
      }
    });
  }, [editMode, onMarkerMove, selectMode, selectedMarkerIds, mapData]);

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
      if (!editMode || selectMode) return;

      const x = e.latlng.lng;
      const y = e.latlng.lat;

      if (polygonMode && onPolygonPoint) {
        onPolygonPoint(x, y);
      } else if (onMapClick && !e.originalEvent.defaultPrevented) {
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
      map.getContainer().style.cursor = polygonMode
        ? "crosshair"
        : selectMode
          ? "default"
          : "grab";
    } else {
      map.off("click", handleClick);
      map.getContainer().style.cursor = "";
    }

    return () => { map.off("click", handleClick); };
  }, [editMode, selectMode, polygonMode, onMapClick, onPolygonPoint]);

  // Selection rectangle drag
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectMode || !onSelectMarkersInRect) return;

    const dLayer = dragRectLayerRef.current;
    if (!dLayer) return;

    let drawing = false;
    let startLatLng: L.LatLng | null = null;
    let rect: L.Rectangle | null = null;

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (!selectMode) return;
      drawing = true;
      startLatLng = e.latlng;
      rect = L.rectangle(L.latLngBounds(startLatLng, startLatLng), {
        color: "#D4AF37",
        weight: 1,
        fillColor: "#D4AF37",
        fillOpacity: 0.1,
        dashArray: "4, 4",
      });
      dLayer.addLayer(rect);
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!drawing || !startLatLng || !rect) return;
      const bounds = L.latLngBounds(startLatLng, e.latlng);
      rect.setBounds(bounds);
    };

    const onMouseUp = (e: L.LeafletMouseEvent) => {
      if (!drawing || !startLatLng) return;
      drawing = false;

      if (rect) {
        dLayer.removeLayer(rect);
        rect = null;
      }

      const rectBounds = L.latLngBounds(
        L.latLng(Math.min(startLatLng.lat, e.latlng.lat), Math.min(startLatLng.lng, e.latlng.lng)),
        L.latLng(Math.max(startLatLng.lat, e.latlng.lat), Math.max(startLatLng.lng, e.latlng.lng))
      );

      // Find markers inside the rectangle
      const markerMap = markersMapRef.current;
      const insideIds: string[] = [];
      markerMap.forEach((m, id) => {
        const pos = m.getLatLng();
        if (rectBounds.contains(pos)) {
          insideIds.push(id);
        }
      });

      if (insideIds.length > 0) {
        onSelectMarkersInRect(insideIds);
      }

      startLatLng = null;
    };

    map.on("mousedown", onMouseDown);
    map.on("mousemove", onMouseMove);
    map.on("mouseup", onMouseUp);

    // Prevent browser right-click menu in select mode
    const preventCtx = (e: MouseEvent) => { if (selectMode) e.preventDefault(); };
    map.getContainer().addEventListener("contextmenu", preventCtx);

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("mousemove", onMouseMove);
      map.off("mouseup", onMouseUp);
      map.getContainer().removeEventListener("contextmenu", preventCtx);
      if (dLayer) dLayer.clearLayers();
    };
  }, [selectMode, onSelectMarkersInRect]);

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
