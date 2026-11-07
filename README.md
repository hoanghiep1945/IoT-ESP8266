# Hệ thống đo cảm biến và điều khiển LED bằng MQTT

Dự án bài tập lớn môn học **IoT và Ứng dụng (INT14149)** - Học viện Công nghệ Bưu chính Viễn thông (PTIT).

* **Sinh viên thực hiện:** Lê Bá Hoàng Hiệp
* **Mã sinh viên:** B23DCAT097
* **Giảng viên hướng dẫn:** TS. Nguyễn Quốc Uy

---

## 📌 Tổng quan kiến trúc hệ thống

Hệ thống được xây dựng theo mô hình IoT hoàn chỉnh gồm 5 tầng kết nối:
1. **Hardware (Lớp phần cứng):** Vi điều khiển ESP8266 kết nối cảm biến nhiệt độ & độ ẩm DHT11, cảm biến ánh sáng quang trở (LDR) và cụm đèn LED chấp hành.
2. **MQTT Broker:** Sử dụng Eclipse Mosquitto (port 1884) làm trung gian phân phối dữ liệu theo cơ chế Publish/Subscribe.
3. **Backend:** Nền tảng Node.js tiếp nhận bản tin MQTT, xử lý logic điều khiển hai chiều, xác thực tài khoản qua băm mật khẩu `scrypt` và cung cấp hệ thống REST API.
4. **Database:** Cơ sở dữ liệu quan hệ SQLite tối ưu hiệu năng cao với chế độ ghi trước WAL (`PRAGMA journal_mode = WAL`).
5. **Frontend:** Giao diện Dashboard Web hiện đại (HTML5, CSS3, JavaScript) hiển thị số liệu thời gian thực, vẽ biểu đồ đường cong SVG và điều khiển thiết bị tức thì.

---

## 🔌 Sơ đồ đấu nối phần cứng (ESP8266 Pinout)

| Linh kiện | Chân trên mạch ESP8266 | GPIO | Chức năng |
| :--- | :--- | :--- | :--- |
| **DHT11** | Chân D5 | GPIO14 | Đọc nhiệt độ (°C) và độ ẩm (%) |
| **Quang trở (LDR)** | Chân A0 | ADC0 | Đọc mức ánh sáng môi trường (0 - 1023 ADC) |
| **LED 1** | Chân D1 | GPIO5 | Thiết bị chấp hành mô phỏng 1 (Bật / Tắt) |
| **LED 2** | Chân D2 | GPIO4 | Thiết bị chấp hành mô phỏng 2 (Bật / Tắt) |
| **LED 3** | Chân D6 | GPIO12 | Thiết bị chấp hành mô phỏng 3 (Bật / Tắt) |
| **LED Cảnh báo 1** | Chân D8 | GPIO15 | Đèn cảnh báo cảm biến vượt ngưỡng |
| **LED Cảnh báo 2** | Chân D7 | GPIO13 | Đèn cảnh báo cảm biến vượt ngưỡng |
| **LED Cảnh báo 3** | Chân D3 | GPIO0 | Đèn cảnh báo cảm biến vượt ngưỡng |

---

## 📁 Cấu trúc thư mục dự án

```text
├── sketch_sep17a.ino               # Mã nguồn C/C++ nạp cho vi điều khiển ESP8266
├── IoT_API_Collection.postman_json  # Bộ sưu tập Postman kiểm thử toàn bộ API
├── README.md                       # Tài liệu hướng dẫn dự án
├── BTH4/
│   ├── backend/                    # Máy chủ Node.js & SQLite database
│   │   ├── server.js               # Logic điều khiển, MQTT Client & REST API
│   │   ├── package.json            # Cấu hình thư viện phụ thuộc
│   │   └── .env.example            # Mẫu cấu hình biến môi trường
│   └── frontend/                   # Toàn bộ mã nguồn giao diện Web
│       ├── index.html              # Màn hình Dashboard chính
│       ├── login.html              # Màn hình đăng nhập
│       ├── datasensor.html         # Màn hình tra cứu & lọc dữ liệu cảm biến
│       ├── action-history.html     # Màn hình lịch sử thao tác điều khiển
│       ├── profile.html            # Màn hình thông tin cá nhân
│       ├── css/                    # Định kiểu giao diện
│       └── js/                     # Logic xử lý giao diện & gọi API
```

---

## 🚀 Hướng dẫn cài đặt và khởi chạy

### 1. Nạp code cho ESP8266
1. Mở file `sketch_sep17a.ino` bằng Arduino IDE.
2. Cấu hình tên Wi-Fi, mật khẩu và địa chỉ IP của máy tính chạy MQTT Broker:
   ```cpp
   const char* ssid = "Ten_Wifi";
   const char* password = "Mat_Khau_Wifi";
   const char* mqtt_server = "192.168.x.x"; // IP máy chủ Backend
   ```
3. Cài đặt các thư viện cần thiết: `ESP8266WiFi`, `PubSubClient`, `DHT sensor library`, `ArduinoJson`.
4. Chọn đúng Board (NodeMCU 1.0 hoặc Generic ESP8266 Module) và nạp code vào mạch.

### 2. Khởi chạy Backend và Database
1. Yêu cầu cài đặt **Node.js phiên bản 22.5 trở lên** (để sử dụng thư viện tích hợp `node:sqlite`).
2. Mở cửa sổ dòng lệnh tại thư mục backend:
   ```powershell
   cd BTH4/backend
   npm install
   ```
3. Cấu hình file `.env` (tạo từ `.env.example`):
   ```env
   PORT=3000
   MQTT_URL=mqtt://localhost:1884
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_password
   ADMIN_FULL_NAME="Lê Bá Hoàng Hiệp"
   ADMIN_EMAIL=admin@iotlab.local
   ```
4. Khởi chạy server:
   ```powershell
   npm start
   ```

### 3. Truy cập hệ thống
* Mở trình duyệt web và truy cập địa chỉ: `http://localhost:3000`
* Đăng nhập bằng tài khoản Admin đã cấu hình để truy cập giao diện giám sát và điều khiển.
