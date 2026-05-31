const { Server } = require("socket.io");
const socketAuthMiddleware = require("./auth.socket");
const chatSocket = require("./chat.socket");
const { setSocketIo } = require("./ioRegistry");

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"]
  });

  io.use(socketAuthMiddleware);
  chatSocket(io);
  setSocketIo(io);

  return io;
};

module.exports = { initSocket };
