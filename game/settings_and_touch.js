/**
 * game/settings_and_touch.js — Game Settings Modal (Graphics Quality, Frame Pacing, Audio, Touch Controls)
 * and Multi-Touch On-Screen Controls for Mobile Devices.
 */

import { DEMO_ACTIONS, DEMO_EVENTS, bus, state, dispatchAction } from "../contract.js";

export function initGameSettingsAndTouch() {
  const btnOpenHub = document.getElementById("btn-settings-hub");
  const modal = document.getElementById("game-settings-modal");
  const backdrop = document.getElementById("settings-modal-backdrop");
  const btnCloseHub = document.getElementById("btn-close-settings-hub");

  const selectQuality = document.getElementById("graphics-quality-select");
  const fpsSelect = document.getElementById("settings-fps-select");
  const btnSettingsAudio = document.getElementById("btn-settings-audio");
  const btnToggleTouchPad = document.getElementById("btn-toggle-touch-controls");
  const statusBanner = document.getElementById("settings-status-banner");
  const statusText = document.getElementById("settings-status-text");

  const touchControlsEl = document.getElementById("mobile-touch-controls");
  const touchButtons = Array.from(document.querySelectorAll("[data-touch-key]"));
  const touchHopBtn = document.getElementById("touch-btn-hop");
  const touchBellBtn = document.getElementById("touch-btn-bell");
  const touchRoamBtn = document.getElementById("touch-btn-roam");

  const isMobileUa =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "");
  const isTouchScreen =
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(pointer: coarse)")?.matches || isMobileUa);

  let isTouchControlsVisible = isTouchScreen;
  let statusTimerId = null;

  function showStatus(msg, tone = "info") {
    if (!statusBanner || !statusText) return;
    statusText.textContent = msg;
    statusBanner.classList.remove("is-hidden", "tone-info", "tone-success");
    statusBanner.classList.add(tone === "success" ? "tone-success" : "tone-info");
    statusBanner.hidden = false;
    if (statusTimerId) clearTimeout(statusTimerId);
    statusTimerId = setTimeout(() => {
      statusBanner.classList.add("is-hidden");
      statusBanner.hidden = true;
      statusTimerId = null;
    }, 3200);
  }

  function setTouchControlsVisible(visible) {
    isTouchControlsVisible = Boolean(visible);
    if (touchControlsEl) {
      touchControlsEl.classList.toggle("is-hidden", !isTouchControlsVisible);
      touchControlsEl.hidden = !isTouchControlsVisible;
    }
    if (btnToggleTouchPad) {
      btnToggleTouchPad.setAttribute("aria-pressed", isTouchControlsVisible ? "true" : "false");
      btnToggleTouchPad.classList.toggle("is-active", isTouchControlsVisible);
      const lbl = btnToggleTouchPad.querySelector(".touch-toggle-label");
      if (lbl) {
        lbl.textContent = isTouchControlsVisible
          ? "Hide On-Screen Touch Controls"
          : "Enable Mobile Touch Controls";
      }
    }
  }

  function syncAudioButton(enabled = state.audioEnabled) {
    if (!btnSettingsAudio) return;
    const isOn = Boolean(enabled);
    btnSettingsAudio.setAttribute("aria-pressed", isOn ? "true" : "false");
    btnSettingsAudio.classList.toggle("is-active", isOn);
    const lbl = btnSettingsAudio.querySelector(".audio-toggle-label");
    if (lbl) {
      lbl.textContent = isOn ? "Sound & Music: ON" : "Sound & Music: OFF";
    }
  }

  function syncQualitySelect(tier = state.qualityTier) {
    if (!selectQuality) return;
    const normalized = ["low", "medium", "high"].includes(String(tier).toLowerCase())
      ? String(tier).toLowerCase()
      : "low";
    if (selectQuality.value !== normalized) {
      selectQuality.value = normalized;
    }
  }

  function setModalOpen(open) {
    if (!modal) return;
    const isOpen = Boolean(open);
    if (isOpen) {
      syncQualitySelect(state.qualityTier);
      syncAudioButton(state.audioEnabled);
    }
    modal.classList.toggle("is-hidden", !isOpen);
    modal.hidden = !isOpen;
    modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (btnOpenHub) {
      btnOpenHub.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }
  }

  // Initialize states
  setTouchControlsVisible(isTouchControlsVisible);
  syncQualitySelect(state.qualityTier);
  syncAudioButton(state.audioEnabled);

  if (btnOpenHub) {
    btnOpenHub.addEventListener("click", () => {
      const currentlyHidden = modal ? modal.hidden || modal.classList.contains("is-hidden") : true;
      setModalOpen(currentlyHidden);
    });
  }
  if (btnCloseHub) {
    btnCloseHub.addEventListener("click", () => setModalOpen(false));
  }
  if (backdrop) {
    backdrop.addEventListener("click", () => setModalOpen(false));
  }

  if (selectQuality) {
    selectQuality.addEventListener("change", () => {
      const targetTier = selectQuality.value || "low";
      dispatchAction(DEMO_ACTIONS.SET_QUALITY, {
        qualityTier: targetTier,
        forceExternal: true,
      });
      showStatus(
        `Graphics Quality set to ${targetTier.toUpperCase()} (all 16 realistic 3D models & PBR textures preserved).`,
        "success"
      );
    });
  }

  if (fpsSelect) {
    fpsSelect.addEventListener("change", () => {
      const val = fpsSelect.value;
      if (val === "battery") {
        window.__targetFpsCap = 45;
      } else if (val === "120fps") {
        window.__targetFpsCap = 120;
      } else {
        window.__targetFpsCap = 60;
      }
      showStatus(
        `Frame pacing set to ${
          val === "battery"
            ? "Battery Saver (45 FPS thermal cap)"
            : val === "120fps"
              ? "120Hz High-Refresh"
              : "60 FPS Locked"
        }.`,
        "success"
      );
    });
  }

  if (btnSettingsAudio) {
    btnSettingsAudio.addEventListener("click", () => {
      const next = !state.audioEnabled;
      dispatchAction(DEMO_ACTIONS.TOGGLE_AUDIO, { enabled: next, source: "settings_modal" });
      syncAudioButton(next);
      showStatus(
        next ? "Soundtrack & campus acoustics enabled." : "Audio muted (0% audio CPU usage).",
        "info"
      );
    });
  }

  if (btnToggleTouchPad) {
    btnToggleTouchPad.addEventListener("click", () => {
      setTouchControlsVisible(!isTouchControlsVisible);
      if (isTouchControlsVisible) {
        if (state.gameMode !== "free_roam") {
          dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: true, source: "mobile_touch" });
        }
        showStatus("On-screen Mobile Touch Controls enabled (Free Roam active).", "success");
      } else {
        showStatus("On-screen Mobile Touch Controls hidden.", "info");
      }
    });
  }

  const onQualityChanged = (e) => {
    syncQualitySelect(e.detail?.qualityTier || state.qualityTier);
  };
  const onAudioToggled = (e) => {
    syncAudioButton(Boolean(e.detail?.enabled ?? state.audioEnabled));
  };
  bus.addEventListener(DEMO_EVENTS.QUALITY_CHANGED, onQualityChanged);
  bus.addEventListener(DEMO_EVENTS.AUDIO_TOGGLED, onAudioToggled);

  function setTouchKey(keyName, isDown) {
    if (typeof window === "undefined") return;
    window.__inputKeys = window.__inputKeys || {
      up: false,
      down: false,
      left: false,
      right: false,
      hop: false,
      bell: false,
    };
    window.__inputKeys[keyName] = Boolean(isDown);
    if (isDown && state.gameMode !== "free_roam") {
      dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: true, source: "mobile_touch" });
    }
  }

  for (const btn of touchButtons) {
    const keyName = btn.getAttribute("data-touch-key");
    if (!keyName) continue;
    const press = (e) => {
      if (e.cancelable) e.preventDefault();
      if (typeof btn.setPointerCapture === "function" && e.pointerId !== undefined) {
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_err) {}
      }
      btn.classList.add("is-pressed");
      setTouchKey(keyName, true);
    };
    const release = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (typeof btn.releasePointerCapture === "function" && e && e.pointerId !== undefined) {
        try {
          if (btn.hasPointerCapture?.(e.pointerId)) {
            btn.releasePointerCapture(e.pointerId);
          }
        } catch (_err) {}
      }
      btn.classList.remove("is-pressed");
      setTouchKey(keyName, false);
    };
    btn.addEventListener("pointerdown", press, { passive: false });
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
    btn.addEventListener("pointerleave", release);
  }

  if (touchHopBtn) {
    touchHopBtn.addEventListener("click", (e) => {
      e.preventDefault();
      dispatchAction(DEMO_ACTIONS.BUNNY_HOP, { source: "mobile_touch" });
    });
  }

  if (touchBellBtn) {
    touchBellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      dispatchAction(DEMO_ACTIONS.RING_BELL, { source: "mobile_touch" });
    });
  }

  if (touchRoamBtn) {
    touchRoamBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const nextRoam = state.gameMode !== "free_roam";
      dispatchAction(DEMO_ACTIONS.SET_FREE_ROAM, { enabled: nextRoam, source: "mobile_touch" });
    });
  }

  return {
    setModalOpen,
    setTouchControlsVisible,
    dispose() {
      bus.removeEventListener(DEMO_EVENTS.QUALITY_CHANGED, onQualityChanged);
      bus.removeEventListener(DEMO_EVENTS.AUDIO_TOGGLED, onAudioToggled);
      if (statusTimerId) clearTimeout(statusTimerId);
    },
  };
}
