import CoolProp.CoolProp as CP
import numpy as np
import math

def mass_from_volume_temperature_pressure(volume: float, temperature: float, pressure: float, fluid: str):
    density = CP.PropsSI("D", "T", temperature, "P", pressure, fluid)
    return volume * density

def volume_from_mass_temperature_pressure(mass: float, temperature: float, pressure: float, fluid: str):
    density = CP.PropsSI("D", "T", temperature, "P", pressure, fluid)
    return mass / density

def sum(summand1: float, summand2: float, summand3: float, summand4: float):
    return summand1 + summand2 + summand3 + summand4


def delta_v(specific_impulse: float, mass_wet: float, mass_burnable: float):
    gravity = 9.81
    return specific_impulse * gravity * np.log(mass_wet / (mass_wet - mass_burnable))

def tank_structure_mass(volume: float, radius: float, yield_strength: float, pressure: float, temperature: float, fluid: str):
    """
    Estimates the structural mass of a pill-shaped pressure vessel.
    All inputs must be in standard SI units (Pascals, cubic meters, meters, kg/m^3).
    """
    density = CP.PropsSI("D", "T", temperature, "P", pressure, fluid)
    safety_factor=1.5
    non_ideal_multiplier=1.2
    sphere_volume = (4/3) * math.pi * radius**3
    if volume < sphere_volume:
        raise ValueError("Volume is too small for the given radius. Tank cannot be shorter than a sphere.")
    stress_term = (pressure * density * safety_factor) / yield_strength
    geometry_term = (2 * volume) - ((2/3) * math.pi * radius**3)
    ideal_mass = stress_term * geometry_term
    estimated_actual_mass = ideal_mass * non_ideal_multiplier
    return estimated_actual_mass

def quotient(dividend: float, divisor: float):
    return dividend / divisor

def product(factor1: float, factor2: float, factor3: float, factor4: float):
    return factor1 * factor2 * factor3 * factor4

def difference(minuend: float, subtrahend1: float, subtrahend2: float, subtrahend3: float):
    return minuend - subtrahend1 - subtrahend2 - subtrahend3

mass_wet = 44148
mass_burnable = 42706
print(350 * 9.81 * np.log(mass_wet / (mass_wet - mass_burnable)))