const express = require('express');
const { grpcErrorToHttp } = require('../infrastructure/grpc.clients');
const { createCacheMiddleware } = require('../middlewares/cache.middleware');

function createApiRouter({ grpcClients, redisStore, authMiddlewares, cacheTtlSec = 60 }) {
  const router = express.Router();
  const { authenticate, authorizeRoles } = authMiddlewares;

  const handleGrpcError = (res, err) => {
    const { status, message } = grpcErrorToHttp(err);
    return res.status(status).json({ error: message, message });
  };

  // =========================================================================
  // 1. HEALTH CHECK (API-HEALTH-01)
  // =========================================================================
  router.get('/health', async (_req, res) => {
    const checks = {};
    let allHealthy = true;

    try {
      const ok = await redisStore.ping();
      checks.redis = ok ? 'UP' : 'DOWN';
      if (!ok) allHealthy = false;
    } catch (_e) {
      checks.redis = 'DOWN';
      allHealthy = false;
    }

    const serviceMap = [
      ['authService', grpcClients.auth],
      ['customerService', grpcClients.customer],
      ['productService', grpcClients.product],
      ['orderService', grpcClients.order],
      ['shipmentService', grpcClients.shipment]
    ];

    await Promise.all(
      serviceMap.map(async ([name, client]) => {
        try {
          const r = await client.HealthCheck({});
          checks[name] = r && r.status === 'UP' ? 'UP' : 'DOWN';
          if (checks[name] !== 'UP') allHealthy = false;
        } catch (_err) {
          checks[name] = 'DOWN';
          allHealthy = false;
        }
      })
    );

    const statusCode = allHealthy ? 200 : 503;
    return res.status(statusCode).json({
      status: allHealthy ? 'UP' : 'DEGRADED',
      message: allHealthy ? 'E-commerce API is running' : 'One or more dependencies are unhealthy',
      dependencies: checks
    });
  });

  // =========================================================================
  // 2. IDENTITY & ACCESS (/api/auth)
  // =========================================================================
  router.post('/auth/register', async (req, res) => {
    try {
      const { username, password, fullname, email, phone } = req.body || {};
      const authResult = await grpcClients.auth.Register({
        username: username || '',
        password: password || '',
        fullname: fullname || '',
        email: email || '',
        phone: phone || '',
        role: 'customer'
      });

      // Automatically sync Customer profile in Customer Bounded Context
      await grpcClients.customer.CreateCustomer({
        uid: authResult.uid,
        fullname: (fullname && fullname.trim()) || authResult.username,
        mid: 1
      });

      return res.status(201).json({
        message: authResult.message || 'User registered successfully',
        uid: authResult.uid,
        username: authResult.username,
        role: authResult.role
      });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const loginResult = await grpcClients.auth.Login({
        username: username || '',
        password: password || ''
      });

      await redisStore.setEx(
        `session:${loginResult.uid}`,
        loginResult.expires_in || 3600,
        JSON.stringify({
          uid: loginResult.uid,
          username: loginResult.username,
          role: loginResult.role,
          loginAt: new Date().toISOString()
        })
      );

      return res.status(200).json({
        accessToken: loginResult.access_token,
        tokenType: loginResult.token_type || 'Bearer',
        expiresIn: loginResult.expires_in || 3600,
        user: {
          uid: loginResult.uid,
          username: loginResult.username,
          role: loginResult.role
        }
      });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.post('/auth/logout', authenticate, async (req, res) => {
    const token = req.user.token;
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingTtl = req.user.exp ? Math.max(1, req.user.exp - nowSec) : 3600;
    await redisStore.setEx(`token:bl:${token}`, remainingTtl, '1');
    await redisStore.del(`token:valid:${token}`);
    await redisStore.del(`session:${req.user.uid}`);
    return res.status(200).json({ message: 'Logged out successfully' });
  });

  // =========================================================================
  // 3. CUSTOMER & MEMBERSHIP (/api/customers & /api/memberships)
  // =========================================================================
  router.get(
    '/customers/:uid',
    authenticate,
    (req, res, next) => {
      const targetUid = Number(req.params.uid);
      if (req.user.role !== 'admin' && req.user.uid !== targetUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'Cannot view another customer profile' });
      }
      return next();
    },
    createCacheMiddleware(redisStore, (req) => `customers:${req.params.uid}`, cacheTtlSec),
    async (req, res) => {
      try {
        const customer = await grpcClients.customer.GetCustomer({ uid: Number(req.params.uid) });
        return res.status(200).json({
          uid: customer.uid,
          fullname: customer.fullname,
          mid: customer.mid,
          mname: customer.mname,
          score: customer.score
        });
      } catch (err) {
        return handleGrpcError(res, err);
      }
    }
  );

  router.get(
    '/customers/:uid/membership',
    authenticate,
    (req, res, next) => {
      const targetUid = Number(req.params.uid);
      if (req.user.role !== 'admin' && req.user.uid !== targetUid) {
        return res.status(403).json({ error: 'Forbidden', message: 'Cannot view another customer membership' });
      }
      return next();
    },
    async (req, res) => {
      try {
        const info = await grpcClients.customer.GetCustomerScore({ uid: Number(req.params.uid) });
        return res.status(200).json({
          uid: info.uid,
          mid: info.mid,
          mname: info.mname,
          score: info.score
        });
      } catch (err) {
        return handleGrpcError(res, err);
      }
    }
  );

  router.put('/customers/:uid', authenticate, async (req, res) => {
    const targetUid = Number(req.params.uid);
    if (req.user.role !== 'admin' && req.user.uid !== targetUid) {
      return res.status(403).json({ error: 'Forbidden', message: 'Cannot update another customer profile' });
    }
    try {
      const { fullname, mid } = req.body || {};
      const updated = await grpcClients.customer.UpdateCustomer({
        uid: targetUid,
        fullname: fullname !== undefined ? String(fullname) : '',
        mid: mid !== undefined ? Number(mid) : 0
      });
      await redisStore.del(`cache:customers:${targetUid}`);
      return res.status(200).json({
        message: updated.message,
        uid: updated.uid,
        fullname: updated.fullname,
        mid: updated.mid,
        mname: updated.mname,
        score: updated.score
      });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.get(
    '/memberships',
    authenticate,
    createCacheMiddleware(redisStore, () => 'memberships:list', cacheTtlSec),
    async (_req, res) => {
      try {
        const result = await grpcClients.customer.ListMemberships({});
        return res.status(200).json({ items: result.items || [] });
      } catch (err) {
        return handleGrpcError(res, err);
      }
    }
  );

  router.get('/memberships/:mid', authenticate, async (req, res) => {
    try {
      const result = await grpcClients.customer.GetMembership({ mid: Number(req.params.mid) });
      return res.status(200).json(result);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.post('/memberships', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const { mname, score } = req.body || {};
      const created = await grpcClients.customer.CreateMembership({
        mname: mname || '',
        score: score !== undefined ? Number(score) : -1
      });
      await redisStore.delByPrefix('cache:memberships:');
      return res.status(201).json(created);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.put('/memberships/:mid', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const { mname, score } = req.body || {};
      const updated = await grpcClients.customer.UpdateMembership({
        mid: Number(req.params.mid),
        mname: mname || '',
        score: score !== undefined ? Number(score) : -1
      });
      await redisStore.delByPrefix('cache:memberships:');
      await redisStore.delByPrefix('cache:customers:');
      return res.status(200).json(updated);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  // =========================================================================
  // 4. PRODUCT CATALOG (/api/products)
  // =========================================================================
  router.get(
    '/products',
    authenticate,
    createCacheMiddleware(redisStore, () => 'products:list', cacheTtlSec),
    async (_req, res) => {
      try {
        const result = await grpcClients.product.ListProducts({});
        return res.status(200).json({ items: result.items || [] });
      } catch (err) {
        return handleGrpcError(res, err);
      }
    }
  );

  router.get(
    '/products/:pid',
    authenticate,
    createCacheMiddleware(redisStore, (req) => `products:${req.params.pid}`, cacheTtlSec),
    async (req, res) => {
      try {
        const product = await grpcClients.product.GetProduct({ pid: Number(req.params.pid) });
        return res.status(200).json(product);
      } catch (err) {
        return handleGrpcError(res, err);
      }
    }
  );

  router.post('/products', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const { pname, price, quantity } = req.body || {};
      if (pname === undefined || price === undefined || quantity === undefined) {
        return res.status(400).json({ error: 'Bad Request', message: 'pname, price, and quantity are required' });
      }
      const created = await grpcClients.product.CreateProduct({
        pname: String(pname),
        price: Number(price),
        quantity: Number(quantity)
      });
      await redisStore.delByPrefix('cache:products:');
      return res.status(201).json(created);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.put('/products/:pid', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const { pname, price, quantity } = req.body || {};
      const hasPrice = price !== undefined && price !== null;
      const hasQuantity = quantity !== undefined && quantity !== null;
      if (!pname && !hasPrice && !hasQuantity) {
        return res.status(400).json({ error: 'Bad Request', message: 'At least one field (pname, price, quantity) must be provided' });
      }
      const updated = await grpcClients.product.UpdateProduct({
        pid: Number(req.params.pid),
        pname: pname ? String(pname) : '',
        price: hasPrice ? Number(price) : 0,
        quantity: hasQuantity ? Number(quantity) : 0,
        has_price: hasPrice,
        has_quantity: hasQuantity
      });
      await redisStore.delByPrefix('cache:products:');
      return res.status(200).json(updated);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.patch('/products/:pid/inventory', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const { quantity } = req.body || {};
      if (quantity === undefined || quantity === null || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
        return res.status(400).json({ error: 'Bad Request', message: 'Valid non-negative integer quantity is required' });
      }
      const updated = await grpcClients.product.UpdateInventory({
        pid: Number(req.params.pid),
        quantity: Number(quantity)
      });
      await redisStore.delByPrefix('cache:products:');
      return res.status(200).json({
        message: 'Inventory updated successfully',
        pid: updated.pid,
        quantity: updated.quantity,
        product: updated
      });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.delete('/products/:pid', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const deleted = await grpcClients.product.DeleteProduct({ pid: Number(req.params.pid) });
      await redisStore.delByPrefix('cache:products:');
      return res.status(200).json(deleted);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  // =========================================================================
  // 5. ORDER MANAGEMENT (/api/orders)
  // =========================================================================
  router.post('/orders', authenticate, async (req, res) => {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Bad Request', message: 'Order items array is required and cannot be empty' });
      }

      const order = await grpcClients.order.CreateOrder({
        uid: req.user.uid,
        items: items.map((i) => ({ pid: Number(i.pid), qty: Number(i.qty) }))
      });

      // Product stock changed -> invalidate product cache in Redis!
      await redisStore.delByPrefix('cache:products:');

      // Best-effort lookup of shipment if async Kafka consumer has already processed it
      let shipmentInfo = { status: 'PENDING' };
      try {
        const s = await grpcClients.shipment.GetShipmentByOrder({ oid: order.oid });
        if (s && s.shipid) {
          shipmentInfo = { shipid: s.shipid, status: s.status };
        }
      } catch (_ignored) {
        // Asynchronous creation via Kafka may still be in flight
      }

      return res.status(201).json({
        oid: order.oid,
        uid: order.uid,
        discount: order.discount,
        total_amount: order.total_amount,
        items: order.items,
        status: order.status,
        created_at: order.created_at,
        shipment: shipmentInfo
      });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.get('/orders', authenticate, async (req, res) => {
    try {
      const result = await grpcClients.order.ListOrders({
        uid: req.user.uid,
        is_admin: req.user.role === 'admin'
      });
      return res.status(200).json({ items: result.items || [] });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.get('/orders/:oid', authenticate, async (req, res) => {
    try {
      const order = await grpcClients.order.GetOrder({ oid: Number(req.params.oid) });
      if (req.user.role === 'customer' && order.uid !== req.user.uid) {
        return res.status(403).json({ error: 'Forbidden', message: 'You can only view your own orders' });
      }
      return res.status(200).json(order);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  // Admin helper endpoint to publish raw events to Kafka for Postman testing (TC-SHP-02 & TC-SHP-05)
  router.post('/orders/test-kafka-event', authenticate, authorizeRoles('admin'), async (req, res) => {
    try {
      const eventPayload = req.body && req.body.payload !== undefined ? req.body.payload : req.body;
      const key = (eventPayload && eventPayload.data && eventPayload.data.oid) || 'postman-test';
      const result = await grpcClients.order.PublishTestEvent({
        key: String(key),
        raw_json: JSON.stringify(eventPayload || {})
      });
      return res.status(200).json({
        message: 'Event published to Kafka topic order-created',
        published: result.published,
        topic: result.topic,
        payload: eventPayload
      });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  // =========================================================================
  // 6. SHIPMENT (/api/shipments)
  // =========================================================================
  router.get('/shipments', authenticate, authorizeRoles('admin', 'staff'), async (_req, res) => {
    try {
      const result = await grpcClients.shipment.ListShipments({});
      return res.status(200).json({ items: result.items || [] });
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.get('/shipments/order/:oid', authenticate, async (req, res) => {
    try {
      const shipment = await grpcClients.shipment.GetShipmentByOrder({ oid: Number(req.params.oid) });
      if (req.user.role === 'customer' && shipment.uid > 0 && shipment.uid !== req.user.uid) {
        return res.status(403).json({ error: 'Forbidden', message: 'You can only view shipments for your own orders' });
      }
      return res.status(200).json(shipment);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.get('/shipments/:shipid', authenticate, async (req, res) => {
    try {
      const shipment = await grpcClients.shipment.GetShipment({ shipid: Number(req.params.shipid) });
      if (req.user.role === 'customer' && shipment.uid > 0 && shipment.uid !== req.user.uid) {
        return res.status(403).json({ error: 'Forbidden', message: 'You can only view shipments for your own orders' });
      }
      return res.status(200).json(shipment);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  router.patch('/shipments/:shipid/status', authenticate, authorizeRoles('admin', 'staff'), async (req, res) => {
    try {
      const { status } = req.body || {};
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ error: 'Bad Request', message: 'status is required' });
      }
      const updated = await grpcClients.shipment.UpdateShipmentStatus({
        shipid: Number(req.params.shipid),
        status
      });
      return res.status(200).json(updated);
    } catch (err) {
      return handleGrpcError(res, err);
    }
  });

  return router;
}

module.exports = { createApiRouter };
