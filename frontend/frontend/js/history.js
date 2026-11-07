function addSavedActions() {

  const tbody = document.querySelector("tbody");
  for (const action of loadDemo().actions.slice().reverse()) {
    if (!/^led[123]$/.test(action.deviceID) || !["ON", "OFF"].includes(action.action) || !Number.isFinite(action.time)) continue;
    const date = new Date(action.time);

    const row = document.createElement("tr");
    const values = [action.id, action.deviceID, "Lê Bá Hoàng Hiệp", action.action, action.deviceID, action.status, ""];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }

    const strong = document.createElement("strong");
    strong.textContent = action.action;
    const actionLabel = document.createElement("small");
    actionLabel.textContent = action.action === "ON" ? "Bật thiết bị" : "Tắt thiết bị";
    row.cells[3].replaceChildren(strong, actionLabel);

    const status = document.createElement("span");
    status.className = "status " + action.status.toLowerCase();
    status.textContent = action.status;
    const resultLabel = document.createElement("small");
    resultLabel.textContent = actionStatusLabels[action.status];
    row.cells[5].replaceChildren(status, resultLabel);

    const time = document.createElement("time");
    time.dateTime = date.toISOString();
    const pad = value => String(value).padStart(2, "0");
    time.textContent = date.getFullYear() + " " + pad(date.getMonth() + 1) + " " + pad(date.getDate());
    const clock = document.createElement("small");
    clock.textContent = pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
    time.append(clock);
    row.cells[6].className = "time-cell";
    row.cells[6].append(time);
    
    tbody.prepend(row);
  }
}

addSavedActions();
