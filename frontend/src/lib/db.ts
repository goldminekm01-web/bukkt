import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://users_owner:npg_HBhg6d2VUoEf@ep-dawn-dream-b4x3pa9w-pooler.c-6.us-east-2.aws.neon.tech/users?channel_binding=require&sslmode=require";

export const sql = neon(DATABASE_URL);
