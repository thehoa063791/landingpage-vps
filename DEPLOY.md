# Landing Page — Self-hosted (PostgreSQL + PM2 + Nginx)

Bản v2 chuyển toàn bộ Supabase (DB + Auth + Storage) sang Postgres + filesystem
tự host, và Vercel → PM2 + Nginx trên VPS.

## Kiến trúc

```
Internet ──► Nginx (443)  ──► Node app (127.0.0.1:3000, PM2)
                              │
                              ├─► Postgres (127.0.0.1:5432)
                              └─► ./storage/  (uploads, thay Supabase Storage)
```

## Chuẩn bị VPS (Ubuntu 22.04+ hoặc Debian 12)

```bash
# Trên VPS, dưới quyền root:
scp deploy/setup.sh root@your-vps:/root/
ssh root@your-vps
DB_PASS='choose-a-strong-password' bash /root/setup.sh
```

Script cài: Node.js 20, PM2, PostgreSQL, Nginx, UFW; tạo role/DB
`landingpage` và user hệ thống `landingpage`.

## Cài code

```bash
# Upload source (rsync hoặc git):
rsync -av --exclude node_modules --exclude .git \
      ./landingpage_vps/  landingpage@your-vps:/opt/landingpage/

ssh landingpage@your-vps
cd /opt/landingpage
npm ci --omit=dev
cp .env.example .env
# Chỉnh .env: DATABASE_URL, JWT_SECRET (>=32 ký tự), PUBLIC_BASE_URL
```

## Chạy migration + seed admin

```bash
npm run db:migrate
node scripts/seed-admin.js admin@your-domain.com 'strong-password' 'Admin'

# Nếu muốn import dữ liệu cũ từ data/*.json:
npm run db:import-json
```

## Start app với PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # in ra 1 lệnh sudo, chạy lệnh đó để auto-start theo systemd
```

## Nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/landingpage.conf
sudo sed -i 's/your-domain.com/your-real-domain.com/g' /etc/nginx/sites-available/landingpage.conf
sudo ln -s /etc/nginx/sites-available/landingpage.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-real-domain.com -d www.your-real-domain.com
```

## Vận hành

| Việc | Lệnh |
|---|---|
| Xem log realtime | `pm2 logs landingpage` |
| Restart | `pm2 restart landingpage` |
| Deploy code mới | `rsync ... && pm2 reload landingpage` |
| Backup DB | `pg_dump -U landingpage landingpage \| gzip > backup-$(date +%F).sql.gz` |
| Restore | `gunzip -c backup.sql.gz \| psql -U landingpage -d landingpage` |
| Backup uploads | `tar -czf storage-$(date +%F).tar.gz storage/` |

## Khác biệt so với version Supabase/Vercel cũ

| Thành phần | Cũ (Supabase + Vercel) | Mới (VPS) |
|---|---|---|
| Database | Supabase Postgres cloud | Postgres tự host |
| Auth | `supabase.auth` (GoTrue) | `db.js` auth — bảng `auth_users` + bcrypt + JWT (`jsonwebtoken`) |
| Storage bucket `cms-media` | Supabase Storage | Thư mục `./storage/cms-media/` phục vụ qua Express static tại `/storage/...` |
| Deploy | `vercel deploy` | `pm2 reload` + Nginx reverse proxy |
| Env | `SUPABASE_URL`/`SERVICE_ROLE_KEY` | `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_BASE_URL` |

Toàn bộ routes/`storage.js` không sửa logic — chỉ đổi 1 import từ
`@supabase/supabase-js` sang `./db` là chạy tiếp, nhờ `src/db.js` mô phỏng
đúng API subset của `supabase-js` mà project đang dùng
(`from().select/insert/update/upsert/delete/eq/ilike/in/or/order/limit/range/single`,
`storage.from().list/upload/getPublicUrl/remove`, `auth.*`, `rpc()`).

## Điểm cần kiểm tra sau khi lên VPS

1. `curl -I https://your-domain.com/` → 200
2. `POST /api/leads` từ 1 landing page ngoài → row mới trong `registrations`
3. `GET /admin` → đăng nhập bằng admin đã seed
4. Upload ảnh trong `/admin/cms` → file xuất hiện trong `storage/cms-media/`, URL public trả 200
5. `pm2 status` → `landingpage` online, restart count = 0

## Production hiện tại: cập nhật admin có phạm vi nhỏ

Domain `event.phamthanhbien.com` chạy tại `/opt/event-landingpage`, PM2 `landingpage`
thuộc user `eventapp`, port `3001`. Thư mục production không phải Git checkout;
so sánh source đang chạy trước khi thay file để giữ các chỉnh sửa trên server.

Ngày 06/10/2026 đã gỡ `workshop`, `richlife-v2` và chế độ demo admin bằng
`deploy/retire-funnels-production.sh`. Script nhận archive gồm `src/funnels.js`,
`src/admin/app.js`, `public/admin.html`, `public/admin/react-shell.js` và
`expected-before.sha256` chứa checksum các file trước khi cập nhật. Bundle được
build từ source admin production đã áp dụng phần sửa tương ứng; không thay toàn bộ
source admin bằng một phiên bản khác.

Script dừng nếu checksum không khớp, sao lưu trước khi thay file và chuyển hai
thư mục đã gỡ vào thư mục backup. Bản sao lưu lần cập nhật này nằm tại
`/opt/event-landingpage-backups/retire-funnels-20261006T102658Z/before.tar.gz`.
Database lead và lịch sử tracking không bị sửa. Đã kiểm tra API production trả
8 funnel, không có hai funnel đã gỡ; `?demo=1` và cờ demo cũ trong trình duyệt
không bật được demo.
