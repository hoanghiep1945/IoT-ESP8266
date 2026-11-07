function setupChart() {
  const maximums = [50, 100, 1000];
  const lines = Array.from(document.querySelectorAll(".chart-line"));
  const values = lines.map(line => line.dataset.values.split(",").map(Number));
  
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
  const clock = time => new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const chart = document.querySelector(".chart-wrap");
  const svg = chart.querySelector("svg");
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
  
  function drawChart() {
    const now = Date.now();
    const width = chart.clientWidth;
    const height = chart.clientHeight;
    if (!width || !height) return;
    const left = 80, right = width - 65;
    const top = 32, bottom = height - 32;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.querySelectorAll(".grid-lines line").forEach((line, index) => {
      const y = top + index * (bottom - top) / 4;
      line.setAttribute("x1", left);
      line.setAttribute("x2", right);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
    });
    // Lưới dọc và hai trục tung; các vạch chia dùng cùng thang với nhãn.
    svg.querySelectorAll(".vertical-grid line").forEach((line, index) => {
      const x = left + index * (right - left) / 5;
      line.setAttribute("x1", x);
      line.setAttribute("x2", x);
      line.setAttribute("y1", top);
      line.setAttribute("y2", bottom);
    });
    svg.querySelectorAll(".chart-axes line").forEach((line, index) => {
      line.setAttribute("x1", index === 1 ? right : left);
      line.setAttribute("x2", index === 0 ? left : right);
      line.setAttribute("y1", index === 2 ? bottom : top);
      line.setAttribute("y2", bottom);
    });
    svg.querySelectorAll(".axis-ticks line").forEach((line, index) => {
      const x = index < 5 ? left : right;
      const y = top + (index % 5) * (bottom - top) / 4;
      line.setAttribute("x1", x);
      line.setAttribute("x2", x + (index < 5 ? -6 : 6));
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
    });

    //Tạo points bên trong drawChart()
    lines.forEach((line, index) => {
      const points = values[index].map((value, i) => [
        left + i * (right - left) / 15,
        bottom - value / maximums[index] * (bottom - top)
      ]);
      line.setAttribute("d", smoothPath(points));
      points.forEach(([x, y], i) => {
        markers[index][i].setAttribute("cx", x);
        markers[index][i].setAttribute("cy", y);
      });
      metrics[index].firstChild.textContent = values[index][15].toFixed(index === 2 ? 0 : 1) + " ";
    });
    humidityScale.forEach((label, index) => {
      label.setAttribute("y", top + index * (bottom - top) / 4 + 4);
      label.setAttribute("x", left - 12);
    });
    temperatureScale.forEach((label, index) => {
      label.setAttribute("y", top + index * (bottom - top) / 4 + 4);
      label.setAttribute("x", left - 46);
    });
    lightScale.forEach((label, index) => {
      label.setAttribute("y", top + index * (bottom - top) / 4 + 4);
      label.setAttribute("x", right + 12);
    });
    timeLabels.forEach((label, index) => {
      label.setAttribute("x", left + index * (right - left) / 5);
      label.setAttribute("y", height - 8);
      label.textContent = clock(now - (15 - index * 3) * 3000);
    });
    svg.querySelector(".humidity-unit").setAttribute("x", left - 12);
    svg.querySelector(".temperature-unit").setAttribute("x", left - 46);
    svg.querySelector(".light-unit").setAttribute("x", right + 12);
    document.querySelector(".chart-panel .panel-heading > .muted").textContent = clock(now - 45000) + " – " + clock(now);
    document.querySelector("#chart-description").textContent = "16 mẫu mô phỏng trong 45 giây gần nhất. Thang trái: nhiệt độ (0–50 °C) và độ ẩm (0–100 %). Thang phải: ánh sáng (0–1000 Lux).";
  }
  //tính toán và vẽ lại biểu đồ cho phù hợp.
  new ResizeObserver(drawChart).observe(chart);
  drawChart();
  let sampleIndex = 15;
  setInterval(() => {
    sampleIndex++;
    values.forEach((series, index) => {
      const target = [28.5, 74, 650][index] + Math.sin(sampleIndex * 0.25 + index * 0.4) * [0.8, 2.5, 140][index];
      const next = Math.max(0, Math.min(maximums[index], series[15] + (target - series[15]) * 0.22));
      series.shift();
      series.push(index === 2 ? Math.round(next) : Math.round(next * 10) / 10);
    });
    drawChart();
  }, 3000);
}

setupChart();