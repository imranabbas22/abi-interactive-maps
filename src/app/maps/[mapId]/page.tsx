"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapData, MapListItem, MapMarker } from "@/types/map";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-background text-text-secondary">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading map...</span>
      </div>
    </div>
  ),
});

interface CustomMarker extends MapMarker {
  _temp?: boolean;
  _override?: boolean;
  _originalPosition?: [number, number];
}

interface SavedPolygon {
  id: string;
  points: [number, number][];
  label: string;
  category: string;
  level: string;
}

const MAP_LEVELS: Record<string, string[]> = {
  airport: ["Periphery", "1F", "2F"],
  armory: ["Outer Wall", "B1", "1F", "2F"],
  "tv-station": ["1F", "2F"],
  farm: ["Ground"],
  valley: ["Ground"],
  "valley-distortion": ["Ground"],
  northridge: ["Periphery", "1F", "2F", "3F"],
};

export default function MapViewerPage() {
  const params = useParams();
  const urlMapId = params?.mapId as string || "farm";

  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [selectedMap, setSelectedMap] = useState<string>(urlMapId);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [polygonMode, setPolygonMode] = useState(false);
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [savedPolygons, setSavedPolygons] = useState<SavedPolygon[]>([]);

  // Multi-select
  const [selectedMarkerIds, setSelectedMarkerIds] = useState<Set<string>>(new Set());

  // Deleted/hidden built-in markers
  const [deletedMarkerIds, setDeletedMarkerIds] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteCount, setPendingDeleteCount] = useState(0);

  // Marker palette
  const [activePaletteCategory, setActivePaletteCategory] = useState<string | null>(null);

  // Collapsible sidebar sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  }, []);

  // Current level
  const [currentLevel, setCurrentLevel] = useState("Ground");
  const levels = MAP_LEVELS[selectedMap] || ["Ground"];

  // Marker form
  const [showMarkerForm, setShowMarkerForm] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<[number, number] | null>(null);
  const [newMarkerTitle, setNewMarkerTitle] = useState("");
  const [newMarkerDesc, setNewMarkerDesc] = useState("");
  const [newMarkerCategory, setNewMarkerCategory] = useState("");
  const [newMarkerLevel, setNewMarkerLevel] = useState("Ground");
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);

  // Polygon form
  const [showPolygonForm, setShowPolygonForm] = useState(false);
  const [newPolygonLabel, setNewPolygonLabel] = useState("");
  const [newPolygonCategory, setNewPolygonCategory] = useState("");
  const [newPolygonLevel, setNewPolygonLevel] = useState("Ground");

  const nextMarkerId = useRef(10000);
  const nextPolyId = useRef(500);

  // ── Build all markers: built-in + custom, with overrides, minus deleted ──
  const allMarkers = useCallback(() => {
    if (!mapData) return [];
    const builtIn = mapData.markers.filter((m) => !deletedMarkerIds.has(m.id));
    const overrideMap = new Map<string, [number, number]>();
    customMarkers.forEach((cm) => {
      if (cm._override) overrideMap.set(cm.id, cm.position);
    });
    const trulyCustom = customMarkers.filter((m) => !m._override && !deletedMarkerIds.has(m.id));
    const result = builtIn.map((m) => {
      if (overrideMap.has(m.id)) return { ...m, position: overrideMap.get(m.id)! };
      return m;
    });
    return [...result, ...trulyCustom];
  }, [mapData, customMarkers, deletedMarkerIds]);

  const usedLevels = useCallback(() => {
    const levelSet = new Set<string>();
    allMarkers().forEach((m) => { if (m.level) levelSet.add(m.level); });
    savedPolygons.forEach((p) => levelSet.add(p.level));
    levels.forEach((l) => levelSet.add(l));
    return Array.from(levelSet);
  }, [allMarkers, savedPolygons, levels]);

  // Sync selectedMap with URL param
  useEffect(() => { setSelectedMap(urlMapId); }, [urlMapId]);

  // Fetch maps
  useEffect(() => {
    fetch("/api/maps").then((r) => r.json()).then((data: MapListItem[]) => setMaps(data)).catch(console.error);
  }, []);

  // Fetch map data when selectedMap changes
  useEffect(() => {
    if (!selectedMap) return;
    setLoading(true);
    setSearchQuery(""); setSearchResults([]); setShowSearchResults(false);
    setCustomMarkers([]); setPolygonPoints([]);
    setEditMode(false); setSelectMode(false); setPolygonMode(false);
    setSelectedMarkerIds(new Set());
    setDeletedMarkerIds(new Set());
    setActivePaletteCategory(null);
    setCurrentLevel(MAP_LEVELS[selectedMap]?.[0] || "Ground");

    fetch(`/api/coordinates/${selectedMap}`)
      .then((r) => r.json())
      .then((data: MapData) => {
        setMapData(data);
        setActiveCategories(new Set(data.categories.map((c) => c.id)));
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
  }, [selectedMap]);

  // ── Delete handlers (defined before keyboard effect to avoid TDZ) ──
  const handleRequestDelete = useCallback(() => {
    if (selectedMarkerIds.size === 0) return;
    setPendingDeleteCount(selectedMarkerIds.size);
    setShowDeleteConfirm(true);
  }, [selectedMarkerIds]);

  const handleConfirmDelete = useCallback(() => {
    const ids = selectedMarkerIds;
    setCustomMarkers((prev) => prev.filter((m) => !ids.has(m.id)));
    setDeletedMarkerIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setSelectedMarkerIds(new Set());
    setShowDeleteConfirm(false);
    setPendingDeleteCount(0);
  }, [selectedMarkerIds]);

  // Keyboard handler for Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editMode || selectedMarkerIds.size === 0) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleRequestDelete();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editMode, selectedMarkerIds, handleRequestDelete]);

  const toggleCategory = useCallback((catId: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }, []);

  const toggleAll = useCallback((on: boolean) => {
    if (mapData) setActiveCategories(on ? new Set(mapData.categories.map((c) => c.id)) : new Set());
  }, [mapData]);

  // Search
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    if (!mapData || !query.trim()) { setSearchResults([]); setShowSearchResults(false); return; }
    const q = query.toLowerCase();
    const results = allMarkers().filter((m) => {
      const title = m.popup?.title?.toLowerCase() || "";
      const desc = m.popup?.description?.toLowerCase() || "";
      return title.includes(q) || desc.includes(q);
    });
    results.sort((a, b) => {
      const aT = (a.popup?.title || "").toLowerCase();
      const bT = (b.popup?.title || "").toLowerCase();
      return (aT.startsWith(q) ? 0 : 1) - (bT.startsWith(q) ? 0 : 1) || aT.length - bT.length;
    });
    setSearchResults(results.slice(0, 50));
    setShowSearchResults(results.length > 0);
  }, [allMarkers]);

  const handleSelectSearchResult = useCallback((marker: MapMarker) => {
    setSelectedMarkerId(marker.id);
    setShowSearchResults(false);
    setSearchQuery(marker.popup?.title || "");
  }, []);

  const categoryNameMap = useCallback((catId: string): string =>
    mapData?.categories.find((c) => c.id === catId)?.name || "", [mapData]);

  // ── EDITOR HANDLERS ──

  const handleToggleSelectMarker = useCallback((markerId: string) => {
    setSelectedMarkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(markerId)) next.delete(markerId); else next.add(markerId);
      return next;
    });
  }, []);

  const handleSelectMarkersInRect = useCallback((ids: string[]) => {
    setSelectedMarkerIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedMarkerIds(new Set());
  }, []);

  const handleMapClick = useCallback((x: number, y: number) => {
    if (polygonMode || selectMode) return;

    if (activePaletteCategory) {
      const id = String(nextMarkerId.current++);
      const cat = mapData?.categories.find((c) => c.id === activePaletteCategory);
      setCustomMarkers((prev) => [
        ...prev,
        { id, categoryId: activePaletteCategory, position: [x, y] as [number, number],
          popup: { title: cat?.name || "", description: "Click to edit" }, level: currentLevel, _temp: true },
      ]);
      return;
    }

    setPendingPosition([x, y]);
    setNewMarkerTitle("");
    setNewMarkerDesc("");
    setNewMarkerCategory(mapData?.categories[0]?.id || "");
    setNewMarkerLevel(currentLevel);
    setEditingMarkerId(null);
    setShowMarkerForm(true);
  }, [polygonMode, selectMode, activePaletteCategory, mapData, currentLevel]);

  const handleMarkerEdit = useCallback((markerId: string) => {
    const all = allMarkers();
    const marker = all.find((m) => m.id === markerId);
    if (!marker) return;
    setPendingPosition(marker.position);
    setNewMarkerTitle(marker.popup?.title || "");
    setNewMarkerDesc(marker.popup?.description || "");
    setNewMarkerCategory(marker.categoryId);
    setNewMarkerLevel(marker.level || currentLevel);
    setEditingMarkerId(markerId);
    setShowMarkerForm(true);
  }, [allMarkers, currentLevel]);

  const handleMarkerMove = useCallback((markerId: string, newX: number, newY: number) => {
    setCustomMarkers((prev) => {
      const existing = prev.find((m) => m.id === markerId && m._override);
      if (existing) return prev.map((m) => m.id === markerId && m._override ? { ...m, position: [newX, newY] as [number, number] } : m);
      const builtIn = mapData?.markers.find((m) => m.id === markerId);
      if (builtIn) return [...prev, { id: markerId, categoryId: builtIn.categoryId, position: [newX, newY] as [number, number], popup: builtIn.popup, level: builtIn.level, _override: true, _originalPosition: builtIn.position, _temp: false } as CustomMarker];
      return prev.map((m) => m.id === markerId ? { ...m, position: [newX, newY] as [number, number] } : m);
    });
  }, [mapData]);

  const handleSaveMarker = useCallback(() => {
    if (!pendingPosition || !newMarkerTitle.trim()) return;
    if (editingMarkerId) {
      setCustomMarkers((prev) => prev.map((m) => m.id === editingMarkerId ? { ...m, categoryId: newMarkerCategory, position: pendingPosition, popup: { title: newMarkerTitle.trim(), description: newMarkerDesc.trim() }, level: newMarkerLevel } : m));
    } else {
      const id = String(nextMarkerId.current++);
      setCustomMarkers((prev) => [...prev, { id, categoryId: newMarkerCategory, position: pendingPosition, popup: { title: newMarkerTitle.trim(), description: newMarkerDesc.trim() }, level: newMarkerLevel, _temp: true }]);
    }
    setShowMarkerForm(false);
    setPendingPosition(null);
    setEditingMarkerId(null);
    setNewMarkerTitle(""); setNewMarkerDesc("");
  }, [pendingPosition, newMarkerTitle, newMarkerDesc, newMarkerCategory, newMarkerLevel, editingMarkerId]);

  const handleDeleteMarkerConfirm = useCallback(() => {
    if (!editingMarkerId) return;
    setCustomMarkers((prev) => prev.filter((m) => m.id !== editingMarkerId));
    setShowMarkerForm(false);
    setPendingPosition(null);
    setEditingMarkerId(null);
  }, [editingMarkerId]);

  const handlePolygonPoint = useCallback((x: number, y: number) => {
    setPolygonPoints((prev) => [...prev, [x, y]]);
  }, []);

  const handleCompletePolygon = useCallback(() => {
    if (polygonPoints.length < 3) return;
    setShowPolygonForm(true);
  }, [polygonPoints]);

  const handleSavePolygon = useCallback(() => {
    setSavedPolygons((prev) => [...prev, { id: String(nextPolyId.current++), points: [...polygonPoints], label: newPolygonLabel.trim(), category: newPolygonCategory || mapData?.categories[0]?.id || "", level: newPolygonLevel }]);
    setPolygonPoints([]);
    setShowPolygonForm(false);
    setNewPolygonLabel(""); setNewPolygonCategory(""); setNewPolygonLevel(currentLevel);
  }, [polygonPoints, newPolygonLabel, newPolygonCategory, newPolygonLevel, mapData, currentLevel]);

  const handleUndoLastPoint = useCallback(() => setPolygonPoints((prev) => prev.slice(0, -1)), []);
  const handleCancelPolygon = useCallback(() => setPolygonPoints([]), []);
  const handleDeletePolygon = useCallback((id: string) => setSavedPolygons((prev) => prev.filter((p) => p.id !== id)), []);

  const handleExport = useCallback(() => {
    const exportData = {
      markers: customMarkers.filter((m) => !m._override).map(({ _temp, ...m }) => m),
      markerOverrides: customMarkers.filter((m) => m._override).map(({ _override, _originalPosition, _temp, ...m }) => ({ id: m.id, position: m.position })),
      polygons: savedPolygons, map: selectedMap, exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${selectedMap}-custom-data.json`; a.click();
    URL.revokeObjectURL(url);
  }, [customMarkers, savedPolygons, selectedMap]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImport = useCallback(() => fileInputRef.current?.click(), []);
  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.markers) setCustomMarkers((prev) => [...prev, ...data.markers.map((m: any) => ({ ...m, _temp: true }))]);
        if (data.markerOverrides) setCustomMarkers((prev) => [...prev, ...data.markerOverrides.map((m: any) => ({ ...m, _override: true, _temp: false }))]);
        if (data.polygons) setSavedPolygons((prev) => [...prev, ...data.polygons]);
      } catch (err) { console.error("Import failed", err); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const visibleMarkers = allMarkers().filter((m) => m.level === currentLevel);
  const visiblePolygons = savedPolygons.filter((p) => p.level === currentLevel);

  // Floor-specific schematic images with their pixel dimensions
  const FLOOR_IMAGES: Record<string, Record<string, { file: string; bounds: number[][] }>> = {
    airport: {
      "Periphery": { file: "airport-periphery.png", bounds: [[0,0],[1820,1024]] },
      "1F": { file: "airport-1f.png", bounds: [[0,0],[792,862]] },
      "2F": { file: "airport-2f.png", bounds: [[0,0],[832,867]] },
    },
    armory: {
      "B1": { file: "armory-b1.png", bounds: [[0,0],[1026,842]] },
      "1F": { file: "armory-1f.png", bounds: [[0,0],[1012,826]] },
      "2F": { file: "armory-2f.png", bounds: [[0,0],[992,832]] },
    },
    "tv-station": {
      "1F": { file: "tv-station-1f.png", bounds: [[0,0],[857,870]] },
      "2F": { file: "tv-station-2f.png", bounds: [[0,0],[832,882]] },
    },
    northridge: {
      "1F": { file: "northridge-1f.png", bounds: [[0,0],[776,761]] },
      "2F": { file: "northridge-2f.png", bounds: [[0,0],[777,762]] },
      "3F": { file: "northridge-3f.png", bounds: [[0,0],[777,762]] },
    },
  };
  const floorInfo = FLOOR_IMAGES[selectedMap]?.[currentLevel];
  const currentMapImage = floorInfo?.file || `${selectedMap}.png`;
  const currentMapBounds = floorInfo?.bounds || mapData?.mapBounds || [[0,0],[100,100]];

  const stableMapData = useMemo(
    () => mapData ? ({ ...mapData, markers: allMarkers(), mapImage: currentMapImage, mapBounds: currentMapBounds }) : null,
    [mapData, customMarkers, deletedMarkerIds, currentMapImage, currentMapBounds]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-text-secondary text-sm">Loading map data...</div>
        </div>
      </div>
    );
  }

  if (!mapData) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-red-400 text-lg">
          {selectedMap === "airport" ? "Airport — add markers with the editor!" : "Failed to load map data."}
        </div>
      </div>
    );
  }

  const solidCategories = mapData.categories.filter((c) => !c.icon && c.symbol);
  const iconCategories = mapData.categories.filter((c) => c.icon);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-background border-r border-white/5 flex flex-col flex-shrink-0 overflow-hidden">
        {/* Header with inline map selector */}
        <div className="p-4 border-b border-white/5 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-display font-bold text-lg text-white">ABI <span className="text-gradient">Maps</span></h1>
            <Link href="/maps" className="text-xs px-2 py-1 rounded bg-surface-elevated/60 text-text-secondary hover:text-primary border border-white/5 hover:border-primary/30 transition-all">← Back</Link>
          </div>
          <select value={selectedMap} onChange={(e) => window.location.href = `/maps/${e.target.value}`}
            className="w-full bg-surface-elevated/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-all">
            {maps.map((m) => (<option key={m.id} value={m.id} className="bg-background">{m.mapName}</option>))}
          </select>
        </div>

        {/* Collapsible Section: Floors */}
        <div className="border-b border-white/5">
          <button onClick={() => toggleSection('floors')} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Floors</span>
            <svg className={`w-3 h-3 text-text-secondary transition-transform duration-200 ${collapsedSections.has('floors') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.has('floors') && (
            <div className="px-3 pb-3">
              <div className="flex flex-wrap gap-1">
                {levels.map((level) => (
                  <button key={level} onClick={() => setCurrentLevel(level)}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${currentLevel === level ? "bg-gradient-to-r from-primary to-accent text-background font-bold shadow-sm shadow-primary/20" : "bg-surface-elevated/60 text-text-secondary hover:text-white hover:bg-surface-elevated border border-white/5"}`}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Section: Search */}
        <div className="border-b border-white/5 relative">
          <button onClick={() => toggleSection('search')} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Search</span>
            <svg className={`w-3 h-3 text-text-secondary transition-transform duration-200 ${collapsedSections.has('search') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.has('search') && (
            <div className="px-3 pb-3">
              <div className="relative group">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary group-focus-within:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  placeholder="Search markers..."
                  className="w-full bg-surface-elevated/60 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-text-secondary/50 focus:outline-none focus:border-primary/50 transition-all" />
              </div>
              {showSearchResults && searchResults.length > 0 && (
                <div className="mt-1 bg-surface-elevated/95 border border-white/10 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto backdrop-blur-lg">
                  {searchResults.map((marker) => (
                    <button key={marker.id} onMouseDown={(e) => { e.preventDefault(); handleSelectSearchResult(marker); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-white/5 text-xs flex items-center gap-2 border-b border-white/5 last:border-0 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-primary" />
                      <span className="text-gray-200 truncate flex-1">{marker.popup?.title || "Unknown"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Section: Editor Tools */}
        <div className="border-b border-white/5">
          <button onClick={() => toggleSection('editor')} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Editor {editMode ? <span className="ml-1.5 text-xs px-1 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-medium">ACTIVE</span> : ''}</span>
            <svg className={`w-3 h-3 text-text-secondary transition-transform duration-200 ${collapsedSections.has('editor') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {!collapsedSections.has('editor') && (
            <div className="px-3 pb-3">
              <div className="flex gap-1">
                <button onClick={() => { const newMode = !editMode; setEditMode(newMode); if (!newMode) { setPolygonMode(false); setSelectMode(false); setSelectedMarkerIds(new Set()); setActivePaletteCategory(null); } }}
                  className={`flex-1 text-xs px-2 py-1.5 rounded font-medium transition-all ${editMode ? "bg-gradient-to-r from-primary to-accent text-background font-bold" : "bg-surface-elevated/60 text-text-secondary hover:bg-surface-elevated border border-white/5"}`}>
                  {editMode ? "Exit Edit" : "Edit Mode"}
                </button>
              </div>
              {editMode && (
                <div className="mt-2 space-y-1.5">
                  <button onClick={() => { setSelectMode(!selectMode); if (!selectMode) setPolygonMode(false); }}
                    className={`w-full text-xs px-2 py-1.5 rounded font-medium transition-all ${selectMode ? "bg-gradient-to-r from-primary to-accent text-background font-bold" : "bg-surface-elevated/60 text-text-secondary hover:bg-surface-elevated border border-white/5"}`}>
                    {selectMode ? "Select Mode (ON)" : "Select Mode"}
                  </button>
                  {selectMode && (
                    <div className="flex gap-1">
                      <button onClick={handleClearSelection} disabled={selectedMarkerIds.size === 0}
                        className="flex-1 text-xs px-2 py-1 rounded bg-surface-elevated text-text-secondary border border-white/5 disabled:opacity-30 hover:bg-white/10 transition-all">Deselect ({selectedMarkerIds.size})</button>
                      <button onClick={handleRequestDelete} disabled={selectedMarkerIds.size === 0}
                        className="flex-1 text-xs px-2 py-1 rounded bg-danger/20 text-danger border border-danger/30 disabled:opacity-30 hover:bg-danger/30 transition-all">Delete ({selectedMarkerIds.size})</button>
                    </div>
                  )}
                  <button onClick={() => { setPolygonMode(!polygonMode); if (!polygonMode) { setSelectMode(false); setShowMarkerForm(false); } }}
                    className={`w-full text-xs px-2 py-1.5 rounded font-medium transition-all ${polygonMode ? "bg-gradient-to-r from-primary to-accent text-background font-bold" : "bg-surface-elevated/60 text-text-secondary hover:bg-surface-elevated border border-white/5"}`}>
                    {polygonMode ? "Draw Polygon (ON)" : "Draw Polygon"}
                  </button>
                  {polygonMode && (
                    <div className="flex gap-1">
                      <button onClick={handleCompletePolygon} disabled={polygonPoints.length < 3}
                        className="flex-1 text-xs px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 disabled:opacity-30 font-medium hover:bg-primary/30 transition-all">Finish ({polygonPoints.length}pts)</button>
                      <button onClick={handleUndoLastPoint} disabled={polygonPoints.length === 0}
                        className="text-xs px-2 py-1 rounded bg-surface-elevated text-text-secondary border border-white/5 disabled:opacity-30 hover:bg-white/10 transition-all">Undo</button>
                      <button onClick={handleCancelPolygon} className="text-xs px-2 py-1 rounded bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 transition-all">Cancel</button>
                    </div>
                  )}
                  <div className="text-[11px] text-text-secondary/60 space-y-0.5">
                    <p>Custom: {customMarkers.filter((m) => !m._override).length} · Overrides: {customMarkers.filter((m) => m._override).length}</p>
                    <p>Polygons: {savedPolygons.length}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={handleExport} className="flex-1 text-xs px-2 py-1 rounded bg-surface-elevated/60 text-text-secondary border border-white/5 hover:border-primary/30 hover:text-primary transition-all">Export</button>
                    <button onClick={handleImport} className="flex-1 text-xs px-2 py-1 rounded bg-surface-elevated/60 text-text-secondary border border-white/5 hover:border-primary/30 hover:text-primary transition-all">Import</button>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelected} className="hidden" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Section: Categories */}
        <div className="flex-1 overflow-y-auto border-b border-white/5">
          <div onClick={() => toggleSection('categories')} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('categories'); } }}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors sticky top-0 bg-background z-10 cursor-pointer">
            <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Categories ({activeCategories.size}/{mapData.categories.length})</span>
            <div className="flex items-center gap-2">
              {!collapsedSections.has('categories') && (
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); toggleAll(true); }} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated/60 text-text-secondary hover:text-primary border border-white/5 transition-colors">All</button>
                  <button onClick={(e) => { e.stopPropagation(); toggleAll(false); }} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated/60 text-text-secondary hover:text-primary border border-white/5 transition-colors">None</button>
                </div>
              )}
              <svg className={`w-3 h-3 text-text-secondary transition-transform duration-200 ${collapsedSections.has('categories') ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {!collapsedSections.has('categories') && (
            <div className="px-3 pb-3 space-y-0.5">
              {iconCategories.map((cat) => {
                const iconFile = cat.icon.replace("File:", "");
                return (
                  <label key={cat.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer text-xs transition-colors">
                    <input type="checkbox" checked={activeCategories.has(cat.id)} onChange={() => toggleCategory(cat.id)}
                      className="rounded border-white/10 bg-surface-elevated text-primary focus:ring-primary/50 focus:ring-offset-0 w-3 h-3" />
                    <img src={`/icons/${iconFile}`} alt={cat.name} className="w-4 h-4 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span className="text-gray-300 truncate flex-1">{cat.name}</span>
                    <span className="text-text-secondary/50 flex-shrink-0">{visibleMarkers.filter((m) => m.categoryId === cat.id).length}</span>
                  </label>
                );
              })}
              {solidCategories.length > 0 && (
                <><div className="border-t border-white/5 my-1.5" />{solidCategories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 cursor-pointer text-xs transition-colors">
                    <input type="checkbox" checked={activeCategories.has(cat.id)} onChange={() => toggleCategory(cat.id)}
                      className="rounded border-white/10 bg-surface-elevated text-primary focus:ring-primary/50 focus:ring-offset-0 w-3 h-3" />
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-gray-300 truncate flex-1">{cat.name}</span>
                  </label>
                ))}</>
              )}
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="p-3 text-[11px] text-text-secondary/50 flex-shrink-0">
          <p>Markers: {visibleMarkers.length} on {currentLevel}</p>
          <p>Polygons: {visiblePolygons.length}</p>
        </div>
      </aside>

      {/* Map Area */}
      <main className="flex-1 relative bg-background">
        <div className="map-bg-pattern" />
        {/* Edit mode badge */}
        {editMode && (
          <div className="absolute top-3 right-3 z-[1000] glass rounded-lg px-3 py-1.5 border border-primary/30">
            <span className="text-xs text-primary font-medium">
              {selectMode ? `Select mode — ${selectedMarkerIds.size} selected` : polygonMode ? `Drawing polygon (${polygonPoints.length} pts)` : activePaletteCategory ? `Placing: ${categoryNameMap(activePaletteCategory)} — click map` : "Click map · Drag markers · ⌫ Delete"}
            </span>
          </div>
        )}

        {/* Marker Palette */}
        {editMode && !selectMode && !polygonMode && (
          <div className="absolute right-3 top-16 bottom-3 z-[1000] w-16 overflow-y-auto">
            <div className="glass-elevated rounded-xl p-2 space-y-1.5 border border-white/5">
              {mapData.categories.map((cat) => {
                const isActive = activePaletteCategory === cat.id;
                const iconFile = cat.icon?.replace("File:", "");
                const hasIcon = iconFile && cat.icon?.startsWith("File:");
                return (
                  <button key={cat.id} onClick={() => setActivePaletteCategory(isActive ? null : cat.id)} title={cat.name}
                    className={`w-full aspect-square rounded-lg flex items-center justify-center transition-all ${isActive ? "bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/20 ring-2 ring-white/20" : "bg-surface-elevated/80 hover:bg-surface-elevated border border-white/5 hover:border-primary/30"}`}>
                    {hasIcon ? <img src={`/icons/${iconFile}`} alt={cat.name} className="w-6 h-6 object-contain" /> : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: cat.color, color: cat.symbolColor || "#fff" }}>{cat.symbol || "?"}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selection info bar */}
        {selectMode && selectedMarkerIds.size > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] glass-elevated rounded-xl px-4 py-2 border border-primary/30 flex items-center gap-3">
            <span className="text-xs text-white font-medium">{selectedMarkerIds.size} selected</span>
            <button onClick={handleClearSelection} className="text-xs px-2 py-1 rounded bg-surface-elevated text-text-secondary border border-white/5 hover:bg-white/10 transition-all">Deselect</button>
            <button onClick={handleRequestDelete} className="text-xs px-2 py-1 rounded bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 transition-all">Delete</button>
            <span className="text-xs text-text-secondary/70">or press Delete key</span>
          </div>
        )}

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="glass-elevated rounded-xl shadow-2xl p-6 w-80 border border-white/10">
              <h3 className="font-display font-bold text-base text-white mb-2">Delete Markers?</h3>
              <p className="text-sm text-text-secondary mb-5">
                This will permanently remove <strong className="text-danger">{pendingDeleteCount}</strong> selected marker{pendingDeleteCount !== 1 ? "s" : ""} from this map.
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setShowDeleteConfirm(false); setPendingDeleteCount(0); }}
                  className="flex-1 text-xs px-3 py-2 rounded bg-surface-elevated text-text-secondary border border-white/5 hover:bg-white/10 transition-all font-medium">Cancel</button>
                <button onClick={handleConfirmDelete}
                  className="flex-1 text-xs px-3 py-2 rounded bg-danger text-white font-bold hover:bg-red-600 transition-all">Delete {pendingDeleteCount}</button>
              </div>
            </div>
          </div>
        )}

        {/* Marker form */}
        {showMarkerForm && pendingPosition && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] glass-elevated rounded-xl shadow-2xl p-4 w-80 border border-white/10">
            <h3 className="font-display font-bold text-sm text-white mb-3">{editingMarkerId ? "Edit Marker" : "Add Marker"}</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-text-secondary block mb-0.5">Position</label>
                <input type="text" readOnly value={`${pendingPosition[0].toFixed(0)}, ${pendingPosition[1].toFixed(0)}`}
                  className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-text-secondary" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-text-secondary block mb-0.5">Category</label>
                  <select value={newMarkerCategory} onChange={(e) => setNewMarkerCategory(e.target.value)}
                    className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50 transition-all">
                    {mapData.categories.map((c) => (<option key={c.id} value={c.id} className="bg-background">{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-0.5">Level</label>
                  <select value={newMarkerLevel} onChange={(e) => setNewMarkerLevel(e.target.value)}
                    className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50 transition-all">
                    {levels.map((l) => (<option key={l} value={l} className="bg-background">{l}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-0.5">Title</label>
                <input type="text" value={newMarkerTitle} onChange={(e) => setNewMarkerTitle(e.target.value)} placeholder="Marker name"
                  className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-text-secondary/50 focus:outline-none focus:border-primary/50 transition-all" />
              </div>
              <div>
                <label className="text-xs text-text-secondary block mb-0.5">Description</label>
                <textarea value={newMarkerDesc} onChange={(e) => setNewMarkerDesc(e.target.value)} placeholder="Details..."
                  className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-text-secondary/50 focus:outline-none focus:border-primary/50 transition-all resize-none" rows={2} />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveMarker} disabled={!newMarkerTitle.trim()}
                  className="flex-1 text-xs px-3 py-1.5 rounded bg-gradient-to-r from-primary to-accent text-background font-bold disabled:opacity-30 hover:shadow-lg hover:shadow-primary/20 transition-all">{editingMarkerId ? "Update" : "Save"}</button>
                {editingMarkerId && <button onClick={handleDeleteMarkerConfirm} className="text-xs px-3 py-1.5 rounded bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 transition-all">Delete</button>}
                <button onClick={() => { setShowMarkerForm(false); setPendingPosition(null); setEditingMarkerId(null); }}
                  className="text-xs px-3 py-1.5 rounded bg-surface-elevated text-text-secondary border border-white/5 hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Polygon form */}
        {showPolygonForm && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] glass-elevated rounded-xl shadow-2xl p-4 w-80 border border-white/10">
            <h3 className="font-display font-bold text-sm text-white mb-3">Save Polygon</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-text-secondary block mb-0.5">Label</label>
                <input type="text" value={newPolygonLabel} onChange={(e) => setNewPolygonLabel(e.target.value)} placeholder="Zone name"
                  className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-text-secondary/50 focus:outline-none focus:border-primary/50 transition-all" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-text-secondary block mb-0.5">Category</label>
                  <select value={newPolygonCategory} onChange={(e) => setNewPolygonCategory(e.target.value)}
                    className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50 transition-all">
                    {mapData.categories.map((c) => (<option key={c.id} value={c.id} className="bg-background">{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-secondary block mb-0.5">Level</label>
                  <select value={newPolygonLevel} onChange={(e) => setNewPolygonLevel(e.target.value)}
                    className="w-full bg-background/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary/50 transition-all">
                    {levels.map((l) => (<option key={l} value={l} className="bg-background">{l}</option>))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-text-secondary/70">{polygonPoints.length} vertices</p>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSavePolygon} className="flex-1 text-xs px-3 py-1.5 rounded bg-gradient-to-r from-primary to-accent text-background font-bold hover:shadow-lg hover:shadow-primary/20 transition-all">Save</button>
                <button onClick={() => setShowPolygonForm(false)} className="text-xs px-3 py-1.5 rounded bg-surface-elevated text-text-secondary border border-white/5 hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Saved polygons */}
        {visiblePolygons.length > 0 && (() => {
          const b = mapData.mapBounds;
          const w = b[1][0]; const h = b[1][1];
          return (
            <svg className="absolute inset-0 z-[500] pointer-events-none" width="100%" height="100%" style={{ clipPath: "inset(0)" }}>
              {visiblePolygons.map((poly) => (
                <polygon key={poly.id} points={poly.points.map(([x, y]) => `${(x / w) * 100}% ${(y / h) * 100}%`).join(", ")}
                  fill="rgba(212, 175, 55, 0.08)" stroke="#D4AF37" strokeWidth="2" strokeDasharray="4,3" className="pointer-events-auto">
                  <title>{poly.label || poly.id}</title>
                </polygon>
              ))}
            </svg>
          );
        })()}

        {editMode && visiblePolygons.length > 0 && (
          <div className="absolute bottom-3 right-3 z-[1000] space-y-1">
            {visiblePolygons.map((poly) => (
              <button key={poly.id} onClick={() => handleDeletePolygon(poly.id)}
                className="block text-xs px-2 py-1 rounded bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30 transition-all">
                Delete: {poly.label || `Polygon ${poly.id}`}
              </button>
            ))}
          </div>
        )}

        {stableMapData && (
        <MapView
          mapData={stableMapData}
          activeCategories={activeCategories}
          focusMarkerId={selectedMarkerId}
          onFocusDone={() => setSelectedMarkerId(null)}
          editMode={editMode}
          selectMode={selectMode}
          polygonMode={polygonMode}
          onMapClick={handleMapClick}
          onPolygonPoint={handlePolygonPoint}
          onMarkerEdit={handleMarkerEdit}
          onMarkerMove={handleMarkerMove}
          polygonPoints={polygonPoints}
          currentLevel={currentLevel}
          selectedMarkerIds={selectedMarkerIds}
          onToggleSelectMarker={handleToggleSelectMarker}
          onSelectMarkersInRect={handleSelectMarkersInRect}
        />
        )}
      </main>
    </div>
  );
}
