/** @type {import('tailwindcss').Config} */
export default
{
    content:
    [
        "./index.html"
        ,"./src/**/*.{js,ts,jsx,tsx}"
    ]
    ,darkMode: "class"
    ,theme:
    {
        extend:
        {
            colors:
            {
                // ── Exact tokens from the v0.dev preparation HTML ──────────
                "surface-container-low":      "#0b1c30"
                ,"surface-container-lowest":  "#000f21"
                ,"surface-container":         "#102034"
                ,"surface-container-high":    "#1b2b3f"
                ,"surface-container-highest": "#26364a"
                ,"surface-dim":               "#031427"
                ,"surface":                   "#031427"
                ,"surface-bright":            "#2a3a4f"
                ,"surface-variant":           "#26364a"
                ,"surface-tint":              "#bbc7df"
                ,"background":               "#031427"
                ,"on-background":            "#d3e4fe"
                ,"on-surface":               "#d3e4fe"
                ,"on-surface-variant":       "#c5c6cd"
                ,"on-primary":               "#253144"
                ,"on-primary-fixed":         "#101c2e"
                ,"on-primary-container":     "#758096"
                ,"on-primary-fixed-variant": "#3c475b"
                ,"primary":                  "#bbc7df"
                ,"primary-fixed":            "#d7e3fc"
                ,"primary-fixed-dim":        "#bbc7df"
                ,"primary-container":        "#0a1628"
                ,"inverse-primary":          "#535f74"
                ,"secondary":                "#acc7ff"
                ,"secondary-fixed":          "#d7e2ff"
                ,"secondary-fixed-dim":      "#acc7ff"
                ,"secondary-container":      "#0365cf"
                ,"on-secondary":             "#002f67"
                ,"on-secondary-fixed":       "#001a40"
                ,"on-secondary-fixed-variant":"#004591"
                ,"on-secondary-container":   "#e0e8ff"
                ,"tertiary":                 "#ffb95f"
                ,"tertiary-fixed":           "#ffddb8"
                ,"tertiary-fixed-dim":       "#ffb95f"
                ,"tertiary-container":       "#231200"
                ,"on-tertiary":              "#472a00"
                ,"on-tertiary-fixed":        "#2a1700"
                ,"on-tertiary-fixed-variant":"#653e00"
                ,"on-tertiary-container":    "#b37100"
                ,"error":                    "#ffb4ab"
                ,"error-container":          "#93000a"
                ,"on-error":                 "#690005"
                ,"on-error-container":       "#ffdad6"
                ,"outline":                  "#8f9097"
                ,"outline-variant":          "#45474c"
                ,"inverse-surface":          "#d3e4fe"
                ,"inverse-on-surface":       "#213145"
                // ── Short aliases used in our components ───────────────────
                ,"bg-deep":        "#031427"
                ,"bg-surface":     "#0b1c30"
                ,"bg-container":   "#102034"
                ,"bg-high":        "#1b2b3f"
                ,"bg-highest":     "#26364a"
                ,"text-primary":   "#d3e4fe"
                ,"text-muted":     "#c5c6cd"
                ,"text-subtle":    "#8fa8c8"
                ,"accent-blue":    "#acc7ff"
                ,"accent-amber":   "#ffb95f"
                ,"accent-red":     "#ffb4ab"
                ,"accent-green":   "#4ade80"
                ,"error-bg":       "#93000a"
                ,"border-subtle":  "#26364a"
                ,"border-dim":     "#1e3352"
            }
            ,borderRadius:
            {
                DEFAULT: "0.125rem"
                ,lg:     "0.25rem"
                ,xl:     "0.5rem"
                ,full:   "0.75rem"
            }
            ,spacing:
            {
                "space-xs": "0.125rem"
                ,"space-sm": "0.25rem"
                ,"space-md": "0.5rem"
                ,"space-lg": "0.75rem"
                ,"space-xl": "1rem"
                ,"gutter":   "0.5rem"
                ,"margin":   "0.75rem"
            }
            ,fontFamily:
            {
                sans:  ["IBM Plex Sans", "sans-serif"]
                ,mono: ["JetBrains Mono", "monospace"]
                ,"headline-md":        ["IBM Plex Sans"]
                ,"headline-lg":        ["IBM Plex Sans"]
                ,"headline-sm":        ["IBM Plex Sans"]
                ,"body-md":            ["IBM Plex Sans"]
                ,"body-sm":            ["IBM Plex Sans"]
                ,"body-lg":            ["IBM Plex Sans"]
                ,"label-caps":         ["IBM Plex Sans"]
                ,"label-telemetry-sm": ["JetBrains Mono"]
                ,"label-telemetry-md": ["JetBrains Mono"]
                ,"label-telemetry-lg": ["JetBrains Mono"]
            }
            ,fontSize:
            {
                "headline-lg":        ["1.75rem",   { lineHeight: "2.25rem",  fontWeight: "600" }]
                ,"headline-md":       ["1.25rem",   { lineHeight: "1.75rem",  fontWeight: "600" }]
                ,"headline-sm":       ["1rem",      { lineHeight: "1.5rem",   fontWeight: "600" }]
                ,"body-lg":           ["0.9375rem", { lineHeight: "1.375rem", fontWeight: "400" }]
                ,"body-md":           ["0.8125rem", { lineHeight: "1.125rem", fontWeight: "400" }]
                ,"body-sm":           ["0.75rem",   { lineHeight: "1rem",     fontWeight: "400" }]
                ,"label-caps":        ["0.6875rem", { lineHeight: "0.875rem", fontWeight: "600" }]
                ,"label-telemetry-lg":["1.125rem",  { lineHeight: "1.25rem",  fontWeight: "600" }]
                ,"label-telemetry-md":["0.8125rem", { lineHeight: "1rem",     fontWeight: "500" }]
                ,"label-telemetry-sm":["0.6875rem", { lineHeight: "0.875rem", fontWeight: "500" }]
            }
        }
    }
    ,plugins: []
}
