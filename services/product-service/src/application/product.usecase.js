const { DomainError, Product } = require('../domain/product.entity');

class ProductUseCase {
  constructor(productRepository) {
    this.productRepository = productRepository;
  }

  async listProducts() {
    const items = await this.productRepository.findAll();
    return { items };
  }

  async getProduct({ pid }) {
    if (!pid || Number(pid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid product pid');
    }
    const product = await this.productRepository.findByPid(Number(pid));
    if (!product) {
      throw new DomainError('NOT_FOUND', `Product pid=${pid} not found`);
    }
    return product;
  }

  async createProduct({ pname, price, quantity }) {
    Product.validateCreate({ pname, price, quantity });
    return this.productRepository.create({
      pname: pname.trim(),
      price: Number(Number(price).toFixed(2)),
      quantity: Number(quantity)
    });
  }

  async updateProduct({ pid, pname, price, quantity, has_price, has_quantity }) {
    const existing = await this.getProduct({ pid });

    const nextName = pname && pname.trim().length > 0 ? pname.trim() : existing.pname;
    const nextPrice = has_price ? Number(price) : existing.price;
    const nextQty = has_quantity ? Number(quantity) : existing.quantity;

    Product.validateCreate({ pname: nextName, price: nextPrice, quantity: nextQty });

    const updated = await this.productRepository.update(Number(pid), {
      pname: nextName,
      price: Number(nextPrice.toFixed(2)),
      quantity: nextQty
    });

    return {
      message: 'Product updated successfully',
      pid: updated.pid,
      product: updated
    };
  }

  async updateInventory({ pid, quantity }) {
    if (!pid || Number(pid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid product pid');
    }
    if (quantity === undefined || quantity === null || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Inventory quantity must be a non-negative integer');
    }
    const existing = await this.productRepository.findByPid(Number(pid));
    if (!existing) {
      throw new DomainError('NOT_FOUND', `Product pid=${pid} not found`);
    }
    return this.productRepository.update(Number(pid), {
      pname: existing.pname,
      price: existing.price,
      quantity: Number(quantity)
    });
  }

  async deleteProduct({ pid }) {
    await this.getProduct({ pid });
    await this.productRepository.delete(Number(pid));
    return {
      message: 'Product deleted successfully',
      pid: Number(pid)
    };
  }

  async reserveInventory({ items }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Order items cannot be empty');
    }

    // Consolidate duplicate pids in the same request
    const consolidatedMap = new Map();
    for (const item of items) {
      const pid = Number(item.pid);
      const qty = Number(item.qty);
      if (!pid || pid <= 0 || !qty || !Number.isInteger(qty) || qty <= 0) {
        throw new DomainError('INVALID_ARGUMENT', 'Each item must have valid pid > 0 and integer qty > 0');
      }
      consolidatedMap.set(pid, (consolidatedMap.get(pid) || 0) + qty);
    }

    const reserved = [];
    try {
      for (const [pid, qty] of consolidatedMap.entries()) {
        const product = await this.productRepository.findByPid(pid);
        if (!product) {
          throw new DomainError('NOT_FOUND', `Product pid=${pid} not found`);
        }
        const deducted = await this.productRepository.atomicDecrementStock(pid, qty);
        if (!deducted) {
          throw new DomainError(
            'INSUFFICIENT_STOCK',
            `Insufficient stock for product pid=${pid} (${product.pname}): requested ${qty}, available ${product.quantity}`
          );
        }
        reserved.push({
          pid: deducted.pid,
          pname: deducted.pname,
          qty,
          unit_price: deducted.price,
          remaining_quantity: deducted.quantity
        });
      }
      return { success: true, items: reserved };
    } catch (err) {
      // Rollback any previously deducted items in this batch
      for (const r of reserved) {
        await this.productRepository.atomicIncrementStock(r.pid, r.qty);
      }
      throw err;
    }
  }

  async releaseInventory({ items }) {
    if (!Array.isArray(items)) return { success: true };
    for (const item of items) {
      const pid = Number(item.pid);
      const qty = Number(item.qty);
      if (pid > 0 && qty > 0) {
        await this.productRepository.atomicIncrementStock(pid, qty);
      }
    }
    return { success: true };
  }
}

module.exports = { ProductUseCase };

