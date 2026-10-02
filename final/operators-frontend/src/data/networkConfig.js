// ── STEG Network Configuration ────────────────────────────────────────────────
// This is the canonical default structure based on the official STEG
// load-shedding architecture document.
//
// Hierarchy:
//   CRC  →  BCC  →  Governorate  →  PosteSource  →  Feeder
//
// This file is the "spec book" baseline. Any real-world change is applied
// through the SIG Editor and saved into networkStore, which overrides these
// defaults at runtime.

// ── Governorate name mapping ─────────────────────────────────────────────────
// Keys match the `name` field in governorates.json (Natural Earth names)
// Values are the French display names used in STEG documents
export const GOV_NAMES =
{
    'Tunis':               'Tunis'
    ,'Manubah':            'La Manouba'
    ,'Ben Arous (Tunis Sud)': 'Ben Arous'
    ,'Ariana':             'Ariana'
    ,'Bizerte':            'Bizerte'
    ,'Nabeul':             'Nabeul'
    ,'Zaghouan':           'Zaghouan'
    ,'Béja':               'Béja'
    ,'Jendouba':           'Jendouba'
    ,'Le Kef':             'Le Kef'
    ,'Siliana':            'Siliana'
    ,'Sousse':             'Sousse'
    ,'Kairouan':           'Kairouan'
    ,'Mahdia':             'Mahdia'
    ,'Monastir':           'Monastir'
    ,'Sidi Bou Zid':       'Sidi Bouzid'
    ,'Kassérine':          'Kasserine'
    ,'Sfax':               'Sfax'
    ,'Gafsa':              'Gafsa'
    ,'Tozeur':             'Tozeur'
    ,'Kebili':             'Kébili'
    ,'Gabès':              'Gabès'
    ,'Médenine':           'Médenine'
    ,'Tataouine':          'Tataouine'
}

// ── Default CRC / BCC / Governorate structure ────────────────────────────────
// governorates: array of Natural Earth `name` values from governorates.json
// city: the city where the BCC control room is physically located
// posteSources: known substations managed by this BCC (approximate coordinates)

export const DEFAULT_NETWORK =
{
    crcs:
    [
        {
            id:    'crc-nord'
            ,name: 'CRC Nord'
            ,color: '#acc7ff'          // accent-blue
            ,city:  'Tunis'
            ,bccs:
            [
                {
                    id:    'bcc-1'
                    ,name: 'BCC 1 — Grand Tunis'
                    ,city: 'Tunis'
                    ,crcId: 'crc-nord'
                    ,color: '#7dd3fc'
                    ,targetMW: 110
                    ,actualMW: 110.2
                    ,status:   'ok'
                    ,operator: 'A. Mansouri'
                    ,governorates: ['Tunis', 'Manubah', 'Ben Arous (Tunis Sud)', 'Ariana']
                    ,posteSources:
                    [
                        { id:'ps-mornaguia', name:'Mornaguia 225 kV',  lat: 36.820, lng: 10.155 }
                        ,{ id:'ps-rades',    name:'Radès 225 kV',       lat: 36.770, lng: 10.178 }
                        ,{ id:'ps-tunis-n',  name:'Tunis Nord 90 kV',   lat: 36.856, lng: 10.193 }
                    ]
                }
                ,{
                    id:    'bcc-2'
                    ,name: 'BCC 2 — Nord'
                    ,city: 'Nabeul'
                    ,crcId: 'crc-nord'
                    ,color: '#93c5fd'
                    ,targetMW: 90
                    ,actualMW: 89.8
                    ,status:   'ok'
                    ,operator: 'H. Gharbi'
                    ,governorates: ['Nabeul', 'Zaghouan', 'Bizerte']
                    ,posteSources:
                    [
                        { id:'ps-nabeul',   name:'Nabeul 90 kV',    lat: 36.450, lng: 10.733 }
                        ,{ id:'ps-bizerte', name:'Bizerte 90 kV',    lat: 37.273, lng: 9.862  }
                        ,{ id:'ps-grombalia',name:'Grombalia 90 kV', lat: 36.601, lng: 10.510 }
                    ]
                }
                ,{
                    id:    'bcc-3'
                    ,name: 'BCC 3 — Nord-Ouest'
                    ,city: 'Béja'
                    ,crcId: 'crc-nord'
                    ,color: '#ffb95f'
                    ,targetMW: 50
                    ,actualMW: 38.0
                    ,status:   'warn'
                    ,operator: 'S. Dridi'
                    ,governorates: ['Béja', 'Jendouba', 'Le Kef', 'Siliana']
                    ,posteSources:
                    [
                        { id:'ps-beja',     name:'Béja 90 kV',       lat: 36.730, lng: 9.185  }
                        ,{ id:'ps-jendouba',name:'Jendouba 90 kV',   lat: 36.501, lng: 8.778  }
                        ,{ id:'ps-kef',     name:'Le Kef 90 kV',     lat: 36.182, lng: 8.708  }
                    ]
                }
                ,{
                    id:    'bcc-4'
                    ,name: 'BCC 4 — Sousse'
                    ,city: 'Sousse'
                    ,crcId: 'crc-nord'
                    ,color: '#6ee7b7'
                    ,targetMW: 60
                    ,actualMW: 61.0
                    ,status:   'ok'
                    ,operator: 'R. Chabbi'
                    ,governorates: ['Sousse', 'Kairouan', 'Mahdia', 'Monastir']
                    ,posteSources:
                    [
                        { id:'ps-sousse',   name:'Sousse 225 kV',    lat: 35.829, lng: 10.634 }
                        ,{ id:'ps-monastir',name:'Monastir 90 kV',   lat: 35.778, lng: 10.826 }
                        ,{ id:'ps-kairouan',name:'Kairouan 90 kV',   lat: 35.671, lng: 9.921  }
                        ,{ id:'ps-mahdia',  name:'Mahdia 90 kV',     lat: 35.504, lng: 11.062 }
                    ]
                }
            ]
        }
        ,{
            id:    'crc-sud'
            ,name: 'CRC Sud'
            ,color: '#ffb95f'          // accent-amber
            ,city:  'Sfax'
            ,bccs:
            [
                {
                    id:    'bcc-5'
                    ,name: 'BCC 5 — Sfax'
                    ,city: 'Sfax'
                    ,crcId: 'crc-sud'
                    ,color: '#ff4444'
                    ,targetMW: 50
                    ,actualMW: 33.5
                    ,status:   'crit'
                    ,operator: 'M. Amri'
                    ,governorates: ['Sfax', 'Sidi Bou Zid']
                    ,posteSources:
                    [
                        { id:'ps-sfax',     name:'Sfax 225 kV',      lat: 34.739, lng: 10.760 }
                        ,{ id:'ps-sbouzid', name:'Sidi Bouzid 90 kV',lat: 35.038, lng: 9.485  }
                        ,{ id:'ps-sfax2',   name:'Sfax Sud 90 kV',   lat: 34.680, lng: 10.780 }
                    ]
                }
                ,{
                    id:    'bcc-6'
                    ,name: 'BCC 6 — Gafsa'
                    ,city: 'Gafsa'
                    ,crcId: 'crc-sud'
                    ,color: '#c084fc'
                    ,targetMW: 40
                    ,actualMW: 35.0
                    ,status:   'warn'
                    ,operator: 'F. Jrad'
                    ,governorates: ['Gafsa', 'Tozeur', 'Kassérine']
                    ,posteSources:
                    [
                        { id:'ps-gafsa',    name:'Gafsa 90 kV',      lat: 34.425, lng: 8.784  }
                        ,{ id:'ps-tozeur',  name:'Tozeur 90 kV',     lat: 33.920, lng: 8.133  }
                        ,{ id:'ps-kassrine',name:'Kasserine 90 kV',  lat: 35.167, lng: 8.836  }
                    ]
                }
                ,{
                    id:    'bcc-7'
                    ,name: 'BCC 7 — Sud'
                    ,city: 'Gabès'
                    ,crcId: 'crc-sud'
                    ,color: '#fb923c'
                    ,targetMW: 40
                    ,actualMW: 35.0
                    ,status:   'warn'
                    ,operator: 'N. Lassoued'
                    ,governorates: ['Gabès', 'Médenine', 'Tataouine', 'Kebili']
                    ,posteSources:
                    [
                        { id:'ps-gabes',    name:'Ghannouch/Gabès 225 kV', lat: 33.881, lng: 10.092 }
                        ,{ id:'ps-medenine',name:'Médenine 90 kV',         lat: 33.354, lng: 10.502 }
                        ,{ id:'ps-tataouine',name:'Tataouine 90 kV',       lat: 32.929, lng: 10.451 }
                        ,{ id:'ps-kebili',  name:'Kébili 90 kV',           lat: 33.705, lng: 8.965  }
                    ]
                }
            ]
        }
    ]
}

// ── Derived helpers ───────────────────────────────────────────────────────────

// Flat list of all BCCs across all CRCs
export const ALL_BCCS = DEFAULT_NETWORK.crcs.flatMap(c => c.bccs)

// Map from governorate name → bcc id
export const GOV_TO_BCC = {}
ALL_BCCS.forEach(bcc =>
    bcc.governorates.forEach(gov => { GOV_TO_BCC[gov] = bcc.id })
)

// Map from governorate name → crc id
export const GOV_TO_CRC = {}
DEFAULT_NETWORK.crcs.forEach(crc =>
    crc.bccs.forEach(bcc =>
        bcc.governorates.forEach(gov => { GOV_TO_CRC[gov] = crc.id })
    )
)

// Status color for a BCC/CRC
export const STATUS_COLOR =
{
    ok:   '#4ade80'
    ,warn: '#ffb95f'
    ,crit: '#ff4444'
}

export const STATUS_FILL =
{
    ok:   { fill: '#4ade80', opacity: 0.08 }
    ,warn: { fill: '#ffb95f', opacity: 0.10 }
    ,crit: { fill: '#ff4444', opacity: 0.16 }
}
