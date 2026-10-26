# Hướng Dẫn Test Lần Lượt 25 Test Cases Bằng Postman

Tài liệu này hướng dẫn **2 cách** test toàn bộ **25 Test Cases** (`docs/25_TestCases_5_BoundedContexts.xlsx`) trên **Postman** với hệ thống Docker Compose đang chạy tại `http://localhost:3000`:
- **Cách 1 (Khuyên dùng — mất 10 giây):** Import file Collection có sẵn để chạy tự động hoặc bấm từng câu không cần gõ tay.
- **Cách 2 (Thủ công chi tiết từ câu 1 → 25):** Cách điền Method, URL, Authorization Bearer Token và Body JSON cho từng Test Case.

---

## Cách 1: Import Sẵn Bộ 25 Test Cases Vào Postman (Nhanh nhất khi đi thi)

1. Mở **Postman** $\rightarrow$ bấm nút **Import** (góc trên bên trái).
2. Chọn file: `docs/Ecommerce_MVP_25_TestCases.postman_collection.json`.
3. Bạn sẽ thấy Collection **`E-Commerce Microservices MVP - 25 Test Cases`** gồm **Thư mục `0` (Khởi tạo Token)** và **5 Thư mục ứng với 5 Bounded Contexts**.
4. **Chạy toàn bộ tự động:** Nhấp chuột phải vào tên Collection $\rightarrow$ chọn **Run collection** $\rightarrow$ bấm **Run** $\rightarrow$ toàn bộ 25 Test Cases sẽ tự động chạy tuần tự, tự truyền `token`/`uid`/`pid`/`oid`/`shipid` và hiện xanh **PASS 100%**.
5. **Hoặc chạy lẻ từng câu khi giảng viên gọi:** Chỉ cần bấm chạy thư mục `0. Khởi tạo Token` trước (để Postman tự lưu `admin_token`, `staff_token`, `bob_token`), sau đó giảng viên gọi câu nào thì mở đúng câu đó bấm **Send**!

---

## Cách 2: Hướng Dẫn Cấu Hình & Bấm Từng Test Case Lần Lượt (1 → 25)

### Bước chuẩn bị trước khi test (Lấy sẵn 3 Token quyền hạn)
Tạo 1 tab `POST http://localhost:3000/api/auth/login` (Tab **Body** $\rightarrow$ chọn **raw** $\rightarrow$ kiểu **JSON**) để lấy sẵn:
- **Admin Token (`ADMIN_TOKEN`):** Body `{"username": "admin", "password": "Admin@123"}`
- **Staff Token (`STAFF_TOKEN`):** Body `{"username": "staff", "password": "Staff@123"}`
- **Gold Customer Token (`BOB_TOKEN` — `uid=4`, hạng Gold `score=500` giảm 10%):** Body `{"username": "bob", "password": "Pass@123"}`

> **Cách gắn JWT trong Postman cho các API cần đăng nhập:**
> Mở tab **Authorization** $\rightarrow$ mục **Auth Type** chọn **`Bearer Token`** $\rightarrow$ dán chuỗi `accessToken` vào ô **Token**.

---

### PHẦN 1: Identity & Access Bounded Context (`TC-IAM-01` → `TC-IAM-05`)

#### 1. `TC-IAM-01` — Đăng ký tài khoản hợp lệ
- **Method & URL:** `POST http://localhost:3000/api/auth/register`
- **Auth:** `No Auth`
- **Body (raw JSON):**
  ```json
  {
    "username": "khachhang01",
    "password": "P@ss123",
    "fullname": "Nguyen Van A"
  }
  ```
- **Kết quả đạt:** Status **`201 Created`** — Trả về `{"message": "User registered successfully", "uid": 5, ...}`. *(Ghi nhớ số `uid` vừa tạo, ví dụ `5`)*.

#### 2. `TC-IAM-02` — Đăng ký username đã tồn tại
- **Method & URL:** `POST http://localhost:3000/api/auth/register`
- **Auth:** `No Auth`
- **Body (raw JSON):** Giữ nguyên `"username": "khachhang01"` vừa đăng ký ở trên rồi bấm **Send** lại.
- **Kết quả đạt:** Status **`409 Conflict`** — `{"error": "Username 'khachhang01' already exists", ...}`.

#### 3. `TC-IAM-03` — Đăng ký thiếu password
- **Method & URL:** `POST http://localhost:3000/api/auth/register`
- **Auth:** `No Auth`
- **Body (raw JSON):**
  ```json
  {
    "username": "khachhang02",
    "password": ""
  }
  ```
- **Kết quả đạt:** Status **`400 Bad Request`** — `Password is required and cannot be empty`.

#### 4. `TC-IAM-04` — Đăng nhập đúng thông tin
- **Method & URL:** `POST http://localhost:3000/api/auth/login`
- **Auth:** `No Auth`
- **Body (raw JSON):**
  ```json
  {
    "username": "khachhang01",
    "password": "P@ss123"
  }
  ```
- **Kết quả đạt:** Status **`200 OK`** — Trả về `accessToken` (JWT), `"tokenType": "Bearer"`, `"expiresIn": 3600`. *(Copy `accessToken` này làm `CUST_TOKEN` cho phần sau)*.

#### 5. `TC-IAM-05` — Đăng nhập sai password
- **Method & URL:** `POST http://localhost:3000/api/auth/login`
- **Auth:** `No Auth`
- **Body (raw JSON):**
  ```json
  {
    "username": "khachhang01",
    "password": "SaiMatKhau"
  }
  ```
- **Kết quả đạt:** Status **`401 Unauthorized`** — `Invalid username or password`.

---

### PHẦN 2: Customer & Membership Bounded Context (`TC-CUS-01` → `TC-CUS-05`)

#### 6. `TC-CUS-01` — Lấy Customer tồn tại
- **Method & URL:** `GET http://localhost:3000/api/customers/5` *(thay `5` bằng `uid` của `khachhang01`, hoặc dùng `4` với `BOB_TOKEN`)*
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Kết quả đạt:** Status **`200 OK`** — Trả về `{"uid": 5, "fullname": "Nguyen Van A", "mid": 1, "mname": "Bronze", "score": 0}`.

#### 7. `TC-CUS-02` — Lấy Customer không tồn tại
- **Method & URL:** `GET http://localhost:3000/api/customers/999999`
- **Auth:** Bearer Token = `ADMIN_TOKEN`
- **Kết quả đạt:** Status **`404 Not Found`** — `Customer uid=999999 not found`.

#### 8. `TC-CUS-03` — Cập nhật `fullname` (và hạng thành viên `mid`)
- **Method & URL:** `PUT http://localhost:3000/api/customers/5`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Body (raw JSON):**
  ```json
  {
    "fullname": "Nguyen Van A Updated",
    "mid": 2
  }
  ```
- **Kết quả đạt:** Status **`200 OK`** — `fullname` đổi thành `"Nguyen Van A Updated"`, hạng `mid: 2` (`Silver`).

#### 9. `TC-CUS-04` — Lấy thông tin Membership (`mname` và `score`)
- **Method & URL:** `GET http://localhost:3000/api/customers/5/membership`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Kết quả đạt:** Status **`200 OK`** — Trả về `{"uid": 5, "mid": 2, "mname": "Silver", "score": 100}`.

#### 10. `TC-CUS-05` — Truy vấn Customer không có token
- **Method & URL:** `GET http://localhost:3000/api/customers/5`
- **Auth:** Chuyển tab Authorization sang **`No Auth`**
- **Kết quả đạt:** Status **`401 Unauthorized`** — `Missing or invalid Authorization Bearer token`.

---

### PHẦN 3: Product Catalog Bounded Context (`TC-PRO-01` → `TC-PRO-05`)

#### 11. `TC-PRO-01` — Lấy danh sách Product
- **Method & URL:** `GET http://localhost:3000/api/products`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Kết quả đạt:** Status **`200 OK`** — Trả mảng `items` danh sách sản phẩm. *(Mẹo ăn điểm thêm: Bấm **Send** lần 2 và mở tab **Headers** của Response sẽ thấy `X-Cache: HIT` từ Redis!)*.

#### 12. `TC-PRO-02` — Lấy Product tồn tại
- **Method & URL:** `GET http://localhost:3000/api/products/1`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Kết quả đạt:** Status **`200 OK`** — Trả về `{"pid": 1, "pname": "Laptop Gaming Pro", "price": 1500, "quantity": ...}`.

#### 13. `TC-PRO-03` — Lấy Product không tồn tại
- **Method & URL:** `GET http://localhost:3000/api/products/999999`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Kết quả đạt:** Status **`404 Not Found`** — `Product pid=999999 not found`.

#### 14. `TC-PRO-04` — Tạo Product mới (Yêu cầu quyền Admin)
- **Method & URL:** `POST http://localhost:3000/api/products`
- **Auth:** Bearer Token = `ADMIN_TOKEN` *(nếu dùng `CUST_TOKEN` sẽ bị chặn `403 Forbidden`)*
- **Body (raw JSON):**
  ```json
  {
    "pname": "Man hinh 4K UltraSharp",
    "price": 500,
    "quantity": 15
  }
  ```
- **Kết quả đạt:** Status **`201 Created`** — Trả về sản phẩm mới kèm mã `pid` (ví dụ `pid: 4`).

#### 15. `TC-PRO-05` — Cập nhật tồn kho Product
- **Method & URL:** `PATCH http://localhost:3000/api/products/4/inventory` *(thay `4` bằng `pid` vừa tạo)*
- **Auth:** Bearer Token = `ADMIN_TOKEN`
- **Body (raw JSON):**
  ```json
  {
    "quantity": 30
  }
  ```
- **Kết quả đạt:** Status **`200 OK`** — `quantity` được cập nhật chính xác lên `30`.

---

### PHẦN 4: Order Management Bounded Context (`TC-ORD-01` → `TC-ORD-05`)

#### 16. `TC-ORD-01` — Tạo Order hợp lệ
- **Method & URL:** `POST http://localhost:3000/api/orders`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Body (raw JSON):**
  ```json
  {
    "items": [
      { "pid": 4, "qty": 2 }
    ]
  }
  ```
- **Kết quả đạt:** Status **`201 Created`** — Tạo `Order` và `OrderDetail` thành công, trả về `oid` (ví dụ `1001`), `items` kèm `unit_price: 500`.

#### 17. `TC-ORD-02` — Tạo Order không có JWT
- **Method & URL:** `POST http://localhost:3000/api/orders`
- **Auth:** `No Auth`
- **Body (raw JSON):** `{"items": [{"pid": 4, "qty": 1}]}`
- **Kết quả đạt:** Status **`401 Unauthorized`**.

#### 18. `TC-ORD-03` — Đặt số lượng vượt tồn kho (`qty > quantity`)
- **Method & URL:** `POST http://localhost:3000/api/orders`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Body (raw JSON):**
  ```json
  {
    "items": [
      { "pid": 4, "qty": 99999 }
    ]
  }
  ```
- **Kết quả đạt:** Status **`409 Conflict`** — Báo lỗi `Insufficient stock...`, không tạo đơn hàng.

#### 19. `TC-ORD-04` — Tính `discount` theo `score` của khách hàng
- **Method & URL:** `POST http://localhost:3000/api/orders`
- **Auth:** Bearer Token = `BOB_TOKEN` *(tài khoản `bob` thuộc hạng **Gold**, `score = 500` $\rightarrow$ được giảm **10%**)*
- **Body (raw JSON):** Đặt 1 sản phẩm giá `500` (`pid: 4`):
  ```json
  {
    "items": [
      { "pid": 4, "qty": 1 }
    ]
  }
  ```
- **Kết quả đạt:** Status **`201 Created`** — Kiểm tra JSON trả về thấy rõ: `"discount": 50` (10% của 500) và `"total_amount": 450`.

#### 20. `TC-ORD-05` — Tạo Order và phát sự kiện `OrderCreated` vào Kafka
- **Method & URL:** `POST http://localhost:3000/api/orders`
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Body (raw JSON):**
  ```json
  {
    "items": [
      { "pid": 2, "qty": 1 }
    ]
  }
  ```
- **Kết quả đạt:** Status **`201 Created`** — Ghi nhớ mã `oid` vừa trả về (ví dụ `1003`). Order đã lưu kèm `OutboxEvent` và tự động đẩy sang Kafka topic `order-created`.

---

### PHẦN 5: Shipment Bounded Context (`TC-SHP-01` → `TC-SHP-05`)

#### 21. `TC-SHP-01` — Nhận `OrderCreated` Event và tự động tạo Shipment
- **Method & URL:** `GET http://localhost:3000/api/shipments/order/1003` *(thay `1003` bằng `oid` từ câu `TC-ORD-05`)*
- **Auth:** Bearer Token = `CUST_TOKEN`
- **Kết quả đạt:** Status **`200 OK`** — `Shipment Service` đã tiêu thụ sự kiện từ Kafka và tự tạo vận đơn `"shipid": 5003`, `"oid": 1003`, `"status": "PENDING"`. *(Ghi nhớ `shipid` này)*.

#### 22. `TC-SHP-02` — Kafka Event thiếu `oid` $\rightarrow$ Không tạo Shipment, ghi nhận lỗi
- **Bước A (Kiểm tra tổng số vận đơn hiện tại):** `GET http://localhost:3000/api/shipments` (với `ADMIN_TOKEN`) — giả sử đang có `3` vận đơn.
- **Bước B (Bắn trực tiếp 1 sự kiện lỗi thiếu `oid` vào Kafka ngay từ Postman):**
  - **Method & URL:** `POST http://localhost:3000/api/orders/test-kafka-event`
  - **Auth:** Bearer Token = `ADMIN_TOKEN`
  - **Body (raw JSON):**
    ```json
    {
      "payload": {
        "eventType": "OrderCreated",
        "data": {
          "uid": 4
        }
      }
    }
    ```
- **Bước C (Xác nhận):** Gọi lại `GET http://localhost:3000/api/shipments` $\rightarrow$ tổng số vận đơn **vẫn giữ nguyên là `3`** (không tạo vận đơn rác), và `docker logs shipment-service --tail 5` ghi rõ dòng lỗi `Rejected OrderCreated event missing valid oid`.

#### 23. `TC-SHP-03` — Cập nhật trạng thái Shipment sang `SHIPPING`
- **Method & URL:** `PATCH http://localhost:3000/api/shipments/5003/status` *(thay `5003` bằng `shipid` ở câu 21)*
- **Auth:** Bearer Token = `STAFF_TOKEN` *(hoặc `ADMIN_TOKEN`)*
- **Body (raw JSON):**
  ```json
  {
    "status": "SHIPPING"
  }
  ```
- **Kết quả đạt:** Status **`200 OK`** — `"status": "SHIPPING"`, mảng `tracking` có thêm dòng lịch sử cập nhật mới.

#### 24. `TC-SHP-04` — Cập nhật Shipment không tồn tại
- **Method & URL:** `PATCH http://localhost:3000/api/shipments/999999/status`
- **Auth:** Bearer Token = `STAFF_TOKEN`
- **Body (raw JSON):**
  ```json
  {
    "status": "DELIVERED"
  }
  ```
- **Kết quả đạt:** Status **`404 Not Found`** — `Shipment shipid=999999 not found`.

#### 25. `TC-SHP-05` — Nhận cùng `OrderCreated` Event hai lần (Kiểm chứng Idempotent Consumer)
- **Bước A:** Bắn lại sự kiện `OrderCreated` trùng mã `"oid": 1003` đã tồn tại vào Kafka:
  - **Method & URL:** `POST http://localhost:3000/api/orders/test-kafka-event`
  - **Auth:** Bearer Token = `ADMIN_TOKEN`
  - **Body (raw JSON):**
    ```json
    {
      "payload": {
        "eventType": "OrderCreated",
        "data": {
          "oid": 1003,
          "uid": 5
        }
      }
    }
    ```
- **Bước B (Xác nhận):** Gọi `GET http://localhost:3000/api/shipments` (với `ADMIN_TOKEN`) $\rightarrow$ chỉ có **duy nhất 1 vận đơn** mang `"oid": 1003` (không bị nhân đôi vận đơn trùng!). Xem `docker logs shipment-service --tail 5` sẽ thấy `Idempotent skip: Shipment already exists for oid=1003`.

