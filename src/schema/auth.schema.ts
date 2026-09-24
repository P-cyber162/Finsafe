import { z } from "zod";

export const registerSchema = z
  .object({
    email: z.email("Invalid email address!"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z
      .string()
      .min(8, "Password must be at least 8 characters"),
  })
  .refine(
    (data) => {
      return data.password === data.confirmPassword;
    },
    {
      message: "Passwords do not match!",
      path: ["confirmPassword"],
    },
  );

export const loginSchema = z.object({
  email: z.email("Invalid email address!"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
