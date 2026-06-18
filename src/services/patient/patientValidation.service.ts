export interface ProfileValidationResult {
  isComplete: boolean;
  completionPercentage: number;
  missingFields: string[];
}

export interface PatientProfileValidationInput {
  full_name?: unknown;
  phone?: unknown;
  birth_date?: unknown;
  gender?: unknown;
  blood_type?: unknown;
  address?: unknown;
  emergency_contact?: unknown;
  allergies?: unknown;
  medications?: unknown;
  conditions?: unknown;
  chronic_conditions?: unknown;
  medical_conditions?: unknown;
  hospital_data?: unknown;
  reporter_data?: unknown;
}

const REQUIRED_FIELDS: Array<{
  key: string;
  label: string;
  resolve: (profile: PatientProfileValidationInput) => unknown;
}> = [
  { key: 'full_name', label: 'Full Name', resolve: (p) => p.full_name },
  { key: 'phone', label: 'Phone', resolve: (p) => p.phone },
  { key: 'birth_date', label: 'Birth Date', resolve: (p) => p.birth_date },
  { key: 'gender', label: 'Gender', resolve: (p) => p.gender },
  { key: 'blood_type', label: 'Blood Type', resolve: (p) => p.blood_type },
  { key: 'address', label: 'Address', resolve: (p) => p.address },
  { key: 'emergency_contact', label: 'Emergency Contact', resolve: (p) => p.emergency_contact },
  { key: 'allergies', label: 'Allergies', resolve: (p) => p.allergies },
  { key: 'medications', label: 'Medications', resolve: (p) => p.medications },
  {
    key: 'conditions',
    label: 'Conditions',
    resolve: (p) => p.conditions ?? p.chronic_conditions ?? p.medical_conditions,
  },
  { key: 'hospital_data', label: 'Hospital Data', resolve: (p) => p.hospital_data },
  { key: 'reporter_data', label: 'Reporter Data', resolve: (p) => p.reporter_data },
];

export function isValidProfileValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return isValidProfileValue(JSON.parse(trimmed));
      } catch {
        return true;
      }
    }
    return true;
  }
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const values = Object.values(value as Record<string, unknown>);
    return values.length > 0 && values.some(isValidProfileValue);
  }
  return true;
}

class PatientValidationService {
  validatePatientProfile(profile: PatientProfileValidationInput | null | undefined): ProfileValidationResult {
    if (!profile) {
      return {
        isComplete: false,
        completionPercentage: 0,
        missingFields: REQUIRED_FIELDS.map((field) => field.label),
      };
    }

    const missingFields = REQUIRED_FIELDS
      .filter((field) => !isValidProfileValue(field.resolve(profile)))
      .map((field) => field.label);

    const completionPercentage = Math.round(
      ((REQUIRED_FIELDS.length - missingFields.length) / REQUIRED_FIELDS.length) * 100,
    );

    return {
      isComplete: missingFields.length === 0,
      completionPercentage,
      missingFields,
    };
  }
}

export const patientValidationService = new PatientValidationService();
