"use client";

import { useCallback, useEffect, useState } from "react";
import { getOhsee, isElectronRuntime } from "@/lib/electron";

/**
 * Reads and updates the Electron data dir — the folder where projects, reports,
 * and screenshots live. Shared by the settings overlay and the settings page so
 * both surfaces stay in sync. The data dir is read once at app startup, so a
 * change is staged (`pendingDir`) and applied on the next `restart()`.
 *
 * `available` is false in the web build (and before mount): callers should
 * render nothing when it's false.
 */
export function useDataDir() {
  const [mounted, setMounted] = useState(false);
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [pendingDir, setPendingDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const ohsee = getOhsee();
    if (!ohsee?.meta) return;
    ohsee.meta
      .getDataDir()
      .then(setDataDir)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [mounted]);

  const change = useCallback(async () => {
    const ohsee = getOhsee();
    if (!ohsee?.meta) return;
    try {
      const chosen = await ohsee.meta.chooseDataDir();
      if (!chosen || chosen === (pendingDir ?? dataDir)) return;
      await ohsee.meta.setDataDir(chosen);
      setPendingDir(chosen);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dataDir, pendingDir]);

  const reveal = useCallback(async () => {
    const ohsee = getOhsee();
    if (!ohsee?.meta) return;
    try {
      await ohsee.meta.openDataDir();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const restart = useCallback(async () => {
    await getOhsee()?.meta?.relaunch();
  }, []);

  return {
    available: mounted && isElectronRuntime(),
    dataDir,
    pendingDir,
    displayed: pendingDir ?? dataDir,
    error,
    change,
    reveal,
    restart,
  };
}
