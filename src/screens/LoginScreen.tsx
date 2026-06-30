import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/ui/Screen';
import { AppText } from '../components/ui/AppText';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { SegmentedToggle } from '../components/ui/SegmentedToggle';
import { AuthTopControls } from '../components/AuthTopControls';
import { spacing, radius } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useAuthStore } from '../store/auth.store';
import { useAppStore } from '../store/app.store';
import { authService } from '../services/auth.service';
import { translations } from '../constants/translations';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const EMAIL_NOT_CONFIRMED_PATTERNS = [
  'email not confirmed',
  'email_not_confirmed',
];

function isEmailNotConfirmedError(message: string): boolean {
  const lower = message.toLowerCase();
  return EMAIL_NOT_CONFIRMED_PATTERNS.some((p) => lower.includes(p));
}

function isInvalidCredentialsError(message: string): boolean {
  return message.toLowerCase().includes('invalid login credentials');
}

type BannerType = 'error' | 'info' | 'success';

function StatusBanner({
  message,
  type,
  darkMode,
  colors,
  onAction,
  actionLabel,
  actionLoading,
}: {
  message: string;
  type: BannerType;
  darkMode: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
}) {
  const bgMap: Record<BannerType, string> = {
    error: darkMode ? 'rgba(255,59,59,0.12)' : 'rgba(255,59,59,0.08)',
    info: darkMode ? 'rgba(0,194,255,0.12)' : 'rgba(0,119,200,0.08)',
    success: darkMode ? 'rgba(52,199,89,0.12)' : 'rgba(52,199,89,0.08)',
  };
  const borderMap: Record<BannerType, string> = {
    error: darkMode ? 'rgba(255,59,59,0.30)' : 'rgba(255,59,59,0.20)',
    info: darkMode ? 'rgba(0,194,255,0.30)' : 'rgba(0,119,200,0.20)',
    success: darkMode ? 'rgba(52,199,89,0.30)' : 'rgba(52,199,89,0.20)',
  };
  const iconMap: Record<BannerType, string> = {
    error: 'alert-circle',
    info: 'mail-outline',
    success: 'checkmark-circle',
  };
  const iconColorMap: Record<BannerType, string> = {
    error: '#FF3B3B',
    info: '#00C2FF',
    success: '#34C759',
  };

  return (
    <View style={[bannerStyles.container, { backgroundColor: bgMap[type], borderColor: borderMap[type] }]}
      accessibilityRole="alert"
      accessible
    >
      <View style={bannerStyles.row}>
        <Ionicons name={iconMap[type] as keyof typeof Ionicons.glyphMap} size={20} color={iconColorMap[type]} style={bannerStyles.icon} />
        <AppText style={[bannerStyles.text, { color: colors.textPrimary }]}>
          {message}
        </AppText>
      </View>
      {onAction && actionLabel && (
        <TouchableOpacity
          onPress={onAction}
          disabled={actionLoading}
          activeOpacity={0.7}
          style={[bannerStyles.actionBtn, { borderColor: borderMap[type] }]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <AppText style={[bannerStyles.actionText, { color: iconColorMap[type] }]}>
            {actionLoading ? '...' : actionLabel}
          </AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  icon: { marginTop: 2 },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: 30,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

function ForgotPasswordModal({
  visible,
  onClose,
  isAr,
  colors,
  darkMode,
}: {
  visible: boolean;
  onClose: () => void;
  isAr: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  darkMode: boolean;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        isAr ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email',
      );
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(trimmed);
      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert(
        isAr ? 'خطأ' : 'Error',
        msg,
      );
    } finally {
      setLoading(false);
    }
  }, [email, isAr]);

  const handleClose = useCallback(() => {
    setEmail('');
    setSent(false);
    setLoading(false);
    onClose();
  }, [onClose]);

  const modalBg = darkMode ? 'rgba(0,0,0,0.70)' : 'rgba(0,0,0,0.40)';
  const cardBg = darkMode ? '#1E293B' : '#FFFFFF';
  const inputBg = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const inputBorder = colors.border;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={[fpStyles.overlay, { backgroundColor: modalBg }]}>
        <View
          style={[fpStyles.card, { backgroundColor: cardBg, borderColor: colors.border }]}
          accessible
          accessibilityLabel={isAr ? 'إعادة تعيين كلمة المرور' : 'Reset password'}
        >
          {}
          <TouchableOpacity
            onPress={handleClose}
            style={fpStyles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={isAr ? 'إغلاق' : 'Close'}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <Ionicons name="mail-unread-outline" size={48} color={colors.primary} style={fpStyles.icon} />

          <AppText style={[fpStyles.title, { color: colors.textPrimary }]}>
            {sent
              ? (isAr ? 'تم الإرسال!' : 'Email Sent!')
              : (isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Password')
            }
          </AppText>

          <AppText style={[fpStyles.subtitle, { color: colors.textSecondary }]}>
            {sent
              ? (isAr
                ? 'إذا كان البريد مسجلاً لدينا، ستصل رسالة ب رابط إعادة التعيين.'
                : 'If the email is registered, you will receive a reset link.')
              : (isAr
                ? 'أدخل بريدك الإلكتروني وسنرسل لك رابط لإعادة تعيين كلمة المرور.'
                : 'Enter your email and we will send you a password reset link.')
            }
          </AppText>

          {!sent && (
            <>
              <View style={[fpStyles.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}>
                <TextInput
                  style={[fpStyles.input, { color: colors.textPrimary }]}
                  placeholder="example@email.com"
                  placeholderTextColor={colors.textSecondary + '80'}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textContentType="emailAddress"
                  returnKeyType="go"
                  onSubmitEditing={handleReset}
                  accessibilityLabel={isAr ? 'البريد الإلكتروني' : 'Email address'}
                  autoFocus
                />
              </View>

              <AppButton
                title={loading
                  ? (isAr ? 'جاري الإرسال...' : 'Sending...')
                  : (isAr ? 'إرسال رابط إعادة التعيين' : 'Send Reset Link')
                }
                variant="tertiary"
                onPress={handleReset}
                loading={loading}
                disabled={loading || !email.trim()}
                style={fpStyles.submitBtn}
              />
            </>
          )}

          {sent && (
            <AppButton
              title={isAr ? 'العودة لتسجيل الدخول' : 'Back to Login'}
              variant="outlined"
              onPress={handleClose}
              style={fpStyles.backBtn}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const fpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 16,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
    borderRadius: 20,
  },
  icon: {
    marginTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  inputWrap: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  input: {
    fontSize: 15,
    fontWeight: '500',
  },
  submitBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
  },
  backBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
});

export function LoginScreen({ navigation }: Props): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [banner, setBanner] = useState<{ message: string; type: BannerType; showResend: boolean } | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const t = translations[language];
  const signIn = useAuthStore((s) => s.signIn);
  const isAr = language === 'ar';

  const backBg = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const backBorder = darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  const handleLogin = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setBanner({
        message: isAr ? 'يرجى إدخال البريد الإلكتروني وكلمة المرور' : 'Please enter email and password.',
        type: 'error',
        showResend: false,
      });
      return;
    }

    setBanner(null);
    setLoading(true);
    try {
      await signIn(trimmedEmail, password);
    } catch (error: unknown) {
      const rawMsg = error instanceof Error ? error.message : 'Unknown error';

      if (isEmailNotConfirmedError(rawMsg)) {
        setBanner({
          message: isAr
            ? 'يرجى تأكيد البريد الإلكتروني أولاً ثم تسجيل الدخول'
            : 'Please verify your email before logging in.',
          type: 'info',
          showResend: true,
        });
      } else if (isInvalidCredentialsError(rawMsg)) {
        setBanner({
          message: isAr
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.\nإذا سجلت مؤخراً، تأكد من تفعيل بريدك الإلكتروني.'
            : 'Incorrect email or password.\nIf you signed up recently, make sure to verify your email.',
          type: 'error',
          showResend: true,
        });
      } else {
        setBanner({
          message: rawMsg,
          type: 'error',
          showResend: false,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, signIn, isAr]);

  const handleResend = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setResending(true);
    try {
      await authService.resendVerification(trimmedEmail);
      setBanner({
        message: isAr
          ? 'تم إرسال رابط التحقق إلى بريدك الإلكتروني'
          : 'Verification link sent to your email.',
        type: 'success',
        showResend: false,
      });
    } catch {
      setBanner({
        message: isAr
          ? 'تعذر إرسال رابط التحقق، حاول مرة أخرى'
          : 'Could not send verification link. Try again.',
        type: 'error',
        showResend: true,
      });
    } finally {
      setResending(false);
    }
  }, [email, isAr]);

  return (
    <Screen style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('Welcome')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isAr ? 'رجوع' : 'Go back'}
            >
              <View style={[styles.backCircle, { backgroundColor: backBg, borderColor: backBorder }]}>
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </View>
            </TouchableOpacity>
            <AuthTopControls />
          </View>

          {}
          <View style={styles.toggleWrap}>
            <SegmentedToggle
              options={[
                { label: t.login, value: 'login' },
                { label: t.signup, value: 'signup' },
              ]}
              activeValue="login"
              onChange={(val) => {
                if (val === 'signup') navigation.replace('SignUp');
              }}
            />
          </View>

          {}
          {banner && (
            <StatusBanner
              message={banner.message}
              type={banner.type}
              darkMode={darkMode}
              colors={colors}
              onAction={banner.showResend ? handleResend : undefined}
              actionLabel={banner.showResend
                ? (isAr ? 'إعادة إرسال التحقق' : 'Resend verification')
                : undefined
              }
              actionLoading={resending}
            />
          )}

          <View style={styles.form}>
            <AppInput
              label={t.email}
              placeholder="example@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
              accessibilityLabel={t.email}
            />

            <AppInput
              label={t.password}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secure}
              isPassword
              onToggleSecure={() => setSecure(!secure)}
              textContentType="password"
              accessibilityLabel={t.password}
            />

            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.forgot}
              onPress={() => setShowForgotModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t.forgotPassword}
            >
              <AppText style={[styles.forgotText, { color: colors.secondary }]}>
                {t.forgotPassword}
              </AppText>
            </TouchableOpacity>

            <AppButton
              title={loading
                ? (isAr ? 'جاري الدخول...' : 'Signing in...')
                : t.login
              }
              variant="tertiary"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.submit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {}
      <ForgotPasswordModal
        visible={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        isAr={isAr}
        colors={colors}
        darkMode={darkMode}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleWrap: {
    marginBottom: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  forgot: {
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submit: {
    marginTop: spacing.lg,
    height: 58,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
});