const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { User } = require('../domain/user.entity');

const DEFAULT_ROLES = [
  { roleid: 1, rolename: 'admin' },
  { roleid: 2, rolename: 'customer' },
  { roleid: 3, rolename: 'staff' }
];

async function buildSeedUsers() {
  return [
    {
      uid: 1,
      username: 'admin',
      password: await bcrypt.hash('Admin@123', 10),
      roleid: 1,
      rolename: 'admin',
      email: 'admin@ecommerce.local',
      phone: '0900000001'
    },
    {
      uid: 2,
      username: 'staff',
      password: await bcrypt.hash('Staff@123', 10),
      roleid: 3,
      rolename: 'staff',
      email: 'staff@ecommerce.local',
      phone: '0900000002'
    },
    {
      uid: 3,
      username: 'alice',
      password: await bcrypt.hash('Pass@123', 10),
      roleid: 2,
      rolename: 'customer',
      email: 'alice@ecommerce.local',
      phone: '0900000003'
    },
    {
      uid: 4,
      username: 'bob',
      password: await bcrypt.hash('Pass@123', 10),
      roleid: 2,
      rolename: 'customer',
      email: 'bob@ecommerce.local',
      phone: '0900000004'
    }
  ];
}

class PostgresUserRepository {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        roleid INT PRIMARY KEY,
        rolename VARCHAR(50) NOT NULL UNIQUE
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        uid SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        roleid INT NOT NULL REFERENCES roles(roleid)
      );
    `);

    for (const r of DEFAULT_ROLES) {
      await this.pool.query(
        `INSERT INTO roles (roleid, rolename) VALUES ($1, $2) ON CONFLICT (roleid) DO NOTHING`,
        [r.roleid, r.rolename]
      );
    }

    const seedUsers = await buildSeedUsers();
    for (const u of seedUsers) {
      await this.pool.query(
        `INSERT INTO users (uid, username, password, email, phone, roleid)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (uid) DO NOTHING`,
        [u.uid, u.username, u.password, u.email, u.phone, u.roleid]
      );
    }

    await this.pool.query(`
      SELECT setval(pg_get_serial_sequence('users', 'uid'), GREATEST((SELECT COALESCE(MAX(uid), 1) FROM users), 4));
    `);
  }

  async findRoleByName(rolename) {
    const res = await this.pool.query(`SELECT roleid, rolename FROM roles WHERE rolename = $1`, [rolename]);
    return res.rows[0] || null;
  }

  async findByUsername(username) {
    const res = await this.pool.query(
      `SELECT u.uid, u.username, u.password, u.email, u.phone, u.roleid, r.rolename
       FROM users u
       JOIN roles r ON u.roleid = r.roleid
       WHERE u.username = $1`,
      [username]
    );
    return res.rows[0] ? new User(res.rows[0]) : null;
  }

  async findByEmail(email) {
    const res = await this.pool.query(
      `SELECT u.uid, u.username, u.password, u.email, u.phone, u.roleid, r.rolename
       FROM users u
       JOIN roles r ON u.roleid = r.roleid
       WHERE u.email = $1`,
      [email]
    );
    return res.rows[0] ? new User(res.rows[0]) : null;
  }

  async create(user) {
    const res = await this.pool.query(
      `INSERT INTO users (username, password, email, phone, roleid)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING uid, username, password, email, phone, roleid`,
      [user.username, user.password, user.email, user.phone, user.roleid]
    );
    const row = res.rows[0];
    return new User({ ...row, rolename: user.rolename });
  }

  async checkHealth() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async close() {
    await this.pool.end();
  }
}

class InMemoryUserRepository {
  constructor() {
    this.roles = [...DEFAULT_ROLES];
    this.users = [];
    this.nextUid = 5;
  }

  async init() {
    const seedUsers = await buildSeedUsers();
    this.users = seedUsers.map((u) => new User(u));
    this.nextUid = 5;
  }

  async findRoleByName(rolename) {
    return this.roles.find((r) => r.rolename === rolename) || null;
  }

  async findByUsername(username) {
    return this.users.find((u) => u.username === username) || null;
  }

  async findByEmail(email) {
    return this.users.find((u) => u.email && u.email === email) || null;
  }

  async create(user) {
    const created = new User({
      ...user,
      uid: this.nextUid++
    });
    this.users.push(created);
    return created;
  }

  async checkHealth() {
    return true;
  }

  async close() {}
}

module.exports = { PostgresUserRepository, InMemoryUserRepository };

