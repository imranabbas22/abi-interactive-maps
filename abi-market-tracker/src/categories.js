// ABI Market Tracker — category map (all 72 minorIds on abi-tracker)
// Category tree from abi-tracker.azurewebsites.net/Market/View

export const CATEGORIES = [
  // EQUIPMENT
  { minorId: "30104", name: "Helmets" },
  { minorId: "30105", name: "Face Shields" },
  { minorId: "30106", name: "Armor Vests" },
  { minorId: "3010101", name: "Rig (No Armor)" },
  { minorId: "3010102", name: "Rig (Armored)" },
  { minorId: "30102", name: "Backpacks" },
  { minorId: "30103", name: "Headsets" },
  { minorId: "3011502", name: "Gas Masks" },
  // WEAPON PARTS
  { minorId: "20103", name: "Sights" },
  { minorId: "20105", name: "Magazines" },
  { minorId: "20101", name: "Foregrips" },
  { minorId: "20102", name: "Rear Grips" },
  { minorId: "20104", name: "Stocks" },
  { minorId: "20107", name: "Muzzles" },
  { minorId: "20116", name: "Lasers" },
  { minorId: "20111", name: "Barrels" },
  { minorId: "20108", name: "Handguards" },
  { minorId: "20110", name: "Receivers" },
  { minorId: "20106", name: "Rails" },
  { minorId: "20114", name: "Gas Blocks" },
  { minorId: "20115", name: "Bolts" },
  { minorId: "20112", name: "Flashlights" },
  // WEAPONS
  { minorId: "10101", name: "Assault Rifles" },
  { minorId: "10102", name: "SMGs" },
  { minorId: "10106", name: "Shotguns" },
  { minorId: "10105", name: "LMGs" },
  { minorId: "10104", name: "Bolt Actions" },
  { minorId: "10103", name: "Marksman" },
  { minorId: "10108", name: "Carbines" },
  { minorId: "10201", name: "Pistols" },
  // AMMO
  { minorId: "20210", name: "5.45x39mm" },
  { minorId: "20203", name: "5.56x45mm" },
  { minorId: "20208", name: "5.7x28mm" },
  { minorId: "20217", name: "5.8x42mm" },
  { minorId: "20214", name: "7.62x25mm" },
  { minorId: "20201", name: "7.62x39mm" },
  { minorId: "20206", name: "7.62x51mm" },
  { minorId: "20202", name: "7.62x54mm" },
  { minorId: "20204", name: "9x19mm" },
  { minorId: "20209", name: "9x39mm" },
  { minorId: "20205", name: "12x70mm" },
  { minorId: "20212", name: ".44" },
  { minorId: "20213", name: ".45" },
  { minorId: "20215", name: ".338" },
  // MEDICAL
  { minorId: "40101", name: "Medicines" },
  { minorId: "40103", name: "Trauma Kits" },
  { minorId: "40104", name: "Medical Bags" },
  { minorId: "40105", name: "Injectors" },
  // THROWABLES
  { minorId: "104", name: "Throwables" },
  // KEYS
  { minorId: "40501", name: "Farm Keys" },
  { minorId: "40502", name: "Northridge Keys" },
  { minorId: "40503", name: "Valley Keys" },
  { minorId: "40504", name: "Frontline Keys" },
  { minorId: "40505", name: "TV Station Keys" },
  { minorId: "40506", name: "Port Keys" },
  { minorId: "40507", name: "Airport Keys" },
  // MISC
  { minorId: "40815", name: "Vouchers" },
  { minorId: "40801", name: "Flammables" },
  { minorId: "40802", name: "Construction" },
  { minorId: "40803", name: "Computer Parts" },
  { minorId: "40804", name: "Energy" },
  { minorId: "40805", name: "Tools" },
  { minorId: "40806", name: "Daily Items" },
  { minorId: "40807", name: "Medical Scrap" },
  { minorId: "40808", name: "Collectibles" },
  { minorId: "40809", name: "Paper Goods" },
  { minorId: "40810", name: "Instruments" },
  { minorId: "40812", name: "Military" },
  { minorId: "40813", name: "Boss Tokens" },
  { minorId: "40814", name: "Electronics" },
  // FOOD
  { minorId: "40401", name: "Drinks" },
  { minorId: "40402", name: "Food" },
];

export const TRACKER_BASE = "https://abi-tracker.azurewebsites.net";
export const MARKET_URL = (minorId) => `${TRACKER_BASE}/Market/View?minorId=${minorId}`;
