import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createUIResource } from "@mcp-ui/server";
import { TodoService } from "./services/todo.service.js";
import {
  TodoCreateInput,
  TodoUpdateInput,
  TodoDeleteInput,
  TodoCreateOutput,
  TodoUpdateOutput,
  TodoDeleteOutput,
} from "./validations/todo.validation.js";

const server = new McpServer({ name: "todo-server", version: "1.0.0" }, { capabilities: { tools: {} } });

// Helper wrap UI
const wrapUI = (html, uri) =>
  createUIResource({
    uri: "ui://" + uri,
    content: { type: "rawHtml", htmlString: html },
    encoding: "text",
  });

// HTML UI generator (với create / toggle / delete / view)
const generateHTML = () => {
  const todos = TodoService.list() || [];

  const escape = (str) =>
    String(str || "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return `
  <!-- Tailwind CDN -->
  <script src="https://cdn.tailwindcss.com"></script>

  <div class="min-h-screen bg-gray-100 p-6 flex flex-col items-center">
    <div class="w-full max-w-3xl flex flex-col gap-6">

      <h1 class="text-3xl font-bold text-gray-800 text-center">Todo List (${todos.length})</h1>

      ${todos
        .map((t) => {
          const title = escape(t.title);
          const desc = escape(t.description);
          const bgClass = t.completed ? "bg-green-100" : "bg-white";
          const textClass = t.completed ? "line-through text-gray-500" : "text-gray-800";
          return `
        <div class="todo-item ${bgClass} rounded-xl shadow-md p-5 flex flex-col gap-3 transition-all hover:shadow-lg">
          <div class="flex justify-between items-start flex-wrap gap-2">
            <div class="flex flex-col gap-1">
              <span class="todo-title text-lg font-semibold ${textClass}">${title}</span>
              <p class="desc text-gray-600 text-sm">${desc || "(No description)"}</p>
            </div>
            <div class="actions flex gap-2 flex-wrap">
              <button class="flex items-center gap-1 px-3 py-1 rounded-lg bg-green-500 text-white hover:bg-green-600 transition"
                onclick="parent.postMessage({type:'mcp-ui-action',action:'todo_update',id:${t.id},completed:${!t.completed}}, '*')">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                ${t.completed ? "Undo" : "Done"}
              </button>
              <button class="flex items-center gap-1 px-3 py-1 rounded-lg bg-yellow-400 text-white hover:bg-yellow-500 transition"
                onclick="toggleEdit(${t.id})">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5"/><path stroke-width="2" d="M18.5 2.5l3 3-9 9H9.5v-3.5z"/></svg>
                Edit
              </button>
              <button class="flex items-center gap-1 px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
                onclick="parent.postMessage({type:'mcp-ui-action',action:'todo_delete',id:${t.id}}, '*')">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M3 6h18"/><path stroke-width="2" d="M8 6V4h8v2"/><path stroke-width="2" d="M19 6l-1 14H6L5 6"/></svg>
                Delete
              </button>
            </div>
          </div>

          <div id="edit-${t.id}" class="edit-box hidden flex-col gap-2 mt-2">
            <input id="edit-title-${t.id}" class="w-full border rounded-lg p-2" value="${title}" placeholder="Title"/>
            <textarea id="edit-desc-${t.id}" class="w-full border rounded-lg p-2 mt-2" placeholder="Description">${desc}</textarea>
            <button class="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition"
              onclick="submitEdit(${t.id})">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              Save
            </button>
          </div>
        </div>`;
        })
        .join("")}

      <!-- Create New -->
      <div class="form-section bg-white rounded-xl shadow-md p-5 flex flex-col gap-3">
        <h3 class="text-xl font-semibold text-gray-800">Add New Todo</h3>
        <input id="new-title" class="border rounded-lg p-2 w-full" placeholder="Title"/>
        <textarea id="new-desc" class="border rounded-lg p-2 w-full" placeholder="Description"></textarea>
        <button class="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition justify-center"
          onclick="createTodo()">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Add Todo
        </button>
      </div>
    </div>
  </div>

  <script>
    function createTodo() {
      parent.postMessage({
        type: "mcp-ui-action",
        action: "todo_create",
        title: document.getElementById("new-title").value,
        description: document.getElementById("new-desc").value
      }, "*");
    }

    function toggleEdit(id) {
      const box = document.getElementById("edit-" + id);
      box.classList.toggle("hidden");
    }

    function submitEdit(id) {
      parent.postMessage({
        type: "mcp-ui-action",
        action: "todo_update",
        id,
        title: document.getElementById("edit-title-" + id).value,
        description: document.getElementById("edit-desc-" + id).value
      }, "*");
    }
  </script>
  `;
};

// ================= MCP TOOLS =================

// 1️⃣ List Todos
// This tool returns the full todo list. It includes both plain text and an HTML UI resource.
server.registerTool("todo_list", { title: "List Todos", description: "Return todos + HTML UI" }, async () => ({
  content: [{ type: "text", text: "Todo list" }, wrapUI(generateHTML(), "todo_list")],
}));

// 2️⃣ Create Todo
// This tool allows creating a new todo item. The title is required, description is optional.
// Returns the newly created todo as structuredContent.
server.registerTool(
  "todo_create",
  { title: "Create Todo", description: "Create a todo", inputSchema: TodoCreateInput, outputSchema: TodoCreateOutput },
  async ({ title, description = "" }) => {
    if (!title) throw new Error("Missing title");
    return {
      structuredContent: TodoService.create({ title, description }),
    };
  },
);

// 3️⃣ Update Todo
// This tool updates an existing todo item. It can update title, description, and completed status.
// Returns the updated todo as structuredContent.
server.registerTool(
  "todo_update",
  { title: "Update Todo", description: "Update todo", inputSchema: TodoUpdateInput, outputSchema: TodoUpdateOutput },
  async ({ id, title, description, completed }) => {
    if (!id) throw new Error("Missing id");
    return {
      structuredContent: TodoService.update(id, { title, description, completed }),
    };
  },
);

// 4️⃣ Delete Todo
// This tool deletes a todo by its id.
// Returns the deleted todo as structuredContent.
server.registerTool(
  "todo_delete",
  { title: "Delete Todo", description: "Delete todo", inputSchema: TodoDeleteInput, outputSchema: TodoDeleteOutput },
  async ({ id }) => {
    if (!id) throw new Error("Missing id");
    return {
      structuredContent: TodoService.delete(id),
    };
  },
);

// ================= EXPRESS SERVER =================
// Basic Express setup to expose MCP server over HTTP.
const app = express();
app.use(cors());
app.use(express.json());

// MCP endpoint
// All requests to /mcp are handled via StreamableHTTPServerTransport.
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Start Express server
app.listen(3000, () => console.log("🚀 MCP Server running at http://localhost:3000/mcp"));
