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
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";
import cors from "cors";

// MCP Server
const mcpServer = new McpServer({
  name: "todo-server",
  version: "1.0.0",
});

// Define MCP Tools

// todo_create
mcpServer.registerTool(
  "todo_create",
  {
    title: "Create Todo",
    description: "Create a new todo item",
    inputSchema: TodoCreateInput,
    outputSchema: TodoCreateOutput,
  },
  async ({ title, description }) => wrap(TodoService.create({ title, description }))
);

// todo_list
mcpServer.registerTool(
  "todo_list",
  {
    title: "List Todos",
    description: "Return all todos",
    inputSchema: z.object({}),
    outputSchema: TodoListOutput,
  },
  async () => wrap(TodoService.list())
);

// todo_update
mcpServer.registerTool(
  "todo_update",
  {
    title: "Update Todo",
    description: "Update an existing todo item",
    inputSchema: TodoUpdateInput,
    outputSchema: TodoUpdateOutput,
  },
  async ({ id, title, description, completed }) => wrap(TodoService.update(id, { title, description, completed }))
);

// todo_delete
mcpServer.registerTool(
  "todo_delete",
  {
    title: "Delete Todo",
    description: "Delete a todo item",
    inputSchema: TodoDeleteInput,
    outputSchema: TodoDeleteOutput,
  },
  async ({ id }) => wrap(TodoService.delete(id))
);

const app = express();

let transports;

app.use(cors());
app.use("/mcp", express.json());

// Streamable HTTP transport handler
const streamableHttpHandler = async (server, req, res) => {
  if (req.method === "POST") {
    // Handle initial connection or regular POST request
    const sessionId = req.headers["mcp-session-id"];

    try {
      // Check if this is an initialization request
      const isInit = isInitializeRequest(req.body);

      // Create a new transport for this session if it doesn't exist or if this is an init request
      if (!sessionId || !transports[sessionId] || isInit) {
        console.log(
          `Creating new transport for ${isInit ? "initialization request" : "request without valid session"}`
        );

        const newSessionId = sessionId || crypto.randomUUID();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sid) => {
            // Store the transport by session ID
            console.log(`Transport initialized with session ID: ${sid}`);
            transports[sid] = transport;
          },
        });

        // Connect the transport to the server
        await server.connect(transport);
        console.log(`Connected transport to server`);

        // Set session ID header in response
        res.setHeader("Mcp-Session-Id", newSessionId);

        // Use the new transport directly for this request - pass the request body
        console.log(`Handling ${isInit ? "initialization" : "regular"} request with new transport`);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // If we have a valid sessionId and transport, use it - pass the request body
      if (sessionId && transports[sessionId]) {
        console.log(`Using existing transport for session ${sessionId}`);
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }

      // If we get here, something went wrong
      console.error(`No valid transport found for session ${sessionId}`);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Invalid session or transport not available",
        },
        id: null,
      });
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: String(error),
        },
        id: null,
      });
    }
  } else if (req.method === "GET") {
    // Handle SSE stream request
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers["last-event-id"];
    if (lastEventId) {
      console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.log(`Establishing new SSE stream for session ${sessionId}`);
    }

    await transports[sessionId].handleRequest(req, res);
  } else if (req.method === "DELETE") {
    // Handle session termination request
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }

    console.log(`Received session termination request for session ${sessionId}`);
    await transports[sessionId].handleRequest(req, res);

    // Clean up after termination
    delete transports[sessionId];
  } else {
    // Handle other HTTP methods
    res.status(405).send("Method not allowed");
  }
};

app.all("/mcp", async (req, res) => {
  await streamableHttpHandler(mcpServer, req, res);
});

const transport = new StreamableHTTPClientTransport(app, "/mcp/stream");
await mcpServer.connect(transport);

app.listen(3000, () => {
  console.log("MCP Server listening on port 3000");
});
