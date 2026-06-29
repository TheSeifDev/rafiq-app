export interface ChatTheme {
  background: string;
  surface: string;
  surfaceElevated: string;

  userBubble: string;
  userBubbleText: string;
  aiBubble: string;
  aiBubbleText: string;

  inputBackground: string;
  inputBorder: string;
  inputBorderFocused: string;
  inputText: string;
  inputPlaceholder: string;

  primary: string;
  primarySoft: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;

  online: string;
  thinking: string;

  border: string;
  borderLight: string;

  shadowBubble: string;
  shadowInput: string;
}

export const lightTheme: ChatTheme = {
  background: '#F0F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  userBubble: '#2563EB',
  userBubbleText: '#FFFFFF',
  aiBubble: '#FFFFFF',
  aiBubbleText: '#1A1A2E',

  inputBackground: '#EEF0F5',
  inputBorder: '#D9DCE4',
  inputBorderFocused: '#2563EB',
  inputText: '#1A1A2E',
  inputPlaceholder: '#8E93A4',

  primary: '#2563EB',
  primarySoft: 'rgba(37, 99, 235, 0.08)',

  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  online: '#22C55E',
  thinking: '#2563EB',

  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  shadowBubble: 'rgba(0, 0, 0, 0.05)',
  shadowInput: 'rgba(0, 0, 0, 0.06)',
};

export const darkTheme: ChatTheme = {
  background: '#0B0D14',
  surface: '#151822',
  surfaceElevated: '#1E2130',

  userBubble: '#3B6CF5',
  userBubbleText: '#FFFFFF',
  aiBubble: '#1A1D2B',
  aiBubbleText: '#E4E6EF',

  inputBackground: '#1A1D2B',
  inputBorder: '#2A2D3D',
  inputBorderFocused: '#3B6CF5',
  inputText: '#E4E6EF',
  inputPlaceholder: '#5C6078',

  primary: '#3B6CF5',
  primarySoft: 'rgba(59, 108, 245, 0.12)',

  textPrimary: '#F0F1F6',
  textSecondary: '#8B8FA6',
  textTertiary: '#5C6078',

  online: '#22C55E',
  thinking: '#3B6CF5',

  border: '#22253A',
  borderLight: '#181B28',

  shadowBubble: 'rgba(0, 0, 0, 0.25)',
  shadowInput: 'rgba(0, 0, 0, 0.35)',
};

export function getChatTheme(isDark: boolean): ChatTheme {
  return isDark ? darkTheme : lightTheme;
}

export default { lightTheme, darkTheme, getChatTheme };