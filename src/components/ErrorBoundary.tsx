import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { logger } from '../lib/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<{
    error: Error;
    resetError: () => void;
    tryAgain: () => void;
  }>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.critical('Unhandled component error', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    } as unknown as Record<string, unknown>, 'ErrorBoundary');
  }

  public resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      const FallbackComponent = fallback ?? ErrorFallback;
      return (
        <FallbackComponent
          error={error}
          resetError={this.resetError}
          tryAgain={this.resetError}
        />
      );
    }

    return children;
  }
}

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  tryAgain: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetError, tryAgain }) => {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      accessibilityRole="alert"
      accessible
    >
      <View style={styles.container}>
        <View
          style={styles.iconWrap}
          accessibilityLabel="Error icon"
        >
          <Text style={styles.iconText}>!</Text>
        </View>

        <Text style={styles.errorTitle} accessibilityRole="header">
          حدث خطأ غير متوقع
        </Text>

        <Text style={styles.errorMessage}>
          نعتذر عن هذا الخطأ. يمكنك المحاولة مرة أخرى أو العودة للشاشة الرئيسية.
        </Text>

        <View style={styles.detailsCard} accessibilityLabel={`Error: ${error.message}`}>
          <Text style={styles.detailsLabel} accessibilityRole="header">
            تفاصيل الخطأ
          </Text>
          <Text style={styles.errorDetails} numberOfLines={8}>
            {error.message}
          </Text>
        </View>

        <TouchableOpacity
          onPress={tryAgain}
          activeOpacity={0.7}
          style={styles.tryAgainBtn}
          accessibilityRole="button"
          accessibilityLabel="حاول مرة أخرى"
          accessibilityHint="إعادة تحميل الشاشة الحالية"
        >
          <Text style={styles.tryAgainText}>حاول مرة أخرى</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={resetError}
          activeOpacity={0.7}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="إغلاق"
        >
          <Text style={styles.closeText}>إغلاق</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0A0F1C',
    gap: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 59, 59, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 59, 59, 0.30)',
  },
  iconText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF3B3B',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    gap: 8,
  },
  detailsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
  },
  errorDetails: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 20,
  },
  tryAgainBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: '#00C2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tryAgainText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0F1C',
  },
  closeBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.60)',
  },
});

export default ErrorBoundary;
