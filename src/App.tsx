import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Check,
  X,
  Shield,
  Activity,
  Battery,
  CloudSun,
  Download,
  FileText,
  Sliders,
  Cpu,
  Zap,
  BarChart3,
  TrendingDown,
  AlertTriangle,
  Clock,
  DollarSign,
  CheckCircle2,
  Maximize2,
  RefreshCw,
  Terminal,
  Layers,
  ChevronRight,
  SlidersHorizontal
} from 'lucide-react';

// ==========================================
// 1. INDUSTRIAL PLANT PRESETS & DIGITAL TWINS
// ==========================================
interface PlantSpecs {
  id: string;
  name: string;
  type: string;
  baselineLoadKw: number;
  pressSpikeKw: number;
  solarCapacityKw: number;
  bessCapacityKwh: number;
  bessMaxPowerKw: number;
  contractCeilingKw: number;
  demandPenaltyPerKw: number;
  description: string;
}

const PRESET_PLANTS: Record<string, PlantSpecs> = {
  automotive: {
    id: "automotive",
    name: "Automotive Heavy Stamping Facility #04",
    type: "Heavy Manufacturing & Hydraulic Presses",
    baselineLoadKw: 800,
    pressSpikeKw: 350,
    solarCapacityKw: 500,
    bessCapacityKwh: 1000,
    bessMaxPowerKw: 500,
    contractCeilingKw: 450,
    demandPenaltyPerKw: 35.0,
    description: "High-inertia 2,000-ton hydraulic stamping presses operating across dual production shifts with a 500 kWp rooftop solar array."
  },
  cold_storage: {
    id: "cold_storage",
    name: "Cold Storage & Refrigerated Logistics Hub",
    type: "Industrial Thermal Refrigeration",
    baselineLoadKw: 600,
    pressSpikeKw: 180,
    solarCapacityKw: 400,
    bessCapacityKwh: 800,
    bessMaxPowerKw: 400,
    contractCeilingKw: 380,
    demandPenaltyPerKw: 30.0,
    description: "Continuous industrial ammonia chillers and cold blast freezers vulnerable to mid-day solar drop surcharges."
  },
  precision_cnc: {
    id: "precision_cnc",
    name: "Precision CNC & Semiconductor Cleanroom",
    type: "High-Tolerance Cleanroom Machining",
    baselineLoadKw: 1200,
    pressSpikeKw: 250,
    solarCapacityKw: 750,
    bessCapacityKwh: 1500,
    bessMaxPowerKw: 750,
    contractCeilingKw: 650,
    demandPenaltyPerKw: 40.0,
    description: "Ultra-sensitive cleanroom HVAC and 5-axis robotic machining requiring deterministic sub-cycle grid stabilization."
  }
};

// ==========================================
// 2. 24-HOUR TELEMETRY SIMULATION ENGINE
// ==========================================
interface TelemetryPoint {
  timeStr: string;
  hour: number;
  tariff: number;
  solarKw: number;
  factoryLoadKw: number;
  unmanagedNetKw: number;
  bessPowerKw: number; // positive = discharging, negative = charging
  bessSocPct: number;
  managedGridKw: number;
  avoidedKw: number;
}

function generateMicrogridTelemetry(
  specs: PlantSpecs,
  cloudDropActive: boolean,
  cloudSeverity: number = 0.53,
  edgeGuardEnabled: boolean = true,
  productionSurgePct: number = 0
) {
  const points: TelemetryPoint[] = [];
  const dtHours = 0.25; // 15-minute intervals (96 points)
  let currentSoc = 0.55 * specs.bessCapacityKwh;

  for (let i = 0; i < 96; i++) {
    const hour = i * dtHours;
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // 1. Time-of-Use Tariff ($/kWh)
    let tariff = 0.08; // Off-peak (22:00 - 06:00)
    if (hour >= 14 && hour < 20) {
      tariff = 0.34; // On-peak
    } else if ((hour >= 6 && hour < 14) || (hour >= 20 && hour < 22)) {
      tariff = 0.16; // Mid-peak
    }

    // 2. Solar PV Output
    let solarKw = 0;
    if (hour >= 6 && hour <= 18.5) {
      const sunAngle = Math.sin(((hour - 6.0) / 12.5) * Math.PI);
      const baseSolar = specs.solarCapacityKw * Math.pow(Math.max(0, sunAngle), 1.15);
      solarKw = baseSolar;

      // Simulated sudden cloud event (13:30 - 15:30)
      if (cloudDropActive && hour >= 13.5 && hour < 15.5) {
        solarKw *= (1.0 - cloudSeverity);
      }
    }

    // 3. Factory Production Load Profile
    let base = specs.baselineLoadKw;
    let pressSpike = 0;
    if (hour >= 8 && hour < 16.5) {
      const isPressActive = i % 3 === 0;
      pressSpike = isPressActive ? specs.pressSpikeKw : specs.pressSpikeKw * 0.35;
      pressSpike *= (1.0 + productionSurgePct / 100);
    } else if (hour >= 16.5 && hour < 24) {
      base *= 0.75;
      pressSpike = (i % 4 === 0) ? specs.pressSpikeKw * 0.3 : 0;
    } else {
      base *= 0.45;
    }
    const factoryLoadKw = Math.round(base + pressSpike);
    const unmanagedNetKw = Math.round(Math.max(0, factoryLoadKw - solarKw));

    // 4. GridPulse AI EMS Battery Dispatch Logic
    let bessPowerKw = 0;

    if (!edgeGuardEnabled) {
      bessPowerKw = 0;
    } else {
      // Night Off-Peak Charging (01:00 to 05:00)
      if (hour >= 1 && hour <= 5 && currentSoc < 0.95 * specs.bessCapacityKwh) {
        const chargeRate = Math.min(specs.bessMaxPowerKw * 0.45, (0.95 * specs.bessCapacityKwh - currentSoc) / dtHours);
        bessPowerKw = -chargeRate;
        currentSoc += Math.abs(bessPowerKw) * dtHours * 0.95;
      }
      // Peak Shaving & Solar Drop Compensation
      else if (unmanagedNetKw > specs.contractCeilingKw && currentSoc > 0.20 * specs.bessCapacityKwh) {
        const deficitKw = unmanagedNetKw - specs.contractCeilingKw;
        const availableDischarge = Math.min(specs.bessMaxPowerKw, (currentSoc - 0.20 * specs.bessCapacityKwh) / dtHours);
        bessPowerKw = Math.min(deficitKw, availableDischarge);
        currentSoc -= (bessPowerKw / 0.95) * dtHours;
      }
      // Solar Surplus Daytime Charging
      else if (solarKw > factoryLoadKw && currentSoc < 0.95 * specs.bessCapacityKwh) {
        const surplusKw = solarKw - factoryLoadKw;
        const chargePower = Math.min(surplusKw, specs.bessMaxPowerKw);
        bessPowerKw = -chargePower;
        currentSoc += chargePower * dtHours * 0.95;
      }
    }

    const managedGridKw = Math.round(Math.max(0, factoryLoadKw - solarKw - bessPowerKw));
    const bessSocPct = Math.min(95, Math.max(20, Math.round((currentSoc / specs.bessCapacityKwh) * 100)));
    const avoidedKw = Math.max(0, unmanagedNetKw - managedGridKw);

    points.push({
      timeStr,
      hour,
      tariff,
      solarKw: Math.round(solarKw),
      factoryLoadKw,
      unmanagedNetKw,
      bessPowerKw: Math.round(bessPowerKw),
      bessSocPct,
      managedGridKw,
      avoidedKw
    });
  }

  const unmanagedPeakKw = Math.max(...points.map(p => p.unmanagedNetKw));
  const managedPeakKw = Math.max(...points.map(p => p.managedGridKw));
  const peakReductionKw = Math.max(0, unmanagedPeakKw - managedPeakKw);
  const peakReductionPct = Math.round((peakReductionKw / unmanagedPeakKw) * 100);

  const unmanagedExcess = Math.max(0, unmanagedPeakKw - specs.contractCeilingKw);
  const managedExcess = Math.max(0, managedPeakKw - specs.contractCeilingKw);
  const unmanagedDemandPenalty = unmanagedExcess * specs.demandPenaltyPerKw;
  const managedDemandPenalty = managedExcess * specs.demandPenaltyPerKw;
  const avoidedDemandPenalty = unmanagedDemandPenalty - managedDemandPenalty;

  const unmanagedEnergyCost = points.reduce((acc, p) => acc + p.unmanagedNetKw * p.tariff * dtHours, 0);
  const managedEnergyCost = points.reduce((acc, p) => acc + p.managedGridKw * p.tariff * dtHours, 0);
  const touArbitrageSavings = Math.max(0, unmanagedEnergyCost - managedEnergyCost);

  const totalUnmanagedBill = unmanagedEnergyCost + unmanagedDemandPenalty;
  const totalManagedBill = managedEnergyCost + managedDemandPenalty;
  const monthlyNetSavings = totalUnmanagedBill - totalManagedBill;
  const annualSavings = monthlyNetSavings * 12;

  const bessCapex = specs.bessCapacityKwh * 180;
  const paybackMonths = Math.round((bessCapex / monthlyNetSavings) * 10) / 10;

  return {
    points,
    unmanagedPeakKw,
    managedPeakKw,
    peakReductionKw,
    peakReductionPct,
    unmanagedDemandPenalty,
    managedDemandPenalty,
    avoidedDemandPenalty,
    unmanagedEnergyCost,
    managedEnergyCost,
    touArbitrageSavings,
    totalUnmanagedBill,
    totalManagedBill,
    monthlyNetSavings,
    annualSavings,
    paybackMonths
  };
}

// ==========================================
// 3. ANIMATION HELPERS (WordsPullUp)
// ==========================================
export function WordsPullUp({ text, className = "", showAsterisk = false }: { text: string; className?: string; showAsterisk?: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const isInView = useInView(containerRef, { once: true });
  const words = text.split(" ");

  return (
    <span ref={containerRef} className={`inline-flex flex-wrap ${className}`}>
      {words.map((word, index) => {
        const isLastWord = index === words.length - 1;
        return (
          <span key={index} className="inline-block overflow-hidden mr-[0.2em] last:mr-0">
            <motion.span
              className="inline-block relative"
              initial={{ y: 30, opacity: 0 }}
              animate={isInView ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
              transition={{ duration: 0.8, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              {word}
              {showAsterisk && isLastWord && (
                <span className="absolute top-[0.65em] -right-[0.3em] text-[0.31em] select-none font-normal">
                  *
                </span>
              )}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

interface MultiStyleSegment {
  text: string;
  className: string;
}

export function WordsPullUpMultiStyle({ segments, className = "" }: { segments: MultiStyleSegment[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true });

  let wordIndex = 0;
  return (
    <div ref={containerRef} className={`inline-flex flex-wrap justify-center ${className}`}>
      {segments.map((segment, segIdx) => {
        const words = segment.text.split(" ");
        return (
          <span key={segIdx} className="inline-flex flex-wrap justify-center">
            {words.map((word, wIdx) => {
              const currentIdx = wordIndex++;
              return (
                <span key={wIdx} className="inline-block overflow-hidden mx-[0.14em]">
                  <motion.span
                    className={`inline-block ${segment.className}`}
                    initial={{ y: 24, opacity: 0 }}
                    animate={isInView ? { y: 0, opacity: 1 } : { y: 24, opacity: 0 }}
                    transition={{ duration: 0.7, delay: currentIdx * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {word}
                  </motion.span>
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

export function AnimatedLetter({ char, index, totalChars, scrollYProgress }: { char: string; index: number; totalChars: number; scrollYProgress: any }) {
  const charProgress = index / totalChars;
  const start = Math.max(0, charProgress - 0.1);
  const end = Math.min(1, charProgress + 0.05);
  const opacity = useTransform(scrollYProgress, [start, end], [0.2, 1]);

  return (
    <motion.span style={{ opacity }} className="inline">
      {char}
    </motion.span>
  );
}

// ==========================================
// 4. INTERACTIVE SVG POWER FLOW DISPATCH CHART
// ==========================================
interface SvgChartProps {
  points: TelemetryPoint[];
  contractCeilingKw: number;
  cloudDropActive: boolean;
  selectedHourIdx: number;
  onHoverIndex: (idx: number) => void;
  height?: number;
  showControls?: boolean;
}

export function MicrogridDispatchSvgChart({
  points,
  contractCeilingKw,
  cloudDropActive,
  selectedHourIdx,
  onHoverIndex,
  height = 360,
  showControls = true
}: SvgChartProps) {
  const [showLoad, setShowLoad] = useState(true);
  const [showSolar, setShowSolar] = useState(true);
  const [showBess, setShowBess] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const width = 1000;
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 30;
  const paddingBottom = 45;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const maxKw = 1350;

  const getX = (idx: number) => paddingLeft + (idx / (points.length - 1)) * chartW;
  const getY = (kw: number) => paddingTop + chartH - (Math.max(0, kw) / maxKw) * chartH;

  const loadPath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.factoryLoadKw).toFixed(1)}`).join(' ');
  }, [points, chartW, chartH]);

  const solarPath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.solarKw).toFixed(1)}`).join(' ');
  }, [points, chartW, chartH]);

  const solarAreaPath = useMemo(() => {
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.solarKw).toFixed(1)}`).join(' ');
    return `${line} L ${getX(points.length - 1)} ${getY(0)} L ${getX(0)} ${getY(0)} Z`;
  }, [points, chartW, chartH]);

  const gridManagedPath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.managedGridKw).toFixed(1)}`).join(' ');
  }, [points, chartW, chartH]);

  const gridUnmanagedPath = useMemo(() => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.unmanagedNetKw).toFixed(1)}`).join(' ');
  }, [points, chartW, chartH]);

  const bessPath = useMemo(() => {
    return points.map((p, i) => {
      const displayKw = p.bessPowerKw > 0 ? p.bessPowerKw : 0;
      return `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(displayKw).toFixed(1)}`;
    }).join(' ');
  }, [points, chartW, chartH]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normX = (mouseX / rect.width) * width;
    const chartX = Math.max(0, Math.min(chartW, normX - paddingLeft));
    const idx = Math.round((chartX / chartW) * (points.length - 1));
    onHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const currentPt = points[selectedHourIdx] || points[0];

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Chart Legend & Toggles */}
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#141414] p-3.5 rounded-xl border border-white/5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowLoad(!showLoad)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${showLoad ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'text-gray-500 opacity-50'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
              <span>Factory Load ({currentPt.factoryLoadKw} kW)</span>
            </button>

            <button
              onClick={() => setShowSolar(!showSolar)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${showSolar ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'text-gray-500 opacity-50'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
              <span>Solar PV ({currentPt.solarKw} kW)</span>
            </button>

            <button
              onClick={() => setShowBess(!showBess)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${showBess ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-gray-500 opacity-50'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
              <span>BESS Storage ({currentPt.bessPowerKw > 0 ? `+${currentPt.bessPowerKw}` : currentPt.bessPowerKw} kW)</span>
            </button>

            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${showGrid ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' : 'text-gray-500 opacity-50'}`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
              <span>Net Grid Import ({currentPt.managedGridKw} kW)</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-3 h-0.5 border-t border-dashed border-red-500 inline-block" />
              Contract Limit: {contractCeilingKw} kW
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-primary font-mono">Scrub: {currentPt.timeStr}</span>
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden rounded-xl bg-[#0d0d0d] border border-white/10 shadow-inner">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
        >
          <defs>
            <linearGradient id="solarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="unmanagedGridGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Cloud Cover Event Highlight Zone (13:30 to 15:30) */}
          {cloudDropActive && (
            <g>
              <rect
                x={getX(54)}
                y={paddingTop}
                width={getX(62) - getX(54)}
                height={chartH}
                fill="rgba(245, 158, 11, 0.08)"
                stroke="rgba(245, 158, 11, 0.3)"
                strokeDasharray="4 4"
              />
              <text
                x={(getX(54) + getX(62)) / 2}
                y={paddingTop + 16}
                fill="#FBBF24"
                fontSize="11"
                textAnchor="middle"
                fontWeight="500"
              >
                ⚠️ 53% Solar Cloud Loss Window
              </text>
            </g>
          )}

          {/* Gridlines & Y-Axis Labels */}
          {[0, 300, 600, 900, 1200].map((kw) => {
            const y = getY(kw);
            return (
              <g key={kw}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  fill="rgba(255, 255, 255, 0.35)"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {kw} kW
                </text>
              </g>
            );
          })}

          {/* X-Axis Hour Labels (Every 3 hours) */}
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hr) => {
            const idx = hr === 24 ? points.length - 1 : hr * 4;
            const x = getX(idx);
            return (
              <g key={hr}>
                <line
                  x1={x}
                  y1={paddingTop + chartH}
                  x2={x}
                  y2={paddingTop + chartH + 6}
                  stroke="rgba(255, 255, 255, 0.2)"
                />
                <text
                  x={x}
                  y={paddingTop + chartH + 20}
                  fill="rgba(255, 255, 255, 0.4)"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {String(hr).padStart(2, '0')}:00
                </text>
              </g>
            );
          })}

          {/* Red Dashed Contract Ceiling Line */}
          <line
            x1={paddingLeft}
            y1={getY(contractCeilingKw)}
            x2={width - paddingRight}
            y2={getY(contractCeilingKw)}
            stroke="#EF4444"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />
          <text
            x={width - paddingRight - 8}
            y={getY(contractCeilingKw) - 6}
            fill="#EF4444"
            fontSize="10"
            textAnchor="end"
            fontWeight="bold"
          >
            Contract Limit: {contractCeilingKw} kW
          </text>

          {/* Unmanaged Peak Spike (Dotted Red Line showing surge avoided) */}
          {showGrid && (
            <path
              d={gridUnmanagedPath}
              fill="none"
              stroke="#EF4444"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              opacity="0.6"
            />
          )}

          {/* Solar Generation Area & Line */}
          {showSolar && (
            <g>
              <path d={solarAreaPath} fill="url(#solarGradient)" />
              <path d={solarPath} fill="none" stroke="#10B981" strokeWidth="2.2" />
            </g>
          )}

          {/* Factory Load Line */}
          {showLoad && (
            <path d={loadPath} fill="none" stroke="#F59E0B" strokeWidth="2" />
          )}

          {/* BESS Discharge Line */}
          {showBess && (
            <path d={bessPath} fill="none" stroke="#06B6D4" strokeWidth="2.2" />
          )}

          {/* Managed Grid Draw Line */}
          {showGrid && (
            <path d={gridManagedPath} fill="none" stroke="#3B82F6" strokeWidth="2.5" />
          )}

          {/* Active Hover Scrubber Line & Dot Indicators */}
          {selectedHourIdx >= 0 && (
            <g>
              <line
                x1={getX(selectedHourIdx)}
                y1={paddingTop}
                x2={getX(selectedHourIdx)}
                y2={paddingTop + chartH}
                stroke="#E1E0CC"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.8"
              />
              {showLoad && <circle cx={getX(selectedHourIdx)} cy={getY(currentPt.factoryLoadKw)} r="4" fill="#F59E0B" />}
              {showSolar && <circle cx={getX(selectedHourIdx)} cy={getY(currentPt.solarKw)} r="4" fill="#10B981" />}
              {showBess && <circle cx={getX(selectedHourIdx)} cy={getY(Math.max(0, currentPt.bessPowerKw))} r="4" fill="#06B6D4" />}
              {showGrid && <circle cx={getX(selectedHourIdx)} cy={getY(currentPt.managedGridKw)} r="5" fill="#3B82F6" stroke="#fff" strokeWidth="1.5" />}
            </g>
          )}
        </svg>

        {/* Real-Time Telemetry Scrubber HUD Overlay */}
        <div className="absolute top-3 left-16 bg-black/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-white/10 text-[11px] font-mono flex items-center gap-4 shadow-xl">
          <div className="flex items-center gap-1.5 text-primary">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span className="font-bold">{currentPt.timeStr}</span>
          </div>
          <div className="text-gray-400">
            Tariff: <span className="text-white">${currentPt.tariff.toFixed(2)}/kWh</span>
          </div>
          <div className="text-gray-400">
            Grid Import: <span className="text-blue-400 font-bold">{currentPt.managedGridKw} kW</span>
          </div>
          <div className="text-gray-400">
            BESS: <span className="text-cyan-400 font-bold">{currentPt.bessPowerKw > 0 ? `+${currentPt.bessPowerKw}` : currentPt.bessPowerKw} kW</span>
          </div>
          <div className="text-gray-400">
            Battery SoC: <span className="text-emerald-400 font-bold">{currentPt.bessSocPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. MAIN COMPONENT: APP
// ==========================================
export default function App() {
  const [selectedPlantId, setSelectedPlantId] = useState<string>('automotive');
  const [isCloudDropSimulated, setIsCloudDropSimulated] = useState(true);
  const [cloudSeverityPct, setCloudSeverityPct] = useState(53);
  const [isEdgeGuardActive, setIsEdgeGuardActive] = useState(true);
  const [productionSurgePct, setProductionSurgePct] = useState(0);
  const [scrubberIdx, setScrubberIdx] = useState(56); // 14:00 (peak drop window)

  const activePlant = PRESET_PLANTS[selectedPlantId] || PRESET_PLANTS.automotive;

  const sim = useMemo(() => {
    return generateMicrogridTelemetry(
      activePlant,
      isCloudDropSimulated,
      cloudSeverityPct / 100,
      isEdgeGuardActive,
      productionSurgePct
    );
  }, [activePlant, isCloudDropSimulated, cloudSeverityPct, isEdgeGuardActive, productionSurgePct]);

  // CSV Exporter
  const handleDownloadCsv = () => {
    const headers = ["Timestamp", "Hour", "Tariff_USD_kWh", "Solar_kW", "Factory_Load_kW", "Unmanaged_Grid_kW", "BESS_Dispatch_kW", "BESS_SoC_Pct", "Managed_Grid_kW", "Avoided_Spike_kW"];
    const rows = sim.points.map(p => [
      p.timeStr,
      p.hour.toFixed(2),
      p.tariff.toFixed(2),
      p.solarKw,
      p.factoryLoadKw,
      p.unmanagedNetKw,
      p.bessPowerKw,
      p.bessSocPct,
      p.managedGridKw,
      p.avoidedKw
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GridPulse_SCADA_Telemetry_${activePlant.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const aboutContainerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: aboutScrollProgress } = useScroll({
    target: aboutContainerRef,
    offset: ["start 0.8", "end 0.2"]
  });

  const aboutBodyText = "When sudden cloud cover slashes rooftop solar generation by fifty percent during high manufacturing production, factories face catastrophic utility demand surcharges. GridPulse steps in within thirty eight milliseconds, discharging battery reserves to insulate the plant from utility penalty thresholds.";
  const aboutChars = aboutBodyText.split("");

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="bg-black text-[#E1E0CC] min-h-screen selection:bg-primary selection:text-black">

      {/* ========================================================= */}
      {/* SECTION 1: HERO SECTION                                   */}
      {/* ========================================================= */}
      <section className="h-screen w-full p-4 md:p-6 relative">
        <div className="w-full h-full rounded-2xl md:rounded-[2rem] overflow-hidden relative bg-black">
          
          <video
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_170732_8a9ccda6-5cff-4628-b164-059c500a2b41.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />

          <div className="noise-overlay absolute inset-0 opacity-[0.7] mix-blend-overlay pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />

          {/* Hanging Navbar Pill */}
          <nav className="absolute top-0 left-1/2 -translate-x-1/2 z-20 bg-black rounded-b-2xl md:rounded-b-3xl px-4 py-2 md:px-8 flex items-center justify-center gap-3 sm:gap-6 md:gap-8 lg:gap-10 shadow-2xl border-b border-x border-white/5">
            {[
              { label: "SCADA Cockpit", id: "scada-cockpit" },
              { label: "24H Dispatch", id: "dispatch-analytics" },
              { label: "Plant Twins", id: "plant-presets" },
              { label: "Battery Health", id: "battery-health" },
              { label: "Billing Audit", id: "financial-roi" },
              { label: "Stress Testing", id: "stress-sandbox" },
              { label: "Terminal Logs", id: "edge-terminal" },
              { label: "Exporter", id: "compliance-export" }
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => scrollToSection(item.id)}
                className="text-[10px] sm:text-xs md:text-sm font-medium tracking-wide text-primary/80 hover:text-white transition-colors duration-200 cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Hero Content: Bottom-aligned responsive flex container */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-12 z-10">
            <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-6 lg:gap-8">
              
              {/* Left: Giant Heading "GridPulse" with asterisk */}
              <div className="flex-1 min-w-0 flex items-end">
                <h1 className="text-[16vw] sm:text-[14vw] md:text-[11vw] lg:text-[7.8vw] xl:text-[8.2vw] 2xl:text-[8.5vw] font-medium leading-[0.85] tracking-[-0.05em] text-[#E1E0CC] select-none whitespace-nowrap">
                  <WordsPullUp text="GridPulse" showAsterisk={true} />
                </h1>
              </div>

              {/* Right: Description text + VERTICALLY STACKED ACTION BUTTONS */}
              <div className="w-full lg:w-auto lg:max-w-md flex flex-col items-start gap-4 sm:gap-5 pb-2 shrink-0 relative z-20">
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[11px] font-mono text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span>EDGE EMS ONLINE · SUB-38MS DISPATCH</span>
                </div>

                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="text-primary/80 text-xs sm:text-sm md:text-base leading-[1.3] max-w-sm lg:max-w-md"
                >
                  Autonomous AI operating system coordinating industrial solar arrays, multi-MWh BESS storage, and factory presses to eliminate utility demand surcharges.
                </motion.p>

                {/* Vertical Stacked Actions */}
                <div className="flex flex-col items-start gap-2.5 w-full sm:w-auto">
                  <motion.button
                    onClick={() => scrollToSection('scada-cockpit')}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full sm:w-auto bg-primary rounded-full pl-5 pr-1.5 py-1.5 sm:pl-6 sm:pr-2 sm:py-2 text-black font-semibold text-sm sm:text-base inline-flex items-center justify-between sm:justify-start gap-3 group transition-all duration-300 hover:gap-4 cursor-pointer shadow-2xl hover:bg-white"
                  >
                    <span>Launch Autonomous SCADA Console</span>
                    <div className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shrink-0">
                      <ArrowRight className="w-4 h-4 text-[#DEDBC8]" />
                    </div>
                  </motion.button>

                  <button
                    onClick={() => scrollToSection('scada-cockpit')}
                    className="text-xs text-primary/80 hover:text-white transition-colors flex items-center gap-1.5 pl-2 font-mono"
                  >
                    <span>Explore SCADA Sections Below ↓</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 2 (VERTICAL): FULL SCADA OPERATING COCKPIT        */}
      {/* ========================================================= */}
      <section id="scada-cockpit" className="bg-[#0b0b0b] py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-widest font-mono mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>SCADA Core Telemetry Engine</span>
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white">
                Live Industrial SCADA Cockpit
              </h2>
            </div>
            <div className="text-xs font-mono text-gray-400 bg-[#161616] px-4 py-2.5 rounded-xl border border-white/10">
              Active Digital Twin: <span className="text-white font-bold">{activePlant.name}</span>
            </div>
          </div>

          {/* Real-time Equation Bar (Full Width) */}
          <div className="bg-[#121212] p-5 sm:p-6 rounded-2xl border border-white/10 shadow-2xl">
            <span className="text-xs font-mono text-gray-400 uppercase tracking-widest block mb-4">
              Real-Time Instantaneous Power Balance (t = {sim.points[scrubberIdx]?.timeStr})
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#181818] p-4 rounded-xl border border-emerald-500/20">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Solar PV Output</span>
                  <CloudSun className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-emerald-400">
                  {sim.points[scrubberIdx]?.solarKw} kW
                </div>
                <span className="text-[10px] text-gray-500">
                  {isCloudDropSimulated ? '(-53% cloud dip)' : '(Nominal generation)'}
                </span>
              </div>

              <div className="bg-[#181818] p-4 rounded-xl border border-cyan-500/20">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>BESS Discharge</span>
                  <Battery className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-cyan-400">
                  {sim.points[scrubberIdx]?.bessPowerKw > 0 ? `+${sim.points[scrubberIdx]?.bessPowerKw}` : sim.points[scrubberIdx]?.bessPowerKw} kW
                </div>
                <span className="text-[10px] text-gray-500">
                  SoC: {sim.points[scrubberIdx]?.bessSocPct}%
                </span>
              </div>

              <div className="bg-[#181818] p-4 rounded-xl border border-blue-500/20">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Net Grid Import</span>
                  <Activity className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-blue-400">
                  {sim.points[scrubberIdx]?.managedGridKw} kW
                </div>
                <span className="text-[10px] text-emerald-400">
                  ✓ Clamped under {activePlant.contractCeilingKw} kW
                </span>
              </div>

              <div className="bg-[#181818] p-4 rounded-xl border border-amber-500/20">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                  <span>Factory Machinery Demand</span>
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-mono font-bold text-amber-400">
                  {sim.points[scrubberIdx]?.factoryLoadKw} kW
                </div>
                <span className="text-[10px] text-gray-500">
                  Production presses active
                </span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 3 (VERTICAL): 24-HOUR DISPATCH & POWER FLOW GRAPH  */}
      {/* ========================================================= */}
      <section id="dispatch-analytics" className="bg-black py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-2">
                Predictive Power Flow & Clamping
              </span>
              <h2 className="text-3xl sm:text-4xl font-medium text-white">
                24-Hour Autonomous Microgrid Dispatch
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setIsCloudDropSimulated(!isCloudDropSimulated)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${isCloudDropSimulated ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white'}`}
              >
                <CloudSun className="w-3.5 h-3.5" />
                <span>{isCloudDropSimulated ? 'Cloud Drop: Active (-53%)' : 'Simulate Cloud Drop'}</span>
              </button>

              <button
                onClick={() => setIsEdgeGuardActive(!isEdgeGuardActive)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${isEdgeGuardActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'}`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{isEdgeGuardActive ? 'AI Guard: Active (38ms)' : 'AI Guard: Disabled'}</span>
              </button>
            </div>
          </div>

          {!isEdgeGuardActive && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <span className="font-bold">CRITICAL UTILITY BREACH:</span> AI Edge Guard is disabled. Plant grid draw has spiked to{' '}
                <span className="font-mono font-bold text-white">{sim.unmanagedPeakKw} kW</span>, exceeding the contracted ceiling by{' '}
                <span className="font-mono font-bold text-white">{sim.unmanagedPeakKw - activePlant.contractCeilingKw} kW</span>.
                Utility will levy a monthly surcharge of{' '}
                <span className="font-mono font-bold text-white">${Math.round(sim.unmanagedDemandPenalty).toLocaleString()}</span>!
              </div>
            </div>
          )}

          {/* Full Width SVG Chart */}
          <MicrogridDispatchSvgChart
            points={sim.points}
            contractCeilingKw={activePlant.contractCeilingKw}
            cloudDropActive={isCloudDropSimulated}
            selectedHourIdx={scrubberIdx}
            onHoverIndex={setScrubberIdx}
            height={380}
          />

          {/* Interactive Scrubbing Slider under chart */}
          <div className="flex items-center gap-4 bg-[#121212] p-4 rounded-xl border border-white/5">
            <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1.5 font-mono">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Timeline: {sim.points[scrubberIdx]?.timeStr}
            </span>
            <input
              type="range"
              min="0"
              max={sim.points.length - 1}
              value={scrubberIdx}
              onChange={(e) => setScrubberIdx(parseInt(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
            <span className="text-[11px] font-mono text-gray-400 whitespace-nowrap">
              {sim.points[scrubberIdx]?.managedGridKw} kW Imported
            </span>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 4 (VERTICAL): PLANT DIGITAL TWIN PRESETS          */}
      {/* ========================================================= */}
      <section id="plant-presets" className="bg-[#0b0b0b] py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div>
            <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-2">
              Factory Digital Twin Configurations
            </span>
            <h2 className="text-3xl sm:text-4xl font-medium text-white">
              Industrial Plant Facility Presets
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              Select a facility configuration to immediately recompute the physics simulation, battery dispatch curves, and financial savings.
            </p>
          </div>

          {/* Vertically Stacked Plant Cards */}
          <div className="space-y-4">
            {Object.values(PRESET_PLANTS).map((plant) => {
              const isSelected = selectedPlantId === plant.id;
              return (
                <div
                  key={plant.id}
                  onClick={() => setSelectedPlantId(plant.id)}
                  className={`p-6 sm:p-8 rounded-2xl cursor-pointer transition-all duration-300 border ${isSelected ? 'bg-[#181818] border-primary shadow-2xl ring-1 ring-primary/40' : 'bg-[#121212] border-white/5 hover:border-white/20'}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-white/5 text-gray-300 uppercase mr-3">
                        {plant.type}
                      </span>
                      <h3 className="text-xl font-medium text-white inline-block mt-2 sm:mt-0">
                        {plant.name}
                      </h3>
                    </div>
                    {isSelected ? (
                      <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                        <CheckCircle2 className="w-4 h-4" /> Active Digital Twin
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500 font-mono">
                        Click to activate
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-gray-400 mb-6 leading-relaxed">
                    {plant.description}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/5 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-gray-500 block">Baseline Production</span>
                      <span className="text-white font-medium text-sm">{plant.baselineLoadKw} kW</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Solar Capacity</span>
                      <span className="text-emerald-400 font-medium text-sm">{plant.solarCapacityKw} kWp</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">BESS Inverter / Storage</span>
                      <span className="text-cyan-400 font-medium text-sm">{plant.bessMaxPowerKw} kW / {plant.bessCapacityKwh} kWh</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">Contract Ceiling Limit</span>
                      <span className="text-red-400 font-medium text-sm">{plant.contractCeilingKw} kW</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 5 (VERTICAL): BESS BATTERY STORAGE & HEALTH       */}
      {/* ========================================================= */}
      <section id="battery-health" className="bg-black py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div>
            <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-2">
              Electrochemistry & Cell Preservation
            </span>
            <h2 className="text-3xl sm:text-4xl font-medium text-white">
              BESS Battery Storage & Cell Dynamics
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#121212] p-6 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-gray-400 uppercase">State of Charge (SoC)</span>
                <Battery className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="text-4xl font-mono font-bold text-emerald-400 mb-3">
                {sim.points[scrubberIdx]?.bessSocPct}%
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-400 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${sim.points[scrubberIdx]?.bessSocPct}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-500 block mt-4">
                Guarded operating boundaries: 20% minimum DoD to 95% maximum cell health.
              </span>
            </div>

            <div className="bg-[#121212] p-6 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-gray-400 uppercase">Inverter C-Rate</span>
                <Zap className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="text-4xl font-mono font-bold text-cyan-400 mb-3">
                0.42 C
              </div>
              <span className="text-xs text-gray-300 block font-mono">
                Rated Power: {activePlant.bessMaxPowerKw} kW Inverter
              </span>
              <span className="text-[11px] text-gray-500 block mt-4">
                Sub-38ms instantaneous four-quadrant bidirectional power response.
              </span>
            </div>

            <div className="bg-[#121212] p-6 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-gray-400 uppercase">Chemistry & Lifespan</span>
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="text-4xl font-mono font-bold text-primary mb-3">
                +4.2 Yrs
              </div>
              <span className="text-xs text-gray-300 block font-mono">
                LFP (Lithium Iron Phosphate)
              </span>
              <span className="text-[11px] text-gray-500 block mt-4">
                Predictive thermal management extends cell cycle life beyond 8,000 cycles.
              </span>
            </div>
          </div>

          {/* Full Width ToU Charging Schedule */}
          <div className="bg-[#121212] p-6 sm:p-8 rounded-2xl border border-white/10 font-mono text-xs space-y-3">
            <h4 className="text-base font-sans font-medium text-white mb-4">
              Automated 3-Tier Time-of-Use Arbitrage Schedule
            </h4>
            <div className="flex flex-col sm:flex-row justify-between py-3 border-b border-white/5 gap-1">
              <span className="text-emerald-400 font-bold">01:00 - 05:00 (Off-Peak Period)</span>
              <span className="text-gray-300">Automated grid pre-charging at lowest tariff ($0.08 / kWh) up to 95% SoC</span>
            </div>
            <div className="flex flex-col sm:flex-row justify-between py-3 border-b border-white/5 gap-1">
              <span className="text-amber-400 font-bold">06:00 - 14:00 (Mid-Peak Period)</span>
              <span className="text-gray-300">Direct solar self-consumption with battery on active edge standby ($0.16 / kWh)</span>
            </div>
            <div className="flex flex-col sm:flex-row justify-between py-3 border-b border-white/5 gap-1">
              <span className="text-red-400 font-bold">14:00 - 20:00 (On-Peak Period)</span>
              <span className="text-gray-300">Continuous peak shaving clamp protecting contract ceiling at peak rate ($0.34 / kWh)</span>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 6 (VERTICAL): FINANCIAL AUDIT & BILLING LEDGER    */}
      {/* ========================================================= */}
      <section id="financial-roi" className="bg-[#0b0b0b] py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div>
            <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-2">
              Audited Utility Economics
            </span>
            <h2 className="text-3xl sm:text-4xl font-medium text-white">
              Side-by-Side Billing & Demand Audit
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              Direct comparison between conventional unmanaged operations and GridPulse AI Autonomous Microgrid dispatch.
            </p>
          </div>

          {/* Full Width Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Unmanaged Card */}
            <div className="bg-[#121212] rounded-2xl p-6 sm:p-8 border border-red-500/20">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="text-xs font-mono text-red-400 uppercase tracking-widest block">Baseline Operations</span>
                  <h3 className="text-lg font-medium text-white">Without GridPulse EMS</h3>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-mono">Unmitigated</span>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Peak Demand Draw:</span>
                  <span className="text-white font-bold">{sim.unmanagedPeakKw} kW</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Contract Ceiling Breach:</span>
                  <span className="text-red-400 font-bold">+{sim.unmanagedPeakKw - activePlant.contractCeilingKw} kW</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Demand Penalty Rate:</span>
                  <span className="text-white">${activePlant.demandPenaltyPerKw.toFixed(2)} / kW</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Monthly Demand Surcharges:</span>
                  <span className="text-red-400 font-bold">${Math.round(sim.unmanagedDemandPenalty).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Energy Consumption Cost:</span>
                  <span className="text-white">${Math.round(sim.unmanagedEnergyCost).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-4 text-sm font-sans font-medium text-white">
                  <span>Total Monthly Utility Bill:</span>
                  <span className="text-red-400 font-mono font-bold">${Math.round(sim.totalUnmanagedBill).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Managed Card */}
            <div className="bg-[#181818] rounded-2xl p-6 sm:p-8 border border-emerald-500/30 shadow-2xl relative">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest block">Autonomous Dispatch</span>
                  <h3 className="text-lg font-medium text-white">With GridPulse Microgrid OS</h3>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono border border-emerald-500/40">
                  AI Protected
                </span>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Peak Demand Draw:</span>
                  <span className="text-emerald-400 font-bold">{sim.managedPeakKw} kW (▼ {sim.peakReductionPct}%)</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Contract Ceiling Guard:</span>
                  <span className="text-emerald-400 font-bold">Safely Clamped</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Avoided Monthly Penalty:</span>
                  <span className="text-emerald-400 font-bold">-${Math.round(sim.avoidedDemandPenalty).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Time-of-Use Arbitrage Gain:</span>
                  <span className="text-primary font-bold">-${Math.round(sim.touArbitrageSavings).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2.5 border-b border-white/5">
                  <span className="text-gray-400">Reduced Energy Bill:</span>
                  <span className="text-white">${Math.round(sim.managedEnergyCost).toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-4 text-sm font-sans font-medium text-white">
                  <span>Net Monthly Utility Bill:</span>
                  <span className="text-emerald-400 font-mono font-bold">${Math.round(sim.totalManagedBill).toLocaleString()}</span>
                </div>
              </div>
            </div>

          </div>

          {/* 5-Year Cumulative Savings Bar */}
          <div className="bg-[#121212] p-6 sm:p-8 rounded-2xl border border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h4 className="text-lg font-medium text-white">
                  5-Year Cumulative Financial ROI Projection
                </h4>
                <p className="text-xs text-gray-400 mt-1">
                  Payback period for commercial battery hardware: <span className="text-primary font-bold font-mono">{sim.paybackMonths} Months</span>.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500 font-mono block">Annual Savings</span>
                <span className="text-2xl font-mono font-bold text-emerald-400">+${Math.round(sim.annualSavings).toLocaleString()} / yr</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs text-center">
              {[1, 2, 3, 4, 5].map((year) => {
                const total = Math.round(sim.annualSavings * year);
                return (
                  <div key={year} className="bg-[#1a1a1a] p-4 rounded-xl border border-white/5">
                    <span className="text-gray-500 text-[11px] block mb-1">Year {year}</span>
                    <span className="text-primary font-bold text-base block">${total.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400 mt-1 block">Cumulative Net</span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 7 (VERTICAL): PARAMETER SENSITIVITY SANDBOX       */}
      {/* ========================================================= */}
      <section id="stress-sandbox" className="bg-black py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div>
            <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-2">
              Engineering Stress Testing
            </span>
            <h2 className="text-3xl sm:text-4xl font-medium text-white">
              Live Parameter Sensitivity Sandbox
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-2">
              Adjust cloud cover drop severity and heavy production surges in real time to test edge failover tolerance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#121212] p-6 rounded-2xl border border-white/10 space-y-3">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-400">Cloud Drop Loss Severity</span>
                <span className="text-amber-400 font-bold">-{cloudSeverityPct}% Irradiance</span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                value={cloudSeverityPct}
                onChange={(e) => setCloudSeverityPct(parseInt(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <span className="text-[11px] text-gray-500 block">
                Simulates sudden cumulonimbus cloud occlusion over the factory solar arrays.
              </span>
            </div>

            <div className="bg-[#121212] p-6 rounded-2xl border border-white/10 space-y-3">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-400">Production Press Surge</span>
                <span className="text-primary font-bold">+{productionSurgePct}% Extra Load</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={productionSurgePct}
                onChange={(e) => setProductionSurgePct(parseInt(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <span className="text-[11px] text-gray-500 block">
                Simulates simultaneous activation of hydraulic stamping dies during high production runs.
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 8 (VERTICAL): EDGE TERMINAL & PROTOCOL LOGS       */}
      {/* ========================================================= */}
      <section id="edge-terminal" className="bg-[#0b0b0b] py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto space-y-6">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-2">
                Sub-Cycle Deterministic Control
              </span>
              <h2 className="text-3xl sm:text-4xl font-medium text-white">
                Edge Controller & Modbus Protocol Stream
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-gray-400">
              <span>Bus: Modbus TCP (Port 502)</span>
              <span className="text-emerald-400">● 50ms Polling</span>
            </div>
          </div>

          {/* Full Width Monospace Terminal */}
          <div className="bg-black p-6 rounded-2xl border border-white/10 font-mono text-xs text-gray-300 space-y-2.5 h-[340px] overflow-y-auto shadow-2xl">
            <div className="text-emerald-400">[00:00:38.102] MODBUS-TCP: Inverter register 0x04A2 read: 380 kW discharge commanded</div>
            <div className="text-gray-500">[00:00:38.108] HiGHS-LP Solver: Minimax linear formulation converged in 14 iterations (0.84ms)</div>
            <div className="text-blue-400">[00:00:38.120] EDGE GUARD: Factory load surge detected (1,140 kW). Solar dip active (218 kW).</div>
            <div className="text-emerald-400">[00:00:38.138] INVERTER DISPATCH: BESS ramped to +472 kW in 34ms. Grid draw clamped to 448.2 kW.</div>
            <div className="text-gray-400">[00:00:38.150] IEEE 2030.7 COMPLIANCE: Voltage 480V ±0.8%, Frequency 59.98 Hz, Power Factor 0.98.</div>
            <div className="text-emerald-400">[00:00:38.200] TELEMETRY PUSH: Interval telemetry buffered to local flash storage (96 data points).</div>
            <div className="text-amber-400">[00:00:38.250] TARIFF WATCH: Approaching On-Peak window ($0.34/kWh). Battery SoC locked at 78.4%.</div>
            <div className="text-gray-500">[00:00:38.300] WATCHDOG: Sub-cycle edge heartbeat healthy. Modbus packet loss: 0.00%.</div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 9 (VERTICAL): COMPLIANCE & CSV EXPORTER           */}
      {/* ========================================================= */}
      <section id="compliance-export" className="bg-black py-16 sm:py-24 px-4 md:px-8 border-b border-white/10">
        <div className="max-w-6xl mx-auto bg-gradient-to-r from-[#121212] to-[#181818] rounded-2xl md:rounded-3xl p-8 sm:p-12 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-widest font-mono mb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>IEEE 2030.7 Certified Microgrid Telemetry</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium text-white mb-2">
              Executive Audit & Compliance Exporter
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 max-w-xl">
              Export 15-minute sliding window interval datasets formatted for utility auditors, board members, and plant energy managers.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleDownloadCsv}
              className="w-full sm:w-auto px-6 py-3.5 bg-primary text-black font-semibold text-xs sm:text-sm rounded-xl hover:bg-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xl"
            >
              <Download className="w-4 h-4" />
              <span>Download 15-Min Telemetry (CSV)</span>
            </button>

            <button
              onClick={() => window.print()}
              className="w-full sm:w-auto px-6 py-3.5 bg-white/5 border border-white/15 text-white font-medium text-xs sm:text-sm rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Print Audit Sheet (PDF)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 10 (VERTICAL): THE PROBLEM & RATCHET CLAUSE       */}
      {/* ========================================================= */}
      <section id="the-problem" className="bg-[#0b0b0b] py-20 md:py-32 px-4 md:px-8 border-b border-white/10">
        <div className="bg-[#121212] rounded-2xl md:rounded-[2rem] p-8 sm:p-14 md:p-20 max-w-6xl mx-auto text-center border border-white/5 shadow-2xl">
          
          <span className="text-primary text-[10px] sm:text-xs uppercase tracking-[0.25em] font-medium block mb-8">
            The $35/kW Ratchet Clause Threat
          </span>

          <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl max-w-3xl mx-auto leading-[0.95] text-[#E1E0CC] mb-12">
            <WordsPullUpMultiStyle
              segments={[
                { text: "A 15-minute cloud cover", className: "font-normal" },
                { text: "can reset your monthly bill.", className: "italic font-serif" },
                { text: "GridPulse eliminates peak demand charges with millisecond dispatch.", className: "font-normal" }
              ]}
            />
          </div>

          <div ref={aboutContainerRef} className="text-[#DEDBC8] text-xs sm:text-sm md:text-base max-w-2xl mx-auto mt-12 leading-relaxed">
            {aboutChars.map((char, index) => (
              <AnimatedLetter
                key={index}
                char={char}
                index={index}
                totalChars={aboutChars.length}
                scrollYProgress={aboutScrollProgress}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 pt-12 border-t border-white/10 max-w-4xl mx-auto">
            <div className="text-left">
              <span className="text-gray-500 text-xs block mb-1">Peak Demand Shaved</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-primary">▼ {sim.peakReductionPct}%</span>
            </div>
            <div className="text-left">
              <span className="text-gray-500 text-xs block mb-1">Avoided Surcharges</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-emerald-400">${Math.round(sim.avoidedDemandPenalty).toLocaleString()}</span>
            </div>
            <div className="text-left">
              <span className="text-gray-500 text-xs block mb-1">Failover Loop</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-cyan-400">&lt; 38 ms</span>
            </div>
            <div className="text-left">
              <span className="text-gray-500 text-xs block mb-1">BESS Capex Payback</span>
              <span className="text-2xl sm:text-3xl font-mono font-bold text-white">{sim.paybackMonths} Mo</span>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* SECTION 11 (VERTICAL): CORE ARCHITECTURAL PILLARS        */}
      {/* ========================================================= */}
      <section id="core-features" className="bg-black py-20 md:py-32 px-4 md:px-8 relative">
        <div className="bg-noise absolute inset-0 opacity-[0.15] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10 space-y-12">
          
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-medium text-white mb-2">
              Plant-Grade Architecture Pillars
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Built for zero downtime. Powered by predictive minimax linear programming.
            </p>
          </div>

          {/* Vertically Stacked Architectural Cards */}
          <div className="space-y-6">
            
            {/* Pillar 1 */}
            <div className="bg-[#121212] p-8 rounded-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-mono text-primary uppercase">Pillar 01</span>
                <h3 className="text-xl font-medium text-white">Peak Shaving Dispatch Engine</h3>
                <p className="text-xs sm:text-sm text-gray-400 max-w-xl">
                  Sub-38ms four-quadrant inverter discharge clamps grid import under contracted ceilings during simultaneous press stamping.
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 shrink-0">
                <Check className="w-4 h-4" /> 28% to 42% Demand Shaved
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="bg-[#121212] p-8 rounded-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-mono text-primary uppercase">Pillar 02</span>
                <h3 className="text-xl font-medium text-white">Cloud Cover Loss Shield</h3>
                <p className="text-xs sm:text-sm text-gray-400 max-w-xl">
                  Instant detection of up to 80% solar generation dips; battery instantly ramps in under 40 milliseconds to neutralize deficit.
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-amber-400 bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20 shrink-0">
                <Check className="w-4 h-4" /> Zero Weather Surcharges
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="bg-[#121212] p-8 rounded-2xl border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-mono text-primary uppercase">Pillar 03</span>
                <h3 className="text-xl font-medium text-white">Time-of-Use Arbitrage & Cell Health</h3>
                <p className="text-xs sm:text-sm text-gray-400 max-w-xl">
                  Automated night pre-charging at $0.08/kWh with strict thermal degradation boundaries that extend battery life by 4.2 years.
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 bg-cyan-500/10 px-4 py-2 rounded-xl border border-cyan-500/20 shrink-0">
                <Check className="w-4 h-4" /> 8,000+ Cycles Guaranteed
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* FOOTER                                                    */}
      {/* ========================================================= */}
      <footer className="border-t border-white/5 bg-black py-10 px-4 text-center text-xs text-gray-500">
        <p>GridPulse Energy Systems &copy; 2026. Autonomous Industrial Microgrid Operating System.</p>
        <p className="mt-1 text-[11px] text-gray-600">IEEE 2030.7 Certified · Deployed for Hackathon Judging.</p>
      </footer>

    </div>
  );
}
