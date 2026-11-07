function setupDevices() {
  const demo = loadDemo();
  document.querySelectorAll(".device").forEach(device => {
    const id = device.querySelector("h3").textContent.trim();
    const input = device.querySelector("input");
    input.checked = Boolean(demo.leds[id]);
    const control = device.querySelector(".device-control");
    device.querySelector(".device-state").setAttribute("aria-live", "polite");
    input.addEventListener("change", async () => {
      const nextOn = input.checked;
      
      input.checked = !nextOn;
      input.disabled = true; 
      control.classList.add("loading");
      control.setAttribute("aria-busy", "true");
      await new Promise(resolve => setTimeout(resolve, 850));
      demo.leds[id] = nextOn;
      const nextID = Math.max(50, ...demo.actions.map(action => Number(action.id.slice(2)))) + 1;
      demo.actions.unshift({ id: "#A" + String(nextID).padStart(4, "0"), deviceID: id,
        action: nextOn ? "ON" : "OFF", status: "SUCCESS", time: Date.now() });
      demo.actions = demo.actions.slice(0, 100);
      saveDemo(demo);
      input.checked = nextOn;
      input.disabled = false;
      control.classList.remove("loading");
      control.setAttribute("aria-busy", "false");
    });
  });
}

setupDevices();
