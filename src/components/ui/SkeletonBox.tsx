import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../../theme/useTheme';

interface SkeletonBoxProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: Record<string, unknown>;
}

export function SkeletonBox({ width, height, borderRadius = 8, style }: SkeletonBoxProps): React.JSX.Element {
  const { darkMode } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const baseColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <Animated.View
      style={[
        styles.box,
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
          opacity,
        },
        style as Record<string, unknown>,
      ]}
      accessible
      accessibilityLabel="Loading"
    />
  );
}

interface SkeletonLineProps {
  width?: number | string;
  gap?: number;
}

export function SkeletonLine({ width = '100%', gap = 10 }: SkeletonLineProps): React.JSX.Element {
  return <SkeletonBox width={width} height={14} borderRadius={7} />;
}

export function SkeletonTextBlock({ lines = 3 }: { lines?: number }): React.JSX.Element {
  return (
    <View style={[styles.textBlock, { gap: 10 }]}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBox
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height={14}
          borderRadius={7}
        />
      ))}
    </View>
  );
}

export function SkeletonCard(): React.JSX.Element {
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={styles.cardHeader}>
        <SkeletonBox width={40} height={40} borderRadius={12} />
        <View style={[styles.cardHeaderText, { gap: 8 }]}>
          <SkeletonBox width={120} height={16} borderRadius={8} />
          <SkeletonBox width={80} height={12} borderRadius={6} />
        </View>
      </View>
      <SkeletonTextBlock lines={2} />
    </View>
  );
}

export function HomeScreenSkeleton(): React.JSX.Element {
  return (
    <View style={[styles.container, { gap: 20 }]}>
      {/* Header skeleton */}
      <View style={{ gap: 8 }}>
        <SkeletonBox width={140} height={16} borderRadius={8} />
        <SkeletonBox width={200} height={30} borderRadius={12} />
        <SkeletonBox width={180} height={16} borderRadius={8} />
      </View>

      {/* AI Insight skeleton */}
      <SkeletonCard />

      {/* Medications skeleton */}
      <SkeletonCard />

      {/* Nutrition skeleton */}
      <View style={{ gap: 12 }}>
        <SkeletonBox width={140} height={20} borderRadius={10} />
        <SkeletonTextBlock lines={3} />
      </View>

      {/* Health Tips skeleton */}
      <View style={{ gap: 12 }}>
        <SkeletonBox width={120} height={20} borderRadius={10} />
        <SkeletonTextBlock lines={3} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {},
  textBlock: {},
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    padding: 16,
    backgroundColor: 'transparent',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});