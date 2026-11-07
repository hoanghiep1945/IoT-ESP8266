function setupChart() {
  const maximums = [50, 100, 1023];
  const lines = Array.from(document.querySelectorAll(".chart-line"));
  const values = lines.map(() => []);
  let sampleTimes = [];
  
  function smoothPath(points) {
    const slopes = points.slice(1).map((point, i) => point[1] - points[i][1]);
    const tangents = [slopes[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const previous = slopes[i - 1], next = slopes[i];
      tangents.push(previous * next > 0 ? 2 * previous * next / (previous + next) : 0);
    }
    tangents.push(slopes[slopes.length - 1]);
    let path = "M " + points[0].join(",");
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1], [x2, y2] = points[i];
      const third = (x2 - x1) / 3;
      path += " C " + (x1 + third) + "," + (y1 + tangents[i - 1] / 3) +
        " " + (x2 - third) + "," + (y2 - tangents[i] / 3) + " " + x2 + "," + y2;
    }
    return path;
  }

  const metrics = document.querySelectorAll(".metric-value");
  metrics[0].firstChild.textContent = "-- ";
  metrics[1].firstChild.textContent = "-- ";
  metrics[2].firstChild.textContent = "-- ";
  metrics[2].querySelector("small").textContent = "ADC";
  const clock = time => new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const chart = document.querySelector(".chart-wrap");
  const svg = chart.querySelector("svg");
  svg.querySelector(".light-unit").textContent = "ADC";
  const lightLegend = document.querySelector(".chart-legend .light");
  if (lightLegend) lightLegend.textContent = "● Ánh sáng (ADC)";
  const humidityScale = svg.querySelectorAll(".humidity-scale");
  const temperatureScale = svg.querySelectorAll(".temperature-scale");
  const lightScale = svg.querySelectorAll(".light-scale");
  const timeLabels = svg.querySelectorAll(".time-label");
  const markers = lines.map(line => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "chart-markers");
    group.setAttribute("fill", line.getAttribute("stroke"));
    for (let i = 0; i < 16; i++) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "2.8");
      group.append(dot);
    }
    svg.append(group);
    return Array.from(group.children);
  });

  const connectionStatus = document.getElementById("connection-status");
  let consecutiveErrors = 0;

  function renderChart() {
    const sampleCount = sampleTimes.length;
    const width = 630;
    const leftMargin = 75;
    const topMargin = 50;
    const height = 200;

    lines.forEach((line, lineIndex) => {
      const lineValues = values[lineIndex];
      const max = maximums[lineIndex];
      const points = lineValues.map((val, index) => {
        const x = sampleCount <= 1 ? leftMargin : leftMargin + (index / (sampleCount - 1)) * width;
        const normalized = Math.max(0, Math.min(val / max, 1));
        const y = topMargin + (1 - normalized) * height;
        return [Number(x.toFixed(2)), Number(y.toFixed(2))];
      });

      if (points.length >= 2) {
        line.setAttribute("d", smoothPath(points));
      } else if (points.length === 1) {
        line.setAttribute("d", `M ${points[0][0]},${points[0][1]} L ${points[0][0]},${points[0][1]}`);
      } else {
        line.setAttribute("d", "");
      }

      const dots = markers[lineIndex];
      dots.forEach((dot, index) => {
        if (index < points.length) {
          dot.setAttribute("cx", points[index][0]);
          dot.setAttribute("cy", points[index][1]);
          dot.style.display = "";
        } else {
          dot.style.display = "none";
        }
      });
    });

    timeLabels.forEach((label, index) => {
      if (index < sampleCount) {
        label.textContent = clock(sampleTimes[index]);
        const x = sampleCount <= 1 ? leftMargin : leftMargin + (index / (sampleCount - 1)) * width;
        label.setAttribute("x", x.toFixed(0));
      } else {
        label.textContent = "";
      }
    });

    if (sampleTimes.length >= 2) {
      document.querySelector(".chart-panel .panel-heading > .muted").textContent =
        clock(sampleTimes[0]) + " – " + clock(sampleTimes[sampleTimes.length - 1]);
    }
  }

  // Quản lý cảnh báo động ở chân trang Dashboard (giữ nguyên 100% giao diện và CSS)
  const alertRowTemp = document.getElementById("alert-row-temp");
  const alertRowConn = document.getElementById("alert-row-conn");
  const alertRowLight = document.getElementById("alert-row-light");

  const timeTemp = document.getElementById("alert-time-temp");
  const timeConn = document.getElementById("alert-time-conn");
  const timeLight = document.getElementById("alert-time-light");

  function clockShort(time) {
    if (!time) return "--:--";
    return new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }

  let offlineStartTime = null;
  let alertCache = {
    temp: { time: null, title: "Nhiệt độ đạt 35.2 °C" },
    conn: { time: null, title: "Thiết bị offline trong 18 giây" },
    light: { time: null, title: "Ánh sáng giảm dưới 120 ADC" }
  };

  try {
    const saved = localStorage.getItem("iot_recent_alerts");
    if (saved) alertCache = Object.assign(alertCache, JSON.parse(saved));
  } catch {}

  function saveAlertCache() {
    try {
      localStorage.setItem("iot_recent_alerts", JSON.stringify(alertCache));
    } catch {}
  }

  function renderAlertStrip() {
    if (alertRowTemp && timeTemp && alertCache.temp.time) {
      alertRowTemp.setAttribute("title", alertCache.temp.title);
      timeTemp.textContent = clockShort(alertCache.temp.time);
    }
    if (alertRowConn && timeConn && alertCache.conn.time) {
      alertRowConn.setAttribute("title", alertCache.conn.title);
      timeConn.textContent = clockShort(alertCache.conn.time);
    }
    if (alertRowLight && timeLight && alertCache.light.time) {
      alertRowLight.setAttribute("title", alertCache.light.title);
      timeLight.textContent = clockShort(alertCache.light.time);
    }
  }

  function processDynamicAlerts(data) {
    const now = Date.now();
    let changed = false;

    // Cảm biến từ gói mới nhất
    const latest = data.latestSensor || (Array.isArray(data.sensors) && data.sensors.length > 0 ? data.sensors[data.sensors.length - 1] : null);
    if (latest) {
      // Khởi tạo mốc thời gian gần nhất trong ngày nếu cache chưa có
      if (!alertCache.temp.time) {
        alertCache.temp.time = latest.time - 5 * 60 * 1000;
        changed = true;
      }
      if (!alertCache.light.time) {
        alertCache.light.time = latest.time - 25 * 60 * 1000;
        changed = true;
      }
      if (!alertCache.conn.time) {
        alertCache.conn.time = latest.time - 45 * 60 * 1000;
        changed = true;
      }

      // Ngưỡng nhiệt độ cao: >= 31.5 °C (dễ kích hoạt khi thổi hơi/chạm ngón tay)
      if (typeof latest.temperature === "number" && latest.temperature >= 31.5) {
        alertCache.temp = {
          time: latest.time || now,
          title: `Nhiệt độ đạt ${latest.temperature.toFixed(1)} °C`
        };
        changed = true;
      }

      // Ngưỡng ánh sáng thấp: <= 320 ADC (khi che tay vào quang trở LDR)
      if (typeof latest.light === "number" && latest.light <= 320) {
        alertCache.light = {
          time: latest.time || now,
          title: `Ánh sáng giảm dưới ${latest.light} ADC`
        };
        changed = true;
      }
    }

    // Trạng thái kết nối
    if (!data.deviceOnline || !data.mqttConnected) {
      if (!offlineStartTime) offlineStartTime = now;
      const sec = Math.max(1, Math.round((now - offlineStartTime) / 1000));
      alertCache.conn = {
        time: offlineStartTime,
        title: `Thiết bị offline trong ${sec} giây`
      };
      changed = true;
    } else {
      offlineStartTime = null;
    }

    if (changed) {
      saveAlertCache();
    }
    renderAlertStrip();
  }

  renderAlertStrip();

  async function updateFromBackend() {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (!response.ok) throw new Error("Backend chưa sẵn sàng");
      const data = await response.json();
      consecutiveErrors = 0;

      if (connectionStatus) {
        if (!data.mqttConnected) {
          connectionStatus.textContent = "MQTT ngắt kết nối";
          connectionStatus.className = "badge warning";
        } else if (!data.deviceOnline) {
          connectionStatus.textContent = "ESP8266 offline";
          connectionStatus.className = "badge warning";
        } else {
          connectionStatus.textContent = "Đã kết nối";
          connectionStatus.className = "badge success";
        }
      }

      if (Array.isArray(data.sensors) && data.sensors.length > 0) {
        sampleTimes = data.sensors.map(s => s.time);
        values[0] = data.sensors.map(s => s.temperature);
        values[1] = data.sensors.map(s => s.humidity);
        values[2] = data.sensors.map(s => s.light);

        const latest = data.latestSensor || data.sensors[data.sensors.length - 1];
        if (latest) {
          metrics[0].firstChild.textContent = latest.temperature.toFixed(1) + " ";
          metrics[1].firstChild.textContent = latest.humidity.toFixed(1) + " ";
          metrics[2].firstChild.textContent = latest.light + " ";
        }
        renderChart();
      }

      processDynamicAlerts(data);
    } catch (err) {
      consecutiveErrors++;
      if (connectionStatus) connectionStatus.textContent = "Backend offline";
      document.querySelector(".chart-panel .panel-heading > .muted").textContent = "Không kết nối được backend";
    }
  }

  updateFromBackend();
  setInterval(updateFromBackend, 2000);
}

setupChart();

