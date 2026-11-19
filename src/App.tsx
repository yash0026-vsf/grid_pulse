import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  Search,
  Bell,
  Settings,
  Database,
  SlidersHorizontal,
  ChevronDown,
  Gauge,
  Calendar,
  Building2,
  TrendingUp,
  HelpCircle,
  ExternalLink,
  Play,
  Pause,
  Trash2,
  Edit3
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

const INITIAL_PLANTS: Record<string, PlantSpecs> = {
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
    description: "Continuous industrial ammonia chillers and blast freezers vulnerable to mid-day solar drop utility surcharges."
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
  bessPowerKw: number;
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
    let tariff = 0.08;
    if (hour >= 14 && hour < 20) {
      tariff = 0.34;
    } else if ((hour >= 6 && hour < 14) || (hour >= 20 && hour < 22)) {
      tariff = 0.16;
    }

    // 2. Solar PV Output
    let solarKw = 0;
    if (hour >= 6 && hour <= 18.5) {
      const sunAngle = Math.sin(((hour - 6.0) / 12.5) * Math.PI);
      const baseSolar = specs.solarCapacityKw * Math.pow(Math.max(0, sunAngle), 1.15);
      solarKw = baseSolar;

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
      if (hour >= 1 && hour <= 5 && currentSoc < 0.95 * specs.bessCapacityKwh) {
        const chargeRate = Math.min(specs.bessMaxPowerKw * 0.45, (0.95 * specs.bessCapacityKwh - currentSoc) / dtHours);
        bessPowerKw = -chargeRate;
        currentSoc += Math.abs(bessPowerKw) * dtHours * 0.95;
      } else if (unmanagedNetKw > specs.contractCeilingKw && currentSoc > 0.20 * specs.bessCapacityKwh) {
        const deficitKw = unmanagedNetKw - specs.contractCeilingKw;
        const availableDischarge = Math.min(specs.bessMaxPowerKw, (currentSoc - 0.20 * specs.bessCapacityKwh) / dtHours);
        bessPowerKw = Math.min(deficitKw, availableDischarge);
        currentSoc -= (bessPowerKw / 0.95) * dtHours;
      } else if (solarKw > factoryLoadKw && currentSoc < 0.95 * specs.bessCapacityKwh) {
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
// 3. BEIGE & SAGE GREEN SVG POWER FLOW CHART
// ==========================================
interface SvgChartProps {
  points: TelemetryPoint[];
  contractCeilingKw: number;
  cloudDropActive: boolean;
  selectedHourIdx: number;
  onHoverIndex: (idx: number) => void;
  height?: number;
}

function MicrogridDispatchChart({
  points,
  contractCeilingKw,
  cloudDropActive,
  selectedHourIdx,
  onHoverIndex,
  height = 360
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
      {/* Legend & Series Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[#EAE5D9] p-3.5 rounded-xl border border-[#DDD6C7]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowLoad(!showLoad)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${showLoad ? 'bg-[#FAF7F0] text-[#1A3D2B] border border-[#DDD6C7] shadow-sm' : 'text-[#7A8C81] opacity-60'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#B86B1E] inline-block" />
            <span>Factory Load ({currentPt.factoryLoadKw} kW)</span>
          </button>

          <button
            onClick={() => setShowSolar(!showSolar)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${showSolar ? 'bg-[#FAF7F0] text-[#1A3D2B] border border-[#DDD6C7] shadow-sm' : 'text-[#7A8C81] opacity-60'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A573F] inline-block" />
            <span>Solar PV ({currentPt.solarKw} kW)</span>
          </button>

          <button
            onClick={() => setShowBess(!showBess)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${showBess ? 'bg-[#FAF7F0] text-[#1A3D2B] border border-[#DDD6C7] shadow-sm' : 'text-[#7A8C81] opacity-60'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#386E52] inline-block" />
            <span>BESS Battery ({currentPt.bessPowerKw > 0 ? `+${currentPt.bessPowerKw}` : currentPt.bessPowerKw} kW)</span>
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${showGrid ? 'bg-[#FAF7F0] text-[#1A3D2B] border border-[#DDD6C7] shadow-sm' : 'text-[#7A8C81] opacity-60'}`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#1A3D2B] inline-block" />
            <span>Net Grid Draw ({currentPt.managedGridKw} kW)</span>
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#546B5D]">
          <span className="flex items-center gap-1 text-[#C86A3E] font-bold">
            <span className="w-3 h-0.5 border-t border-dashed border-[#C86A3E] inline-block" />
            Contract Limit: {contractCeilingKw} kW
          </span>
          <span className="text-[#C5BDB0]">|</span>
          <span className="font-mono text-[#1A3D2B] font-bold">Time: {currentPt.timeStr}</span>
        </div>
      </div>

      {/* SVG Canvas in Warm Beige Container */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-[#FAF7F0] border border-[#DDD6C7] shadow-sm">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none cursor-crosshair"
          onMouseMove={handleMouseMove}
        >
          <defs>
            <linearGradient id="beigeSolarGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2A573F" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2A573F" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Cloud Cover Event Highlight Zone */}
          {cloudDropActive && (
            <g>
              <rect
                x={getX(54)}
                y={paddingTop}
                width={getX(62) - getX(54)}
                height={chartH}
                fill="rgba(184, 107, 30, 0.09)"
                stroke="#B86B1E"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={(getX(54) + getX(62)) / 2}
                y={paddingTop + 16}
                fill="#B86B1E"
                fontSize="11"
                textAnchor="middle"
                fontWeight="600"
              >
                Solar Cloud Cover Window (-53%)
              </text>
            </g>
          )}

          {/* Gridlines */}
          {[0, 300, 600, 900, 1200].map((kw) => {
            const y = getY(kw);
            return (
              <g key={kw}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E8E2D5"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  fill="#7A8C81"
                  fontSize="10"
                  textAnchor="end"
                  fontFamily="monospace"
                >
                  {kw} kW
                </text>
              </g>
            );
          })}

          {/* X-Axis Hour Labels */}
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
                  stroke="#D4CDBC"
                />
                <text
                  x={x}
                  y={paddingTop + chartH + 20}
                  fill="#7A8C81"
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {String(hr).padStart(2, '0')}:00
                </text>
              </g>
            );
          })}

          {/* Contract Ceiling Line */}
          <line
            x1={paddingLeft}
            y1={getY(contractCeilingKw)}
            x2={width - paddingRight}
            y2={getY(contractCeilingKw)}
            stroke="#C86A3E"
            strokeWidth="1.8"
            strokeDasharray="6 4"
          />
          <text
            x={width - paddingRight - 8}
            y={getY(contractCeilingKw) - 6}
            fill="#C86A3E"
            fontSize="10"
            textAnchor="end"
            fontWeight="bold"
          >
            Contract Limit: {contractCeilingKw} kW
          </text>

          {/* Unmanaged Peak Spike (Red Dotted) */}
          {showGrid && (
            <path
              d={gridUnmanagedPath}
              fill="none"
              stroke="#DC2626"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.8"
            />
          )}

          {/* Solar Area & Line */}
          {showSolar && (
            <g>
              <path d={solarAreaPath} fill="url(#beigeSolarGradient)" />
              <path d={solarPath} fill="none" stroke="#2A573F" strokeWidth="2.2" />
            </g>
          )}

          {/* Factory Load Line */}
          {showLoad && (
            <path d={loadPath} fill="none" stroke="#B86B1E" strokeWidth="2" />
          )}

          {/* BESS Discharge Line */}
          {showBess && (
            <path d={bessPath} fill="none" stroke="#386E52" strokeWidth="2.2" />
          )}

          {/* Managed Grid Line */}
          {showGrid && (
            <path d={gridManagedPath} fill="none" stroke="#1A3D2B" strokeWidth="2.5" />
          )}

          {/* Active Hover Cursor */}
          {selectedHourIdx >= 0 && (
            <g>
              <line
                x1={getX(selectedHourIdx)}
                y1={paddingTop}
                x2={getX(selectedHourIdx)}
                y2={paddingTop + chartH}
                stroke="#1A3D2B"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                opacity="0.8"
              />
              {showLoad && <circle cx={getX(selectedHourIdx)} cy={getY(currentPt.factoryLoadKw)} r="4" fill="#B86B1E" />}
              {showSolar && <circle cx={getX(selectedHourIdx)} cy={getY(currentPt.solarKw)} r="4" fill="#2A573F" />}
              {showBess && <circle cx={getX(selectedHourIdx)} cy={getY(Math.max(0, currentPt.bessPowerKw))} r="4" fill="#386E52" />}
              {showGrid && <circle cx={getX(selectedHourIdx)} cy={getY(currentPt.managedGridKw)} r="5" fill="#1A3D2B" stroke="#FAF7F0" strokeWidth="1.5" />}
            </g>
          )}
        </svg>

        {/* Real-Time Telemetry HUD Overlay in Beige & Green */}
        <div className="absolute top-3 left-16 bg-[#FAF7F0]/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-[#DDD6C7] text-[11px] font-mono flex items-center gap-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[#1A3D2B] font-bold">
            <Clock className="w-3.5 h-3.5 text-[#2A573F]" />
            <span>{currentPt.timeStr}</span>
          </div>
          <div className="text-[#546B5D]">
            Tariff: <span className="text-[#1A3D2B] font-bold">${currentPt.tariff.toFixed(2)}/kWh</span>
          </div>
          <div className="text-[#546B5D]">
            Grid Import: <span className="text-[#1A3D2B] font-bold">{currentPt.managedGridKw} kW</span>
          </div>
          <div className="text-[#546B5D]">
            BESS: <span className="text-[#2A573F] font-bold">{currentPt.bessPowerKw > 0 ? `+${currentPt.bessPowerKw}` : currentPt.bessPowerKw} kW</span>
          </div>
          <div className="text-[#546B5D]">
            Battery SoC: <span className="text-[#2A573F] font-bold">{currentPt.bessSocPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. MAIN APPLICATION: GRIDPULSE ENTERPRISE
// ==========================================
export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'dispatch' | 'battery' | 'plants' | 'billing' | 'sandbox' | 'terminal' | 'exporter'>('overview');
  const [plantsState, setPlantsState] = useState<Record<string, PlantSpecs>>(INITIAL_PLANTS);
  const [selectedPlantId, setSelectedPlantId] = useState<string>('automotive');
  const [isCloudDropSimulated, setIsCloudDropSimulated] = useState(true);
  const [cloudSeverityPct, setCloudSeverityPct] = useState(53);
  const [isEdgeGuardActive, setIsEdgeGuardActive] = useState(true);
  const [productionSurgePct, setProductionSurgePct] = useState(0);
  const [scrubberIdx, setScrubberIdx] = useState(56);
  const [isTerminalPaused, setIsTerminalPaused] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "[00:00:38.102] MODBUS-TCP: Inverter register 0x04A2 read: 380 kW discharge commanded",
    "[00:00:38.108] HiGHS-LP Solver: Minimax linear formulation converged in 14 iterations (0.84ms)",
    "[00:00:38.120] EDGE GUARD: Factory load surge detected (1,140 kW). Solar dip active (218 kW).",
    "[00:00:38.138] INVERTER DISPATCH: BESS ramped to +472 kW in 34ms. Grid draw clamped to 448.2 kW.",
    "[00:00:38.150] IEEE 2030.7 COMPLIANCE: Voltage 480V ±0.8%, Frequency 59.98 Hz, Power Factor 0.98.",
    "[00:00:38.200] TELEMETRY PUSH: Interval telemetry buffered to local flash storage (96 data points).",
    "[00:00:38.250] TARIFF WATCH: Approaching On-Peak window ($0.34/kWh). Battery SoC locked at 78.4%.",
    "[00:00:38.300] WATCHDOG: Sub-cycle edge heartbeat healthy. Modbus packet loss: 0.00%."
  ]);

  const activePlant = plantsState[selectedPlantId] || plantsState.automotive;

  const sim = useMemo(() => {
    return generateMicrogridTelemetry(
      activePlant,
      isCloudDropSimulated,
      cloudSeverityPct / 100,
      isEdgeGuardActive,
      productionSurgePct
    );
  }, [activePlant, isCloudDropSimulated, cloudSeverityPct, isEdgeGuardActive, productionSurgePct]);

  useEffect(() => {
    if (isTerminalPaused) return;
    const interval = setInterval(() => {
      const ms = Math.floor(Math.random() * 900) + 100;
      const kw = Math.floor(Math.random() * 80) + 400;
      const newLog = `[00:00:${Math.floor(Date.now() / 1000) % 60}.${ms}] MODBUS-TCP: Packet polled. Inverter active: ${kw} kW discharge. Frequency: 59.98 Hz.`;
      setTerminalLogs(prev => [...prev.slice(-15), newLog]);
    }, 2800);
    return () => clearInterval(interval);
  }, [isTerminalPaused]);

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

  const handleUpdatePlantParam = (param: keyof PlantSpecs, val: number) => {
    setPlantsState(prev => ({
      ...prev,
      [selectedPlantId]: {
        ...prev[selectedPlantId],
        [param]: val
      }
    }));
  };

  return (
    <div className="min-h-screen bg-[#F4F0E6] text-[#182C20] flex font-sans antialiased selection:bg-[#D8E5DC] selection:text-[#1A3D2B]">

      {/* ========================================================= */}
      {/* 1. LEFT SIDEBAR NAVIGATION (BEIGE & FOREST GREEN)         */}
      {/* ========================================================= */}
      <aside className="w-64 bg-[#EAE5D9] border-r border-[#DDD6C7] flex flex-col justify-between shrink-0 min-h-screen sticky top-0 z-30">
        <div>
          {/* Logo & Header */}
          <div className="p-6 border-b border-[#DDD6C7] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1A3D2B] flex items-center justify-center text-[#FAF7F0] shadow-sm">
              <Zap className="w-5 h-5 text-[#D8E5DC]" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#1A3D2B]">GridPulse</h1>
              <span className="text-[10px] text-[#546B5D] font-mono block -mt-0.5">Industrial EMS OS</span>
            </div>
          </div>

          {/* Navigation Links (INTERACTIVE TAB SWITCHER) */}
          <div className="p-4 space-y-6">
            
            <div>
              <span className="px-3 text-[10px] uppercase font-bold tracking-wider text-[#7A8C81] block mb-2">
                Operations & Dispatch
              </span>
              <nav className="space-y-1">
                {[
                  { id: 'overview', label: 'Executive Overview', icon: Activity },
                  { id: 'dispatch', label: '24H Microgrid Dispatch', icon: BarChart3 },
                  { id: 'battery', label: 'BESS Battery Health', icon: Battery },
                  { id: 'plants', label: 'Plant Digital Twins', icon: Building2 }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${isActive ? 'bg-[#D8E5DC] text-[#1A3D2B] border border-[#B6CEBF] shadow-sm font-bold' : 'text-[#546B5D] hover:bg-[#DDD7C9] hover:text-[#1A3D2B]'}`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#1A3D2B]' : 'text-[#7A8C81]'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div>
              <span className="px-3 text-[10px] uppercase font-bold tracking-wider text-[#7A8C81] block mb-2">
                Audit & Control
              </span>
              <nav className="space-y-1">
                {[
                  { id: 'billing', label: 'Billing & Surcharges', icon: DollarSign },
                  { id: 'sandbox', label: 'Stress Testing Sandbox', icon: SlidersHorizontal },
                  { id: 'terminal', label: 'Edge Modbus Stream', icon: Terminal },
                  { id: 'exporter', label: 'Certified Exporter', icon: FileText }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as any)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${isActive ? 'bg-[#D8E5DC] text-[#1A3D2B] border border-[#B6CEBF] shadow-sm font-bold' : 'text-[#546B5D] hover:bg-[#DDD7C9] hover:text-[#1A3D2B]'}`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#1A3D2B]' : 'text-[#7A8C81]'}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#DDD6C7] space-y-3">
          <div className="p-3.5 rounded-xl bg-[#FAF7F0] border border-[#DDD6C7] text-xs shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold text-[#546B5D]">Edge Controller</span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-[#2A573F] font-bold">
                <span className="w-2 h-2 rounded-full bg-[#2A573F] animate-pulse" />
                ONLINE
              </span>
            </div>
            <div className="text-[11px] text-[#1A3D2B] font-mono font-medium">
              38ms Loop · Modbus TCP
            </div>
          </div>

          <div className="text-[10px] text-[#7A8C81] text-center font-mono">
            IEEE 2030.7 Standard Compliant
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MAIN WORKSPACE AREA                                    */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="h-16 bg-[#EAE5D9] border-b border-[#DDD6C7] px-6 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          
          <div className="relative w-72 sm:w-96">
            <Search className="w-4 h-4 text-[#7A8C81] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              readOnly
              value="Search telemetry registers, plant profiles, solver logs..."
              className="w-full pl-9 pr-12 py-2 bg-[#FAF7F0] border border-[#DDD6C7] rounded-xl text-xs text-[#546B5D] focus:outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#7A8C81] bg-[#EAE5D9] px-1.5 py-0.5 rounded border border-[#DDD6C7]">
              ⌘K
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCloudDropSimulated(!isCloudDropSimulated)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${isCloudDropSimulated ? 'bg-[#FDF2E9] text-[#B86B1E] border border-[#E8C29E]' : 'bg-[#FAF7F0] text-[#546B5D] border border-[#DDD6C7]'}`}
            >
              <CloudSun className="w-3.5 h-3.5" />
              <span>{isCloudDropSimulated ? 'Cloud Dip Active (-53%)' : 'Simulate Cloud Dip'}</span>
            </button>

            <button
              onClick={handleDownloadCsv}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#1A3D2B] text-[#FAF7F0] hover:bg-[#2A573F] transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <div className="w-px h-6 bg-[#DDD6C7]" />

            <div className="flex items-center gap-3 pl-1">
              <div className="w-9 h-9 rounded-full bg-[#D8E5DC] border border-[#B6CEBF] flex items-center justify-center font-bold text-xs text-[#1A3D2B]">
                YJ
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-xs font-bold text-[#1A3D2B] block leading-tight">Yash Joshi</span>
                <span className="text-[10px] text-[#546B5D] block leading-tight">Plant Energy Director</span>
              </div>
            </div>
          </div>

        </header>

        {/* Dynamic Main Dashboard Area */}
        <main className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto w-full">
          
          {/* Facility Location Badge & Header Bar */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D8E5DC] border border-[#B6CEBF] text-xs font-medium text-[#1A3D2B]">
              <Shield className="w-3.5 h-3.5 text-[#2A573F]" />
              <span>National Industrial Microgrid Control · {activePlant.name}</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1A3D2B] tracking-tight capitalize">
                  {activeTab === 'overview' && 'Executive Overview Dashboard'}
                  {activeTab === 'dispatch' && '24-Hour Microgrid Power Flow Dispatch'}
                  {activeTab === 'battery' && 'BESS Battery Health & Electrochemistry'}
                  {activeTab === 'plants' && 'Plant Digital Twins Management'}
                  {activeTab === 'billing' && 'Industrial Billing & Demand Surcharge Audit'}
                  {activeTab === 'sandbox' && 'Live Parameter Sensitivity Sandbox'}
                  {activeTab === 'terminal' && 'High-Speed Edge Controller & Modbus Stream'}
                  {activeTab === 'exporter' && 'Certified Executive Compliance Exporter'}
                </h2>
                <p className="text-xs sm:text-sm text-[#546B5D] mt-1">
                  Active Facility: <span className="font-semibold text-[#1A3D2B]">{activePlant.name}</span> · Contract Demand Ceiling: <span className="font-mono text-[#C86A3E] font-bold">{activePlant.contractCeilingKw} kW</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#7A8C81] font-medium">Digital Twin:</span>
                <select
                  value={selectedPlantId}
                  onChange={(e) => setSelectedPlantId(e.target.value)}
                  className="px-3.5 py-2 bg-[#FAF7F0] border border-[#DDD6C7] rounded-xl text-xs font-semibold text-[#1A3D2B] shadow-sm focus:outline-none cursor-pointer"
                >
                  <option value="automotive">Automotive Heavy Stamping Facility #04</option>
                  <option value="cold_storage">Cold Storage & Refrigerated Logistics</option>
                  <option value="precision_cnc">Precision CNC & Cleanroom Fab</option>
                </select>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: EXECUTIVE OVERVIEW DASHBOARD                                       */}
          {/* ========================================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              
              {/* Row of 4 KPI Cards in Beige & Forest Green */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#FAF7F0] p-5 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">Peak Demand Shaved</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#D8E5DC] text-[#1A3D2B] text-[10px] font-bold">Verified</span>
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-[#1A3D2B] font-mono tracking-tight">{sim.peakReductionPct}%</div>
                    <div className="w-full bg-[#EAE5D9] rounded-full h-2 mt-2 overflow-hidden">
                      <div className="bg-[#2A573F] h-2 rounded-full" style={{ width: `${sim.peakReductionPct}%` }} />
                    </div>
                  </div>
                  <span className="text-[11px] text-[#7A8C81] block">Clamped from {sim.unmanagedPeakKw} kW down to {sim.managedPeakKw} kW</span>
                </div>

                <div className="bg-[#FAF7F0] p-5 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">Avoided Surcharges</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#D8E5DC] text-[#1A3D2B] text-[10px] font-bold">Protected</span>
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-[#1A3D2B] font-mono tracking-tight">${Math.round(sim.avoidedDemandPenalty).toLocaleString()}</div>
                    <div className="text-xs text-[#2A573F] font-medium mt-1">Saved this 30-day billing cycle</div>
                  </div>
                  <span className="text-[11px] text-[#7A8C81] block">Insulated against $35/kW utility ratchet clause</span>
                </div>

                <div className="bg-[#FAF7F0] p-5 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">BESS State of Charge</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#D8E5DC] text-[#2A573F] text-[10px] font-bold">Active</span>
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-[#1A3D2B] font-mono tracking-tight">{sim.points[scrubberIdx]?.bessSocPct}%</div>
                    <div className="text-xs text-[#386E52] font-medium mt-1">Rated {activePlant.bessCapacityKwh} kWh · 0.42 C-Rate</div>
                  </div>
                  <span className="text-[11px] text-[#7A8C81] block">Guarded operating bounds: 20% to 95% SoC</span>
                </div>

                <div className="bg-[#FAF7F0] p-5 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">Hardware Capex Payback</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#F4E8D4] text-[#B86B1E] text-[10px] font-bold">Calculated</span>
                  </div>
                  <div>
                    <div className="text-3xl font-extrabold text-[#1A3D2B] font-mono tracking-tight">{sim.paybackMonths} Mo</div>
                    <div className="text-xs text-[#B86B1E] font-medium mt-1">${Math.round(sim.annualSavings).toLocaleString()} / yr net savings</div>
                  </div>
                  <span className="text-[11px] text-[#7A8C81] block">Based on commercial LFP installed cost</span>
                </div>
              </div>

              {/* Instantaneous Power Balance Bar */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#1A3D2B]">
                    Instantaneous Microgrid Power Balance (t = {sim.points[scrubberIdx]?.timeStr})
                  </h3>
                  <span className="text-xs font-mono text-[#2A573F] bg-[#D8E5DC] px-3 py-1 rounded-lg">
                    Solar ({sim.points[scrubberIdx]?.solarKw} kW) + BESS ({sim.points[scrubberIdx]?.bessPowerKw > 0 ? `+${sim.points[scrubberIdx]?.bessPowerKw}` : sim.points[scrubberIdx]?.bessPowerKw} kW) + Grid ({sim.points[scrubberIdx]?.managedGridKw} kW) == Load ({sim.points[scrubberIdx]?.factoryLoadKw} kW)
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7]">
                    <span className="text-xs text-[#546B5D] block mb-1">Solar PV</span>
                    <span className="text-2xl font-mono font-bold text-[#2A573F]">{sim.points[scrubberIdx]?.solarKw} kW</span>
                  </div>
                  <div className="bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7]">
                    <span className="text-xs text-[#546B5D] block mb-1">BESS Battery</span>
                    <span className="text-2xl font-mono font-bold text-[#386E52]">{sim.points[scrubberIdx]?.bessPowerKw > 0 ? `+${sim.points[scrubberIdx]?.bessPowerKw}` : sim.points[scrubberIdx]?.bessPowerKw} kW</span>
                  </div>
                  <div className="bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7]">
                    <span className="text-xs text-[#546B5D] block mb-1">Net Grid Import</span>
                    <span className="text-2xl font-mono font-bold text-[#1A3D2B]">{sim.points[scrubberIdx]?.managedGridKw} kW</span>
                  </div>
                  <div className="bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7]">
                    <span className="text-xs text-[#546B5D] block mb-1">Factory Demand</span>
                    <span className="text-2xl font-mono font-bold text-[#B86B1E]">{sim.points[scrubberIdx]?.factoryLoadKw} kW</span>
                  </div>
                </div>
              </div>

              {/* Quick 24H Dispatch Preview */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#1A3D2B]">24-Hour Dispatch Overview</h3>
                  <button onClick={() => setActiveTab('dispatch')} className="text-xs text-[#2A573F] font-bold hover:underline flex items-center gap-1 cursor-pointer">
                    <span>Open Full 24H Dispatch Cockpit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <MicrogridDispatchChart
                  points={sim.points}
                  contractCeilingKw={activePlant.contractCeilingKw}
                  cloudDropActive={isCloudDropSimulated}
                  selectedHourIdx={scrubberIdx}
                  onHoverIndex={setScrubberIdx}
                />
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: 24-HOUR MICROGRID DISPATCH & POWER FLOW ANALYSIS                   */}
          {/* ========================================================================= */}
          {activeTab === 'dispatch' && (
            <div className="space-y-8">
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#1A3D2B]">Continuous 24-Hour Power Flow Analytics</h3>
                    <p className="text-xs text-[#546B5D] mt-0.5">Scrub through the 96 fifteen-minute time-steps to audit power balance and battery dispatch.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#7A8C81]">Timeline:</span>
                    <span className="text-sm font-mono font-bold text-[#1A3D2B] bg-[#EAE5D9] px-3 py-1 rounded-lg border border-[#DDD6C7]">
                      {sim.points[scrubberIdx]?.timeStr}
                    </span>
                  </div>
                </div>

                <MicrogridDispatchChart
                  points={sim.points}
                  contractCeilingKw={activePlant.contractCeilingKw}
                  cloudDropActive={isCloudDropSimulated}
                  selectedHourIdx={scrubberIdx}
                  onHoverIndex={setScrubberIdx}
                  height={400}
                />

                <div className="flex items-center gap-4 bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7]">
                  <span className="text-xs text-[#546B5D] whitespace-nowrap flex items-center gap-1.5 font-mono">
                    <Clock className="w-3.5 h-3.5 text-[#2A573F]" />
                    Scrub Time: {sim.points[scrubberIdx]?.timeStr}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={sim.points.length - 1}
                    value={scrubberIdx}
                    onChange={(e) => setScrubberIdx(parseInt(e.target.value))}
                    className="w-full accent-[#2A573F] cursor-pointer"
                  />
                  <span className="text-[11px] font-mono text-[#546B5D] whitespace-nowrap">
                    {sim.points[scrubberIdx]?.managedGridKw} kW Clamped
                  </span>
                </div>
              </div>

              {/* 15-Minute Interval Table */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-[#1A3D2B]">15-Minute Sliding Interval Dispatch Ledger</h4>
                    <span className="text-xs text-[#546B5D]">Audited interval telemetry showing exact power balance and avoided surcharge thresholds.</span>
                  </div>
                  <button onClick={handleDownloadCsv} className="px-3.5 py-1.5 bg-[#1A3D2B] text-[#FAF7F0] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer">
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Full CSV</span>
                  </button>
                </div>

                <div className="overflow-x-auto max-h-96 border border-[#DDD6C7] rounded-xl bg-[#FAF7F0]">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-[#EAE5D9] text-[#546B5D] sticky top-0 border-b border-[#DDD6C7]">
                      <tr>
                        <th className="p-3">Time</th>
                        <th className="p-3">Tariff ($/kWh)</th>
                        <th className="p-3">Solar PV (kW)</th>
                        <th className="p-3">Factory Load (kW)</th>
                        <th className="p-3">BESS Action (kW)</th>
                        <th className="p-3">BESS SoC</th>
                        <th className="p-3">Grid Import (kW)</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EAE5D9]">
                      {sim.points.map((pt, idx) => (
                        <tr key={idx} className={idx === scrubberIdx ? 'bg-[#D8E5DC] font-bold text-[#1A3D2B]' : 'hover:bg-[#EFEAE0]'}>
                          <td className="p-3 font-semibold">{pt.timeStr}</td>
                          <td className="p-3">${pt.tariff.toFixed(2)}</td>
                          <td className="p-3 text-[#2A573F]">{pt.solarKw}</td>
                          <td className="p-3 text-[#B86B1E]">{pt.factoryLoadKw}</td>
                          <td className="p-3 text-[#386E52]">{pt.bessPowerKw > 0 ? `+${pt.bessPowerKw}` : pt.bessPowerKw}</td>
                          <td className="p-3">{pt.bessSocPct}%</td>
                          <td className="p-3 text-[#1A3D2B]">{pt.managedGridKw}</td>
                          <td className="p-3">
                            {pt.managedGridKw <= activePlant.contractCeilingKw ? (
                              <span className="px-2 py-0.5 rounded bg-[#D8E5DC] text-[#1A3D2B] text-[10px] font-bold">Clamped</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] text-[10px] font-bold">Breach</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: BESS BATTERY HEALTH & ELECTROCHEMISTRY                             */}
          {/* ========================================================================= */}
          {activeTab === 'battery' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">State of Charge (SoC)</span>
                    <Battery className="w-5 h-5 text-[#2A573F]" />
                  </div>
                  <div className="text-4xl font-extrabold text-[#2A573F] font-mono">{sim.points[scrubberIdx]?.bessSocPct}%</div>
                  <div className="w-full bg-[#EAE5D9] rounded-full h-3 overflow-hidden">
                    <div className="bg-[#2A573F] h-3 rounded-full" style={{ width: `${sim.points[scrubberIdx]?.bessSocPct}%` }} />
                  </div>
                  <div className="text-[11px] text-[#7A8C81] space-y-1">
                    <div className="flex justify-between"><span>Lower DoD Boundary:</span><span className="font-mono font-bold">20%</span></div>
                    <div className="flex justify-between"><span>Upper Reserve Ceiling:</span><span className="font-mono font-bold">95%</span></div>
                  </div>
                </div>

                <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">Inverter C-Rate</span>
                    <Zap className="w-5 h-5 text-[#386E52]" />
                  </div>
                  <div className="text-4xl font-extrabold text-[#386E52] font-mono">0.42 C</div>
                  <div className="text-xs text-[#546B5D]">Rated Power: <span className="font-mono font-bold text-[#1A3D2B]">{activePlant.bessMaxPowerKw} kW</span></div>
                  <span className="text-[11px] text-[#7A8C81] block">Sub-38ms instantaneous four-quadrant bidirectional inverter dispatch.</span>
                </div>

                <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#546B5D]">Cell Chemistry & Health</span>
                    <Shield className="w-5 h-5 text-[#1A3D2B]" />
                  </div>
                  <div className="text-4xl font-extrabold text-[#1A3D2B] font-mono">+4.2 Yrs</div>
                  <div className="text-xs text-[#546B5D]">Chemistry: <span className="font-mono font-bold text-[#1A3D2B]">LFP (Lithium Iron Phosphate)</span></div>
                  <span className="text-[11px] text-[#7A8C81] block">Thermal mitigation algorithms guarantee 8,000+ cycle degradation boundaries.</span>
                </div>
              </div>

              {/* Thermal Sensor Matrix */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <h4 className="text-base font-bold text-[#1A3D2B]">Lithium Pack Thermal Monitoring Matrix</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {['Pack 01 (Module A)', 'Pack 02 (Module B)', 'Pack 03 (Module C)', 'Pack 04 (Module D)'].map((pack, idx) => (
                    <div key={idx} className="bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7] space-y-1">
                      <span className="text-xs text-[#546B5D] block">{pack}</span>
                      <span className="text-xl font-mono font-bold text-[#2A573F]">24.{2 + idx}°C</span>
                      <span className="text-[10px] text-[#7A8C81] block">Nominal Operating Temp</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3-Tier ToU Schedule */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <h4 className="text-base font-bold text-[#1A3D2B]">Automated 3-Tier Time-of-Use Arbitrage Schedule</h4>
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3.5 rounded-xl bg-[#D8E5DC] border border-[#B6CEBF] flex flex-col sm:flex-row justify-between gap-1">
                    <span className="text-[#1A3D2B] font-bold">01:00 - 05:00 (Off-Peak Period)</span>
                    <span className="text-[#182C20]">Automated grid pre-charging at $0.08 / kWh up to 95% SoC</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F4E8D4] border border-[#E8C29E] flex flex-col sm:flex-row justify-between gap-1">
                    <span className="text-[#B86B1E] font-bold">06:00 - 14:00 (Mid-Peak Period)</span>
                    <span className="text-[#182C20]">Direct solar self-consumption with battery on active edge standby ($0.16 / kWh)</span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] flex flex-col sm:flex-row justify-between gap-1">
                    <span className="text-[#991B1B] font-bold">14:00 - 20:00 (On-Peak Period)</span>
                    <span className="text-[#182C20]">Continuous peak shaving clamp protecting contract ceiling at peak rate ($0.34 / kWh)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: PLANT DIGITAL TWINS MANAGEMENT                                     */}
          {/* ========================================================================= */}
          {activeTab === 'plants' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.values(plantsState).map((plant) => {
                  const isSelected = selectedPlantId === plant.id;
                  return (
                    <div
                      key={plant.id}
                      onClick={() => setSelectedPlantId(plant.id)}
                      className={`p-6 rounded-2xl cursor-pointer transition-all border ${isSelected ? 'bg-[#FAF7F0] border-[#2A573F] ring-2 ring-[#2A573F]/20 shadow-md' : 'bg-[#EAE5D9] border-[#DDD6C7] hover:border-[#CBD9CD]'}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] uppercase font-bold font-mono px-2.5 py-1 rounded bg-[#D8E5DC] text-[#1A3D2B]">
                          {plant.type}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-bold text-[#2A573F] flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Active
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-bold text-[#1A3D2B] mb-2">{plant.name}</h4>
                      <p className="text-xs text-[#546B5D] mb-4 leading-relaxed">{plant.description}</p>

                      <div className="space-y-2 pt-3 border-t border-[#DDD6C7] font-mono text-xs">
                        <div className="flex justify-between"><span className="text-[#7A8C81]">Base Load:</span><span className="font-bold">{plant.baselineLoadKw} kW</span></div>
                        <div className="flex justify-between"><span className="text-[#7A8C81]">Solar PV:</span><span className="font-bold text-[#2A573F]">{plant.solarCapacityKw} kWp</span></div>
                        <div className="flex justify-between"><span className="text-[#7A8C81]">BESS Storage:</span><span className="font-bold text-[#386E52]">{plant.bessCapacityKwh} kWh</span></div>
                        <div className="flex justify-between"><span className="text-[#7A8C81]">Contract Limit:</span><span className="font-bold text-[#C86A3E]">{plant.contractCeilingKw} kW</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Digital Twin Live Parameter Customizer */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-6">
                <div>
                  <h4 className="text-base font-bold text-[#1A3D2B]">Configure Active Digital Twin Parameters</h4>
                  <p className="text-xs text-[#546B5D] mt-0.5">Adjust physical microgrid parameters in real time; all simulation equations recalculate instantly.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#546B5D] block">Baseline Plant Load (kW)</label>
                    <input
                      type="number"
                      value={activePlant.baselineLoadKw}
                      onChange={(e) => handleUpdatePlantParam('baselineLoadKw', parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 bg-[#EAE5D9] border border-[#DDD6C7] rounded-xl text-sm font-mono font-bold text-[#1A3D2B]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#546B5D] block">Solar Array Capacity (kWp)</label>
                    <input
                      type="number"
                      value={activePlant.solarCapacityKw}
                      onChange={(e) => handleUpdatePlantParam('solarCapacityKw', parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 bg-[#EAE5D9] border border-[#DDD6C7] rounded-xl text-sm font-mono font-bold text-[#2A573F]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#546B5D] block">BESS Usable Capacity (kWh)</label>
                    <input
                      type="number"
                      value={activePlant.bessCapacityKwh}
                      onChange={(e) => handleUpdatePlantParam('bessCapacityKwh', parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 bg-[#EAE5D9] border border-[#DDD6C7] rounded-xl text-sm font-mono font-bold text-[#386E52]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#546B5D] block">Contract Demand Ceiling (kW)</label>
                    <input
                      type="number"
                      value={activePlant.contractCeilingKw}
                      onChange={(e) => handleUpdatePlantParam('contractCeilingKw', parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 bg-[#EAE5D9] border border-[#DDD6C7] rounded-xl text-sm font-mono font-bold text-[#C86A3E]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: BILLING & SURCHARGES AUDIT                                         */}
          {/* ========================================================================= */}
          {activeTab === 'billing' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Unmanaged Card */}
                <div className="bg-[#FAF7F0] rounded-2xl p-6 border border-[#DDD6C7] space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[#1A3D2B]">Baseline Operations (Without EMS)</h4>
                    <span className="px-2 py-0.5 rounded bg-[#FEE2E2] text-[#991B1B] text-[10px] font-bold">Unmitigated</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Peak Demand Draw:</span>
                      <span className="text-[#1A3D2B] font-bold">{sim.unmanagedPeakKw} kW</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Contract Limit Breach:</span>
                      <span className="text-[#DC2626] font-bold">+{sim.unmanagedPeakKw - activePlant.contractCeilingKw} kW</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Demand Surcharges:</span>
                      <span className="text-[#DC2626] font-bold">${Math.round(sim.unmanagedDemandPenalty).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Energy Usage Cost:</span>
                      <span className="text-[#1A3D2B]">${Math.round(sim.unmanagedEnergyCost).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-3 text-sm font-sans font-bold text-[#1A3D2B]">
                      <span>Total Monthly Bill:</span>
                      <span className="text-[#DC2626] font-mono">${Math.round(sim.totalUnmanagedBill).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Managed Card */}
                <div className="bg-[#FAF7F0] rounded-2xl p-6 border border-[#B6CEBF] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[#1A3D2B]">GridPulse AI Microgrid Operations</h4>
                    <span className="px-2 py-0.5 rounded bg-[#D8E5DC] text-[#1A3D2B] text-[10px] font-bold">AI Protected</span>
                  </div>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Peak Demand Draw:</span>
                      <span className="text-[#2A573F] font-bold">{sim.managedPeakKw} kW (▼ {sim.peakReductionPct}%)</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Contract Limit Status:</span>
                      <span className="text-[#2A573F] font-bold">Safely Clamped</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">Avoided Surcharges:</span>
                      <span className="text-[#2A573F] font-bold">-${Math.round(sim.avoidedDemandPenalty).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[#DDD6C7]">
                      <span className="text-[#546B5D]">ToU Night Shift Arbitrage:</span>
                      <span className="text-[#2A573F] font-bold">-${Math.round(sim.touArbitrageSavings).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-3 text-sm font-sans font-bold text-[#1A3D2B]">
                      <span>Net Monthly Bill:</span>
                      <span className="text-[#2A573F] font-mono">${Math.round(sim.totalManagedBill).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* 5-Year Cumulative ROI Projection */}
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-base font-bold text-[#1A3D2B]">5-Year Cumulative Financial ROI Projection</h4>
                  <span className="text-xs font-mono text-[#2A573F] font-bold">Net Annual Benefit: +${Math.round(sim.annualSavings).toLocaleString()} / yr</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs text-center">
                  {[1, 2, 3, 4, 5].map((year) => {
                    const saved = Math.round(sim.annualSavings * year);
                    return (
                      <div key={year} className="bg-[#EAE5D9] p-4 rounded-xl border border-[#DDD6C7]">
                        <span className="text-[#7A8C81] text-[10px] block mb-1">Year {year}</span>
                        <span className="text-[#1A3D2B] font-bold text-base block">${saved.toLocaleString()}</span>
                        <span className="text-[10px] text-[#2A573F] block mt-0.5">Cumulative Net</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 6: STRESS TESTING SANDBOX                                             */}
          {/* ========================================================================= */}
          {activeTab === 'sandbox' && (
            <div className="space-y-8">
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-[#1A3D2B]">Live Engineering Sensitivity Sandbox</h3>
                  <p className="text-xs text-[#546B5D] mt-0.5">Adjust environmental and manufacturing stress conditions to observe instantaneous inverter failover reaction.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#EAE5D9] p-5 rounded-2xl border border-[#DDD6C7] space-y-3">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-[#546B5D] font-semibold">Cloud Cover Dip Loss</span>
                      <span className="text-[#B86B1E] font-bold">-{cloudSeverityPct}% Irradiance</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      value={cloudSeverityPct}
                      onChange={(e) => setCloudSeverityPct(parseInt(e.target.value))}
                      className="w-full accent-[#2A573F] cursor-pointer"
                    />
                    <span className="text-[11px] text-[#7A8C81] block">Simulates sudden solar loss during high manufacturing shifts.</span>
                  </div>

                  <div className="bg-[#EAE5D9] p-5 rounded-2xl border border-[#DDD6C7] space-y-3">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-[#546B5D] font-semibold">Production Press Surge</span>
                      <span className="text-[#1A3D2B] font-bold">+{productionSurgePct}% Extra Load</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={productionSurgePct}
                      onChange={(e) => setProductionSurgePct(parseInt(e.target.value))}
                      className="w-full accent-[#2A573F] cursor-pointer"
                    />
                    <span className="text-[11px] text-[#7A8C81] block">Simulates simultaneous hydraulic stamping cycles.</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#D8E5DC] border border-[#B6CEBF] flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-[#1A3D2B] block">Active Stress Tolerance Assessment</span>
                    <span className="text-xs text-[#2A573F]">Edge controller clamps grid draw within 38 milliseconds. Zero contract violations recorded.</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-xs text-[#546B5D] block">Avoided Annual Loss</span>
                    <span className="text-xl font-bold text-[#2A573F]">${Math.round(sim.annualSavings).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 7: EDGE MODBUS TERMINAL STREAM                                        */}
          {/* ========================================================================= */}
          {activeTab === 'terminal' && (
            <div className="space-y-6">
              <div className="bg-[#FAF7F0] p-6 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-[#1A3D2B]">High-Speed Modbus TCP & HiGHS LP Solver Stream</h3>
                    <p className="text-xs text-[#546B5D] mt-0.5">Continuous 50ms register polling loop maintaining sub-cycle power equilibrium.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsTerminalPaused(!isTerminalPaused)}
                      className="px-3 py-1.5 bg-[#EAE5D9] border border-[#DDD6C7] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isTerminalPaused ? <Play className="w-3.5 h-3.5 text-[#2A573F]" /> : <Pause className="w-3.5 h-3.5 text-[#B86B1E]" />}
                      <span>{isTerminalPaused ? 'Resume Stream' : 'Pause Stream'}</span>
                    </button>
                    <button
                      onClick={() => setTerminalLogs([])}
                      className="px-3 py-1.5 bg-[#EAE5D9] border border-[#DDD6C7] rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-[#7A8C81]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                <div className="bg-[#182C20] p-5 rounded-2xl font-mono text-xs text-[#D8E5DC] space-y-2 h-[420px] overflow-y-auto shadow-inner">
                  {terminalLogs.map((log, i) => (
                    <div key={i} className="leading-relaxed">
                      {log.includes('MODBUS') && <span className="text-[#A3E635]">{log}</span>}
                      {log.includes('HiGHS') && <span className="text-[#9CA3AF]">{log}</span>}
                      {log.includes('EDGE GUARD') && <span className="text-[#60A5FA]">{log}</span>}
                      {log.includes('INVERTER') && <span className="text-[#A3E635]">{log}</span>}
                      {log.includes('TARIFF') && <span className="text-[#FBBF24]">{log}</span>}
                      {!log.includes('MODBUS') && !log.includes('HiGHS') && !log.includes('EDGE GUARD') && !log.includes('INVERTER') && !log.includes('TARIFF') && (
                        <span>{log}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 8: CERTIFIED EXPORTER                                                 */}
          {/* ========================================================================= */}
          {activeTab === 'exporter' && (
            <div className="space-y-8">
              <div className="bg-[#1A3D2B] text-[#FAF7F0] p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-md">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[#A3E635] text-xs font-mono uppercase tracking-wider">
                    <Shield className="w-4 h-4 text-[#A3E635]" />
                    <span>Official Compliance Exporter</span>
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight">Certified Microgrid Telemetry Exporter</h3>
                  <p className="text-xs sm:text-sm text-[#D8E5DC] max-w-xl">
                    Generate signed 15-minute sliding window datasets formatted for utility auditors, board presentations, and IEEE 2030.7 reviews.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  <button
                    onClick={handleDownloadCsv}
                    className="w-full sm:w-auto px-6 py-3.5 bg-[#FAF7F0] text-[#1A3D2B] font-bold text-xs sm:text-sm rounded-xl hover:bg-[#EAE5D9] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Download className="w-4 h-4 text-[#1A3D2B]" />
                    <span>Download 15-Min CSV</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="w-full sm:w-auto px-6 py-3.5 bg-[#2A573F] text-[#FAF7F0] font-semibold text-xs sm:text-sm rounded-xl hover:bg-[#386E52] transition-all flex items-center justify-center gap-2 cursor-pointer border border-[#3A6E55]"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Print Audit Sheet</span>
                  </button>
                </div>
              </div>

              {/* Document Preview Card */}
              <div className="bg-[#FAF7F0] p-6 sm:p-8 rounded-2xl border border-[#DDD6C7] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#DDD6C7] pb-4">
                  <div>
                    <h4 className="text-base font-bold text-[#1A3D2B]">Executive Compliance Report Preview</h4>
                    <span className="text-xs text-[#546B5D]">Verification ID: GP-SCADA-2026-IEEE7-04</span>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#D8E5DC] text-[#1A3D2B] text-xs font-bold">
                    Official Audit Signed
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs pt-2">
                  <div><span className="text-[#7A8C81] block">Facility:</span><span className="font-bold text-[#1A3D2B]">{activePlant.name}</span></div>
                  <div><span className="text-[#7A8C81] block">Baseline Peak:</span><span className="font-bold text-[#DC2626]">{sim.unmanagedPeakKw} kW</span></div>
                  <div><span className="text-[#7A8C81] block">Clamped Peak:</span><span className="font-bold text-[#2A573F]">{sim.managedPeakKw} kW (▼ {sim.peakReductionPct}%)</span></div>
                  <div><span className="text-[#7A8C81] block">Avoided Penalty:</span><span className="font-bold text-[#2A573F]">${Math.round(sim.avoidedDemandPenalty).toLocaleString()}</span></div>
                </div>
              </div>
            </div>
          )}

        </main>

        {/* Global Dashboard Footer */}
        <footer className="mt-auto py-6 border-t border-[#DDD6C7] px-8 text-center text-xs text-[#7A8C81] bg-[#EAE5D9]">
          GridPulse Industrial Energy Management Systems &copy; 2026. IEEE 2030.7 Microgrid Standard Compliant.
        </footer>

      </div>

    </div>
  );
}
