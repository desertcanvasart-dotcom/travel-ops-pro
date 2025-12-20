// Egyptian Cities - Shared constant for all supplier and rate modules
export const EGYPT_CITIES = [
    'Alamein',
    'Alexandria',
    'Aswan',
    'Asyut',
    'Bahariya',
    'Beni Suef',
    'Cairo',
    'Dahab',
    'Dakhla',
    'Edfu',
    'El Arish',
    'El Balyana',
    'El Gouna',
    'El Quseir',
    'El Tor',
    'Esna',
    'Farafra',
    'Fayoum',
    'Giza',
    'Hurghada',
    'Kharga',
    'Kom Ombo',
    'Luxor',
    'Marsa Alam',
    'Minya',
    'Nuweiba',
    'Qena',
    'Rafah',
    'Rosetta (Rashid)',
    'Safaga',
    'Saint Catherine',
    'Sharm El Sheikh',
    'Sheikh Zuweid',
    'Siwa',
    'Sohag',
    'Taba'
  ] as const
  
  export type EgyptCity = typeof EGYPT_CITIES[number]
  
  // Helper for dropdowns - returns options with value and label
  export const EGYPT_CITY_OPTIONS = EGYPT_CITIES.map(city => ({
    value: city,
    label: city
  }))