# ASMR by Country

A simple visualization project that displays Age-Standardized Mortality Rate (ASMR) for all countries using the ESP2013 standardization method.

## Overview

This project creates a single interactive plot showing observed ASMR values for all countries over time. Unlike the original DetailedAnalysis project, this version:

- Shows only observed ASMR (no baselines or excess calculations)
- Displays all countries on one plot
- Uses the same ESP2013 standardization method as the original project

## ASMR Calculation

The ASMR is calculated using ESP2013 standardization weights:

- 0–14 years: 0.156
- 15–64 years: 0.654
- 65–74 years: 0.080
- 75–84 years: 0.066
- 85+ years: 0.044

Formula: `ASMR = (R0_14 × 0.156 + R15_64 × 0.654 + R65_74 × 0.080 + R75_84 × 0.066 + R85p × 0.044) × 100,000`

## File Structure

```
ASMRPlot/
├── index.html              # Main HTML file
├── assets/
│   ├── style.css          # Styling
│   ├── script.js          # Main JavaScript functionality
│   └── libs/
│       └── plotly.min.js  # Plotly.js library
├── data/
│   └── HMD.csv            # Mortality data (Human Mortality Database)
└── README.md              # This file
```

## Usage

1. Open `index.html` in a web browser
2. The application will automatically load `HMD.csv` from the `data/` directory
3. The plot will display ASMR values for all countries over time
4. Hover over lines to see country names and values
5. Use the legend to show/hide specific countries

## Data Source

Data comes from the Human Mortality Database (HMD) Short-term Mortality Fluctuations (STMF) dataset. The CSV file should contain columns:
- `CountryCode`: Country code
- `Year`: Year
- `Week`: ISO week number
- `Sex`: Sex (b=both, m=male, f=female)
- `R0_14`, `R15_64`, `R65_74`, `R75_84`, `R85p`: Age-specific mortality rates

## Requirements

- Modern web browser with JavaScript enabled
- Local web server recommended for full functionality (due to CORS restrictions with local files)

To run with a local server:
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (with http-server)
npx http-server
```

Then open `http://localhost:8000` in your browser.

## Notes

- The project prefers "both sexes" (Sex='b') data when available
- Only countries with valid ASMR data are displayed
- The plot uses a dark theme for better visibility

