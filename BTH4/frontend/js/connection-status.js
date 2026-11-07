const badge = document.getElementById("connection-status");

async function updateConnectionStatus() {
  if (!badge) return;

  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Backend offline");
    const state = await response.json();

    if (!state.mqttConnected) {
      badge.textContent = "MQTT ng\u1eaft k\u1ebft n\u1ed1i";
      badge.className = "badge warning";
    } else if (!state.deviceOnline) {
      badge.textContent = "ESP8266 offline";
      badge.className = "badge warning";
    } else {
      badge.textContent = "\u0110\u00e3 k\u1ebft n\u1ed1i";
      badge.className = "badge success";
    }
  } catch {
    badge.textContent = "Backend offline";
    badge.className = "badge warning";
  }
}

updateConnectionStatus();
setInterval(updateConnectionStatus, 2000);
