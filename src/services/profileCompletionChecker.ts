/**
 * profileCompletionChecker — Centralized Medical Profile Validation
 *
 * Checks if a patient's medical profile is complete enough to provide
 * full Rafiq protection. Used by the reminder scheduler and UI badges.
 */
import type { PatientProfile } from "./patient.service";

export interface ProfileCompletenessResult {
  /** True when all required fields are populated */
  isComplete: boolean;
  /** Human-readable keys for missing fields */
  missingFields: string[];
  /** 0–100 completion score */
  completionPercentage: number;
}

interface CheckInput {
  profile: PatientProfile | null;
  emergencyContacts?: { id: string }[];
}

/**
 * Required fields and their display labels (bilingual).
 * Extend this list as the schema grows — no other file needs changing.
 */
const REQUIRED_FIELDS: Array<{
  key: string;
  labelEn: string;
  labelAr: string;
  check: (p: PatientProfile) => boolean;
}> = [
  {
    key: "full_name",
    labelEn: "Full name",
    labelAr: "الاسم الكامل",
    check: (p) => !!p.full_name?.trim(),
  },
  {
    key: "phone",
    labelEn: "Phone number",
    labelAr: "رقم الهاتف",
    check: (p) => !!p.phone?.trim(),
  },
  {
    key: "gender",
    labelEn: "Gender",
    labelAr: "الجنس",
    check: (p) => !!p.gender?.trim(),
  },
  {
    key: "blood_type",
    labelEn: "Blood type",
    labelAr: "فصيلة الدم",
    check: (p) => !!p.blood_type?.trim(),
  },
  {
    key: "date_of_birth",
    labelEn: "Date of birth",
    labelAr: "تاريخ الميلاد",
    check: (p) =>
      !!(p as any).date_of_birth?.trim() || !!(p as any).age,
  },
];

/**
 * Main checker function — pure, no side-effects.
 *
 * @param profile - Patient profile from `patientService.getProfile()`
 * @param emergencyContacts - Array of emergency contacts (any shape with an id)
 * @param language - 'ar' | 'en' (defaults to 'en')
 */
export function checkProfileCompleteness(
  { profile, emergencyContacts = [] }: CheckInput,
  language: "ar" | "en" = "en",
): ProfileCompletenessResult {
  if (!profile) {
    return {
      isComplete: false,
      missingFields:
        language === "ar"
          ? ["الملف الشخصي غير مكتمل"]
          : ["Profile not created"],
      completionPercentage: 0,
    };
  }

  const missingFields: string[] = [];

  // Check required profile fields
  for (const field of REQUIRED_FIELDS) {
    if (!field.check(profile)) {
      missingFields.push(language === "ar" ? field.labelAr : field.labelEn);
    }
  }

  // Check emergency contacts (at least 1 required)
  if (emergencyContacts.length === 0) {
    missingFields.push(
      language === "ar" ? "جهة اتصال طوارئ واحدة على الأقل" : "At least one emergency contact",
    );
  }

  const totalFields = REQUIRED_FIELDS.length + 1; // +1 for contacts
  const completedFields = totalFields - missingFields.length;
  const completionPercentage = Math.round((completedFields / totalFields) * 100);

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    completionPercentage,
  };
}

/**
 * Quick boolean check — use when you only need a yes/no answer.
 */
export function isProfileComplete(input: CheckInput): boolean {
  return checkProfileCompleteness(input).isComplete;
}
