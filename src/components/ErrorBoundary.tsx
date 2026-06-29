import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error, errorInfo);

    if (__DEV__) {
      Alert.alert(
        'خطأ في التطبيق',
        `حدث خطأ غير متوقع: ${error.message}\n\nيرجى الإبلاغ عن هذا الخطأ للمطورين.`,
        [
          { text: 'تم', style: 'cancel' },
          {
            text: 'إرسال تقرير',
            onPress: () => {
              console.log('Error report would be sent here:', {
                message: error.message,
                stack: error.stack,
                info: errorInfo.componentStack
              });
            }
          }
        ]
      );
    }
  }

  public resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      const FallbackComponent = fallback || ErrorFallback;

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
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.errorTitle}>{t('errorBoundary.title')}</Text>
      <Text style={styles.errorMessage}>
        {t('errorMessage')}
      </Text>
      <Text style={styles.errorDetails}>
        {error.message}
      </Text>
      <Button
        title={t('tryAgain')}
        onPress={tryAgain}
        color="#0066CC"
      />
      <Button
        title={t('closeApp')}
        onPress={resetError}
        color="#CC6666"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#d32f2f',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#424242',
    marginBottom: 15,
    textAlign: 'center',
  },
  errorDetails: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 25,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ErrorBoundary;