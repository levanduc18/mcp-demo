# MCP Todo Server

## Installation

```bash
cd server
yarn install
```

## Running the Server

```bash
yarn start
```

Server will run on `http://localhost:3000`

## API Endpoints

- `POST /api/todos` - Create a new todo
- `GET /api/todos` - List all todos
- `PUT /api/todos/:id` - Update a todo
- `DELETE /api/todos/:id` - Delete a todo

## MCP Tools

The server exposes four MCP tools:

- `todo_create` - Create a new todo
- `todo_list` - List all todos
- `todo_update` - Update a todo
- `todo_delete` - Delete a todo
