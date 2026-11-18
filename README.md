# GridPulse — Industrial Battery & Peak Demand AI OS

> Autonomous microgrid dispatch for industrial manufacturing. Eliminates catastrophic utility demand penalties during sudden solar drops and factory load surges.

---

## ⚡ Problem Statement
In manufacturing, electricity billing is divided into two primary costs:
1. **Energy Consumption Charges ($/kWh)**: Based on Time-of-Use (ToU) tariffs (Off-Peak vs. Peak hours).
2. **Peak Demand Charges ($/kW)**: Billed on the single highest 15-minute peak drawn from the public utility grid during the entire billing cycle. In heavy industry, demand charges often account for **30% to 50% of the total monthly electric bill**.

When sudden cloud cover slashes rooftop solar generation by 50% while heavy machines cycle, unmanaged factories face massive utility demand surcharges. GridPulse steps in within **38 milliseconds**, discharging battery reserves to insulate the plant from utility penalty thresholds.

---

## 🚀 1-Click Vercel Deployment
This repository is pre-configured for native **Vercel** deployment:

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import this repository.
4. Framework Preset will be automatically detected as **Vite**.
5. Click **Deploy**.

---

## 🛠️ Local Development
```bash
# Install dependencies
npm install

# Start Vite local development server
npm run dev

# Build production bundle for Vercel
npm run build

# Preview production build locally
npm run preview
```

---

## 📁 Project Architecture
```text
grid_pulse/
├── index.html            # Vite & Vercel production entry point
├── demo.html             # Standalone browser demo (runs with zero dependencies)
├── vercel.json           # Vercel configuration & SPA rewrite rules
├── vite.config.ts        # Vite build configuration with React plugin
├── tailwind.config.js    # Warm cream (#DEDBC8) & custom typography extensions
├── postcss.config.js     # PostCSS autoprefixer & Tailwind
├── tsconfig.json         # TypeScript strict configuration
├── package.json          # Project dependencies & build scripts
└── src/
    ├── main.tsx          # React 18 DOM root mount
    ├── index.css         # Tailwind directives & fractal SVG noise shaders
    └── App.tsx           # GridPulse landing page with in-browser SCADA simulator
```

---

## 🎨 Design System
- **Background**: Pitch Black (`#000000`), Dark Obsidian Card (`#101010`), Feature Slate (`#212121`).
- **Accent & Primary**: Warm Cream (`#DEDBC8` / `#E1E0CC`).
- **Typography**: 
  - `Almarai` (300, 400, 700, 800) — Primary UI font.
  - `Instrument Serif` (Italic) — Editorial accents.
- **Micro-Interactions**: Custom `WordsPullUp` staggered physics ease `[0.16, 1, 0.3, 1]`, scroll-linked character opacity reveal, and real-time kW telemetry calculations.
