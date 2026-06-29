import {
  PatientRepository,
  EmergencyContactRepository,
  PatientConditionRepository,
  PatientNormalizedRow,
  PatientInsert,
  PatientUpdate,
  EmergencyContactInsert,
  EmergencyContactUpdate,
  PatientConditionInsert,
  PatientConditionUpdate,
} from '../repositories/PatientRepository';

let _patientRepo: PatientRepository | null = null;
let _contactRepo: EmergencyContactRepository | null = null;
let _conditionRepo: PatientConditionRepository | null = null;

function getPatientRepo(): PatientRepository {
  if (!_patientRepo) _patientRepo = new PatientRepository();
  return _patientRepo;
}

function getContactRepo(): EmergencyContactRepository {
  if (!_contactRepo) _contactRepo = new EmergencyContactRepository();
  return _contactRepo;
}

function getConditionRepo(): PatientConditionRepository {
  if (!_conditionRepo) _conditionRepo = new PatientConditionRepository();
  return _conditionRepo;
}

export type PatientProfile = PatientNormalizedRow;

export const patientService = {

  async getProfile(userId: string): Promise<PatientNormalizedRow | null> {
    const repo = getPatientRepo();
    return await repo.getByUserId(userId);
  },

  async updateProfile(id: string, payload: PatientUpdate): Promise<void> {
    const repo = getPatientRepo();
    await repo.updateProfile(id, payload);
  },

  async createPatient(payload: PatientInsert): Promise<void> {
    const repo = getPatientRepo();
    await repo.createPatient(payload);
  },

  async hasPatient(userId: string): Promise<boolean> {
    const repo = getPatientRepo();
    return await repo.hasPatient(userId);
  },

  async getPatientId(userId: string): Promise<string | null> {
    const repo = getPatientRepo();
    return await repo.getIdByUserId(userId);
  },

  async getEmergencyContacts(patientId: string) {
    const repo = getContactRepo();
    return await repo.getByPatientId(patientId);
  },

  async upsertEmergencyContact(contact: EmergencyContactInsert & { id?: string }) {
    const repo = getContactRepo();
    await repo.upsertContact(contact);
  },

  async deleteEmergencyContact(id: string): Promise<void> {
    const repo = getContactRepo();
    await repo.delete(id);
  },

  async getConditions(patientId: string) {
    const repo = getConditionRepo();
    return await repo.getByPatientId(patientId);
  },

  async syncConditions(patientId: string, conditions: PatientConditionInsert[]): Promise<void> {
    const repo = getConditionRepo();
    await repo.syncConditions(patientId, conditions);
  },
};
