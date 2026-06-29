export class MedicalSafetyValidator {
  private static readonly DANGEROUS_MEDICATIONS = new Set([
    'ibuprofen',
    'aspirin',
    'naproxen',
    'ketorolac',
    'indomethacin',
    'piroxicam',
    'celecoxib',
    'diclofenac',
    'meloxicam',
  ]);

  private static readonly CONTRAINDICATIONS = new Map<string, string[]>([
    ['ibuprofen', ['nsaid_allergy', 'stomach_ulcer', 'kidney_disease']],
    ['aspirin', ['nsaid_allergy', 'stomach_ulcer', 'bleeding_disorder', 'children_under_16']],
    ['naproxen', ['nsaid_allergy', 'stomach_ulcer', 'kidney_disease']],
  ]);

  private static readonly EMERGENCY_KEYWORDS = [
    'chest pain', 'severe chest pain', 'pressure in chest',
    'shortness of breath', 'difficulty breathing', 'cannot breathe',
    'loss of consciousness', 'fainting', 'unconscious',
    'severe bleeding', 'uncontrollable bleeding',
    'severe headache', 'worst headache of life',
    'sudden weakness', 'paralysis', 'numbness on one side',
    'slurred speech', 'difficulty speaking',
    'suicid', 'want to die', 'kill myself',
    'stroke', 'heart attack', 'seizure',
    '\u0623\u0644\u0645 \u0641\u064a \u0627\u0644\u0635\u062f\u0631',
    '\u0636\u064a\u0642 \u062a\u0646\u0641\u0633',
    '\u0646\u0632\u064a\u0641 \u0634\u062f\u064a\u062f',
    '\u0641\u0642\u062f\u0627\u0646 \u0627\u0644\u0648\u0639\u064a',
    '\u0635\u062f\u0627\u0639 \u0634\u062f\u064a\u062f',
    '\u0636\u0639\u0641 \u0645\u0641\u0627\u062c\u0626',
    '\u0634\u0644\u0644',
    '\u062a\u062e\u062f\u064a\u0631',
    '\u0643\u0644\u0627\u0645 \u063a\u064a\u0631 \u0648\u0627\u0636\u062d',
    '\u0623\u0641\u0643\u0627\u0631 \u0627\u0646\u062a\u062d\u0627\u0631\u064a\u0629',
    '\u0623\u0631\u064a\u062f \u0627\u0644\u0645\u0648\u062a',
    '\u0623\u0644\u0645 \u0634\u062f\u064a\u062f',
    '\u0635\u0639\u0648\u0628\u0629 \u0641\u064a \u0627\u0644\u062a\u0646\u0641\u0633',
    '\u0646\u0632\u064a\u0641 \u062d\u0627\u062f',
    '\u062c\u0644\u0637\u0629 \u0642\u0644\u0628\u064a\u0629',
  ];

  private static readonly DISCLAIMER =
    '\n\n\u26a0\ufe0f \u0647\u0630\u0647 \u0627\u0644\u0646\u0635\u064a\u062d\u0629 \u0644\u0627 \u062a\u063a\u0646\u064a \u0639\u0646 \u0627\u0633\u062a\u0634\u0627\u0631\u0629 \u0627\u0644\u0637\u0628\u064a\u0628.';

  static validateMedicalResponse(
    response: string,
    patientContext: {
      allergies?: string[];
      conditions?: string[];
      currentMedications?: string[];
      age?: number;
    } = {}
  ): {
    isSafe: boolean;
    issues: string[];
    sanitizedResponse: string;
    requiresEmergencyEscalation?: boolean;
  } {
    const issues: string[] = [];
    let sanitizedResponse = response;
    let requiresEmergencyEscalation = false;

    // Check for dangerous medications in the response
    const medicationIssues = this.checkForDangerousMedications(response, patientContext);
    if (medicationIssues.length > 0) {
      issues.push(...medicationIssues);
      sanitizedResponse = this.removeDangerousRecommendations(sanitizedResponse);
    }

    // Check for contraindications between medications and patient conditions/allergies
    const contraindicationIssues = this.checkForContraindications(response, patientContext);
    if (contraindicationIssues.length > 0) {
      issues.push(...contraindicationIssues);
      sanitizedResponse = this.addContraindicationWarnings(sanitizedResponse, contraindicationIssues);
    }

    // Check for unsafe dosages
    const dosageIssues = this.checkForUnsafeDosages(response);
    if (dosageIssues.length > 0) {
      issues.push(...dosageIssues);
      sanitizedResponse = this.addDosageWarning(sanitizedResponse);
    }

    // Emergency keyword detection
    const responseLower = response.toLowerCase();
    const hasEmergency = this.EMERGENCY_KEYWORDS.some(kw => responseLower.includes(kw.toLowerCase()));
    if (hasEmergency) {
      requiresEmergencyEscalation = true;
    }

    // Append disclaimer only if response is safe
    if (issues.length === 0) {
      sanitizedResponse += this.DISCLAIMER;
    }

    return {
      isSafe: issues.length === 0,
      issues,
      sanitizedResponse: sanitizedResponse.trim() || 'I cannot provide that medical advice due to safety concerns.',
      requiresEmergencyEscalation,
    };
  }

  /**
   * Checks if the AI response recommends medications that are contraindicated
   * based on the CONTRAINDICATIONS map and patient conditions/allergies.
   */
  private static checkForContraindications(
    response: string,
    context: { allergies?: string[]; conditions?: string[]; currentMedications?: string[]; age?: number }
  ): string[] {
    const issues: string[] = [];
    const responseLower = response.toLowerCase();

    for (const [medication, contraindicatedFor] of this.CONTRAINDICATIONS) {
      if (!responseLower.includes(medication)) continue;

      const medLabel = medication.charAt(0).toUpperCase() + medication.slice(1);

      for (const conditionKey of contraindicatedFor) {
        const readable = conditionKey.replace(/_/g, ' ');

        // Check patient conditions
        if (context.conditions) {
          for (const patientCond of context.conditions) {
            if (patientCond.toLowerCase().includes(readable)) {
              issues.push(`${medLabel} contraindicated for ${readable}`);
            }
          }
        }

        // Check patient allergies
        if (context.allergies) {
          for (const allergy of context.allergies) {
            if (allergy.toLowerCase().includes(readable)) {
              issues.push(`${medLabel} contraindicated for patients with ${readable} allergy`);
            }
          }
        }
      }
    }

    return issues;
  }

  private static checkForDangerousMedications(
    response: string,
    context: { allergies?: string[]; conditions?: string[]; currentMedications?: string[]; age?: number }
  ): string[] {
    const issues: string[] = [];
    const responseLower = response.toLowerCase();
    const dangerousMedsArray = Array.from(this.DANGEROUS_MEDICATIONS);

    if (context.allergies) {
      for (const allergy of context.allergies) {
        const allergyLower = allergy.toLowerCase();
        const isNSAIDAllergy =
          allergyLower.includes('nsaid') ||
          allergyLower.includes('ibuprofen') ||
          allergyLower.includes('aspirin') ||
          allergyLower.includes('naproxen');

        if (isNSAIDAllergy) {
          for (const med of ['ibuprofen', 'aspirin', 'naproxen']) {
            if (dangerousMedsArray.includes(med) && responseLower.includes(med)) {
              issues.push(
                `${med.charAt(0).toUpperCase() + med.slice(1)} contraindicated for NSAID allergy`
              );
            }
          }
        }

        if (allergyLower.includes('penicillin')) {
          if (
            responseLower.includes('amoxicillin') ||
            responseLower.includes('ampicillin')
          ) {
            issues.push(
              'Penicillin-class antibiotics contraindicated for penicillin allergy'
            );
          }
        }

        if (allergyLower.includes('sulfa') || allergyLower.includes('sulfonamide')) {
          if (
            responseLower.includes('sulfamethoxazole') ||
            responseLower.includes('bactrim') ||
            responseLower.includes('septra')
          ) {
            issues.push('Sulfa drugs contraindicated for sulfa allergy');
          }
        }
      }
    }

    if (context.conditions) {
      for (const condition of context.conditions) {
        const c = condition.toLowerCase();

        if (c.includes('stomach') || c.includes('ulcer') || c.includes('gi bleed')) {
          for (const med of ['ibuprofen', 'aspirin', 'naproxen']) {
            if (responseLower.includes(med)) {
              issues.push(
                `${med.charAt(0).toUpperCase() + med.slice(1)} contraindicated for stomach ulcers/GI bleeding`
              );
            }
          }
        }

        if (c.includes('kidney') || c.includes('renal')) {
          for (const med of ['ibuprofen', 'naproxen']) {
            if (responseLower.includes(med)) {
              issues.push('NSAIDs contraindicated for kidney disease');
            }
          }
        }

        if (c.includes('bleeding') || c.includes('hemorrhage')) {
          if (responseLower.includes('aspirin')) {
            issues.push('Aspirin contraindicated for bleeding disorders');
          }
        }
      }
    }

    if (context.age !== undefined && context.age < 16) {
      if (responseLower.includes('aspirin')) {
        issues.push(
          'Aspirin contraindicated for children under 16 (Reye syndrome risk)'
        );
      }
    }

    return issues;
  }

  private static removeDangerousRecommendations(response: string): string {
    const sentences = response.split(/[.!?]+/);
    const dangerousMedsArray = Array.from(this.DANGEROUS_MEDICATIONS);
    const filtered = sentences.filter(sentence => {
      const s = sentence.trim().toLowerCase();
      return !dangerousMedsArray.some((med: string) => s.includes(med));
    });
    return (
      filtered.filter(Boolean).join('. ') ||
      'I cannot provide that medical advice due to safety concerns.'
    );
  }

  private static addContraindicationWarnings(
    response: string,
    issues: string[]
  ): string {
    if (issues.length === 0) return response;
    const warnings = issues
      .map(i => `\u26a0\ufe0f Medical Safety Warning: ${i}`)
      .join('\n');
    return `${warnings}\n\n${response}`;
  }

  private static checkForUnsafeDosages(response: string): string[] {
    const issues: string[] = [];
    const patterns = [
      { pattern: /ibuprofen\s+(\d+(?:\.\d+)?)\s*(mg|g)/gi, medication: 'ibuprofen', maxMg: 800 },
      { pattern: /aspirin\s+(\d+(?:\.\d+)?)\s*(mg|g)/gi, medication: 'aspirin', maxMg: 325 },
      { pattern: /naproxen\s+(\d+(?:\.\d+)?)\s*(mg|g)/gi, medication: 'naproxen', maxMg: 500 },
    ];

    for (const { pattern, medication, maxMg } of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = regex.exec(response)) !== null) {
        const amount = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        const amountInMg = unit === 'g' ? amount * 1000 : amount;
        if (amountInMg > maxMg) {
          issues.push(
            `Unsafe ${medication} dosage: ${amount}${unit} exceeds max ${maxMg}mg`
          );
        }
      }
    }
    return issues;
  }

  private static addDosageWarning(response: string): string {
    const warning =
      '\u26a0\ufe0f Dosage Warning: Consult with a healthcare provider before taking any medication.';
    return `${warning}\n\n${response}`;
  }

  static validateConsent(hasConsent: boolean): {
    isValid: boolean;
    message?: string;
  } {
    if (!hasConsent) {
      return {
        isValid: false,
        message: 'Medical advice requires prior patient consent.',
      };
    }
    return { isValid: true };
  }
}
