// Dữ liệu dùng chung: trạng thái LED, ID, kết quả và localStorage.
const actionStatusLabels = { SUCCESS: "Thành công", PENDING: "Đang chờ", FAILED: "Thất bại", TIMEOUT: "Hết thời gian" };

function normalizeActionIDs(actions) {
  let sequence = 50;
  for (const action of actions) {
    if (/^#A\d{4,6}$/.test(String(action.id))) sequence = Math.max(sequence, Number(action.id.slice(2)));
  }
  const used = new Set();
  for (const action of actions.slice().reverse()) {
    if (!/^#A\d{4,6}$/.test(String(action.id)) || used.has(action.id)) {
      action.id = "#A" + String(++sequence).padStart(4, "0");
    }
    used.add(action.id);
    if (!Object.hasOwn(actionStatusLabels, action.status)) action.status = "SUCCESS";
  }
  return actions;
}

// Lưu trạng thái LED/lịch sử giữa các trang; vẫn dùng được nếu trình duyệt chặn lưu trữ.
function loadDemo() {
  try {
    const data = JSON.parse(localStorage.getItem("iot-simple-demo"));
    if (data && data.leds && Array.isArray(data.actions)) {
      data.actions = normalizeActionIDs(data.actions.filter(action => action && typeof action === "object"));
      saveDemo(data);
      return data;
    }
  } catch (error) {}
  return { leds: { led1: true, led2: false, led3: true }, actions: [] };
}
function saveDemo(data) {
  try { localStorage.setItem("iot-simple-demo", JSON.stringify(data)); }
  catch (error) {}
}
