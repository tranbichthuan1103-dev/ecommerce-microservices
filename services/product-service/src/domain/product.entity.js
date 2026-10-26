class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

class Product {
  constructor({ pid, pname, price, quantity }) {
    this.pid = Number(pid);
    this.pname = pname;
    this.price = Number(price);
    this.quantity = Number(quantity);
  }

  static validateCreate({ pname, price, quantity }) {
    if (!pname || typeof pname !== 'string' || pname.trim().length === 0 || pname.trim().length > 100) {
      throw new DomainError('INVALID_ARGUMENT', 'Product name (pname) is required and must be <= 100 characters');
    }
    if (price === undefined || price === null || Number.isNaN(Number(price)) || Number(price) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Product price must be greater than 0');
    }
    if (quantity === undefined || quantity === null || Number.isNaN(Number(quantity)) || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Product quantity must be a non-negative integer');
    }
  }
}

module.exports = { DomainError, Product };

