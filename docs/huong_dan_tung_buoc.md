# Hướng Dẫn Xây Dựng Backend E-Commerce MVP (Microservices, DDD & Database-per-Service)

> **Dành cho mức cơ bản (Beginner-friendly):** Tài liệu này diễn giải từ gốc rễ lý thuyết đến từng dòng lệnh, từng file mã nguồn và cách kiểm tra hệ thống E-commerce MVP bằng **Node.js**, **gRPC (Protobuf)**, **RESTful API Gateway**, **Redis**, **PostgreSQL**, **MongoDB**, **Apache Kafka** và **Docker Compose**.

---

## Kiến thức Nền tảng Cốt lõi (Đọc nhanh trong 3 phút)

Trước khi bắt tay vào code, hãy hình dung hệ thống như một trung tâm thương mại hiện đại:

1. **Microservices (Kiến trúc Vi dịch vụ):** Thay vì nhồi nhét toàn bộ code vào một ứng dụng khổng lồ (*Monolith*), ta chia hệ thống thành **5 dịch vụ nhỏ độc lập**, mỗi dịch vụ chỉ làm đúng một chuyên môn:
   - `auth-service`: Đăng ký, đăng nhập, kiểm tra tài khoản & quyền hạn (`Role`).
   - `customer-service`: Quản lý thông tin khách hàng & hạng thẻ thành viên (`score`).
   - `product-service`: Quản lý danh mục hàng hóa & số lượng tồn kho.
   - `order-service`: Tính giảm giá, tạo đơn hàng & xuất sự kiện đặt hàng.
   - `shipment-service`: Tiếp nhận đơn hàng để giao vận & cập nhật trạng thái giao hàng.
2. **DDD (Domain-Driven Design - Thiết kế hướng miền nghiệp vụ):**
   - Mỗi dịch vụ tương ứng với một **Bounded Context** (ranh giới nghiệp vụ riêng). Ví dụ: Trong ngữ cảnh `Auth`, người dùng là `User` (chỉ cần `username`, `password`, `roleid`). Trong ngữ cảnh `Customer`, cùng mã `uid` đó lại là `Customer` (quan tâm `fullname`, hạng thẻ `mid`).
   - Bên trong mỗi service, code được chia làm **4 tầng rõ ràng** để không bị rối:
     - `domain/`: Trái tim nghiệp vụ (Entities, quy tắc tính toán, giao diện kho lưu trữ). Không phụ thuộc thư viện DB.
     - `application/`: Các ca sử dụng (*Use Cases* — ví dụ: "Đăng ký tài khoản", "Tạo đơn hàng").
     - `infrastructure/`: Nơi kết nối thật sự tới PostgreSQL, MongoDB, Kafka hoặc gRPC Client.
     - `presentation/`: Tầng giao tiếp gRPC Server nhận yêu cầu từ bên ngoài gọi vào.
3. **Database-per-Service (Mỗi dịch vụ một CSDL riêng):**
   - Không có chuyện `order-service` chọc thẳng câu lệnh SQL sang bảng của `customer-service`!
   - Cần dữ liệu tức thì? Gọi **gRPC** đồng bộ. Cần báo tin hoàn tất? Bắn sự kiện qua **Kafka** bất đồng bộ.
4. **API Gateway & Redis:**
   - Là "cổng bảo vệ duy nhất" đón request **HTTP REST/JSON** từ người dùng (Web/Mobile/Postman), kiểm tra **JWT**, giới hạn tốc độ (**Rate Limiting**), lưu bộ nhớ đệm (**Cache**) trên **Redis**, rồi chuyển tiếp thành cuộc gọi **gRPC** siêu tốc tới 5 service bên trong.

---

## Bước 1: Thiết lập Cấu trúc Dự án Monorepo & Hợp đồng Giao tiếp gRPC (`.proto`)

### 1.1. Tại sao cần file `.proto`?
Giữa `API Gateway` và 5 Microservices (cũng như giữa `Order Service` với `Customer`/`Product Service`), chúng ta giao tiếp bằng **gRPC**.
- Khác với REST gửi chuỗi văn bản JSON nặng nề, **gRPC** truyền dữ liệu nhị phân siêu gọn dựa trên một "bản hợp đồng" chung gọi là **Protocol Buffers (`.proto`)**.
- Mỗi file `.proto` quy định rõ:
  1. `service`: Danh sách các hàm từ xa (`rpc`) có thể gọi.
  2. `message`: Khuôn mẫu dữ liệu đầu vào (*Request*) và đầu ra (*Response*), kèm số thứ tự trường (`= 1`, `= 2`,...).

### 1.2. Cấu trúc thư mục khởi tạo
```text
p3/
├── package.json                  # Quản lý npm workspaces cho toàn dự án
├── .env.example                  # Mẫu biến môi trường dùng chung
├── proto/                        # Thư mục chứa 5 hợp đồng gRPC (.proto)
│   ├── auth.proto                # Hợp đồng Identity & Access (Register, Login, VerifyToken)
│   ├── customer.proto            # Hợp đồng Customer & Membership (GetCustomer, GetCustomerScore,...)
│   ├── product.proto             # Hợp đồng Product Catalog (CRUD, ReserveInventory, ReleaseInventory)
│   ├── order.proto               # Hợp đồng Order Management (CreateOrder, GetOrder, ListOrders)
│   └── shipment.proto            # Hợp đồng Shipment (GetShipment, UpdateShipmentStatus)
├── api-gateway/                  # Cổng RESTful API + Redis Cache & Rate Limit
└── services/                     # 5 Microservices theo 5 Bounded Contexts
    ├── auth-service/
    ├── customer-service/
    ├── product-service/
    ├── order-service/
    └── shipment-service/
```

### 1.3. Giải thích chi tiết 5 file `.proto` (Phục vụ câu hỏi số 1 trong Phiếu Chấm)
- **`proto/auth.proto` (`package auth`)**:
  - `Register`: Nhận `username`, `password`, `fullname`, `email`, `phone` $\rightarrow$ Trả về `uid` mới tạo.
  - `Login`: Nhận `username`, `password` $\rightarrow$ Xác thực bcrypt và trả về `access_token` (JWT), `expires_in`, `role`.
  - `VerifyToken`: Cho phép kiểm tra chữ ký và trích xuất `uid`, `role` từ JWT.
- **`proto/customer.proto` (`package customer`)**:
  - `CreateCustomer`, `GetCustomer`, `UpdateCustomer`: Quản lý hồ sơ khách hàng (`uid`, `fullname`, `mid`).
  - `GetCustomerScore`: Hàm chuyên biệt để `Order Service` gọi sang lấy điểm `score` tính chiết khấu.
  - `ListMemberships`, `GetMembership`, `CreateMembership`, `UpdateMembership`: Quản lý hạng thành viên & điểm `score`.
- **`proto/product.proto` (`package product`)**:
  - `ListProducts`, `GetProduct`, `CreateProduct`, `UpdateProduct`, `UpdateInventory`, `DeleteProduct`: CRUD sản phẩm và cập nhật kho.
  - `ReserveInventory`: Được `Order Service` gọi khi khách đặt hàng để kiểm tra `qty <= quantity` và trừ tồn kho nguyên tử.
  - `ReleaseInventory`: Hoàn lại tồn kho (cơ chế bù trừ *Saga Compensation*) nếu bước lưu đơn hàng phía sau gặp sự cố.
- **`proto/order.proto` (`package order`)**:
  - `CreateOrder`: Nhận `uid` và danh sách `items [{pid, qty}]` $\rightarrow$ Trả về đơn hàng kèm `discount`, `total_amount` và chi tiết `OrderDetail`.
  - `GetOrder`, `ListOrders`: Xem chi tiết đơn hàng hoặc danh sách đơn hàng.
- **`proto/shipment.proto` (`package shipment`)**:
  - `GetShipment`, `GetShipmentByOrder`, `ListShipments`: Tra cứu thông tin vận đơn và lịch sử hành trình (`tracking`).
  - `UpdateShipmentStatus`: Dành cho nhân viên giao vận (`staff`) hoặc `admin` cập nhật trạng thái (`PENDING` $\rightarrow$ `SHIPPING` $\rightarrow$ `DELIVERED` / `CANCELLED`).
  - *(Lưu ý kiến trúc quan trọng)*: Không có hàm `CreateShipment` cho Client gọi trực tiếp qua REST, bởi vì vận đơn được khởi tạo **tự động & bất đồng bộ** khi `Shipment Service` tiêu thụ sự kiện `OrderCreated` từ **Apache Kafka**!

### 1.4. Lệnh cài đặt phụ thuộc tại thư mục gốc
> **Lưu ý trên Windows PowerShell:** Nếu lệnh `npm` báo lỗi *ExecutionPolicy*, hãy dùng `npm.cmd` thay cho `npm`.
```powershell
npm.cmd install
```


---

## Bước 2: Xây dựng `auth-service` (Identity & Access Bounded Context)

### 2.1. Diễn giải mức cơ bản
`auth-service` chịu trách nhiệm trả lời 2 câu hỏi: *"Bạn là ai?"* (**Authentication**) và *"Bạn có vai trò gì?"* (**Role**).
- **CSDL riêng:** `PostgreSQL (auth_db)` gồm 2 bảng `roles` (`admin`, `customer`, `staff`) và `users` (`uid`, `username`, `password`, `email`, `phone`, `roleid`).
- **Quy trình bảo mật mật khẩu:** Khi người dùng đăng ký, mật khẩu tuyệt đối không lưu thô mà được băm một chiều qua thuật toán `bcrypt` (10 vòng lặp muối *salt*).
- **Cấp phát thẻ thông hành JWT:** Khi đăng nhập đúng, service ký một chuỗi **JSON Web Token (JWT)** chứa `{ sub: uid, uid, username, role }` có hạn 3600 giây.

### 2.2. Cấu trúc DDD bên trong `services/auth-service/src/`
- `domain/user.entity.js`: Chứa lớp `User` và hàm kiểm tra `username` (2–50 ký tự), `password` không được để trống (`TC-IAM-03`).
- `application/auth.usecase.js`: Chứa logic `register` (bắt trùng tên trả lỗi `ALREADY_EXISTS` $\rightarrow$ `409 Conflict` cho `TC-IAM-02`), `login` (sai mật khẩu trả `UNAUTHENTICATED` $\rightarrow$ `401` cho `TC-IAM-05`) và `verifyToken`.
- `infrastructure/user.repository.js`: Kết nối PostgreSQL qua `pg.Pool`, tự tạo bảng và nạp sẵn 4 tài khoản mẫu:
  - `admin` / `Admin@123` (vai trò `admin`, `uid = 1`)
  - `staff` / `Staff@123` (vai trò `staff`, `uid = 2`)
  - `alice` / `Pass@123` (vai trò `customer`, `uid = 3`)
  - `bob` / `Pass@123` (vai trò `customer`, `uid = 4`)
- `presentation/grpc.server.js`: Mở cổng gRPC `50051`.

---

## Bước 3: Xây dựng `customer-service` (Customer & Membership Bounded Context)

### 3.1. Diễn giải mức cơ bản
Trong DDD, `auth-service` chỉ lo bảo mật đăng nhập, còn hồ sơ cá nhân (`fullname`) và ưu đãi thành viên (`Membership`, điểm `score`) thuộc về miền nghiệp vụ **Customer & Membership**.
- **CSDL riêng:** `PostgreSQL (customer_db)` gồm bảng `memberships` và `customers`.
- **Liên kết liên dịch vụ bằng khóa logic:** Cột `customers.uid` lưu cùng con số `uid` bên `auth_db`, nhưng **không tạo Foreign Key vật lý xuyên database** để hai dịch vụ có thể triển khai trên hai máy chủ độc lập.
- **4 hạng thành viên khởi tạo sẵn:**
  | `mid` | Tên hạng (`mname`) | Điểm (`score`) | Mức giảm giá tương ứng |
  | :---: | :--- | :---: | :---: |
  | `1` | `Bronze` | `0` | `0%` |
  | `2` | `Silver` | `100` | `5%` |
  | `3` | `Gold` | `500` | `10%` |
  | `4` | `Platinum` | `1000` | `15%` |

---

## Bước 4: Xây dựng `product-service` (Product Catalog Bounded Context)

### 4.1. Diễn giải mức cơ bản
Danh mục hàng hóa trong thương mại điện tử có thuộc tính linh hoạt và tần suất đọc rất cao, nên thiết kế chọn **MongoDB (`product_db`)**.
- **2 Collections đồng bộ:** `products` (thông tin `pid`, `pname`, `price`, `quantity`) và `inventories` (theo dõi tồn kho).
- **Trừ kho nguyên tử (Atomic Stock Reservation):**
  Khi 2 khách hàng cùng bấm mua chiếc Laptop cuối cùng cùng một mili-giây, nếu ta đọc `quantity = 1` rồi mới trừ `1 - 1 = 0`, cả hai sẽ cùng mua được (bán lố kho!). Để ngăn chặn, `MongoProductRepository` dùng lệnh nguyên tử của MongoDB:
  ```js
  products.findOneAndUpdate(
    { pid, quantity: { $gte: qty } }, // Chỉ khớp nếu kho hiện tại >= số lượng đặt
    { $inc: { quantity: -qty } },     // Trừ trực tiếp ngay trong 1 bước khóa của MongoDB
    { returnDocument: 'after' }
  )
  ```
- Nếu đơn hàng có nhiều món mà món thứ 2 hết hàng, `ProductUseCase` tự động cộng trả lại số lượng cho món thứ 1 và trả lỗi `INSUFFICIENT_STOCK` (`409 Conflict` — `TC-ORD-03`).

---

## Bước 5: Xây dựng `order-service` (Order Management + Discount + Transactional Outbox)

### 5.1. Diễn giải mức cơ bản — Luồng đặt hàng chuẩn 10 bước
Khi khách gửi yêu cầu đặt hàng, `order-service` đóng vai trò "nhạc trưởng" (*Orchestrator*):
1. **Gọi gRPC sang `customer-service` (`GetCustomerScore`)**: Lấy điểm `score` của khách.
2. **Gọi gRPC sang `product-service` (`ReserveInventory`)**: Kiểm tra tồn kho, giữ hàng và lấy đơn giá `unit_price` thực tế tại thời điểm mua.
3. **Tính chiết khấu (`DiscountPolicy`)**:
   - `score >= 1000` $\rightarrow$ giảm `15%`
   - `score >= 500` $\rightarrow$ giảm `10%`
   - `score >= 100` $\rightarrow$ giảm `5%`
   - `score < 100` $\rightarrow$ giảm `0%`
4. **Lưu đơn bằng Transactional Outbox Pattern trên `PostgreSQL (order_db)`**:
   - *Vấn đề kinh điển (Dual-Write Problem):* Nếu lưu bảng `orders` xong mà máy chủ mất điện trước khi kịp gửi tin nhắn lên Kafka, đơn hàng đã trừ tiền/trừ kho nhưng bộ phận giao hàng không bao giờ nhận được đơn!
   - *Giải pháp Outbox:* Trong cùng một giao dịch `BEGIN ... COMMIT` của PostgreSQL, ta lưu đồng thời **3 bảng**: `orders`, `order_details` và `outbox_events` (`status = 'PENDING'`). Sau khi `COMMIT` an toàn, tiến trình `OutboxWorker` đọc các bản ghi `PENDING` đẩy lên Kafka topic `order-created`, thành công mới đổi sang `PUBLISHED`. Nếu Kafka đang bận, cứ mỗi 2 giây Worker tự động thử gửi lại cho đến khi thành công!

---

## Bước 6: Xây dựng `shipment-service` (Shipment Bounded Context + Kafka Consumer)

### 6.1. Diễn giải mức cơ bản
`shipment-service` không chờ `order-service` gọi trực tiếp, mà âm thầm lắng nghe topic `order-created` từ **Apache Kafka** và lưu vào **MongoDB (`shipment_db`)** gồm 2 collections `shipments` và `trackings`.
- **Chống sự kiện lỗi (`TC-SHP-02`)**: Nếu message gửi vào Kafka bị thiếu trường `oid`, service ghi nhận vào nhật ký lỗi và bỏ qua an toàn thay vì làm sập tiến trình lắng nghe.
- **Idempotent Consumer — Chống tạo vận đơn trùng (`TC-SHP-05`)**: Do Kafka đảm bảo *At-least-once* (ít nhất 1 lần), cùng một sự kiện `oid = 1001` có thể đến 2 lần. `shipment-service` kiểm tra `findByOid(oid)` kết hợp Unique Index `{ oid: 1 }` trong MongoDB để cam kết **mỗi đơn hàng chỉ sinh đúng 1 vận đơn duy nhất**.

---

## Bước 7: Xây dựng `api-gateway` & Tích hợp `Redis`

### 7.1. Diễn giải 6 nhiệm vụ của API Gateway & vai trò của Redis
1. **Logging:** Gắn mã vết `X-Request-Id` và in thời gian phản hồi (`ms`) cho mọi HTTP request.
2. **Rate Limiting (dùng Redis):** Đếm số request của mỗi IP trong mỗi cửa sổ 60 giây bằng khóa `ratelimit:<ip>`. Quá ngưỡng (mặc định 100 req/60s) trả ngay `429 Too Many Requests`.
3. **Authentication & JWT Validation (dùng Redis):** Kiểm tra chữ ký Bearer JWT, kiểm tra token đã đăng xuất chưa (`token:bl:<token>` trên Redis), và đệm kết quả giải mã (`token:valid:<token>`) giúp các request kế tiếp xác thực cực nhanh.
4. **Authorization (RBAC):**
   - `admin`: Toàn quyền CRUD sản phẩm, hạng thành viên, xem đơn và cập nhật vận đơn.
   - `staff`: Xem danh sách vận đơn và cập nhật trạng thái giao hàng (`PATCH /api/shipments/:shipid/status`).
   - `customer`: Xem sản phẩm, quản lý hồ sơ của chính mình, đặt hàng và theo dõi đơn/vận đơn của chính mình. Cố tình gọi API quản trị sẽ nhận `403 Forbidden`.
5. **Caching (dùng Redis):** Đệm kết quả `GET /api/products`, `GET /api/products/:pid`, `GET /api/customers/:uid`, `GET /api/memberships` kèm header `X-Cache: MISS` (lần đầu) $\rightarrow$ `X-Cache: HIT` (các lần sau). Khi sản phẩm được thêm/sửa/xóa hoặc khách đặt hàng làm đổi tồn kho, Gateway tự động xóa cache liên quan!
6. **Routing & Health Check:** Chuyển đổi HTTP JSON sang gRPC gọi tới 5 service; cung cấp `GET /api/health` kiểm tra đồng thời Redis và cả 5 gRPC services.

---

## Bước 8: Dockerize & Khởi chạy Hệ thống bằng Docker Compose

### 8.1. Lệnh khởi chạy toàn bộ 13 Containers (Phục vụ câu hỏi số 2 trong Phiếu Chấm)
Mở **Docker Desktop**, sau đó tại thư mục gốc dự án chạy:
```powershell
# Build image và khởi chạy ngầm toàn bộ 13 containers
docker compose up -d --build

# Liệt kê danh sách các container đang chạy và trạng thái Health
docker compose ps
```

Danh sách **13 containers** chuẩn thiết kế khi chạy `docker compose ps`:
| STT | Container Name | Công nghệ / Image | Cổng (Host:Container) | Vai trò |
| :---: | :--- | :--- | :---: | :--- |
| 1 | `api-gateway` | Node.js 20 Alpine | `3000:3000` | Cổng RESTful API duy nhất |
| 2 | `redis-gateway` | `redis:7-alpine` | `6379:6379` | Cache, Rate Limit, Token Blacklist |
| 3 | `auth-service` | Node.js 20 Alpine | `50051:50051` | gRPC Identity & Access |
| 4 | `postgres-auth` | `postgres:16-alpine` | `5433:5432` | CSDL riêng `auth_db` |
| 5 | `customer-service` | Node.js 20 Alpine | `50052:50052` | gRPC Customer & Membership |
| 6 | `postgres-customer`| `postgres:16-alpine` | `5434:5432` | CSDL riêng `customer_db` |
| 7 | `product-service` | Node.js 20 Alpine | `50053:50053` | gRPC Product Catalog |
| 8 | `mongo-product` | `mongo:7` | `27018:27017` | CSDL riêng `product_db` |
| 9 | `order-service` | Node.js 20 Alpine | `50054:50054` | gRPC Order & Outbox Producer |
| 10 | `postgres-order` | `postgres:16-alpine` | `5435:5432` | CSDL riêng `order_db` |
| 11 | `shipment-service` | Node.js 20 Alpine | `50055:50055` | gRPC Shipment & Kafka Consumer |
| 12 | `mongo-shipment` | `mongo:7` | `27019:27017` | CSDL riêng `shipment_db` |
| 13 | `kafka` | `apache/kafka:3.8.0` | `9092:9092` | Message Broker (KRaft Mode) |

---

## Bước 9: Kiểm tra & Giải thích Hệ thống Kafka (Phục vụ câu hỏi số 3 trong Phiếu Chấm)

### 9.1. Cách giải thích ngắn gọn, súc tích khi vấn đáp
- **Vai trò:** Kafka đóng vai trò trạm trung chuyển sự kiện bất đồng bộ (*Event Broker*) giữa `order-service` (**Producer**) và `shipment-service` (**Consumer**) qua topic `order-created`.
- **Chế độ KRaft:** Hệ thống dùng Kafka hiện đại ở chế độ **KRaft** (`broker,controller` tích hợp), loại bỏ sự phụ thuộc vào ZooKeeper cồng kềnh.
- **Độ tin cậy 2 đầu:**
  1. Đầu gửi (`order-service`): Dùng bảng `outbox_events` trong cùng transaction với `orders` (**Transactional Outbox**) để không bao giờ mất sự kiện.
  2. Đầu nhận (`shipment-service`): Thuộc Consumer Group `shipment-service-group`, kiểm tra khóa duy nhất `oid` (**Idempotent Consumer**) để không bao giờ tạo 2 vận đơn trùng cho 1 đơn hàng.

### 9.2. Các lệnh CLI kiểm tra trực tiếp Kafka trên Docker
```powershell
# 1. Liệt kê các topic đang có trên Kafka (sẽ thấy topic 'order-created')
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# 2. Xem chi tiết partition & replication của topic 'order-created'
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic order-created

# 3. Đọc toàn bộ các message JSON OrderCreated đã được bắn vào Kafka từ đầu đến nay
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic order-created --from-beginning --timeout-ms 5000

# 4. Kiểm tra trạng thái tiêu thụ (offset & lag) của nhóm 'shipment-service-group'
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group shipment-service-group
```

---

## Bước 10: Cách Chạy Kiểm Thử 25 Test Cases (Phục vụ câu hỏi số 4–8 trong Phiếu Chấm)

### 10.1. Chạy tự động toàn bộ 25 Test Cases bằng 1 lệnh duy nhất
```powershell
# Chế độ 1: Chạy kiểm thử tự động nội bộ (không cần bật Docker)
npm.cmd run test:25tc

# Chế độ 2: Chạy kiểm thử trực tiếp vào hệ thống Docker Compose đang chạy ở cổng 3000
npm.cmd run test:docker
```

### 10.2. Bảng tra cứu nhanh lệnh `curl` cho từng Test Case bất kỳ khi giảng viên gọi ngẫu nhiên

> **Mẹo trên PowerShell:** Dùng `curl.exe` (có đuôi `.exe` để gọi đúng chương trình cURL chuẩn thay vì alias `Invoke-WebRequest` của PowerShell).

#### Nhóm 1: Identity & Access (`TC-IAM-01` $\rightarrow$ `TC-IAM-05`)
```powershell
# TC-IAM-01: Đăng ký tài khoản hợp lệ -> 201 Created
curl.exe -i -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"sv01\",\"password\":\"Pass@123\",\"fullname\":\"Sinh Vien 01\"}"

# TC-IAM-02: Đăng ký username đã tồn tại -> 409 Conflict
curl.exe -i -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"sv01\",\"password\":\"Pass@123\"}"

# TC-IAM-03: Đăng ký thiếu password -> 400 Bad Request
curl.exe -i -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"sv02\",\"password\":\"\"}"

# TC-IAM-04: Đăng nhập đúng thông tin -> 200 OK + nhận JWT
curl.exe -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"bob\",\"password\":\"Pass@123\"}"

# TC-IAM-05: Đăng nhập sai password -> 401 Unauthorized
curl.exe -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"bob\",\"password\":\"SaiMatKhau\"}"
```

*(Lưu token đăng nhập vào biến PowerShell để test nhanh các câu sau)*:
```powershell
$CUST_TOKEN = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"username":"bob","password":"Pass@123"}').accessToken
$ADMIN_TOKEN = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"username":"admin","password":"Admin@123"}').accessToken
$STAFF_TOKEN = (Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType "application/json" -Body '{"username":"staff","password":"Staff@123"}').accessToken
```

#### Nhóm 2: Customer & Membership (`TC-CUS-01` $\rightarrow$ `TC-CUS-05`)
```powershell
# TC-CUS-01: Lấy Customer tồn tại (uid=4 là bob) -> 200 OK
curl.exe -i http://localhost:3000/api/customers/4 -H "Authorization: Bearer $CUST_TOKEN"

# TC-CUS-02: Lấy Customer không tồn tại -> 404 Not Found
curl.exe -i http://localhost:3000/api/customers/99999 -H "Authorization: Bearer $ADMIN_TOKEN"

# TC-CUS-03: Cập nhật fullname -> 200 OK
curl.exe -i -X PUT http://localhost:3000/api/customers/4 -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"fullname\":\"Bob Tran Updated\"}"

# TC-CUS-04: Lấy thông tin Membership (trả mname và score) -> 200 OK
curl.exe -i http://localhost:3000/api/customers/4/membership -H "Authorization: Bearer $CUST_TOKEN"

# TC-CUS-05: Truy vấn Customer không có token -> 401 Unauthorized
curl.exe -i http://localhost:3000/api/customers/4
```

#### Nhóm 3: Product Catalog (`TC-PRO-01` $\rightarrow$ `TC-PRO-05`)
```powershell
# TC-PRO-01: Lấy danh sách Product (gọi 2 lần liên tiếp để thấy X-Cache: MISS -> HIT)
curl.exe -i http://localhost:3000/api/products -H "Authorization: Bearer $CUST_TOKEN"

# TC-PRO-02: Lấy Product tồn tại (pid=1) -> 200 OK
curl.exe -i http://localhost:3000/api/products/1 -H "Authorization: Bearer $CUST_TOKEN"

# TC-PRO-03: Lấy Product không tồn tại -> 404 Not Found
curl.exe -i http://localhost:3000/api/products/99999 -H "Authorization: Bearer $CUST_TOKEN"

# TC-PRO-04: Tạo Product mới (Admin) -> 201 Created
curl.exe -i -X POST http://localhost:3000/api/products -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"pname\":\"Headset Pro\",\"price\":200,\"quantity\":15}"

# TC-PRO-05: Cập nhật tồn kho Product -> 200 OK
curl.exe -i -X PATCH http://localhost:3000/api/products/1/inventory -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d "{\"quantity\":20}"
```

#### Nhóm 4: Order Management (`TC-ORD-01` $\rightarrow$ `TC-ORD-05`)
```powershell
# TC-ORD-01, TC-ORD-04, TC-ORD-05: Tạo Order hợp lệ + Tính discount theo score (Bob Gold score=500 -> giảm 10%) + Phát sự kiện Kafka
curl.exe -i -X POST http://localhost:3000/api/orders -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"items\":[{\"pid\":1,\"qty\":1}]}"

# TC-ORD-02: Tạo Order không có JWT -> 401 Unauthorized
curl.exe -i -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d "{\"items\":[{\"pid\":1,\"qty\":1}]}"

# TC-ORD-03: Đặt số lượng vượt tồn kho -> 409 Conflict
curl.exe -i -X POST http://localhost:3000/api/orders -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"items\":[{\"pid\":1,\"qty\":99999}]}"
```

#### Nhóm 5: Shipment (`TC-SHP-01` $\rightarrow$ `TC-SHP-05`)
```powershell
# TC-SHP-01: Kiểm tra Shipment được tự động tạo từ Kafka OrderCreated event (oid=1001 -> shipid=5001)
curl.exe -i http://localhost:3000/api/shipments/order/1001 -H "Authorization: Bearer $CUST_TOKEN"

# TC-SHP-03: Cập nhật trạng thái Shipment sang SHIPPING (bởi Staff/Admin) -> 200 OK
curl.exe -i -X PATCH http://localhost:3000/api/shipments/5001/status -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d "{\"status\":\"SHIPPING\"}"

# TC-SHP-04: Cập nhật Shipment không tồn tại -> 404 Not Found
curl.exe -i -X PATCH http://localhost:3000/api/shipments/99999/status -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d "{\"status\":\"DELIVERED\"}"

# TC-SHP-02 (Event thiếu oid) & TC-SHP-05 (Gửi trùng cùng OrderCreated Event 2 lần vào Kafka):
# Bắn trực tiếp message vào Kafka container trên PowerShell (hoặc chạy npm.cmd run test:docker):
'{"eventType":"OrderCreated","data":{"uid":4}}' | docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic order-created
'{"eventType":"OrderCreated","data":{"oid":1001,"uid":4}}' | docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic order-created
```
