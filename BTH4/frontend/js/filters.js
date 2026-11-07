const sensorTypes = new Set(["temperature", "humidity", "light", "cb1", "cb2", "cb3"]);

function setError(element, message) {
  if (!element) return;
  element.textContent = message || "";
  element.hidden = !message;
}

function normalizePageData(data, requestedPage, requestedPageSize) {
  const records = Array.isArray(data) ? data :
    Array.isArray(data?.records) ? data.records :
    Array.isArray(data?.rows) ? data.rows :
    Array.isArray(data?.data) ? data.data : [];
  const metadata = data && !Array.isArray(data) && data.pagination && typeof data.pagination === 'object'
    ? data.pagination : {};
  const totalCandidate = Number(metadata.total ?? data?.total ?? records.length);
  const pageSizeCandidate = Number(metadata.pageSize ?? requestedPageSize);
  const pageCandidate = Number(metadata.page);
  const totalPagesCandidate = Number(metadata.totalPages);
  const total = Number.isFinite(totalCandidate) && totalCandidate >= 0 ? totalCandidate : records.length;
  const pageSize = Number.isFinite(pageSizeCandidate) && pageSizeCandidate > 0 ? pageSizeCandidate : requestedPageSize;
  const page = Number.isFinite(pageCandidate) && pageCandidate > 0 ? pageCandidate : requestedPage;
  const totalPages = Number.isFinite(totalPagesCandidate) && totalPagesCandidate >= 0
    ? totalPagesCandidate : Math.ceil(total / pageSize);
  return { records, pagination: { page, pageSize, total, totalPages } };
}

function renderPagination(container, data, loadPage, changePageSize) {
  if (!container) return;
  const page = data.pagination.page;
  const totalPages = data.pagination.totalPages;
  const total = data.pagination.total;
  container.replaceChildren();

  const label = document.createElement("span");
  label.textContent = "T\u1ed5ng " + total + " b\u1ea3n ghi";
  const controls = document.createElement("div");
  const sizeControl = document.createElement("label");
  sizeControl.className = "page-size-control";
  sizeControl.append("S\u1ed1 b\u1ea3n ghi/trang");
  const sizeInput = document.createElement("input");
  sizeInput.type = "number";
  sizeInput.min = "1";
  sizeInput.max = "100";
  sizeInput.step = "1";
  sizeInput.inputMode = "numeric";
  sizeInput.value = String(data.pagination.pageSize);
  sizeInput.setAttribute("aria-label", "S\u1ed1 b\u1ea3n ghi hi\u1ec3n th\u1ecb tr\u00ean m\u1ed7i trang");
  sizeInput.title = "Nh\u1eadp t\u1eeb 1 \u0111\u1ebfn 100 b\u1ea3n ghi m\u1ed7i trang";
  sizeInput.addEventListener("change", () => changePageSize(sizeInput.value));
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Trước";
  previous.disabled = page <= 1;
  previous.addEventListener("click", () => loadPage(page - 1));
  const pageLabel = document.createElement("span");
  pageLabel.textContent = totalPages ? "Trang " + page + " / " + totalPages : "Không có kết quả";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Sau";
  next.disabled = page >= totalPages;
  next.addEventListener("click", () => loadPage(page + 1));
  sizeControl.append(sizeInput);
  controls.append(sizeControl, previous, pageLabel, next);
  container.append(label, controls);
}

function makeTimeElement(timestamp) {
  const date = new Date(timestamp);
  const time = document.createElement("time");
  if (!Number.isNaN(date.getTime())) {
    time.dateTime = date.toISOString();
    const pad = value => String(value).padStart(2, "0");
    time.append(document.createTextNode(date.getFullYear() + " " + pad(date.getMonth() + 1) + " " + pad(date.getDate())));
    const clock = document.createElement("small");
    clock.textContent = pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
    time.append(clock);
  }
  return time;
}

function renderSensorRows(tbody, records) {
  tbody.replaceChildren();
  if (!records.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="7" class="empty">Không tìm thấy bản ghi phù hợp.</td>';
    tbody.append(row);
    return;
  }

  for (const record of records) {
    const row = document.createElement("tr");
    const values = [record.id, record.sensorID, record.sensor, record.value, record.unit];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value ?? "";
      row.append(cell);
    }
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = /over threshold/i.test(record.status) ? "status warning" : "status";
    status.textContent = record.status || "";
    statusCell.append(status);
    row.append(statusCell);
    const timeCell = document.createElement("td");
    timeCell.className = "time-cell";
    timeCell.append(makeTimeElement(record.time));
    row.append(timeCell);
    tbody.append(row);
  }
}

function setupSensorFilters() {
  const form = document.querySelector(".sensor-filters");
  if (!form) return;
  const tbody = document.querySelector(".table-scroll tbody");
  const error = document.querySelector(".form-error");
  const pagination = document.querySelector(".pagination");
  const typeSelect = form.querySelector("#search-type");
  const valueField = form.querySelector(".sensor-value");
  const valueInput = valueField.querySelector("input");
  const allField = form.querySelector(".all-value");
  const allInput = allField.querySelector("input");
  const dateField = form.querySelector(".date-value");
  const dateInput = dateField.querySelector("input");
  let pageSize = 12;
  let page = 1;

  function updatePageSize(value) {
    const requested = Number.parseInt(value, 10);
    if (!Number.isFinite(requested)) return;
    pageSize = Math.min(100, Math.max(1, requested));
    load(1);
  }

  function updateInputs() {
    const type = typeSelect.value;
    valueField.hidden = type === "all" || type === "date";
    valueInput.disabled = !sensorTypes.has(type);
    allField.hidden = type !== "all";
    allInput.disabled = type !== "all";
    dateField.hidden = type !== "date";
    dateInput.disabled = type !== "date";
    if (sensorTypes.has(type)) {
      const names = {
        temperature: "Nhập nhiệt độ (°C)", humidity: "Nhập độ ẩm (%)",
        light: "Nhập ánh sáng (ADC)", cb1: "Nhập giá trị CB1 (0-11)",
        cb2: "Nhập giá trị CB2 (0-101)", cb3: "Nhập giá trị CB3 (0-1001)"
      };
      valueInput.placeholder = names[type];
    } else {
      valueInput.placeholder = "Chọn loại trước khi nhập giá trị";
    }
  }

  async function load(pageNumber) {
    page = Math.max(1, pageNumber);
    setError(error, "");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const type = typeSelect.value;
    if (type) params.set("type", type);
    if (type === "date" && dateInput.value.trim()) params.set("time", dateInput.value.trim());
    else if (type === "all" && allInput.value.trim()) params.set("keyword", allInput.value.trim());
    else if (sensorTypes.has(type) && valueInput.value.trim()) params.set("value", valueInput.value.trim());

    try {
      const response = await fetch("/api/sensors?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        location.assign("login.html");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Không tải được dữ liệu cảm biến.");
      const result = normalizePageData(data, page, pageSize);
      renderSensorRows(tbody, result.records);
      renderPagination(pagination, result, load, updatePageSize);
    } catch (err) {
      renderSensorRows(tbody, []);
      renderPagination(pagination, { pagination: { page: 1, pageSize, totalPages: 0, total: 0 } }, load, updatePageSize);
      setError(error, err.message || "Không kết nối được backend.");
    }
  }

  typeSelect.addEventListener("change", updateInputs);
  form.addEventListener("submit", event => {
    event.preventDefault();
    load(1);
  });
  form.addEventListener("reset", () => {
    setTimeout(() => {
      updateInputs();
      setError(error, "");
      load(1);
    }, 0);
  });
  updateInputs();
  load(1);
}

function setupActionFilters() {
  const form = document.querySelector(".action-filters");
  if (!form) return;
  const error = document.querySelector(".form-error");
  const pagination = document.querySelector(".pagination");
  let pageSize = 10;

  function updatePageSize(value) {
    const requested = Number.parseInt(value, 10);
    if (!Number.isFinite(requested)) return;
    pageSize = Math.min(100, Math.max(1, requested));
    load(1);
  }

  async function load(page) {
    setError(error, "");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    for (const field of ["deviceID", "action", "status", "time"]) {
      const value = form.elements[field]?.value.trim();
      if (value) params.set(field, value);
    }

    try {
      const response = await fetch("/api/actions?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) {
        location.assign("login.html");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Không tải được lịch sử thao tác.");
      const result = normalizePageData(data, page, pageSize);
      window.renderActionRows(result.records);
      renderPagination(pagination, result, load, updatePageSize);
    } catch (err) {
      window.renderActionRows([]);
      renderPagination(pagination, { pagination: { page: 1, pageSize, totalPages: 0, total: 0 } }, load, updatePageSize);
      setError(error, err.message || "Không kết nối được backend.");
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    load(1);
  });
  form.addEventListener("reset", () => {
    setTimeout(() => {
      setError(error, "");
      load(1);
    }, 0);
  });
  load(1);
}

document.addEventListener("DOMContentLoaded", () => {
  setupSensorFilters();
  setupActionFilters();
});
