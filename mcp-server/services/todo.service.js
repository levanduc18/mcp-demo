// In-memory storage, just for demo.
// Can be replaced with a database.
let todos = [];
let nextId = 1;

// Todo service
export const TodoService = {
  /**
   * Create todo
   * @param {string} param0.title - todo title
   * @param {string} param0.description - todo description
   * @returns
   */
  create({ title, description }) {
    const todo = {
      id: nextId++,
      title,
      description: description || "",
      completed: false,
      createdAt: new Date().toISOString(),
    };
    todos.push(todo);
    return todo;
  },

  /**
   * List todos
   */
  list() {
    return todos;
  },

  /**
   * Update todo
   * @param {number} id - id
   * @param {*} data - todo data
   * @returns
   */
  update(id, data) {
    const index = todos.findIndex((t) => t.id === id);
    if (index === -1) throw new Error("Todo not found");

    // Only update defined fields
    for (const key of Object.keys(data)) {
      if (data[key] !== undefined) {
        todos[index][key] = data[key];
      }
    }
    return todos[index];
  },

  /**
   * Delete todo
   * @param {number} id - id
   */
  delete(id) {
    const initial = todos.length;
    todos = todos.filter((t) => t.id !== id);
    if (todos.length === initial) throw new Error("Todo not found");
    return { success: true, id };
  },
};
