import { NextRequest, NextResponse } from "next/server";
import farmData from "@/../public/data/farm.json";
import valleyData from "@/../public/data/valley.json";
import armoryData from "@/../public/data/armory.json";
import tvStationData from "@/../public/data/tv-station.json";
import northridgeData from "@/../public/data/northbridge-converted.json";
import airportData from "@/../public/data/airport.json";

const mapDataMap: Record<string, unknown> = {
  farm: farmData,
  valley: valleyData,
  armory: armoryData,
  "tv-station": tvStationData,
  northridge: northridgeData,
  airport: airportData,
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ map: string }> }
) {
  const { map } = await params;
  const data = mapDataMap[map];

  if (!data) {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
