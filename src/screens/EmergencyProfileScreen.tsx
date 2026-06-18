import React, { useState, useCallback } from 'react';
import {
  ScrollView, View, StyleSheet, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Switch, Alert, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppInput } from '../components/ui/AppInput';
import { AppText } from '../components/ui/AppText';
import { PillSelector } from '../components/ui/PillSelector';
import { ChipSelector } from '../components/ui/ChipSelector';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { EmergencyContactCard } from '../components/ui/EmergencyContactCard';
import { spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useAppStore } from '../store/app.store';
import { translations } from '../constants/translations';
import { useEmergencyProfile } from '../hooks/useEmergencyProfile';
import type { ProfileStackScreenProps } from '../navigation/types';

type Props = ProfileStackScreenProps<'EmergencyProfile'>;

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const CONDITION_KEYS = [
  'diabetes', 'heartDisease', 'alzheimer', 'parkinson',
  'strokeHistory', 'hypertension', 'fallRisk', 'epilepsy', 'allergy', 'other',
] as const;

export function EmergencyProfileScreen({ navigation }: Props): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const t = translations[language] as any;
  const isAr = language === 'ar';

  const {
    form, contacts, loading, saving, isDirty, statusMsg, email,
    updateField, updateAddress, updateReporter, updateHospital,
    toggleCondition, addContact, removeContact, updateContact, save,
  } = useEmergencyProfile();

  const [contactModal, setContactModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [modalName, setModalName] = useState('');
  const [modalPhone, setModalPhone] = useState('');
  const [modalRelation, setModalRelation] = useState('');
  const [modalPrimary, setModalPrimary] = useState(false);

  const RELATION_OPTIONS = [
    t.father, t.mother, t.son, t.daughter, t.brother, t.sister,
    t.neighbor, t.friend, t.nurse, t.caregiver, t.other,
  ];

  const conditionOptions = CONDITION_KEYS.map((k) => ({ key: k, label: t[k] ?? k }));

  const openAddContact = useCallback(() => {
    setEditingContactId(null);
    setModalName(''); setModalPhone(''); setModalRelation(''); setModalPrimary(false);
    setContactModal(true);
  }, []);

  const openEditContact = useCallback((id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    setEditingContactId(id);
    setModalName(c.name); setModalPhone(c.phone); setModalRelation(c.relation); setModalPrimary(Boolean(c.is_primary));
    setContactModal(true);
  }, [contacts]);

  const handleSaveContact = useCallback(() => {
    if (!modalName.trim() || !modalPhone.trim()) return;
    if (editingContactId) {
      updateContact(editingContactId, { name: modalName.trim(), phone: modalPhone.trim(), relation: modalRelation, is_primary: modalPrimary ? 1 : 0 });
    } else {
      addContact({ name: modalName.trim(), phone: modalPhone.trim(), relation: modalRelation || t.other, is_primary: modalPrimary });
    }
    setContactModal(false);
  }, [editingContactId, modalName, modalPhone, modalRelation, modalPrimary, updateContact, addContact, t]);

  const handleDeleteContact = useCallback((id: string) => {
    Alert.alert(t.delete, t.deleteContactConfirm, [
      { text: t.cancel, style: 'cancel' },
      { text: t.delete, style: 'destructive', onPress: () => removeContact(id) },
    ]);
  }, [removeContact, t]);

  const handleDetectLocation = useCallback(async () => {
    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('', t.locationDenied);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      updateField('latitude', loc.coords.latitude);
      updateField('longitude', loc.coords.longitude);
      // Reverse geocode
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        if (geo) {
          const parts = [geo.street, geo.district, geo.city, geo.region].filter(Boolean);
          updateField('geocodedAddress', parts.join(', '));
          if (geo.city && !form.address.governorate) updateAddress('governorate', geo.city);
          if (geo.district && !form.address.district) updateAddress('district', geo.district);
          if (geo.street && !form.address.street) updateAddress('street', geo.street);
        }
      } catch { /* geocode optional */ }
      Alert.alert('', t.locationDetected);
    } catch {
      Alert.alert('', t.locationFailed);
    }
  }, [updateField, updateAddress, form.address, t]);

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title={t.emergencyProfile} onBack={() => navigation.goBack()} />
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title={t.emergencyProfile}
        onBack={() => navigation.goBack()}
        rightContent={
          saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <TouchableOpacity onPress={save} activeOpacity={0.6} disabled={!isDirty}>
              <Ionicons name="checkmark-circle" size={28} color={isDirty ? colors.primary : colors.textSecondary + '40'} />
            </TouchableOpacity>
          )
        }
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Status Banner */}
          {statusMsg && (
            <View style={[styles.banner, {
              backgroundColor: (statusMsg.type === 'success' ? colors.success : colors.danger) + '15',
              borderColor: (statusMsg.type === 'success' ? colors.success : colors.danger) + '30',
            }]}>
              <Ionicons name={statusMsg.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={18}
                color={statusMsg.type === 'success' ? colors.success : colors.danger} />
              <AppText style={[styles.bannerText, { color: statusMsg.type === 'success' ? colors.success : colors.danger }]}>
                {statusMsg.text}
              </AppText>
            </View>
          )}

          {/* A) Personal Info */}
          <CollapsibleSection title={t.personalInfo} icon="person-outline" defaultOpen>
            <AppInput label={t.fullName} value={form.fullName} onChangeText={(v) => updateField('fullName', v)} />
            <AppInput label={t.email} value={email} onChangeText={() => {}} editable={false} />
            <AppInput label={t.phone} value={form.phone} onChangeText={(v) => updateField('phone', v)} keyboardType="phone-pad" />
            <AppInput label={t.age} value={form.age} onChangeText={(v) => updateField('age', v)} keyboardType="numeric" />
            <AppText style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.gender}</AppText>
            <PillSelector options={[t.male, t.female]} selected={form.gender === 'male' ? t.male : form.gender === 'female' ? t.female : null}
              onSelect={(v) => updateField('gender', v === t.male ? 'male' : 'female')} />
            <AppText style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.bloodType}</AppText>
            <PillSelector options={BLOOD_TYPES} selected={form.bloodType} onSelect={(v) => updateField('bloodType', v)} />
          </CollapsibleSection>

          {/* B) Detailed Address */}
          <CollapsibleSection title={t.addressSection} icon="location-outline"
            badge={form.latitude ? '📍' : undefined}>
            <AppInput label={t.governorate} value={form.address.governorate ?? ''} onChangeText={(v) => updateAddress('governorate', v)} />
            <AppInput label={t.district} value={form.address.district ?? ''} onChangeText={(v) => updateAddress('district', v)} />
            <AppInput label={t.street} value={form.address.street ?? ''} onChangeText={(v) => updateAddress('street', v)} />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <AppInput label={t.buildingNumber} value={form.address.building_number ?? ''} onChangeText={(v) => updateAddress('building_number', v)} />
              </View>
              <View style={styles.halfField}>
                <AppInput label={t.apartmentNumber} value={form.address.apartment_number ?? ''} onChangeText={(v) => updateAddress('apartment_number', v)} />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <AppInput label={t.floorLabel} value={form.address.floor ?? ''} onChangeText={(v) => updateAddress('floor', v)} keyboardType="numeric" />
              </View>
              <View style={styles.halfField}>
                <AppText style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.apartmentSide}</AppText>
                <PillSelector options={[t.right, t.left]} selected={
                  form.address.apartment_side === 'right' ? t.right : form.address.apartment_side === 'left' ? t.left : null
                } onSelect={(v) => updateAddress('apartment_side', v === t.right ? 'right' : 'left')} />
              </View>
            </View>
            <AppInput label={t.landmarkLabel} value={form.address.landmark ?? ''} onChangeText={(v) => updateAddress('landmark', v)} />
            <AppInput label={t.addressNotes} value={form.address.extra_notes ?? ''} onChangeText={(v) => updateAddress('extra_notes', v)} multiline numberOfLines={2} />
            <TouchableOpacity onPress={handleDetectLocation} activeOpacity={0.7}
              style={[styles.locationBtn, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
              <Ionicons name="navigate-outline" size={18} color={colors.primary} />
              <AppText style={[styles.locationBtnText, { color: colors.primary }]}>{t.detectLocation}</AppText>
            </TouchableOpacity>
            {form.geocodedAddress && (
              <AppText style={[styles.geoText, { color: colors.textSecondary }]}>📍 {form.geocodedAddress}</AppText>
            )}
          </CollapsibleSection>

          {/* C) Reporter / Caregiver */}
          <CollapsibleSection title={t.reporterSection} icon="people-outline">
            <AppInput label={t.reporterName} value={form.reporter.name ?? ''} onChangeText={(v) => updateReporter('name', v)} />
            <AppText style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.reporterRelation}</AppText>
            <PillSelector options={RELATION_OPTIONS} selected={form.reporter.relationship ?? null}
              onSelect={(v) => updateReporter('relationship', v)} />
            <AppInput label={t.reporterPhone} value={form.reporter.phone ?? ''} onChangeText={(v) => updateReporter('phone', v)} keyboardType="phone-pad" />
            <View style={styles.switchRow}>
              <AppText style={[styles.switchLabel, { color: colors.textPrimary }]}>{t.isPrimaryContact}</AppText>
              <Switch value={form.reporter.is_primary_contact ?? false}
                onValueChange={(v) => updateReporter('is_primary_contact', v)}
                trackColor={{ false: '#D1D5DB', true: colors.primary + '50' }}
                thumbColor={form.reporter.is_primary_contact ? colors.primary : '#F3F4F6'} />
            </View>
          </CollapsibleSection>

          {/* D) Medical Conditions */}
          <CollapsibleSection title={t.conditionsSection} icon="fitness-outline"
            badge={form.conditions.length > 0 ? String(form.conditions.length) : undefined}>
            <ChipSelector options={conditionOptions} selected={form.conditions} onToggle={toggleCondition} />
            {form.conditions.includes('other') && (
              <AppInput label={t.otherNotes} value={form.conditionNotes} onChangeText={(v) => updateField('conditionNotes', v)} multiline numberOfLines={2} />
            )}
          </CollapsibleSection>

          {/* E) Emergency Contacts */}
          <CollapsibleSection title={t.emergencyContacts} icon="call-outline"
            badge={contacts.length > 0 ? String(contacts.length) : undefined}>
            {contacts.map((c) => (
              <EmergencyContactCard key={c.id} contact={c} isAr={isAr}
                onEdit={() => openEditContact(c.id)} onDelete={() => handleDeleteContact(c.id)} />
            ))}
            <TouchableOpacity onPress={openAddContact} activeOpacity={0.7}
              style={[styles.addBtn, { borderColor: colors.primary + '30' }]}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <AppText style={[styles.addBtnText, { color: colors.primary }]}>{t.addContact}</AppText>
            </TouchableOpacity>
          </CollapsibleSection>

          {/* F) Hospital Info */}
          <CollapsibleSection title={t.hospitalSection} icon="medkit-outline">
            <AppInput label={t.hospitalName} value={form.hospital.name ?? ''} onChangeText={(v) => updateHospital('name', v)} />
            <AppInput label={t.hospitalAddress} value={form.hospital.address ?? ''} onChangeText={(v) => updateHospital('address', v)} />
            <AppInput label={t.hospitalPhone} value={form.hospital.phone ?? ''} onChangeText={(v) => updateHospital('phone', v)} keyboardType="phone-pad" />
            <View style={styles.switchRow}>
              <AppText style={[styles.switchLabel, { color: colors.textPrimary }]}>{t.hasMedicalFile}</AppText>
              <Switch value={form.hospital.has_medical_file ?? false}
                onValueChange={(v) => updateHospital('has_medical_file', v)}
                trackColor={{ false: '#D1D5DB', true: colors.primary + '50' }}
                thumbColor={form.hospital.has_medical_file ? colors.primary : '#F3F4F6'} />
            </View>
            {form.hospital.has_medical_file && (
              <AppInput label={t.fileNumber} value={form.hospital.file_number ?? ''} onChangeText={(v) => updateHospital('file_number', v)} />
            )}
          </CollapsibleSection>

          <View style={{ height: 110 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Contact Add/Edit Modal */}
      <Modal visible={contactModal} transparent animationType="fade" onRequestClose={() => setContactModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: darkMode ? '#111827' : '#fff' }]}>
            <AppText style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {editingContactId ? t.edit : t.addContact}
            </AppText>
            <TextInput style={[styles.modalInput, { color: colors.textPrimary, borderColor: darkMode ? 'rgba(255,255,255,0.10)' : '#E2E8F0' }]}
              placeholder={t.contactName} placeholderTextColor={colors.textSecondary} value={modalName} onChangeText={setModalName} />
            <TextInput style={[styles.modalInput, { color: colors.textPrimary, borderColor: darkMode ? 'rgba(255,255,255,0.10)' : '#E2E8F0' }]}
              placeholder={t.contactPhone} placeholderTextColor={colors.textSecondary} value={modalPhone} onChangeText={setModalPhone} keyboardType="phone-pad" />
            <AppText style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t.contactRelation}</AppText>
            <PillSelector options={RELATION_OPTIONS} selected={modalRelation} onSelect={setModalRelation} />
            <View style={[styles.switchRow, { marginTop: 12 }]}>
              <AppText style={[styles.switchLabel, { color: colors.textPrimary }]}>{t.primaryContact}</AppText>
              <Switch value={modalPrimary} onValueChange={setModalPrimary}
                trackColor={{ false: '#D1D5DB', true: colors.primary + '50' }} thumbColor={modalPrimary ? colors.primary : '#F3F4F6'} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setContactModal(false)}
                style={[styles.modalBtn, { backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}>
                <AppText style={{ color: colors.textSecondary, fontWeight: '600' }}>{t.cancel}</AppText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveContact}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}>
                <AppText style={{ color: '#fff', fontWeight: '700' }}>{t.done}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: 14, borderWidth: 1 },
  bannerText: { fontSize: 14, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs, marginBottom: 4 },
  row: { flexDirection: 'row', gap: spacing.sm },
  halfField: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  locationBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  locationBtnText: { fontSize: 14, fontWeight: '700' },
  geoText: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  addBtnText: { fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { borderRadius: 24, padding: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
