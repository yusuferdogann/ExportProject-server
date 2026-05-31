const { Server } = require("socket.io");
const socketAuthMiddleware = require("./auth.socket");
const chatSocket = require("./chat.socket");

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      credentials: true
    }
  });

  io.use(socketAuthMiddleware); // auth
  chatSocket(io); // chat events

  return io;
}

module.exports = { initSocket, io };
