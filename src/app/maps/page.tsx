"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface MapItem {
  id: string;
  mapName: string;
}

const MAP_TAG: Record<string, string> = {
  farm: "Balanced · Open fields & compounds",
  valley: "Adaptive · Forests, waterways & high ground",
  "valley-distortion": "Unpredictable · Warped familiar ground",
  armory: "CQB · Indoor military fortress",
  "tv-station": "CQB · Fast-paced broadcast center",
  northridge: "Sniper · Large outdoor mountain ridge",
  airport: "Mixed · Massive terminals & runways",
};

const MAP_DESC: Record<string, string> = {
  farm: "A medium-sized rural map where open farmlands meet dense compounds. Engagements shift between long-range field crossings and tight room-to-room combat inside barns and farmhouses. Adapt your gear to the terrain — this map rewards versatility.",
  valley: "Diverse terrain spanning thick forests, open waterways, and rocky high grounds. Each sector demands a different approach: stealth through the treeline, ranged picks across the lake, or close-quarters in the caves. A map for every playstyle.",
  "valley-distortion": "A corrupted echo of Valley. Familiar landmarks remain but the flow between them has been twisted — sightlines cut short, cover turned to kill boxes, rotations become gambles. Trust your instincts, not your memory.",
  armory: "Relentless indoor combat inside a fortified military complex. Corridors, armories, and vaults create a constant close-quarters pressure cooker. Shotguns and SMGs reign supreme. Every door is a decision.",
  "tv-station": "High-intensity PvP through a multi-story broadcast hub. Studio floors, editing suites, and underground parking create layered vertical fights. Fast rotations, audio cues matter, and no two rounds play the same.",
  northridge: "An open alpine map defined by long sightlines and vertical combat. POIs are spread across the ridge — from caves to summit outposts. Pack a scope and control the high ground or navigate the valleys for flank plays.",
  airport: "A sprawling map that blends indoor and outdoor warfare. Terminal buildings offer CQB with long corridors, while the tarmac and cargo areas reward ranged builds. The transition zones are where fights are won and lost.",
};

export default function HomePage() {
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredMap, setHoveredMap] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/maps")
      .then((r) => r.json())
      .then((data: MapItem[]) => {
        setMaps(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">
              ABI <span className="text-gradient">Maps</span>
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              Arena Breakout Infinite — Interactive Maps
            </p>
          </div>
          <a href="https://abibuilder.com" target="_blank" rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg bg-surface-elevated/60 text-text-secondary hover:text-primary border border-white/5 hover:border-primary/30 transition-all">
            ABI Builder
          </a>
        </div>
      </header>

      {/* Vertical Chevron Strip */}
      <main className="flex-1 flex items-center justify-center py-12">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-text-secondary">Loading maps...</span>
          </div>
        ) : (
          <div className="w-full max-w-4xl flex flex-col items-center">
            {maps.map((map, index) => {
              const isHovered = hoveredMap === map.id;
              const tileHeight = isHovered ? 210 : 85;

              // Consistent parallelogram — all tiles slant the same direction
              // Top shifted right 3%, bottom shifted left 3% — fits like shingles
              const clipPath = "polygon(3% 0, 100% 0, 97% 100%, 0% 100%)";

              return (
                <Link
                  key={map.id}
                  href={`/maps/${map.id}`}
                  className={`relative w-full cursor-pointer select-none ${
                    isHovered ? "z-20" : "z-10"
                  }`}
                  style={{
                    height: tileHeight,
                    clipPath,
                    marginTop: index === 0 ? 0 : -3,
                    transition: "height 0.35s cubic-bezier(0.4, 0, 0.2, 1), clip-path 0.35s ease",
                  }}
                  onMouseEnter={() => setHoveredMap(map.id)}
                  onMouseLeave={() => setHoveredMap(null)}
                >
                  {/* Background image */}
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={`/maps/previews/${map.id}.png`}
                      alt={map.mapName}
                      className={`w-full h-full object-cover transition-all duration-500 ${
                        isHovered ? "scale-110" : "scale-100"
                      }`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `/maps/${map.id}.png`;
                      }}
                    />
                    {/* Gradient overlay for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/30 to-background/70" />
                  </div>

                  {/* Gold accent stripe */}
                  <div className={`absolute left-0 top-0 bottom-0 bg-gradient-to-b from-primary to-accent transition-all duration-350 ${
                    isHovered ? "w-1.5" : "w-[3px]"
                  }`} />

                  {/* Main content area */}
                  <div className="absolute inset-0 flex items-center flex-row">
                    <div className="flex-1 min-w-0 px-8 text-left">
                      {/* Map name */}
                      <h2 className={`font-display font-bold text-white transition-all duration-350 ${
                        isHovered ? "text-4xl tracking-tight" : "text-2xl tracking-normal"
                      }`}>
                        {map.mapName}
                      </h2>

                      {/* Description + CTA — slides down on hover */}
                      <div className={`overflow-hidden transition-all duration-400 ${
                        isHovered ? "max-h-32 opacity-100 mt-2.5" : "max-h-0 opacity-0 mt-0"
                      }`}>
                        <div className="w-8 h-px bg-primary/60 mb-2" />
                        <p className="text-sm text-white/80 leading-snug max-w-xl">
                          {MAP_DESC[map.id]}
                        </p>
                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-widest group">
                          <span>Explore Map</span>
                          <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Right side: Narrow decorative ribbon */}
                    <div
                      className="relative flex-shrink-0 flex items-center justify-center transition-all duration-350"
                      style={{
                        width: isHovered ? "120px" : "76px",
                        minWidth: isHovered ? "120px" : "76px",
                        height: "100%",
                      }}
                    >
                      {/* Ribbon background — slanted parallelogram */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: "linear-gradient(180deg, rgba(212,175,55,0.92) 0%, rgba(201,169,97,0.92) 100%)",
                          clipPath: "polygon(8% 0, 100% 0, 100% 100%, 0% 100%)",
                        }}
                      />

                      {/* Ribbon content — centered */}
                      <div className="relative z-10 px-2 text-center">
                        <span className={`font-display font-bold text-background uppercase tracking-wider transition-all duration-350 ${
                          isHovered ? "text-sm" : "text-[10px]"
                        }`}>
                          VIEW
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {/* Bottom decorative strip */}
            <div
              className="w-full max-w-4xl h-[3px] bg-gradient-to-r from-primary/40 via-accent/30 to-transparent"
              style={{
                clipPath: "polygon(3% 0, 100% 0, 97% 100%, 0% 100%)",
                marginTop: -3,
              }}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-text-secondary/50">
            ABI Interactive Maps — Fan project for Arena Breakout Infinite
          </p>
          <span className="text-xs text-text-secondary/50">
            {maps.length} maps available
          </span>
        </div>
      </footer>
    </div>
  );
}
