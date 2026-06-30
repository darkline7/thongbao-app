# 🌱 PT Noti — Grow a Garden Shop Tracker

Web app theo dõi cửa hàng hạt giống & công cụ trong game **Grow a Garden** (Roblox), cập nhật real-time mỗi 5 phút.

## Tính năng

- 🌱 **Hạt giống & Công cụ** — hiển thị danh sách đang bán theo time slot
- ⏳ **Countdown** — đếm ngược đến lần đổi lịch tiếp theo
- 🌦️ **Thời tiết** — thời tiết hiện tại trong game
- 🔔 **Thông báo** — announcement từ server
- 👤 **Tài khoản** — liên kết Game ID
- 🌙 **Dark / Light mode**
- 📱 **Mobile-friendly**

## Cài đặt

```bash
# 1. Clone repo
git clone https://github.com/darkline7/thongbao-app.git
cd thongbao-app

# 2. Cài dependencies
npm install

# 3. Tạo file .env
cp .env.example .env
# Điền FIREBASE_API_KEY và FIREBASE_REFRESH_TOKEN vào .env

# 4. Chạy server
npm start
# Mở http://127.0.0.1:4173
```

## Cập nhật hạt giống / công cụ thủ công

Khi game đổi time slot, sửa `overrideResponses` trong `server.js`:

```js
// Trong server.js — tìm phần overrideResponses
{ name: "carrot_seed", count: 24 },
{ name: "daisy_seed_white", count: 14 },
```

Sau đó restart server: `node server.js`

## Cấu trúc dự án

```
thongbao-app/
├── server.js          # Backend Node.js server
├── web/
│   └── index.html     # Frontend SPA
├── package.json
├── .env.example       # Mẫu file cấu hình
├── .gitignore
└── README.md
```

## Bảo mật

⚠️ **Không commit file `.env`** — file này chứa Firebase token nhạy cảm.  
File `.env` đã được thêm vào `.gitignore`.
