Bài tập PROMPT 3: Microservice

PROMPT

Thiết lập hướng dẫn mức cơ bản và diễn giải cụ thể từng bước. Sau mỗi hướng dẫn thì AI kiểm tra và đánh giá khách quan.

Dựa vào các tài liệu thiết kế đính kèm

Bạn là một Software Architect và Senior Backend Engineer. Hãy hướng dẫn tôi xây dựng từng bước một backend RESTful API cho hệ thống thương mại điện tử phiên bản MVP bằng Node.js theo kiến trúc Microservices, DDD và Database-per-Service.

Xây dựng một hệ thống thương mại điện tử MVP có các chức năng như tài liệu thiết kế được đảm bảo bên dưới:

Đăng ký tài khoản.
Đăng nhập.
Xác thực và phân quyền.
Quản lý khách hàng.
Quản lý hạng thành viên và điểm score.
Quản lý sản phẩm.
Đặt hàng.
Tính discount dựa trên score của khách hàng.
Lưu Order và OrderDetail.
Chuyển thông tin đơn hàng sang Shipment.
Cập nhật trạng thái giao hàng.
Health check.
Dockerize toàn bộ hệ thống.
Có khả năng chạy local bằng Docker Compose.

API Gateway chịu trách nhiệm:
Routing.
Authentication.
Authorization.
JWT validation.
Rate limiting.
Logging.

Sử dụng Redis cho API Gateway với vai trò: Cache, Rate limiting.