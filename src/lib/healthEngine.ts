import type { VitalsReading } from '../services/wearable/ble.service';

export type VitalStatus = 'normal' | 'elevated' | 'critical' | 'degraded' | 'unknown';
export type VitalType = 'heart_rate' | 'spo2' | 'bp_systolic' | 'bp_diastolic' | 'temperature' | 'steps';

export interface VitalAnalysis {
  status: VitalStatus;
  value: number | null;
  unit: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export interface HealthAnalysis {
  timestamp: number;
  overall: VitalStatus;
  vitals: Record<VitalType, VitalAnalysis>;
  anomalyCount: number;
  isEmergency: boolean;
  emergencyType?: string;
  confidence: ConfidenceScore;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface ConfidenceScore {
  overall: number;
  level: ConfidenceLevel;
  sensorReliability: number;
  temporalFreshness: number;
  artifactScore: number;
  isStale: boolean;
  reasons: string[];
}

export interface VitalReadingWithMeta extends VitalsReading {
  signalStrength?: number;
  hasMotionArtifact?: boolean;
  batteryLevel?: number;
  is_simulated?: boolean;
}

export function computeConfidenceScore(reading: VitalReadingWithMeta): ConfidenceScore {
  const reasons: string[] = [];
  let sensorReliability = 100;
  let temporalFreshness = 100;
  let artifactScore = 100;

  if (reading.batteryLevel != null && reading.batteryLevel < 20) {
    sensorReliability -= 30;
    reasons.push('Low battery may affect sensor accuracy');
  } else if (reading.batteryLevel != null && reading.batteryLevel < 40) {
    sensorReliability -= 10;
  }

  if (reading.signalStrength != null) {
    if (reading.signalStrength < -70) {
      sensorReliability -= 30;
      reasons.push('Weak BLE signal may cause data gaps');
    } else if (reading.signalStrength < -50) {
      sensorReliability -= 10;
    }
  }

  if (reading.is_simulated ?? false) {
    sensorReliability -= 20;
    reasons.push('Simulated data — production confidence reduced');
  }

  sensorReliability = Math.max(0, sensorReliability);

  const now = Date.now();
  const age = reading.timestamp ? now - reading.timestamp : Infinity;

  if (age === Infinity || !reading.timestamp) {
    temporalFreshness = 0;
    reasons.push('Missing timestamp — data age unknown');
  } else if (age > 30 * 60 * 1000) {
    temporalFreshness = 0;
    reasons.push('Reading is stale (>30 min old)');
  } else if (age > 15 * 60 * 1000) {
    temporalFreshness = 30;
    reasons.push('Reading is older than 15 minutes');
  } else if (age > 5 * 60 * 1000) {
    temporalFreshness = 70;
    reasons.push('Reading is moderately fresh');
  }

  if (reading.hasMotionArtifact) {
    artifactScore -= 50;
    reasons.push('Motion artifact detected during measurement');
  }

  if (reading.heart_rate != null) {
    if (reading.heart_rate < 30 || reading.heart_rate > 220) {
      artifactScore -= 40;
      reasons.push('Heart rate outside physiologically plausible range');
    }
  }

  if (reading.oxygen_saturation != null) {
    if (reading.oxygen_saturation < 50 || reading.oxygen_saturation > 100) {
      artifactScore -= 40;
      reasons.push('SpO2 value outside valid range');
    }
  }

  artifactScore = Math.max(0, artifactScore);

  const overall = Math.round(
    sensorReliability * 0.25 +
    temporalFreshness * 0.40 +
    artifactScore * 0.35
  );

  const level: ConfidenceLevel =
    overall >= 80 ? 'high' :
    overall >= 50 ? 'medium' :
    overall >= 20 ? 'low' : 'unknown';

  const isStale = age > 15 * 60 * 1000 || age === Infinity || !reading.timestamp;

  return { overall, level, sensorReliability, temporalFreshness, artifactScore, isStale, reasons };
}

export interface EmergencyCheck {
  shouldAlert: boolean;
  threshold: number;
  currentValue: number;
  adjustedForConfidence: boolean;
  reason: string;
}

export function checkEmergencyThreshold(
  type: VitalType,
  value: number | null,
  confidence: ConfidenceScore,
): EmergencyCheck | null {
  if (value == null) return null;

  const thresh = THRESHOLDS[type];
  if (!thresh || !('critical' in thresh)) return null;

  const criticalThreshold = (thresh as { critical: number }).critical;
  const shouldAlert = value >= criticalThreshold;
  const adjustedForConfidence = confidence.level === 'low' || confidence.level === 'unknown';

  const reason = adjustedForConfidence
    ? `Threshold crossed but low confidence (${confidence.overall}%) — requiring verification`
    : `Emergency threshold breached: ${value} (limit: ${criticalThreshold})`;

  return { shouldAlert, threshold: criticalThreshold, currentValue: value, adjustedForConfidence, reason };
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high': return '#10B981';
    case 'medium': return '#F59E0B';
    case 'low': return '#EF4444';
    default: return '#94A3B8';
  }
}

export function getConfidenceLabel(level: ConfidenceLevel, isAr = false): string {
  switch (level) {
    case 'high': return isAr ? 'عالية' : 'High';
    case 'medium': return isAr ? 'متوسطة' : 'Medium';
    case 'low': return isAr ? 'منخفضة' : 'Low';
    default: return isAr ? 'غير معروفة' : 'Unknown';
  }
}

const THRESHOLDS = {
  heart_rate: {
    normal: { min: 60, max: 100 },
    elevated: { min: 100, max: 130 },
    critical: 140,
    degradedBelow: 50,
    unit: 'bpm',
  },
  spo2: {
    normal: { min: 95 },
    elevated: { min: 90, max: 95 },
    critical: 90,
    degradedBelow: 94,
    unit: '%',
  },
  bp_systolic: {
    normal: { min: 90, max: 130 },
    elevated: { min: 130, max: 140 },
    critical: 140,
    degradedBelow: 85,
    unit: 'mmHg',
  },
  bp_diastolic: {
    normal: { min: 60, max: 85 },
    elevated: { min: 85, max: 90 },
    critical: 90,
    degradedBelow: 55,
    unit: 'mmHg',
  },
  temperature: {
    normal: { min: 36.0, max: 37.5 },
    elevated: { min: 37.5, max: 38.5 },
    critical: 39.0,
    degradedBelow: 35.5,
    unit: '°C',
  },
  steps: {
    dailyGoal: 10000,
    minHealthy: 5000,
    unit: 'steps',
  },
} as const;

interface AnomalyState {
  count: number;
  startedAt: number | null;
  status: VitalStatus;
}

const anomalyHistory = new Map<VitalType, AnomalyState>();

function trackAnomaly(type: VitalType, status: VitalStatus): boolean {
  const current = anomalyHistory.get(type) ?? { count: 0, startedAt: null, status: 'normal' as VitalStatus };

  if (status === 'critical' || status === 'elevated') {
    anomalyHistory.set(type, {
      count: current.count + 1,
      startedAt: current.startedAt ?? Date.now(),
      status,
    });
    return true;
  } else {
    anomalyHistory.delete(type);
    return false;
  }
}

export function getAnomalyCount(type: VitalType): number {
  return anomalyHistory.get(type)?.count ?? 0;
}

export function getAnomalyDuration(type: VitalType): number | null {
  return anomalyHistory.get(type)?.startedAt
    ? Date.now() - anomalyHistory.get(type)!.startedAt!
    : null;
}

function analyzeHeartRate(hr: number | null): VitalAnalysis {
  if (hr == null) return makeUnknown('heart_rate', 'bpm');
  const t = THRESHOLDS.heart_rate;

  let status: VitalStatus;
  let severity: VitalAnalysis['severity'];
  let message: string;

  if (hr >= t.critical || hr <= t.degradedBelow) {
    status = 'critical';
    severity = 'critical';
    message = hr >= t.critical
      ? `Heart rate critically elevated: ${hr} bpm`
      : `Heart rate critically low: ${hr} bpm`;
  } else if (hr >= t.elevated.min || hr <= t.elevated.min - 15) {
    status = 'elevated';
    severity = 'medium';
    message = hr >= t.elevated.min
      ? `Heart rate elevated: ${hr} bpm`
      : `Heart rate low: ${hr} bpm`;
  } else {
    status = 'normal';
    severity = 'low';
    message = `Heart rate within normal range: ${hr} bpm`;
  }

  trackAnomaly('heart_rate', status);
  return { status, value: hr, unit: t.unit, threshold: t.critical, severity, message };
}

function analyzeSpO2(spo2: number | null): VitalAnalysis {
  if (spo2 == null) return makeUnknown('spo2', '%');
  const t = THRESHOLDS.spo2;

  let status: VitalStatus;
  let severity: VitalAnalysis['severity'];
  let message: string;

  if (spo2 <= t.critical) {
    status = 'critical';
    severity = 'critical';
    message = `Oxygen saturation critically low: ${spo2}% — seek immediate care`;
  } else if (spo2 <= t.elevated.min) {
    status = 'elevated';
    severity = 'medium';
    message = `Oxygen saturation below normal: ${spo2}%`;
  } else if (spo2 >= t.normal.min) {
    status = 'normal';
    severity = 'low';
    message = `Oxygen saturation excellent: ${spo2}%`;
  } else {
    status = 'degraded';
    severity = 'low';
    message = `Oxygen saturation borderline: ${spo2}%`;
  }

  trackAnomaly('spo2', status);
  return { status, value: spo2, unit: t.unit, threshold: t.critical, severity, message };
}

function analyzeBloodPressure(sys: number | null, dia: number | null): Record<'systolic' | 'diastolic', VitalAnalysis> {
  const systolic = sys != null ? analyzeBpValue(sys, 'bp_systolic') : makeUnknown('bp_systolic', 'mmHg');
  const diastolic = dia != null ? analyzeBpValue(dia, 'bp_diastolic') : makeUnknown('bp_diastolic', 'mmHg');

  function analyzeBpValue(val: number, type: 'bp_systolic' | 'bp_diastolic'): VitalAnalysis {
    const t = THRESHOLDS[type];
    if (val >= t.critical) return { status: 'critical', value: val, unit: t.unit, threshold: t.critical, severity: 'critical', message: `Blood pressure critical: ${val} ${t.unit}` };
    if (val >= t.elevated.min) return { status: 'elevated', value: val, unit: t.unit, threshold: t.critical, severity: 'medium', message: `Blood pressure elevated: ${val} ${t.unit}` };
    if (val <= t.degradedBelow) return { status: 'degraded', value: val, unit: t.unit, threshold: t.critical, severity: 'medium', message: `Blood pressure low: ${val} ${t.unit}` };
    return { status: 'normal', value: val, unit: t.unit, threshold: t.critical, severity: 'low', message: `Blood pressure normal: ${val} ${t.unit}` };
  }

  return { systolic, diastolic };
}

function analyzeTemperature(temp: number | null): VitalAnalysis {
  if (temp == null) return makeUnknown('temperature', '°C');
  const t = THRESHOLDS.temperature;

  if (temp >= t.critical) return { status: 'critical', value: temp, unit: t.unit, threshold: t.critical, severity: 'critical', message: `Temperature critically high: ${temp.toFixed(1)}°C` };
  if (temp >= t.elevated.min) return { status: 'elevated', value: temp, unit: t.unit, threshold: t.critical, severity: 'medium', message: `Temperature elevated: ${temp.toFixed(1)}°C` };
  if (temp <= t.degradedBelow) return { status: 'degraded', value: temp, unit: t.unit, threshold: t.critical, severity: 'medium', message: `Temperature below normal: ${temp.toFixed(1)}°C` };
  return { status: 'normal', value: temp, unit: t.unit, threshold: t.critical, severity: 'low', message: `Temperature normal: ${temp.toFixed(1)}°C` };
}

function analyzeSteps(steps: number | null): VitalAnalysis {
  if (steps == null) return makeUnknown('steps', 'steps');
  const t = THRESHOLDS.steps;

  if (steps >= t.dailyGoal) return { status: 'normal', value: steps, unit: t.unit, threshold: t.dailyGoal, severity: 'low', message: `Activity goal achieved: ${steps.toLocaleString()} steps` };
  if (steps >= t.minHealthy) return { status: 'elevated', value: steps, unit: t.unit, threshold: t.dailyGoal, severity: 'low', message: `${steps.toLocaleString()} steps — below daily goal` };
  return { status: 'degraded', value: steps, unit: t.unit, threshold: t.dailyGoal, severity: 'medium', message: `Low activity: ${steps.toLocaleString()} steps` };
}

function makeUnknown(type: VitalType, unit: string): VitalAnalysis {
  return { status: 'unknown', value: null, unit, threshold: 0, severity: 'low', message: 'No data available' };
}

export function analyzeVitals(reading: VitalReadingWithMeta): HealthAnalysis {
  const hr = analyzeHeartRate(reading.heart_rate ?? null);
  const spo2 = analyzeSpO2(reading.oxygen_saturation ?? null);
  const bp = analyzeBloodPressure(reading.blood_pressure_systolic ?? null, reading.blood_pressure_diastolic ?? null);
  const temp = analyzeTemperature(reading.temperature ?? null);
  const steps = analyzeSteps(reading.steps ?? null);

  const vitals: Record<VitalType, VitalAnalysis> = {
    heart_rate: hr,
    spo2,
    bp_systolic: bp.systolic,
    bp_diastolic: bp.diastolic,
    temperature: temp,
    steps,
  };

  const criticalCount = Object.values(vitals).filter(v => v.status === 'critical').length;
  const elevatedCount = Object.values(vitals).filter(v => v.status === 'elevated').length;
  const anomalyCount = Object.values(vitals).filter(v => v.status === 'critical' || v.status === 'elevated').length;

  let overall: VitalStatus;
  if (criticalCount >= 2) overall = 'critical';
  else if (criticalCount === 1) overall = 'critical';
  else if (elevatedCount >= 3) overall = 'elevated';
  else if (elevatedCount >= 1) overall = 'elevated';
  else if (Object.values(vitals).some(v => v.status === 'unknown')) overall = 'degraded';
  else overall = 'normal';

  const isEmergency =
    criticalCount >= 2 ||
    (hr.status === 'critical' && (spo2.status === 'critical' || bp.systolic.status === 'critical')) ||
    spo2.status === 'critical';

  let emergencyType: string | undefined;
  if (isEmergency) {
    if (spo2.status === 'critical') emergencyType = 'hypoxia';
    else if (hr.status === 'critical') emergencyType = 'tachycardia';
    else if (bp.systolic.status === 'critical') emergencyType = 'hypertensive_crisis';
    else if (temp.status === 'critical') emergencyType = 'hyperthermia';
  }

  const confidence = computeConfidenceScore(reading);

  return {
    timestamp: reading.timestamp ?? Date.now(),
    overall,
    vitals,
    anomalyCount,
    isEmergency,
    emergencyType,
    confidence,
  };
}

export function isVitalsStale(reading: VitalsReading, maxAgeMs = 15 * 60 * 1000): boolean {
  if (!reading.timestamp) return true;
  return Date.now() - reading.timestamp > maxAgeMs;
}

export function getVitalsQuality(reading: VitalsReading): 'high' | 'medium' | 'low' | 'unknown' {
  if (!reading.timestamp) return 'unknown';
  const age = Date.now() - reading.timestamp;
  if (age > 15 * 60 * 1000) return 'low';
  if (age > 5 * 60 * 1000) return 'medium';
  return 'high';
}

export function formatVitalDisplay(value: number | null, status: VitalStatus): string {
  if (value == null) return '--';
  if (status === 'unknown') return '--';
  return String(Math.round(value));
}

export function getStatusColor(status: VitalStatus): string {
  switch (status) {
    case 'critical': return '#FF3B3B';
    case 'elevated': return '#F59E0B';
    case 'degraded': return '#6366F1';
    case 'normal': return '#10B981';
    default: return '#94A3B8';
  }
}