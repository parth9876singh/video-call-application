import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string()
    .min(2, { message: 'Name must be at least 2 characters long' })
    .max(50, { message: 'Name cannot exceed 50 characters' })
    .trim(),
  email: z.string()
    .email({ message: 'Please enter a valid email address' })
    .trim()
    .toLowerCase(),
  password: z.string()
    .min(6, { message: 'Password must be at least 6 characters long' })
    .max(100, { message: 'Password cannot exceed 100 characters' }),
  bio: z.string().max(160).optional(),
  avatar: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string()
    .email({ message: 'Please enter a valid email address' })
    .trim()
    .toLowerCase(),
  password: z.string().min(1, { message: 'Password is required' }),
});

export const updateUserSchema = z.object({
  name: z.string()
    .min(2, { message: 'Name must be at least 2 characters long' })
    .max(50, { message: 'Name cannot exceed 50 characters' })
    .trim()
    .optional(),
  bio: z.string()
    .max(160, { message: 'Bio cannot exceed 160 characters' })
    .trim()
    .optional(),
  avatar: z.string().trim().optional(),
});
