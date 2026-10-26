class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

class Membership {
  constructor({ mid = null, mname, score = 0 }) {
    this.mid = Number(mid);
    this.mname = mname;
    this.score = Number(score);
  }

  static validate({ mname, score }) {
    if (!mname || typeof mname !== 'string' || mname.trim().length === 0 || mname.trim().length > 50) {
      throw new DomainError('INVALID_ARGUMENT', 'Membership name (mname) is required and must be <= 50 chars');
    }
    if (score === undefined || score === null || Number.isNaN(Number(score)) || Number(score) < 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Membership score must be a non-negative integer');
    }
  }
}

class Customer {
  constructor({ uid, fullname, mid = 1, mname = 'Bronze', score = 0 }) {
    this.uid = Number(uid);
    this.fullname = fullname;
    this.mid = Number(mid);
    this.mname = mname;
    this.score = Number(score);
  }

  static validateCreate({ uid, fullname }) {
    if (!uid || Number(uid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Valid uid is required');
    }
    if (!fullname || typeof fullname !== 'string' || fullname.trim().length === 0 || fullname.trim().length > 100) {
      throw new DomainError('INVALID_ARGUMENT', 'Fullname is required and must be <= 100 characters');
    }
  }
}

module.exports = { DomainError, Membership, Customer };

