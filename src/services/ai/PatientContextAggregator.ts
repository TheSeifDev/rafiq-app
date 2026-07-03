import { patientService } from '../patient.service';
import { medicationService } from '../medication.service';
import { notificationService } from '../notification.service';
import { PatientRepository, PatientConditionRepository, type PatientConditionRow } from '../../repositories/PatientRepository';
import type { Medication } from '../medication.service';
import type { AppNotification } from '../notification.service';
import type { EmergencyContact, AddressData, ReporterData, HospitalData } from '../../types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PatientContext {
  fullName: string;
  age: number | null;
  gender: string | null;
  bloodType: string | null;
  phone: string | null;
  birthDate: string | null;
  relationship: string | null;

  address: {
    city: string | null;
    area: string | null;
    detailed: string | null;
    geocoded: string | null;
  };

  emergency: {
    contacts: EmergencyContact[];
    primaryContact: EmergencyContact | null;
    profile: string | null;
  };

  reporter: {
    relation: string | null;
    data: { name: string | null; phone: string | null; isPrimaryContact: boolean | null };
  };

  hospital: {
    name: string | null;
    doctorName: string | null;
    data: { address: string | null; phone: string | null; hasMedicalFile: boolean | null; fileNumber: string | null };
  };

  medications: {
    active: Medication[];
    schedules: Record<string, string[]>;
    adherence: Record<string, number>;
  };

  conditions: {
    list: { name: string; severity: string | null; diagnosedDate: string | null; notes: string | null; isActive: boolean }[];
    riskLevel: string | null;
  };

  allergies: {
    list: string[];
    history: string[];
  };

  nutrition: {
    mealsToday: number;
    caloriesToday: number;
    waterIntake: number;
    dietNotes: string | null;
  };

  alerts: {
    emergency: AppNotification[];
    gas: AppNotification[];
    oxygen: AppNotification[];
    heart: AppNotification[];
    other: AppNotification[];
  };

  recentAIContext: {
    symptoms: string[];
    concerns: string[];
    followUpTopics: string[];
    lastConversation: string | null;
  };

  profileCompletion: {
    percentage: number;
    completedFields: string[];
    missingFields: string[];
    readinessScore: number;
  };
}

export class PatientContextAggregator {
  private patientRepo: PatientRepository;
  private conditionRepo: PatientConditionRepository;

  constructor() {
    this.patientRepo = new PatientRepository();
    this.conditionRepo = new PatientConditionRepository();
  }

  async aggregate(userId: string): Promise<PatientContext> {
    const patient = await patientService.getProfile(userId);
    if (!patient) {
      console.warn('[PatientContextAggregator] Patient profile not found for userId:', userId, '— returning minimal context');
      return this.buildMinimalContext();
    }

    const emergencyContacts = await patientService.getEmergencyContacts(patient.id);

    const conditionRows = await this.conditionRepo.getByPatientId(patient.id);

    const medications = await medicationService.getMedications(patient.id);

    const allNotifications = await notificationService.getNotifications(userId);
    const recentNotifications = allNotifications.slice(0, 50);

    const recentAIContext = await this.getRecentAIContext(userId);

    const addressData = patient.address_data as AddressData || {};
    const address = {
      city: addressData.district ?? null,
      area: addressData.governorate ?? null,
      detailed: `${addressData.street ?? ''} ${addressData.building_number ?? ''} ${addressData.apartment_number ?? ''}`.trim() || null,
      geocoded: patient.geocoded_address ?? null,
    };

    const primaryContact = emergencyContacts.find(c => c.is_primary) || null;

    const reporterData = patient.reporter_data as ReporterData || {};
    const reporter = {
      relation: reporterData.relationship ?? null,
      data: {
        name: reporterData.name ?? null,
        phone: reporterData.phone ?? null,
        isPrimaryContact: reporterData.is_primary_contact ?? null,
      },
    };

    const hospitalData = patient.hospital_data as HospitalData || {};
    const hospital = {
      name: hospitalData.name ?? null,
      doctorName: null,
      data: {
        address: hospitalData.address ?? null,
        phone: hospitalData.phone ?? null,
        hasMedicalFile: hospitalData.has_medical_file ?? null,
        fileNumber: hospitalData.file_number ?? null,
      },
    };

    const activeMeds = medications.filter(m => m.is_active);
    const schedules: Record<string, string[]> = {};
    const adherence: Record<string, number> = {};
    activeMeds.forEach(med => {
      schedules[med.id] = med.time_of_day ?? [];
      adherence[med.id] = 0;
    });

    const conditionList = conditionRows.map((row: PatientConditionRow) => ({
      name: row.condition_name,
      severity: row.severity ?? null,
      diagnosedDate: row.diagnosed_date ?? null,
      notes: row.notes ?? null,
      isActive: row.is_active === 1,
    }));
    const riskLevel = patient.risk_level ?? null;

    const allergyList = conditionList
      .filter(c => c.name.toLowerCase().includes('allergy'))
      .map(c => c.name);
    try {
      const patientAllergiesRaw = (patient as any).allergies;
      if (patientAllergiesRaw) {
        let patientAllergies: string[] = [];
        if (typeof patientAllergiesRaw === 'string') {
          try {
            const parsed = JSON.parse(patientAllergiesRaw);
            patientAllergies = Array.isArray(parsed) ? parsed.filter(Boolean) : [patientAllergiesRaw];
          } catch {
            patientAllergies = patientAllergiesRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
          }
        } else if (Array.isArray(patientAllergiesRaw)) {
          patientAllergies = patientAllergiesRaw.filter(Boolean);
        }
        for (const a of patientAllergies) {
          if (typeof a === 'string' && !allergyList.some(existing => existing.toLowerCase() === a.toLowerCase())) {
            allergyList.push(a);
          }
        }
      }
    } catch (e) {
      console.warn('[PatientContextAggregator] Failed to read patient.allergies:', e);
    }
    const allergyHistory: string[] = [];

    let profileCompletion = {
      percentage: 0,
      completedFields: [] as string[],
      missingFields: [] as string[],
      readinessScore: 0,
    };
    try {
      const { patientValidationService } = await import('../patient/patientValidation.service');
      const validation = patientValidationService.validatePatientProfile({
        ...patient,
        emergency_contact: emergencyContacts,
        medications,
        conditions: conditionList,
      } as any);
      profileCompletion = {
        percentage: validation.completionPercentage ?? 0,
        completedFields: [],
        missingFields: validation.missingFields ?? [],
        readinessScore: Math.min(100, validation.completionPercentage ?? 0),
      };
    } catch (e) {
      console.warn('[PatientContextAggregator] Failed to compute profile completion:', e);
    }

    const nutrition = {
      mealsToday: 0,
      caloriesToday: 0,
      waterIntake: 0,
      dietNotes: null,
    };

    const alerts = {
      emergency: recentNotifications.filter(n => n.category === 'emergency'),
      gas: recentNotifications.filter(n => n.type?.toLowerCase().includes('gas')),
      oxygen: recentNotifications.filter(n => n.type?.toLowerCase().includes('oxygen')),
      heart: recentNotifications.filter(n => n.type?.toLowerCase().includes('heart')),
      other: recentNotifications.filter(n =>
        !['emergency'].includes(n.category ?? '') &&
        !['gas', 'oxygen', 'heart'].some(key => n.type?.toLowerCase().includes(key))
      ),
    };

    const profileCompletionFinal = profileCompletion;

    return {
      fullName: patient.full_name,
      age: patient.age ?? null,
      gender: patient.gender ?? null,
      bloodType: patient.blood_type ?? null,
      phone: patient.phone ?? null,
      birthDate: patient.birth_date ?? null,
      relationship: patient.relationship ?? null,

      address,

      emergency: {
        contacts: emergencyContacts,
        primaryContact,
        profile: null,
      },

      reporter,

      hospital,

      medications: {
        active: activeMeds,
        schedules,
        adherence,
      },

      conditions: {
        list: conditionList,
        riskLevel,
      },

      allergies: {
        list: allergyList,
        history: allergyHistory,
      },

      nutrition,

      alerts,

      recentAIContext,

      profileCompletion: profileCompletionFinal,
    };
  }

  private async getRecentAIContext(userId: string): Promise<{
    symptoms: string[];
    concerns: string[];
    followUpTopics: string[];
    lastConversation: string | null;
  }> {
    try {
      const stored = (await AsyncStorage.getItem('@rafiq_ai_state')) ??
        (await AsyncStorage.getItem(`@rafiq_ai_state_${userId}`));
      if (!stored) {
        return { symptoms: [], concerns: [], followUpTopics: [], lastConversation: null };
      }
      const data = JSON.parse(stored);
      const messages = data.messages ?? [];

      const symptoms: string[] = [];
      const concerns: string[] = [];
      const followUpTopics: string[] = [];
      let lastConversation: string | null = null;

      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
        if (msg.role === 'user') {
          const content = msg.content.toLowerCase();
          if (content.includes('symptom') || content.includes('pain') || content.includes('hurt')) {
            symptoms.push(msg.content);
          }
          if (content.includes('worry') || content.includes('concern') || content.includes('afraid')) {
            concerns.push(msg.content);
          }
          if (content.includes('follow up') || content.includes('next') || content.includes('later')) {
            followUpTopics.push(msg.content);
          }
          lastConversation = msg.content;
        }
      }

      return {
        symptoms: [...new Set(symptoms)],
        concerns: [...new Set(concerns)],
        followUpTopics: [...new Set(followUpTopics)],
        lastConversation: lastConversation ?? null,
      };
    } catch (error) {
      console.warn('Failed to get recent AI context:', error);
      return { symptoms: [], concerns: [], followUpTopics: [], lastConversation: null };
    }
  }

  private buildMinimalContext(): PatientContext {
    return {
      fullName: 'User',
      age: null,
      gender: null,
      bloodType: null,
      phone: null,
      birthDate: null,
      relationship: null,
      address: { city: null, area: null, detailed: null, geocoded: null },
      emergency: { contacts: [], primaryContact: null, profile: null },
      reporter: { relation: null, data: { name: null, phone: null, isPrimaryContact: null } },
      hospital: { name: null, doctorName: null, data: { address: null, phone: null, hasMedicalFile: null, fileNumber: null } },
      medications: { active: [], schedules: {}, adherence: {} },
      conditions: { list: [], riskLevel: null },
      allergies: { list: [], history: [] },
      nutrition: { mealsToday: 0, caloriesToday: 0, waterIntake: 0, dietNotes: null },
      alerts: { emergency: [], gas: [], oxygen: [], heart: [], other: [] },
      recentAIContext: { symptoms: [], concerns: [], followUpTopics: [], lastConversation: null },
      profileCompletion: { percentage: 0, completedFields: [], missingFields: [], readinessScore: 0 },
    };
  }
}

export const patientContextAggregator = new PatientContextAggregator();
export default patientContextAggregator;
