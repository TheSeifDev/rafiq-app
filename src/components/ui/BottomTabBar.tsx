/**
 * BottomTabBar - Production-grade iOS-style navigation
 * Tabs: Home · Emergency · Medications · Chat · Profile
 */
import React, { memo, useCallback } from "react";
import { View, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AppText } from "./AppText";
import { useTheme } from "../../theme/useTheme";
import { useAppStore } from "../../store/app.store";
import { translations } from "../../constants/translations";

const TABS: Record<
  string,
  {
    active: keyof typeof Ionicons.glyphMap;
    inactive: keyof typeof Ionicons.glyphMap;
    labelKey: keyof (typeof translations)["en"];
    accentColor?: string;
  }
> = {
  Home: { active: "home", inactive: "home-outline", labelKey: "home" },
  Emergency: {
    active: "shield-checkmark",
    inactive: "shield-checkmark-outline",
    labelKey: "emergency",
    accentColor: "#FF3B3B",
  },
  Medications: {
    active: "medical",
    inactive: "medical-outline",
    labelKey: "medications",
  },
  Chat: {
    active: "chatbubbles",
    inactive: "chatbubbles-outline",
    labelKey: "chat",
  },
  Profile: {
    active: "person-circle",
    inactive: "person-circle-outline",
    labelKey: "profile",
  },
};

/**
 * Tab Button - Clean, production-ready
 */
const TabButton = memo(function TabButton({
  isFocused,
  label,
  tab,
  onPress,
  colors,
}: {
  route: { key: string; name: string };
  isFocused: boolean;
  label: string;
  tab: (typeof TABS)[string];
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const handlePress = useCallback(() => {
    if (!isFocused) {
      onPress();
    }
  }, [isFocused, onPress]);

  const activeColor = tab.accentColor ?? colors.primary;
  const iconColor = isFocused ? activeColor : colors.textSecondary;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.tabButton}
      android_ripple={{ color: colors.primarySoft, borderless: true }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
    >
      {/* Icon */}
      <View style={styles.iconContainer}>
        <Ionicons
          name={isFocused ? tab.active : tab.inactive}
          size={24}
          color={iconColor}
        />
      </View>

      {/* Label */}
      <AppText
        style={[
          styles.label,
          {
            color: iconColor,
            fontWeight: isFocused ? "600" : "500",
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </Pressable>
  );
});

/**
 * Bottom Tab Bar - Premium iOS-style navigation
 */
export function BottomTabBar({
  state,
  navigation,
}: BottomTabBarProps): React.JSX.Element {
  const { colors, darkMode } = useTheme();
  const language = useAppStore((s) => s.language);
  const t = translations[language];

  const bottomPadding = Platform.OS === "ios" ? 28 : 16;

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingBottom: bottomPadding,
        },
      ]}
    >
      {/* Background blur */}
      <BlurView
        intensity={darkMode ? 30 : 80}
        tint={darkMode ? "dark" : "light"}
        style={styles.blurWrapper}
      >
        <View
          style={[
            styles.bar,
            {
              backgroundColor: darkMode
                ? colors.surface + "E6"
                : colors.surface + "F2",
              borderColor: colors.border + "40",
            },
          ]}
        >
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const tab = TABS[route.name];
            if (!tab) return null;

            const label = (t as Record<string, string>)[tab.labelKey] ?? route.name;

            return (
              <TabButton
                key={route.key}
                route={route}
                isFocused={isFocused}
                label={label}
                tab={tab}
                onPress={() => navigation.navigate(route.name)}
                colors={colors}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "transparent",
    zIndex: 100,
    pointerEvents: "box-none",
  },
  blurWrapper: {
    borderRadius: 20,
    overflow: "hidden",
  },
  bar: {
    flexDirection: "row",
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  iconContainer: {
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});