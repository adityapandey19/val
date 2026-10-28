export interface CountryConfig {
  country: string;
  country_code: string;
  iso3: string;
  currency_code: string;
  default_province: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  grid_connection_type: string;
  distance_to_grid_km: number;
  wb_country_code: string;
  slug: string;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  PG: {
    country: "Papua New Guinea",
    country_code: "PG",
    iso3: "PNG",
    currency_code: "PGK",
    default_province: "National Capital District",
    coordinates: { latitude: -9.416667, longitude: 147.166667 },
    grid_connection_type: "Grid-Connected",
    distance_to_grid_km: 5.0,
    wb_country_code: "PG",
    slug: "papua-new-guinea",
  },
  FJ: {
    country: "Fiji",
    country_code: "FJ",
    iso3: "FJI",
    currency_code: "FJD",
    default_province: "Central",
    coordinates: { latitude: -18.1416, longitude: 178.4419 },
    grid_connection_type: "Grid-Connected",
    distance_to_grid_km: 5.0,
    wb_country_code: "FJ",
    slug: "fiji",
  },
  VU: {
    country: "Vanuatu",
    country_code: "VU",
    iso3: "VUT",
    currency_code: "VUV",
    default_province: "Shefa",
    coordinates: { latitude: -17.7333, longitude: 168.3273 },
    grid_connection_type: "Mini-Grid",
    distance_to_grid_km: 10.0,
    wb_country_code: "VU",
    slug: "vanuatu",
  },
  SB: {
    country: "Solomon Islands",
    country_code: "SB",
    iso3: "SLB",
    currency_code: "SBD",
    default_province: "Honiara",
    coordinates: { latitude: -9.4456, longitude: 159.9729 },
    grid_connection_type: "Mini-Grid",
    distance_to_grid_km: 8.0,
    wb_country_code: "SB",
    slug: "solomon-islands",
  },
  TO: {
    country: "Tonga",
    country_code: "TO",
    iso3: "TON",
    currency_code: "TOP",
    default_province: "Tongatapu",
    coordinates: { latitude: -21.1789, longitude: -175.1982 },
    grid_connection_type: "Grid-Connected",
    distance_to_grid_km: 4.0,
    wb_country_code: "TO",
    slug: "tonga",
  },
  WS: {
    country: "Samoa",
    country_code: "WS",
    iso3: "WSM",
    currency_code: "WST",
    default_province: "Tuamasaga",
    coordinates: { latitude: -13.8333, longitude: -171.7667 },
    grid_connection_type: "Grid-Connected",
    distance_to_grid_km: 5.0,
    wb_country_code: "WS",
    slug: "samoa",
  },
  KI: {
    country: "Kiribati",
    country_code: "KI",
    iso3: "KIR",
    currency_code: "AUD",
    default_province: "South Tarawa",
    coordinates: { latitude: 1.3278, longitude: 172.9772 },
    grid_connection_type: "Off-Grid",
    distance_to_grid_km: 25.0,
    wb_country_code: "KI",
    slug: "kiribati",
  },
  TV: {
    country: "Tuvalu",
    country_code: "TV",
    iso3: "TUV",
    currency_code: "AUD",
    default_province: "Funafuti",
    coordinates: { latitude: -8.5167, longitude: 179.2167 },
    grid_connection_type: "Off-Grid",
    distance_to_grid_km: 15.0,
    wb_country_code: "TV",
    slug: "tuvalu",
  },
  MH: {
    country: "Marshall Islands",
    country_code: "MH",
    iso3: "MHL",
    currency_code: "USD",
    default_province: "Majuro",
    coordinates: { latitude: 7.1315, longitude: 171.1845 },
    grid_connection_type: "Mini-Grid",
    distance_to_grid_km: 8.0,
    wb_country_code: "MH",
    slug: "marshall-islands",
  },
  FM: {
    country: "Micronesia",
    country_code: "FM",
    iso3: "FSM",
    currency_code: "USD",
    default_province: "Pohnpei",
    coordinates: { latitude: 6.9248, longitude: 158.1611 },
    grid_connection_type: "Mini-Grid",
    distance_to_grid_km: 12.0,
    wb_country_code: "FM",
    slug: "micronesia",
  },
  PW: {
    country: "Palau",
    country_code: "PW",
    iso3: "PLW",
    currency_code: "USD",
    default_province: "Koror",
    coordinates: { latitude: 7.3419, longitude: 134.4792 },
    grid_connection_type: "Grid-Connected",
    distance_to_grid_km: 6.0,
    wb_country_code: "PW",
    slug: "palau",
  },
  NR: {
    country: "Nauru",
    country_code: "NR",
    iso3: "NRU",
    currency_code: "AUD",
    default_province: "Yaren",
    coordinates: { latitude: -0.5477, longitude: 166.9209 },
    grid_connection_type: "Grid-Connected",
    distance_to_grid_km: 3.0,
    wb_country_code: "NR",
    slug: "nauru",
  },
};

/** Alias map allowing lookups by iso3 or country code */
export function getCountryConfig(codeOrIso: string): CountryConfig {
  const upper = (codeOrIso || "PG").trim().toUpperCase();
  if (COUNTRY_CONFIGS[upper]) {
    return COUNTRY_CONFIGS[upper];
  }
  for (const cfg of Object.values(COUNTRY_CONFIGS)) {
    if (cfg.iso3 === upper || cfg.country_code === upper || cfg.country.toUpperCase() === upper) {
      return cfg;
    }
  }
  return COUNTRY_CONFIGS["PG"];
}
