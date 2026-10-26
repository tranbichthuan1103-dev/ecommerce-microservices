const { DomainError, Membership, Customer } = require('../domain/customer.entity');

class CustomerUseCase {
  constructor(customerRepository) {
    this.customerRepository = customerRepository;
  }

  async createCustomer({ uid, fullname, mid }) {
    const targetMid = mid && Number(mid) > 0 ? Number(mid) : 1;
    const cleanName = fullname && fullname.trim() ? fullname.trim() : `Customer #${uid}`;
    Customer.validateCreate({ uid, fullname: cleanName });

    const existing = await this.customerRepository.findByUid(Number(uid));
    if (existing) {
      return existing;
    }

    const membership = await this.customerRepository.findMembershipById(targetMid);
    if (!membership) {
      throw new DomainError('NOT_FOUND', `Membership mid=${targetMid} not found`);
    }

    return this.customerRepository.createCustomer({
      uid: Number(uid),
      fullname: cleanName,
      mid: targetMid
    });
  }

  async getCustomer({ uid }) {
    if (!uid || Number(uid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid customer uid');
    }
    const customer = await this.customerRepository.findByUid(Number(uid));
    if (!customer) {
      throw new DomainError('NOT_FOUND', `Customer uid=${uid} not found`);
    }
    return customer;
  }

  async updateCustomer({ uid, fullname, mid }) {
    if (!uid || Number(uid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid customer uid');
    }

    const existing = await this.customerRepository.findByUid(Number(uid));
    if (!existing) {
      throw new DomainError('NOT_FOUND', `Customer uid=${uid} not found`);
    }

    const hasFullname = typeof fullname === 'string' && fullname.trim().length > 0;
    const hasMid = mid !== undefined && mid !== null && Number(mid) > 0;

    if (!hasFullname && !hasMid) {
      throw new DomainError('INVALID_ARGUMENT', 'At least fullname or valid mid must be provided');
    }

    const nextFullname = hasFullname ? fullname.trim() : existing.fullname;
    if (nextFullname.length > 100) {
      throw new DomainError('INVALID_ARGUMENT', 'Fullname must not exceed 100 characters');
    }

    const nextMid = hasMid ? Number(mid) : existing.mid;
    if (hasMid) {
      const membership = await this.customerRepository.findMembershipById(nextMid);
      if (!membership) {
        throw new DomainError('INVALID_ARGUMENT', `Membership mid=${nextMid} does not exist`);
      }
    }

    const updated = await this.customerRepository.updateCustomer({
      uid: Number(uid),
      fullname: nextFullname,
      mid: nextMid
    });

    return {
      message: 'Customer updated successfully',
      uid: updated.uid,
      fullname: updated.fullname,
      mid: updated.mid,
      mname: updated.mname,
      score: updated.score
    };
  }

  async getCustomerScore({ uid }) {
    const customer = await this.getCustomer({ uid });
    return {
      uid: customer.uid,
      mid: customer.mid,
      mname: customer.mname,
      score: customer.score
    };
  }

  async listMemberships() {
    const items = await this.customerRepository.listMemberships();
    return { items };
  }

  async getMembership({ mid }) {
    if (!mid || Number(mid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid membership mid');
    }
    const membership = await this.customerRepository.findMembershipById(Number(mid));
    if (!membership) {
      throw new DomainError('NOT_FOUND', `Membership mid=${mid} not found`);
    }
    return membership;
  }

  async createMembership({ mname, score }) {
    Membership.validate({ mname, score });
    const existing = await this.customerRepository.findMembershipByName(mname.trim());
    if (existing) {
      throw new DomainError('ALREADY_EXISTS', `Membership '${mname.trim()}' already exists`);
    }
    return this.customerRepository.createMembership({
      mname: mname.trim(),
      score: Number(score)
    });
  }

  async updateMembership({ mid, mname, score }) {
    if (!mid || Number(mid) <= 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Invalid membership mid');
    }
    const existing = await this.customerRepository.findMembershipById(Number(mid));
    if (!existing) {
      throw new DomainError('NOT_FOUND', `Membership mid=${mid} not found`);
    }
    const nextName = mname && mname.trim() ? mname.trim() : existing.mname;
    const nextScore = score !== undefined && score !== null ? Number(score) : existing.score;
    Membership.validate({ mname: nextName, score: nextScore });

    return this.customerRepository.updateMembership({
      mid: Number(mid),
      mname: nextName,
      score: nextScore
    });
  }
}

module.exports = { CustomerUseCase };

