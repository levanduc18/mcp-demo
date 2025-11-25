import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TodoService } from "./services/todo.service.js";
import {
  TodoCreateInput,
  TodoCreateOutput,
  TodoListOutput,
  TodoUpdateInput,
  TodoUpdateOutput,
  TodoDeleteInput,
  TodoDeleteOutput,
} from "./validations/todo.validation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";

// MCP Server
const server = new McpServer(
  {
    name: "todo-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {},
      tools: {},
    },
  }
);

// Define MCP Tools

// todo_create
server.registerTool(
  "todo_create",
  {
    title: "Create Todo",
    description: "Create a new todo item",
    inputSchema: TodoCreateInput,
    outputSchema: TodoCreateOutput,
  },
  async ({ title, description }) => ({
    structuredContent: TodoService.create({ title, description }),
  })
);

// todo_list
server.registerTool(
  "todo_list",
  {
    title: "List Todos",
    description: "Return all todos",
    inputSchema: z.object({}),
    outputSchema: TodoListOutput,
  },
  async () => ({
    structuredContent: {
      todos: TodoService.list(),
    },
  })
);

// todo_update
server.registerTool(
  "todo_update",
  {
    title: "Update Todo",
    description: "Update an existing todo item",
    inputSchema: TodoUpdateInput,
    outputSchema: TodoUpdateOutput,
  },
  async ({ id, title, description, completed }) => ({
    structuredContent: TodoService.update(id, { title, description, completed }),
  })
);

// todo_delete
server.registerTool(
  "todo_delete",
  {
    title: "Delete Todo",
    description: "Delete a todo item",
    inputSchema: TodoDeleteInput,
    outputSchema: TodoDeleteOutput,
  },
  async ({ id }) => ({
    structuredContent: TodoService.delete(id),
  })
);

const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  // Create a new transport for each request to prevent request ID collisions
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app
  .listen(3000, () => {
    console.log(`Demo MCP Server running on http://localhost:3000/mcp`);
  })
  .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
