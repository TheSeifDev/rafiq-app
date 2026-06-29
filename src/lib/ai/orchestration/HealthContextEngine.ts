export interface VitalsReading {
  heartRate?: number;
  bloodPressureSys?: number;
  bloodPressureDia?: number;
  oxygenSaturation?: number;
  temperature?: number;
  timestamp?: string;
}

export interface MedicationInfo {
  name: string;
  dosage?: string;
  time?: string;
  active?: boolean;
}

export interface AlertInfo {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: string;
}

export interface FoodLogEntry {
  id: string;
  name: string;
  calories?: number;
  timestamp: string;
}

export interface SleepRecord {
  startTime: string;
  endTime?: string;
  duration?: number;
  quality?: 'good' | 'fair' | 'poor';
}

interface ConditionInfo {
  name: string;
  severity: string | null;
  diagnosedDate: string | null;
  notes: string | null;
  isActive: boolean;
}

interface HospitalInfo {
  name: string | null;
  address: string | null;
  phone: string | null;
  hasMedicalFile: boolean | null;
  fileNumber: string | null;
}

interface ReporterInfo {
  name: string | null;
  relationship: string | null;
  phone: string | null;
  isPrimaryContact: boolean | null;
}

interface AddressInfo {
  city: string | null;
  area: string | null;
  detailed: string | null;
  geocoded: string | null;
}

interface EmergencyContactInfo {
  name: string;
  relation: string;
  phone: string;
  isPrimary: boolean;
}

interface EmergencyInfo {
  contacts: EmergencyContactInfo[];
  primaryContact: EmergencyContactInfo | null;
  profile: string | null;
}

interface ProfileCompletionInfo {
  percentage: number;
  completedFields: string[];
  missingFields: string[];
  readinessScore: number;
}

export interface HealthContextData {
  patientName: string;
  latestVitals: VitalsReading;
  medications: MedicationInfo[];
  recentAlerts: AlertInfo[];
  foodLogs: FoodLogEntry[];
  sleepRecords: SleepRecord[];
  conditions: ConditionInfo[];
  allergies: string[];
  hospital: HospitalInfo;
  reporter: ReporterInfo;
  address: AddressInfo;
  emergency: EmergencyInfo;
  profileCompletion: ProfileCompletionInfo;
  lastUpdated: string;
}

export interface HealthInsight {
  type: 'vitals' | 'medication' | 'food' | 'sleep' | 'alert' | 'condition' | 'allergy' | 'hospital' | 'reporter' | 'address' | 'emergency' | 'profile';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  value?: string;
}

export function analyzeVitals(vitals: VitalsReading): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (vitals.heartRate) {
    if (vitals.heartRate > 100) {
      insights.push({
        type: 'vitals',
        priority: 'medium',
        title: 'Elevated Heart Rate',
        description: 'Heart rate is elevated. Consider rest and hydration.',
        value: `${vitals.heartRate} bpm`,
      });
    } else if (vitals.heartRate < 60) {
      insights.push({
        type: 'vitals',
        priority: 'medium',
        title: 'Low Heart Rate',
        description: 'Heart rate is below normal. Monitor for symptoms.',
        value: `${vitals.heartRate} bpm`,
      });
    }
  }

  if (vitals.bloodPressureSys && vitals.bloodPressureDia) {
    if (vitals.bloodPressureSys > 140 || vitals.bloodPressureDia > 90) {
      insights.push({
        type: 'vitals',
        priority: 'high',
        title: 'High Blood Pressure',
        description: 'Blood pressure is elevated. Consult your doctor.',
        value: `${vitals.bloodPressureSys}/${vitals.bloodPressureDia} mmHg`,
      });
    } else if (vitals.bloodPressureSys < 90 || vitals.bloodPressureDia < 60) {
      insights.push({
        type: 'vitals',
        priority: 'medium',
        title: 'Low Blood Pressure',
        description: 'Blood pressure is low. Stay hydrated.',
        value: `${vitals.bloodPressureSys}/${vitals.bloodPressureDia} mmHg`,
      });
    }
  }

  if (vitals.oxygenSaturation && vitals.oxygenSaturation < 94) {
    insights.push({
      type: 'vitals',
      priority: 'high',
      title: 'Low Oxygen',
      description: 'SpO2 is below normal. Seek medical attention.',
      value: `${vitals.oxygenSaturation}%`,
    });
  }

  if (vitals.temperature) {
    if (vitals.temperature > 38) {
      insights.push({
        type: 'vitals',
        priority: 'high',
        title: 'Fever Detected',
        description: 'Temperature indicates fever. Rest and monitor.',
        value: `${vitals.temperature}°C`,
      });
    }
  }

  return insights;
}

export function analyzeMedications(medications: MedicationInfo[]): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (medications.length === 0) {
    return insights;
  }

  insights.push({
    type: 'medication',
    priority: 'low',
    title: 'Active Medications',
    description: `${medications.length} medication${medications.length > 1 ? 's' : ''} on record`,
    value: medications.map(m => m.name).join(', '),
  });

  return insights;
}

export function analyzeAlerts(alerts: AlertInfo[]): HealthInsight[] {
  return alerts.map(alert => ({
    type: 'alert' as const,
    priority: alert.type === 'critical' ? 'high' : alert.type === 'warning' ? 'medium' : 'low',
    title: alert.message,
    description: `Alert at ${new Date(alert.timestamp).toLocaleTimeString()}`,
    value: alert.type,
  }));
}

export function analyzeFood(foodLogs: FoodLogEntry[]): HealthInsight[] {
  const insights: HealthInsight[] = [];

  const today = new Date().toDateString();
  const todayLogs = foodLogs.filter(log => new Date(log.timestamp).toDateString() === today);

  if (todayLogs.length > 0) {
    const totalCalories = todayLogs.reduce((sum, log) => sum + (log.calories || 0), 0);
    insights.push({
      type: 'food',
      priority: 'low',
      title: 'Today\'s Food',
      description: `${todayLogs.length} meal${todayLogs.length > 1 ? 's' : ''} logged`,
      value: totalCalories > 0 ? `${totalCalories} kcal` : undefined,
    });
  }

  return insights;
}

export function analyzeSleep(sleepRecords: SleepRecord[]): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (sleepRecords.length === 0) return insights;

  const lastRecord = sleepRecords[sleepRecords.length - 1];

  if (lastRecord.duration) {
    const hours = Math.round(lastRecord.duration / 60);
    if (hours < 6) {
      insights.push({
        type: 'sleep',
        priority: 'medium',
        title: 'Insufficient Sleep',
        description: 'Last night\'s sleep was less than recommended.',
        value: `${hours} hours`,
      });
    } else if (hours >= 7 && hours <= 9) {
      insights.push({
        type: 'sleep',
        priority: 'low',
        title: 'Good Sleep',
        description: 'You got adequate sleep last night.',
        value: `${hours} hours`,
      });
    }
  }

  return insights;
}

export function analyzeConditions(conditions: ConditionInfo[]): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (conditions.length === 0) return insights;

  insights.push({
    type: 'condition' as const,
    priority: 'medium',
    title: 'Health Conditions',
    description: `${conditions.length} condition${conditions.length > 1 ? 's' : ''} on record`,
    value: conditions.map(c => c.name).join(', '),
  });

  return insights;
}

export function analyzeAllergies(allergies: string[]): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (allergies.length === 0) return insights;

  insights.push({
    type: 'allergy' as const,
    priority: 'high',
    title: 'Allergies',
    description: `Patient has ${allergies.length} allergy${allergies.length > 1 ? 's' : ''}`,
    value: allergies.join(', '),
  });

  return insights;
}

export function analyzeHospital(hospital: HospitalInfo): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (!hospital.name) return insights;

  insights.push({
    type: 'hospital' as const,
    priority: 'medium',
    title: `Hospital: ${hospital.name}`,
    description: hospital.address ? `Address: ${hospital.address}` : 'No address specified',
    value: hospital.fileNumber ?? undefined,
  });

  return insights;
}

export function analyzeReporter(reporter: ReporterInfo): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (!reporter.name) return insights;

  insights.push({
    type: 'reporter' as const,
    priority: 'low',
    title: `Reporter: ${reporter.name}`,
    description: `Relationship: ${reporter.relationship ?? 'unknown'}`,
    value: reporter.isPrimaryContact ? 'Primary contact' : 'Not primary',
  });

  return insights;
}

export function analyzeAddress(address: AddressInfo): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (!address.detailed) return insights;

  insights.push({
    type: 'address' as const,
    priority: 'low',
    title: 'Address',
    description: address.detailed,
    value: undefined,
  });

  return insights;
}

export function analyzeEmergency(emergency: EmergencyInfo): HealthInsight[] {
  const insights: HealthInsight[] = [];

  if (emergency.contacts.length === 0) return insights;

  insights.push({
    type: 'emergency' as const,
    priority: 'medium',
    title: `Emergency Contacts: ${emergency.contacts.length}`,
    description: `Primary contact: ${emergency.primaryContact?.name ?? 'none'}`,
    value: undefined,
  });

  if (emergency.profile) {
    insights.push({
      type: 'emergency' as const,
      priority: 'low',
      title: 'Emergency Profile',
      description: emergency.profile,
      value: undefined,
    });
  }

  return insights;
}

export function analyzeProfileCompletion(profileCompletion: ProfileCompletionInfo): HealthInsight[] {
  const insights: HealthInsight[] = [];

  insights.push({
    type: 'profile' as const,
    priority: profileCompletion.percentage >= 80 ? 'low' : profileCompletion.percentage >= 50 ? 'medium' : 'high',
    title: `Profile Completion: ${profileCompletion.percentage}%`,
    description: `Missing: ${profileCompletion.missingFields.join(', ')}`,
    value: undefined,
  });

  return insights;
}

export function buildHealthContext(data: HealthContextData): {
  contextText: string;
  insights: HealthInsight[];
  isAbnormal: boolean;
} {
  const allInsights: HealthInsight[] = [];

  allInsights.push(...analyzeVitals(data.latestVitals));
  allInsights.push(...analyzeMedications(data.medications));
  allInsights.push(...analyzeAlerts(data.recentAlerts));
  allInsights.push(...analyzeFood(data.foodLogs));
  allInsights.push(...analyzeSleep(data.sleepRecords));
  allInsights.push(...analyzeConditions(data.conditions));
  allInsights.push(...analyzeAllergies(data.allergies));
  allInsights.push(...analyzeHospital(data.hospital));
  allInsights.push(...analyzeReporter(data.reporter));
  allInsights.push(...analyzeAddress(data.address));
  allInsights.push(...analyzeEmergency(data.emergency));
  allInsights.push(...analyzeProfileCompletion(data.profileCompletion));

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  allInsights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const highPriorityCount = allInsights.filter(i => i.priority === 'high').length;

  const lines: string[] = [];

  lines.push(`Patient: ${data.patientName}`);
  lines.push(`Last Updated: ${new Date(data.lastUpdated).toLocaleString()}`);

  if (data.latestVitals.heartRate || data.latestVitals.bloodPressureSys) {
    const vitals: string[] = [];
    if (data.latestVitals.heartRate) vitals.push(`HR: ${data.latestVitals.heartRate}`);
    if (data.latestVitals.bloodPressureSys && data.latestVitals.bloodPressureDia) {
      vitals.push(`BP: ${data.latestVitals.bloodPressureSys}/${data.latestVitals.bloodPressureDia}`);
    }
    if (data.latestVitals.oxygenSaturation) vitals.push(`SpO2: ${data.latestVitals.oxygenSaturation}%`);
    if (data.latestVitals.temperature) vitals.push(`Temp: ${data.latestVitals.temperature}°C`);

    if (vitals.length > 0) {
      lines.push(`Vitals: ${vitals.join(', ')}`);
    }
  }

  if (data.medications.length > 0) {
    const medList = data.medications.map(m => m.name).join(', ');
    lines.push(`Medications: ${medList}`);
  }

  if (data.recentAlerts.length > 0) {
    lines.push(`Alerts: ${data.recentAlerts.map(a => a.message).join('; ')}`);
  }

  if (data.conditions.length > 0) {
    const conditionList = data.conditions.map(c => `${c.name} ${c.severity ?? ''}`).join(', ');
    lines.push(`Conditions: ${conditionList}`);
  }

  if (data.allergies.length > 0) {
    const allergiesList = data.allergies.join(', ');
    lines.push(`Allergies: ${allergiesList}`);
  }

  if (data.hospital.name) {
    lines.push(`Hospital: ${data.hospital.name}`);
    if (data.hospital.address) lines.push(`Hospital Address: ${data.hospital.address}`);
    if (data.hospital.phone) lines.push(`Hospital Phone: ${data.hospital.phone}`);
  }

  if (data.reporter.name) {
    lines.push(`Reporter: ${data.reporter.name}`);
    if (data.reporter.relationship) lines.push(`Reporter Relationship: ${data.reporter.relationship}`);
    if (data.reporter.phone) lines.push(`Reporter Phone: ${data.reporter.phone}`);
  }

  if (data.address.detailed) {
    lines.push(`Address: ${data.address.detailed}`);
  }

  if (data.emergency.contacts.length > 0) {
    lines.push(`Emergency Contacts: ${data.emergency.contacts.length}`);
    if (data.emergency.primaryContact) {
      lines.push(`Primary Emergency Contact: ${data.emergency.primaryContact.name}`);
    }
    if (data.emergency.profile) {
      lines.push(`Emergency Profile: ${data.emergency.profile}`);
    }
  }

  if (data.profileCompletion.percentage >= 0) {
    lines.push(`Profile Completion: ${data.profileCompletion.percentage}%`);
    if (data.profileCompletion.missingFields.length > 0) {
      lines.push(`Missing Fields: ${data.profileCompletion.missingFields.join(', ')}`);
    }
  }

  if (highPriorityCount > 0) {
    lines.push(`⚠️ ${highPriorityCount} high-priority health alerts need attention`);
  }

  return {
    contextText: lines.join('\n'),
    insights: allInsights,
    isAbnormal: highPriorityCount > 0,
  };
}

export function formatContextForPrompt(
  data: HealthContextData,
  insights: HealthInsight[]
): string {
  const { contextText } = buildHealthContext(data);

  let prompt = `You are RAFIQ, a compassionate healthcare AI assistant.\n\n`;
  prompt += `CURRENT HEALTH DATA:\n${contextText}\n\n`;

  if (insights.length > 0) {
    prompt += `HEALTH INSIGHTS:\n`;
    for (const insight of insights.slice(0, 5)) {
      const emoji = insight.priority === 'high' ? '🚨' : insight.priority === 'medium' ? '⚠️' : 'ℹ️';
      prompt += `${emoji} ${insight.title}: ${insight.description}\n`;
    }
    prompt += '\n';
  }

  prompt += `RESPONSE GUIDELINES:\n`;
  prompt += `1. Be empathetic, clear, and concise\n`;
  prompt += `2. Use medical terms accurately but explain simply\n`;
  prompt += `3. Focus on actionable health advice\n`;
  prompt += `4. Never provide definitive diagnoses - suggest consulting a doctor\n`;
  prompt += `5. For emergencies, direct to emergency services immediately\n`;
  prompt += `6. Keep responses practical (2-4 sentences for quick answers)\n`;
  prompt += `7. Use markdown for formatting when helpful\n`;
  prompt += `8. Highlight any abnormal readings prominently\n`;
  prompt += `9. Reference the patient's specific data when relevant\n`;

  return prompt;
}

export default {
  analyzeVitals,
  analyzeMedications,
  analyzeAlerts,
  analyzeFood,
  analyzeSleep,
  buildHealthContext,
  formatContextForPrompt,
};
