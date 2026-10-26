class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

class User {
  constructor({ uid = null, username, password, roleid = 2, rolename = 'customer', email = null, phone = null }) {
    this.uid = uid;
    this.username = username;
    this.password = password;
    this.roleid = roleid;
    this.rolename = rolename;
    this.email = email || null;
    this.phone = phone || null;
  }

  static validateRegistration({ username, password }) {
    if (!username || typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 50) {
      throw new DomainError('INVALID_ARGUMENT', 'Username is required and must be between 2 and 50 characters');
    }
    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Password is required and cannot be empty');
    }
  }

  static validateCredentials({ username, password }) {
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Username is required');
    }
    if (!password || typeof password !== 'string' || password.trim().length === 0) {
      throw new DomainError('INVALID_ARGUMENT', 'Password is required');
    }
  }
}

module.exports = { User, DomainError };

