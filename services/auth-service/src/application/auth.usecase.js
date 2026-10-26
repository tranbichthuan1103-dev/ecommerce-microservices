const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, DomainError } = require('../domain/user.entity');

class AuthUseCase {
  constructor(userRepository, { jwtSecret, jwtExpiresIn = 3600 }) {
    this.userRepository = userRepository;
    this.jwtSecret = jwtSecret || 'ecommerce-mvp-super-secret-jwt-key-2026';
    this.jwtExpiresIn = Number(jwtExpiresIn) || 3600;
  }

  async register({ username, password, email, phone, role }) {
    User.validateRegistration({ username, password });

    const cleanUsername = username.trim();
    const cleanEmail = email && email.trim() ? email.trim() : null;
    const cleanPhone = phone && phone.trim() ? phone.trim() : null;

    const existingUser = await this.userRepository.findByUsername(cleanUsername);
    if (existingUser) {
      throw new DomainError('ALREADY_EXISTS', `Username '${cleanUsername}' already exists`);
    }

    if (cleanEmail) {
      const existingEmail = await this.userRepository.findByEmail(cleanEmail);
      if (existingEmail) {
        throw new DomainError('ALREADY_EXISTS', `Email '${cleanEmail}' already exists`);
      }
    }

    const roleName = role && ['admin', 'customer', 'staff'].includes(role.toLowerCase())
      ? role.toLowerCase()
      : 'customer';
    const roleRecord = await this.userRepository.findRoleByName(roleName);
    const roleid = roleRecord ? roleRecord.roleid : 2;

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username: cleanUsername,
      password: hashedPassword,
      roleid,
      rolename: roleName,
      email: cleanEmail,
      phone: cleanPhone
    });

    const created = await this.userRepository.create(newUser);
    return {
      uid: created.uid,
      username: created.username,
      role: created.rolename,
      message: 'User registered successfully'
    };
  }

  async login({ username, password }) {
    User.validateCredentials({ username, password });

    const user = await this.userRepository.findByUsername(username.trim());
    if (!user) {
      throw new DomainError('UNAUTHENTICATED', 'Invalid username or password');
    }

    const matched = await bcrypt.compare(password, user.password);
    if (!matched) {
      throw new DomainError('UNAUTHENTICATED', 'Invalid username or password');
    }

    const payload = {
      sub: user.uid,
      uid: user.uid,
      username: user.username,
      role: user.rolename
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.jwtExpiresIn,
      uid: user.uid,
      username: user.username,
      role: user.rolename
    };
  }

  async verifyToken({ token }) {
    if (!token) {
      return { valid: false, uid: 0, username: '', role: '', error: 'Missing token' };
    }
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      return {
        valid: true,
        uid: Number(decoded.uid || decoded.sub),
        username: decoded.username || '',
        role: decoded.role || 'customer',
        error: ''
      };
    } catch (err) {
      return {
        valid: false,
        uid: 0,
        username: '',
        role: '',
        error: err.message
      };
    }
  }
}

module.exports = { AuthUseCase };

