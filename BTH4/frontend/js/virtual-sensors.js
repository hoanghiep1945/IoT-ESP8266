// Quan ly man hinh Environment (Đo man, Chat luong khong khi, Ap suat + Trang thai LED)
function setupEnvironmentDashboard() {
  const cb1Box = document.getElementById("box-cb1");
  const cb2Box = document.getElementById("box-cb2");
  const cb3Box = document.getElementById("box-cb3");

  const val1 = document.getElementById("val-cb1");
  const val2 = document.getElementById("val-cb2");
  const val3 = document.getElementById("val-cb3");

  const status1 = document.getElementById("status-cb1");
  const status2 = document.getElementById("status-cb2");
  const status3 = document.getElementById("status-cb3");

  // Elements cho khoi trang thai LED (o cuoi trang)
  const ledCard1 = document.getElementById("led-card-1");
  const ledCard2 = document.getElementById("led-card-2");
  const ledCard3 = document.getElementById("led-card-3");

  const ledText1 = document.getElementById("led-text-1");
  const ledText2 = document.getElementById("led-text-2");
  const ledText3 = document.getElementById("led-text-3");

  const threshold1 = 11 * 0.5;   // 5.5
  const threshold2 = 101 * 0.5;  // 50.5
  const threshold3 = 1001 * 0.5; // 500.5

  const connStatus = document.getElementById("connection-status");

  // 3 Bieu do rieng biet (viewBox 500 x 220)
  const charts = [
    {
      line: document.querySelector(".env-chart-line-cb1"),
      max: 11,
      svg: document.querySelector(".chart-svg-cb1")
    },
    {
      line: document.querySelector(".env-chart-line-cb2"),
      max: 101,
      svg: document.querySelector(".chart-svg-cb2")
    },
    {
      line: document.querySelector(".env-chart-line-cb3"),
      max: 1001,
      svg: document.querySelector(".chart-svg-cb3")
    }
  ];

  function smoothPath(points) {
    if (!points || points.length === 0) return "";
    if (points.length === 1) return `M ${points[0][0]},${points[0][1]} L ${points[0][0]},${points[0][1]}`;
    if (points.length === 2) return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;

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

  const clock = time => new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Tao dots marker cho moi bieu do
  charts.forEach(c => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "chart-markers");
    group.setAttribute("fill", c.line.getAttribute("stroke"));
    for (let i = 0; i < 20; i++) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "4");
      group.append(dot);
    }
    c.svg.append(group);
    c.markers = Array.from(group.children);
  });

  function renderSingleChart(chartObj, values, sampleTimes) {
    const sampleCount = sampleTimes.length;
    const width = 400;
    const leftMargin = 60;
    const topMargin = 25;
    const height = 150;

    const points = values.map((val, index) => {
      const x = sampleCount <= 1 ? leftMargin : leftMargin + (index / (sampleCount - 1)) * width;
      const normalized = Math.max(0, Math.min(val / chartObj.max, 1));
      const y = topMargin + (1 - normalized) * height;
      return [Number(x.toFixed(2)), Number(y.toFixed(2))];
    });

    if (points.length >= 2) {
      chartObj.line.setAttribute("d", smoothPath(points));
    } else if (points.length === 1) {
      chartObj.line.setAttribute("d", `M ${points[0][0]},${points[0][1]} L ${points[0][0]},${points[0][1]}`);
    } else {
      chartObj.line.setAttribute("d", "");
    }

    chartObj.markers.forEach((dot, index) => {
      if (index < points.length) {
        dot.setAttribute("cx", points[index][0]);
        dot.setAttribute("cy", points[index][1]);
        dot.style.display = "";
      } else {
        dot.style.display = "none";
      }
    });

    const timeLabels = chartObj.svg.querySelectorAll(".time-label");
    if (timeLabels && timeLabels.length >= 3) {
      if (sampleCount >= 1) {
        timeLabels[0].textContent = clock(sampleTimes[0]);
        timeLabels[0].setAttribute("x", "60");
        timeLabels[0].setAttribute("text-anchor", "start");
      } else {
        timeLabels[0].textContent = "";
      }

      if (sampleCount >= 3) {
        const midIdx = Math.floor((sampleCount - 1) / 2);
        timeLabels[1].textContent = clock(sampleTimes[midIdx]);
        timeLabels[1].setAttribute("x", "267");
        timeLabels[1].setAttribute("text-anchor", "middle");
      } else {
        timeLabels[1].textContent = "";
      }

      if (sampleCount >= 2) {
        timeLabels[2].textContent = clock(sampleTimes[sampleCount - 1]);
        timeLabels[2].setAttribute("x", "475");
        timeLabels[2].setAttribute("text-anchor", "end");
      } else {
        timeLabels[2].textContent = "";
      }
    }
  }

  let isFetching = false;
  async function fetchEnvironmentState() {
    if (isFetching) return;
    isFetching = true;
    try {
      const res = await fetch("/api/virtual-sensors/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Chưa kết nối backend");
      const data = await res.json();

      if (connStatus) {
        if (!data.mqttConnected) {
          connStatus.textContent = "MQTT ngắt kết nối";
          connStatus.className = "badge warning";
        } else if (!data.deviceOnline) {
          connStatus.textContent = "Thiết bị offline";
          connStatus.className = "badge warning";
        } else {
          connStatus.textContent = "Đang kết nối";
          connStatus.className = "badge success";
        }
      }

      // Cập nhật 3 Box & Khối hiển thị LED cảnh báo ở cuối trang
      if (data.latest) {
        const { cb1, cb2, cb3 } = data.latest;
        val1.textContent = cb1;
        val2.textContent = cb2;
        val3.textContent = cb3;

        // KHỐI 1 (Độ mặn): CHỈ HIỂN THỊ CHỈ SỐ, không sáng nhấp nháy, không đèn cảnh báo
        const readings = [cb1, cb2, cb3];
        const limits = [threshold1, threshold2, threshold3];
        const boxes = [cb1Box, cb2Box, cb3Box];
        const statuses = [status1, status2, status3];
        const ledCards = [ledCard1, ledCard2, ledCard3];
        const ledTexts = [ledText1, ledText2, ledText3];
        readings.forEach((value, index) => {
          const isOn = value > limits[index];
          boxes[index].classList.toggle("blinking", isOn);
          if (statuses[index]) {
            statuses[index].textContent = isOn ? "ON" : "OFF";
            statuses[index].className = isOn ? "status-pill danger" : "status-pill safe";
          }
          if (ledCards[index]) ledCards[index].classList.toggle("led-active", isOn);
          if (ledTexts[index]) ledTexts[index].textContent = isOn ? "ON" : "OFF";
        });
      }

      // Cap nhat 3 bieu do
      if (Array.isArray(data.records) && data.records.length > 0) {
        const sampleTimes = data.records.map(r => r.time);
        const cb1Vals = data.records.map(r => r.cb1);
        const cb2Vals = data.records.map(r => r.cb2);
        const cb3Vals = data.records.map(r => r.cb3);

        renderSingleChart(charts[0], cb1Vals, sampleTimes);
        renderSingleChart(charts[1], cb2Vals, sampleTimes);
        renderSingleChart(charts[2], cb3Vals, sampleTimes);
      }
    } catch (err) {
      if (connStatus) {
        connStatus.textContent = "Mất kết nối";
        connStatus.className = "badge warning";
      }
    } finally {
      isFetching = false;
    }
  }

  fetchEnvironmentState();
  setInterval(fetchEnvironmentState, 300);
}

document.addEventListener("DOMContentLoaded", setupEnvironmentDashboard);
