# E-Commerce Microservices MVP (Node.js, DDD, Database-per-Service, gRPC, Redis, Kafka)

Hệ thống Backend RESTful API cho nền tảng thương mại điện tử phiên bản MVP, tuân thủ kiến trúc **Microservices**, **Domain-Driven Design (DDD)**, **Database-per-Service** và **Event-Driven Architecture**.

## 1. Kiến trúc Hệ thống (13 Containers)

- **API Gateway (`api-gateway` - Port `3000`) + `redis-gateway` (Port `6379`)**:
  - Định tuyến RESTful HTTP/JSON sang gRPC đồng bộ tới 5 Microservices.
  - Xác thực JWT, danh sách đen Token đăng xuất (Blacklist), phân quyền RBAC (`admin`, `staff`, `customer`).
  - Giới hạn tốc độ (**Rate Limiting**) và bộ nhớ đệm (**Caching** `X-Cache: HIT/MISS`) bằng **Redis**.
  - Ghi log tập trung kèm `X-Request-Id` và kiểm tra sức khỏe tổng thể (`GET /api/health`).
- **5 Bounded Context Microservices**:
  1. `auth-service` (`:50051`) + `postgres-auth` (`auth_db`) — Đăng ký, đăng nhập (`bcrypt` + `JWT`), vai trò.
  2. `customer-service` (`:50052`) + `postgres-customer` (`customer_db`) — Hồ sơ khách hàng, hạng thành viên & điểm `score`.
  3. `product-service` (`:50053`) + `mongo-product` (`product_db`) — Danh mục sản phẩm & trừ tồn kho nguyên tử.
  4. `order-service` (`:50054`) + `postgres-order` (`order_db`) — Tính `discount` theo `score`, lưu `Order`/`OrderDetail` và xuất sự kiện bằng **Transactional Outbox Pattern** sang **Apache Kafka**.
  5. `shipment-service` (`:50055`) + `mongo-shipment` (`shipment_db`) — Tiêu thụ bất đồng bộ topic `order-created` (**Idempotent Consumer**) và cập nhật trạng thái giao vận.
- **Message Broker**: `kafka` (`apache/kafka:3.8.0` ở chế độ KRaft, port `9092`).

## 2. Tài liệu Hướng dẫn & Nhật ký Đánh giá

- **Hướng dẫn chi tiết từng bước mức cơ bản & Cẩm nang bảo vệ:** [`docs/huong_dan_tung_buoc.md`](docs/huong_dan_tung_buoc.md)
- **Nhật ký thực hiện & Đánh giá khách quan sau mỗi bước:** [`docs/implementation_log.md`](docs/implementation_log.md)

## 3. Khởi chạy Nhanh

### Chạy toàn bộ bằng Docker Compose (Khuyến nghị)
```powershell
docker compose up -d --build
docker compose ps
```
Kiểm tra Health Check: `GET http://localhost:3000/api/health`

### Chạy bộ kiểm thử tự động 25 Test Cases chuẩn
```powershell
# Chạy cụm kiểm thử nội bộ (không cần bật Docker)
npm.cmd run test:25tc

# Chạy kiểm thử trực tiếp trên hệ thống Docker Compose đang mở ở cổng 3000
npm.cmd run test:docker
```

## 4. Tài khoản Mẫu Khởi tạo Sẵn

| Vai trò | Username | Password | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `Admin@123` | Hạng Platinum (`score = 1000`, giảm 15%) |
| **Shipment Staff** | `staff` | `Staff@123` | Nhân viên cập nhật trạng thái vận đơn |
| **Customer (Silver)** | `alice` | `Pass@123` | `uid = 3`, `score = 100` (giảm 5%) |
| **Customer (Gold)** | `bob` | `Pass@123` | `uid = 4`, `score = 500` (giảm 10%) |

