const httpServer = require("http").createServer();
const io = require("socket.io")(httpServer, {
  cors: {
    // Client is running on http://localhost:8080
    // Server is running on http://localhost:3000
    // This is considered as cross-origin and blocked by default by CORS policy
    origin: "http://localhost:8080",
  },
});

// register a middleware which checks the username and allows the connection
io.use((socket, next) => {
  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.username = username;
  console.log("========\n Allow connection from username: ", username)
  next();
});

io.on("connection", (socket) => {
  // Socket instance automatically joins the room identified by its id 
  // (socket.join(socket.id) is called for you).
  // Each user is in a separate room identified by their id
  
  // fetch existing users
  const users = [];
  
  // Loop thorugh Map of all currently connected Socket instances, indexed by ID
  for (let [id, socket] of io.of("/").sockets) {
    users.push({
      userID: id,
      username: socket.username,
    });
  }

  socket.emit("users", users);
  console.log(`Emit "users" event to new user with username: ${socket.username}`)

  // notify existing users
  socket.broadcast.emit("user connected", {
    userID: socket.id,
    username: socket.username,
  });
  console.log(`Emit "user connected" event to all existing users`)

  // forward the private message to the right recipient
  socket.on("private message", ({ content, to }) => {
    // Given each user is in a separate room identified by their id
    // We can use to as the room name to emit to a specific user
    
    socket.to(to).emit("private message", {
      content,
      from: socket.id,
    });
    console.log(`>>> On "private message" event, emit to recipient with ID: ${to}`)
  });

  // notify users upon disconnection
  socket.on("disconnect", () => {
    socket.broadcast.emit("user disconnected", socket.id);
    console.log(`[X] On user's disconnect, Emit "user disconnected" event to all existing users`)
  });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () =>
  console.log(`server listening at http://localhost:${PORT}`)
);
