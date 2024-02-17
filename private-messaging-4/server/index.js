const httpServer = require("http").createServer();
const Redis = require("ioredis");
const redisClient = new Redis({
  PORT: 6378,
});
const cluster = require('cluster');

const io = require("socket.io")(httpServer, {
  cors: {
    // Client is running on http://localhost:8080
    // Server is running on http://localhost:3000
    // This is considered as cross-origin and blocked by default by CORS policy
    origin: "http://localhost:8080",
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

const { setupWorker } = require("@socket.io/sticky");
const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

const { RedisSessionStore } = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const { RedisMessageStore } = require("./messageStore");
const messageStore = new RedisMessageStore(redisClient);

// register a middleware which checks the username and allows the connection
io.use(async (socket, next) => {
  console.log(`[WORKER ${cluster.worker.id}] is processing auth ${JSON.stringify(socket.handshake.auth)}`)
  
  const sessionID = socket.handshake.auth.sessionID;
  if (sessionID) {
    const session = await sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      console.log(`========\nUser ${session.username} reconnected with sessionID: ${sessionID}`)
      return next();
    }
  }
  
  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.sessionID = randomId();
  socket.userID = randomId();
  socket.username = username;
  console.log("========\nAllow connection from new username: ", username)
  next();
});

io.on("connection", async (socket) => {
  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
  });

  // emit session details
  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
  });

  // Socket instance joins the room identified by its userID 
  // Each user is in a separate room identified by their userID
  // If NOT specified, then `socket.join(socket.id)` is called for you
  socket.join(socket.userID);
  
  // fetch existing users
  const users = [];
  const [messages, sessions] = await Promise.all([
    messageStore.findMessagesForUser(socket.userID),
    sessionStore.findAllSessions(),
  ]);

  const messagesPerUser = new Map();
  messages.forEach((message) => {
    const { from, to } = message;
    const otherUser = socket.userID === from ? to : from;
    if (messagesPerUser.has(otherUser)) {
      messagesPerUser.get(otherUser).push(message);
    } else {
      messagesPerUser.set(otherUser, [message]);
    }
  });

  sessions.forEach((session) => {
    const messages = messagesPerUser.get(session.userID) || [];
    
    users.push({
      userID: session.userID,
      username: session.username,
      connected: session.connected,
      msgs: messages,
    });
  });

  // notify the new user about the existing users
  socket.emit("users", users);
  console.log(`Emit "users" event to new user with username: ${socket.username}`)

  // notify existing users about the new user
  socket.broadcast.emit("user connected", {
    userID: socket.userID,
    username: socket.username,
    connected: true,
    msgs: [],
  });
  console.log(`Emit "user connected" event to all existing users`)

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on("private message", ({ content, to }) => {
    // Given each user is in a separate room identified by their userID
    // We can use to as the room name to emit to a specific user
    
    const message = {
      content,
      from: socket.userID,
      to,
    };
    
    socket.to(to).to(socket.userID).emit("private message", message);
    messageStore.saveMessage(message);
    console.log(`>>> On "private message" event, emit to recipient with ID: ${to}`)
  });

  // notify users upon disconnection
  socket.on("disconnect", async () => {
    // fetches all the sockets that are currently joined to the room identified by socket.userID
    const matchingSockets = await io.in(socket.userID).allSockets();
    const isDisconnected = matchingSockets.size === 0;

    if (isDisconnected) {
      // notify other users passing the disconnected user's userID
      socket.broadcast.emit("user disconnected", socket.userID);
      // update the connection status of the disconnected user's session
      sessionStore.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
        connected: false,
      });
      console.log(`[X] On user's disconnect, Emit "user disconnected" event to all existing users`)
    }
  });
});

/*
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () =>
  console.log(`server listening at http://localhost:${PORT}`)
);
*/
setupWorker(io)
