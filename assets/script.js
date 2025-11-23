// ESP2013 standardization weights
const ESP2013 = { 
  R0_14: 0.156, 
  R15_64: 0.654, 
  R65_74: 0.080, 
  R75_84: 0.066, 
  R85p: 0.044 
};

// Country name mapping
const countryNames = {
  'AUS': 'Australia',
  'AUT': 'Austria', 
  'BEL': 'Belgium',
  'BGR': 'Bulgaria',
  'CAN': 'Canada',
  'CHE': 'Switzerland',
  'CHL': 'Chile',
  'CZE': 'Czech Republic',
  'DEUTNP': 'Germany',
  'DNK': 'Denmark',
  'ESP': 'Spain',
  'EST': 'Estonia',
  'FIN': 'Finland',
  'FRATNP': 'France',
  'GBRTENW': 'England & Wales',
  'GBR_NIR': 'Northern Ireland',
  'GBR_SCO': 'Scotland',
  'GRC': 'Greece',
  'HRV': 'Croatia',
  'HUN': 'Hungary',
  'ISL': 'Iceland',
  'ISR': 'Israel',
  'ITA': 'Italy',
  'LTU': 'Lithuania',
  'LUX': 'Luxembourg',
  'LVA': 'Latvia',
  'NLD': 'Netherlands',
  'NOR': 'Norway',
  'NZL_NP': 'New Zealand',
  'POL': 'Poland',
  'PRT': 'Portugal',
  'SVK': 'Slovakia',
  'SVN': 'Slovenia',
  'SWE': 'Sweden',
  'TWN': 'Taiwan',
  'USA': 'United States'
};

// Calculate ASMR per 100k using ESP2013 weights
function computeASMR100k(row) {
  const value = (
    (Number(row.R0_14) || 0) * ESP2013.R0_14 +
    (Number(row.R15_64) || 0) * ESP2013.R15_64 +
    (Number(row.R65_74) || 0) * ESP2013.R65_74 +
    (Number(row.R75_84) || 0) * ESP2013.R75_84 +
    (Number(row.R85p) || 0) * ESP2013.R85p
  ) * 100000; // per 100k
  return value;
}

// Parse CSV text
function parseCSV(text) {
  const allLines = text.split(/\r?\n/);
  
  // Find header: first non-empty, non-comment line
  let headerLineIndex = -1;
  for (let i = 0; i < allLines.length; i++) {
    const t = allLines[i].trim();
    if (!t) continue;
    if (t.startsWith("#")) continue; // skip metadata/comment lines
    headerLineIndex = i;
    break;
  }
  
  if (headerLineIndex === -1) return [];
  
  const header = allLines[headerLineIndex].split(",").map(s => s.trim());
  const ignore = new Set(["Split", "SplitSex", "Forecast"]);
  const rows = [];
  
  for (let i = headerLineIndex + 1; i < allLines.length; i++) {
    const line = allLines[i];
    if (!line || !line.trim() || line.trim().startsWith("#")) continue;
    const cols = line.split(",");
    if (cols.length !== header.length) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j];
      if (ignore.has(key)) continue;
      const val = cols[j];
      obj[key] = val === "" ? null : val;
    }
    rows.push(obj);
  }
  
  return rows;
}

// Convert ISO year & week to approximate date
function isoWeekToDate(year, week) {
  const simple = new Date(Date.UTC(year, 0, 4)); // ISO week 1 has Jan 4th
  const dayOfWeek = simple.getUTCDay() || 7; // Mon=1..Sun=7
  const mondayOfWeek1 = new Date(simple);
  mondayOfWeek1.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);
  const date = new Date(mondayOfWeek1);
  date.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);
  return date;
}

// Get ISO week number from a date
function getISOWeek(date) {
  const d = new Date(date);
  const dayNum = d.getUTCDay() || 7; // Monday = 1, Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Get to Thursday of the week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNum;
}

// Get week key (W01, W02, etc.) from date
function getWeekKey(date) {
  const week = getISOWeek(date);
  return `W${String(week).padStart(2, '0')}`;
}

// Load and process HMD.csv data
async function loadData() {
  const paths = [
    './data/HMD.csv',
    '../data/HMD.csv',
    'data/HMD.csv'
  ];
  
  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        const text = await response.text();
        const rows = parseCSV(text);
        
        // Process rows: calculate ASMR and organize by country
        // Include all data (we'll filter by country later based on 2001 requirement)
        const processedRows = rows.map(r => {
          const year = Number(r.Year);
          const week = Number(r.Week);
          if (!isFinite(year) || !isFinite(week)) {
            return null;
          }
          const date = isoWeekToDate(year, week);
          const asmr = computeASMR100k(r);
          return {
            ...r,
            Year: year,
            Week: week,
            date: date,
            ASMR100k: asmr
          };
        }).filter(r => r !== null && isFinite(r.ASMR100k) && r.ASMR100k > 0);
        
        console.log(`Processed ${processedRows.length} valid rows from ${rows.length} total rows`);
        return processedRows;
      }
    } catch (e) {
      console.warn(`Failed to load from ${path}:`, e);
    }
  }
  
  throw new Error("Unable to load HMD.csv from known paths.");
}

// Group data by country and sex, prefer 'b' (both sexes)
function groupByCountry(data) {
  const byCountry = new Map();
  
  // First pass: collect all country-sex combinations
  const allCombinations = new Map();
  for (const row of data) {
    const key = `${row.CountryCode}|${row.Sex}`;
    if (!allCombinations.has(key)) {
      allCombinations.set(key, []);
    }
    allCombinations.get(key).push(row);
  }
  
  // Second pass: prefer 'b' (both sexes), fallback to 'm' or 'f'
  for (const [key, rows] of allCombinations.entries()) {
    const [countryCode, sex] = key.split('|');
    
    if (!byCountry.has(countryCode)) {
      byCountry.set(countryCode, { sex: sex, rows: rows });
    } else {
      const existing = byCountry.get(countryCode);
      // Prefer 'b' over 'm' or 'f'
      if (sex === 'b' && existing.sex !== 'b') {
        byCountry.set(countryCode, { sex: sex, rows: rows });
      }
    }
  }
  
  return byCountry;
}

// Find the optimal end date that maximizes the number of countries included
function findOptimalEndDate(dataByCountry, startDate) {
  const countryLatestDates = [];
  
  // Find latest date for each country that starts from 2001 or earlier
  for (const [countryCode, { rows }] of dataByCountry.entries()) {
    const dates = rows.map(r => r.date).filter(d => d instanceof Date);
    if (dates.length === 0) continue;
    
    const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Only consider countries that have data from 2001 or earlier
    if (earliestDate <= startDate) {
      countryLatestDates.push({
        countryCode: countryCode,
        latestDate: latestDate
      });
    }
  }
  
  if (countryLatestDates.length === 0) {
    return new Date(Date.UTC(2025, 5, 25)); // Default to June 25, 2025
  }
  
  // Sort by latest date
  countryLatestDates.sort((a, b) => a.latestDate - b.latestDate);
  
  // Find the date that includes the maximum number of countries
  // We'll use the latest date that at least 80% of countries have
  const targetPercentage = 0.8;
  const targetCount = Math.floor(countryLatestDates.length * targetPercentage);
  
  // Start from the latest date and work backwards
  for (let i = countryLatestDates.length - 1; i >= 0; i--) {
    const candidateDate = countryLatestDates[i].latestDate;
    const countriesWithData = countryLatestDates.filter(c => c.latestDate >= candidateDate).length;
    
    if (countriesWithData >= targetCount) {
      console.log(`Optimal end date: ${candidateDate.toISOString().split('T')[0]}, includes ${countriesWithData} of ${countryLatestDates.length} countries`);
      return candidateDate;
    }
  }
  
  // Fallback: use the date that includes the most countries
  const bestDate = countryLatestDates[countryLatestDates.length - 1].latestDate;
  const bestCount = countryLatestDates.filter(c => c.latestDate >= bestDate).length;
  console.log(`Using latest available date: ${bestDate.toISOString().split('T')[0]}, includes ${bestCount} of ${countryLatestDates.length} countries`);
  return bestDate;
}

// Filter countries to only include those with data for the full displayed range
function filterCountriesFrom2001(dataByCountry) {
  const startDate = new Date(Date.UTC(2001, 0, 1)); // January 1, 2001
  const endDate = findOptimalEndDate(dataByCountry, startDate);
  const filtered = new Map();
  
  console.log(`Filtering countries with data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  
  for (const [countryCode, { rows, sex }] of dataByCountry.entries()) {
    // Find the earliest and latest dates in this country's data
    const dates = rows.map(r => r.date).filter(d => d instanceof Date);
    if (dates.length === 0) continue;
    
    const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Only include countries that have data from 2001 or earlier AND data up to the optimal end date
    if (earliestDate <= startDate && latestDate >= endDate) {
      // Filter the rows to only include data from 2001 onwards and up to the optimal end date
      const filteredRows = rows.filter(r => r.date >= startDate && r.date <= endDate);
      if (filteredRows.length > 0) {
        filtered.set(countryCode, { sex: sex, rows: filteredRows });
      }
    }
  }
  
  return { filtered, endDate };
}

// Check if a baseline period includes pandemic years (2020-2022, possibly 2023)
function includesPandemicYears(startDate, endDate) {
  const pandemicStart = new Date(Date.UTC(2020, 0, 1));
  const pandemicEnd = new Date(Date.UTC(2022, 11, 31)); // End of 2022
  // Check if baseline period overlaps with pandemic period
  return endDate >= pandemicStart && startDate <= pandemicEnd;
}

// Quasi-Poisson Regression baseline calculation (matching DetailedAnalysis approach)
// Uses log-linear regression (OLS on log-transformed data) with dispersion parameter
function quasiPoissonBaseline(rows, startDate, endDate) {
  // Reject baselines that include pandemic years
  if (includesPandemicYears(startDate, endDate)) {
    return null;
  }
  
  // Filter rows to baseline period
  const baselineRows = rows.filter(r => r.date >= startDate && r.date <= endDate);
  
  if (baselineRows.length < 3) {
    return null;
  }
  
  // Sort by date
  baselineRows.sort((a, b) => a.date - b.date);
  
  // Prepare data: x = time index, y = ASMR
  // Match DetailedAnalysis: use Year*100 + Week as monotonic index
  const xs = [];
  const ys = [];
  const firstDate = baselineRows[0].date;
  
  for (const r of baselineRows) {
    if (!isFinite(r.ASMR100k) || r.ASMR100k <= 0) continue;
    // Use Year*100 + Week as time index (matching DetailedAnalysis)
    const x = r.Year * 100 + r.Week;
    xs.push(x);
    ys.push(r.ASMR100k);
  }
  
  if (xs.length < 3) {
    return null;
  }
  
  // Fit log-linear regression (Poisson/Quasi-Poisson)
  // This matches the DetailedAnalysis approach: OLS on log-transformed data
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.map(y => Math.log(y)).reduce((a, b) => a + b, 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);
  const sumXY = xs.reduce((a, xi, i) => a + xi * Math.log(ys[i]), 0);
  
  const det = n * sumXX - sumX * sumX;
  if (Math.abs(det) < 1e-10) {
    return null;
  }
  
  const b = (n * sumXY - sumX * sumY) / det;
  const a = (sumY - b * sumX) / n;
  
  // Calculate fitted values and residuals
  const fitted = ys.map((y, i) => Math.exp(a + b * xs[i]));
  const residuals = ys.map((y, i) => y - fitted[i]);
  
  // Calculate dispersion parameter (Pearson chi-squared statistic / degrees of freedom)
  // For quasi-Poisson, we use the same coefficients but acknowledge overdispersion
  // The variance is now dispersion * mean instead of just mean
  const pearsonResiduals = residuals.map((res, i) => res / Math.sqrt(fitted[i]));
  const dispersion = pearsonResiduals.reduce((sum, res) => sum + res * res, 0) / (n - 2);
  
  return {
    intercept: a,
    slope: b,
    firstDate: firstDate,
    dispersion: dispersion
  };
}

// Project baseline forward to a given date
// Note: This function needs Year and Week from the target date
// For compatibility, we'll calculate it from the date
function projectBaseline(model, targetDate, year, week) {
  if (!model) return null;
  // Use Year*100 + Week as time index (matching DetailedAnalysis)
  // If year/week not provided, calculate from date
  let x;
  if (year !== undefined && week !== undefined) {
    x = year * 100 + week;
  } else {
    // Fallback: calculate from date (less accurate but maintains compatibility)
    const targetYear = targetDate.getUTCFullYear();
    const targetWeek = getISOWeek(targetDate);
    x = targetYear * 100 + targetWeek;
  }
  const value = Math.exp(model.intercept + model.slope * x);
  return isFinite(value) && value > 0 ? value : null;
}

// Calculate RMSE between observed and predicted values
function calculateRMSE(observed, predicted) {
  if (observed.length !== predicted.length) return Infinity;
  let sumSquaredError = 0;
  let count = 0;
  for (let i = 0; i < observed.length; i++) {
    if (isFinite(observed[i]) && isFinite(predicted[i])) {
      const error = observed[i] - predicted[i];
      sumSquaredError += error * error;
      count++;
    }
  }
  return count > 0 ? Math.sqrt(sumSquaredError / count) : Infinity;
}

// Calculate seasonal baseline (mean by ISO week)
function calculateSeasonalBaseline(rows, startDate, endDate) {
  const baselineRows = rows.filter(r => r.date >= startDate && r.date <= endDate);
  const byWeek = new Map();
  
  for (const r of baselineRows) {
    if (!isFinite(r.ASMR100k) || r.ASMR100k <= 0) continue;
    const weekKey = getWeekKey(r.date);
    if (!byWeek.has(weekKey)) {
      byWeek.set(weekKey, []);
    }
    byWeek.get(weekKey).push(r.ASMR100k);
  }
  
  const weekMeans = new Map();
  for (const [weekKey, values] of byWeek.entries()) {
    if (weekKey === "W53" && values.length < 2) continue; // Conservative handling
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    weekMeans.set(weekKey, mean);
  }
  
  return weekMeans;
}

// Calculate seasonal deviations from trend
function calculateSeasonalDeviations(rows, startDate, endDate, trendBaseline) {
  const baselineRows = rows.filter(r => r.date >= startDate && r.date <= endDate);
  const seasonalBaseline = calculateSeasonalBaseline(rows, startDate, endDate);
  const deviations = new Map();
  
  for (const r of baselineRows) {
    const weekKey = getWeekKey(r.date);
    if (weekKey === "W53") continue; // Skip W53 for now
    
    const seasonal = seasonalBaseline.get(weekKey);
    // Use Year*100 + Week for time index (matching DetailedAnalysis)
    const trend = projectBaseline(trendBaseline, r.date, r.Year, r.Week);
    
    if (isFinite(seasonal) && isFinite(trend) && trend !== null) {
      if (!deviations.has(weekKey)) {
        deviations.set(weekKey, []);
      }
      deviations.get(weekKey).push(seasonal - trend);
    }
  }
  
  // Average deviations by week
  const weekDeviations = new Map();
  for (const [weekKey, devs] of deviations.entries()) {
    if (devs.length > 0) {
      weekDeviations.set(weekKey, devs.reduce((a, b) => a + b, 0) / devs.length);
    }
  }
  
  return weekDeviations;
}

// Apply seasonal adjustment to baseline
function applySeasonalAdjustment(model, date, weekDeviations, year, week) {
  // Use Year*100 + Week for time index (matching DetailedAnalysis)
  // If year/week not provided, calculate from date
  let trend;
  if (year !== undefined && week !== undefined) {
    trend = projectBaseline(model, date, year, week);
  } else {
    // Fallback: calculate from date
    const targetYear = date.getUTCFullYear();
    const targetWeek = getISOWeek(date);
    trend = projectBaseline(model, date, targetYear, targetWeek);
  }
  
  if (trend === null || !isFinite(trend)) return null;
  
  const weekKey = getWeekKey(date);
  const deviation = weekDeviations.get(weekKey) || 
                   (weekKey === "W53" ? weekDeviations.get("W52") || 0 : 0);
  
  return trend + deviation;
}

// Find baseline period that minimizes RMSE for the latest available data
function findOptimalBaseline(aggregatedData, actualEndDate) {
  const startDate2001 = new Date(Date.UTC(2001, 0, 1));
  // Use the actual end date, but only use data from 2025 onwards for RMSE calculation if available
  // Otherwise use the latest available data
  const rmseStartYear = 2025;
  const rmseStartDate = new Date(Date.UTC(rmseStartYear, 0, 1));
  const rmseEndDate = actualEndDate >= rmseStartDate ? actualEndDate : actualEndDate;
  
  // Get latest year data for RMSE calculation (prefer 2025 if available, otherwise use latest available)
  const latestYear = rmseEndDate.getUTCFullYear();
  const dataForRMSE = aggregatedData.filter(d => {
    return d.date >= rmseStartDate && d.date <= rmseEndDate;
  });
  
  if (dataForRMSE.length === 0) {
    console.warn(`No data available for RMSE calculation (from ${rmseStartDate.toISOString().split('T')[0]} to ${rmseEndDate.toISOString().split('T')[0]})`);
    return null;
  }
  
  // Convert aggregatedData to format expected by quasiPoissonBaseline
  // It expects rows with { date, ASMR100k, Year, Week }
  const baselineData = aggregatedData.map(d => {
    const date = new Date(d.date);
    const year = date.getUTCFullYear();
    const week = getISOWeek(date);
    return {
      date: date,
      ASMR100k: d.asmrSum,
      Year: year,
      Week: week
    };
  });
  
  // Try different baseline periods (any range of at least 4 years, ending before pandemic)
  // Pandemic years (2020-2022, possibly 2023) must be excluded from baselines
  const pandemicStartYear = 2020;
  const minBaselineYears = 4;
  const earliestStartYear = 2001;
  const latestEndYear = 2019; // Must end before pandemic
  
  let bestRMSE = Infinity;
  let bestModel = null;
  let bestBaselineStart = null;
  let bestBaselineEnd = null;
  let bestWeekDeviations = null;
  
  // Try all combinations of start and end years that:
  // 1. Are at least minBaselineYears long
  // 2. End before the pandemic (before 2020)
  // 3. Don't overlap with the RMSE evaluation period
  for (let startYear = earliestStartYear; startYear <= latestEndYear - minBaselineYears + 1; startYear++) {
    for (let endYear = startYear + minBaselineYears - 1; endYear <= latestEndYear; endYear++) {
      const baselineStart = new Date(Date.UTC(startYear, 0, 1));
      const baselineEnd = new Date(Date.UTC(endYear, 11, 31));
      
      if (baselineEnd >= rmseStartDate) continue; // Skip if baseline period overlaps with RMSE evaluation period
    
    // Fit QPR model on baseline period
      const model = quasiPoissonBaseline(baselineData, baselineStart, baselineEnd);
    if (!model) continue;
    
    // Calculate seasonal deviations
      const weekDeviations = calculateSeasonalDeviations(baselineData, baselineStart, baselineEnd, model);
      
      // Project to latest year dates with seasonal adjustment and calculate RMSE
      // applySeasonalAdjustment will calculate Year/Week from date if not provided
      const predictedLatest = dataForRMSE.map(d => {
        const date = new Date(d.date);
        return applySeasonalAdjustment(model, date, weekDeviations);
      });
      const observedLatest = dataForRMSE.map(d => d.asmrSum);
    
    // Filter out nulls
    const validPairs = [];
      for (let i = 0; i < observedLatest.length; i++) {
        if (isFinite(observedLatest[i]) && isFinite(predictedLatest[i]) && predictedLatest[i] !== null) {
          validPairs.push({ obs: observedLatest[i], pred: predictedLatest[i] });
      }
    }
    
    if (validPairs.length === 0) continue;
    
    const rmse = calculateRMSE(
      validPairs.map(p => p.obs),
      validPairs.map(p => p.pred)
    );
    
      console.log(`Baseline ${startYear}-${endYear}: RMSE = ${rmse.toFixed(2)}`);
    
    if (rmse < bestRMSE) {
      bestRMSE = rmse;
      bestModel = model;
        bestBaselineStart = baselineStart;
      bestBaselineEnd = baselineEnd;
      bestWeekDeviations = weekDeviations;
      }
    }
  }
  
  if (bestModel) {
    console.log(`Best baseline: ${bestBaselineStart.getUTCFullYear()}-${bestBaselineEnd.getUTCFullYear()}, RMSE = ${bestRMSE.toFixed(2)}`);
    return {
      model: bestModel,
      weekDeviations: bestWeekDeviations,
      baselineStart: bestBaselineStart,
      baselineEnd: bestBaselineEnd
    };
  }
  
  return null;
}

// Create plot data - aggregate all countries into a single line
function createPlotData(dataByCountry) {
  // Count the number of countries being aggregated
  const countryCount = dataByCountry.size;
  
  // Collect all data points by date
  const dateMap = new Map();
  
  // Aggregate ASMR values by date across all countries
  for (const [countryCode, { rows }] of dataByCountry.entries()) {
    for (const row of rows) {
      const dateKey = row.date.getTime(); // Use timestamp as key
      const dateStr = `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, '0')}-${String(row.date.getUTCDate()).padStart(2, '0')}`;
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: dateStr,
          timestamp: row.date.getTime(),
          asmrSum: 0,
          countryCount: 0
        });
      }
      
      const entry = dateMap.get(dateKey);
      entry.asmrSum += row.ASMR100k;
      entry.countryCount += 1;
    }
  }
  
  // Convert to arrays and sort by date
  const entries = Array.from(dateMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  
  const dates = entries.map(e => e.date);
  const aggregatedASMR = entries.map(e => e.asmrSum);
  const countryCountsPerDate = entries.map(e => e.countryCount);
  
  if (dates.length === 0 || aggregatedASMR.length === 0) {
    console.warn('No data points to plot');
    return [];
  }
  
  // Prepare data for baseline calculation (need date objects, not strings)
  // Also add Year and Week for baseline calculations
  const aggregatedDataWithDates = entries.map(e => {
    const date = new Date(e.timestamp);
    const year = date.getUTCFullYear();
    const week = getISOWeek(date);
    return {
      date: date,
      asmrSum: e.asmrSum,
      Year: year,
      Week: week
    };
  });
  
  // Calculate baseline data
  // Add Year and Week for quasiPoissonBaseline
  const baselineData = aggregatedDataWithDates.map(d => {
    const year = d.date.getUTCFullYear();
    const week = getISOWeek(d.date);
    return {
      date: d.date,
      ASMR100k: d.asmrSum,
      Year: year,
      Week: week
    };
  });
  
  // Calculate 2001-2019 baseline for Chart 1
  const baseline2001_2019 = {
    startYear: 2001,
    endYear: 2019
  };
  const startDate2001 = new Date(Date.UTC(2001, 0, 1));
  const endDate2019 = new Date(Date.UTC(2019, 11, 31));
  const model2001_2019 = quasiPoissonBaseline(baselineData, startDate2001, endDate2019);
  let baselineValues2001_2019 = [];
  if (model2001_2019) {
    const weekDeviations2001_2019 = calculateSeasonalDeviations(baselineData, startDate2001, endDate2019, model2001_2019);
    baselineValues2001_2019 = aggregatedDataWithDates.map(d => {
      return applySeasonalAdjustment(model2001_2019, d.date, weekDeviations2001_2019, d.Year, d.Week);
    });
    baseline2001_2019.model = model2001_2019;
    baseline2001_2019.values = baselineValues2001_2019;
    baseline2001_2019.weekDeviations = weekDeviations2001_2019;
  }
  
  // Calculate RMSE-minimized baseline for Chart 1
  // Use the actual end date from the filtered data
  const dataEndDate = new Date(Math.max(...aggregatedDataWithDates.map(d => d.date.getTime())));
  const rmseBaselineResult = findOptimalBaseline(aggregatedDataWithDates, dataEndDate);
  let rmseBaselineValues = [];
  if (rmseBaselineResult && rmseBaselineResult.model) {
    rmseBaselineValues = aggregatedDataWithDates.map(d => {
      return applySeasonalAdjustment(rmseBaselineResult.model, d.date, rmseBaselineResult.weekDeviations, d.Year, d.Week);
    });
  }
  
  // Calculate specific baselines for Chart 2 (cumulative excess)
  const fixedBaselines = new Map(); // key: "YYYY-YYYY" -> { model, values, labels }
  
  // Add 2001-2019 baseline to Chart 2 (reuse the one calculated for Chart 1)
  if (baseline2001_2019 && baseline2001_2019.values && baseline2001_2019.values.length > 0) {
    fixedBaselines.set('2001-2019', {
      model: baseline2001_2019.model,
      values: baseline2001_2019.values,
      startYear: baseline2001_2019.startYear,
      endYear: baseline2001_2019.endYear,
      labels: ['Equilibrium-Selected Baseline'],
      weekDeviations: baseline2001_2019.weekDeviations
    });
  }
  
  // Define the specific baselines we want to show
  const chart2Baselines = [
    { startYear: 2014, endYear: 2019, labels: ['2025 RMSE minimised'] },
    { startYear: 2015, endYear: 2019, labels: ['Our World in Data', 'The Economist'] },
    { startYear: 2010, endYear: 2019, labels: ['Institute and Faculty of Actuaries', 'M. Pizzato'] },
    { startYear: 2016, endYear: 2019, labels: ['Eurostat'] }
  ];
  
  // Also calculate baselines for the dropdown selector
  const dropdownBaselines = [
    { startYear: 2010, endYear: 2019 },
    { startYear: 2011, endYear: 2019 },
    { startYear: 2012, endYear: 2019 },
    { startYear: 2013, endYear: 2019 },
    { startYear: 2014, endYear: 2019 },
    { startYear: 2015, endYear: 2019 },
    { startYear: 2016, endYear: 2019 }
  ];
  
  // Calculate all dropdown baselines
  for (const baselineSpec of dropdownBaselines) {
    const key = `${baselineSpec.startYear}-${baselineSpec.endYear}`;
    // Skip if already calculated
    if (fixedBaselines.has(key)) continue;
    
    const startDate = new Date(Date.UTC(baselineSpec.startYear, 0, 1));
    const endDate = new Date(Date.UTC(baselineSpec.endYear, 11, 31));
      
      const model = quasiPoissonBaseline(baselineData, startDate, endDate);
      
      if (model) {
        const weekDeviations = calculateSeasonalDeviations(baselineData, startDate, endDate, model);
        const baselineValues = aggregatedDataWithDates.map(d => {
          return applySeasonalAdjustment(model, d.date, weekDeviations, d.Year, d.Week);
        });
        
        fixedBaselines.set(key, {
          model: model,
          values: baselineValues,
        startYear: baselineSpec.startYear,
        endYear: baselineSpec.endYear,
        labels: [],
        weekDeviations: weekDeviations
      });
    }
  }
  
  for (const baselineSpec of chart2Baselines) {
    const startDate = new Date(Date.UTC(baselineSpec.startYear, 0, 1));
    const endDate = new Date(Date.UTC(baselineSpec.endYear, 11, 31));
    const key = `${baselineSpec.startYear}-${baselineSpec.endYear}`;
      
      const model = quasiPoissonBaseline(baselineData, startDate, endDate);
      
      if (model) {
        const weekDeviations = calculateSeasonalDeviations(baselineData, startDate, endDate, model);
        const baselineValues = aggregatedDataWithDates.map(d => {
          return applySeasonalAdjustment(model, d.date, weekDeviations, d.Year, d.Week);
        });
        
        fixedBaselines.set(key, {
          model: model,
          values: baselineValues,
        startYear: baselineSpec.startYear,
        endYear: baselineSpec.endYear,
        labels: baselineSpec.labels,
        weekDeviations: weekDeviations
      });
    }
  }
  
  console.log(`Calculated 2001-2019 baseline and ${fixedBaselines.size} baselines for Chart 2`);
  
  const traces = [{
    x: dates,
    y: aggregatedASMR,
    type: 'scatter',
    mode: 'lines',
    name: 'Observed ASMR',
    line: {
      width: 2,
      color: '#1a1a1a'
    },
    hovertemplate: `<b>Observed ASMR</b><br>` +
                   `Date: %{x}<br>` +
                   `ASMR: %{y:.1f}<extra></extra>`
  }];
  
  // Add 2001-2019 baseline for Chart 1
  if (baseline2001_2019 && baseline2001_2019.values && baseline2001_2019.values.length > 0) {
    traces.push({
      x: dates,
      y: baseline2001_2019.values,
      type: 'scatter',
      mode: 'lines',
      name: '2001-2019 Baseline',
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      hovertemplate: `<b>2001-2019 Baseline</b><br>` +
                     `Date: %{x}<br>` +
                     `Baseline: %{y:.1f}<extra></extra>`
    });
  }
  
  // Add RMSE-minimized baseline for Chart 1
  if (rmseBaselineResult && rmseBaselineResult.model && rmseBaselineValues.length > 0) {
    const baselineStartYear = rmseBaselineResult.baselineStart.getUTCFullYear();
    const baselineEndYear = rmseBaselineResult.baselineEnd.getUTCFullYear();
      traces.push({
        x: dates,
      y: rmseBaselineValues,
        type: 'scatter',
        mode: 'lines',
      name: `RMSE-minimized Baseline (${baselineStartYear}-${baselineEndYear})`,
        line: {
        width: 2,
        color: '#4682b4',
        dash: 'dot'
      },
      hovertemplate: `<b>RMSE-minimized Baseline (${baselineStartYear}-${baselineEndYear})</b><br>` +
                       `Date: %{x}<br>` +
                     `Baseline: %{y:.1f}<extra></extra>`
      });
    }
  
  // Get the actual end date from the data
  const actualEndDate = new Date(Math.max(...aggregatedDataWithDates.map(d => d.date.getTime())));
  
  return { traces, baseline2001_2019, rmseBaselineResult, dates, aggregatedASMR, fixedBaselines, countryCount, actualEndDate, countryCountsPerDate };
}

// Render the plot
function renderPlot(traces, baseline2001_2019, fixedBaselines, countryCount, rmseBaselineResult, actualEndDate) {
  // Update baseline info text
  const infoElement = document.getElementById('baselineInfoText');
  if (infoElement) {
    let infoText = 'Baseline: 2001-2019';
    if (rmseBaselineResult && rmseBaselineResult.baselineStart && rmseBaselineResult.baselineEnd) {
      const rmseStartYear = rmseBaselineResult.baselineStart.getUTCFullYear();
      const rmseEndYear = rmseBaselineResult.baselineEnd.getUTCFullYear();
      infoText += ` | RMSE-minimized: ${rmseStartYear}-${rmseEndYear}`;
    }
    infoElement.textContent = infoText;
  }
  
  // Calculate the multiplier for the axis label
  const multiplier = countryCount * 100000;
  const multiplierLabel = multiplier.toLocaleString();
  
  // Format end date for title
  const endDateFormatted = actualEndDate ? 
    new Date(actualEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) :
    'June 25, 2025';
  
  const layout = {
    title: {
      text: `Aggregated Age-Standardized Mortality Rate (ASMR) - Countries with Data from 2001 to ${endDateFormatted}`,
      font: { size: 20, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    yaxis: {
      title: `ASMR (per ${multiplierLabel})`,
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.9)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 100, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('asmrChart', traces, layout, config);
}

// Calculate cumulative excess ASMR
function calculateCumulativeExcess(observedData, baselineValues, dateStrings, startDate) {
  const excess = [];
  const dates = [];
  let cumulative = 0;
  
  for (let i = 0; i < observedData.length; i++) {
    const date = new Date(observedData[i].date);
    if (date >= startDate) {
      const obs = observedData[i].asmrSum;
      const base = baselineValues[i];
      if (isFinite(obs) && isFinite(base) && base !== null) {
        // ASMR is annualized (per 100k per year), so divide by 52 to get weekly contribution
        cumulative += (obs - base) / 52;
        excess.push(cumulative);
        dates.push(dateStrings[i]);
      } else {
        excess.push(null);
        dates.push(dateStrings[i]);
      }
    }
  }
  
  return { dates, excess };
}

// Find top 10 countries with biggest differences between 2015-2019 and 2010-2019 baselines at 2025 endpoint
function findTop10CountriesWithBiggestDifferences(dataByCountry) {
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  const endDate2025 = new Date(Date.UTC(2025, 6, 31)); // July 31, 2025
  const baseline2015_2019Start = new Date(Date.UTC(2015, 0, 1));
  const baseline2015_2019End = new Date(Date.UTC(2019, 11, 31));
  const baseline2010_2019Start = new Date(Date.UTC(2010, 0, 1));
  const baseline2010_2019End = new Date(Date.UTC(2019, 11, 31));
  
  const countryDifferences = [];
  
  // Iterate through all countries
  for (const [countryCode, { rows }] of dataByCountry.entries()) {
    const countryName = countryNames[countryCode] || countryCode;
    
    if (!rows || rows.length === 0) {
      continue;
    }
    
    // Prepare country data
    const countryRows = rows.map(r => ({
      date: r.date,
      ASMR100k: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    countryRows.sort((a, b) => a.date - b.date);
    
    // Calculate 2015-2019 baseline
    const baselineData2015_2019 = countryRows.filter(d => d.date >= baseline2015_2019Start && d.date <= baseline2015_2019End);
    const model2015_2019 = quasiPoissonBaseline(baselineData2015_2019, baseline2015_2019Start, baseline2015_2019End);
    
    // Calculate 2010-2019 baseline
    const baselineData2010_2019 = countryRows.filter(d => d.date >= baseline2010_2019Start && d.date <= baseline2010_2019End);
    const model2010_2019 = quasiPoissonBaseline(baselineData2010_2019, baseline2010_2019Start, baseline2010_2019End);
    
    if (!model2015_2019 || !model2010_2019) {
      continue;
    }
    
    const weekDeviations2015_2019 = calculateSeasonalDeviations(baselineData2015_2019, baseline2015_2019Start, baseline2015_2019End, model2015_2019);
    const weekDeviations2010_2019 = calculateSeasonalDeviations(baselineData2010_2019, baseline2010_2019Start, baseline2010_2019End, model2010_2019);
    
    const dates = countryRows.map(r => {
      const d = r.date;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    });
    
    const observedData = countryRows.map((r, i) => ({
      date: r.date,
      asmrSum: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    // Calculate baseline values
    const baselineValues2015_2019 = observedData.map(data => {
      return applySeasonalAdjustment(model2015_2019, data.date, weekDeviations2015_2019, data.Year, data.Week);
    });
    
    const baselineValues2010_2019 = observedData.map(data => {
      return applySeasonalAdjustment(model2010_2019, data.date, weekDeviations2010_2019, data.Year, data.Week);
    });
    
    // Calculate cumulative excess
    const excess2015_2019 = calculateCumulativeExcess(observedData, baselineValues2015_2019, dates, startDate2020);
    const excess2010_2019 = calculateCumulativeExcess(observedData, baselineValues2010_2019, dates, startDate2020);
    
    // Find value at 2025 endpoint
    const findClosestValue = (excessData, targetDate) => {
      let closest = null;
      let closestDiff = Infinity;
      for (let i = 0; i < excessData.dates.length; i++) {
        const date = new Date(excessData.dates[i]);
        const diff = Math.abs(date - targetDate);
        if (date <= targetDate && diff < closestDiff && excessData.excess[i] !== null && isFinite(excessData.excess[i])) {
          closest = excessData.excess[i];
          closestDiff = diff;
        }
      }
      return closest;
    };
    
    const value2015_2019 = findClosestValue(excess2015_2019, endDate2025);
    const value2010_2019 = findClosestValue(excess2010_2019, endDate2025);
    
    if (value2015_2019 !== null && value2010_2019 !== null) {
      const difference = Math.abs(value2015_2019 - value2010_2019);
      countryDifferences.push({
        countryCode: countryCode,
        countryName: countryName,
        value2015_2019: value2015_2019,
        value2010_2019: value2010_2019,
        difference: difference
      });
    }
  }
  
  // Sort by difference (descending) and take top 10
  countryDifferences.sort((a, b) => b.difference - a.difference);
  const top10 = countryDifferences.slice(0, 10);
  
  // Create a color palette for the top 10 countries (distinct colors)
  const colorPalette = [
    '#FF0000', // Red
    '#0000FF', // Blue
    '#00AA00', // Green (darker for better contrast)
    '#FF00FF', // Magenta
    '#FF8C00', // Dark Orange (more distinct from red)
    '#800080', // Purple
    '#00CED1', // Dark Turquoise
    '#FF1493', // Deep Pink
    '#32CD32', // Lime Green
    '#8B4513'  // Saddle Brown (instead of orange red)
  ];
  
  // Create a map of country code to color
  const countryColorMap = new Map();
  top10.forEach((country, index) => {
    countryColorMap.set(country.countryCode, colorPalette[index % colorPalette.length]);
  });
  
  console.log('Top 10 countries with biggest differences:');
  top10.forEach((c, i) => {
    console.log(`${i + 1}. ${c.countryName}: ${c.difference.toFixed(2)} (2015-2019: ${c.value2015_2019.toFixed(2)}, 2010-2019: ${c.value2010_2019.toFixed(2)}) - Color: ${colorPalette[i % colorPalette.length]}`);
  });
  
  return {
    countrySet: new Set(top10.map(c => c.countryCode)),
    colorMap: countryColorMap
  };
}

// Calculate shared y-axis range for both cumulative excess plots
function calculateSharedYAxisRange(dataByCountry) {
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  const baseline2015_2019Start = new Date(Date.UTC(2015, 0, 1));
  const baseline2015_2019End = new Date(Date.UTC(2019, 11, 31));
  const baseline2010_2019Start = new Date(Date.UTC(2010, 0, 1));
  const baseline2010_2019End = new Date(Date.UTC(2019, 11, 31));
  
  let minY = Infinity;
  let maxY = -Infinity;
  
  // Iterate through all countries and collect all y-values
  for (const [countryCode, { rows }] of dataByCountry.entries()) {
    if (!rows || rows.length === 0) continue;
    
    const countryRows = rows.map(r => ({
      date: r.date,
      ASMR100k: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    countryRows.sort((a, b) => a.date - b.date);
    
    // Calculate for 2015-2019 baseline
    const baselineData2015_2019 = countryRows.filter(d => d.date >= baseline2015_2019Start && d.date <= baseline2015_2019End);
    const model2015_2019 = quasiPoissonBaseline(baselineData2015_2019, baseline2015_2019Start, baseline2015_2019End);
    
    // Calculate for 2010-2019 baseline
    const baselineData2010_2019 = countryRows.filter(d => d.date >= baseline2010_2019Start && d.date <= baseline2010_2019End);
    const model2010_2019 = quasiPoissonBaseline(baselineData2010_2019, baseline2010_2019Start, baseline2010_2019End);
    
    if (!model2015_2019 || !model2010_2019) continue;
    
    const weekDeviations2015_2019 = calculateSeasonalDeviations(baselineData2015_2019, baseline2015_2019Start, baseline2015_2019End, model2015_2019);
    const weekDeviations2010_2019 = calculateSeasonalDeviations(baselineData2010_2019, baseline2010_2019Start, baseline2010_2019End, model2010_2019);
    
    const dates = countryRows.map(r => {
      const d = r.date;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    });
    
    const observedData = countryRows.map((r, i) => ({
      date: r.date,
      asmrSum: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    const baselineValues2015_2019 = observedData.map(data => {
      return applySeasonalAdjustment(model2015_2019, data.date, weekDeviations2015_2019, data.Year, data.Week);
    });
    
    const baselineValues2010_2019 = observedData.map(data => {
      return applySeasonalAdjustment(model2010_2019, data.date, weekDeviations2010_2019, data.Year, data.Week);
    });
    
    const excess2015_2019 = calculateCumulativeExcess(observedData, baselineValues2015_2019, dates, startDate2020);
    const excess2010_2019 = calculateCumulativeExcess(observedData, baselineValues2010_2019, dates, startDate2020);
    
    // Update min/max from both excess arrays
    for (const val of excess2015_2019.excess) {
      if (val !== null && isFinite(val)) {
        minY = Math.min(minY, val);
        maxY = Math.max(maxY, val);
      }
    }
    
    for (const val of excess2010_2019.excess) {
      if (val !== null && isFinite(val)) {
        minY = Math.min(minY, val);
        maxY = Math.max(maxY, val);
      }
    }
  }
  
  // Add some padding (5% on each side)
  const padding = (maxY - minY) * 0.05;
  minY = minY - padding;
  maxY = maxY + padding;
  
  return [minY, maxY];
}

// Render cumulative excess plot for all countries using specified baseline
function renderAllCountriesCumulativeExcessPlot(dataByCountry, baselinePeriod = '2015-2019', highlightedData = null, yAxisRange = null, chartId = 'allCountriesCumulativeExcessChart') {
  const multiplier = 100000; // Average per 100k (not sum)
  const multiplierLabel = multiplier.toLocaleString();
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  
  let baselineStartDate, baselineEndDate;
  
  // Handle "Equilibrium-Selected" baseline
  if (baselinePeriod === 'Equilibrium-Selected') {
    // For equilibrium-selected, we'll calculate it per country
    // This will be handled in the loop below
    baselineStartDate = null;
    baselineEndDate = null;
  } else {
    // Parse baseline period (e.g., "2015-2019")
    const [startYear, endYear] = baselinePeriod.split('-').map(Number);
    baselineStartDate = new Date(Date.UTC(startYear, 0, 1));
    baselineEndDate = new Date(Date.UTC(endYear, 11, 31));
  }
  
  const traces = [];
  
  // Iterate through all countries
  for (const [countryCode, { rows }] of dataByCountry.entries()) {
    const countryName = countryNames[countryCode] || countryCode;
    
    if (!rows || rows.length === 0) {
      continue;
    }
    
    // Prepare country data (keep Year and Week for baseline calculations)
    const countryRows = rows.map(r => ({
      date: r.date,
      ASMR100k: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    // Sort by date
    countryRows.sort((a, b) => a.date - b.date);
    
    let model, weekDeviations, baselineData;
    
    if (baselinePeriod === 'Equilibrium-Selected') {
      // Calculate optimal baseline for this country
      // findOptimalBaseline expects data in format: [{ date, asmrSum, Year, Week }]
      const countryDataForOptimal = countryRows.map(r => ({
        date: r.date,
        asmrSum: r.ASMR100k,
        Year: r.Year,
        Week: r.Week
      }));
      const actualEndDate = new Date(Math.max(...countryRows.map(r => r.date.getTime())));
      const optimalBaseline = findOptimalBaseline(countryDataForOptimal, actualEndDate);
      
      if (!optimalBaseline || !optimalBaseline.model) {
        continue; // Skip countries without valid optimal baseline
      }
      
      model = optimalBaseline.model;
      weekDeviations = optimalBaseline.weekDeviations;
      baselineData = countryRows.filter(d => 
        d.date >= optimalBaseline.baselineStart && d.date <= optimalBaseline.baselineEnd
      );
    } else {
      // Use specified baseline period
      baselineData = countryRows.filter(d => d.date >= baselineStartDate && d.date <= baselineEndDate);
      model = quasiPoissonBaseline(baselineData, baselineStartDate, baselineEndDate);
      
      if (!model) {
        continue; // Skip countries without valid baseline
      }
      
      weekDeviations = calculateSeasonalDeviations(baselineData, baselineStartDate, baselineEndDate, model);
    }
    
    // Prepare observed data
    const dates = countryRows.map(r => {
      const d = r.date;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    });
    
    const observedData = countryRows.map((r, i) => ({
      date: r.date,
      asmrSum: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    // Calculate baseline values for all dates
    const baselineValues = observedData.map(data => {
      return applySeasonalAdjustment(model, data.date, weekDeviations, data.Year, data.Week);
    });
    
    // Calculate cumulative excess
    const excess = calculateCumulativeExcess(observedData, baselineValues, dates, startDate2020);
    
    if (excess.dates.length === 0 || !excess.excess.some(v => v !== null)) {
      continue; // Skip countries with no valid excess data
    }
    
    // Check if this country should be highlighted and get its color
    const isHighlighted = highlightedData && highlightedData.countrySet && highlightedData.countrySet.has(countryCode);
    const countryColor = isHighlighted && highlightedData.colorMap 
      ? highlightedData.colorMap.get(countryCode) 
      : 'rgba(128, 128, 128, 0.6)';
    
    // Create trace for this country
      traces.push({
        x: excess.dates,
        y: excess.excess,
        type: 'scatter',
        mode: 'lines',
      name: countryName,
        line: {
        width: isHighlighted ? 3 : 1.5,
        color: countryColor
        },
      hovertemplate: `<b>${countryName}</b><br>` +
                       `Date: %{x}<br>` +
                     `Cumulative Excess: %{y:.2f}<extra></extra>`
    });
  }
  
  if (traces.length === 0) {
    console.warn('No cumulative excess traces to plot');
    return;
  }
  
  const layout = {
    title: {
      text: `Cumulative Excess ASMR (All Countries, ${baselinePeriod} Baseline)`,
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    yaxis: {
      title: `Cumulative Excess ASMR (per ${multiplierLabel})`,
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: true,
      zerolinecolor: '#999999',
      showgrid: true,
      range: yAxisRange || undefined
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'top',
      font: { size: 10 }
    },
    margin: { r: 150, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot(chartId, traces, layout, config);
}

// Render cumulative excess plot for all countries using specified baseline (second chart)
function renderAllCountriesCumulativeExcessPlot2010_2019(dataByCountry, baselinePeriod = '2010-2019', highlightedData = null, yAxisRange = null, chartId = 'allCountriesCumulativeExcessChart2010_2019') {
  const multiplier = 100000; // Average per 100k (not sum)
  const multiplierLabel = multiplier.toLocaleString();
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  
  let baselineStartDate, baselineEndDate;
  
  // Handle "Equilibrium-Selected" baseline
  if (baselinePeriod === 'Equilibrium-Selected') {
    // For equilibrium-selected, we'll calculate it per country
    // This will be handled in the loop below
    baselineStartDate = null;
    baselineEndDate = null;
  } else {
    // Parse baseline period (e.g., "2010-2019")
    const [startYear, endYear] = baselinePeriod.split('-').map(Number);
    baselineStartDate = new Date(Date.UTC(startYear, 0, 1));
    baselineEndDate = new Date(Date.UTC(endYear, 11, 31));
  }
  
  const traces = [];
  
  // Iterate through all countries
  for (const [countryCode, { rows }] of dataByCountry.entries()) {
    const countryName = countryNames[countryCode] || countryCode;
    
    if (!rows || rows.length === 0) {
      continue;
    }
    
    // Prepare country data (keep Year and Week for baseline calculations)
    const countryRows = rows.map(r => ({
      date: r.date,
      ASMR100k: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    // Sort by date
    countryRows.sort((a, b) => a.date - b.date);
    
    let model, weekDeviations, baselineData;
    
    if (baselinePeriod === 'Equilibrium-Selected') {
      // Calculate optimal baseline for this country
      // findOptimalBaseline expects data in format: [{ date, asmrSum, Year, Week }]
      const countryDataForOptimal = countryRows.map(r => ({
        date: r.date,
        asmrSum: r.ASMR100k,
        Year: r.Year,
        Week: r.Week
      }));
      const actualEndDate = new Date(Math.max(...countryRows.map(r => r.date.getTime())));
      const optimalBaseline = findOptimalBaseline(countryDataForOptimal, actualEndDate);
      
      if (!optimalBaseline || !optimalBaseline.model) {
        continue; // Skip countries without valid optimal baseline
      }
      
      model = optimalBaseline.model;
      weekDeviations = optimalBaseline.weekDeviations;
      baselineData = countryRows.filter(d => 
        d.date >= optimalBaseline.baselineStart && d.date <= optimalBaseline.baselineEnd
      );
    } else {
      // Use specified baseline period
      baselineData = countryRows.filter(d => d.date >= baselineStartDate && d.date <= baselineEndDate);
      model = quasiPoissonBaseline(baselineData, baselineStartDate, baselineEndDate);
      
      if (!model) {
        continue; // Skip countries without valid baseline
      }
      
      weekDeviations = calculateSeasonalDeviations(baselineData, baselineStartDate, baselineEndDate, model);
    }
    
    // Prepare observed data
    const dates = countryRows.map(r => {
      const d = r.date;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    });
    
    const observedData = countryRows.map((r, i) => ({
      date: r.date,
      asmrSum: r.ASMR100k,
      Year: r.Year,
      Week: r.Week
    }));
    
    // Calculate baseline values for all dates
    const baselineValues = observedData.map(data => {
      return applySeasonalAdjustment(model, data.date, weekDeviations, data.Year, data.Week);
    });
    
    // Calculate cumulative excess
    const excess = calculateCumulativeExcess(observedData, baselineValues, dates, startDate2020);
    
    if (excess.dates.length === 0 || !excess.excess.some(v => v !== null)) {
      continue; // Skip countries with no valid excess data
    }
    
    // Check if this country should be highlighted and get its color
    const isHighlighted = highlightedData && highlightedData.countrySet && highlightedData.countrySet.has(countryCode);
    const countryColor = isHighlighted && highlightedData.colorMap 
      ? highlightedData.colorMap.get(countryCode) 
      : 'rgba(128, 128, 128, 0.6)';
    
    // Create trace for this country
    traces.push({
      x: excess.dates,
      y: excess.excess,
      type: 'scatter',
      mode: 'lines',
      name: countryName,
      line: {
        width: isHighlighted ? 3 : 1.5,
        color: countryColor
      },
      hovertemplate: `<b>${countryName}</b><br>` +
                     `Date: %{x}<br>` +
                     `Cumulative Excess: %{y:.2f}<extra></extra>`
    });
  }
  
  if (traces.length === 0) {
    console.warn('No cumulative excess traces to plot');
    return;
  }
  
  const layout = {
    title: {
      text: `Cumulative Excess ASMR (All Countries, ${baselinePeriod} Baseline)`,
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    yaxis: {
      title: `Cumulative Excess ASMR (per ${multiplierLabel})`,
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: true,
      zerolinecolor: '#999999',
      showgrid: true,
      range: yAxisRange || undefined
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'top',
      font: { size: 10 }
    },
    margin: { r: 150, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot(chartId, traces, layout, config);
}

// Render cumulative excess plot
function renderCumulativeExcessPlot(plotData) {
  const { dates, aggregatedASMR, fixedBaselines, countryCount, countryCountsPerDate } = plotData;
  const multiplier = 100000; // Average per 100k (not sum)
  const multiplierLabel = multiplier.toLocaleString();
  
  // Prepare observed data with dates - average across countries
  const observedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: countryCountsPerDate && countryCountsPerDate[i] > 0 
      ? aggregatedASMR[i] / countryCountsPerDate[i] 
      : aggregatedASMR[i]
  }));
  
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  
  const traces = [];
  
  // Color palette and dash patterns for the baselines (bright, vibrant colors)
  const baselineStyles = [
    { color: '#00FF00', dash: 'solid', width: 3 },      // bright green (for 2010-2019)
    { color: '#808080', dash: 'solid', width: 2.5 },     // grey (for 2011-2019)
    { color: '#0000FF', dash: 'dot', width: 2.5 },      // bright blue (for 2012-2019)
    { color: '#000000', dash: 'dashdot', width: 2.5 },  // black (for 2013-2019)
    { color: '#FFA500', dash: 'longdash', width: 3 },   // bright orange (for 2014-2019 RMSE minimised)
    { color: '#FF00FF', dash: 'longdashdot', width: 2.5 }, // bright magenta (for 2015-2019)
    { color: '#8B0000', dash: 'dot', width: 3 }         // dark red (for 2016-2019)
  ];
  
  // Define the order we want to show baselines
  const baselineOrder = ['2010-2019', '2011-2019', '2012-2019', '2013-2019', '2014-2019', '2015-2019', '2016-2019'];
  
  // Store legend info for custom annotation-based legend
  const legendEntries = [];
  
  baselineOrder.forEach((key, index) => {
    const baseline = fixedBaselines.get(key);
    if (baseline && baseline.values.length > 0) {
      // Average baseline values across countries (they were calculated from summed data)
      const averagedBaselineValues = baseline.values.map((val, i) => 
        countryCountsPerDate && countryCountsPerDate[i] > 0 
          ? val / countryCountsPerDate[i] 
          : val
      );
      const excess = calculateCumulativeExcess(observedData, averagedBaselineValues, dates, startDate2020);
      if (excess.dates.length > 0 && excess.excess.some(v => v !== null)) {
        const style = baselineStyles[index % baselineStyles.length];
        
        // Get the final cumulative excess value for sorting
        const finalValue = excess.excess[excess.excess.length - 1];
        
        // Use simple name for trace (will hide default legend)
        const traceName = `trace_${index}`;
        
        traces.push({
          x: excess.dates,
          y: excess.excess,
          type: 'scatter',
          mode: 'lines',
          name: traceName,
          showlegend: false, // Hide default legend
          line: {
          width: style.width,
            color: style.color,
            dash: style.dash
          },
          hovertemplate: `<b>Cumulative Excess (${key})</b><br>` +
                         `Date: %{x}<br>` +
                         `Cumulative Excess: %{y:.2f}<extra></extra>`
        });
        
        // Store legend entry info with final value for sorting
        legendEntries.push({
          key: key,
          labels: baseline.labels,
          color: style.color,
          dash: style.dash,
          index: index,
          finalValue: finalValue
        });
      }
    }
  });
  
  // Sort legend entries by final cumulative excess value (descending - highest at top)
  legendEntries.sort((a, b) => {
    const aVal = a.finalValue !== null && isFinite(a.finalValue) ? a.finalValue : -Infinity;
    const bVal = b.finalValue !== null && isFinite(b.finalValue) ? b.finalValue : -Infinity;
    return bVal - aVal; // Descending order
  });
  
  if (traces.length === 0) {
    console.warn('No cumulative excess traces to plot');
    return;
  }
  
  const layout = {
    title: {
      text: 'Cumulative Excess ASMR',
      font: { size: 20, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    yaxis: {
      title: `Average Cumulative Excess ASMR (per ${multiplierLabel})`,
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: true,
      zerolinecolor: '#999999',
      showgrid: true
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: false, // Use custom annotations instead
    margin: { r: 220, t: 60, b: 60, l: 80 },
    annotations: []
  };
  
  // Create custom legend using annotations
  // Position legend on the right side, aligned
  // Calculate spacing based on number of entries
  const numEntries = legendEntries.length;
  const legendStartY = 0.98;
  const legendLineHeight = numEntries > 0 ? Math.min(0.12, 0.98 / numEntries) : 0.12;
  const legendX = 1.01;
  const legendXText = 1.04; // Increased spacing to avoid overlap with line indicator
  
  legendEntries.forEach((entry, idx) => {
    const yPos = legendStartY - (idx * legendLineHeight);
    
    // Add line indicator (colored line symbol) - use different symbols for dash patterns
    let lineSymbol = '▬'; // default solid
    if (entry.dash === 'dash') lineSymbol = '╌';
    else if (entry.dash === 'dot') lineSymbol = '┄';
    else if (entry.dash === 'dashdot') lineSymbol = '╍';
    else if (entry.dash === 'longdash') lineSymbol = '╌';
    else if (entry.dash === 'longdashdot') lineSymbol = '╍';
    
    layout.annotations.push({
      x: legendX,
      y: yPos,
      xref: 'paper',
      yref: 'paper',
      xanchor: 'left',
      yanchor: 'top',
      showarrow: false,
      text: lineSymbol,
      font: { size: 18, color: entry.color },
      bgcolor: 'transparent',
      bordercolor: 'transparent',
      borderwidth: 0
    });
    
    // Add text annotation with baseline period and labels
    // Format: Year on first line, then each name on a new line
    // "2015-2019.<br>Our World in Data<br>The Economist"
    // If no labels, just show the period
    const labelText = entry.labels && entry.labels.length > 0 
      ? `${entry.key}.<br>${entry.labels.join('<br>')}`
      : `${entry.key}.`;
    layout.annotations.push({
      x: legendXText,
      y: yPos,
      xref: 'paper',
      yref: 'paper',
      xanchor: 'left',
      yanchor: 'top',
      showarrow: false,
      text: labelText,
      font: { size: 10, color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
      align: 'left',
      bgcolor: 'transparent',
      bordercolor: 'transparent',
      borderwidth: 0
    });
  });
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('cumulativeExcessChart', traces, layout, config);
  
  // Calculate and display RMSE table
  calculateAndDisplayRMSE(plotData);
}

// Calculate RMSE and relative RMSE for a given time period
function calculateMetricsForPeriod(observedData, baseline, startDate, endDate) {
  const periodData = observedData.filter(d => d.date >= startDate && d.date <= endDate);
  
  if (periodData.length === 0) {
    return { rmse: null, relativeRMSE: null };
  }
  
  // Get predicted values for period dates
  const predicted = periodData.map(d => {
    const baselineValue = baseline.values[d.originalIndex];
    return baselineValue !== null && isFinite(baselineValue) ? baselineValue : null;
  });
  
  // Get observed values (aggregated ASMR)
  const observed = periodData.map(d => d.asmrSum);
  
  // Calculate RMSE
  const validPairs = [];
  for (let i = 0; i < observed.length; i++) {
    if (isFinite(observed[i]) && isFinite(predicted[i]) && predicted[i] !== null) {
      validPairs.push({ obs: observed[i], pred: predicted[i] });
    }
  }
  
  if (validPairs.length === 0) {
    return { rmse: null, relativeRMSE: null };
  }
  
  const rmse = calculateRMSE(
    validPairs.map(p => p.obs),
    validPairs.map(p => p.pred)
  );
  
  // Calculate average observed mortality for the period
  const avgObserved = validPairs.map(p => p.obs).reduce((sum, val) => sum + val, 0) / validPairs.length;
  
  // Calculate relative RMSE as percentage of average mortality
  const relativeRMSE = avgObserved > 0 ? (rmse / avgObserved) * 100 : null;
  
  return { rmse, relativeRMSE };
}

// Calculate and display RMSE table for each baseline against various time periods
function calculateAndDisplayRMSE(plotData) {
  const { dates, aggregatedASMR, fixedBaselines, countryCount } = plotData;
  
  // Prepare all observed data with dates
  const allObservedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: aggregatedASMR[i],
    originalIndex: i
  }));
  
    // Define time periods (earliest to latest, left to right)
    const periods = [
      { name: '2022 (Jan-Jun)', start: new Date(Date.UTC(2022, 0, 1)), end: new Date(Date.UTC(2022, 5, 31)) },
      { name: '2022 (Jul-Dec)', start: new Date(Date.UTC(2022, 6, 1)), end: new Date(Date.UTC(2022, 11, 31)) },
      { name: '2023 (Jan-Jun)', start: new Date(Date.UTC(2023, 0, 1)), end: new Date(Date.UTC(2023, 5, 31)) },
      { name: '2023 (Jul-Dec)', start: new Date(Date.UTC(2023, 6, 1)), end: new Date(Date.UTC(2023, 11, 31)) },
      { name: '2024 (Jan-Jun)', start: new Date(Date.UTC(2024, 0, 1)), end: new Date(Date.UTC(2024, 5, 31)) },
      { name: '2024 (Jul-Dec)', start: new Date(Date.UTC(2024, 6, 1)), end: new Date(Date.UTC(2024, 11, 31)) },
      { name: '2025 (Jan-Jun)', start: new Date(Date.UTC(2025, 0, 1)), end: new Date(Date.UTC(2025, 5, 30)) }
    ];
  
  // Define all baselines to calculate RMSE for
  const baselineOrder = ['2010-2019', '2011-2019', '2012-2019', '2013-2019', '2014-2019', '2015-2019', '2016-2019'];
  
  const rmseResults = [];
  
  for (const key of baselineOrder) {
    const baseline = fixedBaselines.get(key);
    if (!baseline || !baseline.values) continue;
    
    const result = {
      baseline: key,
      labels: baseline.labels || [],
      periods: {}
    };
    
    // Calculate pre-pandemic RMSE (for the baseline period itself)
    const [startYear, endYear] = key.split('-').map(Number);
    const prePandemicStart = new Date(Date.UTC(startYear, 0, 1));
    const prePandemicEnd = new Date(Date.UTC(endYear, 11, 31));
    const prePandemicMetrics = calculateMetricsForPeriod(allObservedData, baseline, prePandemicStart, prePandemicEnd);
    result.prePandemicRMSE = prePandemicMetrics.rmse;
    
    // Calculate metrics for each period
    for (const period of periods) {
      const metrics = calculateMetricsForPeriod(allObservedData, baseline, period.start, period.end);
      result.periods[period.name] = metrics;
    }
    
    rmseResults.push(result);
  }
  
  // Sort by baseline order (not by RMSE)
  const baselineOrderForTable = ['2010-2019', '2011-2019', '2012-2019', '2013-2019', '2014-2019', '2015-2019', '2016-2019'];
  const sortedResults = baselineOrderForTable.map(key => {
    return rmseResults.find(r => r.baseline === key);
  }).filter(r => r !== undefined);
  
  // Display table
  const container = document.getElementById('rmseTable');
  if (!container) return;
  
  let html = '<h3 style="margin-top: 0; margin-bottom: 15px; color: #1a1a1a; font-family: Georgia, \'Times New Roman\', serif; font-size: 1.1em;">RMSE by Time Period</h3>';
  html += '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif; font-size: 0.85em;">';
  html += '<thead><tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Baseline Period</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc; background-color: #e0e0e0;">Pre-Pandemic RMSE</th>';
  
  // Add column headers for each period
  for (const period of periods) {
    html += `<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">${period.name}</th>`;
  }
  html += '</tr></thead><tbody>';
  
  sortedResults.forEach((result, index) => {
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${result.baseline}`;
    if (result.labels && result.labels.length > 0) {
      html += `<br><span style="font-size: 0.8em; color: #666666;">${result.labels.join(', ')}</span>`;
    }
    html += `</td>`;
    
    // Add pre-pandemic RMSE (grey background)
    if (result.prePandemicRMSE !== null) {
      html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: #e0e0e0;">${result.prePandemicRMSE.toFixed(2)}</td>`;
    } else {
      html += '<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: #e0e0e0;">-</td>';
    }
    
    // Add data for each period (only RMSE, no relative RMSE)
    for (const period of periods) {
      const metrics = result.periods[period.name];
      if (metrics.rmse !== null) {
        // Check if this RMSE is lower than pre-pandemic RMSE
        const shouldHighlight = result.prePandemicRMSE !== null && metrics.rmse < result.prePandemicRMSE;
        const value = metrics.rmse.toFixed(2);
        const displayValue = shouldHighlight ? `<strong>${value}*</strong>` : value;
        // Green background for highlighted values (lower than pre-pandemic RMSE)
        const bgColor = shouldHighlight ? '#d4edda' : '';
        html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: ${bgColor};">${displayValue}</td>`;
      } else {
        html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">-</td>`;
      }
    }
    
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  html += '<p style="margin-top: 15px; font-size: 0.85em; color: #333333; font-family: Georgia, \'Times New Roman\', serif; font-style: italic;">';
  html += 'Note: Pre-Pandemic RMSE is calculated as the root mean squared error between observed and predicted ASMR values during the baseline period itself (e.g., for a 2014-2019 baseline, RMSE is calculated for observed vs predicted values from 2014-2019).';
  html += '</p>';
  
  container.innerHTML = html;
}

// Calculate excess mortality (non-cumulative)
function calculateExcess(observedData, baselineValues, dateStrings) {
  const excess = [];
  const dates = [];
  
  for (let i = 0; i < observedData.length; i++) {
    const obs = observedData[i].asmrSum;
    const base = baselineValues[i];
    if (isFinite(obs) && isFinite(base) && base !== null) {
      excess.push(obs - base);
      dates.push(dateStrings[i]);
    } else {
      excess.push(null);
      dates.push(dateStrings[i]);
    }
  }
  
  return { dates, excess };
}

// Aggregate excess data by granularity
function aggregateByGranularity(dates, excess, granularity) {
  if (granularity === 'week') {
    return { dates, excess };
  }
  
  const aggregated = new Map();
  
  dates.forEach((dateStr, i) => {
    if (excess[i] === null || !isFinite(excess[i])) return;
    
    const date = new Date(dateStr);
    let key;
    
    switch (granularity) {
      case 'month':
        key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
        key = `${date.getUTCFullYear()}-Q${quarter}`;
        break;
      case '6month':
        const half = Math.floor(date.getUTCMonth() / 6) + 1;
        key = `${date.getUTCFullYear()}-H${half}`;
        break;
      case 'year':
        key = `${date.getUTCFullYear()}`;
        break;
      default:
        key = dateStr;
    }
    
    if (!aggregated.has(key)) {
      aggregated.set(key, { values: [], dates: [] });
    }
    aggregated.get(key).values.push(excess[i]);
    aggregated.get(key).dates.push(date);
  });
  
  // Convert to arrays and calculate averages
  const aggDates = [];
  const aggExcess = [];
  
  const sortedKeys = Array.from(aggregated.keys()).sort();
  sortedKeys.forEach(key => {
    const data = aggregated.get(key);
    if (data.values.length > 0) {
      const avg = data.values.reduce((a, b) => a + b, 0) / data.values.length;
      // Use the middle date of the period for display
      const sortedDates = data.dates.sort((a, b) => a - b);
      const middleDate = sortedDates[Math.floor(sortedDates.length / 2)];
      
      // Format date based on granularity
      let dateStr;
      switch (granularity) {
        case 'month':
          dateStr = `${middleDate.getUTCFullYear()}-${String(middleDate.getUTCMonth() + 1).padStart(2, '0')}-01`;
          break;
        case 'quarter':
          const quarter = Math.floor(middleDate.getUTCMonth() / 3) + 1;
          dateStr = `${middleDate.getUTCFullYear()}-${String(quarter * 3 - 2).padStart(2, '0')}-01`;
          break;
        case '6month':
          const half = Math.floor(middleDate.getUTCMonth() / 6);
          dateStr = `${middleDate.getUTCFullYear()}-${String(half * 6 + 1).padStart(2, '0')}-01`;
          break;
        case 'year':
          dateStr = `${middleDate.getUTCFullYear()}-01-01`;
          break;
        default:
          dateStr = middleDate.toISOString().split('T')[0];
      }
      
      aggDates.push(dateStr);
      aggExcess.push(avg);
    }
  });
  
  return { dates: aggDates, excess: aggExcess };
}

// Render excess mortality plot (non-cumulative)
function renderExcessPlot(plotData, granularity = 'year') {
  const { dates, aggregatedASMR, fixedBaselines, countryCount, countryCountsPerDate } = plotData;
  const multiplier = 100000; // Average per 100k (not sum)
  const multiplierLabel = multiplier.toLocaleString();
  
  // Prepare observed data with dates - average across countries
  const observedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: countryCountsPerDate && countryCountsPerDate[i] > 0 
      ? aggregatedASMR[i] / countryCountsPerDate[i] 
      : aggregatedASMR[i] / countryCount
  }));
  
  const traces = [];
  
  // Calculate excess for 2014-2019 baseline
  const baseline2014_2019 = fixedBaselines.get('2014-2019');
  if (baseline2014_2019 && baseline2014_2019.values && baseline2014_2019.values.length > 0) {
    // Average baseline values across countries (they were calculated from summed data)
    const averagedBaselineValues = baseline2014_2019.values.map((val, i) => 
      countryCountsPerDate && countryCountsPerDate[i] > 0 
        ? val / countryCountsPerDate[i] 
        : val / countryCount
    );
    const excess = calculateExcess(observedData, averagedBaselineValues, dates);
      if (excess.dates.length > 0 && excess.excess.some(v => v !== null)) {
      // Filter to show from baseline start year (2014) onwards
      const baselineStartDate = new Date(Date.UTC(2014, 0, 1));
      const filteredExcess = {
        dates: [],
        excess: []
      };
      for (let i = 0; i < excess.dates.length; i++) {
        const date = new Date(excess.dates[i]);
        if (date >= baselineStartDate) {
          filteredExcess.dates.push(excess.dates[i]);
          filteredExcess.excess.push(excess.excess[i]);
        }
      }
      // Aggregate by granularity
      const aggregated = aggregateByGranularity(filteredExcess.dates, filteredExcess.excess, granularity);
        
        traces.push({
        x: aggregated.dates,
        y: aggregated.excess,
          type: 'scatter',
          mode: 'lines',
        name: 'Excess ASMR',
          line: {
            width: 2,
          color: '#8b0000'
          },
        hovertemplate: `<b>Excess ASMR</b><br>` +
                         `Date: %{x}<br>` +
                       `Excess: %{y:.1f}<extra></extra>`
        });
      }
    }
  
  if (traces.length === 0) {
    console.warn('No excess traces to plot');
    return;
  }
  
  // Calculate date range for grey shading (2020 onwards)
  const pandemicStart = new Date(Date.UTC(2020, 0, 1));
  const lastDate = traces.length > 0 && traces[0].x && traces[0].x.length > 0 
    ? traces[0].x[traces[0].x.length - 1] 
    : null;
  
  const shapes = [];
  if (lastDate) {
    shapes.push({
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0: pandemicStart.toISOString().split('T')[0],
      y0: 0,
      x1: lastDate,
      y1: 1,
      fillcolor: '#d3d3d3',
      opacity: 0.3,
      layer: 'below',
      line: {
        width: 0
      }
    });
  }
  
  const layout = {
    title: {
      text: 'Excess Age-Standardised Mortality Rate<br><sub style="font-size: 0.6em; color: #666666;">Averaged across 22 countries from the STMF dataset.</sub>',
      font: { size: 20, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      dtick: 'M12', // Show tick every 12 months (yearly)
      tickformat: '%Y' // Format as year only
    },
    yaxis: {
      title: `Excess ASMR (per ${multiplierLabel})`,
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: true,
      zerolinecolor: '#999999',
      showgrid: true
    },
    shapes: shapes,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.9)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 100, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('excessChart', traces, layout, config);
}

// Render baseline-focused ASMR chart
function render2014Chart(plotData, baselinePeriod = '2014-2019') {
  const { dates, aggregatedASMR, fixedBaselines, countryCount } = plotData;
  
  // Parse baseline period (e.g., "2014-2019")
  const [startYear, endYear] = baselinePeriod.split('-').map(Number);
  const startDate = new Date(Date.UTC(startYear, 0, 1));
  
  // Prepare observed data with dates
  const observedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: aggregatedASMR[i],
    originalIndex: i
  }));
  
  // Filter to show from baseline start year onwards (to include pandemic period for highlighting)
  const filteredData = observedData.filter(d => d.date >= startDate);
  
  if (filteredData.length === 0) {
    console.warn(`No data found from ${startYear} onwards`);
    return;
  }
  
  const filteredDates = filteredData.map(d => d.date.toISOString().split('T')[0]);
  const filteredASMR = filteredData.map(d => d.asmrSum / countryCount); // Average ASMR per 100k
  
  // Get baseline (check if it exists in fixedBaselines, otherwise calculate it)
  let baseline = fixedBaselines.get(baselinePeriod);
  
  // If baseline doesn't exist in fixedBaselines, we need to calculate it
  if (!baseline) {
    // Find the baseline data from the full dataset
    const baselineStartDate = new Date(Date.UTC(startYear, 0, 1));
    const baselineEndDate = new Date(Date.UTC(endYear, 11, 31));
    
    // We need to get the baseline data - let's use the aggregated data
    // For now, let's try to calculate it from the existing data structure
    // Actually, we should calculate it using quasiPoissonBaseline
    // But for simplicity, let's check if we can get it from the data
    console.warn(`Baseline ${baselinePeriod} not found in fixedBaselines, attempting to calculate...`);
    
    // We'll need to calculate this baseline - for now, let's use a placeholder
    // In a full implementation, we'd call quasiPoissonBaseline here
    baseline = null;
  }
  
  let baselineValues = [];
  if (baseline && baseline.values) {
    // Match baseline values to filtered data by original index
    baselineValues = filteredData.map(d => {
      const baselineValue = baseline.values[d.originalIndex];
      return baselineValue !== null && isFinite(baselineValue) ? baselineValue / countryCount : null;
    });
  } else {
    // Calculate baseline on the fly if not in fixedBaselines
    // We need access to the raw data - let's try to get it from plotData
    // For now, return early if baseline can't be found
    console.warn(`Cannot render chart: baseline ${baselinePeriod} not available`);
    return;
  }
  
  const traces = [{
    x: filteredDates,
    y: filteredASMR,
    type: 'scatter',
    mode: 'lines',
    name: 'Observed ASMR',
    line: {
      width: 2,
      color: '#1a1a1a'
    },
    hovertemplate: `<b>Observed ASMR</b><br>` +
                   `Date: %{x}<br>` +
                   `ASMR: %{y:.1f} per 100k<extra></extra>`
  }];
  
  // Add 2014-2019 baseline (projected forward)
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    traces.push({
      x: filteredDates,
      y: baselineValues,
      type: 'scatter',
      mode: 'lines',
      name: `${baselinePeriod} Baseline`,
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      hovertemplate: `<b>${baselinePeriod} Baseline</b><br>` +
                     `Date: %{x}<br>` +
                     `Baseline: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  // Define pandemic period for shading (2020 onwards, non-inclusive of 2014-2020)
  const pandemicStart = new Date(Date.UTC(2020, 0, 1));
  const lastDate = filteredDates[filteredDates.length - 1];
  
  // Add grey rectangle for pandemic period (2020 onwards)
  const shapes = [{
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: pandemicStart.toISOString().split('T')[0],
    y0: 0,
    x1: lastDate,
    y1: 1,
    fillcolor: '#d3d3d3',
    opacity: 0.3,
    layer: 'below',
    line: {
      width: 0
    }
  }];
  
  // Add red and green shading for excess/negative excess using filled traces
  // We'll use separate traces that fill independently to avoid color mixing
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    const baselineTraceIndex = traces.findIndex(t => t.name === `${baselinePeriod} Baseline`);
    if (baselineTraceIndex !== -1) {
      // Create a baseline reference trace for filling (invisible, just for fill reference)
      const baselineRefTrace = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      
      // Create a trace for green negative excess: observed when < baseline, baseline otherwise  
      const negativeExcessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs < base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      // Create a trace for red excess: observed when > baseline, baseline otherwise
      const excessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs > base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      // Insert baseline reference trace (invisible, for fill reference)
      traces.splice(baselineTraceIndex + 1, 0, baselineRefTrace);
      
      // Add green filled area trace (fills to baseline reference)
      traces.splice(baselineTraceIndex + 2, 0, {
        x: filteredDates,
        y: negativeExcessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 150, 0, 0.5)', // More saturated pure green
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      // Add red filled area trace (also fills to baseline reference, not green)
      // We need to insert another baseline reference for red to fill to
      const baselineRefTrace2 = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      traces.splice(baselineTraceIndex + 3, 0, baselineRefTrace2);
      
      traces.splice(baselineTraceIndex + 4, 0, {
        x: filteredDates,
        y: excessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(200, 0, 0, 0.5)', // Slightly darker red for better contrast
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  
  const layout = {
    title: {
      text: `Age-Standardised Mortality Rate<br><sub style="font-size: 0.6em; color: #666666;">Averaged across ${countryCount} countries from the STMF dataset.</sub>`,
      font: { size: 20, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      dtick: 'M12', // Show tick every 12 months (yearly)
      tickformat: '%Y' // Format as year only
    },
    yaxis: {
      title: 'Average ASMR (per 100k per year, annualized)',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 1.02,
      y: 1,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.9)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 100, t: 60, b: 60, l: 80 },
    shapes: shapes
  };
  
  if (traces.length === 0) {
    console.warn('No traces to plot for 2014 chart');
    const chartDiv = document.getElementById('asmr2014Chart');
    if (chartDiv) {
      chartDiv.innerHTML = '<p style="padding: 20px; color: #8b0000;">No data available for this chart.</p>';
    }
    return;
  }
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('asmr2014Chart', traces, layout, config);
}

// Render simplified excess plot (no dropdowns, fixed year granularity)
function renderSimpleExcessPlot(plotData) {
  const { dates, aggregatedASMR, fixedBaselines, countryCount, countryCountsPerDate } = plotData;
  const multiplier = 100000;
  const multiplierLabel = multiplier.toLocaleString();
  
  const observedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: countryCountsPerDate && countryCountsPerDate[i] > 0 
      ? aggregatedASMR[i] / countryCountsPerDate[i] 
      : aggregatedASMR[i] / countryCount
  }));
  
  const traces = [];
  const baseline2014_2019 = fixedBaselines.get('2014-2019');
  if (baseline2014_2019 && baseline2014_2019.values && baseline2014_2019.values.length > 0) {
    const averagedBaselineValues = baseline2014_2019.values.map((val, i) => 
      countryCountsPerDate && countryCountsPerDate[i] > 0 
        ? val / countryCountsPerDate[i] 
        : val / countryCount
    );
    const excess = calculateExcess(observedData, averagedBaselineValues, dates);
    if (excess.dates.length > 0 && excess.excess.some(v => v !== null)) {
      const baselineStartDate = new Date(Date.UTC(2014, 0, 1));
      const filteredExcess = {
        dates: [],
        excess: []
      };
      for (let i = 0; i < excess.dates.length; i++) {
        const date = new Date(excess.dates[i]);
        if (date >= baselineStartDate) {
          filteredExcess.dates.push(excess.dates[i]);
          filteredExcess.excess.push(excess.excess[i]);
        }
      }
      const aggregated = aggregateByGranularity(filteredExcess.dates, filteredExcess.excess, 'year');
      
      traces.push({
        x: aggregated.dates,
        y: aggregated.excess,
        type: 'scatter',
        mode: 'lines',
        name: 'Excess ASMR (2014-2019 Baseline)',
        line: {
          width: 2,
          color: '#8b0000'
        },
        hovertemplate: `<b>Excess ASMR (2014-2019 Baseline)</b><br>Date: %{x}<br>Excess: %{y:.1f}<extra></extra>`
      });
    }
  }
  
  if (traces.length === 0) {
    console.warn('No excess traces to plot');
    return;
  }
  
  const pandemicStart = new Date(Date.UTC(2020, 0, 1));
  const lastDate = traces.length > 0 && traces[0].x && traces[0].x.length > 0 
    ? traces[0].x[traces[0].x.length - 1] 
    : null;
  
  const shapes = [];
  if (lastDate) {
    shapes.push({
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0: pandemicStart.toISOString().split('T')[0],
      y0: 0,
      x1: lastDate,
      y1: 1,
      fillcolor: '#d3d3d3',
      opacity: 0.3,
      layer: 'below',
      line: { width: 0 }
    });
  }
  
  const layout = {
    title: {
      text: 'Excess Age-Standardised Mortality Rate<br><sub style="font-size: 0.6em; color: #666666;">Averaged across 22 countries from the STMF dataset.</sub>',
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      dtick: 'M12',
      tickformat: '%Y'
    },
    yaxis: {
      title: `Excess ASMR (per ${multiplierLabel})`,
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: true,
      zerolinecolor: '#999999',
      showgrid: true
    },
    shapes: shapes,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.8)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 40, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('simpleExcessChart', traces, layout, config);
}

// Render simplified ASMR chart (no dropdowns, fixed 2014-2019 baseline)
function renderSimpleASMRChart(plotData) {
  const { dates, aggregatedASMR, fixedBaselines, countryCount, countryCountsPerDate } = plotData;
  const baselinePeriod = '2014-2019';
  const [startYear, endYear] = baselinePeriod.split('-').map(Number);
  const startDate = new Date(Date.UTC(startYear, 0, 1));
  
  const observedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: countryCountsPerDate && countryCountsPerDate[i] > 0 
      ? aggregatedASMR[i] / countryCountsPerDate[i] 
      : aggregatedASMR[i] / countryCount,
    originalIndex: i
  }));
  
  const filteredData = observedData.filter(d => d.date >= startDate);
  if (filteredData.length === 0) {
    console.warn('No data to plot for simple ASMR chart');
    return;
  }
  
  const filteredDates = filteredData.map(d => d.date);
  const filteredASMR = filteredData.map(d => d.asmrSum);
  
  const baseline = fixedBaselines.get(baselinePeriod);
  let baselineValues = [];
  if (baseline && baseline.values) {
    baselineValues = filteredData.map(d => {
      const baselineValue = baseline.values[d.originalIndex];
      return baselineValue !== null && isFinite(baselineValue) 
        ? (countryCountsPerDate && countryCountsPerDate[d.originalIndex] > 0 
            ? baselineValue / countryCountsPerDate[d.originalIndex] 
            : baselineValue / countryCount)
        : null;
    });
  } else {
    console.warn(`Cannot render simple ASMR chart: baseline ${baselinePeriod} not available`);
    return;
  }
  
  const traces = [{
    x: filteredDates,
    y: filteredASMR,
    type: 'scatter',
    mode: 'lines',
    name: 'Observed ASMR',
    line: {
      width: 2,
      color: '#1a1a1a'
    },
    hovertemplate: `<b>Observed ASMR</b><br>Date: %{x}<br>ASMR: %{y:.1f} per 100k<extra></extra>`
  }];
  
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    traces.push({
      x: filteredDates,
      y: baselineValues,
      type: 'scatter',
      mode: 'lines',
      name: `${baselinePeriod} Baseline`,
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      hovertemplate: `<b>${baselinePeriod} Baseline</b><br>Date: %{x}<br>Baseline: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  const pandemicStart = new Date(Date.UTC(2020, 0, 1));
  const lastDate = filteredDates[filteredDates.length - 1];
  
  const shapes = [{
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: pandemicStart.toISOString().split('T')[0],
    y0: 0,
    x1: lastDate,
    y1: 1,
    fillcolor: '#d3d3d3',
    opacity: 0.3,
    layer: 'below',
    line: { width: 0 }
  }];
  
  // Add red and green shading
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    const baselineTraceIndex = traces.findIndex(t => t.name === `${baselinePeriod} Baseline`);
    if (baselineTraceIndex !== -1) {
      const baselineRefTrace = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      
      const negativeExcessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs < base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      const excessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs > base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      traces.splice(baselineTraceIndex + 1, 0, baselineRefTrace);
      
      traces.splice(baselineTraceIndex + 2, 0, {
        x: filteredDates,
        y: negativeExcessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 150, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      const baselineRefTrace2 = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      traces.splice(baselineTraceIndex + 3, 0, baselineRefTrace2);
      
      traces.splice(baselineTraceIndex + 4, 0, {
        x: filteredDates,
        y: excessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(200, 0, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  
  const layout = {
    title: {
      text: `Age-Standardised Mortality Rate<br><sub style="font-size: 0.6em; color: #666666;">Averaged across ${countryCount} countries from the STMF dataset.</sub>`,
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      dtick: 'M12',
      tickformat: '%Y'
    },
    yaxis: {
      title: 'Average ASMR (per 100k per year, annualized)',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    shapes: shapes,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.8)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 40, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('simpleASMRChart', traces, layout, config);
}

// Render ASMR chart for a specific country
function renderCountryASMRChart(filteredDataByCountry, countryCode, baselinePeriod, chartId, dateRange = null) {
  const countryData = filteredDataByCountry.get(countryCode);
  
  if (!countryData || !countryData.rows || countryData.rows.length === 0) {
    console.warn(`No data available for ${countryCode}`);
    const container = document.getElementById(chartId);
    if (container) {
      const countryName = countryNames[countryCode] || countryCode;
      container.innerHTML = `<p>No data available for ${countryName}.</p>`;
    }
    return;
  }
  
  const [startYear, endYear] = baselinePeriod.split('-').map(Number);
  const startDate = new Date(Date.UTC(startYear, 0, 1));
  const endDate = new Date(Date.UTC(endYear, 11, 31));
  
  // Prepare country data (keep Year and Week for baseline calculations)
  const countryRows = countryData.rows.map(r => ({
    date: r.date,
    ASMR100k: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  // Sort by date
  countryRows.sort((a, b) => a.date - b.date);
  
  // Filter data from baseline start onwards
  let filteredData = countryRows.filter(d => d.date >= startDate);
  
  // If dateRange is provided, further filter to that range
  if (dateRange) {
    const rangeStart = new Date(Date.UTC(dateRange.startYear, dateRange.startMonth !== undefined ? dateRange.startMonth : 0, 1));
    const rangeEnd = new Date(Date.UTC(dateRange.endYear, dateRange.endMonth !== undefined ? dateRange.endMonth : 11, dateRange.endMonth !== undefined ? new Date(dateRange.endYear, dateRange.endMonth + 1, 0).getDate() : 31, 23, 59, 59));
    filteredData = filteredData.filter(d => d.date >= rangeStart && d.date <= rangeEnd);
  }
  
  if (filteredData.length === 0) {
    console.warn(`No data to plot for ${countryCode} ASMR chart with baseline ${baselinePeriod}`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>No data available for baseline period ${baselinePeriod}.</p>`;
    }
    return;
  }
  
  const filteredDates = filteredData.map(d => {
    const date = d.date;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  });
  const filteredASMR = filteredData.map(d => d.ASMR100k);
  
  // Calculate baseline for country
  const baselineData = countryRows.filter(d => d.date >= startDate && d.date <= endDate);
  const model = quasiPoissonBaseline(baselineData, startDate, endDate);
  
  let baselineValues = [];
  if (model) {
    const weekDeviations = calculateSeasonalDeviations(baselineData, startDate, endDate, model);
    baselineValues = filteredData.map(d => {
      return applySeasonalAdjustment(model, d.date, weekDeviations, d.Year, d.Week);
    });
  } else {
    console.warn(`Cannot calculate baseline for ${countryCode}: ${baselinePeriod}`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>Cannot calculate baseline for period ${baselinePeriod}.</p>`;
    }
    return;
  }
  
  const traces = [{
    x: filteredDates,
    y: filteredASMR,
    type: 'scatter',
    mode: 'lines',
    name: 'Observed ASMR',
    line: {
      width: 2,
      color: '#1a1a1a'
    },
    hovertemplate: `<b>Observed ASMR</b><br>Date: %{x}<br>ASMR: %{y:.1f} per 100k<extra></extra>`
  }];
  
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    traces.push({
      x: filteredDates,
      y: baselineValues,
      type: 'scatter',
      mode: 'lines',
      name: `${baselinePeriod} Baseline`,
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      hovertemplate: `<b>${baselinePeriod} Baseline</b><br>Date: %{x}<br>Baseline: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  const pandemicStart = new Date(Date.UTC(2020, 0, 1));
  const lastDate = filteredDates[filteredDates.length - 1];
  
  const shapes = [{
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: pandemicStart.toISOString().split('T')[0],
    y0: 0,
    x1: lastDate,
    y1: 1,
    fillcolor: '#d3d3d3',
    opacity: 0.3,
    layer: 'below',
    line: { width: 0 }
  }];
  
  // Add red and green shading
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    const baselineTraceIndex = traces.findIndex(t => t.name === `${baselinePeriod} Baseline`);
    if (baselineTraceIndex !== -1) {
      const baselineRefTrace = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      
      const negativeExcessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs < base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      const excessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs > base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      traces.splice(baselineTraceIndex + 1, 0, baselineRefTrace);
      
      traces.splice(baselineTraceIndex + 2, 0, {
        x: filteredDates,
        y: negativeExcessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 150, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      const baselineRefTrace2 = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      traces.splice(baselineTraceIndex + 3, 0, baselineRefTrace2);
      
      traces.splice(baselineTraceIndex + 4, 0, {
        x: filteredDates,
        y: excessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(200, 0, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  
  // Create subtitle based on baseline period
  let subtitle = '';
  if (baselinePeriod === '2016-2019') {
    subtitle = '2016-2019 Baseline, <a href="https://doi.org/10.1093/ije/dyaf093" target="_blank" style="color: #666666;">MJ Plank</a>';
  } else if (baselinePeriod === '2010-2016') {
    subtitle = '2010-2016 Baseline, RMSE 2025 minimised';
  } else {
    subtitle = `${baselinePeriod} Baseline`;
  }
  
  // Create title - use full title even with dateRange
  const countryName = countryNames[countryCode] || countryCode;
  let titleText = `Age-Standardised Mortality Rate: ${countryName}<br><sub style="font-size: 0.6em; color: #666666;">${subtitle}</sub>`;
  
  const layout = {
    title: {
      text: titleText,
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      dtick: 'M12',
      tickformat: '%Y',
      // If dateRange is provided, set the range to zoom into that period
      range: dateRange ? [
        new Date(Date.UTC(dateRange.startYear, dateRange.startMonth !== undefined ? dateRange.startMonth : 0, 1)),
        new Date(Date.UTC(dateRange.endYear, dateRange.endMonth !== undefined ? dateRange.endMonth : 11, dateRange.endMonth !== undefined ? new Date(dateRange.endYear, dateRange.endMonth + 1, 0).getDate() : 31))
      ] : undefined
    },
    yaxis: {
      title: 'ASMR (per 100k per year, annualized)',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    shapes: shapes,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.8)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 40, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot(chartId, traces, layout, config);
}

// Render Bulgaria ASMR chart with formula annotations
function renderBulgariaASMRChartWithFormula(filteredDataByCountry, chartId) {
  const countryCode = 'BGR';
  const countryData = filteredDataByCountry.get(countryCode);
  
  if (!countryData || !countryData.rows || countryData.rows.length === 0) {
    console.warn(`No data available for ${countryCode}`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>No data available for Bulgaria.</p>`;
    }
    return;
  }
  
  // Prepare country data (keep Year and Week for baseline calculations)
  const countryRows = countryData.rows.map(r => ({
    date: r.date,
    ASMR100k: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  // Sort by date
  countryRows.sort((a, b) => a.date - b.date);
  
  // Use all available data (no filtering)
  const filteredData = countryRows;
  
  if (filteredData.length === 0) {
    console.warn(`No data to plot for ${countryCode} ASMR chart`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>No data available.</p>`;
    }
    return;
  }
  
  const filteredDates = filteredData.map(d => {
    const date = d.date;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  });
  const filteredASMR = filteredData.map(d => d.ASMR100k);
  
  // Find optimal baseline using RMSE 2025 minimization
  // Convert to format expected by findOptimalBaseline
  const dataForOptimalBaseline = countryRows.map(d => ({
    date: d.date,
    asmrSum: d.ASMR100k
  }));
  const dataEndDate = new Date(Math.max(...countryRows.map(d => d.date.getTime())));
  const optimalBaselineResult = findOptimalBaseline(dataForOptimalBaseline, dataEndDate);
  
  if (!optimalBaselineResult || !optimalBaselineResult.model) {
    console.warn(`Could not find optimal baseline for ${countryCode}`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>Could not calculate optimal baseline.</p>`;
    }
    return;
  }
  
  const baselineStartDate = optimalBaselineResult.baselineStart;
  const baselineEndDate = optimalBaselineResult.baselineEnd;
  const baselineStartYear = baselineStartDate.getUTCFullYear();
  const baselineEndYear = baselineEndDate.getUTCFullYear();
  const baselinePeriod = `${baselineStartYear}-${baselineEndYear}`;
  
  // Calculate baseline values using the optimal baseline
  const model = optimalBaselineResult.model;
  const weekDeviations = optimalBaselineResult.weekDeviations;
  
  const baselineValues = filteredData.map(d => {
    return applySeasonalAdjustment(model, d.date, weekDeviations, d.Year, d.Week);
  });
  
  const traces = [{
    x: filteredDates,
    y: filteredASMR,
    type: 'scatter',
    mode: 'lines',
    name: 'Observed ASMR',
    line: {
      width: 2,
      color: '#1a1a1a'
    },
    hovertemplate: `<b>Observed ASMR</b><br>Date: %{x}<br>ASMR: %{y:.1f} per 100k<extra></extra>`
  }];
  
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    traces.push({
      x: filteredDates,
      y: baselineValues,
      type: 'scatter',
      mode: 'lines',
      name: `${baselinePeriod} Baseline`,
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      hovertemplate: `<b>${baselinePeriod} Baseline</b><br>Date: %{x}<br>Baseline: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  // Define period boundaries
  const earliestDate = filteredDates[0];
  const latestDate = filteredDates[filteredDates.length - 1];
  const preBaselineEnd = new Date(Date.UTC(2009, 11, 31));
  const shockStart = new Date(Date.UTC(2020, 0, 1));
  const shockEnd = new Date(Date.UTC(2024, 11, 31));
  const postShockStart = new Date(Date.UTC(2025, 0, 1));
  const chartEndDate = new Date(Date.UTC(2027, 11, 31));
  
  // Create shapes for shaded regions
  const shapes = [];
  
  // ℬᵢ period (all possible baseline windows up to 2019) - light purple/grey
  const biStartDate = new Date(Date.UTC(2001, 0, 1)); // Earliest possible baseline start
  const biEndDate = new Date(Date.UTC(2019, 11, 31)); // Latest possible baseline end
  shapes.push({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: biStartDate.toISOString().split('T')[0],
    y0: 0,
    x1: biEndDate.toISOString().split('T')[0],
    y1: 1,
    fillcolor: 'rgba(200, 180, 220, 0.5)',
    opacity: 0.5,
    layer: 'below',
    line: { width: 0 }
  });
  
  // Baseline period (Bᵢ*) - light blue, not full height to show it's a subset of ℬᵢ
  shapes.push({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: baselineStartDate.toISOString().split('T')[0],
    y0: 0,
    x1: baselineEndDate.toISOString().split('T')[0],
    y1: 0.75, // Not full height to show it's a subset
    fillcolor: 'rgba(173, 216, 230, 0.6)',
    opacity: 0.6,
    layer: 'below',
    line: { width: 0 }
  });
  
  // Shock period (2020-2024) - orange/red, darker
  shapes.push({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: shockStart.toISOString().split('T')[0],
    y0: 0,
    x1: shockEnd.toISOString().split('T')[0],
    y1: 1,
    fillcolor: 'rgba(255, 165, 0, 0.5)',
    opacity: 0.5,
    layer: 'below',
    line: { width: 0 }
  });
  
  // Post-shock period (2025+) - light green, darker
  shapes.push({
    type: 'rect',
    xref: 'x',
    yref: 'paper',
    x0: postShockStart.toISOString().split('T')[0],
    y0: 0,
    x1: chartEndDate.toISOString().split('T')[0],
    y1: 1,
    fillcolor: 'rgba(144, 238, 144, 0.5)',
    opacity: 0.5,
    layer: 'below',
    line: { width: 0 }
  });
  
  // Add annotations
  const annotations = [];
  
  // Find y-axis range for positioning annotations
  const allYValues = [...filteredASMR, ...baselineValues.filter(v => v !== null && isFinite(v))];
  const yMin = Math.min(...allYValues);
  const yMax = Math.max(...allYValues);
  const yRange = yMax - yMin;
  const annotationY = yMax - yRange * 0.1; // Position near top
  
  // ℬᵢ annotation - for the period up to 2019 (where baselines can be selected)
  // Position it at the start of available data or 2010
  const biAnnotationDate = new Date(Date.UTC(2010, 0, 1));
  annotations.push({
    x: biAnnotationDate.toISOString().split('T')[0],
    y: annotationY,
    text: 'ℬ<sub>i</sub>',
    showarrow: false,
    font: { size: 16, color: '#6a4c93', family: 'Georgia, "Times New Roman", serif' },
    bgcolor: 'rgba(200, 180, 220, 0.9)',
    bordercolor: '#6a4c93',
    borderwidth: 2,
    borderpad: 4
  });
  
  // Bᵢ* annotation - for the optimal baseline period
  const biStarMidDate = new Date((baselineStartDate.getTime() + baselineEndDate.getTime()) / 2); // Midpoint of optimal baseline
  annotations.push({
    x: biStarMidDate.toISOString().split('T')[0],
    y: annotationY - yRange * 0.15,
    text: '<em>B</em><sub>i</sub><sup>*</sup>',
    showarrow: false,
    font: { size: 16, color: '#0066cc', family: 'Georgia, "Times New Roman", serif' },
    bgcolor: 'rgba(173, 216, 230, 0.9)',
    bordercolor: '#0066cc',
    borderwidth: 2,
    borderpad: 4
  });
  
  // Shock period annotation
  const shockMidDate = new Date(Date.UTC(2022, 5, 15));
  annotations.push({
    x: shockMidDate.toISOString().split('T')[0],
    y: annotationY,
    text: 'Shock',
    showarrow: false,
    font: { size: 14, color: '#cc6600', family: 'Georgia, "Times New Roman", serif' },
    bgcolor: 'rgba(255, 255, 255, 0.8)',
    bordercolor: '#cc6600',
    borderwidth: 1,
    borderpad: 4
  });
  
  // Post-shock annotation
  const postShockMidDate = new Date(Date.UTC(2026, 5, 15));
  annotations.push({
    x: postShockMidDate.toISOString().split('T')[0],
    y: annotationY,
    text: 'Post-shock',
    showarrow: false,
    font: { size: 14, color: '#006600', family: 'Georgia, "Times New Roman", serif' },
    bgcolor: 'rgba(255, 255, 255, 0.8)',
    bordercolor: '#006600',
    borderwidth: 1,
    borderpad: 4
  });
  
  // Annotation pointing to 2025 data explaining RMSE minimization
  // Center it in the green area (2025-2027) - horizontally centered
  const greenAreaCenterX = new Date((postShockStart.getTime() + chartEndDate.getTime()) / 2);
  
  // Find the actual data point at 2025 for the arrow target
  const data2025Index = filteredDates.findIndex(d => {
    const date = new Date(d);
    return date.getUTCFullYear() === 2025 && date.getUTCMonth() === 0 && date.getUTCDate() <= 7; // Early 2025
  });
  let arrowTargetY = yMin + yRange * 0.27; // Default position
  if (data2025Index >= 0 && data2025Index < filteredASMR.length) {
    const targetValue = filteredASMR[data2025Index];
    if (isFinite(targetValue) && targetValue !== null) {
      arrowTargetY = targetValue;
    }
  }
  
  // Position annotation in the lower part of the y-axis range
  const rmseAnnotationY = yMin + yRange * 0.42; // Position in lower area (60% from bottom)
  
  // Calculate arrow offset (ensure it's a valid number)
  const arrowOffset = arrowTargetY - rmseAnnotationY;
  const validArrowOffset = isFinite(arrowOffset) ? arrowOffset : -yRange * 0.3;
  
  annotations.push({
    x: greenAreaCenterX.toISOString().split('T')[0],
    y: rmseAnnotationY,
    text: '<em>B</em><sub>i</sub><sup>*</sup> reference period<br>has minimised the<br>post-shock RMSE',
    showarrow: false,
    font: { size: 12, color: '#0066cc', family: 'Georgia, "Times New Roman", serif' },
    bgcolor: 'rgba(255, 255, 255, 0.9)',
    bordercolor: '#0066cc',
    borderwidth: 2,
    borderpad: 6,
    align: 'center'
  });
  
  // Add red and green shading for excess/deficit mortality
  if (baselineValues.length > 0 && baselineValues.length === filteredDates.length) {
    const baselineTraceIndex = traces.findIndex(t => t.name === `${baselinePeriod} Baseline`);
    if (baselineTraceIndex !== -1) {
      const baselineRefTrace = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      
      const negativeExcessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs < base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      const excessY = filteredASMR.map((obs, i) => {
        const base = baselineValues[i];
        if (base !== null && isFinite(base) && isFinite(obs) && obs > base) {
          return obs;
        }
        return base !== null && isFinite(base) ? base : null;
      });
      
      traces.splice(baselineTraceIndex + 1, 0, baselineRefTrace);
      
      traces.splice(baselineTraceIndex + 2, 0, {
        x: filteredDates,
        y: negativeExcessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 150, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      const baselineRefTrace2 = {
        x: filteredDates,
        y: baselineValues,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      traces.splice(baselineTraceIndex + 3, 0, baselineRefTrace2);
      
      traces.splice(baselineTraceIndex + 4, 0, {
        x: filteredDates,
        y: excessY,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(200, 0, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  
  const countryName = countryNames[countryCode] || countryCode;
  const titleText = `Age-Standardised Mortality Rate: ${countryName}<br><sub style="font-size: 0.6em; color: #666666;">${baselinePeriod} Baseline (RMSE 2025 minimized)</sub>`;
  
  const layout = {
    title: {
      text: titleText,
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      dtick: 'M12',
      tickformat: '%Y',
      range: ['2001-01-01', chartEndDate.toISOString().split('T')[0]]
    },
    yaxis: {
      title: 'ASMR (per 100k per year, annualized)',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    shapes: shapes,
    annotations: annotations,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.8)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 40, t: 60, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  try {
    Plotly.newPlot(chartId, traces, layout, config);
  } catch (error) {
    console.error('Error rendering Bulgaria chart:', error);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>Error rendering chart: ${error.message}</p>`;
    }
  }
}

// Render New Zealand's ASMR chart (wrapper for backward compatibility)
function renderNZASMRChart(filteredDataByCountry, baselinePeriod, chartId, dateRange = null) {
  return renderCountryASMRChart(filteredDataByCountry, 'NZL_NP', baselinePeriod, chartId, dateRange);
}

// Render New Zealand's ASMR comparison chart for 2017 and 2019
function renderNZASMRComparisonChart(filteredDataByCountry, baselinePeriod, chartId) {
  const countryCode = 'NZL_NP';
  const countryData = filteredDataByCountry.get(countryCode);
  
  if (!countryData || !countryData.rows || countryData.rows.length === 0) {
    console.warn(`No data available for ${countryCode}`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = '<p>No data available for New Zealand.</p>';
    }
    return;
  }
  
  const [startYear, endYear] = baselinePeriod.split('-').map(Number);
  const startDate = new Date(Date.UTC(startYear, 0, 1));
  const endDate = new Date(Date.UTC(endYear, 11, 31));
  
  // Prepare NZ data (keep Year and Week for baseline calculations)
  const nzRows = countryData.rows.map(r => ({
    date: r.date,
    ASMR100k: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  // Filter data from baseline start onwards
  const filteredData = nzRows.filter(d => d.date >= startDate);
  
  // Determine which year to compare with 2017 based on chartId
  const use2019 = chartId === 'nzASMRComparisonChart2010_2016_Main';
  const compareYear = use2019 ? 2019 : 2022;
  
  // Filter data for 2017 and comparison year
  const year2017StartDate = new Date(Date.UTC(2017, 0, 1));
  const year2017EndDate = new Date(Date.UTC(2017, 11, 31, 23, 59, 59));
  const yearCompareStartDate = new Date(Date.UTC(compareYear, 0, 1));
  const yearCompareEndDate = new Date(Date.UTC(compareYear, 11, 31, 23, 59, 59));
  
  const data2017 = filteredData.filter(d => d.date >= year2017StartDate && d.date <= year2017EndDate);
  const dataCompare = filteredData.filter(d => d.date >= yearCompareStartDate && d.date <= yearCompareEndDate);
  
  if (data2017.length === 0 && dataCompare.length === 0) {
    console.warn(`No data to plot for NZ ASMR comparison chart`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>No data available for comparison.</p>`;
    }
    return;
  }
  
  // Calculate baseline for NZ
  const baselineData = nzRows.filter(d => d.date >= startDate && d.date <= endDate);
  const model = quasiPoissonBaseline(baselineData, startDate, endDate);
  
  let baselineValues2017 = [];
  let baselineValuesCompare = [];
  if (model) {
    const weekDeviations = calculateSeasonalDeviations(baselineData, startDate, endDate, model);
    baselineValues2017 = data2017.map(d => {
      return applySeasonalAdjustment(model, d.date, weekDeviations, d.Year, d.Week);
    });
    baselineValuesCompare = dataCompare.map(d => {
      return applySeasonalAdjustment(model, d.date, weekDeviations, d.Year, d.Week);
    });
  } else {
    console.warn(`Cannot calculate baseline for NZ: ${baselinePeriod}`);
    const container = document.getElementById(chartId);
    if (container) {
      container.innerHTML = `<p>Cannot calculate baseline for period ${baselinePeriod}.</p>`;
    }
    return;
  }
  
  // Convert dates to a continuous scale with small gap between years
  // 2017 will be positions 0-51 (52 weeks), comparison year will be positions 53-104 (52 weeks, with small gap at 52)
  const getWeekNumber = (date, year) => {
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const daysDiff = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));
    return Math.floor(daysDiff / 7);
  };
  
  const x2017 = data2017.map(d => getWeekNumber(d.date, 2017));
  const asmr2017 = data2017.map(d => d.ASMR100k);
  const xCompare = dataCompare.map(d => getWeekNumber(d.date, compareYear) + 53); // Start at position 53 (52 is for "...")
  const asmrCompare = dataCompare.map(d => d.ASMR100k);
  
  const traces = [];
  
  // Add 2017 observed data
  if (data2017.length > 0) {
    traces.push({
      x: x2017,
      y: asmr2017,
      type: 'scatter',
      mode: 'lines',
      name: 'Observed',
      line: {
        width: 2,
        color: '#1a1a1a'
      },
      hovertemplate: `<b>2017 Observed</b><br>Week: %{x}<br>ASMR: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  // Add comparison year observed data (will share the same legend name)
  if (dataCompare.length > 0) {
    traces.push({
      x: xCompare,
      y: asmrCompare,
      type: 'scatter',
      mode: 'lines',
      name: 'Observed',
      line: {
        width: 2,
        color: '#1a1a1a'
      },
      showlegend: false, // Hide from legend since we already have "Observed"
      hovertemplate: `<b>${compareYear} Observed</b><br>Week: %{x}<br>ASMR: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  // Add baseline for 2017
  if (baselineValues2017.length > 0 && baselineValues2017.length === x2017.length) {
    traces.push({
      x: x2017,
      y: baselineValues2017,
      type: 'scatter',
      mode: 'lines',
      name: `${baselinePeriod} Baseline`,
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      hovertemplate: `<b>${baselinePeriod} Baseline</b><br>Week: %{x}<br>Baseline: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  // Add baseline for comparison year (same baseline, different year)
  if (baselineValuesCompare.length > 0 && baselineValuesCompare.length === xCompare.length) {
    traces.push({
      x: xCompare,
      y: baselineValuesCompare,
      type: 'scatter',
      mode: 'lines',
      name: `${baselinePeriod} Baseline (${compareYear})`,
      line: {
        width: 2,
        color: '#8b0000',
        dash: 'dash'
      },
      showlegend: false,
      hovertemplate: `<b>${baselinePeriod} Baseline</b><br>Week: %{x}<br>Baseline: %{y:.1f} per 100k<extra></extra>`
    });
  }
  
  // Add vertical dotted lines at the start of each year and around the gap
  const shapes = [];
  shapes.push({
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: 0,
    x1: 0,
    y0: 0,
    y1: 1,
    line: {
      color: '#999999',
      width: 2,
      dash: 'dot'
    }
  });
  // Vertical line before the gap (end of 2017, week 51)
  shapes.push({
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: 51,
    x1: 51,
    y0: 0,
    y1: 1,
    line: {
      color: '#999999',
      width: 2,
      dash: 'dot'
    }
  });
  // Vertical line after the gap (start of comparison year, week 53)
  shapes.push({
    type: 'line',
    xref: 'x',
    yref: 'paper',
    x0: 53,
    x1: 53,
    y0: 0,
    y1: 1,
    line: {
      color: '#999999',
      width: 2,
      dash: 'dot'
    }
  });
  
  // Calculate excess mortality for each year
  let excess2017 = 0;
  let excessCompare = 0;
  
  if (baselineValues2017.length > 0 && baselineValues2017.length === asmr2017.length) {
    for (let i = 0; i < asmr2017.length; i++) {
      const obs = asmr2017[i];
      const base = baselineValues2017[i];
      if (isFinite(obs) && isFinite(base) && base !== null) {
        excess2017 += (obs - base) / 52;
      }
    }
  }
  
  if (baselineValuesCompare.length > 0 && baselineValuesCompare.length === asmrCompare.length) {
    for (let i = 0; i < asmrCompare.length; i++) {
      const obs = asmrCompare[i];
      const base = baselineValuesCompare[i];
      if (isFinite(obs) && isFinite(base) && base !== null) {
        excessCompare += (obs - base) / 52;
      }
    }
  }
  
  // Add "..." annotation in the middle gap (at week 52)
  const annotations = [{
    x: 52,
    y: 0.5,
    xref: 'x',
    yref: 'paper',
    text: '...',
    showarrow: false,
    font: {
      size: 24,
      color: '#666666'
    },
    xanchor: 'center',
    yanchor: 'middle'
  }, {
    // Year label for 2017 - above the month labels
    x: 25.5, // Middle of 2017 (week 0-51)
    y: 0.06,
    xref: 'x',
    yref: 'paper',
    text: '<b>2017</b>',
    showarrow: false,
    font: {
      size: 16,
      color: '#333333'
    },
    xanchor: 'center',
    yanchor: 'bottom'
  }, {
    // Excess mortality for 2017 - right below the year label
    x: 25.5,
    y: 0.06,
    xref: 'x',
    yref: 'paper',
    text: `Excess Mortality: ${excess2017 >= 0 ? '+' : ''}${excess2017.toFixed(1)} per 100k`,
    showarrow: false,
    font: {
      size: 13,
      color: '#333333'
    },
    xanchor: 'center',
    yanchor: 'top'
  }, {
    // Year label for comparison year - above the month labels
    x: 78.5, // Middle of comparison year (week 53-104)
    y: 0.06,
    xref: 'x',
    yref: 'paper',
    text: `<b>${compareYear}</b>`,
    showarrow: false,
    font: {
      size: 16,
      color: '#333333'
    },
    xanchor: 'center',
    yanchor: 'bottom'
  }, {
    // Excess mortality for comparison year - right below the year label
    x: 78.5,
    y: 0.06,
    xref: 'x',
    yref: 'paper',
    text: `Excess Mortality: ${excessCompare >= 0 ? '+' : ''}${excessCompare.toFixed(1)} per 100k`,
    showarrow: false,
    font: {
      size: 13,
      color: '#333333'
    },
    xanchor: 'center',
    yanchor: 'top'
  }];
  
  // Add red and green shading for excess mortality
  if (baselineValues2017.length > 0 && baselineValues2017.length === x2017.length) {
    const baselineTraceIndex2017 = traces.findIndex(t => t.name === `${baselinePeriod} Baseline`);
    
    const negativeExcessY2017 = asmr2017.map((obs, i) => {
      const base = baselineValues2017[i];
      if (base !== null && isFinite(base) && isFinite(obs) && obs < base) {
        return obs;
      }
      return base !== null && isFinite(base) ? base : null;
    });
    
    const excessY2017 = asmr2017.map((obs, i) => {
      const base = baselineValues2017[i];
      if (base !== null && isFinite(base) && isFinite(obs) && obs > base) {
        return obs;
      }
      return base !== null && isFinite(base) ? base : null;
    });
    
    if (baselineTraceIndex2017 !== -1) {
      const baselineRefTrace2017 = {
        x: x2017,
        y: baselineValues2017,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      
      traces.splice(baselineTraceIndex2017 + 1, 0, baselineRefTrace2017);
      
      traces.splice(baselineTraceIndex2017 + 2, 0, {
        x: x2017,
        y: negativeExcessY2017,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 150, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      const baselineRefTrace2017_2 = {
        x: x2017,
        y: baselineValues2017,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      traces.splice(baselineTraceIndex2017 + 3, 0, baselineRefTrace2017_2);
      
      traces.splice(baselineTraceIndex2017 + 4, 0, {
        x: x2017,
        y: excessY2017,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(200, 0, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  
  // Add red and green shading for comparison year
  if (baselineValuesCompare.length > 0 && baselineValuesCompare.length === xCompare.length) {
    // Find the baseline trace for comparison year (it's hidden in legend but exists)
    const baselineTraceIndexCompare = traces.findIndex(t => t.name === `${baselinePeriod} Baseline (${compareYear})`);
    
    const negativeExcessYCompare = asmrCompare.map((obs, i) => {
      const base = baselineValuesCompare[i];
      if (base !== null && isFinite(base) && isFinite(obs) && obs < base) {
        return obs;
      }
      return base !== null && isFinite(base) ? base : null;
    });
    
    const excessYCompare = asmrCompare.map((obs, i) => {
      const base = baselineValuesCompare[i];
      if (base !== null && isFinite(base) && isFinite(obs) && obs > base) {
        return obs;
      }
      return base !== null && isFinite(base) ? base : null;
    });
    
    if (baselineTraceIndexCompare !== -1) {
      const baselineRefTraceCompare = {
        x: xCompare,
        y: baselineValuesCompare,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      
      traces.splice(baselineTraceIndexCompare + 1, 0, baselineRefTraceCompare);
      
      traces.splice(baselineTraceIndexCompare + 2, 0, {
        x: xCompare,
        y: negativeExcessYCompare,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(0, 150, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
      
      const baselineRefTraceCompare_2 = {
        x: xCompare,
        y: baselineValuesCompare,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      };
      traces.splice(baselineTraceIndexCompare + 3, 0, baselineRefTraceCompare_2);
      
      traces.splice(baselineTraceIndexCompare + 4, 0, {
        x: xCompare,
        y: excessYCompare,
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(200, 0, 0, 0.5)',
        line: { width: 0, color: 'rgba(0, 0, 0, 0)' },
        showlegend: false,
        hoverinfo: 'skip'
      });
    }
  }
  
  // Create subtitle
  let subtitle = '';
  if (baselinePeriod === '2016-2019') {
    subtitle = '2016-2019 Baseline, <a href="https://doi.org/10.1093/ije/dyaf093" target="_blank" style="color: #666666;">MJ Plank</a>';
  } else if (baselinePeriod === '2015-2019') {
    subtitle = '2015-2019 Baseline, MJ Plank, OWID, The Economist';
  } else if (baselinePeriod === '2010-2019') {
    subtitle = '2010-2019 Baseline, MJ Plank, IFoA, M. Pizzato';
  } else if (baselinePeriod === '2011-2019') {
    subtitle = '2011-2019 Baseline, MJ Plank, S Kuang';
  } else if (baselinePeriod === '2010-2016') {
    subtitle = '2010-2016 Baseline, RMSE 2025 minimised';
  } else {
    subtitle = `${baselinePeriod} Baseline, MJ Plank`;
  }
  
  const layout = {
    title: {
      text: `Age-Standardised Mortality Rate: New Zealand - 2017 & ${compareYear}<br><sub style="font-size: 0.6em; color: #666666;">${subtitle}</sub>`,
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: '',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true,
      tickmode: 'array',
      tickvals: [0, 13, 26, 39, 51, 53, 66, 79, 92, 105],
      ticktext: ['Jan', 'Apr', 'Jul', 'Oct', '', 'Jan', 'Apr', 'Jul', 'Oct', '']
    },
    yaxis: {
      title: 'ASMR (per 100k per year, annualized)',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    shapes: shapes,
    annotations: annotations,
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      xanchor: 'left',
      yanchor: 'top',
      bgcolor: 'rgba(255, 255, 255, 0.8)',
      bordercolor: '#cccccc',
      borderwidth: 1,
      font: { size: 12, color: '#1a1a1a' }
    },
    margin: { r: 40, t: 80, b: 60, l: 80 }
  };
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot(chartId, traces, layout, config);
  
}

// Render New Zealand's cumulative excess ASMR chart
function renderNZCumulativeExcessPlot(filteredDataByCountry) {
  const countryCode = 'NZL_NP';
  const countryData = filteredDataByCountry.get(countryCode);
  
  if (!countryData || !countryData.rows || countryData.rows.length === 0) {
    console.warn(`No data available for ${countryCode}`);
    const container = document.getElementById('nzCumulativeExcessChart');
    if (container) {
      container.innerHTML = '<p>No data available for New Zealand.</p>';
    }
    return;
  }
  
  // Prepare NZ data (keep Year and Week for baseline calculations)
  const nzRows = countryData.rows.map(r => ({
    date: r.date,
    ASMR100k: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  // Sort by date
  nzRows.sort((a, b) => a.date - b.date);
  
  const dates = nzRows.map(r => {
    const d = r.date;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  });
  const observedASMR = nzRows.map(r => r.ASMR100k);
  
  const observedData = nzRows.map((r, i) => ({
    date: r.date,
    asmrSum: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  
  // Define all baselines to include
  const baselineOrder = ['2010-2019', '2011-2019', '2012-2019', '2013-2019', '2014-2019', '2015-2019', '2016-2019', '2010-2016'];
  
  // Color palette and dash patterns
  const baselineStyles = [
    { color: '#00FF00', dash: 'solid', width: 3 },      // bright green (for 2010-2019)
    { color: '#808080', dash: 'solid', width: 2.5 },     // grey (for 2011-2019)
    { color: '#0000FF', dash: 'dot', width: 2.5 },      // bright blue (for 2012-2019)
    { color: '#000000', dash: 'dashdot', width: 2.5 },  // black (for 2013-2019)
    { color: '#FFA500', dash: 'longdash', width: 3 },   // bright orange (for 2014-2019)
    { color: '#FF00FF', dash: 'longdashdot', width: 2.5 }, // bright magenta (for 2015-2019)
    { color: '#8B0000', dash: 'dot', width: 3 },         // dark red (for 2016-2019)
    { color: '#FF4500', dash: 'dash', width: 3 }         // orange red (for 2010-2016)
  ];
  
  const traces = [];
  const legendEntries = [];
  const tableData = []; // Store data for the table
  let baseline2016_2019Data = null; // Store 2016-2019 baseline data for reference lines
  
  baselineOrder.forEach((baselinePeriod, index) => {
    const [startYear, endYear] = baselinePeriod.split('-').map(Number);
    const startDate = new Date(Date.UTC(startYear, 0, 1));
    const endDate = new Date(Date.UTC(endYear, 11, 31));
    
    // Calculate baseline for NZ
    const baselineData = nzRows.filter(d => d.date >= startDate && d.date <= endDate);
    const model = quasiPoissonBaseline(baselineData, startDate, endDate);
    
    if (!model) {
      console.warn(`Cannot calculate baseline for NZ: ${baselinePeriod}`);
      return;
    }
    
    const weekDeviations = calculateSeasonalDeviations(baselineData, startDate, endDate, model);
    const baselineValues = observedData.map(data => {
      // Pass Year and Week if available (for proper time indexing)
      return applySeasonalAdjustment(model, data.date, weekDeviations, data.Year, data.Week);
    });
    
    const excess = calculateCumulativeExcess(observedData, baselineValues, dates, startDate2020);
    
    if (excess.dates.length > 0 && excess.excess.some(v => v !== null)) {
      const style = baselineStyles[index % baselineStyles.length];
      const finalValue = excess.excess[excess.excess.length - 1];
      
      // Calculate values for table
      const startDate2020First = new Date(Date.UTC(2020, 0, 1));
      const endDate2020Last = new Date(Date.UTC(2020, 11, 31, 23, 59, 59));
      const startDateAug2024First = new Date(Date.UTC(2024, 7, 1));
      const endDateAug2024 = new Date(Date.UTC(2024, 7, 31));
      const endDateJuly2025 = new Date(Date.UTC(2025, 6, 31));
      
      const findClosestValue = (targetDate) => {
        let closest = null;
        let closestDiff = Infinity;
        for (let i = 0; i < excess.dates.length; i++) {
          const date = new Date(excess.dates[i]);
          const diff = Math.abs(date - targetDate);
          if (date <= targetDate && diff < closestDiff && excess.excess[i] !== null && isFinite(excess.excess[i])) {
            closest = excess.excess[i];
            closestDiff = diff;
          }
        }
        return closest;
      };
      
      // Since cumulative excess starts at 0 at the start of 2020, value2020Start is always 0
      const value2020Start = 0;
      const value2020 = findClosestValue(endDate2020Last);
      const valueAug2024Start = findClosestValue(startDateAug2024First);
      const valueAug2024 = findClosestValue(endDateAug2024);
      const valueJuly2025 = findClosestValue(endDateJuly2025);
      
      let deltaFY = null;
      let deltaLY = null;
      let lyFyPercent = null;
      
      // Delta FY is just the value at the end of 2020 (since it starts at 0)
      if (value2020 !== null && isFinite(value2020)) {
        deltaFY = value2020;
      }
      // Delta LY is the difference between end of Jul 2025 and start of Aug 2024
      if (valueJuly2025 !== null && valueAug2024Start !== null) {
        deltaLY = valueJuly2025 - valueAug2024Start;
        if (deltaFY !== null && deltaFY !== 0) {
          lyFyPercent = (deltaLY / deltaFY) * 100;
        }
      }
      
      traces.push({
        x: excess.dates,
        y: excess.excess,
        type: 'scatter',
        mode: 'lines',
        name: `trace_${index}`,
        showlegend: false,
        line: {
          width: style.width,
          color: style.color,
          dash: style.dash
        },
        hovertemplate: `<b>Cumulative Excess (${baselinePeriod})</b><br>` +
                     `Date: %{x}<br>` +
                     `Cumulative Excess: %{y:.2f}<extra></extra>`
      });
      
      // Store legend entry info with all users
      let labelText = baselinePeriod;
      if (baselinePeriod === '2010-2016') {
        labelText = '2010-2016\nRMSE 2025 min';
      } else if (baselinePeriod === '2015-2019') {
        labelText = '2015-2019\nMJ Plank, OWID\nThe Economist';
      } else if (baselinePeriod === '2010-2019') {
        labelText = '2010-2019\nMJ Plank, IFoA,\nM. Pizzato';
      } else if (baselinePeriod === '2016-2019') {
        labelText = '2016-2019\nMJ Plank, Eurostat';
      } else if (baselinePeriod === '2011-2019') {
        labelText = '2011-2019\nMJ Plank, S Kuang';
      } else {
        // Other baselines (2012-2019, 2013-2019, 2014-2019) just get "MJ Plank"
        labelText = `${baselinePeriod}\nMJ Plank`;
      }
      
      legendEntries.push({
        key: baselinePeriod,
        labelText: labelText,
        color: style.color,
        dash: style.dash,
        index: index,
        finalValue: finalValue
      });
      
      // Store table data
      tableData.push({
        baseline: baselinePeriod,
        labelText: labelText,
        color: style.color,
        dash: style.dash,
        deltaFY: deltaFY,
        deltaLY: deltaLY,
        lyFyPercent: lyFyPercent
      });
      
      // Store 2016-2019 baseline data for reference lines
      if (baselinePeriod === '2016-2019') {
        baseline2016_2019Data = {
          excess: excess,
          value2020Start: value2020Start,
          value2020: value2020,
          valueAug2024Start: valueAug2024Start,
          valueAug2024: valueAug2024,
          valueJuly2025: valueJuly2025,
          startDate2020First: startDate2020First,
          endDate2020Last: endDate2020Last,
          startDateAug2024First: startDateAug2024First,
          endDateAug2024: endDateAug2024,
          endDateJuly2025: endDateJuly2025
        };
      }
    }
  });
  
  // Sort legend entries by final cumulative excess value (descending)
  legendEntries.sort((a, b) => {
    const aVal = a.finalValue !== null && isFinite(a.finalValue) ? a.finalValue : -Infinity;
    const bVal = b.finalValue !== null && isFinite(b.finalValue) ? b.finalValue : -Infinity;
    return bVal - aVal; // Descending order
  });
  
  if (traces.length === 0) {
    console.warn('No cumulative excess traces to plot for NZ');
    return;
  }
  
  // Define date ranges for shading (reuse existing startDate2020)
  const endDate2020 = new Date(Date.UTC(2020, 11, 31));
  const startDateAug2024 = new Date(Date.UTC(2024, 7, 1)); // August 1, 2024
  const endDateJuly2025 = new Date(Date.UTC(2025, 6, 31)); // July 31, 2025
  
  // Get y-axis range from traces for proper shading
  let yMin = Infinity;
  let yMax = -Infinity;
  traces.forEach(trace => {
    if (trace.y && trace.y.length > 0) {
      const validY = trace.y.filter(v => v !== null && isFinite(v));
      if (validY.length > 0) {
        yMin = Math.min(yMin, ...validY);
        yMax = Math.max(yMax, ...validY);
      }
    }
  });
  // Set y-axis to go up to 400 for label space
  yMin = Math.min(yMin, 0) - 20; // Add some padding at bottom
  yMax = 400;
  
  const layout = {
    title: {
      text: 'Cumulative Excess ASMR: New Zealand',
      font: { size: 18, color: '#1a1a1a' }
    },
    xaxis: {
      title: 'Date',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: false,
      showgrid: true
    },
    yaxis: {
      title: 'Cumulative Excess ASMR (per 100k)',
      titlefont: { color: '#333333' },
      tickfont: { color: '#333333' },
      gridcolor: '#e0e0e0',
      zeroline: true,
      zerolinecolor: '#999999',
      showgrid: true,
      range: [yMin, yMax]
    },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    font: { color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
    hovermode: 'closest',
    showlegend: false,
    margin: { r: 0, t: 60, b: 60, l: 80 },
    shapes: [
      // First year (2020) shading
      {
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: startDate2020,
        y0: yMin,
        x1: endDate2020,
        y1: yMax,
        fillcolor: 'rgba(128, 128, 128, 0.2)',
        line: { width: 0 },
        layer: 'below'
      },
      // Last year (Aug 2024 - Jul 2025) shading
      {
        type: 'rect',
        xref: 'x',
        yref: 'y',
        x0: startDateAug2024,
        y0: yMin,
        x1: endDateJuly2025,
        y1: yMax,
        fillcolor: 'rgba(128, 128, 128, 0.2)',
        line: { width: 0 },
        layer: 'below'
      }
    ],
    annotations: []
  };
  
  // Add labels at the top of the chart, centered in grey boxes
  const labelY = 380; // Position near the top
  const mid2020 = new Date(startDate2020.getTime() + (endDate2020.getTime() - startDate2020.getTime()) / 2);
  const midLastYear = new Date(startDateAug2024.getTime() + (endDateJuly2025.getTime() - startDateAug2024.getTime()) / 2);
  
  layout.annotations.push({
    x: mid2020, // Center of 2020
    y: labelY,
    xref: 'x',
    yref: 'y',
    text: 'First Year (2020)',
    showarrow: false,
    font: { size: 12, color: '#000000', family: 'Georgia, "Times New Roman", serif' },
    xanchor: 'center'
  });
  
  layout.annotations.push({
    x: midLastYear, // Center of Aug 2024 - Jul 2025 period
    y: labelY,
    xref: 'x',
    yref: 'y',
    text: 'Last Year (Aug 2024 - Jul 2025)',
    showarrow: false,
    font: { size: 12, color: '#000000', family: 'Georgia, "Times New Roman", serif' },
    xanchor: 'center'
  });
  
  // Add dotted reference lines for 2016-2019 baseline showing delta FY and delta LY points
  // Delta FY: from start of 2020 (value = 0) to end of 2020
  if (baseline2016_2019Data && baseline2016_2019Data.value2020 !== null) {
    // Horizontal line from end of 2020 going left to the start of 2020
    layout.shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: baseline2016_2019Data.startDate2020First,
      y0: baseline2016_2019Data.value2020,
      x1: baseline2016_2019Data.endDate2020Last,
      y1: baseline2016_2019Data.value2020,
      line: {
        color: '#000000', // black
        width: 2,
        dash: 'dot'
      },
      layer: 'above'
    });
    
    // Vertical line at start of 2020 going from the horizontal line (at value2020) up to the cumulative line (at 0)
    layout.shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: baseline2016_2019Data.startDate2020First,
      y0: 0, // cumulative line at start of 2020
      x1: baseline2016_2019Data.startDate2020First,
      y1: baseline2016_2019Data.value2020, // horizontal line value
      line: {
        color: '#000000', // black
        width: 2,
        dash: 'dot'
      },
      layer: 'above'
    });
    
    // Add "ΔFY" label to the right of the vertical line, centered at the midpoint of the vertical line
    layout.annotations.push({
      x: baseline2016_2019Data.startDate2020First,
      y: baseline2016_2019Data.value2020 / 2, // midpoint of vertical line (from 0 to value2020)
      xref: 'x',
      yref: 'y',
      text: 'ΔFY',
      showarrow: false,
      font: { size: 12, color: '#000000', family: 'Georgia, "Times New Roman", serif', weight: 'bold' },
      xanchor: 'left',
      yanchor: 'middle',
      xshift: 5
    });
  }
  
  // Delta LY: from start of Aug 2024 to end of Jul 2025
  if (baseline2016_2019Data && baseline2016_2019Data.valueAug2024Start !== null && baseline2016_2019Data.valueJuly2025 !== null) {
    // Horizontal line from end of Jul 2025 going left to the start of Aug 2024
    layout.shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: baseline2016_2019Data.startDateAug2024First,
      y0: baseline2016_2019Data.valueJuly2025,
      x1: baseline2016_2019Data.endDateJuly2025,
      y1: baseline2016_2019Data.valueJuly2025,
      line: {
        color: '#000000', // black
        width: 2,
        dash: 'dot'
      },
      layer: 'above'
    });
    
    // Vertical line at start of Aug 2024 going from the horizontal line (at valueJuly2025) up to the cumulative line (at valueAug2024Start)
    layout.shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'y',
      x0: baseline2016_2019Data.startDateAug2024First,
      y0: baseline2016_2019Data.valueAug2024Start, // cumulative line at start of Aug 2024
      x1: baseline2016_2019Data.startDateAug2024First,
      y1: baseline2016_2019Data.valueJuly2025, // horizontal line value
      line: {
        color: '#000000', // black
        width: 2,
        dash: 'dot'
      },
      layer: 'above'
    });
    
    // Add "ΔLY" label to the right of the vertical line, centered at the midpoint of the vertical line
    layout.annotations.push({
      x: baseline2016_2019Data.startDateAug2024First,
      y: (baseline2016_2019Data.valueAug2024Start + baseline2016_2019Data.valueJuly2025) / 2, // midpoint of vertical line
      xref: 'x',
      yref: 'y',
      text: 'ΔLY',
      showarrow: false,
      font: { size: 12, color: '#000000', family: 'Georgia, "Times New Roman", serif', weight: 'bold' },
      xanchor: 'left',
      yanchor: 'middle',
      xshift: 5
    });
  }
  
  // Sort table data by final value (same as legend was sorted)
  tableData.sort((a, b) => {
    const aVal = a.deltaFY !== null && isFinite(a.deltaFY) ? a.deltaFY : -Infinity;
    const bVal = b.deltaFY !== null && isFinite(b.deltaFY) ? b.deltaFY : -Infinity;
    return bVal - aVal; // Descending order
  });
  
  // Add table as Plotly table trace (positioned on the right side of the plot)
  if (tableData.length > 0) {
    const baselineLabels = [];
    const deltaFYValues = [];
    const deltaLYValues = [];
    const lyFyPercentValues = [];
    
    tableData.forEach((row) => {
      // Add line indicator to baseline label - match the style from cumulative excess plot
      // Use the same symbols and styling as the plot above
      let lineSymbol = '▬'; // default solid
      if (row.dash === 'dash') lineSymbol = '╌';
      else if (row.dash === 'dot') lineSymbol = '┄';
      else if (row.dash === 'dashdot') lineSymbol = '╍';
      else if (row.dash === 'longdash') lineSymbol = '╌';
      else if (row.dash === 'longdashdot') lineSymbol = '╍';
      
      // Match the cumulative excess plot: single character, font size 18, same color
      // Use HTML to style the line symbol to match the plot (size 18, colored)
      const coloredLine = `<span style="font-size: 18px; color: ${row.color};">${lineSymbol}</span>`;
      
      // Split labelText to put line and year range on same line, label on next line(s)
      const labelParts = row.labelText.split('\n');
      const yearRange = labelParts[0]; // e.g., "2010-2019"
      const label = labelParts.slice(1).join('<br>'); // Join all remaining parts with <br> for line breaks
      
      // Put line symbol and year range on same line, then label on next line(s)
      const formattedLabel = label 
        ? `${coloredLine} ${yearRange}<br>${label}`
        : `${coloredLine} ${yearRange}`;
      baselineLabels.push(formattedLabel);
      deltaFYValues.push(row.deltaFY !== null ? row.deltaFY.toFixed(2) : 'N/A');
      deltaLYValues.push(row.deltaLY !== null ? row.deltaLY.toFixed(2) : 'N/A');
      
      // Color LY/FY % cells: 2010-2016 green, others red
      // Store both the value and color for conditional formatting
      if (row.lyFyPercent !== null) {
        const percentValue = row.lyFyPercent.toFixed(1) + '%';
        lyFyPercentValues.push(percentValue);
      } else {
        lyFyPercentValues.push('N/A');
      }
    });
    
    // Create a subplot with table on the right - match plot height accounting for header
    // Calculate cell height to match plot height: (total height - header height) / num rows
    const numRows = tableData.length;
    const headerHeight = 20; // Reduced to 20
    // The plot domain y is [0, 1], so the table should also use [0, 1]
    // We need to ensure all rows fit - use a larger estimate for plot content area
    // Plot has margins: top 60, bottom 60, so content area needs to account for that
    // Increase the estimate to ensure all rows are visible
    const estimatedPlotContentHeight = 520; // Increased to ensure all rows fit
    const availableHeightForCells = estimatedPlotContentHeight - headerHeight;
    // Reduce cell height to minimize vertical padding - make it more compact
    const cellHeight = Math.max(20, Math.floor(availableHeightForCells / numRows) - 20);
    
    const tableTrace = {
      type: 'table',
      domain: { x: [0.75, 1.0], y: [0, 1] }, // Made table 20% wider (from 0.82 to 0.75)
      columnwidth: [140, 50, 50, 60], // Wider first column to fit line and text
      header: {
        values: ['Baseline', 'ΔFY', 'ΔLY', 'ΔLY/ΔFY'], // Using delta symbol, no spaces, no %
        fill: { color: '#f5f5f5' },
        align: ['left', 'right', 'right', 'right'],
        font: { size: 13, color: '#1a1a1a', family: 'Georgia, "Times New Roman", serif' },
        line: { width: 1, color: '#cccccc' },
        height: headerHeight
      },
      cells: {
        values: [baselineLabels, deltaFYValues, deltaLYValues, lyFyPercentValues],
        fill: { 
          color: [
            tableData.map((_, idx) => idx % 2 === 0 ? 'white' : '#f9f9f9'), // Baseline column alternating
            tableData.map((_, idx) => idx % 2 === 0 ? 'white' : '#f9f9f9'), // ΔFY column alternating
            tableData.map((_, idx) => idx % 2 === 0 ? 'white' : '#f9f9f9'), // ΔLY column alternating
            tableData.map((row, idx) => {
              // Color LY/FY % column: 2010-2016 green, 2015-2019/2016-2019/2013-2019 dark red, others light red
              if (row.lyFyPercent === null) return idx % 2 === 0 ? 'white' : '#f9f9f9';
              if (row.baseline === '2010-2016') return '#c8e6c9'; // light green
              if (row.baseline === '2015-2019' || row.baseline === '2016-2019' || row.baseline === '2013-2019') return '#b71c1c'; // dark red
              return '#ffcdd2'; // light red for others
            })
          ]
        },
        align: ['left', 'right', 'right', 'right'],
        font: { 
          size: 13, 
          color: [
            tableData.map(() => '#1a1a1a'), // Baseline column - all black
            tableData.map(() => '#1a1a1a'), // ΔFY column - all black
            tableData.map(() => '#1a1a1a'), // ΔLY column - all black
                tableData.map((row) => {
                  // Text color for LY/FY % column: 2010-2016 green, 2015-2019/2016-2019/2013-2019 white, others red
                  if (row.lyFyPercent === null) return '#1a1a1a';
                  if (row.baseline === '2010-2016') return '#2e7d32'; // green
                  if (row.baseline === '2015-2019' || row.baseline === '2016-2019' || row.baseline === '2013-2019') return '#ffffff'; // white for contrast on dark red
                  return '#d32f2f'; // red for others
                })
          ],
          family: 'Georgia, "Times New Roman", serif' 
        },
        line: { width: 1, color: '#cccccc' },
        height: cellHeight
      }
    };
    
    // Add table trace - Plotly will handle it as a subplot
    traces.push(tableTrace);
    
    // Adjust layout to accommodate table - give graph more space
    layout.xaxis.domain = [0, 0.73]; // Graph takes up 73% of width (adjusted for wider table)
    layout.margin.r = 0; // No right margin needed since table is in subplot
  }
  
  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d']
  };
  
  Plotly.newPlot('nzCumulativeExcessChart', traces, layout, config);
}

// Calculate and display NZ cumulative excess table
function calculateAndDisplayNZCumulativeTable(filteredDataByCountry, baselineOrder, baselineStyles) {
  const countryCode = 'NZL_NP';
  const countryData = filteredDataByCountry.get(countryCode);
  
  if (!countryData || !countryData.rows || countryData.rows.length === 0) {
    return;
  }
  
  // Prepare NZ data (keep Year and Week for baseline calculations)
  const nzRows = countryData.rows.map(r => ({
    date: r.date,
    ASMR100k: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  // Sort by date
  nzRows.sort((a, b) => a.date - b.date);
  
  const dates = nzRows.map(r => {
    const d = r.date;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  });
  
  const observedData = nzRows.map((r, i) => ({
    date: r.date,
    asmrSum: r.ASMR100k,
    Year: r.Year,
    Week: r.Week
  }));
  
  const startDate2020 = new Date(Date.UTC(2020, 0, 1));
  const endDate2020 = new Date(Date.UTC(2020, 11, 31, 23, 59, 59));
  const startDateAug2024 = new Date(Date.UTC(2024, 7, 1)); // August 1, 2024
  const endDateAug2024 = new Date(Date.UTC(2024, 7, 31)); // August 31, 2024
  const endDateJuly2025 = new Date(Date.UTC(2025, 6, 31)); // July 31, 2025
  
  const tableData = [];
  
  baselineOrder.forEach((baselinePeriod, index) => {
    const [startYear, endYear] = baselinePeriod.split('-').map(Number);
    const startDate = new Date(Date.UTC(startYear, 0, 1));
    const endDate = new Date(Date.UTC(endYear, 11, 31));
    
    // Calculate baseline for NZ
    const baselineData = nzRows.filter(d => d.date >= startDate && d.date <= endDate);
    const model = quasiPoissonBaseline(baselineData, startDate, endDate);
    
    if (!model) {
      return;
    }
    
    const weekDeviations = calculateSeasonalDeviations(baselineData, startDate, endDate, model);
    const baselineValues = observedData.map(data => {
      // Pass Year and Week if available (for proper time indexing)
      return applySeasonalAdjustment(model, data.date, weekDeviations, data.Year, data.Week);
    });
    
    const excess = calculateCumulativeExcess(observedData, baselineValues, dates, startDate2020);
    
    if (excess.dates.length === 0) {
      return;
    }
    
    // Find values at specific dates
    const findClosestValue = (targetDate) => {
      let closest = null;
      let closestDiff = Infinity;
      for (let i = 0; i < excess.dates.length; i++) {
        const date = new Date(excess.dates[i]);
        const diff = Math.abs(date - targetDate);
        if (date <= targetDate && diff < closestDiff && excess.excess[i] !== null && isFinite(excess.excess[i])) {
          closest = excess.excess[i];
          closestDiff = diff;
        }
      }
      return closest;
    };
    
    // Find values at start and end of each period
    const value2020Start = findClosestValue(startDate2020);
    const value2020 = findClosestValue(endDate2020);
    const valueAug2024Start = findClosestValue(startDateAug2024);
    const valueJuly2025 = findClosestValue(endDateJuly2025);
    
    // Calculate deltas
    let deltaFY = null;
    let deltaLY = null;
    let lyFyPercent = null;
    
    // Delta FY is the difference between end and start of 2020
    if (value2020 !== null && value2020Start !== null) {
      deltaFY = value2020 - value2020Start;
    }
    // Delta LY is the difference between end of Jul 2025 and start of Aug 2024
    if (valueJuly2025 !== null && valueAug2024Start !== null) {
      deltaLY = valueJuly2025 - valueAug2024Start;
      if (deltaFY !== null && deltaFY !== 0) {
        lyFyPercent = (deltaLY / deltaFY) * 100;
      }
    }
    
    if (deltaFY !== null && deltaLY !== null) {
      tableData.push({
        baseline: baselinePeriod,
        firstYear: deltaFY,
        diffAug24ToJuly25: deltaLY,
        diffFirstPercent: lyFyPercent
      });
    }
  });
  
  // Display table
  const container = document.getElementById('nzCumulativeTable');
  if (!container) {
    return;
  }
  
  if (tableData.length === 0) {
    container.innerHTML = '<p>No data available for table.</p>';
    return;
  }
  
  // Create table with brace annotation
  let html = '<div style="position: relative; margin-top: 20px; margin-right: 300px;">';
  html += '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif;">';
  html += '<thead><tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Baseline</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">First Year Change</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">Last Year Change</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">Last Year / First Year (%)</th>';
  html += '</tr></thead><tbody>';
  
  tableData.forEach((row, index) => {
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    // Determine cell color for last column (ΔLY/ΔFY)
    let lastCellBgColor = rowColor;
    let lastCellTextColor = '#1a1a1a';
    if (row.diffFirstPercent !== null) {
      if (row.baseline === '2010-2016') {
        lastCellBgColor = '#c8e6c9'; // light green
        lastCellTextColor = '#2e7d32'; // green text
      } else if (row.baseline === '2015-2019' || row.baseline === '2016-2019' || row.baseline === '2013-2019') {
        lastCellBgColor = '#b71c1c'; // dark red
        lastCellTextColor = '#ffffff'; // white text for contrast
      } else {
        lastCellBgColor = '#ffcdd2'; // light red
        lastCellTextColor = '#d32f2f'; // red text
      }
    }
    
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${row.baseline}</td>`;
    html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">${row.firstYear.toFixed(2)}</td>`;
    html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">${row.diffAug24ToJuly25.toFixed(2)}</td>`;
    html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: ${lastCellBgColor}; color: ${lastCellTextColor};">${row.diffFirstPercent !== null ? row.diffFirstPercent.toFixed(1) + '%' : 'N/A'}</td>`;
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  
  // Add brace annotation for first 7 baselines (MJ Plank baselines)
  // Calculate approximate positions
  const first7Rows = Math.min(7, tableData.length);
  if (first7Rows > 0) {
    // Estimate row height (header + rows)
    const headerHeight = 40; // approximate header height
    const rowHeight = 35; // approximate row height
    // Start at second data row (first baseline, skip header)
    const startY = headerHeight + rowHeight;
    const endY = headerHeight + ((first7Rows + 1) * rowHeight);
    const braceX = 100; // position to the right of the table (will be calculated as %)
    const braceWidth = 20;
    
    const braceHeight = endY - startY;
    html += '<div style="position: absolute; right: -30px; top: ' + startY + 'px; width: ' + (braceWidth + 10) + 'px; height: ' + braceHeight + 'px; pointer-events: none; overflow: visible;">';
    html += '<svg width="' + (braceWidth + 10) + '" height="' + braceHeight + '" style="position: absolute; left: 0; top: 0;">';
    // Draw a curly brace using a better path (opening to the left)
    const midY = braceHeight / 2;
    const curveRadius = 8;
    html += '<path d="M 5 0 L 5 ' + (midY - curveRadius) + ' Q 5 ' + midY + ' ' + (5 + curveRadius) + ' ' + midY + ' Q 5 ' + midY + ' 5 ' + (midY + curveRadius) + ' L 5 ' + braceHeight + '" stroke="#1a1a1a" stroke-width="2" fill="none"/>';
    html += '</svg>';
    html += '</div>';
    
    // Add note text
    const noteX = 10; // position to the right of the brace
    const noteY = startY + (braceHeight / 2) - 40; // center vertically, adjust for text height
    html += '<div style="position: absolute; right: -280px; top: ' + noteY + 'px; width: 270px; font-family: Georgia, \'Times New Roman\', serif; font-size: 0.9em; color: #1a1a1a; line-height: 1.4; text-align: left;">';
    html += 'All the MJ Plank baselines imply New Zealand saved a comparable (or greater) number of lives in 2024-2025 as it did in 2020';
    html += '</div>';
  }
  
  html += '</div>';
  
  container.innerHTML = html;
}

// Calculate and display simplified RMSE table (all baselines)
function calculateAndDisplaySimpleRMSE(plotData) {
  const { dates, aggregatedASMR, fixedBaselines, countryCount, countryCountsPerDate } = plotData;
  
  // Prepare all observed data with dates (averaged)
  const allObservedData = dates.map((dateStr, i) => ({
    date: new Date(dateStr),
    asmrSum: countryCountsPerDate && countryCountsPerDate[i] > 0 
      ? aggregatedASMR[i] / countryCountsPerDate[i] 
      : aggregatedASMR[i] / countryCount,
    originalIndex: i
  }));
  
  // Define time periods (earliest to latest, left to right)
  const periods = [
    { name: '2022 (Jan-Jun)', start: new Date(Date.UTC(2022, 0, 1)), end: new Date(Date.UTC(2022, 5, 31)) },
    { name: '2022 (Jul-Dec)', start: new Date(Date.UTC(2022, 6, 1)), end: new Date(Date.UTC(2022, 11, 31)) },
    { name: '2023 (Jan-Jun)', start: new Date(Date.UTC(2023, 0, 1)), end: new Date(Date.UTC(2023, 5, 31)) },
    { name: '2023 (Jul-Dec)', start: new Date(Date.UTC(2023, 6, 1)), end: new Date(Date.UTC(2023, 11, 31)) },
    { name: '2024 (Jan-Jun)', start: new Date(Date.UTC(2024, 0, 1)), end: new Date(Date.UTC(2024, 5, 31)) },
    { name: '2024 (Jul-Dec)', start: new Date(Date.UTC(2024, 6, 1)), end: new Date(Date.UTC(2024, 11, 31)) },
    { name: '2025 (Jan-Jun)', start: new Date(Date.UTC(2025, 0, 1)), end: new Date(Date.UTC(2025, 5, 30)) }
  ];
  
  // Define all baselines to calculate RMSE for
  const baselineOrder = ['2010-2019', '2011-2019', '2012-2019', '2013-2019', '2014-2019', '2015-2019', '2016-2019'];
  
  const rmseResults = [];
  
  for (const key of baselineOrder) {
    const baseline = fixedBaselines.get(key);
    if (!baseline || !baseline.values) continue;
    
    // Create averaged baseline
    const averagedBaseline = {
      ...baseline,
      values: baseline.values.map((val, i) => 
        countryCountsPerDate && countryCountsPerDate[i] > 0 
          ? val / countryCountsPerDate[i] 
          : val / countryCount
      )
    };
    
    const result = {
      baseline: key,
      labels: baseline.labels || [],
      periods: {}
    };
    
    // Calculate pre-pandemic RMSE (for the baseline period itself)
    const [startYear, endYear] = key.split('-').map(Number);
    const prePandemicStart = new Date(Date.UTC(startYear, 0, 1));
    const prePandemicEnd = new Date(Date.UTC(endYear, 11, 31));
    const prePandemicMetrics = calculateMetricsForPeriod(allObservedData, averagedBaseline, prePandemicStart, prePandemicEnd);
    result.prePandemicRMSE = prePandemicMetrics.rmse;
    
    // Calculate metrics for each period
    for (const period of periods) {
      const metrics = calculateMetricsForPeriod(allObservedData, averagedBaseline, period.start, period.end);
      result.periods[period.name] = metrics;
    }
    
    rmseResults.push(result);
  }
  
  // Sort by baseline order (not by RMSE)
  const baselineOrderForTable = ['2010-2019', '2011-2019', '2012-2019', '2013-2019', '2014-2019', '2015-2019', '2016-2019'];
  const sortedResults = baselineOrderForTable.map(key => {
    return rmseResults.find(r => r.baseline === key);
  }).filter(r => r !== undefined);
  
  // Display table
  const container = document.getElementById('simpleRMSETable');
  if (!container) return;
  
  let html = '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif; font-size: 0.85em;">';
  html += '<thead>';
  // Title row spanning all columns
  const totalColumns = 2 + periods.length; // Baseline Period + Pre-Pandemic RMSE + all periods
  html += `<tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;"><th colspan="${totalColumns}" style="padding: 10px; text-align: left; border: 1px solid #cccccc; font-weight: bold; color: #1a1a1a; font-size: 1.1em;">RMSE by Time Period</th></tr>`;
  // Column headers row
  html += '<tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Baseline Period</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">Pre-Pandemic RMSE</th>';
  
  // Add column headers for each period
  for (const period of periods) {
    html += `<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">${period.name}</th>`;
  }
  html += '</tr></thead><tbody>';
  
  sortedResults.forEach((result, index) => {
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${result.baseline}`;
    if (result.labels && result.labels.length > 0) {
      html += `<br><span style="font-size: 0.8em; color: #666666;">${result.labels.join(', ')}</span>`;
    }
    html += `</td>`;
    
    // Add pre-pandemic RMSE (grey background)
    if (result.prePandemicRMSE !== null) {
      html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: #e0e0e0;">${result.prePandemicRMSE.toFixed(2)}</td>`;
    } else {
      html += '<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: #e0e0e0;">-</td>';
    }
    
    // Add data for each period (only RMSE, no relative RMSE)
    for (const period of periods) {
      const metrics = result.periods[period.name];
      if (metrics.rmse !== null) {
        // Check if this RMSE is lower than pre-pandemic RMSE
        const shouldHighlight = result.prePandemicRMSE !== null && metrics.rmse < result.prePandemicRMSE;
        const value = metrics.rmse.toFixed(2);
        const displayValue = shouldHighlight ? `<strong>${value}*</strong>` : value;
        // Green background for highlighted values (lower than pre-pandemic RMSE)
        const bgColor = shouldHighlight ? '#d4edda' : '';
        html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: ${bgColor};">${displayValue}</td>`;
      } else {
        html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">-</td>`;
      }
    }
    
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  
  // Add note about pre-pandemic RMSE
  html += '<p style="margin-top: 15px; font-size: 0.85em; color: #666666; font-family: Georgia, \'Times New Roman\', serif; font-style: italic;">';
  html += 'Pre-Pandemic RMSE: Root Mean Squared Error calculated for each baseline during its own training period (e.g., 2014-2019 for the 2014-2019 baseline).';
  html += '</p>';
  
  container.innerHTML = html;
}

// Calculate and display country contributions to excess mortality in 2024
function calculateCountryContributions(filteredDataByCountry) {
  const startDate2001 = new Date(Date.UTC(2001, 0, 1));
  const endDate2019 = new Date(Date.UTC(2019, 11, 31));
  const startDate2024 = new Date(Date.UTC(2024, 0, 1));
  const endDate2024 = new Date(Date.UTC(2024, 11, 31));
  
  const contributions = [];
  
  for (const [countryCode, { rows }] of filteredDataByCountry.entries()) {
    const countryName = countryNames[countryCode] || countryCode;
    
    // Prepare data for baseline calculation
    const baselineData = rows.map(r => ({
      date: r.date,
      ASMR100k: r.ASMR100k
    }));
    
    // Calculate 2001-2019 baseline for this country
    const model = quasiPoissonBaseline(baselineData, startDate2001, endDate2019);
    if (!model) continue;
    
    const weekDeviations = calculateSeasonalDeviations(baselineData, startDate2001, endDate2019, model);
    
    // Get 2024 data
    const data2024 = rows.filter(r => r.date >= startDate2024 && r.date <= endDate2024);
    
    if (data2024.length === 0) continue;
    
    // Calculate cumulative excess for 2024
    let cumulativeExcess = 0;
    for (const row of data2024) {
      // Pass Year and Week for proper time indexing
      const baseline = applySeasonalAdjustment(model, row.date, weekDeviations, row.Year, row.Week);
      if (baseline !== null && isFinite(baseline) && isFinite(row.ASMR100k)) {
        // ASMR is annualized (per 100k per year), so divide by 52 to get weekly contribution
        cumulativeExcess += (row.ASMR100k - baseline) / 52;
      }
    }
    
    contributions.push({
      countryCode: countryCode,
      countryName: countryName,
      excess: cumulativeExcess
    });
  }
  
  // Sort by excess (descending)
  contributions.sort((a, b) => b.excess - a.excess);
  
  return contributions;
}

// Display country contributions table
function displayCountryContributions(contributions) {
  const container = document.getElementById('countryContributions');
  if (!container) return;
  
  if (contributions.length === 0) {
    container.innerHTML = '<p>No data available for 2024.</p>';
    return;
  }
  
  // Calculate total excess
  const totalExcess = contributions.reduce((sum, c) => sum + c.excess, 0);
  
  // Create table
  let html = '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif;">';
  html += '<thead><tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Rank</th>';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Country</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">Cumulative Excess (per 100k)</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">% of Total</th>';
  html += '</tr></thead><tbody>';
  
  contributions.forEach((contrib, index) => {
    const percentage = totalExcess !== 0 ? (contrib.excess / totalExcess * 100) : 0;
    const rowColor = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${index + 1}</td>`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${contrib.countryName}</td>`;
    html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">${contrib.excess.toFixed(2)}</td>`;
    html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">${percentage.toFixed(1)}%</td>`;
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  html += `<p style="margin-top: 15px; font-size: 0.9em; color: #333333;">Total cumulative excess in 2024: <strong>${totalExcess.toFixed(2)} per 100k</strong></p>`;
  
  container.innerHTML = html;
}

// Store plotData globally for granularity changes
let globalPlotData = null;

// Render baseline comparison tables
// Render Regression Summary table (for main section)
function renderRegressionSummaryTable() {
  const container = document.getElementById('regressionSummaryTable');
  if (!container) return;
  
  let html = '';
  
  html += '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif; font-size: 0.85em; margin-bottom: 40px;">';
  html += '<thead>';
  // Title row spanning all columns
  html += '<tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;"><th colspan="9" style="padding: 10px; text-align: left; border: 1px solid #cccccc; font-weight: bold; color: #1a1a1a; font-size: 1.1em;">Regression Summary  -  R²(p-values)</th></tr>';
  // Column headers row
  html += '<tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Factor</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2025 RMSE Minimised Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2010-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2011-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2012-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2013-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2014-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2015-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2016-2019 Static Baselines</th>';
  html += '</tr></thead><tbody>';
  
  const regressionData = [
    { factor: '2019 ASMR', values: [
      { r2: 0.7374, p: 0.0066, highlight: true },
      { r2: 0.6659, p: 0.0012 },
      { r2: 0.6058, p: 0.0003 },
      { r2: 0.6074, p: 0.0003 },
      { r2: 0.5842, p: 0.0002 },
      { r2: 0.6570, p: 0.0015 },
      { r2: 0.6214, p: 0.0005 },
      { r2: 0.5326, p: 5.74e-5 }
    ]},
    { factor: 'GDP (Nominal) per Capita', values: [
      { r2: 0.6415, p: 0.0013, highlight: true },
      { r2: 0.5946, p: 0.0004 },
      { r2: 0.5803, p: 0.0003 },
      { r2: 0.5690, p: 0.0003 },
      { r2: 0.5196, p: 7.54e-5 },
      { r2: 0.5228, p: 0.0001 },
      { r2: 0.5038, p: 4.82e-5 },
      { r2: 0.4235, p: 5.97e-6 }
    ]},
    { factor: 'Health Expenditure (%GDP)', values: [
      { r2: 0.4281, p: 2.97e-6, highlight: true },
      { r2: 0.3395, p: 9.16e-8 },
      { r2: 0.3113, p: 2.50e-8 },
      { r2: 0.2513, p: 2.01e-9 },
      { r2: 0.2052, p: 1.07e-10 },
      { r2: 0.1786, p: 3.36e-11 },
      { r2: 0.1702, p: 7.04e-12 },
      { r2: 0.3470, p: 3.67e-7 }
    ]},
    { factor: 'Inequality (GINI)', values: [
      { r2: 0.1154, p: 2.51e-14 },
      { r2: 0.1651, p: 4.52e-12 },
      { r2: 0.1980, p: 6.34e-11, highlight: true },
      { r2: 0.1781, p: 1.36e-11 },
      { r2: 0.1850, p: 2.36e-11 },
      { r2: 0.1953, p: 1.18e-10 },
      { r2: 0.1050, p: 6.44e-15 },
      { r2: 0.1178, p: 9.95e-14 }
    ]},
    { factor: 'Poverty (% living below line)', values: [
      { r2: 0.2279, p: 9.39e-9 },
      { r2: 0.4070, p: 1.32e-5 },
      { r2: 0.3711, p: 4.15e-6 },
      { r2: 0.3498, p: 1.99e-6 },
      { r2: 0.3916, p: 8.15e-6 },
      { r2: 0.5163, p: 0.0004 },
      { r2: 0.4299, p: 2.61e-5 },
      { r2: 0.5615, p: 0.0010, highlight: true }
    ]},
    { factor: 'Structural Vulnerability Index (Appendix 7)', values: [
      { r2: 0.7865, p: 0.0046, highlight: true },
      { r2: 0.7432, p: 0.0016 },
      { r2: 0.6957, p: 0.0005 },
      { r2: 0.6616, p: 0.0002 },
      { r2: 0.6374, p: 0.0001 },
      { r2: 0.7053, p: 0.0009 },
      { r2: 0.6708, p: 0.0003 },
      { r2: 0.5397, p: 1.04e-5 }
    ]}
  ];
  
  regressionData.forEach((row, rowIdx) => {
    const rowColor = rowIdx % 2 === 0 ? '#ffffff' : '#f9f9f9';
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${row.factor}</td>`;
    row.values.forEach((val, colIdx) => {
      const pStr = val.p < 0.001 ? val.p.toExponential(2) : val.p.toFixed(4);
      const displayValue = val.highlight ? `<strong>${val.r2.toFixed(4)} (${pStr})*</strong>` : `${val.r2.toFixed(4)} (${pStr})`;
      // Green background for highlighted cells
      const bgColor = val.highlight ? '#d4edda' : '';
      html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc; background-color: ${bgColor};">${displayValue}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  html += '<p style="font-family: Georgia, \'Times New Roman\', serif; color: #1a1a1a; font-size: 1em; line-height: 1.6; margin-top: 20px; margin-bottom: 20px;">';
  html += 'The equilibrium-selected baselines also show the lowest residual variance against the Structural Vulnerability Index in 3 out of 5 years tested (Appendix 1). This demonstrates that the explanatory power is not driven by overfitting to a single year. Together, these results show our method outperforms static baselines on 7 out of 11 metrics.';
  html += '</p>';
  container.innerHTML = html;
}

// Render Variance of Residuals table (for appendix)
function renderBaselineComparisonTables() {
  const container = document.getElementById('baselineComparisonTables');
  if (!container) {
    console.error('baselineComparisonTables container not found');
    return;
  }
  
  let html = '';
  
  // Table: Variance of Residuals by Year
  html += '<h3 style="font-family: Georgia, \'Times New Roman\', serif; margin-top: 0px; margin-bottom: 10px; font-weight: bold;">Appendix 1</h3>';
  html += '<h3 style="font-family: Georgia, \'Times New Roman\', serif; margin-top: 0px; margin-bottom: 10px;">Variance of Residuals by Year - All Baselines</h3>';
  html += '<p style="font-family: Georgia, \'Times New Roman\', serif; font-size: 0.9em; color: #666666; margin-bottom: 15px; font-style: italic;">Residuals are against the trendline formed from yearly excess mortality vs Structural Vulnerability Index (SVI).</p>';
  html += '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif; margin-bottom: 40px;">';
  html += '<thead><tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Year</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2025 RMSE Minimised Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2010-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2011-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2012-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2013-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2014-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2015-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2016-2019 Static Baselines</th>';
  html += '</tr></thead><tbody>';
  
  const varianceData = [
    { year: 2021, values: [
      { variance: 5399.8180, highlight: true },
      { variance: 5499.6017 },
      { variance: 5789.3023 },
      { variance: 5989.4353 },
      { variance: 5866.1000 },
      { variance: 5680.5881 },
      { variance: 6123.4159 },
      { variance: 5722.1175 }
    ]},
    { year: 2022, values: [
      { variance: 3549.0470 },
      { variance: 3441.0635, highlight: true },
      { variance: 3720.9042 },
      { variance: 3738.9065 },
      { variance: 3750.3718 },
      { variance: 4088.1896 },
      { variance: 3816.9514 },
      { variance: 4516.9061 }
    ]},
    { year: 2023, values: [
      { variance: 1724.1286 },
      { variance: 1648.2360 },
      { variance: 1620.3506 },
      { variance: 1580.5010, highlight: true },
      { variance: 1834.1592 },
      { variance: 2052.9461 },
      { variance: 1877.6105 },
      { variance: 2965.8062 }
    ]},
    { year: 2024, values: [
      { variance: 1098.7257, highlight: true },
      { variance: 1166.3241 },
      { variance: 1176.0836 },
      { variance: 1227.8422 },
      { variance: 1510.8633 },
      { variance: 1759.0378 },
      { variance: 2098.0821 },
      { variance: 4031.9126 }
    ]},
    { year: 2025, values: [
      { variance: 461.9430, highlight: true },
      { variance: 1358.0276 },
      { variance: 1530.8129 },
      { variance: 1480.5463 },
      { variance: 1807.7195 },
      { variance: 2290.3552 },
      { variance: 2855.4029 },
      { variance: 4619.1723 }
    ]}
  ];
  
  varianceData.forEach((row, rowIdx) => {
    const rowColor = rowIdx % 2 === 0 ? '#ffffff' : '#f9f9f9';
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${row.year}</td>`;
    row.values.forEach(val => {
      const displayValue = val.highlight ? `<strong>${val.variance.toFixed(4)} (36)*</strong>` : `${val.variance.toFixed(4)} (36)`;
      html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">${displayValue}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  
  container.innerHTML = html;
}

// Render SVI table in appendix
function renderSVITable() {
  const container = document.getElementById('sviTableContainer');
  if (!container) {
    console.error('sviTableContainer container not found');
    return;
  }
  
  let html = '';
  
  // Structural Vulnerability Index (SVI) Weights
  html += '<h3 style="font-family: Georgia, \'Times New Roman\', serif; margin-top: 0px; margin-bottom: 10px; font-weight: bold;">Appendix 7</h3>';
  html += '<h3 style="font-family: Georgia, \'Times New Roman\', serif; margin-top: 0px; margin-bottom: 10px;">Structural Vulnerability Index (SVI - 2025 Fixed) - All Baselines</h3>';
  html += '<p style="font-family: Georgia, \'Times New Roman\', serif; font-size: 0.9em; color: #666666; margin-bottom: 15px; font-style: italic;">SVI weights were calculated from a multiregression across known structural factors (2019 ASMR, GDP, Healthcare Expenditure, Inequality, Poverty) against the 2025 (01.01.2020-31.12.2024) cumulative excess mortality for each baseline.</p>';
  html += '<table style="width: 100%; border-collapse: collapse; font-family: Georgia, \'Times New Roman\', serif; margin-bottom: 40px;">';
  html += '<thead><tr style="background-color: #f5f5f5; border-bottom: 2px solid #cccccc;">';
  html += '<th style="padding: 10px; text-align: left; border: 1px solid #cccccc;">Factor</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2025 RMSE Minimised Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2010-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2011-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2012-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2013-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2014-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2015-2019 Static Baselines</th>';
  html += '<th style="padding: 10px; text-align: right; border: 1px solid #cccccc;">2016-2019 Static Baselines</th>';
  html += '</tr></thead><tbody>';
  
  const sviData = [
    { factor: 'Intercept', values: [-811.0524, -576.0491, -439.7168, -415.6947, -409.2885, -420.1034, -403.8503, -212.5353] },
    { factor: '2019 ASMR', values: [0.9762, 0.8126, 0.7049, 0.6724, 0.6519, 0.6942, 0.7530, 0.6210] },
    { factor: 'GDP (Nominal) per Capita', values: [-0.0022, -0.0024, -0.0028, -0.0033, -0.0036, -0.0045, -0.0047, -0.0052] },
    { factor: 'Inequality (GINI)', values: [6.5760, 8.3561, 8.3446, 8.5243, 8.9778, 9.7820, 8.8403, 9.5439] },
    { factor: 'Poverty (% living below line)', values: [-0.9740, -0.1118, -1.2918, 0.3692, -0.7009, -1.1155, 3.7914, 3.1640] },
    { factor: 'Health Expenditure (%GDP)', values: [-0.6266, -12.1614, -11.5597, -9.2419, -7.7010, -10.3897, -10.0549, -16.7227] }
  ];
  
  sviData.forEach((row, rowIdx) => {
    const rowColor = rowIdx % 2 === 0 ? '#ffffff' : '#f9f9f9';
    html += `<tr style="background-color: ${rowColor};">`;
    html += `<td style="padding: 8px; border: 1px solid #cccccc;">${row.factor}</td>`;
    row.values.forEach(val => {
      html += `<td style="padding: 8px; text-align: right; border: 1px solid #cccccc;">${val.toFixed(4)}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  
  container.innerHTML = html;
}

// Render residual plots grid image
function renderResidualPlotsGrid() {
  const container = document.getElementById('residualPlotsContainer');
  if (!container) {
    console.error('residualPlotsContainer container not found');
    return;
  }
  
  // Use the renamed file with simple filename
  const imagePath = 'data/residualEvolution.png';
  
  let html = '';
  html += '<h3 style="font-family: Georgia, \'Times New Roman\', serif; margin-top: 0px; margin-bottom: 10px; font-weight: bold;">Appendix 2</h3>';
  html += '<div style="width: 100%; margin-top: 20px;">';
  html += `<img src="${imagePath}" alt="Residual Evolution Plots Grid" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" onerror="console.error('Image failed to load. Path:', this.src); this.alt='Image not found: ' + this.src;">`;
  html += '</div>';
  
  container.innerHTML = html;
}

// Main function
async function main() {
  // Check if Plotly is loaded
  if (typeof Plotly === 'undefined') {
    console.error('Plotly is not loaded!');
    const mainContainer = document.querySelector('main.container');
    if (mainContainer) {
      mainContainer.innerHTML = 
        `<div style="padding: 20px; color: #8b0000;">
        <h3>Error: Plotly library not loaded</h3>
        <p>Please ensure plotly.min.js is in the assets/libs/ directory.</p>
      </div>`;
    }
    return;
  }
  
  try {
    console.log('Loading data...');
    const data = await loadData();
    console.log(`Loaded ${data.length} rows`);
    
    if (data.length === 0) {
      throw new Error('No data loaded from CSV file');
    }
    
    console.log('Grouping by country...');
    const dataByCountry = groupByCountry(data);
    console.log(`Found ${dataByCountry.size} countries total`);
    
    if (dataByCountry.size === 0) {
      throw new Error('No countries found in data');
    }
    
    console.log('Filtering countries with data from 2001 onwards...');
    const filterResult = filterCountriesFrom2001(dataByCountry);
    const filteredDataByCountry = filterResult.filtered;
    const actualEndDate = filterResult.endDate;
    console.log(`Found ${filteredDataByCountry.size} countries with consistent data from 2001 to ${actualEndDate.toISOString().split('T')[0]}`);
    
    if (filteredDataByCountry.size === 0) {
      throw new Error('No countries found with data from 2001 onwards');
    }
    
    // Log which countries are included
    const includedCountries = Array.from(filteredDataByCountry.keys())
      .map(code => countryNames[code] || code)
      .sort();
    console.log('Included countries:', includedCountries.join(', '));
    
    console.log('Creating aggregated plot data...');
    const plotData = createPlotData(filteredDataByCountry);
    console.log('Plot data created successfully');
    
    console.log('Finding top 10 countries with biggest differences...');
    const top10Countries = findTop10CountriesWithBiggestDifferences(dataByCountry);
    
    console.log('Calculating shared y-axis range...');
    const sharedYAxisRange = calculateSharedYAxisRange(dataByCountry);
    console.log(`Shared y-axis range: [${sharedYAxisRange[0].toFixed(2)}, ${sharedYAxisRange[1].toFixed(2)}]`);
    
    console.log('Creating all countries cumulative excess plots...');
    renderAllCountriesCumulativeExcessPlot(dataByCountry, '2016-2019', top10Countries, sharedYAxisRange, 'allCountriesCumulativeExcessChart');
    renderAllCountriesCumulativeExcessPlot2010_2019(dataByCountry, '2010-2019', top10Countries, sharedYAxisRange, 'allCountriesCumulativeExcessChart2010_2019');
    console.log(`All countries cumulative excess plots rendered successfully (${dataByCountry.size} countries)`);
    
    // Add event listeners for baseline selectors
    const baselineSelector1 = document.getElementById('baselineSelector1');
    const baselineSelector2 = document.getElementById('baselineSelector2');
    
    if (baselineSelector1) {
      baselineSelector1.addEventListener('change', function() {
        const selectedBaseline = this.value;
        renderAllCountriesCumulativeExcessPlot(dataByCountry, selectedBaseline, top10Countries, sharedYAxisRange, 'allCountriesCumulativeExcessChart');
      });
    }
    
    if (baselineSelector2) {
      baselineSelector2.addEventListener('change', function() {
        const selectedBaseline = this.value;
        renderAllCountriesCumulativeExcessPlot2010_2019(dataByCountry, selectedBaseline, top10Countries, sharedYAxisRange, 'allCountriesCumulativeExcessChart2010_2019');
      });
    }
    
    console.log('Creating simple charts...');
    renderSimpleExcessPlot(plotData);
    renderSimpleASMRChart(plotData);
    calculateAndDisplaySimpleRMSE(plotData);
    console.log('Simple charts rendered successfully');
    
    console.log('Creating cumulative excess plot...');
    // renderCumulativeExcessPlot(plotData); // Removed from Claim 1 section
    console.log('Cumulative excess plot rendered successfully');
    
    console.log('Creating Bulgaria ASMR chart with formula annotations...');
    const bulgariaData = dataByCountry.get('BGR');
    if (bulgariaData) {
      console.log(`Bulgaria data found: ${bulgariaData.rows.length} rows`);
    } else {
      console.warn('Bulgaria data not found in dataByCountry');
    }
    renderBulgariaASMRChartWithFormula(dataByCountry, 'usaASMRChart');
    console.log('Bulgaria ASMR chart rendered successfully');
    
    console.log('Creating NZ ASMR charts...');
    // Use original dataByCountry to ensure NZ is included even if it doesn't meet the 2001 filter
    renderNZASMRChart(dataByCountry, '2016-2019', 'nzASMRChart1');
    renderNZASMRChart(dataByCountry, '2010-2016', 'nzASMRChart2');
    renderNZASMRChart(dataByCountry, '2016-2019', 'nzASMRChart1Zoomed', { startYear: 2019, startMonth: 0, endYear: 2025, endMonth: 5 });
    renderNZASMRChart(dataByCountry, '2010-2016', 'nzASMRChart2Zoomed', { startYear: 2019, startMonth: 0, endYear: 2025, endMonth: 5 });
    renderNZASMRComparisonChart(dataByCountry, '2016-2019', 'nzASMRComparisonChart');
    renderNZASMRComparisonChart(dataByCountry, '2010-2016', 'nzASMRComparisonChart2010_2016');
    renderNZASMRComparisonChart(dataByCountry, '2010-2016', 'nzASMRComparisonChart2010_2016_Main');
    console.log('NZ ASMR charts rendered successfully');
    
    // Add event listener for baseline selector dropdown
    const baselineSelector = document.getElementById('baselineSelector');
    if (baselineSelector) {
      baselineSelector.addEventListener('change', function() {
        const selectedBaseline = this.value;
        renderNZASMRComparisonChart(dataByCountry, selectedBaseline, 'nzASMRComparisonChart');
      });
    }
    
    console.log('Creating NZ cumulative excess chart...');
    renderNZCumulativeExcessPlot(dataByCountry);
    console.log('NZ cumulative excess chart rendered successfully');
    
    console.log('Rendering baseline comparison tables...');
    renderRegressionSummaryTable();
    renderBaselineComparisonTables();
    console.log('Baseline comparison tables rendered successfully');
    
    console.log('Rendering SVI table in appendix...');
    renderSVITable();
    console.log('SVI table rendered successfully');
    
    console.log('Rendering residual plots grid...');
    renderResidualPlotsGrid();
    console.log('Residual plots grid rendered successfully');
  } catch (error) {
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    const mainContainer = document.querySelector('main.container');
    if (mainContainer) {
      mainContainer.innerHTML = 
        `<div style="padding: 20px; color: #8b0000;">
          <h3>Error loading data</h3>
          <p>${error.message}</p>
          <p>Please check the browser console for more details.</p>
          <p>Please ensure HMD.csv is in the data/ directory.</p>
        </div>`;
    }
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

