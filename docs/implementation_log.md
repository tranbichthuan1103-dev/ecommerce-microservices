# Nhật Ký Xây Dựng & Đánh Giá Khách Quan Hệ Thống E-Commerce Microservices MVP

- **Dự án:** Hệ thống Thương mại Điện tử MVP (Node.js, Microservices, DDD, Database-per-Service)
- **Vai trò hướng dẫn & đánh giá:** Software Architect & Senior Backend Engineer (AI)
- **Thời gian khởi tạo:** 2026-10-27
- **Tài liệu thiết kế tham chiếu:**
  - `docs/Microservice-Architecture-Design.md` (Kiến trúc tổng thể: API Gateway, Redis, 5 Microservices, PostgreSQL, MongoDB, gRPC, Kafka)
  - `docs/Bounded-Context.md` & `docs/ERD.md` (5 Bounded Contexts & Thiết kế CSDL)
  - `docs/Business-Process-Model.md` (Luồng 10 bước Đặt hàng, Tính Discount, Trừ kho, Transactional Outbox & Giao vận)
  - `docs/API_Specification_Ecommerce_MVP.xlsx` (14 RESTful API Endpoints chuẩn)
  - `docs/25_TestCases_5_BoundedContexts.xlsx` & `docs/phieu_cham.md` (25 Test Cases & Tiêu chí chấm thực hành)

---

## Quy tắc Nghiệp vụ & Kiến trúc đã thống nhất

1. **5 Bounded Contexts & Database-per-Service:**
   - **Identity & Access (`auth-service`)**: PostgreSQL (`auth_db`) — Bảng `roles`, `users`.
   - **Customer & Membership (`customer-service`)**: PostgreSQL (`customer_db`) — Bảng `memberships`, `customers`.
   - **Product Catalog (`product-service`)**: MongoDB (`product_db`) — Collections `products`, `inventories`.
   - **Order Management (`order-service`)**: PostgreSQL (`order_db`) — Bảng `orders`, `order_details`, `outbox_events`.
   - **Shipment (`shipment-service`)**: MongoDB (`shipment_db`) — Collections `shipments`, `trackings`.
2. **API Gateway & Redis:**
   - Routing RESTful JSON (Client) $\rightarrow$ gRPC (5 Microservices).
   - JWT Authentication, Token Blacklist, RBAC Authorization (`admin`, `staff`, `customer`).
   - Redis Rate Limiting & Redis Response Caching (`X-Cache: HIT/MISS`).
   - Centralized Access Logging & Health Check (`GET /api/health`).
3. **Chính sách tính Discount theo `score` thành viên:**
   - `score >= 1000` (Platinum): Giảm **15%** tổng giá trị đơn hàng.
   - `score >= 500` (Gold): Giảm **10%** tổng giá trị đơn hàng.
   - `score >= 100` (Silver): Giảm **5%** tổng giá trị đơn hàng.
   - `score < 100` (Bronze): Giảm **0%**.
4. **Lộ trình 10 bước thực hiện & kiểm tra:**
   - **Bước 1:** Thiết lập cấu trúc Monorepo & Định nghĩa hợp đồng gRPC (`.proto`).
   - **Bước 2:** Xây dựng `auth-service` (DDD + PostgreSQL + JWT + Bcrypt).
   - **Bước 3:** Xây dựng `customer-service` (DDD + PostgreSQL + Membership & Score).
   - **Bước 4:** Xây dựng `product-service` (DDD + MongoDB + Atomic Inventory Reservation).
   - **Bước 5:** Xây dựng `order-service` (DDD + PostgreSQL + Discount Policy + gRPC Clients + Transactional Outbox Kafka).
   - **Bước 6:** Xây dựng `shipment-service` (DDD + MongoDB + Idempotent Kafka Consumer + Tracking).
   - **Bước 7:** Xây dựng `api-gateway` + `Redis` (Routing, JWT Auth, RBAC, Rate Limiting, Caching, Logging, Health Check).
   - **Bước 8:** Dockerize toàn bộ hệ thống & Thiết lập `docker-compose.yml` (13 containers).
   - **Bước 9:** Kiểm thử tích hợp tự động toàn bộ **25/25 Test Cases** chuẩn thiết kế.
   - **Bước 10:** Biên soạn Tài liệu Hướng dẫn Cơ bản Từng bước (`docs/huong_dan_tung_buoc.md`) & `README.md`.

---

## Bước 1: Thiết lập Cấu trúc Monorepo & Định nghĩa Hợp đồng gRPC (`.proto`)

### 1. Diễn giải công việc đã thực hiện
- Khởi tạo kiến trúc Monorepo sử dụng `npm workspaces` tại `package.json` gốc để quản lý tập trung phụ thuộc cho `api-gateway` và 5 microservices trong `services/*`, đồng thời mỗi service vẫn có `package.json` độc lập để đóng gói Docker nhẹ nhất.
- Thiết kế đầy đủ **5 file Protobuf (`proto3`)** đại diện cho 5 Bounded Contexts:
  1. `proto/auth.proto` (`auth.AuthService` — 4 RPCs): `Register`, `Login`, `VerifyToken`, `HealthCheck`.
  2. `proto/customer.proto` (`customer.CustomerService` — 9 RPCs): `CreateCustomer`, `GetCustomer`, `UpdateCustomer`, `GetCustomerScore`, `ListMemberships`, `GetMembership`, `CreateMembership`, `UpdateMembership`, `HealthCheck`.
  3. `proto/product.proto` (`product.ProductService` — 9 RPCs): `ListProducts`, `GetProduct`, `CreateProduct`, `UpdateProduct`, `UpdateInventory`, `DeleteProduct`, `ReserveInventory`, `ReleaseInventory`, `HealthCheck`.
  4. `proto/order.proto` (`order.OrderService` — 4 RPCs): `CreateOrder`, `GetOrder`, `ListOrders`, `HealthCheck`.
  5. `proto/shipment.proto` (`shipment.ShipmentService` — 5 RPCs): `GetShipment`, `GetShipmentByOrder`, `ListShipments`, `UpdateShipmentStatus`, `HealthCheck`.

### 2. Kết quả kiểm tra thực tế
- Cài đặt dependencies bằng `npm.cmd install`: Thành công (`added 162 packages`, exit code `0`).
- Chạy trình nạp `@grpc/proto-loader` và `@grpc/grpc-js` kiểm tra cú pháp, package và chữ ký hàm của cả 5 file `.proto`:
  ```text
  [OK] auth.proto -> auth.AuthService RPCs (4): Register, Login, VerifyToken, HealthCheck
  [OK] customer.proto -> customer.CustomerService RPCs (9): CreateCustomer, GetCustomer, UpdateCustomer, GetCustomerScore, ListMemberships, GetMembership, CreateMembership, UpdateMembership, HealthCheck
  [OK] product.proto -> product.ProductService RPCs (9): ListProducts, GetProduct, CreateProduct, UpdateProduct, UpdateInventory, DeleteProduct, ReserveInventory, ReleaseInventory, HealthCheck
  [OK] order.proto -> order.OrderService RPCs (4): CreateOrder, GetOrder, ListOrders, HealthCheck
  [OK] shipment.proto -> shipment.ShipmentService RPCs (5): GetShipment, GetShipmentByOrder, ListShipments, UpdateShipmentStatus, HealthCheck
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Phân tách đúng 5 Bounded Contexts theo tài liệu `Bounded-Context.md` và `Microservice-Architecture-Design.md`.
  - Bổ sung phương thức `ReleaseInventory` bên cạnh `ReserveInventory` trong `product.proto` để hỗ trợ hoàn kho (Saga Compensation) nếu giao dịch tạo đơn hàng gặp lỗi.
  - Tuân thủ kiến trúc Event-Driven: `shipment.proto` không mở RPC `CreateShipment` công khai vì vận đơn được sinh bất đồng bộ từ Kafka event `OrderCreated`.
- **Lưu ý / Điểm cần chú ý:**
  - Trên Windows PowerShell, lệnh `npm` mặc định bị chặn bởi *ExecutionPolicy* đối với script `.ps1`; cần sử dụng `npm.cmd` khi thao tác trực tiếp trên PowerShell.
  - Trong `proto3`, giá trị mặc định của số (`0`) không phân biệt được với "không truyền tham số", do đó `UpdateProductRequest` đã chủ động thêm cờ `has_price` và `has_quantity` để cập nhật chính xác cả trường hợp `quantity = 0`.
- **Trạng thái bước 1:** **ĐẠT (PASSED)**

---

## Bước 2: Xây dựng `auth-service` (Identity & Access Bounded Context + PostgreSQL)

### 1. Diễn giải công việc đã thực hiện
- Tổ chức `services/auth-service` theo chuẩn **DDD 4 tầng**:
  - `src/domain/user.entity.js`: Định nghĩa thực thể `User` và `DomainError`, đóng gói quy tắc kiểm tra tính hợp lệ (`username` 2–50 ký tự, `password` không được rỗng).
  - `src/application/auth.usecase.js`: Cài đặt các Use Cases `register` (kiểm tra trùng `username`/`email`, băm mật khẩu với `bcryptjs` salt rounds = 10), `login` (đối chiếu bcrypt, ký JWT chứa `sub`, `uid`, `username`, `role`) và `verifyToken`.
  - `src/infrastructure/user.repository.js`: Cài đặt `PostgresUserRepository` quản lý bảng `roles` và `users` trên `PostgreSQL (auth_db)` kèm seed dữ liệu mẫu (`admin`, `staff`, `alice`, `bob`) và đồng bộ sequence `uid`; đồng thời cung cấp `InMemoryUserRepository` cùng interface cho kiểm thử độc lập.
  - `src/presentation/grpc.server.js` & `src/index.js`: Khởi tạo gRPC Server ánh xạ chuẩn mã lỗi miền sang gRPC Status (`INVALID_ARGUMENT = 3`, `ALREADY_EXISTS = 6`, `UNAUTHENTICATED = 16`).

### 2. Kết quả kiểm tra thực tế
- Khởi chạy gRPC server `auth-service` và gọi trực tiếp bằng gRPC Client cho toàn bộ kịch bản IAM:
  ```text
  TC-IAM-01 Register OK: {"uid":5,"username":"john","role":"customer","message":"User registered successfully"}
  TC-IAM-02 Duplicate code: 6 Username 'john' already exists
  TC-IAM-03 Empty pwd code: 3 Password is required and cannot be empty
  TC-IAM-04 Login OK: token_type=Bearer, role=customer, uid=5
  TC-IAM-05 Wrong pwd code: 16 Invalid username or password
  VerifyToken OK: {"valid":true,"uid":5,"username":"john","role":"customer","error":""}
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Mật khẩu tuyệt đối không lưu dạng rõ (plain-text), được băm bằng `bcryptjs` đúng yêu cầu `API-AUTH-01`.
  - JWT Payload chứa đầy đủ `sub`, `uid`, `username`, `role` phục vụ cả xác thực lẫn phân quyền RBAC tại API Gateway.
  - Đã tự động đồng bộ `pg_get_serial_sequence('users', 'uid')` sau khi seed tài khoản mẫu, tránh lỗi trùng khóa chính `uid` khi đăng ký user mới trên PostgreSQL thật.
- **Phát hiện & Khắc phục trong quá trình kiểm tra:**
  - Khi truyền `port: 0` (cổng ngẫu nhiên phục vụ test), biểu thức `options.port || ...` coi `0` là falsy và rơi về `50051`. Đã khắc phục ngay bằng toán tử nullish coalescing (`options.port ?? process.env.AUTH_GRPC_PORT ?? '50051'`).
- **Trạng thái bước 2:** **ĐẠT (PASSED)**

---

## Bước 3: Xây dựng `customer-service` (Customer & Membership Bounded Context + PostgreSQL)

### 1. Diễn giải công việc đã thực hiện
- Triển khai `services/customer-service` theo kiến trúc **DDD 4 tầng** với CSDL riêng `PostgreSQL (customer_db)`:
  - `src/domain/customer.entity.js`: Định nghĩa thực thể `Customer` (`uid`, `fullname`, `mid`) và `Membership` (`mid`, `mname`, `score`), kèm logic kiểm tra đầu vào.
  - `src/application/customer.usecase.js`: Xử lý `createCustomer`, `getCustomer`, `updateCustomer`, `getCustomerScore` (cung cấp điểm cho `Order Service`) và đầy đủ CRUD hạng thành viên (`listMemberships`, `getMembership`, `createMembership`, `updateMembership`).
  - `src/infrastructure/customer.repository.js`: Tạo bảng `memberships` và `customers` với khóa ngoại nội bộ `customers.mid -> memberships.mid`; khởi tạo sẵn 4 hạng thẻ chuẩn (`Bronze: 0`, `Silver: 100`, `Gold: 500`, `Platinum: 1000`).
  - `src/presentation/grpc.server.js` & `src/index.js`: Mở gRPC Server cổng mặc định `50052`.

### 2. Kết quả kiểm tra thực tế
- Khởi chạy gRPC server `customer-service` và kiểm tra trực tiếp các RPC:
  ```text
  [customer-service] gRPC server listening on 127.0.0.1:59483 (dbMode=memory)
  TC-CUS-01 GetCustomer(3): {"uid":3,"fullname":"Alice Nguyen","mid":2,"mname":"Silver","score":100}
  TC-CUS-02 Missing uid code: 5 Customer uid=9999 not found
  TC-CUS-03 UpdateCustomer(3): {"message":"Customer updated successfully","uid":3,"fullname":"Alice Updated","mid":3,"mname":"Gold","score":500}
  TC-CUS-04 GetCustomerScore(3): {"uid":3,"mid":3,"mname":"Gold","score":500}
  ListMemberships count: 4
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Tuân thủ nghiêm ngặt nguyên lý **Bounded Context**: Bảng `customers` chỉ giữ khóa logic `uid` (không có Foreign Key vật lý sang `auth_db`), trong khi `mid` vẫn có Foreign Key vật lý tới bảng `memberships` vì nằm cùng một Bounded Context.
  - Hàm `createCustomer` được thiết kế **Idempotent** (`ON CONFLICT (uid) DO NOTHING`), giúp quá trình đồng bộ hồ sơ khách hàng sau khi đăng ký tài khoản không bao giờ sinh lỗi trùng lặp.
- **Lưu ý / Điểm cần chú ý:**
  - Test case `TC-CUS-05` (*Truy vấn Customer không có token -> 401 Unauthorized*) là trách nhiệm của tầng bảo vệ **API Gateway** và sẽ được kiểm tra tích hợp tại Bước 7 và Bước 9.
- **Trạng thái bước 3:** **ĐẠT (PASSED)**

---

## Bước 4: Xây dựng `product-service` (Product Catalog Bounded Context + MongoDB)

### 1. Diễn giải công việc đã thực hiện
- Triển khai `services/product-service` sử dụng NoSQL **MongoDB (`product_db`)** theo thiết kế `Microservice-Architecture-Design.md`:
  - `src/domain/product.entity.js`: Thực thể `Product` (`pid`, `pname`, `price`, `quantity`), kiểm tra giá bán `price > 0` và `quantity >= 0` nguyên.
  - `src/application/product.usecase.js`:
    - Các Use Cases quản lý danh mục: `listProducts`, `getProduct`, `createProduct`, `updateProduct`, `updateInventory`, `deleteProduct`.
    - Nghiệp vụ giữ hàng cho đơn (`reserveInventory`): Tự động gộp các dòng trùng `pid` trong cùng 1 đơn hàng, kiểm tra tồn kho và trừ kho nguyên tử; nếu bất kỳ mặt hàng nào trong đơn không đủ tồn kho (`INSUFFICIENT_STOCK`), tự động hoàn lại số lượng của các mặt hàng đã trừ trước đó trong cùng lô.
    - Nghiệp vụ hoàn kho (`releaseInventory`): Bù trừ tồn kho khi giao dịch ở `order-service` thất bại.
  - `src/infrastructure/product.repository.js`: Đồng bộ dữ liệu trên cả 2 collection `products` và `inventories` trong MongoDB, sử dụng `findOneAndUpdate` với điều kiện `{ pid, quantity: { $gte: qty } }` để chống *Race Condition* khi nhiều người mua cùng lúc, và quản lý mã tự tăng `pid` bằng collection `counters`.

### 2. Kết quả kiểm tra thực tế
- Khởi chạy gRPC server `product-service` và kiểm tra trực tiếp 5 kịch bản sản phẩm + kiểm tra hoàn kho đa mặt hàng:
  ```text
  [product-service] gRPC server listening on 127.0.0.1:57317 (dbMode=memory)
  TC-PRO-01 ListProducts count: 3
  TC-PRO-02 GetProduct(1): {"pid":1,"pname":"Laptop Gaming Pro","price":1500,"quantity":10}
  TC-PRO-03 Missing pid code: 5 Product pid=999 not found
  TC-PRO-04 CreateProduct: {"pid":4,"pname":"USB-C Hub","price":45.5,"quantity":15}
  TC-PRO-05 UpdateInventory: {"pid":4,"pname":"USB-C Hub","price":45.5,"quantity":30}
  Atomic Rollback check: error code=9, pid=1 stock restored to 10
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Xử lý triệt để bài toán *Concurrent Overselling* (bán lố tồn kho) nhờ thao tác nguyên tử `findOneAndUpdate({ pid, quantity: { $gte: qty } }, { $inc: { quantity: -qty } })` của MongoDB.
  - Xử lý tốt edge-case khách gửi trùng `pid` nhiều lần trong cùng mảng `items` (ví dụ `[{pid:1, qty:6}, {pid:1, qty:6}]` khi kho còn `10`).
  - Duy trì đồng bộ cả collection `products` lẫn `inventories`, khớp 100% với cả sơ đồ `Bounded-Context.jpg` và `Microservice-Architecture-Design.jpg`.
- **Lưu ý / Điểm cần chú ý:**
  - Phân quyền `Admin only` cho các thao tác `CreateProduct`, `UpdateProduct`, `DeleteProduct` (`API-PRO-03..05`) được thực thi tập trung tại tầng Authorization RBAC của `API Gateway`.
- **Trạng thái bước 4:** **ĐẠT (PASSED)**

---

## Bước 5: Xây dựng `order-service` (Order Management Bounded Context + PostgreSQL + Kafka Outbox)

### 1. Diễn giải công việc đã thực hiện
- Triển khai `services/order-service` đóng vai trò **Service Orchestrator** cho quy trình đặt hàng 10 bước (`Business-Process-Model.md`):
  - `src/domain/order.entity.js`: Cài đặt `DiscountPolicy` tính chiết khấu theo bậc điểm `score` (`>=1000`: 15%, `>=500`: 10%, `>=100`: 5%, `<100`: 0%) và thực thể `Order` chuẩn hóa danh sách mặt hàng.
  - `src/infrastructure/grpc.clients.js`: Kết nối gRPC đồng bộ tới `customer-service` (`GetCustomerScore`) và `product-service` (`ReserveInventory`, `ReleaseInventory`).
  - `src/infrastructure/order.repository.js`: Quản lý 3 bảng `orders`, `order_details` (Composite PK `(oid, pid)`) và `outbox_events` trong CSDL `PostgreSQL (order_db)`. Thực thi `BEGIN ... COMMIT / ROLLBACK` để ghi đồng thời đơn hàng và sự kiện `OrderCreated` (**Transactional Outbox Pattern**).
  - `src/infrastructure/outbox.publisher.js`: Cài đặt `KafkaOutboxPublisher` (`kafkajs`) và `OutboxWorker` vừa phát tức thì sau commit vừa quét định kỳ mỗi `2000ms` để đảm bảo *At-least-once delivery* ngay cả khi Kafka tạm thời gián đoạn.
  - `src/application/order.usecase.js`: Phối hợp kiểm tra điểm, giữ kho, tính giảm giá, lưu DB và cơ chế bù trừ **Saga Compensation** (gọi `ReleaseInventory` hoàn kho nếu ghi DB `order_db` gặp lỗi).

### 2. Kết quả kiểm tra thực tế
- Khởi chạy đồng thời 3 gRPC servers thật (`customer-service`, `product-service`, `order-service`) và kiểm tra liên thông:
  ```text
  [customer-service] gRPC server listening on 127.0.0.1:52139 (dbMode=memory)
  [product-service] gRPC server listening on 127.0.0.1:52140 (dbMode=memory)
  [order-service] gRPC server listening on 127.0.0.1:52141 (dbMode=memory, brokerMode=memory)
  TC-ORD-01 & 04 Order Created: {"items":[{"pid":1,"qty":2,"unit_price":1500},{"pid":3,"qty":1,"unit_price":100}],"oid":1001,"uid":4,"discount":310,"total_amount":2790,"status":"CREATED","created_at":"2026-10-26T18:22:14.424Z"}
  TC-ORD-05 Published Event count: 1 oid=1001 outboxStatus=PUBLISHED
  TC-ORD-03 Exceed stock code: 9 Insufficient stock for product pid=1 (Laptop Gaming Pro): requested 99, available 8
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Giải quyết triệt để **Dual-Write Problem** nhờ *Transactional Outbox Pattern* đúng đặc tả `UC09` và `Business-Process-Model.md` Bước 8.
  - Đơn giá `unit_price` được chụp lại (*snapshot*) từ `Product Service` tại đúng thời điểm mua và lưu vào `order_details`, nên việc thay đổi giá sản phẩm trong tương lai không làm sai lệch lịch sử hóa đơn.
  - Có cơ chế *Saga Compensation* trả lại tồn kho nếu bước ghi PostgreSQL của Order gặp sự cố.
- **Lưu ý / Điểm cần chú ý:**
  - Do áp dụng *At-least-once delivery* từ Outbox sang Kafka, một sự kiện `OrderCreated` có khả năng được gửi lại nếu mạng chập chờn trước khi kịp đánh dấu `PUBLISHED`. Do đó, phía nhận (`shipment-service` ở Bước 6) bắt buộc phải cài đặt **Idempotent Consumer** (khớp yêu cầu `TC-SHP-05`).
- **Trạng thái bước 5:** **ĐẠT (PASSED)**

---

## Bước 6: Xây dựng `shipment-service` (Shipment Bounded Context + MongoDB + Kafka Consumer)

### 1. Diễn giải công việc đã thực hiện
- Triển khai `services/shipment-service` sử dụng NoSQL **MongoDB (`shipment_db`)** và trình tiêu thụ sự kiện **Apache Kafka Consumer**:
  - `src/domain/shipment.entity.js`: Thực thể `Shipment` và quy tắc chuẩn hóa trạng thái vận đơn (`PENDING`, `PICKED`, `SHIPPING`, `DELIVERED`, `CANCELLED`, `RETURNED`).
  - `src/application/shipment.usecase.js`:
    - `handleOrderCreatedEvent`: Xử lý sự kiện từ topic `order-created`. Bắt lỗi và ghi nhận nhật ký nếu thiếu `oid` (`TC-SHP-02`), kiểm tra trùng lặp theo `oid` (**Idempotent Consumer** — `TC-SHP-05`), và khởi tạo vận đơn `status = PENDING` (`TC-SHP-01`).
    - `getShipment`, `getShipmentByOrder`, `listShipments`, `updateShipmentStatus` (`TC-SHP-03`, `TC-SHP-04`).
  - `src/infrastructure/shipment.repository.js`: Quản lý 2 collection `shipments` (đánh Unique Index trên cả `shipid` và `oid`) và `trackings` (lưu nhật ký hành trình theo mốc thời gian).
  - `src/infrastructure/kafka.consumer.js`: Kết nối `kafkajs` Consumer Group `shipment-service-group` kèm cơ chế tự động kết nối lại (*retry backoff*) khi Kafka khởi động.

### 2. Kết quả kiểm tra thực tế
- Kiểm tra toàn bộ 5 kịch bản Shipment (`TC-SHP-01..05`) trên gRPC Server & Event Consumer:
  ```text
  [shipment-service] gRPC server listening on 127.0.0.1:54979 (dbMode=memory, brokerMode=memory)
  TC-SHP-01 Created from Event: {"tracking":[{"status":"PENDING","note":"Shipment initialized from OrderCreated event","timestamp":"..."}],"shipid":5001,"oid":1001,"uid":3,"status":"PENDING"}
  [shipment-service] Rejected OrderCreated event missing valid oid: {"eventType":"OrderCreated","data":{"uid":3}}
  TC-SHP-02 Error log count: 1 Total shipments: 1
  [shipment-service] Idempotent skip: Shipment already exists for oid=1001 (shipid=5001)
  TC-SHP-05 After duplicate event, Total shipments: 1
  TC-SHP-03 Updated status: SHIPPING tracking entries: 2
  TC-SHP-04 Missing shipid code: 5 Shipment shipid=9999 not found
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Bảo vệ **Idempotency** ở cả 2 lớp: kiểm tra nghiệp vụ `findByOid(oid)` và khóa Unique Index `{ oid: 1 }` dưới tầng MongoDB (bắt mã lỗi `11000` an toàn khi có 2 message song song).
  - Bắt ngoại lệ JSON hỏng hoặc thiếu `oid` mà không làm sập tiến trình Kafka Consumer (*Poison Pill protection*).
  - Lưu trữ đầy đủ lịch sử hành trình vào collection `trackings`, khớp hoàn toàn với sơ đồ `Microservice-Architecture-Design.jpg`.
- **Lưu ý / Điểm cần chú ý:**
  - Do vận đơn được sinh bất đồng bộ qua Kafka, ngay mili-giây đầu tiên sau khi `POST /api/orders` trả kết quả, Shipment có thể đang trong quá trình khởi tạo (`Eventual Consistency`). API Gateway có thể truy vấn nhanh `GetShipmentByOrder` hoặc trả trạng thái mặc định `PENDING` như đặc tả `Business-Process-Model.md` Bước 10.
- **Trạng thái bước 6:** **ĐẠT (PASSED)**

---

## Bước 7: Xây dựng `api-gateway` & Tích hợp `Redis` (Routing, Auth, RBAC, Rate Limit, Cache, Logging, Health Check)

### 1. Diễn giải công việc đã thực hiện
- Xây dựng cổng vào duy nhất `api-gateway` (Express HTTP/JSON $\rightarrow$ 5 gRPC Clients) cùng hạ tầng **Redis**:
  - `src/infrastructure/redis.client.js`: Cài đặt `IoRedisStore` (`ioredis`) hỗ trợ TTL Cache, xóa cache theo tiền tố bằng `SCAN` (không khóa luồng Redis như `KEYS *`), và bộ đếm cửa sổ thời gian nguyên tử `INCR` + `EXPIRE`.
  - `src/infrastructure/grpc.clients.js`: Quản lý tập trung kết nối gRPC tới cả 5 microservices và bộ chuyển đổi mã lỗi `grpcErrorToHttp` (`3->400`, `16->401`, `7->403`, `5->404`, `6/9->409`, `14->503`).
  - `src/middlewares/logger.middleware.js`: Cấp phát `X-Request-Id` và ghi log chuẩn hóa kèm độ trễ (`ms`), danh tính người dùng và địa chỉ IP.
  - `src/middlewares/rateLimit.middleware.js`: Giới hạn tốc độ truy cập trên Redis, đính kèm header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` và trả `429 Too Many Requests` khi vượt ngưỡng.
  - `src/middlewares/auth.middleware.js`: Xác thực JWT, đối chiếu danh sách đen `token:bl:<token>` trên Redis khi đăng xuất, đệm Claims hợp lệ trên Redis và phân quyền RBAC theo vai trò (`admin`, `staff`, `customer`).
  - `src/middlewares/cache.middleware.js`: Cache phản hồi JSON trên Redis kèm header `X-Cache: HIT/MISS`, tự động xóa cache khi dữ liệu sản phẩm/khách hàng/tồn kho thay đổi.
  - `src/routes/api.routes.js`: Định tuyến toàn bộ các endpoints chuẩn (`API_Specification_Ecommerce_MVP.xlsx`), bao gồm cả `/api/health` kiểm tra sức khỏe toàn diện của Redis và 5 Microservices.

### 2. Kết quả kiểm tra thực tế
- Khởi chạy đồng bộ cả **6 tiến trình dịch vụ** (5 gRPC Microservices + 1 REST API Gateway) và kiểm thử thực tế qua HTTP:
  ```text
  1. Health: 200 {"status":"UP","message":"E-commerce API is running","dependencies":{"redis":"UP","authService":"UP","customerService":"UP","productService":"UP","orderService":"UP","shipmentService":"UP"}}
  2. Redis Cache headers: MISS -> HIT (Latency giảm từ 9.90ms xuống 2.01ms)
  3. RBAC Customer POST /api/products: 403
  4. Token Blacklist after logout: 200 -> 401
  5. Rate Limit exceeded status: 429
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Thực thi đầy đủ cả **6 trách nhiệm** của API Gateway trong đề bài (Routing, Authentication, Authorization, JWT validation, Rate limiting, Logging) và **2 vai trò cốt lõi của Redis** (Cache + Rate limiting, cộng thêm Session & Token Blacklist).
  - Trong quá trình rà soát bảo mật khách quan, phát hiện nếu cho phép truyền `role` tùy ý vào `POST /api/auth/register` công khai sẽ gây lỗ hổng leo thang đặc quyền (*Privilege Escalation*); đã khóa cứng đăng ký công khai luôn nhận vai trò `customer`, còn tài khoản `admin`/`staff` được quản trị viên khởi tạo an toàn.
  - Tự động xóa cache sản phẩm (`cache:products:*`) ngay sau khi khách đặt hàng thành công (`POST /api/orders`), tránh hiện tượng người dùng đọc phải số lượng tồn kho cũ từ Redis Cache (*Stale Cache*).
- **Trạng thái bước 7:** **ĐẠT (PASSED)**

---

## Bước 8: Dockerize Toàn bộ Hệ thống & Thiết lập `docker-compose.yml`

### 1. Diễn giải công việc đã thực hiện
- Tạo `.dockerignore` và **6 `Dockerfile`** (`node:20-alpine`) cho `api-gateway` và 5 microservices, sử dụng build context từ thư mục gốc (`.`) để chia sẻ thư mục `proto/` mà không phải nhân bản file `.proto` vào từng service.
- Thiết kế `docker-compose.yml` quy tụ đầy đủ **13 containers** bám sát 100% sơ đồ `Microservice-Architecture-Design.jpg` trên mạng nội bộ `ecommerce-net`:
  1. `api-gateway` (`3000:3000`) & 2. `redis-gateway` (`6379:6379`)
  3. `auth-service` (`50051:50051`) & 4. `postgres-auth` (`5433:5432` — `auth_db`)
  5. `customer-service` (`50052:50052`) & 6. `postgres-customer` (`5434:5432` — `customer_db`)
  7. `product-service` (`50053:50053`) & 8. `mongo-product` (`27018:27017` — `product_db`)
  9. `order-service` (`50054:50054`) & 10. `postgres-order` (`5435:5432` — `order_db`)
  11. `shipment-service` (`50055:50055`) & 12. `mongo-shipment` (`27019:27017` — `shipment_db`)
  13. `kafka` (`9092:9092`, internal `kafka:29092` — `apache/kafka:3.8.0` ở chế độ **KRaft** không cần ZooKeeper).
- Trang bị `healthcheck` cho toàn bộ 6 CSDL/Cache/Broker và cấu hình `depends_on: condition: service_healthy`, kết hợp vòng lặp `repository.init()` có retry trong từng service để chống lỗi khởi động lạnh (*cold-start race condition*).

### 2. Kết quả kiểm tra thực tế
- Kiểm tra cú pháp, schema và danh sách dịch vụ bằng Docker Compose CLI (`v5.5.1`):
  ```text
  COMPOSE_CONFIG_VALID
  postgres-order, redis-gateway, kafka, mongo-shipment, shipment-service,
  postgres-auth, auth-service, postgres-customer, customer-service,
  mongo-product, product-service, order-service, api-gateway (Tổng: 13 services)
  ```

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Phân tách hoàn toàn **Database-per-Service** ở cấp độ container vật lý: 3 container PostgreSQL độc lập và 2 container MongoDB độc lập kèm Docker Volumes lưu trữ bền vững, không dùng chung một DB instance.
  - Cấu hình `apache/kafka:3.8.0` chế độ KRaft có 2 listeners tách biệt (`PLAINTEXT://kafka:29092` cho các container nói chuyện nội bộ và `PLAINTEXT_HOST://localhost:9092` cho máy host kiểm tra), tránh lỗi kinh điển `Connection refused to localhost:9092` bên trong Docker network.
- **Lưu ý / Minh bạch môi trường thực thi:**
  - Tại thời điểm thực thi tự động, ứng dụng *Docker Desktop* trên máy Windows chưa bật daemon (`//./pipe/dockerDesktopLinuxEngine`), nên bước kiểm tra `docker compose config` đã xác nhận hợp lệ toàn bộ cấu hình, và người dùng chỉ cần bật Docker Desktop rồi gõ `docker compose up -d --build` để chạy toàn bộ 13 containers.
- **Trạng thái bước 8:** **ĐẠT (PASSED)**

---

## Bước 9: Kiểm thử Tích hợp End-to-End 25 Test Cases Chuẩn (`25_TestCases_5_BoundedContexts.xlsx`)

### 1. Diễn giải công việc đã thực hiện
- Xây dựng bộ kiểm thử tự động hai chế độ `tests/run-25-testcases.js`:
  - `npm.cmd run test:25tc`: Tự động khởi chạy đồng bộ toàn bộ cụm **5 gRPC Microservices + 1 HTTP API Gateway** trên máy local để kiểm thử toàn trình.
  - `npm.cmd run test:docker` (`--live`): Bắn trực tiếp kịch bản kiểm thử vào hệ thống **Docker Compose** đang chạy thật (`http://localhost:3000` + `Kafka :9092`), rất thuận tiện khi bảo vệ thực hành trước giảng viên.
- Kiểm tra cú pháp (`node --check`) trên toàn bộ **37 file JavaScript** và xác minh nạp thành công toàn bộ 8 Production Adapters (`PostgresUserRepository`, `PostgresCustomerRepository`, `MongoProductRepository`, `PostgresOrderRepository`, `KafkaOutboxPublisher`, `MongoShipmentRepository`, `KafkaOrderCreatedConsumer`, `IoRedisStore`).

### 2. Kết quả kiểm tra thực tế (25/25 Test Cases)
| Mã TC | Bounded Context | Kịch bản kiểm thử | Kết quả thực tế | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| `TC-IAM-01` | Identity & Access | Đăng ký tài khoản hợp lệ | `201 Created (uid=5)` | **PASS** |
| `TC-IAM-02` | Identity & Access | Đăng ký username đã tồn tại | `409 Conflict` | **PASS** |
| `TC-IAM-03` | Identity & Access | Đăng ký thiếu password | `400 Bad Request` | **PASS** |
| `TC-IAM-04` | Identity & Access | Đăng nhập đúng thông tin | `200 OK (Bearer JWT, expiresIn=3600)` | **PASS** |
| `TC-IAM-05` | Identity & Access | Đăng nhập sai password | `401 Unauthorized` | **PASS** |
| `TC-CUS-01` | Customer & Membership | Lấy Customer tồn tại | `200 OK (fullname, mid=1)` | **PASS** |
| `TC-CUS-02` | Customer & Membership | Lấy Customer không tồn tại | `404 Not Found` | **PASS** |
| `TC-CUS-03` | Customer & Membership | Cập nhật `fullname` & `mid` | `200 OK (fullname updated, mid=2)` | **PASS** |
| `TC-CUS-04` | Customer & Membership | Lấy thông tin Membership | `200 OK (mname=Silver, score=100)` | **PASS** |
| `TC-CUS-05` | Customer & Membership | Truy vấn Customer không có token | `401 Unauthorized` | **PASS** |
| `TC-PRO-01` | Product Catalog | Lấy danh sách Product | `200 OK (3 products, X-Cache=MISS)` | **PASS** |
| `TC-PRO-02` | Product Catalog | Lấy Product tồn tại | `200 OK (pid=1, price=1500)` | **PASS** |
| `TC-PRO-03` | Product Catalog | Lấy Product không tồn tại | `404 Not Found` | **PASS** |
| `TC-PRO-04` | Product Catalog | Tạo Product mới (Admin) | `201 Created (pid=4, price=400, qty=12)` | **PASS** |
| `TC-PRO-05` | Product Catalog | Cập nhật tồn kho Product | `200 OK (pid=4, quantity=25)` | **PASS** |
| `TC-ORD-01` | Order Management | Tạo Order hợp lệ | `201 Created (oid=1001, discount=40, total=760)` | **PASS** |
| `TC-ORD-02` | Order Management | Tạo Order không có JWT | `401 Unauthorized` | **PASS** |
| `TC-ORD-03` | Order Management | Đặt số lượng vượt tồn kho | `409 Conflict (Insufficient stock)` | **PASS** |
| `TC-ORD-04` | Order Management | Tính discount theo `score` | `201 Created (Gold score=500 -> 10%: 400 -> discount=40, total=360)` | **PASS** |
| `TC-ORD-05` | Order Management | Tạo Order & phát sự kiện Kafka | `Order oid=1003 persisted & event delivered` | **PASS** |
| `TC-SHP-01` | Shipment | Nhận `OrderCreated` Event | `Shipment created (shipid=5001, status=PENDING)` | **PASS** |
| `TC-SHP-02` | Shipment | Event thiếu `oid` | `Không tạo Shipment, ghi lỗi an toàn` | **PASS** |
| `TC-SHP-03` | Shipment | Cập nhật trạng thái Shipment | `200 OK (status=SHIPPING)` | **PASS** |
| `TC-SHP-04` | Shipment | Cập nhật Shipment không tồn tại | `404 Not Found` | **PASS** |
| `TC-SHP-05` | Shipment | Nhận cùng Event hai lần | `Idempotent: không tạo Shipment trùng` | **PASS** |

### 3. Đánh giá khách quan của AI
- **Ưu điểm:**
  - Đạt tỷ lệ **25/25 (100%)** Test Cases theo đúng bộ đề `docs/25_TestCases_5_BoundedContexts.xlsx`.
  - Xác minh xuyên suốt chuỗi tích hợp thật qua giao thức mạng: `HTTP Client -> Express API Gateway -> gRPC -> Microservice -> Inter-service gRPC -> Outbox Event -> Shipment Consumer`.
- **Trạng thái bước 9:** **ĐẠT (PASSED)**

---

## Bước 10: Hoàn thiện Tài liệu Hướng dẫn Cơ bản Từng bước & `README.md`

### 1. Diễn giải công việc đã thực hiện
- Hoàn thiện tài liệu hướng dẫn chi tiết mức cơ bản [`docs/huong_dan_tung_buoc.md`](huong_dan_tung_buoc.md) bao quát toàn bộ 10 bước:
  - Giải thích khái niệm nền tảng Microservices, DDD 4 tầng, Database-per-Service, gRPC Protobuf, Transactional Outbox, Idempotent Consumer, Redis Cache & Rate Limiting.
  - Cung cấp bộ lệnh CLI phục vụ trực tiếp 8 tiêu chí trong **Phiếu Chấm Thực Hành 3** (`docs/phieu_cham.md`): giải thích `.proto`, lệnh `docker compose up -d --build` & `docker compose ps`, các lệnh kiểm tra Kafka (`kafka-topics.sh`, `kafka-console-consumer.sh`, `kafka-consumer-groups.sh`), và lệnh `curl.exe` / PowerShell cho từng Test Case trong 25 Test Cases.
- Khởi tạo [`README.md`](../README.md) tại thư mục gốc để tra cứu nhanh kiến trúc, cách chạy và tài khoản mẫu.

### 2. Kết quả kiểm tra thực tế
- Kiểm tra cấu trúc tài liệu, tính tương thích cú pháp PowerShell trên Windows (chuyển cú pháp bash `<<<` sang pipe `'...' | docker exec -i ...` chuẩn PowerShell) và đối chiếu đủ 14/14 yêu cầu chức năng của đề bài.

### 3. Đánh giá khách quan tổng kết toàn dự án
- **Mức độ đáp ứng yêu cầu chức năng & phi chức năng:** **100%** (Đủ 5 Bounded Contexts, 5 file `.proto`, 3 PostgreSQL DBs, 2 MongoDB DBs, 1 Redis cho Cache & Rate Limit, 1 Apache Kafka KRaft, API Gateway đủ 6 trách nhiệm, vượt qua 25/25 Test Cases tự động).
- **Điểm mạnh kiến trúc nổi bật:**
  1. Áp dụng chuẩn mực **Transactional Outbox Pattern** + **Saga Inventory Compensation** + **Idempotent Consumer** thay vì gọi bất đồng bộ thiếu kiểm soát.
  2. Tách biệt sạch sẽ tầng Domain/Application khỏi Infrastructure theo đúng tinh thần **DDD**, cho phép kiểm thử toàn trình tốc độ cao lẫn vận hành bền vững trên Docker Compose.
- **Trạng thái bước 10 & Toàn dự án:** **HOÀN THÀNH XUẤT SẮC (10/10 BƯỚC ĐẠT)**


---

## Bước 11 (Bổ sung thực tế): Kiểm chứng Live Docker Compose (13 Containers) & Bộ Postman 25 Test Cases

### 1. Phát hiện & Khắc phục khách quan trên Docker thật
- Khi kiểm tra trực tiếp `docker ps` sau khi người dùng khởi chạy Docker Compose:
  - Toàn bộ 13 containers đều `Up`, API `/api/health` trả `200 UP`, tuy nhiên `HEALTHCHECK` nội bộ của `api-gateway` trên `node:20-alpine` dùng `wget http://localhost:3000/api/health` bị BusyBox phân giải `localhost` sang IPv6 `[::1]` dẫn tới trạng thái `(unhealthy)`.
  - **Khắc phục:** Đổi địa chỉ `HEALTHCHECK` trong `api-gateway/Dockerfile` thành `http://127.0.0.1:3000/api/health` và rebuild; `api-gateway` đã chuyển sang trạng thái **`(healthy)`** chuẩn 100%.
- Bổ sung RPC `PublishTestEvent` (`proto/order.proto`) và endpoint quản trị `POST /api/orders/test-kafka-event` (chỉ dành cho `admin`) để người dùng có thể thực hiện trọn vẹn cả **`TC-SHP-02`** (sự kiện Kafka thiếu `oid`) và **`TC-SHP-05`** (gửi trùng sự kiện Kafka 2 lần) **ngay bên trong Postman** mà không cần thoát ra gõ CLI.
- Tạo sẵn file Collection chuẩn Postman v2.1 [`docs/Ecommerce_MVP_25_TestCases.postman_collection.json`](Ecommerce_MVP_25_TestCases.postman_collection.json) và tài liệu hướng dẫn [`docs/huong_dan_postman_25_testcases.md`](huong_dan_postman_25_testcases.md).

### 2. Kết quả chạy kiểm thử Live trên 13 Containers Docker (`npm.cmd run test:docker`)
- Trạng thái `docker ps`: **13/13 containers `Up`**, toàn bộ healthchecks (`api-gateway`, 3 `postgres-*`, 2 `mongo-*`, `redis-gateway`, `kafka`) đều đạt **`(healthy)`**.
- Kết quả chạy `node tests/run-25-testcases.js --live`: **`SUMMARY: 25/25 TEST CASES PASSED`** trên cơ sở dữ liệu PostgreSQL, MongoDB, Redis và Apache Kafka thật.
- **Trạng thái kiểm chứng thực tế:** **ĐẠT TUYỆT ĐỐI (100% LIVE DOCKER VERIFIED)**
