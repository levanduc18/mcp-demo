// schemas/todoSchemas.js
import { z } from "zod";

// Todo schemas

export const TodoCreateInput = z.object({
  title: z.string(),
  description: z.string().optional(),
});

export const TodoCreateOutput = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean(),
  createdAt: z.string(),
});

export const TodoListOutput = z.object({
  todos: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().optional(),
      completed: z.boolean(),
      createdAt: z.string(),
    })
  ),
});

export const TodoUpdateInput = z.object({
  id: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
});

export const TodoUpdateOutput = TodoCreateOutput; // same shape

export const TodoDeleteInput = z.object({
  id: z.number(),
});

export const TodoDeleteOutput = z.object({
  success: z.boolean(),
  id: z.number(),
});
