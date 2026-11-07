function renderActionRows(actions) {
  const tbody = document.querySelector(".table-scroll tbody");
  if (!tbody) return;
  tbody.replaceChildren();

  if (!actions.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7" class="empty">Chưa có lịch sử phù hợp.</td>';
    tbody.append(row);
    return;
  }

  const labels = {
    SUCCESS: "Đã thực hiện",
    PENDING: "Đang xử lý",
    FAILED: "Thất bại",
    TIMEOUT: "Hết thời gian chờ"
  };
  const deviceNames = { led1: "LED 1", led2: "LED 2", led3: "LED 3" };

  for (const action of actions) {
    const row = document.createElement("tr");
    const actor = action.userName || action.username || (action.userID ? "User " + action.userID : "Hệ thống");
    const values = [action.id, action.deviceID, actor];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value ?? "";
      row.append(cell);
    }

    const actionCell = document.createElement("td");
    const actionName = document.createElement("strong");
    actionName.textContent = action.action || "";
    const actionLabel = document.createElement("small");
    actionLabel.textContent = action.action === "ON" ? "Bật thiết bị" : "Tắt thiết bị";
    actionCell.append(actionName, actionLabel);
    row.append(actionCell);

    const deviceCell = document.createElement("td");
    deviceCell.textContent = deviceNames[action.deviceID] || action.deviceID || "";
    row.append(deviceCell);

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = "status " + String(action.status || "").toLowerCase();
    status.textContent = action.status || "";
    const statusLabel = document.createElement("small");
    statusLabel.textContent = labels[action.status] || action.status || "";
    statusCell.append(status, statusLabel);
    row.append(statusCell);

    const timeCell = document.createElement("td");
    timeCell.className = "time-cell";
    const date = new Date(action.time);
    if (!Number.isNaN(date.getTime())) {
      const pad = value => String(value).padStart(2, "0");
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.append(document.createTextNode(date.getFullYear() + " " + pad(date.getMonth() + 1) + " " + pad(date.getDate())));
      const clock = document.createElement("small");
      clock.textContent = pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
      time.append(clock);
      timeCell.append(time);
    }
    row.append(timeCell);
    tbody.append(row);
  }
}

window.renderActionRows = renderActionRows;
