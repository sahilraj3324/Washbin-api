import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { AdminService } from './admin.service';
import { AdminRole } from './admin.schema';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const adminService = app.get(AdminService);

  const existing = await adminService.count();
  if (existing > 0) {
    console.log(`Already ${existing} admin(s) in the database. Skipping seed.`);
    await app.close();
    return;
  }

  const email = process.env.ADMIN_EMAIL ?? 'admin@gmail.com';
  const password = process.env.ADMIN_PASSWORD ?? '12345678';
  const name = process.env.ADMIN_NAME ?? 'Super Admin';

  const passwordHash = await bcrypt.hash(password, 10);

  await adminService.create({
    email,
    passwordHash,
    name,
    role: AdminRole.SuperAdmin,
  });

  console.log(`Seed admin created: ${email}`);
  console.log('Change the password after first login!');
  await app.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
