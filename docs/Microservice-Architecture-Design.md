# Microservice Architecture Design

Tài liệu thiết kế kiến trúc hệ thống **E-commerce Microservices** phiên bản MVP (Minimum Viable Product) theo mô hình **Domain-Driven Design (DDD)**, **Database-per-Service** và **Event-Driven Architecture**, được chuyển hóa trực quan từ tài liệu thiết kế `Microservice-Architecture-Design.jpg`.

---

## 1. Sơ đồ kiến trúc tổng thể (Architecture Diagram)

Sơ đồ thể hiện toàn bộ các tầng trong hệ thống: Client, API Gateway kết hợp In-Memory Cache (Redis), 5 Microservices tương ứng 5 Bounded Contexts với cơ sở dữ liệu riêng biệt (PostgreSQL & MongoDB), cùng Message Broker (Apache Kafka) phục vụ truyền thông bất đồng bộ (Event-driven).

```mermaid
flowchart TB
    %% ==========================================
    %% Client Layer
    %% ==========================================
    subgraph ClientLayer ["Client Layer"]
        direction LR
        Client["<b>Client Devices</b><br/>💻 Laptop &nbsp;|&nbsp; 📱 Tablet &nbsp;|&nbsp; 📱 Mobile Phone"]
    end

    %% ==========================================
    %% API Gateway & Cache Layer
    %% ==========================================
    subgraph GatewayGroup ["API Gateway Layer"]
        direction LR
        APIGW["<b>API Gateway</b><br/>• Xác thực & ủy quyền<br/>• Định tuyến request<br/>• Giới hạn tốc độ<br/>• Ghi log, giám sát"]
        Redis[("<b>Redis</b><br/><i>(API Gateway DB)</i><br/>• Lưu cache token<br/>• Lưu session<br/>• Rate limiting<br/>• Cache dữ liệu")]
    end

    %% ==========================================
    %% Microservices Layer
    %% ==========================================
    subgraph ServicesGroup ["Microservices Layer (DDD & Database-per-Service)"]
        direction TB

        %% Auth Service
        subgraph Group_Auth ["Auth Bounded Context"]
            AuthService["<b>Auth Service</b><br/>• Quản lý tài khoản<br/>• Xác thực, phân quyền<br/>• Quản lý vai trò"]
            AuthDB[("<b>PostgreSQL</b><br/><i>(Auth DB)</i><br/>• User<br/>• Role")]
        end

        %% Customer Service
        subgraph Group_Customer ["Customer Bounded Context"]
            CustomerService["<b>Customer Service</b><br/>• Quản lý thông tin khách hàng<br/>• Quản lý hạng thành viên<br/>• Cung cấp điểm (score)"]
            CustomerDB[("<b>PostgreSQL</b><br/><i>(Customer DB)</i><br/>• Customer<br/>• Membership")]
        end

        %% Order Service
        subgraph Group_Order ["Order Bounded Context"]
            OrderService["<b>Order Service</b><br/>• Quản lý đơn hàng<br/>• Tính giảm giá<br/>• Quản lý chi tiết đơn hàng<br/>• Xuất sự kiện đơn hàng"]
            OrderDB[("<b>PostgreSQL</b><br/><i>(Order DB)</i><br/>• Order<br/>• OrderDetail")]
        end

        %% Product Service
        subgraph Group_Product ["Product Bounded Context"]
            ProductService["<b>Product Service</b><br/>• Quản lý sản phẩm<br/>• Kiểm tra và cập nhật tồn kho<br/>• Cung cấp thông tin sản phẩm"]
            ProductDB[("<b>MongoDB</b><br/><i>(Product DB)</i><br/>• Product<br/>• Inventory")]
        end

        %% Shipment Service
        subgraph Group_Shipment ["Shipment Bounded Context"]
            ShipmentService["<b>Shipment Service</b><br/>• Tiếp nhận đơn hàng<br/>• Cập nhật trạng thái giao hàng<br/>• Quản lý vận chuyển"]
            ShipmentDB[("<b>MongoDB</b><br/><i>(Shipment DB)</i><br/>• Shipment<br/>• Tracking")]
        end
    end

    %% ==========================================
    %% Event Broker Layer
    %% ==========================================
    subgraph BrokerLayer ["Message Broker Layer (Event-Driven)"]
        Kafka{{"<b>Kafka (Message Broker)</b><br/>• Topic: order-created<br/>• (các topic khác...)"}}
    end

    %% ==========================================
    %% Connections & Protocols
    %% ==========================================
    %% Client to API Gateway
    Client <==>|"REST API (HTTPS/JSON)"| APIGW

    %% API Gateway to Redis
    APIGW <===>|"Kết nối cơ sở dữ liệu"| Redis

    %% API Gateway to Microservices (gRPC synchronous)
    APIGW ==>|"gRPC (synchronous)"| AuthService
    APIGW ==>|"gRPC (synchronous)"| CustomerService
    APIGW ==>|"gRPC (synchronous)"| OrderService
    APIGW ==>|"gRPC (synchronous)"| ProductService
    APIGW ==>|"gRPC (synchronous)"| ShipmentService

    %% Services to their respective Databases
    AuthService <===>|"Kết nối cơ sở dữ liệu"| AuthDB
    CustomerService <===>|"Kết nối cơ sở dữ liệu"| CustomerDB
    OrderService <===>|"Kết nối cơ sở dữ liệu"| OrderDB
    ProductService <===>|"Kết nối cơ sở dữ liệu"| ProductDB
    ShipmentService <===>|"Kết nối cơ sở dữ liệu"| ShipmentDB

    %% Inter-service synchronous communication (gRPC)
    CustomerService <===>|"gRPC (synchronous)"| OrderService
    OrderService <===>|"gRPC (synchronous)"| ProductService

    %% Asynchronous Event-driven communication (Kafka)
    OrderService -.->|"Publish Order Created Event<br/>(asynchronous)"| Kafka
    Kafka -.->|"Consume Order Created Event<br/>(asynchronous)"| ShipmentService

    %% ==========================================
    %% Styling / Classes
    %% ==========================================
    classDef clientStyle fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#0369a1;
    classDef gatewayStyle fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#6b21a8;
    classDef redisStyle fill:#ffe4e6,stroke:#e11d48,stroke-width:2px,stroke-dasharray: 4 4,color:#9f1239;
    classDef authStyle fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e40af;
    classDef customerStyle fill:#f0fdf4,stroke:#16a34a,stroke-width:2px,color:#166534;
    classDef orderStyle fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#991b1b;
    classDef productStyle fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#9a3412;
    classDef shipmentStyle fill:#faf5ff,stroke:#7c3aed,stroke-width:2px,color:#5b21b6;
    classDef postgresStyle fill:#f0f9ff,stroke:#0284c7,stroke-width:2px,color:#075985;
    classDef mongoStyle fill:#f0fdf4,stroke:#059669,stroke-width:2px,color:#065f46;
    classDef kafkaStyle fill:#faf5ff,stroke:#475569,stroke-width:2px,color:#1e293b;

    class Client clientStyle;
    class APIGW gatewayStyle;
    class Redis redisStyle;
    class AuthService authStyle;
    class CustomerService customerStyle;
    class OrderService orderStyle;
    class ProductService productStyle;
    class ShipmentService shipmentStyle;
    class AuthDB,CustomerDB,OrderDB postgresStyle;
    class ProductDB,ShipmentDB mongoStyle;
    class Kafka kafkaStyle;
```

---

## 2. Bảng chú thích giao thức & kết nối (Legend)

| Ký hiệu | Loại kết nối / Giao thức | Phạm vi áp dụng | Đặc tính kỹ thuật |
| :---: | :--- | :--- | :--- |
| $\Longleftrightarrow$ | **REST API (HTTPS/JSON)** | Client $\leftrightarrow$ API Gateway | Giao tiếp đồng bộ (Synchronous), chuẩn định dạng JSON qua HTTPS, bảo vệ bằng JWT và SSL/TLS. |
| $\Longrightarrow$ | **gRPC (synchronous) (qua API Gateway)** | API Gateway $\rightarrow$ Các Microservices | Giao tiếp đồng bộ (Synchronous), giao thức HTTP/2 và Protobuf nhị phân hiệu năng cao, độ trễ thấp. |
| $\Longleftrightarrow$ | **gRPC (synchronous) (giữa các service)** | Customer $\leftrightarrow$ Order<br/>Order $\leftrightarrow$ Product | Giao tiếp trực tiếp nội bộ giữa các microservices khi cần tính toán dữ liệu tức thì (lấy điểm thưởng, kiểm tra và trừ tồn kho). |
| $-\;-\;\rightarrow$ | **Kafka (asynchronous)** | Order Service $\rightarrow$ Kafka $\rightarrow$ Shipment Service | Truyền thông bất đồng bộ hướng sự kiện (Event-Driven), đảm bảo loose-coupling, chịu lỗi và mở rộng độc lập. |
| $\Longleftrightarrow$ | **Kết nối cơ sở dữ liệu** | Service $\leftrightarrow$ Database tương ứng | Kết nối nội bộ theo nguyên tắc **Database-per-Service**; mỗi service chỉ truy cập trực tiếp vào DB của chính nó. |

---

## 3. Sơ đồ tương tác luồng xử lý mẫu: Tạo đơn hàng (Order Creation Flow)

Để làm rõ sự phối hợp giữa giao thức đồng bộ (gRPC) và bất đồng bộ (Kafka) trên sơ đồ, dưới đây là quy trình xử lý luồng đặt hàng hoàn chỉnh:

```mermaid
sequenceDiagram
    autonumber
    actor C as Client
    participant GW as API Gateway
    participant R as Redis (Cache/Rate Limit)
    participant O as Order Service
    participant Cust as Customer Service
    participant P as Product Service
    participant K as Kafka Broker
    participant S as Shipment Service

    %% 1. Request từ Client
    C->>GW: 1. POST /api/v1/orders (JWT, Payload)
    
    %% 2. Gateway xử lý xác thực & rate limit
    GW->>R: 2. Kiểm tra Rate Limit & Blacklist Token
    R-->>GW: 3. Hợp lệ & trong ngưỡng Rate Limit
    
    %% 3. Gateway chuyển tiếp đến Order Service qua gRPC
    GW->>O: 4. gRPC: CreateOrder(orderData)

    %% 4. Order Service gọi Customer Service lấy điểm để tính chiết khấu
    rect rgb(240, 253, 244)
        Note over O,Cust: Đồng bộ qua gRPC (giữa các service)
        O->>Cust: 5. gRPC: GetCustomerScore(uid)
        Cust-->>O: 6. Trả về điểm thưởng (score) & hạng thành viên
    end

    %% 5. Order Service gọi Product Service kiểm tra và trừ kho
    rect rgb(255, 247, 237)
        Note over O,P: Đồng bộ qua gRPC (giữa các service)
        O->>P: 7. gRPC: ReserveInventory(items)
        P-->>O: 8. Xác nhận tồn kho khả dụng & đã giữ hàng thành công
    end

    %% 6. Order Service lưu đơn hàng vào DB nội bộ
    Note over O: 9. Tính toán discount từ score<br/>Lưu Order & OrderDetail vào PostgreSQL (Order DB)

    %% 7. Xuất sự kiện bất đồng bộ sang Kafka
    rect rgb(254, 242, 242)
        Note over O,K: Bất đồng bộ (Event-Driven via Kafka)
        O-)K: 10. Publish event: 'order-created' (oid, uid, items, address)
    end

    %% 8. Trả kết quả về cho Client
    O-->>GW: 11. Trả về OrderResponse (oid, status = CREATED)
    GW-->>C: 12. 201 Created (Chi tiết đơn hàng)

    %% 9. Shipment Service lắng nghe sự kiện từ Kafka
    rect rgb(250, 245, 255)
        Note over K,S: Tiêu thụ sự kiện giao vận bất đồng bộ
        K-)S: 13. Consume event: 'order-created'
        Note over S: 14. Tiếp nhận đơn hàng, khởi tạo mã vận đơn (shipid)<br/>Lưu thông tin Shipment & Tracking vào MongoDB
    end
```

---

## 4. Đặc tả chi tiết các thành phần hệ thống

### 4.1. Client
- **Thiết bị hỗ trợ:** Laptop/Desktop Web Browser, Máy tính bảng (Tablet), Điện thoại thông minh (Mobile App).
- **Giao thức kết nối:** HTTPS / REST API với payload định dạng JSON tiêu chuẩn.
- **Bảo mật:** Gửi kèm JWT (JSON Web Token) trong header `Authorization: Bearer <token>` trên mỗi request được chứng thực.

---

### 4.2. API Gateway & Redis (API Gateway DB)

#### API Gateway
Đóng vai trò là điểm tiếp nhận duy nhất (**Single Entry Point**) cho toàn bộ các request ngoại vi từ Client.
- **Xác thực & ủy quyền (Authentication & Authorization):** Kiểm tra tính hợp lệ của JWT, trích xuất Claims (role, uid) và phân quyền truy cập endpoint.
- **Định tuyến request (Reverse Proxy & Routing):** Chuyển đổi các HTTP REST request thành các cuộc gọi gRPC tương ứng đến các microservice nội bộ.
- **Giới hạn tốc độ (Rate Limiting):** Ngăn chặn tấn công DoS/DDoS hoặc brute-force bằng thuật toán Token Bucket / Leaky Bucket.
- **Ghi log & giám sát (Logging & Monitoring):** Ghi nhận Access Log tập trung, tính toán Latency và phân phối Trace ID cho phân tích phân tán.

#### Redis (API Gateway DB)
Cơ sở dữ liệu In-Memory đóng vai trò bộ nhớ đệm tốc độ cao cho API Gateway:
- **Lưu cache token:** Lưu trữ Token Blacklist / Refresh Token để vô hiệu hóa phiên tức thì khi người dùng đăng xuất.
- **Lưu session:** Quản lý phiên làm việc tập trung của người dùng.
- **Rate limiting counter:** Lưu bộ đếm request theo IP hoặc theo User ID với cơ chế tự động hết hạn (TTL).
- **Cache dữ liệu:** Cache phản hồi của các dữ liệu ít biến động nhằm giảm tải cho các dịch vụ phía sau.

---

### 4.3. Các Bounded Context Microservices & Databases

#### 1. Auth Service
- **Nhiệm vụ:**
  - Quản lý tài khoản (Đăng ký, cập nhật thông tin tài khoản, đổi mật khẩu).
  - Xác thực người dùng (Đăng nhập, băm mật khẩu an toàn bcrypt/argon2, cấp phát JWT).
  - Quản lý vai trò (Role-based Access Control - RBAC: Admin, Customer, Staff,...).
- **Cơ sở dữ liệu:** `PostgreSQL (Auth DB)` (RDBMS đảm bảo tính toàn vẹn ACID).
  - Bảng `User`: Lưu thông tin đăng nhập (`uid`, `username`, `password`, `roleid`).
  - Bảng `Role`: Định nghĩa danh sách các vai trò (`roleid`, `rolename`).

#### 2. Customer Service
- **Nhiệm vụ:**
  - Quản lý thông tin chi tiết hồ sơ khách hàng (Họ tên, địa chỉ, liên hệ).
  - Quản lý các cấp độ/hạng thành viên (Silver, Gold, Platinum,...).
  - Cung cấp điểm số tích lũy (`score`) phục vụ việc tính toán chiết khấu.
- **Cơ sở dữ liệu:** `PostgreSQL (Customer DB)`.
  - Bảng `Customer`: Lưu hồ sơ khách hàng (`uid`, `fullname`, `mid`).
  - Bảng `Membership`: Quản lý các hạng thành viên và mốc điểm (`mid`, `mname`, `score`).

#### 3. Order Service
- **Nhiệm vụ:**
  - Quản lý vòng đời đơn đặt hàng (Tiếp nhận, xử lý, hủy đơn).
  - Tính toán mức giảm giá (`discount`) dựa trên điểm số lấy từ Customer Service qua gRPC.
  - Quản lý chi tiết từng dòng sản phẩm trong đơn hàng.
  - Xuất sự kiện đơn hàng thành công sang Message Broker (Kafka).
- **Giao tiếp liên service:**
  - Gọi Customer Service qua **gRPC** để lấy điểm `score`.
  - Gọi Product Service qua **gRPC** để kiểm tra giá và trừ tồn kho.
  - Xuất sự kiện `order-created` sang **Kafka**.
- **Cơ sở dữ liệu:** `PostgreSQL (Order DB)`.
  - Bảng `Order`: Lưu thông tin tổng quát đơn hàng (`oid`, `uid`, `discount`, `created_at`).
  - Bảng `OrderDetail`: Lưu chi tiết các mặt hàng (`oid`, `pid`, `qty`, `unit_price`).

#### 4. Product Service
- **Nhiệm vụ:**
  - Quản lý danh mục sản phẩm (CRUD sản phẩm, hình ảnh, phân loại, giá bán).
  - Kiểm tra và cập nhật tồn kho (Inventory verification & deduction).
  - Cung cấp thông tin sản phẩm cho các service khác qua gRPC.
- **Cơ sở dữ liệu:** `MongoDB (Product DB)` (Document-oriented NoSQL linh hoạt schema, hỗ trợ mở rộng sản phẩm đa thuộc tính).
  - Collection `Product`: Lưu dữ liệu sản phẩm (`pid`, `pname`, `price`, thông số chi tiết).
  - Collection `Inventory`: Quản lý số lượng tồn kho khả dụng (`quantity`).

#### 5. Shipment Service
- **Nhiệm vụ:**
  - Tiếp nhận đơn hàng cần giao vận thông qua việc lắng nghe sự kiện từ Kafka.
  - Cập nhật trạng thái giao nhận (Pending $\rightarrow$ Picked $\rightarrow$ Shipping $\rightarrow$ Delivered $\rightarrow$ Returned).
  - Quản lý thông tin nhà vận chuyển và lịch trình di chuyển (Tracking history).
- **Giao tiếp liên service:**
  - Tiêu thụ sự kiện `order-created` từ **Kafka** theo mô hình Publisher/Subscriber.
- **Cơ sở dữ liệu:** `MongoDB (Shipment DB)`.
  - Collection `Shipment`: Thông tin vận đơn (`shipid`, `oid`, `status`, nhà vận chuyển).
  - Collection `Tracking`: Nhật ký hành trình vận chuyển theo dòng thời gian.

---

### 4.4. Message Broker (Apache Kafka)
- **Vai trò:** Cung cấp hạ tầng truyền thông hướng sự kiện bất đồng bộ (Asynchronous Event Streaming).
- **Lợi ích kiến trúc:**
  - **Decoupling (Phân tách phụ thuộc):** `Order Service` không cần biết chi tiết triển khai hay địa chỉ mạng của `Shipment Service`.
  - **Khả năng chịu tải (Buffering / Load Leveling):** Khi lượng đặt hàng tăng vọt (Flash Sale), Kafka lưu giữ các sự kiện trong hàng đợi, giúp `Shipment Service` tiêu thụ tuần tự mà không bị sập (overwhelmed).
  - **Đảm bảo độ tin cậy:** Cơ chế ACK và Offset Commit đảm bảo sự kiện không bị mất mát khi gặp sự cố mạng hoặc khởi động lại dịch vụ.
- **Topics chính:**
  - `order-created`: Xuất phát từ Order Service khi đơn hàng được tạo lập thành công.
  - *(Các topic mở rộng khác: `payment-completed`, `shipment-updated`, `inventory-adjusted`,...)*.

---

## 5. Bảng tổng hợp công nghệ & mẫu kiến trúc (Architectural Patterns)

| Tiêu chí | Giải pháp công nghệ / Mẫu kiến trúc áp dụng |
| :--- | :--- |
| **Kiến trúc tổng thể** | Microservices Architecture kết hợp Domain-Driven Design (DDD). |
| **Mô hình dữ liệu** | **Database-per-Service**: Đảm bảo phân tách hoàn toàn ranh giới dữ liệu, không chia sẻ database giữa các dịch vụ. |
| **Cơ sở dữ liệu SQL** | PostgreSQL cho Auth, Customer, Order (đảm bảo tính toàn vẹn giao dịch ACID). |
| **Cơ sở dữ liệu NoSQL** | MongoDB cho Product và Shipment (tính linh hoạt cao, mô hình Document JSON tự nhiên). |
| **In-Memory Cache** | Redis cho API Gateway (Caching, Session Store, Rate Limiting). |
| **Giao tiếp đồng bộ** | **gRPC (Protobuf)**: Tối ưu băng thông mạng, chuyển đổi dữ liệu nhị phân tốc độ cao giữa Gateway và Microservices, cũng như giữa các Microservices. |
| **Giao tiếp bất đồng bộ** | **Apache Kafka**: Triển khai mẫu Publish-Subscribe / Event-Driven Architecture. |
| **Tính nhất quán dữ liệu** | **Eventual Consistency (Nhất quán cuối cùng)**: Xử lý giao vận qua Kafka thay vì 2-Phase Commit (2PC) cồng kềnh. |
