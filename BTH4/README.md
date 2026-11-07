# BTH4 - Quản lý dự án IoT

Dự án đã được phân chia thành 2 thư mục độc lập:
- `frontend/`: Toàn bộ HTML, CSS, JS, Assets
- `backend/`: Node.js server, API MQTT, SQLite database

## Dọn dẹp các tệp dư thừa ở thư mục gốc (nếu còn sót từ bản cũ):
Nếu trong thư mục gốc `BTH4/` vẫn còn các file HTML hoặc thư mục `css`, `js`, `assets` thừa ngoài gốc, bạn có thể xóa chúng đi vì toàn bộ bản chính đã nằm gọn trong `frontend/`.

## Chạy dự án:
```powershell
cd backend
npm install
npm start
```
Truy cập: http://localhost:3000


## SQLite database

Backend storage uses the built-in `node:sqlite` module. Run with Node.js 22.5 or newer. The database is stored at `backend/sensors.sqlite`. Existing `backend/data.json` records are imported once on first startup and the JSON file is retained as a backup.

## Initial login account

Add the following variables to backend/.env without replacing the existing MQTT settings:

    ADMIN_USERNAME=admin
    ADMIN_EMAIL=admin@iotlab.local
    ADMIN_FULL_NAME=Lê Bá Hoàng Hiệp
    ADMIN_PASSWORD=choose-a-private-password

On the first startup with an empty users table, the backend creates this account and stores a scrypt password hash in SQLite. Existing accounts are not overwritten. Sign in with the username or email. The session cookie expires after 12 hours and is cleared by the sidebar logout link.
