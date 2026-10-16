// Creates the first admin account. Run it once with: npm run admin:create
// It reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD from server/.env.
// Delete those four lines from .env afterwards.
import { parseEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { createStaffSchema } from '../schemas/admin.js';
import { createUser } from '../services/userService.js';
import { USER_STATUS } from '../constants/roles.js';

const env = parseEnv(process.env);

const input = createStaffSchema.safeParse({
  name: process.env.ADMIN_NAME,
  email: process.env.ADMIN_EMAIL,
  phone: process.env.ADMIN_PHONE,
  password: process.env.ADMIN_PASSWORD,
  role: 'admin',
});

if (!input.success) {
  console.error('Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD in server/.env:');
  for (const issue of input.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

await connectDb(env.MONGODB_URI, createLogger({ ...env, LOG_LEVEL: 'silent' }));
try {
  const user = await createUser({ ...input.data, status: USER_STATUS.ACTIVE });
  console.log(`Admin created: ${user.email}`);
} catch (err) {
  if (err.code === 'email_taken') {
    console.log('An account with that email already exists. Nothing changed.');
  } else {
    console.error(err);
    process.exitCode = 1;
  }
} finally {
  await disconnectDb();
}
