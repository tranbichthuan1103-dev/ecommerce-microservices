/**
 * Automated End-to-End Verification Suite for all 25 Official Test Cases
 * (docs/25_TestCases_5_BoundedContexts.xlsx) + API Gateway Redis & Health Checks.
 *
 * Usage:
 *   node tests/run-25-testcases.js          # Self-contained local cluster (5 gRPC + 1 HTTP Gateway)
 *   node tests/run-25-testcases.js --live   # Against live Docker Compose stack (http://localhost:3000 + Kafka :9092)
 */

const EventEmitter = require('events');
const assert = require('assert');
const { Kafka, logLevel } = require('kafkajs');

const { startAuthService } = require('../services/auth-service/src/index');
const { startCustomerService } = require('../services/customer-service/src/index');
const { startProductService } = require('../services/product-service/src/index');
const { startOrderService } = require('../services/order-service/src/index');
const { startShipmentService } = require('../services/shipment-service/src/index');
const { startApiGateway } = require('../api-gateway/src/index');

const isLiveDocker = process.argv.includes('--live');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_e) {
    data = null;
  }

  return { status: res.status, headers: res.headers, data };
}

async function publishRawEvent({ isLive, bus, topic = 'order-created', payload }) {
  if (!isLive) {
    bus.emit(topic, { value: JSON.stringify(payload) });
    await sleep(60);
    return;
  }
  const kafka = new Kafka({
    clientId: 'e2e-test-producer',
    brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    logLevel: logLevel.NOTHING
  });
  const producer = kafka.producer();
  await producer.connect();
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }]
  });
  await producer.disconnect();
  await sleep(600);
}

async function runSuite() {
  let cluster = null;
  const bus = new EventEmitter();
  const capturedEvents = [];
  bus.on('order-created', (msg) => {
    try {
      capturedEvents.push(JSON.parse(msg.value));
    } catch (_e) {
      capturedEvents.push(msg);
    }
  });

  let baseUrl = process.env.GATEWAY_BASE_URL || 'http://localhost:3000';

  if (!isLiveDocker) {
    const auth = await startAuthService({ dbMode: 'memory', port: 0, host: '127.0.0.1' });
    const cust = await startCustomerService({ dbMode: 'memory', port: 0, host: '127.0.0.1' });
    const prod = await startProductService({ dbMode: 'memory', port: 0, host: '127.0.0.1' });
    const ship = await startShipmentService({
      dbMode: 'memory',
      brokerMode: 'memory',
      eventEmitter: bus,
      port: 0,
      host: '127.0.0.1'
    });
    const ord = await startOrderService({
      dbMode: 'memory',
      brokerMode: 'memory',
      eventEmitter: bus,
      port: 0,
      host: '127.0.0.1',
      customerServiceUrl: `127.0.0.1:${cust.port}`,
      productServiceUrl: `127.0.0.1:${prod.port}`
    });
    const gw = await startApiGateway({
      redisMode: 'memory',
      port: 0,
      host: '127.0.0.1',
      silentLogs: true,
      rateLimitMaxRequests: 100,
      rateLimitWindowSec: 60,
      authServiceUrl: `127.0.0.1:${auth.port}`,
      customerServiceUrl: `127.0.0.1:${cust.port}`,
      productServiceUrl: `127.0.0.1:${prod.port}`,
      orderServiceUrl: `127.0.0.1:${ord.port}`,
      shipmentServiceUrl: `127.0.0.1:${ship.port}`
    });
    cluster = { auth, cust, prod, ship, ord, gw };
    baseUrl = `http://127.0.0.1:${gw.port}`;
  }

  const results = [];
  const runCase = async (id, context, title, fn) => {
    try {
      const detail = await fn();
      results.push({ id, context, title, passed: true, detail });
      console.log(`✅ [PASS] ${id.padEnd(10)} | ${context.padEnd(22)} | ${title} -> ${detail}`);
    } catch (err) {
      results.push({ id, context, title, passed: false, detail: err.message });
      console.error(`❌ [FAIL] ${id.padEnd(10)} | ${context.padEnd(22)} | ${title} -> ${err.message}`);
    }
  };

  console.log('\n================================================================================');
  console.log(`RUNNING 25 E-COMMERCE MICROSERVICES TEST CASES (mode=${isLiveDocker ? 'DOCKER_LIVE' : 'LOCAL_CLUSTER'})`);
  console.log('================================================================================\n');

  const uniqueUser = `user_${Date.now()}`;
  let newUid = null;
  let customerToken = null;
  let adminToken = null;
  let staffToken = null;
  let goldToken = null;
  let createdPid = null;
  let createdOid = null;
  let createdShipId = null;

  try {
    // Pre-login Admin, Staff, and Gold Customer (Bob: uid=4, score=500)
    const adminLogin = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { username: 'admin', password: 'Admin@123' }
    });
    adminToken = adminLogin.data.accessToken;

    const staffLogin = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { username: 'staff', password: 'Staff@123' }
    });
    staffToken = staffLogin.data.accessToken;

    const bobLogin = await request(baseUrl, 'POST', '/api/auth/login', {
      body: { username: 'bob', password: 'Pass@123' }
    });
    goldToken = bobLogin.data.accessToken;

    // -------------------------------------------------------------------------
    // 1. IDENTITY & ACCESS BOUNDED CONTEXT (TC-IAM-01 .. TC-IAM-05)
    // -------------------------------------------------------------------------
    await runCase('TC-IAM-01', 'Identity & Access', 'Đăng ký tài khoản hợp lệ', async () => {
      const res = await request(baseUrl, 'POST', '/api/auth/register', {
        body: { username: uniqueUser, password: 'Password@123', fullname: 'Nguyen Van Test' }
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.uid > 0);
      newUid = res.data.uid;
      return `201 Created (uid=${newUid})`;
    });

    await runCase('TC-IAM-02', 'Identity & Access', 'Đăng ký username đã tồn tại', async () => {
      const res = await request(baseUrl, 'POST', '/api/auth/register', {
        body: { username: uniqueUser, password: 'Password@123' }
      });
      assert.strictEqual(res.status, 409);
      return `409 Conflict (${res.data.message})`;
    });

    await runCase('TC-IAM-03', 'Identity & Access', 'Đăng ký thiếu password', async () => {
      const res = await request(baseUrl, 'POST', '/api/auth/register', {
        body: { username: `${uniqueUser}_nopwd`, password: '' }
      });
      assert.strictEqual(res.status, 400);
      return `400 Bad Request (${res.data.message})`;
    });

    await runCase('TC-IAM-04', 'Identity & Access', 'Đăng nhập đúng thông tin', async () => {
      const res = await request(baseUrl, 'POST', '/api/auth/login', {
        body: { username: uniqueUser, password: 'Password@123' }
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.accessToken);
      customerToken = res.data.accessToken;
      return `200 OK (tokenType=${res.data.tokenType}, expiresIn=${res.data.expiresIn})`;
    });

    await runCase('TC-IAM-05', 'Identity & Access', 'Đăng nhập sai password', async () => {
      const res = await request(baseUrl, 'POST', '/api/auth/login', {
        body: { username: uniqueUser, password: 'WrongPassword!' }
      });
      assert.strictEqual(res.status, 401);
      return `401 Unauthorized (${res.data.message})`;
    });

    // -------------------------------------------------------------------------
    // 2. CUSTOMER & MEMBERSHIP BOUNDED CONTEXT (TC-CUS-01 .. TC-CUS-05)
    // -------------------------------------------------------------------------
    await runCase('TC-CUS-01', 'Customer & Membership', 'Lấy Customer tồn tại', async () => {
      const res = await request(baseUrl, 'GET', `/api/customers/${newUid}`, { token: customerToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.uid, newUid);
      return `200 OK (fullname="${res.data.fullname}", mid=${res.data.mid})`;
    });

    await runCase('TC-CUS-02', 'Customer & Membership', 'Lấy Customer không tồn tại', async () => {
      const res = await request(baseUrl, 'GET', '/api/customers/999999', { token: adminToken });
      assert.strictEqual(res.status, 404);
      return `404 Not Found (${res.data.message})`;
    });

    await runCase('TC-CUS-03', 'Customer & Membership', 'Cập nhật fullname', async () => {
      const res = await request(baseUrl, 'PUT', `/api/customers/${newUid}`, {
        token: customerToken,
        body: { fullname: 'Nguyen Van Updated', mid: 2 }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.fullname, 'Nguyen Van Updated');
      return `200 OK (fullname="${res.data.fullname}", mid=${res.data.mid})`;
    });

    await runCase('TC-CUS-04', 'Customer & Membership', 'Lấy thông tin Membership', async () => {
      const res = await request(baseUrl, 'GET', `/api/customers/${newUid}/membership`, { token: customerToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.mname, 'Silver');
      assert.strictEqual(res.data.score, 100);
      return `200 OK (mname=${res.data.mname}, score=${res.data.score})`;
    });

    await runCase('TC-CUS-05', 'Customer & Membership', 'Truy vấn Customer không có token', async () => {
      const res = await request(baseUrl, 'GET', `/api/customers/${newUid}`);
      assert.strictEqual(res.status, 401);
      return `401 Unauthorized`;
    });

    // -------------------------------------------------------------------------
    // 3. PRODUCT CATALOG BOUNDED CONTEXT (TC-PRO-01 .. TC-PRO-05)
    // -------------------------------------------------------------------------
    await runCase('TC-PRO-01', 'Product Catalog', 'Lấy danh sách Product', async () => {
      const res = await request(baseUrl, 'GET', '/api/products', { token: customerToken });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.items) && res.data.items.length >= 3);
      return `200 OK (${res.data.items.length} products, X-Cache=${res.headers.get('x-cache')})`;
    });

    await runCase('TC-PRO-02', 'Product Catalog', 'Lấy Product tồn tại', async () => {
      const res = await request(baseUrl, 'GET', '/api/products/1', { token: customerToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.pid, 1);
      return `200 OK (pname="${res.data.pname}", price=${res.data.price})`;
    });

    await runCase('TC-PRO-03', 'Product Catalog', 'Lấy Product không tồn tại', async () => {
      const res = await request(baseUrl, 'GET', '/api/products/999999', { token: customerToken });
      assert.strictEqual(res.status, 404);
      return `404 Not Found (${res.data.message})`;
    });

    await runCase('TC-PRO-04', 'Product Catalog', 'Tạo Product mới (Admin)', async () => {
      const res = await request(baseUrl, 'POST', '/api/products', {
        token: adminToken,
        body: { pname: '4K Monitor 27 inch', price: 400, quantity: 12 }
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.pid > 0);
      createdPid = res.data.pid;
      return `201 Created (pid=${createdPid}, price=${res.data.price}, qty=${res.data.quantity})`;
    });

    await runCase('TC-PRO-05', 'Product Catalog', 'Cập nhật tồn kho Product', async () => {
      const res = await request(baseUrl, 'PATCH', `/api/products/${createdPid}/inventory`, {
        token: adminToken,
        body: { quantity: 25 }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.quantity, 25);
      return `200 OK (pid=${createdPid}, updated quantity=${res.data.quantity})`;
    });

    // -------------------------------------------------------------------------
    // 4. ORDER MANAGEMENT BOUNDED CONTEXT (TC-ORD-01 .. TC-ORD-05)
    // -------------------------------------------------------------------------
    await runCase('TC-ORD-01', 'Order Management', 'Tạo Order hợp lệ', async () => {
      // Customer (newUid, Silver score=100 -> 5%) orders 2x Monitor ($400 each = $800)
      const res = await request(baseUrl, 'POST', '/api/orders', {
        token: customerToken,
        body: { items: [{ pid: createdPid, qty: 2 }] }
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.oid >= 1001);
      assert.strictEqual(res.data.items.length, 1);
      assert.strictEqual(res.data.items[0].unit_price, 400);
      createdOid = res.data.oid;
      return `201 Created (oid=${createdOid}, discount=${res.data.discount}, total=${res.data.total_amount})`;
    });

    await runCase('TC-ORD-02', 'Order Management', 'Tạo Order không có JWT', async () => {
      const res = await request(baseUrl, 'POST', '/api/orders', {
        body: { items: [{ pid: createdPid, qty: 1 }] }
      });
      assert.strictEqual(res.status, 401);
      return `401 Unauthorized`;
    });

    await runCase('TC-ORD-03', 'Order Management', 'Đặt số lượng vượt tồn kho', async () => {
      const res = await request(baseUrl, 'POST', '/api/orders', {
        token: customerToken,
        body: { items: [{ pid: createdPid, qty: 9999 }] }
      });
      assert.strictEqual(res.status, 409);
      return `409 Conflict (${res.data.message})`;
    });

    await runCase('TC-ORD-04', 'Order Management', 'Tính discount theo score thành viên', async () => {
      // Bob (uid=4, Gold score=500 -> 10% discount) buys 1x Monitor ($400) => discount=$40, total=$360
      const res = await request(baseUrl, 'POST', '/api/orders', {
        token: goldToken,
        body: { items: [{ pid: createdPid, qty: 1 }] }
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.discount, 40);
      assert.strictEqual(res.data.total_amount, 360);
      return `201 Created (Gold score=500 -> 10%: subtotal=400, discount=${res.data.discount}, total=${res.data.total_amount})`;
    });

    await runCase('TC-ORD-05', 'Order Management', 'Tạo Order và phát sự kiện OrderCreated vào Kafka', async () => {
      const res = await request(baseUrl, 'POST', '/api/orders', {
        token: customerToken,
        body: { items: [{ pid: 2, qty: 2 }] }
      });
      assert.strictEqual(res.status, 201);
      const targetOid = res.data.oid;

      // Wait briefly if running over real Kafka
      if (isLiveDocker) {
        await sleep(600);
      } else {
        const matchedEvt = capturedEvents.find((e) => e.data && e.data.oid === targetOid);
        assert.ok(matchedEvt, 'OrderCreated event must be published');
      }

      const shipCheck = await request(baseUrl, 'GET', `/api/shipments/order/${targetOid}`, { token: customerToken });
      assert.strictEqual(shipCheck.status, 200);
      return `Order oid=${targetOid} persisted & OrderCreated event delivered (shipid=${shipCheck.data.shipid})`;
    });

    // -------------------------------------------------------------------------
    // 5. SHIPMENT BOUNDED CONTEXT (TC-SHP-01 .. TC-SHP-05)
    // -------------------------------------------------------------------------
    await runCase('TC-SHP-01', 'Shipment', 'Nhận OrderCreated Event và tạo Shipment', async () => {
      if (isLiveDocker) await sleep(400);
      const res = await request(baseUrl, 'GET', `/api/shipments/order/${createdOid}`, { token: customerToken });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.oid, createdOid);
      assert.strictEqual(res.data.status, 'PENDING');
      createdShipId = res.data.shipid;
      return `Shipment created (shipid=${createdShipId}, oid=${createdOid}, status=${res.data.status})`;
    });

    await runCase('TC-SHP-02', 'Shipment', 'Event thiếu oid -> Không tạo Shipment, ghi lỗi', async () => {
      const beforeList = await request(baseUrl, 'GET', '/api/shipments', { token: adminToken });
      const beforeCount = beforeList.data.items.length;

      await publishRawEvent({
        isLive: isLiveDocker,
        bus,
        payload: { eventType: 'OrderCreated', data: { uid: newUid } } // Missing oid!
      });

      const afterList = await request(baseUrl, 'GET', '/api/shipments', { token: adminToken });
      assert.strictEqual(afterList.data.items.length, beforeCount);
      if (cluster) {
        assert.ok(cluster.ship.useCase.eventErrorLogs.length >= 1);
      }
      return `No shipment created (count remained ${beforeCount}), error safely logged`;
    });

    await runCase('TC-SHP-03', 'Shipment', 'Cập nhật trạng thái Shipment -> SHIPPING', async () => {
      const res = await request(baseUrl, 'PATCH', `/api/shipments/${createdShipId}/status`, {
        token: staffToken,
        body: { status: 'SHIPPING' }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'SHIPPING');
      return `200 OK (shipid=${createdShipId}, status=${res.data.status})`;
    });

    await runCase('TC-SHP-04', 'Shipment', 'Cập nhật Shipment không tồn tại', async () => {
      const res = await request(baseUrl, 'PATCH', '/api/shipments/999999/status', {
        token: staffToken,
        body: { status: 'DELIVERED' }
      });
      assert.strictEqual(res.status, 404);
      return `404 Not Found (${res.data.message})`;
    });

    await runCase('TC-SHP-05', 'Shipment', 'Nhận cùng OrderCreated Event hai lần (Idempotent)', async () => {
      const beforeList = await request(baseUrl, 'GET', '/api/shipments', { token: adminToken });
      const beforeCount = beforeList.data.items.length;

      // Re-send duplicate OrderCreated event for createdOid
      await publishRawEvent({
        isLive: isLiveDocker,
        bus,
        payload: { eventType: 'OrderCreated', data: { oid: createdOid, uid: newUid } }
      });

      const afterList = await request(baseUrl, 'GET', '/api/shipments', { token: adminToken });
      assert.strictEqual(afterList.data.items.length, beforeCount);
      return `Idempotent verified: shipment count stayed ${afterList.data.items.length} (no duplicate for oid=${createdOid})`;
    });

    // -------------------------------------------------------------------------
    // BONUS: SYSTEM HEALTH & GATEWAY REDIS CACHE CHECK
    // -------------------------------------------------------------------------
    const healthRes = await request(baseUrl, 'GET', '/api/health');
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.data.status, 'UP');
    console.log(`\n🩺 [HEALTH] GET /api/health -> 200 OK (${JSON.stringify(healthRes.data.dependencies)})`);
  } finally {
    if (cluster) {
      await cluster.gw.stop();
      await cluster.ord.stop();
      await cluster.ship.stop();
      await cluster.prod.stop();
      await cluster.cust.stop();
      await cluster.auth.stop();
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n================================================================================');
  console.log(`SUMMARY: ${passedCount}/${results.length} TEST CASES PASSED`);
  console.log('================================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});

