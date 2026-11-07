// Tìm kiếm, chọn ngày và phân trang cho Data Sensor / Action History.
const sensorTypes = { "°C": "temperature", "%": "humidity", "Lux": "light" };

// Nhận các thành phần ngày/giờ tùy chọn; chỉ so khớp những phần người dùng đã nhập.
function getTimeCriteria(value) {
  value = value.trim();
  if (!value) return null;
  const parts = {};
  let dateText = value;
  let timeText = "";

  if (value.includes(":")) {
    const timeMatch = value.match(/(?:^| )(\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?)$/);
    if (!timeMatch) throw new Error("Định dạng giờ cần là hh:mm hoặc hh:mm:ss.");
    timeText = timeMatch[1];
    dateText = value.slice(0, timeMatch.index).trim();
  } else {
    const tokens = value.split(/\s+/);
    const threePartsIncludeHour = tokens.length === 3 &&
      (!/^\d{4}$/.test(tokens[0]) || Number(tokens[1]) > 12);
    if (tokens.length === 4 || threePartsIncludeHour) {
      timeText = tokens.pop();
      dateText = tokens.join(" ");
    }
  }

  const dateTokens = dateText ? dateText.split(/\s+/) : [];
  if (dateTokens.length > 3 || dateTokens.some(token => !/^\d{1,4}$/.test(token))) {
    throw new Error("Nhập ngày theo thứ tự YYYY MM DD; có thể bỏ năm hoặc tháng.");
  }
  if (dateTokens.some((token, index) => token.length === 4 && index !== 0)) {
    throw new Error("Nếu nhập năm, hãy đặt năm ở đầu chuỗi.");
  }

  let dateValues = dateTokens.map(Number);
  if (dateValues[0] && dateTokens[0].length === 4) {
    parts.year = dateValues[0];
    dateValues = dateValues.slice(1);
    if (dateValues.length === 1) parts.monthOrDay = dateValues[0];
    if (dateValues.length === 2) [parts.month, parts.day] = dateValues;
  } else if (dateValues.length === 1) {
    parts.day = dateValues[0];
  } else if (dateValues.length === 2) {
    [parts.month, parts.day] = dateValues;
  }

  if (timeText) {
    const timeTokens = timeText.split(":");
    if (timeTokens.some(part => !/^\d{1,2}$/.test(part))) {
      throw new Error("Định dạng giờ cần là hh, hh:mm hoặc hh:mm:ss.");
    }
    const timeValues = timeTokens.map(Number);
    [parts.hour, parts.minute, parts.second] = timeValues;
  }

  const year = parts.year ?? 2000;
  if (parts.year !== undefined && (year < 1 || year > 9999)) throw new Error("Năm không hợp lệ.");
  if (parts.month !== undefined && (parts.month < 1 || parts.month > 12)) throw new Error("Tháng không hợp lệ.");
  if (parts.day !== undefined) {
    const maxDay = parts.month === undefined ? 31 : new Date(year, parts.month, 0).getDate();
    if (parts.day < 1 || parts.day > maxDay) throw new Error("Ngày không hợp lệ.");
  }
  if (parts.monthOrDay !== undefined && (parts.monthOrDay < 1 || parts.monthOrDay > 31)) {
    throw new Error("Tháng hoặc ngày không hợp lệ.");
  }
  if (parts.hour !== undefined && (parts.hour < 0 || parts.hour > 23)) throw new Error("Giờ không hợp lệ.");
  if (parts.minute !== undefined && (parts.minute < 0 || parts.minute > 59)) throw new Error("Phút không hợp lệ.");
  if (parts.second !== undefined && (parts.second < 0 || parts.second > 59)) throw new Error("Giây không hợp lệ.");
  if (!Object.keys(parts).length) throw new Error("Hãy nhập ít nhất một thành phần ngày hoặc giờ.");
  return parts;
}

function matchesFilters(record, filters) {
  if (filters.keyword) {
    const searchableText = (record.row.textContent + " " + record.row.querySelector("time").dateTime).toLowerCase();
    if (!searchableText.includes(filters.keyword.toLowerCase())) return false;
  }
  if (filters.timeParts) {
    const date = new Date(record.time);
    const actual = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
      hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
    for (const key of ["year", "month", "day", "hour", "minute", "second"]) {
      if (filters.timeParts[key] !== undefined && actual[key] !== filters.timeParts[key]) return false;
    }
    if (filters.timeParts.monthOrDay !== undefined && actual.month !== filters.timeParts.monthOrDay &&
        actual.day !== filters.timeParts.monthOrDay) return false;
  }

  if (filters.type && record.type !== filters.type) return false;
  if (filters.value !== undefined && record.value !== filters.value) return false;
  for (const key of ["deviceID", "action", "status"]) {
    if (filters[key] && record[key] !== filters[key]) return false;
  }
  return true;
}

// BỘ LỌC: chỉ tìm khi nhấn nút; Đặt lại hiển thị toàn bộ dữ liệu.
function setupFilters() {

  const isSensorPage = Boolean(document.querySelector(".sensor-filters"));
  const form = document.querySelector(".filters");
  const tbody = document.querySelector("tbody");
  const errorBox = document.querySelector(".form-error");
  const counter = document.querySelector(".table-panel .panel-heading p");
  const summary = document.querySelector(".pagination span");
  const rows = Array.from(tbody.rows);

  const records = rows.map(row => {
    const cells = row.cells;
    const text = index => cells[index].textContent.trim();
    const time = new Date(row.querySelector("time").dateTime).getTime();
    if (isSensorPage) {
      return { row, type: sensorTypes[text(4)], value: Number(text(3)), time };
    }
    return { row, deviceID: text(1).toLowerCase(), action: cells[3].querySelector("strong").textContent.trim().toUpperCase(),
      status: cells[5].querySelector(".status").textContent.trim().toUpperCase(), time };
  });

  const emptyRow = document.createElement("tr");
  const emptyCell = document.createElement("td");
  emptyCell.colSpan = 7;
  emptyCell.className = "empty";
  emptyCell.textContent = "Không có bản ghi phù hợp. Hãy thay đổi điều kiện tìm kiếm.";
  emptyRow.append(emptyCell);
  tbody.append(emptyRow);

  let selected = records;
  let currentPage = 1;
  const pager = document.querySelector(".pagination");
  const controls = document.createElement("div");
  const pageSizeLabel = document.createElement("label");
  pageSizeLabel.className = "page-size-control";
  pageSizeLabel.append(document.createTextNode("Số dòng/trang"));
  const pageSizeInput = document.createElement("input");
  pageSizeInput.type = "number";
  pageSizeInput.min = "1";
  pageSizeInput.max = String(Math.max(1, records.length));
  pageSizeInput.step = "1";
  pageSizeInput.value = String(Math.min(10, Math.max(1, records.length)));
  pageSizeInput.setAttribute("aria-label", "Số bản ghi hiển thị mỗi trang");
  pageSizeLabel.append(pageSizeInput);
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "‹";
  previous.setAttribute("aria-label", "Trang trước");
  const pageLabel = document.createElement("span");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Trang sau");
  controls.append(pageSizeLabel, previous, pageLabel, next);
  pager.lastElementChild.replaceWith(controls);

  function renderPage() {
    const maxPageSize = Math.max(1, records.length);
    const requestedPageSize = Number.parseInt(pageSizeInput.value, 10);
    const pageSize = Math.min(maxPageSize, Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 1));
    pageSizeInput.value = String(pageSize);
    const pages = Math.max(1, Math.ceil(selected.length / pageSize));
    currentPage = Math.min(currentPage, pages);
    records.forEach(record => { record.row.hidden = true; });
    const start = (currentPage - 1) * pageSize;
    selected.slice(start, start + pageSize).forEach(record => { record.row.hidden = false; });
    emptyRow.hidden = selected.length > 0;
    counter.textContent = selected.length + " / " + records.length + " bản ghi · Mới nhất trước";
    summary.textContent = selected.length ? "Hiển thị " + (start + 1) + "–" + Math.min(start + pageSize, selected.length) + " / " + selected.length : "Không có kết quả";
    pageLabel.textContent = "Trang " + currentPage + " / " + pages;
    previous.disabled = currentPage === 1;
    next.disabled = currentPage === pages;
  }
  function updatePageSize() {
    currentPage = 1;
    renderPage();
  }
  pageSizeInput.addEventListener("change", updatePageSize);
  pageSizeInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      updatePageSize();
    }
  });
  previous.addEventListener("click", () => { currentPage--; renderPage(); });
  next.addEventListener("click", () => { currentPage++; renderPage(); });
  

  function showRecords(filters) {
    selected = records.filter(record => matchesFilters(record, filters));
    currentPage = 1;
    renderPage();
  }


  function changeSensorType() {
    const type = form.elements.type.value;
    const dateMode = type === "date";
    const allMode = type === "all";
    form.querySelector(".sensor-value").hidden = dateMode || allMode;
    form.querySelector(".all-value").hidden = !allMode; 
    form.querySelector(".date-value").hidden = !dateMode || allMode;
    form.elements.value.disabled = dateMode || allMode || !type;
    form.elements.keyword.disabled = !allMode;
    form.elements.time.disabled = !dateMode || allMode;
    form.elements.value.placeholder = type ? "Nhập giá trị cảm biến" : "Chọn loại trước khi nhập giá trị";
    errorBox.hidden = true;
  }

  if (isSensorPage) {
    form.elements.type.addEventListener("change", changeSensorType);
    changeSensorType();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    errorBox.hidden = true;
    try {
      let filters = {};
      if (isSensorPage) {
        const type = form.elements.type.value;
        if (!type) throw new Error("Hãy chọn loại tìm kiếm trước.");
        if (type === "all") {
          const keyword = form.elements.keyword.value.trim();
          if (!keyword) throw new Error("Hãy nhập từ khóa cần tìm trong tất cả dữ liệu.");
          filters = { keyword };
        } else if (type === "date") {
          filters.timeParts = getTimeCriteria(form.elements.time.value);
          if (!filters.timeParts) throw new Error("Hãy nhập ít nhất một thành phần thời gian.");
        } else {
          const value = form.elements.value.value.trim();
          if (!value || !Number.isFinite(Number(value))) throw new Error("Hãy nhập một giá trị số hợp lệ.");
          filters = { type, value: Number(value) };
        }
      } else {
        filters = {
          deviceID: form.elements.deviceID.value.toLowerCase(),
          action: form.elements.action.value.toUpperCase(),
          status: form.elements.status.value.toUpperCase()
        };
        const timeQuery = form.elements.time.value.trim();
        if (timeQuery) filters.timeParts = getTimeCriteria(timeQuery);
      }
      showRecords(filters);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    }
  });
  form.addEventListener("reset", () => {
    setTimeout(() => {
      if (isSensorPage) changeSensorType();
      errorBox.hidden = true;
      showRecords({});
    }, 0);
  });
  showRecords({});
}

setupFilters();
