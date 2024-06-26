const pg = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const masterClient = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: 'postgres',
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

const client = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

async function createDatabase() {
  await masterClient.connect();

  // Create the database.
  const { rows } = await masterClient.query(`
    SELECT EXISTS (
      SELECT FROM pg_database
      WHERE datname = '${process.env.PG_DATABASE}'
    );
  `);

  if (!rows[0].exists) await masterClient.query(`CREATE DATABASE ${process.env.PG_DATABASE};`);
  await masterClient.end();

  await client.connect();
  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await client.query(`CREATE TYPE privilege AS ENUM ('admin', 'employee');`);

  // Define the database.
  await client.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL CHECK (email ~* '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'),
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      privilege_type privilege NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS activation_codes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code VARCHAR(255) UNIQUE NOT NULL,
      created_by UUID NOT NULL REFERENCES employees(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_by UUID REFERENCES employees(id),
      activated_at TIMESTAMPTZ
    );
  `);

  // Insert the default user.
  await client.query(`
    INSERT INTO employees (email, first_name, last_name, password, privilege_type)
    VALUES ('admin@sky.pos', 'admin', 'one', '${bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10)}', 'admin')
    ON CONFLICT (email) DO NOTHING;
  `);

  // Insert the default activation code.
  await client.query(`
    INSERT INTO activation_codes (code, created_by)
    VALUES ('skypos', (SELECT id FROM employees WHERE email = 'admin@sky.pos'))
    ON CONFLICT (code) DO NOTHING;
  `);

  await client.end();
  console.log('Database created.');
}

createDatabase();
