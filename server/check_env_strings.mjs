import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log("=== Active Environment Connection Strings ===");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET (length: " + process.env.DATABASE_URL.length + ")" : "NOT SET");
console.log("POSTGRES_URL:", process.env.POSTGRES_URL ? "SET (length: " + process.env.POSTGRES_URL.length + ")" : "NOT SET");
console.log("POSTGRES_PRISMA_URL:", process.env.POSTGRES_PRISMA_URL ? "SET (length: " + process.env.POSTGRES_PRISMA_URL.length + ")" : "NOT SET");
console.log("SUPABASE_DATABASE_URL:", process.env.SUPABASE_DATABASE_URL ? "SET (length: " + process.env.SUPABASE_DATABASE_URL.length + ")" : "NOT SET");

if (process.env.DATABASE_URL) {
  console.log("DATABASE_URL preview:", process.env.DATABASE_URL.substring(0, 50) + "...");
}
if (process.env.SUPABASE_DATABASE_URL) {
  console.log("SUPABASE_DATABASE_URL preview:", process.env.SUPABASE_DATABASE_URL.substring(0, 50) + "...");
}
