"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker so the PWA is installable and has basic offline support. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is a nice-to-have; a failed registration shouldn't break the app.
    });
  }, []);

  return null;
}
