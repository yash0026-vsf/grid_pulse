"""
GridPulse - Microgrid Physics & Industrial Digital Twin Engine
Models industrial factory loads (automotive stamping plant), rooftop solar PV dynamics,
battery energy storage system (BESS) electrochemistry, and utility tariff structures.
"""   

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional


@dataclass
class PlantSpecs:
    name: str = "Automotive Heavy Stamping Facility #04"
    baseline_load_kw: float = 800.0
    press_spike_kw: float = 350.0
    solar_capacity_kw: float = 500.0
    bess_capacity_kwh: float = 1000.0  # 1 MWh
    bess_max_power_kw: float = 500.0   # 0.5C rate inverter
    bess_min_soc: float = 0.20         # 20% DoD protection
    bess_max_soc: float = 0.95         # 95% max cell health limit
    bess_efficiency: float = 0.92      # Round-trip charge/discharge efficiency
    grid_contract_kw: float = 450.0    # Peak demand contract threshold
    demand_penalty_per_kw: float = 35.0 # $35/kW/month for exceeding contract threshold
    battery_degradation_per_kwh: float = 0.025 # $0.025/kWh throughput cell wear cost


PRESET_FACILITIES: Dict[str, PlantSpecs] = {
    "Automotive Heavy Stamping Facility #04": PlantSpecs(
        name="Automotive Heavy Stamping Facility #04",
        baseline_load_kw=800.0,
        press_spike_kw=350.0,
        solar_capacity_kw=500.0,
        bess_capacity_kwh=1000.0,
        bess_max_power_kw=500.0,
        grid_contract_kw=450.0,
        demand_penalty_per_kw=35.0
    ),
    "Cold Storage & Refrigerated Logistics": PlantSpecs(
        name="Cold Storage & Refrigerated Logistics",
        baseline_load_kw=600.0,
        press_spike_kw=180.0,
        solar_capacity_kw=400.0,
        bess_capacity_kwh=800.0,
        bess_max_power_kw=400.0,
        grid_contract_kw=380.0,
        demand_penalty_per_kw=30.0
    ),
    "Precision CNC & Cleanroom Fab": PlantSpecs(
        name="Precision CNC & Cleanroom Fab",
        baseline_load_kw=1200.0,
        press_spike_kw=250.0,
        solar_capacity_kw=750.0,
        bess_capacity_kwh=1500.0,
        bess_max_power_kw=750.0,
        grid_contract_kw=650.0,
        demand_penalty_per_kw=40.0
    )
}


class MicrogridSimulation:
    def __init__(self, specs: Optional[PlantSpecs] = None):
        self.specs = specs or PlantSpecs()

    def get_tou_tariff(self, hour: float) -> float:
        """
        Industrial Time-of-Use (ToU) energy rate ($/kWh):
        - Off-Peak (22:00 - 06:00): $0.08 / kWh
        - Mid-Peak (06:00 - 14:00, 20:00 - 22:00): $0.16 / kWh
        - On-Peak (14:00 - 20:00): $0.34 / kWh
        """
        h = hour % 24
        if 14 <= h < 20:
            return 0.34  # On-Peak
        elif (6 <= h < 14) or (20 <= h < 22):
            return 0.16  # Mid-Peak
        else:
            return 0.08  # Off-Peak

    def generate_24h_profiles(
        self,
        time_step_mins: int = 15,
        trigger_cloud_drop: bool = True,
        cloud_drop_start_hour: float = 13.5,
        cloud_drop_duration_hours: float = 2.0,
        cloud_drop_severity: float = 0.53,  # 53% drop in irradiance
        random_seed: int = 42
    ) -> pd.DataFrame:
        """
        Generates realistic 24-hour time series for:
        - Factory manufacturing load (baseline + motor presses + shift changes)
        - Solar PV generation (sun angle curve + cloud noise)
        - Time-of-Use electricity tariffs
        """
        np.random.seed(random_seed)
        n_steps = int(24 * 60 / time_step_mins)
        dt_hours = time_step_mins / 60.0

        times = [i * dt_hours for i in range(n_steps)]
        solar_gen = []
        factory_load = []
        tariffs = []

        for t in times:
            # 1. Tariff profile
            tariffs.append(self.get_tou_tariff(t))

            # 2. Solar Generation profile (bell curve centered at 12:30)
            if 6.0 <= t <= 18.5:
                # Solar elevation angle factor
                sun_factor = np.sin((t - 6.0) / 12.5 * np.pi)
                sun_factor = max(0.0, sun_factor) ** 1.15
                base_solar = self.specs.solar_capacity_kw * sun_factor
                
                # Ambient irradiance noise (+- 5%)
                noise = np.random.normal(0, 0.03 * self.specs.solar_capacity_kw)
                pv_power = max(0.0, base_solar + noise)

                # Sudden Cloud Event
                if trigger_cloud_drop and (cloud_drop_start_hour <= t < (cloud_drop_start_hour + cloud_drop_duration_hours)):
                    pv_power *= (1.0 - cloud_drop_severity)
            else:
                pv_power = 0.0
            solar_gen.append(pv_power)

            # 3. Factory Load Profile
            # Shift 1 (08:00 - 16:30): Heavy production, frequent stamping press surges
            # Shift 2 (16:30 - 00:30): Medium assembly & finishing
            # Night Shift (00:30 - 08:00): Baseload maintenance & HVAC
            if 8.0 <= t < 16.5:
                base = self.specs.baseline_load_kw
                # Periodic heavy hydraulic stamping press cycles
                stamping_active = 1.0 if (int(t * 4) % 3 == 0) else 0.35
                press_spike = self.specs.press_spike_kw * stamping_active
                noise = np.random.normal(0, 25.0)
                load = base + press_spike + noise
            elif 16.5 <= t < 24.0:
                base = self.specs.baseline_load_kw * 0.75
                press_spike = self.specs.press_spike_kw * 0.3 if (int(t * 4) % 4 == 0) else 0.0
                noise = np.random.normal(0, 20.0)
                load = base + press_spike + noise
            else:
                # Night baseload
                load = self.specs.baseline_load_kw * 0.45 + np.random.normal(0, 15.0)

            factory_load.append(max(200.0, load))

        df = pd.DataFrame({
            "hour": times,
            "tariff_usd_kwh": tariffs,
            "solar_kw": solar_gen,
            "factory_load_kw": factory_load,
            "net_unmanaged_demand_kw": np.array(factory_load) - np.array(solar_gen)
        })

        return df

    def calculate_utility_bill(
        self,
        grid_draw_kw: np.ndarray,
        tariffs: np.ndarray,
        dt_hours: float = 0.25
    ) -> Dict[str, float]:
        """
        Calculates commercial/industrial electric utility bill:
        1. Energy Charges: sum(Grid_draw * Tariff * dt)
        2. Peak Demand Charge: Max 15-min average kW drawn above contract threshold * $35/kW
        """
        # Ensure positive grid draw (import)
        grid_import_kw = np.maximum(0.0, grid_draw_kw)
        
        # Energy charge ($)
        energy_cost = np.sum(grid_import_kw * tariffs * dt_hours)

        # Peak Demand ($)
        peak_demand_kw = float(np.max(grid_import_kw))
        excess_kw = max(0.0, peak_demand_kw - self.specs.grid_contract_kw)
        demand_penalty = excess_kw * self.specs.demand_penalty_per_kw

        total_bill = energy_cost + demand_penalty

        return {
            "energy_cost_usd": float(energy_cost),
            "peak_demand_kw": float(peak_demand_kw),
            "contract_threshold_kw": float(self.specs.grid_contract_kw),
            "excess_peak_kw": float(excess_kw),
            "demand_penalty_usd": float(demand_penalty),
            "total_utility_bill_usd": float(total_bill)
        }
