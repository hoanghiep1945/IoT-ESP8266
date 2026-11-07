# BÁO CÁO TỔNG HỢP THAY ĐỔI CODEBASE VÀ HƯỚNG DẪN CẬP NHẬT BÁO CÁO
**Môn học:** Lập trình ứng dụng IoT / Bài thực hành IoT (BTH1 - BTH4)  
**Sinh viên:** Lê Bá Hoàng Hiệp  
**Hệ thống:** Giám sát môi trường & Điều khiển thiết bị (ESP8266 + Node.js/SQLite + Vanilla Web)

---

## MỤC LỤC
1. [Tổng quan Kiến trúc Hệ thống Hiện tại](#1-tổng-quan-kiến-trúc-hệ-thống-hiện-tại)
2. [Những Thay đổi Lớn Đã Thực hiện Trong Codebase](#2-những-thay-đổi-lớn-đã-thực-hiện-trong-codebase)
3. [Những Nội dung CẦN BỎ Trong Báo cáo](#3-những-nội-dung-cần-bỏ-trong-báo-cáo)
4. [Những Nội dung CẦN THÊM / ĐIỀU CHỈNH Trong Báo cáo](#4-những-nội-dung-cần-thêm--điều-chỉnh-trong-báo-cáo)
5. [Bảng Ánh xạ Chân Phần cứng Thực tế (Hardware Pinout)](#5-bảng-ánh-xạ-chân-phần-cứng-thực-tế-hardware-pinout)
6. [Cơ sở Dữ liệu SQLite Thực tế](#6-cơ-sở-dữ-liệu-sqlite-thực-tế)
7. [Gợi ý Trả lời Vấn đáp Khi Chấm thi / Bảo vệ](#7-gợi-ý-trả-lời-vấn-đáp-khi-chấm-thi--bảo-vệ)

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG HIỆN TẠI

Hệ thống được tổ chức theo mô hình IoT 3 lớp chuẩn hóa:

```
[Phần cứng ESP8266]  <---(WiFi / MQTT Broker 1884)--->  [Backend Node.js]  <--->  [Frontend Web]
- DHT11 (D5), LDR (A0)                                    - SQLite (WAL Mode)       - Dashboard (index.html)
- 3 LED ĐK (D1, D2, D6)                                   - REST API                - Warning (warning.html)
- 3 LED Cảnh báo (D8, D7, D3)                             - Session Auth            - Data Sensor (datasensor.html)
                                                                                    - Action History (action-history.html)
                                                                                    - Profile & Login
```

---

## 2. NHỮNG THAY ĐỔI LỚN ĐÃ THỰC HIỆN TRONG CODEBASE

### 2.1. Chuyển đổi toàn diện từ File JSON sang SQLite chuẩn
* **Trước đây:** Hệ thống lưu dữ liệu cảm biến và lịch sử vào file `data.json`.
* **Hiện tại:** 
  * Sử dụng module `node:sqlite` tích hợp sẵn trong Node.js (không phụ thuộc thư viện ngoài).
  * Kích hoạt chế độ ghi siêu tốc `PRAGMA journal_mode = WAL;`.
  * Thiết lập đầy đủ khóa chính (PRIMARY KEY), khóa ngoại (FOREIGN KEY có ràng buộc `ON DELETE SET NULL`), và các chỉ mục đánh dấu thời gian (`CREATE INDEX idx_*_time`) để tối ưu hóa truy vấn tìm kiếm/sắp xếp theo thời gian trong 1 tháng, 1 năm mà không bị chậm.

### 2.2. Hoàn thiện Xác thực Người dùng (UC1 - Login)
* Tạo bảng `users` trong SQLite lưu trữ: `userID`, `username`, `passwordHash`, `fullName`, `email`, `createdAt`.
* Mật khẩu được băm an toàn bằng thuật toán mã hóa `scrypt` (chuẩn Node.js Crypto).
* Đăng nhập thành công trả về Cookie phiên `iot_session`, bảo vệ toàn bộ các API `/api/*` khỏi truy cập trái phép.

### 2.3. Tách luồng Timer & Giảm độ trễ trên Vi điều khiển ESP8266
* **Tách 2 Timer độc lập:**
  * `lastPublishReal` (**2000ms**): Đọc cảm biến thật (DHT11 & LDR), đảm bảo phần cứng DHT11 không bị quá nhiệt, không bị lỗi `NaN`.
  * `lastPublishVirtual` (**2000ms**): Sinh số ngẫu nhiên cho 3 cảm biến ảo BTH4 (CB1, CB2, CB3), giữ trạng thái đèn cảnh báo đủ 2 giây để người nhìn quan sát rõ ràng.
* **Tối ưu Web Polling:**
  * Trang `warning.html` kiểm tra API mỗi **`300ms`** (có cờ `isFetching` chống nghẽn mạng). Ngay khoảnh khắc mạch đổi số và bật đèn, Web lập tức nhảy theo trong vòng **0.1s – 0.2s** (gần như đồng thời).

### 2.4. Khắc phục Triệt để Lỗi Phần cứng "Sáng mờ / Sáng le lói"
* **Nguyên nhân:** Chân D3 (GPIO0) có trở kéo pull-up nội 10k lên 3.3V, chân D8 (GPIO15) có trở pull-down và chia sẻ HSPI, chân D1 dễ bị xung nhiễu sóng RF khi phát WiFi.
* **Xử lý:**
  * Ngay đầu hàm `setup()`, cấu hình ngay lập tức `OUTPUT` và xuất lệnh `digitalWrite(..., LOW)` cho cả 6 chân LED.
  * Trong toàn bộ vòng lặp chờ kết nối WiFi (`connectWiFi`) và chờ MQTT (`connectMQTT`), liên tục dập mức `LOW` cưỡng bức.
  * Trong vòng lặp chính `loop()`, dập mức `LOW` dứt khoát khi các cờ trạng thái là `OFF`. Đèn tắt hoàn toàn 100%, không còn hiện tượng sáng le lói.

### 2.5. Hoán đổi chân Cảnh báo khớp với Thực tế cắm dây
* Khớp theo cách cắm dây thực tế trên bo mạch:
  * **CB1 (0 – 11):** Điều khiển **Bóng LED 1 (chân D8)**.
  * **CB2 (0 – 101):** Điều khiển **Bóng LED 2 (chân D7)**.
  * **CB3 (0 – 1001):** Điều khiển **Bóng LED 3 (chân D3)**.

### 2.6. Màn hình Cảnh báo BTH4 (`warning.html`) chuẩn hóa
* Gồm 3 khối thông số: CB1 (0-11, ngưỡng > 5.5), CB2 (0-101, ngưỡng > 50.5), CB3 (0-1001, ngưỡng > 500.5). Chỉ hiển thị số nguyên/thực thuần túy, loại bỏ dấu `%` gây nhầm lẫn.
* 3 biểu đồ SVG nằm ngang trên cùng một hàng, nhãn thời gian phân bổ cố định 3 điểm (Start: x=60, Mid: x=267, End: x=475) chống đè chữ.
* Khóa màn hình `100vh` không xuất hiện thanh cuộn dọc.
* Dải 3 thẻ trạng thái LED ở chân trang hiển thị nhãn và chữ `ON`/`OFF` đồng bộ với nhịp nháy đèn trên mạch.

### 2.7. Nâng cấp Thanh Cảnh báo Động trên Dashboard (`index.html`)
* Giữ nguyên 100% cấu trúc giao diện và CSS của thanh Cảnh báo.
* Tự động cập nhật thời gian thực khi xảy ra sự kiện:
  * **Nhiệt độ cao:** Vượt $\ge 31.5^\circ\text{C}$ $\rightarrow$ Nhảy giờ thực tế lúc chạm/hơ cảm biến, ghi nhận giá trị thực.
  * **Mất kết nối:** Khi rút nguồn ESP8266 $\rightarrow$ Nhảy giờ ngắt mạng và đếm số giây offline.
  * **Ánh sáng thấp:** Khi che tay vào quang trở LDR ($\le 320\text{ ADC}$) $\rightarrow$ Nhảy giờ thực tế.
  * Lưu trữ vào `localStorage` giúp dữ liệu không bị mất khi F5 tải lại trang.

---

## 3. NHỮNG NỘI DUNG CẦN BỎ TRONG BÁO CÁO

Để báo cáo không bị mâu thuẫn với sản phẩm chạy thực tế trước mặt thầy cô, bạn cần **LƯỢC BỎ** các mục sau trong file Word báo cáo:

| Mục cần BỎ trong báo cáo | Lý do bỏ | Cách điều chỉnh trong tài liệu |
| :--- | :--- | :--- |
| **1. Use Case 7 (UC7 - Quản lý cảnh báo / Màn hình Alerts riêng)** | Đã thống nhất thiết kế: Chức năng cảnh báo được tích hợp trực tiếp ngay trên Dashboard (Thanh Cảnh báo động) và trang `warning.html` (3 LED cảnh báo). Không tạo trang web quản lý cảnh báo riêng biệt để tránh rườm rà. | - Xóa sơ đồ Use Case UC7.<br>- Xóa biểu đồ tuần tự (Sequence Diagram) của UC7.<br>- Chuyển nội dung sang mục: *"Hiển thị cảnh báo trực quan đa cấp độ trên Dashboard và Warning"*. |
| **2. Use Case 8 (UC8 - Quản lý thiết bị riêng biệt)** | Bản chất của việc quản lý thiết bị trong đề tài này chính là bật/tắt 3 đèn LED và theo dõi trạng thái phản hồi. Chức năng này đã nằm trọn vẹn trong **UC3 (Điều khiển thiết bị)** trên Dashboard. | - Xóa UC8 để tránh trùng lặp nội dung với UC3.<br>- Trong phần mô tả UC3, ghi rõ: *"Bao gồm bật/tắt thiết bị, nhận phản hồi trạng thái từ ESP8266 và ghi log lịch sử"*. |
| **3. Mô tả lưu trữ bằng file `data.json`** | Hệ thống hiện tại đã nâng cấp lên cơ sở dữ liệu quan hệ **SQLite** chuyên nghiệp có cấu trúc bảng, khóa chính, khóa ngoại. | - Xóa các đoạn nhắc đến "đọc/ghi file JSON".<br>- Thay bằng chương: *"Thiết kế Cơ sở dữ liệu quan hệ SQLite"*. |
| **4. Các hình chụp giao diện cũ (nếu có)** | Tránh tình trạng hình trong báo cáo một đằng, giao diện demo trước mặt thầy cô một nẻo. | Chụp lại ảnh mới của các màn hình: `index.html` (có thanh cảnh báo động), `warning.html` (chuẩn 3 biểu đồ ngang), `datasensor.html`, `action-history.html`, `profile.html`, `login.html`. |

---

## 4. NHỮNG NỘI DUNG CẦN THÊM / ĐIỀU CHỈNH TRONG BÁO CÁO

### 4.1. Cập nhật Bảng Danh sách Use Case chuẩn hóa
Thay thế bảng Use Case trong báo cáo bằng bảng chuẩn hóa 6 Use Case cốt lõi:

* **UC1 - Đăng nhập hệ thống:** Xác thực tài khoản người dùng qua SQLite, cấp phiên làm việc an toàn.
* **UC2 - Giám sát cảm biến thời gian thực (Dashboard):** Hiển thị chỉ số nhiệt độ, độ ẩm, ánh sáng từ DHT11/LDR và vẽ biểu đồ 3 đường liên tục.
* **UC3 - Điều khiển thiết bị:** Bật/tắt 3 đèn LED qua giao thức MQTT hai chiều (`set` và `state`), lưu lịch sử vào SQLite.
* **UC4 - Tra cứu & Lọc dữ liệu cảm biến (Data Sensor):** Lọc dữ liệu linh hoạt theo loại cảm biến (cả cảm biến thật và CB1, CB2, CB3), tìm kiếm theo giá trị, khoảng thời gian (giờ/ngày/tháng), từ khóa; hỗ trợ phân trang.
* **UC5 - Xem lịch sử thao tác thiết bị (Action History):** Tra cứu nhật ký bật/tắt LED theo thiết bị, hành động, trạng thái và thời gian; hỗ trợ phân trang.
* **UC6 - Quản lý thông tin cá nhân (Profile):** Hiển thị thông tin sinh viên thực hiện, liên kết trực tiếp với dữ liệu trong bảng `users`.
* **Phần mở rộng BTH4 - Màn hình Warning & Cảm biến môi trường:** 3 cảm biến ảo (CB1, CB2, CB3), 3 biểu đồ ngang độc lập, điều khiển 3 đèn LED cảnh báo phần cứng (D8, D7, D3) nhấp nháy chu kỳ 300ms khi vượt ngưỡng 50% max.

### 4.2. Bổ sung Sơ đồ Cơ sở dữ liệu SQLite (ERD)
Bổ sung cấu trúc 4 bảng dữ liệu vào mục Thiết kế CSDL:

1. **Bảng `users`**: Quản lý tài khoản đăng nhập.
   * `userID` (INTEGER, PK, Auto Increment)
   * `username` (TEXT, UNIQUE)
   * `passwordHash` (TEXT - lưu chuỗi băm scrypt)
   * `fullName` (TEXT)
   * `email` (TEXT, UNIQUE)
   * `createdAt` (INTEGER - timestamp)
2. **Bảng `sensor_samples`**: Dữ liệu cảm biến thật (DHT11 & LDR).
   * `id` (TEXT, PK, ví dụ: `#S00001`)
   * `temperature` (REAL - °C)
   * `humidity` (REAL - %)
   * `light` (INTEGER - ADC)
   * `time` (INTEGER - timestamp ms, có Index)
3. **Bảng `virtual_sensor_samples`**: Dữ liệu 3 cảm biến ảo BTH4.
   * `id` (TEXT, PK, ví dụ: `#V00001`)
   * `cb1` (INTEGER, CHECK 0 - 11)
   * `cb2` (INTEGER, CHECK 0 - 101)
   * `cb3` (INTEGER, CHECK 0 - 1001)
   * `time` (INTEGER - timestamp ms, có Index)
4. **Bảng `actions`**: Lịch sử thao tác thiết bị.
   * `id` (TEXT, PK, ví dụ: `#A00001`)
   * `deviceID` (TEXT - `led1`, `led2`, `led3`)
   * `action` (TEXT - `ON`, `OFF`)
   * `status` (TEXT - `SUCCESS`, `FAILED`)
   * `time` (INTEGER - timestamp ms, có Index)
   * `userID` (INTEGER, FK liên kết `users.userID`)

### 4.3. Bổ sung Mô tả Cơ chế Phân tách Timer truyền tin (MQTT)
Đưa sơ đồ khối xử lý thời gian trên ESP8266 vào báo cáo để chứng minh tính tối ưu:
* **Timer Real (2000ms):** Đọc phần cứng thật $\rightarrow$ Publish topic `iot/sensor/all`.
* **Timer Virtual (2000ms):** Sinh số ngẫu nhiên CB1, CB2, CB3 $\rightarrow$ So sánh ngưỡng 50% max $\rightarrow$ Kích hoạt cờ nhấp nháy đèn cảnh báo (chu kỳ 300ms) $\rightarrow$ Publish topic `iot/sensor/virtual`.
* **Frontend Warning Polling (300ms):** Đảm bảo phản hồi thị giác trên web tức thì với mạch thật.

---

## 5. BẢNG ÁNH XẠ CHÂN PHẦN CỨNG THỰC TẾ (HARDWARE PINOUT)

Đưa bảng này vào mục **"Thiết kế Phần cứng và Đấu nối chân"** trong báo cáo:

| Tên linh kiện / Chức năng | Chân vi điều khiển (NodeMCU) | GPIO thực tế | Vai trò / Ngưỡng kích hoạt |
| :--- | :--- | :--- | :--- |
| **Cảm biến nhiệt độ, độ ẩm** | **D5** | GPIO14 | Chân DATA đọc DHT11 |
| **Cảm biến ánh sáng (Quang trở)** | **A0** | ADC0 | Chân ngõ vào Analog đọc điện áp quang trở (0 - 1023) |
| **LED 1 (Điều khiển Dashboard)** | **D1** | GPIO5 | Bật/tắt thủ công từ Dashboard qua MQTT |
| **LED 2 (Điều khiển Dashboard)** | **D2** | GPIO4 | Bật/tắt thủ công từ Dashboard qua MQTT |
| **LED 3 (Điều khiển Dashboard)** | **D6** | GPIO12 | Bật/tắt thủ công từ Dashboard qua MQTT |
| **LED Cảnh báo CB1** | **D8** | GPIO15 | Nhấp nháy chu kỳ 300ms khi CB1 > 5.5 (50% max) |
| **LED Cảnh báo CB2** | **D7** | GPIO13 | Nhấp nháy chu kỳ 300ms khi CB2 > 50.5 (50% max) |
| **LED Cảnh báo CB3** | **D3** | GPIO0 | Nhấp nháy chu kỳ 300ms khi CB3 > 500.5 (50% max) |

---

## 6. GỢI Ý TRẢ LỜI VẤN ĐÁP KHI CHẤM THI / BẢO VỆ

Dưới đây là một số câu hỏi thầy cô rất hay hỏi và câu trả lời ngắn gọn, thuyết phục nhất:

> **Câu 1: Tại sao em không đọc cảm biến DHT11 liên tục 200ms hay 500ms một lần cho nó mượt mà lại để 2 giây?**  
> *Trả lời:* Cảm biến DHT11 sử dụng giao tiếp 1 dây (Single-bus) với tần số lấy mẫu vật lý tối đa của nhà sản xuất là 1Hz (1 lần/giây). Nếu đọc quá nhanh dưới 1 giây, cảm biến sẽ bị quá nhiệt cục bộ, xảy ra lỗi đọc dữ liệu trả về `NaN` hoặc hỏng cảm biến. Do đó chu kỳ 2 giây là chu kỳ an toàn chuẩn kỹ thuật cho DHT11. Còn đối với 3 cảm biến ảo và đèn cảnh báo, em đã tách sang timer riêng để xử lý mượt mà.

> **Câu 2: Cơ sở dữ liệu SQLite của em lưu được bao nhiêu bản ghi và có bị chậm khi truy vấn không?**  
> *Trả lời:* Em đã thiết lập cơ chế tự động dọn dẹp (Prune) giữ lại 1.000 bản ghi cảm biến mới nhất và 100 bản ghi thao tác gần nhất. Đồng thời, các trường thời gian (`time`) đều được đánh chỉ mục `INDEX` và kích hoạt chế độ WAL (`Write-Ahead Logging`), giúp các câu truy vấn lọc theo ngày, tháng, giờ và từ khóa phản hồi chỉ trong vài mili-giây.

> **Câu 3: Thanh cảnh báo ở Dashboard hoạt động tĩnh hay động?**  
> *Trả lời:* Thanh cảnh báo hoạt động động 100% theo dữ liệu thời gian thực. Cụ thể: Khi nhiệt độ phòng vượt ngưỡng quy định ($\ge 31.5^\circ\text{C}$), hoặc khi che tay vào quang trở làm ánh sáng giảm dưới ngưỡng ($\le 320\text{ ADC}$), hoặc khi thiết bị ngắt kết nối WiFi/rút nguồn, hệ thống sẽ tự động cập nhật ngay mốc giờ:phút thực tế vừa xảy ra sự kiện và lưu vào bộ nhớ cache.

> **Câu 4: Hiện tượng chân D3 hoặc D8 bị sáng mờ khi cấp nguồn là do đâu và em khắc phục thế nào?**  
> *Trả lời:* Chân D3 (GPIO0) và D8 (GPIO15) là các chân cấu hình khởi động (Boot Strapping Pins) của ESP8266. Trên bo mạch NodeMCU đã gắn sẵn điện trở kéo pull-up 10k lên 3.3V cho D3 và pull-down cho D8. Khi chân chưa được điều khiển hoặc ở trạng thái thả nổi (floating), dòng rò qua trở kéo sẽ làm LED sáng mập mờ. Em đã xử lý triệt để trong firmware bằng cách cấu hình `OUTPUT` và cưỡng bức mức `LOW` liên tục ngay từ đầu hàm `setup()` và trong các vòng lặp kết nối WiFi/MQTT.

