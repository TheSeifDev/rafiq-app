/**
 * useNotificationPermission — Reusable notification permission hook
 *
 * Handles the full lifecycle:
 * 1. Check current permission status on mount
 * 2. Request permissions with graceful denial handling
 * 3. Open device settings if denied
 * 4. Returns clear status for UI rendering
 *
 * Compatible with Expo Go, Android, iOS.
 */
import { useState, useEffect, useCallback } from "react";
import { notificationPermissionService, type PermissionStatus } from "../services/notifications/notificationPermission.service";

export interface UseNotificationPermissionResult {
  /** Current permission status */
  status: PermissionStatus;
  /** Whether the initial check is still running */
  isLoading: boolean;
  /** Request permission — resolves to new status */
  request: () => Promise<PermissionStatus>;
  /** Open device notification settings for manual re-enable */
  openSettings: () => Promise<void>;
  /** True when permission is granted */
  isGranted: boolean;
  /** True when permission is denied (user must go to settings) */
  isDenied: boolean;
  /** True when not yet asked */
  isUndetermined: boolean;
}

export function useNotificationPermission(): UseNotificationPermissionResult {
  const [status, setStatus] = useState<PermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);

  // Check on mount
  useEffect(() => {
    let mounted = true;
    notificationPermissionService
      .checkPermissionState()
      .then((s) => {
        if (mounted) setStatus(s);
      })
      .catch(() => {
        if (mounted) setStatus("undetermined");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const request = useCallback(async (): Promise<PermissionStatus> => {
    setIsLoading(true);
    try {
      const newStatus = await notificationPermissionService.requestPermissions();
      setStatus(newStatus);
      return newStatus;
    } catch {
      setStatus("denied");
      return "denied";
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openSettings = useCallback(async (): Promise<void> => {
    await notificationPermissionService.openPhoneNotificationSettings();
  }, []);

  return {
    status,
    isLoading,
    request,
    openSettings,
    isGranted: status === "granted",
    isDenied: status === "denied",
    isUndetermined: status === "undetermined",
  };
}
