import { NextResponse } from "next/server";

export async function GET() {
  const maps = [
    { id: "farm", mapName: "Farm" },
    { id: "valley", mapName: "Valley" },
    { id: "valley-distortion", mapName: "Valley Distortion" },
    { id: "armory", mapName: "Armory" },
    { id: "tv-station", mapName: "TV Station" },
    { id: "northridge", mapName: "Northridge" },
    { id: "airport", mapName: "Airport" },
  ];

  return NextResponse.json(maps);
}
